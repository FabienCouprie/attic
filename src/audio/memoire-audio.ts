// audio/memoire-audio.ts — Ce qu'une piste coûte en mémoire, et à partir de quand cela compte.
//
// POURQUOI CE FICHIER EXISTE, ET IL CORRIGE UNE FUITE QUE J'AVAIS MAL DÉCRITE. Tout ceci vivait dans
// `core/memoire.ts`, et je l'avais relevé comme « deux formules que personne n'appelle hors de leur
// test ». C'était trop mince : ce n'étaient pas deux formules inutiles, c'était **une constante du
// cœur dont toute la justification est de l'arithmétique audio**. Le seuil de dix minutes n'est pas
// un goût — il vient du poids d'un tampon de flottants 32 bits et de celui de son aperçu WAV. Un
// domaine d'images ou de données tabulaires n'aurait ni les mêmes tailles ni le même seuil, et
// aurait hérité de celui-ci.
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
 * Faut-il construire l'aperçu écoutable de cette valeur ?
 *
 * Sur une piste courte, toujours — c'est ce qui permet d'écouter chaque étape, et cela ne coûte
 * rien. Sur une piste longue, seulement pour le nœud que l'on regarde : les intermédiaires
 * retiendraient 953 Mo chacun pour une copie que personne n'ouvre. L'aperçu d'un intermédiaire
 * n'est pas perdu, il est simplement construit au moment où on le demande.
 *
 * `economie` est la bascule de la barre d'outils. Coupée, la durée ne compte plus : chaque nœud
 * reçoit son aperçu, comme avant que ce seuil existe. C'est un choix que l'on peut faire en
 * connaissance de cause sur une machine largement pourvue — voir ui/economie-memoire.ts.
 *
 * LA RÈGLE PORTE SUR UNE DURÉE, et c'est pourquoi elle s'énonce à part : lire cette durée dans un
 * tampon est l'adaptation, non la règle. Les deux se testent donc séparément.
 */
export function apercuUtileDuree(
  { dureeS, regarde, economie = true }: { dureeS: number; regarde: boolean; economie?: boolean },
): boolean {
  return !economie || dureeS < DUREE_LONGUE_S || regarde;
}

/**
 * La même décision, prise sur une valeur du domaine.
 *
 * LA DURÉE EST LUE ICI, et non demandée au shell. C'est le domaine qui sait ce qu'il transporte : le
 * moteur n'a plus qu'une question à poser, « faut-il en garder un aperçu », au lieu de deux.
 *
 * UNE VALEUR QUI N'EST PAS UN TAMPON VAUT DURÉE NULLE, donc mérite son aperçu : ce sont les fichiers,
 * les textes, les courbes, dont personne n'a jamais retenu neuf cents mégaoctets.
 */
export function apercuUtileAudio(
  valeur: unknown,
  o: { regarde: boolean; economie?: boolean },
): boolean {
  const dureeS = typeof AudioBuffer !== "undefined" && valeur instanceof AudioBuffer ? valeur.duration : 0;
  return apercuUtileDuree({ ...o, dureeS });
}
