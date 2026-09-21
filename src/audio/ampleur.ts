// audio/ampleur.ts — Remplir la pièce sans monter le son.
//
// D'après Vesa Välimäki, Heidi-Maria Lehtonen et Marko Takanen, « A perceptual study on velvet
// noise and its variants at different pulse densities », IEEE Transactions on Audio, Speech and
// Language Processing 21(7), 2013 ; et Välimäki, Holm-Rasmussen, Alary et Lehtonen, « Late
// reverberation synthesis using filtered velvet noise », Applied Sciences 7(5), 2017.
//
// CE QUI MANQUAIT, ET POURQUOI AUCUN NŒUD EXISTANT NE LE FAIT. « Largeur stéréo / M-S » décode en
// milieu et côtés puis rehausse les côtés : sur une source MONO, le côté vaut L−R, donc zéro, et
// amplifier zéro donne zéro. Le délai stéréo et le chorus manipulent de même une différence qui
// doit déjà exister. Aucun outil du catalogue ne sait CRÉER cette différence quand il n'y en a
// pas. Et les six réverbérations ont toutes une queue, alors que « remplir la pièce » est le
// travail des PREMIÈRES réflexions.
//
// LES DEUX MÉCANISMES SONT LE MÊME. Un motif de réflexions différent pour chaque canal décorrèle
// et donne un corps de pièce d'un seul geste — et c'est ce qu'une vraie pièce fait, puisque vos
// deux oreilles ne reçoivent pas les mêmes réflexions. Les premières réflexions arrivent dans la
// fenêtre de précédence, en deçà d'une quarantaine de millisecondes : l'oreille les fusionne avec
// le son direct plutôt que de les entendre comme des échos. Le son grossit ; rien ne se répète.
//
// LE BRUIT DE VELOURS EST LE BON PRIMITIF. C'est une suite où chaque case d'une grille régulière
// porte UNE impulsion de valeur ±1, placée au hasard dans sa case. Quelques dizaines d'impulsions
// par seconde suffisent : c'est littéralement une liste de réflexions discrètes, et sa rareté est
// ce qui lui permet de décorréler SANS COLORER — un bruit dense se ferait entendre comme un
// souffle, et un peigne régulier comme un timbre.
//
// LE SON DIRECT RESTE IDENTIQUE SUR LES DEUX CANAUX, et c'est la décision qui protège la
// compatibilité mono. Décorréler le signal lui-même creuse sa somme : les phases se détruisent, et
// ce qui gagnait en largeur perd son centre — le défaut de tous les élargisseurs bon marché. Ici
// seules les réflexions AJOUTÉES diffèrent d'un canal à l'autre. C'est aussi ce qui est vrai
// physiquement : le son direct vous parvient une fois, la pièce le renvoie deux fois différemment.

/** Une réflexion : quand elle arrive, de quel signe, et avec quelle force. */
export interface Reflexion {
  /** Position en échantillons depuis le début du son. */
  position: number;
  /** +1 ou −1. */
  signe: number;
  /** Gain, entre 0 et 1. */
  gain: number;
}

export interface OptionsAmpleur {
  /** Réflexions par seconde. Trente à deux cents : au-delà, on entend un souffle. */
  densite: number;
  /** Durée de la fenêtre de réflexions, en secondes. Au-delà de 80 ms, on entend un écho. */
  fenetreSec: number;
  /** Silence avant la première réflexion, en secondes. C'est l'indice de la taille de la pièce. */
  preDelaiSec: number;
  /** Amortissement des réflexions tardives, entre 0 et 1. */
  absorption: number;
  /** Proportion de réflexions ajoutée, entre 0 et 1. */
  melange: number;
  /**
   * Le mélange échantillon par échantillon, quand une courbe le pilote : la pièce se remplit et
   * se vide au fil du son.
   *
   * POURQUOI LE MÉLANGE, ET PAS UN AUTRE RÉGLAGE. Les quatre autres — densité, fenêtre, pré-délai,
   * absorption — décrivent la PIÈCE, et la pièce est fabriquée une fois : c'est une suite de
   * réflexions tirée à la graine donnée. Les faire varier en continu demanderait de reconstruire
   * la suite à chaque échantillon, donc une convolution dont le noyau change — et la promesse
   * « une même graine rejoue la même pièce » n'aurait plus de sens. Le mélange, lui, est un gain
   * sur ce qui est déjà calculé : il se module exactement, sans rien approcher.
   */
  melangeCourbe?: Float32Array;
  graine: number;
  frequence: number;
}

function tirage(graine: number): () => number {
  let g = (graine | 0) || 1;
  return () => { g = (g * 1103515245 + 12345) & 0x7fffffff; return g / 0x7fffffff; };
}

