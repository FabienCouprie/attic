// plugins/modulation-melange-ports.test.ts — Le câblage des ports de mélange, fiche par fiche.
//
// CE QUE LE BANC DE `audio/modulation-melange.test.ts` NE PEUT PAS VOIR. Il appelle les cœurs de
// calcul directement, et il prouve donc que chacun sait lire une courbe. Il ne touche jamais au
// chemin qui va du port à ce cœur : le rang du port, le nom du réglage, les deux bornes. Or ce
// chemin est écrit À LA MAIN sur neuf fiches, et une faute y est MUETTE. Un rang d'entrée erroné
// fait que `ctx.entree(rang)` ne rend pas la courbe ; `estCourbe` est faux ; le réglage fixe
// s'applique ; le son sort, aucun message ne change, et le port est simplement inerte.
//
// LA FORME DE CHAQUE CAS COMPARE LA FICHE À ELLE-MÊME, sans valeur de référence inventée :
//
//   A. sans courbe, le réglage de mélange posé à 25
//   B. une courbe PLATE à un sur le port, « Modulation max » à 25, et le réglage de mélange posé
//      à 100, c'est-à-dire à une valeur que A ne connaît pas
//
// Les deux doivent rendre le même son. Si le port est mal rangé, B retombe sur son réglage fixe,
// donc sur 100, et les deux sons diffèrent. Si la courbe est lue mais mal mise en forme, ils
// diffèrent aussi.
//
// VINGT-CINQ, ET NON TRENTE-TROIS. Le réglage voyage en pour cent et devient une proportion : 25
// donne 0,25, que le flottant simple tient EXACTEMENT. Une valeur comme 33 donnerait 0,33 d'un côté
// en double précision et sa version quantifiée de l'autre, et le cas mesurerait le format au lieu
// du câblage. Les fractions dyadiques sont la seule monnaie d'une comparaison au bit.
import "node-web-audio-api/polyfill.js";
import { describe, expect, it } from "vitest";
import { constante } from "../audio/courbe";
import { fiches as fichesArcEnCiel } from "./arc-en-ciel";
import { fiches as fichesCresson } from "./effets-cresson";
import { fiches as fichesEffets } from "./effets";
import { fiches as fichesRotatifs } from "./effets-rotatifs";
import { fiches as fichesTemporel } from "./effets-temporel";
import { fiches as fichesFdn } from "./fdn";
import { fiches as fichesFinitions } from "./finitions";
import { fiches as fichesVelours } from "./velours";
import type { FicheAudio } from "../audio/types-domaine";

const SR = 16000;
/** Court exprès : neuf fiches lancées deux fois, dont trois réverbérations. */
const DUREE = 0.08;

/** Le mélange employé par les deux passes, en pour cent. Dyadique après division par cent. */
const MELANGE = 25;
/** Ce que porte le réglage fixe de la passe modulée : tout sauf ce que la courbe commande. */
const LEURRE = 100;

const TOUTES = [
  ...fichesArcEnCiel, ...fichesCresson, ...fichesEffets, ...fichesRotatifs,
  ...fichesTemporel, ...fichesFdn, ...fichesFinitions, ...fichesVelours,
] as unknown as FicheAudio[];

const fiche = (id: string): FicheAudio => {
  const f = TOUTES.find((x) => x.id === id);
  if (!f) throw new Error(`fiche introuvable : ${id}`);
  return f;
};

function son(graine: number, canaux = 1): AudioBuffer {
  const n = Math.round(DUREE * SR);
  const b = new AudioBuffer({ numberOfChannels: canaux, length: n, sampleRate: SR });
  let e = graine >>> 0;
  for (let c = 0; c < canaux; c++) {
    const x = new Float32Array(n);
    for (let i = 0; i < n; i++) { e = (e * 1664525 + 1013904223) >>> 0; x[i] = 0.4 * (e / 4294967296 * 2 - 1); }
    b.copyToChannel(x, c);
  }
  return b;
}

function contexte(entrees: unknown[], reglages: Record<string, number | string>) {
  return {
    entree: (i: number) => entrees[i],
    paramNombre: (nom: string, defaut: number) =>
      (typeof reglages[nom] === "number" ? (reglages[nom] as number) : defaut),
    paramTexte: (nom: string, defaut: string) =>
      (typeof reglages[nom] === "string" ? (reglages[nom] as string) : defaut),
    onProgress: () => {},
  } as never;
}

/**
 * Tous les canaux de toutes les sorties audio d'un run, mis à plat et RECOPIÉS.
 *
 * LA COPIE N'EST PAS UNE PRÉCAUTION DE STYLE. `getChannelData` rend une vue sur de la mémoire tenue
 * par le tampon natif de `node-web-audio-api` ; rendre la vue en gardant le tampon nulle part laisse
 * le ramasse-miettes reprendre ce qu'elle désigne. Rien ne se plaint, les valeurs changent
 * seulement, et sous charge. Le banc voisin l'a payé d'une passe complète.
 */
