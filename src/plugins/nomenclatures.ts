// plugins/nomenclatures.ts — Les domaines de nomenclature : ce qui fait qu'un réglage à choix offre
// un vocabulaire partagé, et lequel.
//
// CE MODULE EST SORTI DU GARDE `plugins/nomenclatures-registre.test.ts` le 2026-11-14, à
// l'identique, pour que deux instruments relèvent les MÊMES réglages : le garde, qui compte les
// formes de chaque domaine, et la passe de croisement, qui lance chaque nœud portant une
// nomenclature sous chaque valeur de celle-ci. Un relevé écrit deux fois diverge sans que rien ne
// le dise. Le garde garde ses assertions et la liste des concepts examinés et écartés ; ce module
// garde les domaines, leur dette chiffrée et le relevé.
//
// CE QUI S'Y EST AJOUTÉ : `table`, la liste entière des identifiants d'un domaine quand une table
// commune la porte, mesure de ce qu'est une liste ENTIÈRE ; et `reglagesANomenclature`, le relevé de
// tout le registre, domaine par domaine.
//
// IL N'EST CHARGÉ PAR AUCUN COMPOSANT : il lit le catalogue entier, et un composant qui l'importerait
// ferait un cycle entre les morceaux du bundle.
import { toutesLesFiches } from "./index";
import { gammeDuNom } from "../audio/gammes";
import { gammeParId as gammeMondeDe } from "../audio/gammes-monde";
import { qualiteDe } from "../audio/qualites-accords";
import { demiTonDeCle } from "../audio/cles";
import { PROGRESSIONS_GENRE } from "../audio/generation";
import { PERCUSSIONS_JOUABLES } from "../audio/batterie-midi";
import { DISPOSITIONS } from "../audio/multicanal";
import { PATRONS_RYTHME } from "../audio/generation-patrons";
import { FORMATS_IMAGE, formatImage } from "../core/formats-image";
import { GAMMES_REUNIES } from "../audio/gammes-reunies";
import { QUALITES } from "../audio/qualites-accords";
import { CLES } from "../audio/cles";
import { TAILLES_FENETRE } from "../audio/fenetres-analyse";
import { SIGNATURES } from "../audio/signatures";
import { VALEURS_NOTE } from "../audio/valeurs-note";
import { CARACTERES_CHOIX, FORMES_ONDE_CHOIX } from "../audio/timbres";
import { LIBELLES_HERITES_OUI_NON, OUI_NON } from "../core/oui-non";
import { LANGUES } from "../core/langues";
import { PARAMETRE_SYNTHESE } from "./soundfontGlobal";
import { MONO_STEREO } from "../audio/mono-stereo";
import { CLEFS_PORTEE } from "../audio/clefs-portee";
import { PALETTES_COULEURS } from "../audio/palettes-couleurs";
import { FORMATS_LISTE } from "../core/formats-liste";
import { SENS_ARPEGE } from "../audio/sens-arpege";
import { FACONS_ACCORD } from "../audio/facons-accord";

/**
 * Un réglage à choix, avec les identifiants qu'un projet enregistrera ET les libellés qu'il montre.
 *
 * LES LIBELLÉS COMPTENT AUTANT QUE LES IDENTIFIANTS, et le relevé des clés l'a montré : dix-sept
 * composants affichaient « C# » EN FRANÇAIS quand les autres affichaient « Do♯ ». L'identifiant est
 * invisible et se résout par alias ; le libellé, lui, se voit, et il s'enregistre aussi.
 */
export interface Choix { ou: string; ids: string[]; forme: string }

export function choix(): Choix[] {
  const out: Choix[] = [];
  for (const f of toutesLesFiches as { id: string; parametres?: unknown[] }[]) {
    for (const p of (f.parametres ?? []) as { nom: string; type?: string; options?: unknown[]; optionsEn?: unknown[]; optionIds?: string[] }[]) {
      const ids = (p.optionIds ?? (p.type === "choix" ? p.options : undefined) ?? []).map(String);
      if (ids.length < 2) continue;
      const fr = (p.options ?? []).map(String).join(",");
      const en = (p.optionsEn ?? []).map(String).join(",");
      out.push({ ou: `${f.id}·${p.nom}`, ids, forme: `${ids.join(",")} ⟨${fr}⟩ ⟨${en}⟩` });
    }
  }
  return out;
}