/**
 * Une suite de bruit de velours : une impulsion par case, placée au hasard dans sa case.
 *
 * LA RÉGULARITÉ DE LA GRILLE EST CE QUI ÉVITE LES PAQUETS. Un tirage entièrement libre laisserait
 * des impulsions se grouper et des trous s'ouvrir, ce qui s'entendrait comme un grain irrégulier.
 * Une par case garantit une densité constante tout en gardant chaque position imprévisible : c'est
 * tout l'intérêt du procédé, et ce qui le distingue d'un bruit ordinaire qu'on aurait éclairci.
 */
export function sequenceVelours(o: OptionsAmpleur): Reflexion[] {
  const alea = tirage(o.graine);
  const debut = Math.max(0, Math.round(o.preDelaiSec * o.frequence));
  const longueur = Math.max(1, Math.round(o.fenetreSec * o.frequence));
  const case_ = Math.max(1, Math.round(o.frequence / Math.max(1, o.densite)));
  const out: Reflexion[] = [];
  for (let k = 0; k * case_ < longueur; k++) {
    const dansLaCase = Math.round(alea() * (case_ - 1));
    const position = debut + k * case_ + dansLaCase;
    // Les réflexions tardives s'affaiblissent : les murs absorbent, et l'air aussi.
    const avancement = (k * case_) / longueur;
    out.push({
      position,
      signe: alea() < 0.5 ? -1 : 1,
      gain: Math.pow(1 - Math.min(1, o.absorption) * 0.95, avancement * 4),
    });
  }
  return out;
}

/** Applique une suite de réflexions à un signal. */
export function appliquerReflexions(x: Float32Array, r: readonly Reflexion[]): Float32Array {
  const y = new Float32Array(x.length);
  for (const reflexion of r) {
    const p = reflexion.position;
    const a = reflexion.signe * reflexion.gain;
    for (let i = p; i < x.length; i++) y[i] += a * x[i - p];
  }
  return y;
}

/** L'énergie efficace d'un signal. */
export function efficace(x: Float32Array): number {
  let s = 0;
  for (let i = 0; i < x.length; i++) s += x[i] * x[i];
  return x.length > 0 ? Math.sqrt(s / x.length) : 0;
}

/**
 * La corrélation entre deux canaux, entre −1 et 1.
 *
 * Un vaut deux canaux identiques — une source ponctuelle entre les enceintes. Zéro vaut deux
 * canaux sans rapport — un son sans position repérable. C'est le chiffre que ce nœud est censé
 * faire baisser, et le seul qui dise s'il y parvient.
 */
export function correlation(a: Float32Array, b: Float32Array): number {
  const n = Math.min(a.length, b.length);
  let sab = 0, saa = 0, sbb = 0;
  for (let i = 0; i < n; i++) { sab += a[i] * b[i]; saa += a[i] * a[i]; sbb += b[i] * b[i]; }
  const den = Math.sqrt(saa * sbb);
  return den > 1e-12 ? sab / den : 1;
}

/**
 * Le mélange, valeur par valeur — piloté par une courbe ou tenu par le réglage.
 *
 * Borné ici, et une seule fois : une courbe est censée porter des valeurs entre zéro et un, mais
 * rien n'oblige un producteur à le garantir, et un mélange négatif soustrairait les réflexions au
 * lieu de les ajouter.
 */
function melangeParEchantillon(o: OptionsAmpleur, n: number): Float32Array {
  const borne = (v: number) => Math.min(1, Math.max(0, Number.isFinite(v) ? v : 0));
  const courbe = o.melangeCourbe;
  if (!courbe || courbe.length === 0) return new Float32Array(n).fill(borne(o.melange));
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = borne(courbe[Math.min(i, courbe.length - 1)]);
  return out;
}

/**
 * L'ampleur.
 *
 * LA SORTIE EST RAMENÉE À L'ÉNERGIE DE L'ENTRÉE, et c'est la promesse même du nœud : on ne monte
 * pas le son, on l'élargit. Sans cette normalisation, ajouter des réflexions ajouterait de
 * l'énergie, et l'on attribuerait à l'ampleur ce qui ne serait qu'un gain — l'illusion la plus
 * commune du traitement sonore, et celle qu'il faut refuser ici plus qu'ailleurs.
 */
