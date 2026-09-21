// plugins/particules.ts — Le nœud « Particules ». L'orchestre est dans `audio/particules.ts`,
// éprouvé argument par argument ; ici, la prise.
//
// CE NŒUD EST UN RENONCEMENT REPRIS. `partikkel`, le modèle unifié de Brandtsegg, avait été écarté
// du catalogue après trois formulations refusées par le compilateur — la note en est restée dans
// `csound-opcodes.ts`, et un test verrouillait l'abandon. L'opcode était pourtant là depuis le
// début : le portage WebAssembly le porte, et son refus parlait des TYPES d'arguments, non de son
// absence. Deux pièges tenaient tout : six arguments exigent une variable à taux audio, et les
// tables de masques commencent à l'indice 2, les deux premiers portant des bornes de boucle.
//
// POURQUOI UN SEUL NŒUD POUR CINQ PROCÉDÉS. Parce que c'est la thèse de l'article, et qu'elle
// s'entend : grains, pulsars, glissons, trainlets et granulation d'un son enregistré — sur une
// grille ou calée sur sa période — ne sont pas six techniques mais un seul générateur réglé
// autrement. Six nœuds séparés l'auraient caché ;
// ici on change un choix et l'on entend ce qui les sépare.

import type { FicheAudio } from "../audio/types-domaine";
import { langueCourante } from "../i18n";
import { avecDoc } from "./notices";
import { construireCsd, rendreCsd, premiereErreur, type EntreeFichier } from "../audio/csound";
import {
  ESPECES, EST_ESPECE, especeTenable, graineParticules, orchestreParticules, partitionParticules,
  type Espece, type ReglagesParticules,
} from "../audio/particules";
import { suivreHauteur } from "../audio/hauteur";

/**
 * Les hauteurs du son branché, par le suiveur pYIN du catalogue.
 *
 * C'est le même que celui du nœud « Suiveur de hauteur » et de la fiche technique : la période sur
 * laquelle les grains se calent est donc celle que l'utilisateur peut lire ailleurs, et non une
 * seconde estimation qui la contredirait.
 */
function hauteursDe(audio: AudioBuffer): number[] {
  const suivi = suivreHauteur(audio.getChannelData(0), audio.sampleRate, { cadence: 100 });
  return [...suivi.hauteurs].map((h, i) => (suivi.confiances[i] > 0.5 ? h : 0));
}

/** Le nom d'une espèce dans la langue lue. */
const nomEspece = (id: Espece, en: boolean): string => {
  const e = ESPECES.find((x) => x.id === id)!;
  return en ? e.en : e.fr;
};

