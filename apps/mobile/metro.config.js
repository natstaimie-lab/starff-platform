// Monorepo-aware Metro config: Starff is an npm-workspaces repo, so most
// dependencies are hoisted to the repo-root node_modules. Metro must watch the
// workspace root and resolve modules from both node_modules folders.
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

module.exports = config;
