// audio/lecture-vive.ts — Régler un montage en l'entendant, sans le rendre à chaque fois.
//
// POURQUOI UN GRAPHE VIVANT, ET NON LE SON RENDU. Toucher un réglage périme le résultat du nœud : le
// nœud se relance, produit un autre fichier, et un lecteur dont on change la source repart de zéro.
// Régler en écoutant était donc impossible, alors que c'est le seul geste du montage. Ici les tampons
// des pistes sont montés en direct : un niveau se pose sur un `AudioParam` sans rien interrompre, un
// début ne reprogramme que sa piste, et les autres continuent de jouer.
//
// CE QUI EST ICI SE DÉMONTRE, et c'est pourquoi c'est séparé du crochet : ce qui sonne d'une piste,
// quelle suite donner à un changement, ce qui a bougé entre deux états, où en est la tête. Le Web
// Audio, lui, ne se joue pas sous vitest ; le crochet porte ce qui ne se teste pas.
//
// LE CALAGE ET LES FONDUS SONT CEUX DE L'APERÇU VIDÉO, aux mêmes fonctions près. Deux aperçus qui
// s'entendraient autrement que le rendu feraient deux mensonges au lieu d'un.

/** Ce qu'il faut savoir d'une piste pour l'entendre. Tout en secondes, comme la ligne de temps. */
export interface ReglagesVifs {
  /** L'instant où la piste commence. Négatif : le son est rogné d'autant, comme au rendu. */
  debutSec: number;
  dureeSec: number;
  gainDb: number;
  fonduEntreeSec: number;
  fonduSortieSec: number;
}

/** Les réglages d'une piste et l'identité de son son : un autre son ne se règle pas, il se reprend. */
export interface EtatPiste extends ReglagesVifs {
  son: unknown;
}

/** La portion d'une piste qui sonne vraiment : ce qui précède zéro est ôté. */
export interface Segment {
  /** L'instant où elle sonne, jamais négatif. */
  debutSec: number;
  /** Ce qu'il en reste à entendre. */
  dureeSec: number;
  /** Ce qui a été ôté du début du son. */
  rogneSec: number;
}

/**
 * Le segment sonnant d'une piste, ou `null` si elle ne sonne pas du tout.
 *
 * LE ROGNAGE ET LA REPRISE EN COURS SONT DEUX CHOSES, et les confondre change ce qu'on entend. Un
 * début négatif ôte le commencement du son, et le rendu réapplique le fondu d'entrée à CE QUI RESTE
 * (`monter`, dans `objets-sonores.ts`) : le segment rendu ici est donc un son à part entière, qui
 * commence à son rognage. Reprendre la lecture en son milieu, au contraire, laisse le fondu d'entrée
 * derrière soi. C'est `calerSource` qui traite ce second cas, sur le segment que celui-ci rend.
 */
export function segmentSonnant(r: Pick<ReglagesVifs, "debutSec" | "dureeSec">): Segment | null {
  const rogneSec = Math.max(0, -r.debutSec);
  const dureeSec = r.dureeSec - rogneSec;
  if (!(dureeSec > 0)) return null;
  return { debutSec: r.debutSec + rogneSec, dureeSec, rogneSec };
}

/** La suite à donner à un changement de réglages. */
export type Suite = "rien" | "niveau" | "reprogrammer";

/**
 * Ce qu'il faut faire quand les réglages d'une piste ont bougé.
 *
 * LE NIVEAU EST LE SEUL QUI SE POSE EN DIRECT, et c'est ce qui rend le réglage utilisable : un gain
 * est un facteur, donc un `AudioParam` qu'on écrit sans toucher à la source. Un début, une durée, un
 * fondu changent le moment ou la forme : on ne déplace pas une source déjà programmée, il faut la
 * reprendre. C'est pour cela que le niveau est distingué, et pour cela seulement.
 */
export function suiteAuChangement(avant: EtatPiste, apres: EtatPiste): Suite {
  if (
    avant.son !== apres.son
    || avant.debutSec !== apres.debutSec
    || avant.dureeSec !== apres.dureeSec
    || avant.fonduEntreeSec !== apres.fonduEntreeSec
    || avant.fonduSortieSec !== apres.fonduSortieSec
  ) return "reprogrammer";
  return avant.gainDb !== apres.gainDb ? "niveau" : "rien";
}

