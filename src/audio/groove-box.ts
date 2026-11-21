// audio/groove-box.ts — Groove box : progressions d'accords déterministes + mélodie de réservoir.
// Combine une grille harmonique fixe (I-IV-V-I...) avec une mélodie émergente
// générée par un réservoir de neurones aléatoires. La mélodie est quantisée
// aux notes de l'accord courant pour rester consonante.

import { writeMidi } from "midi-file";
import { resoudreRecouvrements } from "./midi-recouvrement";
import { genererReservoirMusical, type ConfigReservoir, type NoteGeneree } from "./reservoir";
import type { NoteMidi } from "./note";
import {
  PROGRESSIONS_GENRE,
  degresDesAccords,
  traduireCle,
} from "./generation";
import { quinteDuDegre, septiemeDuDegre, tierceDuDegre } from "./triades-gamme";
import { lireProgressionRomaine, romainDuDegre, type DegreLu } from "./romains-degres";
import { PATRONS_RYTHME, type Patron } from "./generation-patrons";

export interface ConfigGrooveBox {
  cle: string;
  gamme: string;
  genre: string;
  progression: string;
  // « aucune » : que des triades. « idiomatique » : la couleur est ajoutée là où le
  // genre la place (voir extensionIdiomatique). Les valeurs « septieme » et « sixte »
  // des projets enregistrés avant ce changement sont lues comme « idiomatique ».
  extension: "aucune" | "idiomatique" | "septieme" | "sixte";
  tempo: number;
  dureeAccord: number;
  nbAccords: number;
  styleRythme: string;
  // réservoir
  neurones: number;
  connectivite: number;
  memoire: number;
  spectre: number;
  octave: number;
  densite: number;
  repetition: number;
  silence: number;
  graine: number;
}

export type NoteGroove = NoteMidi;

export interface ResultatGrooveBox {
  midiBytes: Uint8Array;
  midiAccords: Uint8Array;
  midiBasse: Uint8Array;
  midiMelodie: Uint8Array;
  midiBatterie: Uint8Array;
  notes: NoteGroove[];
  /**
   * La progression jouée, en chiffres romains : « I–VI–IV–V ».
   *
   * LE MESSAGE QUI L'ANNONCE SE COMPOSE DANS LE COMPOSANT, ET NON ICI. Il était écrit ici, à partir
   * des identifiants de la gamme et du style, et il s'affichait donc en français dans l'interface
   * anglaise : « C majeur · 15 neurones ». Les libellés du menu, dans les deux langues, sont à la
   * fiche ; ce module-ci ne connaît pas la langue de l'interface.
   */
  progressionTexte: string;
  /** Les chiffres de la progression personnalisée qui ne se jouent pas, que le message nomme. */
  chiffresAlteres: string[];
  chiffresInconnus: string[];
  graineUtilisee: number;
}

/**
 * La progression jouée, et les chiffres refusés.
 *
 * UNE PROGRESSION PERSONNALISÉE SE LIT EN DEGRÉS (`romains-degres.ts`), décision de Fabien du
 * 2026-11-21 : « V7 », « vii° » et « bVII » étaient jetés sans un mot, et « V7-bVII » devenait le I.
 * Le 7 demande la septième de la gamme ; un chiffre refusé ne se joue pas ; s'il n'en reste aucun,
 * le I seul, comme avant.
 */
function progressionDepuisConfig(config: ConfigGrooveBox): { degres: DegreLu[]; alteres: string[]; inconnus: string[] } {
  if (config.genre === "custom" || config.genre === "personnalisé") {
    const lu = lireProgressionRomaine(config.progression);
    return { ...lu, degres: lu.degres.length > 0 ? lu.degres : [{ degre: 0, septieme: false }] };
  }
  const progressions = PROGRESSIONS_GENRE[config.genre] || PROGRESSIONS_GENRE["pop"];
  return { degres: progressions[0].map((degre) => ({ degre, septieme: false })), alteres: [], inconnus: [] };
}

