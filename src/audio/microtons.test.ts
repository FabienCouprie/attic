// audio/microtons.test.ts — Un quart de ton traverse-t-il la chaîne, ou se fait-il arrondir ?
//
// POURQUOI CE TEST EXISTE. Héberger l'harmonie spectrale, l'intonation juste ou les profils
// mélodiques suppose qu'une hauteur puisse ne pas tomber sur un demi-ton. OpenMusic y répond par
// les midicents, où le do central vaut 6000 : c'est une convention, pas une nécessité. Ce qui est
// nécessaire, c'est que le nombre porté par une note puisse être fractionnaire et le reste jusqu'au
// son.
//
// LA CONVERSION EN FRÉQUENCE EST DÉJÀ CONTINUE : 440 × 2^((n − 69) / 12) accepte 69,5 et rend
// exactement cinquante cents. Rien n'est donc à changer de ce côté. Ce test cherche AILLEURS : aux
// endroits qui supposent un entier sans le dire, et qui arrondiraient en silence.
//
// CE QU'IL NE PRÉTEND PAS. Un fichier MIDI ne sait pas porter de cents : son numéro de note est un
// octet. Une sortie vers un `.mid` arrondira toujours, sauf à écrire du pitch bend, qui est un
// autre chantier. Ce test constate cette limite plutôt que de la reprocher.
//
// UNE PORTE RESTE FERMÉE, ET C'EST POURQUOI ELLE N'EST PAS SONDÉE ICI. Le calcul d'octave de
// l'écriture ABC, dans `ecrireHauteur`, se décalerait d'une octave sur une hauteur fractionnaire ;
// mais cette fonction n'est appelée que depuis `midiVersAbc`, qui reçoit des octets. Aucun microton
// ne peut l'atteindre aujourd'hui. Le jour où une hauteur continue y entrerait, c'est le premier
// endroit à revoir.
import "./polyfill-audiobuffer";
import { describe, expect, it } from "vitest";

import { parseMidi } from "midi-file";

import { frequenceDeNoteMidi } from "./commun";
import { analyserMidi, notesVersFichierMidi, rendreSequence } from "./midi";
import { hauteurMediane, suivreHauteur } from "./hauteur";
import { nomMusicXML } from "./musicxml";
import { epeler } from "./midi-vers-abc";
import { lireTonalite } from "./abc";
import { degrePlusProche } from "./correction-hauteur";
import { classes, nomClasse, pc } from "./classes-hauteurs";
import { apprendre, tableEnTexte } from "./markov";
import { hauteurDepuisNom, nomNote as nomNoteLlm } from "./abc-edition-llm";
import { parametresLecture, voixPourNote, type Banque, type Zone } from "./clavier-banque";
import { transposerParReechantillonnage } from "./reverbes-etendues";
import { midiVersNotationEasyScore } from "../plugins/vexflow";
import { disposition, nomNote } from "../ui/clavier-disposition";

/** L'écart en cents entre deux fréquences : la seule mesure qui dise si un microton a survécu. */
const cents = (hz: number, reference: number) => 1200 * Math.log2(hz / reference);

const LA4 = 69;
const LA4_HZ = 440;

/** Une banque d'une seule zone, juste au la4 : assez pour interroger la vitesse de lecture. */
function banqueAUneZone(): Banque {
  const audio = new AudioBuffer({ numberOfChannels: 1, length: 64, sampleRate: 48000 });
  const zone: Zone = { racine: LA4, basse: 21, haute: 108, audio };
  return { zones: [zone], racineSource: LA4, largeur: 12, noteBasse: 21, noteHaute: 108 };
}

describe("la conversion en fréquence", () => {
  it("EST DÉJÀ CONTINUE, et c'est ce qui rend les midicents inutiles", () => {
    expect(cents(frequenceDeNoteMidi(LA4 + 0.5), LA4_HZ)).toBeCloseTo(50, 6);
    expect(cents(frequenceDeNoteMidi(LA4 + 0.01), LA4_HZ)).toBeCloseTo(1, 6);
    expect(cents(frequenceDeNoteMidi(LA4 - 0.25), LA4_HZ)).toBeCloseTo(-25, 6);
  });

  it("garde le demi-ton entier exactement là où il était", () => {
    // La compatibilité descendante se vérifie, elle ne se suppose pas : une hauteur entière doit
    // rendre la même fréquence qu'avant, au bit près.
    expect(frequenceDeNoteMidi(69)).toBe(440);
    expect(frequenceDeNoteMidi(60)).toBeCloseTo(261.6255653, 6);
  });
});

