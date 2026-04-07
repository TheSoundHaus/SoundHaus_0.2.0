import { execFileSync } from 'child_process';
import { resolveGitBinary } from 'dugite';

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
