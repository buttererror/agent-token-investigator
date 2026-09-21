/**
 * Path and Workspace Normalization Utilities
 * Supports Windows drive letters, WSL UNC paths (\\wsl$\ and \\wsl.localhost\),
 * POSIX /home/ paths, and case/slash differences.
 */

/**
 * Normalizes Windows, WSL UNC, mapped drive, or POSIX paths into a unified canonical form.
 * 
 * @param {string} rawPath - Raw file or directory path
 * @param {string} wslDrive - Mapped Windows drive letter for WSL distro (default: 'z')
 * @returns {string} Canonical forward-slashed, lowercased path
 */
export function normalizeWorkspacePath(rawPath, wslDrive = 'z') {
  if (!rawPath || typeof rawPath !== 'string') return '';
  let p = rawPath.trim().replace(/\\/g, '/');

  // 1. Handle WSL UNC prefixes: //wsl$/Distro/... or //wsl.localhost/Distro/...
  p = p.replace(/^(\/\/|\/)?(?:wsl\$|wsl\.localhost)\/[^\/]+/i, `${wslDrive}:`);

  // 2. Handle WSL mountpoints: /mnt/c/... -> c:/...
  p = p.replace(/^\/mnt\/([a-zA-Z])(?:\/|$)/i, (m, letter) => `${letter.toLowerCase()}:/`);

  // 3. Handle bare Linux paths: /home/... -> z:/home/...
  if (p.startsWith('/home/') || p === '/home') {
    p = `${wslDrive}:${p}`;
  }

  // 4. Lowercase drive letter: C: -> c:
  p = p.replace(/^([a-zA-Z]):/, (m, drive) => `${drive.toLowerCase()}:`);

  // 5. Strip trailing slashes
  p = p.replace(/\/+$/, '');

  return p.toLowerCase();
}

/**
 * Checks whether a session CWD matches a target project workspace.
 * Supports exact matches and sub-folder / branch hierarchy matching.
 * 
 * @param {string} sessionCwd - Session CWD or path
 * @param {string} targetWorkspace - Selected workspace filter
 * @param {string} wslDrive - Mapped Windows drive letter for WSL distro (default: 'z')
 * @returns {boolean} True if matching
 */
export function isWorkspaceMatch(sessionCwd, targetWorkspace, wslDrive = 'z') {
  if (!targetWorkspace || targetWorkspace === 'all') return true;
  const target = normalizeWorkspacePath(targetWorkspace, wslDrive);
  const cwd = normalizeWorkspacePath(sessionCwd, wslDrive);
  if (!target || !cwd) return false;

  return cwd === target || cwd.startsWith(target + '/') || target.startsWith(cwd + '/');
}
