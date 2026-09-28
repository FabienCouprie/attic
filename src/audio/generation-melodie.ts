// audio/generation-melodie.ts — Les gammes melodiques, et la melodie tiree au hasard.
//
// Une part de ce qui tenait dans un seul fichier, decoupee selon ses dependances. Aucune ligne
// de calcul n'a ete retouchee au passage.

import { type NoteEvenement } from "./midi-sequence";
import { DEMI_TONS_CLE, frequenceDeNoteMidi } from "./commun";
import { degresGammeAccords } from "./generation";

const DEGRES_MINEUR_HARMONIQUE = [0, 2, 3, 5, 7, 8, 11];

export function degresGammeMelodie(id: string): number[] {
  if (id === "mineur-harmonique") return DEGRES_MINEUR_HARMONIQUE;
  return degresGammeAccords(id);
}

// Libellés FR/EN et ids canoniques du paramètre "Gamme" de ces nœuds
// mélodiques — définis ici (et pas dans un fichier plugins/*) pour que
// chaque fichier plugins/*.ts puisse les importer depuis "../audio" comme
// il le fait déjà pour tout le reste, sans dépendance croisée entre
// fichiers de plugins (qui casserait le graphe de modules circulaire
// plugins/index.ts ↔ audio/adaptateur.ts).
export const GAMMES_MELODIE_FR = ["Majeur", "Mineur naturel", "Mineur harmonique", "Dorien", "Phrygien", "Lydien", "Mixolydien", "Locrien", "Pentatonique majeure", "Pentatonique mineure", "Chromatique"];
export const GAMMES_MELODIE_EN = ["Major", "Natural minor", "Harmonic minor", "Dorian", "Phrygian", "Lydian", "Mixolydian", "Locrian", "Major pentatonic", "Minor pentatonic", "Chromatic"];
export const GAMMES_MELODIE_IDS = ["majeur", "mineur", "mineur-harmonique", "dorien", "phrygien", "lydien", "mixolydien", "locrien", "pentatonique-majeure", "pentatonique-mineure", "chromatique"];


export async function genererMelodieAleatoire(
  cle: string,
  gamme: string,
  signature: string,
  tempoBpm: number,
  nbMesures: number,
  hasard: () => number = Math.random,
): Promise<{ audio: AudioBuffer; notes: NoteEvenement[] }> {
  const decalage = DEMI_TONS_CLE[cle] ?? 0;
  const degres = degresGammeMelodie(gamme);
  const [tempsParMesureTexte, uniteBattementTexte] = signature.split("/");
  const tempsParMesure = Number(tempsParMesureTexte) || 4;
  const uniteBattement = Number(uniteBattementTexte) || 4;

  const dureeNoire = 60 / Math.max(1, tempoBpm);
  const dureeBattement = dureeNoire * (4 / uniteBattement);
  const nbBattements = Math.max(1, tempsParMesure) * Math.max(1, nbMesures);

  const sampleRate = 44100;
  const dureeTotale = nbBattements * dureeBattement + 1;
  const offline = new OfflineAudioContext(2, Math.ceil(dureeTotale * sampleRate), sampleRate);
  const notes: NoteEvenement[] = [];

  const noteCentrale = 60; // Do central
  let tempsCourant = 0;

  for (let i = 0; i < nbBattements; i++) {
    const subdivise = hasard() < 0.3;
    const nbSousNotes = subdivise ? 2 : 1;
    const dureeNote = dureeBattement / nbSousNotes;

    for (let s = 0; s < nbSousNotes; s++) {
      const silence = hasard() < 0.1;
      if (!silence) {
        const degre = degres[Math.floor(hasard() * degres.length)];
        const octave = Math.floor(hasard() * 2) * 12;
        const midi = noteCentrale + decalage + degre + octave;
        const frequence = frequenceDeNoteMidi(midi);

        const debut = tempsCourant + s * dureeNote;
        const fin = debut + dureeNote;
        const attaque = 0.01;
        const relache = Math.min(0.08, dureeNote * 0.3);

        const osc = offline.createOscillator();
        osc.type = "triangle";
        osc.frequency.value = frequence;

        const gain = offline.createGain();
        gain.gain.setValueAtTime(0, debut);
        gain.gain.linearRampToValueAtTime(0.5, debut + attaque);
        gain.gain.setValueAtTime(0.5, debut + Math.max(attaque, dureeNote - relache));
        gain.gain.linearRampToValueAtTime(0, debut + dureeNote);

        osc.connect(gain);
        gain.connect(offline.destination);
        osc.start(debut);
        osc.stop(debut + dureeNote + 0.02);
        notes.push({ note: midi, velocite: 80 + Math.floor(hasard() * 40), debut, fin });
      }
    }

    tempsCourant += dureeBattement;
  }

  const audio = await offline.startRendering();
  return { audio, notes };
}


