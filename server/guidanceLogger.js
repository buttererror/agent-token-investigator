import fs from 'fs';
import path from 'path';
import os from 'os';
import { getAllSessions } from './parser.js';
import { loadCustomProjects } from './customProjects.js';

const BACKUP_DIR = path.resolve('.backups');
const LOG_FILE = path.join(BACKUP_DIR, 'guidance-history.json');

if (!fs.existsSync(BACKUP_DIR)) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

function normalizeDir(p) {
  if (!p) return '';
  return path.resolve(p).replace(/[\/\\]+$/, '').toLowerCase();
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
 * Finds the canonical project root (resolving subfolders to the Git repository root)
 */
export function findProjectRoot(startDir) {
  if (!startDir) return process.cwd();
  let curr = path.resolve(startDir);
  const rootDir = path.parse(curr).root;
  while (curr && curr !== rootDir) {
    if (fs.existsSync(path.join(curr, '.git'))) {
      return curr;
    }
    curr = path.dirname(curr);
  }
  return path.resolve(startDir);
}

/**
 * Discovers tracked projects from active sessions and predefined locations
 */
export async function getTrackedProjects() {
  const projectMap = new Map();

  // Current workspace as default
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

  // Custom user-added projects
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

  try {
    const sessions = await getAllSessions();
    for (const session of sessions) {
      const cwd = session.meta?.cwd;
      if (cwd && fs.existsSync(cwd)) {
        const canonicalRoot = findProjectRoot(cwd);
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
  } catch (e) {
    // fallback
  }

  return Array.from(projectMap.values());
}
