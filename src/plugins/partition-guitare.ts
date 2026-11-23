// plugins/partition-guitare.ts — Nœud « Partition guitare » : une partition pour guitare, portée et
// tablature, gravée par Verovio.
//
// DEMANDÉ PAR FABIEN LE 2026-11-23 : les mêmes entrées que « Partition gravée », et la même sortie,
// pour se brancher sur « SVG vers PDF ». La lecture est donc la sienne, partagée dans
// `verovio-lecture.ts` : même reconnaissance du format, mêmes refus ABC, mêmes airs, même page.
//
// TROIS TEMPS POUR CHAQUE AIR, chacun dans un module neuf, comme la fuite d'armure l'exige :
//   1. Verovio lit le texte et le rend en MEI, avec l'instant de chaque note (`renderToTimemap`) ;
//   2. Attic lit la hauteur réelle de chaque note (`audio/guitare-hauteurs.ts`), la place sur une corde
//      et une case (`audio/guitare-doigte.ts`), et écrit la portée et la tablature
//      (`audio/guitare-tablature.ts`) ;
//   3. Verovio grave ce MEI.
// Verovio sait graver une tablature de guitare, relevé dans l'application sur la version installée,
// 6.3.0 ; il ne sait pas où la jouer. Le doigté est le seul calcul que ce nœud ajoute.
//
// DÉCISIONS DE FABIEN du 2026-11-23, une par réglage neuf : « Affichage », portée et tablature par
// défaut ; « Octave », à 0, la hauteur réelle ; « Accordage », une liste nommée ; « Capodastre »,
// « Dernière case » et « Écart » ; « Portée ». Et pour ce qui ne se joue pas : une note hors tessiture
// ou un accord injouable sont refusés, nommés ; les notes d'ornement sont absentes de la tablature,
// et dites.

import { fiche } from "./fiche";
import type { FicheAudio } from "../audio/types-domaine";
import { langueCourante, traduire } from "../i18n";
import { avecDoc } from "./notices";
import { entreeVerovio, optionsGravure } from "../audio/verovio";
import { choixOuiNon } from "../core/oui-non";
import {
  graverAirs, lireNotation, mentionAir, mentionPage, nomDuFormat, outil, refusDuGraveur, texteAGraver, type Lecture,
} from "./verovio-lecture";
import {
  ACCORDAGES, accordageDe, cordesMidi, placer, tessiture, type Accordage, type FauteDoigte, type ReglagesDoigte,
} from "../audio/guitare-doigte";
import { lireNotes, porteesDe, sansAlterationsSonnantes, type FauteHauteur, type Temps } from "../audio/guitare-hauteurs";
import { ecrireTablature } from "../audio/guitare-tablature";
import { lireNomDeNote } from "../audio/noms-de-notes";
import { nomNoteRond } from "../audio/nom-note";

const en = () => langueCourante() === "en";

const EXEMPLE = "X:1\nT:Gamme\nM:4/4\nL:1/4\nK:G\nG, A, B, C | D E F G | [G,B,D]4 |]";

/** Les instants de chaque note, pris à la `timemap` de Verovio, en noires. */
function tempsDe(timemap: { qstamp: number; on?: string[]; off?: string[] }[]): Temps {
  const temps: Temps = new Map();
  for (const t of timemap) {
    for (const id of t.on ?? []) temps.set(id, { debut: t.qstamp, fin: t.qstamp });
    for (const id of t.off ?? []) { const n = temps.get(id); if (n) n.fin = t.qstamp; }
  }
  return temps;
}

/** Chaque faute nommée, les huit premières. */
function direFautes(lecture: Lecture, i: number, fautes: (FauteDoigte | FauteHauteur)[], r: ReglagesDoigte): string {
  const [bas, haut] = tessiture(r).map((m) => nomNoteRond(m));
  const liste = fautes.slice(0, 8).map((f) => {
    if ("nom" in f) {
      return f.raison === "microton" ? traduire("msg.guitare.microton_var_0_var_1", f.nom, f.mesure)
        : traduire("msg.guitare.sans_temps_var_0_var_1", f.nom, f.mesure);
    }
    const notes = f.notes.join(" ");
    switch (f.raison) {
      case "tessiture": return traduire("msg.guitare.tessiture_var_0_var_1_var_2_var_3", notes, f.mesure, bas, haut);
      case "nombre": return traduire("msg.guitare.nombre_var_0_var_1_var_2", notes, f.mesure, r.cordes.length);
      case "corde": return traduire("msg.guitare.corde_var_0_var_1", notes, f.mesure);
      case "ecart": return traduire("msg.guitare.ecart_var_0_var_1_var_2", notes, f.mesure, r.ecart);
    }
  });
  const quoi = lecture.format === "abc" ? lecture.nomAir(i) : nomDuFormat(lecture.format);
  return traduire("msg.guitare.refusee_var_0_var_1", quoi, liste.join(" · ") + (fautes.length > 8 ? " · …" : ""));
}

