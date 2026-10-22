// audio/parole-datee.ts — Garder d'un son les intervalles qu'un moteur de parole a datés.
//
// UNE SEULE OPÉRATION POUR DEUX NŒUDS. Un tour de parole et un mot sont la même chose vue de
// loin : un début, une fin, une étiquette. Isoler un locuteur et découper une suite de mots
// demandent donc le même travail — garder un jeu d'intervalles et taire le reste — et l'écrire
// deux fois les aurait fait diverger sur le fondu, qui est la seule partie délicate.
//
// POURQUOI LES INTERVALLES VOISINS SONT FONDUS AVANT TOUT AUTRE CALCUL. Les mots d'un aligneur se
// touchent : la fin de l'un est le début du suivant, à l'échantillon. Appliquer un fondu à chacun
// creuserait un trou au milieu d'une parole continue, un par mot. Le recollement n'est donc pas une
// commodité, c'est ce qui rend le fondu applicable.

/** Un intervalle daté, en secondes depuis le début du son. */
export type Intervalle = { debut: number; fin: number };

/** Un tour de parole : un intervalle, qui parle, et ce qui est dit. */
export type Tour = Intervalle & { locuteur: string; texte: string };

/** Un mot placé sur la parole. */
export type Mot = Intervalle & { mot: string };

/**
 * Les intervalles recollés quand ils se touchent ou se chevauchent.
 *
 * `ecartMax` est la distance en secondes en dessous de laquelle deux intervalles n'en font qu'un.
 * À zéro, seuls ceux qui se touchent exactement sont recollés.
 */
export function fusionnerVoisins<T extends Intervalle>(
  intervalles: readonly T[], ecartMax = 0,
): Intervalle[] {
  const propres = intervalles
    .filter((i) => Number.isFinite(i.debut) && Number.isFinite(i.fin) && i.fin > i.debut)
    .map((i) => ({ debut: i.debut, fin: i.fin }))
    .sort((a, b) => a.debut - b.debut);
  const sortie: Intervalle[] = [];
  for (const i of propres) {
    const dernier = sortie[sortie.length - 1];
    if (dernier && i.debut - dernier.fin <= ecartMax) {
      dernier.fin = Math.max(dernier.fin, i.fin);
    } else {
      sortie.push({ ...i });
    }
  }
  return sortie;
}

/** Ce que `garderIntervalles` accepte comme réglages. */
export type GardeOptions = {
  /** La durée du fondu aux deux bords de chaque intervalle gardé, en millisecondes. */
  fonduMs?: number;
  /** Vrai pour coller les intervalles bout à bout, faux pour les laisser à leur place. */
  coller?: boolean;
  /** La marge ajoutée de chaque côté de chaque intervalle, en secondes. */
  margeS?: number;
};

/** Le gain du fondu au rang `i` d'un segment de `longueur` échantillons. */
function gainFondu(i: number, longueur: number, fondu: number): number {
  if (fondu <= 0) return 1;
  if (i < fondu) return i / fondu;
  if (i >= longueur - fondu) return (longueur - 1 - i) / fondu;
  return 1;
}

/**
 * Le son réduit aux intervalles donnés.
 *
 * À `coller` faux, la sortie fait la longueur de l'entrée et tout ce qui n'est pas gardé est tu :
 * les instants de ce qui reste ne bougent pas, ce qui permet de le remettre contre l'original. À
 * `coller` vrai, les intervalles sont mis bout à bout et la sortie raccourcit d'autant.
 *
 * UN SON SANS AUCUN INTERVALLE GARDÉ REND UN ÉCHANTILLON ET NON ZÉRO : un `AudioBuffer` de longueur
 * nulle est refusé par la spécification, et le dépôt a déjà payé ce refus ailleurs.
 */
export function garderIntervalles(
  buffer: AudioBuffer, intervalles: readonly Intervalle[], options: GardeOptions = {},
): AudioBuffer {
  const sr = buffer.sampleRate;
  const marge = Math.max(0, options.margeS ?? 0);
  const elargis = intervalles.map((i) => ({
    debut: Math.max(0, i.debut - marge),
    fin: Math.min(buffer.length / sr, i.fin + marge),
  }));
  const gardes = fusionnerVoisins(elargis, 0)
    .map((i) => ({
      debut: Math.max(0, Math.min(buffer.length - 1, Math.floor(i.debut * sr))),
      fin: Math.max(0, Math.min(buffer.length, Math.ceil(i.fin * sr))),
    }))
    .filter((i) => i.fin > i.debut);

  const total = options.coller
    ? gardes.reduce((s, i) => s + (i.fin - i.debut), 0)
    : buffer.length;
  const sortie = new AudioBuffer({
    numberOfChannels: buffer.numberOfChannels,
    length: Math.max(1, total),
    sampleRate: sr,
  });

  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const src = buffer.getChannelData(c);
    const dst = sortie.getChannelData(c);
    let curseur = 0;
    for (const { debut, fin } of gardes) {
      const longueur = fin - debut;
      const fondu = Math.min(
        Math.floor((Math.max(0, options.fonduMs ?? 0) / 1000) * sr),
        Math.floor(longueur / 2),
      );
      const base = options.coller ? curseur : debut;
      for (let i = 0; i < longueur; i++) {
        dst[base + i] = src[debut + i] * gainFondu(i, longueur, fondu);
      }
      curseur += longueur;
    }
  }
  return sortie;
}

/** Les locuteurs rencontrés, dans l'ordre où ils prennent la parole. */
export function locuteursDe(tours: readonly Tour[]): string[] {
  const vus: string[] = [];
  for (const t of tours) if (t.locuteur && !vus.includes(t.locuteur)) vus.push(t.locuteur);
  return vus;
}

/** Un instant en minutes, secondes et centièmes. */
export function formaterInstant(secondes: number): string {
  const s = Math.max(0, secondes);
  const m = Math.floor(s / 60);
  const reste = s - m * 60;
  return `${String(m).padStart(2, "0")}:${reste.toFixed(2).padStart(5, "0")}`;
}

/** Les tours en texte, un par ligne : l'intervalle, le locuteur, puis ce qui est dit. */
export function formaterTours(tours: readonly Tour[]): string {
  return tours
    .map((t) => `${formaterInstant(t.debut)} – ${formaterInstant(t.fin)}  ${t.locuteur}`
      + (t.texte ? `  ${t.texte}` : ""))
    .join("\n");
}

/** Les mots en texte, un par ligne : son rang, son intervalle, puis le mot. */
export function formaterMots(mots: readonly Mot[]): string {
  return mots
    .map((m, i) => `${String(i + 1).padStart(4, " ")}  ${formaterInstant(m.debut)} – `
      + `${formaterInstant(m.fin)}  ${m.mot}`)
    .join("\n");
}

/**
 * La tranche de mots demandée, du rang `du` au rang `au`, comptés à partir de un.
 *
 * `au` à zéro ou au-delà du dernier mot va jusqu'au bout. Un `du` au-delà du dernier rend une
 * tranche vide, ce que l'appelant doit dire plutôt que de rendre le son entier.
 */
export function tranche<T>(elements: readonly T[], du: number, au: number): T[] {
  const premier = Math.max(1, Math.floor(du));
  const dernier = au <= 0 ? elements.length : Math.min(elements.length, Math.floor(au));
  if (premier > elements.length || dernier < premier) return [];
  return elements.slice(premier - 1, dernier);
}
