// audio/symboles-accords.ts — Le seul lecteur des symboles d'accords, « Am7 », « Bø7 », « D/F# », « N.C. ».
//
// LA REVUE DES NOTATIONS EN TEXTE, cinquième format, 2026-11-22. Chaque nœud lisait les symboles
// par Tonal à sa façon, et ils ne se répondaient pas : l'ABC ramenait « ø », les parenthèses et
// « m(maj7) » à l'écriture de Tonal, la Grille les refusait, « Accords → Notation » les perdait sans
// les nommer ; « Δ7 », « ♭ » et « ♯ » n'étaient lus nulle part. Décisions de Fabien du 2026-11-22 :
// un seul lecteur, qui lit les écritures usuelles, et « N.C. » est un accord silencieux.
//
// CE QUI EST RAMENÉ À L'ÉCRITURE DE TONAL, une par une, et rien d'autre : les signes d'imprimerie
// « ♭ » et « ♯ », les parenthèses d'altération (« Bm7(b5) »), « m(maj7) », « ø » et « ø7 », « Δ » et
// « Δ7 », « min7b5 », que le détecteur d'accords écrivait, « 6/9 », dont la barre oblique n'est pas
// une basse, et une fondamentale en minuscule. Un symbole que Tonal ne lit toujours pas reste inconnu,
// et chaque nœud le refuse en le nommant.

import { Chord, Interval, Note } from "tonal";
import { QUALITES, qualiteDe } from "./qualites-accords";
import { reconnaitreAccord } from "./reconnaitre-accord";

/** « N.C. », « NC » : pas d'accord. Il prend sa place dans le temps, en silence. */
export const estSansAccord = (symbole: string): boolean => /^N\.?C\.?$/i.test(symbole.trim());

/** Le symbole ramené à l'écriture de Tonal. */
export function normaliserSymbole(symbole: string): string {
  return symbole.trim()
    .replace(/^([a-g])/, (x) => x.toUpperCase())
    .replace(/♭/g, "b")
    .replace(/♯/g, "#")
    .replace(/\(([^)]*)\)/g, "$1") // Bm7(b5) → Bm7b5, C(add9) → Cadd9
    .replace(/m\s*maj7/i, "mMaj7") // Cm(maj7) → CmMaj7
    .replace(/ø7?/, "m7b5") // Bø, Bø7 → Bm7b5
    .replace(/Δ7?/, "maj7") // CΔ, CΔ7 → Cmaj7
    .replace(/min7b5/, "m7b5") // Bmin7b5 → Bm7b5
    .replace(/6\/9/, "69"); // F6/9 → F69 : ce 9 n'est pas une basse
}

/** Les qualités de la table d'Attic, par leur symbole ramené à l'écriture de Tonal : « m7b5 », « 7b5b9 ». */
const TABLE = new Map(QUALITES.map((q) => [normaliserSymbole(`C${q.symbole}`).slice(1), q]));

/**
 * L'accord que le symbole nomme, ou null s'il n'en nomme aucun. « N.C. » n'en nomme aucun.
 *
 * LA TABLE D'ATTIC L'EMPORTE SUR TONAL LÀ OÙ ELLES DIFFÈRENT, et elles diffèrent sur trois qualités
 * sur trente-trois, mesuré le 2026-11-22 : Tonal lit « 7b5b9 » et « 7b5#9 » avec une quinte juste en
 * plus de la quinte altérée, que l'usage remplace, et « m13 » sans la onzième que la table garde. Un
 * symbole écrit d'après la table se relisait donc avec une note de trop ou de moins. Les notes de
 * Tonal sont gardées, dans leur ordre et leur orthographe, quand la table les connaît ; celles qui
 * manquent s'ajoutent par leur intervalle depuis la fondamentale ; la basse d'un renversement reste.
 */
export function accordDuSymbole(symbole: string): ReturnType<typeof Chord.get> | null {
  if (estSansAccord(symbole)) return null;
  const n = normaliserSymbole(symbole);
  const c = Chord.get(n);
  if (c.empty || c.notes.length === 0) return null;
  const m = /^([A-G][#b]*)([^/]*)(?:\/(.+))?$/.exec(n);
  const q = m ? TABLE.get(m[2]) : undefined;
  if (!q || !c.tonic) return c;
  const racine = Note.chroma(c.tonic)!;
  const classes = new Map(q.intervalles.map((i) => [(racine + i) % 12, i]));
  const gardees = c.notes.filter((x) => classes.has(Note.chroma(x)!) || x === m![3]);
  const manquantes = [...classes].filter(([k]) => !gardees.some((x) => Note.chroma(x) === k))
    .map(([, i]) => Note.pitchClass(Note.transpose(c.tonic!, Interval.fromSemitones(i))));
  return { ...c, notes: [...gardees, ...manquantes] };
}

/**
 * Les hauteurs de notes écrites, « C E G » ou « E3 C4 G4 », ou null si l'une ne se lit pas. Sans
 * octave, chaque note se pose au-dessus de la précédente : la première écrite est la basse.
 */
function hauteursEcrites(noms: readonly string[]): number[] | null {
  const hauteurs: number[] = [];
  for (const nom of noms) {
    const n = Note.get(nom);
    if (n.empty) return null;
    if (n.midi !== null) { hauteurs.push(n.midi); continue; }
    let m = 60 + n.chroma;
    while (hauteurs.length && m <= hauteurs[hauteurs.length - 1]) m += 12;
    hauteurs.push(m);
  }
  return hauteurs;
}

/**
 * Le symbole que des notes forment, « C », « Bm7b5 », « C/E », relisible par `accordDuSymbole`, ou
 * null si elles n'en forment aucun.
 *
 * DÉCISION DE FABIEN DU 2026-11-22, « A readable symbol ». L'Accord rendait la première lecture de
 * `Chord.detect` et son nom long : « E G C » devenait « E minor augmented », et « C major » ne se
 * relisait nulle part. La reconnaissance passe d'abord par la table d'Attic (`reconnaitreAccord`),
 * où la basse tranche entre deux lectures : un accord exact s'écrit par son symbole, la fondamentale
 * et la basse dans l'orthographe des notes reçues, et un renversement par barre oblique. Un ensemble
 * que la table ne nomme pas exactement revient à Tonal, dont le symbole se relit par définition.
 */
export function symboleDesNotes(noms: readonly string[]): string | null {
  const hauteurs = hauteursEcrites(noms);
  if (!hauteurs) return null;
  const orthographe = (classe: number) => Note.pitchClass(noms.find((n) => Note.chroma(n) === classe) ?? Note.fromMidi(60 + classe));
  const r = reconnaitreAccord(hauteurs);
  const q = r?.exact ? qualiteDe(r.qualite) : undefined;
  if (r && q) {
    const symbole = normaliserSymbole(`${orthographe(r.fondamentale)}${q.symbole}`);
    const basse = ((Math.min(...hauteurs) % 12) + 12) % 12;
    return basse === r.fondamentale ? symbole : `${symbole}/${orthographe(basse)}`;
  }
  return Chord.detect(noms.map((n) => Note.pitchClass(n)))[0] ?? null;
}

/** Les symboles que le lecteur ne lit pas ; « N.C. » est lu. */
export const symbolesInconnus = (symboles: readonly string[]): string[] =>
  symboles.filter((s) => !estSansAccord(s) && accordDuSymbole(s) === null);
