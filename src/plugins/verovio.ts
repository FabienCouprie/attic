// plugins/verovio.ts — Nœud « Partition gravée », par Verovio.
//
// Verovio est le moteur de gravure du Rism Digital Center, compilé en WebAssembly : il lit une
// notation en texte — ABC, MusicXML, MEI ou Humdrum — et rend une page en SVG, avec les règles d'un
// éditeur de musique. Rien à installer, rien à télécharger : le module de 7 Mo est chargé au
// premier rendu, puis gardé ; celui qui lit aussi le Humdrum, de 14 Mo, au premier Humdrum.
//
// La lecture de la notation, ses refus et la gravure de chaque air sont communs aux graveurs par
// Verovio, dans `verovio-lecture.ts`. Le moteur se charge par `verovio-outil.ts`, qui dit pourquoi un
// module neuf est pris à chaque gravure et pourquoi le Humdrum a le sien.
//
// La reconnaissance du format et les options de gravure sont dans `audio/verovio.ts`, pur et testé.

import { fiche } from "./fiche";
import type { FicheAudio } from "../audio/types-domaine";
import { avecDoc } from "./notices";
import { entreeVerovio, optionsGravure } from "../audio/verovio";
import { choixOuiNon } from "../core/oui-non";
import {
  graverAirs, lireNotation, mentionAir, mentionPage, nomDuFormat, outil, refusDuGraveur, texteAGraver,
} from "./verovio-lecture";

const EXEMPLE = "X:1\nT:Gamme\nM:4/4\nL:1/4\nK:C\nC D E F | G A B c |";

