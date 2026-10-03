// plugins/glissando-de-gamme.ts — Une gamme qui glisse vers une autre, degré par degré.
//
// LE SYMÉTRIQUE DU GLISSANDO HARMONIQUE, demandé par Fabien : « cela imposerait d'en faire un
// symétrique pour les gammes ». Le calcul est le même, dans `audio/glissando.ts` : seul change ce
// qui fournit les hauteurs.
//
// C'EST ICI QUE LE MICROTON SERT LE PLUS. Une gamme majeure qui devient un maqam Rast fait passer
// sa tierce par tous les quarts de ton intermédiaires, et aucune de ces hauteurs ne tombe sur une
// touche. Un clavier ne peut pas jouer ce trajet ; un glissement continu, si.

import type { FicheAudio } from "../audio/types-domaine";
import { GAMMES_REUNIES, degresDUneOctave } from "../audio/gammes-reunies";
import { trajetDesVoix, voixDuGlissando } from "../audio/glissando";
import { glissandoHorsFil } from "./glissando-hors-fil";
import { CLES, PARAMETRE_TONIQUE, alterationDe } from "../audio/cles";
import { langueCourante } from "../i18n";
import { avecDoc } from "./notices";

const en = () => langueCourante() === "en";


/** Les trois réglages d'un côté, déclarés une fois pour les deux. */
function cote(suffixeFr: string, suffixeEn: string, gamme: number, octaveDefaut: number) {
  return [
    { nom: `Gamme ${suffixeFr}`, nomEn: `${suffixeEn} scale`, type: "choix" as const,
      options: GAMMES_REUNIES.map((g) => g.fr), optionsEn: GAMMES_REUNIES.map((g) => g.en),
      optionIds: GAMMES_REUNIES.map((g) => g.id),
      defaut: GAMMES_REUNIES[gamme].fr, defautEn: GAMMES_REUNIES[gamme].en,
      doc: `La gamme ${suffixeFr}. Les premières de la liste sont comptées en demi-tons, les suivantes en cents.`,
      docEn: `The ${suffixeEn.toLowerCase()} scale. The first in the list are counted in semitones, the rest in cents.` },
    { ...PARAMETRE_TONIQUE, nom: `Tonique ${suffixeFr}`, nomEn: `${suffixeEn} tonic`,
      doc: `La tonique de cette gamme. Elle déplace tous ses degrés sans changer les écarts entre eux.`,
      docEn: `That scale's tonic. It moves every degree without changing the gaps between them.` },
    { nom: `Octave ${suffixeFr}`, nomEn: `${suffixeEn} octave`, type: "curseur" as const,
      plage: [0, 8] as [number, number], pas: 1, defaut: octaveDefaut,
      doc: `L'octave de cette tonique. Quatre place le do central.`,
      docEn: `That tonic's octave. Four places middle C.` },
  ];
}

