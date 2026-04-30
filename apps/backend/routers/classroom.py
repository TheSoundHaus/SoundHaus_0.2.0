"""
Classroom HTTP surface (Phase 8).

    POST /classrooms                         — instructor creates a classroom
    GET  /classrooms                         — list classrooms caller belongs to
    GET  /classrooms/{cid}                   — classroom detail
    POST /classrooms/join                    — join by code
    POST /classrooms/{cid}/assignments       — instructor creates assignment
    GET  /classrooms/{cid}/assignments       — list classroom assignments
    POST /assignments/{aid}/submit           — student posts submission
    POST /submissions/{sid}/grade            — instructor grades; triggers AGS passback
"""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from database import get_db
from dependencies import get_auth, user_limiter, verify_token
from fastapi import APIRouter, Depends, HTTPException, Request
from logging_config import get_logger
from services.classroom_service import classroom_service
from services.lti_service import lti_service

logger = get_logger(__name__)

router = APIRouter(prefix="/classrooms", tags=["classroom"])
# Side-router for /assignments + /submissions shortcuts
extras_router = APIRouter(tags=["classroom"])


# ── Pydantic ────────────────────────────────────────────────────────────────


class CreateClassroomRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    description: str | None = None


class JoinClassroomRequest(BaseModel):
    join_code: str = Field(..., min_length=1, max_length=16)


