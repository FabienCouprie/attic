// plugins/csound.ts — Enveloppe Csound : le langage de synthèse dans un nœud.
//
// Csound descend de MUSIC V, la lignée qui a inventé la synthèse numérique. Barry Vercoe
// l'écrit au MIT en 1986, il compte aujourd'hui environ mille neuf cents opcodes, et son
// portage WebAssembly permet de le faire tourner ici sans rien installer. Ce qu'il apporte à
// Attic n'est pas un effet de plus : c'est un LANGAGE, là où les nœuds sont des outils figés.
//
// Cinq nœuds, du plus libre au plus guidé : écrire un orchestre entier ; jouer un orchestre
// depuis un MIDI ; traiter un son par un orchestre ; et deux bibliothèques d'opcodes choisis
// — les instruments d'un côté, les traitements spectraux de l'autre — réglables sans écrire
// une ligne de code.

import type { FicheAudio } from "../audio/types-domaine";
import { traduire, langueCourante } from "../i18n";
import { avecDoc } from "./notices";
import { parseMidi } from "midi-file";
import { analyserMidi } from "../audio";
import {
  construireCsd, messagesUtiles, orchestreLit, partitionDepuisNotes, rendreCsd, sourcePartition,
  texteBranche,
  type EntreeFichier, type NoteCsound, type Provenance, type ResultatCsound, type SourcePartition,
} from "../audio/csound";
import {
  OPCODES, opcodeDe, orchestreInstrument, orchestreSpectral, tablesInstrument, tablesSpectral,
} from "../audio/csound-opcodes";

const INSTRUMENTS = OPCODES.filter((o) => o.sorte === "instrument");
const SPECTRAUX = OPCODES.filter((o) => o.sorte === "spectral");

const ORCHESTRE_EXEMPLE_EN = `; A minimal instrument: p4 = frequency, p5 = amplitude.
instr 1
  aenv  linseg 0, 0.02, 1, p3 - 0.1, 0.8, 0.08, 0
  amod  oscili 300, p4 * 1.41
  asig  oscili p5, p4 + amod
  out   asig * aenv
endin`;

const ORCHESTRE_EXEMPLE = `; Un instrument minimal : p4 = fréquence, p5 = amplitude.
instr 1
  aenv  linseg 0, 0.02, 1, p3 - 0.1, 0.8, 0.08, 0
  amod  oscili 300, p4 * 1.41
  asig  oscili p5, p4 + amod
  out   asig * aenv
endin`;

const PARTITION_EXEMPLE = `i1 0.0 1.0 220 0.5
i1 1.0 1.0 277 0.5
i1 2.0 1.5 330 0.6
e`;

async function notesDuMidi(fichier: unknown): Promise<NoteCsound[] | null> {
  if (!(fichier instanceof File)) return null;
  const { notes } = analyserMidi(parseMidi(new Uint8Array(await fichier.arrayBuffer())));
  return notes.map((n) => ({
    note: n.note, velocite: n.velociete ?? 90, debut: n.debut, fin: n.fin,
  }));
}

/** Comment nommer, dans le message du nœud, la source d'où vient la partition. */
function nomDeSource(source: SourcePartition, notes: number): string {
  if (source === "midi") return traduire("msg.csound.sourceMidi", String(notes));
  return traduire(source === "port" ? "msg.csound.sourcePort" : "msg.csound.sourceInspecteur");
}

/**
 * Le préfixe qui dit que l'orchestre vient du graphe — et qui ne dit rien sinon.
 *
 * La partition est toujours nommée dans le message parce qu'elle a trois sources et qu'aucune
 * n'est évidente. L'orchestre n'en a que deux, et le cas ordinaire — le champ de l'inspecteur —
 * se lit dans l'inspecteur lui-même : l'annoncer à chaque rendu serait du bruit. Ce qu'il faut
 * dire, c'est l'autre cas, celui où le champ qu'on a sous les yeux ne sert pas.
 */
function prefixeOrchestre(provenance: Provenance): string {
  return provenance === "port" ? `${traduire("msg.csound.orchestreDuGraphe")} · ` : "";
}

/** Les sons branchés que l'orchestre ne lit jamais, en clair et en court. */
function entreesNonLues(orchestre: string, entrees: EntreeFichier[]): { alertes: string[]; remarques: string[] } {
  const alertes: string[] = [];
  const remarques: string[] = [];
  for (const e of entrees) {
    if (orchestreLit(orchestre, e.nom)) continue;
    alertes.push(traduire("msg.csound.entreeNonLueCourt", e.nom));
    remarques.push(traduire("msg.csound.entreeNonLue", e.nom));
  }
  return { alertes, remarques };
}

