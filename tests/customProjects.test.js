import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import path from 'path';
import {
  inspectDirectory,
  getAvailableDrives,
  discoverProjectsAtRoot,
  browseDirectory
} from '../server/customProjects.js';
import { findProjectRoot } from '../server/guidanceLogger.js';

describe('Project Discovery & Custom Projects Tests', () => {

  test('inspectDirectory correctly detects project markers for current workspace', () => {
    const currentPath = process.cwd();
    const inspected = inspectDirectory(currentPath);

    assert.equal(inspected.exists, true);
    assert.equal(inspected.isNode, true);
    assert.equal(inspected.hasAgentsMd, true);
    assert.equal(typeof inspected.name, 'string');
    assert.ok(inspected.name.length > 0);
  });

  test('getAvailableDrives returns array of available drive roots', () => {
    const drives = getAvailableDrives();
    assert.ok(Array.isArray(drives));
    assert.ok(drives.length > 0);
    if (process.platform === 'win32') {
      assert.ok(drives.some(d => d.includes(':')));
    }
  });

  test('findProjectRoot resolves subfolders to the canonical project root', () => {
    const subfolder = path.join(process.cwd(), 'src', 'components');
    const resolvedRoot = findProjectRoot(subfolder);

    assert.ok(resolvedRoot);
    assert.equal(path.resolve(resolvedRoot), path.resolve(process.cwd()));
  });

  test('discoverProjectsAtRoot finds projects in parent root folder', () => {
    const parentRoot = path.dirname(process.cwd());
    const discovered = discoverProjectsAtRoot(parentRoot);

    assert.ok(Array.isArray(discovered));
    if (discovered.length > 0) {
      assert.ok(discovered.every(p => p.exists));
    }
  });

  test('browseDirectory returns entries, drive roots, and project detection', () => {
    const result = browseDirectory(process.cwd());

    assert.ok(result.currentPath);
    assert.ok(Array.isArray(result.items));
    assert.ok(Array.isArray(result.drives));
    assert.equal(result.currentIsProject, true);
  });

});