describe("ce qui suppose un entier sans le dire", () => {
  it("LE NOM D'UNE NOTE DIT SON ÉCART, au lieu de rendre NaN", () => {
    // La fonction passait par un modulo douze, qui sur 69,5 donne 9,5, un indice de tableau
    // inexistant : elle rendait `NaN` sans rien signaler. Arrondir en silence n'aurait pas mieux
    // valu, puisque c'est justement l'écart qu'on cherche à voir.
    expect(nomNote(69)).toBe("A4");
    expect(nomNote(69.4)).toBe("A4+40");
    expect(nomNote(68.86)).toBe("A4−14");
    expect(nomNote(60)).toBe("C4");
    // UN QUART DE TON EXACT EST À ÉGALE DISTANCE DE SES DEUX VOISINES, et les deux noms le
    // décrivent aussi bien. L'arrondi de JavaScript va vers le haut : 69,5 se dit « A#4−50 » et
    // non « A4+50 ». Ce n'est pas un choix musical, c'est le tirage au sort qu'il fallait fixer.
    expect(nomNote(69.5)).toBe("A#4−50");
  });

  it("L'ÉCRITURE D'UN FICHIER MIDI : le numéro de note est un octet, donc il arrondit", () => {
    // Ce n'est pas un défaut à corriger, c'est la limite du format. Ce qui SERAIT un défaut, c'est
    // qu'un 69,5 parte dans l'octet sans arrondi : la bibliothèque écrirait un nombre à virgule là
    // où un entier est attendu, et le fichier serait illisible ou faux sans que rien ne le dise.
    const fichier = notesVersFichierMidi(
      [{ note: 69.5, velocite: 100, debut: 0, fin: 1 }],
      120,
    );
    expect(fichier).toBeInstanceOf(File);
    return fichier.arrayBuffer().then((buf) => {
      const relu = parseMidi(new Uint8Array(buf));
      const { notes } = analyserMidi(relu);
      expect(notes.length, "la note doit survivre à l'aller-retour").toBe(1);
      expect(Number.isInteger(notes[0].note),
        `le fichier porte ${notes[0].note}, qui n'est pas un entier`).toBe(true);
      expect(notes[0].note, "arrondie à la voisine la plus proche").toBe(70);
    });
  });

  it("LA LECTURE D'UN ÉCHANTILLON EST CONTINUE, donc un quart de ton s'entend", () => {
    // C'est le chemin qui compte pour l'oreille : une banque SFZ ou SF2 rejoue un échantillon en
    // changeant sa vitesse de lecture. On interroge la VRAIE fonction, et non une copie de sa
    // formule : une copie ne dirait rien le jour où l'originale gagnerait un arrondi.
    const banque = banqueAUneZone();
    const juste = voixPourNote(banque, 69)!;
    const haut = voixPourNote(banque, 69.5)!;
    expect(juste.ratio, "la note de la racine se lit à vitesse normale").toBeCloseTo(1, 12);
    expect(cents(haut.ratio, juste.ratio), "un quart de ton, jusqu'au matériel").toBeCloseTo(50, 6);
    // Le réglage prêt pour Web Audio le garde : c'est lui que le clavier d'un nœud pose.
    expect(parametresLecture(haut).vitesse).toBe(haut.ratio);
  });

  it("MUSICXML SAIT PORTER UN QUART DE TON, et ne doit pas le jeter", () => {
    // Le champ `alter` d'une partition MusicXML compte en demi-tons et accepte les fractions :
    // 0,5 est un quart de ton haut, la spécification le prévoit pour les microtons. L'écriture
    // arrondissait, ce qui perdait en silence ce que le format savait garder.
    expect(nomMusicXML(69)).toEqual({ pas: "A", alter: 0, octave: 4 });
    expect(nomMusicXML(69.4)).toEqual({ pas: "A", alter: 0.4, octave: 4 });
    expect(nomMusicXML(70)).toEqual({ pas: "B", alter: -1, octave: 4 });
    // L'écart se compte depuis le degré retenu, et non depuis la note ronde la plus proche : le
    // si bémol s'écrit « B » avec une altération de moins un, donc un quart de ton au-dessus de lui
    // vaut moins un demi.
    expect(nomMusicXML(70.5)).toEqual({ pas: "B", alter: -0.5, octave: 4 });
    // UN QUART DE TON EXACT TOMBE ENTRE DEUX ORTHOGRAPHES, et l'arrondi de JavaScript va vers le
    // haut : 69,5 s'écrit si bémol abaissé d'un quart, et non la haussé d'un quart. C'est la même
    // hauteur, et la partition la dit aussi bien.
    expect(nomMusicXML(69.5)).toEqual({ pas: "B", alter: -1.5, octave: 4 });
  });

  it("L'ORTHOGRAPHE ABC NE SAIT PAS LE QUART DE TON, mais elle ne doit pas rendre un do", () => {
    // `epeler` cherche la lettre dont la classe de hauteur vaut `hauteur % 12`. Sur 69,5 cela fait
    // 9,5, qu'aucune lettre ne porte : la fonction tombait dans son repli, commenté « inatteignable »,
    // et rendait un do. Une erreur de onze demi-tons, sans un mot.
    const armure = lireTonalite("C major", () => {});
    expect(epeler(69, armure)).toEqual({ lettre: "A", alteration: 0 });
    // Ce qui compte n'est pas l'orthographe choisie mais qu'elle soit CELLE DE LA VOISINE : un
    // quart de ton au-dessus du la s'écrit comme un la, et non comme un do.
    expect(epeler(69.4, armure)).toEqual(epeler(69, armure));
    expect(epeler(70.4, armure)).toEqual(epeler(70, armure));
    // Et le repli ne sert plus de chemin ordinaire : aucune hauteur voisine du la ne rend un do.
    for (const h of [69.1, 69.25, 69.4, 68.6, 68.75]) {
      expect(epeler(h, armure).lettre, `hauteur ${h}`).toBe("A");
    }
  });

  it("LA PARTITION VEXFLOW NE DOIT PAS ÉCRIRE « undefined » POUR UNE NOTE", () => {
    // Le nom de note passait par `NOMS[note % 12]`, donc `NOMS[9,5]` sur un quart de ton : une
    // case qui n'existe pas. Le jeton envoyé au dessin devenait « undefined4/q », que VexFlow
    // refuse : la partition ne s'affichait plus, et rien ne disait pourquoi.
    const notation = midiVersNotationEasyScore(
      [{ note: 69.5, debut: 0, fin: 0.5 }],
      120,
      0.25,
    );
    expect(notation).not.toContain("undefined");
    expect(notation).toBe("A#4/q");
  });

  it("LA TRANSPOSITION PAR RÉÉCHANTILLONNAGE EST CONTINUE, elle aussi", () => {
    // Le shimmer d'une réverbération transpose en changeant la vitesse de lecture : 2^(n/12)
    // accepte les fractions. Un quart de ton doit donner un rapport de 1,0145, et non 1.
    const signal = new Float32Array(2048);
    for (let i = 0; i < signal.length; i++) signal[i] = Math.sin((2 * Math.PI * 100 * i) / 48000);
    const hausse = transposerParReechantillonnage(signal, 0.5);
    expect(hausse.some((v, i) => Math.abs(v - signal[i]) > 1e-6),
      "un quart de ton doit changer le signal, pas le recopier").toBe(true);
    expect(transposerParReechantillonnage(signal, 0)[100]).toBeCloseTo(signal[100], 6);
  });

  it("LA THÉORIE SÉRIELLE ARRONDIT, ET C'EST SA DÉFINITION", () => {
    // Les douze classes de hauteurs sont un système à douze places : une hauteur fractionnaire
    // n'y a pas de sens, et l'arrondi n'est pas une perte mais l'entrée dans le système. Ce qui
    // serait un défaut, c'est qu'elle rende un indice vide, comme ailleurs.
    expect(pc(69.4)).toBe(9);
    expect(nomClasse(69.4)).toBe("A");
    expect(classes([69.4, 70.6, 69])).toEqual([9, 11]);
  });

  it("LA TABLE DE MARKOV APPRENAIT JUSTE ET AFFICHAIT « NaN »", () => {
    // Ce nœud existe pour être lu : son en-tête promet qu'on puisse « ouvrir la table et voir
    // pourquoi ». Il reçoit des `Note`, la structure commune, donc une hauteur continue l'atteint.
    // L'apprentissage était juste — les nombres ne servent que de clés —, mais le nom affiché
    // passait par un modulo douze et rendait `NaN` : on ouvrait la table et l'on ne voyait rien.
    const notes = (hauteurs: number[]) => hauteurs.map((note, i) => ({
      note, velocite: 100, debut: i * 0.5, fin: i * 0.5 + 0.5,
    }));
    const texte = tableEnTexte(apprendre(notes([69.5, 71, 69.5, 72]), 1));
    expect(texte).not.toContain("NaN");
    expect(texte).toContain("A#4−50");
    // Ce qu'elle a appris ne change pas : le quart de ton mène une fois sur deux à chacune.
    expect(texte).toContain("B4 50%");
    expect(texte).toContain("C5 50%");
    // DEUX HAUTEURS VOISINES RESTENT DEUX LIGNES, et doivent donc porter deux noms. Arrondir sans
    // dire l'écart les nommerait pareil, dans une table dont c'est tout l'objet de les distinguer.
    const deux = tableEnTexte(apprendre(notes([69.4, 71, 69.6, 72]), 1));
    expect(deux).toContain("A4+40");
    expect(deux).toContain("A#4−40");
  });

  it("L'ÉDITEUR ABC REND UN NOM QUE SA PROPRE RELECTURE ACCEPTE", () => {
    // Ici le nom n'est pas pour l'œil : il part vers un modèle de langue, qui le renvoie, et une
    // expression régulière le relit. Un écart en cents y serait rejeté, l'édition repartirait pour
    // un essai, et elle échouerait au bout de trois. La forme arrondie est donc la bonne, et
    // l'aller-retour doit se refermer.
    expect(nomNoteLlm(69)).toBe("A4");
    expect(nomNoteLlm(69.5)).toBe("A#4");
    expect(hauteurDepuisNom(nomNoteLlm(69.5))).toBe(70);
    expect(hauteurDepuisNom(nomNoteLlm(69.4))).toBe(69);
  });

  it("LE RENDU JOUE LE QUART DE TON, mesuré sur le son qui sort", () => {
    // C'est le bout de la chaîne, et le seul contrôle qui compte vraiment : non pas qu'un nombre
    // ait survécu, mais qu'on ENTENDE la bonne fréquence. Le suiveur de hauteur relit le son rendu
    // et le compare à ce qu'il aurait dû faire, en cents. Une erreur d'un demi-ton donnerait cent.
    const note = (h: number) => [{ note: h, velocite: 100, debut: 0, fin: 1 }];
    return Promise.all([
      rendreSequence(note(69), "FM/Oscillateurs", 100),
      rendreSequence(note(69.5), "FM/Oscillateurs", 100),
    ]).then(([juste, haut]) => {
      const mesure = (b: AudioBuffer) => hauteurMediane(suivreHauteur(b.getChannelData(0), b.sampleRate));
      const fJuste = mesure(juste);
      const fHaut = mesure(haut);
      expect(cents(fJuste, LA4_HZ), "le la doit sortir sur le la").toBeCloseTo(0, 0);
      expect(cents(fHaut, fJuste), "et le quart de ton cinquante cents plus haut").toBeCloseTo(50, 0);
    });
  });

  it("LA QUANTIFICATION SUR UNE ÉCHELLE ACCEPTE UNE HAUTEUR FRACTIONNAIRE", () => {
    // C'est l'opération qui ramène un microton sur un degré : elle doit fonctionner, puisque c'est
    // exactement ce qu'on lui demandera quand une analyse spectrale rendra des hauteurs continues.
    const majeure = [0, 2, 4, 5, 7, 9, 11];
    expect(degrePlusProche(69.4, majeure)).toBe(69);
    expect(degrePlusProche(70.4, majeure)).toBe(71);
    expect(degrePlusProche(69, majeure)).toBe(69);
  });

  it("LA TOUCHE D'UN CLAVIER : un quart de ton n'a pas de touche, et il faut le dire", () => {
    // Un clavier tempéré n'a pas de touche pour 69,5. La question n'est pas de lui en trouver une,
    // c'est que la recherche ne rende pas n'importe quoi.
    const d = disposition(21, 108, 12);
    const touche = [...d.blanches, ...d.noires].find((k) => k.note === 69.5);
    expect(touche, "une touche exacte pour 69,5 ne doit pas exister").toBeUndefined();
    const proche = [...d.blanches, ...d.noires].find((k) => k.note === Math.round(69.5));
    expect(proche, "l'arrondi, lui, doit trouver une touche").toBeDefined();
  });
});
