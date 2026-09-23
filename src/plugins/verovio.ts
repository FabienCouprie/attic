// plugins/verovio.ts — Nœud « Partition gravée », par Verovio.
//
// Verovio est le moteur de gravure du Rism Digital Center, compilé en WebAssembly : il lit une
// notation en texte — ABC, MusicXML, MEI ou Humdrum — et rend une page en SVG, avec les règles d'un
// éditeur de musique. Rien à installer, rien à télécharger : le module de 7 Mo est chargé au
// premier rendu, puis gardé.
//
// POURQUOI UN IMPORT DYNAMIQUE. Ces 7 Mo n'ont pas à peser sur le démarrage de l'application, ni
// sur les graphes qui ne gravent rien : `import()` en fait un morceau à part, chargé le jour où ce
// nœud s'exécute. Le module est ensuite gardé pour les exécutions suivantes.
//
// La reconnaissance du format et les options de gravure sont dans `audio/verovio.ts`, pur et testé.

import type { FicheAudio } from "../audio/types-domaine";
import { langueCourante } from "../i18n";
import { avecDoc } from "./notices";
import { detecterFormat, entreeVerovio, optionsGravure, pageDemandee, type FormatNotation } from "../audio/verovio";

const en = () => langueCourante() === "en";

const EXEMPLE = "X:1\nT:Gamme\nM:4/4\nL:1/4\nK:C\nC D E F | G A B c |";

let boite: Promise<any> | null = null;

/** Le moteur, chargé une fois pour toutes. */
async function outil(): Promise<any> {
  if (!boite) {
    boite = (async () => {
      const [creerModule, { VerovioToolkit }] = await Promise.all([
        import("verovio/wasm").then((m: any) => m.default ?? m),
        import("verovio/esm") as Promise<any>,
      ]);
      const module = await creerModule();
      return new VerovioToolkit(module);
    })().catch((e) => { boite = null; throw e; });
  }
  return boite;
}

export const fiches: FicheAudio[] = ([
  {
    id: "partition-verovio", nom: "Partition gravée", nomEn: "Engraved Score",
    univers: "Visualisation", famille: "Notation",
    resume: "Grave une notation ABC, MusicXML, MEI ou Humdrum en partition SVG, aux règles d'un éditeur de musique.",
    resumeEn: "Engraves an ABC, MusicXML, MEI or Humdrum notation into an SVG score, to music-publishing rules.",
    notice: "Ce composant grave une partition à partir d'un texte de notation, et rend une page en SVG.\n\nQuatre notations sont lues : ABC, reconnaissable à ses champs d'en-tête (X:, M:, K:) ; MusicXML, le format d'échange des éditeurs de partition ; MEI, son équivalent savant ; et Humdrum, celui des corpus d'analyse. Le format est reconnu à la forme du texte ; le réglage permet de l'imposer quand la reconnaissance se trompe.\n\nLa gravure suit les règles d'un éditeur : espacement proportionnel à la durée, ligatures, hampes et altérations placées, portées alignées. La largeur de page et l'échelle décident de ce qui tient sur une ligne ; « Déroulé » met toute la pièce sur un seul système, aussi long qu'il faut, pour la lire d'un trait. Le bas de page vide est coupé : une partition de trois mesures ne rend pas une page entière de blanc.\n\nUne pièce longue tient sur plusieurs pages : le réglage « Page » dit laquelle rendre, et le message indique combien il y en a. Le SVG part sur la sortie et s'affiche dans le composant.",
    noticeEn: "This node engraves a score from a notation text, and returns one page as SVG.\n\nFour notations are read: ABC, recognisable by its header fields (X:, M:, K:); MusicXML, the exchange format of score editors; MEI, its scholarly counterpart; and Humdrum, that of analysis corpora. The format is recognised from the shape of the text; the setting lets you impose it when recognition gets it wrong.\n\nThe engraving follows publishing rules: spacing proportional to duration, beams, stems and accidentals placed, staves aligned. Page width and scale decide what fits on a line; « Unrolled » puts the whole piece on a single system, as long as needed, to read it in one go. The empty bottom of the page is cut off: a three-bar score does not return a full page of white.\n\nA long piece spans several pages: the « Page » setting says which one to render, and the message gives their number. The SVG goes out on the output and is shown in the node.",
    entrees: [{ nom: "Notation", nomEn: "Notation", type: "texte", requis: false }],
    sorties: [{ nom: "SVG", nomEn: "SVG", type: "texte" }],
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
      { nom: "Déroulé", nomEn: "Unrolled", type: "choix", options: ["Non", "Oui"], optionsEn: ["No", "Yes"],
        optionIds: ["non", "oui"], defaut: "Non", defautEn: "No",
        doc: "Toute la pièce sur un seul système, aussi long qu'il faut, au lieu de pages.",
        docEn: "The whole piece on a single system, as long as needed, instead of pages." },
      { nom: "Page", nomEn: "Page", type: "nombre", plage: [1, 200], pas: 1, defaut: 1,
        doc: "La page à rendre. Au-delà de la dernière, c'est la dernière qui est rendue.",
        docEn: "The page to render. Beyond the last one, the last one is rendered." },
    ],
    async executer(ctx: any) {
      const entree = ctx.entree(0);
      const texte = (typeof entree === "string" && entree.trim()) || ctx.paramTexte("Notation", EXEMPLE);
      const impose = String(ctx.paramTexte("Format", "auto"));
      const format: FormatNotation | null = impose === "auto" ? detecterFormat(texte) : (impose as FormatNotation);
      if (!format) {
        return { valeurs: [null], erreur: true, message: en()
          ? "Notation not recognised: expected ABC (X:, K:), MusicXML, MEI or Humdrum."
          : "Notation non reconnue : attendu ABC (X:, K:), MusicXML, MEI ou Humdrum." };
      }
      try {
        const tk = await outil();
        tk.setOptions({
          ...optionsGravure({
            largeur: ctx.paramNombre("Largeur", 1800),
            echelle: ctx.paramNombre("Échelle", 40),
            marge: 50,
            deroule: String(ctx.paramTexte("Déroulé", "non")) === "oui",
          }),
          inputFrom: entreeVerovio(format),
        });
        if (!tk.loadData(texte)) {
          return { valeurs: [null], erreur: true, message: en()
            ? `${format.toUpperCase()} refused by the engraver: check the notation.`
            : `${format.toUpperCase()} refusé par le graveur : vérifiez la notation.` };
        }
        const pages = tk.getPageCount();
        const page = pageDemandee(ctx.paramNombre("Page", 1), pages);
        const svg = tk.renderToSVG(page);
        if (typeof svg !== "string" || !svg.includes("<svg")) {
          return { valeurs: [null], erreur: true, message: en() ? "Empty engraving." : "Gravure vide." };
        }
        const nom = format === "musicxml" ? "MusicXML" : format.toUpperCase();
        const message = en()
          ? `${nom} · page ${page}/${pages}`
          : `${nom} · page ${page} sur ${pages}`;
        // Le SVG part sur la SORTIE, et la vue l'y lit : le message reste une ligne lisible sur le
        // nœud — le format reconnu et la page rendue — au lieu d'être un document entier.
        return { valeurs: [svg], message };
      } catch (e: any) {
        return { valeurs: [null], erreur: true, message: e?.message ?? String(e) };
      }
    },
  },
] as FicheAudio[]).map(avecDoc);
