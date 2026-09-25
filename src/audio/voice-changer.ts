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

/** Le decalage de formants, injectable pour le faire calculer hors du fil de l interface. */
export type DecalageFormants = (b: AudioBuffer, demiTons: number, ratio: number) => Promise<AudioBuffer> | AudioBuffer;

/**
 * POURQUOI LE DECALAGE DE FORMANTS EST INJECTABLE. Il est le cout dominant de ce composant sur ses
 * prereglages les plus employes, et il est pur : il peut donc tourner dans un worker. Les autres
 * etapes de la chaine sont rendues par OfflineAudioContext, qui ne bloque pas le fil principal. La
 * prise passe donc une version hors du fil, et ce module reste libre de tout import de prise.
 */
export async function appliquerVoiceChanger(
  buffer: AudioBuffer,
  effet: string,
  formants: DecalageFormants = shiftFormants,
): Promise<AudioBuffer> {
  const e = effet as EffetVoiceChanger;
  switch (e) {
    case "Chipmunk":
      // Pitch aigu + formants légèrement remontés (effet hélium/cartoon).
      return formants(buffer, 12, 1.25);
    case "Monster":
      // Pitch grave + formants abaissés (voix de monstre/démon).
      return formants(buffer, -12, 0.75);
    case "Robot":
      // Formants très abaissés + modulation en anneau + bitcrusher.
      return bitcrusher(
        ringModulator(await formants(buffer, 0, 0.5), 100, 30),
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
      return formants(buffer, -7, 0.85);
    case "Helium":
      return formants(buffer, 7, 1.3);
    case "Ghost":
      // Voix aiguë + formants flottants.
      return formants(buffer, 5, 1.1);
    default:
      return buffer;
  }
}
