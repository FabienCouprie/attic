// audio/croisement-inscriptions.ts — Ce que la passe de croisement a le droit de relever.
//
// DEUX LISTES PAR NATURE, et elles ne se valent pas. Les DÉCLARÉES sont tranchées : une inertie
// légitime, dite dans la documentation du réglage en français et en anglais, ou deux valeurs qui
// rendent légitimement la même chose ; chacune porte sa raison. Les À EXAMINER sont la dette du lot 1
// de la passe de complétude (2026-11-14) : tout ce que la première passe a relevé, avant que Fabien
// tranche. Elle ne peut que décroître : le lot 3 en sort chaque ligne, déclarée ou réparée.
//
// LA DETTE EST UNE DONNÉE ET NON DU CODE. Tirée une fois du relevé de la passe, elle tient en
// centaines de lignes qu'aucune main n'a écrites ; elle vit donc dans `croisement-dette.json`, une
// inscription par ligne, et ne se régénère jamais : la régénérer laisserait entrer une inertie neuve
// sans que personne l'ait vue. Le garde en plafonne le compte.
//
// SIX LIGNES Y SONT ENTRÉES AU LOT 3c, examinées une à une, sur la décision de Fabien du 2026-11-14 :
// la même inertie qu'elle portait déjà, vue sous un gouverneur neuf qui n'en est pas la cause, pour le
// règle personnalisée, la hauteur et le moteur de l'automate cellulaire, le swing du séquenceur
// d'accords, l'étalement des accords joués et la graine de la roue de Camelot. Le lot 3d les remplace
// par une déclaration chacune, sous leur vraie condition. SEPT AUTRES, sous la même règle : les
// graines neuves des accords joués et de la gamme jouée, que seul le sens aléatoire fait agir.

import { OUI_NON } from "../core/oui-non";
import type { CoincidenceInscrite, InertieConditionnee, InertieInscrite } from "./croisement-registre";
import { COINCIDENCES_DES_CHOIX, INERTIES_DES_CHOIX } from "./croisement-choix";
import dette from "./croisement-dette.json";
import { SIGNATURES } from "./signatures";
import { GAMMES_DES_ROMAINS } from "./theorie-romains";

/** Les métriques en seizièmes de la table commune, sous lesquelles la grille descend à la double croche. */
const EN_SEIZIEMES = SIGNATURES.filter((s) => s.endsWith("/16"));

// LES PREMIÈRES DÉCLARATIONS, du lot 3b (2026-11-14). Ce que la régénération de la dette au lot 3a
// y avait fait entrer, contre la règle écrite plus haut, et ce que l'élargissement des gammes fait
// naître : chaque ligne a été examinée, et les coïncidences de gammes vues se séparer sur un rendu
// plus long ou sous une autre graine.

const SEGMENT = "une taille au moins aussi longue que l'intervalle rend l'entrée telle quelle, et les réglages du segment n'ont plus rien à régler ; dit dans leur documentation";
const RESERVOIR = "le rendu d'essai, aux mesures et à la graine par défaut, n'atteint que quelques degrés, et ces gammes s'y accordent ; seize mesures ou une autre graine les séparent";
const UNE_SUITE = "la suite trouvée à la graine d'essai évite les degrés où ces gammes diffèrent ; une autre graine les sépare";

// LES DÉCLARATIONS DU LOT 3b-2 (2026-11-14), que l'élargissement des fenêtres et des valeurs de note
// fait naître ou grandir. Chacune remplace une ligne de la dette, devenue fausse quand la liste a
// gagné des valeurs, et chaque raison d'entrée a été vue se défaire sous une entrée qui donne prise.
const VUE_SEULE = "la taille ne règle que la vue, qui calcule son propre spectre : le nœud rend son entrée telle quelle";

/** Les numéros des huit entrées du mélangeur MIDI, dont chacune porte les mêmes réglages. */
const ENTREES_DU_MELANGEUR = [1, 2, 3, 4, 5, 6, 7, 8];

