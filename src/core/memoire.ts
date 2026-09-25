// core/memoire.ts — Ce qu'une piste coûte en mémoire, et à partir de quand cela compte.
//
// LA QUESTION NE SE TRAITE PAS DANS L'ABSOLU. Garder une piste en mémoire vive ou la poser sur le
// disque n'a pas une bonne réponse : cela dépend de ce que le nœud exige. Un étirement temporel ne
// peut rien produire avant d'avoir le signal entier — il lit la fin pour écrire le début. Un gain,
// lui, n'a jamais besoin que de l'échantillon courant. Les traiter pareil, c'est payer pour le
// premier le prix du second, ou l'inverse. D'où une DÉCLARATION sur chaque fiche (`memoire`), et
// non une règle unique appliquée de force à tout le catalogue.
//
// CE QUE CELA COÛTE, MESURÉ. Un `AudioBuffer` stocke des flottants 32 bits, hors du tas JavaScript :
// une heure en stéréo à 44 100 Hz pèse 3600 × 44100 × 2 × 4 = **1,27 Go**. L'aperçu écouté sous le
// nœud est une seconde copie, à la profondeur d'écriture choisie — **953 Mo** en vingt-quatre bits,
// qui est le défaut depuis que l'écriture a cessé d'être bloquée en seize, 635 Mo si l'on revient à
// seize, 1,27 Go en flottant. Allouée d'un bloc par `bufferVersWavBlob`, puis retenue par le Blob.
// Un nœud qui a tourné sur une heure de son retient donc près de **2,2 Go**, et une chaîne de cinq
// nœuds en retient onze. C'est ce chiffre-là, et non une intuition, qui fixe le seuil ci-dessous —
// et monter la profondeur le rend d'autant plus nécessaire.
//
// OÙ CET APERÇU EST RETENU, ET CE QUE CELA CHANGE. Pas dans le processus qui calcule : un Blob est
// détenu par le processus NAVIGATEUR de Chromium. Mesuré dans une seule session, sur une piste de
// 620 s — construire deux aperçus de 109 Mo fait grossir ce processus de 209 Mo, pendant que les
// autres ne bougent pas de plus de 4 Mo. Deux conséquences. D'abord, une mesure du tas côté onglet
// ne voit RIEN de ces octets : c'est pourquoi la comparaison de deux lancements ne prouvait rien,
// l'écart entre deux exécutions identiques atteignant 206 Mo. Ensuite, Chromium ne pose ces octets
// sur le disque (`userData/blob_storage`, un dossier par session, effacé en sortant) que si son
// quota en mémoire est dépassé ; sur une machine de 64 Go ce dossier reste vide, et tout l'aperçu
// est bel et bien en mémoire vive.
//
// DIX MINUTES, ET POURQUOI CE NOMBRE. En deçà, une chaîne ordinaire tient dans la mémoire d'une
// machine courante : dix minutes en stéréo font 212 Mo de tampon et 159 Mo d'aperçu, soit 370 Mo
// par nœud — cinq nœuds tiennent sous 1,9 Go. Au-delà, la même chaîne dépasse ce qu'on peut
// demander sans rien changer. Le seuil n'est donc pas un goût : c'est l'endroit où le comportement
// d'aujourd'hui cesse d'être tenable.
//
// DEUX CHOSES DISTINCTES, QU'IL NE FAUT PAS CONFONDRE. `ModeMemoire` dit ce que le nœud exige
// PENDANT son calcul — une propriété de l'algorithme, qui ne change jamais. `apercuUtile` dit s'il
// faut garder une copie écoutable APRÈS — une propriété de la place du nœud dans le graphe, qui
// change à chaque clic. Un nœud « totale » ne mérite pas plus d'aperçu qu'un autre ; les mêler
// reviendrait à retenir 953 Mo au motif qu'un étirement lit sa fin avant son début.

/** Ce qu'un nœud exige de la mémoire pendant son calcul. */
export type ModeMemoire =
  /** Il ne peut pas commencer avant d'avoir le signal entier : étirement, Fourier, lecture à
   *  l'envers, recherche de crête, alignement. Rien ne le dispensera du tampon complet. */
  | "totale"
  /** Il avance échantillon par échantillon et n'a jamais besoin de regarder devant : gain,
   *  mélange, coupe, conversion. Au-delà du seuil, il pourra travailler par blocs. */
  | "flux";

/**
 * Au-delà de cette durée de piste, garder le comportement d'aujourd'hui pour toute une chaîne
 * demande plus de mémoire qu'une machine courante n'en offre (cf. l'en-tête).
 */
export const DUREE_LONGUE_S = 600;

/** Octets d'un `AudioBuffer` : des flottants 32 bits, hors du tas JavaScript. */
export function octetsTampon(dureeS: number, canaux = 2, frequence = 44100): number {
  return Math.round(dureeS * frequence * canaux * 4);
}

/**
 * Octets de l'aperçu écoutable, à la profondeur d'écriture choisie.
 *
 * LA PROFONDEUR N'EST PLUS FIXE, ET CELA SE PAIE ICI. Le même blob sert d'aperçu et de fichier
 * sauvegardé : porter l'écriture à vingt-quatre bits — ce qu'exige toute livraison sérieuse —
 * augmente d'autant ce que les aperçus retiennent, de moitié en vingt-quatre et du double en
 * trente-deux. Sur une heure de stéréo, l'aperçu passe de 635 Mo à 953 Mo, et c'est très exactement
 * ce que la bascule d'économie de mémoire est là pour rattraper.
 *
 * L'en-tête compte 44 octets en PCM et 56 en virgule flottante, le format hors PCM exigeant deux
 * octets de plus au bloc `fmt ` et un bloc `fact` entier. Cela ne pèse rien à côté des données, et
 * on le compte quand même : une fonction qui annonce une taille l'annonce juste.
 */
export function octetsApercu(dureeS: number, canaux = 2, frequence = 44100, bits: 16 | 24 | 32 = 24): number {
  return Math.round(dureeS * frequence * canaux * (bits / 8)) + (bits === 32 ? 56 : 44);
}

/**
 * Faut-il construire l'aperçu écoutable de ce nœud ?
 *
 * Sur une piste courte, toujours — c'est ce qui permet d'écouter chaque étape, et cela ne coûte
 * rien. Sur une piste longue, seulement pour le nœud que l'on regarde : les intermédiaires
 * retiendraient 953 Mo chacun pour une copie que personne n'ouvre. L'aperçu d'un intermédiaire
 * n'est pas perdu, il est simplement construit au moment où on le demande.
 *
 * `economie` est la bascule de la barre d'outils. Coupée, la durée ne compte plus : chaque nœud
 * reçoit son aperçu, comme avant que ce seuil existe. C'est un choix que l'on peut faire en
 * connaissance de cause sur une machine largement pourvue — voir ui/economie-memoire.ts.
 */
export function apercuUtile(
  { dureeS, regarde, economie = true }: { dureeS: number; regarde: boolean; economie?: boolean },
): boolean {
  return !economie || dureeS < DUREE_LONGUE_S || regarde;
}

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
export function resultatRetenu(
  { cacheParBulle, economie = true }: { cacheParBulle: boolean; economie?: boolean },
): boolean {
  return !economie || !cacheParBulle;
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
