-- V006_classroom_lti.sql
-- Classrooms, assignments, submissions + LTI 1.3 tenant + user mapping.

-- ── LTI tenants ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS lti_deployments (
    id                VARCHAR(36)  PRIMARY KEY,
    issuer            VARCHAR(512) NOT NULL,
    client_id         VARCHAR(255) NOT NULL,
    deployment_id     VARCHAR(255) NOT NULL,
    public_jwks_url   TEXT         NOT NULL,
    auth_login_url    TEXT         NOT NULL,
    auth_token_url    TEXT         NOT NULL,
    tool_redirect_url TEXT,
    created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_lti_deployment UNIQUE (issuer, client_id, deployment_id)
);

CREATE INDEX IF NOT EXISTS ix_lti_deployment_issuer_client ON lti_deployments (issuer, client_id);

-- ── Classrooms + members ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS classrooms (
    id                 VARCHAR(36)  PRIMARY KEY,
    name               VARCHAR(200) NOT NULL,
    description        TEXT,
    instructor_id      VARCHAR(255) NOT NULL,
    lti_deployment_id  VARCHAR(36)  REFERENCES lti_deployments(id) ON DELETE SET NULL,
    canvas_context_id  VARCHAR(255),
    join_code          VARCHAR(16)  UNIQUE,
    created_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_classrooms_instructor        ON classrooms (instructor_id);
CREATE INDEX IF NOT EXISTS ix_classrooms_canvas_context_id ON classrooms (canvas_context_id);

CREATE TABLE IF NOT EXISTS classroom_members (
    id                     VARCHAR(36)  PRIMARY KEY,
    classroom_id           VARCHAR(36)  NOT NULL REFERENCES classrooms(id) ON DELETE CASCADE,
    user_id                VARCHAR(255) NOT NULL,
    role                   VARCHAR(16)  NOT NULL DEFAULT 'student',
    lti_platform_user_id   VARCHAR(255),
    joined_at              TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_classroom_member UNIQUE (classroom_id, user_id)
);

CREATE INDEX IF NOT EXISTS ix_classroom_members_classroom ON classroom_members (classroom_id);
CREATE INDEX IF NOT EXISTS ix_classroom_members_user      ON classroom_members (user_id);

-- ── Assignments + submissions ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS assignments (
    id                        VARCHAR(36)  PRIMARY KEY,
    classroom_id              VARCHAR(36)  NOT NULL REFERENCES classrooms(id) ON DELETE CASCADE,
    title                     VARCHAR(200) NOT NULL,
    description_md            TEXT,
    template_repo_id          VARCHAR(255),
    deadline_at               TIMESTAMPTZ,
    max_score                 DOUBLE PRECISION NOT NULL DEFAULT 100.0,
    canvas_resource_link_id   VARCHAR(255),
    canvas_line_item_url      TEXT,
    created_at                TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at                TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_assignments_classroom           ON assignments (classroom_id);
CREATE INDEX IF NOT EXISTS ix_assignments_canvas_resource_link ON assignments (canvas_resource_link_id);

CREATE TABLE IF NOT EXISTS submissions (
    id                    VARCHAR(36)  PRIMARY KEY,
    assignment_id         VARCHAR(36)  NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
    student_id            VARCHAR(255) NOT NULL,
    submission_repo_id    VARCHAR(255),
    submission_sha        VARCHAR(40),
    submitted_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    graded_at             TIMESTAMPTZ,
    score                 DOUBLE PRECISION,
    feedback_md           TEXT,
    is_late               BOOLEAN      NOT NULL DEFAULT FALSE,
    CONSTRAINT uq_submission_per_student UNIQUE (assignment_id, student_id)
);

CREATE INDEX IF NOT EXISTS ix_submissions_assignment ON submissions (assignment_id);
CREATE INDEX IF NOT EXISTS ix_submissions_student    ON submissions (student_id);

-- ── LTI ⇄ Soundhaus user mapping ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS lti_users (
    id                  SERIAL      PRIMARY KEY,
    platform_user_id    VARCHAR(255) NOT NULL,
    deployment_id       VARCHAR(36)  NOT NULL REFERENCES lti_deployments(id) ON DELETE CASCADE,
    soundhaus_user_id   VARCHAR(255) NOT NULL,
    email               VARCHAR(255),
    display_name        VARCHAR(255),
    created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_lti_user UNIQUE (deployment_id, platform_user_id)
);

CREATE INDEX IF NOT EXISTS ix_lti_users_deployment ON lti_users (deployment_id);
CREATE INDEX IF NOT EXISTS ix_lti_users_soundhaus  ON lti_users (soundhaus_user_id);

-- ── plan.md §10: late-submission support on commits ───────────────────────

ALTER TABLE commit_details
    ADD COLUMN IF NOT EXISTS post_deadline BOOLEAN NOT NULL DEFAULT FALSE;
