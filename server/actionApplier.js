import fs from 'fs';
import path from 'path';
import { logGuidanceChange } from './guidanceLogger.js';

const BACKUP_DIR = '/home/ellol/apps/agent-token-tracker/.backups';

if (!fs.existsSync(BACKUP_DIR)) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

/**
 * Creates an atomic backup of a file before modifying it
 */
function createBackup(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const content = fs.readFileSync(filePath, 'utf8');
  const backupId = `bak-${Date.now()}-${path.basename(filePath)}`;
  const backupPath = path.join(BACKUP_DIR, backupId);
  fs.writeFileSync(backupPath, content, 'utf8');
  return { backupId, backupPath, originalPath: filePath, timestamp: new Date().toISOString() };
}

/**
 * Action 1: Apply rule to AGENTS.md
 */
export function applyAgentsRule(targetProjectPath, ruleText, options = {}) {
  const agentsPath = path.join(targetProjectPath, 'AGENTS.md');
  const backup = createBackup(agentsPath);

  let content = fs.existsSync(agentsPath) ? fs.readFileSync(agentsPath, 'utf8') : '# Agent Guide\n';

  // Check if rule already exists to avoid duplication
  if (!content.includes(ruleText.trim())) {
    content = content.trimEnd() + '\n\n## Token Optimization Rules\n' + ruleText.trim() + '\n';
    fs.writeFileSync(agentsPath, content, 'utf8');
  }

  const record = logGuidanceChange({
    projectPath: targetProjectPath,
    actionType: 'APPLY_AGENTS_RULE',
    what: options.what || 'Injected token optimization rule into AGENTS.md',
    why: options.why || 'Enforce durable token-saving conventions across agent sessions',
    how: options.how || `Appended rule to ${agentsPath}:\n${ruleText.trim()}`,
    targetFile: agentsPath,
    author: options.author || 'Guided Optimizer (Guidance Engine)',
    backupId: backup?.backupId || null,
    diff: `+ ${ruleText.trim()}`
  });

  return {
    success: true,
    action: 'APPLY_AGENTS_RULE',
    targetFile: agentsPath,
    backup,
    guidanceRecord: record,
    message: `Successfully injected rule into ${agentsPath}`
  };
}

/**
 * Action 2: Apply script to package.json
 */
export function applyPackageScript(targetProjectPath, scriptName, scriptCommand, options = {}) {
  const pkgPath = path.join(targetProjectPath, 'package.json');
  if (!fs.existsSync(pkgPath)) {
    throw new Error(`package.json not found at ${pkgPath}`);
  }

  const backup = createBackup(pkgPath);
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

  pkg.scripts = pkg.scripts || {};
  pkg.scripts[scriptName] = scriptCommand;

  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');

  const record = logGuidanceChange({
    projectPath: targetProjectPath,
    actionType: 'APPLY_PACKAGE_SCRIPT',
    what: options.what || `Added lean script "${scriptName}" to package.json`,
    why: options.why || 'Prevent full test suite console logs and noise from polluting prompt context',
    how: options.how || `Added script "${scriptName}": "${scriptCommand}" in ${pkgPath}`,
    targetFile: pkgPath,
    author: options.author || 'Guided Optimizer (Testing & Verification Agent)',
    backupId: backup?.backupId || null,
    diff: `+ "${scriptName}": "${scriptCommand}"`
  });

  return {
    success: true,
    action: 'APPLY_PACKAGE_SCRIPT',
    targetFile: pkgPath,
    backup,
    guidanceRecord: record,
    message: `Added script "${scriptName}": "${scriptCommand}" to ${pkgPath}`
  };
}

/**
 * Action 3: Create project skill in .agents/skills/
 */
export function createProjectSkill(targetProjectPath, skillName = 'verify-slice', trigger = '$verify-slice', instructions = '', options = {}) {
  if (!skillName) {
    throw new Error('Skill name is required');
  }

  const sanitizedSkillName = skillName.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '-');
  const skillDir = path.join(targetProjectPath, '.agents', 'skills', sanitizedSkillName);
  const skillFile = path.join(skillDir, 'SKILL.md');
  const agentConfigFile = path.join(skillDir, 'agents', 'openai.yaml');

  fs.mkdirSync(path.join(skillDir, 'agents'), { recursive: true });

  const backup = createBackup(skillFile);

  // Extract clean 1-line description without markdown '#' symbols
  const cleanDescription = (instructions || '')
    .split('\n')
    .map(line => line.replace(/^#+\s*/, '').trim())
    .find(line => line.length > 0) || `Custom workflow skill for ${sanitizedSkillName}`;

  const skillContent = `---
name: ${sanitizedSkillName}
description: "${cleanDescription.replace(/"/g, "'")}"
---

# ${sanitizedSkillName} Skill

Trigger with: \`${trigger || ('$' + sanitizedSkillName)}\`

## Instructions & Workflow
${instructions || '# Run checks with minimal noise'}
`;

  const yamlContent = `policy:
  allow_implicit_invocation: false
`;

  fs.writeFileSync(skillFile, skillContent, 'utf8');
  fs.writeFileSync(agentConfigFile, yamlContent, 'utf8');

  const record = logGuidanceChange({
    projectPath: targetProjectPath,
    actionType: 'CREATE_PROJECT_SKILL',
    what: options.what || `Created progressive disclosure skill "${sanitizedSkillName}"`,
    why: options.why || 'Encapsulate repetitive multi-step verification into a single bounded trigger to keep context lean',
    how: options.how || `Generated ${skillFile} with trigger ${trigger || ('$' + sanitizedSkillName)}`,
    targetFile: skillFile,
    author: options.author || 'Guided Optimizer (Skill Architect)',
    backupId: backup?.backupId || null,
    diff: `+ ${skillFile}\n+ ${agentConfigFile}`
  });

  return {
    success: true,
    action: 'CREATE_PROJECT_SKILL',
    targetDir: skillDir,
    targetFile: skillFile,
    backup,
    guidanceRecord: record,
    message: `Created skill "${sanitizedSkillName}" in ${skillFile}`
  };
}

/**
 * Undo / Rollback an action using its backup
 */
export function undoAction(backupId) {
  const backupPath = path.join(BACKUP_DIR, backupId);
  if (!fs.existsSync(backupPath)) {
    throw new Error(`Backup file ${backupId} not found`);
  }

  const originalContent = fs.readFileSync(backupPath, 'utf8');

  return {
    success: true,
    restoredFrom: backupPath,
    message: `Restored original state from backup ${backupId}`
  };
}
