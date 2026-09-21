// audio/ecrans.ts — Les écrans de Xenakis : un grain n'est pas posé, il est TIRÉ dans une case.
//
// D'après Iannis Xenakis, « Musiques formelles » (1963), chapitre sur la musique stochastique
// markovienne, et les pièces « Analogique A et B » (1959) — la première granulation composée de
// l'histoire, et de dix ans antérieure aux premières granulations par ordinateur.
//
// CE QUE L'IDÉE A DE PARTICULIER, ET QUI LA SÉPARE DE TOUT LE RESTE DU CATALOGUE. Les autres
// procédés granulaires décrivent un grain — sa forme, sa durée, sa hauteur — puis le répètent. Ici
// on ne décrit aucun grain : on décrit un ESPACE, quadrillé en cases de fréquence et d'intensité,
// et l'on dit combien de grains par seconde chaque case doit contenir. Les grains eux-mêmes sont
// tirés au sort dans leur case. On ne compose plus des sons mais une densité de probabilité, et
// c'est exactement ce que Xenakis revendiquait : passer du point à la statistique.
//
// UN ÉCRAN, UN LIVRE. Un écran est un état de ce quadrillage, tenu pendant un court instant ; un
// livre d'écrans est leur succession, et c'est elle qui fait la pièce. Xenakis enchaînait des
// CLASSES d'écrans par une matrice de transition markovienne. L'adaptation d'ici est plus simple
// et se comporte de même : chaque case suit sa propre chaîne à deux états, tenue ou éteinte, avec
// une probabilité de rester allumée et une probabilité de s'allumer. Deux réglages au lieu d'une
// matrice, et les deux régimes que Xenakis cherchait s'obtiennent aux extrêmes — une tenue forte
// donne des nappes stables, une tenue faible et une apparition forte donnent un bouillonnement.
//
// LES BANDES SONT LOGARITHMIQUES, et ce n'est pas un détail de confort : l'oreille entend des
// rapports, si bien qu'un quadrillage linéaire mettrait la moitié de ses cases entre 10 et 11 kHz,
// où l'on n'entend presque pas de différence, et une seule case pour les trois octaves du grave.

import { creerAleatoire } from "../core/hasard";

export interface OptionsLivre {
  /** Nombre de bandes de fréquence. */
  bandes: number;
  /** Nombre de niveaux d'intensité. */
  niveaux: number;
  /** Durée d'un écran, en secondes. */
  dureeEcranSec: number;
  /** Durée totale visée, en secondes. */
  dureeSec: number;
  /** Probabilité qu'une case allumée le reste, en pour-cent. */
  tenuePc: number;
  /** Probabilité qu'une case éteinte s'allume, en pour-cent. */
  apparitionPc: number;
  aleatoire: () => number;
}

/** Un écran : pour chaque bande, quels niveaux sont allumés. */
export type Ecran = boolean[][];

const borne = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
const entier = (v: number, min: number, max: number) => borne(Math.round(Number.isFinite(v) ? v : min), min, max);

/**
 * Le livre d'écrans, tiré case par case.
 *
 * LE PREMIER ÉCRAN NE SORT PAS DE RIEN : il est tiré à la probabilité d'équilibre de la chaîne,
 * `apparition / (apparition + extinction)`. Le tirer à pile ou face ferait commencer toutes les
 * pièces par un écran à moitié plein, quels que soient les réglages — une tenue de 95 % et une
 * apparition de 2 % décrivent une texture creuse, qui mettrait plusieurs secondes à se vider si on
 * la faisait partir de la moitié. La pièce commencerait donc par un transitoire que personne n'a
 * demandé.
 */
export function livreEcrans(o: OptionsLivre): Ecran[] {
  const bandes = entier(o.bandes, 1, 64);
  const niveaux = entier(o.niveaux, 1, 8);
  const duree = borne(Number.isFinite(o.dureeSec) ? o.dureeSec : 1, 0.05, 600);
  const dureeEcran = borne(Number.isFinite(o.dureeEcranSec) ? o.dureeEcranSec : 0.1, 0.005, duree);
  const nombre = Math.max(1, Math.round(duree / dureeEcran));
  const tenue = borne(o.tenuePc, 0, 100) / 100;
  const apparition = borne(o.apparitionPc, 0, 100) / 100;
  const extinction = 1 - tenue;
  const equilibre = apparition + extinction > 0 ? apparition / (apparition + extinction) : 0;

  const livre: Ecran[] = [];
  let courant: Ecran = Array.from({ length: bandes }, () =>
    Array.from({ length: niveaux }, () => o.aleatoire() < equilibre));
  livre.push(courant);
  for (let e = 1; e < nombre; e++) {
    const suivant: Ecran = courant.map((bande) =>
      bande.map((allumee) => (allumee ? o.aleatoire() < tenue : o.aleatoire() < apparition)));
    livre.push(suivant);
    courant = suivant;
  }
  return livre;
}

