#!/usr/bin/env node
"use strict";

// Workaround for electron-builder 26.x memory exhaustion with the npm dependency collector.
// Temporarily sets package.json "packageManager" to "traversal" so electron-builder uses
// manual node_modules traversal, then restores the original value.

const { spawnSync, execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const projectDir = path.resolve(__dirname, "..");
const packageJsonPath = path.join(projectDir, "package.json");

let originalPackageManager = null;
let modified = false;

function restorePackageJson() {
  if (!modified) return;
  try {
    const pkg = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
    if (originalPackageManager === undefined) {
      delete pkg.packageManager;
    } else {
      pkg.packageManager = originalPackageManager;
    }
    fs.writeFileSync(packageJsonPath, JSON.stringify(pkg, null, 2) + "\n", "utf8");
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

function main() {
  const pkg = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
  originalPackageManager = pkg.packageManager;
  pkg.packageManager = "traversal@1.0.0";
  fs.writeFileSync(packageJsonPath, JSON.stringify(pkg, null, 2) + "\n", "utf8");
  modified = true;

  const cleanup = () => {
    restorePackageJson();
    process.exit(1);
  };
  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);
  process.on("uncaughtException", (err) => {
    console.error(err);
    cleanup();
  });

  const nodeOptions = process.env.NODE_OPTIONS || "--max-old-space-size=32000";

  // Clean up previous build output to avoid electron-builder scanning huge output dirs.
  // On Windows, `fs.rmSync` can fail on read-only files produced by electron-builder
  // (e.g. from a running packaged app), so we strip read-only attributes first.
  const releaseDir = path.join(projectDir, "release");
  if (fs.existsSync(releaseDir)) {
    try {
      execSync(`cmd /c attrib -r /s /d "${releaseDir}\\*.*"`, { stdio: "ignore" });
      execSync(`cmd /c rmdir /s /q "${releaseDir}"`, { stdio: "ignore" });
    } catch (err) {
      console.error("[build] Failed to remove release directory:", err.message);
      restorePackageJson();
      process.exit(1);
    }
  }

  const steps = [
    ["npm", ["run", "build"]],
    ["npm", ["run", "ensure-songsee"]],
    ["npx", ["electron-builder", "--win", "-c.electronDist=node_modules/electron/dist"]],
  ];

  for (const [cmd, args] of steps) {
    const status = runCommand(cmd, args, { NODE_OPTIONS: nodeOptions });
    if (status !== 0) {
      restorePackageJson();
      process.exit(status ?? 1);
    }
  }

  restorePackageJson();
  process.exit(0);
}

main();
