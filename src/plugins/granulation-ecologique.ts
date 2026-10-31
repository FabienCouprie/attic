// plugins/granulation-ecologique.ts — Les grains suivent un modèle d'événement physique.
//
// D'après Keller et Truax, ICMC 1998. La logique est dans `audio/granulation-ecologique.ts`, testée,
// avec la filiation et les trois témoins de mesure ; ce fichier n'est que la prise.
//
// TROIS RÉGLAGES N'AGISSENT QUE DANS UN MODÈLE, et chacun porte sa raison dans sa documentation :
// l'amortissement est le paramètre de la récurrence du rebond, la rugosité celui du frottement, et
// le rapport de phase ne veut rien dire sur un flux unique. Le contrat de composant l'autorise à
// cette condition, et c'est la forme que prend un composant qui met trois modèles sous un nom.

import type { FicheAudio } from "../audio/types-domaine";
import { traduire } from "../i18n";
import { avecDoc } from "./notices";
import { bornesModulation, modulationNommee, portModulation, reglageModule } from "./effets-aides";
import { FENETRES, type Fenetre } from "../audio/micromontage";
import { EST_MODELE, granulationEcologique, rapportDeRebond } from "../audio/granulation-ecologique";
import { entreeAudio, sansEntree } from "./lire-entree";

const FENETRES_FR = ["Gaussienne", "Trapèze", "Expodec", "Rexpodec"];
const FENETRES_EN = ["Gaussian", "Trapezoid", "Expodec", "Rexpodec"];

/** Les quatre réglages qu'une courbe vient piloter, dans l'ordre de leurs ports. */
const MOD_INTERVALLE = { ...modulationNommee("Intervalle", "Interval", [1, 1000], "ms"), defauts: [5, 200] as [number, number] };
const MOD_TAILLE = { ...modulationNommee("Taille de grain", "Grain size", [1, 500], "ms"), defauts: [2, 120] as [number, number] };
const MOD_PRISE = { ...modulationNommee("Prise", "Cut", [0, 100], "%"), defauts: [0, 100] as [number, number] };
const MOD_RUGOSITE = { ...modulationNommee("Rugosité", "Roughness", [0, 100], "%"), defauts: [0, 100] as [number, number] };
const MOD_NIVEAU = { ...modulationNommee("Niveau", "Level", [0, 100], "%"), defauts: [0, 100] as [number, number] };

