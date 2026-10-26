// plugins/criteres-schaefferiens.ts — La masse, la dynamique et l'allure, au sens du Traité.
//
// D'après Schaeffer, 1966, et Chion, 1983. La logique est dans `audio/criteres-schaefferiens.ts`,
// testée, avec la filiation des trois critères, leurs axes et les relevés qui ont posé chaque
// frontière ; ce fichier n'est que la prise.
//
// UN SEUL NŒUD POUR LES TROIS, et c'est une décision à dire. Schaeffer lit les critères d'un objet
// CÔTE À CÔTE, dans un tableau récapitulatif : c'est leur lecture conjointe qui fait la typologie,
// une masse tonique en crescendo n'étant pas la même chose qu'une masse tonique en impulsion. Trois
// nœuds qu'il faudrait enchaîner pour obtenir la même lecture n'apporteraient que trois fiches
// presque identiques.
//
// LES SEUILS SONT DES RÉGLAGES, pour la même raison que sur le grain : ce sont des critères
// PERCEPTIFS, que Schaeffer range par l'oreille, et aucune de leurs frontières n'a de valeur
// universelle. Elles sont donc à l'écran avec ce qu'elles valent par défaut, plutôt que cachées
// dans le calcul.

import type { FicheAudio } from "../audio/types-domaine";
import { traduire } from "../i18n";
import { avecDoc } from "./notices";
import {
  ALLURE_MAX, ALLURE_MIN, ENTRETIEN_IMPULSION, ETENDUE_VARIEE, IRREGULARITE_MECANIQUE,
  IRREGULARITE_VIVANTE, OCCUPATION_BLANC, OCCUPATION_PUR, SEUIL_BOMBEMENT, SEUIL_ONDULATION,
  SEUIL_PENTE, criteresSchaefferiens,
} from "../audio/criteres-schaefferiens";

