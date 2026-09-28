// plugins/maquette.ts — Poser des objets musicaux sur une ligne de temps.
//
// LES BOÎTES SONT NUMÉROTÉES, et c'est une leçon déjà payée. L'ordre d'un port multiple est celui
// dans lequel les câbles ont été tirés, qui ne se voit nulle part : une boîte 3 doit rester la
// boîte 3 quoi qu'on branche ensuite, sans quoi ses réglages suivraient une autre.
//
// CE QUE CE NŒUD FAIT ET NE FAIT PAS : voir `audio/maquette.ts`. En deux mots, une boîte s'adapte à
// sa place, elle ne se recalcule pas dedans.

import type { FicheAudio } from "../audio/types-domaine";
import { langueCourante } from "../i18n";
import { avecDoc } from "./notices";
import { dureeSequence, estSequence, type Sequence } from "../audio/sequence";
import { poserMaquette, type Bloc } from "../audio/maquette";
import { compterVoix } from "../audio/voix";

const en = () => langueCourante() === "en";

/** Le nombre de boîtes déclarées ; l'interface n'en montre que quelques-unes au départ. */
const BOITES = 8;

export const fiches: FicheAudio[] = ([
  {
    id: "maquette",
    nom: "Maquette", nomEn: "Maquette",
    univers: "Traitement", famille: "Montage",
    // Même raison que le Montage : sa ligne de temps se règle en écoutant, et son résultat effacé au
    // premier geste rendrait ce réglage aveugle.
    relanceAutomatique: true,
    resume: "Pose des séquences sur une ligne de temps, chacune à son instant, à sa durée et à sa hauteur.",
    resumeEn: "Lays sequences on a timeline, each at its own instant, length and pitch.",
    notice: "Pose les séquences reçues sur une ligne de temps et les rend en une seule.\n\nChaque boîte a trois réglages : son instant de départ, sa durée et sa transposition. Ils n'apparaissent que pour les boîtes branchées. Les boutons « + » et « − » sous les entrées allongent ou raccourcissent le composant, jusqu'à huit boîtes.\n\nLa ligne de temps, sur le composant, montre les boîtes à leur place et à leur durée réelle après une exécution, et les notes de chaque boîte dans sa barre, la plus haute en haut. On déplace une boîte en tirant sa barre, on règle sa durée en tirant son bord droit. La touche Maj rend le geste dix fois plus fin, la touche Alt cent fois. La molette zoome sur l'instant visé, le curseur de zoom fait de même, et le composant s'élargit par ses bords pour donner plus de place à la ligne.\n\n« Début » est l'instant où la boîte commence, en secondes.\n\n« Durée » impose une durée à la boîte : son contenu est étiré ou resserré dans le même rapport, les départs et les longueurs des notes étant multipliés par un même facteur. Les rapports du rythme sont donc gardés et c'est la pulsation qui change. À zéro, la boîte garde sa durée propre.\n\n« Transposition » déplace les hauteurs de la boîte, en demi-tons, fractions comprises.\n\n« Une voix par boîte » donne à chaque boîte son propre numéro de voix, ce qui grave autant de portées qu'il y a de boîtes. Sans ce réglage, tout se fond en une seule ligne, ce qui convient quand les boîtes se suivent sans se recouvrir.\n\nLes boîtes se superposent et ne se chassent pas : deux boîtes qui se recouvrent sonnent ensemble, et rien n'est tronqué pour faire de la place. La durée du résultat va jusqu'au bout de la dernière boîte, et non jusqu'à sa dernière note.\n\nL'écriture mesurée d'une boîte ne suit pas, sauf pour une boîte posée à zéro et gardant sa durée propre : un arbre rythmique décrit une pièce qui commence au début, à un tempo donné, et ni le déplacement ni l'étirement ne laissent cela vrai. Une écriture se retrouve en quantifiant le résultat.\n\nLa sortie « Séquence » porte toutes les notes posées. La sortie « Analyse » liste les boîtes avec leur instant, leur durée, leur facteur d'étirement et leur transposition.\n\nLe message donne le nombre de boîtes, le nombre de notes et la durée.",
    noticeEn: "Lays the received sequences on a timeline and returns them as one.\n\nEach box has three settings: its start instant, its length and its transposition. They only appear for connected boxes. The « + » and « - » buttons under the inputs make the node longer or shorter, up to eight boxes.\n\nThe timeline, on the node, shows the boxes at their place and at their real length after a run, and each box's notes inside its bar, the highest at the top. A box is moved by dragging its bar, and its length is set by dragging its right edge. Shift makes the gesture ten times finer, Alt a hundred times. The wheel zooms on the aimed instant, the zoom slider does the same, and the node widens by its edges to give the timeline more room.\n\n« Start » is the instant at which the box begins, in seconds.\n\n« Length » imposes a length on the box: its content is stretched or compressed in the same ratio, note starts and lengths being multiplied by one same factor. The ratios of the rhythm are therefore kept and it is the pulse that changes. At zero, the box keeps its own length.\n\n« Transposition » moves the pitches of the box, in semitones, fractions included.\n\n« One voice per box » gives each box its own voice number, which engraves as many staves as there are boxes. Without this setting, everything merges into a single line, which suits boxes that follow one another without overlapping.\n\nBoxes overlap and do not push one another aside: two boxes that overlap sound together, and nothing is trimmed to make room. The length of the result runs to the end of the last box, not to its last note.\n\nThe written rhythm of a box does not follow, except for a box laid at zero and keeping its own length: a rhythm tree describes a piece that starts at the beginning, at a given tempo, and neither moving nor stretching leaves that true. A writing is recovered by quantizing the result.\n\nThe « Sequence » output carries every note laid down. The « Analysis » output lists the boxes with their instant, their length, their stretch factor and their transposition.\n\nThe message gives the number of boxes, the number of notes and the length.",
    entrees: Array.from({ length: BOITES }, (_, k) => ({
      nom: `Boîte ${k + 1}`, nomEn: `Box ${k + 1}`, type: "sequence", requis: false,
    })),
    entreesExtensibles: { min: 2, defaut: 3 },
    sorties: [
      { nom: "Séquence", nomEn: "Sequence", type: "sequence" },
      { nom: "Analyse", nomEn: "Analysis", type: "texte" },
    ],
    parametres: [
      ...Array.from({ length: BOITES }, (_, k) => [
        { nom: `Début ${k + 1}`, nomEn: `Start ${k + 1}`, plage: [0, 600], pas: 0.01, defaut: k * 2, unite: "s", port: k,
          doc: `Instant où commence la boîte ${k + 1}.`,
          docEn: `Instant at which box ${k + 1} starts.` },
        { nom: `Durée ${k + 1}`, nomEn: `Length ${k + 1}`, plage: [0, 600], pas: 0.01, defaut: 0, unite: "s", port: k,
          doc: `Durée imposée à la boîte ${k + 1}, son contenu étant étiré dans le même rapport. À zéro, la boîte garde sa durée propre.`,
          docEn: `Length imposed on box ${k + 1}, its content being stretched in the same ratio. At zero, the box keeps its own length.` },
        { nom: `Transposition ${k + 1}`, nomEn: `Transposition ${k + 1}`, plage: [-24, 24], pas: 0.5, defaut: 0, port: k,
          doc: `Déplacement des hauteurs de la boîte ${k + 1}, en demi-tons.`,
          docEn: `Shift of box ${k + 1}'s pitches, in semitones.` },
      ]).flat(),
      { nom: "Une voix par boîte", nomEn: "One voice per box", type: "choix",
        options: ["Oui", "Non"], optionsEn: ["Yes", "No"], optionIds: ["oui", "non"],
        defaut: "Oui", defautEn: "Yes",
        doc: "Donne à chaque boîte son propre numéro de voix, ce qui grave autant de portées qu'il y a de boîtes.",
        docEn: "Gives each box its own voice number, which engraves as many staves as there are boxes." },
    ],
    async executer(ctx: any) {
      const blocs: Bloc[] = [];
      // LE NUMÉRO DE PORT EST GARDÉ À PART. Le rang d'un bloc est sa place parmi les boîtes
      // BRANCHÉES, qui n'est pas son numéro dès qu'on en saute une : la ligne de temps, elle, range
      // par numéro de port, et les confondre ferait porter les réglages d'une boîte par une autre.
      const ports: number[] = [];
      for (let k = 0; k < BOITES; k++) {
        const recue = ctx.entree(k);
        if (!estSequence(recue) || recue.notes.length === 0) continue;
        ports.push(k);
        blocs.push({
          sequence: recue,
          debut: ctx.paramNombre(`Début ${k + 1}`, k * 2),
          duree: ctx.paramNombre(`Durée ${k + 1}`, 0),
          transposition: ctx.paramNombre(`Transposition ${k + 1}`, 0),
          nom: `${en() ? "Box" : "Boîte"} ${k + 1}`,
        });
      }
      if (blocs.length === 0) {
        return {
          valeurs: [null, null], erreur: true,
          message: en() ? "No usable sequence." : "Aucune séquence exploitable.",
        };
      }

      const enVoix = ctx.paramTexte("Une voix par boîte", "oui") !== "non";
      const { sequence, blocs: poses } = poserMaquette(blocs, { enVoix });
      // LA LIGNE DE TEMPS DE L'INSPECTEUR A BESOIN DES DURÉES RÉELLES, que seule l'exécution
      // connaît : une boîte dont la durée reste à zéro garde celle de son contenu, et sa barre doit
      // la montrer plutôt qu'une largeur nominale.
      (ctx.noeud.data as any)._dureesMesurees = poses.map((b, i) => ({ piste: ports[i], duree: b.duree }));
      // LES NOTES DE CHAQUE BOÎTE, RAMENÉES À SA DURÉE PROPRE. La ligne de temps les dessine dans la
      // barre de la boîte : sans elles, la barre dirait la place et la durée d'une boîte et rien de ce
      // qu'elle contient, et l'on poserait une boîte sans voir ce qu'on pose. Des fractions suffisent,
      // une durée imposée étirant le contenu dans un rapport unique et une transposition déplaçant
      // toutes les hauteurs du même intervalle : ni l'une ni l'autre ne change le dessin relatif. Le
      // champ préfixé d'un blanc souligné n'est pas enregistré avec le projet.
      (ctx.noeud.data as any)._maquetteNotes = Object.fromEntries(blocs.map((b, i) => {
        const propre = dureeSequence(b.sequence);
        if (!(propre > 0)) return [ports[i], []];
        return [ports[i], b.sequence.notes.map((nt) => ({
          debut: nt.debut / propre,
          duree: Math.max(0, nt.fin - nt.debut) / propre,
          note: nt.note,
        }))];
      }));
      const lignes = poses.map((b, i) => {
        const etire = Math.abs(b.facteur - 1) > 1e-9
          ? `  ×${b.facteur.toFixed(3)}`
          : `  ${en() ? "own length" : "durée propre"}`;
        const transpose = b.transposition !== 0
          ? `  ${b.transposition > 0 ? "+" : ""}${b.transposition} ${en() ? "semitones" : "demi-tons"}`
          : "";
        return `${blocs[i].nom}  ${b.debut.toFixed(2)} s  ${b.duree.toFixed(2)} s  ${b.notes} notes${etire}${transpose}`;
      });
      const entete = `${poses.length} ${en() ? "boxes" : "boîtes"} · ${sequence.notes.length} notes · `
        + `${dureeSequence(sequence).toFixed(2)} s · `
        + `${compterVoix(sequence)} ${en() ? "voices" : "voix"}`;
      return {
        valeurs: [sequence as Sequence, [entete, "", ...lignes].join("\n")],
        message: entete,
      };
    },
  },
] as FicheAudio[]).map(avecDoc);
