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
    throw new Error(commitResult.stderr || 'git commit failed');
  }

  return commitResult.stdout;
}

async function push(repoPath: string) {
  const result = await exec(['push', 'origin', 'HEAD'], repoPath);
  if (result.exitCode !== 0) {
    throw new Error(result.stderr || 'git push failed');
  }
  return result.stdout;
}

export { pull, commit, push };
