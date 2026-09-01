import fs from 'fs';
import path from 'path';
import os from 'os';
import { getAllSessions } from './parser.js';

const BACKUP_DIR = '/home/ellol/apps/agent-token-tracker/.backups';
const LOG_FILE = path.join(BACKUP_DIR, 'guidance-history.json');

if (!fs.existsSync(BACKUP_DIR)) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

/**
 * Loads all guidance change records
 */
export function loadGuidanceRecords() {
  if (!fs.existsSync(LOG_FILE)) {
    return [];
  }
  try {
    const raw = fs.readFileSync(LOG_FILE, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    return [];
  }
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
  const normalizedPath = projectPath ? path.resolve(projectPath) : '/home/ellol/solutions/clinic-platform';
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
 * Returns guidance records filtered by project
 */
export function getGuidanceRecordsForProject(projectPath = null) {
  const records = loadGuidanceRecords();
  if (!projectPath || projectPath === 'all') {
    return records;
  }
  const normalizedTarget = path.resolve(projectPath);
  return records.filter(r => path.resolve(r.projectPath) === normalizedTarget);
}

/**
 * Discovers tracked projects from active sessions and predefined locations
 */
export async function getTrackedProjects() {
  const projectMap = new Map();

  // Known default projects
  const defaults = [
    { path: '/home/ellol/solutions/clinic-platform', name: 'clinic-platform', description: 'Clinic Monorepo (NestJS, React, Prisma)' },
    { path: '/home/ellol/apps/agent-token-tracker', name: 'agent-token-tracker', description: 'Agent Token Tracker (Vue 3, Express)' }
  ];

  for (const def of defaults) {
    if (fs.existsSync(def.path)) {
      projectMap.set(path.resolve(def.path), {
        path: def.path,
        name: def.name,
        description: def.description,
        isDefault: true
      });
    }
  }

  try {
    const sessions = await getAllSessions();
    for (const session of sessions) {
      const cwd = session.meta?.cwd;
      if (cwd && fs.existsSync(cwd)) {
        const resolved = path.resolve(cwd);
        if (!projectMap.has(resolved)) {
          projectMap.set(resolved, {
            path: cwd,
            name: path.basename(cwd),
            description: `Auto-discovered from Codex Session ${session.sessionId.substring(0, 8)}`,
            isDefault: false
          });
        }
      }
    }
  } catch (e) {
    // fallback
  }

  return Array.from(projectMap.values());
}