/** Un domaine gardé au niveau du registre. */
export interface Domaine {
  nom: string;
  /**
   * Les identifiants entiers du domaine, quand une table commune les porte : la mesure de ce
   * qu'est une liste ENTIÈRE. Un domaine sans table, qui n'en a qu'une à déclarer, n'en dit rien.
   */
  table?: () => readonly string[];
  /**
   * Les réglages qui n'offrent qu'une part de la table, chacun avec la borne de son algorithme.
   *
   * DÉCISION DE FABIEN DU 2026-11-14 : un réglage offre la table entière, sauf si son algorithme ne
   * sait pas jouer une valeur ; la coupe se déclare alors ici, avec sa raison. Une coupe qui n'est
   * ni ici ni dans la dette du garde fait tomber la suite.
   */
  coupes?: { ou: string; raison: string }[];
  /**
   * Ce qui fait qu'UN identifiant relève du domaine, reconnu par sa FORME et jamais par un nom.
   *
   * CE TEST A REMPLACÉ UN `ids.every(...)`, ET C'EST LA RÉPARATION D'UN AVEUGLEMENT. Un ET sur
   * TOUS les identifiants d'un réglage a une conséquence qu'on ne voit pas en l'écrivant : une
   * seule valeur hors domaine, mise en tête d'une liste pourtant dérivée de la table, suffisait à
   * rendre les trente suivantes invisibles d'un coup. Deux sentinelles le faisaient, « roue » dans
   * `cercle-pulsant·Gamme` et « fichier » dans `midi-vers-abc·Métrique`, et deux domaines
   * sous-comptaient de la même façon. Un réglage relève désormais du domaine dès qu'assez de ses
   * identifiants en relèvent, et ce qui reste doit être déclaré dans `sentinelles`.
   */
  membre: (id: string) => boolean;
  /**
   * Ce qui REND UN RÉGLAGE RECONNAISSABLE comme étant de ce domaine, quand appartenir ne suffit pas
   * à le dire. Par défaut, c'est `membre`.
   *
   * APPARTENIR ET FAIRE RECONNAÎTRE SONT DEUX QUESTIONS, et le domaine des métriques l'a montré :
   * « 1/4 » est une mesure d'une noire, donc une métrique, mais il s'écrit exactement comme la
   * valeur de note « un quart ». Le voir comme métrique ferait prendre toute liste de valeurs de
   * note pour une liste de signatures. C'est donc le numérateur supérieur à un qui fait reconnaître
   * une liste de signatures, et « 1/4 » en est membre une fois la liste reconnue.
   */
  distinctif?: (id: string) => boolean;
  /**
   * Combien d'identifiants DISTINCTIFS suffisent pour qu'un réglage relève du domaine. Trois par
   * défaut.
   *
   * UN SEUIL REMPLACE LE PLANCHER DE LONGUEUR, et c'est l'autre moitié de l'aveuglement : un
   * `ids.length >= 5` laissait passer les listes COURTES écrites à la main, qui sont justement
   * celles qu'on écrit à la main. Le seuil porte sur le nombre de MEMBRES et non sur la longueur,
   * de sorte qu'une liste de deux gammes relève du domaine quand deux suffisent à le dire.
   */
  seuil?: number;
  /**
   * Les valeurs qu'un réglage du domaine porte sans en relever, nommées une par une avec leur
   * raison. Une sentinelle n'est pas une dette : elle dit « prends la valeur ailleurs ».
   */
  sentinelles?: { valeur: string; raison: string }[];
  /**
   * Quand le domaine a une table, l'identifiant canonique de celui-ci — ou `undefined` si la table
   * ne le connaît pas. Un domaine sans table ne déclare rien ici.
   */
  canonique?: (id: string) => string | undefined;
  /**
   * Les composants qui offrent des identifiants non canoniques, nommés un par un avec leur raison.
   *
   * CE N'EST PAS UNE INDULGENCE : ces identifiants sont ENREGISTRÉS DANS LES PROJETS. Les changer
   * demande de déclarer les anciens dans `optionsHeritees`, ce qui se fait composant par composant.
   * En attendant, ils sont sûrs — la table les connaît en alias, donc les DEGRÉS sont justes — et
   * cette liste est la dette, qui doit décroître et jamais grandir.
   */
  anciennesEcritures?: { ou: string; raison: string }[];
  /** Le nombre de formes distinctes que le dépôt assume. La mesure de ce qui reste à unifier. */
  formesAssumees: number;
  /**
   * POURQUOI CE DOMAINE EN ASSUME PLUS D'UNE, en une phrase, et c'est un champ et non un
   * commentaire exprès.
   *
   * UN NOMBRE SEUL NE DIT PAS S'IL EST DÛ OU MÉRITÉ. Le registre chiffrait ce qui restait à
   * unifier, et rien n'obligeait à dire pourquoi une forme restait là : un chiffre pouvait monter
   * d'un cran sans qu'aucune phrase ne l'explique, et la relecture suivante repartait de zéro. La
   * moitié des domaines portait sa raison en commentaire, l'autre non.
   *
   * ET LA DISTINCTION QUE CE CHAMP FORCE EST CELLE QUI COMPTE : un SOUS-ENSEMBLE borné par un
   * algorithme, un ORDRE que la relecture d'un projet fige, et une ORTHOGRAPHE qui diverge sans
   * raison ne sont pas la même chose, bien qu'ils comptent tous pour une forme. Les deux premiers
   * ne se paient pas ; le troisième si.
   */
  pourquoi?: string;
  remede: string;
}

const estPuissanceDeDeux = (x: string) =>
  /^\d+$/.test(x) && Number(x) >= 256 && (Number(x) & (Number(x) - 1)) === 0;

/** Une coupe déclarée pour plusieurs réglages qui ont la même borne. */
const coupesPour = (raison: string, ...ou: string[]): { ou: string; raison: string }[] => ou.map((x) => ({ ou: x, raison }));

