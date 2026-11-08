// plugins/gout-hors-fil.ts — La mesure de goût, calculée hors du fil de l'interface.
//
// POURQUOI CE PETIT MODULE. Trois composants mesurent le goût d'un son par la MÊME fonction, et
// c'est voulu : « Le goût d'un son » montre les cinq dimensions, « Accord mets-musique » cherche le
// plat qui s'en approche, « Parfum → motif » part de l'odeur pour y revenir. Trois appels au socle
// écrits trois fois auraient fini par diverger — un seul ouvrier, une seule prise.
//
// **CE QUE CELA RÉPARE, MESURÉ.** Sur trois secondes de son, et pas un seul message passé pendant
// ce temps : 248 millisecondes pour le goût, 1 558 pour le parfum, 3 920 pour l'accord mets-musique.
// Les deux derniers MESURAIENT UNE SECONDE FOIS SUR LE FIL, pour corriger le registre de leur
// motif, et ce n'était pas leur synthèse qui gelait encore la page : 2 785 et 816 ms au banc le
// 2026-11-08, 231 à 245 et 107 à 113 ms une fois cette mesure-là passée par ici,
// `rendreAuRegistre` la recevant en paramètre.

import { mesurerVoie, type MesuresGout, type OptionsVoieGout } from "../audio/gout";
import { mixdownMono } from "../audio/commun";
import { parCanal } from "./hors-fil";

/** Les cinq dimensions d'un son, mesurées dans un ouvrier quand on en a un. */
export async function mesurerGoutHorsFil(buffer: AudioBuffer): Promise<MesuresGout> {
  // UNE SEULE VOIE : un goût est une propriété du son, non de son image stéréo. Le mélange a lieu
  // ici, où il coûte une passe sur les échantillons, et l'ouvrier ne reçoit qu'un tableau.
  const [mesure] = await parCanal<OptionsVoieGout, MesuresGout>(
    [mixdownMono(buffer)],
    { sampleRate: buffer.sampleRate },
    {
      creerWorker: () => new Worker(new URL("../workers/gout-worker.ts", import.meta.url), { type: "module" }),
      calcul: mesurerVoie,
    },
  );
  return mesure;
}
