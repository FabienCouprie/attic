// plugins/grain-schaefferien.ts — Le grain au sens du Traité, mesuré sur l'entretien.
//
// D'après Schaeffer, 1966, et Chion, 1983. La logique est dans `audio/grain-schaefferien.ts`,
// testée, avec la filiation, les deux axes et le relevé qui a fait changer le premier d'entre eux ;
// ce fichier n'est que la prise.
//
// LES DEUX SEUILS SONT DES RÉGLAGES, et c'est une décision à dire. Le grain est un critère
// PERCEPTIF, non une grandeur physique : Schaeffer le range par l'oreille, et l'endroit où l'on
// cesse d'entendre un entretien continu pour entendre une suite de percussions n'a pas de valeur
// universelle. Les deux frontières sont donc à l'écran, avec ce qu'elles valent par défaut, plutôt
// que cachées dans le calcul.

import type { FicheAudio } from "../audio/types-domaine";
import { traduire } from "../i18n";
import { avecDoc } from "./notices";
import { DEBIT_MAX, DEBIT_MIN, SEUIL_HARMONIQUE, SEUIL_PROFOND, grainSchaefferien } from "../audio/grain-schaefferien";

export const fiches: FicheAudio[] = ([
  {
    id: "grain-schaefferien", nom: "Grain (Schaeffer)", nomEn: "Grain (Schaeffer)",
    univers: "Visualisation", famille: "Analyse",
    resume: "Range le grain d'un son en trois espèces, harmonique, compact ou discontinu, et en donne le débit et la profondeur.",
    resumeEn: "Sorts a sound's grain into three species, harmonic, compact or discontinuous, and gives its rate and depth.",
    notice: `Range le grain du son reçu en trois espèces et en donne les grandeurs, sans toucher au son, qui ressort inchangé.

D'après Pierre Schaeffer, « Traité des objets musicaux », Seuil, 1966, et sa figure des types de grain, page 553 ; et Michel Chion, « Guide des objets sonores : Pierre Schaeffer et la recherche musicale », INA-GRM et Buchet-Chastel, 1983, entrée GRAIN, page 95.

Schaeffer part des trois manières dont un corps entretient sa vibration, pas du tout, constamment, ou par percussions répétées, et en tire trois espèces de grain. La résonance donne le grain « harmonique », dont la qualité est le scintillement ; le frottement donne le grain « compact » ; l'itération donne le grain « discontinu », dont la qualité est le frappement.

Le relevé porte sur l'entretien et non sur l'attaque, le grain étant par définition la microstructure de ce qui se tient. « Entretien » dit quelle part du son est écartée à chaque bout.

Deux grandeurs décident de l'espèce. La « Profondeur » de la modulation de l'enveloppe sépare l'entretien par percussions répétées des deux entretiens continus : entre deux chocs l'enveloppe retombe, pendant un frottement ou une résonance elle se tient. L'« Harmonicité » de la porteuse sépare ensuite ces deux-là. « Seuil de profondeur » et « Seuil d'harmonicité » sont les deux frontières, et elles sont réglables parce que le grain est un critère perceptif : l'endroit où l'on cesse d'entendre un entretien continu n'a pas de valeur universelle.

Le « Débit » est celui de la modulation dominante, en hertz : c'est le serré et le lâche de Schaeffer. « Débit min » et « Débit max » bornent l'étendue où il est cherché. La « Netteté » dit à quel point la modulation se concentre autour de ce débit, c'est-à-dire la franchise du débit relevé.

Ce composant ne nomme pas la cause du son, et Schaeffer en fait un principe : il observe que des causes différentes donnent le même grain, et c'est de là qu'il tire l'écoute réduite. L'espèce décrit la microstructure perçue de l'entretien, non ce qui l'a produite.

Un son trop faible ou trop court pour qu'un entretien s'y observe reçoit l'espèce « aucun », ce qui est préférable à une espèce tirée au hasard.

La sortie « Audio » rend le son inchangé. La sortie « Grain » donne l'espèce, le débit, la profondeur, la netteté et l'harmonicité en texte.`,
    noticeEn: `Sorts the received sound's grain into three species and gives its quantities, without touching the sound, which comes out unchanged.

After Pierre Schaeffer, « Traité des objets musicaux », Seuil, 1966, and its figure of grain types, page 553; and Michel Chion, « Guide des objets sonores: Pierre Schaeffer et la recherche musicale », INA-GRM and Buchet-Chastel, 1983, entry GRAIN, page 95.

Schaeffer starts from the three ways a body sustains its vibration, not at all, constantly, or by repeated percussions, and draws three species of grain from them. Resonance gives the « harmonic » grain, whose quality is shimmer; friction gives the « compact » grain; iteration gives the « discontinuous » grain, whose quality is impact.

The reading is taken on the sustain and not on the attack, the grain being by definition the microstructure of what holds. « Sustain » states what share of the sound is set aside at each end.

Two quantities decide the species. The « Depth » of the envelope's modulation separates the sustain by repeated percussions from the two continuous ones: between two impacts the envelope falls back, during a friction or a resonance it holds. The « Harmonicity » of the carrier then separates those two. « Depth threshold » and « Harmonicity threshold » are the two borders, and they are adjustable because the grain is a perceptual criterion: the place where one stops hearing a continuous sustain has no universal value.

The « Rate » is that of the dominant modulation, in hertz: it is Schaeffer's tight and loose. « Rate min » and « Rate max » bound the range it is searched in. The « Sharpness » states how far the modulation gathers around that rate, that is how definite the rate read is.

This component does not name the cause of the sound, and Schaeffer makes that a principle: he observes that different causes give the same grain, and it is from there that he draws reduced listening. The species describes the perceived microstructure of the sustain, not what produced it.

A sound too faint or too short for a sustain to be observed in it receives the species « none », which is preferable to a species drawn at random.

The « Audio » output returns the sound unchanged. The « Grain » output gives the species, the rate, the depth, the sharpness and the harmonicity as text.`,
    entrees: [{ nom: "Audio", type: "audio" }],
    sorties: [
      { nom: "Audio", type: "audio" },
      { nom: "Grain", nomEn: "Grain", type: "texte" },
    ],
    parametres: [
      { nom: "Seuil de profondeur", nomEn: "Depth threshold", type: "curseur", plage: [0.05, 0.95], pas: 0.01, defaut: SEUIL_PROFOND,
        doc: "Au-delà de cette profondeur de modulation, l'entretien est tenu pour une suite de percussions et le grain pour discontinu. Les trois sons d'essai du dépôt donnent 0,145 pour un frottement, 0,150 pour une résonance et 1,000 pour une itération : la frontière par défaut est posée au milieu de cette marge.",
        docEn: "Beyond this modulation depth, the sustain is taken for a series of percussions and the grain for discontinuous. The repository's three test sounds give 0.145 for a friction, 0.150 for a resonance and 1.000 for an iteration: the default border is set in the middle of that margin." },
      { nom: "Seuil d'harmonicité", nomEn: "Harmonicity threshold", type: "curseur", plage: [0.05, 0.95], pas: 0.01, defaut: SEUIL_HARMONIQUE,
        doc: "Au-dessus de ce seuil, un entretien continu est tenu pour une résonance et le grain pour harmonique ; au-dessous, pour un frottement et le grain pour compact.",
        docEn: "Above this threshold, a continuous sustain is taken for a resonance and the grain for harmonic; below, for a friction and the grain for compact." },
      { nom: "Débit min", nomEn: "Rate min", type: "curseur", plage: [1, 50], pas: 1, defaut: DEBIT_MIN, unite: "Hz",
        doc: "Le plus lent des débits de modulation cherchés. Au-dessous, c'est l'enveloppe du son entier qu'on relèverait, non son grain.",
        docEn: "The slowest modulation rate searched for. Below it, one would be reading the whole sound's envelope and not its grain." },
      { nom: "Débit max", nomEn: "Rate max", type: "curseur", plage: [20, 300], pas: 5, defaut: DEBIT_MAX, unite: "Hz",
        doc: "Le plus rapide. Il décide aussi de la cadence à laquelle l'enveloppe est relevée, celle-ci devant valoir deux fois ce débit.",
        docEn: "The fastest. It also decides the rate at which the envelope is read, which must be twice that rate." },
      { nom: "Entretien", nomEn: "Sustain", type: "curseur", plage: [0, 40], pas: 1, defaut: 10, unite: "%",
        doc: "La part du son écartée à chaque bout. Le grain est la microstructure de ce qui se tient : une attaque placée devant ne doit pas déplacer l'espèce.",
        docEn: "The share of the sound set aside at each end. The grain is the microstructure of what holds: an attack placed in front must not move the species." },
    ],
    async executer(ctx: any) {
      const audio = ctx.entree(0);
      if (!(audio instanceof AudioBuffer)) {
        return { valeurs: [null, null], message: traduire("msg.aucune_entr_e") };
      }
      const m = grainSchaefferien(audio.getChannelData(0), audio.sampleRate, {
        seuilProfond: ctx.paramNombre("Seuil de profondeur", SEUIL_PROFOND),
        seuilHarmonique: ctx.paramNombre("Seuil d'harmonicité", SEUIL_HARMONIQUE),
        debitMin: ctx.paramNombre("Débit min", DEBIT_MIN),
        debitMax: ctx.paramNombre("Débit max", DEBIT_MAX),
        entretien: ctx.paramNombre("Entretien", 10) / 100,
      });

      // LA LANGUE N'EST PAS DANS LE CONTEXTE, et c'est `traduire` qui la connaît : une première
      // version lisait un `ctx.langue` qui n'existe pas. L'espèce passe donc par une clé de
      // traduction, comme tout le reste de ce que le dépôt écrit à l'écran.
      const espece = traduire(`grain.espece.${m.espece}`);
      // LE SAUT DE LIGNE PASSE PAR UNE CONSTRUCTION EXPLICITE, ce que le contrat des caractères de
      // contrôle demande : une séquence d'échappement écrite par un outil ou un script devient un
      // vrai caractère au passage, et la table de traduction n'en porte aucune, ses messages
      // tenant tous sur une ligne.
      const SAUT = String.fromCharCode(10);
      const rapport = [
        traduire("grain.ligne.espece", espece),
        traduire("grain.ligne.debit", m.debit.toFixed(1)),
        traduire("grain.ligne.profondeur", m.profondeur.toFixed(3)),
        traduire("grain.ligne.nettete", m.nettete.toFixed(2)),
        traduire("grain.ligne.harmonicite", m.harmonicite.toFixed(3)),
      ].join(SAUT);

      return {
        valeurs: [audio, rapport],
        message: traduire("msg.grainSchaefferien.rendu",
          espece, m.debit.toFixed(1), m.profondeur.toFixed(2), m.harmonicite.toFixed(2)),
      };
    },
  },
] as FicheAudio[]).map(avecDoc);