export const DOMAINES: Domaine[] = [
  {
    nom: "gamme",
    table: () => GAMMES_REUNIES.map((g) => g.id),
    // PAR TOUT NOM QU'UNE GAMME A PORTÉ, et non par ses seuls identifiants : sans cela, les sept
    // noms anglais de Tonal (`major` à `locrian`) faisaient sortir une liste entière du relevé.
    membre: (x) => Boolean(gammeDuNom(x) || gammeMondeDe(x)),
    seuil: 2,
    sentinelles: [
      { valeur: "roue", raison: "« Selon la roue » : la gamme vient du cercle dessiné, et non de la liste" },
    ],
    canonique: (id) => (gammeMondeDe(id) ? id : gammeDuNom(id)?.id),
    // LES SEPT ORTHOGRAPHES D'AVANT LA TABLE SONT PAYÉES, et la liste est vide pour cette raison.
    // Elles étaient des alias, donc les degrés étaient justes ; ce sont les identifiants qui ne
    // l'étaient pas, et un projet les enregistrait. Ce qui tenait la dette ouverte n'était pas le
    // calcul mais la RELECTURE : tant que rien ne déclarait ces valeurs, les changer aurait fait
    // retomber un graphe rouvert sur la gamme par défaut. `optionsHeritees` les déclare, et
    // `optionIds-retrocompat.test.ts` tient la porte, cas par cas, pour chacun des sept.
    anciennesEcritures: [],
    // Les huit formes : deux ordres historiques de vingt-cinq que `completer` conserve, les
    // trente-cinq gammes réunies, les dix gammes du monde, et les quatre listes d'avant la table.
    // DE HUIT À ONZE, ET RIEN N'A EMPIRÉ : le garde voit enfin trois formes qu'il ne comptait pas.
    // La sentinelle « roue » de `cercle-pulsant·Gamme` faisait disparaître ses vingt-cinq gammes
    // d'un coup, et le plancher de longueur cachait les listes COURTES écrites à la main, qui sont
    // justement celles qu'on écrit à la main : les quatre de `serie-infinie·Gamme` et les cinq
    // réglages qui n'offrent que « majeur » et « mineur ».
    // DE ONZE À DOUZE LE 2026-11-23, ET LA MONTÉE EST LÉGITIME : les quatre nœuds à chiffres romains
    // quittent la paire « majeur, mineur » pour les dix-sept gammes où les chiffres se lisent, un
    // sous-ensemble borné calculé sur la table ; la paire reste aux trois nœuds des chorals.
    // DE DOUZE À TREIZE LE 2026-11-24, ET LA MONTÉE EST LÉGITIME : le juge des chorals passe aux cinq
    // modes où Bach a écrit les siens, décision de Fabien ; l'harmoniseur les rejoint le même jour, sans
    // forme de plus, sa liste étant celle du juge. La paire ne reste qu'à l'apprentissage, et
    // disparaîtra avec elle.
    // DE TREIZE À DOUZE LE 2026-11-24 : l'apprentissage des chorals rejoint les cinq modes (lot M3), et
    // la paire « majeur, mineur » n'a plus aucun réglage.
    formesAssumees: 12,
    pourquoi: "quatre formes portent les MÊMES vingt-cinq gammes dans quatre ordres, que `completer` fige parce qu'un projet se résout par la position ; les autres sont des sous-ensembles bornés, dix-sept gammes pour les chiffres romains, cinq modes pour le juge, l'harmoniseur et l'apprentissage des chorals, dix gammes du monde, et les trente-cinq réunies",
    remede: "offrir la liste de `audio/gammes.ts`, par `completer` pour garder l'ordre d'un composant ancien",
    // LES COUPES GARDÉES, décision de Fabien du 2026-11-14 sur le relevé du lot 2. Huit réglages qui
    // n'offraient que quatre à sept gammes ont été élargis aux vingt-cinq tempérées le même jour.
    coupes: [
      ...coupesPour(
        "l'algorithme pose ses notes en demi-tons, en MIDI ou par des degrés tempérés : les dix gammes en cents n'y ont pas de hauteur",
        "arpege-koch·Gamme", "automate-cellulaire·Gamme", "boite-groove·Gamme", "cercle-pulsant·Gamme",
        "color-looper·Gamme", "dessin-sonore·Gamme", "gamme-jouee·Gamme", "generateur-accords·Gamme",
        "generateur-fractal·Gamme", "generateur-musical·Gamme", "l-systeme·Gamme", "mappeur-mandelbrot·Gamme",
        "melodie-aleatoire·Gamme", "palette-harmonique·Gamme", "parole-vers-sequence·Gamme",
        "partition-aleatoire-csound·Gamme", "sampler-personnalise·Gamme", "sequenceur-accords·Gamme",
        "zones-vers-midi·Gamme", "reservoir-musical·Gamme", "multi-reservoirs·Gamme", "sequenceur-melodique·Gamme",
        "serie-infinie·Gamme", "arbre-rythmique·Gamme", "correction-hauteur·Gamme", "evolution-melodie·Gamme",
        "solveur-contraintes·Gamme",
      ),
      ...coupesPour(
        // DÉCISION DE FABIEN DU 2026-11-23 : la casse d'un chiffre dit la qualité, la gamme place les
        // fondamentales. Ces nœuds offraient le majeur et le mineur seuls, au motif, faux depuis le lot G
        // du contrôle des gammes, que les autres gammes n'avaient pas de degrés nommés.
        "la casse et les signes d'un chiffre romain n'écrivent qu'un accord majeur, mineur, diminué ou augmenté : huit gammes ont des degrés dont l'accord n'est aucun des quatre, do, mi, la sur le I de la pentatonique majeure, et les dix gammes en cents n'ont pas de nom de note (`GAMMES_DES_ROMAINS`)",
        "tonal-grille·Gamme", "tonal-progression·Gamme", "vexflow-grille·Gamme", "accords-vers-notation·Gamme",
      ),
      { ou: "tonal-gamme·Type", raison: "le nœud écrit ses notes en lettres et altérations, et les dix gammes en cents n'ont pas de nom de note" },
      { ou: "gammes-monde·Gamme", raison: "le nœud des gammes en cents, qui pose chaque degré à sa hauteur exacte ; les gammes tempérées ont leurs propres nœuds" },
      { ou: "verifier-choral·Gamme", raison: "un choral se juge dans les cinq modes où Bach a écrit les siens, majeur, mineur, dorien, phrygien et mixolydien ; le lydien et le locrien n'y paraissent pas, et les autres gammes n'ont ni la sensible ni la cadence que les règles du choral décrivent" },
      { ou: "harmoniser-choral·Gamme", raison: "un choral s'harmonise dans les cinq modes où Bach a écrit les siens, majeur, mineur, dorien, phrygien et mixolydien ; le lydien et le locrien n'y paraissent pas, et les autres gammes n'ont ni les fréquences de degrés ni la cadence sur lesquelles les accords se choisissent" },
      { ou: "apprendre-corpus·Gamme", raison: "un modèle s'apprend dans les cinq modes où Bach a écrit ses chorals, ceux que le juge et l'harmoniseur offrent, majeur, mineur, dorien, phrygien et mixolydien ; le lydien et le locrien n'y paraissent pas, et aucune pièce d'une autre gamme n'a de tonalité lue" },
    ],
  },
  {
    nom: "accord",
    table: () => QUALITES.map((q) => q.id),
    membre: (x) => qualiteDe(x) !== undefined,
    sentinelles: [
      { valeur: "roue", raison: "« Selon la roue » : la qualité vient du cercle dessiné" },
      { valeur: "Cantus firmus", raison: "un motif de contrepoint, et non une qualité d'accord" },
      { valeur: "Personnalisé", raison: "le motif est saisi à la main dans le champ d'à côté" },
    ],
    canonique: (id) => qualiteDe(id)?.id,
    anciennesEcritures: [
      // L'ÉCRITURE DE KOCH EST PAYÉE : ses cinq identifiants étaient ses libellés français, et ils
      // sont désormais ceux du dépôt. Sa FORME reste comptée, parce qu'il n'offre que les six triades
      // là où les autres offrent trente-trois qualités, et ce sous-ensemble est la borne de son flocon.
      // CELUI-CI N'ÉTAIT PAS VISIBLE AVANT LA RÉPARATION DU GARDE : sa liste porte deux valeurs
      // hors domaine, « Cantus firmus » et « Personnalisé », ce qui suffisait à la faire
      // disparaître entièrement du relevé.
      { ou: "generateur-fractal·Motif", raison: "un motif de génération et non un accord : les trois premiers sont des triades, les deux autres ne le sont pas, et les cinq libellés français sont enregistrés" },
    ],
    // DE DEUX À QUATRE : deux formes portaient une valeur hors domaine, la sentinelle « roue » et
    // les deux motifs du générateur fractal, ce qui les faisait disparaître entièrement du relevé.
    formesAssumees: 4,
    pourquoi: "trois sous-ensembles bornés par leur composant, les six triades du flocon de Koch, les cinq motifs du générateur fractal dont deux n'en sont pas, et la liste entière précédée de sa sentinelle « roue »",
    remede: "offrir la liste de `audio/qualites-accords.ts`",
    coupes: [
      { ou: "arpege-koch·Accord", raison: "les six triades seules : le flocon a trois côtés, posés sur les trois premières notes de l'accord, et un accord de quatre sons y perdrait sa septième" },
      { ou: "generateur-fractal·Motif", raison: "un motif de génération et non une liste d'accords : trois triades et deux motifs qui n'en sont pas, écarté du domaine sur décision de Fabien" },
    ],
  },
  {
    nom: "clé",
    table: () => CLES.map((c) => c.en),
    // LE GARDE PASSE PAR `demiTonDeCle` ET NON PAR `DEMI_TONS_CLE`, parce que celui-ci ne voyait
    // pas tout. Un composant offrait ses clés en minuscules avec le bémol typographique — « c, c#,
    // d, e♭, … » — et restait donc INVISIBLE au relevé, tout en étant enregistré dans des projets.
    // Un garde qui ne voit pas une forme ne la compte pas, et ne la bloque pas davantage.
    // LES DOUZE SE COMPTENT ICI, ET C'EST VOULU : une clé est l'une de douze, donc un réglage qui
    // en porte douze est une liste de clés et un réglage qui en porte trois ne l'est pas.
    // UN DEMI-TON DE CLÉ VA DE ZÉRO À ONZE, et le borner ainsi évite de prendre pour des clés les
    // douze premiers nombres d'une liste qui n'en est pas une.
    membre: (x) => demiTonDeCle(x) !== undefined || (/^\d+$/.test(x) && Number(x) >= 0 && Number(x) <= 11),
    seuil: 12,
    sentinelles: [
      { valeur: "douze", raison: "la treizième entrée du paradoxe du triton, qui n'est pas une classe" },
    ],
    // DOMAINE UNIFIÉ. Les trente-deux réglages sont branchés sur `audio/cles.ts`, et les deux
    // formes qui restent sont les deux qui doivent rester : vingt-trois offrent les clés PAR LEUR
    // NOM, neuf PAR LEUR DEMI-TON. Un composant qui nomme une tonalité veut un nom ; un composant
    // qui compte des demi-tons veut un nombre, dont il fera de l'arithmétique.
    //
    // CE NOMBRE EST PASSÉ DE QUATRE À DEUX, et le garde a tiré à chaque palier : deux fois pour
    // dire qu'une dette était payée sans être inscrite, ce qui est sa seconde raison d'être.
    //
    // PUIS DE DEUX À TROIS, SANS QUE RIEN N'EMPIRE : la troisième forme est celle du paradoxe du
    // triton, dont la treizième entrée « douze » faisait disparaître les douze classes du relevé.
    formesAssumees: 3,
    pourquoi: "deux variantes du même réglage partagé, le nom de note pour qui nomme et le demi-ton pour qui compte, et la table des classes de hauteur du paradoxe du triton, qui écrit ses cinq touches noires en dièse parce qu'une classe n'appartient à aucune tonalité",
    remede: "étaler `PARAMETRE_CLE` ou `PARAMETRE_TONIQUE` de `audio/cles.ts`, au lieu de recopier douze noms",
  },
  {
    nom: "fenêtre d'analyse",
    table: () => TAILLES_FENETRE.map(String),
    membre: estPuissanceDeDeux,
    seuil: 2,
    // DE ONZE FORMES À SEPT, LE 2026-11-14. Dix-neuf réglages offraient une part de la table sans
    // borne écrite, et la passe de complétude les a élargis à la table entière ; la plupart de leurs
    // formes se sont fondues dans celle de la granulation spectrale, qui l'offrait déjà. Restent la
    // table entière sous trois formes, qui ne diffèrent que par les LIBELLÉS : le nombre seul ; le
    // nombre nommé par son effet, « Ordinaire (2048) », que `choixFenetreNomme` produit désormais
    // une fois au lieu de trois écritures à la main ; et le nombre sans liste anglaise des deux vues
    // spectrales, des tailles de fenêtre ne se traduisant pas. Et quatre parts, chacune bornée par
    // son algorithme et déclarée en coupe ci-dessous.
    //
    // DEUX RÉSERVES DU RELEVÉ SE SONT RÉVÉLÉES FAUSSES À LA MESURE : l'image du spectrogramme fractal
    // à 256 points, qu'on croyait plus large que les 32 767 pixels d'un canevas, quand Chromium et
    // l'Electron d'Attic en admettent 65 535 ; et la transformée de Csound, qu'une liste blanche
    // cachée ramenait à 1024, élargie avec le réglage.
    //
    // LES LISTES viennent de `audio/fenetres-analyse.ts`, et un garde de SOURCE le tient, comme pour
    // les signatures et les langues, puisque le registre ne voit pas deux listes identiques écrites
    // deux fois.
    formesAssumees: 7,
    pourquoi: "la table entière sous trois formes qui ne tiennent qu'aux LIBELLÉS, le nombre seul, le nombre nommé par son effet chez la rugosité et les quatre mises en forme de Wishart, et le nombre sans liste anglaise des deux vues spectrales ; et quatre parts, chacune bornée par son algorithme et déclarée en coupe : les deux passes de la décomposition STN, le masquage et la continuation autorégressive",
    remede: "offrir `choixFenetre` ou `choixFenetreNomme` de `audio/fenetres-analyse.ts`, et déclarer en coupe pourquoi un composant en offre une part",
    coupes: [
      { ou: "stn-sinus-transitoires-bruit·Fenêtre sinus", raison: "la première passe doit être longue, il faut du temps pour constater qu'une fréquence dure : sous 2048 points, les partielles ne se distinguent plus du reste" },
      { ou: "stn-sinus-transitoires-bruit·Fenêtre transitoires", raison: "la seconde passe doit être courte, une attaque se dilue dans une fenêtre longue : au-delà de 1024 points, elle rejoindrait la première passe" },
      { ou: "masquage·Finesse", raison: "sous 1024 points, une case de la transformée dépasse à 88,2 ou 96 kHz la centaine de hertz des bandes critiques les plus graves, et jusqu'à quatre d'entre elles restent vides ; compté pour chaque fréquence de travail" },
      { ou: "continuation-spectrale-ar·FFT", raison: "le modèle autorégressif apprend une matrice pleine de Historique × bins vers bins, qui pèse au carré du nombre de bins : à 8192 points et 32 trames, ses seuls poids font 2,1 Go avant les moments d'Adam" },
    ],
  },
  {
    nom: "métrique",
    table: () => [...SIGNATURES],
    // UN NUMÉRATEUR AUTRE QUE UN SÉPARE UNE SIGNATURE D'UNE VALEUR DE NOTE : « 1/8 » est une
    // croche, « 6/8 » est une mesure, et les deux s'écrivent de la même façon.
    membre: (x) => /^\d+\/\d+$/.test(x),
    distinctif: (x) => /^\d+\/\d+$/.test(x) && Number(x.split("/")[0]) > 1,
    seuil: 2,
    sentinelles: [
      { valeur: "fichier", raison: "« Du fichier » : la métrique est celle écrite dans le MIDI reçu" },
    ],
    // CE NOMBRE EST PASSÉ DE QUATRE À DEUX : le remède ci-dessous a été appliqué, et c'est
    // `audio/signatures.ts` qui porte la liste. Les deux formes qui restent sont cette liste, que
    // cinq composants offrent entière, et le sous-ensemble que la gravure MusicXML en FILTRE, sa
    // grille se comptant en noires. Un sous-ensemble dérivé de la table n'est pas une table de plus.
    //
    // PUIS DE DEUX À TROIS : la troisième est la même liste précédée de « Du fichier », dont la
    // sentinelle faisait disparaître les trente signatures du relevé.
    //
    // PUIS DE TROIS À DEUX, et cette fois par une réparation qui n'avait rien d'une nomenclature :
    // la gravure MusicXML n'offrait que dix-sept signatures sur trente, parce que SA LONGUEUR DE
    // MESURE S'ARRONDISSAIT. Sa grille descend désormais à l'unité du dénominateur, donc elle offre
    // la table entière et son sous-ensemble disparaît.
    formesAssumees: 2,
    pourquoi: "la liste entière de `audio/signatures.ts`, et le sous-ensemble que la gravure MusicXML en FILTRE, sa grille se comptant en noires ; un sous-ensemble dérivé de la table n'est pas une table de plus",
    remede: "déclarer une liste centrale des signatures",
  },
  {
    nom: "valeur de note",
    table: () => VALEURS_NOTE.map((v) => v.id),
    // LE TRIOLET EST UNE VALEUR DE NOTE, et le prédicat d'avant ne le voyait pas : écrit
    // `/^1\/\d+$/`, il écartait « 1/8t » et « 1/8 triplet », donc les deux réglages qui les
    // offrent étaient invisibles. Les deux écritures du triolet sont justement la divergence de ce
    // domaine, et un garde qui ne la voit pas ne peut pas la signaler.
    // LA POINTÉE AUSSI, entrée dans la table le 2026-11-14 : sans elle, l'arpégiateur qui offre la
    // table entière portait trois valeurs hors domaine, et sortait du relevé tout entier.
    membre: (x) => /^1\/\d+[t.]?$/.test(x) || /^1\/\d+ triplet$/.test(x),
    seuil: 2,
    sentinelles: [
      { valeur: "none", raison: "« Aucune » : pas de grille, les instants restent ceux du jeu" },
    ],
    // DE QUATRE À SEPT, PUIS À SIX. Les trois formes qui étaient apparues sont la divergence même
    // de ce domaine : le TRIOLET s'écrivait « 1/8t » ici et « 1/8 triplet » là, et le prédicat
    // d'avant, écrit `/^1\/\d+$/`, ne voyait ni l'un ni l'autre. Un garde qui ne voit pas la
    // divergence qu'il existe pour signaler ne sert à rien.
    //
    // CELLE DU TRIOLET EST PAYÉE : les deux grilles de quantification ne faisaient deux formes que
    // par leur libellé français, « 1/8 triplet » chez l'une et « 1/8 de triolet » chez l'autre, et
    // le premier est un mot ANGLAIS dans une liste française. Elles n'en font plus qu'une.
    //
    // PUIS À SEPT, LE 2026-11-14, SANS QUE RIEN N'EMPIRE : la passe de complétude a élargi chaque
    // grille jusqu'à la borne de son algorithme, et deux grilles qui se ressemblaient ne se
    // ressemblent plus. Restent la table entière sous DEUX ORDRES, celui de la table pour la vitesse
    // de l'arpégiateur et l'ordre d'origine d'abord pour les deux grilles de quantification MIDI ; et
    // quatre parts, chacune la grille de son composant et déclarée en coupe : la table sans sa valeur
    // extrême pour l'intervalle et pour la taille du « beat repeat », les quatre valeurs binaires de
    // Magenta, les sept valeurs qui font un nombre entier de pas par temps pour un réservoir.
    //
    // PUIS À SIX, LE 2026-11-23 : la partition qui gravait un fichier MIDI a quitté le catalogue, et
    // avec elle sa part, les six durées simples qu'elle savait écrire.
    formesAssumees: 6,
    pourquoi: "la table entière sous deux ordres, celui de la table pour la vitesse de l'arpégiateur et l'ordre d'origine d'abord pour les deux grilles de quantification MIDI ; et quatre parts, chacune la grille de son composant : la table sans sa valeur extrême pour l'intervalle et pour la taille du « beat repeat », les quatre valeurs binaires de Magenta, les sept valeurs à pas entiers d'un réservoir",
    coupes: [
      ...coupesPour(
        "le réseau avance d'un nombre entier de pas par temps et reconnaît le temps par `pas % pasParBeat` : une pointée, la blanche, la ronde ou le triolet de noire en demanderaient une fraction",
        "reservoir-musical·Résolution", "multi-reservoirs·Résolution",
      ),
      { ou: "beat-repeat·Intervalle", raison: "sans le 1/32 de triolet : aucune taille offerte n'est plus courte, et sous un intervalle pas plus long que la taille le segment réécrit les échantillons qu'il remplace, la sortie égalant l'entrée" },
      { ou: "beat-repeat·Taille", raison: "sans la ronde : aucun intervalle offert n'est plus long, et une taille au moins aussi longue que l'intervalle rend l'entrée telle quelle, mesuré par `plugins/beat-repeat-taille.test.ts`" },
      ...coupesPour(
        "Magenta quantifie en pas entiers par noire (`quantizeNoteSequence`) : une ronde, une blanche ou une pointée n'en font pas un nombre entier, et ses modèles ont appris une grille binaire",
        "magenta-continuation·Quantification", "magenta-generer-melodie·Quantification", "magenta-humaniser-groove·Quantification",
      ),
    ],
    remede: "offrir `choixValeurs` de `audio/valeurs-note.ts`",
  },
  {
    nom: "forme d'onde",
    table: () => [...FORMES_ONDE_CHOIX.ids],
    membre: (x) => ["sine", "square", "sawtooth", "saw", "triangle"].includes(x),
    sentinelles: [
      { valeur: "impulsion", raison: "une impulsion par période, de quoi exciter un résonateur" },
      { valeur: "bruit", raison: "du bruit, qui n'a pas de période" },
    ],
    // CE NOMBRE EST PASSÉ DE CINQ À UNE : huit réglages prennent désormais `FORMES_ONDE_CHOIX`.
    // Les cinq formes étaient l'identifiant `saw` chez l'un et `sawtooth` chez les autres, le même
    // jeu dans un ordre différent chez un troisième, et deux listes que CE PRÉDICAT NE VOYAIT MÊME
    // PAS, puisqu'il exige que TOUS les identifiants soient dans sa liste : les libellés français
    // capitalisés du trémolo et le `sinus/carre/dents-de-scie` du générateur à pulsars.
    // PUIS DE UNE À DEUX, par la réparation du garde : la seconde forme est celle de l'excitateur
    // de « Frontière de note », qui offre les quatre ondes PLUS une impulsion et du bruit. Ses deux
    // sentinelles le faisaient disparaître du relevé ; un surensemble déclaré n'est pas une faute,
    // mais il est une forme, et il doit se voir.
    formesAssumees: 2,
    // LE REMÈDE D'AVANT N'ÉTAIT PAS EXÉCUTABLE : `FORMES_ONDE` n'est pas exportée, et c'est une
    // table d'alias qui relit une valeur, non une liste ordonnée avec ses libellés.
    pourquoi: "la liste des quatre formes, et celle de l'excitateur d'un résonateur, qui ajoute l'impulsion et le bruit : une impulsion par période n'est pas une onde, et du bruit n'a pas de période",
    remede: "offrir `FORMES_ONDE_CHOIX` de `audio/timbres.ts`, et ses `LIBELLES_HERITES_FORMES`",
  },
  {
    nom: "oui ou non",
    table: () => [...OUI_NON.ids],
    // UNE PAIRE N'A PAS DE SENTINELLE POSSIBLE : si une troisième valeur apparaissait, ce ne serait
    // plus un oui ou non. Le seuil vaut donc deux et le domaine se referme sur l'exactitude.
    membre: (x) => ["oui", "non", "yes", "no"].includes(x),
    seuil: 2,
    // LA TABLE DES ÉCRITURES D'AVANT, ET NON DEUX COMPARAISONS À « yes » ET « no » : celles-ci
    // tombaient sous le garde de `core/oui-non.test.ts` dès que ce registre a quitté son fichier de
    // test. Sur les quatre membres du domaine, les deux rendent la même chose.
    canonique: (id) => LIBELLES_HERITES_OUI_NON[id] ?? id,
    // DE SIX À TROIS, et les trois qui restent sont irréductibles.
    //
    // LES DEUX ORDRES EN FONT DEUX, et ce n'est pas une divergence à corriger : la valeur d'un
    // réglage enregistrée dans un projet se résout PAR LA POSITION, donc retourner une liste
    // ferait qu'un projet rouvert répondrait le contraire de ce qu'il disait. Vingt-trois réglages
    // offrent « Oui » d'abord, treize « Non » d'abord, et chacun a son défaut en tête.
    //
    // LA TROISIÈME EST UN INTERRUPTEUR, qui s'écrit « Off » et « On » en anglais plutôt que
    // « No » et « Yes ». Ses identifiants viennent de la table comme les autres ; seuls ses
    // libellés anglais sont les siens, et c'est ce que la langue demande pour une lecture en
    // boucle ou une lecture aléatoire.
    //
    // CE QUI EST PAYÉ : cinq réglages posaient `yes` et `no` quand trente et un posaient `oui` et
    // `non`, et deux d'entre eux affichaient « oui » et « non » en minuscules.
    formesAssumees: 3,
    pourquoi: "les deux ORDRES, que la relecture d'un projet fige puisqu'une valeur s'y résout par la position, et un interrupteur dont les libellés anglais sont « Off » et « On » plutôt que « No » et « Yes »",
    remede: "offrir `choixOuiNon` de `core/oui-non.ts`, dans l'ordre qui est celui du composant",
  },

  // ── LES DOMAINES INSCRITS LE 2026-10-23, APRÈS LE RELEVÉ DES 503 COMPOSANTS ─────────────────
  //
  // Le relevé a trouvé cinquante et un concepts partagés par au moins deux composants, dont
  // trente-quatre divergents, quand le registre n'en déclarait que huit. Ceux qui suivent sont les
  // divergents qui passent les trois tests du haut de ce fichier ; ceux qui ne les passent pas sont
  // inscrits plus bas, avec la raison de leur refus, pour qu'on ne les réexamine pas.

  {
    nom: "genre",
    table: () => Object.keys(PROGRESSIONS_GENRE),
    membre: (x) => PROGRESSIONS_GENRE[x] !== undefined,
    sentinelles: [
      { valeur: "custom", raison: "« Personnalisé » : la progression est saisie dans le champ d'à côté" },
    ],
    canonique: (id) => (PROGRESSIONS_GENRE[id] ? id : undefined),
    formesAssumees: 2,
    pourquoi: "la liste entière, et sa coupe sans « personnalisé » chez le composant qui n'offre pas de progression saisie à la main : une entrée qui ouvre un champ voisin n'a pas de sens là où ce champ n'existe pas",
    remede: "offrir `GENRES_ACCORDS` de `plugins/generateurs-aides.ts`, ou sa coupe sans la progression personnalisée",
  },
  {
    nom: "format d'image",
    table: () => FORMATS_IMAGE.map((f) => f.id),
    membre: (x) => formatImage(x) !== undefined,
    seuil: 2,
    canonique: (id) => formatImage(id)?.id,
    formesAssumees: 3,
    pourquoi: "le couple PNG et JPEG, le même couple dans l'ORDRE INVERSE chez un composant dont le défaut est le JPEG, et la liste de trois du générateur de pochette, qui dessine en SVG et peut donc rendre le SVG lui-même",
    remede: "offrir `choixFormats` de `core/formats-image.ts`",
    coupes: coupesPour(
      "un rendu en pixels, des points d'un attracteur ou des cases d'un spectrogramme par milliers : le SVG en ferait autant d'éléments, et le nœud ne dessine pas en vecteurs",
      "attracteur-ifs·Format", "spectrogramme-fractal·Format", "visualisation-songsee·Format",
    ),
  },
  {
    nom: "percussion",
    table: () => PERCUSSIONS_JOUABLES.map((p) => String(p.note)),
    membre: (x) => PERCUSSIONS_JOUABLES.some((p) => String(p.note) === x),
    // UNE SEULE FORME, et elle vient d'être unifiée : « Rythme euclidien » recopiait sa liste à la
    // main, où « Tom grave » désignait une autre note que dans la table commune.
    formesAssumees: 1,
    remede: "offrir `choixPercussion` de `audio/batterie-midi.ts`",
  },
  {
    nom: "moteur de synthèse",
    table: () => [...(PARAMETRE_SYNTHESE.optionIds ?? [])],
    membre: (x) => ["auto", "fm", "soundfont"].includes(x),
    seuil: 2,
    // DE DEUX FORMES À UNE, LE 2026-11-14. La variante sans « Automatique » n'avait qu'un emprunteur,
    // l'automate cellulaire, et elle cachait un défaut : demandé au SoundFont sans qu'aucun soit
    // chargé, il passait en FM sans le dire. Il offre désormais les trois moteurs, garde FM pour
    // défaut, et dit son repli ; la variante est retirée.
    formesAssumees: 1,
    remede: "étaler `PARAMETRE_SYNTHESE` de `plugins/soundfontGlobal.ts`, et poser son défaut plutôt que retirer un moteur",
  },
  {
    nom: "disposition de haut-parleurs",
    table: () => DISPOSITIONS.map((d) => d.id),
    membre: (x) => DISPOSITIONS.some((d) => d.id === x),
    formesAssumees: 2,
    pourquoi: "la liste entière, et le sous-ensemble du décodeur ambisonique, qui filtre `famille !== \"ambisonie\"` parce qu'une « Salle » est la disposition de haut-parleurs vers laquelle on décode : décoder vers un format ambisonique ne décoderait rien",
    remede: "offrir `choixDisposition` de `plugins/multicanal.ts`",
    coupes: [
      { ou: "decodeur-ambisonique·Salle", raison: "une salle est la disposition de haut-parleurs vers laquelle on décode : décoder vers un format ambisonique ne décoderait rien" },
    ],
  },
  {
    nom: "langue",
    // « Automatique » n'est pas une langue : c'est la sentinelle du domaine.
    table: () => LANGUES.map((l) => l.id).filter((id) => id !== ""),
    // LA LISTE EST CELLE DES CODES QUE LE DÉPÔT OFFRE, et non une forme à deux lettres : « do » et
    // « la » sont des notes, « en » et « es » des langues, et rien dans la forme ne les sépare.
    membre: (x) => ["fr", "en", "de", "es", "it", "pt", "ru", "zh", "yue", "ja", "ko", "nl", "ar", "hi", "ro"].includes(x),
    // DEUX LANGUES SUFFISENT À DIRE UNE LISTE DE LANGUES, depuis le 2026-11-14 : au seuil de trois,
    // les cinq réglages qui n'offrent que le français et l'anglais échappaient au garde.
    seuil: 2,
    sentinelles: [
      { valeur: "", raison: "« Automatique » : le moteur reconnaît la langue seul" },
    ],
    // SIX FORMES, ET LEUR DIVERGENCE EST EN PARTIE LÉGITIME : chaque composant est borné par les
    // langues que SON modèle tient, et chacun l'écrit en commentaire. Ce qui ne l'est pas, c'est que
    // les noms de langue soient recopiés dans six tables à la main, où une orthographe peut dériver
    // sans que rien ne le dise.
    // PUIS DE SIX À SEPT, SANS QUE RIEN N'EMPIRE : la septième est la paire français et anglais de
    // cinq réglages, que le seuil de trois cachait.
    formesAssumees: 7,
    pourquoi: "chaque composant est borné par les langues que SON modèle tient, et chacun l'écrit à côté de sa liste, la paire français et anglais de cinq réglages comprise ; les NOMS, eux, viennent d'une table unique depuis que six d'entre eux les recopiaient",
    remede: "déclarer une table centrale des noms de langue, chaque composant n'offrant que les codes que SON modèle tient",
    // CHAQUE COUPE EST CELLE DU MODÈLE, que la documentation du réglage dit à l'écran.
    coupes: [
      ...coupesPour("les onze langues que le moteur d'alignement connaît, et que la documentation du réglage nomme",
        "aligner-texte·Langue"),
      ...coupesPour("les langues que le modèle de clonage de voix prononce ; « Automatique » le laisse décider d'après le texte",
        "cloner-voix·Langue"),
      ...coupesPour("les dix langues que le modèle de chant tient le mieux, comme le dit la documentation du réglage",
        "composer-plan·Langue du chant", "ecrire-chanson·Langue du chant", "planifier-chanson·Langue du chant"),
      ...coupesPour("un modèle de traduction OPUS-MT de l'anglais par langue, et le nœud en charge dix ; l'anglais est la langue des paroles générées avant traduction",
        "nllb-paroles·Langue cible"),
      ...coupesPour("les treize langues du modèle de reconnaissance, un seul modèle multilingue qui n'en connaît pas d'autres",
        "sherpa-asr·Langue"),
      ...coupesPour("un modèle de synthèse MMS par langue, et le nœud n'en connaît que ceux de sa table",
        "tts-mms·Langue"),
      ...coupesPour("un modèle dédié par langue, et le dépôt n'en fournit que pour le français et l'anglais",
        "couper-aux-mots·Langue", "vosk-asr·Langue", "sous-titres-srt·Langue", "parole-vers-sequence·Langue"),
      ...coupesPour("les paroles se tirent de lexiques écrits pour le français et l'anglais, et pour eux seuls",
        "generateur-paroles·Langue"),
    ],
  },
  {
    nom: "caractère de timbre",
    table: () => [...CARACTERES_CHOIX.ids],
    membre: (x) => ["douce", "brillante", "percutante", "pur"].includes(x),
    // UNE SEULE FORME, et la seconde n'était pas une liste écrite à la main : c'était la même
    // table, privée du sinus par un sous-ensemble dérivé. La raison en était écrite, et elle était
    // vraie de la table des formes d'oscillateur du moteur fractal, qui n'en déclarait que trois ;
    // elle ne l'était pas de l'oscillateur, dont l'API porte le type « sine ». La branche posée, la
    // part devient sans objet et les quatre réglages offrent la même liste de quatre.
    formesAssumees: 1,
    remede: "offrir `CARACTERES_CHOIX` de `audio/timbres.ts`",
  },
  {
    nom: "position stéréo",
    membre: (x) => ["gauche", "centre", "droite"].includes(x.toLowerCase()),
    seuil: 2,
    canonique: (id) => (id === id.toLowerCase() ? id : undefined),
    // TROIS FORMES, ET DEUX SONT LÉGITIMES : trois composants ne désignent pas une position mais
    // une OREILLE ou un CANAL, dont il n'existe que deux, et un centre n'y aurait pas de sens ; la
    // borne est écrite à côté de chacun. La troisième est la position à trois valeurs. Ce qui a été
    // réparé, c'est la capitalisation : un composant avait pour identifiants ses libellés français.
    formesAssumees: 3,
    pourquoi: "trois composants ne désignent pas une position mais une OREILLE ou un CANAL, dont il n'existe que deux et où un centre n'aurait pas de sens ; la troisième forme est la position à trois valeurs",
    remede: "déclarer une liste centrale des positions, en minuscules comme partout ailleurs",
  },
  {
    nom: "patron rythmique",
    table: () => Object.keys(PATRONS_RYTHME),
    membre: (x) => PATRONS_RYTHME[x] !== undefined,
    sentinelles: [
      { valeur: "accords-tenus", raison: "« Accords tenus » de la reprise ABC : aucun rythme, l'accord et la basse tenus jusqu'au changement d'accord" },
    ],
    // LA TROISIÈME FORME EST LA LISTE ENTIÈRE PRÉCÉDÉE D'UNE SENTINELLE, et elle vient de la table : la
    // reprise ABC offrait six styles écrits à la main, sous des libellés qu'aucune table ne portait.
    formesAssumees: 3,
    pourquoi: "les trois listes sortent du même `optionsPatrons` : l'une entière, l'autre filtrée sur « 4/4 », une boîte à groove en quatre temps ne pouvant offrir ni valse ni boléro, et la troisième entière, précédée d'« Accords tenus », le seul accompagnement de la reprise ABC qui n'ait pas de rythme",
    remede: "offrir `optionsPatrons` de `audio/patrons-rythme.ts`, avec la métrique qui restreint",
    coupes: [
      { ou: "boite-groove·Style rythmique", raison: "la boîte à groove joue en quatre temps, et la valse et le boléro ne s'écrivent qu'en trois" },
    ],
  },
  {
    nom: "extension d'accord",
    membre: (x) => ["aucune", "septieme", "sixte", "idiomatique"].includes(x),
    seuil: 2,
    // LES DEUX FORMES SONT BORNÉES PAR L'ALGORITHME, et la borne est écrite à côté de chacune :
    // l'un ajoute la septième à CHAQUE accord, l'autre là où le genre la place. Les anciennes
    // valeurs du second sont lues comme « idiomatique ».
    formesAssumees: 2,
    pourquoi: "les deux formes sont bornées par l'algorithme, et la borne est écrite à côté de chacune : l'un ajoute la septième à CHAQUE accord, l'autre là où le genre la place",
    remede: "déclarer une liste centrale des extensions, et dire pourquoi un composant n'en offre qu'une part",
  },
  // LES QUATRE DOMAINES DU LOT 3c (2026-11-14), décidés par Fabien : des vocabulaires que plusieurs
  // composants écrivaient chacun à la main, et qu'aucun domaine ne gardait. Chacun a désormais sa
  // table, adoptée par tous ses réglages, sous une seule forme.
  {
    nom: "mono ou stéréo",
    table: () => [...MONO_STEREO.ids],
    membre: (x) => (MONO_STEREO.ids as string[]).includes(x),
    // DEUX SUFFISENT : la paire n'a que deux membres. Une disposition de haut-parleurs qui commence par
    // « stereo » n'en porte qu'un, et n'en relève pas.
    seuil: 2,
    formesAssumees: 1,
    remede: "étaler `choixMonoStereo` de `audio/mono-stereo.ts`, et lire la valeur par `canauxDe`",
  },
  {
    nom: "clé de portée",
    table: () => [...CLEFS_PORTEE.ids],
    membre: (x) => CLEFS_PORTEE.ids.includes(x),
    formesAssumees: 1,
    remede: "étaler `choixClefPortee` de `audio/clefs-portee.ts`",
  },
  {
    nom: "palette de couleurs",
    table: () => [...PALETTES_COULEURS.ids],
    membre: (x) => PALETTES_COULEURS.ids.includes(x),
    formesAssumees: 1,
    remede: "étaler `choixPaletteCouleurs` de `audio/palettes-couleurs.ts`",
  },
  {
    nom: "format d'une liste",
    table: () => [...FORMATS_LISTE.ids],
    membre: (x) => (FORMATS_LISTE.ids as string[]).includes(x),
    formesAssumees: 1,
    remede: "étaler `choixFormatListe` de `core/formats-liste.ts`, et joindre par `joindreListe`",
  },
  // LES DEUX DOMAINES DE LA SECONDE PART DU LOT 3c : des vocabulaires qui s'écrivaient à plusieurs
  // façons, et dont les composants lisaient la valeur par un morceau de mot.
  {
    nom: "sens d'un arpège",
    table: () => [...SENS_ARPEGE.ids],
    membre: (x) => (SENS_ARPEGE.ids as readonly string[]).includes(x),
    formesAssumees: 3,
    pourquoi: "la table entière pour l'arpégiateur ; la table sans l'ordre de jeu pour les accords joués et la gamme jouée, dont les notes n'ont pas d'ordre joué ; les quatre sens d'un balayage pour l'arpège spectral",
    remede: "étaler `choixSensArpege` de `audio/sens-arpege.ts`, et lire la valeur par `sensDe` ou `sensParmi`",
    // TRANCHÉES PAR FABIEN LE 2026-11-14, sur la proposition du relevé du lot 3c.
    coupes: [
      ...coupesPour(
        "des notes tirées d'un nom, accord ou gamme, n'ont pas d'ordre joué : l'ordre de jeu y serait l'ordre montant, que le réglage offre déjà",
        "accords-joues·Sens", "gamme-jouee·Sens",
      ),
      { ou: "arpege-spectral·Sens", raison: "la bande balaie le spectre en continu : l'aléatoire, le convergent, le divergent et l'ordre de jeu sont des ordres entre notes séparées, qu'un balayage n'a pas" },
    ],
  },
  {
    nom: "façon de jouer un accord",
    table: () => [...FACONS_ACCORD.ids],
    membre: (x) => (FACONS_ACCORD.ids as readonly string[]).includes(x),
    seuil: 2,
    sentinelles: [
      { valeur: "melodie", raison: "« Mélodie » : une note à la fois, et non un accord joué d'une façon ou d'une autre" },
    ],
    formesAssumees: 4,
    pourquoi: "la table entière pour les accords joués, la roue de Camelot et le séquenceur d'accords ; plaqué et arpégé seuls pour la grille tonale, dont la notation n'écrit pas de roulé ; la table derrière « Mélodie » pour les trois composants à couleurs, et avec elle au deuxième rang pour l'automate cellulaire, chacun au rang qu'un projet enregistré fige",
    remede: "étaler `choixFaconAccord` ou `choixFaconOuMelodie` de `audio/facons-accord.ts`, et lire la valeur par `faconDe`",
    // TRANCHÉE PAR FABIEN LE 2026-11-14 : les six autres ont gagné le roulé.
    coupes: [
      { ou: "tonal-grille·Mode", raison: "la notation texte n'écrit qu'un accord entier ou des notes l'une après l'autre, une par ligne : des départs décalés tenus ensemble, ce qu'est un roulé, ne s'y écrivent pas" },
    ],
  },
];

