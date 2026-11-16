// audio/lancer-fiche.ts — Lancer une fiche au banc de node, avec les sémantiques du moteur.
//
// IL VIT DANS LE DOMAINE, et non dans `docs/` : il nourrit les entrées d'un son d'essai et rend un
// contexte audio hors ligne, ce que le shell n'a pas le droit de charger (`docs/frontiere-domaine`).
//
// POURQUOI CE MODULE EXISTE. Sept gardes du catalogue recopiaient chacun un contexte d'exécution de
// dix lignes, et aucun n'était celui du moteur : la graine y était fixée par son NOM (« Graine ») et
// non par son rôle, un réglage absent y prenait le littéral de l'appel au lieu du défaut déclaré, et
// `ctxDEssai` ne canonise pas un choix, de sorte qu'une valeur d'avant déclarée dans
// `optionsHeritees` n'y était jamais relue. Ce module prête au contraire le contexte du moteur
// lui-même, `contexteDePasse` de `core/contexte-de-passe.ts`, avec ce que le moteur lui donne :
// la fiche, la canonisation d'un choix par `valeurCanoniqueChoix`, et des entrées qui arrivent par
// des arêtes.
//
// LA GRAINE EST FIXÉE PAR SON RÔLE. Dans ce dépôt, une graine de zéro ou moins est tirée au sort à
// chaque exécution : deux lancers ne rendraient jamais la même chose, et tout réglage paraîtrait
// agir. Une graine nulle est donc remplacée par une graine fixe, une graine posée est gardée.
//
// L'EMPREINTE LIT TOUT. Celle de `plugins/effet-parametres-midi.test.ts` échantillonne un son un
// échantillon sur 97 ; celle-ci les lit tous, ainsi que les octets de chaque fichier. Elle sert à
// dire qu'un réglage n'a RIEN changé, et un échantillonnage peut taire un changement réel.

import { contexteDePasse } from "../core/contexte-de-passe";
import { creerAleatoire } from "../core/hasard";
import type { ParametreDef } from "../core/types";
import { valeurCanoniqueChoix } from "../i18n";
import { valeurDEssai } from "./valeurs-essai";
import { frequenceDeTravail } from "./frequence-de-travail";

export type Reglages = Record<string, string | number>;

/** Ce qu'il faut d'une fiche pour la lancer ici. */
export interface FicheLancable {
  id: string;
  entrees?: readonly { nom?: string; type: string; sousType?: string; requis?: boolean }[];
  parametres: readonly ParametreDef[];
  executer: (ctx: never) => Promise<unknown>;
}

/** Ce qu'un lancer rend : les valeurs des sorties, le message, et l'erreur rendue ou levée. */
export interface Lancer {
  valeurs: unknown[];
  message: string;
  /** Le nœud a rendu `erreur: true`. */
  erreurRendue: boolean;
  /** Le nœud a levé : modèle absent, application de bureau, réseau, ou défaut. */
  levee: string | null;
  /** Ce que le nœud a rendu par son canal d'affichage, présent seulement s'il en a rendu un. */
  affichage?: Record<string, unknown>;
}

/** La graine qui remplace une graine tirée au sort. */
export const GRAINE_FIXE = 4242;

/**
 * Un son d'essai déterministe : deux sinus voisins, leur quinte et un souffle, en stéréo.
 *
 * Le souffle vient du générateur commun, `core/hasard.ts`, à graine fixe : un générateur local est
 * refusé par le garde du hasard.
 */
export function sonDEssai(secondes = 2, sr = 48000): AudioBuffer {
  const n = Math.round(secondes * sr);
  const b = new AudioBuffer({ numberOfChannels: 2, length: n, sampleRate: sr });
  const souffle = creerAleatoire(24680);
  for (let c = 0; c < 2; c++) {
    const d = b.getChannelData(c);
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      d[i] = 0.2 * Math.sin(2 * Math.PI * 220 * t) + 0.15 * Math.sin(2 * Math.PI * (221 + c) * t)
        + 0.1 * Math.sin(2 * Math.PI * 660 * t) + 0.05 * (souffle() * 2 - 1);
    }
  }
  return b;
}

