// scripts/download-sa3-sfx.cjs — Telecharge le paquet ONNX officiel de Stable Audio 3 SFX.
//
// POURQUOI UN SECOND PAQUET, ET NON UN REMPLACEMENT. `stable-audio-3-small-music` reste le moteur
// du noeud musical ; celui-ci est la variante bruitage de la meme famille, publiee par Stability
// avec ses graphes ONNX officiels. Voir MODELES-BRUITAGE.md pour ce qui a conduit la.
//
// LES GRAPHES NE SONT PAS CEUX DE L'AUTRE PAQUET. L'export communautaire employe jusqu'ici prenait
// `cross_attn_cond` et `global_embed` ; celui de Stability prend `t5_hidden` et `seconds_total`, et
// assemble son conditionnement lui-meme. Le pipeline reconnait l'un ou l'autre a ses noms d'entree.
//
// Usage : node scripts/download-sa3-sfx.cjs
const fs = require("fs");
const path = require("path");

const CIBLE = path.join(__dirname, "..", "public", "oonx", "stable-audio-3-small-sfx");
const HF = "https://huggingface.co/stabilityai/stable-audio-3-optimized/resolve/main";
const GH = "https://raw.githubusercontent.com/Stability-AI/stable-audio-3/main";

/** Ce qu'il faut, et rien de plus. L'encodeur audio ne sert qu'a la continuation, absente ici. */
const FICHIERS = [
  { url: `${HF}/onnx/sa3-sm-sfx/dit_fp16.onnx`, dest: "onnx/dit_fp16.onnx" },
  { url: `${HF}/onnx/same-s/dec_bf16.onnx`, dest: "onnx/decoder_bf16.onnx" },
  { url: `${HF}/onnx/t5gemma/encoder.onnx`, dest: "onnx/text_encoder.onnx" },
  { url: `${GH}/optimized/tensorRT/scripts/tokenizer.json`, dest: "tokenizer/tokenizer.json" },
  { url: `${HF}/LICENSE.md`, dest: "LICENSE.md" },
  { url: `${HF}/LICENSE_GEMMA.md`, dest: "LICENSE_GEMMA.md" },
  { url: `${HF}/NOTICE`, dest: "NOTICE" },
];

const mo = (n) => `${(n / 2 ** 20).toFixed(1)} Mo`;

async function telecharger(url, dest) {
  const complet = path.join(CIBLE, dest);
  fs.mkdirSync(path.dirname(complet), { recursive: true });
  if (fs.existsSync(complet) && fs.statSync(complet).size > 0) {
    console.log(`  deja la : ${dest} (${mo(fs.statSync(complet).size)})`);
    return;
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} sur ${url}`);
  const total = Number(res.headers.get("content-length") ?? 0);
  const reader = res.body.getReader();
  const morceaux = [];
  let recu = 0, dernier = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    morceaux.push(value);
    recu += value.length;
    if (recu - dernier > 64 * 2 ** 20) {
      dernier = recu;
      process.stdout.write(`\r  ${dest} : ${mo(recu)}${total ? ` / ${mo(total)}` : ""}   `);
    }
  }
  fs.writeFileSync(complet, Buffer.concat(morceaux));
  process.stdout.write(`\r  ${dest} : ${mo(recu)} ecrit                    \n`);
}

(async () => {
  console.log(`Paquet SFX vers ${CIBLE}`);
  for (const f of FICHIERS) await telecharger(f.url, f.dest);
  const total = FICHIERS.reduce((s, f) => s + fs.statSync(path.join(CIBLE, f.dest)).size, 0);
  console.log(`\nTermine : ${mo(total)} au total.`);
})().catch((e) => { console.error(`Echec : ${e.message}`); process.exit(1); });
