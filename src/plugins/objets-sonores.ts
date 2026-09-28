// plugins/objets-sonores.ts — Découpage en objets, réordonnancement, montage.
//
// Les deux derniers manques du relevé pour un compositeur électroacousticien (2026-09-21) : trouver
// les objets d'un enregistrement sans les désigner à la main, et poser des sons dans le temps. Le
// calcul est dans `audio/objets-sonores.ts`.

import type { FicheAudio } from "../audio/types-domaine";
import { langueCourante } from "../i18n";
import { avecDoc } from "./notices";
import { creerAleatoire } from "../core/hasard";
import { normaliserSonie } from "../audio/normalisation-sonie";
import {
  decouperEnObjets, decrireZones, monter, reordonnerObjets,
  type CritereDecoupage, type CritereTri, type ObjetSonore, type Plan,
} from "../audio/objets-sonores";

const en = () => langueCourante() === "en";
const PISTES = 16;

/** Le rapport lisible d'un découpage : un objet par ligne, ses bornes et ce qu'on en entend. */
export function rapportObjets(objets: ObjetSonore[], anglais: boolean): string {
  const v = (x: number, d = 2) => (anglais ? x.toFixed(d) : x.toFixed(d).replace(".", ","));
  const tete = anglais ? "  #   start     length   loudness  brightness  noise" : "  n°  début     durée    sonie     brillance   bruit";
  return [tete, ...objets.map((o, k) =>
    `${String(k + 1).padStart(3)}  ${v(o.debut).padStart(6)} s  ${v(o.duree).padStart(6)} s  ${v(o.sonie, 1).padStart(6)} dB  ${String(Math.round(o.brillance)).padStart(6)} Hz  ${v(o.bruit)}`)].join("\n");
}