/** Les entrées d'essai d'une fiche, une par port : le son d'essai pour l'audio, `valeurDEssai` sinon. */
export function entreesDEssai(fiche: FicheLancable, son: AudioBuffer = sonDEssai()): unknown[] {
  return (fiche.entrees ?? []).map((p) => (p.type === "audio" ? son : valeurDEssai(p.type, p.sousType, { source: son })));
}

/** Un contexte d'exécution hors ligne à la fréquence de travail, quand le banc de node en sait faire un. */
function runtimeDEssai(): unknown {
  const OAC = (globalThis as { OfflineAudioContext?: new (c: number, l: number, sr: number) => unknown }).OfflineAudioContext;
  return OAC ? new OAC(2, 1, frequenceDeTravail()) : null;
}

/**
 * Lance une fiche avec des réglages, comme le moteur le ferait.
 *
 * Un réglage absent prend son défaut déclaré, un choix est canonisé (`optionsHeritees` comprises),
 * une graine nulle devient `GRAINE_FIXE`. Les entrées arrivent par des arêtes depuis un nœud amont ;
 * une entrée `null` reste débranchée.
 */
export async function lancerFiche(
  fiche: FicheLancable, reglages: Reglages = {},
  o: { entrees?: unknown[]; graine?: number; runtime?: unknown } = {},
): Promise<Lancer> {
  const entrees = o.entrees ?? entreesDEssai(fiche);
  const aretes = entrees.flatMap((v, i) => (v == null ? [] : [{
    id: `e${i}`, source: "amont", target: "essai", sourceHandle: `out:${i}`, targetHandle: `in:${i}`,
  }]));
  const { ctx } = contexteDePasse<unknown, unknown>({
    noeud: { id: "essai", data: { ficheId: fiche.id, parametres: { ...reglages } } },
    aretes,
    resultats: new Map([["amont", entrees]]),
    runtime: "runtime" in o ? o.runtime : runtimeDEssai(),
    repertoireTravail: "",
    trouverDef: (id) => (id === fiche.id ? fiche : undefined),
    canoniser: valeurCanoniqueChoix,
    graineDuNoeud: (_id, _nom, brut) => (brut > 0 ? brut : (o.graine ?? GRAINE_FIXE)),
    signal: new AbortController().signal,
    poserProgression: () => {},
  });
  try {
    const r = (await fiche.executer(ctx as never)) as {
      valeurs?: unknown[]; message?: string; erreur?: boolean; affichage?: Record<string, unknown>;
    } | undefined;
    return { valeurs: r?.valeurs ?? [], message: r?.message ?? "", erreurRendue: r?.erreur === true, levee: null,
      ...(r?.affichage ? { affichage: r.affichage } : {}) };
  } catch (e) {
    return { valeurs: [], message: "", erreurRendue: false, levee: String((e as Error)?.message ?? e).slice(0, 200) };
  }
}

/**
 * Un condensé de 64 bits d'une suite d'octets ou de nombres, assez pour dire « rien n'a changé ».
 *
 * CHAQUE PAS REPLIE SES BITS DE POIDS FORT SUR CEUX DE POIDS FAIBLE, et c'est la réparation du lot
 * 3d-2 (2026-11-15). Une multiplication ne fait monter un bit que vers le haut : sans repli, une
 * différence de signe, le bit de poids fort d'un échantillon, ne touchait que le bit de poids fort
 * du condensé, et deux différences s'y annulaient. Un carré à 440 Hz et un carré à 261,6 Hz, qui ne
 * diffèrent que par le signe de leurs échantillons, rendaient la même empreinte, et la saisie du
 * générateur de fréquence paraissait inerte sous la forme carrée.
 */
function condense(lire: (i: number) => number, n: number): string {
  let h1 = 0x811c9dc5, h2 = 0x01000193;
  for (let i = 0; i < n; i++) {
    const x = lire(i) | 0;
    h1 = Math.imul(h1 ^ x, 16777619);
    h1 ^= h1 >>> 15;
    h2 = Math.imul(h2 ^ x, 0x5bd1e995);
    h2 ^= h2 >>> 13;
  }
  return `${n}:${(h1 >>> 0).toString(36)}${(h2 >>> 0).toString(36)}`;
}

