// plugins/entrees.ts — Nœuds d'entrée

import type { PluginDef } from "../core";
import { avecDoc } from "./notices";
import { decoderFichier, decoderBlob } from "../audio";

const entrees: PluginDef[] = [
  {
    id: "entree-audio", nom: "Entrée audio", nomEn: "Audio input", univers: "Entrées", famille: "Audio",
    resume: "Charge un fichier audio et le transmet sur sa sortie.",
    resumeEn: "Loads an audio file and passes it to its output.",
    entrees: [], sorties: [{ nom: "Audio", type: "audio", sousType: "stereo" }],
    parametres: [],
    async executer(ctx) {
      const fichier = ctx.noeud.data.audioFichier as File | undefined;
      if (!fichier) return { valeurs: [null], erreur: true, message: "Aucun fichier chargé." };
      const buffer = await decoderFichier(fichier, ctx.runtime);
      // Détecter un graphe embarqué dans les métadonnées du fichier
      try {
        const { extraireGrapheWav, extraireGrapheMp3, deserialiserGraphe } = await import("../audio");
        const arrayBuf = await fichier.arrayBuffer();
        let grapheJson: string | null = null;
        if (fichier.name.toLowerCase().endsWith(".wav")) grapheJson = extraireGrapheWav?.(arrayBuf) ?? null;
        else if (fichier.name.toLowerCase().endsWith(".mp3")) grapheJson = extraireGrapheMp3?.(arrayBuf) ?? null;
        if (grapheJson) {
          const graphe = deserialiserGraphe?.(grapheJson);
          if (graphe) {
            (ctx.noeud.data as any)._grapheEmbarque = graphe;
            return { valeurs: [buffer], message: `Graphe embarqué détecté ! ${graphe.nodes.length} nodes · ${graphe.edges.length} connexions` };
          }
        }
      } catch {}
      return { valeurs: [buffer] };
    },
  },
  {
    id: "enregistreur-audio", nom: "Enregistreur", nomEn: "Recorder", univers: "Entrées", famille: "Audio",
    resume: "Transmet un enregistrement micro comme source audio.",
    resumeEn: "Passes a microphone recording as audio source.",
    entrees: [], sorties: [{ nom: "Audio", type: "audio", sousType: "stereo" }],
    parametres: [],
    async executer(ctx) {
      const blob = ctx.noeud.data.enregistrementBlob as Blob | undefined;
      if (!blob) return { valeurs: [null], erreur: true, message: "Aucun enregistrement." };
      const buffer = await decoderBlob(blob, ctx.runtime);
      return { valeurs: [buffer] };
    },
  },
  {
    id: "capture-systeme-audio", nom: "Capture système audio", nomEn: "System Audio Capture", univers: "Entrées", famille: "Audio",
    resume: "Capture le son du système (autre application, navigateur, etc.).",
    resumeEn: "Captures system audio (other app, browser, etc.).",
    entrees: [], sorties: [{ nom: "Audio", type: "audio", sousType: "stereo" }],
    parametres: [],
    async executer(ctx) {
      const blob = ctx.noeud.data.enregistrementBlob as Blob | undefined;
      if (!blob) return { valeurs: [null], erreur: true, message: "Aucune capture. Cliquez sur Enregistrer dans l'inspecteur." };
      const buffer = await decoderBlob(blob, ctx.runtime);
      return { valeurs: [buffer] };
    },
  },
  {
    id: "generateur-musical", nom: "Générateur musical", nomEn: "Music Generator", univers: "Entrées", famille: "Génération",
    resume: "Génère une composition multi-pistes à partir d'un script descriptif.",
    resumeEn: "Generates a multi-track composition from a descriptive script.",
    notice: "Script : genre=pop, tempo=120, cle=C, gamme=majeur, duree=30",
    noticeEn: "Script: genre=pop, tempo=120, cle=C, gamme=majeur, duree=30",
    entrees: [], sorties: [{ nom: "Audio", type: "audio", sousType: "stereo" }],
    parametres: [
      { nom: "Genre", nomEn: "Genre", type: "choix", options: ["pop","rock","jazz","blues","classique","electro","hip-hop","reggae","ambient"], defaut: "pop" },
      { nom: "Clé", nomEn: "Key", type: "choix", options: ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"], defaut: "C" },
      { nom: "Gamme", nomEn: "Scale", type: "choix", options: ["majeur","mineur"], defaut: "majeur" },
      { nom: "Tempo", nomEn: "Tempo", plage: [40,240], defaut: 120, unite: "BPM" },
      { nom: "Durée", nomEn: "Duration", plage: [4,120], defaut: 30, unite: "s" },
      { nom: "Volume", nomEn: "Volume", plage: [0,100], defaut: 80, unite: "%" },
      { nom: "Instrument 1", nomEn: "Instrument 1", type: "choix", options: ["Piano","Piano électrique","Guitare acoustique","Guitare électrique","Orgue","Clavecin","Vibraphone","Marimba","Cordes","Pad"], defaut: "Piano", docEn: "Layer 1 — chords." },
      { nom: "Instrument 2", nomEn: "Instrument 2", type: "choix", options: ["Basse fretless","Basse acoustique","Basse électrique","Synth bass","Contrebasse","Basse slap"], defaut: "Basse fretless", docEn: "Layer 2 — bass." },
      { nom: "Instrument 3", nomEn: "Instrument 3", type: "choix", options: ["Marimba","Flûte","Trompette","Sax alto","Guitare nylon","Violon","Lead synth","Boîte à musique","Xylophone","Cordes"], defaut: "Marimba", docEn: "Layer 3 — melody." },
      { nom: "Instrument 4", nomEn: "Instrument 4", type: "choix", options: ["Batterie (GM)","Batterie (électro)","Batterie (jazz)"], defaut: "Batterie (GM)", docEn: "Layer 4 — drums (channel 9)." },
    ],
    async executer(ctx) {
      const genre = ctx.paramTexte("Genre", "pop");
      const cle = ctx.paramTexte("Clé", "C");
      const gamme = ctx.paramTexte("Gamme", "majeur");
      const tempo = ctx.paramNombre("Tempo", 120);
      const duree = ctx.paramNombre("Durée", 30);
      const volume = ctx.paramNombre("Volume", 80);
      const instr1 = ctx.paramTexte("Instrument 1", "Piano");
      const instr2 = ctx.paramTexte("Instrument 2", "Basse fretless");
      const instr3 = ctx.paramTexte("Instrument 3", "Marimba");
      const instr4 = ctx.paramTexte("Instrument 4", "Batterie (GM)");

      ctx.onProgress("Génération du script…");
      const { genererDepuisScript, analyserMidi, rendreMidiDepuisBytes, rendreAvecSF2 } = await import("../audio");
      const { sf2Chargee } = await import("./soundfontGlobal");

      const script = `genre = ${genre}\ntempo = ${tempo}\ncle = ${cle}\ngamme = ${gamme}\nduree = ${duree}\ninstr1 = ${instr1}\ninstr2 = ${instr2}\ninstr3 = ${instr3}\ninstr4 = ${instr4}`;
      const { midiBytes, description } = await genererDepuisScript(script);

      const sf2 = sf2Chargee();
      if (sf2) {
        ctx.onProgress("Rendu SoundFont…");
        const { parseMidi } = await import("midi-file");
        const parsed = parseMidi(midiBytes);
        const { notes, canauxInstrument } = analyserMidi(parsed);
        const sr = 44100;
        const dTot = notes.reduce((m: number, n: any) => Math.max(m, n.fin), 0) + 1;
        const master = new AudioBuffer({ numberOfChannels: 2, length: Math.ceil(dTot * sr), sampleRate: sr });
        for (const canal of [0,1,2,9]) {
          const nc = notes.filter((n: any) => n.canal === canal);
          if (!nc.length) continue;
          const prog = canauxInstrument.get(canal) ?? 0;
          const idx = prog < sf2.instruments.length ? prog : undefined;
          const an = nc.map((n: any) => ({ note: n.note, velocite: n.velociete, debut: n.debut, fin: n.fin }));
          const layer = rendreAvecSF2(sf2, an, volume, idx);
          for (let i = 0; i < master.length && i < layer.length; i++) {
            master.getChannelData(0)[i] += layer.getChannelData(0)[i];
            master.getChannelData(1)[i] += layer.getChannelData(1)[i];
          }
        }
        return { valeurs: [master], message: `${description}\n── Rendu : SoundFont` };
      }
      ctx.onProgress("Rendu FM…");
      const buffer = await rendreMidiDepuisBytes(midiBytes, "FM/Oscillateurs", volume);
      return { valeurs: [buffer], message: `${description}\n── Rendu : FM` };
    },
  },
];

export const fiches: PluginDef[] = entrees.map(avecDoc) as PluginDef[];