/**
 * Les réglages qui relèvent d'un domaine : assez d'identifiants distinctifs, et deux valeurs hors
 * domaine au plus.
 *
 * DEUX VALEURS HORS DOMAINE AU PLUS, et cette borne est ce qui sépare une sentinelle d'un autre
 * vocabulaire. Une sentinelle dit « prends la valeur ailleurs », et une liste n'en porte qu'une ou
 * deux : « Du fichier », « Automatique ». Au-delà, ce n'est plus une liste du domaine qui porte une
 * exception, c'est un vocabulaire étranger qui le recoupe — et le compter aurait été le faux positif
 * symétrique de l'aveuglement qu'on vient de réparer : sans cette borne, le domaine « accord »
 * attrapait cent une valeurs qui ne sont pas des accords.
 */
export function relevesDuDomaine(d: Domaine, tous: Choix[] = choix()): Choix[] {
  const sauf = (test: (x: string) => boolean) => (x: string) => {
    try { return test(x); } catch { return false; }
  };
  const membres = (c: Choix) => c.ids.filter(sauf(d.membre));
  const distinctifs = (c: Choix) => c.ids.filter(sauf(d.distinctif ?? d.membre));
  return tous.filter((c) => distinctifs(c).length >= (d.seuil ?? 3) && c.ids.length - membres(c).length <= 2);
}

/** Un réglage à nomenclature : sa fiche, son nom, son domaine, ses identifiants offerts. */
export interface ReglageANomenclature { fiche: string; reglage: string; domaine: Domaine; ids: string[] }

/**
 * Tout le registre, domaine par domaine : chaque réglage qui offre un vocabulaire partagé.
 *
 * Un réglage peut relever de deux domaines, et il est alors rendu deux fois : c'est le cas d'une
 * liste dont la forme se lit dans les deux, que le garde compte dans chacun.
 */
export function reglagesANomenclature(): ReglageANomenclature[] {
  const tous = choix();
  return DOMAINES.flatMap((domaine) => relevesDuDomaine(domaine, tous).map((c) => {
    const rang = c.ou.indexOf("·");
    return { fiche: c.ou.slice(0, rang), reglage: c.ou.slice(rang + 1), domaine, ids: c.ids };
  }));
}

