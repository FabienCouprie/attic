// plugins/nomenclatures-registre.test.ts — Un concept, des formes déclarées, et rien d'autre.
//
// POURQUOI CE GARDE EST D'UNE AUTRE NATURE QUE CEUX DES SOURCES. Relevé par Fabien : « ce qui
// m'inquiète c'est qu'on se centre sur ces trois objets que sont les accords, les gammes, les
// rythmes, il doit y en avoir d'autres. »
//
// `audio/nomenclatures.test.ts` lit les SOURCES et cherche des données écrites à la main : il
// rattrape le passé. Celui-ci lit le REGISTRE VIVANT et regarde ce que les composants OFFRENT :
// il ferme l'avenir. Aucun garde de source ne peut voir qu'un trente-troisième composant vient
// d'écrire sa propre liste de douze clés, puisque douze noms de notes ne sont pas une donnée
// musicale, seulement un choix.
//
// CE QUE LE RELEVÉ A DONNÉ, sur 454 composants et 489 réglages à choix. 296 vocabulaires distincts,
// dont 247 n'appartiennent qu'à un seul composant : ceux-là ne sont pas des nomenclatures, ce sont
// des réglages. Restent 48 concepts partagés par au moins deux composants, et VINGT-CINQ D'ENTRE
// EUX portaient déjà plusieurs orthographes.
//
// TROIS TESTS FONT QU'UN VOCABULAIRE EST UN DOMAINE :
//  1. Il s'ENREGISTRE. Son identifiant finit dans un fichier de projet, et le renommer ou le
//     réordonner change silencieusement le projet de quelqu'un. C'est le test dur.
//  2. Il est PARTAGÉ. Un vocabulaire d'un seul composant lui appartient.
//  3. Il a un SENS HORS du composant qui l'offre. « Do dièse » existe indépendamment de qui le
//     propose ; les `p4, p5, p6` de Csound n'existent que dans Csound, même employés par quatre.
//
// CE FICHIER EST UN REGISTRE DE DETTE, ET NON UN BULLDOZER. Chaque domaine y déclare le nombre de
// formes que le dépôt assume aujourd'hui. Une forme de plus est une liste écrite à la main, et la
// suite échoue ; une forme de moins est une dette remboursée, et la suite échoue AUSSI, pour qu'on
// vienne l'inscrire. Le nombre déclaré est donc la mesure de ce qui reste à unifier, et il se lit
// ici sans rien relancer.
import { describe, expect, it } from "vitest";
import { toutesLesFiches } from "./index";
import { gammeDe } from "../audio/gammes";
import { gammeParId as gammeMondeDe } from "../audio/gammes-monde";
import { qualiteDe } from "../audio/qualites-accords";
import { demiTonDeCle } from "../audio/cles";
import { PROGRESSIONS_GENRE } from "../audio/generation";
import { PERCUSSIONS_JOUABLES } from "../audio/batterie-midi";
import { DISPOSITIONS } from "../audio/multicanal";
import { PATRONS_RYTHME } from "../audio/generation-patrons";
import { formatImage } from "../core/formats-image";

/**
 * Un réglage à choix, avec les identifiants qu'un projet enregistrera ET les libellés qu'il montre.
 *
 * LES LIBELLÉS COMPTENT AUTANT QUE LES IDENTIFIANTS, et le relevé des clés l'a montré : dix-sept
 * composants affichaient « C# » EN FRANÇAIS quand les autres affichaient « Do♯ ». L'identifiant est
 * invisible et se résout par alias ; le libellé, lui, se voit, et il s'enregistre aussi.
 */
interface Choix { ou: string; ids: string[]; forme: string }

