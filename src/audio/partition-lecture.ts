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

/** L'identifiant de la note écrite, sans le suffixe qu'une reprise dépliée lui ajoute. */
const idEcrit = (id: string) => id.replace(/-rend\d+$/, "");

/**
 * Rend en séquence la partition que `tk` a chargée.
 *
 * `tempo` décide des secondes ; à zéro ou absent, c'est le tempo écrit dans la partition, et 120 à
 * défaut. Les positions de Verovio sont en noires, donc exactes quelle que soit la valeur choisie.
 */
export function lireDepuisVerovio(tk: ToolkitPartition, tempo?: number): PartitionLue {
  const { places, finsDeLiaison, noms } = lireMei(tk.getMEI({}));
  const carte = tk.renderToTimemap({});
  const tempoLu = carte.find((e) => typeof e.tempo === "number" && e.tempo > 0)?.tempo;
  const bpm = tempo && tempo > 0 ? tempo : tempoLu ?? 120;
  const noire = 60 / bpm;

  const cles = [...new Set([...places.values()].map((p) => `${p.portee}/${p.couche}`))]
    .map((c) => c.split("/").map(Number) as [number, number])
    .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const numero = new Map(cles.map(([p, c], i) => [`${p}/${c}`, i]));

  const hauteurs = new Map<string, number>();
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
  return { sequence: { notes, tempo: bpm, duree, voix: infos }, tempoLu, liees, sansVoix };
}