/**
 * Le rapport commun : ce que Csound a dit, et ce qu'il a produit.
 *
 * Les `remarques` viennent avant tout le reste : ce sont les choses qu'aucune autre partie de
 * l'interface ne peut montrer — une entrée branchée qui n'a pas servi, un son jamais lu.
 */
function rapport(r: ResultatCsound, en: boolean, remarques: string[] = []): string {
  const utiles = messagesUtiles(r.messages);
  return [
    ...remarques,
    r.erreur ? `${en ? "Error" : "Erreur"} : ${r.erreur}` : "",
    r.audio
      ? `${r.audio.duration.toFixed(2)} s · ${r.audio.sampleRate} Hz · ${r.audio.numberOfChannels} ${en ? "channel(s)" : "canal/canaux"} · ${r.ms.toFixed(0)} ms`
      : "",
    r.crete > 1
      ? `${en ? "Peak before limiting" : "Crête avant limitation"} : ${r.crete.toFixed(2)} — ${
        en ? "the orchestra is clipping, lower its amplitudes." : "l'orchestre sature, baissez ses amplitudes."}`
      : "",
    utiles.length > 0 ? `\n${en ? "Csound says" : "Csound dit"} :\n${utiles.join("\n")}` : "",
  ].filter(Boolean).join("\n");
}

const PARAMETRES_SORTIE = [
  { nom: "Volume", nomEn: "Volume", type: "nombre", plage: [0, 100] as [number, number], pas: 1, defaut: 80, unite: "%",
    doc: "Volume de sortie, appliqué après la limitation.", docEn: "Output volume, applied after limiting." },
];

/** Applique le volume à un buffer rendu. */
function auVolume(audio: AudioBuffer, volume: number): AudioBuffer {
  const g = Math.max(0, Math.min(1, volume / 100));
  if (g === 1) return audio;
  for (let c = 0; c < audio.numberOfChannels; c++) {
    const d = audio.getChannelData(c);
    for (let i = 0; i < d.length; i++) d[i] *= g;
    audio.copyToChannel(new Float32Array(d), c);
  }
  return audio;
}

