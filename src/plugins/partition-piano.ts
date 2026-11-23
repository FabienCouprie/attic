// plugins/partition-piano.ts — Nœud « Partition piano » : une partition pour piano, deux portées sous
// accolade, la clé de sol pour la main droite et la clé de fa pour la main gauche, gravée par Verovio.
//
// DEMANDÉ PAR FABIEN LE 2026-11-23 : les mêmes entrées que « Partition gravée », et la même sortie,
// pour se brancher sur « SVG vers PDF ». La lecture est donc la sienne, partagée dans
// `verovio-lecture.ts` : même reconnaissance du format, mêmes refus ABC, mêmes airs, même page.
//
// TROIS TEMPS POUR CHAQUE AIR, chacun dans un module neuf, comme la fuite d'armure l'exige :
//   1. Verovio lit le texte et le rend en MEI, avec l'instant de chaque note (`renderToTimemap`) ;
//   2. Attic lit la hauteur de chaque note de chaque portée (`audio/guitare-hauteurs.ts`), y ajoute la
//      transposition d'un instrument transpositeur, donne chaque note à une main
//      (`audio/piano-mains.ts`), et écrit les deux portées à la hauteur réelle (`audio/piano-portees.ts`) ;
//   3. Verovio grave ce MEI.
// Verovio sait graver une double portée sous accolade, relevé sur la version installée, 6.3.0 ; il ne
// sait pas quelle main joue quoi. Le partage est le seul calcul que ce nœud ajoute.
//
// DÉCISIONS DE FABIEN du 2026-11-23 : « Partage », par la main par défaut ou au point fixe ; toutes les
// portées réunies ; un accord qu'aucune main ne tient, gravé et dit ; les notes loin de la portée sur
// des lignes supplémentaires, les clés fixes, sans 8va. Une note hors du clavier est gravée et dite, de
// même ; une hauteur entre deux touches est refusée, nommée.

import { fiche } from "./fiche";
import type { FicheAudio } from "../audio/types-domaine";
import { traduire } from "../i18n";
import { avecDoc } from "./notices";
import { entreeVerovio, optionsGravure } from "../audio/verovio";
import { choixOuiNon } from "../core/oui-non";
import {
  graverAirs, lireNotation, mentionAir, mentionPage, nomDuFormat, outil, refusDuGraveur, texteAGraver, type Lecture,
} from "./verovio-lecture";
import { lireNotes, porteesDe, sansAlterationsSonnantes, type FauteHauteur, type Temps } from "../audio/guitare-hauteurs";
import { partager, type Large, type NoteDeVoix, type ReglagesMains } from "../audio/piano-mains";
import { ecrirePiano, transpositionsDe, voixDesNotes } from "../audio/piano-portees";
import { nomNoteRond } from "../audio/nom-note";

const EXEMPLE = "X:1\nT:Menuet\nM:3/4\nL:1/4\nK:G\n[G,,B,,D,] d c | [C,E,G,] B A | [D,^F,A,] G F | [G,,D,B,G]3 |]";

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
function direFautes(lecture: Lecture, i: number, fautes: FauteHauteur[]): string {
  const liste = fautes.slice(0, 8).map((f) => f.raison === "microton"
    ? traduire("msg.piano.microton_var_0_var_1", f.nom, f.mesure)
    : traduire("msg.piano.sans_temps_var_0_var_1", f.nom, f.mesure));
  const quoi = lecture.format === "abc" ? lecture.nomAir(i) : nomDuFormat(lecture.format);
  return traduire("msg.piano.refusee_var_0_var_1", quoi, liste.join(" · ") + (fautes.length > 8 ? " · …" : ""));
}

