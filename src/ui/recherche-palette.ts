// ui/recherche-palette.ts — Filtre de la palette de nœuds.
//
// Extrait de Palette.tsx pour être testable sans rendu React, comme
// validerGraphe.ts. La recherche couvre aussi les notices : elles portent
// l'essentiel de la documentation (91 000 caractères sur 245 fiches) et
// contiennent seules les termes par lesquels on cherche réellement un
// traitement qu'on ne sait pas nommer — « battement », « irrationnel »,
// « illusion » ne figurent dans aucun nom ni aucun résumé.
import type { FicheAudio } from "../audio/types-domaine";

/** Champs d'une fiche balayés par la recherche, du plus au moins spécifique. */
function champs(p: FicheAudio, familleTraduite: string): (string | undefined)[] {
  return [p.nom, p.resume, p.famille, p.nomEn, p.resumeEn, familleTraduite, p.notice, p.noticeEn];
}

/**
 * Retient les fiches dont un champ contient la requête, sans distinction de
 * casse. Une requête vide rend la liste inchangée (même référence).
 *
 * @param familleTraduite traduction affichée de la famille, ou "" si la langue
 *   courante est déjà celle des libellés stockés.
 */
export function filtrerFiches(
  plugins: FicheAudio[],
  requete: string,
  familleTraduite: (famille: string) => string,
): FicheAudio[] {
  const s = requete.trim().toLowerCase();
  if (!s) return plugins;
  return plugins.filter((p) =>
    champs(p, familleTraduite(p.famille)).some((c) => c?.toLowerCase().includes(s)),
  );
}
