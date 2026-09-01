import fs from 'fs';
import path from 'path';
import os from 'os';
import { getAllSessions } from './parser.js';
import { loadCustomProjects } from './customProjects.js';

const BACKUP_DIR = '/home/ellol/apps/agent-token-tracker/.backups';
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
  const initialSeeds = [
    {
      id: 'guidance-rec-seed-1',
      timestamp: new Date(Date.now() - 3600000).toISOString(),
      projectPath: '/home/ellol/apps/agent-token-tracker',
      projectName: 'agent-token-tracker',
      actionType: 'APPLY_AGENTS_RULE',
      what: 'Created AGENTS.md with role-specific guidance and monthly review protocol',
      why: 'Establish authoritative token guidelines and reference rules for Architect, Coder, and Verifier agents',
      how: 'Added AGENTS.md defining progressive disclosure, low reasoning defaults, and 30-day sync checklist',
      targetFile: '/home/ellol/apps/agent-token-tracker/AGENTS.md',
      author: 'Pair Programming Agent',
      status: 'applied',
      metadata: {}
    },
    {
      id: 'guidance-rec-seed-2',
      timestamp: new Date(Date.now() - 7200000).toISOString(),
      projectPath: '/home/ellol/solutions/clinic-platform',
      projectName: 'clinic-platform',
      actionType: 'APPLY_AGENTS_RULE',
      what: 'Added learning-focused testing comments and vertical slice boundaries to AGENTS.md',
      why: 'Ensure automated test suites and agent modifications preserve educational story comments and avoid cross-boundary leaks',
      how: 'Injected testing-comment pass guidelines and vertical slice principles into AGENTS.md',
      targetFile: '/home/ellol/solutions/clinic-platform/AGENTS.md',
      author: 'Pair Programming Agent',
      status: 'applied',
      metadata: {}
    },
    {
      id: 'guidance-rec-seed-3',
      timestamp: new Date(Date.now() - 10800000).toISOString(),
      projectPath: '/home/ellol/solutions/clinic-platform',
      projectName: 'clinic-platform',
      actionType: 'APPLY_PACKAGE_SCRIPT',
      what: 'Configured "test:agent" runner with --bail 1 and --silent flags',
      why: 'Prevent 40k+ raw console output and passing assertion tokens from polluting subsequent conversation turns',
      how: 'Added script "test:agent": "vitest run --bail=1 --silent" to apps/admin/package.json',
      targetFile: '/home/ellol/solutions/clinic-platform/package.json',
      author: 'Testing & Verification Agent',
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
  const normalizedPath = projectPath ? path.resolve(projectPath) : '/home/ellol/apps/agent-token-tracker';
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
  if (!startDir) return '/home/ellol/apps/agent-token-tracker';
  let curr = path.resolve(startDir);
  const stopDir = '/home/ellol';
  while (curr && curr !== stopDir && curr !== '/') {
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

  // Known default projects
  const defaults = [
    { path: '/home/ellol/apps/agent-token-tracker', name: 'agent-token-tracker', description: 'Agent Token Tracker (Vue 3, Express)', isDefault: true, sessionCount: 0 },
    { path: '/home/ellol/solutions/clinic-platform', name: 'clinic-platform', description: 'Clinic Monorepo (NestJS, React, Prisma)', isDefault: true, sessionCount: 0 }
  ];

  for (const def of defaults) {
    if (fs.existsSync(def.path)) {
      projectMap.set(normalizeDir(def.path), {
        path: def.path,
        name: def.name,
        description: def.description,
        isDefault: true,
        sessionCount: 0
      });
    }
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