/**
 * L'empreinte de toutes les sorties d'un lancer : chaque échantillon d'un son, chaque octet d'un
 * fichier, chaque caractère d'un texte, et la forme des autres valeurs.
 *
 * UN FICHIER SE LIT, IL NE SE SÉRIALISE PAS : `JSON.stringify(new File(...))` rend `{}`, et tout
 * nœud rendant un fichier paraîtrait inerte quel que soit son réglage.
 */
export async function empreinteValeurs(valeurs: readonly unknown[]): Promise<string> {
  const bouts: string[] = [];
  for (const v of valeurs) {
    if (v instanceof Blob) {
      const o = new Uint8Array(await v.arrayBuffer());
      bouts.push(`f${condense((i) => o[i], o.length)}`);
    } else if (v instanceof Uint8Array) {
      bouts.push(`o${condense((i) => v[i], v.length)}`);
    } else if (typeof AudioBuffer !== "undefined" && v instanceof AudioBuffer) {
      // LA VUE D'UN CANAL SE LIT EN PLACE, sur sa longueur : `getChannelData` peut rendre une vue sur
      // une mémoire plus grande que le canal, et en copier le tampon entier lirait au-delà.
      const canaux: string[] = [];
      for (let c = 0; c < v.numberOfChannels; c++) {
        const f = v.getChannelData(c);
        const d = new Int32Array(f.buffer, f.byteOffset, f.length);
        canaux.push(condense((i) => d[i], d.length));
      }
      bouts.push(`a${v.sampleRate}:${canaux.join(",")}`);
    } else if (v instanceof Float32Array) {
      const d = new Int32Array(v.buffer, v.byteOffset, v.length);
      bouts.push(`c${condense((i) => d[i], d.length)}`);
    } else if (typeof v === "string") {
      bouts.push(`t${condense((i) => v.charCodeAt(i), v.length)}`);
    } else if (typeof v === "number" || typeof v === "boolean") {
      bouts.push(`n${v}`);
    } else if (v == null) {
      bouts.push("vide");
    } else {
      // Un objet du domaine (séquence, banque, courbe) : sa forme sérialisée, sans les fonctions.
      let s = "";
      try { s = JSON.stringify(v, (_k, x) => (x instanceof Float32Array ? Array.from(x) : x)) ?? ""; } catch { s = "opaque"; }
      bouts.push(`j${condense((i) => s.charCodeAt(i), s.length)}`);
    }
  }
  return bouts.join("|");
}

/**
 * Les valeurs d'essai d'un réglage : celles qui ont une chance de changer le résultat, son défaut
 * exclu.
 *
 * LA BORNE S'ÉCRIT `plage: [min, max]` DANS CE DÉPÔT, et un réglage numérique peut n'avoir aucun
 * `type` : c'est le cas d'« Octaves » de l'arpégiateur, que le garde des effets MIDI sautait sans le
 * compter. Plusieurs valeurs plutôt que la seule borne la plus loin : un réglage qui agit modulo une
 * longueur peut tomber pile sur un multiple et paraître mort. Un texte, un fichier ou un dossier
 * n'ont pas de valeur d'essai : une valeur arbitraire ferait retomber le nœud sur son défaut.
 */
export function valeursDEssai(p: ParametreDef): (string | number)[] {
  const pd = p as ParametreDef & { plage?: [number, number]; pas?: number; defaut?: string | number };
  if (p.type === "choix") {
    const ids = (p.optionIds ?? p.options ?? []).map(String);
    const courant = String(valeurCanoniqueChoix(p, pd.defaut ?? ids[0] ?? ""));
    return ids.filter((x) => x !== courant);
  }
  if (p.type === "case") return [Number(pd.defaut ?? 0) === 0 ? 1 : 0];
  if (p.type === "sf2instrument") return [Number(pd.defaut ?? 0) === 40 ? 0 : 40];
  const numerique = p.type === undefined || p.type === "nombre" || p.type === "curseur";
  if (!numerique || !Array.isArray(pd.plage)) return [];
  const d = Number(pd.defaut ?? 0);
  const [min, max] = pd.plage;
  const entier = (pd.pas ?? 0) >= 1 || (Number.isInteger(d) && Number.isInteger(min) && Number.isInteger(max));
  const brut = [max, min, min + (max - min) / 3, (min + max) / 2];
  return [...new Set(brut.map((v) => (entier ? Math.round(v) : v)))].filter((v) => v !== d);
}
