import fs from 'fs';
import path from 'path';
import os from 'os';

const DATA_DIR = path.resolve('server/data');
const CUSTOM_PROJECTS_FILE = path.join(DATA_DIR, 'custom-projects.json');

function ensureStorage() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(CUSTOM_PROJECTS_FILE)) {
    fs.writeFileSync(CUSTOM_PROJECTS_FILE, JSON.stringify([], null, 2), 'utf-8');
  }
}

export function loadCustomProjects() {
  try {
    ensureStorage();
    const raw = fs.readFileSync(CUSTOM_PROJECTS_FILE, 'utf-8');
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list : [];
  } catch (err) {
    console.error('Failed to read custom projects:', err);
    return [];
  }
}

export function saveCustomProjects(projects) {
  try {
    ensureStorage();
    fs.writeFileSync(CUSTOM_PROJECTS_FILE, JSON.stringify(projects, null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed to save custom projects:', err);
  }
}

export function inspectDirectory(dirPath) {
  const normalized = path.resolve(dirPath);
  if (!fs.existsSync(normalized)) {
    return { exists: false, error: 'Path does not exist on computer' };
  }

  const stat = fs.statSync(normalized);
  if (!stat.isDirectory()) {
    return { exists: false, error: 'Path is a file, not a directory' };
  }

  const baseName = path.basename(normalized) || normalized;
  let name = baseName;
  let description = `Project directory (${baseName})`;
  let isNode = false;
  let isGit = fs.existsSync(path.join(normalized, '.git'));
  let hasAgentsMd = fs.existsSync(path.join(normalized, 'AGENTS.md'));
  let isPython = fs.existsSync(path.join(normalized, 'pyproject.toml')) || fs.existsSync(path.join(normalized, 'requirements.txt'));
  let isRust = fs.existsSync(path.join(normalized, 'Cargo.toml'));
  let isGo = fs.existsSync(path.join(normalized, 'go.mod'));

  const pkgPath = path.join(normalized, 'package.json');
  if (fs.existsSync(pkgPath)) {
    isNode = true;
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      if (pkg.name) name = pkg.name;
      if (pkg.description) description = pkg.description;
    } catch {}
  }

  return {
    exists: true,
    path: normalized,
    name,
    description,
    isGit,
    hasAgentsMd,
    isNode,
    isPython,
    isRust,
    isGo
  };
}

export function addCustomProject(dirPath, customName) {
  const inspected = inspectDirectory(dirPath);
  if (!inspected.exists) {
    throw new Error(inspected.error);
  }

  const currentList = loadCustomProjects();
  const normalizedPath = inspected.path;

  const existingIndex = currentList.findIndex(p => path.resolve(p.path) === normalizedPath);
  const projectItem = {
    path: normalizedPath,
    name: customName?.trim() || inspected.name,
    description: inspected.description,
    isDefault: false,
    isCustom: true,
    isGit: inspected.isGit,
    hasAgentsMd: inspected.hasAgentsMd,
    isNode: inspected.isNode,
    isPython: inspected.isPython,
    isRust: inspected.isRust,
    isGo: inspected.isGo,
    sessionCount: 0,
    addedAt: new Date().toISOString()
  };

  if (existingIndex >= 0) {
    currentList[existingIndex] = { ...currentList[existingIndex], ...projectItem };
  } else {
    currentList.push(projectItem);
  }

  saveCustomProjects(currentList);
  return projectItem;
}

export function removeCustomProject(dirPath) {
  const normalized = path.resolve(dirPath);
  const currentList = loadCustomProjects();
  const filtered = currentList.filter(p => path.resolve(p.path) !== normalized);
  saveCustomProjects(filtered);
  return { success: true, count: filtered.length };
}

export function browseDirectory(targetPath) {
  const homeDir = os.homedir();
  let resolvedPath = targetPath ? path.resolve(targetPath) : homeDir;

  if (!fs.existsSync(resolvedPath) || !fs.statSync(resolvedPath).isDirectory()) {
    resolvedPath = homeDir;
  }

  const parentPath = path.dirname(resolvedPath) !== resolvedPath ? path.dirname(resolvedPath) : null;
  const entries = [];

  try {
    const dirItems = fs.readdirSync(resolvedPath, { withFileTypes: true });

    for (const item of dirItems) {
      if (item.name.startsWith('.') && item.name !== '.gemini' && item.name !== '.agents') continue;
      if (item.name === 'node_modules' || item.name === 'dist' || item.name === '.git') continue;

      if (item.isDirectory() || item.isSymbolicLink()) {
        const fullItemPath = path.join(resolvedPath, item.name);
        try {
          const isDir = fs.statSync(fullItemPath).isDirectory();
          if (!isDir) continue;

          const hasPkg = fs.existsSync(path.join(fullItemPath, 'package.json'));
          const hasGit = fs.existsSync(path.join(fullItemPath, '.git'));
          const hasAgents = fs.existsSync(path.join(fullItemPath, 'AGENTS.md'));
          const hasPy = fs.existsSync(path.join(fullItemPath, 'pyproject.toml')) || fs.existsSync(path.join(fullItemPath, 'requirements.txt'));
          const isProject = hasPkg || hasGit || hasAgents || hasPy;

          entries.push({
            name: item.name,
            path: fullItemPath,
            isProject,
            hasGit,
            hasPkg,
            hasAgents
          });
        } catch {}
      }
    }
  } catch (err) {
    console.error('Error browsing directory:', err);
  }

  entries.sort((a, b) => {
    if (a.isProject && !b.isProject) return -1;
    if (!a.isProject && b.isProject) return 1;
    return a.name.localeCompare(b.name);
  });

  return {
    currentPath: resolvedPath,
    parentPath,
    homePath: homeDir,
    items: entries
  };
}
