// scripts/download-gtcrn.cjs — Récupère le modèle GTCRN dans public/oonx/.
// Lancé par le postinstall, en régime tolérant.
//
// GTCRN : Xiaobin-Rong/gtcrn, licence MIT, © 2024 Rong Xiaobin. Noté dans
// THIRD_PARTY.md. Le modèle pèse 344 ko, et c'est cette légèreté qui a décidé du
// choix face à DeepFilterNet : celui-ci est exporté en TROIS ONNX à états, qui
// demanderaient d'implémenter en plus son banc de filtres ERB et son étage de
// deep filtering.
//
// POURQUOI L'AMONT DIRECTEMENT, ET NON LA RELEASE « assets » DU PROJET
//
// Les autres modèles sont hébergés sur la release `assets` d'Attic, pour ne pas
// dépendre de l'arborescence d'un dépôt tiers. Ici le fichier est pris chez
// l'auteur : c'est la seule source dont la licence soit établie. Les miroirs ONNX
// de Hugging Face ne déclarent AUCUNE licence, et embarquer un poids sans licence
// dans un installeur n'est pas une option. L'empreinte ci-dessous rend cette
// dépendance sûre : si l'amont réorganise ou remplace le fichier, le script
// refuse ce qu'il reçoit plutôt que d'installer autre chose.
//
// L'EMPREINTE N'EST PAS DÉCORATIVE : on télécharge un modèle qui sera exécuté.
// Un fichier dont le SHA-256 ne correspond pas est refusé, et le script échoue
// au lieu d'installer ce qu'il a reçu — ce qui couvre aussi le téléchargement
// interrompu, qui laisserait un fichier tronqué et un nœud muet.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const DEST_DIR = path.join(__dirname, "..", "public", "oonx");

// `stream/onnx_models/` du dépôt amont. Le dossier s'appelle « stream » parce que
// l'export est image par image, avec trois caches portés d'une trame à l'autre :
// c'est la seule forme publiée, et audio/gtcrn.ts s'en accommode.
const BASE_URL = "https://raw.githubusercontent.com/Xiaobin-Rong/gtcrn/main/stream/onnx_models";

// Deux variantes sont publiées, `gtcrn.onnx` et `gtcrn_simple.onnx` (523 ko).
// Mesurées côte à côte sur le couple bruité/débruité de référence du dépôt : même
// sortie au bit près et même vitesse. On prend donc la plus petite.
const FICHIERS = {
  "gtcrn.onnx": "f648b02f2d7ff96ebcb0eec2219688a08ed12fe7e3d50f248605a90eba8cad17",
};

function empreinte(chemin) {
  return crypto.createHash("sha256").update(fs.readFileSync(chemin)).digest("hex");
}

/** Le fichier est-il déjà là ET conforme ? */
function dejaBon(nom) {
  const chemin = path.join(DEST_DIR, nom);
  if (!fs.existsSync(chemin)) return false;
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
  const ko = (octets.length / 1024).toFixed(0);
  console.log(`[gtcrn] ${nom} — ${ko} ko, empreinte vérifiée`);
}

async function main() {
  fs.mkdirSync(DEST_DIR, { recursive: true });
  const manquants = Object.keys(FICHIERS).filter((n) => !dejaBon(n));
  if (manquants.length === 0) {
    console.log("[gtcrn] modèle présent et conforme.");
    return;
  }
  console.log("[gtcrn] récupération du modèle depuis le dépôt amont…");
  for (const nom of manquants) await telecharger(nom);
  console.log("[gtcrn] terminé.");
}

// Même découpage que download-sherpa-wasm.cjs, pour la même raison : depuis le
// postinstall (`--tolerant`) un échec ne doit pas faire échouer `npm install` —
// seul le nœud de débruitage en dépend, et on doit pouvoir travailler hors ligne
// sur le reste. Partout ailleurs l'échec est BLOQUANT, pour ne pas livrer un
// installeur au nœud muet avec un job vert pour seule indication.
const tolerant = process.argv.includes("--tolerant");

main().catch((e) => {
  console.error(`[gtcrn] ÉCHEC : ${e.message}`);
  console.error("[gtcrn] Le nœud « Débruitage IA » ne fonctionnera pas.");
  if (tolerant) {
    console.error("[gtcrn] Installation poursuivie. Relancez : npm run download:gtcrn");
    return;
  }
  process.exit(1);
});
