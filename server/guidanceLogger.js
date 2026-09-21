import fs from 'fs';
import path from 'path';
import os from 'os';
import { getAllSessions } from './parser.js';
import { loadCustomProjects } from './customProjects.js';
import { normalizeWorkspacePath } from './pathUtils.js';

const BACKUP_DIR = path.resolve('.backups');
const LOG_FILE = path.join(BACKUP_DIR, 'guidance-history.json');

if (!fs.existsSync(BACKUP_DIR)) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

function normalizeDir(p) {
  if (!p) return '';
  return normalizeWorkspacePath(p);
}

/**
 * Loads all guidance change records (with initial seed if empty)
 */
export function loadGuidanceRecords() {
  if (fs.existsSync(LOG_FILE)) {
    try {
      const raw = fs.readFileSync(LOG_FILE, 'utf8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    } catch (e) {}
  }

  // Initial seed records documenting established project guidance
  const currentPath = process.cwd();
  const currentName = path.basename(currentPath) || 'tracked-project';

  const initialSeeds = [
    {
      id: 'guidance-rec-seed-1',
      timestamp: new Date(Date.now() - 3600000).toISOString(),
      projectPath: currentPath,
      projectName: currentName,
      actionType: 'APPLY_AGENTS_RULE',
      what: 'Created AGENTS.md with role-specific guidance and monthly review protocol',
      why: 'Establish authoritative token guidelines and reference rules for Architect, Coder, and Verifier agents',
      how: 'Added AGENTS.md defining progressive disclosure, low reasoning defaults, and 30-day sync checklist',
      targetFile: path.join(currentPath, 'AGENTS.md'),
      author: 'Pair Programming Agent',
      status: 'applied',
      metadata: {}
    }
  ];

  saveGuidanceRecords(initialSeeds);
  return initialSeeds;
}

/**
 * Saves guidance change records to disk
 */
function saveGuidanceRecords(records) {
  fs.writeFileSync(LOG_FILE, JSON.stringify(records, null, 2) + '\n', 'utf8');
}

/**
 * Records a new guidance modification
 */
export function logGuidanceChange({
  projectPath,
  actionType,
  what,
  why,
  how,
  targetFile,
  author = 'Pair Programming Agent',
  backupId = null,
  diff = null,
  metadata = {}
}) {
  const normalizedPath = projectPath ? path.resolve(projectPath) : process.cwd();
  const projectName = path.basename(normalizedPath) || 'tracked-project';

  const record = {
    id: `guidance-rec-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    timestamp: new Date().toISOString(),
    projectPath: normalizedPath,
    projectName,
    actionType,
    what: what || 'Applied guidance recommendation',
    why: why || 'Optimized token efficiency and prevented context bloat',
    how: how || `Updated ${targetFile || 'project guidance'}`,
    targetFile: targetFile || '',
    author,
    backupId,
    diff,
    status: 'applied',
    metadata
  };

  const records = loadGuidanceRecords();
  records.unshift(record);
  saveGuidanceRecords(records);

  // Also write project-local log if .agents directory exists in target project
  try {
    const projectAgentsDir = path.join(normalizedPath, '.agents');
    if (fs.existsSync(projectAgentsDir)) {
      const projectLogFile = path.join(projectAgentsDir, 'guidance-history.json');
      let projectRecords = [];
      if (fs.existsSync(projectLogFile)) {
        try { projectRecords = JSON.parse(fs.readFileSync(projectLogFile, 'utf8')); } catch {}
      }
      projectRecords.unshift(record);
      fs.writeFileSync(projectLogFile, JSON.stringify(projectRecords, null, 2) + '\n', 'utf8');
    }
  } catch (e) {
    // ignore non-critical local copy error
  }

  return record;
}

/**
 * Returns guidance records filtered by project (or all if not specified)
 */
export function getGuidanceRecordsForProject(projectPath = null) {
  const records = loadGuidanceRecords();
  if (!projectPath || projectPath === 'all') {
    return records;
  }
  const target = normalizeDir(projectPath);
  return records.filter(r => normalizeDir(r.projectPath) === target);
}

/**
 * Finds the canonical project root (resolving subfolders to Git root or project config root)
 */
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

/**
 * Discovers tracked projects from active sessions, root directory, and predefined locations
 */
export async function getTrackedProjects() {
  const projectMap = new Map();

  // 1. Current workspace as default
  const currentDir = process.cwd();
  if (fs.existsSync(currentDir)) {
    projectMap.set(normalizeDir(currentDir), {
      path: currentDir,
      name: path.basename(currentDir) || 'current-project',
      description: `Current workspace (${path.basename(currentDir)})`,
      isDefault: true,
      sessionCount: 0
    });
  }

  // 2. Custom user-added projects
  const customProjects = loadCustomProjects();
  for (const cp of customProjects) {
    if (fs.existsSync(cp.path)) {
      const key = normalizeDir(cp.path);
      projectMap.set(key, {
        ...cp,
        path: cp.path,
        name: cp.name || path.basename(cp.path),
        description: cp.description || `Custom project (${path.basename(cp.path)})`,
        isDefault: false,
        isCustom: true,
        sessionCount: 0
      });
    }
  }

  // 3. Sibling projects at parent root directory (e.g. z:\home\error\apps)
  try {
    const parentDir = path.dirname(currentDir);
    if (fs.existsSync(parentDir) && parentDir !== currentDir && fs.statSync(parentDir).isDirectory()) {
      const siblings = fs.readdirSync(parentDir, { withFileTypes: true });
      for (const sib of siblings) {
        if (sib.name.startsWith('.') || sib.name === 'node_modules' || sib.name === 'dist') continue;
        if (sib.isDirectory()) {
          const sibPath = path.join(parentDir, sib.name);
          const hasProjectMarker = fs.existsSync(path.join(sibPath, 'package.json')) ||
                                   fs.existsSync(path.join(sibPath, '.git')) ||
                                   fs.existsSync(path.join(sibPath, 'AGENTS.md')) ||
                                   fs.existsSync(path.join(sibPath, '.agents')) ||
                                   fs.existsSync(path.join(sibPath, 'pyproject.toml'));
          if (hasProjectMarker) {
            const key = normalizeDir(sibPath);
            if (!projectMap.has(key)) {
              projectMap.set(key, {
                path: sibPath,
                name: sib.name,
                description: `Discovered in root directory (${sib.name})`,
                isDefault: false,
                isCustom: false,
                sessionCount: 0
              });
            }
          }
        }
      }
    }
  } catch (err) {
    // ignore non-critical parent directory read error
  }

  // 4. Discover from agent sessions (Codex and Antigravity)
  try {
    const sessions = await getAllSessions();
    for (const session of sessions) {
      const cwd = session.meta?.cwd;
      if (cwd) {
        const canonicalRoot = findProjectRoot(cwd);
        if (canonicalRoot && fs.existsSync(canonicalRoot)) {
          const rootDir = path.parse(canonicalRoot).root;
          if (canonicalRoot === rootDir || canonicalRoot === os.homedir()) {
            continue;
          }
          const key = normalizeDir(canonicalRoot);

          if (!projectMap.has(key)) {
            projectMap.set(key, {
              path: canonicalRoot,
              name: path.basename(canonicalRoot),
              description: `Auto-discovered workspace (${path.basename(canonicalRoot)})`,
              isDefault: false,
              isCustom: false,
              sessionCount: 1
            });
          } else {
            const item = projectMap.get(key);
            item.sessionCount = (item.sessionCount || 0) + 1;
          }
        }
      }
    }
  } catch (e) {
    // fallback
  }

  return Array.from(projectMap.values());
}
