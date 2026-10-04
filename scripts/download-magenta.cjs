// scripts/download-magenta.cjs — Rapatrie les points de controle @magenta/music dans public/magenta/.
// Lance par le postinstall, en regime tolerant.
//
// POURQUOI CE SCRIPT EXISTE, et c'est une exception qu'on referme.
//
// Les sept noeuds Magenta chargeaient leurs modeles depuis storage.googleapis.com, a l'execution.
// Trois consequences, toutes verifiees : une installation SANS RESEAU ne pouvait pas les employer,
// la ou tous les autres noeuds a modele fonctionnent hors ligne ; rien ne verifiait l'integrite de
// ce qui arrivait, ces modeles etant absents de `modeles-manifest.json` ; et ils venaient d'un
// tiers, contre la regle du depot, qui veut que les modeles viennent de la release `assets`.
//
// CE QUI N'ETAIT PAS EN CAUSE : le cout reseau. Mesure sur trois lancements avec le meme profil,
// le cache disque de Chromium servait les six fichiers des le second — 13 934 825 octets au
// premier, zero ensuite. Le probleme n'etait pas la bande passante, c'etait le hors-ligne,
// l'integrite et la dependance a un tiers.
//
// CINQ POINTS DE CONTROLE POUR SEPT NOEUDS : `continuation` et `melody` partagent melody_rnn,
// `drums` et `drumsSeed` partagent drums_2bar_nade_9_q2.
//
// L'EMPREINTE N'EST PAS DECORATIVE : on telecharge des poids qui seront executes. Un fichier dont
// le SHA-256 ne correspond pas est refuse, et le script echoue au lieu d'installer ce qu'il a recu
// — ce qui couvre aussi le telechargement interrompu, qui laisserait un modele tronque et un noeud
// muet. Les empreintes ci-dessous ont ete relevees le 2026-10-04.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const DEST = path.join(__dirname, "..", "public", "magenta");

const BASE = "https://storage.googleapis.com/magentadata/js/checkpoints";

/** Ou prendre chaque point de controle, sous `BASE`. */
const SOURCES = {
  "drums_2bar_nade_9_q2": "music_vae/drums_2bar_nade_9_q2",
  "melody_rnn": "music_rnn/melody_rnn",
  "mel_2bar_small": "music_vae/mel_2bar_small",
  "groovae_2bar_humanize": "music_vae/groovae_2bar_humanize",
  "piano_genie": "piano_genie/model/epiano/stp_iq_auto_contour_dt_166006",
};

/** Chaque fichier attendu, et son empreinte. */
const EMPREINTES = {
  "drums_2bar_nade_9_q2": {
    "config.json": "51117f0b57474b2cf296ff080b9b21d275cfaf276cae7f45ee923a38ce2541e8",
    "group1-shard1of7": "30c7ed452167895b05f6b22dc6bc533232a4cf5c924d3b0187fdbae00b6f414e",
    "group1-shard2of7": "4884db73522a62f7d32a077dda481a1feec267156dfe4b2be0db984cafbd5d62",
    "group1-shard3of7": "9055d2a2bbcdb8018c3ed334f599d113e70a903cd8b21a192802022edbbf9211",
    "group1-shard4of7": "96da27ce67aab0768f9670193bbed8b3256a16922008da44bbdd713b8edee443",
    "group1-shard5of7": "44de3b14143b2fb08d775b844c5c557f558abe91d4926079051f50c69e6343f2",
    "group1-shard6of7": "1e510d92217cabaeeea98f380d790f56a1a197eef1b63b308e3b9bec8724a3f7",
    "group1-shard7of7": "e6f37735bb00a12aa9cdf77d8782e4573f88a45f068c46fd245bfa9eb041e90e",
    "weights_manifest.json": "1ee9058918a4364d2c4c32a0a7cbbf9cff2a0df0bbaebaafaee025f05254306b",
  },
  "groovae_2bar_humanize": {
    "config.json": "64096919d9452afc6404c441904f95c4b91f4da7e514f0725e858586fca94bc5",
    "group1-shard1of4": "1612d3ed51d794229a33d5cc0cd563cf6aedb600d47d68c458147e215d499e3d",
    "group1-shard2of4": "080df5f4cef89f2b17147f744e8e2c75b61c71a464094634ac87a20933696f2b",
    "group1-shard3of4": "f323d2dec213af7693cd16f94bfe16e5028b6f9a24fc42db2b97baaedcae846f",
    "group1-shard4of4": "b99d2e4ce5725bcb895a3699b25e4326a59ebf0a85e09cae3b78e3a8779463df",
    "weights_manifest.json": "c124d59c9c8338c7722998a8f15301d82ffcce2aeaab3470f983f8f35152674a",
  },
  "melody_rnn": {
    "config.json": "5d8748f85eca7ae3d46f3be7b85ce7c0a016af84fa117cfeee08bf6391fbf46c",
    "group1-shard1of4": "83e7cc6a19866e1961b09d827a527d6558683e69283a1968112a8be991451155",
    "group1-shard2of4": "8be7de00494d31d04e6e00d6bb4233b31740f0d2c04de3205200d9a068ffb232",
    "group1-shard3of4": "c156ae77e9cc62fa703a0f47d89a19c16493c79b24e596a493bc437f78b06802",
    "group1-shard4of4": "63d71902000473d9fe06cd35f18e4126c0c08666bb2a6d8669d46f298e005911",
    "weights_manifest.json": "9c802c461ffdaf188ad40724a0d5dd9934fb7bf7654dd69be2b8891d27767e8b",
  },
  "mel_2bar_small": {
    "config.json": "9d61c1182d4fd99726762bf1bb137ea44fbe224835063818355e5c69180aaf50",
    "group1-shard1of5": "2ff2d2da62470f9c9e0c8069e5705f4f70400962a771a8d613b0581f72a5985b",
    "group1-shard2of5": "b692831ad0b72919b36dad17e0740e535c47a3c7c49c6310b0708bf091447d8b",
    "group1-shard3of5": "c8cc4377fe87301c8246d7d931b408e66529a18d61781782ce9513ad3ee05051",
    "group1-shard4of5": "cb5a830db4dc46ee32a40cbf44cdf87faad99b345c0bb18b29b57af038db0556",
    "group1-shard5of5": "7f32a9ac0ec69bc980defa41073ac4c2e311cc99d37d98e75d94535dff7cfc59",
    "weights_manifest.json": "8520ed17fd2406215ac558c34871d184cf651ecffcfc03dff0eb381c3124cb1a",
  },
  "piano_genie": {
    "group1-shard1of1": "516c74178d85ce6eea34c4a9bb7a5b682ff8686689e4b88f718bd4a4afaf8039",
    "weights_manifest.json": "a018e49e061183c33c0289a0525b452194b5e99b67c88a22196d304c2b3ef7d7",
  },
};