export function ampleur(
  gauche: Float32Array, droite: Float32Array, o: OptionsAmpleur,
): [Float32Array, Float32Array] {
  // Deux suites différentes : c'est là, et seulement là, que naît la décorrélation.
  const rg = sequenceVelours(o);
  const rd = sequenceVelours({ ...o, graine: o.graine + 104729 });
  const wetG = appliquerReflexions(gauche, rg);
  const wetD = appliquerReflexions(droite, rd);

  // LES DEUX CANAUX REÇOIVENT AUTANT DE RÉFLEXIONS, et il faut l'imposer. Deux suites de velours
  // différentes ne portent pas la même énergie — leurs gains ne tombent pas aux mêmes endroits —,
  // si bien qu'un canal recevait plus de pièce que l'autre et que l'image se déplaçait : mesuré,
  // un rapport gauche/droite passé de 1,00 à 1,19 sur une entrée stéréo équilibrée. Dans une pièce
  // symétrique, les deux oreilles reçoivent autant de son réfléchi ; ce qui diffère est le MOTIF,
  // pas la quantité, et c'est le motif seul qui décorrèle.
  const eg = efficace(wetG), ed = efficace(wetD);
  const cible = (eg + ed) / 2;
  if (eg > 1e-12) for (let i = 0; i < wetG.length; i++) wetG[i] *= cible / eg;
  if (ed > 1e-12) for (let i = 0; i < wetD.length; i++) wetD[i] *= cible / ed;

  // UN SEUL CHEMIN DE CALCUL, modulé ou non. L'absence de courbe est une courbe constante à la
  // valeur du réglage — c'est la convention de `courbe.ts`, et elle évite d'avoir deux façons de
  // mélanger qui pourraient diverger : un jour l'une des deux oublierait la borne, ou la
  // normalisation, et rien ne le dirait.
  const m = melangeParEchantillon(o, gauche.length);
  const sortieG = new Float32Array(gauche.length);
  const sortieD = new Float32Array(droite.length);
  for (let i = 0; i < gauche.length; i++) sortieG[i] = gauche[i] + m[i] * wetG[i];
  for (let i = 0; i < droite.length; i++) sortieD[i] = droite[i] + m[i] * wetD[i];

  // CHAQUE CANAL RETROUVE SON PROPRE NIVEAU D'ENTRÉE, et j'avais d'abord écrit l'inverse en
  // croyant qu'une correction commune protégerait l'image. C'est le contraire : ramener chaque
  // canal à SON niveau préserve exactement leur rapport, tandis qu'une correction commune le
  // laisse dériver — l'énergie de la somme dépend de la corrélation entre le son direct et ses
  // réflexions, qui n'est pas la même des deux côtés. Mesuré sur une entrée stéréo équilibrée : un
  // rapport gauche/droite passé de 1,00 à 1,43 avec la correction commune.
  //
  // Et cela n'annule pas la décorrélation, qui tient au MOTIF des réflexions et non à leur niveau.
  for (const [entree, sortie] of [[gauche, sortieG], [droite, sortieD]] as const) {
    const avant = efficace(entree as Float32Array);
    const apres = efficace(sortie);
    if (apres > 1e-12 && avant > 0) {
      const k = avant / apres;
      for (let i = 0; i < sortie.length; i++) sortie[i] *= k;
    }
  }
  return [sortieG, sortieD];
}

/**
 * Ce que la somme mono garde, entre 0 et 1.
 *
 * LE PLANCHER N'EST PAS ZÉRO, ET C'EST CE QU'IL FAUT SAVOIR POUR LIRE CE CHIFFRE. Deux canaux
 * parfaitement décorrélés donnent **1/√2 ≈ 0,707** : leurs énergies s'ajoutent quand leurs
 * amplitudes se moyennent, et la géométrie ne permet pas mieux. Un élargisseur qui atteint 0,71
 * en étant complètement décorrélé n'a donc rien perdu — il paie exactement ce que la largeur
 * coûte. Le vrai défaut, celui des élargisseurs bon marché, est de descendre SOUS ce plancher :
 * là, les phases se détruisent activement et le centre se creuse.
 */
export function tenueEnMono(g: Float32Array, d: Float32Array): number {
  const n = Math.min(g.length, d.length);
  const somme = new Float32Array(n);
  for (let i = 0; i < n; i++) somme[i] = (g[i] + d[i]) / 2;
  const reference = (efficace(g.subarray(0, n)) + efficace(d.subarray(0, n))) / 2;
  return reference > 1e-12 ? efficace(somme) / reference : 1;
}

/**
 * La tenue en mono qu'une corrélation donnée IMPOSE : √((1+ρ)/2).
 *
 * C'EST CE CHIFFRE-LÀ QU'IL FAUT COMPARER, et non une constante. Le plancher de 0,707 ne vaut que
 * pour une corrélation exactement nulle ; une corrélation légèrement négative descend dessous sans
 * qu'aucune phase ne se détruise anormalement. Mesuré dans l'application : une corrélation de
 * −0,06 donne 0,68, et la formule en prédit 0,686 — tout est en ordre. Un seuil fixe à 0,707
 * aurait crié au défaut sur un résultat parfaitement sain.
 *
 * Le vrai défaut est un écart ENTRE la tenue mesurée et celle-ci : là, quelque chose s'annule que
 * la corrélation seule n'explique pas.
 */
export const tenueAttendue = (correlation: number) => Math.sqrt(Math.max(0, (1 + correlation) / 2));
