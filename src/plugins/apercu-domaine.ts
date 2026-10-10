// plugins/apercu-domaine.ts — Ce que le domaine audio répond au shell sur les valeurs produites.
//
// POURQUOI CE FICHIER. `ui/hooks/useExecutionGraphe.ts` importait huit fonctions d'ici et nommait
// `AudioBuffer` à trois endroits, pour composer ce que chaque nœud montre. Or le chemin d'exécution
// est celui de TOUS les domaines : « quelle sortie représente ce que j'ai produit », « combien de
// temps cela dure », « comment en fait-on un aperçu » sont des questions de domaine, pas de shell.
//
// Les réponses sont ici, et la racine de composition les dépose dans `ui/services-apercu.ts`.
// Aucune ligne de calcul n'a été retouchée au passage : ce sont les mêmes appels, déplacés.

import { bufferVersWavBlobRespirant } from "../audio";
import { echantillonnerPourApercu, estCourbe } from "../audio/courbe";
import { ecartNiveau } from "../audio/ecart-niveau";
import { decrire } from "../audio/metadonnees";
import { apercuUtileAudio } from "../audio/memoire-audio";
import { departDe, heriterDepart } from "../audio/depart-bwf";
import { heriterDisposition } from "../audio/multicanal";
import { tamponPourApercu } from "../audio/multicanal-ecoute";
import type { ServicesApercu } from "../ui/services-apercu";

/** Un tampon, ou rien. Le seul endroit du domaine qui ait à le demander au shell. */
const estTampon = (v: unknown): v is AudioBuffer =>
  typeof AudioBuffer !== "undefined" && v instanceof AudioBuffer;

export const APERCU_AUDIO: ServicesApercu = {
  // LA PREMIÈRE SORTIE AUDIO, et c'est elle le résultat du nœud. Ses autres sorties audio, quand il
  // en a, en sont des sous-produits : la réponse impulsionnelle d'une réverbération, le résidu d'une
  // analyse. Un nœud dont les sorties audio sont des pairs — les six pistes d'un séparateur — le dit
  // par `sansApercuAudio`, et le shell ne demande alors rien.
  valeurRepresentative: (valeurs) => valeurs.find(estTampon),

  // CE QU'UNE VALEUR PÈSE ET À PARTIR DE QUAND CELA COMPTE : tout est dans `audio/memoire-audio.ts`,
  // seuil compris. Le cœur portait ce seuil, justifié par le poids d'un tampon de flottants.
  apercuUtile: (valeur, o) => apercuUtileAudio(valeur, o),

  blobApercu: async (valeur, o) => {
    if (!estTampon(valeur)) return null;
    // UN TAMPON MULTICANAL ÉTIQUETÉ EST REPLIÉ EN STÉRÉO POUR L'APERÇU : à douze ou seize canaux,
    // l'aperçu pesait six à huit fois une stéréo dans le processus principal, pour un lecteur
    // incapable de le jouer juste. L'enregistrement, lui, repart du tampon complet.
    const ecrit = tamponPourApercu(valeur);
    // LES MÉTADONNÉES NE SONT CALCULÉES QUE SI LE NŒUD LIVRE SON APERÇU : leur identifiant parcourt
    // le son entier, et un aperçu intermédiaire n'est jamais livré.
    const description = o.nomPourMetadonnees !== undefined
      ? decrire(ecrit, { noeud: o.nomPourMetadonnees }, o.bits)
      : undefined;
    // L'HEURE SE LIT SUR LE TAMPON D'ORIGINE, ET NON SUR CELUI DE L'APERÇU : un multicanal replié
    // en stéréo est un tampon neuf, qui ne porte plus rien. `TimeReference` compte des échantillons
    // à la fréquence du fichier écrit, d'où la multiplication ici et non à la pose.
    const depart = departDe(valeur);
    const bext = description && {
      ...description.bext,
      referenceTemps: depart !== undefined ? Math.round(depart * ecrit.sampleRate) : 0,
    };
    return bufferVersWavBlobRespirant(
      ecrit, o.grapheAEmbarquer, o.securiser, { bits: o.bits, ixml: description?.ixml, bext }, o.souffle);
  },

  // UN APERÇU DE LA COURBE, ET NON LA COURBE. Une courbe de quatre minutes porte quarante-huit mille
  // valeurs ; les retenir sur chaque nœud pour dessiner un trait de deux cents pixels serait payer
  // cher un croquis. Deux cent cinquante-six points suffisent à la forme, et ce sont des nombres
  // ordinaires, donc sérialisables avec le graphe.
  apercuCourbe: (valeurs) => {
    const courbe = [...valeurs].find(estCourbe);
    return courbe ? echantillonnerPourApercu(courbe.valeurs, 256) : undefined;
  },

  // DE COMBIEN CE COMPOSANT A CHANGÉ LE NIVEAU DE CE QU'IL A REÇU. Une chute se découvre sinon à
  // l'oreille, plusieurs composants plus loin, sans qu'on sache lequel en est la cause. RIEN N'EST
  // CORRIGÉ : redresser casserait les composants dont le niveau est l'objet, les garanties de
  // reconstruction et l'associativité de la chaîne — voir l'en-tête d'`audio/ecart-niveau.ts`.
  ecartNiveau: (sorties, entrees) => {
    try {
      return ecartNiveau([...sorties], [...entrees], estTampon)?.ecart;
    } catch {
      // Une mesure ratée ne fait pas échouer une exécution.
      return undefined;
    }
  },

  // LA DISPOSITION VOYAGE AVEC LE SON. Un effet ordinaire fabrique un tampon neuf, et sans cela il
  // effacerait l'étiquette « 7.1.4 » ou « ambisonie d'ordre 2 » que son entrée portait : l'export ne
  // saurait plus quel canal est le centre. La règle ne devine jamais — seul un tampon de même nombre
  // de canaux qu'une entrée étiquetée hérite.
  heriterDesEntrees: (sorties, entrees) => {
    heriterDisposition([...sorties], [...entrees]);
    // L'HEURE D'ENREGISTREMENT VOYAGE DE MÊME, mais sous une règle plus stricte : une disposition
    // suit le nombre de canaux, une heure suit le TEMPS. Un composant qui rogne, étire ou rallonge
    // déplace le premier échantillon, et transmettre l'heure d'avant la rendrait fausse sans que
    // rien ne le dise. Voir `audio/depart-bwf.ts` : dans le doute, l'heure est perdue.
    heriterDepart([...sorties], [...entrees]);
  },
};
