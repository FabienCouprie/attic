// audio/voice-changer.ts — Effets de transformation vocale prédéfinis.
// Combine pitch-shift, décalage formantique, filtrage et modulations simples.
import { shiftFormants } from "./formants";
import { ringModulator } from "./effets-temporel";
import { appliquerFiltre } from "./effets-spectral";
import { bitcrusher } from "./effets-dynamique";

export type EffetVoiceChanger =
  | "Chipmunk"
  | "Monster"
  | "Robot"
  | "Phone"
  | "Alien"
  | "Helium"
  | "Ghost";

const EFFETS: EffetVoiceChanger[] = [
  "Chipmunk",
  "Monster",
  "Robot",
  "Phone",
  "Alien",
  "Helium",
  "Ghost",
];

export function listeEffetsVoiceChanger(): readonly EffetVoiceChanger[] {
  return EFFETS;
}

export async function appliquerVoiceChanger(
  buffer: AudioBuffer,
  effet: string,
): Promise<AudioBuffer> {
  const e = effet as EffetVoiceChanger;
  switch (e) {
    case "Chipmunk":
      // Pitch aigu + formants légèrement remontés (effet hélium/cartoon).
      return shiftFormants(buffer, 12, 1.25);
    case "Monster":
      // Pitch grave + formants abaissés (voix de monstre/démon).
      return shiftFormants(buffer, -12, 0.75);
    case "Robot":
      // Formants très abaissés + modulation en anneau + bitcrusher.
      return bitcrusher(
        ringModulator(shiftFormants(buffer, 0, 0.5), 100, 30),
        8,
        22050,
        30,
      );
    case "Phone":
      // Bande passante téléphonique + légère compression de bits.
      return bitcrusher(
        await appliquerFiltre(buffer, "bandpass", 1000, 1),
        12,
        22050,
        20,
      );
    case "Alien":
      return shiftFormants(buffer, -7, 0.85);
    case "Helium":
      return shiftFormants(buffer, 7, 1.3);
    case "Ghost":
      // Voix aiguë + formants flottants.
      return shiftFormants(buffer, 5, 1.1);
    default:
      return buffer;
  }
}
