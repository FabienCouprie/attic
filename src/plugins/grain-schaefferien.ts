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
import {
  DEBIT_MAX, DEBIT_MIN, SEUIL_ALLURE, SEUIL_HARMONIQUE, SEUIL_PROFOND, SEUIL_RELIEF, SEUIL_TENUE,
  grainSchaefferien,
} from "../audio/grain-schaefferien";
import { entreeAudio, sansEntree } from "./lire-entree";

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

Le « Débit » est celui de la modulation dominante, en hertz : c'est le serré et le lâche de Schaeffer. « Débit min » et « Débit max » bornent l'étendue où il est cherché. La « Netteté » dit à quel point la modulation se concentre autour de ce débit. Le « Relief » donne la hauteur du sommet sur le fond du spectre de modulation, et « Seuil de relief » dit à partir d'où un débit est annoncé : un grain compact n'en a pas, le sommet d'un spectre plat étant celui du bruit.

Un débit est en outre confirmé par un second relevé de l'enveloppe, à une autre cadence : une modulation du son y est à la même place, une trace de la porteuse s'y déplace, le repliement qui l'y amène dépendant de la cadence. Un sommet que ce second relevé ne retrouve pas n'est pas annoncé.

Ce composant ne nomme pas la cause du son, et Schaeffer en fait un principe : il observe que des causes différentes donnent le même grain, et c'est de là qu'il tire l'écoute réduite. L'espèce décrit la microstructure perçue de l'entretien, non ce qui l'a produite.

Quatre cas reçoivent l'espèce « aucun », et la sortie « Grain » dit lequel plutôt que de tirer une espèce au hasard :

- un son trop faible ou trop court pour qu'un entretien s'y observe ;
- une porteuse trop grave pour qu'un grain s'y mesure, c'est-à-dire sous 1,6 fois « Débit max ». Le carré d'un son harmonique porte les différences entre ses partiels, dont la plus basse est sa fondamentale, et celle-ci se replie dans l'étendue des débits : abaisser « Débit max » abaisse cette frontière d'autant ;
- une tenue lisse, c'est-à-dire un entretien harmonique dont l'enveloppe ne module pas, sous « Seuil de tenue » ;
- une allure, c'est-à-dire une modulation d'entretien continu plus lente que « Seuil de l'allure ». L'allure est un critère de forme chez Schaeffer là où le grain est un critère de matière.

La sortie « Audio » rend le son inchangé. La sortie « Grain » donne l'espèce, le débit, la profondeur, la netteté, le relief et l'harmonicité en texte.`,
    noticeEn: `Sorts the received sound's grain into three species and gives its quantities, without touching the sound, which comes out unchanged.

After Pierre Schaeffer, « Traité des objets musicaux », Seuil, 1966, and its figure of grain types, page 553; and Michel Chion, « Guide des objets sonores: Pierre Schaeffer et la recherche musicale », INA-GRM and Buchet-Chastel, 1983, entry GRAIN, page 95.

Schaeffer starts from the three ways a body sustains its vibration, not at all, constantly, or by repeated percussions, and draws three species of grain from them. Resonance gives the « harmonic » grain, whose quality is shimmer; friction gives the « compact » grain; iteration gives the « discontinuous » grain, whose quality is impact.

The reading is taken on the sustain and not on the attack, the grain being by definition the microstructure of what holds. « Sustain » states what share of the sound is set aside at each end.

Two quantities decide the species. The « Depth » of the envelope's modulation separates the sustain by repeated percussions from the two continuous ones: between two impacts the envelope falls back, during a friction or a resonance it holds. The « Harmonicity » of the carrier then separates those two. « Depth threshold » and « Harmonicity threshold » are the two borders, and they are adjustable because the grain is a perceptual criterion: the place where one stops hearing a continuous sustain has no universal value.

The « Rate » is that of the dominant modulation, in hertz: it is Schaeffer's tight and loose. « Rate min » and « Rate max » bound the range it is searched in. The « Sharpness » states how far the modulation gathers around that rate. The « Relief » gives the height of the peak over the floor of the modulation spectrum, and « Relief threshold » states from where a rate is announced: a compact grain has none, the peak of a flat spectrum being that of the noise.