// Tierce et quinte bâties un degré sur deux dans la gamme (`triades-gamme.ts`),
// la règle de Fabien du 2026-11-21. Elles se cherchaient comme la note la plus
// proche de quatre et de sept demi-tons, ce qui rendait le v du mineur, du dorien
// et du mixolydien en sus4. Sur une gamme pentatonique, un degré sur deux ne donne
// plus une tierce et une quinte classiques, et c'est voulu : aucune note ne sort
// de la gamme. Extension optionnelle (7e) en 4e note.
/**
 * La couleur ajoutée à un accord, SELON LE GENRE ET LE DEGRÉ — ou rien.
 *
 * Le réglage ajoutait une 7e ou une 6e à TOUS les accords. Musicalement cela n'a pas de
 * sens : une septième se pose là où le style la pose, pas partout. Ici la règle suit
 * l'usage, et le degré est reconnu par son intervalle à la tonique plutôt que par son
 * rang, pour rester juste sur une gamme pentatonique où le 5e degré n'est pas la
 * dominante.
 *
 *   jazz, blues   septième sur chaque accord — c'est l'idiome même de ces styles
 *                 (ii7-V7-Imaj7 en jazz, I7-IV7-V7 en blues) ;
 *   ambient       septième sur la tonique et la sous-dominante, les accords tenus qu'on
 *                 colore, et rien sur le reste ;
 *   les autres    septième sur la dominante seule, la seule que pop, rock, classique ou
 *                 reggae emploient couramment.
 *
 * La QUALITÉ de la note ajoutée n'est pas décidée ici : `septiemeDuDegre` prend la
 * septième diatonique, donc mineure sur la dominante — un vrai accord de septième de
 * dominante — et majeure sur la tonique en majeur.
 */
function extensionIdiomatique(genre: string, racinePc: number): "septieme" | undefined {
  const g = genre.toLowerCase();
  if (g === "jazz" || g === "blues") return "septieme";
  if (g === "ambient") return racinePc === 0 || racinePc === 5 ? "septieme" : undefined;
  return racinePc === 7 ? "septieme" : undefined;
}

function notesAccord(
  degre: number,
  decalage: number,
  degres: number[],
  extension: ConfigGrooveBox["extension"] = "aucune",
  genre = "pop",
  septiemeEcrite = false,
): number[] {
  const racinePc = degres[degre % degres.length];
  const root = 36 + decalage + racinePc + Math.floor(degre / degres.length) * 12;
  const third = root + tierceDuDegre(degres, racinePc);
  const fifth = root + quinteDuDegre(degres, racinePc);
  const notes = [root, third, fifth];
  // « septieme » et « sixte » viennent de projets enregistrés avant : ils demandaient la
  // couleur partout, on la place désormais là où elle se justifie.
  const couleur = extension === "aucune" ? undefined : extensionIdiomatique(genre, racinePc);
  // Un « 7 » écrit dans la progression demande la septième, quel que soit le genre.
  if (couleur === "septieme" || septiemeEcrite) notes.push(root + septiemeDuDegre(degres, racinePc));
  return notes;
}

function genererNotesAccordsEtBasse(
  progression: readonly DegreLu[],
  config: ConfigGrooveBox,
  degres: number[],
  decalage: number,
): NoteGroove[] {
  const notes: NoteGroove[] = [];
  const noire = 60 / config.tempo;
  const dureeSecAccord = config.dureeAccord * noire;

  for (let i = 0; i < config.nbAccords; i++) {
    const deb = i * dureeSecAccord;
    const fin = deb + dureeSecAccord;
    const { degre: deg, septieme } = progression[i % progression.length];
    const [root, third, fifth, extension] = notesAccord(deg, decalage, degres, config.extension, config.genre, septieme);

    // Accord (canal 0)
    // Vélocités baissées d'environ 2 dB (75 → 60) pour dégager la mélodie : trois notes
    // tenues ensemble couvrent une ligne seule, et la mesure donnait l'accompagnement
    // 10 dB au-dessus d'elle. Le rapport entre les degrés de l'accord est conservé.
    notes.push({ note: root, velocite: 60, debut: deb, fin, canal: 0 });
    notes.push({ note: third, velocite: 56, debut: deb, fin, canal: 0 });
    notes.push({ note: fifth, velocite: 52, debut: deb, fin, canal: 0 });
    if (extension !== undefined) notes.push({ note: extension, velocite: 48, debut: deb, fin, canal: 0 });

    // Basse (canal 1)
    notes.push({ note: root - 12, velocite: 84, debut: deb, fin, canal: 1 });
  }

  return notes;
}

