// audio/champ-apprentissage.ts — Apprendre le champ à paires sur un corpus : la pseudo-vraisemblance montée
// par descente proximale accélérée, la pénalité L1 en seuillage doux.
//
// LA RECETTE EST CELLE DE BECK ET TEBOULLE (FISTA, 2009) : un pas de gradient sur la
// pseudo-vraisemblance, puis le seuillage doux qui tire vers zéro chaque paramètre pénalisé, puis
// l'élan, qui reprend une part du pas précédent. Le pas se cherche à chaque passe : il est réduit
// de moitié tant que la montée promise n'est pas tenue, et rallongé un peu ensuite. L'élan repart de
// zéro quand l'objectif redescend.
//
// TOUT EST DÉTERMINISTE ET PUR, ce module tournant dans un worker comme dans le fil : les mêmes
// réglages et le même corpus rendent le même modèle à l'octet, des deux côtés.

import { creerAleatoire } from "../core/hasard";
import type { Corpus } from "./corpus";
import { disposer, nonPenalises, pseudoVraisemblance, type DonneesChamp, type Mesure, type Voisinages } from "./champ-paires";
import { BORNES_CHAMP, colonnesDuCorpus, TONIQUE_REFERENCE, type ModeChamp } from "./champ-corpus";
import { corpusVersJson, empreinteCorpus } from "./corpus-fichier";
import type { ModeleHarmonique } from "./modele-harmonique";
import { NB_VOIX } from "./champ-paires";

/** L'objectif : la pseudo-vraisemblance moins la pénalité. */
function objectif(theta: Float64Array, logPV: number, penalite: number, libres: Uint8Array): number {
  let l1 = 0;
  for (let i = 0; i < theta.length; i++) if (!libres[i]) l1 += Math.abs(theta[i]);
  return logPV - penalite * l1;
}

/** Monte la pseudo-vraisemblance pénalisée en `passes` passes, depuis des paramètres nuls. */
export function apprendreChamp(
  d: ReturnType<typeof disposer>, donnees: DonneesChamp, passes: number, penalite: number,
): Float64Array {
  const n = d.taille, libres = nonPenalises(d);
  let x = new Float64Array(n), y = new Float64Array(n);
  const g = new Float64Array(n), z = new Float64Array(n);
  let elan = 1, L = 1;
  let precedent = objectif(x, pseudoVraisemblance(d, x, donnees).logPV, penalite, libres);
  for (let passe = 0; passe < passes; passe++) {
    const f = pseudoVraisemblance(d, y, donnees, g).logPV;
    let fz = 0;
    for (let essai = 0; essai < 60; essai++) {
      let produit = 0, carre = 0;
      for (let i = 0; i < n; i++) {
        let v = y[i] + g[i] / L;
        if (!libres[i]) { const s = penalite / L; v = v > s ? v - s : v < -s ? v + s : 0; }
        z[i] = v;
        const dz = v - y[i];
        produit += g[i] * dz; carre += dz * dz;
      }
      fz = pseudoVraisemblance(d, z, donnees).logPV;
      // LA MONTÉE PROMISE PAR LE MODÈLE QUADRATIQUE DU PAS, tenue ou non : sinon le pas est trop long.
      if (fz >= f + produit - (L / 2) * carre - 1e-12) break;
      L *= 2;
    }
    const courant = objectif(z, fz, penalite, libres);
    const prochain = (1 + Math.sqrt(1 + 4 * elan * elan)) / 2;
    const reprise = courant < precedent;
    const suivantY = new Float64Array(n);
    for (let i = 0; i < n; i++) suivantY[i] = reprise ? z[i] : z[i] + ((elan - 1) / prochain) * (z[i] - x[i]);
    x = Float64Array.from(z);
    y = suivantY;
    elan = reprise ? 1 : prochain;
    precedent = courant;
    L = Math.max(1e-6, L * 0.8);
  }
  return x;
}

/** Ce que le nœud demande : le corpus et les réglages, tout ce qui se transmet à un worker. */
export interface DemandeApprentissage {
  corpus: Corpus;
  mode: ModeChamp;
  pas: number;
  voisinages: Voisinages;
  penalite: number;
  passes: number;
  /** La part des pièces mises de côté pour la validation, de 0 à 1. */
  partValidation: number;
  graine: number;
}

/** Ce que l'apprentissage rend : le modèle, et de quoi écrire le rapport. */
export interface ResultatApprentissage {
  modele: ModeleHarmonique | null;
  apprentissage: Mesure;
  validation: Mesure | null;
  piecesGardees: number;
  piecesValidation: number;
  ecartees: string[];
  colonnesPerdues: number;
  nonNuls: number;
}

/** Apprend un modèle sur un corpus, ou dit pourquoi aucun ne s'apprend. */
export function apprendreSurCorpus(o: DemandeApprentissage): ResultatApprentissage {
  // LES PIÈCES DE VALIDATION SONT TIRÉES PARMI CELLES QUI COMPTENT, à la graine : quatre voix et le
  // mode demandé. Une part nulle n'en met aucune de côté, et la graine ne tire alors rien.
  const eligibles = o.corpus.pieces.flatMap((p, rang) =>
    (new Set(p.sequence.notes.map((x) => x.voix ?? 0)).size === NB_VOIX && p.tonalite?.mode === o.mode ? [rang] : []));
  const aMettreDeCote = Math.min(eligibles.length - 1, Math.round(eligibles.length * Math.max(0, Math.min(1, o.partValidation))));
  const validation = new Set<number>();
  if (aMettreDeCote > 0) {
    const hasard = creerAleatoire(o.graine);
    const melange = [...eligibles];
    for (let i = melange.length - 1; i > 0; i--) { const j = Math.floor(hasard() * (i + 1)); [melange[i], melange[j]] = [melange[j], melange[i]]; }
    for (const r of melange.slice(0, aMettreDeCote)) validation.add(r);
  }
  const lues = colonnesDuCorpus(o.corpus, o.mode, o.pas, validation);
  const d = disposer(BORNES_CHAMP, o.voisinages);
  const base = { piecesGardees: lues.piecesGardees, piecesValidation: lues.piecesValidation, ecartees: lues.ecartees, colonnesPerdues: lues.colonnesPerdues };
  if (lues.apprentissage.suit.length === 0) {
    return { modele: null, apprentissage: { logPV: 0, justes: 0, notes: 0 }, validation: null, nonNuls: 0, ...base };
  }
  const theta = apprendreChamp(d, lues.apprentissage, Math.max(1, Math.round(o.passes)), Math.max(0, o.penalite));
  let nonNuls = 0;
  for (let i = 0; i < theta.length; i++) if (theta[i] !== 0) nonNuls++;
  const modele: ModeleHarmonique = {
    format: "attic-modele-harmonique", version: 1,
    mode: o.mode, tonique: TONIQUE_REFERENCE[o.mode], pas: o.pas,
    bornes: BORNES_CHAMP.map((b) => [b[0], b[1]] as [number, number]), voisinages: { ...o.voisinages },
    theta,
    empreinte: empreinteCorpus(corpusVersJson(o.corpus, { nom: "", source: "", licence: "" })),
    pieces: lues.piecesGardees - lues.piecesValidation, colonnes: lues.apprentissage.suit.length,
  };
  return {
    modele, nonNuls, ...base,
    apprentissage: pseudoVraisemblance(d, theta, lues.apprentissage),
    validation: lues.validation.suit.length > 0 ? pseudoVraisemblance(d, theta, lues.validation) : null,
  };
}
