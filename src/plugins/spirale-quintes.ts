// plugins/spirale-quintes.ts — Le cycle des quintes, qui n'en est pas un.
//
// Le calcul est dans `audio/spirale-quintes.ts`, testé ; ce fichier n'est que la prise.

import type { FicheAudio } from "../audio/types-domaine";
import { langueCourante } from "../i18n";
import { avecDoc } from "./notices";
import {
  CENTS_QUINTE_JUSTE, CENTS_QUINTE_TEMPEREE, NOMS_DEGRES, NOMS_DEGRES_EN,
  manqueFermeture, pasDeSpirale, rangsQuiFrolent,
} from "../audio/spirale-quintes";
import {
  sf2Chargee, normaliserModeSynthèse, decoderInstrumentSF2,
  PARAMETRE_SYNTHESE, PARAMETRE_INSTRUMENT_SF2,
} from "./soundfontGlobal";

/** Les trois quintes qui ont un nom, en cents. La mésotonique est celle du quart de comma. */
const QUINTES: Record<string, number> = {
  juste: CENTS_QUINTE_JUSTE,
  temperee: CENTS_QUINTE_TEMPEREE,
  mesotonique: 1200 * Math.log2(Math.pow(5, 1 / 4)),
};

const signe = (v: number) => (v >= 0 ? `+${v.toFixed(2)}` : v.toFixed(2));