export const fiches: FicheAudio[] = ([
  {
    id: "granulation-ecologique", nomDicte: "grains écologiques", nom: "Granulation écologique", nomEn: "Ecological Granulation",
    univers: "Traitement", famille: "Montage",
    resume: "Pose les grains d'un son selon un modèle d'événement physique : un rebond, un écoulement ou un frottement.",
    resumeEn: "Lays a sound's grains along a physical event model: a bounce, a flow or a scrape.",
    notice: `Découpe un grain dans le son reçu et le repose selon un modèle d'événement physique, un rebond, un écoulement ou un frottement.

D'après Damián Keller et Barry Truax, « Ecologically-based granular synthesis », International Computer Music Conference, Ann Arbor, 1998. Ce que l'article ajoute à une granulation est de contraindre le temps par un événement du monde quotidien, plutôt que de poser les grains sur une ligne de temps où le compositeur décide de tout. L'échelle visée va de dix millisecondes à plusieurs secondes.

« Modèle » décide de la fonction de contrôle, c'est-à-dire des instants où les grains tombent.

« Rebond » suit la récurrence du corps qui rebondit : chaque intervalle vaut l'amortissement multiplié par la somme des deux précédents. Les intervalles se resserrent donc, et leur somme converge, de sorte que le rebond s'arrête de lui-même. Quand le débit entre dans l'audible, une hauteur se fait entendre et monte, sans qu'aucune transposition existe : elle est celle du débit.

« Écoulement » lance plusieurs flux de gouttes dont les instants ne tombent pas en mesure. Quand « Taille de grain » croît, les grains se recouvrent et comblent les silences : le même générateur passe continûment de la goutte comptable au flux fondu.

« Frottement » pose les grains à intervalle régulier et tire leur contenu ailleurs dans la source à chaque fois. À rugosité nulle tous viennent du même endroit et l'on entend la hauteur du débit ; à rugosité pleine ils viennent de partout et l'on entend du bruit.

« Intervalle » est le temps entre deux grains : le premier intervalle pour le rebond, l'intervalle moyen pour l'écoulement, la période pour le frottement. « Taille de grain » est la durée d'un grain, « Prise » l'endroit de la source où il est découpé, « Durée » la longueur rendue.

« Amortissement » est le facteur de la récurrence du rebond, et n'agit que sur ce modèle. À un demi, les intervalles ne se resserrent plus et le rebond ne s'arrête jamais, ce qui borne le réglage ; plus il est fort, plus l'événement s'étire, et moins il porte de chocs. « Rugosité » est la part de hasard dans l'endroit de découpe, et n'agit que sur le frottement.

« Flux » est le nombre de flux parallèles. « Phase » dit s'ils partagent leurs instants ou si chacun a les siens, et ne veut rien dire sur un flux unique. Des flux qui partagent leurs instants empilent leurs grains au même moment, ce que l'article emploie pour un vent dense ; des flux indépendants les répartissent, ce qu'il emploie pour l'eau.

« Fenêtre » décide de la forme de chaque grain. L'expodec décroît après une attaque brève, ce qui convient à un choc ; le trapèze garde un plateau, donc du corps ; la gaussienne ne laisse de matière qu'au centre ; la rexpodec monte puis coupe.

« Graine » gouverne les tirages, et à graine égale le rendu est le même. « Niveau » règle la sortie. La somme est ramenée à la somme des fenêtres actives, de sorte que ni la densité ni le nombre de flux ne monte le niveau.

Les entrées « Modulation intervalle », « Modulation taille de grain », « Modulation prise », « Modulation rugosité » et « Modulation niveau » prennent la place de leur réglage quand une courbe y est branchée, chacune avec ses deux bornes ; sans courbe, ces bornes ne servent pas. Les quatre premières sont lues à l'instant où chaque grain est lancé ; le niveau est lu après que les grains sont posés, de sorte qu'il règle ce qui sort sans déplacer les grains.

La sortie « Audio » porte le rendu. Le message donne le nombre de grains, le nombre d'instants distincts, l'instant du dernier grain et les intervalles du premier et du dernier choc.`,
    noticeEn: `Cuts a grain out of the received sound and lays it again along a physical event model, a bounce, a flow or a scrape.

After Damián Keller and Barry Truax, « Ecologically-based granular synthesis », International Computer Music Conference, Ann Arbor, 1998. What the paper adds to a granulation is to constrain time by an event of the everyday world, rather than laying the grains on a timeline where the composer decides everything. The scale it aims at runs from ten milliseconds to several seconds.

« Model » decides the control function, that is the instants at which the grains fall.

« Bounce » follows the recurrence of a bouncing body: each interval is the damping times the sum of the two before it. The intervals therefore close up, and their sum converges, so the bounce stops by itself. When the rate enters the audible range a pitch is heard and rises, with no transposition anywhere: it is the rate's own.

« Flow » launches several streams of drops whose instants do not fall in step. As « Grain size » grows, the grains overlap and fill the silences: the same generator passes continuously from the countable drop to the fused flow.

« Scrape » lays the grains at a regular interval and draws their content from somewhere else in the source each time. At zero roughness they all come from the same place and the rate's pitch is heard; at full roughness they come from everywhere and noise is heard.

« Interval » is the time between two grains: the first interval for the bounce, the mean interval for the flow, the period for the scrape. « Grain size » is the length of one grain, « Cut » the place in the source it is taken from, « Duration » the rendered length.

« Damping » is the factor of the bounce's recurrence, and acts on that model only. At one half the intervals stop closing up and the bounce never stops, which bounds the setting; the stronger it is, the longer the event stretches, and the fewer impacts it carries. « Roughness » is the share of chance in the cutting place, and acts on the scrape only.

« Streams » is the number of parallel streams. « Phase » states whether they share their instants or each has its own, and means nothing on a single stream. Streams that share their instants pile their grains at the same moment, which the paper uses for a dense wind; independent streams spread them, which it uses for water.

« Window » decides the shape of each grain. The expodec decays after a brief attack, which suits an impact; the trapezoid keeps a plateau, hence body; the Gaussian leaves matter only at the centre; the rexpodec rises then cuts.

« Seed » governs the draws, and at equal seed the render is the same. « Level » sets the output. The sum is brought back to the sum of the active windows, so neither the density nor the number of streams raises the level.

The « Modulation interval », « Modulation grain size », « Modulation cut », « Modulation roughness » and « Modulation level » inputs take the place of their setting when a curve is connected, each with its two bounds; with no curve those bounds do nothing. The first four are read at the instant each grain is launched; the level is read after the grains are laid, so it sets what comes out without moving them.

The « Audio » output carries the render. The message gives the number of grains, the number of distinct instants, the instant of the last grain and the intervals of the first and the last impact.`,
    entrees: [
      { nom: "Audio", type: "audio" },
      portModulation("Intervalle", "Interval", { court: false }),
      portModulation("Taille de grain", "Grain size", { court: false }),
      portModulation("Prise", "Cut", { court: false }),
      portModulation("Rugosité", "Roughness", { court: false }),
      portModulation("Niveau", "Level", { court: false }),
    ],
    sorties: [{ nom: "Audio", type: "audio" }],
    parametres: [
      { nom: "Modèle", nomEn: "Model", type: "choix",
        options: ["Rebond", "Écoulement", "Frottement"], optionsEn: ["Bounce", "Flow", "Scrape"],
        optionIds: ["rebond", "ecoulement", "frottement"], defaut: "Rebond", defautEn: "Bounce",
        doc: "La fonction de contrôle, c'est-à-dire les instants où les grains tombent. Le rebond resserre ses intervalles et s'arrête de lui-même, l'écoulement lance des flux qui ne tombent pas en mesure, le frottement pose à intervalle régulier et tire son contenu ailleurs.",
        docEn: "The control function, that is the instants at which the grains fall. The bounce closes up its intervals and stops by itself, the flow launches streams that do not fall in step, the scrape lays at a regular interval and draws its content elsewhere." },
      { nom: "Durée", nomEn: "Duration", type: "curseur", plage: [0.2, 30], pas: 0.1, defaut: 4, unite: "s",
        doc: "La longueur rendue. Un rebond plus court que son propre événement est coupé avant son terme.",
        docEn: "The rendered length. A bounce shorter than its own event is cut before it ends." },
      { nom: "Intervalle", nomEn: "Interval", type: "curseur", plage: [1, 1000], pas: 1, defaut: 30, unite: "ms",
        doc: "Le temps entre deux grains : le premier intervalle pour le rebond, l'intervalle moyen pour l'écoulement, la période pour le frottement.",
        docEn: "The time between two grains: the first interval for the bounce, the mean interval for the flow, the period for the scrape." },
      { nom: "Taille de grain", nomEn: "Grain size", type: "curseur", plage: [1, 500], pas: 1, defaut: 20, unite: "ms",
        doc: "La durée d'un grain. C'est elle qui fait passer l'écoulement de la goutte comptable au flux fondu, le recouvrement comblant les silences.",
        docEn: "The length of one grain. It is what moves the flow from the countable drop to the fused stream, the overlap filling the silences." },
      { nom: "Prise", nomEn: "Cut", type: "curseur", plage: [0, 100], pas: 1, defaut: 0, unite: "%",
        doc: "L'endroit de la source où le grain est découpé, de zéro au début à cent à la fin.",
        docEn: "The place in the source the grain is cut from, from zero at the start to a hundred at the end." },
      { nom: "Amortissement", nomEn: "Damping", type: "curseur", plage: [10, 49.9], pas: 0.1, defaut: 45, unite: "%",
        doc: "Le facteur de la récurrence du rebond, et il n'agit que sur ce modèle. Chaque intervalle vaut ce facteur multiplié par la somme des deux précédents : le rapport asymptotique est la racine positive de r² = d(r + 1), soit 0,93 à quarante-cinq pour cent et 0,999 à 49,9. À cinquante, ce rapport vaut un et le rebond ne s'arrête jamais, ce qui borne le réglage par le haut. Plus il est fort, plus l'événement s'étire, et moins il porte de chocs. Le pas est d'un dixième parce que c'est au voisinage de cinquante que le rapport bouge le plus vite, et que c'est là que le débit traverse l'audible assez lentement pour qu'on entende une hauteur monter : au pas de un, cette région tenait en une seule position.",
        docEn: "The factor of the bounce's recurrence, and it acts on that model only. Each interval is that factor times the sum of the two before it: the asymptotic ratio is the positive root of r² = d(r + 1), that is 0.93 at forty-five percent and 0.999 at 49.9. At fifty, that ratio is one and the bounce never stops, which bounds the setting from above. The stronger it is, the longer the event stretches, and the fewer impacts it carries. The step is a tenth because it is near fifty that the ratio moves fastest, and there that the rate crosses the audible range slowly enough for a pitch to be heard rising: at a step of one, that region held a single position." },
      { nom: "Rugosité", nomEn: "Roughness", type: "curseur", plage: [0, 100], pas: 1, defaut: 0, unite: "%",
        doc: "La part de hasard dans l'endroit de découpe, et elle n'agit que sur le frottement. À zéro tous les grains viennent du même endroit et l'on entend la hauteur du débit ; à cent ils viennent de partout et l'on entend du bruit.",
        docEn: "The share of chance in the cutting place, and it acts on the scrape only. At zero every grain comes from the same place and the rate's pitch is heard; at a hundred they come from everywhere and noise is heard." },
      { nom: "Flux", nomEn: "Streams", type: "curseur", plage: [1, 8], pas: 1, defaut: 1,
        doc: "Le nombre de flux parallèles. L'article en fait l'un des deux axes de son classement, l'autre étant leur rapport de phase.",
        docEn: "The number of parallel streams. The paper makes it one of the two axes of its classification, the other being their phase relation." },
      { nom: "Phase", nomEn: "Phase", type: "choix",
        options: ["Indépendante", "Partagée"], optionsEn: ["Independent", "Shared"],
        optionIds: ["asynchrone", "synchrone"], defaut: "Indépendante", defautEn: "Independent",
        doc: "Si les flux partagent leurs instants ou si chacun a les siens. Ce réglage ne veut rien dire sur un flux unique. Partagée, les grains s'empilent au même moment, ce que l'article emploie pour un vent dense ; indépendante, ils se répartissent, ce qu'il emploie pour l'eau.",
        docEn: "Whether the streams share their instants or each has its own. This setting means nothing on a single stream. Shared, the grains pile up at the same moment, which the paper uses for a dense wind; independent, they spread out, which it uses for water." },
      { nom: "Fenêtre", nomEn: "Window", type: "choix",
        options: FENETRES_FR, optionsEn: FENETRES_EN, optionIds: [...FENETRES],
        defaut: "Expodec", defautEn: "Expodec",
        doc: "La forme de chaque grain. L'expodec est le défaut parce qu'elle décroît après une attaque brève, ce qui est la forme d'un choc, et que deux des trois modèles reposent sur des chocs.",
        docEn: "The shape of each grain. The expodec is the default because it decays after a brief attack, which is the shape of an impact, and two of the three models rest on impacts." },
      { nom: "Niveau", nomEn: "Level", type: "curseur", plage: [0, 100], pas: 1, defaut: 80, unite: "%",
        doc: "Le niveau de sortie. Ni la densité ni le nombre de flux n'y touchent, la somme étant ramenée à la somme des fenêtres actives.",
        docEn: "The output level. Neither the density nor the number of streams affects it, the sum being brought back to the sum of the active windows." },
      { nom: "Graine", graine: true, nomEn: "Seed", type: "curseur", plage: [0, 999999], pas: 1, defaut: 1,
        doc: "Le numéro des tirages : la gigue des gouttes, la phase des flux et l'endroit de découpe. À graine égale, le même rendu.",
        docEn: "The number of the draws: the drops' jitter, the streams' phase and the cutting place. At equal seed, the same render." },
      ...bornesModulation(MOD_INTERVALLE),
      ...bornesModulation(MOD_TAILLE),
      ...bornesModulation(MOD_PRISE),
      ...bornesModulation(MOD_RUGOSITE),
      ...bornesModulation(MOD_NIVEAU),
    ],
    async executer(ctx) {
      const entree = entreeAudio(ctx, 0);
      if (sansEntree(entree)) return entree;
      const sr = entree.sampleRate;
      const n = Math.max(1, Math.round(ctx.paramNombre("Durée", 4) * sr));
      const modeleLu = ctx.paramTexte("Modèle", "rebond");
      const modele = EST_MODELE(modeleLu) ? modeleLu : "rebond";

      // LES QUATRE RÉGLAGES MODULÉS SONT EN MILLISECONDES OU EN POUR CENT À L'ÉCRAN, et le cœur les
      // attend en secondes ou en proportion. La division se fait ICI, en double précision : la
      // faire chez le cœur obligerait à ranger le quotient dans un tableau en simple précision, et
      // une courbe plate ne rendrait plus ce que rend le réglage.
      const enSecondes = (v: number | Float32Array) =>
        typeof v === "number" ? v / 1000 : Float32Array.from(v, (x) => x / 1000);

      const options = {
        sampleRate: sr, modele, duree: n,
        intervalle: enSecondes(reglageModule(ctx, n, 1, {
          reglage: "Intervalle", defaut: 30, rendu: "pourCent",
          noms: ["Intervalle min", "Intervalle max"], bornes: MOD_INTERVALLE.defauts,
        })),
        taille: enSecondes(reglageModule(ctx, n, 2, {
          reglage: "Taille de grain", defaut: 20, rendu: "pourCent",
          noms: ["Taille de grain min", "Taille de grain max"], bornes: MOD_TAILLE.defauts,
        })),
        prise: reglageModule(ctx, n, 3, {
          reglage: "Prise", defaut: 0,
          noms: ["Prise min", "Prise max"], bornes: MOD_PRISE.defauts,
        }),
        rugosite: reglageModule(ctx, n, 4, {
          reglage: "Rugosité", defaut: 0,
          noms: ["Rugosité min", "Rugosité max"], bornes: MOD_RUGOSITE.defauts,
        }),
        amortissement: ctx.paramNombre("Amortissement", 45) / 100,
        flux: Math.round(ctx.paramNombre("Flux", 1)),
        synchrone: ctx.paramTexte("Phase", "asynchrone") === "synchrone",
        fenetre: ctx.paramTexte("Fenêtre", "expodec") as Fenetre,
        // LE NIVEAU EST LU APRÈS QUE LES GRAINS SONT POSÉS : une courbe règle donc ce qui sort,
        // et ne déplace ni les grains ni la somme des fenêtres à laquelle ils sont ramenés.
        niveau: reglageModule(ctx, n, 5, {
          reglage: "Niveau", defaut: 80,
          noms: ["Niveau min", "Niveau max"], bornes: MOD_NIVEAU.defauts,
        }),
        graine: ctx.paramNombre("Graine", 1),
      };

      const canaux = entree.numberOfChannels;
      const sortie = new AudioBuffer({ numberOfChannels: canaux, length: n, sampleRate: sr });
      let rapport = { grains: 0, instantsDistincts: 0, fin: 0, premierMs: 0, dernierMs: 0, compensationMoyenne: 1 };
      for (let c = 0; c < canaux; c++) {
        const r = granulationEcologique(entree.getChannelData(c), options);
        sortie.getChannelData(c).set(r.sortie);
        rapport = r.rapport;
      }

      return {
        valeurs: [sortie],
        message: traduire("msg.granulationEcologique.rendu",
          String(rapport.grains), String(rapport.instantsDistincts),
          rapport.fin.toFixed(2),
          rapport.premierMs.toFixed(1), rapport.dernierMs.toFixed(2),
          rapportDeRebond(options.amortissement).toFixed(3)),
      };
    },
  },
] as FicheAudio[]).map(avecDoc);
