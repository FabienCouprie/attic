// plugins/respiration-noeuds.test.ts — Est-ce qu'un nœud rend la main pendant qu'il calcule ?
//
// CE QUE CE TEST MESURE, ET POURQUOI AUCUN AUTRE NE LE VOIT. Les nœuds calculent dans le fil de
// l'interface. Un nœud qui ne rend jamais la main empêche toute image d'être rendue : aucun bouton
// ne répond, « Arrêter » ne s'atteint pas, et l'on ne voit même pas quel nœud travaille. Un test qui
// vérifie le RÉSULTAT d'un calcul ne peut pas apercevoir cela, et c'est ainsi que le gel du
// 2026-09-27 a survécu à une journée entière de relevés : j'attendais la fin, puis je mesurais le
// son. Je n'ai jamais mesuré si la fenêtre répondait.
//
// L'INSTRUMENT. Un `setInterval` court pendant le calcul. S'il ne tire pas, c'est que le fil est
// tenu : l'écart entre deux tirs est la durée du blocage. C'est exactement ce que fait un détecteur
// de gel dans un navigateur, et cela marche dans Node pour la même raison — une boucle synchrone
// affame la file des minuteurs.
//
// CE QUI EST HORS DE PORTÉE, décidé avec Fabien : les nœuds à modèle ONNX. Leur calcul part en IPC
// vers le processus principal, donc leur `await` rend vraiment la main et le fil du rendu n'est pas
// tenu. Les mesurer ici ne dirait rien de leur code, seulement du temps qu'ils passent à attendre
// une réponse. TensorFlow.js sort aussi de la question pour son entraînement : `model.fit` sans
// `yieldEvery` prend le défaut « auto », qui cède au fil toutes les 125 ms environ.
//
// LE SEUIL EST GÉNÉREUX EXPRÈS. La machine qui fait tourner cette suite n'est pas choisie, et un
// échec de délai qui ne dit rien du code est la pire sorte d'échec : il fait douter d'un résultat
// juste. Ce qu'on attrape ici, c'est un nœud qui ne respire PAS DU TOUT, et dont le pire écart vaut
// alors sa durée entière. Un nœud qui respire toutes les cinquante millisecondes passe de très loin.
import "node-web-audio-api/polyfill.js";
import { describe, expect, it } from "vitest";
import { registre } from "../audio/adaptateur";
import { defautCanoniqueChoix, valeurCanoniqueChoix } from "../i18n";

const SR = 44100;

/** Deux secondes de son : assez pour que les nœuds visés travaillent, assez peu pour la suite. */
function son(secondes = 2): AudioBuffer {
  const n = Math.round(SR * secondes);
  const b = new AudioBuffer({ numberOfChannels: 2, length: n, sampleRate: SR });
  let e = 11;
  for (let c = 0; c < 2; c++) {
    const x = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      e = (e * 1664525 + 1013904223) >>> 0;
      const t = i / SR, env = Math.exp(-((t % 0.5) * 6));
      x[i] = 0.35 * env * Math.sin(2 * Math.PI * (c ? 330 : 220) * t) + 0.03 * (e / 4294967296 * 2 - 1);
    }
    b.getChannelData(c).set(x);
  }
  return b;
}

async function executer(id: string, reglages: Record<string, unknown> = {}) {
  const def = registre.trouverDef(id) as never as {
    parametres?: { nom: string; type?: string; defaut?: unknown }[];
    entrees?: { type: string }[];
    executer: (ctx: unknown) => Promise<unknown>;
  };
  expect(def, id).toBeTruthy();
  const params: Record<string, unknown> = {};
  for (const p of def.parametres ?? []) {
    params[p.nom] = p.type === "choix" ? defautCanoniqueChoix(p as never) : p.defaut;
  }
  Object.assign(params, reglages);
  const ent = (def.entrees ?? []).map((p) => (p.type === "audio" ? son() : null));
  const ctx = {
    noeud: { id: "t", data: { parametres: params } }, runtime: null, repertoireTravail: "",
    entree: (i: number) => ent[i] ?? null, entrees: () => ent,
    paramNombre: (n: string, d: number) => (typeof params[n] === "number" ? params[n] as number : d),
    paramTexte: (n: string, d: string) => {
      const p = (def.parametres ?? []).find((x) => x.nom === n);
      return p && typeof params[n] === "string" ? String(valeurCanoniqueChoix(p as never, params[n] as string)) : d;
    },
    onProgress: () => {}, signal: new AbortController().signal,
  };
  return def.executer(ctx);
}