export const fiches: FicheAudio[] = ([
  {
    id: "spirale-quintes", nom: "Spirale des quintes", nomEn: "Spiral of Fifths",
    // SA PLACE EST DANS LES ENTRÉES, et non parmi les traitements : il ne reçoit rien et fabrique un
    // son. Demandé par Fabien.
    univers: "Entrées", famille: "Génération",
    resume: "Empile des quintes justes et les replie dans une octave : le chemin ne revient jamais à son point de départ.",
    notice: "Empile des quintes et replie chaque note dans une octave. Le chemin ne revient jamais à son point de départ : ce qu'on appelle le cercle des quintes est une spirale.\n\nDouze quintes justes, de rapport 3/2, valent 8 423,96 cents ; sept octaves en valent 8 400. L'écart est le comma pythagoricien, 531441/524288, soit 23,46 cents. Aucune puissance de 3/2 n'est une puissance de 2, 2 et 3 étant premiers entre eux : le chemin ne se referme à aucun rang, et le tempérament égal le referme de force en rognant chaque quinte de 1,955 cent.\n\nL'écart au tempérament égal croît de 1,955 cent par pas, exactement. La spirale frôle sa fermeture à certains rangs sans jamais l'atteindre :\n• au douzième, il manque 23,46 cents, ce qui s'entend\n• au quarante et unième, 19,84 cents de l'autre côté\n• au cinquante-troisième, 3,62 cents, ce qui est la raison d'être du tempérament à cinquante-trois degrés\n\n« Quinte » choisit celle qui est empilée :\n• Juste, 701,955 cents, ne referme jamais le chemin\n• Tempérée, 700 cents exactement, le referme au douzième pas : c'est alors un cercle, et non une spirale\n• Mésotonique au quart de comma, 696,578 cents, le referme par l'autre côté, la spirale tournant en sens inverse\n\n« Jeu » décide de la façon d'entendre l'écart :\n• Successives : chaque quinte sonne seule, et la dérive se suit degré par degré\n• Empilées : chaque note reste jusqu'à la fin, et les battements entre voisines rendent l'écart audible au lieu d'être lu\n\nLes hauteurs sont fractionnaires, en demi-tons décimaux : un degré entier effacerait précisément l'écart que la spirale accumule. La sortie est de l'audio et non du MIDI, un fichier MIDI ne sachant pas porter une hauteur en centièmes sans pitch-bend par canal.\n\nLa sortie « Parcours » donne, pour chaque pas, le degré atteint, sa hauteur repliée en cents et son écart au degré égal le plus proche, puis les rangs qui frôlent la fermeture.\n\nD'après le comma décrit par les pythagoriciens, et l'exposition qu'en donne Leonhard Euler, Tentamen novae theoriae musicae, 1739.",
    resumeEn: "Stacks just fifths and folds them into one octave: the path never returns to its starting point.",
    noticeEn: "Stacks fifths and folds each note into one octave. The path never returns to its starting point: what is called the circle of fifths is a spiral.\n\nTwelve just fifths, of ratio 3/2, are worth 8,423.96 cents; seven octaves are worth 8,400. The difference is the Pythagorean comma, 531441/524288, that is 23.46 cents. No power of 3/2 is a power of 2, 2 and 3 being coprime: the path closes at no rank at all, and equal temperament closes it by force, shaving 1.955 cent off every fifth.\n\nThe deviation from equal temperament grows by 1.955 cent per step, exactly. The spiral comes close to closing at certain ranks without ever reaching it:\n• at the twelfth, 23.46 cents are missing, which is audible\n• at the forty-first, 19.84 cents on the other side\n• at the fifty-third, 3.62 cents, which is the reason fifty-three-tone temperament exists\n\n« Fifth » picks the one being stacked:\n• Just, 701.955 cents, never closes the path\n• Equal, exactly 700 cents, closes it at the twelfth step: a circle then, not a spiral\n• Quarter-comma meantone, 696.578 cents, closes it from the other side, the spiral turning the other way\n\n« Playing » decides how the deviation is heard:\n• One by one: each fifth sounds alone, and the drift is followed degree by degree\n• Stacked: every note stays to the end, and the beating between neighbours makes the deviation audible rather than read\n\nPitches are fractional, in decimal semitones: a whole degree would erase precisely the deviation the spiral accumulates. The output is audio rather than MIDI, a MIDI file being unable to carry a pitch in cents without per-channel pitch bend.\n\nThe « Journey » output gives, for each step, the degree reached, its folded pitch in cents and its deviation from the nearest equal degree, then the ranks that come closest to closing.\n\nAfter the comma described by the Pythagoreans, and the account Leonhard Euler gives of it in Tentamen novae theoriae musicae, 1739.",
    entrees: [],
    sorties: [
      { nom: "Audio", type: "audio" },
      { nom: "Parcours", nomEn: "Journey", type: "texte" },
    ],
    parametres: [
      { nom: "Quintes", nomEn: "Fifths", type: "curseur", plage: [1, 60], pas: 1, defaut: 12,
        doc: "Nombre de quintes empilées. Douze parcourent les douze degrés et manquent la fermeture de 23,46 cents. Cinquante-trois la manquent de 3,6 cents seulement.",
        docEn: "Number of stacked fifths. Twelve cover the twelve degrees and miss the closure by 23.46 cents. Fifty-three miss it by only 3.6 cents." },
      { nom: "Quinte", nomEn: "Fifth", type: "choix",
        options: ["Juste (3/2)", "Tempérée", "Mésotonique 1/4 de comma"],
        optionsEn: ["Just (3/2)", "Equal", "Quarter-comma meantone"],
        optionIds: ["juste", "temperee", "mesotonique"], defaut: "Juste (3/2)", defautEn: "Just (3/2)",
        doc: "La quinte empilée. Juste vaut 701,955 cents et ne referme jamais le chemin. Tempérée vaut 700 cents exactement et le referme au douzième pas : c'est alors un cercle et non une spirale. Mésotonique vaut 696,578 cents et le referme par l'autre côté, la spirale tournant en sens inverse.",
        docEn: "The fifth being stacked. Just is 701.955 cents and never closes the path. Equal is exactly 700 cents and closes it at the twelfth step: a circle then, not a spiral. Meantone is 696.578 cents and closes it from the other side, the spiral turning the other way." },
      { nom: "Sens", nomEn: "Direction", type: "choix",
        options: ["Monter", "Descendre"], optionsEn: ["Up", "Down"], optionIds: ["monter", "descendre"],
        defaut: "Monter", defautEn: "Up",
        doc: "Monter empile des quintes, descendre empile des quartes. L'écart au tempérament égal change de signe avec le sens.",
        docEn: "Up stacks fifths, down stacks fourths. The deviation from equal temperament changes sign with the direction." },
      { nom: "Jeu", nomEn: "Playing", type: "choix",
        options: ["Successives", "Empilées"], optionsEn: ["One by one", "Stacked"],
        optionIds: ["successives", "empilees"], defaut: "Successives", defautEn: "One by one",
        doc: "Successives : chaque quinte sonne seule, et l'on suit la dérive degré par degré. Empilées : chaque note reste jusqu'à la fin, et les battements entre voisines rendent l'écart audible au lieu d'être lu.",
        docEn: "One by one: each fifth sounds alone, and the drift is followed degree by degree. Stacked: every note stays to the end, and the beating between neighbours makes the deviation audible rather than read." },
      { nom: "Fondamentale", nomEn: "Fundamental", type: "curseur", plage: [55, 440], pas: 1, defaut: 220, unite: "Hz",
        doc: "Hauteur de la tonique, et bas de l'octave où tout est replié.",
        docEn: "Pitch of the tonic, and bottom of the octave everything is folded into." },
      { nom: "Durée par note", nomEn: "Note length", type: "curseur", plage: [0.1, 2], pas: 0.05, defaut: 0.45, unite: "s",
        doc: "Durée de chaque pas de la spirale.",
        docEn: "Length of each step of the spiral." },
      PARAMETRE_SYNTHESE,
      PARAMETRE_INSTRUMENT_SF2,
      { nom: "Volume", nomEn: "Volume", type: "curseur", plage: [0, 100], pas: 1, defaut: 80, unite: "%",
        doc: "Niveau du rendu sonore.", docEn: "Level of the rendered sound." },
    ],
    async executer(ctx: any) {
      const en = langueCourante() === "en";
      const nombre = Math.round(ctx.paramNombre("Quintes", 12));
      const centsQuinte = QUINTES[ctx.paramTexte("Quinte", "juste")] ?? CENTS_QUINTE_JUSTE;
      const sens: 1 | -1 = ctx.paramTexte("Sens", "monter") === "descendre" ? -1 : 1;
      const empilees = ctx.paramTexte("Jeu", "successives") === "empilees";
      const fondamentale = ctx.paramNombre("Fondamentale", 220);
      const pasSec = ctx.paramNombre("Durée par note", 0.45);

      const pas = pasDeSpirale(nombre, centsQuinte, sens);
      const noms = en ? NOMS_DEGRES_EN : NOMS_DEGRES;

      // LA HAUTEUR EST FRACTIONNAIRE, et c'est tout l'objet : un degré entier effacerait
      // précisément l'écart que la spirale accumule. Le rendu joue la note en demi-tons décimaux.
      const noteDe = (centsReplies: number) =>
        69 + 12 * Math.log2(fondamentale / 440) + centsReplies / 100;
      const fin = pas.length * pasSec;
      const notes = pas.map((p, i) => ({
        note: noteDe(p.centsReplies),
        velocite: 92,
        debut: i * pasSec,
        fin: empilees ? fin : (i + 1) * pasSec,
      }));

      const { rendreSequence } = await import("../audio");
      const mode = normaliserModeSynthèse(ctx.paramTexte("Synthèse", "Automatique"));
      const modeRendu: "FM/Oscillateurs" | "SoundFont" =
        mode === "SoundFont" || (mode === "Automatique" && sf2Chargee()) ? "SoundFont" : "FM/Oscillateurs";
      const { programme, banque } = decoderInstrumentSF2(ctx.paramNombre("Instrument", 0));
      const audio = await rendreSequence(
        notes, modeRendu, ctx.paramNombre("Volume", 80), Math.max(0, programme), Math.max(0, banque));

      const frolements = rangsQuiFrolent(Math.max(nombre, 53), centsQuinte)
        .filter((r) => r.rang <= Math.max(nombre, 53));
      const lignes = [
        `${en ? "Fifth" : "Quinte"} : ${centsQuinte.toFixed(3)} ${en ? "cents" : "cents"}`,
        "",
        ...pas.map((p) =>
          `  ${String(p.rang).padStart(3)}   ${noms[p.degreEgal].padEnd(4)} `
          + `${p.centsReplies.toFixed(2).padStart(8)} ${en ? "c" : "c"}   `
          + `${en ? "dev" : "écart"} ${signe(p.ecartCents).padStart(7)} c`),
        "",
        `${en ? "Missed closure after" : "Fermeture manquée après"} ${nombre} : `
        + `${signe(manqueFermeture(nombre, centsQuinte))} c`,
        "",
        `${en ? "Ranks that come closest" : "Rangs qui frôlent la fermeture"} :`,
        ...frolements.map((r) => `  ${String(r.rang).padStart(3)}   ${signe(r.manqueCents)} c`),
      ];

      const manque = manqueFermeture(nombre, centsQuinte);
      return {
        valeurs: [audio, lignes.join("\n")],
        message: `${pas.length} ${en ? "steps" : "pas"} · ${en ? "missed closure" : "fermeture manquée"} ${signe(manque)} c`,
      };
    },
  },
] as FicheAudio[]).map(avecDoc);
