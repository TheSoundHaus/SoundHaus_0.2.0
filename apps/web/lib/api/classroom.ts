"use server";

import type { ApiResponse } from "../types/api";
import { authFetch } from "./client";

export interface Classroom {
    id: string;
    name: string;
    description: string | null;
    instructor_id: string;
    join_code: string | null;
    canvas_context_id: string | null;
    created_at: string | null;
}

export interface Assignment {
    id: string;
    classroom_id: string;
    title: string;
    description_md: string | null;
    template_repo_id: string | null;
    deadline_at: string | null;
    max_score: number;
    canvas_resource_link_id: string | null;
}

export async function listMyClassrooms(): Promise<ApiResponse<{ success: boolean; classrooms: Classroom[] }>> {
    return authFetch("/classrooms");
}

export async function createClassroom(body: { name: string; description?: string }): Promise<
    ApiResponse<{ success: boolean; classroom: Classroom }>
> {
    return authFetch("/classrooms", { method: "POST", body: JSON.stringify(body) });
}

export async function joinClassroom(joinCode: string): Promise<
    ApiResponse<{ success: boolean; classroom: Classroom }>
> {
    return authFetch("/classrooms/join", {
        method: "POST",
        body: JSON.stringify({ join_code: joinCode }),
    });
}

export async function listAssignments(
    classroomId: string,
): Promise<ApiResponse<{ success: boolean; assignments: Assignment[] }>> {
    return authFetch(`/classrooms/${classroomId}/assignments`);
}

export async function createAssignment(
    classroomId: string,
    body: {
        title: string;
        description_md?: string;
        template_repo_id?: string;
        deadline_at?: string;
        max_score?: number;
    },
): Promise<ApiResponse<{ success: boolean; assignment: Assignment }>> {
    return authFetch(`/classrooms/${classroomId}/assignments`, {
        method: "POST",
        body: JSON.stringify(body),
    });
}
