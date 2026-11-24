// audio/partition-lecture.ts — Une partition chargée dans Verovio, rendue en séquence à voix.
//
// POURQUOI PAS LE MIDI DE VEROVIO, mesuré le 2026-11-22 sur une pièce à deux portées de deux voix :
// `renderToMIDI` rend UNE PISTE PAR PORTÉE, toutes au canal 0, le soprano et l'alto fondus dans la
// même. Lu par `analyserMidi`, un choral à deux portées n'avait plus que deux voix, et rien ne
// permettait de les redéfaire, une note d'alto au-dessus du soprano s'y lisant comme du soprano.
//
// LA ROUTE PRISE, et chacune des trois pièces vient de Verovio lui-même :
//   · `renderToTimemap` dit quand chaque note s'attaque et s'arrête, en noires (`qstamp`) ;
//   · `getMEI` dit à quelle portée et à quelle couche appartient chaque note, et lesquelles sont
//     liées, par ses éléments `<tie startid endid>` ;
//   · `getMIDIValuesForElement` donne la hauteur d'une note par son identifiant.
// Une voix est une couche d'une portée. C'est la notion de la partition, et non une déduction tirée
// des hauteurs : deux voix qui se croisent restent deux voix.
//
// LES REPRISES NE SONT PAS DÉPLIÉES (`expandNever`, posé par l'appelant). Verovio déplie celles d'un
// MusicXML par défaut, en suffixant `-rend2` les identifiants de la seconde fois ; celles d'un Humdrum,
// relevé sur le choral n° 1 de Sapp, échouent sur « Element referenced in @plist not found ». Lire
// chaque mesure une fois, telle qu'elle est écrite, est la seule lecture qui soit la même partout.
//
// CE MODULE NE CHARGE PAS VEROVIO : il reçoit un toolkit déjà chargé, ce qui le laisse se tester
// sur le vrai moteur sous vitest et servir le nœud sans dépendre de la façon de le charger.

import type { Note } from "./note";
import type { InfoVoix, Sequence } from "./sequence";
import type { TonaliteLue } from "./corpus";
import { tonaliteDuMei } from "./corpus-mode";

/** Ce que ce module demande d'un toolkit Verovio chargé. */
export interface ToolkitPartition {
  getMEI(options: object): string;
  renderToTimemap(options: object): EntreeTemps[];
  getMIDIValuesForElement(id: string): { pitch: number; time: number; duration: number };
}

export interface EntreeTemps {
  qstamp: number;
  tstamp: number;
  tempo?: number;
  on?: string[];
  off?: string[];
}

export interface PartitionLue {
  sequence: Sequence;
  /** Le tempo écrit dans la partition, s'il y en a un. */
  tempoLu?: number;
  /** Les notes jointes à la précédente par une liaison. */
  liees: number;
  /** Les notes de la carte du temps dont le MEI ne dit ni la portée ni la couche. */
  sansVoix: number;
  /** La tonalité que la partition écrit, mode compris, ou `null` (`audio/corpus-mode.ts`). */
  tonaliteEcrite: TonaliteLue | null;
}

interface PlaceNote { portee: number; couche: number }

/** Les portées, couches et liaisons d'un MEI, lu balise par balise : le worker n'a pas de DOM. */
export function lireMei(mei: string): { places: Map<string, PlaceNote>; finsDeLiaison: Set<string>; noms: Map<number, string> } {
  const places = new Map<string, PlaceNote>();
  const finsDeLiaison = new Set<string>();
  const noms = new Map<number, string>();
  let portee: number | null = null;
  let couche: number | null = null;
  for (const m of mei.matchAll(/<(\/?)(staffDef|staff|layer|note|tie)\b([^>]*?)(\/?)>/g)) {
    const [, fin, balise, attrs] = m;
    const n = Number(/\bn="(\d+)"/.exec(attrs)?.[1]);
    if (balise === "staffDef") {
      const nom = /\blabel="([^"]+)"/.exec(attrs)?.[1];
      if (!fin && Number.isFinite(n) && nom) noms.set(n, nom);
    } else if (balise === "staff") {
      portee = fin ? null : n;
    } else if (balise === "layer") {
      couche = fin ? null : n;
    } else if (balise === "note" && !fin) {
      const id = /xml:id="([^"]+)"/.exec(attrs)?.[1];
      if (id && portee !== null && couche !== null) places.set(id, { portee, couche });
    } else if (balise === "tie" && !fin) {
      const vers = /\bendid="#?([^"]+)"/.exec(attrs)?.[1];
      if (vers) finsDeLiaison.add(vers);
    }
  }
  return { places, finsDeLiaison, noms };
}

/**
 * Les hauteurs d'un Humdrum `**kern`, lues dans son texte, par l'identifiant que Verovio donne à
 * chaque note : `note-L<ligne>F<colonne>`, et `S<rang>` pour une note d'accord.
 *
 * POURQUOI IL FAUT LES RELIRE, relevé le 2026-11-22 : l'import Humdrum de Verovio 6.3.0 perd les
 * altérations que l'armure porte. Sur le choral 2 de Sapp, en la majeur, le do dièse final du ténor
 * (`2.c#;`) ressort en do : le MEI ne porte ni `accid` ni `accid.ges` pour lui, et le MIDI que rend
 * Verovio lui-même dit 60. Le MusicXML, lui, sort juste, ses `<alter>` devenant des `accid.ges`.
 * Or en `**kern`, chaque note écrit son altération, quelle que soit l'armure : la hauteur est dans le
 * texte, et ce module la reprend là.
 *
 * LA NOTATION KERN : une minuscule est à l'octave du do central (`c` = 60), chaque lettre répétée
 * monte d'une octave (`cc` = 72) ; une majuscule est à l'octave d'en dessous (`C` = 48), chaque
 * lettre répétée descend d'une octave (`CC` = 36) ; `#` monte d'un demi-ton, `-` descend, `n` est
 * le bécarre ; `r` est un silence et `.` une case vide.
 */