export const fiches: FicheAudio[] = ([
  fiche({
    id: "partition-verovio", nom: "Partition gravée", nomEn: "Engraved Score",
    univers: "Visualisation", famille: "Notation",
    resume: "Grave une notation ABC, MusicXML, MEI ou Humdrum en partition SVG, aux règles d'un éditeur de musique.",
    resumeEn: "Engraves an ABC, MusicXML, MEI or Humdrum notation into an SVG score, to music-publishing rules.",
    notice: "Ce composant grave une partition à partir d'un texte de notation, et rend une page en SVG.\n\nQuatre notations sont lues : ABC, reconnaissable à ses champs d'en-tête (X:, M:, K:) ; MusicXML, le format d'échange des éditeurs de partition ; MEI, son équivalent savant ; et Humdrum, celui des corpus d'analyse. Le format est reconnu à la forme du texte ; le réglage permet de l'imposer quand la reconnaissance se trompe. Un document XML qui n'est ni une partition MusicXML ni un document MEI est refusé, et le message nomme son élément racine.\n\nUne partition ABC est d'abord lue note à note. Une durée nulle, un accord jamais refermé, une liaison entre deux hauteurs ou un n-olet inachevé la font refuser, et le message nomme chaque faute, sa ligne et le fragment.\n\nCinq tournures ABC ne se gravent pas, et une partition qui en porte une est refusée, le message nommant chacune et sa ligne :\n- plusieurs voix (V:) ;\n- une fin alternative (|1, [2, :|2) ;\n- un changement de tonalité en cours de morceau, [K:G] ou une ligne K: ; un changement de clé seule, [K:clef=bass], se grave ;\n- une liaison dans un accord, [C-E]2 ou [CE]2- ;\n- un n-olet dont le second nombre n'est pas celui que l'usage lit sous son chiffre seul. Ainsi (5, cinq notes dans le temps de deux en mesure simple, est refusé, et (5:4:5, cinq pour quatre, se grave.\n\nUn tempo ABC, Q: en tête ou [Q:] en cours de morceau, se grave au-dessus de sa mesure : « ♩ = 60 », précédé du nom du mouvement s'il en a un, « Allegro ♩ = 120 ».\n\nLa gravure suit les règles d'un éditeur : espacement proportionnel à la durée, ligatures, hampes et altérations placées, portées alignées. La largeur de page et l'échelle décident de ce qui tient sur une ligne ; « Déroulé » met toute la pièce sur un seul système, aussi long qu'il faut, pour la lire d'un trait. Le bas de page vide est coupé : une partition de trois mesures ne rend pas une page entière de blanc.\n\nUne pièce longue tient sur plusieurs pages : le réglage « Page » dit laquelle rendre, et le message indique combien il y en a.\n\nUn texte ABC qui porte plusieurs airs, un par champ X:, les grave tous, chacun sous son titre et à partir d'une page neuve. « Page » parcourt alors les pages de tous les airs, et le message dit quel air est rendu.\n\nLa sortie « SVG » rend la partition gravée en texte, et la sortie « Fichier SVG » la même partition en fichier. La partition s'affiche aussi dans le composant.",
    noticeEn: "This node engraves a score from a notation text, and returns one page as SVG.\n\nFour notations are read: ABC, recognisable by its header fields (X:, M:, K:); MusicXML, the exchange format of score editors; MEI, its scholarly counterpart; and Humdrum, that of analysis corpora. The format is recognised from the shape of the text; the setting lets you impose it when recognition gets it wrong. An XML document that is neither a MusicXML score nor an MEI document is refused, and the message names its root element.\n\nAn ABC score is first read note by note. A zero duration, a chord never closed, a tie between two pitches or an unfinished tuplet gets it refused, and the message names each fault, its line and the fragment.\n\nFive ABC constructs are not engraved, and a score that carries one is refused, the message naming each one and its line:\n- several voices (V:);\n- an alternative ending (|1, [2, :|2);\n- a key change within the tune, [K:G] or a K: line; a clef change alone, [K:clef=bass], is engraved;\n- a tie inside a chord, [C-E]2 or [CE]2-;\n- a tuplet whose second number is not the one usage reads under its number alone. So (5, five notes in the time of two in simple time, is refused, and (5:4:5, five in the time of four, is engraved.\n\nAn ABC tempo, Q: in the header or [Q:] within the tune, is engraved above its bar: « ♩ = 60 », preceded by the name of the movement if it has one, « Allegro ♩ = 120 ».\n\nThe engraving follows publishing rules: spacing proportional to duration, beams, stems and accidentals placed, staves aligned. Page width and scale decide what fits on a line; « Unrolled » puts the whole piece on a single system, as long as needed, to read it in one go. The empty bottom of the page is cut off: a three-bar score does not return a full page of white.\n\nA long piece spans several pages: the « Page » setting says which one to render, and the message gives their number.\n\nAn ABC text carrying several tunes, one per X: field, engraves them all, each under its title and starting on a new page. « Page » then goes through the pages of all the tunes, and the message says which tune is rendered.\n\nThe « SVG » output returns the engraved score as text, and the « SVG file » output returns the same score as a file. The score is also shown in the node.",
    entrees: [{ nom: "Notation", nomEn: "Notation", type: "texte", sousType: "notation", requis: false }],
    // DEUX SORTIES POUR UN MÊME SVG, ET LE MÊME NOM POUR LES DEUX.
    //
    // POURQUOI LA SECONDE. « Export SVG » écrit un FICHIER, et son entrée est donc de type image ;
    // les graveurs ne rendaient qu'une chaîne. Graver une partition et en sauvegarder le SVG était
    // impossible dans un seul graphe : l'application refusait le câble, « connexion illégale :
    // texte → image ». Un seul graveur savait alors alimenter l'export, celui dont le SVG était déjà
    // un fichier — c'est son précédent que l'on suit ici.
    //
    // ET DEUX NOMS, PARCE QUE LE DÉPÔT L'EXIGE. Le contrat de réglages refuse l'homonymie de ports
    // sur une même fiche : l'inspecteur annonce un réglage modulable en NOMMANT le port où la
    // courbe doit aller, et avec deux ports homonymes la phrase ne désigne plus rien. Les trois
    // graveurs de `vexflow.ts` portent la même paire, et le commentaire y est au complet.
    //
    // L'AJOUT EST EN FIN DE LISTE, et il le faut : un graphe enregistré désigne un port par son
    // INDICE, et insérer avant aurait décalé la sortie texte de tous les projets existants.
    sorties: [
      { nom: "SVG", nomEn: "SVG", type: "texte" },
      { nom: "Fichier SVG", nomEn: "SVG file", type: "image" },
    ],
    parametres: [
      { nom: "Notation", nomEn: "Notation", type: "texte", defaut: EXEMPLE, defautEn: EXEMPLE,
        doc: "La notation à graver, si aucun texte n'est branché sur l'entrée.",
        docEn: "The notation to engrave, when no text is connected to the input." },
      { nom: "Format", nomEn: "Format", type: "choix",
        options: ["Auto", "ABC", "MusicXML", "MEI", "Humdrum"], optionsEn: ["Auto", "ABC", "MusicXML", "MEI", "Humdrum"],
        optionIds: ["auto", "abc", "musicxml", "mei", "humdrum"], defaut: "Auto", defautEn: "Auto",
        doc: "« Auto » reconnaît le format à la forme du texte. Les autres l'imposent.",
        docEn: "« Auto » recognises the format from the shape of the text. The others impose it." },
      { nom: "Largeur", nomEn: "Width", type: "curseur", plage: [600, 6000], pas: 50, defaut: 1800,
        doc: "Largeur de la page, en dixièmes de millimètre : 2100 vaut une feuille A4. Plus large, plus de mesures par ligne. Sans effet en mode déroulé.",
        docEn: "Page width, in tenths of a millimetre: 2100 is an A4 sheet. Wider, more bars per line. No effect in unrolled mode." },
      { nom: "Échelle", nomEn: "Scale", type: "curseur", plage: [10, 200], pas: 5, defaut: 40, unite: "%",
        doc: "Taille de la gravure. Petite, la partition tient en entier dans le composant ; grande, elle se lit.",
        docEn: "Size of the engraving. Small, the score fits whole in the node; large, it can be read." },
      { nom: "Déroulé", nomEn: "Unrolled", type: "choix", ...choixOuiNon("non"), defaut: "Non", defautEn: "No",
        doc: "Toute la pièce sur un seul système, aussi long qu'il faut, au lieu de pages.",
        docEn: "The whole piece on a single system, as long as needed, instead of pages." },
      { nom: "Page", nomEn: "Page", type: "nombre", plage: [1, 200], pas: 1, defaut: 1,
        doc: "La page à rendre. Au-delà de la dernière, c'est la dernière qui est rendue.",
        docEn: "The page to render. Beyond the last one, the last one is rendered." },
    ],
    async executer(ctx) {
      const entree = ctx.entree(0);
      const texte = (typeof entree === "string" && entree.trim()) || ctx.paramTexte("Notation", EXEMPLE);
      // La lecture, ses refus et ses airs sont communs aux graveurs par Verovio (`verovio-lecture.ts`).
      // Chaque air commence sa page, et « Page » parcourt les pages de tous.
      const lecture = lireNotation(texte, String(ctx.paramTexte("Format", "auto")));
      if ("refus" in lecture) return { valeurs: [null, null], erreur: true, message: lecture.refus };
      const options = {
        ...optionsGravure({
          largeur: ctx.paramNombre("Largeur", 1800),
          echelle: ctx.paramNombre("Échelle", 40),
          marge: 50,
          deroule: String(ctx.paramTexte("Déroulé", "non")) === "oui",
        }),
        inputFrom: entreeVerovio(lecture.format),
        ...(lecture.airs.length > 1 ? { header: "encoded" } : {}),
      };
      const rendu = await graverAirs(lecture, ctx.paramNombre("Page", 1), async (i) => {
        const tk = await outil(lecture.format === "humdrum");
        tk.setOptions(options);
        if (tk.loadData(texteAGraver(lecture, i))) return { tk };
        tk.destroy?.();
        return { refus: refusDuGraveur(lecture, i) };
      });
      if ("refus" in rendu) return { valeurs: [null, null], erreur: true, message: rendu.refus };
      const message = `${nomDuFormat(lecture.format)}${mentionAir(lecture, rendu.air)} · ${mentionPage(rendu)}`;
      // Le SVG part sur la SORTIE, et la vue l'y lit : le message reste une ligne lisible sur le
      // nœud, le format reconnu et la page rendue, au lieu d'être un document entier.
      return { valeurs: [rendu.svg, new File([rendu.svg], "gravure.svg", { type: "image/svg+xml" })], message };
    },
  }),
] as FicheAudio[]).map(avecDoc);
