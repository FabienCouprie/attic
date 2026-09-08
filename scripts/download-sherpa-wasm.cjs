// scripts/download-sherpa-wasm.cjs — Récupère les fichiers WASM de Sherpa-ONNX
// dans public/sherpa-onnx-wasm/. Lancé par le postinstall.
//
// POURQUOI CE SCRIPT PLUTÔT QU'UNE DÉPENDANCE npm
//
// Ces cinq fichiers venaient de `@siteed/sherpa-onnx.rn`, un paquet de 864 Mo
// dont le projet n'utilisait que ces 12,8 Mo — sans jamais importer une ligne
// de son JavaScript. Le reste (React Native, Metro, Expo) n'est jamais chargé :
// Attic est une application Electron + Vite, pas React Native. Ce code mort
// portait néanmoins quatre alertes de sécurité qu'aucune version atteignable ne
// corrigeait, et le paquet exécutait un postinstall à lui.
//
// Il n'existe pas de remplaçant : le paquet npm officiel `sherpa-onnx` ne
// publie que le build Node, les releases GitHub de k2-fsa ne publient aucun
// WASM, et ces fichiers-ci sont un build « combined » propre à @siteed dont le
// worker utilise l'API (`new OfflineRecognizer(config, Module)`). Ils sont donc
// figés à la version 1.3.1 du paquet et hébergés sur la release `assets`, à
// côté des modèles ONNX et de la SoundFont qui suivent déjà ce chemin.
//
// L'EMPREINTE N'EST PAS DÉCORATIVE : on télécharge du WebAssembly qui sera
// exécuté par l'application. Un fichier dont le SHA-256 ne correspond pas est
// refusé, et le script échoue au lieu d'installer ce qu'il a reçu.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const DEST_DIR = path.join(__dirname, "..", "public", "sherpa-onnx-wasm");
const BASE_URL = "https://github.com/FabienCouprie/attic/releases/download/assets";

// SHA-256 relevés sur les fichiers issus de @siteed/sherpa-onnx.rn@1.3.1,
// c'est-à-dire exactement ceux qui tournaient avant le retrait du paquet.
const FICHIERS = {
  "sherpa-onnx-asr.js": "a83eb0f88258864453e3c910fb1954f8f78c2cca071ebac06329fcfa25c8b88d",
  "sherpa-onnx-core.js": "7913d88d173bc2140d52085cc9d62bf3c8a9b95e53842704329007fa0e37b879",
  "sherpa-onnx-vad.js": "a08e53113000f1c68f0fe101cb26f253f4eabaa090e5754fe40e5ffcae861728",
  "sherpa-onnx-wasm-combined.js": "c7778951c5ef025d240ecf36d8d642ee2aa089353d4e46187767044547313e57",
  "sherpa-onnx-wasm-combined.wasm": "cc726f48a62ceba05541c195b7155482da7232d9300405fb5a4a7ddce6110705",
};

function empreinte(chemin) {
  return crypto.createHash("sha256").update(fs.readFileSync(chemin)).digest("hex");
}

/** Le fichier est-il déjà là ET conforme ? */
function dejaBon(nom) {
  const chemin = path.join(DEST_DIR, nom);
  if (!fs.existsSync(chemin)) return false;
  // On revérifie l'empreinte plutôt que la seule présence : un téléchargement
  // interrompu laisse un fichier de la bonne taille apparente mais tronqué,
  // et le worker échouerait alors sans rien dire d'exploitable.
  return empreinte(chemin) === FICHIERS[nom];
}

async function telecharger(nom) {
  const url = `${BASE_URL}/${nom}`;
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`HTTP ${res.status} sur ${url}`);
  const octets = Buffer.from(await res.arrayBuffer());

  const obtenu = crypto.createHash("sha256").update(octets).digest("hex");
  if (obtenu !== FICHIERS[nom]) {
    throw new Error(
      `Empreinte incorrecte pour ${nom}\n  attendue : ${FICHIERS[nom]}\n  obtenue  : ${obtenu}\n` +
      "Le fichier n'a PAS été écrit.",
    );
  }

  fs.writeFileSync(path.join(DEST_DIR, nom), octets);
  const mo = (octets.length / 1048576).toFixed(1);
  console.log(`[sherpa-wasm] ${nom} — ${mo} Mo, empreinte vérifiée`);
}

async function main() {
  fs.mkdirSync(DEST_DIR, { recursive: true });

  const manquants = Object.keys(FICHIERS).filter((n) => !dejaBon(n));
  if (manquants.length === 0) {
    console.log("[sherpa-wasm] les 5 fichiers sont présents et conformes.");
    return;
  }

  console.log(`[sherpa-wasm] ${manquants.length} fichier(s) à récupérer depuis la release « assets »…`);
  for (const nom of manquants) await telecharger(nom);
  console.log("[sherpa-wasm] terminé.");
}

// Deux régimes, pour une raison précise.
//
// Depuis le postinstall (`--tolerant`), un échec ne doit pas faire échouer tout
// `npm install` : seul le nœud Sherpa ASR en dépend, et on doit pouvoir
// travailler sur le reste de l'application hors ligne.
//
// Partout ailleurs — et notamment dans le workflow de publication, qui appelle
// ce script explicitement après `npm ci` — l'échec est BLOQUANT. Sans cela on
// livrerait un installeur dont le nœud Sherpa est muet, sans que rien ne le
// signale : c'est exactement la classe de défaut qui a coûté deux releases
// incomplètes (v3.1.4 et v3.1.5), où un job vert masquait un asset manquant.
const tolerant = process.argv.includes("--tolerant");

main().catch((e) => {
  console.error(`[sherpa-wasm] ÉCHEC : ${e.message}`);
  console.error("[sherpa-wasm] Le nœud « Sherpa ASR » ne fonctionnera pas.");
  if (tolerant) {
    console.error("[sherpa-wasm] Installation poursuivie. Relancez : npm run download:sherpa-wasm");
    return;
  }
  process.exit(1);
});
