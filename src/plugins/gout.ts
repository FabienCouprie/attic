// plugins/gout.ts — Nœud « Le goût d'un son ».
//
// Il situe un son dans l'espace des correspondances entre musique et goût, établi par Mesz,
// Trevisan et Sigman à partir d'improvisations sur les quatre mots de goût. Le calcul, les régions
// et leurs sources sont dans `audio/gout.ts`, pur et testé ; ce fichier n'est que la prise.

import type { FicheAudio } from "../audio/types-domaine";
import { langueCourante } from "../i18n";
import { avecDoc } from "./notices";
import { mesurer, profil, rapport } from "../audio/gout";

const en = () => langueCourante() === "en";

export const fiches: FicheAudio[] = ([
  {
    id: "gout-du-son", nom: "Le goût d'un son", nomEn: "The Taste of a Sound",
    univers: "Visualisation", famille: "Analyse",
    resume: "Situe un son entre sucré, acide, amer et salé, d'après les correspondances publiées entre musique et goût, et dit ce qui l'y place.",
    resumeEn: "Places a sound between sweet, sour, bitter and salty, after the published music-taste correspondences, and says what puts it there.",
    notice: "Ce composant mesure cinq caractéristiques d'un son (son registre, son articulation, sa vitesse, sa consonance et son intensité) et rend la part de chacun des quatre goûts, avec le détail des mesures.\n\nD'où viennent ces quatre régions. Mesz, Trevisan et Sigman ont fait improviser des musiciens sur les mots sucré, acide, amer et salé, puis ont placé chaque improvisation dans cet espace à cinq dimensions. Les régions y sont assez distinctes pour qu'un classifieur retrouve le mot à partir de la seule mélodie huit fois sur dix : le sucré est consonant, lent, doux et lié ; l'acide aigu, dissonant et rapide ; l'amer grave et lié ; le salé piqué, avec des silences entre les notes. Crisinel et Spence y ajoutent l'aigu pour le sucré et le grave pour l'amer.\n\nComment chaque dimension est calculée. Le registre est la fréquence médiane de l'énergie, et non la fondamentale : la période commune d'un accord de do majeur (262, 330 et 392 Hz) désigne une fondamentale absente à 65 Hz, quand l'énergie de l'accord se tient deux octaves plus haut. L'articulation est la part du temps où le son s'entend, au-dessus de 35 dB sous sa crête : c'est le silence entre les notes qui sépare le piqué du lié, non leur nombre. La vitesse compte les attaques par seconde, une attaque étant une montée au-dessus de la moyenne des cinq fenêtres précédentes, suivie d'un temps mort de 60 ms. La consonance vient de la rugosité des partiels, rapportée à leur énergie, de sorte qu'un passage fort ne soit pas déclaré rugueux pour autant. L'intensité est le niveau efficace.\n\nLes quatre parts se répartissent par l'inverse du carré des distances aux régions : aucun goût n'est jamais nul, et un son n'appartient jamais tout à fait à une case, les correspondances décrites par la littérature étant graduelles et non catégorielles. Chaque dimension pèse selon ce que la littérature en dit pour le goût considéré : le registre compte double pour l'amer, l'articulation double pour le salé.\n\nLes auteurs n'ont pas publié les moyennes et écarts-types de leurs régions : les valeurs employées ici sont une lecture chiffrée de leurs descriptions. Ce composant situe un son dans un espace de correspondances ; il ne modifie pas le goût d'un aliment.\n\nSources. B. Mesz, M. A. Trevisan et M. Sigman, « The Taste of Music », Perception 40, 2011 (doi 10.1068/p6801) : les quatre régions et l'espace à cinq dimensions. B. Mesz, M. Sigman et M. A. Trevisan, « A Composition Algorithm Based on Crossmodal Taste-Music Correspondences », Frontiers in Human Neuroscience 6, 2012 (doi 10.3389/fnhum.2012.00071) : la réduction de distance à une région. A.-S. Crisinel et C. Spence, « As Bitter as a Trombone », Attention, Perception & Psychophysics 72, 2010 (doi 10.3758/app.72.7.1994) : hauteur et timbre. K. Knöferle et C. Spence, « Crossmodal Correspondences Between Sounds and Tastes », Psychonomic Bulletin & Review, 2012 (doi 10.3758/s13423-012-0321-z) : la revue du domaine et ses réserves : les correspondances sont en partie médiées par le langage, et varient avec la culture et la formation musicale. L. Euler, Tentamen novae theoriae musicae, 1739 : le gradus suavitatis, d'où vient la mesure de consonance.",
    noticeEn: "This node measures five features of a sound (its register, articulation, speed, consonance and loudness) and returns the share of each of the four tastes, with the measurements behind them.\n\nWhere the four regions come from. Mesz, Trevisan and Sigman had musicians improvise on the words sweet, sour, bitter and salty, then placed each improvisation in this five-dimensional space. The regions are distinct enough that a classifier recovers the word from the melody alone eight times out of ten: sweet is consonant, slow, soft and legato; sour high, dissonant and fast; bitter low and legato; salty staccato, with silences between the notes. Crisinel and Spence add high pitch for sweet and low for bitter.\n\nHow each dimension is computed. The register is the median frequency of the energy, not the fundamental: the common period of a C major chord (262, 330 and 392 Hz) points to an absent fundamental at 65 Hz, while the chord's energy sits two octaves higher. Articulation is the share of time the sound is heard, above 35 dB below its peak: it is the silence between notes that separates staccato from legato, not their number. Speed counts attacks per second, an attack being a rise above the mean of the five preceding windows, followed by a 60 ms dead time. Consonance comes from the roughness of the partials, relative to their energy, so that a loud passage is not called rough for being loud. Loudness is the root-mean-square level.\n\nThe four shares are distributed by the inverse square of the distances to the regions: no taste is ever zero, and a sound never quite belongs to one box, the correspondences described by the literature being gradual rather than categorical. Each dimension is weighted by what the literature says of it for the taste at hand: the register counts double for bitter, articulation double for salty.\n\nThe authors did not publish the means and standard deviations of their regions: the values used here are a numbered reading of their descriptions. This node places a sound in a space of correspondences; it does not change the taste of any food.\n\nSources. B. Mesz, M. A. Trevisan and M. Sigman, “The Taste of Music”, Perception 40, 2011 (doi 10.1068/p6801): the four regions and the five-dimensional space. B. Mesz, M. Sigman and M. A. Trevisan, “A Composition Algorithm Based on Crossmodal Taste-Music Correspondences”, Frontiers in Human Neuroscience 6, 2012 (doi 10.3389/fnhum.2012.00071): the distance reduction to a region. A.-S. Crisinel and C. Spence, “As Bitter as a Trombone”, Attention, Perception & Psychophysics 72, 2010 (doi 10.3758/app.72.7.1994): pitch and timbre. K. Knöferle and C. Spence, “Crossmodal Correspondences Between Sounds and Tastes”, Psychonomic Bulletin & Review, 2012 (doi 10.3758/s13423-012-0321-z): the field's own review and its caveats: the correspondences are partly mediated by language, and vary with culture and musical training. L. Euler, Tentamen novae theoriae musicae, 1739: the gradus suavitatis, from which the consonance measure comes.",
    entrees: [{ nom: "Audio", nomEn: "Audio", type: "audio" }],
    sorties: [
      { nom: "Audio", nomEn: "Audio", type: "audio" },
      { nom: "Rapport", nomEn: "Report", type: "texte" },
    ],
    parametres: [],
    async executer(ctx: any) {
      const a = ctx.entree(0);
      if (!(a instanceof AudioBuffer)) {
        return { valeurs: [null, null], message: en() ? "No audio input." : "Aucune entrée audio." };
      }
      const anglais = en();
      const m = mesurer(a);
      const parts = profil(m.dimensions);
      // La vue lit le profil ici : quatre barres valent mieux qu'un tableau de chiffres pour voir
      // d'un coup où penche un son.
      (ctx.noeud.data as Record<string, unknown>)._profilGout = parts.map((p) => ({ gout: p.gout, part: p.part }));
      const noms: Record<string, string> = anglais
        ? { "sucré": "sweet", "acide": "sour", "amer": "bitter", "salé": "salty" } : {};
      const tete = parts.slice(0, 2)
        .map((p) => `${noms[p.gout] ?? p.gout} ${Math.round(p.part * 100)} %`)
        .join(" · ");
      return { valeurs: [a, rapport(m, parts, anglais)], message: tete };
    },
  },
] as FicheAudio[]).map(avecDoc);