/** Ce qui a bougé entre deux états du montage, piste par piste. */
export interface Differences {
  aDemarrer: number[];
  aArreter: number[];
  aReprogrammer: number[];
  aRegler: number[];
}

/**
 * Le travail à faire pour passer d'un état à l'autre.
 *
 * ON NE REPREND QUE CE QUI A BOUGÉ, et c'est là tout l'intérêt : régler la piste trois ne doit pas
 * faire hoqueter les pistes une et deux. Tout reprogrammer à chaque changement s'entendrait comme un
 * arrêt du montage entier, ce qui est exactement ce qu'on veut éviter.
 */
export function differencePistes(
  avant: ReadonlyMap<number, EtatPiste>,
  apres: ReadonlyMap<number, EtatPiste>,
): Differences {
  const d: Differences = { aDemarrer: [], aArreter: [], aReprogrammer: [], aRegler: [] };
  for (const k of avant.keys()) if (!apres.has(k)) d.aArreter.push(k);
  for (const [k, apr] of apres) {
    const av = avant.get(k);
    if (!av) { d.aDemarrer.push(k); continue; }
    const suite = suiteAuChangement(av, apr);
    if (suite === "reprogrammer") d.aReprogrammer.push(k);
    else if (suite === "niveau") d.aRegler.push(k);
  }
  const rang = (a: number, b: number) => a - b;
  d.aArreter.sort(rang); d.aDemarrer.sort(rang); d.aReprogrammer.sort(rang); d.aRegler.sort(rang);
  return d;
}

/** L'instant où le montage se tait, la dernière piste comprise. */
export function finDeMontage(pistes: Iterable<ReglagesVifs>): number {
  let fin = 0;
  for (const p of pistes) {
    const seg = segmentSonnant(p);
    if (seg) fin = Math.max(fin, seg.debutSec + seg.dureeSec);
  }
  return fin;
}

/** Le départ d'une lecture : l'instant visé, et l'horloge du contexte à ce moment-là. */
export interface Depart {
  /** L'instant du montage où la lecture a commencé. */
  t0: number;
  /** Ce que marquait l'horloge du contexte audio quand elle a commencé. */
  auCtx: number;
}

/**
 * La tête de lecture, l'horloge du contexte marquant `maintenant`, bornée par `fin`.
 *
 * L'HORLOGE EST CELLE DU SON, et c'est la seule qui ne dérive pas : `currentTime` d'un contexte audio
 * compte les échantillons réellement sortis. Compter le temps à part, avec l'horloge de la page,
 * décalerait peu à peu la tête de lecture de ce qu'on entend.
 *
 * ELLE NE PASSE PAS LA FIN DU MONTAGE, parce que cette horloge-là ne s'arrête jamais : ce qui arrête
 * la lecture est un minuteur, qui a sa marge, et le temps affiché irait sinon au-delà du dernier son.
 */
export function positionVive(depart: Depart, maintenant: number, fin = Infinity): number {
  return Math.min(fin, depart.t0 + Math.max(0, maintenant - depart.auCtx));
}

/**
 * L'instant où une lecture demandée à `demandee` commence vraiment.
 *
 * UNE TÊTE POSÉE À LA FIN OU AU-DELÀ REPART DU DÉBUT. Laisser la lecture commencer là paraissait
 * fidèle à ce qu'on demande, et c'était un piège : il n'y a rien à jouer passé le dernier son, donc
 * rien non plus qui arrête la lecture, et le temps croît alors sans fin. Le cas se présente à chaque
 * montage qu'on écoute jusqu'au bout, puis qu'on relance.
 *
 * ET LA LECTURE NE VA PAS AVANT ZÉRO : la sortie d'un montage commence à zéro, la part d'une piste
 * qui précède se voyant sans sonner.
 */
export function departDeLecture(demandee: number, fin: number): number {
  return demandee >= fin ? 0 : Math.max(0, demandee);
}