class CreateAssignmentRequest(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    description_md: str | None = None
    template_repo_id: str | None = None
    deadline_at: datetime | None = None
    max_score: float = 100.0


class SubmitRequest(BaseModel):
    submission_repo_id: str | None = None
    submission_sha: str | None = Field(default=None, min_length=40, max_length=40)


class GradeRequest(BaseModel):
    score: float = Field(..., ge=0)
    feedback_md: str | None = None


async def _require_user(token: str) -> str:
    user_res = await get_auth().get_user(token)
    if not user_res.get("success"):
        raise HTTPException(status_code=401, detail="Invalid session")
    return str(user_res["user"]["id"])


def _serialize_classroom(c):
    return {
        "id": c.id,
        "name": c.name,
        "description": c.description,
        "instructor_id": c.instructor_id,
        "join_code": c.join_code,
        "canvas_context_id": c.canvas_context_id,
        "created_at": c.created_at.isoformat() if c.created_at else None,
    }


def _serialize_assignment(a):
    return {
        "id": a.id,
        "classroom_id": a.classroom_id,
        "title": a.title,
        "description_md": a.description_md,
        "template_repo_id": a.template_repo_id,
        "deadline_at": a.deadline_at.isoformat() if a.deadline_at else None,
        "max_score": a.max_score,
        "canvas_resource_link_id": a.canvas_resource_link_id,
    }


# ── Classrooms ──────────────────────────────────────────────────────────────


@router.post("")
@user_limiter.limit("20/minute")
async def create_classroom(
    request: Request,
    body: CreateClassroomRequest,
    token: str = Depends(verify_token),
    db: Session = Depends(get_db),
):
    user_id = await _require_user(token)
    classroom = classroom_service.create_classroom(
        db, user_id, name=body.name, description=body.description
    )
    return {"success": True, "classroom": _serialize_classroom(classroom)}


@router.get("")
@user_limiter.limit("60/minute")
async def list_my_classrooms(
    request: Request,
    token: str = Depends(verify_token),
    db: Session = Depends(get_db),
):
    user_id = await _require_user(token)
    rows = classroom_service.list_classrooms_for_user(db, user_id)
    return {"success": True, "classrooms": [_serialize_classroom(c) for c in rows]}


@router.get("/{classroom_id}")
@user_limiter.limit("60/minute")
async def get_classroom(
    request: Request,
    classroom_id: str,
    token: str = Depends(verify_token),
    db: Session = Depends(get_db),
):
    user_id = await _require_user(token)
    try:
        classroom_service.require_membership(db, classroom_id, user_id)
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    c = classroom_service.get_classroom(db, classroom_id)
    if c is None:
        raise HTTPException(status_code=404, detail="Not found")
    return {"success": True, "classroom": _serialize_classroom(c)}


@router.post("/join")
@user_limiter.limit("20/minute")
async def join_classroom(
    request: Request,
    body: JoinClassroomRequest,
    token: str = Depends(verify_token),
    db: Session = Depends(get_db),
):
    user_id = await _require_user(token)
    try:
        classroom = classroom_service.join_classroom_by_code(db, user_id, body.join_code)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return {"success": True, "classroom": _serialize_classroom(classroom)}


# ── Assignments ─────────────────────────────────────────────────────────────


@router.post("/{classroom_id}/assignments")
@user_limiter.limit("30/minute")
async def create_assignment(
    request: Request,
    classroom_id: str,
    body: CreateAssignmentRequest,
    token: str = Depends(verify_token),
    db: Session = Depends(get_db),
):
    user_id = await _require_user(token)
    try:
        classroom_service.require_membership(
            db, classroom_id, user_id, allowed_roles=("instructor", "ta")
        )
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    a = classroom_service.create_assignment(
        db,
        classroom_id,
        title=body.title,
        description_md=body.description_md,
        template_repo_id=body.template_repo_id,
        deadline_at=body.deadline_at,
        max_score=body.max_score,
    )
    return {"success": True, "assignment": _serialize_assignment(a)}


@router.get("/{classroom_id}/assignments")
@user_limiter.limit("60/minute")
async def list_assignments(
    request: Request,
    classroom_id: str,
    token: str = Depends(verify_token),
    db: Session = Depends(get_db),
):
    user_id = await _require_user(token)
    try:
        classroom_service.require_membership(db, classroom_id, user_id)
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    rows = classroom_service.list_assignments(db, classroom_id)
    return {"success": True, "assignments": [_serialize_assignment(a) for a in rows]}


# ── Submit + grade ──────────────────────────────────────────────────────────


@extras_router.post("/assignments/{assignment_id}/submit")
@user_limiter.limit("20/minute")
async def submit_assignment(
    request: Request,
    assignment_id: str,
    body: SubmitRequest,
    token: str = Depends(verify_token),
    db: Session = Depends(get_db),
):
    user_id = await _require_user(token)
    try:
        sub = classroom_service.submit(
            db,
            assignment_id,
            user_id,
            submission_repo_id=body.submission_repo_id,
            submission_sha=body.submission_sha,
        )
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return {
        "success": True,
        "submission": {
            "id": sub.id,
            "assignment_id": sub.assignment_id,
            "submission_repo_id": sub.submission_repo_id,
            "submission_sha": sub.submission_sha,
            "submitted_at": sub.submitted_at.isoformat() if sub.submitted_at else None,
            "is_late": sub.is_late,
        },
    }


@extras_router.post("/submissions/{submission_id}/grade")
@user_limiter.limit("60/minute")
async def grade_submission(
    request: Request,
    submission_id: str,
    body: GradeRequest,
    token: str = Depends(verify_token),
    db: Session = Depends(get_db),
):
    user_id = await _require_user(token)
    # Load submission + assignment + classroom to verify instructor permission
    from models.classroom_models import Assignment, Submission

    sub = db.query(Submission).filter(Submission.id == submission_id).first()
    if sub is None:
        raise HTTPException(status_code=404, detail="Submission not found")
    assignment = db.query(Assignment).filter(Assignment.id == sub.assignment_id).first()
    if assignment is None:
        raise HTTPException(status_code=404, detail="Assignment not found")

    try:
        classroom_service.require_membership(
            db, assignment.classroom_id, user_id, allowed_roles=("instructor", "ta")
        )
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc

    graded = classroom_service.grade(
        db, submission_id, score=body.score, feedback_md=body.feedback_md
    )

    ags_posted = False
    if assignment.canvas_line_item_url:
        try:
            # Caller must have configured AGS access_token exchange; guarded so
            # a mis-config doesn't block grading.
            from models.classroom_models import ClassroomMember
            from services.classroom_service import build_ags_score_payload

            member = (
                db.query(ClassroomMember)
                .filter(
                    ClassroomMember.classroom_id == assignment.classroom_id,
                    ClassroomMember.user_id == sub.student_id,
                )
                .first()
            )
            if member and member.lti_platform_user_id:
                payload = build_ags_score_payload(
                    student_platform_user_id=member.lti_platform_user_id,
                    score=body.score,
                    max_score=assignment.max_score,
                )
                # `access_token` acquisition intentionally omitted — pylti1p3
                # issues + caches one using client_credentials grant. We pass
                # an empty string here so tests can monkey-patch lti_service.
                lti_service.post_score(
                    line_item_url=assignment.canvas_line_item_url,
                    access_token="",
                    payload=payload,
                )
                ags_posted = True
        except Exception as exc:
            logger.warning("ags_score_post_failed", error=str(exc))

    return {
        "success": True,
        "submission": {
            "id": graded.id,
            "score": graded.score,
            "feedback_md": graded.feedback_md,
            "graded_at": graded.graded_at.isoformat() if graded.graded_at else None,
        },
        "ags_posted": ags_posted,
    }