export const fiches: FicheAudio[] = ([
  {
    id: "particules", nom: "Particules", nomEn: "Particles",
    // SA PLACE EST DANS LES TRAITEMENTS, et non parmi les sources. Il produit certes du son sans
    // rien recevoir — ce qui plaidait pour les Entrées, comme les pulsars —, mais c'est l'endroit
    // où on le CHERCHE qui décide : sur l'étagère du gel granulaire, du brassage, du mosaïquage et
    // des wavesets, tous des traitements. Un granulateur rangé parmi les générateurs serait
    // introuvable pour qui vient granuler un son. L'entrée audio reste facultative, puisque quatre
    // des cinq espèces fabriquent leur matière.
    univers: "Traitement", famille: "Effets",
    resume: "Un seul générateur pour sept espèces de particules : grains, pulsars, glissons, trainlets, grainlets, et la granulation d'un son branché — sur une grille, ou calée sur sa période.",
    resumeEn: "One generator for seven species of particle: grains, pulsars, glissons, trainlets, grainlets, and the granulation of a connected sound — on a grid, or locked to its period.",
    notice: "D'après Øyvind Brandtsegg, Sigurd Saue et Thom Johansen, « Particle synthesis — a unified model for granular synthesis », Linux Audio Conference, 2011 — l'opcode `partikkel` de Csound. La thèse de l'article : les variétés de synthèse granulaire ne sont pas des techniques distinctes mais un même générateur réglé autrement. Ce nœud en expose sept, et l'on passe de l'une à l'autre par un choix.\n\nLes grains sont le cas ordinaire : une forme d'onde brève, répétée à une cadence. La cadence donne la hauteur entendue dès qu'elle dépasse une vingtaine par seconde ; en dessous, on compte les grains.\n\nLes pulsars découplent deux durées, et c'est tout leur intérêt. Chez eux, la durée du grain se compte en cycles de la forme d'onde au lieu de suivre la cadence : la cadence fixe alors la fondamentale, et la fréquence fixe le formant, indépendamment l'un de l'autre. Aucun instrument acoustique ne le permet.\n\nLes glissons donnent à chaque grain sa propre trajectoire de fréquence : le grain n'est plus un point mais un vecteur. Le réglage de transposition dit de combien il monte ou descend pendant sa brève existence.\n\nLes trainlets remplacent la forme d'onde par un train d'impulsions à bande limitée, dont on règle le nombre de partiels. Ils sonnent comme des clics qui ont une hauteur — mesuré, à douze partiels ils portent près de 27 % de leur énergie au-dessus de quatre kilohertz, contre deux dixièmes de pour-cent pour un grain sinusoïdal, et leur facteur de crête passe de 6 à 16 décibels.\n\nLes grainlets lient deux réglages l'un à l'autre, ce qui est leur seule définition. La fréquence parcourt l'intervalle donné par la transposition au fil de la note, et la durée du grain la suit : chaque grain porte alors le même nombre de cycles, les aigus courts et les graves longs, comme le fait une ondelette. Sans cette liaison, un balayage de deux octaves laisserait les grains graves à quatre cycles et les aigus à seize, et l'on entendrait le grain changer de nature en chemin. C'est l'espèce la plus discrète des sept : elle ne fabrique pas un timbre nouveau, elle empêche un timbre de dériver.\n\nLa granulation prend le son branché sur l'entrée et le lit par grains. C'est là que la position et la vitesse servent : à vitesse nulle, la tête de lecture ne bouge plus et l'on obtient un gel granulaire ; à un demi, le son dure deux fois plus longtemps sans changer de hauteur ; en négatif, il se lit à l'envers. Sans son branché, l'espèce retombe sur les grains et le nœud le dit plutôt que d'échouer.\n\nLa granulation synchrone cale les grains sur la période du son au lieu d'une grille régulière, et c'est ce qui sépare une granulation propre d'une granulation qui grésille. Une grille impose sa cadence au son : mesuré sur une scie à 220 hertz, granuler à soixante grains par seconde ne laisse plus aucune hauteur tenue, et à cent cinquante la hauteur mesurée tombe à 73 hertz — celle de la grille, non celle du son. Calée sur la période, la même granulation rend 220,14 hertz, soit la hauteur d'origine à trois centièmes de hertz près. La période est lue par le suiveur pYIN du catalogue, celui-là même qu'affiche le « Suiveur de hauteur » : les deux nœuds ne peuvent pas se contredire. Dans cette espèce, la densité et la dispersion ne commandent rien, puisque c'est le son qui donne la cadence ; la durée du grain, elle, se compte en périodes.\n\nLa largeur spatiale éparpille les grains entre les deux canaux : chacun reçoit sa propre place au lieu que le son entier se déplace d'un bloc. C'est ce qui sépare une granulation d'un panoramique — l'oreille en tire un nuage, non une direction. Mesuré sur cent vingt grains par seconde : la corrélation des deux canaux passe de 1,00 à 0,31 entre largeur nulle et pleine ouverture, l'équilibre reste nul de bout en bout, et la sonie ne bouge pas d'un centième de décibel — à −16,91 LUFS aux quatre réglages essayés. Les positions vont par paires miroir, et l'amplitude est corrigée de ce que l'éparpillement ajouterait d'énergie : une largeur qui rend plus fort se juge meilleure pour la mauvaise raison.\n\nLa dispersion désordonne les instants. À zéro, les grains tombent sur une grille régulière et l'oreille entend une hauteur ; en montant, la grille se brouille et la hauteur cède la place à une texture. C'est le passage du synchrone à l'asynchrone, qui se fait ici par un seul curseur.",
    noticeEn: "After Oyvind Brandtsegg, Sigurd Saue and Thom Johansen, « Particle synthesis — a unified model for granular synthesis », Linux Audio Conference, 2011 — Csound's `partikkel` opcode. The paper's thesis: the varieties of granular synthesis are not distinct techniques but one generator set differently. This node exposes seven of them, and a single choice moves from one to the next.\n\nGrains are the ordinary case: a brief waveform, repeated at a rate. The rate gives the pitch heard as soon as it passes some twenty per second; below that, grains can be counted.\n\nPulsars decouple two durations, and therein lies their point. For them the grain duration counts in cycles of the waveform instead of following the rate: the rate then sets the fundamental, and the frequency sets the formant, independently of each other. No acoustic instrument allows this.\n\nGlissons give each grain its own frequency trajectory: the grain is no longer a point but a vector. The transposition setting says how far it rises or falls during its brief existence.\n\nTrainlets replace the waveform with a band-limited impulse train, whose number of partials is set. They sound like clicks that have a pitch — measured, at twelve partials they carry close to 27 % of their energy above four kilohertz, against two tenths of a percent for a sine grain, and their crest factor rises from 6 to 16 decibels.\n\nGrainlets tie two settings to one another, which is their whole definition. Frequency travels the interval given by the transposition across the note, and grain duration follows it: each grain then carries the same number of cycles, high ones short and low ones long, as a wavelet does. Without that link, a two-octave sweep would leave the low grains at four cycles and the high ones at sixteen, and the grain would be heard changing nature on the way. It is the quietest of the seven species: it does not make a new timbre, it stops a timbre from drifting.\n\nGranulation takes the sound connected to the input and reads it in grains. That is where position and speed serve: at zero speed the read head stops moving and you get a granular freeze; at one half the sound lasts twice as long without changing pitch; negative, it reads backwards. With no sound connected the species falls back to grains and the node says so rather than failing.\n\nPitch-synchronous granulation locks the grains to the sound's period instead of a regular grid, and that is what separates a clean granulation from one that buzzes. A grid imposes its own rate on the sound: measured on a 220 hertz sawtooth, granulating at sixty grains per second leaves no sustained pitch at all, and at a hundred and fifty the measured pitch drops to 73 hertz — the grid's, not the sound's. Locked to the period, the same granulation returns 220.14 hertz, the original pitch to within three hundredths of a hertz. The period is read by the catalog's pYIN follower, the very one the « Pitch Follower » shows: the two nodes cannot contradict each other. In this species, density and dispersion command nothing, since the sound gives the rate; grain duration, for its part, counts in periods.\n\nSpatial width scatters the grains between the two channels: each one gets its own place instead of the whole sound moving as a block. That is what separates granulation from panning — the ear draws a cloud from it, not a direction. Measured on a hundred and twenty grains per second: the correlation of the two channels goes from 1.00 to 0.31 between zero width and full opening, balance stays at nil throughout, and loudness does not move by a hundredth of a decibel — -16.91 LUFS at all four settings tried. Positions come in mirrored pairs, and amplitude is corrected for what the scattering would add in energy: a width that makes things louder gets judged better for the wrong reason.\n\nDispersion disorders the instants. At zero, grains land on a regular grid and the ear hears a pitch; going up, the grid blurs and pitch gives way to texture. That is the passage from synchronous to asynchronous, done here with one slider.",
    entrees: [{ nom: "Audio", nomEn: "Audio", type: "audio", requis: false }],
    sorties: [
      { nom: "Audio", nomEn: "Audio", type: "audio" },
      { nom: "Rapport", nomEn: "Report", type: "texte" },
    ],
    parametres: [
      { nom: "Espèce", nomEn: "Species", type: "choix",
        options: ESPECES.map((e) => e.fr), optionsEn: ESPECES.map((e) => e.en),
        optionIds: ESPECES.map((e) => e.id), defaut: "Grains", defautEn: "Grains",
        doc: "Les cinq réglages du même générateur. Grains : une forme d'onde brève répétée. Pulsars : la durée du grain compte en cycles, si bien que le formant ne suit plus la cadence. Glissons : chaque grain balaie sa propre fréquence. Trainlets : le grain est un train d'impulsions, et « Partiels » en règle la richesse. Grainlets : la fréquence balaie l'intervalle de « Transposition » et la durée du grain la suit, si bien que chaque grain porte le même nombre de cycles. Granulation : le son branché sur l'entrée est lu par grains, et « Position » et « Vitesse » commandent la tête de lecture. Granulation synchrone : la même, mais les grains se calent sur la période du son au lieu d'une grille, ce qui en garde la hauteur.",
        docEn: "Five settings of one generator. Grains: a brief waveform repeated. Pulsars: grain duration counts in cycles, so the formant no longer follows the rate. Glissons: each grain sweeps its own frequency. Trainlets: the grain is an impulse train, and « Partials » sets its richness. Grainlets: frequency sweeps the interval given by « Transposition » and grain duration follows it, so every grain carries the same number of cycles. Granulation: the sound connected to the input is read in grains, and « Position » and « Speed » drive the read head. Pitch-synchronous granulation: the same, but grains lock to the sound's period instead of a grid, which keeps its pitch." },
      { nom: "Densité", nomEn: "Density", type: "curseur", plage: [1, 500], pas: 1, defaut: 60, unite: "grains/s",
        doc: "Grains par seconde — sans effet sur la granulation synchrone, dont la cadence vient du son. Sous une vingtaine, on les compte et le nœud sonne comme un rythme ; au-dessus, ils fusionnent et la cadence devient une hauteur — c'est le continuum entre rythme et hauteur, franchi par un seul curseur.",
        docEn: "Grains per second — without effect on pitch-synchronous granulation, whose rate comes from the sound. Below some twenty, you count them and the node sounds like a rhythm; above, they fuse and the rate becomes a pitch — the continuum between rhythm and pitch, crossed with one slider." },
      { nom: "Durée du grain", nomEn: "Grain duration", type: "curseur", plage: [1, 400], pas: 1, defaut: 50, unite: "%",
        doc: "La durée d'un grain, en pour-cent de ce qui sépare deux grains. Sous cent, les grains ne se touchent pas et le silence entre eux s'entend ; au-delà, ils se recouvrent et la texture se remplit. Pour un pulsar, ce pour-cent se compte en cycles de la forme d'onde, ce qui est précisément ce qui détache le formant de la fondamentale.",
        docEn: "A grain's duration, as a percentage of what separates two grains. Below one hundred the grains do not touch and the silence between them is heard; beyond, they overlap and the texture fills in. For a pulsar this percentage counts in cycles of the waveform, which is exactly what detaches the formant from the fundamental." },
      { nom: "Fréquence", nomEn: "Frequency", type: "curseur", plage: [20, 8000], pas: 1, defaut: 440, unite: "Hz",
        doc: "La fréquence de la forme d'onde à l'intérieur du grain. Pour un pulsar, c'est la position du formant ; pour un trainlet, la cadence des impulsions du train. Sans effet sur la granulation, dont le contenu vient du son branché.",
        docEn: "The frequency of the waveform inside the grain. For a pulsar it is the formant position; for a trainlet, the rate of the train's impulses. It does nothing for granulation, whose content comes from the connected sound." },
      { nom: "Transposition", nomEn: "Transposition", type: "curseur", plage: [-24, 24], pas: 1, defaut: 0, unite: "demi-tons", uniteEn: "semitones",
        doc: "Pour un grainlet, l'intervalle que la fréquence parcourt au fil de la note, et que la durée du grain suit. Pour un glisson, l'écart que chaque grain parcourt pendant sa brève existence : le grain part de sa fréquence et arrive ici. Pour une granulation, la hauteur à laquelle les grains du son branché sont relus, la durée ne bougeant pas. Sans effet sur les autres espèces.",
        docEn: "For a grainlet, the interval frequency travels across the note, and which grain duration follows. For a glisson, the interval each grain travels during its brief existence: the grain starts at its frequency and arrives here. For granulation, the pitch at which the connected sound's grains are replayed, duration unchanged. It does nothing for the other species." },
      { nom: "Partiels", nomEn: "Partials", type: "curseur", plage: [1, 40], pas: 1, defaut: 8,
        doc: "Le nombre de partiels d'un trainlet, c'est-à-dire la largeur de bande de son train d'impulsions. À un, il n'en reste qu'une sinusoïde ; à quarante, un clic franc. Sans effet sur les autres espèces, qui n'ont pas de train.",
        docEn: "A trainlet's number of partials, that is, the bandwidth of its impulse train. At one, only a sine remains; at forty, a sharp click. It does nothing for the other species, which have no train." },
      { nom: "Dispersion", nomEn: "Dispersion", type: "curseur", plage: [0, 100], pas: 1, defaut: 0, unite: "%",
        doc: "Le désordre des instants, en pour-cent de la période. Sans effet sur la granulation synchrone, où les instants sont dictés par le son. À zéro, les grains tombent sur une grille régulière et l'oreille en tire une hauteur ; en montant, la grille se brouille et la hauteur cède la place à une texture. C'est le passage du granulaire synchrone à l'asynchrone.",
        docEn: "The disorder of the instants, as a percentage of the period. Without effect on pitch-synchronous granulation, where the instants are dictated by the sound. At zero, grains land on a regular grid and the ear draws a pitch from it; going up, the grid blurs and pitch gives way to texture. That is the passage from synchronous to asynchronous granular." },
      { nom: "Largeur spatiale", nomEn: "Spatial width", type: "curseur", plage: [0, 100], pas: 1, defaut: 0, unite: "%",
        doc: "Éparpille les grains entre les deux canaux : chacun reçoit sa propre place, au lieu que le son entier se déplace d'un bloc. À zéro, tous les grains tombent au centre et les deux canaux sortent identiques ; à cent, ils occupent toute la largeur. C'est là que la granulation se distingue d'un panoramique : ce n'est pas le son qui est placé, ce sont ses grains, et l'oreille en tire un nuage plutôt qu'une direction. Le goniomètre du catalogue le montre — la corrélation des deux canaux tombe à mesure qu'on ouvre. Les positions sont tirées à la graine : la même graine rejoue le même éparpillement.",
        docEn: "Scatters the grains between the two channels: each one gets its own place, instead of the whole sound moving as a block. At zero, every grain lands in the centre and both channels come out identical; at one hundred, they take the full width. This is where granulation parts from panning: it is not the sound that is placed but its grains, and the ear draws a cloud from it rather than a direction. The catalog's goniometer shows it — the correlation of the two channels falls as you open up. Positions are drawn from the seed: the same seed replays the same scattering." },
      { nom: "Position", nomEn: "Position", type: "curseur", plage: [0, 100], pas: 1, defaut: 0, unite: "%",
        doc: "Où commencer la lecture dans le son branché, en pour-cent de sa durée. Ne sert qu'à la granulation.",
        docEn: "Where to start reading in the connected sound, as a percentage of its duration. Only serves granulation." },
      { nom: "Vitesse", nomEn: "Speed", type: "curseur", plage: [-2, 2], pas: 0.05, defaut: 1,
        doc: "L'avance de la tête de lecture dans le son branché. Un la lit à sa vitesse d'origine ; un demi l'étire du double sans le transposer ; zéro l'immobilise, ce qui donne le gel granulaire ; un nombre négatif le lit à l'envers. Ne sert qu'à la granulation.",
        docEn: "How fast the read head advances through the connected sound. One reads it at its original speed; a half stretches it twofold without transposing it; zero freezes it, which gives the granular freeze; a negative number reads it backwards. Only serves granulation." },
      { nom: "Durée", nomEn: "Duration", type: "curseur", plage: [0.5, 60], pas: 0.5, defaut: 4, unite: "s",
        doc: "La durée du son produit. Elle ne dépend pas de celle du son branché : granuler deux secondes de matière pendant une minute est un usage ordinaire du procédé.",
        docEn: "The duration of the sound produced. It does not depend on the connected sound's: granulating two seconds of material for a minute is an ordinary use of the process." },
      { nom: "Volume", nomEn: "Volume", type: "curseur", plage: [0, 100], pas: 1, defaut: 60, unite: "%",
        doc: "L'amplitude de chaque grain. Les grains s'additionnent : doubler la densité approche d'autant du plafond, et c'est pourquoi une densité forte demande un volume plus bas.",
        docEn: "Each grain's amplitude. Grains add up: doubling the density moves that much closer to the ceiling, which is why a high density calls for a lower volume." },
      { nom: "Graine", nomEn: "Seed", type: "curseur", plage: [1, 999999], pas: 1, defaut: 42,
        doc: "La graine du tirage qui disperse les instants. La même graine rejoue exactement le même désordre, ce qui permet de retrouver un rendu.",
        docEn: "The seed of the draw that disperses the instants. The same seed replays exactly the same disorder, which is what makes a render findable again." },
    ],
    async executer(ctx: any) {
      const en = langueCourante() === "en";
      const audio = ctx.entree(0);
      const avecSource = audio instanceof AudioBuffer;
      const demandee = ctx.paramTexte("Espèce", "grains");
      const reglages: ReglagesParticules = {
        espece: EST_ESPECE(demandee) ? demandee : "grains",
        densite: ctx.paramNombre("Densité", 60),
        dureeGrainPc: ctx.paramNombre("Durée du grain", 50),
        frequenceHz: ctx.paramNombre("Fréquence", 440),
        transposition: ctx.paramNombre("Transposition", 0),
        partiels: ctx.paramNombre("Partiels", 8),
        dispersionPc: ctx.paramNombre("Dispersion", 0),
        largeurPc: ctx.paramNombre("Largeur spatiale", 0),
        positionPc: ctx.paramNombre("Position", 0),
        vitesse: ctx.paramNombre("Vitesse", 1),
        dureeSec: ctx.paramNombre("Durée", 4),
        volumePc: ctx.paramNombre("Volume", 60),
        graine: ctx.paramNombre("Graine", 42),
        avecSource,
        hauteurs: avecSource && demandee === "synchrone" ? hauteursDe(audio) : undefined,
      };
      const espece = especeTenable(reglages);
      const entrees: EntreeFichier[] = avecSource ? [{ nom: "entree1.wav", buffer: audio, stereo: false }] : [];
      const csd = construireCsd({
        orchestre: orchestreParticules(reglages),
        partition: partitionParticules(reglages),
        nchnls: 2,
        graine: graineParticules(reglages),
      });
      const r = await rendreCsd(csd, entrees);
      const faute = premiereErreur(r.messages);
      if (!r.audio) {
        return { valeurs: [null, r.messages.join("\n")], erreur: true, message: r.erreur ?? faute ?? (en ? "Csound produced nothing." : "Csound n'a rien produit.") };
      }
      const retombe = espece !== reglages.espece;
      const lignes = [
        `${nomEspece(espece, en)} · ${Math.round(reglages.densite)} ${en ? "grains/s" : "grains/s"} · ${r.audio.duration.toFixed(2)} s`,
        retombe
          ? (en ? "No sound connected: fell back to grains." : "Aucun son branché : retombé sur les grains.")
          : "",
      ].filter(Boolean);
      return { valeurs: [r.audio, r.messages.join("\n")], message: lignes.join("\n") };
    },
  },
] as FicheAudio[]).map(avecDoc);