function choix(): Choix[] {
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
interface Domaine {
  nom: string;
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
  remede: string;
}

const estPuissanceDeDeux = (x: string) =>
  /^\d+$/.test(x) && Number(x) >= 256 && (Number(x) & (Number(x) - 1)) === 0;

const DOMAINES: Domaine[] = [
  {
    nom: "gamme",
    membre: (x) => Boolean(gammeDe(x) || gammeMondeDe(x)),
    seuil: 2,
    sentinelles: [
      { valeur: "roue", raison: "« Selon la roue » : la gamme vient du cercle dessiné, et non de la liste" },
    ],
    canonique: (id) => (gammeMondeDe(id) ? id : gammeDe(id)?.id),
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
    formesAssumees: 11,
    remede: "offrir la liste de `audio/gammes.ts`, par `completer` pour garder l'ordre d'un composant ancien",
  },
  {
    nom: "accord",
    membre: (x) => qualiteDe(x) !== undefined,
    sentinelles: [
      { valeur: "roue", raison: "« Selon la roue » : la qualité vient du cercle dessiné" },
      { valeur: "Cantus firmus", raison: "un motif de contrepoint, et non une qualité d'accord" },
      { valeur: "Personnalisé", raison: "le motif est saisi à la main dans le champ d'à côté" },
    ],
    canonique: (id) => qualiteDe(id)?.id,
    anciennesEcritures: [
      { ou: "arpege-koch·Accord", raison: "les noms français de la table de Koch, enregistrés dans les projets" },
      // CELUI-CI N'ÉTAIT PAS VISIBLE AVANT LA RÉPARATION DU GARDE : sa liste porte deux valeurs
      // hors domaine, « Cantus firmus » et « Personnalisé », ce qui suffisait à la faire
      // disparaître entièrement du relevé.
      { ou: "generateur-fractal·Motif", raison: "un motif de génération et non un accord : les trois premiers sont des triades, les deux autres ne le sont pas, et les cinq libellés français sont enregistrés" },
    ],
    // DE DEUX À QUATRE : deux formes portaient une valeur hors domaine, la sentinelle « roue » et
    // les deux motifs du générateur fractal, ce qui les faisait disparaître entièrement du relevé.
    formesAssumees: 4,
    remede: "offrir la liste de `audio/qualites-accords.ts`",
  },
  {
    nom: "clé",
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
    remede: "étaler `PARAMETRE_CLE` ou `PARAMETRE_TONIQUE` de `audio/cles.ts`, au lieu de recopier douze noms",
  },
  {
    nom: "fenêtre d'analyse",
    membre: estPuissanceDeDeux,
    seuil: 2,
    // DIX FORMES, ET AUCUNE N'EST UNE DETTE : CHACUNE A ÉTÉ EXAMINÉE. Six sous-ensembles, de 256 à
    // 8192, portent chacun leur raison dans la documentation de leur propre réglage : « elle doit
    // être longue, il faut du temps pour constater qu'une fréquence dure » contre « elle doit être
    // courte » pour les deux passes de la décomposition STN, « 2048 est le compromis de l'article »
    // pour la séparation harmonique, « sans effet sur l'étirement » pour la transformée de Csound.
    // Trois formes ne diffèrent que par les LIBELLÉS : « Ordinaire (2048) » nomme la taille du
    // MILIEU de sa propre liste, et le milieu de l'une n'est pas celui de l'autre, de sorte qu'une
    // table centrale ne peut pas les produire. Et l'absence de liste anglaise sur deux réglages est
    // une décision écrite à côté d'eux, des tailles de fenêtre ne se traduisant pas.
    //
    // CE QUI RESTAIT EST PAYÉ : les listes elles-mêmes venaient de vingt et une écritures à la
    // main, et viennent désormais de `audio/fenetres-analyse.ts`. Un garde de SOURCE le tient,
    // comme pour les signatures et les langues, puisque le registre ne voit pas deux listes
    // identiques écrites deux fois.
    formesAssumees: 10,
    remede: "offrir `choixFenetre` de `audio/fenetres-analyse.ts`, et dire pourquoi un composant en offre une part",
  },
  {
    nom: "métrique",
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
    remede: "déclarer une liste centrale des signatures",
  },
  {
    nom: "valeur de note",
    // LE TRIOLET EST UNE VALEUR DE NOTE, et le prédicat d'avant ne le voyait pas : écrit
    // `/^1\/\d+$/`, il écartait « 1/8t » et « 1/8 triplet », donc les deux réglages qui les
    // offrent étaient invisibles. Les deux écritures du triolet sont justement la divergence de ce
    // domaine, et un garde qui ne la voit pas ne peut pas la signaler.
    membre: (x) => /^1\/\d+t?$/.test(x) || /^1\/\d+ triplet$/.test(x),
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
    // LES SIX QUI RESTENT SONT DES SOUS-ENSEMBLES, et chacun est la grille de son composant : six
    // valeurs pour l'intervalle du « beat repeat », cinq pour sa taille et dans l'autre sens,
    // quatre pour la quantification d'une partition, trois pour la résolution d'un réservoir.
    formesAssumees: 6,
    remede: "offrir `choixValeurs` de `audio/valeurs-note.ts`",
  },
  {
    nom: "forme d'onde",
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
    remede: "offrir `FORMES_ONDE_CHOIX` de `audio/timbres.ts`, et ses `LIBELLES_HERITES_FORMES`",
  },
  {
    nom: "oui ou non",
    // UNE PAIRE N'A PAS DE SENTINELLE POSSIBLE : si une troisième valeur apparaissait, ce ne serait
    // plus un oui ou non. Le seuil vaut donc deux et le domaine se referme sur l'exactitude.
    membre: (x) => ["oui", "non", "yes", "no"].includes(x),
    seuil: 2,
    formesAssumees: 6,
    remede: "déclarer une paire centrale, dans chacun des deux ordres, puisque l'ordre d'un composant est enregistré",
  },

  // ── LES DOMAINES INSCRITS LE 2026-10-23, APRÈS LE RELEVÉ DES 503 COMPOSANTS ─────────────────
  //
  // Le relevé a trouvé cinquante et un concepts partagés par au moins deux composants, dont
  // trente-quatre divergents, quand le registre n'en déclarait que huit. Ceux qui suivent sont les
  // divergents qui passent les trois tests du haut de ce fichier ; ceux qui ne les passent pas sont
  // inscrits plus bas, avec la raison de leur refus, pour qu'on ne les réexamine pas.

  {
    nom: "genre",
    membre: (x) => PROGRESSIONS_GENRE[x] !== undefined,
    sentinelles: [
      { valeur: "custom", raison: "« Personnalisé » : la progression est saisie dans le champ d'à côté" },
    ],
    canonique: (id) => (PROGRESSIONS_GENRE[id] ? id : undefined),
    formesAssumees: 2,
    remede: "offrir `GENRES_ACCORDS` de `plugins/generateurs-aides.ts`, ou sa coupe sans la progression personnalisée",
  },
  {
    nom: "format d'image",
    membre: (x) => formatImage(x) !== undefined,
    seuil: 2,
    canonique: (id) => formatImage(id)?.id,
    formesAssumees: 3,
    remede: "offrir `choixFormats` de `core/formats-image.ts`",
  },
  {
    nom: "percussion",
    membre: (x) => PERCUSSIONS_JOUABLES.some((p) => String(p.note) === x),
    // UNE SEULE FORME, et elle vient d'être unifiée : « Rythme euclidien » recopiait sa liste à la
    // main, où « Tom grave » désignait une autre note que dans la table commune.
    formesAssumees: 1,
    remede: "offrir `choixPercussion` de `audio/batterie-midi.ts`",
  },
  {
    nom: "moteur de synthèse",
    membre: (x) => ["auto", "fm", "soundfont"].includes(x),
    seuil: 2,
    formesAssumees: 2,
    remede: "étaler `PARAMETRE_SYNTHESE` de `plugins/soundfontGlobal.ts`, ou sa variante sans « Automatique »",
  },
  {
    nom: "disposition de haut-parleurs",
    membre: (x) => DISPOSITIONS.some((d) => d.id === x),
    formesAssumees: 2,
    remede: "offrir `choixDisposition` de `plugins/multicanal.ts`",
  },
  {
    nom: "langue",
    // LA LISTE EST CELLE DES CODES QUE LE DÉPÔT OFFRE, et non une forme à deux lettres : « do » et
    // « la » sont des notes, « en » et « es » des langues, et rien dans la forme ne les sépare.
    membre: (x) => ["fr", "en", "de", "es", "it", "pt", "ru", "zh", "yue", "ja", "ko", "nl", "ar", "hi", "ro"].includes(x),
    sentinelles: [
      { valeur: "", raison: "« Automatique » : le moteur reconnaît la langue seul" },
    ],
    // SIX FORMES, ET LEUR DIVERGENCE EST EN PARTIE LÉGITIME : chaque composant est borné par les
    // langues que SON modèle tient, et chacun l'écrit en commentaire. Ce qui ne l'est pas, c'est que
    // les noms de langue soient recopiés dans six tables à la main, où une orthographe peut dériver
    // sans que rien ne le dise.
    formesAssumees: 6,
    remede: "déclarer une table centrale des noms de langue, chaque composant n'offrant que les codes que SON modèle tient",
  },
  {
    nom: "caractère de timbre",
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
    remede: "déclarer une liste centrale des positions, en minuscules comme partout ailleurs",
  },
  {
    nom: "patron rythmique",
    membre: (x) => PATRONS_RYTHME[x] !== undefined,
    formesAssumees: 2,
    remede: "offrir `optionsPatrons` de `audio/patrons-rythme.ts`, avec la métrique qui restreint",
  },
  {
    nom: "extension d'accord",
    membre: (x) => ["aucune", "septieme", "sixte", "idiomatique"].includes(x),
    seuil: 2,
    // LES DEUX FORMES SONT BORNÉES PAR L'ALGORITHME, et la borne est écrite à côté de chacune :
    // l'un ajoute la septième à CHAQUE accord, l'autre là où le genre la place. Les anciennes
    // valeurs du second sont lues comme « idiomatique ».
    formesAssumees: 2,
    remede: "déclarer une liste centrale des extensions, et dire pourquoi un composant n'en offre qu'une part",
  },
];

/**
 * Les concepts partagés qui ont été EXAMINÉS et qui ne sont pas des domaines, avec la raison.
 *
 * POURQUOI LES INSCRIRE PLUTÔT QUE LES TAIRE. Le relevé du 2026-10-23 a trouvé trente-quatre
 * concepts partagés divergents sur les 503 composants. Dix-huit sont gardés plus haut ; ceux-ci ont
 * été ouverts un par un et écartés, le plus souvent au troisième test : le mot est le même et la
 * chose ne l'est pas. Sans cette liste, le prochain relevé les retrouvera et refera le travail,
 * ou pire, « unifiera » deux vocabulaires qui n'ont en commun qu'une homonymie.
 */
const EXAMINES_ET_ECARTES: { ou: string; raison: string }[] = [
  { ou: "generateur-pochette·Palette", raison: "« magma » nomme trois couleurs lues par position ici et six arrêts interpolés dans l'attracteur : deux jeux de couleurs sous un même nom" },
  { ou: "attracteur-ifs·Palette", raison: "l'autre moitié de la même homonymie, six arrêts le long d'un scalaire de densité" },
  { ou: "styles-musicaux·Catégorie", raison: "onze genres musicaux ; « Rock » n'est pas une catégorie d'émotion" },
  { ou: "emotions·Catégorie", raison: "huit familles d'émotions ; « Joie » n'est pas un style musical" },
  { ou: "clavier-sfz·Source", raison: "les voies d'approvisionnement propres au nœud, donc ses propres ports" },
  { ou: "banque-sfz·Source", raison: "l'autre moitié : ce nœud n'a pas d'entrée, il ne peut pas offrir « Banque entrante »" },
  { ou: "montage-grains·Opération", raison: "« garder » y veut dire un grain sur deux, et dans les ondelettes une part des coefficients : faux ami" },
  { ou: "ondelettes·Opération", raison: "l'autre moitié du faux ami ; des coefficients n'existent pas hors de la transformée" },
  { ou: "tresse·Brins", raison: "un nombre de bandes de fréquence, que seule la forme de petits entiers rapproche d'une signature" },
  { ou: "qui-parle-quand·Locuteur", raison: "un rang de locuteur, de un à quatre" },
  { ou: "composer-plan·Signature", raison: "un nombre de temps par mesure, écrit comme une chaîne dans le plan" },
  { ou: "midi-vers-abc·Grille", raison: "un nombre de subdivisions par temps" },
  { ou: "carte-sonore·Style", raison: "quatre dispositions de carte ; « voronoi » n'est pas un style de pochette" },
  { ou: "generateur-pochette·Style", raison: "douze styles graphiques ; « bauhaus » n'est pas une disposition de carte" },
  { ou: "reprise-abc·Style", raison: "six motifs d'accompagnement, bornés par la métrique" },
  { ou: "tonal-analyse·Style", raison: "trois idiomes de progression ; « Pop » y est I-V-vi-IV et non un accord par temps" },
  { ou: "spirale-logarithmique·Rapport par tour", raison: "un facteur de FRÉQUENCE : « quinte » et « octave » n'ont pas de sens comme facteurs de distance" },
  { ou: "spirale-spatiale·Rapport par tour", raison: "un facteur de DISTANCE : « quadruple » n'est pas un nom d'intervalle" },
  { ou: "generateur-courbe·Forme", raison: "quatorze courbes de modulation dont onze n'ont rien d'une onde, parmi lesquelles cinq lois de probabilité" },
  { ou: "ddsp-tone-transfer·Instrument", raison: "les quatre points de contrôle publiés du modèle ; il n'existe pas de checkpoint de clarinette" },
  { ou: "vent-guide-onde·Instrument", raison: "trois modèles physiques de tuyau ; un violon n'a pas de tuyau" },
];

describe("un concept, des formes déclarées", () => {
  const tous = choix();

  it("CHAQUE CONCEPT ÉCARTÉ EXISTE ENCORE, sans quoi sa raison ne garde plus rien", () => {
    // Un réglage renommé ou retiré laisserait ici une raison orpheline, qui couvrirait un autre
    // réglage portant un jour le même nom.
    const offerts = new Set(tous.map((c) => c.ou));
    const orphelins = EXAMINES_ET_ECARTES
      .filter((e) => !offerts.has(e.ou))
      .map((e) => `${e.ou} : ce réglage n'existe plus, retirer la ligne`);
    expect(orphelins).toEqual([]);
  });

  it("LE REGISTRE EST LU, sans quoi tous les cas passeraient à vide", () => {
    expect(toutesLesFiches.length).toBeGreaterThan(400);
    expect(tous.length).toBeGreaterThan(400);
  });

  for (const d of DOMAINES) {
    const sauf = (test: (x: string) => boolean) => (x: string) => {
      try { return test(x); } catch { return false; }
    };
    const membres = (c: Choix) => c.ids.filter(sauf(d.membre));
    const distinctifs = (c: Choix) => c.ids.filter(sauf(d.distinctif ?? d.membre));
    // DEUX VALEURS HORS DOMAINE AU PLUS, et cette borne est ce qui sépare une sentinelle d'un
    // autre vocabulaire. Une sentinelle dit « prends la valeur ailleurs », et une liste n'en porte
    // qu'une ou deux : « Du fichier », « Automatique ». Au-delà, ce n'est plus une liste du domaine
    // qui porte une exception, c'est un vocabulaire étranger qui le recoupe — et le compter aurait
    // été le faux positif symétrique de l'aveuglement qu'on vient de réparer : sans cette borne,
    // le domaine « accord » attrapait cent une valeurs qui ne sont pas des accords.
    const releves = tous.filter((c) =>
      distinctifs(c).length >= (d.seuil ?? 3) && c.ids.length - membres(c).length <= 2);

    it(`« ${d.nom} » : le nombre de formes est celui qui est déclaré`, () => {
      const formes = new Map<string, string[]>();
      for (const c of releves) {
        if (!formes.has(c.forme)) formes.set(c.forme, []);
        formes.get(c.forme)!.push(c.ou);
      }
      const vues = [...formes.entries()]
        .sort((a, b) => b[1].length - a[1].length)
        .map(([forme, ou]) => `  ${String(ou.length).padStart(2)} × ${forme.slice(0, 110)}${forme.length > 110 ? "…" : ""}  ${ou[0]}`);
      expect(
        formes.size,
        `« ${d.nom} » est offert par ${releves.length} réglages sous ${formes.size} formes, `
        + `${d.formesAssumees} étant déclarées.\n`
        + `UNE DE PLUS est une liste écrite à la main : ${d.remede}.\n`
        + `UNE DE MOINS est une dette remboursée : inscrire le nouveau nombre ici.\n`
        + `Les formes vues :\n${vues.join("\n")}`,
      ).toBe(d.formesAssumees);
    });

    it(`« ${d.nom} » : ce qui ne relève pas du domaine est déclaré`, () => {
      // LE CAS QUI MANQUAIT, ET QUI EST TOUT L'OBJET DE LA RÉPARATION. Une valeur hors domaine
      // mise dans une liste du domaine était, avant, ce qui faisait DISPARAÎTRE la liste entière du
      // relevé. Elle est désormais vue, et elle doit porter sa raison : une sentinelle dit « prends
      // la valeur ailleurs », et tout le reste est une faute d'orthographe qui attend d'être lue.
      const nommees = new Set((d.sentinelles ?? []).map((s) => s.valeur));
      const fautifs: string[] = [];
      for (const c of releves) {
        for (const id of c.ids) {
          if (d.membre(id) || nommees.has(id)) continue;
          fautifs.push(`${c.ou} offre « ${id} », qui ne relève pas du domaine`);
        }
      }
      expect(
        fautifs.length,
        `${d.remede}, ou déclarer la valeur dans \`sentinelles\` avec sa raison :\n`
        + fautifs.map((f) => `  ${f}`).join("\n"),
      ).toBe(0);
    });

    it(`« ${d.nom} » : chaque sentinelle déclarée existe encore`, () => {
      // Une sentinelle qui a disparu des fiches couvrirait la réapparition d'une valeur du même nom.
      const offerts = new Set(releves.flatMap((c) => c.ids));
      const mortes = (d.sentinelles ?? [])
        .filter((s) => !offerts.has(s.valeur))
        .map((s) => `« ${s.valeur} » — ${s.raison} : plus aucun réglage ne l'offre, retirer la ligne`);
      expect(mortes).toEqual([]);
    });

    if (d.canonique) {
      it(`« ${d.nom} » : les identifiants offerts sont canoniques`, () => {
        const nommees = new Set((d.anciennesEcritures ?? []).map((e) => e.ou));
        // UNE SENTINELLE N'A PAS DE FORME CANONIQUE : elle ne relève pas du domaine, donc sa table
        // ne la connaît pas, et l'exiger canonique serait lui demander d'être ce qu'elle n'est pas.
        const sentinelles = new Set((d.sentinelles ?? []).map((s) => s.valeur));
        const fautifs = releves
          .filter((c) => !nommees.has(c.ou))
          .map((c) => ({
            ou: c.ou,
            faux: c.ids.filter((x) => !sentinelles.has(x) && d.canonique!(x) !== x),
          }))
          .filter((x) => x.faux.length > 0)
          .map((x) => `${x.ou} offre ${x.faux.join(", ")}`);
        expect(
          fautifs.length,
          `${d.remede}, ou nommer ce composant dans \`anciennesEcritures\` avec sa raison :\n`
          + fautifs.map((f) => `  ${f}`).join("\n"),
        ).toBe(0);
      });

      it(`« ${d.nom} » : chaque ancienne écriture nommée existe encore`, () => {
        // UNE DETTE INSCRITE QUI A ÉTÉ PAYÉE DOIT SORTIR DU REGISTRE, sans quoi elle couvrirait la
        // réapparition du défaut au même endroit.
        const payees = (d.anciennesEcritures ?? [])
          .filter((e) => {
            const c = releves.find((x) => x.ou === e.ou);
            const sentinelles = new Set((d.sentinelles ?? []).map((s) => s.valeur));
            return !c || c.ids.every((x) => sentinelles.has(x) || d.canonique!(x) === x);
          })
          .map((e) => `${e.ou} — ${e.raison} : l'écriture est canonique désormais, retirer la ligne`);
        expect(payees).toEqual([]);
      });
    }
  }

  it("LA DETTE EST CHIFFRÉE, et c'est elle qu'on vient lire", () => {
    // Le nombre de formes en trop, domaine par domaine : ce qu'il resterait à unifier si chaque
    // domaine se ramenait à une seule liste. Ce cas ne juge pas, il empêche le chiffre de croître
    // sans qu'on s'en aperçoive.
    // TRENTE-TROIS, PUIS VINGT-SEPT, PUIS TRENTE-HUIT, ET LA MONTÉE EST UNE BONNE NOUVELLE. Deux
    // domaines ont été unifiés — la métrique par `audio/signatures.ts`, la forme d'onde par
    // `FORMES_ONDE_CHOIX` — ce qui a fait tomber le chiffre de 33 à 27. Puis la mécanique du garde
    // a été réparée, et ONZE FORMES QU'IL NE VOYAIT PAS sont entrées dans le compte : une
    // sentinelle en tête d'une liste suffisait à la faire disparaître entièrement, et un plancher
    // de longueur cachait les listes courtes écrites à la main.
    //
    // CE CHIFFRE N'EST DONC PAS LA DETTE QUI A GRANDI, C'EST LA DETTE QU'ON VOIT ENFIN. Comparer 38
    // à 33 n'a pas de sens : les deux ne mesurent pas la même chose. C'est à partir d'ici qu'il se
    // compare à lui-même.
    // PUIS DE TRENTE-HUIT À CINQUANTE-TROIS, par DIX DOMAINES DE PLUS : le relevé des 503
    // composants a trouvé cinquante et un concepts partagés, dont trente-quatre divergents, quand
    // huit seulement étaient déclarés. Ce chiffre ne mesure donc pas la même chose qu'avant lui :
    // il couvre dix-huit domaines au lieu de huit. C'est là que la comparaison repart.
    // PUIS DE CINQUANTE-DEUX À CINQUANTE ET UN, par le caractère de timbre : la forme en trop était
    // la même table privée du sinus, pour un moteur dont la branche sinusoïdale manquait.
    // PUIS DE CINQUANTE ET UN À CINQUANTE, par la valeur de note : deux grilles de quantification
    // ne faisaient deux formes que par l'écriture française du triolet.
    const enTrop = DOMAINES.reduce((s, d) => s + d.formesAssumees - 1, 0);
    expect(enTrop, "unifier un domaine fait baisser ce nombre ; en laisser un nouveau le fait monter")
      .toBe(50);
  });
});