export const fiches: FicheAudio[] = ([
  {
    id: "csound", nom: "Csound", nomEn: "Csound",
    univers: "Autres", famille: "Csound wrapper",
    resume: "Exécute un orchestre et une partition Csound, et rend l'audio produit.",
    resumeEn: "Runs a Csound orchestra and score, and outputs the audio produced.",
    // Les deux entrées texte sont AJOUTÉES À LA FIN : les identifiants des prises sont des rangs
    // (« in:0 », « in:1 »), et les insérer avant aurait déplacé les branchements de tous les
    // graphes déjà enregistrés.
    entrees: [
      { nom: "Audio", type: "audio", requis: false },
      { nom: "MIDI", type: "midi", requis: false },
      { nom: "Orchestre", nomEn: "Orchestra", type: "texte", requis: false },
      { nom: "Partition", nomEn: "Score", type: "texte", requis: false },
    ],
    sorties: [
      { nom: "Audio", type: "audio" },
      { nom: "Rapport", nomEn: "Report", type: "texte" },
    ],
    parametres: [
      { nom: "Orchestre", nomEn: "Orchestra", type: "texte", defaut: ORCHESTRE_EXEMPLE, defautEn: ORCHESTRE_EXEMPLE_EN,
        doc: "Les instruments, en langage Csound, employés si aucune entrée Orchestre n'est branchée. Un son branché sur l'entrée Audio est écrit sous le nom « entree1.wav » et ne se joue que si l'orchestre le lit, par « a1 diskin2 \"entree1.wav\", 1 ». La fréquence d'échantillonnage et 0dbfs sont posés par le nœud : n'écrivez ni sr ni 0dbfs.",
        docEn: "The instruments, in Csound language, used when no Orchestra input is connected. A sound connected to the Audio input is written as « entree1.wav » and is heard only if the orchestra reads it, with « a1 diskin2 \"entree1.wav\", 1 ». The sampling rate and 0dbfs are set by the node: do not write sr or 0dbfs." },
      { nom: "Partition", nomEn: "Score", type: "texte", defaut: PARTITION_EXEMPLE, defautEn: PARTITION_EXEMPLE,
        doc: "Quand jouer quoi. « i1 0 1 220 0.5 » joue l'instrument 1 à l'instant 0 pendant 1 seconde, avec 220 et 0,5 comme p4 et p5. Trois sources possibles, par ordre de priorité : un MIDI branché, puis l'entrée Partition, puis ce champ — et le nœud dit dans son message laquelle il a prise. Le « e » final est ajouté s'il manque.",
        docEn: "When to play what. « i1 0 1 220 0.5 » plays instrument 1 at time 0 for 1 second, with 220 and 0.5 as p4 and p5. Three possible sources, in order of precedence: a connected MIDI file, then the Score input, then this field — and the node states in its message which one it took. The final « e » is added if missing." },
      { nom: "Canaux", nomEn: "Channels", type: "choix",
        options: ["Mono", "Stéréo"], optionsEn: ["Mono", "Stereo"], optionIds: ["1", "2"],
        defaut: "Mono", defautEn: "Mono",
        doc: "Nombre de canaux de l'orchestre. En stéréo, employez outs au lieu de out.",
        docEn: "Number of channels in the orchestra. In stereo, use outs instead of out." },
      { nom: "Taille de bloc", nomEn: "Block size", type: "nombre", plage: [1, 512], pas: 1, defaut: 32,
        doc: "ksmps, le nombre d'échantillons calculés par cycle de contrôle. Petit, les signaux de contrôle sont plus fins et le calcul plus lent ; 32 est l'usage courant.",
        docEn: "ksmps, the number of samples computed per control cycle. Small means finer control signals and slower computation; 32 is the common choice." },
      { nom: "Graine", nomEn: "Seed", type: "nombre", plage: [0, 999999], pas: 1, defaut: 1,
        doc: "Graine des opcodes aléatoires. Csound est reproductible dès qu'elle est fixée : 0 laisse Csound tirer la sienne et le rendu change à chaque exécution.",
        docEn: "Seed of the random opcodes. Csound is reproducible as soon as it is fixed: 0 lets Csound draw its own and the render changes on every run." },
      { nom: "Canaux d'entrée", nomEn: "Input channels", type: "choix",
        options: ["Mono", "Stéréo"], optionsEn: ["Mono", "Stereo"], optionIds: ["mono", "stereo"],
        defaut: "Mono", defautEn: "Mono",
        doc: "Nombre de canaux des fichiers d'entrée écrits pour Csound. En mono, « a1 diskin2 \"entree1.wav\", 1 » fonctionne toujours ; en stéréo, diskin2 exige deux sorties — « a1, a2 diskin2 … » — et refuse la note sinon, ce qui donne un rendu muet.",
        docEn: "Number of channels in the input files written for Csound. In mono, « a1 diskin2 \"entree1.wav\", 1 » always works; in stereo, diskin2 requires two outputs — « a1, a2 diskin2 … » — and refuses the note otherwise, which yields a silent render." },
      ...PARAMETRES_SORTIE,
    ],
    async executer(ctx: any) {
      const en = langueCourante() === "en";
      const audioEntree = ctx.entree(0);
      const notes = await notesDuMidi(ctx.entree(1));
      const entrees: EntreeFichier[] = audioEntree instanceof AudioBuffer
        ? [{ nom: "entree1.wav", buffer: audioEntree, stereo: ctx.paramTexte("Canaux d'entrée", "mono") === "stereo" }]
        : [];

      // L'orchestre : l'entrée branchée d'abord, le champ ensuite.
      const orchestre = texteBranche(ctx.entree(2), ctx.paramTexte("Orchestre", ORCHESTRE_EXEMPLE));
      // La partition : le MIDI d'abord, puis l'entrée texte, puis le champ.
      const portPartition = ctx.entree(3);
      const choix = sourcePartition(notes?.length ?? 0, portPartition);
      const partition = choix.source === "midi" ? partitionDepuisNotes(notes!)
        : choix.source === "port" ? String(portPartition)
        : ctx.paramTexte("Partition", PARTITION_EXEMPLE);

      // Ce que l'utilisateur ne peut pas voir autrement : une entrée branchée qui n'a pas servi.
      // Deux fois chaque avertissement, et ce n'est pas une redite : la sortie Rapport n'est pas
      // affichée dans le nœud — il faut la brancher pour la lire —, si bien qu'un avertissement
      // qui n'y serait que là passerait inaperçu. Court dans le message, qui est toujours
      // visible ; entier dans le Rapport, qui a la place d'expliquer quoi faire.
      const alertes: string[] = [];
      const remarques: string[] = [];
      if (choix.ignoree === "port") {
        alertes.push(traduire("msg.csound.partitionIgnoreeCourt"));
        remarques.push(traduire("msg.csound.partitionIgnoree"));
      }
      const muettes = entreesNonLues(orchestre.texte, entrees);
      alertes.push(...muettes.alertes);
      remarques.push(...muettes.remarques);

      const graine = Math.round(ctx.paramNombre("Graine", 1));
      const csd = construireCsd({
        orchestre: orchestre.texte,
        partition,
        nchnls: parseInt(ctx.paramTexte("Canaux", "1"), 10) || 1,
        ksmps: Math.round(ctx.paramNombre("Taille de bloc", 32)),
        graine: graine > 0 ? graine : undefined,
      });
      const r = await rendreCsd(csd, entrees);
      if (!r.audio) {
        return {
          valeurs: [null, rapport(r, en, remarques)],
          erreur: true,
          message: r.erreur ?? traduire("msg.csound.rien"),
        };
      }
      return {
        valeurs: [auVolume(r.audio, ctx.paramNombre("Volume", 80)), rapport(r, en, remarques)],
        // La source de la partition est NOMMÉE : c'est ce qui manquait, le nœud en ayant trois
        // et n'en disant aucune.
        message: prefixeOrchestre(orchestre.provenance)
          + traduire("msg.csound.resultatSource",
            nomDeSource(choix.source, notes?.length ?? 0),
            r.audio.duration.toFixed(2), r.ms.toFixed(0))
          + (alertes.length > 0 ? ` · ${alertes.join(" · ")}` : ""),
      };
    },
  },
  {
    id: "csound-instrument", nom: "Instrument Csound", nomEn: "Csound Instrument",
    univers: "Autres", famille: "Csound wrapper",
    resume: "Joue un MIDI avec un orchestre Csound : chaque note devient un événement de partition.",
    resumeEn: "Plays a MIDI file with a Csound orchestra: each note becomes a score event.",
    // L'entrée Orchestre est ajoutée EN SECOND, après le MIDI : les prises sont désignées par
    // leur rang, et l'insérer avant aurait déplacé les branchements des graphes enregistrés.
    entrees: [
      { nom: "MIDI", type: "midi" },
      { nom: "Orchestre", nomEn: "Orchestra", type: "texte", requis: false },
    ],
    sorties: [
      { nom: "Audio", type: "audio" },
      { nom: "Rapport", nomEn: "Report", type: "texte" },
    ],
    parametres: [
      { nom: "Orchestre", nomEn: "Orchestra", type: "texte", defaut: ORCHESTRE_EXEMPLE, defautEn: ORCHESTRE_EXEMPLE_EN,
        doc: "L'instrument 1 est appelé pour chaque note. La partition lui passe la fréquence en hertz dans p4, l'amplitude de 0 à 1 dans p5, et le numéro de note MIDI dans p6 — de sorte qu'on n'ait jamais à convertir soi-même. Ce champ sert si aucune entrée Orchestre n'est branchée ; une entrée branchée le remplace, et le nœud le dit.",
        docEn: "Instrument 1 is called for each note. The score passes it the frequency in hertz in p4, the amplitude from 0 to 1 in p5, and the MIDI note number in p6 — so that no conversion is ever needed. This field is used when no Orchestra input is connected; a connected input replaces it, and the node says so." },
      { nom: "Canaux", nomEn: "Channels", type: "choix",
        options: ["Mono", "Stéréo"], optionsEn: ["Mono", "Stereo"], optionIds: ["1", "2"],
        defaut: "Mono", defautEn: "Mono",
        doc: "Nombre de canaux de l'orchestre.", docEn: "Number of channels in the orchestra." },
      { nom: "Taille de bloc", nomEn: "Block size", type: "nombre", plage: [1, 512], pas: 1, defaut: 32,
        doc: "ksmps, le nombre d'échantillons par cycle de contrôle.",
        docEn: "ksmps, the number of samples per control cycle." },
      { nom: "Queue", nomEn: "Tail", type: "nombre", plage: [0, 10], pas: 0.1, defaut: 0.5, unite: "s",
        doc: "Temps ajouté après la dernière note, pour que les résonances aient la place de s'éteindre. Sans cela, une réverbération se coupe net à la fin de la partition.",
        docEn: "Time added after the last note, so resonances have room to die away. Without it, a reverb is cut off at the end of the score." },
      { nom: "Graine", nomEn: "Seed", type: "nombre", plage: [0, 999999], pas: 1, defaut: 1,
        doc: "Graine des opcodes aléatoires, pour que le rendu soit reproductible.",
        docEn: "Seed of the random opcodes, so the render is reproducible." },
      ...PARAMETRES_SORTIE,
    ],
    async executer(ctx: any) {
      const en = langueCourante() === "en";
      const notes = await notesDuMidi(ctx.entree(0));
      if (!notes) return { valeurs: [null, null], message: traduire("msg.aucun_fichier_midi_en_entr_e") };
      if (notes.length === 0) return { valeurs: [null, null], message: traduire("msg.aucune_note") };
      const orchestre = texteBranche(ctx.entree(1), ctx.paramTexte("Orchestre", ORCHESTRE_EXEMPLE));
      const queue = ctx.paramNombre("Queue", 0.5);
      const fin = Math.max(...notes.map((n) => n.fin)) + queue;
      const graine = Math.round(ctx.paramNombre("Graine", 1));
      const csd = construireCsd({
        orchestre: orchestre.texte,
        // Un « f0 » tient la partition ouverte jusqu'à l'instant voulu : c'est la façon
        // canonique de laisser les queues de résonance s'éteindre.
        partition: `${partitionDepuisNotes(notes)}\nf0 ${fin.toFixed(3)}\ne`,
        nchnls: parseInt(ctx.paramTexte("Canaux", "1"), 10) || 1,
        ksmps: Math.round(ctx.paramNombre("Taille de bloc", 32)),
        graine: graine > 0 ? graine : undefined,
      });
      const r = await rendreCsd(csd);
      if (!r.audio) {
        return { valeurs: [null, rapport(r, en)], erreur: true, message: r.erreur ?? traduire("msg.csound.rien") };
      }
      return {
        valeurs: [auVolume(r.audio, ctx.paramNombre("Volume", 80)), rapport(r, en)],
        message: prefixeOrchestre(orchestre.provenance)
          + traduire("msg.csound.notes", notes.length, r.audio.duration.toFixed(2)),
      };
    },
  },
  {
    id: "csound-effet", nom: "Effet Csound", nomEn: "Csound Effect",
    univers: "Autres", famille: "Csound wrapper",
    resume: "Traite un ou deux sons par un orchestre Csound.",
    resumeEn: "Processes one or two sounds through a Csound orchestra.",
    // L'entrée Orchestre est ajoutée EN DERNIER : les prises sont désignées par leur rang, et
    // l'insérer avant aurait déplacé les branchements des graphes enregistrés.
    entrees: [
      { nom: "Audio 1", type: "audio" },
      { nom: "Audio 2", type: "audio", requis: false },
      { nom: "Orchestre", nomEn: "Orchestra", type: "texte", requis: false },
    ],
    sorties: [
      { nom: "Audio", type: "audio" },
      { nom: "Rapport", nomEn: "Report", type: "texte" },
    ],
    parametres: [
      { nom: "Orchestre", nomEn: "Orchestra", type: "texte",
        defaut: `; Les entrées sont des fichiers : entree1.wav et entree2.wav.
instr 1
  a1    diskin2 "entree1.wav", 1
  adel  vdelay a1, 300 + 200 * oscili:k(1, 0.3), 600
  out   (a1 + adel * 0.7) * 0.6
endin`,
        defautEn: `; The inputs are files: entree1.wav and entree2.wav.
instr 1
  a1    diskin2 "entree1.wav", 1
  adel  vdelay a1, 300 + 200 * oscili:k(1, 0.3), 600
  out   (a1 + adel * 0.7) * 0.6
endin`,
        doc: "L'orchestre de traitement, employé si aucune entrée Orchestre n'est branchée — une entrée branchée le remplace, et le nœud le dit. Les sons d'entrée sont écrits dans le système de fichiers de Csound sous les noms « entree1.wav » et « entree2.wav », et se lisent par diskin2 ou soundin ; un son branché que l'orchestre ne nomme pas n'a aucun effet, et le nœud vous en avertit. La durée de la partition est réglée sur celle de la plus longue entrée.",
        docEn: "The processing orchestra, used when no Orchestra input is connected — a connected input replaces it, and the node says so. The input sounds are written into Csound's filesystem as « entree1.wav » and « entree2.wav », and read with diskin2 or soundin; a connected sound the orchestra does not name has no effect, and the node warns you. The score's duration is set from the longest input." },
      { nom: "Canaux", nomEn: "Channels", type: "choix",
        options: ["Mono", "Stéréo"], optionsEn: ["Mono", "Stereo"], optionIds: ["1", "2"],
        defaut: "Mono", defautEn: "Mono",
        doc: "Nombre de canaux de l'orchestre.", docEn: "Number of channels in the orchestra." },
      { nom: "Queue", nomEn: "Tail", type: "nombre", plage: [0, 20], pas: 0.1, defaut: 1, unite: "s",
        doc: "Temps ajouté après la fin de l'entrée, pour laisser respirer un délai ou une réverbération.",
        docEn: "Time added after the input ends, to let a delay or reverb breathe." },
      { nom: "Taille de bloc", nomEn: "Block size", type: "nombre", plage: [1, 512], pas: 1, defaut: 32,
        doc: "ksmps, le nombre d'échantillons par cycle de contrôle.",
        docEn: "ksmps, the number of samples per control cycle." },
      { nom: "Graine", nomEn: "Seed", type: "nombre", plage: [0, 999999], pas: 1, defaut: 1,
        doc: "Graine des opcodes aléatoires.", docEn: "Seed of the random opcodes." },
      { nom: "Canaux d'entrée", nomEn: "Input channels", type: "choix",
        options: ["Mono", "Stéréo"], optionsEn: ["Mono", "Stereo"], optionIds: ["mono", "stereo"],
        defaut: "Mono", defautEn: "Mono",
        doc: "Nombre de canaux des fichiers d'entrée écrits pour Csound. En mono, « a1 diskin2 \"entree1.wav\", 1 » fonctionne toujours ; en stéréo, diskin2 exige deux sorties — « a1, a2 diskin2 … » — et refuse la note sinon, ce qui donne un rendu muet.",
        docEn: "Number of channels in the input files written for Csound. In mono, « a1 diskin2 \"entree1.wav\", 1 » always works; in stereo, diskin2 requires two outputs — « a1, a2 diskin2 … » — and refuses the note otherwise, which yields a silent render." },
      ...PARAMETRES_SORTIE,
    ],
    async executer(ctx: any) {
      const en = langueCourante() === "en";
      const a1 = ctx.entree(0), a2 = ctx.entree(1);
      if (!(a1 instanceof AudioBuffer)) {
        return { valeurs: [null, null], message: traduire("msg.aucune_entr_e") };
      }
      const stereo = ctx.paramTexte("Canaux d'entrée", "mono") === "stereo";
      const entrees: EntreeFichier[] = [{ nom: "entree1.wav", buffer: a1, stereo }];
      if (a2 instanceof AudioBuffer) entrees.push({ nom: "entree2.wav", buffer: a2, stereo });
      const duree = Math.max(a1.duration, a2 instanceof AudioBuffer ? a2.duration : 0)
        + ctx.paramNombre("Queue", 1);
      const orchestre = texteBranche(ctx.entree(2), ctx.paramTexte("Orchestre", ""));
      // Ici l'avertissement compte double : un orchestre de traitement qui ne lit PAS son entrée
      // rend un son qui n'a rien à voir avec ce qu'on lui a branché, et c'est le plus déroutant
      // des résultats — surtout sur « entree2.wav », qu'un orchestre d'exemple oublie volontiers.
      const muettes = entreesNonLues(orchestre.texte, entrees);
      const graine = Math.round(ctx.paramNombre("Graine", 1));
      const csd = construireCsd({
        orchestre: orchestre.texte,
        partition: `i1 0 ${duree.toFixed(3)}\ne`,
        nchnls: parseInt(ctx.paramTexte("Canaux", "1"), 10) || 1,
        ksmps: Math.round(ctx.paramNombre("Taille de bloc", 32)),
        graine: graine > 0 ? graine : undefined,
      });
      const r = await rendreCsd(csd, entrees);
      if (!r.audio) {
        return {
          valeurs: [null, rapport(r, en, muettes.remarques)],
          erreur: true,
          message: r.erreur ?? traduire("msg.csound.rien"),
        };
      }
      return {
        valeurs: [auVolume(r.audio, ctx.paramNombre("Volume", 80)), rapport(r, en, muettes.remarques)],
        message: prefixeOrchestre(orchestre.provenance)
          + traduire("msg.csound.resultat", r.audio.duration.toFixed(2), r.ms.toFixed(0))
          + (muettes.alertes.length > 0 ? ` · ${muettes.alertes.join(" · ")}` : ""),
      };
    },
  },
  {
    id: "csound-instruments-physiques", nom: "Instruments Csound", nomEn: "Csound Instruments",
    univers: "Autres", famille: "Csound wrapper",
    resume: "Les instruments de Perry Cook tels que Csound les porte : corde frottée, clarinette, flûte, cuivre, corde pincée, formants.",
    resumeEn: "Perry Cook's instruments as Csound carries them: bowed string, clarinet, flute, brass, plucked string, formants.",
    entrees: [{ nom: "MIDI", type: "midi", requis: false }],
    sorties: [
      { nom: "Audio", type: "audio" },
      { nom: "Rapport", nomEn: "Report", type: "texte" },
    ],
    parametres: [
      { nom: "Instrument", nomEn: "Instrument", type: "choix",
        options: INSTRUMENTS.map((o) => o.fr), optionsEn: INSTRUMENTS.map((o) => o.en),
        optionIds: INSTRUMENTS.map((o) => o.id),
        defaut: INSTRUMENTS[0].fr, defautEn: INSTRUMENTS[0].en,
        doc: "L'opcode employé. La corde frottée : son modèle de Helmholtz est ici débogué depuis trente ans. Chaque instrument emploie les trois réglages suivants à sa façon, et la notice le détaille.",
        docEn: "The opcode used. The bowed string: its Helmholtz model has been debugged here for thirty years. Each instrument uses the three settings below in its own way, detailed in the notice." },
      { nom: "Note", nomEn: "Note", type: "texte", defaut: "A3", defautEn: "A3",
        doc: "Note jouée quand aucun MIDI n'est branché.", docEn: "Note played when no MIDI is connected." },
      { nom: "Pression", nomEn: "Pressure", type: "nombre", plage: [0, 100], pas: 1, defaut: 40, unite: "%",
        doc: "Pression d'archet, raideur d'anche, souffle ou tension des lèvres selon l'instrument.",
        docEn: "Bow pressure, reed stiffness, breath or lip tension depending on the instrument." },
      { nom: "Position", nomEn: "Position", type: "nombre", plage: [0, 100], pas: 1, defaut: 25, unite: "%",
        doc: "Position d'archet, rapport du jet d'air, temps d'attaque ou fréquence de formant selon l'instrument. C'est le réglage le plus sensible de la plupart d'entre eux.",
        docEn: "Bow position, air jet ratio, attack time or formant frequency depending on the instrument. It is the most sensitive control of most of them." },
      { nom: "Vibrato", nomEn: "Vibrato", type: "nombre", plage: [0, 100], pas: 1, defaut: 20, unite: "%",
        doc: "Profondeur du vibrato. Sans effet sur la corde pincée et les formants.",
        docEn: "Vibrato depth. No effect on the plucked string and the formants." },
      { nom: "Fréquence vibrato", nomEn: "Vibrato rate", type: "nombre", plage: [0.5, 12], pas: 0.1, defaut: 6, unite: "Hz",
        doc: "Vitesse du vibrato.", docEn: "Vibrato speed." },
      { nom: "Durée", nomEn: "Duration", type: "nombre", plage: [0.1, 20], pas: 0.1, defaut: 2, unite: "s",
        doc: "Durée de la note, quand aucun MIDI n'est branché.", docEn: "Note duration, when no MIDI is connected." },
      ...PARAMETRES_SORTIE,
    ],
    async executer(ctx: any) {
      const en = langueCourante() === "en";
      const o = opcodeDe("instrument", ctx.paramTexte("Instrument", INSTRUMENTS[0].id));
      const orchestre = orchestreInstrument(o, {
        pression: ctx.paramNombre("Pression", 40) / 100,
        position: ctx.paramNombre("Position", 25) / 100,
        vibrato: ctx.paramNombre("Vibrato", 20) / 100,
        frequenceVibrato: ctx.paramNombre("Fréquence vibrato", 6),
      });
      const notes = await notesDuMidi(ctx.entree(0));
      let partition: string;
      if (notes && notes.length > 0) {
        partition = `${tablesInstrument(o)}\n${partitionDepuisNotes(notes)}\nf0 ${(Math.max(...notes.map((n) => n.fin)) + 0.3).toFixed(3)}\ne`;
      } else {
        const base: Record<string, number> = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };
        const m = /^([a-gA-G])([#b]?)(-?\d+)?$/.exec(ctx.paramTexte("Note", "A3").trim());
        const midi = m
          ? base[m[1].toLowerCase()] + (m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0)
            + ((m[3] === undefined ? 3 : parseInt(m[3], 10)) + 1) * 12
          : 57;
        const duree = ctx.paramNombre("Durée", 2);
        partition = `${tablesInstrument(o)}\ni1 0 ${duree.toFixed(3)} ${(440 * 2 ** ((midi - 69) / 12)).toFixed(3)} 0.6 ${midi}\ne`;
      }
      const r = await rendreCsd(construireCsd({ orchestre, partition, graine: 1 }));
      if (!r.audio) {
        return { valeurs: [null, rapport(r, en)], erreur: true, message: r.erreur ?? traduire("msg.csound.rien") };
      }
      return {
        valeurs: [auVolume(r.audio, ctx.paramNombre("Volume", 80)), rapport(r, en)],
        message: traduire("msg.csound.opcode", o.id, r.audio.duration.toFixed(2), r.ms.toFixed(0)),
      };
    },
  },
  {
    id: "csound-spectral", nom: "Spectral Csound", nomEn: "Csound Spectral",
    univers: "Autres", famille: "Csound wrapper",
    resume: "Morphing spectral, vocodeur et étirement à phase verrouillée, par les opcodes de flux spectral de Csound.",
    resumeEn: "Spectral morphing, vocoder and phase-locked stretching, through Csound's streaming spectral opcodes.",
    entrees: [
      { nom: "Audio 1", type: "audio" },
      { nom: "Audio 2", type: "audio", requis: false },
    ],
    sorties: [
      { nom: "Audio", type: "audio" },
      { nom: "Rapport", nomEn: "Report", type: "texte" },
    ],
    parametres: [
      { nom: "Traitement", nomEn: "Process", type: "choix",
        options: SPECTRAUX.map((o) => o.fr), optionsEn: SPECTRAUX.map((o) => o.en),
        optionIds: SPECTRAUX.map((o) => o.id),
        defaut: SPECTRAUX[0].fr, defautEn: SPECTRAUX[0].en,
        doc: "L'opcode employé. Les trois premiers demandent deux sons et les croisent ; l'étirement n'en demande qu'un. ",
        docEn: "The opcode used. The first three need two sounds and cross them; the stretch needs only one. " },
      { nom: "Morphing", nomEn: "Morph", type: "nombre", plage: [0, 100], pas: 1, defaut: 50, unite: "%",
        doc: "Quantité de croisement entre les deux sons. Pour l'étirement, c'est le facteur de temps : à 25 %, le son dure deux fois plus longtemps.",
        docEn: "Amount of crossing between the two sounds. For the stretch, this is the time factor: at 25 %, the sound lasts twice as long." },
      { nom: "Transposition", nomEn: "Transpose", type: "nombre", plage: [-24, 24], pas: 1, defaut: 0, unite: " ½-ton", uniteEn: "st",
        doc: "Transposition, employée par l'étirement seul : elle change la hauteur sans toucher à la durée, ce qui est tout l'intérêt d'un étirement à phase verrouillée.",
        docEn: "Transposition, used by the stretch only: it changes the pitch without touching the duration, which is the whole point of a phase-locked stretch." },
      { nom: "Fenêtre", nomEn: "Window", type: "choix",
        options: ["512", "1024", "2048"], optionsEn: ["512", "1024", "2048"], optionIds: ["512", "1024", "2048"],
        defaut: "1024", defautEn: "1024",
        doc: "Taille de la transformée. Grande, la résolution fréquentielle est fine et les transitoires s'étalent ; petite, l'inverse. 1024 est le compromis usuel. Sans effet sur l'étirement (mincer), qui ne passe pas par cette analyse.",
        docEn: "Transform size. Large gives fine frequency resolution and smeared transients; small the opposite. 1024 is the usual compromise." },
      { nom: "Queue", nomEn: "Tail", type: "nombre", plage: [0, 30], pas: 0.5, defaut: 0.5, unite: "s",
        doc: "Temps ajouté à la durée traitée. Indispensable pour l'étirement, qui allonge le son.",
        docEn: "Time added to the processed duration. Essential for the stretch, which lengthens the sound." },
      ...PARAMETRES_SORTIE,
    ],
    async executer(ctx: any) {
      const en = langueCourante() === "en";
      const o = opcodeDe("spectral", ctx.paramTexte("Traitement", SPECTRAUX[0].id));
      const a1 = ctx.entree(0), a2 = ctx.entree(1);
      if (!(a1 instanceof AudioBuffer)) {
        return { valeurs: [null, null], message: traduire("msg.aucune_entr_e") };
      }
      if (o.entrees > 1 && !(a2 instanceof AudioBuffer)) {
        return { valeurs: [null, null], message: traduire("msg.csound.deuxEntrees", o.fr) };
      }
      const entrees: EntreeFichier[] = [{ nom: "entree1.wav", buffer: a1 }];
      if (a2 instanceof AudioBuffer) entrees.push({ nom: "entree2.wav", buffer: a2 });
      const morphing = ctx.paramNombre("Morphing", 50) / 100;
      const orchestre = orchestreSpectral(o, {
        morphing,
        transposition: ctx.paramNombre("Transposition", 0),
        fenetre: parseInt(ctx.paramTexte("Fenêtre", "1024"), 10) || 1024,
        dureeEntree: a1.duration,
      });
      // L'étirement allonge le son : sa durée de partition doit suivre, sinon il est coupé.
      const facteur = o.id === "mincer" ? 1 / Math.max(0.05, morphing * 2) : 1;
      const duree = a1.duration * facteur + ctx.paramNombre("Queue", 0.5);
      const partition = [tablesSpectral(o), `i1 0 ${duree.toFixed(3)}`, "e"].filter(Boolean).join("\n");
      const r = await rendreCsd(construireCsd({ orchestre, partition, graine: 1 }), entrees);
      if (!r.audio) {
        return { valeurs: [null, rapport(r, en)], erreur: true, message: r.erreur ?? traduire("msg.csound.rien") };
      }
      return {
        valeurs: [auVolume(r.audio, ctx.paramNombre("Volume", 80)), rapport(r, en)],
        message: traduire("msg.csound.opcode", o.id, r.audio.duration.toFixed(2), r.ms.toFixed(0)),
      };
    },
  },
] as FicheAudio[]).map(avecDoc);
