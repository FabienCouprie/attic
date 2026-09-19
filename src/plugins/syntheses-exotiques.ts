// plugins/syntheses-exotiques.ts — Quatre procédés de synthèse qu'Attic n'avait pas.
//
// Aucun des quatre ne ressemble aux autres, et aucun ne ressemble à ce qui existait déjà.
// Le scanning et le terrain d'onde partagent pourtant une idée : séparer complètement ce
// qui fait la HAUTEUR de ce qui fait le TIMBRE, de sorte que le second évolue indéfiniment
// pendant que la première reste juste. La FOF fait la même séparation pour la voix. Le
// mosaïquage, lui, ne synthétise rien : il reconstruit un son avec les morceaux d'un autre.

import type { FicheAudio } from "../audio/types-domaine";
import { traduire, langueCourante } from "../i18n";
import { avecDoc } from "./notices";
import { hasardDuNoeud } from "../core";
import { compile } from "mathjs";
import { fft } from "../audio/fft";
import {
  FREQUENCE_ECH, frequenceDe, lireNote, melanger, notesDuMidi, versBuffer,
} from "./instruments-communs";
import { synthetiserScanning } from "../audio/scanning";
import { synthetiserTerrain, type Orbite, type Terrain } from "../audio/terrain-onde";
import { VOYELLES, laVoyelle, synthetiserFof } from "../audio/fof";
import {
  apparier, assembler, decrireGrains, rapporter, type Grain,
} from "../audio/concatenatif";

const FS = FREQUENCE_ECH;

