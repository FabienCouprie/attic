// ui/libelles-fiche.ts — Le nom, le résumé et la notice d'une fiche, dans la langue affichée.
//
// La projection `lang === "en" && def.xxxEn ? def.xxxEn : def.xxx` était recopiée à
// chaque endroit qui affiche une fiche — nœud, inspecteur, palette. Recopiée six fois,
// oubliée une : l'infobulle du catalogue montrait `resume`, donc du français, même en
// anglais. Une seule fonction par champ, et un endroit de plus n'oublie plus rien.
//
// Le repli sur le français est voulu : une fiche sans traduction doit s'afficher, pas
// disparaître. C'est aussi ce que fait le catalogue Markdown (`resumeEn ?? resume`).
import type { FicheAudio } from "../audio/types-domaine";

type Langue = string;

const projeter = (fr: string | undefined, en: string | undefined, lang: Langue) =>
  lang === "en" && en ? en : fr;

/** Nom affiché de la fiche. */
export function nomFiche(def: Pick<FicheAudio, "nom" | "nomEn">, lang: Langue): string {
  return projeter(def.nom, def.nomEn, lang) ?? "";
}

/** Résumé d'une ligne — l'infobulle du catalogue, le sous-titre de l'inspecteur. */
export function resumeFiche(def: Pick<FicheAudio, "resume" | "resumeEn">, lang: Langue): string {
  return projeter(def.resume, def.resumeEn, lang) ?? "";
}

/**
 * Notice longue. Vide quand la fiche n'en a pas : les appelants testent `def.notice`
 * avant d'appeler, et affichent le résumé à la place.
 */
export function noticeFiche(def: Pick<FicheAudio, "notice" | "noticeEn">, lang: Langue): string {
  return projeter(def.notice, def.noticeEn, lang) ?? "";
}