const sha256 = (octets) => crypto.createHash("sha256").update(octets).digest("hex");

/** Le fichier est-il deja la ET conforme ? */
function dejaBon(modele, relatif) {
  const chemin = path.join(DEST, modele, relatif);
  if (!fs.existsSync(chemin)) return false;
  return sha256(fs.readFileSync(chemin)) === EMPREINTES[modele][relatif];
}

async function telecharger(modele, relatif) {
  const url = `${BASE}/${SOURCES[modele]}/${relatif}`;
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`HTTP ${res.status} sur ${url}`);
  const octets = Buffer.from(await res.arrayBuffer());

  const obtenu = sha256(octets);
  const attendue = EMPREINTES[modele][relatif];
  if (obtenu !== attendue) {
    throw new Error(
      `Empreinte incorrecte pour ${modele}/${relatif}\n  attendue : ${attendue}\n  obtenue  : ${obtenu}\n` +
      "Le fichier n'a PAS ete ecrit.",
    );
  }

  const dest = path.join(DEST, modele, relatif);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, octets);
  return octets.length;
}

async function main() {
  let pris = 0;
  let octets = 0;
  for (const modele of Object.keys(EMPREINTES)) {
    const manquants = Object.keys(EMPREINTES[modele]).filter((r) => !dejaBon(modele, r));
    if (manquants.length === 0) continue;
    console.log(`[magenta] ${modele} : ${manquants.length} fichier(s) a prendre`);
    for (const r of manquants) octets += await telecharger(modele, r);
    pris += manquants.length;
  }
  if (pris === 0) console.log("[magenta] les cinq points de controle sont presents et conformes.");
  else console.log(`[magenta] ${pris} fichier(s), ${(octets / 1e6).toFixed(2)} Mo, empreintes verifiees.`);
}

// Meme decoupage que download-gtcrn.cjs, pour la meme raison : depuis le postinstall
// (`--tolerant`) un echec ne doit pas faire echouer `npm install`. Partout ailleurs l'echec est
// BLOQUANT, pour ne pas livrer un installeur aux sept noeuds muets avec un job vert pour seule
// indication.
const tolerant = process.argv.includes("--tolerant");

main().catch((e) => {
  console.error(`[magenta] ECHEC : ${e.message}`);
  console.error("[magenta] Les sept noeuds Magenta ne fonctionneront pas.");
  if (tolerant) {
    console.error("[magenta] Installation poursuivie. Relancez : npm run download:magenta");
    return;
  }
  process.exit(1);
});
