import { exec } from 'dugite';
import { rebase } from './git-rebase';

async function pull(repoPath: string) {
  console.log(`[Project] Pull requested for: ${repoPath}`);
  const result = await rebase(repoPath);
  if (!result.success) {
    console.error(`[Project] Pull failed: ${result.error}`);
    throw new Error(result.error);
  }
  console.log(`[Project] Pull completed successfully`);
  return 'Changes downloaded successfully';
}

async function commit(repoPath: string, message?: string) {
  const msg = message || 'Update project';

  const addResult = await exec(['add', '.'], repoPath);
  if (addResult.exitCode !== 0) {
    throw new Error(addResult.stderr || 'git add failed');
  }

  const commitResult = await exec(['commit', '-m', msg], repoPath);
  if (commitResult.exitCode !== 0) {
    // "nothing to commit" is a normal condition, not an error
    const combined = `${commitResult.stdout}\n${commitResult.stderr}`.toLowerCase();
    if (combined.includes('nothing to commit')) {
      console.log('[commit] Nothing to commit — working tree clean');
      return 'nothing to commit';
    }
    throw new Error(commitResult.stderr || 'git commit failed');
  }

  return commitResult.stdout;
}

async function push(repoPath: string) {
  // Ensure there is at least one commit before pushing (new empty repo)
  const headCheck = await exec(['rev-parse', '--verify', 'HEAD'], repoPath);
  if (headCheck.exitCode !== 0) {
    await exec(['add', '.'], repoPath);
    await exec(['commit', '--allow-empty', '-m', 'Initial snapshot'], repoPath);
  }
  const result = await exec(['push', '-u', 'origin', 'HEAD'], repoPath);
  if (result.exitCode !== 0) {
    throw new Error(result.stderr || 'git push failed');
  }
  return result.stdout;
}

export { pull, commit, push };
