// scripts/ensure-songsee.cjs — Vérifie que le binaire Songsee est présent,
// et le compile depuis les sources si nécessaire. Utilisé avant le packaging
// Electron pour garantir que l'exécutable est embarqué.
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const os = require("os");

const DEST_DIR = path.join(__dirname, "..", "bin", "songsee");
const binaryName = process.platform === "win32" ? "songsee.exe" : "songsee";
const binaryPath = path.join(DEST_DIR, binaryName);

function goDisponible() {
  try {
    execSync("go version", { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

if (fs.existsSync(binaryPath)) {
  console.log(`[ensure-songsee] Binaire trouvé : ${binaryPath}`);
  process.exit(0);
}

if (!goDisponible()) {
  console.error("[ensure-songsee] ERREUR : le binaire Songsee est absent et Go n'est pas installé.");
  console.error("Installez Go depuis https://go.dev/dl/ puis relancez le build.");
  console.error("Alternative : exécutez 'npm run download:songsee' avant le packaging.");
  process.exit(1);
}

const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "attic-songsee-build-"));

try {
  fs.mkdirSync(DEST_DIR, { recursive: true });
  console.log("[ensure-songsee] Binaire absent, clonage et compilation de Songsee...");
  execSync("git clone https://github.com/openclaw/songsee.git", { cwd: TMP_DIR, stdio: "inherit" });
  const cmdDir = path.join(TMP_DIR, "songsee", "cmd", "songsee");
  execSync(`go build -o "${binaryPath}" .`, { cwd: cmdDir, stdio: "inherit" });
  if (process.platform !== "win32") {
    execSync(`chmod +x "${binaryPath}"`, { stdio: "inherit" });
  }
  console.log(`[ensure-songsee] Binaire compilé : ${binaryPath}`);
} catch (e) {
  console.error("[ensure-songsee] ERREUR lors de la compilation de Songsee :", e?.message || e);
  process.exit(1);
} finally {
  try { fs.rmSync(TMP_DIR, { recursive: true, force: true }); } catch {}
}
