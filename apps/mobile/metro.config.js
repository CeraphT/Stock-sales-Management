const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

// Monorepo setup (npm workspaces) — @stockflow/core lives at
// ../../packages/core, symlinked into node_modules by npm. Metro only
// watches/resolves within its own project root by default, so both of
// these are needed for the symlinked workspace package to actually load.
config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [path.resolve(projectRoot, "node_modules"), path.resolve(workspaceRoot, "node_modules")];

// drizzle-kit's generated migrations.js imports raw .sql files directly.
config.resolver.sourceExts.push("sql");

module.exports = withNativeWind(config, { input: "./src/global.css" });