export const fiches: FicheAudio[] = ([
  {
    id: "criteres-schaefferiens", nomDicte: "critères de l objet sonore", nom: "Critères schaefferiens", nomEn: "Schaefferian Criteria",
    univers: "Visualisation", famille: "Analyse",
    resume: "Relève la masse, la forme dynamique et l'allure d'un son, dans les espèces du Traité des objets musicaux.",
    resumeEn: "Reads a sound's mass, dynamic form and allure, in the species of the Traité des objets musicaux.",
    notice: `Relève trois des sept critères morphologiques du son reçu et en donne les espèces, sans toucher au son, qui ressort inchangé.

D'après Pierre Schaeffer, « Traité des objets musicaux », Seuil, 1966 ; et Michel Chion, « Guide des objets sonores : Pierre Schaeffer et la recherche musicale », INA-GRM et Buchet-Chastel, 1983, entrées masse page 141, dynamique page 83 et allure page 40.

Les sept critères se rangent en trois familles : la matière porte la masse, le timbre harmonique et le grain ; la forme porte la dynamique et l'allure ; la variation porte le profil mélodique et le profil de masse. Ce composant en relève un de chaque famille.

La « Masse » dit comment le son occupe le champ des hauteurs, sur l'échelle du Traité, du plus tonique au plus complexe :

- « pur », une seule partielle, donc aucun timbre ;
- « tonique », une hauteur franche et son timbre ;
- « groupe », plusieurs hauteurs qu'on distingue ;
- « nodal », une zone du champ occupée sans hauteur franche ;
- « blanc », tout le champ occupé.

Deux grandeurs la décident. L'« Occupation » est la part du champ qui porte de l'énergie, et « Seuil du bruit blanc » est la part au-delà de laquelle la masse occupe tout le champ. Le compte de « Hauteurs » range les trois premiers degrés, et « Occupation du son pur » sépare une partielle seule d'une bande étroite, qui n'a qu'une raie elle aussi. La masse est dite « variée » quand la hauteur se déplace de plus que « Étendue variée » au cours du son.

La « Dynamique » est la forme du niveau dans le temps, et c'est par elle que se lit la facture :

- « impulsion », une attaque et rien derrière ;
- « tenue », un plateau ;
- « crescendo », le niveau monte d'un bout à l'autre ;
- « decrescendo », il descend ;
- « delta », il monte puis redescend.

« Entretien de l'impulsion » est la durée au-dessus de la moitié du sommet sous laquelle le son est une impulsion. « Seuil de bombement » décide de la forme en delta, et « Seuil de pente » du crescendo et du decrescendo. L'« Attaque » est rendue en millisecondes, du dixième aux neuf dixièmes du sommet.

L'« Allure » est l'ondulation lente de l'entretien, en trois espèces :

- « mécanique », de période immuable ;
- « vivante », dont la période respire, comme celle d'un instrumentiste ;
- « désordonnée », dont la période ne se prévoit pas.

« Débit min » et « Débit max » bornent la bande où l'ondulation est cherchée ; sa borne haute est là où commence celle du grain. « Seuil d'ondulation » est la profondeur sous laquelle il n'y a pas d'allure. « Irrégularité mécanique » et « Irrégularité vivante » sont les deux frontières entre les espèces, posées sur l'écart relatif des périodes successives.

Ce composant ne nomme pas la cause du son, et Schaeffer en fait un principe : il observe que des causes différentes donnent la même masse, et c'est de là qu'il tire l'écoute réduite. Les espèces décrivent ce qui est perçu, non ce qui l'a produit.

Un son trop faible ou trop court pour qu'un critère s'y observe reçoit l'espèce « aucune » pour ce critère, ce qui est préférable à une espèce tirée au hasard.

La sortie « Audio » rend le son inchangé. La sortie « Critères » donne les trois espèces et leurs grandeurs en texte.`,
    noticeEn: `Reads three of the received sound's seven morphological criteria and gives their species, without touching the sound, which comes out unchanged.

After Pierre Schaeffer, « Traité des objets musicaux », Seuil, 1966; and Michel Chion, « Guide des objets sonores: Pierre Schaeffer et la recherche musicale », INA-GRM and Buchet-Chastel, 1983, entries masse page 141, dynamique page 83 and allure page 40.

The seven criteria fall into three families: matter carries mass, harmonic timbre and grain; form carries dynamics and allure; variation carries melodic profile and mass profile. This component reads one from each family.

The « Mass » states how the sound occupies the field of pitches, on the scale of the Traité, from the most tonic to the most complex:

- « pure », a single partial, hence no timbre;
- « tonic », one definite pitch and its timbre;
- « group », several pitches one can tell apart;
- « nodal », a zone of the field occupied without a definite pitch;
- « white », the whole field occupied.

Two quantities decide it. The « Occupancy » is the share of the field carrying energy, and « White noise threshold » is the share beyond which the mass occupies the whole field. The count of « Pitches » sorts the first three degrees, and « Pure sound occupancy » separates a lone partial from a narrow band, which has a single line too. The mass is called « varied » when the pitch moves by more than « Varied range » over the sound.

The « Dynamics » is the shape of the level in time, and it is by it that the facture is read:

- « impulse », an attack and nothing behind;
- « held », a plateau;
- « crescendo », the level rises throughout;
- « decrescendo », it falls;
- « delta », it rises then falls.

« Impulse sustain » is the duration above half the peak below which the sound is an impulse. « Bulge threshold » decides the delta shape, and « Slope threshold » the crescendo and the decrescendo. The « Attack » is given in milliseconds, from a tenth to nine tenths of the peak.

The « Allure » is the slow undulation of the sustain, in three species:

- « mechanical », of unchanging period;
- « living », whose period breathes, like a player's;
- « disordered », whose period cannot be foreseen.

« Rate min » and « Rate max » bound the band the undulation is searched in; its upper bound is where the grain's band begins. « Undulation threshold » is the depth below which there is no allure. « Mechanical irregularity » and « Living irregularity » are the two boundaries between the species, set on the relative spread of successive periods.

This component does not name the cause of the sound, and Schaeffer makes that a principle: he observes that different causes give the same mass, and it is from there that he draws reduced listening. The species describe what is perceived, not what produced it.

A sound too faint or too short for a criterion to be observed in it receives the species « none » for that criterion, which is preferable to a species drawn at random.

The « Audio » output returns the sound unchanged. The « Criteria » output gives the three species and their quantities as text.`,
    entrees: [{ nom: "Audio", type: "audio" }],
    sorties: [
      { nom: "Audio", type: "audio" },
      { nom: "Critères", nomEn: "Criteria", type: "texte" },
    ],
    parametres: [
      { nom: "Seuil du bruit blanc", nomEn: "White noise threshold", type: "curseur", plage: [0.2, 0.99], pas: 0.01, defaut: OCCUPATION_BLANC,
        doc: "La part du champ des hauteurs au-delà de laquelle la masse est le bruit blanc plutôt qu'une zone nodale. L'échelle est continue, une bande se refermant peu à peu sur le bruit blanc : trois cents hertz de large occupent environ la moitié du champ, mille cinq cents en occupent neuf dixièmes, et un bruit blanc la totalité.",
        docEn: "The share of the field of pitches beyond which the mass is white noise rather than a nodal zone. The scale is continuous, a band closing in little by little on white noise: three hundred hertz wide occupy about half the field, one thousand five hundred occupy nine tenths, and white noise the whole of it." },
      { nom: "Occupation du son pur", nomEn: "Pure sound occupancy", type: "curseur", plage: [0.002, 0.2], pas: 0.002, defaut: OCCUPATION_PUR,
        doc: "La part du champ sous laquelle une masse à une seule raie est un son pur. Au-dessus, elle est tonique : une bande étroite n'a qu'une raie elle aussi, et un son pur occupe un point du champ quand une bande en occupe un intervalle. Un sinus reste sous 0,01, une bande de trente hertz se tient vers 0,07.",
        docEn: "The share of the field below which a single-line mass is a pure sound. Above it, it is tonic: a narrow band has a single line too, and a pure sound occupies a point of the field where a band occupies an interval. A sine stays under 0.01, a thirty hertz band sits near 0.07." },
      { nom: "Étendue variée", nomEn: "Varied range", type: "curseur", plage: [0.5, 12], pas: 0.5, defaut: ETENDUE_VARIEE, unite: "demi-tons", uniteEn: "semitones",
        doc: "L'étendue de hauteur au-delà de laquelle la masse est dite variée. Elle est prise sur les déciles de la hauteur suivie, de sorte qu'un relevé isolé ne la déclenche pas et qu'un glissando rend quatre cinquièmes de son étendue écrite.",
        docEn: "The pitch range beyond which the mass is called varied. It is taken on the deciles of the tracked pitch, so that an isolated reading does not trigger it and a glissando gives four fifths of its written range." },
      { nom: "Entretien de l'impulsion", nomEn: "Impulse sustain", type: "curseur", plage: [10, 500], pas: 10, defaut: ENTRETIEN_IMPULSION, unite: "ms",
        doc: "La durée au-dessus de la moitié du sommet sous laquelle la forme dynamique est une impulsion. C'est elle qui sépare une impulsion d'un decrescendo, les deux ayant la même pente : une impulsion n'a pas d'entretien du tout.",
        docEn: "The duration above half the peak below which the dynamic shape is an impulse. It is what separates an impulse from a decrescendo, both having the same slope: an impulse has no sustain at all." },
      { nom: "Seuil de bombement", nomEn: "Bulge threshold", type: "curseur", plage: [0.02, 0.6], pas: 0.02, defaut: SEUIL_BOMBEMENT,
        doc: "De combien le tiers du milieu doit dépasser la moyenne des deux bouts pour que la forme soit en delta. Il passe avant le seuil de pente : une forme en delta monte autant qu'elle descend, donc sa pente d'ensemble est nulle comme celle d'une tenue.",
        docEn: "By how much the middle third must exceed the mean of the two ends for the shape to be a delta. It comes before the slope threshold: a delta shape rises as much as it falls, so its overall slope is null like a held sound's." },
      { nom: "Seuil de pente", nomEn: "Slope threshold", type: "curseur", plage: [0.02, 0.6], pas: 0.02, defaut: SEUIL_PENTE,
        doc: "De combien le dernier tiers doit s'écarter du premier pour que la forme soit un crescendo ou un decrescendo. Au-dessous, elle est une tenue : un plateau a toujours une petite pente, que le relevé ne doit pas prendre pour une montée.",
        docEn: "By how much the last third must depart from the first for the shape to be a crescendo or a decrescendo. Below it, it is a held sound: a plateau always has a small slope, which the reading must not take for a rise." },
      { nom: "Débit min", nomEn: "Rate min", type: "curseur", plage: [0.2, 4], pas: 0.1, defaut: ALLURE_MIN, unite: "Hz",
        doc: "Le plus lent des débits d'ondulation cherchés. Au-dessous, ce n'est plus une ondulation de l'entretien qu'on relèverait mais la forme du son entier, laquelle est la dynamique. La durée du son le borne en outre, une ondulation ne pouvant pas être plus lente que lui.",
        docEn: "The slowest undulation rate searched for. Below it, one would no longer be reading an undulation of the sustain but the shape of the whole sound, which is the dynamics. The sound's duration bounds it too, an undulation being unable to be slower than it." },
      { nom: "Débit max", nomEn: "Rate max", type: "curseur", plage: [5, 60], pas: 1, defaut: ALLURE_MAX, unite: "Hz",
        doc: "Le plus rapide. Sa valeur par défaut est celle où la force de fluctuation cède à la rugosité, d'après Zwicker et Fastl, « Psychoacoustics: Facts and Models », 3e édition, Springer, 2007 : au-delà, une modulation ne se suit plus et devient une texture, c'est-à-dire un grain.",
        docEn: "The fastest. Its default value is where fluctuation strength yields to roughness, after Zwicker and Fastl, « Psychoacoustics: Facts and Models », 3rd edition, Springer, 2007: beyond it, a modulation can no longer be followed and becomes a texture, that is, a grain." },
      { nom: "Seuil d'ondulation", nomEn: "Undulation threshold", type: "curseur", plage: [0.01, 0.4], pas: 0.01, defaut: SEUIL_ONDULATION,
        doc: "La profondeur d'ondulation sous laquelle il n'y a pas d'allure. Une tenue sans ondulation reste sous un millième, une ondulation de quinze pour cent dépasse un dixième.",
        docEn: "The undulation depth below which there is no allure. A hold without undulation stays under a thousandth, a fifteen per cent undulation passes a tenth." },
      { nom: "Irrégularité mécanique", nomEn: "Mechanical irregularity", type: "curseur", plage: [0.005, 0.2], pas: 0.005, defaut: IRREGULARITE_MECANIQUE,
        doc: "L'écart relatif des périodes successives sous lequel l'allure est mécanique. Un trémolo de période immuable se tient sous 0,008 à tout débit de la bande, et un écart de cadence de cinq pour cent donne 0,035.",
        docEn: "The relative spread of successive periods below which the allure is mechanical. A tremolo of unchanging period stays under 0.008 at every rate of the band, and a five per cent rate departure gives 0.035." },
      { nom: "Irrégularité vivante", nomEn: "Living irregularity", type: "curseur", plage: [0.05, 0.6], pas: 0.01, defaut: IRREGULARITE_VIVANTE,
        doc: "L'écart au-delà duquel l'allure est désordonnée plutôt que vivante. Un écart de cadence de dix pour cent donne 0,070, un de vingt pour cent 0,141, et une ondulation dont chaque période est tirée au sort de 0,18 à 0,23.",
        docEn: "The spread beyond which the allure is disordered rather than living. A ten per cent rate departure gives 0.070, a twenty per cent one 0.141, and an undulation whose every period is drawn at random from 0.18 to 0.23." },
    ],
    async executer(ctx) {
      const audio = ctx.entree(0);
      if (!(audio instanceof AudioBuffer)) {
        return { valeurs: [null, null], message: traduire("msg.aucune_entr_e") };
      }
      const m = criteresSchaefferiens(audio.getChannelData(0), audio.sampleRate, {
        occupationBlanc: ctx.paramNombre("Seuil du bruit blanc", OCCUPATION_BLANC),
        occupationPur: ctx.paramNombre("Occupation du son pur", OCCUPATION_PUR),
        etendueVariee: ctx.paramNombre("Étendue variée", ETENDUE_VARIEE),
        entretienImpulsion: ctx.paramNombre("Entretien de l'impulsion", ENTRETIEN_IMPULSION),
        seuilBombement: ctx.paramNombre("Seuil de bombement", SEUIL_BOMBEMENT),
        seuilPente: ctx.paramNombre("Seuil de pente", SEUIL_PENTE),
        allureMin: ctx.paramNombre("Débit min", ALLURE_MIN),
        allureMax: ctx.paramNombre("Débit max", ALLURE_MAX),
        seuilOndulation: ctx.paramNombre("Seuil d'ondulation", SEUIL_ONDULATION),
        irregulariteMecanique: ctx.paramNombre("Irrégularité mécanique", IRREGULARITE_MECANIQUE),
        irregulariteVivante: ctx.paramNombre("Irrégularité vivante", IRREGULARITE_VIVANTE),
      });

      // LE SAUT DE LIGNE PASSE PAR UNE CONSTRUCTION EXPLICITE, ce que le contrat des caractères de
      // contrôle demande : une séquence d'échappement écrite par un outil devient un vrai caractère
      // au passage, et la table de traduction n'en porte aucune.
      const SAUT = String.fromCharCode(10);
      const masse = traduire(`criteres.masse.${m.masse.espece}`);
      const forme = traduire(`criteres.forme.${m.dynamique.forme}`);
      const allure = traduire(`criteres.allure.${m.allure.espece}`);
      const rapport = [
        traduire("criteres.ligne.masse", masse,
          m.masse.hauteurs.toString(), m.masse.occupation.toFixed(3)),
        m.masse.variee
          ? traduire("criteres.ligne.variee", m.masse.etendueDemiTons.toFixed(1))
          : traduire("criteres.ligne.tenue"),
        traduire("criteres.ligne.dynamique", forme,
          m.dynamique.attaqueMs.toFixed(0), m.dynamique.entretienMs.toFixed(0)),
        traduire("criteres.ligne.profil",
          m.dynamique.pente.toFixed(2), m.dynamique.bombement.toFixed(2)),
        m.allure.debit === null
          ? traduire("criteres.ligne.allure.aucune", allure)
          : traduire("criteres.ligne.allure", allure, m.allure.debit.toFixed(2),
            m.allure.profondeur.toFixed(3), m.allure.irregularite.toFixed(4)),
      ].join(SAUT);

      return {
        valeurs: [audio, rapport],
        message: traduire("msg.criteresSchaefferiens.rendu", masse, forme, allure),
      };
    },
  },
] as FicheAudio[]).map(avecDoc);
