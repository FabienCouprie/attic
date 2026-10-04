// core/memoire.ts — Ce qu'un nœud exige de la mémoire, et s'il mérite qu'on retienne son résultat.
//
// LA QUESTION NE SE TRAITE PAS DANS L'ABSOLU. Garder un résultat en mémoire vive ou le poser sur le
// disque n'a pas une bonne réponse : cela dépend de ce que le nœud exige. Un étirement temporel ne
// peut rien produire avant d'avoir le signal entier — il lit la fin pour écrire le début. Un gain,
// lui, n'a jamais besoin que de l'échantillon courant. Les traiter pareil, c'est payer pour le
// premier le prix du second, ou l'inverse. D'où une DÉCLARATION sur chaque fiche (`memoire`), et
// non une règle unique appliquée de force à tout le catalogue.
//
// CE QU'UNE VALEUR PÈSE N'EST PLUS DÉCIDÉ ICI, et c'est la dernière chose que le cœur savait d'un
// domaine. Ce fichier portait l'arithmétique d'un tampon audio — flottants 32 bits, en-tête WAV,
// 1,27 Go par heure de stéréo — et un seuil de dix minutes qu'elle justifiait. Un domaine d'images
// ou de données tabulaires n'aurait ni les mêmes tailles ni le même seuil, et aurait hérité de
// celui-ci. Le calcul et le seuil vivent désormais dans `audio/memoire-audio.ts`, et le moteur
// demande au domaine « faut-il garder un aperçu de cette valeur » au lieu de le déduire d'une durée.
//
// DEUX CHOSES DISTINCTES, QU'IL NE FAUT PAS CONFONDRE. `ModeMemoire` dit ce que le nœud exige
// PENDANT son calcul — une propriété de l'algorithme, qui ne change jamais. La question de l'aperçu
// porte sur l'APRÈS — une propriété de la place du nœud dans le graphe, qui change à chaque clic. Un
// nœud « totale » ne mérite pas plus d'aperçu qu'un autre ; les mêler reviendrait à retenir une
// copie entière au motif qu'un étirement lit sa fin avant son début.
//
// CE QUI RESTE ICI EST SANS DOMAINE : ce qu'un nœud exige, s'il est regardé, si son résultat est
// retenu. Des faits de graphe et d'interface, que tout domaine partage.

/** Ce qu'un nœud exige de la mémoire pendant son calcul. */
export type ModeMemoire =
  /** Il ne peut pas commencer avant d'avoir le signal entier : étirement, Fourier, lecture à
   *  l'envers, recherche de crête, alignement. Rien ne le dispensera du tampon complet. */
  | "totale"
  /** Il avance échantillon par échantillon et n'a jamais besoin de regarder devant : gain,
   *  mélange, coupe, conversion. Au-delà du seuil, il pourra travailler par blocs. */
  | "flux";

// LE SEUIL, LES DEUX FORMULES DE TAILLE ET `apercuUtile` SONT PARTIS DANS LE DOMAINE
// (`audio/memoire-audio.ts`) : ils ne parlaient que de tampons de flottants et d'en-têtes WAV.

/**
 * Ce nœud est-il regardé ?
 *
 * Deux situations, et pas une de plus. Il est SÉLECTIONNÉ — on vient de cliquer dessus, c'est son
 * résultat que l'on veut entendre. Ou il est TERMINAL — rien ne consomme sa sortie, c'est donc lui
 * le résultat de la chaîne, celui qu'on écoute sans avoir à le désigner. Tout le reste est un
 * intermédiaire : un passage, pas une destination.
 *
 * DANS UN MÉTA-COMPOSANT, LA TERMINAISON NE VEUT PLUS RIEN DIRE. Grouper des nœuds, c'est déclarer
 * qu'ils forment un rouage et non une destination : ce qu'on écoute, c'est la sortie du méta, vue
 * du dehors. Le dernier nœud du dedans n'est terminal que par accident de découpage. À l'intérieur,
 * il ne reste donc que la sélection — le nœud sur lequel on a cliqué, parce qu'on cherche
 * précisément à entendre celui-là.
 *
 * Quand le méta est refermé, la question ne se pose même pas : ses nœuds internes ne sont plus
 * dans la liste des nœuds visibles, et le moteur ne leur calcule aucun aperçu.
 */