/** Les inerties légitimes, chacune dite dans la documentation du réglage gouverné. */
export const INERTIES_DECLAREES: InertieInscrite[] = [
  { ou: "beat-repeat·Feedback", sous: "Intervalle", valeurs: ["1/16", "1/16t", "1/32"], raison: SEGMENT },
  { ou: "beat-repeat·Feedback", sous: "Taille", valeurs: ["1/2", "1/4.", "1/4"], raison: SEGMENT },
  { ou: "beat-repeat·Mix", sous: "Intervalle", valeurs: ["1/16", "1/16t", "1/32"], raison: SEGMENT },
  { ou: "beat-repeat·Mix", sous: "Taille", valeurs: ["1/2", "1/4.", "1/4"], raison: SEGMENT },
  { ou: "beat-repeat·Répétitions", sous: "Intervalle", valeurs: ["1/16", "1/16t", "1/32"], raison: SEGMENT },
  { ou: "beat-repeat·Répétitions", sous: "Taille", valeurs: ["1/2", "1/4.", "1/4"], raison: SEGMENT },
  { ou: "beat-repeat·Tempo", sous: "Intervalle", valeurs: ["1/16", "1/16t", "1/32"], raison: SEGMENT },
  { ou: "beat-repeat·Tempo", sous: "Taille", valeurs: ["1/2", "1/4.", "1/4"], raison: SEGMENT },
  { ou: "beat-repeat·Taille", sous: "Intervalle", valeurs: ["1/16", "1/16t", "1/32"], raison: "sous ces intervalles, les deux tailles que la passe éprouve, 1/2 et 1/4 pointée, sont plus longues et rendent l'entrée telle quelle ; une taille plus courte s'entend, et sa documentation le dit" },
  // LA CORDE DE KARPLUS-STRONG (2026-11-27) : l'impulsion est un seul échantillon, et rien n'est tiré
  // pour elle ; la graine n'y agit que par le tirage des signes, sous un « Mélange » inférieur à 1.
  { ou: "karplus-strong·Longueur d'excitation", sous: "Excitation", valeurs: ["impulsion"], raison: "l'impulsion ne dure qu'un échantillon, quelle que soit la longueur ; dit dans la documentation du réglage" },
  { ou: "karplus-strong·Graine", sous: "Excitation", valeurs: ["impulsion"], raison: "l'impulsion ne tire aucun bruit, et au « Mélange » de 1 aucun signe n'est tiré : la graine n'a rien à semer ; dit dans la documentation du réglage" },
];

const UNE_GRAINE = "la graine ne tire que l'ordre aléatoire, et hors de lui elle n'a rien à tirer ; dit dans sa documentation";

const SANS_HARMONIE = "non mesurable au banc : le MIDI d'essai, une mélodie, ne rend que des accords d'une note, et la position fondamentale ne vaut que pour un accord de trois sons ; tenu par plugins/voix-sur-accord.test.ts sur une harmonie de « Harmonie par motifs » ; dit dans sa documentation";

// LES RAISONS COMMUNES DU LOT 3d-2.
const VUE_ANIMEE = "non mesurable au banc : ce réglage ne règle que l'animation montrée dans le composant, et aucune sortie n'en dépend ; dit dans sa documentation";
const VUE_SEULE_ECHELLE = "non mesurable au banc : l'échelle ne règle que la vue, et le nœud rend son entrée telle quelle ; dit dans sa documentation";
const CHROMATIQUE = "la gamme chromatique compte les douze classes de hauteur, et la tonique n'en déplace aucune ; dit dans sa documentation";
const CONDUITE = "les bornes ne s'appliquent qu'à la conduite des voix, qui n'a pas lieu ; dit dans sa documentation";
const CHAMP_LIBRE = "sans champ libre, ses bornes n'ont rien à borner ; dit dans sa documentation";
const SOLUTION_FACILE = "non mesurable au banc : le nœud n'a pas d'entrée, et sous ses règles par défaut une suite existe, trouvée en 40 à 149 essais selon la tonique ; le plus petit budget offert ne borne rien, et le repli n'est jamais consulté";
const SANS_SOUNDFONT = "non mesurable au banc : sans SoundFont chargé, le rendu passe en FM, qui n'a pas de programme, et aucune sortie ne porte le preset";
const SANS_DOM = "non mesurable au banc : sans DOM, aucune image n'est dessinée, et le format n'a rien à encoder";
const HORS_BOUCLE = "non mesurable au banc : hors d'une boucle ouverte, la fin rend son entrée telle quelle ; `plugins/boucle-creneau.test.ts` éprouve ce réglage dans une boucle";
const TONIQUES_VOISINES = "la suite trouvée à la graine d'essai évite le seul degré où ces deux toniques, à une quinte l'une de l'autre, diffèrent ; une autre graine les sépare";
const DOUZE_TIRAGES = "les douze hauteurs de l'arbre n° 339 tirées à la graine d'essai évitent le seul degré où ces deux gammes, ou ces deux toniques, diffèrent ; les graines 2 et 3 les séparent, sondé le 2026-11-15";
const TEMPO_RECU = "non mesurable au banc : l'entrée MIDI d'essai porte son tempo, qui l'emporte sur le réglage depuis le 2026-11-26 ; le réglage ne sert qu'à une entrée sans tempo, ce que tient `plugins/tempo-de-l-entree.test.ts` ; dit dans sa documentation";
const GAMMES_EN_CENTS = ["rast", "bayati", "hijaz", "saba", "bhairav", "yaman", "todi", "slendro", "pelog", "shruti22"];

/** Les inerties d'un réglage de cercle pulsant hors des modes où il sonne. */
const parMode = (noms: readonly string[], modes: readonly string[], cause: string): InertieConditionnee[] =>
  noms.map((nom) => ({ ou: `cercle-pulsant·${nom}`, quand: { reglage: "Mode", sauf: modes }, raison: `${cause} ; dit dans sa documentation` }));

/**
 * Les inerties déclarées par leur VRAIE CONDITION (lot 3d, 2026-11-14) : chacune couvre chaque lancer
 * où sa condition tient, sous n'importe quel gouverneur, et tombe dès que le réglage y agit. Elles
 * remplacent les inscriptions par gouverneur de la même inertie, déclarées ou en dette.
 */
