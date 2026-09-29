// plugins/assaisonnement.ts — Nœud « Assaisonnement sonore ».
//
// Le calcul, les gestes et leurs raisons sont dans `audio/assaisonnement.ts`, pur et testé ; les
// cinq dimensions et les régions dans `audio/gout.ts`. Ce fichier n'est que la prise.

import type { FicheAudio } from "../audio/types-domaine";
import { langueCourante } from "../i18n";
import { avecDoc } from "./notices";
import { assaisonnerVers } from "../audio/assaisonnement";
import { goutDominant, pointDepuisDegustation, type ProfilDegustation } from "../audio/accord-mets";
import { profil, type Gout } from "../audio/gout";

const en = () => langueCourante() === "en";

/** Les quatre goûts, dans l'ordre où le composant les montre. */
const GOUTS: Gout[] = ["sucré", "acide", "amer", "salé"];

export const fiches: FicheAudio[] = ([
  {
    id: "assaisonnement-sonore", nom: "Assaisonnement sonore", nomEn: "Sonic Seasoning",
    univers: "Traitement", famille: "Effets",
    resume: "Déplace un son vers un profil de goût, une part de sucré, d'acide, d'amer et de salé, et dit de combien il a bougé.",
    resumeEn: "Moves a sound toward a taste profile, a share of sweet, sour, bitter and salty, and says how far it moved.",
    notice: "Ce composant mesure où se tient un son dans l'espace des correspondances entre musique et goût, puis le déplace vers le profil demandé, à la dose choisie. Il rend le son transformé et un rapport qui donne la cible, la distance à cette cible avant et après, le profil de goût avant et après, et les réglages appliqués.\n\nLa cible est un profil et non un goût unique. « Sucré », « Acide », « Amer » et « Salé » pèsent les quatre régions les unes contre les autres : seule leur proportion compte, non leur somme, et une seule part à cent donne exactement la région de ce goût. Les quatre régions pondérées par ces parts donnent un point, et c'est ce point que le son rejoint.\n\nUn profil qui mêle plusieurs goûts tombe entre les régions. Ce n'est pas une demi-mesure vers l'un d'eux mais une direction en soi ; la littérature donne quatre régions et non une carte continue des dégustations, si bien qu'un profil équilibré vise le centre, où aucun goût ne domine.\n\nLa distance à la cible est ce qui dit si le geste a porté. La part d'un goût ne suffit pas quand la cible est un mélange : viser à la fois le sucré et le salé peut faire baisser les deux parts tout en s'approchant du point visé.\n\nLes quatre parts à zéro ne désignent aucune cible, et le composant le dit au lieu de viser le centre par défaut.\n\nCinq gestes, un par dimension. Le registre se déplace par transposition, qui garde la durée. La vitesse se déplace par étirement temporel, qui garde la hauteur. L'articulation se déplace dans les deux sens : vers le piqué, une porte creuse les silences entre les notes ; vers le lié, une queue de résonance les remplit. La consonance se déplace vers le rugueux par une copie désaccordée qui bat contre l'original, et vers le consonant par un filtre qui ôte l'aigu, d'où vient la rugosité. L'intensité, par un gain.\n\nL'ordre des opérations. La porte travaille sur l'enveloppe d'origine, donc avant tout étirement ; la transposition vient après l'étirement ; le gain passe en dernier.\n\nCe que chaque geste peut et ne peut pas. Un enregistrement n'est pas une partition : ses notes ne se récrivent pas, seul se traite ce que le signal porte. La consonance est la plus faible des cinq : ce qui bat s'ôte, ce qui n'est pas consonant ne le devient pas. La transposition est bornée à une octave dans chaque sens, et la dose n'augmente plus l'écart une fois cette borne atteinte.\n\nLa dose fait la part du chemin : à 50 %, chaque écart à la région est réduit de moitié. À 0 %, le son ressort intact.\n\nCe composant déplace un son dans un espace de correspondances ; il ne modifie pas le goût d'un aliment.\n\nSources. B. Mesz, M. A. Trevisan et M. Sigman, « The Taste of Music », Perception 40, 2011 (doi 10.1068/p6801) : les quatre régions et l'espace à cinq dimensions. B. Mesz, M. Sigman et M. A. Trevisan, « A Composition Algorithm Based on Crossmodal Taste-Music Correspondences », Frontiers in Human Neuroscience 6, 2012 (doi 10.3389/fnhum.2012.00071) : la réduction de distance à une région. A.-S. Crisinel et C. Spence, « As Bitter as a Trombone », Attention, Perception & Psychophysics 72, 2010 (doi 10.3758/app.72.7.1994) : hauteur et timbre. K. Knöferle et C. Spence, « Crossmodal Correspondences Between Sounds and Tastes », Psychonomic Bulletin & Review, 2012 (doi 10.3758/s13423-012-0321-z) : la revue du domaine et ses réserves : les correspondances sont en partie médiées par le langage, et varient avec la culture et la formation musicale. L. Euler, Tentamen novae theoriae musicae, 1739 : le gradus suavitatis, d'où vient la mesure de consonance. A.-S. Crisinel et al., « A Bittersweet Symphony », Food Quality and Preference 24, 2012, et Q. J. Wang, B. Mesz et C. Spence sur le vin par dominance temporelle des sensations : la musique déplace les jugements de dégustation, avec des tailles d'effet moyennes, de 0,54 à 0,66 en d de Cohen.",
    noticeEn: "This node measures where a sound sits in the space of music-taste correspondences, then moves it toward the requested profile, by the chosen dose. It returns the transformed sound and a report giving the target, the distance to that target before and after, the taste profile before and after, and the applied settings.\n\nThe target is a profile and not a single taste. « Sweet », « Sour », « Bitter » and « Salty » weigh the four regions against each other: only their proportion counts, not their sum, and a single share at one hundred gives exactly that taste's region. The four regions weighted by these shares give a point, and it is that point the sound joins.\n\nA profile mixing several tastes falls between the regions. That is not a half-measure toward one of them but a direction in itself; the literature gives four regions and not a continuous map of tastings, so a balanced profile aims at the centre, where no taste dominates.\n\nThe distance to the target is what says whether the gesture carried. A taste's share does not suffice when the target is a mixture: aiming at both sweet and salty can lower both shares while closing in on the point aimed at.\n\nFour shares at zero designate no target, and the node says so instead of aiming at the centre by default.\n\nFive gestures, one per dimension. The register moves by transposition, which keeps the duration. The speed moves by time-stretching, which keeps the pitch. Articulation moves both ways: toward staccato, a gate hollows out the silences between notes; toward legato, a resonant tail fills them. Consonance moves toward roughness through a detuned copy beating against the original, and toward consonance through a filter that removes the highs, where roughness lives. Loudness, by a gain.\n\nThe order of operations. The gate works on the original envelope, hence before any stretching; the transposition comes after the stretching; the gain comes last.\n\nWhat each gesture can and cannot do. A recording is not a score: its notes cannot be rewritten, only what the signal carries can be treated. Consonance is the weakest of the five: what beats can be removed, what is not consonant does not become so. Transposition is capped at one octave either way, and the dose no longer widens the gap once that cap is reached.\n\nThe dose covers part of the distance: at 50%, every gap to the region is halved. At 0%, the sound comes out untouched.\n\nThis node moves a sound within a space of correspondences; it does not change the taste of any food.\n\nSources. B. Mesz, M. A. Trevisan and M. Sigman, “The Taste of Music”, Perception 40, 2011 (doi 10.1068/p6801): the four regions and the five-dimensional space. B. Mesz, M. Sigman and M. A. Trevisan, “A Composition Algorithm Based on Crossmodal Taste-Music Correspondences”, Frontiers in Human Neuroscience 6, 2012 (doi 10.3389/fnhum.2012.00071): the distance reduction to a region. A.-S. Crisinel and C. Spence, “As Bitter as a Trombone”, Attention, Perception & Psychophysics 72, 2010 (doi 10.3758/app.72.7.1994): pitch and timbre. K. Knöferle and C. Spence, “Crossmodal Correspondences Between Sounds and Tastes”, Psychonomic Bulletin & Review, 2012 (doi 10.3758/s13423-012-0321-z): the field's own review and its caveats: the correspondences are partly mediated by language, and vary with culture and musical training. L. Euler, Tentamen novae theoriae musicae, 1739: the gradus suavitatis, from which the consonance measure comes. A.-S. Crisinel et al., “A Bittersweet Symphony”, Food Quality and Preference 24, 2012, and Q. J. Wang, B. Mesz and C. Spence on wine by temporal dominance of sensations: music shifts tasting judgements, with medium effect sizes, 0.54 to 0.66 in Cohen's d.",
    entrees: [{ nom: "Audio", nomEn: "Audio", type: "audio" }],
    sorties: [
      { nom: "Audio", nomEn: "Audio", type: "audio" },
      { nom: "Rapport", nomEn: "Report", type: "texte" },
    ],
    parametres: [
      { nom: "Sucré", nomEn: "Sweet", type: "curseur", plage: [0, 100], pas: 1, defaut: 100, unite: "%",
        doc: "Part du sucré dans la cible : consonant, lent, doux, lié. Les quatre parts se pèsent les unes contre les autres ; seule leur proportion compte, non leur somme.",
        docEn: "Share of sweet in the target: consonant, slow, soft, legato. The four shares weigh against each other; only their proportion counts, not their sum." },
      { nom: "Acide", nomEn: "Sour", type: "curseur", plage: [0, 100], pas: 1, defaut: 0, unite: "%",
        doc: "Part de l'acide dans la cible : aigu, dissonant, rapide.",
        docEn: "Share of sour in the target: high, dissonant, fast." },
      { nom: "Amer", nomEn: "Bitter", type: "curseur", plage: [0, 100], pas: 1, defaut: 0, unite: "%",
        doc: "Part de l'amer dans la cible : grave et lié.",
        docEn: "Share of bitter in the target: low and legato." },
      { nom: "Salé", nomEn: "Salty", type: "curseur", plage: [0, 100], pas: 1, defaut: 0, unite: "%",
        doc: "Part du salé dans la cible : piqué, avec des silences entre les notes.",
        docEn: "Share of salty in the target: staccato, with silences between the notes." },
      { nom: "Dose", nomEn: "Dose", type: "curseur", plage: [0, 100], pas: 1, defaut: 60, unite: "%",
        doc: "La part du chemin parcourue vers la région : à 0 %, le son ressort intact ; à 100 %, chaque dimension est amenée jusqu'à la valeur de la région, dans la limite de ce que chaque geste autorise.",
        docEn: "How far toward the region: at 0%, the sound comes out untouched; at 100%, every dimension is taken to the region's value, within what each gesture allows." },
    ],
    async executer(ctx: any) {
      const a = ctx.entree(0);
      if (!(a instanceof AudioBuffer)) {
        return { valeurs: [null, null], message: en() ? "No audio input." : "Aucune entrée audio." };
      }
      const anglais = en();
      const dose = ctx.paramNombre("Dose", 60) / 100;
      const noms: Record<Gout, string> = anglais
        ? { "sucré": "sweet", "acide": "sour", "amer": "bitter", "salé": "salty" }
        : { "sucré": "sucré", "acide": "acide", "amer": "amer", "salé": "salé" };

      // LA CIBLE EST UN POINT, ET NON UN SOMMET. Les quatre parts pèsent les quatre régions ;
      // `pointDepuisDegustation` en fait le barycentre, le même calcul que l'accord d'un mets.
      const demande: ProfilDegustation = {
        "sucré": ctx.paramNombre("Sucré", 100),
        "acide": ctx.paramNombre("Acide", 0),
        "amer": ctx.paramNombre("Amer", 0),
        "salé": ctx.paramNombre("Salé", 0),
      };
      const cible = pointDepuisDegustation(demande);
      if (!cible) {
        return { valeurs: [null, null], erreur: true,
          message: anglais ? "Every share is at zero: no target." : "Les quatre parts sont à zéro : aucune cible." };
      }
      const total = GOUTS.reduce((s, g2) => s + Math.max(0, demande[g2]), 0);
      const dominant = goutDominant(demande)!;
      const r = await assaisonnerVers(a, cible, dose);
      const v = (x: number, d = 2) => (anglais ? x.toFixed(d) : x.toFixed(d).replace(".", ","));
      const pc = (x: number) => `${Math.round(x * 100)} %`;
      const g = r.reglages;
      const profilAvant = profil(r.avant);
      const profilApres = profil(r.apres);
      const partDe = (liste: typeof profilAvant, g2: Gout) => liste.find((p) => p.gout === g2)!.part;
      const lignes = [
        anglais ? "Target" : "Cible",
        ...GOUTS.filter((g2) => demande[g2] > 0).map((g2) =>
          `  ${noms[g2].padEnd(14)} ${pc(Math.max(0, demande[g2]) / total)}`),
        "",
        // LA DISTANCE EST CE QUI RÉPOND À LA QUESTION POSÉE. Viser un point situé entre deux régions
        // peut faire baisser les deux parts tout en s'en approchant : seule la distance le dit.
        `${anglais ? "Distance to target" : "Distance à la cible"} : ${v(r.distanceAvant)} → ${v(r.distanceApres)}`,
        "",
        anglais ? "Taste profile, before → after" : "Profil de goût, avant → après",
        ...GOUTS.map((g2) =>
          `  ${noms[g2].padEnd(14)} ${pc(partDe(profilAvant, g2))} → ${pc(partDe(profilApres, g2))}`),
        "",
        anglais ? "Done" : "Fait",
        `  ${(anglais ? "transposition" : "transposition").padEnd(14)} ${v(g.demiTons, 1)} ${anglais ? "semitones" : "demi-tons"}`,
        `  ${(anglais ? "speed" : "vitesse").padEnd(14)} ${v(g.vitesse, 2)} ×`,
        `  ${(anglais ? "gate" : "porte").padEnd(14)} ${v(g.porte)}`,
        `  ${(anglais ? "tail" : "queue").padEnd(14)} ${v(g.queue)} s`,
        `  ${(anglais ? "detune" : "désaccord").padEnd(14)} ${Math.round(g.desaccord)} ${anglais ? "cents" : "cents"}`,
        `  ${(anglais ? "low-pass" : "coupure").padEnd(14)} ${g.coupure > 0 ? `${Math.round(g.coupure)} Hz` : "—"}`,
        `  ${(anglais ? "gain" : "gain").padEnd(14)} ${v(g.gainDb, 1)} dB`,
        "",
        anglais ? "Dimensions, before → after" : "Dimensions, avant → après",
        `  ${(anglais ? "register" : "registre").padEnd(14)} ${v(r.avant.hauteur)} → ${v(r.apres.hauteur)}`,
        `  ${(anglais ? "articulation" : "articulation").padEnd(14)} ${v(r.avant.articulation)} → ${v(r.apres.articulation)}`,
        `  ${(anglais ? "speed" : "vitesse").padEnd(14)} ${v(r.avant.vitesse)} → ${v(r.apres.vitesse)}`,
        `  ${(anglais ? "consonance" : "consonance").padEnd(14)} ${v(r.avant.consonance)} → ${v(r.apres.consonance)}`,
        `  ${(anglais ? "loudness" : "intensité").padEnd(14)} ${v(r.avant.intensite)} → ${v(r.apres.intensite)}`,
      ];
      return {
        valeurs: [r.son, lignes.join("\n")],
        // LE MESSAGE NOMME LE DOMINANT ET DIT SI LA CIBLE EST PURE : une combinaison ne se résume
        // pas à un goût, et laisser croire le contraire ferait lire un déplacement de travers.
        message: `${noms[dominant.gout]} ${pc(dominant.part)}${dominant.part >= 0.999 ? "" : ` ${anglais ? "et al." : "et autres"}`}`
          + ` · ${anglais ? "distance" : "distance"} ${v(r.distanceAvant)} → ${v(r.distanceApres)}`,
      };
    },
  },
] as FicheAudio[]).map(avecDoc);
