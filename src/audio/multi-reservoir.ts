// audio/multi-reservoir.ts — Multi-réservoirs en réseau : plusieurs réservoirs
// neuronaux tournent en parallèle, chacun avec un rôle (mélodie, basse,
// harmonie, rythme). Les réservoirs s'influencent mutuellement via des
// connexions de contrôle, créant une émergence polyphonique.
//
// Inspiré d'Allendia/EVY : aucun entraînement, aucun dataset. Les motifs
// émergent de l'interaction entre réseaux aléatoires.

import { genererReservoirMusical, mulberry32, type ConfigReservoir, type NoteGeneree } from "./reservoir";
import { decoderInstrumentSF2 } from "../plugins/soundfontGlobal";
import { notesVersFichierMidi } from "./midi";
import { formeOndeDepuisTimbre } from "./timbres";

export interface ConfigMultiReservoir {
  cle: string;
  gamme: string;
  tempo: number;
  pasParBeat: number;
  mesures: number;
  volume: number;
  timbre: string;
  graine: number;

  // Réservoir mélodie
  melodieNeurones: number;
  melodieConnectivite: number;
  melodieMemoire: number;

  // Réservoir basse
  basseNeurones: number;
  basseConnectivite: number;
  basseOctave: number;

  // Réservoir harmonie
  harmonieNeurones: number;
  harmonieConnectivite: number;

  // Réservoir rythme (détermine quand les autres jouent)
  rythmeNeurones: number;
  rythmeDensite: number;

  // Kit de batterie pour la sortie MIDI rythme (bank * 128 + programme)
  rythmeInstrument: number;
  // Transposition (en demi-tons) appliquée aux notes de batterie MIDI
  rythmeTranspose: number;

  // Influence croisée (0 = indépendants, 1 = forte influence)
  influence: number;
}

export interface MultiReservoirResult {
  notes: NoteGeneree[];
  buffer: AudioBuffer;
  details: string;
  midis: {
    melody: File;
    bass: File;
    harmony: File;
    rhythm: File;
  };
}