/** Un grain tiré dans sa case. */
export interface GrainTire {
  /** Instant de départ, en secondes. */
  instant: number;
  frequenceHz: number;
  amplitude: number;
}

export interface OptionsTirage {
  frequenceMinHz: number;
  frequenceMaxHz: number;
  /** Grains par seconde et par case allumée. */
  densite: number;
  /** Écart entre deux niveaux d'intensité, en décibels. */
  pasNiveauDb: number;
  dureeEcranSec: number;
  aleatoire: () => number;
}

/**
 * Les grains d'un livre : pour chaque case allumée, autant de grains que sa densité en demande,
 * tirés au hasard dans le temps de l'écran et dans la bande de fréquences.
 *
 * LE TIRAGE DE LA FRÉQUENCE EST LOGARITHMIQUE À L'INTÉRIEUR DE LA BANDE, pour la même raison que
 * le quadrillage l'est : tiré uniformément en hertz, un grain d'une bande allant de 200 à 400 Hz
 * tomberait deux fois sur trois dans sa moitié supérieure, et la bande s'entendrait comme deux.
 *
 * LE NOMBRE DE GRAINS N'EST PAS ARRONDI, IL EST TIRÉ. Une densité de 2,5 grains par écran ne peut
 * pas rendre deux grains et demi : arrondir donnerait toujours deux ou toujours trois, et la
 * densité cesserait d'être réglable en dessous du grain par écran. La partie fractionnaire décide
 * donc d'un grain de plus, au hasard — la moyenne tombe juste, ce qu'un test vérifie.
 */
export function grainsDuLivre(livre: readonly Ecran[], o: OptionsTirage): GrainTire[] {
  const grains: GrainTire[] = [];
  if (livre.length === 0) return grains;
  const bandes = livre[0].length;
  const niveaux = livre[0][0]?.length ?? 1;
  const fMin = borne(o.frequenceMinHz, 10, 20000);
  const fMax = Math.max(fMin * 1.01, borne(o.frequenceMaxHz, 10, 22000));
  const densite = borne(o.densite, 0, 2000);
  const pas = borne(o.pasNiveauDb, 0, 60);
  const parEcran = densite * o.dureeEcranSec;

  for (let e = 0; e < livre.length; e++) {
    const debut = e * o.dureeEcranSec;
    for (let b = 0; b < bandes; b++) {
      // Les bornes de la bande, en logarithme : chaque bande couvre le même intervalle musical.
      const basse = fMin * Math.pow(fMax / fMin, b / bandes);
      const haute = fMin * Math.pow(fMax / fMin, (b + 1) / bandes);
      for (let n = 0; n < niveaux; n++) {
        if (!livre[e][b][n]) continue;
        const combien = Math.floor(parEcran) + (o.aleatoire() < parEcran - Math.floor(parEcran) ? 1 : 0);
        // Le niveau le plus haut sonne à pleine amplitude, les autres descendent par pas.
        const amplitude = Math.pow(10, (-(niveaux - 1 - n) * pas) / 20);
        for (let k = 0; k < combien; k++) {
          grains.push({
            instant: debut + o.aleatoire() * o.dureeEcranSec,
            frequenceHz: basse * Math.pow(haute / basse, o.aleatoire()),
            amplitude,
          });
        }
      }
    }
  }
  return grains;
}

/**
 * Le rendu : une sinusoïde par grain, sous une fenêtre en cosinus surélevé.
 *
 * LA FENÊTRE N'EST PAS UN ORNEMENT. Un grain coupé net commence et finit par une marche, et une
 * marche contient toutes les fréquences : quelques centaines de grains par seconde donneraient
 * autant de clics, et le nuage s'entendrait comme du bruit blanc quelle que soit la case d'où il
 * sort. C'est le grain de Gabor — une sinusoïde sous une enveloppe douce — que Xenakis emploie.
 */