export const fiches: FicheAudio[] = ([
  fiche({
    id: "partition-piano", nom: "Partition piano", nomEn: "Piano Score",
    univers: "Visualisation", famille: "Notation",
    resume: "Grave une notation ABC, MusicXML, MEI ou Humdrum en partition pour piano, clé de sol pour la main droite et clé de fa pour la main gauche, en SVG.",
    resumeEn: "Engraves an ABC, MusicXML, MEI or Humdrum notation into a piano score, treble clef for the right hand and bass clef for the left hand, as SVG.",
    notice: "Ce composant grave une partition pour piano à partir d'un texte de notation : deux portées réunies par une accolade, la clé de sol pour la main droite et la clé de fa pour la main gauche. Il rend une page en SVG.\n\nQuatre notations sont lues : ABC, reconnaissable à ses champs d'en-tête (X:, M:, K:) ; MusicXML ; MEI ; et Humdrum. Le format est reconnu à la forme du texte ; le réglage « Format » l'impose quand la reconnaissance se trompe. Un document XML qui n'est ni une partition MusicXML ni un document MEI est refusé, et le message nomme son élément racine. Une partition ABC est lue note à note : une durée nulle, un accord jamais refermé, une liaison entre deux hauteurs ou un n-olet inachevé la font refuser, comme plusieurs voix (V:), une fin alternative, un changement de tonalité en cours de morceau, une liaison dans un accord et un n-olet que son chiffre seul ferait mal lire. Le message nomme chaque faute et sa ligne.\n\nChaque note sonne à la hauteur que le texte lui donne : son altération écrite, sinon celle qui vaut jusqu'à la barre, sinon l'armure. Un instrument transpositeur, une clarinette en si♭, est lu à la hauteur réelle. Une note liée garde la hauteur de la note où la liaison commence. Une hauteur entre deux touches est refusée, et le message la nomme avec sa mesure.\n\nToutes les portées du texte sont réunies, puis partagées entre les deux mains. Chaque voix garde sa couche, donc ses hampes : dans un choral, soprano et alto vont à la main droite, ténor et basse à la main gauche. « Partage » dit la règle.\n- « Par la main » partage chaque instant entre les deux mains, les notes les plus graves à gauche. Chaque main couvre « Écart » demi-tons et tient cinq notes au plus. Le partage retenu est celui qui, sur toute la pièce, demande le moins : d'abord le moins de notes et de demi-tons au-delà de ce que les mains tiennent ; puis le moins de déplacement des mains, le moins de notes éloignées de leur registre, au-dessus du point de partage pour la main droite et au-dessous pour la main gauche, et le moins de changements de main dans une ligne, une suite de notes seules d'une même voix. Une ligne qui avance par petits intervalles reste ainsi dans sa main, même quand elle passe le point de partage ; un saut plus grand que l'écart peut changer de main. Les notes d'un accord vont chacune où les mains les tiennent. Une note tenue ou liée garde la main qui l'a attaquée.\n- « Point fixe » donne à la main droite toute note à partir du point de partage, et à la main gauche toute note plus grave.\n\nUn accord qu'aucune main ne tient, plus de cinq notes dans une main ou une main plus large que l'écart, est gravé avec le meilleur partage, et le message compte ces accords et nomme la première mesure. Une note hors du clavier, sous la 0 ou au-dessus du do 8, est gravée, et le message la compte de même.\n\nLes clés restent sol et fa d'un bout à l'autre, et chaque note s'écrit à la hauteur réelle : une note loin de la portée prend des lignes supplémentaires. Une portée qui se tait sur une mesure porte un silence de mesure ; une main qui se tait le temps d'une note de l'autre porte un silence. Les altérations écrites sont celles que la lecture de chaque portée demande : l'armure, puis l'altération qui vaut jusqu'à la barre sur la même portée et à la même octave. Une note d'ornement va à la main de la note qu'elle orne. Une liaison, une nuance ou un point d'orgue suit la portée de sa note ; un tempo et un chiffrage d'accord sont gravés au-dessus de la main droite.\n\nLa largeur de page et l'échelle décident de ce qui tient sur une ligne ; « Déroulé » met toute la pièce sur un seul système, aussi long qu'il faut. Une pièce longue tient sur plusieurs pages : « Page » dit laquelle rendre, et le message indique combien il y en a. Un texte ABC qui porte plusieurs airs, un par champ X:, les grave tous, chacun sous son titre et à partir d'une page neuve.\n\nLa sortie « SVG » rend la partition gravée en texte, et la sortie « Fichier SVG » la même partition en fichier. La partition s'affiche aussi dans le composant.",
    noticeEn: "This node engraves a piano score from a notation text: two staves joined by a brace, treble clef for the right hand and bass clef for the left hand. It returns one page as SVG.\n\nFour notations are read: ABC, recognisable by its header fields (X:, M:, K:); MusicXML; MEI; and Humdrum. The format is recognised from the shape of the text; the « Format » setting imposes it when recognition gets it wrong. An XML document that is neither a MusicXML score nor an MEI document is refused, and the message names its root element. An ABC score is read note by note: a zero duration, a chord never closed, a tie between two pitches or an unfinished tuplet gets it refused, as do several voices (V:), an alternative ending, a key change within the tune, a tie inside a chord and a tuplet that its number alone would make read wrongly. The message names each fault and its line.\n\nEach note sounds at the pitch the text gives it: its written accidental, otherwise the one that holds until the bar line, otherwise the key signature. A transposing instrument, a clarinet in B♭, is read at concert pitch. A tied note keeps the pitch of the note where the tie starts. A pitch between two keys is refused, and the message names it with its bar.\n\nAll the staves of the text are combined, then split between the two hands. Each voice keeps its layer, hence its stems: in a chorale, soprano and alto go to the right hand, tenor and bass to the left hand. « Split » gives the rule.\n- « By hand » splits each instant between the two hands, the lowest notes on the left. Each hand covers « Stretch » semitones and holds at most five notes. The split kept is the one that, over the whole piece, asks the least: first the fewest notes and semitones beyond what the hands hold; then the least hand movement, the fewest notes far from their register, above the split point for the right hand and below it for the left hand, and the fewest changes of hand within a line, a run of single notes in one voice. A line moving by small intervals thus stays in its hand, even when it crosses the split point; a leap wider than the stretch may change hands. The notes of a chord each go where the hands hold them. A held or tied note keeps the hand that struck it.\n- « Fixed point » gives the right hand every note from the split point up, and the left hand every lower note.\n\nA chord no hand can hold, more than five notes in one hand or a hand wider than the stretch, is engraved with the best split, and the message counts these chords and names the first bar. A note outside the keyboard, below A0 or above C8, is engraved, and the message counts it likewise.\n\nThe clefs stay treble and bass from start to end, and each note is written at its real pitch: a note far from the staff takes ledger lines. A staff silent for a whole bar carries a whole-bar rest; a hand silent while the other plays a note carries a rest. The written accidentals are those that reading each staff calls for: the key signature, then the accidental that holds until the bar line on the same staff and at the same octave. A grace note goes to the hand of the note it ornaments. A slur, a dynamic or a fermata follows the staff of its note; a tempo and a chord symbol are engraved above the right hand.\n\nPage width and scale decide what fits on a line; « Unrolled » puts the whole piece on a single system, as long as needed. A long piece spans several pages: « Page » says which one to render, and the message gives their number. An ABC text carrying several tunes, one per X: field, engraves them all, each under its title and starting on a new page.\n\nThe « SVG » output returns the engraved score as text, and the « SVG file » output returns the same score as a file. The score is also shown in the node.",
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
      { nom: "Partage", nomEn: "Split", type: "choix",
        options: ["Par la main", "Point fixe"], optionsEn: ["By hand", "Fixed point"],
        optionIds: ["main", "fixe"], defaut: "Par la main", defautEn: "By hand",
        doc: "« Par la main » partage chaque instant là où chaque main tient ses notes et bouge le moins, sur toute la pièce. « Point fixe » donne à la main droite toute note à partir du point de partage, et à la main gauche toute note plus grave.",
        docEn: "« By hand » splits each instant where each hand holds its notes and moves least, over the whole piece. « Fixed point » gives the right hand every note from the split point up, and the left hand every lower note." },
      { nom: "Point de partage", nomEn: "Split point", type: "curseur", plage: [21, 108], pas: 1, defaut: 60,
        doc: "La note, en numéro MIDI, qui sépare les deux mains : 60 est le do 4, le do du milieu du clavier. En point fixe, c'est la plus grave de la main droite ; par la main, c'est la limite des deux registres.",
        docEn: "The note, as a MIDI number, that separates the two hands: 60 is C4, middle C. With a fixed point, it is the lowest note of the right hand; by hand, it is the border between the two registers." },
      { nom: "Écart", nomEn: "Stretch", type: "curseur", plage: [7, 17], pas: 1, defaut: 12, unite: "demi-tons", uniteEn: "semitones",
        doc: "Le nombre de demi-tons qu'une main couvre, de sa note la plus grave à la plus aiguë : 12 est une octave. Par la main, une main ne se déplace que si une note sort de cette étendue ; un accord plus large est gravé et dit.",
        docEn: "The number of semitones a hand covers, from its lowest note to its highest: 12 is an octave. By hand, a hand moves only when a note falls outside this span; a wider chord is engraved and reported." },
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
      const reglages: ReglagesMains = {
        partage: String(ctx.paramTexte("Partage", "main")) === "fixe" ? "fixe" : "main",
        point: Math.round(ctx.paramNombre("Point de partage", 60)),
        ecart: Math.round(ctx.paramNombre("Écart", 12)),
      };
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
      let nombre = 1;
      const larges: Large[] = [], horsClavier: { mesure: number }[] = [];

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
        // 2. La hauteur de chaque note de chaque portée, sa main, puis les deux portées en MEI.
        const doc = new DOMParser().parseFromString(mei, "application/xml");
        if (lecture.format === "abc") sansAlterationsSonnantes(doc);
        const portees = porteesDe(doc);
        if (portees.length === 0) return { refus: traduire("msg.piano.aucune_portee") };
        nombre = Math.max(nombre, portees.length);
        const temps = tempsDe(timemap), voix = voixDesNotes(doc), transpositions = transpositionsDe(doc);
        const notes: NoteDeVoix[] = [], fautes: FauteHauteur[] = [];
        for (const p of portees) {
          // La hauteur écrite, lue sur sa portée, puis la transposition de l'instrument : la hauteur réelle.
          const lues = lireNotes(doc, p, temps, 0), semi = transpositions.get(p)?.semi ?? 0;
          notes.push(...lues.notes.map((n) => ({ ...n, midi: n.midi + semi, voix: voix.get(n.ids[0]) ?? p })));
          fautes.push(...lues.fautes);
        }
        if (fautes.length > 0) return { refus: direFautes(lecture, i, fautes) };
        const partage = partager(notes, reglages);
        larges.push(...partage.larges);
        horsClavier.push(...partage.horsClavier);
        const hauteurs = new Map<string, number>(), suites = new Set<string>();
        for (const n of notes) n.ids.forEach((id, k) => { hauteurs.set(id, n.midi); if (k > 0) suites.add(id); });
        const piano = ecrirePiano(doc, { mains: partage.mains, hauteurs, suites, temps, transpositions });
        // 3. Verovio grave la partition pour piano.
        const graveur = await outil(false);
        graveur.setOptions(options);
        if (graveur.loadData(piano)) return { tk: graveur };
        graveur.destroy?.();
        return { refus: refusDuGraveur(lecture, i) };
      });
      if ("refus" in rendu) return { valeurs: [null, null], erreur: true, message: rendu.refus };

      const mentions = [
        `${nomDuFormat(lecture.format)}${mentionAir(lecture, rendu.air)}`,
        reglages.partage === "main" ? traduire("msg.piano.par_la_main") : traduire("msg.piano.point_fixe_var_0", nomNoteRond(reglages.point)),
        ...(nombre > 1 ? [traduire("msg.piano.portees_var_0", nombre)] : []),
        ...(larges.length > 0 ? [traduire("msg.piano.larges_var_0_var_1", larges.length, larges[0].mesure)] : []),
        ...(horsClavier.length > 0 ? [traduire("msg.piano.hors_clavier_var_0_var_1", horsClavier.length, horsClavier[0].mesure)] : []),
        mentionPage(rendu),
      ];
      return { valeurs: [rendu.svg, new File([rendu.svg], "piano.svg", { type: "image/svg+xml" })], message: mentions.join(" · ") };
    },
  }),
] as FicheAudio[]).map(avecDoc);
