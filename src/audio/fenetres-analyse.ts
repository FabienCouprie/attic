// audio/fenetres-analyse.ts — Les tailles de fenêtre d'analyse, déclarées une fois.
//
// POURQUOI CE MODULE EXISTE. Vingt et un réglages du parc offrent une taille de transformée, et
// chacun écrivait sa liste à la main. `appariement-reference.ts` portait déjà la crainte en
// commentaire : « une liste neuve en aurait fait une onzième ». C'est à cela que ce module répond,
// et à rien d'autre.
//
// CE QU'IL NE PRÉTEND PAS UNIFIER, parce que le relevé a montré que ce n'était pas une dette :
//
//   LES COUPES. Un réglage offre la table entière, sauf là où son algorithme dit sa borne : cinq
//   réglages en gardent une part, et la raison de chacune est déclarée au champ `coupes` du
//   domaine « fenêtre d'analyse », dans `plugins/nomenclatures.ts`, non ici.
//
//   LA DOCUMENTATION DU CHOIX. Chaque réglage a la sienne, et elle dit ce que la taille fait DANS
//   CE COMPOSANT : « 2048 est le compromis de l'article », « sans effet sur l'étirement ». Une
//   documentation commune les remplacerait toutes par moins.
//
//   L'ABSENCE DE LISTE ANGLAISE sur deux réglages, qui porte sa raison écrite à côté d'elle : des
//   tailles de fenêtre ne se traduisent pas.
//
// LES LIBELLÉS DESCRIPTIFS, eux, viennent d'ici depuis le 2026-11-14. Ils étaient relatifs à leur
// liste, « Ordinaire » nommant la taille du milieu de chacune, et s'écrivaient donc trois fois à la
// main. Les listes étant devenues entières, chaque libellé dit désormais ce que SA taille fait voir,
// le même partout.

/** Les tailles de fenêtre que le parc emploie, en échantillons, par ordre croissant. */
export const TAILLES_FENETRE = [256, 512, 1024, 2048, 4096, 8192] as const;

/**
 * Les listes d'un réglage de taille de fenêtre, pour le sous-ensemble demandé.
 *
 * L'ORDRE EST CELUI QUI EST DEMANDÉ, et non celui de la table : la valeur d'un réglage enregistrée
 * dans un projet ancien se résout par la position, donc réordonner une liste ferait qu'un projet
 * rouvert désignerait une autre taille. Une taille absente de la table jette, plutôt que de rendre
 * une liste amputée en silence.
 *
 * `optionsEn` est rendu parce qu'un nombre s'écrit pareil dans les deux langues ; le réglage qui a
 * décidé de n'en pas déclarer garde sa raison, et ne passe pas par ici.
 */
export function choixFenetre(tailles: readonly number[]): { options: string[]; optionsEn: string[]; optionIds: string[] } {
  const ids = tailles.map((t) => {
    if (!(TAILLES_FENETRE as readonly number[]).includes(t)) {
      throw new Error(`taille de fenêtre inconnue : ${t}`);
    }
    return String(t);
  });
  return { options: [...ids], optionsEn: [...ids], optionIds: [...ids] };
}

/**
 * Ce que chaque taille fait voir, en français et en anglais. Symétrique autour de 2048 : deux crans
 * plus bas, 512 est très fine en temps ; deux crans plus haut, 8192 l'est en fréquence.
 */
const LIBELLES: Record<(typeof TAILLES_FENETRE)[number], readonly [string, string]> = {
  256: ["La plus fine en temps (256)", "Sharpest in time (256)"],
  512: ["Très fine en temps (512)", "Very sharp in time (512)"],
  1024: ["Fine en temps (1024)", "Sharp in time (1024)"],
  2048: ["Ordinaire (2048)", "Ordinary (2048)"],
  4096: ["Fine en fréquence (4096)", "Sharp in frequency (4096)"],
  8192: ["Très fine en fréquence (8192)", "Very sharp in frequency (8192)"],
};

/**
 * Les listes d'un réglage qui nomme ses tailles par leur effet, « Ordinaire (2048) ».
 *
 * LES IDENTIFIANTS SONT CEUX DE `choixFenetre`, le nombre seul : un projet enregistre l'identifiant,
 * et un libellé d'un projet ancien se résout par son rang dans la même liste, apparié ici.
 */
export function choixFenetreNomme(tailles: readonly number[]): { options: string[]; optionsEn: string[]; optionIds: string[] } {
  const { optionIds } = choixFenetre(tailles);
  const libelle = (t: number, langue: 0 | 1) => LIBELLES[t as keyof typeof LIBELLES][langue];
  return { options: tailles.map((t) => libelle(t, 0)), optionsEn: tailles.map((t) => libelle(t, 1)), optionIds };
}
