import { exec } from 'dugite';
import * as fs from 'fs';
import * as path from 'path';
import {
    checkMissingSampleRefs,
    findRootAlsFile,
    type LibrarySampleAdvisory,
    type MissingSampleIssue,
} from './sampleRefs';

export type SyncReadinessState =
    | 'no_upstream'
    | 'unknown'
    | 'up_to_date'
    | 'ahead'
    | 'behind'
    | 'diverged';

export type ProjectReadiness = {
    sync: {
        state: SyncReadinessState;
        ahead?: number;
        behind?: number;
    };
    samples: {
        state: 'ok' | 'action_needed';
        issueCount: number;
        issues: MissingSampleIssue[];
        libraryAdvisoryCount: number;
        libraryAdvisories: LibrarySampleAdvisory[];
    };
    alsMergeConflictPendingPath: string | null;
    mergeCompletePending: boolean;
};

function readAlsMergeFlags(repoPath: string): {
    alsMergeConflictPendingPath: string | null;
    mergeCompletePending: boolean;
} {
    const shDir = path.join(repoPath, '.soundhaus');
    const alsPending = path.join(shDir, 'als-merge-pending.json');
    const mergePending = path.join(shDir, 'merge-pending.json');
    return {
        alsMergeConflictPendingPath: fs.existsSync(alsPending) ? alsPending : null,
        mergeCompletePending: fs.existsSync(mergePending),
    };
}

async function getSyncBranchStatus(repoPath: string): Promise<ProjectReadiness['sync']> {
    const up = await exec(['rev-parse', '--abbrev-ref', '@{u}'], repoPath);
    if (up.exitCode !== 0) {
        return { state: 'no_upstream' };
    }
    const lr = await exec(['rev-list', '--left-right', '--count', 'HEAD...@{u}'], repoPath);
    if (lr.exitCode !== 0) {
        return { state: 'unknown' };
    }
    const parts = lr.stdout.trim().split(/\s+/);
    const ahead = parseInt(parts[0] || '0', 10) || 0;
    const behind = parseInt(parts[1] || '0', 10) || 0;
    if (ahead > 0 && behind > 0) {
        return { state: 'diverged', ahead, behind };
    }
    if (behind > 0) {
        return { state: 'behind', ahead, behind };
    }
    if (ahead > 0) {
        return { state: 'ahead', ahead, behind };
    }
    return { state: 'up_to_date', ahead: 0, behind: 0 };
}

export async function getProjectReadiness(repoPath: string): Promise<ProjectReadiness> {
    const sync = await getSyncBranchStatus(repoPath);
    const mergeFlags = readAlsMergeFlags(repoPath);
    const als = await findRootAlsFile(repoPath);
    if (!als) {
        return {
            sync,
            samples: {
                state: 'ok',
                issueCount: 0,
                issues: [],
                libraryAdvisoryCount: 0,
                libraryAdvisories: [],
            },
            ...mergeFlags,
        };
    }
    const { hasIssues, issues, libraryAdvisories } = await checkMissingSampleRefs(repoPath, als);
    return {
        sync,
        samples: {
            state: hasIssues ? 'action_needed' : 'ok',
            issueCount: issues.length,
            issues,
            libraryAdvisoryCount: libraryAdvisories.length,
            libraryAdvisories,
        },
        ...mergeFlags,
    };
}
