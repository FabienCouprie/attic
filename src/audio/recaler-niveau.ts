// audio/recaler-niveau.ts — Aligner le niveau d'un son sur celui d'un autre.
//
// L'OPÉRATION EST EXPLICITE, ET C'EST VOULU. Le moteur ne redresse jamais un niveau de lui-même :
// une correction cachée casserait les composants dont le niveau est l'objet, les garanties de
// reconstruction et l'associativité de la chaîne. Voir l'en-tête d'`ecart-niveau.ts`. Ici la
// correction est un composant du graphe, qu'on pose là où on la veut.
//
// LE GAIN EST CONSTANT SUR TOUTE LA DURÉE. Ce module n'est pas un compresseur : il applique un
// facteur unique, si bien que la dynamique du son corrigé est intacte, à la constante près.
import { creteDb, niveauDb } from "./ecart-niveau";

export type MesureRecalage = "sonie" | "rms" | "crete";

export interface OptionsRecalage {
  /** Ce qu'on aligne. La sonie suit l'oreille, la crête suit le fichier. */
  mesure: MesureRecalage;
  /** Le gain ne dépassera pas cette valeur absolue, en décibels. */
  correctionMax: number;
  /** Crête maximale tolérée en sortie, en dBFS. `null` pour ne rien plafonner. */
  plafondCrete: number | null;
}

export interface ResultatRecalage {
  /** Le niveau de la référence, dans l'unité choisie. */
  reference: number;
  /** Le niveau du son à corriger, avant correction. */
  avant: number;
  /** Le niveau obtenu, mesuré sur le son rendu. */
  apres: number;
  /** Le gain réellement appliqué, en décibels. */
  gainDb: number;
  /** Le gain qu'il aurait fallu, avant bornage. */
  gainDemandeDb: number;
  /** Vrai si `correctionMax` a borné le gain. */
  borne: boolean;
  /** Vrai si `plafondCrete` a réduit le gain. */
  plafonne: boolean;
  /** La crête du son rendu, en dBFS. */
  creteApres: number;
}

/** Le niveau d'un tampon dans l'unité demandée, en décibels. */
export function mesurerSelon(buffer: AudioBuffer, mesure: MesureRecalage): number {
  if (mesure === "crete") return creteDb(buffer);
  if (mesure === "sonie") return niveauDb(buffer);
  let somme = 0;
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const x = buffer.getChannelData(c);
    for (let i = 0; i < x.length; i++) somme += x[i] * x[i];
  }
  const n = buffer.length * Math.max(1, buffer.numberOfChannels);
  const rms = n > 0 ? Math.sqrt(somme / n) : 0;
  return rms > 0 ? 20 * Math.log10(rms) : -Infinity;
}

/**
 * Le gain qui aligne `aCorriger` sur `reference`, et le son corrigé.
 *
 * TROIS BORNES, dans cet ordre :
 *   1. `correctionMax` limite la valeur absolue du gain. Sans elle, un son presque silencieux
 *      demanderait quarante décibels et ne rendrait que son bruit de fond, amplifié.
 *   2. `plafondCrete` réduit encore le gain si la crête obtenue le dépasserait. Le niveau visé
 *      n'est alors pas atteint, et le résultat le dit plutôt que d'écrêter.
 *   3. Un niveau non mesurable d'un côté ou de l'autre, un silence par exemple, laisse le son
 *      inchangé et rend un gain nul.
 *
 * Le tampon rendu est neuf ; celui reçu n'est pas modifié.
 */
export function recaler(
  reference: AudioBuffer, aCorriger: AudioBuffer, o: OptionsRecalage,
  creerTampon: (canaux: number, longueur: number, sr: number) => AudioBuffer =
    (canaux, longueur, sr) => new AudioBuffer({ numberOfChannels: canaux, length: longueur, sampleRate: sr }),
): { audio: AudioBuffer; resultat: ResultatRecalage } {
  const niveauRef = mesurerSelon(reference, o.mesure);
  const niveauAvant = mesurerSelon(aCorriger, o.mesure);

  let gainDemande = 0;
  if (Number.isFinite(niveauRef) && Number.isFinite(niveauAvant)) gainDemande = niveauRef - niveauAvant;

  const max = Math.abs(o.correctionMax);
  let gain = Math.max(-max, Math.min(max, gainDemande));
  const borne = gain !== gainDemande;

  let plafonne = false;
  if (o.plafondCrete !== null) {
    const creteAvant = creteDb(aCorriger);
    if (Number.isFinite(creteAvant)) {
      const marge = o.plafondCrete - creteAvant;
      if (gain > marge) {
        gain = marge;
        plafonne = true;
      }
    }
  }

  const facteur = Math.pow(10, gain / 20);
  const audio = creerTampon(aCorriger.numberOfChannels, aCorriger.length, aCorriger.sampleRate);
  for (let c = 0; c < aCorriger.numberOfChannels; c++) {
    const src = aCorriger.getChannelData(c);
    const dst = audio.getChannelData(c);
    for (let i = 0; i < src.length; i++) dst[i] = src[i] * facteur;
  }

  return {
    audio,
    resultat: {
      reference: niveauRef,
      avant: niveauAvant,
      apres: mesurerSelon(audio, o.mesure),
      gainDb: gain,
      gainDemandeDb: gainDemande,
      borne,
      plafonne,
      creteApres: creteDb(audio),
    },
  };
}