/** Ce qui est gravé au-dessus de la première mesure : l'accordage s'il n'est pas le standard, le capodastre. */
function indication(a: Accordage, capo: number): string | null {
  const cordes = a.cordes.map((c) => { const n = lireNomDeNote(c)!; return n.lettre + (n.alteration > 0 ? "♯" : n.alteration < 0 ? "♭" : ""); });
  const parties = [
    ...(a.id === "standard" ? [] : [`${en() ? a.nomEn : a.nom} (${cordes.join(" ")})`]),
    ...(capo > 0 ? [`Capo ${capo}`] : []),
  ];
  return parties.length > 0 ? parties.join(" · ") : null;
}

export const fiches: FicheAudio[] = ([
  fiche({
    id: "partition-guitare", nom: "Partition guitare", nomEn: "Guitar Score",
    univers: "Visualisation", famille: "Notation",
    resume: "Grave une notation ABC, MusicXML, MEI ou Humdrum en partition pour guitare, portée et tablature, en SVG.",
    resumeEn: "Engraves an ABC, MusicXML, MEI or Humdrum notation into a guitar score, staff and tablature, as SVG.",
    notice: "Ce composant grave une partition pour guitare à partir d'un texte de notation : la portée, en clé de sol à 8 en bas, et sa tablature, qui donne pour chaque note la corde et la case où la jouer. Il rend une page en SVG.\n\nQuatre notations sont lues : ABC, reconnaissable à ses champs d'en-tête (X:, M:, K:) ; MusicXML ; MEI ; et Humdrum. Le format est reconnu à la forme du texte ; le réglage « Format » l'impose quand la reconnaissance se trompe. Un document XML qui n'est ni une partition MusicXML ni un document MEI est refusé, et le message nomme son élément racine. Une partition ABC est lue note à note : une durée nulle, un accord jamais refermé, une liaison entre deux hauteurs ou un n-olet inachevé la font refuser, comme plusieurs voix (V:), une fin alternative, un changement de tonalité en cours de morceau, une liaison dans un accord et un n-olet que son chiffre seul ferait mal lire. Le message nomme chaque faute et sa ligne.\n\nChaque note sonne à la hauteur que le texte lui donne : son altération écrite, sinon celle qui vaut jusqu'à la barre, sinon l'armure. Une note liée garde la hauteur de la note où la liaison commence. La portée écrit cette hauteur une octave plus haut, selon l'usage de la guitare. « Octave » déplace toutes les notes d'autant d'octaves, et le message le dit.\n\n« Accordage » donne les cordes à vide et leur nombre : Standard (mi la ré sol si mi), Drop D, DADGAD, Open G, Open D, Un demi-ton plus bas, et Standard 7 cordes, avec un si grave. « Capodastre » pose le capodastre sur une case, et les cases de la tablature se comptent depuis lui. « Dernière case » borne le manche. Un accordage autre que le standard, et le capodastre, sont gravés au-dessus de la première mesure.\n\nChaque note est placée sur une corde et une case. Une hauteur se joue souvent à plusieurs endroits du manche ; le placement retenu est celui qui déplace le moins la main sur toute la pièce. La main couvre « Écart » cases à partir de l'index : à 4, en position 7, elle tient de la case 7 à la case 10. Elle ne se déplace que si une case appuyée sort de cette fenêtre, et le déplacement se compte en cases ; une corde à vide ne la déplace pas. À déplacement égal, les cases les plus basses l'emportent. Deux notes qui sonnent ensemble, dans un accord ou dans deux voix, prennent deux cordes, tiennent dans la fenêtre, et une note tenue garde la sienne.\n\nCe que la guitare ne joue pas est refusé, et le message le nomme avec sa mesure : une note hors de la tessiture de l'accordage, une hauteur entre deux cases, et un accord qui porte plus de notes que de cordes, qui exige deux fois la même corde ou qui dépasse l'écart.\n\n« Affichage » dit ce qui est gravé. « Portée et tablature » grave les deux, réunies par une accolade : le rythme se lit sur la portée, et la tablature ne porte que les cases. « Tablature » ne grave qu'elle, avec ses hampes de durée, ses silences et les indications de la portée. Les notes d'ornement restent sur la portée et ne sont pas dans la tablature ; le message les compte.\n\nD'une partition à plusieurs portées, une seule est transcrite : « Portée » dit laquelle, et le message indique combien il y en a. Au-delà de la dernière, c'est la dernière qui est transcrite. Les voix d'une même portée sont gardées.\n\nLa largeur de page et l'échelle décident de ce qui tient sur une ligne ; « Déroulé » met toute la pièce sur un seul système, aussi long qu'il faut. Une pièce longue tient sur plusieurs pages : « Page » dit laquelle rendre, et le message indique combien il y en a. Un texte ABC qui porte plusieurs airs, un par champ X:, les grave tous, chacun sous son titre et à partir d'une page neuve.\n\nLa sortie « SVG » rend la partition gravée en texte, et la sortie « Fichier SVG » la même partition en fichier. La partition s'affiche aussi dans le composant.",
    noticeEn: "This node engraves a guitar score from a notation text: the staff, in treble clef with an 8 below, and its tablature, which gives for each note the string and the fret where it is played. It returns one page as SVG.\n\nFour notations are read: ABC, recognisable by its header fields (X:, M:, K:); MusicXML; MEI; and Humdrum. The format is recognised from the shape of the text; the « Format » setting imposes it when recognition gets it wrong. An XML document that is neither a MusicXML score nor an MEI document is refused, and the message names its root element. An ABC score is read note by note: a zero duration, a chord never closed, a tie between two pitches or an unfinished tuplet gets it refused, as do several voices (V:), an alternative ending, a key change within the tune, a tie inside a chord and a tuplet that its number alone would make read wrongly. The message names each fault and its line.\n\nEach note sounds at the pitch the text gives it: its written accidental, otherwise the one that holds until the bar line, otherwise the key signature. A tied note keeps the pitch of the note where the tie starts. The staff writes this pitch one octave higher, as guitar notation does. « Octave » moves every note by that many octaves, and the message says so.\n\n« Tuning » gives the open strings and their number: Standard (E A D G B E), Drop D, DADGAD, Open G, Open D, Half step down, and Standard 7-string, with a low B. « Capo » puts the capo on a fret, and the tablature's frets are counted from it. « Last fret » bounds the neck. A tuning other than standard, and the capo, are engraved above the first bar.\n\nEach note is placed on a string and a fret. A pitch can often be played at several places on the neck; the placement kept is the one that moves the hand least over the whole piece. The hand covers « Stretch » frets from the index finger: at 4, in position 7, it holds from fret 7 to fret 10. It moves only when a fretted note falls outside this window, and the movement is counted in frets; an open string does not move it. For equal movement, the lowest frets win. Two notes sounding together, in a chord or in two voices, take two strings, fit in the window, and a held note keeps its own.\n\nWhat the guitar does not play is refused, and the message names it with its bar: a note outside the tuning's range, a pitch between two frets, and a chord that carries more notes than strings, that needs the same string twice or that exceeds the stretch.\n\n« Display » says what is engraved. « Staff and tablature » engraves both, joined by a bracket: the rhythm is read on the staff, and the tablature carries only the frets. « Tablature » engraves it alone, with its duration stems, its rests and the staff's markings. Grace notes stay on the staff and are not in the tablature; the message counts them.\n\nOf a score with several staves, only one is transcribed: « Staff » says which, and the message gives their number. Beyond the last one, the last one is transcribed. The voices of one staff are kept.\n\nPage width and scale decide what fits on a line; « Unrolled » puts the whole piece on a single system, as long as needed. A long piece spans several pages: « Page » says which one to render, and the message gives their number. An ABC text carrying several tunes, one per X: field, engraves them all, each under its title and starting on a new page.\n\nThe « SVG » output returns the engraved score as text, and the « SVG file » output returns the same score as a file. The score is also shown in the node.",
    entrees: [{ nom: "Notation", nomEn: "Notation", type: "texte", sousType: "notation", requis: false }],
    // Les deux sorties de « Partition gravée », dans le même ordre : le SVG en texte, que la vue lit, et
    // le même en fichier, que « Export SVG » et « SVG vers PDF » prennent sur une entrée de type image.
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
      { nom: "Affichage", nomEn: "Display", type: "choix",
        options: ["Portée et tablature", "Tablature"], optionsEn: ["Staff and tablature", "Tablature"],
        optionIds: ["portee-tablature", "tablature"], defaut: "Portée et tablature", defautEn: "Staff and tablature",
        doc: "« Portée et tablature » grave la portée et, dessous, la tablature, qui ne porte alors que les cases. « Tablature » ne grave qu'elle, avec ses hampes de durée et ses silences.",
        docEn: "« Staff and tablature » engraves the staff and, below it, the tablature, which then carries only the frets. « Tablature » engraves it alone, with its duration stems and rests." },
      { nom: "Accordage", nomEn: "Tuning", type: "choix",
        options: ACCORDAGES.map((a) => a.nom), optionsEn: ACCORDAGES.map((a) => a.nomEn), optionIds: ACCORDAGES.map((a) => a.id),
        defaut: "Standard", defautEn: "Standard",
        doc: "Les cordes à vide, du grave à l'aigu, et leur nombre : Standard, mi la ré sol si mi ; Drop D, ré la ré sol si mi ; DADGAD ; Open G, ré sol ré sol si ré ; Open D, ré la ré fa♯ la ré ; Un demi-ton plus bas ; Standard 7 cordes, si mi la ré sol si mi.",
        docEn: "The open strings, from low to high, and their number: Standard, E A D G B E; Drop D, D A D G B E; DADGAD; Open G, D G D G B D; Open D, D A D F♯ A D; Half step down; Standard 7-string, B E A D G B E." },
      { nom: "Capodastre", nomEn: "Capo", type: "curseur", plage: [0, 12], pas: 1, defaut: 0,
        doc: "La case où le capodastre est posé, 0 sans lui. Il hausse toutes les cordes d'autant de demi-tons, et les cases de la tablature se comptent depuis lui.",
        docEn: "The fret where the capo sits, 0 without one. It raises every string by that many semitones, and the tablature's frets are counted from it." },
      { nom: "Dernière case", nomEn: "Last fret", type: "curseur", plage: [12, 24], pas: 1, defaut: 20,
        doc: "La plus haute case du manche, comptée depuis le sillet. Une note plus aiguë que la corde la plus aiguë à cette case est refusée.",
        docEn: "The highest fret of the neck, counted from the nut. A note higher than the highest string at this fret is refused." },
      { nom: "Écart", nomEn: "Stretch", type: "curseur", plage: [2, 6], pas: 1, defaut: 4,
        doc: "Le nombre de cases que la main couvre à partir de l'index : à 4, en position 5, elle tient de la case 5 à la case 8. La main ne se déplace que si une case sort de cette fenêtre. Un accord plus large est refusé.",
        docEn: "The number of frets the hand covers from the index finger: at 4, in position 5, it holds from fret 5 to fret 8. The hand moves only when a fret falls outside this window. A wider chord is refused." },
      { nom: "Octave", nomEn: "Octave", type: "nombre", plage: [-2, 2], pas: 1, defaut: 0,
        doc: "Déplace toutes les notes d'autant d'octaves, sur la portée comme sur la tablature. À 0, la guitare joue la hauteur du texte.",
        docEn: "Moves every note by that many octaves, on the staff as on the tablature. At 0, the guitar plays the pitch of the text." },
      { nom: "Portée", nomEn: "Staff", type: "nombre", plage: [1, 16], pas: 1, defaut: 1,
        doc: "La portée transcrite, quand la partition en a plusieurs, comptée depuis le haut. Au-delà de la dernière, c'est la dernière.",
        docEn: "The staff transcribed, when the score has several, counted from the top. Beyond the last one, the last one." },
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
      const lecture = lireNotation(texte, String(ctx.paramTexte("Format", "auto")));
      if ("refus" in lecture) return { valeurs: [null, null], erreur: true, message: lecture.refus };
      const accordage = accordageDe(String(ctx.paramTexte("Accordage", "standard")));
      const capo = Math.round(ctx.paramNombre("Capodastre", 0));
      const doigte: ReglagesDoigte = {
        cordes: cordesMidi(accordage), capo,
        derniereCase: Math.round(ctx.paramNombre("Dernière case", 20)),
        ecart: Math.round(ctx.paramNombre("Écart", 4)),
      };
      const octave = Math.round(ctx.paramNombre("Octave", 0));
      const voulue = Math.round(ctx.paramNombre("Portée", 1));
      const tablatureSeule = String(ctx.paramTexte("Affichage", "portee-tablature")) === "tablature";
      const options = {
        ...optionsGravure({
          largeur: ctx.paramNombre("Largeur", 1800),
          echelle: ctx.paramNombre("Échelle", 40),
          marge: 50,
          deroule: String(ctx.paramTexte("Déroulé", "non")) === "oui",
        }),
        inputFrom: "mei",
        ...(lecture.airs.length > 1 ? { header: "encoded" } : {}),
      };
      let ornements = 0, portee = { rang: 1, nombre: 1 };

      const rendu = await graverAirs(lecture, ctx.paramNombre("Page", 1), async (i) => {
        // 1. Verovio lit le texte, et rend le MEI et les instants de chaque note.
        const lecteur = await outil(lecture.format === "humdrum");
        let mei: string, timemap: { qstamp: number; on?: string[]; off?: string[] }[];
        try {
          lecteur.setOptions({ inputFrom: entreeVerovio(lecture.format) });
          if (!lecteur.loadData(texteAGraver(lecture, i))) return { refus: refusDuGraveur(lecture, i) };
          mei = lecteur.getMEI({});
          timemap = lecteur.renderToTimemap({});
        } finally {
          lecteur.destroy?.();
        }
        // 2. La hauteur de chaque note, sa place sur le manche, puis la portée et la tablature en MEI.
        const doc = new DOMParser().parseFromString(mei, "application/xml");
        // L'import ABC de Verovio pose des altérations sonnantes fausses après un bécarre porté : la
        // lecture s'en passe, l'armure et les altérations écrites lui suffisant.
        if (lecture.format === "abc") sansAlterationsSonnantes(doc);
        const portees = porteesDe(doc);
        if (portees.length === 0) return { refus: traduire("msg.guitare.aucune_portee") };
        portee = { rang: Math.min(Math.max(1, voulue), portees.length), nombre: portees.length };
        const lues = lireNotes(doc, portees[portee.rang - 1], tempsDe(timemap), octave);
        if (lues.fautes.length > 0) return { refus: direFautes(lecture, i, lues.fautes, doigte) };
        const placement = placer(lues.notes, doigte);
        if ("fautes" in placement) return { refus: direFautes(lecture, i, placement.fautes, doigte) };
        ornements += lues.ornements;
        const tab = ecrireTablature(doc, {
          portee: portees[portee.rang - 1], places: placement.places, tablatureSeule, octave,
          cordesSonnantes: doigte.cordes.map((c) => c + capo), indication: indication(accordage, capo),
        });
        // 3. Verovio grave la partition pour guitare.
        const graveur = await outil(false);
        graveur.setOptions(options);
        if (graveur.loadData(tab)) return { tk: graveur };
        graveur.destroy?.();
        return { refus: refusDuGraveur(lecture, i) };
      });
      if ("refus" in rendu) return { valeurs: [null, null], erreur: true, message: rendu.refus };

      const mentions = [
        `${nomDuFormat(lecture.format)}${mentionAir(lecture, rendu.air)}`,
        en() ? accordage.nomEn : accordage.nom,
        ...(portee.nombre > 1 ? [traduire("msg.guitare.portee_var_0_var_1", portee.rang, portee.nombre)] : []),
        ...(octave !== 0 ? [traduire("msg.guitare.octave_var_0", octave > 0 ? `+${octave}` : `−${-octave}`)] : []),
        ...(ornements > 0 ? [traduire("msg.guitare.ornements_var_0", ornements)] : []),
        mentionPage(rendu),
      ];
      return { valeurs: [rendu.svg, new File([rendu.svg], "guitare.svg", { type: "image/svg+xml" })], message: mentions.join(" · ") };
    },
  }),
] as FicheAudio[]).map(avecDoc);
