// plugins/effets-aides.ts — Les fabriques dont toutes les fiches d'effets se servent.
//
// POURQUOI CE MODULE. `effet`, `param` et `simple` construisent une fiche a partir de quelques
// arguments, et les soixante-quinze effets passent par elles. Les garder dans l'un des fichiers de
// fiches aurait fait de ce fichier-la le maitre des quatre autres, sans raison : une fabrique
// partagee est un sujet a elle seule.


import type { FicheAudio } from "../audio/types-domaine";
import { traduire } from "../i18n";
import { valeursParametre } from "../audio/courbe";
import { parseMidi } from "midi-file";
import { appliquerInstrumentMidi, analyserMidi, notesVersFichierMidi, rendreSequence } from "../audio";
import { rendreBatterieMidi } from "../audio/tone-synths";
import { type NoteMotif } from "../audio/motifs-midi";
import { PARAMETRE_INSTRUMENT_SF2, PARAMETRE_SYNTHESE, decoderInstrumentSF2, normaliserModeSynthèse, sf2Chargee } from "./soundfontGlobal";
import { parCanal } from "./hors-fil";


// `graine` PORTE LE MÊME RÔLE QU'AILLEURS : ces réglages-ci se fabriquent par `param()`, et sans
// ce champ ils n'auraient pas pu le déclarer. Voir `core/types.ts` pour ce que le moteur en fait.
export type ParamEffet = { nom: string; nomEn?: string; defaut: number; unite?: string; doc?: string; docEn?: string; plage?: [number, number]; pas?: number; graine?: true };
/**
 * Le calcul d'un effet, ses réglages passés dans l'ordre où la fiche les déclare.
 *
 * LES ARGUMENTS NE SONT PAS TYPÉS `number`, ET C'EST DÉLIBÉRÉ. Un effet qui accepte une modulation
 * reçoit un `Float32Array` à la place du nombre, une valeur par échantillon. Typer la liste en
 * `number | Float32Array` obligerait une trentaine d'effets non modulés à convertir leurs arguments
 * un par un, pour un gain nul : la fabrique distribue déjà ses arguments par position, sans que le
 * type les relie aux paramètres déclarés.
 */
export type FnEffet = (audio: AudioBuffer, ...args: any[]) => Promise<AudioBuffer> | AudioBuffer;

/**
 * Le réglage qu'une courbe branchée vient piloter.
 *
 * L'ENTRÉE RESTE FACULTATIVE, ET C'EST LA CONDITION. Sans courbe, `valeursParametre` rend une
 * constante à la valeur du réglage : le cœur de l'effet reçoit exactement ce qu'il recevait, et sa
 * sortie ne bouge pas d'un chiffre. Les empreintes enregistrées avant l'ajout le vérifient.
 *
 * `echelle` suit la nature de la grandeur : une fréquence se parcourt en multipliant, un mélange en
 * ajoutant.
 */
type ModulationEffet = {
  /** Le nom du réglage piloté, tel qu'il apparaît à l'écran. */
  parametre: string;
  /** Bornes des réglages « Modulation min » et « Modulation max », dans l'unité de l'écran. */
  bornes: [number, number];
  /** Ce que valent le zéro et le un de la courbe. Par défaut, les bornes elles-mêmes. */
  defauts?: [number, number];
  echelle?: "lineaire" | "logarithmique";
  unite?: string;
  uniteEn?: string;
};

/**
 * De quoi faire calculer un effet hors du fil de l'interface, quand son calcul le permet.
 *
 * SEULS LES EFFETS DONT LE CALCUL EST PUR PEUVENT L'EMPLOYER, c'est-à-dire ceux qui ne touchent pas
 * au Web Audio : `AudioBuffer` n'existe pas dans un worker. `voix` reçoit un canal et les réglages
 * dans l'ordre où la fiche les déclare, et c'est cette même fonction que le worker exécute.
 */
type HorsFilEffet = {
  creerWorker: () => Worker;
  voix: (x: Float32Array, o: Record<string, number>) => Float32Array;
  /** Les noms sous lesquels les réglages voyagent, dans l'ordre des paramètres de la fiche. */
  cles: string[];
};