export const INERTIES_CONDITIONNEES: InertieConditionnee[] = [
  { ou: "automate-cellulaire·Règle personnalisée", quand: { reglage: "Règle", sauf: ["Personnalisée"] }, raison: "le numéro de règle n'est lu que quand la règle choisie est « Personnalisée » ; dit dans sa documentation" },
  { ou: "automate-cellulaire·Hauteur", quand: { reglage: "Topologie", valeurs: ["1D"] }, raison: "une ligne à une dimension n'a pas de hauteur de grille ; dit dans sa documentation" },
  { ou: "automate-cellulaire·Synthèse", quand: { banc: true }, raison: "non mesurable au banc : sans SoundFont chargé, les trois moteurs rendent en FM, l'automatique comme le SoundFont, qui l'annonce dans son message" },
  { ou: "automate-cellulaire·Densité max", quand: { reglage: "Mode voix", valeurs: ["melodie", "arpege"] }, raison: "la mélodie et l'arpège jouent une note par pas, et le plafond des notes simultanées ne borne rien ; dit dans sa documentation" },
  { ou: "accords-joues·Étalement", quand: { reglage: "Façon", valeurs: ["plaque"] }, raison: "un accord plaqué fait partir ses notes ensemble, et l'étalement de leurs départs n'a rien à répartir ; dit dans sa documentation" },
  { ou: "accords-joues·Graine", quand: { reglage: "Sens", sauf: ["aleatoire"] }, raison: UNE_GRAINE },
  { ou: "gamme-jouee·Graine", quand: { reglage: "Sens", sauf: ["aleatoire"] }, raison: UNE_GRAINE },
  { ou: "arpegiateur-midi·Graine", quand: { reglage: "Direction", sauf: ["aleatoire"] }, raison: UNE_GRAINE },
  { ou: "harmoniser-choral·Graine", quand: { reglage: "Température", valeurs: ["0"] }, raison: "à température nulle, le choral est celui de moindre coût, trouvé sans tirage ; dit dans sa documentation" },
  { ou: "harmoniser-choral·Pas", quand: { banc: true }, raison: "au banc, un modèle est branché sur « Modèle », et sa grille remplace celle de « Pas », ce que la notice dit ; sans modèle, « Pas » est tenu par audio/choral-harmoniser.test.ts" },
  { ou: "corpus-fabriquer-fin·Si le fichier existe", quand: { banc: true }, raison: "non mesurable au banc : le réglage n'agit que sur un fichier écrit, et le banc de node n'a ni dossier ni application de bureau ; tenu par plugins/fabriquer-corpus.test.ts" },
  // VUE DEPUIS QUE « SOURCE » GOUVERNE (2026-11-25) : la même inertie que la coïncidence des deux
  // valeurs de « Graines », relevée sous le nouveau gouverneur.
  { ou: "corpus-fabriquer-debut·Graines", quand: { banc: true }, raison: "non mesurable au banc : les graines du corps sont réglées par le pilote, pour les nœuds rejoués à chaque passe, et non par ce nœud, que le banc lance seul ; tenu par core/graines-de-passe.test.ts et l'exemple un-corpus-fabrique.json" },
  ...ENTREES_DU_MELANGEUR.map((n) => ({
    ou: `melangeur-midi·Transposition ${n}`, quand: { reglage: `Canal ${n}`, valeurs: ["10"] },
    raison: "le canal 10 est celui des percussions, dont le numéro de note désigne un instrument et non une hauteur : ses notes ne se transposent pas ; dit dans sa documentation",
  })),
  { ou: "camelot·Graine", quand: { reglage: "Parcours", sauf: ["aleatoire"] }, raison: "la graine ne tire que le parcours aléatoire, et le parcours complet comme les voisins n'ont rien à tirer ; dit dans sa documentation" },
  { ou: "dither·Graine", quand: { reglage: "Dither", valeurs: ["aucun"] }, raison: "la graine ne tire que le bruit de dither, et sans dither rien n'est tiré ; dit dans sa documentation" },
  { ou: "tonal-grille·Durée", quand: { reglage: "Mode", valeurs: ["arpege"] }, raison: "en arpège, chaque note dure une croche, et la durée de l'accord n'a plus rien à régler ; dit dans sa documentation" },
  { ou: "color-looper·Durée note", quand: { reglage: "Mode", valeurs: ["arpege", "roule"] }, raison: "en arpège comme en roulé, les trois notes de l'accord se partagent le pas, et la durée d'une note n'a plus rien à régler ; dit dans sa documentation" },
  { ou: "boite-rythmes·Caisse claire", quand: { reglage: "Patron", valeurs: ["Techno"] }, raison: "le patron Techno n'a pas de caisse claire ; dit dans la documentation du réglage" },
  // LE LOT 3d-2 (2026-11-15) : le reste de la dette, chaque ligne lue dans le code par quatre analyses
  // et sondée, aucune n'étant un défaut de calcul. Les bornes de modulation sont déclarées d'une règle,
  // `conditionsDesBornes` ; ce qui tenait à une entrée pauvre est parti avec `croisement-entrees.ts` et
  // `croisement-bases.ts`.
  ...parMode(["Clarté", "Qualité des accords", "Accords"], ["melodie", "accords"], "la mélodie et les accords ne sonnent qu'en « Mélodie et accords » et en « Accords seuls » : ailleurs, ce réglage n'a ni note ni accord à régler"),
  ...parMode(["Gamme"], ["melodie"], "seule la mélodie prend ses degrés dans la gamme, et elle ne sonne qu'en « Mélodie et accords »"),
  ...parMode(["Percussion"], ["rythme"], "la voix de batterie n'est frappée qu'en « Rythme »"),
  { ou: "cercle-pulsant·Nuance des accords", quand: { une: [{ reglage: "Mode", sauf: ["melodie", "accords"] }, { reglage: "Accords", valeurs: ["aucun"] }] }, raison: "la force de frappe des accords n'a rien à frapper hors de la mélodie et des accords, ni quand « Accords » vaut « Aucun » ; dit dans sa documentation" },
  { ou: "cercle-pulsant·Synthèse", quand: { reglage: "Mode", valeurs: ["pulsation", "rythme"] }, raison: "en « Pulsation », le battement est une sinusoïde calculée par le nœud ; en « Rythme », non mesurable au banc : sans SoundFont chargé, chaque moteur rend la batterie au synthétiseur de percussions, et seul un kit chargé la fait changer ; dit dans sa documentation" },
  { ou: "cercle-pulsant·Échos", quand: { banc: true }, raison: VUE_ANIMEE },
  { ou: "cercle-pulsant·Taille", quand: { banc: true }, raison: VUE_ANIMEE },
  { ou: "correction-hauteur·Tonique", quand: { reglage: "Gamme", valeurs: ["chromatique"] }, raison: CHROMATIQUE },
  { ou: "arbre-rythmique·Tonique", quand: { reglage: "Gamme", valeurs: ["chromatique"] }, raison: CHROMATIQUE },
  { ou: "evolution-melodie·Tonique", quand: { reglage: "Gamme", valeurs: ["chromatique"] }, raison: CHROMATIQUE },
  { ou: "solveur-contraintes·Tonique", quand: { reglage: "Gamme", valeurs: ["chromatique"] }, raison: CHROMATIQUE },
  { ou: "zones-vers-midi·Clé", quand: { reglage: "Gamme", valeurs: ["chromatique"] }, raison: CHROMATIQUE },
  { ou: "motif-eclaircir·Durée d'un temps", quand: { reglage: "Garder les temps", valeurs: ["non"] }, raison: "la durée d'un temps ne sert qu'à reconnaître les événements posés sur un temps, pour les garder ; dit dans sa documentation" },
  { ou: "serie-infinie·Lecture", quand: { reglage: "Gamme", valeurs: ["chromatique"] }, raison: "dans la gamme chromatique, chaque degré vaut un demi-ton, et les deux lectures rendent les mêmes notes ; dit dans sa documentation" },
  { ou: "serie-infinie·Gamme", quand: { reglage: "Lecture", valeurs: ["demi-tons"] }, raison: "en lecture par demi-tons, la suite se lit sans gamme ; dit dans sa documentation" },
  { ou: "harmonie-negative·Tempo", quand: { banc: true }, raison: TEMPO_RECU },
  { ou: "voicings-accords·Tempo", quand: { banc: true }, raison: TEMPO_RECU },
  { ou: "partition-csound·Constante", quand: { tous: ["p4", "p5", "p6", "p7"].map((reglage) => ({ reglage, sauf: ["constante"] })) }, raison: "la valeur n'est écrite que dans un champ qui vaut « Constante », et aucun ne le vaut ; dit dans sa documentation" },
  { ou: "gammes-monde·Tolérance", quand: { reglage: "Gamme", valeurs: ["hijaz"] }, raison: "chaque degré du maqam Hijaz tombe sur un demi-ton tempéré : aucun écart n'est à juger ; dit dans sa documentation" },
  { ou: "analyseur-spectre·Échelle", quand: { banc: true }, raison: VUE_SEULE_ECHELLE },
  { ou: "spectrogramme·Échelle", quand: { banc: true }, raison: VUE_SEULE_ECHELLE },
  { ou: "texture-statistique·Itérations", quand: { reglage: "Corrélations", valeurs: ["non"] }, raison: "sans corrélations à imposer, il n'y a rien à alterner avec les distributions ; dit dans sa documentation" },
  ...["Mesures", "Emplacements", "Profondeur", "Densité", "Silences", "Liaisons"].map((nom) => ({
    ou: `arbre-rythmique·${nom}`, quand: { reglage: "Source", sauf: ["tirage"] },
    raison: "ce réglage ne sert qu'à tirer un arbre, et le catalogue comme le dessin en donnent un tout fait ; dit dans sa documentation",
  })),
  { ou: "cercle-gamme·Octave de fermeture", quand: { reglage: "Gamme", sauf: GAMMES_EN_CENTS }, raison: "une gamme comptée en demi-tons s'arrête sous l'octave, et n'a pas de degré de fermeture à garder ; dit dans sa documentation" },
  { ou: "cercle-gamme·Places", quand: { reglage: "Gamme", valeurs: ["chromatique", ...GAMMES_EN_CENTS] }, raison: "une gamme en cents revient à un degré par place, et les douze degrés de la chromatique occupent déjà les douze places ; dit dans sa documentation" },
  { ou: "granulation-spectrale·Tours", quand: { reglage: "Phase", sauf: ["griffin"] }, raison: "seul Griffin-Lim cherche la phase par allers et retours ; dit dans sa documentation" },
  { ou: "granulation-spectrale·Graine", quand: { tous: [{ reglage: "Extraction", sauf: ["aleatoire"] }, { reglage: "Dispersion", valeurs: ["0"] }] }, raison: "la graine ne tire que l'extraction aléatoire et la dispersion, et sans l'une ni l'autre rien n'est tiré ; dit dans sa documentation" },
  { ou: "transfert-enveloppe·Plancher", quand: { reglage: "Aplatir", valeurs: ["non"] }, raison: "le plancher borne l'aplatissement, qui n'a pas lieu ; dit dans sa documentation" },
  { ou: "transposeur-quantiseur-midi·Quantifier fins", quand: { reglage: "Quantisation", valeurs: ["none"] }, raison: "sans grille, il n'y a rien sur quoi aligner les fins ; dit dans sa documentation" },
  { ou: "voicings-accords·Grave minimum", quand: { reglage: "Conduite des voix", valeurs: ["non"] }, raison: CONDUITE },
  { ou: "voicings-accords·Aigu maximum", quand: { reglage: "Conduite des voix", valeurs: ["non"] }, raison: CONDUITE },
  { ou: "cantor-deplacement·Graine", quand: { tous: [{ reglage: "Où poser", valeurs: ["proche"] }, { reglage: "Part déplacée", valeurs: ["0", "100"] }] }, raison: "à 0 ou à 100 % de part déplacée, chaque tirage dit la même chose, et au plus proche aucun n'est fait pour la place ; dit dans sa documentation" },
  { ou: "evolution-melodie·Poids du geste", quand: { port: "Séquence" }, raison: "le geste à suivre est celui de la séquence reçue, et la passe ne la branche pas, pour éprouver le nœud seul ; dit dans sa documentation" },
  { ou: "evolution-melodie·Poids de l'ampleur", quand: { tous: [{ reglage: "Ampleur", valeurs: ["0"] }, { port: "Séquence" }] }, raison: "à zéro, l'ampleur visée est le saut moyen de la séquence reçue, et sans séquence il n'y a aucun saut à viser ; dit dans sa documentation" },
  { ou: "solveur-contraintes·Budget", quand: { banc: true }, raison: SOLUTION_FACILE },
  { ou: "melodie-sur-accords·Budget", quand: { banc: true }, raison: "non mesurable au banc : la recherche conclut en une dizaine d'affectations par accord, 48 sur les quatre accords d'essai et 351 sur trente-deux, et il en faudrait près de quatre-vingt-dix pour que le plus petit budget offert, 1 000, borne quelque chose ; un problème sans solution se ferme en 202" },
  { ou: "solveur-contraintes·Quand rien ne convient", quand: { banc: true }, raison: SOLUTION_FACILE },
  { ou: "restauration-ecretage·Seuil manuel", quand: { reglage: "Seuil", valeurs: ["auto"] }, raison: "en automatique, le seuil se devine à la longueur des plateaux, et le seuil manuel n'est pas lu ; dit dans sa documentation" },
  ...["Correction maximale", "Bandes par octave", "Taille de la transformée"].map((nom) => ({
    ou: `apparier-reference·${nom}`, quand: { reglage: "Spectre", valeurs: ["non"] },
    raison: "ce réglage ne sert qu'à recopier la réponse en fréquence, qui ne l'est pas ; dit dans sa documentation",
  })),
  { ou: "banque-clavier·Note manuelle", quand: { reglage: "Note d'origine", valeurs: ["auto"] }, raison: "en automatique, la hauteur mesurée remplace la note manuelle, qui ne sert plus que de repli quand rien ne se mesure, et le son d'essai a une hauteur nette ; dit dans sa documentation" },
  { ou: "banque-clavier·Début de boucle", quand: { reglage: "Boucle de maintien", valeurs: ["non"] }, raison: "sans boucle de maintien, il n'y a pas de boucle à placer ; dit dans sa documentation" },
  { ou: "banque-clavier·Longueur de boucle", quand: { reglage: "Boucle de maintien", valeurs: ["non"] }, raison: "sans boucle de maintien, il n'y a pas de boucle à mesurer ; dit dans sa documentation" },
  { ou: "rendu-sequence·Instrument", quand: { reglage: "Synthèse", valeurs: ["fm"] }, raison: "en FM, le rendu est une synthèse locale qui n'a pas de programme, et c'est le défaut de ce nœud ; dit dans sa documentation" },
  { ou: "paradoxe-triton·Pause", quand: { reglage: "Classe de départ", sauf: ["douze"] }, raison: "une classe de départ seule ne joue qu'une paire, et la pause entre deux paires n'a rien à séparer ; dit dans sa documentation" },
  { ou: "musicxml·Quantification", quand: { reglage: "Métrique", valeurs: EN_SEIZIEMES }, raison: "sous une métrique en seizièmes, la grille descend déjà à la double croche, la plus fine des trois quantifications offertes ; dit dans sa documentation" },
  { ou: "midi-vers-abc·Grille", quand: { reglage: "Métrique", valeurs: EN_SEIZIEMES }, raison: "sous une métrique en seizièmes, le temps est la double croche, et une grille de croches y est affinée en doubles : les deux grilles que la passe éprouve, croches et doubles, y rendent celle que l'automatique choisit sur le MIDI d'essai ; une grille plus fine agit, et sa documentation le dit" },
  { ou: "spatialiseur·Élévation", quand: { reglage: "Disposition", sauf: ["7.1.4", "foa", "hoa2", "hoa3"] }, raison: "une disposition sans haut-parleurs en hauteur ramène la source à l'horizon ; dit dans sa documentation" },
  { ou: "partition-aleatoire-csound·Libre min", quand: { reglage: "Champ libre", valeurs: ["aucun"] }, raison: CHAMP_LIBRE },
  { ou: "partition-aleatoire-csound·Libre max", quand: { reglage: "Champ libre", valeurs: ["aucun"] }, raison: CHAMP_LIBRE },
  { ou: "recaler-niveau·Plafond", quand: { reglage: "Plafonner la crête", valeurs: ["non"] }, raison: "sans plafonnement, la crête n'est pas bornée ; dit dans sa documentation" },
  { ou: "boite-groove·Extension", quand: { tous: [{ reglage: "Gamme", valeurs: ["locrien", "chromatique", "alteree", "ton-entier", "diminuee-ton-demi"] }, { reglage: "Genre", sauf: ["jazz", "blues", "ambient"] }] }, raison: "hors du jazz, du blues et de l'ambient, la septième ne va qu'à la dominante, reconnue à sa quinte juste au-dessus de la tonique, et la progression ne rencontre aucune quinte juste dans ces gammes ; dit dans sa documentation" },
  { ou: "l-systeme·Instrument", quand: { banc: true }, raison: SANS_SOUNDFONT },
  { ou: "temperament·Instrument", quand: { banc: true }, raison: SANS_SOUNDFONT },
  { ou: "spectrogramme-fractal·Format", quand: { banc: true }, raison: SANS_DOM },
  { ou: "boucle-creneau-fin·Plier", quand: { banc: true }, raison: HORS_BOUCLE },
  { ou: "boucle-creneau-fin·Une voix par créneau", quand: { banc: true }, raison: HORS_BOUCLE },
  // LA VOIX SUR L'ACCORD (2026-11-28) : le MIDI d'essai est une mélodie, dont chaque note se lit comme
  // un accord d'une seule note.
  { ou: "voix-sur-accord·Position fondamentale", quand: { banc: true }, raison: SANS_HARMONIE },
  // LE LOT 3e (2026-11-15) : tout réglage à choix gouverne, et ce qu'il fait voir est dans son module.
  ...INERTIES_DES_CHOIX,
];

