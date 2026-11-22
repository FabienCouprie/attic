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

import { fiche } from "./fiche";
import type { FicheAudio } from "../audio/types-domaine";
import { langueCourante, traduire } from "../i18n";
import { avecDoc } from "./notices";
import { detecterFormat, entreeVerovio, optionsGravure, pageDemandee, racineXml, type FormatNotation } from "../audio/verovio";
import { decouperMorceaux, lireMorceau } from "../audio/abc";
import { refusAbc } from "../audio/abc-fautes";
import { abcPourGravure, refusTournures } from "../audio/abc-gravure";
import { choixOuiNon } from "../core/oui-non";

const en = () => langueCourante() === "en";

const EXEMPLE = "X:1\nT:Gamme\nM:4/4\nL:1/4\nK:C\nC D E F | G A B c |";

let boite: Promise<{ creerModule: () => Promise<any>; VerovioToolkit: new (m: any) => any }> | null = null;

/**
 * Un moteur neuf pour chaque gravure ; seuls les deux imports se gardent.
 *
 * UN MODULE NEUF, ET NON UN TOOLKIT GARDÉ, revue des notations en texte, décision de Fabien du
 * 2026-11-22. Verovio garde l'armure d'une partition ABC à la suivante, dans son module WebAssembly, en
 * 6.3.0 comme en 6.4.1 : le moteur se chargeait une fois pour toutes, et après un air en do bémol,
 * l'air en do se gravait avec huit altérations, une par note. Ni un toolkit neuf sur le même module, ni
 * `resetOptions`, ni un MEI chargé entre deux airs ne réparaient la fuite. Un module coûte 103 ms.
 */
async function outil(): Promise<any> {
  if (!boite) {
    boite = (async () => {
      const [creerModule, { VerovioToolkit }] = await Promise.all([
        import("verovio/wasm").then((m: any) => m.default ?? m),
        import("verovio/esm") as Promise<any>,
      ]);
      return { creerModule, VerovioToolkit };
    })().catch((e) => { boite = null; throw e; });
  }
  const { creerModule, VerovioToolkit } = await boite;
  return new VerovioToolkit(await creerModule());
}