export const fiches: FicheAudio[] = ([
  {
    id: "decoupage-objets", nom: "Découpage en objets", nomEn: "Sound Object Segmentation",
    univers: "Traitement", famille: "Montage",
    memoire: "flux", // trames de 1024 échantillons, décision locale
    resume: "Trouve les objets sonores d'un enregistrement (par attaques, silences ou changements de timbre) et les décrit.",
    resumeEn: "Finds the sound objects of a recording (by attacks, silences or changes of timbre) and describes them.",
    notice: "Ce composant trouve les objets sonores d'un enregistrement (des sons perçus chacun comme un tout, au sens de Pierre Schaeffer (Traité des objets musicaux, 1966)) et les rend sous forme de zones : chacune peut ensuite être extraite, traitée ou replacée par tout composant qui accepte des zones.\n\nTrois critères, selon le matériau : un objet ne se délimite pas de la même façon partout.\n\nAttaques : pour ce qui est frappé, pincé, heurté. Une frontière est un instant où le spectre gagne soudain de l'énergie ; l'objet va d'une attaque à la suivante, et sa résonance lui appartient. L'attaque est placée à l'échantillon près, deux millisecondes avant le son, pour qu'aucun objet ne commence amputé.\n\nSilences : pour un enregistrement de terrain, une voix, des événements séparés. Ce qui passe sous le seuil est un silence ; un trou de moins de 60 ms n'en est pas un, c'est une respiration à l'intérieur de l'objet.\n\nChangement de timbre : pour un flux continu, un vent, une foule, une nappe, qui n'ont ni attaque ni silence. Une frontière est un instant où ce qui précède et ce qui suit diffèrent, sur trois descripteurs à la fois, la brillance, la part de bruit, le niveau.\n\nChaque objet est décrit par ce qu'on en entend : sa sonie, en dB ; sa brillance, le centre de gravité de son spectre en hertz ; sa part de bruit, de 0 pour une note pure à 1 pour un bruit blanc ; sa durée. Le rapport les liste, et chaque zone les porte avec elle, ce qui permet de trier les objets sur ces descripteurs.\n\nTrois sorties, pour trois usages. L'audio est le son d'entrée transmis tel quel, pour continuer la chaîne sans recâbler. Les zones sont la liste des objets, à brancher sur toute entrée de zones : on en extrait, on en supprime, on y place un son, on les réordonne. Le rapport est le texte ci-dessus, à lire ou à enregistrer : c'est la seule représentation du découpage, le composant ne dessinant pas les objets sur le son.",
    noticeEn: "This node finds the sound objects of a recording - sounds each perceived as a whole, in Pierre Schaeffer's sense (Traite des objets musicaux, 1966) - and returns them as zones: each can then be extracted, processed or put back by any node that accepts zones.\n\nThree criteria, depending on the material: an object is not bounded the same way everywhere.\n\nAttacks: for what is struck, plucked, knocked. A boundary is an instant where the spectrum suddenly gains energy; the object runs from one attack to the next, and its resonance belongs to it. The attack is placed to the sample, two milliseconds before the sound, so that no object starts cut off.\n\nSilences: for a field recording, a voice, separate events. What falls below the threshold is a silence; a gap under 60 ms is not one, it is a breath inside the object.\n\nChange of timbre: for a continuous flow, a wind, a crowd, a pad, which have neither attack nor silence. A boundary is an instant where what comes before and what comes after differ, on three descriptors at once - brightness, noisiness, level.\n\nEach object is described by what one hears of it: its loudness, in dB; its brightness, the centre of gravity of its spectrum in hertz; its noisiness, from 0 for a pure note to 1 for white noise; its duration. The report lists them, and each zone carries them along, which makes it possible to sort the objects on those descriptors.\n\nThree outputs, for three uses. The audio is the input sound passed through unchanged, to carry on the chain without rewiring. The zones are the list of objects, to be connected to any zone input: to extract them, mute them, place a sound on them, reorder them. The report is the text above, to read or to save - it is the only representation of the segmentation, as the node does not draw the objects on the sound.",
    entrees: [{ nom: "Audio", nomEn: "Audio", type: "audio" }],
    sorties: [
      { nom: "Audio", nomEn: "Audio", type: "audio" },
      { nom: "Zones", nomEn: "Zones", type: "controle" },
      { nom: "Rapport", nomEn: "Report", type: "texte" },
    ],
    parametres: [
      { nom: "Critère", nomEn: "Criterion", type: "choix", options: ["Attaques", "Silences", "Changement de timbre"],
        optionsEn: ["Attacks", "Silences", "Change of timbre"], optionIds: ["attaques", "silences", "timbre"], defaut: "Attaques", defautEn: "Attacks",
        doc: "Ce qui sépare deux objets. Attaques : ce qui est frappé ou pincé. Silences : des événements séparés, un enregistrement de terrain. Changement de timbre : un flux continu, sans attaque ni silence.",
        docEn: "What separates two objects. Attacks: what is struck or plucked. Silences: separate events, a field recording. Change of timbre: a continuous flow, with neither attack nor silence." },
      { nom: "Sensibilité", nomEn: "Sensitivity", type: "curseur", plage: [0, 100], pas: 1, defaut: 50, unite: "%",
        doc: "Plus haute, plus d'objets : de plus petites attaques ou de plus petits changements de timbre suffisent à faire une frontière. Sans effet sur le critère des silences, que règle son seuil.",
        docEn: "Higher, more objects: smaller attacks or smaller changes of timbre are enough to make a boundary. No effect on the silence criterion, which its threshold sets." },
      { nom: "Durée min", nomEn: "Min length", type: "curseur", plage: [20, 5000], pas: 10, defaut: 80, unite: "ms",
        doc: "Un objet plus court est écarté, et deux frontières plus proches n'en font qu'une, la plus nette. C'est le réglage qui empêche un roulement d'être découpé note par note, si l'on veut le garder entier.",
        docEn: "A shorter object is dropped, and two boundaries closer than this make only one - the sharper. It is the setting that keeps a drum roll from being cut note by note, if one wants it whole." },
      { nom: "Seuil de silence", nomEn: "Silence threshold", type: "curseur", plage: [-90, -10], pas: 1, defaut: -40, unite: "dB",
        doc: "Pour le critère des silences : ce qui passe sous ce niveau est un silence. Sans effet sur les autres critères.",
        docEn: "For the silence criterion: what falls below this level is a silence. No effect on the other criteria." },
    ],
    async executer(ctx: any) {
      const a = ctx.entree(0);
      if (!(a instanceof AudioBuffer)) return { valeurs: [null, null, null], message: en() ? "No audio input." : "Aucune entrée audio." };
      const objets = decouperEnObjets(a, {
        critere: String(ctx.paramTexte("Critère", "attaques")) as CritereDecoupage,
        sensibilite: ctx.paramNombre("Sensibilité", 50),
        dureeMinMs: ctx.paramNombre("Durée min", 80),
        seuilSilenceDb: ctx.paramNombre("Seuil de silence", -40),
      });
      const rapport = rapportObjets(objets, en());
      return { valeurs: [a, objets, rapport], message: `${objets.length} ${en() ? "objects" : "objets"}` };
    },
  },
  {
    id: "reordonner-objets", nom: "Réordonner les objets", nomEn: "Reorder Objects",
    univers: "Traitement", famille: "Montage",
    resume: "Enchaîne les objets d'un son dans l'ordre d'un descripteur : du plus sombre au plus brillant, du plus calme au plus fort.",
    resumeEn: "Chains a sound's objects in the order of a descriptor: from darkest to brightest, from quietest to loudest.",
    notice: "Ce composant enchaîne les objets d'un son dans l'ordre d'un descripteur : sonie, brillance, part de bruit ou durée. Une pluie de fragments rangés du plus sombre au plus brillant devient une montée ; rangés du plus bruité au plus tonique, un son qui se clarifie ; du plus long au plus court, une accélération. Le principe est celui de la navigation de CataRT, réduite à un axe.\n\nLes zones peuvent arriver déjà décrites, ou ne porter que leurs bornes, une sélection faite à la main : le composant les décrit alors lui-même, et elles se trient de la même façon.\n\nChaque objet reçoit un fondu d'entrée et de sortie, pour qu'aucune coupe ne claque. L'espace entre deux objets peut être négatif : ils se chevauchent alors, et l'enchaînement devient une texture. Au hasard, l'ordre est tiré avec une graine : à graine égale, le même ordre.",
    noticeEn: "This node chains a sound's objects in the order of a descriptor: loudness, brightness, noisiness or length. A rain of fragments sorted from darkest to brightest becomes a rise; sorted from noisiest to most tonal, a sound that clears; from longest to shortest, an acceleration. The principle is that of CataRT's navigation, reduced to one axis.\n\nThe zones may arrive already described, or carry only their bounds - a hand-made selection: the node then describes them itself, and they sort the same way.\n\nEach object gets a fade in and out, so that no cut clicks. The space between two objects can be negative: they then overlap, and the chain becomes a texture. At random, the order is drawn with a seed: same seed, same order.",
    entrees: [
      { nom: "Audio", nomEn: "Audio", type: "audio" },
      { nom: "Zones", nomEn: "Zones", type: "controle" },
    ],
    sorties: [{ nom: "Audio", nomEn: "Audio", type: "audio" }],
    parametres: [
      { nom: "Ordre", nomEn: "Order", type: "choix", options: ["Origine", "Sonie", "Brillance", "Bruit", "Durée", "Hasard"],
        optionsEn: ["Original", "Loudness", "Brightness", "Noise", "Length", "Random"], optionIds: ["origine", "sonie", "brillance", "bruit", "duree", "hasard"],
        defaut: "Brillance", defautEn: "Brightness",
        doc: "Le descripteur qui range les objets. Origine : l'ordre du son, pour n'appliquer que l'espace et les fondus.",
        docEn: "The descriptor that sorts the objects. Original: the sound's own order, to apply only the spacing and fades." },
      { nom: "Sens", nomEn: "Direction", type: "choix", options: ["Croissant", "Décroissant"], optionsEn: ["Ascending", "Descending"],
        optionIds: ["croissant", "decroissant"], defaut: "Croissant", defautEn: "Ascending",
        doc: "Croissant : du plus faible au plus fort sur le descripteur choisi. Sans effet au hasard.",
        docEn: "Ascending: from lowest to highest on the chosen descriptor. No effect at random." },
      { nom: "Espace", nomEn: "Spacing", type: "curseur", plage: [-2000, 5000], pas: 10, defaut: 0, unite: "ms",
        doc: "Silence entre deux objets ; négatif, ils se chevauchent d'autant.", docEn: "Silence between two objects; negative, they overlap by that much." },
      { nom: "Fondu", nomEn: "Fade", type: "curseur", plage: [0, 500], pas: 1, defaut: 10, unite: "ms",
        doc: "Fondu d'entrée et de sortie de chaque objet.", docEn: "Fade in and out of each object." },
      { nom: "Graine", nomEn: "Seed", plage: [1, 999999], pas: 1, defaut: 42,
        doc: "Pour l'ordre au hasard : à graine égale, le même ordre.", docEn: "For random order: same seed, same order." },
    ],
    async executer(ctx: any) {
      const a = ctx.entree(0);
      if (!(a instanceof AudioBuffer)) return { valeurs: [null], message: en() ? "No audio input." : "Aucune entrée audio." };
      const brutes = (Array.isArray(ctx.entree(1)) ? ctx.entree(1) : [])
        .filter((z: any) => z && typeof z.debut === "number" && typeof z.duree === "number" && z.duree > 0);
      if (!brutes.length) return { valeurs: [null], message: en() ? "No zones." : "Aucune zone." };
      const critere = String(ctx.paramTexte("Ordre", "brillance")) as CritereTri;
      const decrites = brutes.every((z: any) => typeof z.brillance === "number") ? brutes : decrireZones(a, brutes);
      const y = reordonnerObjets(a, decrites, {
        critere, decroissant: String(ctx.paramTexte("Sens", "croissant")) === "decroissant",
        espaceMs: ctx.paramNombre("Espace", 0), fonduMs: ctx.paramNombre("Fondu", 10),
        hasard: creerAleatoire(ctx.paramNombre("Graine", 42)),
      });
      return { valeurs: [y], message: `${decrites.length} ${en() ? "objects" : "objets"} · ${y.duration.toFixed(2)} s` };
    },
  },
  {
    id: "montage", nom: "Montage", nomEn: "Montage",
    univers: "Traitement", famille: "Montage",
    // SA LIGNE DE TEMPS SE RÈGLE EN ÉCOUTANT, donc son résultat ne doit pas disparaître au premier
    // geste : déplacer une piste relance le mélange, qui n'est qu'une addition, l'amont restant en
    // cache. Mesuré avant : un changement de réglage effaçait le son rendu et il fallait relancer.
    relanceAutomatique: true,
    resume: "Pose des sons sur une ligne de temps, chacun à son instant, à son niveau, avec ses fondus ; le composant s'allonge d'une piste à la demande.",
    resumeEn: "Lays sounds on a timeline, each at its own instant and level, with its own fades; the node grows one track at a time.",
    notice: "Ce composant pose des sons sur une ligne de temps et les additionne en un seul. Il montre quatre pistes au départ ; les boutons « + » et « − », sous ses entrées, l'allongent ou le raccourcissent, jusqu'à seize. Le « − » se refuse tant que la dernière piste est branchée : aucun câble ne disparaît sans qu'on l'ait débranché.\n\nChaque piste a quatre réglages : son instant de départ, son niveau, son fondu d'entrée et son fondu de sortie. Ils n'apparaissent que pour les pistes branchées. La ligne de temps, sur le composant lui-même, montre les pistes à leur place et à leur durée réelle après une exécution : on déplace une piste en la tirant, on règle ses fondus en tirant ses coins. La touche Maj rend le geste dix fois plus fin, la touche Alt cent fois. La molette zoome sur l'instant visé, le curseur de zoom fait de même, et le composant s'élargit par ses bords pour donner plus de place à la ligne. Chaque piste montre sa forme d'onde dans sa barre, sur la part qui sonne.\n\nElle porte aussi l'écoute. Le bouton joue les pistes branchées, un clic sur la règle y porte la tête de lecture, et celle-ci suit la musique en ramenant la vue quand elle en sort. Un niveau changé pendant la lecture s'entend aussitôt, sans interruption du son ; un début, une durée ou un fondu changés ne reprennent que la piste concernée. Un glissement s'entend au relâchement du geste. L'écoute rend les pistes à leur propre niveau ; la sonie de l'ensemble se règle à l'exécution, par « Sonie cible » et « Plafond ».\n\n« Sonie cible » et « Plafond » décident du niveau du mélange. Additionner des pistes ajoute leurs amplitudes, et le nombre de pistes branchées n'est pas connu d'avance : une sonie visée, elle, n'en dépend pas. Le plafond est un vrai pic à ne pas franchir ; s'il empêche d'atteindre la sonie demandée, il gagne et le message le dit. À zéro, le mélange sort tel qu'il s'additionne, sans retouche de niveau. Le message donne la sonie obtenue, le vrai pic et le gain appliqué.\n\nLes fondus sont à puissance constante : deux sons qui se croisent sur la même durée, l'un sortant, l'autre entrant, gardent leur énergie au milieu du croisement, sans le creux qu'y ferait une rampe droite. Des fondus plus longs que le son sont réduits dans la même proportion.\n\nUn début négatif rogne le son d'autant : on entre dans un son déjà commencé, et le fondu d'entrée s'applique à ce qui reste. La sortie dure jusqu'à la fin du dernier son. Les pistes sont numérotées, et la piste 3 reste la piste 3 quel que soit l'ordre dans lequel on a tiré les câbles. Pour plus de seize sons, on monte des montages.",
    noticeEn: "This node lays sounds out on a timeline and adds them into one. It shows four tracks to begin with; the « + » and « - » buttons under its inputs make it longer or shorter, up to sixteen. The « - » refuses while the last track is connected: no cable disappears without being unplugged first.\n\nEach track has four settings: its start instant, its level, its fade in and its fade out. They only appear for connected tracks. The timeline, on the node itself, shows the tracks in place and at their real length after a run: drag a track to move it, drag its corners to set its fades. The Shift key makes the gesture ten times finer, the Alt key a hundred times. The wheel zooms on the instant under the pointer, the zoom slider does the same, and the node widens by its edges to give the timeline more room. It also carries listening: a button plays the mix, a click on the ruler takes the playhead there, and the playhead follows the music, bringing the view back when it leaves.\n\n« Target loudness » and « Ceiling » decide the level of the mix. Adding tracks adds their amplitudes, and the number of connected tracks is not known in advance: a target loudness does not depend on it. The ceiling is a true peak not to be crossed; if it prevents reaching the requested loudness, it wins and the message says so. At zero, the mix comes out as it adds up, with no level change. The message gives the loudness obtained, the true peak and the gain applied.\n\nFades are equal-power: two sounds crossing over the same length, one going out, the other coming in, keep their energy in the middle of the crossing, without the dip a straight ramp would make there. Fades longer than the sound are shortened in the same proportion.\n\nA negative start trims the sound by that much: one enters a sound already under way, and the fade in applies to what remains. The output lasts until the end of the last sound. Tracks are numbered, and track 3 stays track 3 whatever order the cables were drawn in. For more than sixteen sounds, one montage feeds another.",
    entrees: Array.from({ length: PISTES }, (_, k) => ({ nom: `Piste ${k + 1}`, nomEn: `Track ${k + 1}`, type: "audio", requis: false })),
    // Seize pistes déclarées, quatre montrées : le nombre de pistes n'a pas à être décidé une fois
    // pour toutes par la fiche (cf. ui/ports-extensibles.ts).
    entreesExtensibles: { min: 2, defaut: 4 },
    sorties: [{ nom: "Audio", nomEn: "Audio", type: "audio" }],
    parametres: Array.from({ length: PISTES }, (_, k) => [
      { nom: `Début ${k + 1}`, nomEn: `Start ${k + 1}`, type: "nombre", plage: [-600, 3600], pas: 0.01, defaut: k * 2, unite: "s", port: k,
        doc: `Instant où commence la piste ${k + 1}. Négatif : le son est rogné d'autant.`,
        docEn: `Instant at which track ${k + 1} starts. Negative: the sound is trimmed by that much.` },
      { nom: `Gain ${k + 1}`, nomEn: `Gain ${k + 1}`, type: "curseur", plage: [-60, 12], pas: 0.5, defaut: 0, unite: "dB", port: k,
        doc: `Niveau de la piste ${k + 1}.`, docEn: `Level of track ${k + 1}.` },
      { nom: `Fondu entrée ${k + 1}`, nomEn: `Fade in ${k + 1}`, type: "nombre", plage: [0, 60000], pas: 1, defaut: 10, unite: "ms", port: k,
        doc: `Durée du fondu d'entrée de la piste ${k + 1}. Quelques millisecondes évitent un clic ; plusieurs secondes font paraître le son.`,
        docEn: `Length of track ${k + 1}'s fade in. A few milliseconds avoid a click; several seconds make the sound emerge.` },
      { nom: `Fondu sortie ${k + 1}`, nomEn: `Fade out ${k + 1}`, type: "nombre", plage: [0, 60000], pas: 1, defaut: 10, unite: "ms", port: k,
        doc: `Durée du fondu de sortie de la piste ${k + 1}.`, docEn: `Length of track ${k + 1}'s fade out.` },
    ]).flat().concat([
      // ADDITIONNER N PISTES À GAIN UNITÉ DONNE N FOIS L'AMPLITUDE. Mesuré sur les quatre pistes du
      // défaut, chacune à −6 dBFS : la sortie atteignait −2,29 LUFS, soit près de douze décibels
      // au-dessus de la cible de diffusion, et la somme dépassait la pleine échelle là où les pistes
      // se recouvraient. Le mélange ne peut pas deviner combien de pistes on branchera ; une sonie
      // visée, elle, ne dépend pas de leur nombre.
      { nom: "Sonie cible", nomEn: "Target loudness", type: "curseur", plage: [-36, 0], pas: 0.5, defaut: -14, unite: "LUFS",
        doc: "Sonie du mélange. −14 est la cible des plateformes de diffusion, −23 celle de la norme EBU R 128 pour la télévision, −16 un usage courant en baladodiffusion. À zéro, le mélange sort tel qu'il s'additionne, sans retouche de niveau.",
        docEn: "Loudness of the mix. -14 is the streaming platforms' target, -23 the EBU R 128 broadcast standard, -16 a common podcast value. At zero, the mix comes out as it adds up, with no level change." },
      { nom: "Plafond", nomEn: "Ceiling", type: "curseur", plage: [-6, 0], pas: 0.1, defaut: -1, unite: "dBTP",
        doc: "Vrai pic à ne pas dépasser. Si la sonie visée demandait de le franchir, le plafond gagne et le message le dit.",
        docEn: "True peak not to be exceeded. If the target loudness required crossing it, the ceiling wins and the message says so." },
    ] as never),
    async executer(ctx: any) {
      const plans: Plan[] = [];
      const pistes: { piste: number; duree: number }[] = [];
      for (let k = 0; k < PISTES; k++) {
        const son = ctx.entree(k);
        if (!(son instanceof AudioBuffer)) continue;
        plans.push({
          son, debut: ctx.paramNombre(`Début ${k + 1}`, k * 2), gainDb: ctx.paramNombre(`Gain ${k + 1}`, 0),
          fonduEntreeMs: ctx.paramNombre(`Fondu entrée ${k + 1}`, 10), fonduSortieMs: ctx.paramNombre(`Fondu sortie ${k + 1}`, 10),
        });
        pistes.push({ piste: k, duree: son.duration });
      }
      // La ligne de temps de l'inspecteur a besoin des durées réelles, que seule l'exécution connaît.
      // LE CHAMP EST PARTAGÉ AVEC LA MAQUETTE, qui s'en sert pour la même raison : son nom ne dit
      // donc plus « montage », qui aurait égaré celui qui l'aurait lu depuis l'autre composant.
      (ctx.noeud.data as any)._dureesMesurees = pistes;
      // LES TAMPONS DES PISTES, DÉSIGNÉS ET NON RECOPIÉS. La ligne de temps en a besoin pour dessiner
      // la forme d'onde de chaque piste, et pour les faire entendre pendant qu'on règle. Ce sont les
      // tampons des composants en amont, qui vivent déjà dans le cache d'exécution : les nommer ici ne
      // coûte rien de plus, et le champ préfixé d'un blanc souligné n'est pas enregistré avec le
      // projet. Le montage vidéo garde les siens de la même façon, pour la même raison.
      (ctx.noeud.data as any)._montageSons = Object.fromEntries(
        plans.map((p, i) => [pistes[i].piste, p.son]),
      );
      if (!plans.length) return { valeurs: [null], message: en() ? "No track connected." : "Aucune piste branchée." };
      const brut = await monter(plans);
      const pistesDites = `${plans.length} ${en() ? "tracks" : "pistes"}`;
      // LE MÉLANGE NE PEUT PAS DEVINER COMBIEN DE PISTES ON BRANCHERA, donc son niveau ne peut pas
      // être juste par construction : additionner N pistes à gain unité donne N fois l'amplitude. Une
      // sonie visée, elle, ne dépend pas de leur nombre. À zéro, on garde la somme telle quelle.
      const cible = ctx.paramNombre("Sonie cible", -14);
      if (cible >= 0) {
        return { valeurs: [brut], message: `${pistesDites} · ${brut.duration.toFixed(2)} s` };
      }
      const n = normaliserSonie(brut, cible, { plafondDb: ctx.paramNombre("Plafond", -1) });
      const dit = [
        pistesDites, `${brut.duration.toFixed(2)} s`,
        `${n.lufsApres.toFixed(1)} LUFS`, `${n.vraiPicDb.toFixed(1)} dBTP`,
        `${n.gainDb >= 0 ? "+" : ""}${n.gainDb.toFixed(1)} dB`,
      ];
      // Le plafond a gagné : le dire, sinon la cible demandée et la sonie rendue se contrediraient
      // sans que rien ne l'explique.
      if (n.plafonne) dit.push(en() ? "ceiling reached" : "plafond atteint");
      return { valeurs: [n.audio], message: dit.join(" · ") };
    },
  },
] as FicheAudio[]).map(avecDoc);