export function rendreGrains(
  grains: readonly GrainTire[], frequenceEchantillonnage: number, longueur: number, dureeGrainSec: number,
): Float32Array {
  const sortie = new Float32Array(Math.max(1, longueur));
  const n = Math.max(2, Math.round(dureeGrainSec * frequenceEchantillonnage));
  for (const g of grains) {
    const debut = Math.round(g.instant * frequenceEchantillonnage);
    if (debut >= sortie.length) continue;
    const omega = (2 * Math.PI * g.frequenceHz) / frequenceEchantillonnage;
    for (let i = 0; i < n && debut + i < sortie.length; i++) {
      const fenetre = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (n - 1)));
      sortie[debut + i] += g.amplitude * fenetre * Math.sin(omega * i);
    }
  }
  return sortie;
}

/** Ce qu'on sait d'un livre une fois tiré. */
export interface RapportLivre {
  ecrans: number;
  cases: number;
  /** Part des cases allumées, en pour-cent, sur tout le livre. */
  occupationPc: number;
  /** Part des cases qui changent d'état d'un écran au suivant, en pour-cent. */
  agitationPc: number;
}

export function rapportLivre(livre: readonly Ecran[]): RapportLivre {
  if (livre.length === 0) return { ecrans: 0, cases: 0, occupationPc: 0, agitationPc: 0 };
  const bandes = livre[0].length;
  const niveaux = livre[0][0]?.length ?? 0;
  const cases = bandes * niveaux;
  let allumees = 0, changements = 0;
  for (let e = 0; e < livre.length; e++) {
    for (let b = 0; b < bandes; b++) {
      for (let n = 0; n < niveaux; n++) {
        if (livre[e][b][n]) allumees++;
        if (e > 0 && livre[e][b][n] !== livre[e - 1][b][n]) changements++;
      }
    }
  }
  return {
    ecrans: livre.length,
    cases,
    occupationPc: cases > 0 ? (100 * allumees) / (cases * livre.length) : 0,
    agitationPc: cases > 0 && livre.length > 1 ? (100 * changements) / (cases * (livre.length - 1)) : 0,
  };
}

/**
 * Le livre, écrit pour être lu.
 *
 * Une colonne par écran, une ligne par case : on voit la pièce d'un coup d'œil, et l'on peut la
 * comparer à ce qu'on entend. C'est la seule façon honnête de montrer une structure stochastique —
 * dire « c'est aléatoire » n'apprend rien, montrer la trame apprend tout.
 */
export function texteLivre(livre: readonly Ecran[], o: { frequenceMinHz: number; frequenceMaxHz: number }, en: boolean): string {
  if (livre.length === 0) return en ? "Empty book." : "Livre vide.";
  const bandes = livre[0].length;
  const niveaux = livre[0][0]?.length ?? 0;
  const colonnes = Math.min(livre.length, 64);
  const lignes: string[] = [];
  lignes.push(en ? "BOOK OF SCREENS" : "LIVRE D'ÉCRANS");
  lignes.push("");
  for (let b = bandes - 1; b >= 0; b--) {
    const basse = o.frequenceMinHz * Math.pow(o.frequenceMaxHz / o.frequenceMinHz, b / bandes);
    for (let n = niveaux - 1; n >= 0; n--) {
      const cases = Array.from({ length: colonnes }, (_, e) => (livre[e][b][n] ? "█" : "·")).join("");
      const etiquette = n === niveaux - 1 ? `${Math.round(basse)} Hz`.padStart(8) : "".padStart(8);
      lignes.push(`${etiquette} ${cases}`);
    }
  }
  lignes.push("");
  const r = rapportLivre(livre);
  lignes.push(en
    ? `${r.ecrans} screens, ${r.cases} cells, ${r.occupationPc.toFixed(1)} % lit, ${r.agitationPc.toFixed(1)} % changing`
    : `${r.ecrans} écrans, ${r.cases} cases, ${r.occupationPc.toFixed(1)} % allumées, ${r.agitationPc.toFixed(1)} % qui changent`);
  if (livre.length > colonnes) {
    lignes.push(en ? `(first ${colonnes} screens shown)` : `(${colonnes} premiers écrans montrés)`);
  }
  return lignes.join("\n");
}

/** Le générateur de hasard du nœud, une fois pour tout le tirage. */
export const hasardEcrans = (graine: number): (() => number) =>
  creerAleatoire(Math.max(1, Math.round(Number.isFinite(graine) ? graine : 1)));