export const fiches: FicheAudio[] = ([
  {
    id: "synthese-scanning", nom: "Synthèse par scanning", nomEn: "Scanned Synthesis",
    univers: "Traitement", famille: "Effets",
    resume: "Lit la forme d'un objet mécanique en mouvement lent comme une table d'onde : le timbre évolue sans fin, la note reste juste.",
    resumeEn: "Reads the shape of a slowly moving mechanical object as a wavetable: the timbre evolves endlessly while the note stays in tune.",
    entrees: [{ nom: "MIDI", type: "midi", requis: false }],
    sorties: [{ nom: "Audio", type: "audio" }],
    parametres: [
      { nom: "Note", nomEn: "Note", type: "texte", defaut: "A2", defautEn: "A2",
        doc: "Note lue quand aucun MIDI n'est branché. La hauteur ne dépend que de la vitesse de balayage, jamais de la mécanique.",
        docEn: "Note read when no MIDI is connected. The pitch depends only on the scanning speed, never on the mechanics." },
      { nom: "Masses", nomEn: "Masses", type: "nombre", plage: [4, 256], pas: 1, defaut: 64,
        doc: "Nombre de masses de la chaîne, donc de points de la table d'onde. Peu de masses donnent une forme anguleuse et un son riche ; beaucoup, une forme douce.",
        docEn: "Number of masses in the chain, hence of points in the wavetable. Few masses give an angular shape and a rich sound; many give a smooth one." },
      { nom: "Cadence", nomEn: "Rate", type: "nombre", plage: [20, 4000], pas: 10, defaut: 800, unite: "/s",
        doc: "Vitesse de la simulation mécanique. Elle ne change pas la note : elle change la vitesse à laquelle le timbre évolue.",
        docEn: "Speed of the mechanical simulation. It does not change the note: it changes how fast the timbre evolves." },
      { nom: "Tension", nomEn: "Tension", type: "nombre", plage: [0, 100], pas: 1, defaut: 50, unite: "%",
        doc: "Raideur des ressorts entre voisins : c'est elle qui fait voyager les ondes le long de la chaîne, donc la vitesse des changements de forme. À zéro, la forme est figée et l'on retrouve un oscillateur à table d'onde ordinaire.",
        docEn: "Stiffness of the springs between neighbours: it makes the waves travel along the chain, hence the speed of the shape changes. At zero the shape is frozen and one gets an ordinary wavetable oscillator." },
      { nom: "Rappel", nomEn: "Centering", type: "nombre", plage: [0, 100], pas: 1, defaut: 30, unite: "%",
        doc: "Force qui ramène chaque masse vers le repos. Elle donne à la chaîne une fréquence propre lente, et donc un cycle au timbre.",
        docEn: "Force pulling each mass back to rest. It gives the chain a slow natural frequency, hence a cycle to the timbre." },
      { nom: "Amortissement", nomEn: "Damping", type: "nombre", plage: [0, 100], pas: 1, defaut: 10, unite: "%",
        doc: "À zéro, le mouvement ne s'arrête jamais et le timbre évolue indéfiniment. Au maximum, la chaîne se fige presque aussitôt et le son devient stable.",
        docEn: "At zero the motion never stops and the timbre evolves forever. At maximum the chain freezes almost at once and the sound becomes stable." },
      { nom: "Excitation", nomEn: "Excitation", type: "choix",
        options: ["Pincée", "Frappée", "Bruit", "Deux bosses"],
        optionsEn: ["Plucked", "Struck", "Noise", "Two humps"],
        optionIds: ["pincee", "frappee", "bruit", "deux-bosses"],
        defaut: "Pincée", defautEn: "Plucked",
        doc: "La forme donnée à la chaîne au départ. Rien ne l'entretient ensuite : c'est donc elle qui décide de tout le son, comme la façon de pincer une corde. « Frappée » donne une vitesse sans déplacement, « Pincée » un déplacement sans vitesse.",
        docEn: "The shape given to the chain at the start. Nothing sustains it afterwards: it therefore decides the whole sound, like the way a string is plucked. « Struck » gives velocity without displacement, « Plucked » displacement without velocity." },
      { nom: "Force", nomEn: "Force", type: "nombre", plage: [1, 100], pas: 1, defaut: 100, unite: "%",
        doc: "Amplitude de l'excitation.", docEn: "Excitation amplitude." },
      { nom: "Durée", nomEn: "Duration", type: "nombre", plage: [0.2, 20], pas: 0.1, defaut: 4, unite: "s",
        doc: "Durée produite, quand aucun MIDI n'est branché.", docEn: "Duration produced, when no MIDI is connected." },
      { nom: "Volume", nomEn: "Volume", type: "nombre", plage: [0, 100], pas: 1, defaut: 80, unite: "%",
        doc: "Volume de sortie.", docEn: "Output volume." },
    ],
    async executer(ctx: any) {
      const commun = {
        frequenceEch: FS,
        masses: Math.round(ctx.paramNombre("Masses", 64)),
        cadence: ctx.paramNombre("Cadence", 800),
        tension: ctx.paramNombre("Tension", 50) / 100,
        rappel: ctx.paramNombre("Rappel", 30) / 100,
        amortissement: ctx.paramNombre("Amortissement", 10) / 100,
        excitation: ctx.paramTexte("Excitation", "pincee") as "pincee" | "frappee" | "bruit" | "deux-bosses",
        force: ctx.paramNombre("Force", 100) / 100,
      };
      const { aleatoire } = hasardDuNoeud(1);
      const notes = await notesDuMidi(ctx.entree(0));
      if (!notes || notes.length === 0) {
        const duree = ctx.paramNombre("Durée", 4);
        const { signal, pas } = synthetiserScanning({
          ...commun, frequence: frequenceDe(lireNote(ctx.paramTexte("Note", "A2"), 45)), duree,
        }, aleatoire);
        return {
          valeurs: [versBuffer(signal, ctx.paramNombre("Volume", 80))],
          message: traduire("msg.scanning.resultat", 1, pas),
        };
      }
      const fin = Math.max(...notes.map((n) => n.fin)) + 0.3;
      const melange = new Float32Array(Math.ceil(fin * FS));
      let pasTotal = 0;
      for (const n of notes) {
        const { signal, pas } = synthetiserScanning({
          ...commun,
          frequence: frequenceDe(n.note),
          duree: Math.max(0.1, n.fin - n.debut) + 0.1,
          force: commun.force * (0.4 + 0.6 * (n.velocite / 127)),
        }, aleatoire);
        pasTotal += pas;
        melanger(melange, signal, n.debut);
      }
      return {
        valeurs: [versBuffer(melange, ctx.paramNombre("Volume", 80))],
        message: traduire("msg.scanning.resultat", notes.length, pasTotal),
      };
    },
  },
  {
    id: "terrain-onde", nom: "Terrain d'onde", nomEn: "Wave Terrain",
    univers: "Traitement", famille: "Effets",
    resume: "Parcourt une surface z = f(x, y) le long d'une orbite : l'orbite fait la hauteur, le relief fait le timbre.",
    resumeEn: "Travels a surface z = f(x, y) along an orbit: the orbit makes the pitch, the relief makes the timbre.",
    entrees: [{ nom: "MIDI", type: "midi", requis: false }],
    sorties: [{ nom: "Audio", type: "audio" }],
    parametres: [
      { nom: "Terrain", nomEn: "Terrain", type: "choix",
        options: ["Classique (Mitsuhashi)", "Selle", "Produit de sinus", "Ondes concentriques", "Formule"],
        optionsEn: ["Classic (Mitsuhashi)", "Saddle", "Sine product", "Concentric ripples", "Formula"],
        optionIds: ["classique", "selle", "produit", "ondes", "personnalise"],
        defaut: "Classique (Mitsuhashi)", defautEn: "Classic (Mitsuhashi)",
        doc: "La surface parcourue. « Classique » est celle de toute la littérature, creusée le long des droites x = ±1 et y = ±1. « Selle » est symétrique, et fait donc entendre l'octave au-dessus de la vitesse de rotation. « Ondes concentriques » est constante le long d'un cercle centré : elle ne donne rien sans décaler le centre de l'orbite, et c'est de la géométrie, non un défaut.",
        docEn: "The surface travelled. « Classic » is the one of the whole literature, hollowed along the lines x = ±1 and y = ±1. « Saddle » is symmetric, and therefore sounds an octave above the rotation speed. « Concentric ripples » is constant along a centred circle: it gives nothing unless the orbit's centre is offset, and that is geometry, not a defect." },
      { nom: "Formule", nomEn: "Formula", type: "texte", defaut: "sin(4*x) * cos(3*y)", defautEn: "sin(4*x) * cos(3*y)",
        doc: "Altitude en fonction de x et y, pour le terrain « Formule ». Les fonctions usuelles sont disponibles (sin, cos, exp, sqrt, abs…).",
        docEn: "Altitude as a function of x and y, for the « Formula » terrain. The usual functions are available (sin, cos, exp, sqrt, abs…)." },
      { nom: "Orbite", nomEn: "Orbit", type: "choix",
        options: ["Cercle", "Ellipse", "Lissajous", "Spirale"],
        optionsEn: ["Circle", "Ellipse", "Lissajous", "Spiral"],
        optionIds: ["cercle", "ellipse", "lissajous", "spirale"],
        defaut: "Cercle", defautEn: "Circle",
        doc: "Le chemin suivi sur le terrain. Un Lissajous de rapports entiers boucle en plusieurs tours et donne une forme d'onde plus longue ; la spirale fait dériver le rayon, donc le timbre.",
        docEn: "The path followed on the terrain. A Lissajous with integer ratios closes after several turns and gives a longer waveform; the spiral drifts the radius, hence the timbre." },
      { nom: "Note", nomEn: "Note", type: "texte", defaut: "A2", defautEn: "A2",
        doc: "Note jouée quand aucun MIDI n'est branché : c'est le nombre de tours d'orbite par seconde.",
        docEn: "Note played when no MIDI is connected: it is the number of orbit turns per second." },
      { nom: "Rayon", nomEn: "Radius", type: "nombre", plage: [0, 300], pas: 1, defaut: 80, unite: "%",
        doc: "Taille de l'orbite : c'est LE réglage de timbre. Une petite orbite reste dans une zone plate et donne un son pauvre, une grande explore le relief et donne un son riche — sans changer la note.",
        docEn: "Size of the orbit: this is THE timbre control. A small orbit stays in a flat area and gives a poor sound, a large one explores the relief and gives a rich one — without changing the note." },
      { nom: "Aplatissement", nomEn: "Flattening", type: "nombre", plage: [10, 100], pas: 1, defaut: 50, unite: "%",
        doc: "Écrasement de l'ellipse sur l'axe des y.", docEn: "Flattening of the ellipse on the y axis." },
      { nom: "Rapport X", nomEn: "X ratio", type: "nombre", plage: [1, 8], pas: 1, defaut: 3,
        doc: "Fréquence de l'orbite de Lissajous sur l'axe des x.", docEn: "Lissajous orbit frequency on the x axis." },
      { nom: "Rapport Y", nomEn: "Y ratio", type: "nombre", plage: [1, 8], pas: 1, defaut: 2,
        doc: "Fréquence de l'orbite de Lissajous sur l'axe des y.", docEn: "Lissajous orbit frequency on the y axis." },
      { nom: "Dérive", nomEn: "Drift", type: "nombre", plage: [-100, 100], pas: 1, defaut: 0, unite: "%",
        doc: "Variation du rayon sur la durée du son. Le timbre évolue alors continûment sans que la note bouge.",
        docEn: "Variation of the radius over the sound's duration. The timbre then evolves continuously without the note moving." },
      { nom: "Centre X", nomEn: "Centre X", type: "nombre", plage: [-200, 200], pas: 1, defaut: 0, unite: "%",
        doc: "Décale l'orbite sur l'axe des x, donc la zone de relief explorée.",
        docEn: "Offsets the orbit on the x axis, hence the area of relief explored." },
      { nom: "Centre Y", nomEn: "Centre Y", type: "nombre", plage: [-200, 200], pas: 1, defaut: 0, unite: "%",
        doc: "Décale l'orbite sur l'axe des y.", docEn: "Offsets the orbit on the y axis." },
      { nom: "Durée", nomEn: "Duration", type: "nombre", plage: [0.2, 20], pas: 0.1, defaut: 3, unite: "s",
        doc: "Durée produite, quand aucun MIDI n'est branché.", docEn: "Duration produced, when no MIDI is connected." },
      { nom: "Volume", nomEn: "Volume", type: "nombre", plage: [0, 100], pas: 1, defaut: 80, unite: "%",
        doc: "Volume de sortie.", docEn: "Output volume." },
    ],
    async executer(ctx: any) {
      const terrain = ctx.paramTexte("Terrain", "classique") as Terrain;
      let evaluer: ((x: number, y: number) => number) | undefined;
      if (terrain === "personnalise") {
        try {
          const compilee = compile(ctx.paramTexte("Formule", "sin(4*x) * cos(3*y)"));
          evaluer = (x: number, y: number) => {
            const z = compilee.evaluate({ x, y });
            return typeof z === "number" ? z : Number(z);
          };
        } catch {
          return { valeurs: [null], message: traduire("msg.terrain.formule") };
        }
      }
      const commun = {
        terrain, orbite: ctx.paramTexte("Orbite", "cercle") as Orbite,
        frequenceEch: FS,
        rayon: ctx.paramNombre("Rayon", 80) / 100,
        aplatissement: ctx.paramNombre("Aplatissement", 50) / 100,
        rapportX: Math.round(ctx.paramNombre("Rapport X", 3)),
        rapportY: Math.round(ctx.paramNombre("Rapport Y", 2)),
        derive: ctx.paramNombre("Dérive", 0) / 100,
        centreX: ctx.paramNombre("Centre X", 0) / 100,
        centreY: ctx.paramNombre("Centre Y", 0) / 100,
      };
      const notes = await notesDuMidi(ctx.entree(0));
      if (!notes || notes.length === 0) {
        const duree = ctx.paramNombre("Durée", 3);
        const r = synthetiserTerrain({
          ...commun, frequence: frequenceDe(lireNote(ctx.paramTexte("Note", "A2"), 45)), duree,
        }, evaluer);
        return {
          valeurs: [versBuffer(r.signal, ctx.paramNombre("Volume", 80))],
          message: traduire("msg.terrain.resultat", 1, (r.maximum - r.minimum).toFixed(2)),
        };
      }
      const fin = Math.max(...notes.map((n) => n.fin)) + 0.2;
      const melange = new Float32Array(Math.ceil(fin * FS));
      let relief = 0;
      for (const n of notes) {
        const r = synthetiserTerrain({
          ...commun,
          frequence: frequenceDe(n.note),
          duree: Math.max(0.05, n.fin - n.debut),
          rayon: commun.rayon * (0.5 + 0.5 * (n.velocite / 127)),
        }, evaluer);
        relief = Math.max(relief, r.maximum - r.minimum);
        melanger(melange, r.signal, n.debut);
      }
      return {
        valeurs: [versBuffer(melange, ctx.paramNombre("Volume", 80))],
        message: traduire("msg.terrain.resultat", notes.length, relief.toFixed(2)),
      };
    },
  },
  {
    id: "voyelle-fof", nom: "Voyelle chantée (FOF)", nomEn: "Sung Vowel (FOF)",
    univers: "Traitement", famille: "Effets",
    resume: "Synthétise une voyelle par ses formants, d'après la table de Peterson et Barney : la hauteur et le timbre ne se touchent pas.",
    resumeEn: "Synthesises a vowel from its formants, after Peterson and Barney's table: pitch and timbre never touch.",
    entrees: [{ nom: "MIDI", type: "midi", requis: false }],
    sorties: [{ nom: "Audio", type: "audio" }],
    parametres: [
      { nom: "Voyelle", nomEn: "Vowel", type: "choix",
        options: VOYELLES.map((v) => v.fr), optionsEn: VOYELLES.map((v) => v.en),
        optionIds: VOYELLES.map((v) => v.id),
        defaut: "A (patte)", defautEn: "A (father)",
        doc: "La voyelle, c'est-à-dire la position de ses trois premiers formants. Le A a un premier formant haut et un deuxième bas (730 et 1090 Hz), le I l'inverse (270 et 2290) : c'est le contraste le plus net de la table.",
        docEn: "The vowel, that is, the position of its first three formants. A has a high first formant and a low second (730 and 1090 Hz), I the opposite (270 and 2290): the sharpest contrast in the table." },
      { nom: "Note", nomEn: "Note", type: "texte", defaut: "A2", defautEn: "A2",
        doc: "Hauteur chantée quand aucun MIDI n'est branché. Les formants ne bougent pas avec elle — c'est toute la différence avec un échantillon transposé, qui emporte ses formants et donne une voix de dessin animé.",
        docEn: "Sung pitch when no MIDI is connected. The formants do not move with it — the whole difference from a transposed sample, which carries its formants along and gives a cartoon voice." },
      { nom: "Attaque", nomEn: "Attack", type: "nombre", plage: [0.5, 20], pas: 0.5, defaut: 3, unite: "ms",
        doc: "Durée de montée des bouffées formantiques. Courte, elle étale les formants vers les aigus et durcit la voix ; longue, elle l'adoucit.",
        docEn: "Rise time of the formant bursts. Short, it spreads the formants towards the highs and hardens the voice; long, it softens it." },
      { nom: "Largeur des formants", nomEn: "Formant width", type: "nombre", plage: [20, 400], pas: 5, defaut: 100, unite: "%",
        doc: "Multiplie les largeurs de bande. Resserrées, les résonances chantent et sonnent artificielles ; élargies, la voix devient soufflée.",
        docEn: "Multiplies the bandwidths. Narrowed, the resonances ring and sound artificial; widened, the voice becomes breathy." },
      { nom: "Taille du conduit", nomEn: "Tract size", type: "nombre", plage: [-12, 12], pas: 1, defaut: 0, unite: " ½-ton", uniteEn: "st",
        doc: "Décale tous les formants ensemble, ce qui revient à changer la taille du conduit vocal : vers le haut on obtient une voix d'enfant, vers le bas une voix de géant — sans toucher à la note chantée.",
        docEn: "Shifts all formants together, which amounts to changing the size of the vocal tract: upwards gives a child's voice, downwards a giant's — without touching the sung note." },
      { nom: "Vibrato", nomEn: "Vibrato", type: "nombre", plage: [0, 100], pas: 1, defaut: 20, unite: "%",
        doc: "Profondeur du vibrato de hauteur.", docEn: "Depth of the pitch vibrato." },
      { nom: "Fréquence vibrato", nomEn: "Vibrato rate", type: "nombre", plage: [1, 12], pas: 0.1, defaut: 5.5, unite: "Hz",
        doc: "Vitesse du vibrato. Un chanteur lyrique tourne autour de 5 à 6 Hz.",
        docEn: "Vibrato speed. An operatic singer sits around 5 to 6 Hz." },
      { nom: "Instabilité", nomEn: "Jitter", type: "nombre", plage: [0, 100], pas: 1, defaut: 15, unite: "%",
        doc: "Variation aléatoire de la période, d'une période à l'autre. C'est ce qui empêche la voix de sonner comme un orgue : une vraie voix n'est jamais exactement périodique.",
        docEn: "Random variation of the period from one period to the next. It is what stops the voice sounding like an organ: a real voice is never exactly periodic." },
      { nom: "Durée", nomEn: "Duration", type: "nombre", plage: [0.2, 20], pas: 0.1, defaut: 3, unite: "s",
        doc: "Durée produite, quand aucun MIDI n'est branché.", docEn: "Duration produced, when no MIDI is connected." },
      { nom: "Graine", nomEn: "Seed", type: "nombre", plage: [0, 999999], pas: 1, defaut: 0,
        doc: "Graine de l'instabilité. 0 = tirée au sort à chaque exécution.",
        docEn: "Seed of the jitter. 0 = drawn at random on every run." },
      { nom: "Volume", nomEn: "Volume", type: "nombre", plage: [0, 100], pas: 1, defaut: 80, unite: "%",
        doc: "Volume de sortie.", docEn: "Output volume." },
    ],
    async executer(ctx: any) {
      const { graine, aleatoire } = hasardDuNoeud(ctx.paramNombre("Graine", 0));
      const commun = {
        voyelle: laVoyelle(ctx.paramTexte("Voyelle", "a")),
        frequenceEch: FS,
        attaque: ctx.paramNombre("Attaque", 3) / 1000,
        facteurLargeur: ctx.paramNombre("Largeur des formants", 100) / 100,
        decalageFormants: ctx.paramNombre("Taille du conduit", 0),
        vibrato: ctx.paramNombre("Vibrato", 20) / 100,
        frequenceVibrato: ctx.paramNombre("Fréquence vibrato", 5.5),
        jitter: ctx.paramNombre("Instabilité", 15) / 100,
      };
      const notes = await notesDuMidi(ctx.entree(0));
      if (!notes || notes.length === 0) {
        const duree = ctx.paramNombre("Durée", 3);
        const { signal, bouffees } = synthetiserFof({
          ...commun, frequence: frequenceDe(lireNote(ctx.paramTexte("Note", "A2"), 45)), duree,
        }, aleatoire);
        return {
          valeurs: [versBuffer(signal, ctx.paramNombre("Volume", 80))],
          message: traduire("msg.fof.resultat", commun.voyelle.id, bouffees, graine),
        };
      }
      const fin = Math.max(...notes.map((n) => n.fin)) + 0.2;
      const melange = new Float32Array(Math.ceil(fin * FS));
      let total = 0;
      for (const n of notes) {
        const { signal, bouffees } = synthetiserFof({
          ...commun, frequence: frequenceDe(n.note), duree: Math.max(0.08, n.fin - n.debut),
        }, aleatoire);
        total += bouffees;
        melanger(melange, signal, n.debut);
      }
      return {
        valeurs: [versBuffer(melange, ctx.paramNombre("Volume", 80))],
        message: traduire("msg.fof.resultat", commun.voyelle.id, total, graine),
      };
    },
  },
  {
    id: "mosaiquage", nom: "Mosaïquage par corpus", nomEn: "Corpus Mosaicing",
    univers: "Traitement", famille: "Effets",
    resume: "Reconstruit un son avec les grains d'un autre : la forme de la cible, la matière du corpus.",
    resumeEn: "Rebuilds one sound from another's grains: the target's shape, the corpus's material.",
    entrees: [
      { nom: "Cible", nomEn: "Target", type: "audio" },
      { nom: "Corpus", nomEn: "Corpus", type: "audio" },
    ],
    sorties: [{ nom: "Audio", type: "audio" }, { nom: "Rapport", nomEn: "Report", type: "texte" }],
    parametres: [
      { nom: "Taille des grains", nomEn: "Grain size", type: "nombre", plage: [5, 200], pas: 1, defaut: 40, unite: "ms",
        doc: "Durée d'un grain. Courts, ils suivent la cible de près mais perdent le caractère du corpus ; longs, on reconnaît le corpus mais la cible se devine à peine. Entre 30 et 60 ms, les deux s'entendent.",
        docEn: "Length of a grain. Short, they follow the target closely but lose the corpus's character; long, the corpus is recognisable but the target barely shows. Between 30 and 60 ms, both are heard." },
      { nom: "Poids du niveau", nomEn: "Loudness weight", type: "nombre", plage: [0, 100], pas: 1, defaut: 100, unite: "%",
        doc: "Importance donnée au niveau dans la recherche du grain le plus proche.",
        docEn: "Weight given to loudness when searching for the nearest grain." },
      { nom: "Poids de la brillance", nomEn: "Brightness weight", type: "nombre", plage: [0, 100], pas: 1, defaut: 100, unite: "%",
        doc: "Importance donnée au centre de gravité du spectre. C'est le descripteur qui s'entend le plus : le monter fait suivre les couleurs de la cible.",
        docEn: "Weight given to the spectral centre of gravity. It is the descriptor one hears most: raising it follows the target's colours." },
      { nom: "Poids du bruit", nomEn: "Noisiness weight", type: "nombre", plage: [0, 100], pas: 1, defaut: 100, unite: "%",
        doc: "Importance donnée au taux de passages par zéro, qui distingue un son bruité d'un son tenu.",
        docEn: "Weight given to the zero-crossing rate, which tells a noisy sound from a steady one." },
      { nom: "Éviter les répétitions", nomEn: "Avoid repeats", type: "nombre", plage: [0, 100], pas: 1, defaut: 20, unite: "%",
        doc: "Pénalise le grain qui vient d'être employé. Sans cela, un corpus pauvre rend cent fois le même grain, ce qui s'entend comme un bourdonnement — c'est le défaut le plus audible du procédé.",
        docEn: "Penalises the grain just used. Without it, a poor corpus returns the same grain a hundred times over, which sounds like a drone — the most audible defect of the method." },
      { nom: "Volume", nomEn: "Volume", type: "nombre", plage: [0, 100], pas: 1, defaut: 80, unite: "%",
        doc: "Volume de sortie.", docEn: "Output volume." },
    ],
    async executer(ctx: any) {
      const cible = ctx.entree(0), corpus = ctx.entree(1);
      if (!(cible instanceof AudioBuffer) || !(corpus instanceof AudioBuffer)) {
        return { valeurs: [null, null], message: traduire("msg.mosaique.deuxEntrees") };
      }
      const mono = (b: AudioBuffer): Float32Array => {
        const g = b.getChannelData(0);
        if (b.numberOfChannels < 2) return new Float32Array(g);
        const d = b.getChannelData(1);
        const m = new Float32Array(b.length);
        for (let i = 0; i < b.length; i++) m[i] = (g[i] + d[i]) / 2;
        return m;
      };
      const taille = Math.max(64, Math.round((ctx.paramNombre("Taille des grains", 40) / 1000) * FS));
      const pas = Math.max(32, Math.round(taille / 2));
      const fftReelle = (re: Float64Array, im: Float64Array) => fft(re, im, false);
      const signalCible = mono(cible), signalCorpus = mono(corpus);
      const grainsCible: Grain[] = decrireGrains(signalCible, FS, taille, pas, fftReelle);
      const grainsCorpus: Grain[] = decrireGrains(signalCorpus, FS, taille, pas, fftReelle);
      if (grainsCible.length === 0 || grainsCorpus.length === 0) {
        return { valeurs: [null, null], message: traduire("msg.mosaique.tropCourt") };
      }
      const indices = apparier(grainsCible, grainsCorpus, {
        rms: ctx.paramNombre("Poids du niveau", 100) / 100,
        centroide: ctx.paramNombre("Poids de la brillance", 100) / 100,
        zcr: ctx.paramNombre("Poids du bruit", 100) / 100,
      }, ctx.paramNombre("Éviter les répétitions", 20) / 100 * 5);
      const sortie = assembler(signalCorpus, grainsCorpus, indices, grainsCible, signalCible.length);
      const r = rapporter(indices, grainsCorpus.length);
      const en = langueCourante() === "en";
      const rapport = [
        `${en ? "Target" : "Cible"} : ${r.grainsCible} ${en ? "grains" : "grains"}`,
        `${en ? "Corpus" : "Corpus"} : ${r.grainsCorpus} ${en ? "grains" : "grains"}`,
        `${en ? "Distinct grains used" : "Grains distincts employés"} : ${r.distincts}`,
        `${en ? "Share of the most frequent" : "Part du plus fréquent"} : ${Math.round(r.partDuPlusFrequent * 100)} %`,
        r.repetitif
          ? (en ? "The corpus is too poor for this target: it will drone. Raise « Avoid repeats », or give a more varied corpus."
            : "Le corpus est trop pauvre pour cette cible : il va bourdonner. Montez « Éviter les répétitions », ou donnez un corpus plus varié.")
          : (en ? "The corpus is varied enough." : "Le corpus est assez varié."),
      ].join("\n");
      return {
        valeurs: [versBuffer(sortie, ctx.paramNombre("Volume", 80)), rapport],
        message: traduire("msg.mosaique.resultat", r.grainsCible, r.distincts, r.grainsCorpus),
      };
    },
  },
] as FicheAudio[]).map(avecDoc);
