// audio/generation-fractale.ts — La musique tiree d'un motif deplie sur lui-meme.
//
// Une part de ce qui tenait dans un seul fichier, decoupee selon ses dependances. Aucune ligne
// de calcul n'a ete retouchee au passage.

import { type NoteEvenement } from "./midi-sequence";
import { DEMI_TONS_CLE, frequenceDeNoteMidi } from "./commun";
import { caractereTimbre, type CaractereTimbreId } from "./timbres";
import { degresGammeMelodie } from "./generation-melodie";
import { GAMMES_ACCORDS, degresGammeAccords } from "./generation";

const MOTIFS_PREDEFINIS: Record<string, number[]> = {
  "Triade M": [0, 4, 7],
  "Triade m": [0, 3, 7],
  "Arpège 7": [0, 4, 7, 10],
  "Cantus firmus": [0, 2, 4, 5, 7, 9, 11],
};


function degreVersMidi(degre: number, decalageCle: number, degresGamme: number[], octaveBase: number): number {
  const octaveDelta = Math.floor(degre / degresGamme.length);
  const idx = ((degre % degresGamme.length) + degresGamme.length) % degresGamme.length;
  return octaveBase + decalageCle + degresGamme[idx] + octaveDelta * 12;
}


function deplierMotif(motif: number[], profondeur: number): number[] {
  if (profondeur <= 1) return motif;
  const sous = deplierMotif(motif, profondeur - 1);
  const resultat: number[] = [];
  for (const intervalle of motif) {
    for (const note of sous) {
      resultat.push(intervalle + note);
    }
  }
  return resultat;
}


export async function genererMusiqueFractale(
  typeMotif: string,
  intervallesPerso: string,
  profondeur: number,
  dureeSec: number,
  tempo: number,
  cle: string,
  gamme: string,
  timbre: string
): Promise<{ audio: AudioBuffer; notes: NoteEvenement[] }> {
  const sampleRate = 44100;
  const pMax = Math.min(profondeur, 6);
  const motif = typeMotif === "Personnalisé"
    ? intervallesPerso.split(",").map((s) => parseInt(s.trim(), 10)).filter((n) => !isNaN(n))
    : (MOTIFS_PREDEFINIS[typeMotif] ?? [0, 4, 7]);
  if (motif.length === 0) motif.push(0);

  const degres = degresGammeMelodie(gamme);
  const decalageCle = DEMI_TONS_CLE[cle] ?? 0;

  const notesMidi = deplierMotif(motif, pMax);
  const dureeParNote = (60 / Math.max(1, tempo)) / (motif.length ** (pMax - 1) || 1);
  const dureeCalculee = notesMidi.length * dureeParNote;
  const facteur = dureeCalculee > 0 ? dureeSec / dureeCalculee : 1;
  const dureeNote = dureeParNote * facteur;

  const totalNotes = notesMidi.length;
  const dureeTotale = totalNotes * dureeNote;
  const offline = new OfflineAudioContext(2, Math.max(1, Math.ceil(dureeTotale * sampleRate)), sampleRate);
  const notes: NoteEvenement[] = [];

  // Comparaisons sur l'id canonique (et non plus sur le libellé français brut) :
  // `caractereTimbre` accepte l'id, l'ancien libellé FR et l'ancien libellé EN.
  const caractere = caractereTimbre(timbre);
  const formesOsc: Record<CaractereTimbreId, OscillatorType> = { douce: "triangle", brillante: "sawtooth", percutante: "square" };
  const typeOsc = formesOsc[caractere];
  const attaque = caractere === "percutante" ? 0.001 : 0.005;
  const relache = caractere === "douce" ? 0.15 : 0.04;

  for (let i = 0; i < totalNotes; i++) {
    const midiSnappe = degreVersMidi(
      Math.round(notesMidi[i]),
      decalageCle,
      degres,
      48
    );
    const freq = frequenceDeNoteMidi(midiSnappe);
    const debut = i * dureeNote;
    const fin = debut + dureeNote;
    const volume = caractere === "percutante" ? 0.3 : 0.18;

    const osc = offline.createOscillator();
    osc.type = typeOsc;
    osc.frequency.value = freq;

    const gain = offline.createGain();
    gain.gain.setValueAtTime(0, debut);
    gain.gain.linearRampToValueAtTime(volume, debut + attaque);
    gain.gain.setValueAtTime(volume, Math.max(debut + attaque, fin - relache));
    gain.gain.linearRampToValueAtTime(0, fin);

    osc.connect(gain);
    gain.connect(offline.destination);
    osc.start(debut);
    osc.stop(fin + 0.01);
    notes.push({ note: midiSnappe, velocite: 100, debut, fin });
  }

  const audio = await offline.startRendering();
  return { audio, notes };
}

// --- Génération mélodique aléatoire ---------------------------------------


// Gammes pour les nœuds mélodiques (Mélodie aléatoire, Musique fractale,
// Sampler personnalisé, Mappeur Mandelbrot, Arpège de Koch, Automate
// cellulaire) : les mêmes modes/gammes que les générateurs d'accords
// (GAMMES_ACCORDS, plus bas dans ce fichier — degresGammeAccords est une
// function declaration, donc utilisable ici malgré l'ordre textuel), plus
// la gamme mineure harmonique, propre aux nœuds mélodiques.