function quantifierReservoirSurAccord(
  noteReservoir: NoteGeneree,
  progression: readonly DegreLu[],
  config: ConfigGrooveBox,
  degres: number[],
  decalage: number,
): NoteGroove {
  const noire = 60 / config.tempo;
  const dureeSecAccord = config.dureeAccord * noire;
  const idxChord = Math.min(
    Math.max(0, Math.floor(noteReservoir.debut / dureeSecAccord)),
    config.nbAccords - 1,
  );
  const { degre: deg, septieme } = progression[idxChord % progression.length];
  const chordTones = notesAccord(deg, decalage, degres, config.extension, config.genre, septieme);

  // Trouve la hauteur de l'accord la plus proche de la note du réservoir
  let nearest = chordTones[0];
  let bestDist = Infinity;
  for (const t of chordTones) {
    const octaveShift = 12 * Math.round((noteReservoir.note - t) / 12);
    const candidate = Math.max(0, Math.min(127, t + octaveShift));
    const dist = Math.abs(noteReservoir.note - candidate);
    if (dist < bestDist) {
      bestDist = dist;
      nearest = candidate;
    }
  }

  return {
    note: nearest,
    velocite: noteReservoir.velocite,
    debut: noteReservoir.debut,
    fin: noteReservoir.debut + noteReservoir.duree,
    canal: 2,
  };
}

function genererNotesBatterie(config: ConfigGrooveBox): NoteGroove[] {
  const notes: NoteGroove[] = [];
  const mesures = Math.max(1, Math.ceil((config.nbAccords * config.dureeAccord) / 4));
  const pasParMesure = 16;
  const totalPas = mesures * pasParMesure;
  const tempsPas = (60 / config.tempo) / 4;

  const entree = PATRONS_RYTHME[config.styleRythme];
  const signatureCle = "4/4";
  const patron: Patron =
    entree && entree.signatures.includes(signatureCle)
      ? entree.positions[signatureCle]!
      : { kick: [0, 8], snare: [4, 12], hat: [0, 2, 4, 6, 8, 10, 12, 14], hatOuvert: [] };

  for (let p = 0; p < totalPas; p++) {
    const t = p * tempsPas;
    const pos = p % pasParMesure;
    if (patron.kick.includes(pos)) {
      notes.push({ note: 36, velocite: 100, debut: t, fin: t + 0.05, canal: 9 });
    }
    if (patron.snare.includes(pos)) {
      notes.push({ note: 38, velocite: 85, debut: t, fin: t + 0.05, canal: 9 });
    }
    if (patron.hat.includes(pos)) {
      notes.push({ note: 42, velocite: 65, debut: t, fin: t + 0.03, canal: 9 });
    }
    if (patron.hatOuvert.includes(pos)) {
      notes.push({ note: 46, velocite: 75, debut: t, fin: t + 0.05, canal: 9 });
    }
  }

  return notes;
}

