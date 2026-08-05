#!/usr/bin/env node
"use strict";

// Local Windows build script for Attic.
// - Works around electron-builder 26.x memory exhaustion by temporarily setting
//   package.json "packageManager" to "traversal" so it uses manual node_modules
//   traversal instead of the npm dependency collector.
// - Shrinks node_modules to only the packages required by the Electron main process
//   before packaging, because the renderer is already bundled into dist/ by Vite.
// - Keeps the full Electron binary aside, prunes dev dependencies, then reinstalls
//   electron-builder against the production tree.
// - Restores package.json and dev dependencies at the end so the workspace stays usable.

const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const projectDir = path.resolve(__dirname, "..");
const packageJsonPath = path.join(projectDir, "package.json");
const packageLockPath = path.join(projectDir, "package-lock.json");
const electronDistSource = path.join(projectDir, "node_modules", "electron", "dist");
const electronDistTarget = path.join(projectDir, "electron-dist");

let originalPackageJson = null;
let originalPackageLock = null;
let modified = false;

function restorePackageJson() {
  if (!modified || !originalPackageJson) return;
  try {
    fs.writeFileSync(packageJsonPath, JSON.stringify(originalPackageJson, null, 2) + "\n", "utf8");
    if (originalPackageLock !== null && fs.existsSync(packageLockPath)) {
      fs.writeFileSync(packageLockPath, originalPackageLock, "utf8");
    }
    modified = false;
  } catch (err) {
    console.error("Failed to restore package.json:", err.message);
  }
}

function runCommand(cmd, args, env) {
  const result = spawnSync(cmd, args, {
    cwd: projectDir,
    stdio: "inherit",
    env: { ...process.env, ...env },
    shell: process.platform === "win32",
  });
  return result.status;
}

function removeDirectory(dir) {
  if (!fs.existsSync(dir)) return;
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch (err) {
    console.error("[build] Failed to remove directory:", dir, err.message);
    throw err;
  }
}

function main() {
  originalPackageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
  if (fs.existsSync(packageLockPath)) {
    originalPackageLock = fs.readFileSync(packageLockPath, "utf8");
  }

  const pkg = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
  pkg.packageManager = "traversal@1.0.0";
  fs.writeFileSync(packageJsonPath, JSON.stringify(pkg, null, 2) + "\n", "utf8");
  modified = true;

  const cleanup = (code) => {
    restorePackageJson();
    process.exit(code ?? 1);
  };
  process.on("SIGINT", () => cleanup(1));
  process.on("SIGTERM", () => cleanup(1));
  process.on("uncaughtException", (err) => {
    console.error(err);
    cleanup(1);
  });

  const nodeOptions = process.env.NODE_OPTIONS || "--max-old-space-size=32000";

  // Clean up previous build output and the saved Electron binary.
  for (const dir of [path.join(projectDir, "release"), electronDistTarget]) {
    try {
      removeDirectory(dir);
    } catch {
      cleanup(1);
    }
  }

  // Build the renderer and main process code.
  for (const [cmd, args] of [
    ["npm", ["run", "build"]],
    ["npm", ["run", "ensure-songsee"]],
  ]) {
    const status = runCommand(cmd, args, { NODE_OPTIONS: nodeOptions });
    if (status !== 0) cleanup(status ?? 1);
  }

  // Save the Electron binary so electron-builder can still use it after we prune dev deps.
  try {
    fs.cpSync(electronDistSource, electronDistTarget, { recursive: true });
  } catch (err) {
    console.error("[build] Failed to copy electron dist:", err.message);
    cleanup(1);
  }

  // Shrink dependencies to only what the main process needs at runtime.
  // The renderer is bundled into dist/, so packages like react, tone, etc. are not needed.
  const shrinkPkg = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
  const ver = (name) => {
    try {
      return JSON.parse(fs.readFileSync(path.join(projectDir, "node_modules", name, "package.json"), "utf8")).version;
    } catch {
      return "*";
    }
  };
  shrinkPkg.dependencies = {
    "@huggingface/tokenizers": ver("@huggingface/tokenizers"),
    "adm-zip": shrinkPkg.dependencies?.["adm-zip"] || ver("adm-zip"),
    "electron-updater": shrinkPkg.dependencies?.["electron-updater"] || ver("electron-updater"),
    "onnxruntime-node": shrinkPkg.dependencies?.["onnxruntime-node"] || ver("onnxruntime-node"),
  };
  fs.writeFileSync(packageJsonPath, JSON.stringify(shrinkPkg, null, 2) + "\n", "utf8");

  // Remove dev dependencies from node_modules so the installer only ships production code.
  const pruneStatus = runCommand("npm", ["prune", "--production"]);
  if (pruneStatus !== 0) cleanup(pruneStatus ?? 1);

  // Re-install the packager so it can run against the production tree.
  const ebInstallStatus = runCommand("npm", ["install", "--no-save", "electron-builder@26.15.3"]);
  if (ebInstallStatus !== 0) cleanup(ebInstallStatus ?? 1);

  // Point the packager to the saved Electron distribution.
  const finalPkg = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
  if (!finalPkg.build) finalPkg.build = {};
  finalPkg.build.electronDist = "electron-dist";
  fs.writeFileSync(packageJsonPath, JSON.stringify(finalPkg, null, 2) + "\n", "utf8");

  // Package the app.
  const builderStatus = runCommand("npx", ["electron-builder", "--win"], { NODE_OPTIONS: nodeOptions });
  if (builderStatus !== 0) cleanup(builderStatus ?? 1);

  // Restore the workspace before exiting.
  restorePackageJson();
  try {
    removeDirectory(electronDistTarget);
  } catch (err) {
    console.error("[build] Warning: failed to clean up electron-dist:", err.message);
  }

  // Re-install dev dependencies so the workspace is usable for the next development cycle.
  const restoreStatus = runCommand("npm", ["install"]);
  if (restoreStatus !== 0) {
    console.error("[build] Failed to restore dev dependencies after packaging.");
    process.exit(restoreStatus ?? 1);
  }

  process.exit(0);
}

main();
