// plugins/glissando-harmonique.ts — Un accord qui glisse vers un autre, sans qu'aucune note soit posée.
//
// LE CALCUL EST DANS `audio/glissando.ts`, ÉPROUVÉ, et l'en-tête de ce fichier-là dit pourquoi la
// sortie est un son et non du MIDI, et pourquoi le glissement est linéaire en demi-tons. Ce fichier
// n'est que la prise.
//
// LES INTERVALLES VIENNENT DE LA TABLE COMMUNE, `audio/qualites-accords.ts` : ce composant ne sait
// pas ce qu'est un accord de treizième, il sait le faire glisser.

import type { FicheAudio } from "../audio/types-domaine";
import { QUALITES, notesDaccord } from "../audio/qualites-accords";
import { tamponDuGlissando, trajetDesVoix, voixDuGlissando } from "../audio/glissando";
import { CLES, PARAMETRE_TONIQUE, alterationDe } from "../audio/cles";
import { langueCourante } from "../i18n";
import { avecDoc } from "./notices";

const en = () => langueCourante() === "en";

const RENVERSEMENT_MAX = Math.max(...QUALITES.map((q) => q.intervalles.length)) - 1;

/** Les trois réglages d'un côté, déclarés une fois pour les deux. */
function cote(suffixeFr: string, suffixeEn: string, octaveDefaut: number) {
  return [
    { nom: `Accord ${suffixeFr}`, nomEn: `${suffixeEn} chord`, type: "choix" as const,
      options: QUALITES.map((q) => q.fr), optionsEn: QUALITES.map((q) => q.en),
      optionIds: QUALITES.map((q) => q.id), defaut: QUALITES[0].fr, defautEn: QUALITES[0].en,
      doc: `La qualité de l'accord ${suffixeFr}. Ses intervalles viennent de la table commune des accords.`,
      docEn: `The quality of the ${suffixeEn.toLowerCase()} chord. Its intervals come from the common chord table.` },
    { ...PARAMETRE_TONIQUE, nom: `Fondamentale ${suffixeFr}`, nomEn: `${suffixeEn} root`,
      doc: `La fondamentale de l'accord ${suffixeFr}.`,
      docEn: `The root of the ${suffixeEn.toLowerCase()} chord.` },
    { nom: `Octave ${suffixeFr}`, nomEn: `${suffixeEn} octave`, type: "curseur" as const,
      plage: [0, 8] as [number, number], pas: 1, defaut: octaveDefaut,
      doc: `L'octave de cette fondamentale. Quatre place le do central.`,
      docEn: `That root's octave. Four places middle C.` },
    { nom: `Renversement ${suffixeFr}`, nomEn: `${suffixeEn} inversion`, type: "curseur" as const,
      plage: [0, RENVERSEMENT_MAX] as [number, number], pas: 1, defaut: 0,
      doc: `Monte d'une octave les notes du bas de cet accord. C'est ce qui décide quelle voix part vers quelle voix, donc l'ampleur des glissements.`,
      docEn: `Moves this chord's bottom notes up an octave. It decides which voice goes to which, hence how wide the glides are.` },
  ];
}