// `deltaTime` porte encore le tick absolu à ce stade : il est converti en délai juste
// après le tri. L'ordre à l'intérieur d'un tick est celui de `comparerEvenementsMidi` —
// réglages, note-off, puis note-on. Il était inversé, et une note relancée à la même
// hauteur sur le même canal était refermée par le note-off de la précédente à l'instant
// même où elle s'ouvrait : durée nulle, donc silence. Un accord tenu jusqu'au suivant est
// dans ce cas dès que deux degrés consécutifs partagent une note — et toujours, en blues,
// dont la progression est I–I–I–I.
//
// ET LA MÊME HAUTEUR REJOUÉE AVANT D'ÊTRE RELÂCHÉE EST LEVÉE ICI, pour les deux écrivains de ce
// fichier à la fois : le réservoir mélodique rend des notes dont la durée dépasse le pas, si bien
// qu'une hauteur répétée se recouvrait elle-même. Voir `midi-recouvrement.ts`.
function trierPiste(events: any[]): any[] {
  const resolus = resoudreRecouvrements(events.map((e) => ({ ...e, tick: e.deltaTime })));
  let tick = 0;
  const sorted: any[] = [];
  for (const { tick: absolu, deltaTime: _ignore, ...reste } of resolus) {
    sorted.push({ ...reste, deltaTime: absolu - tick });
    tick = absolu;
  }
  sorted.push({ deltaTime: 0, type: "endOfTrack" });
  return sorted;
}

function midiCanalUnique(
  notes: NoteGroove[],
  canal: number,
  config: ConfigGrooveBox,
  initEvents: any[],
): Uint8Array {
  const tpm = 480;
  const microsecParBeat = (60 / config.tempo) * 1_000_000;
  const notesCanal = notes.filter((n) => n.canal === canal);
  // CHAQUE PARTIE GARDE LE TEMPS DE LA PIÈCE, et non celui de sa première note. Elle se recalait sur
  // la sienne : une mélodie qui commence par un silence sortait en avance sur le son du nœud, et sur
  // les trois autres parties une fois réunies (2026-11-21, `midi-silence-de-tete.test.ts`).
  const secEnTicks = (sec: number) => Math.max(0, Math.round((sec / 60) * config.tempo * tpm));

  const pisteTempo: any[] = [
    { deltaTime: 0, type: "setTempo", microsecondsPerBeat: microsecParBeat },
    { deltaTime: 0, type: "timeSignature", numerator: 4, denominator: 4, channel: 0 },
  ];
  const pisteCanal: any[] = [...initEvents];
  for (const n of notesCanal) {
    const td = secEnTicks(n.debut);
    const tf = Math.max(td + 1, secEnTicks(n.fin));
    pisteCanal.push({ deltaTime: td, type: "noteOn", channel: canal, noteNumber: n.note, velocity: n.velocite });
    pisteCanal.push({ deltaTime: tf, type: "noteOff", channel: canal, noteNumber: n.note, velocity: 0 });
  }

  const midi = {
    header: { format: 1 as const, numTracks: 2, ticksPerBeat: tpm },
    tracks: [trierPiste(pisteTempo), trierPiste(pisteCanal)],
  };
  return new Uint8Array(writeMidi(midi));
}