export const fiches: FicheAudio[] = ([
  fiche({
    id: "partition-verovio", nom: "Partition gravée", nomEn: "Engraved Score",
    univers: "Visualisation", famille: "Notation",
    resume: "Grave une notation ABC, MusicXML, MEI ou Humdrum en partition SVG, aux règles d'un éditeur de musique.",
    resumeEn: "Engraves an ABC, MusicXML, MEI or Humdrum notation into an SVG score, to music-publishing rules.",
    notice: "Ce composant grave une partition à partir d'un texte de notation, et rend une page en SVG.\n\nQuatre notations sont lues : ABC, reconnaissable à ses champs d'en-tête (X:, M:, K:) ; MusicXML, le format d'échange des éditeurs de partition ; MEI, son équivalent savant ; et Humdrum, celui des corpus d'analyse. Le format est reconnu à la forme du texte ; le réglage permet de l'imposer quand la reconnaissance se trompe. Un document XML qui n'est ni une partition MusicXML ni un document MEI est refusé, et le message nomme son élément racine.\n\nUne partition ABC est d'abord lue note à note. Une durée nulle, un accord jamais refermé, une liaison entre deux hauteurs ou un n-olet inachevé la font refuser, et le message nomme chaque faute, sa ligne et le fragment.\n\nCinq tournures ABC ne se gravent pas, et une partition qui en porte une est refusée, le message nommant chacune et sa ligne :\n- plusieurs voix (V:) ;\n- une fin alternative (|1, [2, :|2) ;\n- un changement de tonalité en cours de morceau, [K:G] ou une ligne K: ; un changement de clé seule, [K:clef=bass], se grave ;\n- une liaison dans un accord, [C-E]2 ou [CE]2- ;\n- un n-olet dont le second nombre n'est pas celui que l'usage lit sous son chiffre seul. Ainsi (5, cinq notes dans le temps de deux en mesure simple, est refusé, et (5:4:5, cinq pour quatre, se grave.\n\nUn tempo ABC, Q: en tête ou [Q:] en cours de morceau, se grave au-dessus de sa mesure : « ♩ = 60 », précédé du nom du mouvement s'il en a un, « Allegro ♩ = 120 ».\n\nLa gravure suit les règles d'un éditeur : espacement proportionnel à la durée, ligatures, hampes et altérations placées, portées alignées. La largeur de page et l'échelle décident de ce qui tient sur une ligne ; « Déroulé » met toute la pièce sur un seul système, aussi long qu'il faut, pour la lire d'un trait. Le bas de page vide est coupé : une partition de trois mesures ne rend pas une page entière de blanc.\n\nUne pièce longue tient sur plusieurs pages : le réglage « Page » dit laquelle rendre, et le message indique combien il y en a.\n\nLa sortie « SVG » rend la partition gravée en texte, et la sortie « Fichier SVG » la même partition en fichier. La partition s'affiche aussi dans le composant.",
    noticeEn: "This node engraves a score from a notation text, and returns one page as SVG.\n\nFour notations are read: ABC, recognisable by its header fields (X:, M:, K:); MusicXML, the exchange format of score editors; MEI, its scholarly counterpart; and Humdrum, that of analysis corpora. The format is recognised from the shape of the text; the setting lets you impose it when recognition gets it wrong. An XML document that is neither a MusicXML score nor an MEI document is refused, and the message names its root element.\n\nAn ABC score is first read note by note. A zero duration, a chord never closed, a tie between two pitches or an unfinished tuplet gets it refused, and the message names each fault, its line and the fragment.\n\nFive ABC constructs are not engraved, and a score that carries one is refused, the message naming each one and its line:\n- several voices (V:);\n- an alternative ending (|1, [2, :|2);\n- a key change within the tune, [K:G] or a K: line; a clef change alone, [K:clef=bass], is engraved;\n- a tie inside a chord, [C-E]2 or [CE]2-;\n- a tuplet whose second number is not the one usage reads under its number alone. So (5, five notes in the time of two in simple time, is refused, and (5:4:5, five in the time of four, is engraved.\n\nAn ABC tempo, Q: in the header or [Q:] within the tune, is engraved above its bar: « ♩ = 60 », preceded by the name of the movement if it has one, « Allegro ♩ = 120 ».\n\nThe engraving follows publishing rules: spacing proportional to duration, beams, stems and accidentals placed, staves aligned. Page width and scale decide what fits on a line; « Unrolled » puts the whole piece on a single system, as long as needed, to read it in one go. The empty bottom of the page is cut off: a three-bar score does not return a full page of white.\n\nA long piece spans several pages: the « Page » setting says which one to render, and the message gives their number.\n\nThe « SVG » output returns the engraved score as text, and the « SVG file » output returns the same score as a file. The score is also shown in the node.",
    entrees: [{ nom: "Notation", nomEn: "Notation", type: "texte", sousType: "notation", requis: false }],
    // DEUX SORTIES POUR UN MÊME SVG, ET LE MÊME NOM POUR LES DEUX.
    //
    // POURQUOI LA SECONDE. « Export SVG » écrit un FICHIER, et son entrée est donc de type image ;
    // les graveurs ne rendaient qu'une chaîne. Graver une partition et en sauvegarder le SVG était
    // impossible dans un seul graphe : l'application refusait le câble, « connexion illégale :
    // texte → image ». Seule « Partition MIDI » savait alimenter l'export, son SVG étant déjà un
    // fichier — c'est son précédent que l'on suit ici.
    //
    // ET DEUX NOMS, PARCE QUE LE DÉPÔT L'EXIGE. Le contrat de réglages refuse l'homonymie de ports
    // sur une même fiche : l'inspecteur annonce un réglage modulable en NOMMANT le port où la
    // courbe doit aller, et avec deux ports homonymes la phrase ne désigne plus rien. Les quatre
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
      const impose = String(ctx.paramTexte("Format", "auto"));
      const format: FormatNotation | null = impose === "auto" ? detecterFormat(texte) : (impose as FormatNotation);
      if (!format) {
        const racine = texte.trim().startsWith("<") ? racineXml(texte) : null;
        return { valeurs: [null, null], erreur: true, message: racine ? traduire("msg.verovio.xml_inconnu_var_0", racine) : en()
          ? "Notation not recognised: expected ABC (X:, K:), MusicXML, MEI or Humdrum."
          : "Notation non reconnue : attendu ABC (X:, K:), MusicXML, MEI ou Humdrum." };
      }
      // CE QUE LE LECTEUR ABC D'ATTIC REFUSE, LE GRAVEUR LE REFUSE, avec les mêmes fautes nommées.
      // Revue des notations en texte, 2026-11-22 : Verovio gravait en vert une durée nulle, un accord
      // jamais refermé ou une liaison entre deux hauteurs, et tombait sur « divide by zero » pour un
      // silence de durée nulle. Chaque air du texte est lu, puisque chacun est gravé.
      if (format === "abc") {
        const morceaux = decouperMorceaux(texte);
        for (const [i, air] of morceaux.entries()) {
          const quoi = traduire("msg.abc.partition_var_0", morceaux.length > 1 ? `ABC ${i + 1}` : "ABC");
          // Puis ce que Verovio ne sait pas dessiner du tout. Décision de Fabien du 2026-11-22, « Refuse
          // them, named » : les voix, les fins alternatives, un changement de tonalité, une liaison
          // dans un accord, un n-olet que son chiffre seul ferait mal lire.
          const refus = refusAbc(lireMorceau(air, i + 1), quoi, "msg.abc.refusee_gravure_var_0_var_1") ?? refusTournures(air, quoi);
          if (refus) return { valeurs: [null, null], erreur: true, message: refus };
        }
      }
      let tk: any = null;
      try {
        tk = await outil();
        tk.setOptions({
          ...optionsGravure({
            largeur: ctx.paramNombre("Largeur", 1800),
            echelle: ctx.paramNombre("Échelle", 40),
            marge: 50,
            deroule: String(ctx.paramTexte("Déroulé", "non")) === "oui",
          }),
          inputFrom: entreeVerovio(format),
        });
        // Un texte ABC est réécrit là où Verovio lit faux une écriture juste (`abcPourGravure`).
        if (!tk.loadData(format === "abc" ? abcPourGravure(texte) : texte)) {
          return { valeurs: [null, null], erreur: true, message: en()
            ? `${format.toUpperCase()} refused by the engraver: check the notation.`
            : `${format.toUpperCase()} refusé par le graveur : vérifiez la notation.` };
        }
        const pages = tk.getPageCount();
        const page = pageDemandee(ctx.paramNombre("Page", 1), pages);
        const svg = tk.renderToSVG(page);
        if (typeof svg !== "string" || !svg.includes("<svg")) {
          return { valeurs: [null, null], erreur: true, message: en() ? "Empty engraving." : "Gravure vide." };
        }
        const nom = format === "musicxml" ? "MusicXML" : format.toUpperCase();
        const message = en()
          ? `${nom} · page ${page}/${pages}`
          : `${nom} · page ${page} sur ${pages}`;
        // Le SVG part sur la SORTIE, et la vue l'y lit : le message reste une ligne lisible sur le
        // nœud — le format reconnu et la page rendue — au lieu d'être un document entier.
        return { valeurs: [svg, new File([svg], "gravure.svg", { type: "image/svg+xml" })], message };
      } catch (e: any) {
        return { valeurs: [null, null], erreur: true, message: e?.message ?? String(e) };
      } finally {
        tk?.destroy?.();
      }
    },
  }),
] as FicheAudio[]).map(avecDoc);