/**
 * Faut-il garder le résultat de ce nœud dans le cache d'exécution ?
 *
 * UNE BULLE REPLIÉE EST UN ROUAGE, ET UN ROUAGE NE GARDE PAS SES PIÈCES INTERMÉDIAIRES. Ce que l'on
 * veut d'elle, c'est ce qui en sort ; ce que ses membres se passent entre eux ne sera plus regardé
 * ni écouté tant qu'elle est fermée, et cela pèse un tampon par membre — 1,27 Go par heure de stéréo
 * et par nœud.
 *
 * LE PRIX EST LE RECALCUL, ET IL FAUT LE DIRE : sans entrée de cache, chaque membre se refait à
 * l'exécution suivante, et comme le moteur refuse de croire une source qui vient d'être recalculée,
 * ce qui suit la bulle se refait aussi. On échange du temps contre de la place.
 *
 * L'ÉCHANGE SUIT LE RÉGLAGE QUI EXISTE DÉJÀ, l'économie de mémoire, plutôt que d'ajouter un
 * interrupteur : c'est le même arbitrage que pour les aperçus, et il se défait de la même façon.
 */
/**
 * ET LE CORPS D'UNE BOUCLE DÉPLIÉE NE SE GARDE PAS DAVANTAGE — demandé par Fabien.
 *
 * Une boucle de graphe ne boucle pas : elle se DÉPLIE, et les nœuds entre le début et la fin sont
 * recopiés autant de fois qu'il y a de tours, chaque copie recevant le résultat de la précédente.
 * Chacune est un nœud à part entière, avec sa propre entrée de cache — et ces copies ne figurent pas
 * parmi les nœuds visibles, de sorte que le ménage de fin de run ne les voyait même pas : elles
 * survivaient d'un run à l'autre, et pour toute la session.
 *
 * CE QUE CELA PÈSE, MESURÉ sur huit tours d'un écho à partir de cinq secondes de sinusoïde : vingt-
 * quatre tampons, **208,6 Mo**, dont 134,6 pour le seul corps de la boucle. Et la croissance est
 * quadratique quand la chaîne allonge son signal : le premier tour pèse 5,1 Mo, le huitième 28,6.
 *
 * CE QUE LA FIN DE BOUCLE REND, ELLE, RESTE EN CACHE : c'est un nœud visible, et c'est lui que
 * l'aval consomme. Ce qu'on lâche est l'échafaudage, pas l'ouvrage.
 *
 * LE PRIX EST LE MÊME QUE POUR LES BULLES, ET IL FAUT LE DIRE : sans entrée de cache, chaque tour se
 * refait à l'exécution suivante, et comme le moteur refuse de croire une source qui vient d'être
 * recalculée, la fin de boucle et tout son aval se refont aussi. Une boucle inchangée ne se
 * recalculait pas ; désormais elle se recalcule. On échange du temps contre de la place, et l'échange
 * se défait par le même interrupteur que pour les bulles.
 */
export function resultatRetenu(
  { cacheParBulle, corpsDeBoucle = false, economie = true }:
    { cacheParBulle: boolean; corpsDeBoucle?: boolean; economie?: boolean },
): boolean {
  return !economie || (!cacheParBulle && !corpsDeBoucle);
}

export function noeudRegarde(
  { id, selectionne, aretes, dansUnMeta = false, cacheParBulle = false }:
    {
      id: string; selectionne: boolean; aretes: readonly { source: string }[];
      dansUnMeta?: boolean; cacheParBulle?: boolean;
    },
): boolean {
  // DANS UNE BULLE REPLIÉE, PERSONNE N'EST REGARDÉ. Replier, c'est déclarer que ces nœuds forment un
  // rouage : on ne les voit pas, on ne peut pas les désigner, et ce qu'on écoute est la sortie de la
  // bulle, à laquelle le moteur construit son propre aperçu. Garder en plus celui de chaque membre,
  // c'est une seconde copie écoutable par nœud caché — 953 Mo par heure de stéréo et par membre.
  // Le même raisonnement vaut déjà pour un méta refermé ; une bulle repliée ne s'en distinguait que
  // par le fait que ses membres restent dans la liste des nœuds, le repli n'extrayant personne.
  if (cacheParBulle) return false;
  if (selectionne) return true;
  if (dansUnMeta) return false;
  return !aretes.some((a) => a.source === id);
}
