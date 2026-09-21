// audio/silences.ts — Rogner ce qui ne sonne pas.
//
// LE GESTE LE PLUS COURANT DU MONTAGE, ET IL MANQUAIT. Attic savait AJOUTER du silence, extraire
// une zone, aligner une piste sur une autre — mais pas retirer le blanc au début et à la fin d'une
// prise, qui est pourtant ce qu'on fait à chaque fichier qui entre dans un projet.
//
// LE SEUIL SE COMPTE EN DÉCIBELS, ET C'EST LA SEULE ÉCHELLE HONNÊTE. Un seuil linéaire à 0,01
// paraît petit et vaut −40 dBFS, c'est-à-dire un niveau où une respiration, une queue de
// réverbération ou un souffle de préampli vivent encore. En décibels, on sait ce qu'on coupe :
// −60 laisse passer presque tout ce qui s'entend, −40 rogne franchement.
//
// LA MARGE EXISTE PARCE QU'UN SEUIL SEUL COUPE TOUJOURS TROP. L'attaque d'un son monte depuis le
// silence : le premier échantillon au-dessus du seuil arrive déjà APRÈS le début de la montée, et
// rogner là donne un « clic » et une attaque tronquée. Quelques dizaines de millisecondes rendues
// avant et après suffisent, et c'est ce que fait toute station de travail.
//
// CE QUI EST MESURÉ EST L'ENVELOPPE, PAS L'ÉCHANTILLON. Une sinusoïde passe par zéro deux fois par
// période : au seul examen de l'échantillon, tout son contient des « silences » de quelques
// dixièmes de milliseconde. L'enveloppe est donc lissée sur une fenêtre courte avant comparaison,
// faute de quoi le mode « partout » découperait un la 440 en huit cent quatre-vingts morceaux.

export interface OptionsRognage {
  /** Seuil de silence, en dBFS. */
  seuilDb: number;
  /** Marge rendue de part et d'autre de ce qui sonne, en millisecondes. */
  margeMs: number;
  frequence: number;
  /** Fenêtre de lissage de l'enveloppe, en millisecondes. */
  fenetreMs?: number;
}

export interface Segment {
  debut: number;
  fin: number;
}

const FENETRE_DEFAUT_MS = 10;

/**
 * L'enveloppe efficace du signal, fenêtre glissante.
 *
 * Rendue par une somme courante : une fenêtre de dix millisecondes sur une heure de son ferait
 * dix-neuf milliards de multiplications en recalculant chaque fenêtre, et quatre-vingt-dix
 * millions en la faisant glisser.
 */
export function enveloppe(x: Float32Array, frequence: number, fenetreMs = FENETRE_DEFAUT_MS): Float32Array {
  const demi = Math.max(1, Math.round((fenetreMs / 1000) * frequence / 2));
  const out = new Float32Array(x.length);
  let somme = 0;
  for (let i = 0; i < x.length; i++) {
    somme += x[i] * x[i];
    if (i >= 2 * demi) somme -= x[i - 2 * demi] * x[i - 2 * demi];
    const largeur = Math.min(i + 1, 2 * demi);
    const centre = Math.max(0, i - demi);
    out[centre] = Math.sqrt(somme / largeur);
  }
  // La fin de l'enveloppe n'a pas été écrite : on la prolonge par sa dernière valeur connue.
  for (let i = Math.max(0, x.length - demi); i < x.length; i++) out[i] = out[Math.max(0, x.length - demi - 1)];
  return out;
}

/**
 * Les segments qui sonnent, marge comprise.
 *
 * Rendus fusionnés : deux segments que leurs marges font se toucher n'en font qu'un, sans quoi on
 * couperait un silence de dix millisecondes en deux morceaux de cinq.
 */
export function segmentsSonores(x: Float32Array, o: OptionsRognage): Segment[] {
  const seuil = Math.pow(10, o.seuilDb / 20);
  const env = enveloppe(x, o.frequence, o.fenetreMs);
  const marge = Math.max(0, Math.round((o.margeMs / 1000) * o.frequence));
  const out: Segment[] = [];
  let debut = -1;
  for (let i = 0; i < x.length; i++) {
    const sonore = env[i] >= seuil;
    if (sonore && debut < 0) debut = i;
    if (!sonore && debut >= 0) {
      out.push({ debut: Math.max(0, debut - marge), fin: Math.min(x.length, i + marge) });
      debut = -1;
    }
  }
  if (debut >= 0) out.push({ debut: Math.max(0, debut - marge), fin: x.length });

  const fusionnes: Segment[] = [];
  for (const s of out) {
    const dernier = fusionnes[fusionnes.length - 1];
    if (dernier && s.debut <= dernier.fin) dernier.fin = Math.max(dernier.fin, s.fin);
    else fusionnes.push({ ...s });
  }
  return fusionnes;
}

export interface ResultatRognage {
  /** Les intervalles à GARDER, dans l'ordre. */
  gardes: Segment[];
  /** Échantillons retirés. */
  retires: number;
}

/**
 * Ce qu'il faut garder d'un signal.
 *
 * `partout` décide de l'ambition : aux seuls bords, on ne touche pas à ce qui se passe au milieu —
 * un silence entre deux phrases fait partie du jeu, et le retirer change la musique. Partout, on
 * retire aussi les silences intérieurs plus longs que `dureeMinSec`, ce qui est un autre métier :
 * celui du montage de parole.
 */
export function planRognage(
  x: Float32Array, o: OptionsRognage & { partout?: boolean; dureeMinSec?: number },
): ResultatRognage {
  const segments = segmentsSonores(x, o);
  if (segments.length === 0) return { gardes: [], retires: x.length };

  if (!o.partout) {
    const garde = { debut: segments[0].debut, fin: segments[segments.length - 1].fin };
    return { gardes: [garde], retires: x.length - (garde.fin - garde.debut) };
  }
  // Partout : on recolle les segments dont le silence qui les sépare est trop court pour compter.
  const minimum = Math.max(0, Math.round((o.dureeMinSec ?? 0.5) * o.frequence));
  const gardes: Segment[] = [{ ...segments[0] }];
  for (let i = 1; i < segments.length; i++) {
    const precedent = gardes[gardes.length - 1];
    if (segments[i].debut - precedent.fin < minimum) precedent.fin = segments[i].fin;
    else gardes.push({ ...segments[i] });
  }
  const conserves = gardes.reduce((n, s) => n + (s.fin - s.debut), 0);
  return { gardes, retires: x.length - conserves };
}

/** Recolle les intervalles gardés, canal par canal. */
export function appliquerRognage(canaux: readonly Float32Array[], gardes: readonly Segment[]): Float32Array[] {
  const total = gardes.reduce((n, s) => n + (s.fin - s.debut), 0);
  return canaux.map((x) => {
    const out = new Float32Array(total);
    let ecrit = 0;
    for (const s of gardes) {
      out.set(x.subarray(s.debut, s.fin), ecrit);
      ecrit += s.fin - s.debut;
    }
    return out;
  });
}
