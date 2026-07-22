// electron/songsee.cjs — Appel du binaire Songsee (Go CLI) pour générer des
// visualisations spectrogrammes/images à partir d'un fichier audio.
const path = require("path");
const fs = require("fs");
const { execFile } = require("child_process");
const os = require("os");

const VIZS = ["spectrogram", "mel", "chroma", "hpss", "selfsim", "loudness", "tempogram", "mfcc", "flux"];
const PALETTES = ["classic", "magma", "inferno", "viridis", "gray", "claw"];
const FORMATS = ["jpeg", "png"];

function cheminBinaire() {
  const nom = process.platform === "win32" ? "songsee.exe" : "songsee";
  // 1. Binaire embarqué dans les ressources
  const embarque = path.join(process.resourcesPath, "bin", "songsee", nom);
  if (fs.existsSync(embarque)) return embarque;
  // 2. Fallback : PATH
  return nom;
}

function dossierTemp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "attic-songsee-"));
}

function nettoyer(chemin) {
  try { if (fs.existsSync(chemin)) fs.rmSync(chemin, { recursive: true, force: true }); } catch {}
}

function argsSongsee(opts) {
  const a = [];
  if (opts.viz && opts.viz !== "all") {
    const liste = Array.isArray(opts.viz) ? opts.viz.join(",") : String(opts.viz);
    a.push("--viz", liste);
  }
  if (opts.palette) a.push("--style", opts.palette);
  if (opts.width) a.push("--width", String(opts.width));
  if (opts.height) a.push("--height", String(opts.height));
  if (opts.format) a.push("--format", opts.format);
  if (typeof opts.start === "number") a.push("--start", String(opts.start));
  if (typeof opts.duration === "number") a.push("--duration", String(opts.duration));
  return a;
}

async function genererSongsee(cheminEntree, opts = {}) {
  const viz = opts.viz || "all";
  const palette = opts.palette || "classic";
  const width = opts.width || 1920;
  const height = opts.height || 1080;
  const format = opts.format || "jpeg";
  const start = opts.start;
  const duration = opts.duration;

  const binaire = cheminBinaire();
  const tmp = dossierTemp();
  const baseNom = `songsee-${Date.now()}`;
  const ext = format === "png" ? "png" : "jpg";
  const cheminSortie = path.join(tmp, `${baseNom}.${ext}`);

  const args = [cheminEntree, "-o", cheminSortie, ...argsSongsee({ viz, palette, width, height, format, start, duration })];

  return new Promise((resolve, reject) => {
    const child = execFile(binaire, args, { timeout: 120000 }, (err) => {
      if (err) {
        nettoyer(tmp);
        return reject(new Error(`Songsee a échoué : ${err.message}`));
      }
      try {
        if (!fs.existsSync(cheminSortie)) {
          nettoyer(tmp);
          return reject(new Error("Songsee n'a pas produit de fichier image."));
        }
        const donnees = fs.readFileSync(cheminSortie);
        const mime = format === "png" ? "image/png" : "image/jpeg";
        nettoyer(tmp);
        resolve({ donnees, mime, format, width, height, viz: String(viz) });
      } catch (e) {
        nettoyer(tmp);
        reject(e);
      }
    });
    child.stderr?.on("data", (d) => console.error("[songsee]", d.toString()));
  });
}

module.exports = { genererSongsee, VIZS, PALETTES, FORMATS };