export function genererMultiReservoir(config: ConfigMultiReservoir): MultiReservoirResult {
  const graineBase = config.graine > 0 ? config.graine : Math.floor(Math.random() * 99999) + 1;
  const sr = 44100;
  const stepDur = (60 / config.tempo) / config.pasParBeat;
  const totalPas = config.mesures * 4 * config.pasParBeat;

  // Créer 4 réservoirs avec des graines distinctes mais corrélées
  const baseConfig: ConfigReservoir = {
    taille: 15, connectivite: 0.3, leaking: 0.3, gain: 1.5, spectre: 0.9,
    cle: config.cle, gamme: config.gamme, octave: 4,
    tempo: config.tempo, pasParBeat: config.pasParBeat,
    mesures: config.mesures, volume: config.volume, timbre: config.timbre,
    graine: 0, probaNote: 0.7, repetition: 0.25, silence: 0.1,
  };

  // 1. Rythme : génère un pattern de pulsations (quand jouer)
  const configRythme: ConfigReservoir = {
    ...baseConfig,
    taille: config.rythmeNeurones,
    connectivite: config.rythmeDensite / 100,
    probaNote: config.rythmeDensite / 100,
    repetition: 0.3,
    silence: 0.2,
    octave: 2,
    graine: graineBase + 1,
  };
  const { notes: notesRythme } = genererReservoirMusical(configRythme);
  // Les pas actifs = pas où le rythme a produit une note
  const pasActifs = new Set<number>();
  for (const n of notesRythme) {
    if (!n.silence) {
      const pas = Math.floor(n.debut / stepDur);
      pasActifs.add(pas);
    }
  }
  // Si le rythme est trop vide, ajouter une pulsation de secours sur les beats
  const activesRythme = notesRythme.filter((n) => !n.silence);
  if (pasActifs.size < totalPas * 0.2) {
    const NOTES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
    const noteBase = 36 + Math.max(0, NOTES.indexOf(config.cle));
    for (let p = 0; p < totalPas; p += config.pasParBeat) {
      if (!activesRythme.some((n) => Math.floor(n.debut / stepDur + 0.5) === p)) {
        notesRythme.push({ note: noteBase, velocite: 80, debut: p * stepDur, duree: stepDur, silence: false });
      }
      pasActifs.add(p);
    }
  }

  // 2. Mélodie : la voix principale
  const configMelodie: ConfigReservoir = {
    ...baseConfig,
    taille: config.melodieNeurones,
    connectivite: config.melodieConnectivite / 100,
    leaking: config.melodieMemoire / 100,
    probaNote: 0.8,
    repetition: 0.2,
    silence: 0.05,
    octave: 4,
    graine: graineBase + 2,
  };
  const { notes: notesMelodie } = genererReservoirMusical(configMelodie);

  // 3. Basse : une octave plus bas, plus espacée
  const configBasse: ConfigReservoir = {
    ...baseConfig,
    taille: config.basseNeurones,
    connectivite: config.basseConnectivite / 100,
    leaking: 0.5, // mémoire longue pour la basse
    probaNote: 0.4,
    repetition: 0.4,
    silence: 0.15,
    octave: config.basseOctave,
    gamme: config.gamme,
    graine: graineBase + 3,
  };
  const { notes: notesBasse } = genererReservoirMusical(configBasse);

  // 4. Harmonie : accords épars (longues notes)
  const configHarmonie: ConfigReservoir = {
    ...baseConfig,
    taille: config.harmonieNeurones,
    connectivite: config.harmonieConnectivite / 100,
    leaking: 0.7, // mémoire très longue pour des notes tenues
    probaNote: 0.2,
    repetition: 0.5,
    silence: 0.3,
    octave: 3,
    gamme: config.gamme,
    graine: graineBase + 4,
  };
  const { notes: notesHarmonie } = genererReservoirMusical(configHarmonie);

  // 5. Influence croisée : filtrer les notes de mélodie/basse/harmonie
  //    pour ne jouer que sur les pas actifs du rythme (si influence > 0)
  function filtrerParRythme(notes: NoteGeneree[], influence: number): NoteGeneree[] {
    if (influence <= 0) return notes;
    return notes.filter((n) => {
      if (n.silence) return true; // garder les silences
      const pas = Math.floor(n.debut / stepDur);
      // Plus l'influence est forte, plus on filtre strictement
      const tol = Math.ceil((1 - influence) * config.pasParBeat);
      for (let dp = -tol; dp <= tol; dp++) {
        if (pasActifs.has(pas + dp)) return true;
      }
      return false;
    });
  }

  const melodieFiltree = filtrerParRythme(notesMelodie, config.influence);
  const basseFiltree = filtrerParRythme(notesBasse, config.influence * 0.7); // basse moins filtrée
  const harmonieFiltree = filtrerParRythme(notesHarmonie, config.influence * 0.5); // harmonie peu filtrée

  // Ajuster les vélocités par rôle
  const melodieFinale = melodieFiltree.map((n) => ({ ...n, velocite: Math.min(127, n.velocite) }));
  const basseFinale = basseFiltree.map((n) => ({ ...n, velocite: Math.min(110, Math.round(n.velocite * 0.85)) }));
  const harmonieFinale = harmonieFiltree.map((n) => ({
    ...n,
    velocite: Math.min(90, Math.round(n.velocite * 0.6)),
    duree: n.duree * 2, // notes tenues
  }));
  const rythmeFinale = notesRythme.map((n) => ({ ...n, velocite: Math.min(100, Math.round(n.velocite * 0.7)) }));

  // Combiner toutes les notes
  const toutesNotes = [...melodieFinale, ...basseFinale, ...harmonieFinale, ...rythmeFinale];

  // Rendu audio : chaque rôle a un timbre légèrement différent
  const dureeTotale = Math.max(...toutesNotes.map((n) => n.debut + n.duree)) + 0.3;
  const len = Math.ceil(dureeTotale * sr);
  const buf = new AudioBuffer({ numberOfChannels: 2, length: len, sampleRate: sr });
  const vol = Math.max(0, Math.min(1, config.volume / 100)) * 0.4;

  const gauche = buf.getChannelData(0);
  const droite = buf.getChannelData(1);

  function rendreNotes(notes: NoteGeneree[], typeOsc: OscillatorType, volRole: number, pan: number) {
    for (const n of notes) {
      if (n.silence) continue;
      const freq = 440 * Math.pow(2, (n.note - 69) / 12);
      const debutEch = Math.floor(n.debut * sr);
      const finEch = Math.min(debutEch + Math.ceil(n.duree * sr), len);
      const dureeNote = (finEch - debutEch) / sr;
      const a = 0.005, d = 0.05, s = 0.7, r = 0.05;

      for (let i = debutEch; i < finEch; i++) {
        const t = (i - debutEch) / sr;
        const phase = 2 * Math.PI * freq * t;
        let echantillon: number;
        switch (typeOsc) {
          case "square": echantillon = Math.sign(Math.sin(phase)); break;
          case "sawtooth": echantillon = 2 * ((freq * t) % 1) - 1; break;
          case "triangle": echantillon = 2 * Math.abs(2 * ((freq * t) % 1) - 1) - 1; break;
          default: echantillon = Math.sin(phase);
        }
        let env: number;
        if (t < a) env = t / a;
        else if (t < a + d) env = 1 - (1 - s) * ((t - a) / d);
        else if (t < dureeNote - r) env = s;
        else env = s * Math.max(0, 1 - (t - (dureeNote - r)) / r);

        const v = echantillon * vol * volRole * env * (n.velocite / 127);
        gauche[i] += v * (1 - pan);
        droite[i] += v * (1 + pan);
      }
    }
  }

  const osc: OscillatorType = formeOndeDepuisTimbre(config.timbre) ?? "triangle";

  rendreNotes(melodieFinale, osc, 1.0, 0.0);
  rendreNotes(basseFinale, "sine", 0.9, -0.3);
  rendreNotes(harmonieFinale, osc, 0.5, 0.3);
  rendreNotes(rythmeFinale, "square", 0.6, 0.0);

  // Normalisation
  let pic = 1e-9;
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < len; i++) { const a = Math.abs(d[i]); if (a > pic) pic = a; }
  }
  const g = 0.9 / pic;
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < len; i++) d[i] *= g;
  }

  const nbMel = melodieFinale.filter((n) => !n.silence).length;
  const nbBasse = basseFinale.filter((n) => !n.silence).length;
  const nbHarm = harmonieFinale.filter((n) => !n.silence).length;
  const nbRythme = rythmeFinale.filter((n) => !n.silence).length;

  // Map the rhythm part to General MIDI drum notes for the MIDI output.
  // The audio preview still uses the original pitch-based rhythm notes.
  const gmDrums = {
    kick: 36, snare: 38, clap: 39, closedHat: 42, pedalHat: 44, lowTom: 45, openHat: 46, crash: 49, highTom: 50,
  };
  const rngDrums = mulberry32(graineBase + 100);
  const pasParMesure = config.pasParBeat * 4;
  const halfStep = Math.floor(config.pasParBeat / 2);
  const rythmeGM = rythmeFinale.map((n) => {
    if (n.silence) return n;
    const step = Math.floor(n.debut / stepDur);
    const beat = step % pasParMesure;
    let note = gmDrums.closedHat;
    if (beat === 0) {
      note = gmDrums.kick;
    } else if (beat === pasParMesure / 2) {
      note = gmDrums.snare;
    } else if (halfStep > 0 && beat % config.pasParBeat === halfStep) {
      note = rngDrums() > 0.7 ? gmDrums.openHat : gmDrums.closedHat;
    } else if (beat % config.pasParBeat === 0) {
      note = rngDrums() > 0.5 ? gmDrums.lowTom : gmDrums.highTom;
    } else {
      note = rngDrums() > 0.6 ? gmDrums.clap : gmDrums.closedHat;
    }
    const transpose = config.rythmeTranspose ?? 0;
    return { ...n, note: Math.max(0, Math.min(127, note + transpose)) };
  });

  const { programme: rythmeProgramme, banque: rythmeBanque } = decoderInstrumentSF2(config.rythmeInstrument ?? 0);

  function toMidiFile(notes: NoteGeneree[], name: string, canal = 0, banque?: number, programme?: number): File {
    const events = notes
      .filter((n) => !n.silence)
      .map((n) => ({ note: n.note, velocite: n.velocite, debut: n.debut, fin: n.debut + n.duree }));
    const file = notesVersFichierMidi(events, config.tempo, canal, banque, programme);
    return new File([file], name, { type: file.type });
  }

  return {
    notes: toutesNotes,
    buffer: buf,
    details: `Mélodie: ${nbMel} · Basse: ${nbBasse} · Harmonie: ${nbHarm} · Rythme: ${nbRythme}`,
    midis: {
      melody: toMidiFile(melodieFinale, "multi-melody.mid"),
      bass: toMidiFile(basseFinale, "multi-bass.mid"),
      harmony: toMidiFile(harmonieFinale, "multi-harmony.mid"),
      rhythm: toMidiFile(rythmeGM, "multi-rhythm.mid", 9, rythmeBanque, rythmeProgramme),
    },
  };
}
