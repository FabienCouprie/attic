// audio/fenetres-analyse.ts — Les tailles de fenêtre d'analyse, déclarées une fois.
//
// POURQUOI CE MODULE EXISTE. Vingt et un réglages du parc offrent une taille de transformée, et
// chacun écrivait sa liste à la main. `appariement-reference.ts` portait déjà la crainte en
// commentaire : « une liste neuve en aurait fait une onzième ». C'est à cela que ce module répond,
// et à rien d'autre.
//
// CE QU'IL NE PRÉTEND PAS UNIFIER, parce que le relevé a montré que ce n'était pas une dette :
//
//   LES SOUS-ENSEMBLES. Six coexistent, de 256 à 8192, et chacun est la borne de son algorithme.
//   Cette borne s'écrit à côté du composant qui la porte, non ici.
//
//   LA DOCUMENTATION DU CHOIX. Chaque réglage a la sienne, et elle dit ce que la taille fait DANS
//   CE COMPOSANT : « 2048 est le compromis de l'article », « sans effet sur l'étirement ». Une
//   documentation commune les remplacerait toutes par moins.
//
//   LES LIBELLÉS DESCRIPTIFS de cinq réglages, « Fine en temps (1024) », « Ordinaire (2048) ». Ils
//   sont RELATIFS à la liste qui les porte : « Ordinaire » nomme 2048 chez l'un et ne nomme rien
//   chez l'autre, de sorte qu'une table centrale ne peut pas les produire.
//
//   L'ABSENCE DE LISTE ANGLAISE sur deux réglages, qui porte sa raison écrite à côté d'elle : des
//   tailles de fenêtre ne se traduisent pas.

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