async function rendre(id: string, entrees: unknown[], reglages: Record<string, number | string>) {
  const res = await fiche(id).executer(contexte(entrees, reglages));
  const out: Float32Array[] = [];
  for (const v of res.valeurs ?? []) {
    if (v instanceof AudioBuffer) {
      for (let c = 0; c < v.numberOfChannels; c++) out.push(Float32Array.from(v.getChannelData(c)));
    }
  }
  expect(out.length, `${id} n'a rendu aucun son`).toBeGreaterThan(0);
  return out;
}

const memes = (a: Float32Array[], b: Float32Array[]): boolean => {
  if (a.length !== b.length) return false;
  for (let k = 0; k < a.length; k++) {
    if (a[k].length !== b[k].length) return false;
    for (let i = 0; i < a[k].length; i++) if (a[k][i] !== b[k][i]) return false;
  }
  return true;
};

/**
 * Les neuf fiches dont le port de mélange est écrit à la main, avec ce qu'il faut pour les lancer.
 *
 * `entrees` donne les entrées AUDIO, dans l'ordre : le port de modulation vient après elles, et
 * c'est précisément ce que ces cas vérifient.
 */
const CAS: { id: string; reglage: string; entrees: () => unknown[]; siOffline?: boolean }[] = [
  { id: "tremolo-harmonique", reglage: "Mélange", entrees: () => [son(3, 2)] },
  { id: "haut-parleur-rotatif", reglage: "Mélange", entrees: () => [son(5, 2)] },
  { id: "arc-en-ciel-acoustique", reglage: "Mix", entrees: () => [son(7, 2)] },
  { id: "beat-repeat", reglage: "Mix", entrees: () => [son(11, 2)] },
  { id: "echo-flottant", reglage: "Mélange", entrees: () => [son(13, 2)] },
  { id: "reverbe-hachee", reglage: "Mix", entrees: () => [son(17)] },
  { id: "reverbe-reseau", reglage: "Mix", entrees: () => [son(19)] },
  { id: "reverberation-velours", reglage: "Mélange", entrees: () => [son(23)] },
  // SON BANC DE FILTRES PASSE PAR `OfflineAudioContext` : son cas de rendu ne tourne que là où ce
  // dernier existe, ce qui est dit par une condition écrite plutôt que par un silence.
  { id: "vocoder", reglage: "Mix", entrees: () => [son(29), son(31)], siOffline: true },
];

describe("les ports de mélange sont câblés là où les fiches les déclarent", () => {
  it("il y a bien neuf fiches à éprouver", () => {
    expect(CAS).toHaveLength(9);
  });

  for (const cas of CAS) {
    it(`${cas.id} : le port de modulation est le DERNIER, et il nomme son réglage`, () => {
      const entrees = fiche(cas.id).entrees ?? [];
      const dernier = entrees[entrees.length - 1] as any;
      // LE RANG COMPTE AUTANT QUE LA PRÉSENCE : les arêtes enregistrées désignent un port par son
      // rang, et insérer celui-ci ailleurs qu'en dernier rebrancherait chaque arête d'un cran.
      expect(dernier?.type, `${cas.id} : le dernier port n'est pas une courbe`).toBe("courbe");
      expect(dernier?.requis ?? false, `${cas.id} : le port de modulation est requis`).toBe(false);
      expect(dernier?.module, `${cas.id} : le port ne nomme pas son réglage`).toBe(cas.reglage);
      expect(entrees.filter((p: any) => p.type === "courbe"),
        `${cas.id} : plus d'un port de courbe, le rang lu n'est plus certain`).toHaveLength(1);
      // Et les deux bornes existent, sans quoi la mise en forme n'aurait rien à lire.
      const noms = (fiche(cas.id).parametres ?? []).map((p) => p.nom);
      expect(noms, `${cas.id} : « Modulation min » manque`).toContain("Modulation min");
      expect(noms, `${cas.id} : « Modulation max » manque`).toContain("Modulation max");
    });

    const siRendu = cas.siOffline && typeof OfflineAudioContext === "undefined" ? it.skip : it;
    siRendu(`${cas.id} : une courbe plate commande à la place du réglage`, async () => {
      const entrees = cas.entrees();
      const rang = (fiche(cas.id).entrees ?? []).length - 1;
      const plate = constante(1, 64);

      const fixe = await rendre(cas.id, entrees, { [cas.reglage]: MELANGE });
      const modulee = await rendre(cas.id, [...entrees.slice(0, rang), plate], {
        // LE LEURRE EST LE CŒUR DU CAS : si le port n'est pas lu, c'est lui qui s'applique.
        [cas.reglage]: LEURRE,
        "Modulation min": 0,
        "Modulation max": MELANGE,
      });

      expect(memes(fixe, modulee),
        `${cas.id} : la courbe plate ne rend pas ce que rend le réglage`).toBe(true);
    });
  }
});