/** Les coïncidences légitimes, chacune avec sa raison. */
export const COINCIDENCES_DECLAREES: CoincidenceInscrite[] = [
  { ou: "verifier-choral·Gamme", valeurs: ["majeur", "mixolydien"], raison: "le choral d'essai, le 175 de Bach lu en do, n'a aucun si bémol et aucun temps sur le iii : le mixolydien, dont la dominante prend la sensible, n'y a rien à séparer du majeur, et le juge rend le même rapport ; tenu par audio/choral-verifier.test.ts, dont la cadence I ♭VII IV I les sépare" },
  { ou: "harmoniser-choral·Pas", valeurs: ["noire", "croche"], raison: "au banc, un modèle est branché sur « Modèle », et sa grille, la noire, remplace celle de « Pas » ; sans modèle, « Pas » est tenu par audio/choral-harmoniser.test.ts" },
  { ou: "corpus-fabriquer-debut·Graines", valeurs: ["Une par tour", "Identiques"], raison: "les graines du corps sont réglées par le pilote, pour les nœuds rejoués à chaque passe, et non par ce nœud, que le banc lance seul ; tenu par core/graines-de-passe.test.ts et l'exemple un-corpus-fabrique.json" },
  { ou: "corpus-fabriquer-fin·Format", valeurs: ["midi", "musicxml"], raison: "sans dossier ni application de bureau, le banc n'écrit aucun fichier, et les deux formats rendent le même corpus ; tenu par plugins/fabriquer-corpus.test.ts" },
  { ou: "corpus-fabriquer-fin·Si le fichier existe", valeurs: ["erreur", "ecraser"], raison: "le réglage n'agit que sur un fichier écrit, ce que le banc de node ne fait pas ; tenu par plugins/fabriquer-corpus.test.ts" },
  { ou: "beat-repeat·Intervalle", valeurs: ["1/16", "1/16t", "1/32"], raison: "sous la taille par défaut, 1/16, un intervalle qui n'est pas plus long qu'elle rend l'entrée telle quelle" },
  { ou: "beat-repeat·Taille", valeurs: ["1/2", "1/4.", "1/4"], raison: "sous l'intervalle par défaut, 1/4, une taille qui n'est pas plus courte que lui rend l'entrée telle quelle" },
  { ou: "generateur-fractal·Gamme", valeurs: ["majeur", "bebop-dominant"], raison: "le motif par défaut, « Triade M », n'atteint jamais la septième, seul degré où le majeur et la bebop dominante diffèrent" },
  { ou: "serie-infinie·Gamme", valeurs: ["majeur", "mineur", "pentatonique-majeure", "chromatique", "dorien", "phrygien", "lydien", "mixolydien", "locrien", "mineur-harmonique", "mineur-melodique", "pentatonique-mineure", "blues", "alteree", "lydien-dominant", "phrygien-dominant", "bebop-dominant", "ton-entier", "diminuee-ton-demi", "diminuee-demi-ton", "augmentee", "double-seconde-augmentee", "hongroise-mineure", "hirajoshi", "in-sen"], raison: "en lecture par demi-tons, le défaut, la gamme ne sert pas" },
  { ou: "reservoir-musical·Gamme", valeurs: ["majeur", "lydien", "mixolydien", "lydien-dominant"], raison: RESERVOIR },
  { ou: "reservoir-musical·Gamme", valeurs: ["mineur", "mineur-harmonique", "hongroise-mineure"], raison: RESERVOIR },
  { ou: "reservoir-musical·Gamme", valeurs: ["dorien", "mineur-melodique"], raison: RESERVOIR },
  { ou: "reservoir-musical·Gamme", valeurs: ["phrygien", "locrien", "alteree"], raison: RESERVOIR },
  { ou: "reservoir-musical·Gamme", valeurs: ["phrygien-dominant", "double-seconde-augmentee"], raison: RESERVOIR },
  { ou: "multi-reservoirs·Gamme", valeurs: ["mineur", "dorien"], raison: RESERVOIR },
  { ou: "multi-reservoirs·Gamme", valeurs: ["mineur-harmonique", "mineur-melodique"], raison: RESERVOIR },
  { ou: "solveur-contraintes·Gamme", valeurs: ["majeur", "mixolydien"], raison: UNE_SUITE },
  { ou: "solveur-contraintes·Gamme", valeurs: ["mineur", "mineur-harmonique", "dorien", "mineur-melodique"], raison: UNE_SUITE },
  { ou: "solveur-contraintes·Gamme", valeurs: ["lydien", "lydien-dominant"], raison: UNE_SUITE },
  { ou: "solveur-contraintes·Gamme", valeurs: ["phrygien-dominant", "double-seconde-augmentee"], raison: UNE_SUITE },
  { ou: "analyseur-spectre·Fenêtre", valeurs: ["256", "512", "1024", "2048", "4096", "8192"], raison: VUE_SEULE },
  { ou: "spectrogramme·Fenêtre", valeurs: ["256", "512", "1024", "2048", "4096", "8192"], raison: VUE_SEULE },
  ...ENTREES_DU_MELANGEUR.map((n) => ({
    ou: `melangeur-midi·Canal ${n}`, valeurs: ["auto", "garder"],
    raison: "l'entrée d'essai occupe deux canaux, et « Automatique » garde les canaux d'une telle entrée, comme « Garder » ; une entrée d'un seul canal les sépare, ce que tient audio/melange-midi.test.ts",
  })),
  { ou: "arpegiateur-midi·Direction", valeurs: ["montant", "ordre-de-jeu"], raison: "le MIDI d'essai joue les notes de chaque accord du grave à l'aigu, et l'ordre de jeu y est l'ordre montant ; un accord joué sol, do, mi les sépare" },
  // RELEVÉES À LA NAISSANCE DU NŒUD, le 2026-11-22, sur le choral 175 de Bach, en do majeur.
  // LE LOT 3d-2 (2026-11-15) : chacune voulue, ou non mesurable au banc pour la raison de l'inertie
  // déclarée sur le même réglage.
  { ou: "cercle-pulsant·Gamme", valeurs: ["roue", "majeur", "mineur", "dorien", "phrygien", "lydien", "mixolydien", "locrien", "mineur-harmonique", "mineur-melodique", "pentatonique-majeure", "pentatonique-mineure", "blues", "alteree", "lydien-dominant", "phrygien-dominant", "bebop-dominant", "ton-entier", "diminuee-ton-demi", "diminuee-demi-ton", "augmentee", "double-seconde-augmentee", "hongroise-mineure", "hirajoshi", "in-sen", "chromatique"], raison: "en « Pulsation », le mode par défaut, la mélodie ne sonne pas, et la gamme n'a aucun degré à donner" },
  { ou: "cercle-pulsant·Qualité des accords", valeurs: ["roue", "maj", "m", "dim", "aug", "sus2", "sus4", "7", "maj7", "m7", "m7b5", "dim7", "mmaj7", "6", "m6", "7sus4", "9", "maj9", "m9", "add9", "11", "maj9s11", "m11", "13", "maj13", "m13", "7s9", "7b9", "7b5", "7s5", "7b5b9", "7s5b9", "7b5s9", "7s5s9"], raison: "en « Pulsation », le mode par défaut, aucun accord ne sonne, et leur qualité n'a rien à colorer" },
  { ou: "cercle-pulsant·Percussion", valeurs: ["36", "38", "39", "42", "46", "49", "41", "45", "47", "48", "50", "56", "75"], raison: "hors du mode « Rythme », la voix de batterie n'est pas frappée" },
  { ou: "cercle-pulsant·Échos", valeurs: OUI_NON.ids, raison: VUE_ANIMEE },
  { ou: "correction-hauteur·Tonique", valeurs: ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "G#", "A", "Bb", "B"], raison: "sous la gamme par défaut, chromatique, qui contient toutes les notes, la tonique ne déplace aucun degré" },
  { ou: "zones-vers-midi·Clé", valeurs: ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "G#", "A", "Bb", "B"], raison: "sous la gamme par défaut, chromatique, toutes les notes sont permises et la clé ne déplace rien" },
  { ou: "cercle-gamme·Gamme", valeurs: ["phrygien-dominant", "hijaz"], raison: "le maqam Hijaz s'écrit en cents sur les demi-tons tempérés du phrygien dominant, octave comprise : sans l'octave de fermeture, et un degré par place, les deux cercles sont les mêmes ; l'octave de fermeture ou les douze places les séparent" },
  { ou: "cercle-gamme·Octave de fermeture", valeurs: OUI_NON.ids, raison: "la gamme par défaut, majeure, est comptée en demi-tons et s'arrête sous l'octave : il n'y a pas de degré de fermeture à garder" },
  { ou: "spectrogramme-fractal·Format", valeurs: ["png", "jpeg"], raison: SANS_DOM },
  { ou: "arbre-rythmique·Gamme", valeurs: ["mineur", "dorien"], raison: DOUZE_TIRAGES },
  { ou: "arbre-rythmique·Gamme", valeurs: ["mineur-harmonique", "mineur-melodique"], raison: DOUZE_TIRAGES },
  { ou: "arbre-rythmique·Tonique", valeurs: ["Eb", "Bb"], raison: DOUZE_TIRAGES },
  { ou: "solveur-contraintes·Tonique", valeurs: ["C", "F"], raison: TONIQUES_VOISINES },
  { ou: "solveur-contraintes·Tonique", valeurs: ["Eb", "Bb"], raison: TONIQUES_VOISINES },
  { ou: "generateur-accords·Gamme", valeurs: ["mixolydien", "bebop-dominant"], raison: "un accord laisse la note de passage de la bebop dominante, sa septième majeure ; sans elle, c'est le mixolydien, et les accords sont les siens ; dit dans la documentation de la gamme" },
  { ou: "sequenceur-accords·Gamme", valeurs: ["mixolydien", "bebop-dominant"], raison: "un accord laisse la note de passage de la bebop dominante, sa septième majeure ; sans elle, c'est le mixolydien, et les accords sont les siens ; dit dans la documentation de la gamme" },
  { ou: "boucle-creneau-fin·Plier", valeurs: OUI_NON.ids, raison: HORS_BOUCLE },
  { ou: "boucle-creneau-fin·Une voix par créneau", valeurs: OUI_NON.ids, raison: HORS_BOUCLE },
  { ou: "midi-vers-abc·Métrique", valeurs: ["fichier", "4/4"], raison: "le MIDI d'essai est écrit par `notesVersFichierMidi`, qui inscrit toujours 4/4 : « Du fichier » y lit 4/4 ; dit dans la documentation du réglage" },
  { ou: "accords-vers-notation·Gamme", valeurs: GAMMES_DES_ROMAINS.map((g) => g.id), raison: "sous la source par défaut, « Accords détectés », la gamme ne sert pas : elle ne lit que les chiffres romains d'une progression ; dit dans sa documentation" },
  { ou: "voix-sur-accord·Reprise", valeurs: ["morceau", "section"], raison: "le MIDI d'essai n'a aucun marqueur de section : le morceau n'en a qu'une, et la reprise à chaque section est la reprise à la fin du morceau ; tenu par plugins/voix-sur-accord.test.ts sur une harmonie de « Harmonie par motifs »" },
  ...COINCIDENCES_DES_CHOIX,
];

/** La dette des inerties relevées au lot 1, à trancher. */
export const INERTIES_A_EXAMINER: readonly InertieInscrite[] = dette.inerties as InertieInscrite[];

/** La dette des coïncidences relevées au lot 1, à trancher. */
export const COINCIDENCES_A_EXAMINER: readonly CoincidenceInscrite[] = dette.coincidences;
