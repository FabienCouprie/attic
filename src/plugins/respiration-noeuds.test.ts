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

async function executer(id: string, reglages: Record<string, unknown> = {}, secondes = 2) {
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
  const ent = (def.entrees ?? []).map((p) => (p.type === "audio" ? son(secondes) : null));
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

/** Le plus long moment où le fil n'a pas rendu la main, la durée totale, et ce que le travail rend. */
async function pireGel(travail: () => Promise<unknown>): Promise<{ pire: number; total: number; rendu: unknown }> {
  let dernier = Date.now();
  let pire = 0;
  // Vingt millisecondes : plus court que le délai de respiration, donc chaque respiration est vue.
  const minuteur = setInterval(() => {
    const t = Date.now();
    pire = Math.max(pire, t - dernier);
    dernier = t;
  }, 20);
  const debut = Date.now();
  let rendu: unknown;
  try {
    rendu = await travail();
  } finally {
    clearInterval(minuteur);
  }
  const t = Date.now();
  pire = Math.max(pire, t - dernier);
  return { pire, total: t - debut, rendu };
}

/** Au-delà, la fenêtre est perçue figée assez longtemps pour que cela se remarque. */
const GEL_MAX_MS = 900;

/**
 * CE QUE CETTE MESURE NE PEUT PAS DÉCIDER, nommé avec sa raison plutôt que laissé au rouge.
 *
 * TROIS SORTES DE CAS, ET ELLES NE SE RESSEMBLENT PAS. Les deux premiers MESURENT LEUR GOÛT DANS
 * `gout-worker.ts`, dans la page. Ils ont passé ici pour des artefacts du polyfill, un rendu hors
 * ligne exécuté sur le fil, et c'était faux : ils n'en font aucun. Relevé au banc le 2026-11-08,
 * ils gelaient la page 2 785 et 816 ms, par une mesure de goût appelée sur le fil pour corriger
 * leur registre ; passée par l'ouvrier, 231 à 245 et 107 à 113 ms. Sans `Worker`, le repli de
 * `parCanal` reste un seul bloc, et le seuil ne mesurerait ici que la vitesse du coureur :
 * `gout-hors-fil.test.ts` tient à sa place ce qui compte, qu'aucune mesure n'ait lieu sur le fil.
 *
 * Les deux autres sont un VRAI RÉSIDU, et il ne se corrige pas d'ici : le bloc restant est un seul
 * noyau de TensorFlow.js, le produit matriciel d'un lot d'entraînement. Mesuré, la respiration
 * ajoutée au spectrogramme, à la normalisation, au jeu de données, à la prédiction et à la synthèse
 * ne le bouge pas d'un millième, et `yieldEvery: "batch"` non plus : un appel synchrone dans une
 * bibliothèque ne se découpe pas du dehors. Les seuls leviers seraient un lot plus petit ou moins
 * d'unités cachées, qui changent le calcul lui-même.
 *
 * Les deux derniers sont des cas QUE LE SEUIL NE PEUT PAS TRANCHER : ils passaient au vert quand le
 * calcul finissait sous `GEL_MAX_MS`, et au rouge quand le coureur était chargé. Mesuré le
 * 2026-11-08, au calme, puis sous six instances et vingt-quatre brûleurs pour seize cœurs.
 * `reverbe-reseau` calcule dans `fdn-worker.ts` dans la page, avec 1 ms de gel au banc. Sans
 * `Worker`, le repli de `parUneFois` n'a aucun `await`, et le pire gel égale la durée dans les douze
 * relevés : de 161 ms au calme à 2,2 s sous charge, et 972 ms sur la CI de la PR 311. Le cas ne
 * mesurait que la vitesse du coureur. `rythme-euclidien` respire, mais son calcul propre coûte
 * 63 ms une fois Tone chargé : le seuil ne le prendrait pas en défaut même s'il ne respirait pas du
 * tout. Son temps à froid est le chargement de Tone, que vitest transforme (`ssr.noExternal`) :
 * 811 ms sur 909 au calme. Sous charge, son plus long bloc est toujours au début du premier
 * `Tone.Offline`, de 453 à 710 ms, et c'est vraisemblablement celui des 904 ms d'une passe
 * complète. Son rendu hors ligne coûte moins de 10 ms.
 */
const HORS_MESURE: Record<string, string> = {
  "accord-mets-musique": "mesure son gout dans gout-worker.ts dans la page ; sans Worker, son repli est un seul bloc",
  "parfum-motif": "meme chemin : mesure dans gout-worker.ts dans la page, repli d'un seul bloc sans Worker",
  "continuation-spectrale-ar": "residu de 6,3 s : un seul noyau TensorFlow.js, indivisible du dehors",
  "continuation-spectrale-lstm": "residu de 3,4 s : meme noyau, reseau recurrent",
  "reverbe-reseau": "calcule dans fdn-worker.ts dans la page ; sans Worker, son repli est un seul bloc, gel egal a la duree",
  "rythme-euclidien": "son calcul propre coute 63 ms, quinze fois sous le seuil : la mesure ne peut pas le prendre en defaut",
};

/**
 * ET CEUX-LÀ DOIVENT SE FAIRE ENTENDRE, pas seulement rendre un tampon. Décidé par Fabien le
 * 2026-11-08 pour les deux derniers entrés dans la table : un tampon rempli de zéros est un nœud
 * muet, et l'exigence d'un `AudioBuffer` le laissait passer. Chaque tampon rendu doit monter à
 * −60 dB de crête au moins. Mesuré dans les conditions du cas : la réverbération rend 0,246 sur sa
 * sortie et 0,093 sur sa réponse, le rythme 0,692, soit près de 40 dB de marge au plus mince. Les
 * quatre autres nœuds de la table n'y sont pas soumis : leur crête n'a pas été relevée.
 */
const SON_AUDIBLE = new Set(["reverbe-reseau", "rythme-euclidien"]);
const CRETE_AUDIBLE = 0.001;

/** La plus forte valeur absolue d'un tampon, tous canaux confondus. */
function crete(b: AudioBuffer): number {
  let m = 0;
  for (let c = 0; c < b.numberOfChannels; c++) {
    const x = b.getChannelData(c);
    for (let i = 0; i < x.length; i++) m = Math.max(m, Math.abs(x[i]));
  }
  return m;
}

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

/**
 * L'ENTRÉE EST COURTE POUR CE QUI N'EST PLUS MESURÉ, et cette durée est liée au statut du cas.
 *
 * Un cas de `HORS_MESURE` ne tient plus qu'une chose, que le nœud RÉPOND ; il n'a donc pas besoin
 * des deux secondes qui donnent au blocage le temps de se voir. Et il en a d'autant moins besoin
 * que c'est la longueur de l'entrée qui faisait son prix : mesuré, la continuation autorégressive
 * coûte 30,5 s sur deux secondes de son, 21,3 s sur une, et 12,9 s sur une demie, en rendant son
 * audio dans les trois cas. Ses réglages, eux, ne la bougent presque pas : du plus cher au plus
 * maigre, de 30,5 s à 26,4 s.
 *
 * LE LIEN EST AU STATUT ET NON AU NOM DU NŒUD, pour que la mesure revienne d'elle-même : le jour où
 * l'un d'eux sortira de `HORS_MESURE`, il retrouvera ses deux secondes sans qu'on y pense.
 */
const ENTREE_COURTE_S = 0.5;

describe("les nœuds rendent la main pendant qu'ils calculent", () => {
  for (const cas of CAS) {
    it(`${cas.id} ne tient pas le fil (${cas.quoi})`, async () => {
      const raisonDuCas = HORS_MESURE[cas.id];
      const secondes = raisonDuCas ? ENTREE_COURTE_S : 2;
      const { pire, total, rendu } = await pireGel(() => executer(cas.id, cas.reglages, secondes));
      const raison = raisonDuCas;
      if (raison) {
        // HORS DE PORTÉE DE LA MESURE, MAIS PAS HORS DE PORTÉE DU TEST : on tient que le nœud
        // RÉPOND, sans quoi l'entrée de cette table masquerait un nœud devenu muet ou cassé.
        //
        // ET CELA NE SE TENAIT PAS. La seule chose exigée était que la durée totale dépasse zéro,
        // ce qui est vrai de n'importe quel appel, même d'un nœud qui rend `null` ou qui jette son
        // erreur dans son message. Un nœud muet passait donc, et l'entrée de cette table le
        // couvrait exactement comme son commentaire disait vouloir l'éviter. Ce qui est exigé
        // désormais, c'est du SON : les six nœuds de cette table rendent un tampon audio.
        const valeurs = (rendu as { valeurs?: unknown[] } | null)?.valeurs;
        expect(Array.isArray(valeurs), `${cas.id} n'a rien rendu du tout`).toBe(true);
        expect(
          (valeurs ?? []).some((v) => v instanceof AudioBuffer),
          `${cas.id} n'a rendu aucun son en ${total} ms, alors que sa raison d'être ici est d'en rendre : ${raison}`,
        ).toBe(true);
        if (SON_AUDIBLE.has(cas.id)) {
          // La comparaison est écrite à l'envers pour qu'une crête qui n'est pas un nombre échoue.
          const muettes = (valeurs ?? []).flatMap((v, k) =>
            v instanceof AudioBuffer && !(crete(v) >= CRETE_AUDIBLE) ? [`sortie ${k}, crete ${crete(v)}`] : []);
          expect(muettes, `${cas.id} a rendu un tampon silencieux, sous ${CRETE_AUDIBLE} de crete`).toEqual([]);
        }
        return;
      }
      // Le total sert à lire le pire : un pire égal au total veut dire « aucune respiration ».
      expect(pire, `pire gel ${pire} ms sur ${total} ms de calcul`).toBeLessThan(GEL_MAX_MS);
      // LE DÉLAI DU CAS EST GÉNÉREUX POUR LA MÊME RAISON QUE LE SEUIL, et il ne l'était pas assez.
      // Il valait cent vingt secondes quand le cas le plus cher en coûtait trente : la passe
      // complète lance un travailleur par fichier, et sous cette charge le même calcul a mis
      // 124,6 s, c'est-à-dire quatre fois son prix au calme. Le cas est tombé sur son DÉLAI, pas
      // sur sa mesure, et un échec de délai ne dit rien du code. Le plus cher coûte désormais
      // treize secondes : cinq minutes absorbent plus de vingt fois la charge.
    }, 300000);
  }
});