export const fiches: FicheAudio[] = ([
  {
    id: "glissando-harmonique", nom: "Glissando harmonique", nomEn: "Harmonic Glissando",
    univers: "Entrées", famille: "Génération",
    resume: "Fait glisser un accord entier vers un autre, chaque voix rejoignant la sienne sans jamais se poser.",
    resumeEn: "Slides a whole chord into another, each voice joining its own without ever settling.",
    notice: `Fait entendre un accord, le fait glisser vers un second, et tient celui-ci. Aucune note n'est jamais posée pendant le trajet : chaque voix passe par toutes les hauteurs intermédiaires, y compris celles qu'aucun clavier ne porte.

C'est le mouvement que les cordes savent faire et qu'un instrument à touches ne peut pas. L'harmonie s'y déplace entière, et ce qu'on entend au milieu du trajet n'est aucun des deux accords.

« Accord de départ », « Fondamentale de départ », « Octave de départ » et « Renversement de départ » décrivent le premier agrégat ; les quatre réglages d'arrivée décrivent le second, de la même façon.

Le renversement décide de la conduite des voix. Les voix se correspondent rang par rang, de la plus grave à la plus aiguë : renverser un des deux accords change donc quelle voix rejoint laquelle, et l'ampleur de chaque glissement. C'est le seul réglage qui agisse sur le dessin du mouvement et non sur ses extrémités.

Les voix surnuméraires tiennent sur place, et entrent ou sortent. Deux accords de tailles différentes n'ont pas de correspondance évidente : le nombre de voix est celui du plus fourni, et une voix sans vis-à-vis garde sa hauteur au lieu de se voir attribuer une destination que personne n'a écrite.

Tenir sa hauteur n'est pas sonner. Une voix qui n'appartient qu'à l'accord d'arrivée entre pendant le glissement, et une voix qui n'appartient qu'à celui de départ en sort : chaque accord tenu est donc exactement lui-même, quel que soit l'autre. Le niveau suit la même règle, réparti sur ce qui sonne à chaque instant et non sur le nombre total de voix. Le trajet dit ce qui entre et ce qui sort, voix par voix.

« Tenue initiale » et « Tenue finale » sont les temps pendant lesquels chaque accord est tenu. Sans elles on n'entendrait que le mouvement et non ce qui bouge.

« Glissement » est la durée du trajet. À zéro, l'accord bascule d'un coup.

Le glissement est régulier en demi-tons, et non en hertz. Une octave parcourue en hertz passe son premier quart de temps dans son premier demi-ton, ce qui s'entend comme un départ traînant suivi d'une ruée ; en demi-tons, chaque instant vaut le même intervalle, et à mi-chemin d'une octave la voix est au triton.

« Richesse » est le nombre de partiels harmoniques de chaque voix. Un seul donne une sinusoïde, et l'agrégat s'entend alors tel qu'il est écrit. Au-delà, les partiels glissent avec leur fondamentale et épaississent le son sans rien ajouter qu'elle n'ait déjà.

« Volume » règle le niveau de crête. Il tient compte du nombre de voix et de partiels, de sorte qu'un agrégat fourni n'écrête pas.

La sortie « Audio » porte le son. Il n'y a pas de sortie MIDI : un fichier MIDI ne sait pas porter un glissement, son numéro de note étant un octet et sa molette de hauteur n'ayant qu'une valeur par canal, donc une seule courbe pour toutes les voix.

La sortie « Trajet » donne, voix par voix, la note de départ, celle d'arrivée et l'écart en demi-tons, les voix tenues étant nommées comme telles.`,
    noticeEn: `Sounds a chord, slides it into a second one, and holds that one. No note is ever settled during the journey: each voice passes through every intermediate pitch, including those no keyboard carries.

This is the motion strings can make and a keyboard instrument cannot. The harmony moves whole, and what is heard midway is neither of the two chords.

« Start chord », « Start root », « Start octave » and « Start inversion » describe the first aggregate; the four arrival settings describe the second, in the same way.

The inversion decides the voice leading. Voices correspond rank by rank, from lowest to highest: inverting either chord therefore changes which voice joins which, and how wide each glide is. It is the only setting that acts on the shape of the motion rather than on its endpoints.

Surplus voices hold in place, and enter or leave. Two chords of different sizes have no obvious correspondence: the number of voices is that of the fuller one, and a voice with no counterpart keeps its pitch rather than being given a destination nobody wrote.

Holding a pitch is not sounding. A voice belonging only to the arrival chord enters during the glide, and one belonging only to the starting chord leaves: each held chord is therefore exactly itself, whatever the other one is. The level follows the same rule, spread over what sounds at each instant rather than over the total number of voices. The journey says what enters and what leaves, voice by voice.

« Opening hold » and « Closing hold » are the times each chord is held. Without them one would hear only the motion and not what is moving.

« Glide » is the journey's length. At zero, the chord switches at once.

The glide is even in semitones, not in hertz. An octave covered in hertz spends its first quarter of the time within its first semitone, which is heard as a dragging start followed by a rush; in semitones every instant is worth the same interval, and midway through an octave the voice is at the tritone.

« Richness » is the number of harmonic partials per voice. One gives a sine, and the aggregate is then heard exactly as written. Beyond that, the partials glide with their fundamental and thicken the sound without adding anything it did not already have.

« Volume » sets the peak level. It accounts for the number of voices and partials, so a full aggregate does not clip.

The « Audio » output carries the sound. There is no MIDI output: a MIDI file cannot carry a glide, its note number being a byte and its pitch wheel having one value per channel, hence a single curve for every voice.

The « Journey » output gives, voice by voice, the starting note, the arrival note and the gap in semitones, held voices being named as such.`,
    entrees: [],
    sorties: [
      { nom: "Audio", type: "audio" },
      { nom: "Trajet", nomEn: "Journey", type: "texte" },
    ],
    parametres: [
      ...cote("de départ", "Start", 3),
      ...cote("d'arrivée", "Arrival", 4),
      { nom: "Tenue initiale", nomEn: "Opening hold", type: "curseur", plage: [0, 10], pas: 0.1, defaut: 1, unite: "s",
        doc: "Le temps pendant lequel l'accord de départ est tenu avant de glisser.",
        docEn: "The time the starting chord is held before gliding." },
      { nom: "Glissement", nomEn: "Glide", type: "curseur", plage: [0, 60], pas: 0.1, defaut: 4, unite: "s",
        doc: "La durée du trajet. À zéro, l'accord bascule d'un coup.",
        docEn: "The journey's length. At zero, the chord switches at once." },
      { nom: "Tenue finale", nomEn: "Closing hold", type: "curseur", plage: [0, 10], pas: 0.1, defaut: 1, unite: "s",
        doc: "Le temps pendant lequel l'accord d'arrivée est tenu après le trajet.",
        docEn: "The time the arrival chord is held after the journey." },
      { nom: "Richesse", nomEn: "Richness", type: "curseur", plage: [1, 12], pas: 1, defaut: 4,
        unite: " partiels", uniteEn: " partials",
        doc: "Le nombre de partiels harmoniques par voix. Un seul donne une sinusoïde.",
        docEn: "The number of harmonic partials per voice. One gives a sine." },
      { nom: "Volume", nomEn: "Volume", type: "curseur", plage: [0, 100], pas: 1, defaut: 80, unite: "%",
        doc: "Le niveau de crête. Il tient compte du nombre de voix et de partiels.",
        docEn: "The peak level. It accounts for the number of voices and partials." },
    ],
    async executer(ctx: any) {
      const agregat = (suffixe: string, octaveDefaut: number) => {
        const qualite = ctx.paramTexte(`Accord ${suffixe}`, QUALITES[0].id);
        const demiTon = parseInt(ctx.paramTexte(`Fondamentale ${suffixe}`, "0"), 10) || 0;
        const octave = Math.round(ctx.paramNombre(`Octave ${suffixe}`, octaveDefaut));
        const renversement = Math.round(ctx.paramNombre(`Renversement ${suffixe}`, 0));
        const q = QUALITES.find((x) => x.id === qualite);
        return {
          notes: notesDaccord(qualite, (octave + 1) * 12 + demiTon, 1, renversement),
          nom: `${en() ? (CLES[demiTon] ?? CLES[0]).en : (CLES[demiTon] ?? CLES[0]).fr}${q ? q.symbole : ""}`,
          alteration: alterationDe(demiTon),
        };
      };
      const depart = agregat("de départ", 3);
      const arrivee = agregat("d'arrivée", 4);
      if (depart.notes.length === 0 && arrivee.notes.length === 0) {
        return { valeurs: [null, ""], erreur: true,
          message: en() ? "No note falls within MIDI's range." : "Aucune note ne tombe dans l'ambitus." };
      }

      const voix = voixDuGlissando(depart.notes, arrivee.notes);
      const tenueDepart = ctx.paramNombre("Tenue initiale", 1);
      const glissement = ctx.paramNombre("Glissement", 4);
      const tenueArrivee = ctx.paramNombre("Tenue finale", 1);
      const audio = tamponDuGlissando(voix, {
        tenueDepart, glissement, tenueArrivee,
        richesse: Math.round(ctx.paramNombre("Richesse", 4)),
        niveau: ctx.paramNombre("Volume", 80) / 100,
      });

      const tenues = voix.filter((v) => v.de === v.vers).length;
      const entete = en()
        ? `${depart.nom} → ${arrivee.nom}   (${voix.length} voices)`
        : `${depart.nom} → ${arrivee.nom}   (${voix.length} voix)`;
      const trajet = [entete, "",
        ...trajetDesVoix(voix, !en(), depart.alteration, arrivee.alteration)].join("\n");
      return {
        valeurs: [audio, trajet],
        message: `${depart.nom} → ${arrivee.nom} · ${voix.length} ${en() ? "voices" : "voix"}`
          + `${tenues > 0 ? ` · ${tenues} ${en() ? "held" : "tenue(s)"}` : ""}`
          + ` · ${audio.duration.toFixed(1)} s`,
      };
    },
  },
] as FicheAudio[]).map(avecDoc);
