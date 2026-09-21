# Fork Integration Guide & Changeset Summary

**Project**: Agent Token Tracker  
**Branch / Working Directory**: `agent-token-investigator-development`  
**Date**: September 2026  
**Status**: Verified & Ready for Integration  

This document provides a comprehensive, file-by-file record of all changes, bug fixes, enhancements, and architectural components developed in this repository to be committed when integrating into the main forked repository.

---

## 1. Executive Summary of Relative Changed Files

| # | Relative File Path | Type | Key Enhancements / Exact Fixes |
|---|---|---|---|
| 1 | [`server/antigravityParser.js`](server/antigravityParser.js) | Modified | Dynamic root discovery (`detectEnvironment`, `getAntigravityBrainDir`), prompt mapping CWD extraction, internal `.gemini` filter. |
| 2 | [`server/pathUtils.js`](server/pathUtils.js) | **NEW** | Canonical path normalizer (`normalizeWorkspacePath`) & hierarchical matcher (`isWorkspaceMatch`) supporting WSL UNC & Windows. |
| 3 | [`src/utils/pathUtils.js`](src/utils/pathUtils.js) | **NEW** | Frontend mirror of `normalizeWorkspacePath` & `isWorkspaceMatch` for reactive client filtering. |
| 4 | [`server/index.js`](server/index.js) | Modified | Added `/api/discover-projects` endpoint; applied `isWorkspaceMatch` to `/api/overview`, `/api/diagnostics`, `/api/pacing-forecast`. |
| 5 | [`server/guidanceLogger.js`](server/guidanceLogger.js) | Modified | Applied `normalizeWorkspacePath` in `normalizeDir`; upgraded `findProjectRoot` with polyglot project markers. |
| 6 | [`server/customProjects.js`](server/customProjects.js) | Modified | Added `getAvailableDrives()`, `discoverProjectsAtRoot()`, polyglot markers (`Node`, `Python`, `Rust`, `Go`, `AGENTS.md`). |
| 7 | [`src/composables/useTokenData.js`](src/composables/useTokenData.js) | Modified | Applied `isWorkspaceMatch` to `filteredSessions`; added `'all'` agent support to `getSavedAgent()`, `filteredSessions`, and `setAgent()`. |
| 8 | [`src/components/dashboard/AppHeader.vue`](src/components/dashboard/AppHeader.vue) | Modified | Restored project picker trigger (`+` button), added `All Agents` option, added `➕ Pick / Add project...` dropdown entry. |
| 9 | [`src/App.vue`](src/App.vue) | Modified | Mounted `<ProjectSelectorModal>`, added `isProjectPickerOpen` state and event handlers. |
| 10 | [`src/components/ProjectSelectorModal.vue`](src/components/ProjectSelectorModal.vue) | Modified | Added Windows drive switcher (`C:\`, `Z:\`), polyglot badges, and quick-add root discovery section. |
| 11 | [`tests/customProjects.test.js`](tests/customProjects.test.js) | **NEW** | 5 unit tests for discovery, drive enumeration, and root resolution (27/27 total test suite passes). |

---

## 2. Exact Code Changes by Relative File

### 1. `server/antigravityParser.js`
Replaced static `BRAIN_DIR` with multi-OS environment detection and dynamic brain directory resolution across Windows host, WSL host mounts (`/mnt/c/Users/...`), and native Linux.

#### Exact Added Lines:
```javascript
/**
 * Detects current runtime operating system environment (Windows, WSL, Linux, or macOS)
 */
export function detectEnvironment() {
  if (process.platform === 'win32') return 'windows';
  if (process.platform === 'linux') {
    const isWsl = (os.release && os.release().toLowerCase().includes('microsoft')) ||
      Boolean(process.env.WSL_DISTRO_NAME || process.env.WSL_INTEROP);
    if (isWsl) return 'wsl';
    try {
      if (fs.existsSync('/proc/version') && fs.readFileSync('/proc/version', 'utf8').toLowerCase().includes('microsoft')) {
        return 'wsl';
      }
    } catch {}
    return 'linux';
  }
  if (process.platform === 'darwin') return 'macos';
  return 'unknown';
}

/**
 * Dynamically resolves the Antigravity session brain directory across Windows, WSL, and Linux
 */
export function getAntigravityBrainDir() {
  if (process.env.ANTIGRAVITY_BRAIN_DIR && fs.existsSync(process.env.ANTIGRAVITY_BRAIN_DIR)) {
    return process.env.ANTIGRAVITY_BRAIN_DIR;
  }

  const env = detectEnvironment();
  const candidates = [];

  if (env === 'windows') {
    candidates.push(path.join(os.homedir(), '.gemini', 'antigravity', 'brain'));
    if (process.env.USERPROFILE) {
      candidates.push(path.join(process.env.USERPROFILE, '.gemini', 'antigravity', 'brain'));
    }
  } else if (env === 'wsl') {
    // 1. Check mounted Windows host user folders under /mnt/c/Users
    try {
      if (fs.existsSync('/mnt/c/Users')) {
        const winUsers = fs.readdirSync('/mnt/c/Users');
        for (const user of winUsers) {
          if (['Public', 'Default', 'All Users', 'Default User'].includes(user)) continue;
          candidates.push(path.join('/mnt/c/Users', user, '.gemini', 'antigravity', 'brain'));
        }
      }
    } catch {}

    // 2. Fallback to local WSL home in case Antigravity CLI ran natively in Linux
    candidates.push(path.join(os.homedir(), '.gemini', 'antigravity', 'brain'));
  } else {
    // Pure Linux or macOS
    candidates.push(path.join(os.homedir(), '.gemini', 'antigravity', 'brain'));
  }

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return path.join(os.homedir(), '.gemini', 'antigravity', 'brain');
}
```

#### Inside `findAntigravitySessions()`:
```javascript
export function findAntigravitySessions() {
  const results = [];
  const brainDir = getAntigravityBrainDir();
  if (!brainDir || !fs.existsSync(brainDir)) return results;

  try {
    const entries = fs.readdirSync(brainDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory() && entry.name !== 'tempmediaStorage') {
        const logPath = path.join(brainDir, entry.name, '.system_generated', 'logs', 'transcript.jsonl');
        if (fs.existsSync(logPath)) {
          results.push({
            sessionId: entry.name,
            logPath
          });
        }
      }
    }
  } catch (err) {
    console.error('Failed to read Antigravity brain directory:', err);
  }
  return results;
}
```

---

### 2. `server/pathUtils.js` [NEW FILE]
Complete standalone utility module for server-side normalization and workspace matching:

```javascript
/**
 * Path and Workspace Normalization Utilities
 * Supports Windows drive letters, WSL UNC paths (\\wsl$\ and \\wsl.localhost\),
 * POSIX /home/ paths, and case/slash differences.
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

export function isWorkspaceMatch(sessionCwd, targetWorkspace, wslDrive = 'z') {
  if (!targetWorkspace || targetWorkspace === 'all') return true;
  const target = normalizeWorkspacePath(targetWorkspace, wslDrive);
  const cwd = normalizeWorkspacePath(sessionCwd, wslDrive);
  if (!target || !cwd) return false;

  return cwd === target || cwd.startsWith(target + '/') || target.startsWith(cwd + '/');
}
```

---

### 3. `src/utils/pathUtils.js` [NEW FILE]
Exact client-side mirror of `normalizeWorkspacePath` and `isWorkspaceMatch` for the Vue 3 frontend composable.

---

### 4. `server/index.js`
- **Line 15**: Added import:
  ```javascript
  import { isWorkspaceMatch } from './pathUtils.js';
  ```
- **Line 41-43** (inside `/api/overview`):
  ```javascript
  if (workspace && workspace !== 'all') {
    sessions = sessions.filter(s => isWorkspaceMatch(s.meta?.cwd, workspace));
  }
  ```
- **Line 91-93** (inside `/api/diagnostics`):
  ```javascript
  if (workspace && workspace !== 'all') {
    sessions = sessions.filter(s => isWorkspaceMatch(s.meta?.cwd, workspace));
  }
  ```
- **Line 113-115** (inside `/api/pacing-forecast`):
  ```javascript
  if (workspace && workspace !== 'all') {
    sessions = sessions.filter(s => isWorkspaceMatch(s.meta?.cwd, workspace));
  }
  ```
- **Line 268-278** (Endpoint added):
  ```javascript
  app.get('/api/discover-projects', (req, res) => {
    try {
      const rootDir = req.query.rootDir || null;
      const projects = discoverProjectsAtRoot(rootDir);
      res.json(projects);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  ```

---

### 5. `server/guidanceLogger.js`
- **Line 6**: Added import:
  ```javascript
  import { normalizeWorkspacePath } from './pathUtils.js';
  ```
- **Line 16-19**: Updated `normalizeDir`:
  ```javascript
  function normalizeDir(p) {
    if (!p) return '';
    return normalizeWorkspacePath(p);
  }
  ```
- **Line 138-176**: Enhanced `findProjectRoot`:
  ```javascript
  export function findProjectRoot(startDir) {
    if (!startDir) return process.cwd();
    let curr = path.resolve(startDir);
    try {
      if (fs.existsSync(curr) && fs.statSync(curr).isFile()) {
        curr = path.dirname(curr);
      }
    } catch {}

    const lower = curr.toLowerCase();
    if (lower.includes('.gemini') || lower.includes('antigravity\\brain') || lower.includes('antigravity/brain')) {
      return null;
    }

    const rootDir = path.parse(curr).root;
    let candidate = null;

    while (curr && curr !== rootDir) {
      const hasGit = fs.existsSync(path.join(curr, '.git'));
      const hasPkg = fs.existsSync(path.join(curr, 'package.json'));
      const hasAgents = fs.existsSync(path.join(curr, 'AGENTS.md'));
      const hasAgentsDir = fs.existsSync(path.join(curr, '.agents'));
      const hasPy = fs.existsSync(path.join(curr, 'pyproject.toml')) || fs.existsSync(path.join(curr, 'requirements.txt'));
      const hasCargo = fs.existsSync(path.join(curr, 'Cargo.toml'));
      const hasGo = fs.existsSync(path.join(curr, 'go.mod'));

      if (hasGit) {
        return curr;
      }

      if (hasPkg || hasAgents || hasAgentsDir || hasPy || hasCargo || hasGo) {
        if (!candidate) candidate = curr;
      }

      curr = path.dirname(curr);
    }

    return candidate || (fs.existsSync(startDir) ? path.resolve(startDir) : null);
  }
  ```

---

### 6. `server/customProjects.js`
- **Added `getAvailableDrives()`**:
  ```javascript
  export function getAvailableDrives() {
    const drives = [];
    if (process.platform === 'win32') {
      for (let i = 65; i <= 90; i++) {
        const letter = String.fromCharCode(i);
        const drivePath = `${letter}:\\`;
        try {
          if (fs.existsSync(drivePath)) {
            drives.push(drivePath);
          }
        } catch {}
      }
    } else {
      drives.push('/');
    }
    return drives;
  }
  ```
- **Added `discoverProjectsAtRoot(rootDir = null)`**:
  ```javascript
  export function discoverProjectsAtRoot(rootDir = null) {
    const targetDir = rootDir ? path.resolve(rootDir) : path.dirname(process.cwd());
    const discovered = [];
    if (!fs.existsSync(targetDir) || !fs.statSync(targetDir).isDirectory()) {
      return discovered;
    }

    try {
      const items = fs.readdirSync(targetDir, { withFileTypes: true });
      for (const item of items) {
        if (item.name.startsWith('.') && item.name !== '.agents') continue;
        if (item.name === 'node_modules' || item.name === 'dist') continue;
        if (item.isDirectory() || item.isSymbolicLink()) {
          const full = path.join(targetDir, item.name);
          try {
            const inspected = inspectDirectory(full);
            if (inspected.exists && (inspected.isGit || inspected.isNode || inspected.hasAgentsMd || inspected.isPython || inspected.isRust || inspected.isGo)) {
              discovered.push(inspected);
            }
          } catch {}
        }
      }
    } catch (err) {
      console.error('Error discovering projects at root:', err);
    }

    return discovered;
  }
  ```

---

### 7. `src/composables/useTokenData.js`
- **Line 2**: Added import:
  ```javascript
  import { isWorkspaceMatch } from '../utils/pathUtils.js';
  ```
- **Line 30-38**: Updated `getSavedAgent()` to support `'all'`:
  ```javascript
  const getSavedAgent = () => {
    try {
      if (typeof localStorage !== 'undefined') {
        const saved = localStorage.getItem('agent_tracker_agent');
        if (saved === 'codex' || saved === 'antigravity' || saved === 'all') return saved;
      }
    } catch {}
    return 'all';
  };
  ```
- **Line 57-69**: Updated `filteredSessions` with `isWorkspaceMatch`:
  ```javascript
  const filteredSessions = computed(() => {
    let list = sessions.value || [];
    
    // 1. Filter by active agent
    if (activeAgent.value && activeAgent.value !== 'all') {
      list = list.filter(s => (s.agentType || 'codex') === activeAgent.value);
    }
    
    // 2. Filter by workspace
    if (activeWorkspace.value && activeWorkspace.value !== 'all') {
      list = list.filter(s => isWorkspaceMatch(s.meta?.cwd, activeWorkspace.value));
    }

    // 3. Filter by timeRange
    const timeRange = activeTimeRange.value;
    if (!timeRange || timeRange === 'all') {
      return list;
    }
    ...
  ```
- **Line 384-394**: Updated `setAgent(type)`:
  ```javascript
  function setAgent(type) {
    if (type !== 'codex' && type !== 'antigravity' && type !== 'all') return;
    activeAgent.value = type;
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('agent_tracker_agent', type);
      }
    } catch {}
    fetchAll();
  }
  ```

---

### 8. `src/components/dashboard/AppHeader.vue`
- **Lines 141-147**: Added `All Agents` option:
  ```html
  <select 
    id="agent-select"
    :value="activeAgent" 
    class="scope-select"
    @change="onAgentChange"
  >
    <option value="all">All Agents</option>
    <option value="antigravity">Antigravity</option>
    <option value="codex">Codex</option>
  </select>
  ```
- **Lines 170-178**: Restored `+` trigger button and `➕ Pick / Add project...` in workspace dropdown:
  ```html
  <div class="scope-select-pill project-select-pill">
    <select 
      id="workspace-select"
      :value="activeWorkspace" 
      class="scope-select project-dropdown"
      @change="onWorkspaceChange"
    >
      <option value="all">All Projects</option>
      <option value="__add_project__" class="add-project-option">➕ Pick / Add project...</option>
      ...
    </select>
    <button 
      type="button" 
      class="pill-add-btn" 
      title="Add or browse custom project directory"
      @click.stop="$emit('open-project-picker')"
    >+</button>
  </div>
  ```

---

### 9. `src/App.vue`
- Added `<ProjectSelectorModal>` mounting and event handlers:
  ```html
  <ProjectSelectorModal
    :is-open="isProjectPickerOpen"
    :projects="projects"
    @close="isProjectPickerOpen = false"
    @project-selected="handleProjectSelected"
    @project-added="handleProjectAdded"
    @project-removed="handleProjectRemoved"
  />
  ```

---

### 10. `tests/customProjects.test.js` [NEW FILE]
5 comprehensive unit tests covering `inspectDirectory`, `getAvailableDrives`, `findProjectRoot`, `discoverProjectsAtRoot`, and `browseDirectory`. All 27 tests in the suite pass.

---

## 3. Step-by-Step Integration & Commit Instructions

```bash
# 1. Run all unit tests
npm test

# 2. Build production frontend
wsl -e bash -ic "cd /home/error/apps/agent-token-investigator-development && npm run build"

# 3. Recommended commit message
git commit -m "feat: multi-OS root discovery, WSL path normalization, and restored project picker

- Add detectEnvironment and getAntigravityBrainDir for Windows, WSL, and Linux
- Add normalizeWorkspacePath and isWorkspaceMatch in server and client pathUtils
- Restore project picker trigger button (+) and modal mounting in AppHeader and App.vue
- Add All Agents option to agent-select and update getSavedAgent default
- Enhance project discovery at root with polyglot project markers (Node, Python, Rust, Go, AGENTS)
- Add 5 new unit tests (27/27 total passing)"
```