A rate is further confirmed by a second reading of the envelope, at another rate of its own: a modulation of the sound is at the same place there, a trace of the carrier moves, the folding that brings it there depending on that rate. A peak this second reading does not find again is not announced.

This component does not name the cause of the sound, and Schaeffer makes that a principle: he observes that different causes give the same grain, and it is from there that he draws reduced listening. The species describes the perceived microstructure of the sustain, not what produced it.

Four cases receive the species « none », and the « Grain » output states which one rather than drawing a species at random:

- a sound too faint or too short for a sustain to be observed in it;
- a carrier too low for a grain to be measured on it, that is under 1.6 times « Rate max ». The square of a harmonic sound carries the differences between its partials, the lowest of which is its fundamental, and that one folds into the range of rates: lowering « Rate max » lowers that boundary as much;
- a smooth hold, that is a harmonic sustain whose envelope does not modulate, under « Steady threshold »;
- an allure, that is a continuous sustain modulation slower than « Allure threshold ». The allure is a criterion of form in Schaeffer where the grain is a criterion of matter.

The « Audio » output returns the sound unchanged. The « Grain » output gives the species, the rate, the depth, the sharpness, the relief and the harmonicity as text.`,
    entrees: [{ nom: "Audio", type: "audio" }],
    sorties: [
      { nom: "Audio", type: "audio" },
      { nom: "Grain", nomEn: "Grain", type: "texte" },
    ],
    parametres: [
      { nom: "Seuil de profondeur", nomEn: "Depth threshold", type: "curseur", plage: [0.05, 0.95], pas: 0.01, defaut: SEUIL_PROFOND,
        doc: "Au-delà de cette profondeur de modulation, l'entretien est tenu pour une suite de percussions et le grain pour discontinu. Un frottement se tient vers 0,09 et une résonance vers 0,11, quand une itération atteint 1,00 : la frontière par défaut est posée au milieu de cette marge.",
        docEn: "Beyond this modulation depth, the sustain is taken for a series of percussions and the grain for discontinuous. A friction sits near 0.09 and a resonance near 0.11, where an iteration reaches 1.00: the default border is set in the middle of that margin." },
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
      { nom: "Seuil de relief", nomEn: "Relief threshold", type: "curseur", plage: [2, 60], pas: 1, defaut: SEUIL_RELIEF,
        doc: "Le relief minimal du sommet sur le fond du spectre de modulation pour que la sortie « Grain » annonce un débit. Au-dessous, elle annonce un débit nul, ce qui est le cas d'un grain compact : le sommet d'un spectre plat est celui du bruit. Un bruit à bande se tient entre 3 et 6, un roulement lâche vers 58.",
        docEn: "The least relief of the peak over the floor of the modulation spectrum for the « Grain » output to state a rate. Below it, it states no rate, which is the case of a compact grain: the peak of a flat spectrum is that of the noise. A band noise sits between 3 and 6, a loose roll near 58." },
      { nom: "Seuil de tenue", nomEn: "Steady threshold", type: "curseur", plage: [0.005, 0.2], pas: 0.005, defaut: SEUIL_TENUE,
        doc: "Sous cette profondeur de modulation, un entretien harmonique est une tenue lisse, et la sortie « Grain » le dit à la place d'une espèce. Ce seuil ne porte que sur l'entretien harmonique, le grain compact tenant au bruit de la matière et non à une modulation d'enveloppe. Une forme d'onde tenue reste sous 0,04, une scintillation rapide passe 0,06.",
        docEn: "Below this modulation depth, a harmonic sustain is a smooth hold, and the « Grain » output says so in place of a species. This threshold bears on the harmonic sustain only, the compact grain holding to the noise of the matter and not to an envelope modulation. A held waveform stays under 0.04, a fast shimmer passes 0.06." },
      { nom: "Seuil de l'allure", nomEn: "Allure threshold", type: "curseur", plage: [5, 60], pas: 1, defaut: SEUIL_ALLURE, unite: "Hz",
        doc: "Sous ce débit, la modulation d'un entretien continu est une allure, et la sortie « Grain » l'annonce comme telle. Sa valeur par défaut est celle où la force de fluctuation cède à la rugosité, d'après Zwicker et Fastl, « Psychoacoustics: Facts and Models », 3e édition, Springer, 2007. Un entretien dont l'enveloppe retombe entre deux chocs garde son espèce discontinue et son débit à tout débit, la « Profondeur » décidant avant ce seuil.",
        docEn: "Below this rate, the modulation of a continuous sustain is an allure, and the « Grain » output states it as such. Its default value is where fluctuation strength yields to roughness, after Zwicker and Fastl, « Psychoacoustics: Facts and Models », 3rd edition, Springer, 2007. A sustain whose envelope falls back between two strikes keeps its discontinuous species and its rate at any rate, « Depth » deciding before this threshold." },
    ],
    async executer(ctx) {
      const audio = entreeAudio(ctx, 0, { sorties: 2 });
      if (sansEntree(audio)) return audio;
      const m = grainSchaefferien(audio.getChannelData(0), audio.sampleRate, {
        seuilProfond: ctx.paramNombre("Seuil de profondeur", SEUIL_PROFOND),
        seuilHarmonique: ctx.paramNombre("Seuil d'harmonicité", SEUIL_HARMONIQUE),
        debitMin: ctx.paramNombre("Débit min", DEBIT_MIN),
        debitMax: ctx.paramNombre("Débit max", DEBIT_MAX),
        entretien: ctx.paramNombre("Entretien", 10) / 100,
        seuilRelief: ctx.paramNombre("Seuil de relief", SEUIL_RELIEF),
        seuilTenue: ctx.paramNombre("Seuil de tenue", SEUIL_TENUE),
        seuilAllure: ctx.paramNombre("Seuil de l'allure", SEUIL_ALLURE),
      });

      // LA LANGUE N'EST PAS DANS LE CONTEXTE, et c'est `traduire` qui la connaît : une première
      // version lisait un `ctx.langue` qui n'existe pas. L'espèce passe donc par une clé de
      // traduction, comme tout le reste de ce que le dépôt écrit à l'écran.
      // ET QUAND IL N'Y A PAS DE GRAIN, L'ESPÈCE DIT POURQUOI. Les quatre absences sont de natures
      // différentes — un silence, une porteuse trop grave, une tenue lisse, une allure — et les
      // confondre sous un seul « aucun » faisait passer trois défauts du module pour un silence.
      const espece = m.absence
        ? traduire(`grain.absence.${m.absence}`)
        : traduire(`grain.espece.${m.espece}`);
      // Le grain compact n'a pas de débit : le sommet d'un spectre plat est le hasard du bruit.
      // LA LIGNE ENTIÈRE CHANGE DE CLÉ, et non la seule valeur : « debit aucun Hz » porterait une
      // unité sur une absence, ce que le passage dans l'application a montré sur le frottement.
      const ligneDebit = m.debit === null
        ? traduire("grain.ligne.debit.aucun")
        : traduire("grain.ligne.debit", m.debit.toFixed(1));
      // LE SAUT DE LIGNE PASSE PAR UNE CONSTRUCTION EXPLICITE, ce que le contrat des caractères de
      // contrôle demande : une séquence d'échappement écrite par un outil ou un script devient un
      // vrai caractère au passage, et la table de traduction n'en porte aucune, ses messages
      // tenant tous sur une ligne.
      const SAUT = String.fromCharCode(10);
      const rapport = [
        traduire("grain.ligne.espece", espece),
        ligneDebit,
        traduire("grain.ligne.profondeur", m.profondeur.toFixed(3)),
        traduire("grain.ligne.nettete", m.nettete.toFixed(2)),
        traduire("grain.ligne.relief", m.relief.toFixed(2)),
        traduire("grain.ligne.harmonicite", m.harmonicite.toFixed(3)),
      ].join(SAUT);

      return {
        valeurs: [audio, rapport],
        message: m.debit === null
          ? traduire("msg.grainSchaefferien.sansDebit",
            espece, m.profondeur.toFixed(2), m.harmonicite.toFixed(2))
          : traduire("msg.grainSchaefferien.rendu",
            espece, m.debit.toFixed(1), m.profondeur.toFixed(2), m.harmonicite.toFixed(2)),
      };
    },
  },
] as FicheAudio[]).map(avecDoc);
