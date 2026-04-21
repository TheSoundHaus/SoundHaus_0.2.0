import { execFile as execFileCb, execFileSync } from 'child_process';
import { promisify } from 'util';
import { resolveGitBinary } from 'dugite';

const execFileAsync = promisify(execFileCb);

function validateBinary(binPath: string): boolean {
  try {
    execFileSync(binPath, ['--version'], { timeout: 3000, stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

function resolveGitBin(): string {
  const envGit = process.env.SOUNDHAUS_GIT_BIN;

  if (envGit) {
    if (validateBinary(envGit)) {
      console.log('[git-bin] Using SOUNDHAUS_GIT_BIN:', envGit);
      return envGit;
    }
    console.warn('[git-bin] SOUNDHAUS_GIT_BIN set but binary failed validation:', envGit);
  }

  try {
    const dugitePath = resolveGitBinary();
    if (validateBinary(dugitePath)) {
      console.log('[git-bin] Using dugite git:', dugitePath);
      return dugitePath;
    }
    console.warn('[git-bin] Dugite binary found but failed validation:', dugitePath);
  } catch (e) {
    console.warn('[git-bin] Dugite resolveGitBinary() failed:', e);
  }

  console.log('[git-bin] Falling back to system git in PATH');
  return 'git';
}

export const gitBin = resolveGitBin();

/** `git show <object>` as raw bytes (for binary `.als` blobs). */
export async function gitShowBinary(repoPath: string, objectSpec: string): Promise<Buffer> {
  const { stdout } = await execFileAsync(gitBin, ['-C', repoPath, 'show', objectSpec], {
    encoding: 'buffer',
    maxBuffer: 80 * 1024 * 1024,
  });
  if (!Buffer.isBuffer(stdout)) {
    throw new Error('git show did not return binary output');
  }
  return stdout;
}