export function hauteursHumdrum(texte: string): Map<string, number> {
  const hauteurs = new Map<string, number>();
  const BASE: Record<string, number> = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };
  texte.replace(/\r/g, "").split("\n").forEach((ligne, i) => {
    if (ligne === "" || /^[!*=]/.test(ligne)) return;
    ligne.split("\t").forEach((champ, j) => {
      const sous = champ.split(" ");
      sous.forEach((jeton, k) => {
        const m = /([a-gA-G])\1*/.exec(jeton);
        if (!m || jeton.includes("r") || jeton === ".") return;
        const lettre = m[1];
        const repetitions = m[0].length;
        const octave = lettre === lettre.toLowerCase() ? 4 + (repetitions - 1) : 3 - (repetitions - 1);
        const apres = jeton.slice(m.index + repetitions);
        const alteration = (apres.match(/^[#\-n]*/)?.[0] ?? "").split("").reduce((s, c) => s + (c === "#" ? 1 : c === "-" ? -1 : 0), 0);
        const midi = 12 * (octave + 1) + BASE[lettre.toLowerCase()] + alteration;
        const id = `note-L${i + 1}F${j + 1}${sous.length > 1 ? `S${k + 1}` : ""}`;
        hauteurs.set(id, midi);
      });
    });
  });
  return hauteurs;
}

/** L'identifiant de la note écrite, sans le suffixe qu'une reprise dépliée lui ajoute. */
const idEcrit = (id: string) => id.replace(/-rend\d+$/, "");

/**
 * Rend en séquence la partition que `tk` a chargée.
 *
 * `tempo` décide des secondes ; à zéro ou absent, c'est le tempo écrit dans la partition, et 120 à
 * défaut. Les positions de Verovio sont en noires, donc exactes quelle que soit la valeur choisie.
 *
 * `ecrites` DONNE LES HAUTEURS QUE VEROVIO NE SAIT PAS RENDRE, par identifiant de note : c'est le cas
 * du Humdrum (`hauteursHumdrum`). Une note absente de cette table prend la hauteur de Verovio.
 */
export function lireDepuisVerovio(tk: ToolkitPartition, tempo?: number, ecrites?: ReadonlyMap<string, number>): PartitionLue {
  const mei = tk.getMEI({});
  const { places, finsDeLiaison, noms } = lireMei(mei);
  const carte = tk.renderToTimemap({});
  const tempoLu = carte.find((e) => typeof e.tempo === "number" && e.tempo > 0)?.tempo;
  const bpm = tempo && tempo > 0 ? tempo : tempoLu ?? 120;
  const noire = 60 / bpm;

  const cles = [...new Set([...places.values()].map((p) => `${p.portee}/${p.couche}`))]
    .map((c) => c.split("/").map(Number) as [number, number])
    .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const numero = new Map(cles.map(([p, c], i) => [`${p}/${c}`, i]));

  const hauteurs = new Map<string, number>(ecrites ?? []);
  const hauteur = (id: string) => {
    if (!hauteurs.has(id)) hauteurs.set(id, tk.getMIDIValuesForElement(id).pitch);
    return hauteurs.get(id)!;
  };

  const notes: Note[] = [];
  const ouvertes = new Map<string, Note>();
  let liees = 0;
  let sansVoix = 0;
  for (const entree of carte) {
    const instant = entree.qstamp * noire;
    for (const id of entree.off ?? []) {
      const n = ouvertes.get(id);
      if (n) { n.fin = instant; ouvertes.delete(id); }
    }
    for (const id of entree.on ?? []) {
      const ecrit = idEcrit(id);
      const place = places.get(ecrit);
      if (!place) { sansVoix++; continue; }
      const voix = numero.get(`${place.portee}/${place.couche}`)!;
      const h = hauteur(ecrit);
      if (finsDeLiaison.has(ecrit)) {
        const avant = [...notes].reverse().find((n) => n.voix === voix && n.note === h && Math.abs(n.fin - instant) < 1e-9);
        if (avant) { ouvertes.set(id, avant); liees++; continue; }
      }
      const n: Note = { note: h, velocite: 80, debut: instant, fin: instant, voix };
      notes.push(n);
      ouvertes.set(id, n);
    }
  }
  const infos: InfoVoix[] = cles.map(([p, c], i) => {
    const couches = cles.filter(([q]) => q === p).length;
    const nom = noms.get(p);
    return { numero: i, nom: nom ? (couches > 1 ? `${nom} ${c}` : nom) : undefined };
  });
  notes.sort((a, b) => a.debut - b.debut || (a.voix ?? 0) - (b.voix ?? 0));
  const duree = carte.length ? carte[carte.length - 1].qstamp * noire : 0;
  return { sequence: { notes, tempo: bpm, duree, voix: infos }, tempoLu, liees, sansVoix, tonaliteEcrite: tonaliteDuMei(mei) };
}
