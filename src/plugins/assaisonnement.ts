// plugins/assaisonnement.ts — Nœud « Assaisonnement sonore ».
//
// Le calcul, les gestes et leurs raisons sont dans `audio/assaisonnement.ts`, pur et testé ; les
// cinq dimensions et les régions dans `audio/gout.ts`. Ce fichier n'est que la prise.

import type { FicheAudio } from "../audio/types-domaine";
import { langueCourante } from "../i18n";
import { avecDoc } from "./notices";
import { assaisonner } from "../audio/assaisonnement";
import type { Gout } from "../audio/gout";

const en = () => langueCourante() === "en";

const PAR_ID: Record<string, Gout> = { sucre: "sucré", acide: "acide", amer: "amer", sale: "salé" };

export const fiches: FicheAudio[] = ([
  {
    id: "assaisonnement-sonore", nom: "Assaisonnement sonore", nomEn: "Sonic Seasoning",
    univers: "Traitement", famille: "Effets",
    resume: "Déplace un son vers la région musicale d'un goût (sucré, acide, amer ou salé) et dit de combien il a bougé.",
    resumeEn: "Moves a sound toward the musical region of a taste (sweet, sour, bitter or salty) and says how far it moved.",
    notice: "Ce composant mesure où se tient un son dans l'espace des correspondances entre musique et goût, puis le déplace vers la région du goût choisi, à la dose demandée. Il rend le son transformé et un rapport qui donne les réglages appliqués et la part du goût visé avant et après.\n\nCinq gestes, un par dimension. Le registre se déplace par transposition, qui garde la durée. La vitesse se déplace par étirement temporel, qui garde la hauteur. L'articulation se déplace dans les deux sens : vers le piqué, une porte creuse les silences entre les notes ; vers le lié, une queue de résonance les remplit. La consonance se déplace vers le rugueux par une copie désaccordée qui bat contre l'original, et vers le consonant par un filtre qui ôte l'aigu, d'où vient la rugosité. L'intensité, par un gain.\n\nL'ordre des opérations. La porte travaille sur l'enveloppe d'origine, donc avant tout étirement ; la transposition vient après l'étirement ; le gain passe en dernier.\n\nCe que chaque geste peut et ne peut pas. Un enregistrement n'est pas une partition : ses notes ne se récrivent pas, seul se traite ce que le signal porte. La consonance est la plus faible des cinq : ce qui bat s'ôte, ce qui n'est pas consonant ne le devient pas. La transposition est bornée à une octave dans chaque sens, et la dose n'augmente plus l'écart une fois cette borne atteinte.\n\nLa dose fait la part du chemin : à 50 %, chaque écart à la région est réduit de moitié. À 0 %, le son ressort intact.\n\nCe composant déplace un son dans un espace de correspondances ; il ne modifie pas le goût d'un aliment.\n\nSources. B. Mesz, M. A. Trevisan et M. Sigman, « The Taste of Music », Perception 40, 2011 (doi 10.1068/p6801) : les quatre régions et l'espace à cinq dimensions. B. Mesz, M. Sigman et M. A. Trevisan, « A Composition Algorithm Based on Crossmodal Taste-Music Correspondences », Frontiers in Human Neuroscience 6, 2012 (doi 10.3389/fnhum.2012.00071) : la réduction de distance à une région. A.-S. Crisinel et C. Spence, « As Bitter as a Trombone », Attention, Perception & Psychophysics 72, 2010 (doi 10.3758/app.72.7.1994) : hauteur et timbre. K. Knöferle et C. Spence, « Crossmodal Correspondences Between Sounds and Tastes », Psychonomic Bulletin & Review, 2012 (doi 10.3758/s13423-012-0321-z) : la revue du domaine et ses réserves : les correspondances sont en partie médiées par le langage, et varient avec la culture et la formation musicale. L. Euler, Tentamen novae theoriae musicae, 1739 : le gradus suavitatis, d'où vient la mesure de consonance. A.-S. Crisinel et al., « A Bittersweet Symphony », Food Quality and Preference 24, 2012, et Q. J. Wang, B. Mesz et C. Spence sur le vin par dominance temporelle des sensations : la musique déplace les jugements de dégustation, avec des tailles d'effet moyennes, de 0,54 à 0,66 en d de Cohen.",
    noticeEn: "This node measures where a sound sits in the space of music-taste correspondences, then moves it toward the region of the chosen taste, by the requested dose. It returns the transformed sound and a report giving the applied settings and the share of the target taste before and after.\n\nFive gestures, one per dimension. The register moves by transposition, which keeps the duration. The speed moves by time-stretching, which keeps the pitch. Articulation moves both ways: toward staccato, a gate hollows out the silences between notes; toward legato, a resonant tail fills them. Consonance moves toward roughness through a detuned copy beating against the original, and toward consonance through a filter that removes the highs, where roughness lives. Loudness, by a gain.\n\nThe order of operations. The gate works on the original envelope, hence before any stretching; the transposition comes after the stretching; the gain comes last.\n\nWhat each gesture can and cannot do. A recording is not a score: its notes cannot be rewritten, only what the signal carries can be treated. Consonance is the weakest of the five: what beats can be removed, what is not consonant does not become so. Transposition is capped at one octave either way, and the dose no longer widens the gap once that cap is reached.\n\nThe dose covers part of the distance: at 50%, every gap to the region is halved. At 0%, the sound comes out untouched.\n\nThis node moves a sound within a space of correspondences; it does not change the taste of any food.\n\nSources. B. Mesz, M. A. Trevisan and M. Sigman, “The Taste of Music”, Perception 40, 2011 (doi 10.1068/p6801): the four regions and the five-dimensional space. B. Mesz, M. Sigman and M. A. Trevisan, “A Composition Algorithm Based on Crossmodal Taste-Music Correspondences”, Frontiers in Human Neuroscience 6, 2012 (doi 10.3389/fnhum.2012.00071): the distance reduction to a region. A.-S. Crisinel and C. Spence, “As Bitter as a Trombone”, Attention, Perception & Psychophysics 72, 2010 (doi 10.3758/app.72.7.1994): pitch and timbre. K. Knöferle and C. Spence, “Crossmodal Correspondences Between Sounds and Tastes”, Psychonomic Bulletin & Review, 2012 (doi 10.3758/s13423-012-0321-z): the field's own review and its caveats: the correspondences are partly mediated by language, and vary with culture and musical training. L. Euler, Tentamen novae theoriae musicae, 1739: the gradus suavitatis, from which the consonance measure comes. A.-S. Crisinel et al., “A Bittersweet Symphony”, Food Quality and Preference 24, 2012, and Q. J. Wang, B. Mesz and C. Spence on wine by temporal dominance of sensations: music shifts tasting judgements, with medium effect sizes, 0.54 to 0.66 in Cohen's d.",
    entrees: [{ nom: "Audio", nomEn: "Audio", type: "audio" }],
    sorties: [
      { nom: "Audio", nomEn: "Audio", type: "audio" },
      { nom: "Rapport", nomEn: "Report", type: "texte" },
    ],
    parametres: [
      { nom: "Goût", nomEn: "Taste", type: "choix",
        options: ["Sucré", "Acide", "Amer", "Salé"], optionsEn: ["Sweet", "Sour", "Bitter", "Salty"],
        optionIds: ["sucre", "acide", "amer", "sale"], defaut: "Sucré", defautEn: "Sweet",
        doc: "La région visée. Sucré : consonant, lent, doux, lié. Acide : aigu, dissonant, rapide. Amer : grave et lié. Salé : piqué, avec des silences entre les notes.",
        docEn: "The target region. Sweet: consonant, slow, soft, legato. Sour: high, dissonant, fast. Bitter: low and legato. Salty: staccato, with silences between the notes." },
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
      const gout = PAR_ID[String(ctx.paramTexte("Goût", "sucre"))] ?? "sucré";
      const dose = ctx.paramNombre("Dose", 60) / 100;
      const r = await assaisonner(a, gout, dose);
      const noms: Record<Gout, string> = anglais
        ? { "sucré": "sweet", "acide": "sour", "amer": "bitter", "salé": "salty" }
        : { "sucré": "sucré", "acide": "acide", "amer": "amer", "salé": "salé" };
      const v = (x: number, d = 2) => (anglais ? x.toFixed(d) : x.toFixed(d).replace(".", ","));
      const pc = (x: number) => `${Math.round(x * 100)} %`;
      const g = r.reglages;
      const lignes = [
        `${noms[gout]} : ${pc(r.partAvant)} → ${pc(r.partApres)}`,
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
        message: `${noms[gout]} ${pc(r.partAvant)} → ${pc(r.partApres)}`,
      };
    },
  },
] as FicheAudio[]).map(avecDoc);