export function genererGrooveBox(config: ConfigGrooveBox): ResultatGrooveBox {
  const degres = degresDesAccords(config.gamme);
  const decalage = traduireCle(config.cle);
  const { degres: progression, alteres: chiffresAlteres, inconnus: chiffresInconnus } = progressionDepuisConfig(config);

  const notes: NoteGroove[] = genererNotesAccordsEtBasse(progression, config, degres, decalage);

  // Génération mélodique par réservoir
  const pasParBeat = 2;
  const mesuresReservoir = Math.max(1, Math.ceil((config.nbAccords * config.dureeAccord) / 4));
  const configReservoir: ConfigReservoir = {
    taille: config.neurones,
    connectivite: config.connectivite,
    leaking: config.memoire,
    gain: 1.5,
    spectre: config.spectre,
    cle: config.cle,
    gamme: config.gamme,
    octave: config.octave,
    tempo: config.tempo,
    pasParBeat,
    mesures: mesuresReservoir,
    volume: 85,
    timbre: "Triangle",
    graine: config.graine,
    probaNote: config.densite,
    repetition: config.repetition,
    silence: config.silence,
  };
  const { notes: notesReservoir, graineUtilisee } = genererReservoirMusical(configReservoir);

  for (const nr of notesReservoir) {
    if (nr.silence) continue;
    notes.push(quantifierReservoirSurAccord(nr, progression, config, degres, decalage));
  }

  // Batterie
  notes.push(...genererNotesBatterie(config));

  // Construction du MIDI multi-pistes (combinaison + 4 pistes séparées)
  const tpm = 480;
  const microsecParBeat = (60 / config.tempo) * 1_000_000;
  // LE MIDI COMBINÉ GARDE LE TEMPS DE SES NOTES, comme chaque partie : il se recalait sur la toute
  // première, ce qui ne changeait rien tant que les accords partent de zéro, et l'aurait fait sinon.
  const secEnTicks = (sec: number) => Math.max(0, Math.round((sec / 60) * config.tempo * tpm));

  const pisteAccords: any[] = [
    { deltaTime: 0, type: "setTempo", microsecondsPerBeat: microsecParBeat },
    { deltaTime: 0, type: "timeSignature", numerator: 4, denominator: 4, channel: 0 },
    { deltaTime: 0, type: "programChange", channel: 0, programNumber: 0 },
  ];
  const pisteBasse: any[] = [
    { deltaTime: 0, type: "programChange", channel: 1, programNumber: 33 },
  ];
  const pisteMelodie: any[] = [
    { deltaTime: 0, type: "programChange", channel: 2, programNumber: 80 },
  ];
  const pisteBatterie: any[] = [
    { deltaTime: 0, type: "controller", channel: 9, controllerType: 0, value: 1 },
    { deltaTime: 0, type: "controller", channel: 9, controllerType: 32, value: 0 },
    { deltaTime: 0, type: "programChange", channel: 9, programNumber: 0 },
  ];

  for (const n of notes) {
    const piste = n.canal === 0 ? pisteAccords : n.canal === 1 ? pisteBasse : n.canal === 2 ? pisteMelodie : pisteBatterie;
    const td = secEnTicks(n.debut);
    const tf = Math.max(td + 1, secEnTicks(n.fin));
    piste.push({ deltaTime: td, type: "noteOn", channel: n.canal, noteNumber: n.note, velocity: n.velocite });
    piste.push({ deltaTime: tf, type: "noteOff", channel: n.canal, noteNumber: n.note, velocity: 0 });
  }

  const midi = {
    header: { format: 1 as const, numTracks: 4, ticksPerBeat: tpm },
    tracks: [trierPiste(pisteAccords), trierPiste(pisteBasse), trierPiste(pisteMelodie), trierPiste(pisteBatterie)],
  };
  const midiBytes = new Uint8Array(writeMidi(midi));

  const midiAccords = midiCanalUnique(notes, 0, config, [
    { deltaTime: 0, type: "programChange", channel: 0, programNumber: 0 },
  ]);
  const midiBasse = midiCanalUnique(notes, 1, config, [
    { deltaTime: 0, type: "programChange", channel: 1, programNumber: 33 },
  ]);
  const midiMelodie = midiCanalUnique(notes, 2, config, [
    { deltaTime: 0, type: "programChange", channel: 2, programNumber: 80 },
  ]);
  const midiBatterie = midiCanalUnique(notes, 9, config, [
    { deltaTime: 0, type: "controller", channel: 9, controllerType: 0, value: 1 },
    { deltaTime: 0, type: "controller", channel: 9, controllerType: 32, value: 0 },
    { deltaTime: 0, type: "programChange", channel: 9, programNumber: 0 },
  ]);

  const progressionTexte = progression.map(romainDuDegre).join("–");

  return { midiBytes, midiAccords, midiBasse, midiMelodie, midiBatterie, notes, progressionTexte, chiffresAlteres, chiffresInconnus, graineUtilisee };
}
