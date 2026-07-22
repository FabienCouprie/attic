// scripts/download-songsee.cjs — Compile le binaire Songsee depuis les sources Go.
// Usage : node scripts/download-songsee.cjs
// Nécessite Go installé sur la machine. Place le binaire dans bin/songsee/.
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const os = require("os");

const DEST_DIR = path.join(__dirname, "..", "bin", "songsee");
const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "attic-songsee-build-"));
const binaryName = process.platform === "win32" ? "songsee.exe" : "songsee";

function goDisponible() {
  try {
    execSync("go version", { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

function main() {
  if (!goDisponible()) {
    console.error("Go n'est pas installé ou n'est pas dans le PATH.");
    console.error("Installez Go depuis https://go.dev/dl/ puis relancez ce script.");
    console.error("Alternative : installez Songsee via 'brew install steipete/tap/songsee' (macOS/Linux).");
    process.exit(1);
  }

  fs.mkdirSync(DEST_DIR, { recursive: true });

  console.log("Clonage de https://github.com/openclaw/songsee.git...");
  execSync("git clone https://github.com/openclaw/songsee.git", { cwd: TMP_DIR, stdio: "inherit" });

  const repoDir = path.join(TMP_DIR, "songsee");
  const cmdDir = path.join(repoDir, "cmd", "songsee");

  console.log("Compilation de Songsee...");
  const out = path.join(DEST_DIR, binaryName);
  execSync(`go build -o "${out}" .`, { cwd: cmdDir, stdio: "inherit" });

  if (process.platform !== "win32") {
    execSync(`chmod +x "${out}"`, { stdio: "inherit" });
  }

  // Nettoyage
  try { fs.rmSync(TMP_DIR, { recursive: true, force: true }); } catch {}

  console.log(`Songsee installé : ${out}`);
  console.log("Vérifiez : \"" + out + "\" --version");
}

main();
