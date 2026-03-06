const gitService = {
    async initRepo(folderPath: string, projectInfo?: any): Promise<string> {
        if(!window.gitService) {
            console.warn('gitService not avaliable')
            return Promise.resolve('')
        }
        return window.gitService.initRepo(folderPath, projectInfo)
    },
    
    async pullRepo(repoPath: string): Promise<string> {
        if(!window.gitService) {
            console.warn('gitService not avaliable')
            return Promise.resolve('')
        }
        return window.gitService.pullRepo(repoPath)
    },

    async commitChange(repoPath: string): Promise<string> {
        if(!window.gitService) {
            console.warn('gitService not avaliable')
            return Promise.resolve('')
        }
        return window.gitService.commitChange(repoPath)
    },

    async pushRepo(repoPath: string): Promise<string> {
        if(!window.gitService) {
            console.warn('gitService not avaliable')
            return Promise.resolve('')
        }
        return window.gitService.pushRepo(repoPath)
    },

    /**
     * Push the repo AND post ALS diff data to FastAPI after the push completes.
     *
     * This is the function to call from the "Push" button handler instead of pushRepo().
     * It chains four steps:
     *   1. git push (via window.gitService.pushRepo)
     *   2. Generate diff — invoke 'diff-xml' IPC (Rust NAPI, System A)
     *   3. Generate structural compare — invoke 'find-instrument-changes' IPC (TS, System B)
     *   4. POST combined diff payload to FastAPI POST /repos/{owner}/{repo}/diff
     *
     * DESIGN DECISION — what to do if the push succeeds but diff fails:
     *   OPTION 1 (current stub default): Log the error and silently continue.
     *     The push already happened, so failing the diff is non-critical.
     *     The web UI just won't have ALS diff data for this commit.
     *   OPTION 2: Show a non-blocking toast warning: "Push succeeded, but diff
     *     upload failed. Diffs may be temporarily unavailable."
     *   RECOMMENDATION: Option 2 for better observability.
     *
     * DESIGN DECISION — what to pass as beforeAlsPath:
     *   After `git push`, the current working tree is the AFTER state.
     *   The BEFORE state (.als file as it was before this commit) requires:
     *     a) Running `git show HEAD~1:path/to/file.als` to get the previous version
     *     b) Writing it to a temp path
     *     c) Passing that temp path to diff-xml
     *   OR: Store the previous .als path before committing (hook into commitChange).
     *   RECOMMENDATION: Use git show HEAD~1 approach. Add a helper:
     *     window.gitService.getFileAtRevision(repoPath, relFilePath, 'HEAD~1')
     *     (This IPC handler needs to be added to project.ts / electron main)
     *
     * @param repoPath     - Absolute path to local git repo
     * @param owner        - Supabase UUID of repo owner
     * @param repoSlug     - Gitea repo slug (for API URL)
     * @param alsFilePath  - Relative path to .als file within the repo
     * @param backendToken - Desktop Backend PAT (soundh_xxx) for FastAPI auth
     * @param commitSha    - The HEAD SHA after push (get from git log -1 --format=%H)
     * @param beforeSha    - The SHA before push (get from push output or git log -1 HEAD~1)
     */
    async pushAndDiff(
        repoPath: string,
        owner: string,
        repoSlug: string,
        alsFilePath: string,
        backendToken: string,
        commitSha: string,
        beforeSha: string,
    ): Promise<{ pushResult: string; diffPosted: boolean }> {
        // ── Step 1: Push ────────────────────────────────────────────────────
        let pushResult = '';
        try {
            if (!window.gitService) throw new Error('gitService not available');
            pushResult = await window.gitService.pushRepo(repoPath);
        } catch (err) {
            console.error('[pushAndDiff] push failed', err);
            throw err; // Push failure is critical — rethrow
        }

        // ── Step 2 & 3: Generate diffs ─────────────────────────────────────
        // TODO: Implement IPC calls to diff systems.
        // You need:
        //   a) currentAlsPath = `${repoPath}/${alsFilePath}` (absolute, post-push state)
        //   b) beforeAlsPath  = result of `git show HEAD~1:<alsFilePath>` written to tmp file
        //      (add a new IPC channel 'get-file-at-revision' in project.ts to do this)
        //
        // System A (Rust NAPI — xml structural diff):
        //   const xmlDiff = await window.electronAPI.invoke('diff-xml', {
        //       current: currentAlsPath,
        //       previous: beforeAlsPath,
        //   });
        //   // Returns: { summary: string, project: { Tracks: [...] } }
        //
        // System B (TypeScript — instrument changes):
        //   const structuralResult = await window.electronAPI.invoke('find-instrument-changes', {
        //       current: currentAlsPath,
        //       previous: beforeAlsPath,
        //   });
        //   // Returns: { ok: true, changes: AlsChange[] } | { ok: false, reason: string }

        let diffPosted = false;
        try {
            // TODO: Replace placeholder below with real diff results from Step 2 & 3
            const xmlDiff: unknown = null;       // TODO: result of diff-xml IPC
            const structuralResult: unknown = null; // TODO: result of find-instrument-changes IPC

            if (!xmlDiff && !structuralResult) {
                console.warn('[pushAndDiff] no .als diff generated (no IPC results), skipping upload');
                return { pushResult, diffPosted: false };
            }

            // ── Step 4: POST combined diff to FastAPI ────────────────────────
            // API URL: POST /repos/{owner}/{repoSlug}/diff
            // Auth: Authorization: token <backendToken>
            const apiBase = import.meta.env.VITE_API_URL ?? 'http://localhost:8000';
            const res = await fetch(`${apiBase}/repos/${owner}/${repoSlug}/diff`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `token ${backendToken}`,
                },
                body: JSON.stringify({
                    commit_sha:    commitSha,
                    before_sha:    beforeSha,
                    diff_type:     'combined',
                    diff_summary:  '', // TODO: generate from xmlDiff.summary
                    diff_data:     { xml: xmlDiff, structural: structuralResult },
                    desktop_version: '0.2.0', // TODO: read from package.json at build time
                }),
            });

            if (!res.ok) {
                // DESIGN DECISION: non-critical failure — log and continue
                console.warn('[pushAndDiff] diff upload failed', res.status, await res.text());
            } else {
                diffPosted = true;
                console.info('[pushAndDiff] diff uploaded successfully');
            }
        } catch (diffErr) {
            // Non-critical — push already succeeded
            console.warn('[pushAndDiff] diff pipeline error (push still succeeded)', diffErr);
        }

        return { pushResult, diffPosted };
    },
}

export default gitService