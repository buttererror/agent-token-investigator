# Fork Integration Changes

Please see the full guide, relative changed files list, and exact line changes in:
👉 [**FORK_INTEGRATION_CHANGES.md**](../../FORK_INTEGRATION_CHANGES.md)

### Summary of Relative Files Included:
1. `server/antigravityParser.js` — Dynamic multi-OS brain root directory discovery (`detectEnvironment`, `getAntigravityBrainDir`).
2. `server/pathUtils.js` — [NEW] Server canonical workspace path normalizer and hierarchical matcher.
3. `src/utils/pathUtils.js` — [NEW] Frontend client canonical workspace normalizer.
4. `server/index.js` — `/api/discover-projects` endpoint and `isWorkspaceMatch` filters.
5. `server/guidanceLogger.js` — `normalizeWorkspacePath` in `normalizeDir` and upgraded `findProjectRoot`.
6. `server/customProjects.js` — `getAvailableDrives()`, `discoverProjectsAtRoot()`, and polyglot project markers.
7. `src/composables/useTokenData.js` — `isWorkspaceMatch` in `filteredSessions` and `All Agents` support.
8. `src/components/dashboard/AppHeader.vue` — Project picker button (`+`), `All Agents` option, `➕ Pick / Add project...` option.
9. `src/App.vue` — Mount `ProjectSelectorModal.vue` with modal state and handlers.
10. `src/components/ProjectSelectorModal.vue` — Windows drive switcher, polyglot badges, and root discovery list.
11. `tests/customProjects.test.js` — [NEW] 5 unit tests (27/27 total passing).