/** Le plus long moment où le fil n'a pas rendu la main, et la durée totale, en millisecondes. */
async function pireGel(travail: () => Promise<unknown>): Promise<{ pire: number; total: number }> {
  let dernier = Date.now();
  let pire = 0;
  // Vingt millisecondes : plus court que le délai de respiration, donc chaque respiration est vue.
  const minuteur = setInterval(() => {
    const t = Date.now();
    pire = Math.max(pire, t - dernier);
    dernier = t;
  }, 20);
  const debut = Date.now();
  try {
    await travail();
  } finally {
    clearInterval(minuteur);
  }
  const t = Date.now();
  pire = Math.max(pire, t - dernier);
  return { pire, total: t - debut };
}

/** Au-delà, la fenêtre est perçue figée assez longtemps pour que cela se remarque. */
const GEL_MAX_MS = 900;

/**
 * CE QUE CETTE MESURE NE PEUT PAS DÉCIDER, nommé avec sa raison plutôt que laissé au rouge.
 *
 * DEUX CAS, ET ILS NE SE RESSEMBLENT PAS. Les deux premiers sont des ARTEFACTS DU POLYFILL : leur
 * temps passe dans `rendreSequence`, dont le module est de classe « rendu » au sens de
 * `DEPENDANCES-AUDIO.md`, c'est-à-dire un `OfflineAudioContext`. Dans un navigateur ce rendu a lieu
 * hors du fil de l'interface et ne gèle rien ; le polyfill de Node, lui, l'exécute synchroniquement,
 * et ce qu'on mesure alors est sa propre implémentation, pas le code du nœud.
 *
 * Les deux autres sont un VRAI RÉSIDU, et il ne se corrige pas d'ici : le bloc restant est un seul
 * noyau de TensorFlow.js, le produit matriciel d'un lot d'entraînement. Mesuré, la respiration
 * ajoutée au spectrogramme, à la normalisation, au jeu de données, à la prédiction et à la synthèse
 * ne le bouge pas d'un millième, et `yieldEvery: "batch"` non plus : un appel synchrone dans une
 * bibliothèque ne se découpe pas du dehors. Les seuls leviers seraient un lot plus petit ou moins
 * d'unités cachées, qui changent le calcul lui-même.
 */
const HORS_MESURE: Record<string, string> = {
  "accord-mets-musique": "le temps passe dans un OfflineAudioContext, que le polyfill Node execute sur le fil",
  "parfum-motif": "meme raison : le rendu de la sequence n'a pas lieu sur le fil dans un navigateur",
  "continuation-spectrale-ar": "residu de 6,3 s : un seul noyau TensorFlow.js, indivisible du dehors",
  "continuation-spectrale-lstm": "residu de 3,4 s : meme noyau, reseau recurrent",
};

/**
 * Les nœuds dont le calcul se fait dans la page, et qui coûtent assez pour que la question se pose.
 * Les réglages abrègent ce qui peut l'être sans changer la nature du calcul : ce qui est mesuré est
 * la RESPIRATION, pas la durée.
 */
const CAS: { id: string; reglages?: Record<string, unknown>; quoi: string }[] = [
  { id: "continuation-spectrale-ar", quoi: "STFT, normalisation, prediction, recouvrement",
    reglages: { "Durée générée": 1, "Époques": 3, "Budget": 4000 } },
  { id: "continuation-spectrale-lstm", quoi: "idem, reseau recurrent",
    reglages: { "Durée générée": 1, "Époques": 3, "Budget": 4000 } },
  { id: "piece-lucier", quoi: "convolutions repetees" },
  { id: "accord-mets-musique", quoi: "ecriture puis rendu" },
  { id: "parfum-motif", quoi: "ecriture puis rendu" },
  { id: "glissando-risset", quoi: "sommation de voix" },
  { id: "rythme-euclidien", quoi: "sequence puis rendu" },
  { id: "reverbe-reseau", quoi: "reseau de retards" },
];

describe("les nœuds rendent la main pendant qu'ils calculent", () => {
  for (const cas of CAS) {
    it(`${cas.id} ne tient pas le fil (${cas.quoi})`, async () => {
      const { pire, total } = await pireGel(() => executer(cas.id, cas.reglages));
      const raison = HORS_MESURE[cas.id];
      if (raison) {
        // Hors de portée de la mesure, mais pas hors de portée du test : on tient au moins que le
        // nœud RÉPOND, sans quoi l'entrée de cette table masquerait un nœud devenu muet ou cassé.
        expect(total, `${cas.id} n'a rien calcule`).toBeGreaterThan(0);
        return;
      }
      // Le total sert à lire le pire : un pire égal au total veut dire « aucune respiration ».
      expect(pire, `pire gel ${pire} ms sur ${total} ms de calcul`).toBeLessThan(GEL_MAX_MS);
    }, 120000);
  }
});
