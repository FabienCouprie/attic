#!/usr/bin/env node
"use strict";

// Local build script for Attic (Windows NSIS installer, or Linux AppImage when run on Linux).
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

// IL N'Y A PLUS QU'UN INSTALLEUR, ET IL EST SANS MODÈLES. `--light` existait pour en construire
// une seconde version qui retirait `public/oonx` des ressources embarquées ; depuis le 2026-10-08
// c'est la seule, `public/oonx` ayant quitté `build.extraResources` pour de bon et les vingt
// modèles du manifeste ayant tous une adresse. Le drapeau n'avait donc plus rien à retirer, et son
// garde-fou — « rien à retirer » — aurait fait échouer toute build qui l'aurait employé.
//
// Il n'a d'ailleurs jamais servi en publication : le workflow ne passe pas par ce script, il
// réimplémente ses étapes en ligne. La seule trace d'un installeur allégé est un fichier local,
// jamais publié.

// La cible d'electron-builder et le dossier déplié qu'elle laisse, par plateforme de construction.
const CIBLES = {
  win32: { drapeaux: ["--win"], deplie: "release/win-unpacked" },
  linux: { drapeaux: ["--linux", "AppImage"], deplie: "release/linux-unpacked" },
};

// LE BINAIRE D'ELECTRON NE REVIENT PAS AVEC `npm install`. Le `npm prune --production` retire le
// paquet `electron` (dépendance de développement) ; le `npm install` final le remet, mais sans son
// dossier `dist/` : mesuré deux fois sous Linux, le paquet revenait sans binaire et la construction
// suivante échouait sur la copie de `node_modules/electron/dist`. Son propre script d'installation
// le retélécharge ; on l'appelle au départ et à l'arrivée quand le binaire manque.
function assurerBinaireElectron() {
  const chemin = path.join(projectDir, "node_modules", "electron", "path.txt");
  const binaire = fs.existsSync(chemin)
    ? path.join(electronDistSource, fs.readFileSync(chemin, "utf8").trim())
    : null;
  if (binaire && fs.existsSync(binaire)) return 0;
  console.log("[build] Binaire d'Electron absent : retéléchargement par node_modules/electron/install.js.");
  return runCommand("node", ["node_modules/electron/install.js"]);
}

function main() {
  if (!CIBLES[process.platform]) {
    console.error(`[build] Aucune cible prévue pour ${process.platform}.`);
    process.exit(1);
  }
  originalPackageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
  if (fs.existsSync(packageLockPath)) {
    originalPackageLock = fs.readFileSync(packageLockPath, "utf8");
  }

  const pkg = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
  pkg.packageManager = "traversal@1.0.0";

  // AUCUN MODÈLE N'EST EMBARQUÉ, et ce n'est plus une option. `public/oonx` a quitté
  // `build.extraResources` : ce qui reste — le SoundFont, le kit SFZ, les points de contrôle
  // Magenta, la collection de démonstration, Csound, les exemples — n'est pas de l'ONNX et suit
  // l'installeur. Les vingt modèles du manifeste se prennent depuis l'application.
  //
  // UN GARDE-FOU REMPLACE LE DRAPEAU : si `public/oonx` revenait dans la liste, l'installeur
  // reprendrait quatre giga-octets et demi sans que personne l'ait décidé.
  if (pkg.build.extraResources.some((r) => r.from === "public/oonx")) {
    console.error("[build] « public/oonx » est revenu dans extraResources : l'installeur ne porte"
      + " plus de modèles, ils se prennent depuis l'application.");
    process.exit(1);
  }

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
    // Les exécutables tiers viennent de la release « assets », épinglés et vérifiés par empreinte,
    // et non d'un clone de l'amont fait au moment du paquetage.
    ["npm", ["run", "outils"]],
  ]) {
    const status = runCommand(cmd, args, { NODE_OPTIONS: nodeOptions });
    if (status !== 0) cleanup(status ?? 1);
  }

  // Every build.extraResources source must exist and have content: electron-builder
  // only warns about a missing one and packages without it (see verify-bundled-resources.cjs).
  const sourcesStatus = runCommand("node", ["scripts/verify-bundled-resources.cjs"]);
  if (sourcesStatus !== 0) cleanup(sourcesStatus ?? 1);

  // Save the Electron binary so electron-builder can still use it after we prune dev deps.
  if (assurerBinaireElectron() !== 0) {
    console.error("[build] Impossible d'obtenir le binaire d'Electron.");
    cleanup(1);
  }
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

  // Package the app, for the platform this script runs on: electron-builder expands `${platform}`
  // in `build.files` to the BUILDING machine's platform, so each package is built on its own OS.
  const cible = CIBLES[process.platform];
  const builderStatus = runCommand("npx", ["electron-builder", ...cible.drapeaux], { NODE_OPTIONS: nodeOptions });
  if (builderStatus !== 0) cleanup(builderStatus ?? 1);

  // Check what actually landed in the packaged app.
  const packageStatus = runCommand("node", ["scripts/verify-bundled-resources.cjs", "--paquet", `${cible.deplie}/resources`]);
  if (packageStatus !== 0) cleanup(packageStatus ?? 1);

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
  if (assurerBinaireElectron() !== 0) {
    console.error("[build] Binaire d'Electron non restauré : lancer « node node_modules/electron/install.js ».");
    process.exit(1);
  }

  process.exit(0);
}

main();
