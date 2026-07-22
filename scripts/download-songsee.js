// scripts/download-songsee.js — Télécharge le binaire Songsee pour la plateforme courante.
// Usage : node scripts/download-songsee.js
// Place le binaire dans bin/songsee/ pour qu'il soit embarqué par electron-builder.
const fs = require("fs");
const path = require("path");
const https = require("https");
const { execSync } = require("child_process");

const OWNER = "openclaw";
const REPO = "songsee";
const DEST_DIR = path.join(__dirname, "..", "bin", "songsee");

function platformAsset() {
  const platform = process.platform;
  const arch = process.arch;
  if (platform === "win32") return `songsee_Windows_x86_64.zip`;
  if (platform === "darwin" && arch === "arm64") return `songsee_Darwin_arm64.tar.gz`;
  if (platform === "darwin") return `songsee_Darwin_x86_64.tar.gz`;
  if (platform === "linux" && arch === "arm64") return `songsee_Linux_arm64.tar.gz`;
  return `songsee_Linux_x86_64.tar.gz`;
}

function extract(archivePath, destDir) {
  if (archivePath.endsWith(".zip")) {
    execSync(`powershell -command "Expand-Archive -Path '${archivePath}' -DestinationPath '${destDir}' -Force"`, { stdio: "inherit" });
  } else {
    execSync(`tar -xzf "${archivePath}" -C "${destDir}"`, { stdio: "inherit" });
  }
}

async function download(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, { headers: { "User-Agent": "attic-songsee-downloader" } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return download(res.headers.location, dest).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      res.pipe(file);
      file.on("finish", () => { file.close(); resolve(); });
    }).on("error", reject);
  });
}

async function main() {
  const assetName = platformAsset();
  const apiUrl = `https://api.github.com/repos/${OWNER}/${REPO}/releases/latest`;
  console.log(`Recherche de ${assetName}...`);

  const release = await new Promise((resolve, reject) => {
    https.get(apiUrl, { headers: { "User-Agent": "attic-songsee-downloader" } }, (res) => {
      let data = "";
      res.on("data", (d) => data += d);
      res.on("end", () => resolve(JSON.parse(data)));
    }).on("error", reject);
  });

  const asset = release.assets.find((a) => a.name === assetName);
  if (!asset) throw new Error(`Asset ${assetName} introuvable dans la release ${release.tag_name}`);

  fs.mkdirSync(DEST_DIR, { recursive: true });
  const archivePath = path.join(DEST_DIR, assetName);
  console.log(`Téléchargement de ${asset.browser_download_url}...`);
  await download(asset.browser_download_url, archivePath);

  console.log("Extraction...");
  extract(archivePath, DEST_DIR);
  fs.unlinkSync(archivePath);

  const binaryName = process.platform === "win32" ? "songsee.exe" : "songsee";
  const binaryPath = path.join(DEST_DIR, binaryName);
  if (!fs.existsSync(binaryPath)) {
    // L'archive peut contenir un sous-répertoire.
    const files = fs.readdirSync(DEST_DIR);
    const sub = files.find((f) => fs.statSync(path.join(DEST_DIR, f)).isDirectory());
    if (sub) {
      const nested = path.join(DEST_DIR, sub, binaryName);
      if (fs.existsSync(nested)) {
        fs.renameSync(nested, binaryPath);
      }
    }
  }

  if (process.platform !== "win32") {
    execSync(`chmod +x "${binaryPath}"`, { stdio: "inherit" });
  }

  console.log(`Songsee installé : ${binaryPath}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