export function effet(
  slug: string, nom: string, nomEn: string, resume: string, resumeEn: string,
  parametres: ParamEffet[], fn: FnEffet, hors?: HorsFilEffet, modulation?: ModulationEffet,
): FicheAudio {
  const rangModule = modulation ? parametres.findIndex((p) => p.nom === modulation.parametre) : -1;
  if (modulation && rangModule < 0) {
    throw new Error(`${slug} : « ${modulation.parametre} » n'est pas un de ses réglages.`);
  }
  const bornesDe = (m: ModulationEffet) => [
    { nom: "Modulation min", nomEn: "Modulation min", modulationDe: m.parametre,
      type: "curseur" as const, plage: m.bornes, pas: 1,
      defaut: m.defauts?.[0] ?? m.bornes[0], unite: m.unite, uniteEn: m.uniteEn,
      doc: `Valeur de « ${m.parametre} » que vaut le zéro d'une courbe branchée. Sans courbe, ce réglage ne sert pas.`,
      docEn: `Value of « ${m.parametre} » that a connected curve's zero means. With no curve, this setting does nothing.` },
    { nom: "Modulation max", nomEn: "Modulation max", modulationDe: m.parametre,
      type: "curseur" as const, plage: m.bornes, pas: 1,
      defaut: m.defauts?.[1] ?? m.bornes[1], unite: m.unite, uniteEn: m.uniteEn,
      doc: `Valeur de « ${m.parametre} » que vaut le un de la courbe.`,
      docEn: `Value of « ${m.parametre} » that the curve's one means.` },
  ];

  return {
    id: slug, nom, nomEn, univers: "Traitement", famille: "Effets", resume, resumeEn,
    entrees: modulation
      ? [
        { nom: "Audio", type: "audio", sousType: "stereo" },
        { nom: "Modulation", nomEn: "Modulation", type: "courbe", requis: false, module: modulation.parametre },
      ]
      : [{ nom: "Audio", type: "audio", sousType: "stereo" }],
    sorties: [{ nom: "Audio", type: "audio", sousType: "stereo" }],
    parametres: [
      ...parametres.map(p => ({
        nom: p.nom, nomEn: p.nomEn, defaut: p.defaut, doc: p.doc, docEn: p.docEn,
        unite: p.unite ?? (p.nom.includes("Mix") || p.nom === "Gain" || p.nom === "Réduction" ? "%" : undefined),
        ...(p.plage ? { plage: p.plage } : {}),
        ...(p.pas ? { pas: p.pas } : {}),
        // CETTE LIGNE RECOPIE UN RÔLE, ET SON ABSENCE NE SE VOYAIT PAS : la fiche se reconstruit
        // champ par champ, donc un champ oublié ici disparaît sans erreur. Le contrat des graines
        // a rattrapé le cas ; tout champ ajouté à `ParamEffet` est à recopier ici.
        ...(p.graine ? { graine: p.graine } : {}),
      })),
      ...(modulation ? bornesDe(modulation) : []),
    ],
    async executer(ctx: any) {
      const audio = ctx.entree(0);
      if (!(audio instanceof AudioBuffer)) return { valeurs: [null], message: traduire("msg.aucune_entr_e") };
      const args: any[] = parametres.map(p => ctx.paramNombre(p.nom, p.defaut));
      if (modulation) {
        // UN SEUL CHEMIN, modulé ou non : sans courbe, une constante à la valeur du réglage.
        args[rangModule] = valeursParametre(
          ctx.entree(1), audio.length, args[rangModule] as number,
          {
            min: ctx.paramNombre("Modulation min", modulation.defauts?.[0] ?? modulation.bornes[0]),
            max: ctx.paramNombre("Modulation max", modulation.defauts?.[1] ?? modulation.bornes[1]),
            echelle: modulation.echelle,
          },
        );
      }
      if (hors) {
        const reglages: Record<string, number> = {};
        hors.cles.forEach((cle, i) => { reglages[cle] = args[i]; });
        const voies = Array.from({ length: audio.numberOfChannels }, (_, c) => audio.getChannelData(c));
        const parVoie = await parCanal<Record<string, number>, Float32Array>(voies, reglages, {
          creerWorker: hors.creerWorker, calcul: hors.voix,
        });
        const out = new AudioBuffer({
          numberOfChannels: audio.numberOfChannels, length: audio.length, sampleRate: audio.sampleRate,
        });
        for (let c = 0; c < audio.numberOfChannels; c++) out.getChannelData(c).set(parVoie[c]);
        return { valeurs: [out] };
      }
      return { valeurs: [await fn(audio, ...args)] };
   },
  };
}

export function param(nom: string, defaut: number, nomEn?: string, unite?: string, doc?: string, docEn?: string, plage?: [number, number], pas?: number): ParamEffet {
  return { nom, defaut, nomEn, unite, doc, docEn, plage, pas };
}

