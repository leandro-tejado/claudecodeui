import { randomUUID } from 'node:crypto';
import path from 'node:path';

import { getConnection } from '@/modules/database/connection.js';
import type { ArchivedBy, CreateProjectPathResult, ProjectRepositoryRow } from '@/shared/types.js';
import { normalizeProjectPath } from '@/shared/utils.js';

function normalizeProjectDisplayName(projectPath: string, customProjectName: string | null): string {
    const trimmedCustomName = typeof customProjectName === 'string' ? customProjectName.trim() : '';
    if (trimmedCustomName.length > 0) {
        return trimmedCustomName;
    }

    const directoryName = path.basename(projectPath);
    return directoryName || projectPath;
}

export const projectsDb = {
    createProjectPath(projectPath: string, customProjectName: string | null = null): CreateProjectPathResult {
        const db = getConnection();
        const normalizedProjectPath = normalizeProjectPath(projectPath);
        const normalizedProjectName = normalizeProjectDisplayName(normalizedProjectPath, customProjectName);
        const attemptedId = randomUUID();
        const row = db.prepare(`
        INSERT INTO projects (project_id, project_path, custom_project_name, isArchived)
            VALUES (?, ?, ?, 0)
            ON CONFLICT(project_path) DO UPDATE SET
            isArchived = 0,
            archived_at = NULL,
            archived_by = NULL
            WHERE projects.isArchived = 1
            RETURNING project_id, project_path, custom_project_name, isStarred, isArchived, archived_at, archived_by
        `).get(attemptedId, normalizedProjectPath, normalizedProjectName) as ProjectRepositoryRow | undefined;

        if (row) {
            return {
                outcome: row.project_id === attemptedId ? 'created' : 'reactivated_archived',
                project: row,
            };
        }

        const existingProject = projectsDb.getProjectPath(normalizedProjectPath);
        return {
            outcome: 'active_conflict',
            project: existingProject,
        };
    },

    /**
     * Guarantees a project row exists for the path (the sessions table's FK
     * needs one) without ever touching `isArchived`.
     *
     * Session synchronizers call this on every disk scan, including scans
     * that merely re-confirm a transcript that was already indexed. Using
     * `createProjectPath` there resurrected any project the user had just
     * archived, because its `ON CONFLICT` unconditionally flips
     * `isArchived` back to 0. Only an explicit user action (starting a new
     * session, creating a project, restoring one) should do that.
     */
    ensureProjectPathExists(projectPath: string, customProjectName: string | null = null): void {
        const db = getConnection();
        const normalizedProjectPath = normalizeProjectPath(projectPath);
        const normalizedProjectName = normalizeProjectDisplayName(normalizedProjectPath, customProjectName);
        db.prepare(`
            INSERT INTO projects (project_id, project_path, custom_project_name, isArchived)
            VALUES (?, ?, ?, 0)
            ON CONFLICT(project_path) DO NOTHING
        `).run(randomUUID(), normalizedProjectPath, normalizedProjectName);
    },

    getProjectPath(projectPath: string): ProjectRepositoryRow | null {
        const db = getConnection();
        const normalizedProjectPath = normalizeProjectPath(projectPath);
        const row = db.prepare(`
            SELECT project_id, project_path, custom_project_name, isStarred, isArchived, archived_at, archived_by
            FROM projects
            WHERE project_path = ?
        `).get(normalizedProjectPath) as ProjectRepositoryRow | undefined;

        return row ?? null;
    },

    getProjectById(projectId: string): ProjectRepositoryRow | null {
        const db = getConnection();
        const row = db.prepare(`
            SELECT project_id, project_path, custom_project_name, isStarred, isArchived, archived_at, archived_by
            FROM projects
            WHERE project_id = ?
        `).get(projectId) as ProjectRepositoryRow | undefined;

        return row ?? null;
    },

    /**
     * Resolve the absolute project directory from a database project_id.
     *
     * This is the canonical lookup used after the projectName → projectId migration:
     * API routes receive the DB-assigned `projectId` and must resolve the real folder
     * path through this helper before touching the filesystem. Returns `null` when the
     * project row does not exist so callers can respond with a 404.
     */
    getProjectPathById(projectId: string): string | null {
        const db = getConnection();
        const row = db.prepare(`
            SELECT project_path
            FROM projects
            WHERE project_id = ?
        `).get(projectId) as Pick<ProjectRepositoryRow, 'project_path'> | undefined;

        return row?.project_path ?? null;
    },

    getProjectPaths(): ProjectRepositoryRow[] {
        const db = getConnection();
        return db.prepare(`
            SELECT project_id, project_path, custom_project_name, isStarred, isArchived, archived_at, archived_by
            FROM projects
            WHERE isArchived = 0
        `).all() as ProjectRepositoryRow[];
    },

    /**
     * Archived rows are queried separately so archive-focused UIs can present
     * hidden workspaces without reintroducing them into the active sidebar list.
     */
    getArchivedProjectPaths(): ProjectRepositoryRow[] {
        const db = getConnection();
        return db.prepare(`
            SELECT project_id, project_path, custom_project_name, isStarred, isArchived, archived_at, archived_by
            FROM projects
            WHERE isArchived = 1
        `).all() as ProjectRepositoryRow[];
    },

    getCustomProjectName(projectPath: string): string | null {
        const db = getConnection();
        const normalizedProjectPath = normalizeProjectPath(projectPath);
        const row = db.prepare(`
            SELECT custom_project_name
            FROM projects
            WHERE project_path = ?
        `).get(normalizedProjectPath) as Pick<ProjectRepositoryRow, 'custom_project_name'> | undefined;

        return row?.custom_project_name ?? null;
    },

    updateCustomProjectName(projectPath: string, customProjectName: string | null): void {
        const db = getConnection();
        const normalizedProjectPath = normalizeProjectPath(projectPath);
        db.prepare(`
            INSERT INTO projects (project_id, project_path, custom_project_name)
            VALUES (?, ?, ?)
            ON CONFLICT(project_path) DO UPDATE SET custom_project_name = excluded.custom_project_name
        `).run(randomUUID(), normalizedProjectPath, customProjectName);
    },

    updateCustomProjectNameById(projectId: string, customProjectName: string | null): void {
        const db = getConnection();
        db.prepare(`
            UPDATE projects
            SET custom_project_name = ?
            WHERE project_id = ?
        `).run(customProjectName, projectId);
    },

    updateProjectIsStarred(projectPath: string, isStarred: boolean): void {
        const db = getConnection();
        const normalizedProjectPath = normalizeProjectPath(projectPath);
        db.prepare(`
            UPDATE projects
            SET isStarred = ?
            WHERE project_path = ?
        `).run(isStarred ? 1 : 0, normalizedProjectPath);
    },

    updateProjectIsStarredById(projectId: string, isStarred: boolean): void {
        const db = getConnection();
        db.prepare(`
            UPDATE projects
            SET isStarred = ?
            WHERE project_id = ?
        `).run(isStarred ? 1 : 0, projectId);
    },

    /**
     * Archivar escribe `archived_at` y `archived_by = por`; restaurar los
     * limpia. `por` es obligatorio a propósito: la limpieza automática se
     * apoya en saber quién archivó, y un default lo taparía en un caller nuevo.
     */
    updateProjectIsArchived(projectPath: string, isArchived: boolean, por: ArchivedBy): void {
        const db = getConnection();
        const normalizedProjectPath = normalizeProjectPath(projectPath);
        db.prepare(`
            UPDATE projects
            SET isArchived = ?,
                archived_at = CASE WHEN ? = 1 THEN CURRENT_TIMESTAMP ELSE NULL END,
                archived_by = CASE WHEN ? = 1 THEN ? ELSE NULL END
            WHERE project_path = ?
        `).run(isArchived ? 1 : 0, isArchived ? 1 : 0, isArchived ? 1 : 0, por, normalizedProjectPath);
    },

    updateProjectIsArchivedById(projectId: string, isArchived: boolean, por: ArchivedBy): void {
        const db = getConnection();
        db.prepare(`
            UPDATE projects
            SET isArchived = ?,
                archived_at = CASE WHEN ? = 1 THEN CURRENT_TIMESTAMP ELSE NULL END,
                archived_by = CASE WHEN ? = 1 THEN ? ELSE NULL END
            WHERE project_id = ?
        `).run(isArchived ? 1 : 0, isArchived ? 1 : 0, isArchived ? 1 : 0, por, projectId);
    },

    /**
     * Desarchiva el proyecto si está archivado y `actividadEn` es posterior a
     * su `archived_at`. Devuelve `true` solo si lo desarchivó.
     *
     * Un proyecto archivado sin `archived_at` (anterior a la columna) no se
     * toca: sin fecha no hay forma de saber si la actividad es posterior.
     * `julianday` en vez de comparar strings porque `archived_at` es el
     * formato de SQLite (`YYYY-MM-DD HH:MM:SS`) y `actividadEn` es ISO.
     */
    reactivarSiHayActividadPosterior(projectPath: string, actividadEn: string): boolean {
        const db = getConnection();
        const normalizedProjectPath = normalizeProjectPath(projectPath);
        return db.prepare(`
            UPDATE projects
            SET isArchived = 0,
                archived_at = NULL,
                archived_by = NULL
            WHERE project_path = ?
              AND isArchived = 1
              AND archived_at IS NOT NULL
              AND julianday(?) > julianday(archived_at)
        `).run(normalizedProjectPath, actividadEn).changes > 0;
    },

    deleteProjectPath(projectPath: string): void {
        const db = getConnection();
        const normalizedProjectPath = normalizeProjectPath(projectPath);
        db.prepare(`
            DELETE FROM projects
            WHERE project_path = ?
        `).run(normalizedProjectPath);
    },

    deleteProjectById(projectId: string): void {
        const db = getConnection();
        db.prepare(`
            DELETE FROM projects
            WHERE project_id = ?
        `).run(projectId);
    },
};
