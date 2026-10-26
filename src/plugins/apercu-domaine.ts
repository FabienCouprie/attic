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
import { convertirVersFrequence } from "../audio/convertir-frequence";
import { ecartNiveau } from "../audio/ecart-niveau";
import { frequenceDeTravail } from "../audio/frequence-de-travail";
import { decrire } from "../audio/metadonnees";
import { apercuUtileAudio } from "../audio/memoire-audio";
import { departDe, heriterDepart } from "../audio/depart-bwf";
import { heriterDisposition } from "../audio/multicanal";
import { tamponPourApercu } from "../audio/multicanal-ecoute";
import type { ServicesApercu } from "../ui/services-apercu";

/** Un tampon, ou rien. Le seul endroit du domaine qui ait à le demander au shell. */
const estTampon = (v: unknown): v is AudioBuffer =>
  typeof AudioBuffer !== "undefined" && v instanceof AudioBuffer;

// ═══ DEUX FLUX PORTENT LEUR SON À L'INTÉRIEUR, ET LE GARDE NE LES VOYAIT PAS ═══
//
// Relevé par une revue critique du 2026-10-26 : l'invariant de fréquence ne regarde que les tampons
// posés DIRECTEMENT dans les valeurs. Or une banque porte un tampon PAR ZONE, et un objet sonore
// porte ses échantillons bruts avec sa fréquence à côté. Ni l'un ni l'autre n'est un `AudioBuffer`.
//
// CE QUE LA MESURE A DIT, ET ELLE CORRIGE LA REVUE. Une banque bâtie sur un sinus de 440 Hz
// enregistré à 48 kHz, jouée dans un projet à 44 100 : `rendreNotes` rend à la fréquence de la
// BANQUE et `voixPourNote` en tient compte dans son rapport, de sorte que la note sort à
// **440,00 Hz, à zéro cent**. La sortie étant un tampon de premier niveau, le moteur la porte, et
// la hauteur reste à zéro cent après portage. **Le son est donc juste aujourd'hui.**
//
// CE QU'ON ENTENDRAIT SI LA CHAÎNE N'ÉTAIT PAS CONSCIENTE : 404,25 Hz, soit **146,7 cents** — plus
// d'un demi-ton. C'est la mesure de ce que le garde protège, et non d'un défaut constaté.
//
// POURQUOI LE GARDE S'ÉTEND ET PAS LA CONVERSION. Convertir les tampons d'un conteneur changerait
// ce que rend tout graphe déjà enregistré, et ne réparerait rien : chaque rendu est déjà conscient
// de la fréquence de son conteneur. Le jour où un nœud mêlerait le son d'un conteneur à du son au
// rythme du projet, c'est de le SAVOIR qui manquerait — pas de l'avoir converti en silence.

/** Une banque est reconnue à sa forme, comme partout ailleurs : ses zones. */
const estBanque = (v: unknown): v is { zones: { audio?: { sampleRate?: number } }[] } =>
  !!v && typeof v === "object" && Array.isArray((v as { zones?: unknown }).zones);

/** Un objet sonore porte son genre, ses échantillons et sa fréquence. */
const estObjetSonore = (v: unknown): v is { frequence: number } =>
  !!v && typeof v === "object" && (v as { genre?: unknown }).genre === "objet-sonore";

/** Les fréquences qu'une valeur porte, conteneurs et listes compris. */
function frequencesDe(v: unknown, vues: number[] = []): number[] {
  const noter = (f: unknown) => {
    if (typeof f === "number" && Number.isFinite(f) && !vues.includes(f)) vues.push(f);
  };
  if (Array.isArray(v)) { for (const e of v) frequencesDe(e, vues); return vues; }
  if (estTampon(v)) { noter(v.sampleRate); return vues; }
  if (estObjetSonore(v)) { noter(v.frequence); return vues; }
  if (estBanque(v)) { for (const z of v.zones) noter(z?.audio?.sampleRate); return vues; }
  return vues;
}

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
      ecrit, o.grapheAEmbarquer, o.securiser, { bits: o.bits, ixml: description?.ixml, bext },
      o.souffle, o.onAvance);
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

  /**
   * Les fréquences distinctes qui arrivent sur les entrées d'un nœud.
   *
   * ═══ POURQUOI C'EST LE DOMAINE QUI RÉPOND ═══
   *
   * Une fréquence d'échantillonnage est une notion audio ; le shell ne doit pas savoir ce qu'est un
   * tampon ni où il porte sa fréquence. Il sait seulement l'ENDROIT où la question se pose — le seul
   * point du moteur où les entrées et les sorties d'un nœud sont ensemble sous la main.
   *
   * CE QU'ELLE MESURE, ET CE QU'ELLE NE FAIT PAS. Elle dit qu'un nœud reçoit des valeurs à des
   * fréquences différentes, c'est-à-dire qu'une conversion implicite va avoir lieu, faite par le
   * rééchantillonneur du navigateur dans l'`OfflineAudioContext` du composant. Elle ne convertit
   * rien : convertir changerait ce que rend tout graphe déjà enregistré, et l'on veut d'abord savoir
   * sur combien d'arêtes cela arrive.
   *
   * L'ORDRE EST CELUI DES ENTRÉES, non trié : savoir laquelle des deux arrive la première est
   * exactement ce qui manquait pour comprendre le défaut du mélangeur, dont la sortie suivait le
   * premier câble posé.
   */
  frequencesMelees: (entrees) => {
    const vues: number[] = [];
    for (const v of entrees) frequencesDe(v, vues);
    return vues.length > 1 ? vues : [];
  },

  /**
   * Les sorties d'un nœud, portées à la fréquence de travail du projet.
   *
   * LE TABLEAU EST RENDU TEL QUEL QUAND RIEN N'EST À FAIRE, et c'est le cas ordinaire : un graphe
   * entier à la fréquence du projet ne paie pas un échantillon, pas même une copie de tableau.
   * C'est ce qui permet de poser cet appel sur CHAQUE nœud de CHAQUE run sans y penser.
   *
   * UNE CONVERSION QUI ÉCHOUE LAISSE LA VALEUR PASSER. Le contraire ferait tomber un run entier sur
   * un tampon dégénéré, et la cause serait à chercher dans le moteur ; le garde des fréquences
   * mêlées dira, lui, que l'invariant est rompu.
   */
  porterALaFrequenceDeTravail: async (valeurs) => {
    const frequence = frequenceDeTravail();
    if (!valeurs.some((v) => estTampon(v) && v.sampleRate !== frequence)) return valeurs as unknown[];
    const portees: unknown[] = [];
    for (const v of valeurs) {
      if (!estTampon(v) || v.sampleRate === frequence) { portees.push(v); continue; }
      try {
        portees.push(await convertirVersFrequence(v, frequence));
      } catch (e) {
        console.warn("[frequence] conversion impossible, valeur laissée telle quelle", e);
        portees.push(v);
      }
    }
    return portees;
  },
};