export function simple(slug: string, nom: string, nomEn: string, resume: string, resumeEn: string, fn: (a: AudioBuffer) => AudioBuffer | Promise<AudioBuffer>): FicheAudio {
  return {
    id: slug, nom, nomEn, univers: "Traitement", famille: "Effets", resume, resumeEn,
    entrees: [{ nom: "Audio", type: "audio" }],
    sorties: [{ nom: "Audio", type: "audio" }],
    parametres: [],
    async executer(ctx: any) {
      const audio = ctx.entree(0);
      if (!(audio instanceof AudioBuffer)) return { valeurs: [null], message: traduire("msg.aucune_entr_e") };
      return { valeurs: [await fn(audio)] };
   },
  };
}

/**
 * Lit un MIDI d'entrée en notes de motif.
 *
 * Les quatre nœuds de motifs partagent cette lecture, donc la même tolérance et le même
 * message quand il n'y a rien à lire. Le champ de vélocité s'appelle `velocite` dans le
 * domaine — une coquille ancienne, gardée pour ne pas casser les graphes enregistrés.
 */
export async function notesDuMidi(fichier: unknown): Promise<NoteMotif[] | null> {
  if (!(fichier instanceof File)) return null;
  const { notes } = analyserMidi(parseMidi(new Uint8Array(await fichier.arrayBuffer())));
  return notes.map((n) => ({
    note: n.note, velocite: n.velocite ?? 90, debut: n.debut, fin: n.fin, canal: n.canal,
  }));
}

/** Le canal le plus représenté : une percussion doit ressortir en percussion. */
export function canalDominant(notes: NoteMotif[]): number {
  const compte = new Map<number, number>();
  for (const n of notes) {
    const c = n.canal ?? 0;
    compte.set(c, (compte.get(c) ?? 0) + 1);
  }
  let meilleur = 0, max = -1;
  for (const [canal, n] of compte) if (n > max) { max = n; meilleur = canal; }
  return meilleur;
}

/**
 * Rend le motif transformé en AUDIO et en MIDI.
 *
 * L'audio n'est pas un supplément : sans lui, le nœud n'a pas de lecteur et l'on ne peut
 * pas entendre ce qu'on vient de régler sans lui brancher un point d'écoute. Le canal 9
 * passe par la synthèse de batterie — un MIDI de percussion joué en FM donnerait des sons
 * de flûte sur les notes de grosse caisse —, et l'instrument mélodique n'est alors pas
 * imposé au fichier, ce qui ferait taire la batterie chez les autres lecteurs.
 */
export async function rendreMotif(
  ctx: any, notes: NoteMotif[], canal: number,
): Promise<[AudioBuffer, File]> {
  const tempo = ctx.paramNombre("Tempo", 120);
  const volume = ctx.paramNombre("Volume", 80);
  const brut = notesVersFichierMidi(notes, tempo, canal);
  if (canal === 9) {
    return [await rendreBatterieMidi({ notes, volume }), brut];
  }
  const mode = normaliserModeSynthèse(ctx.paramTexte("Synthèse", "Automatique"));
  const modeRendu: "FM/Oscillateurs" | "SoundFont" =
    mode === "SoundFont" || (mode === "Automatique" && sf2Chargee()) ? "SoundFont" : "FM/Oscillateurs";
  const { programme, banque } = decoderInstrumentSF2(ctx.paramNombre("Instrument", 0));
  return [
    await rendreSequence(notes, modeRendu, volume, programme, banque),
    await appliquerInstrumentMidi(brut, ctx.paramNombre("Instrument", 0)),
  ];
}

/** Les réglages de rendu communs aux nœuds de motifs : écouter d'abord, exporter ensuite. */
export const PARAMETRES_RENDU_MOTIF = [
  { nom: "Tempo", nomEn: "Tempo", type: "nombre", plage: [40, 300] as [number, number], pas: 1, defaut: 120, unite: "BPM",
    doc: "Tempo inscrit dans le fichier MIDI produit. Les durées, elles, sont en secondes et ne changent pas.",
    docEn: "Tempo written into the produced MIDI file. The durations themselves are in seconds and do not change." },
  { ...PARAMETRE_SYNTHESE,
    doc: "Automatique = SoundFont si un fichier SF2 est chargé, sinon FM. Sans effet sur une piste de percussion, qui passe toujours par la synthèse de batterie.",
    docEn: "Auto = SoundFont if an SF2 file is loaded, else FM. No effect on a percussion track, which always goes through the drum synthesis." },
  PARAMETRE_INSTRUMENT_SF2,
  { nom: "Volume", nomEn: "Volume", type: "nombre", plage: [0, 100] as [number, number], pas: 1, defaut: 80, unite: "%",
    doc: "Volume du rendu audio.", docEn: "Output volume." },
];

export const SORTIES_MOTIF = [
  { nom: "Audio", type: "audio" as const },
  { nom: "MIDI", nomEn: "MIDI", type: "midi" as const },
];