export const fiches: FicheAudio[] = ([
  {
    id: "glissando-de-gamme", nom: "Glissando de gamme", nomEn: "Scale Glissando",
    univers: "Entrées", famille: "Génération",
    resume: "Fait glisser tous les degrés d'une gamme vers ceux d'une autre, chacun vers celui de même rang.",
    resumeEn: "Slides every degree of a scale onto another's, each onto the one of the same rank.",
    notice: `Fait entendre tous les degrés d'une gamme ensemble, les fait glisser vers ceux d'une seconde, et tient celle-ci. Chaque degré rejoint celui de même rang, et passe par toutes les hauteurs intermédiaires.

C'est là que le glissement continu sert le plus. Une gamme majeure qui devient un maqam Rast fait passer sa tierce par tous les quarts de ton intermédiaires, et aucune de ces hauteurs ne tombe sur une touche : le trajet est inaudible sur un clavier et se joue sans peine ici.

« Gamme de départ », « Tonique de départ » et « Octave de départ » décrivent la première ; les trois réglages d'arrivée décrivent la seconde, de la même façon.

La liste porte deux ensembles. Les premières gammes sont comptées en demi-tons et tombent donc sur les touches d'un clavier. Les suivantes sont comptées en cents : maqamat, ragas et gammes de gamelan. Les deux se mêlent librement, une gamme de départ tempérée pouvant rejoindre une gamme d'arrivée mesurée en cents.

L'octave de fermeture est écartée des deux côtés. Les gammes mesurées en cents portent leur octave comme un degré, les tempérées non : les garder ferait correspondre le premier degré de l'une au second de l'autre, et le trajet ne voudrait plus rien dire. Chaque gamme est donc ramenée à ses degrés sous l'octave.

Les degrés surnuméraires tiennent sur place, et entrent ou sortent. Une pentatonique à cinq degrés vers une chromatique à douze laisse sept voix sans origine : elles gardent leur hauteur au lieu de se voir attribuer un départ que personne n'a écrit.

Tenir sa hauteur n'est pas sonner. Une voix qui n'appartient qu'à la gamme d'arrivée entre pendant le glissement, et une voix qui n'appartient qu'à celle de départ en sort : chaque gamme tenue est donc exactement elle-même, quelle que soit l'autre. Le niveau suit la même règle, réparti sur ce qui sonne à chaque instant et non sur le nombre total de voix. Le trajet dit ce qui entre et ce qui sort, voix par voix.

« Tenue initiale » et « Tenue finale » sont les temps pendant lesquels chaque gamme est tenue. Sans elles on n'entendrait que le mouvement et non ce qui bouge.

« Glissement » est la durée du trajet. À zéro, la gamme bascule d'un coup.

Le glissement est régulier en demi-tons, et non en hertz : chaque instant vaut le même intervalle, et le mouvement s'entend régulier d'un bout à l'autre.

« Richesse » est le nombre de partiels harmoniques de chaque voix. Un seul donne une sinusoïde, et l'agrégat s'entend alors tel qu'il est écrit.

« Volume » règle le niveau de crête. Il tient compte du nombre de voix et de partiels, de sorte qu'une gamme de douze degrés n'écrête pas.

La sortie « Audio » porte le son. Il n'y a pas de sortie MIDI : un fichier MIDI ne sait pas porter un glissement, et il ne saurait pas davantage porter un quart de ton.

La sortie « Trajet » donne, degré par degré, la note de départ, celle d'arrivée et l'écart en demi-tons. Une note qui ne tombe pas sur une touche y porte son écart en cents.`,
    noticeEn: `Sounds every degree of a scale together, slides them onto a second scale's, and holds that one. Each degree joins the one of the same rank, passing through every intermediate pitch.

This is where a continuous glide is worth the most. A major scale becoming maqam Rast sends its third through every intermediate quarter tone, and none of those pitches falls on a key: the journey is unplayable on a keyboard and easy here.

« Start scale », « Start tonic » and « Start octave » describe the first one; the three arrival settings describe the second, in the same way.

The list carries two sets. The first scales are counted in semitones and therefore fall on a keyboard's keys. The rest are counted in cents: maqamat, ragas and gamelan scales. The two mix freely, a tempered starting scale being able to reach an arrival scale measured in cents.

The closing octave is dropped on both sides. Scales measured in cents carry their octave as a degree, tempered ones do not: keeping them would match one scale's first degree to the other's second, and the journey would mean nothing. Each scale is therefore reduced to its degrees below the octave.

Surplus degrees hold in place, and enter or leave. A five-degree pentatonic towards a twelve-degree chromatic leaves seven voices with no origin: they keep their pitch rather than being given a start nobody wrote.

Holding a pitch is not sounding. A voice belonging only to the arrival scale enters during the glide, and one belonging only to the starting scale leaves: each held scale is therefore exactly itself, whatever the other one is. The level follows the same rule, spread over what sounds at each instant rather than over the total number of voices. The journey says what enters and what leaves, voice by voice.

« Opening hold » and « Closing hold » are the times each scale is held. Without them one would hear only the motion and not what is moving.

« Glide » is the journey's length. At zero, the scale switches at once.

The glide is even in semitones, not in hertz: every instant is worth the same interval, and the motion is heard as even throughout.

« Richness » is the number of harmonic partials per voice. One gives a sine, and the aggregate is then heard exactly as written.

« Volume » sets the peak level. It accounts for the number of voices and partials, so a twelve-degree scale does not clip.

The « Audio » output carries the sound. There is no MIDI output: a MIDI file cannot carry a glide, and could carry a quarter tone no better.

The « Journey » output gives, degree by degree, the starting note, the arrival note and the gap in semitones. A note that does not fall on a key carries its offset in cents.`,
    entrees: [],
    sorties: [
      { nom: "Audio", type: "audio" },
      { nom: "Trajet", nomEn: "Journey", type: "texte" },
    ],
    parametres: [
      ...cote("de départ", "Start", 0, 3),
      ...cote("d'arrivée", "Arrival", GAMMES_REUNIES.findIndex((g) => g.id === "rast"), 3),
      { nom: "Tenue initiale", nomEn: "Opening hold", type: "curseur", plage: [0, 10], pas: 0.1, defaut: 1.5, unite: "s",
        doc: "Le temps pendant lequel la gamme de départ est tenue avant de glisser.",
        docEn: "The time the starting scale is held before gliding." },
      { nom: "Glissement", nomEn: "Glide", type: "curseur", plage: [0, 60], pas: 0.1, defaut: 6, unite: "s",
        doc: "La durée du trajet. À zéro, la gamme bascule d'un coup.",
        docEn: "The journey's length. At zero, the scale switches at once." },
      { nom: "Tenue finale", nomEn: "Closing hold", type: "curseur", plage: [0, 10], pas: 0.1, defaut: 1.5, unite: "s",
        doc: "Le temps pendant lequel la gamme d'arrivée est tenue après le trajet.",
        docEn: "The time the arrival scale is held after the journey." },
      { nom: "Richesse", nomEn: "Richness", type: "curseur", plage: [1, 12], pas: 1, defaut: 3,
        unite: " partiels", uniteEn: " partials",
        doc: "Le nombre de partiels harmoniques par voix. Un seul donne une sinusoïde.",
        docEn: "The number of harmonic partials per voice. One gives a sine." },
      { nom: "Volume", nomEn: "Volume", type: "curseur", plage: [0, 100], pas: 1, defaut: 80, unite: "%",
        doc: "Le niveau de crête. Il tient compte du nombre de voix et de partiels.",
        docEn: "The peak level. It accounts for the number of voices and partials." },
    ],
    async executer(ctx: any) {
      const agregat = (suffixe: string, defaut: string) => {
        const id = ctx.paramTexte(`Gamme ${suffixe}`, defaut);
        const demiTon = parseInt(ctx.paramTexte(`Tonique ${suffixe}`, "0"), 10) || 0;
        const octave = Math.round(ctx.paramNombre(`Octave ${suffixe}`, 3));
        // L'OCTAVE DE FERMETURE EST ÉCARTÉE : une gamme en cents la porte, une gamme tempérée non,
        // et les garder ferait correspondre le premier degré de l'une au second de l'autre.
        const degres = degresDUneOctave(id, false) ?? [];
        const tonique = (octave + 1) * 12 + demiTon;
        const g = GAMMES_REUNIES.find((x) => x.id === id);
        return {
          notes: degres.map((d) => tonique + d).filter((n) => n >= 0 && n <= 127),
          nom: `${en() ? (CLES[demiTon] ?? CLES[0]).en : (CLES[demiTon] ?? CLES[0]).fr} ${g ? (en() ? g.en : g.fr) : id}`,
          temperee: g?.temperee ?? true,
          alteration: alterationDe(demiTon),
        };
      };
      const depart = agregat("de départ", GAMMES_REUNIES[0].id);
      const arrivee = agregat("d'arrivée", "rast");
      if (depart.notes.length === 0 && arrivee.notes.length === 0) {
        return { valeurs: [null, ""], erreur: true,
          message: en() ? "No degree falls within range." : "Aucun degré ne tombe dans l'ambitus." };
      }

      const voix = voixDuGlissando(depart.notes, arrivee.notes);
      const audio = await glissandoHorsFil({
        voix,
        tenueDepart: ctx.paramNombre("Tenue initiale", 1.5),
        glissement: ctx.paramNombre("Glissement", 6),
        tenueArrivee: ctx.paramNombre("Tenue finale", 1.5),
        richesse: Math.round(ctx.paramNombre("Richesse", 3)),
        niveau: ctx.paramNombre("Volume", 80) / 100,
      });

      const tenues = voix.filter((v) => v.de === v.vers).length;
      // Les degrés qui ne tombent pas sur une touche, des deux côtés : c'est ce qu'un clavier ne
      // pourrait pas jouer, et donc ce que ce composant apporte.
      const horsClavier = voix.filter((v) => Math.abs(v.vers - Math.round(v.vers)) > 0.05).length;
      const entete = `${depart.nom} → ${arrivee.nom}   (${voix.length} ${en() ? "voices" : "voix"})`;
      const trajet = [entete, "",
        ...trajetDesVoix(voix, !en(), depart.alteration, arrivee.alteration)].join("\n");
      return {
        valeurs: [audio, trajet],
        message: `${depart.nom} → ${arrivee.nom} · ${voix.length} ${en() ? "voices" : "voix"}`
          + `${tenues > 0 ? ` · ${tenues} ${en() ? "held" : "tenue(s)"}` : ""}`
          + `${horsClavier > 0 ? ` · ${horsClavier} ${en() ? "off the keys" : "hors du clavier"}` : ""}`
          + ` · ${audio.duration.toFixed(1)} s`,
      };
    },
  },
] as FicheAudio[]).map(avecDoc);
