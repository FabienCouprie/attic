// plugins/accord-mets.ts — Nœud « Accord mets-musique ».
//
// Le calcul du point visé et l'instrument publié sont dans `audio/accord-mets.ts` ; la fabrique du
// motif dans `audio/motif-crossmodal.ts`. Les deux sont purs et testés ; ce fichier n'est que la
// prise.

import type { FicheAudio } from "../audio/types-domaine";
import { langueCourante } from "../i18n";
import { avecDoc } from "./notices";
import { goutDominant, instrumentPublie, pointDepuisDegustation, type ProfilDegustation } from "../audio/accord-mets";
import { dbDepuisIntensite, hertzDepuisHauteur, motifDepuisPoint, nomDeNote, octetsMidi, rendreAuRegistre, viserNiveau } from "../audio/motif-crossmodal";
import { mesurer, profil } from "../audio/gout";
import { rendreSequence } from "../audio/midi";
import { creerAleatoire } from "../core/hasard";
import { sf2Chargee, normaliserModeSynthèse, PARAMETRE_SYNTHESE, PARAMETRE_INSTRUMENT_SF2_SUIVI } from "./soundfontGlobal";

const en = () => langueCourante() === "en";

export const fiches: FicheAudio[] = ([
  {
    id: "accord-mets-musique", nom: "Accord mets-musique", nomEn: "Food-Music Pairing",
    univers: "Entrées", famille: "Génération",
    resume: "D'un profil de dégustation — sucré, acide, amer, salé — vers une musique d'accompagnement, et le plan écrit de ce qu'elle fait.",
    resumeEn: "From a tasting profile — sweet, sour, bitter, salty — to an accompanying music, and the written plan of what it does.",
    notice: "Ce nœud prend les quatre intensités d'une dégustation et rend une musique d'accompagnement, en audio et en MIDI, avec le plan écrit de ce qu'elle fait.\n\nComment le point est calculé. Chacun des quatre goûts a une région dans un espace à cinq dimensions — registre, articulation, vitesse, consonance, intensité. Le point visé est le barycentre des quatre régions, pondéré par les intensités données. Un profil qui n'a qu'un goût tombe exactement sur sa région ; un profil qui les mélange tombe entre elles, et la musique est d'autant plus neutre que le profil est équilibré. La littérature donne quatre régions et non une carte continue des dégustations : le plan signale le cas où aucun goût n'atteint 40 % du profil.\n\nSeules les proportions comptent. Quatre valeurs de 20 donnent le même point que quatre valeurs de 80 ; c'est le rapport entre les goûts qui décide, non leur somme. L'intensité sonore se règle à part.\n\nL'instrument suit le goût dominant là où la littérature en donne un : le piano pour le sucré, le trombone pour l'amer et l'acide. Elle n'en donne aucun pour le salé, et le plan le signale.\n\nComment la musique est fabriquée. Les voix sonnent simultanément, à la quinte pour un point consonant, en amas de cinq notes pour un point âpre — la rugosité naît de partiels voisins qui battent ensemble, non d'intervalles âpres enchainés l'un après l'autre. La voix du dessous porte l'énergie, les autres sonnent à 60 %. Les attaques sont régulières, une par pas, et le timbre de synthèse est doux, sa médiane d'énergie devant rester proche de sa fondamentale pour que le registre soit atteint.\n\nCe que le nœud atteint. Le registre tombe à 0,03 près du point visé, la vitesse à 0,05 près, l'intensité exactement, sauf sur un motif dont la crête interdit de monter au niveau demandé sans écrêter. L'articulation reste au-dessus de sa valeur visée dans le piqué, la résonance du synthétiseur remplissant une part des silences : autour de 0,28 pour 0,10 demandé. La consonance est la plus faible des cinq dimensions : elle descend de 0,99 à 0,70 environ et pas en dessous, là où la région acide en demanderait 0,15. Le rapport donne les cinq écarts, dimension par dimension.\n\nCe nœud ne modifie pas le goût d'un aliment. Les études établissent que la musique déplace les jugements de dégustation — un caramel jugé plus sucré et moins amer sous une bande aiguë, un chocolat jugé plus sucré sous une musique positive — avec des tailles d'effet moyennes, de 0,54 à 0,66 en d de Cohen. Une part de ces correspondances passe par le langage et varie avec la culture et la formation musicale de qui écoute.\n\nSources. B. Mesz, M. A. Trevisan et M. Sigman, « The Taste of Music », Perception 40, 2011 (doi 10.1068/p6801) : les quatre régions et l'espace à cinq dimensions. B. Mesz, M. Sigman et M. A. Trevisan, « A Composition Algorithm Based on Crossmodal Taste-Music Correspondences », Frontiers in Human Neuroscience 6, 2012 (doi 10.3389/fnhum.2012.00071) : la réduction de distance à une région. A.-S. Crisinel et C. Spence, « As Bitter as a Trombone », Attention, Perception & Psychophysics 72, 2010 (doi 10.3758/app.72.7.1994) : hauteur et timbre. K. Knöferle et C. Spence, « Crossmodal Correspondences Between Sounds and Tastes », Psychonomic Bulletin & Review, 2012 (doi 10.3758/s13423-012-0321-z) : la revue du domaine, et ses réserves — les correspondances sont en partie médiées par le langage, et varient avec la culture et la formation musicale. L. Euler, Tentamen novae theoriae musicae, 1739 : le gradus suavitatis, d'où vient la mesure de consonance. A.-S. Crisinel et al., « A Bittersweet Symphony », Food Quality and Preference 24, 2012, et Q. J. Wang, B. Mesz et C. Spence sur le vin par dominance temporelle des sensations : la musique déplace les jugements de dégustation, avec des tailles d'effet moyennes, de 0,54 à 0,66 en d de Cohen.",
    noticeEn: "This node takes the four intensities of a tasting and returns an accompanying music, as audio and as MIDI, with the written plan of what it does.\n\nHow the point is computed. Each of the four tastes has a region in a five-dimensional space — register, articulation, speed, consonance, loudness. The aimed point is the barycentre of the four regions, weighted by the given intensities. A profile with only one taste lands exactly on its region; a profile that mixes them lands between them, and the music is the more neutral the more balanced the profile. The literature gives four regions and not a continuous map of tastings: the plan flags the case where no taste reaches 40% of the profile.\n\nOnly the proportions count. Four values of 20 give the same point as four values of 80; what decides is the ratio between the tastes, not their sum. Loudness is set separately.\n\nThe instrument follows the dominant taste where the literature gives one: piano for sweet, trombone for bitter and sour. It gives none for salty, and the plan says so.\n\nHow the music is built. The voices sound simultaneously, a fifth apart for a consonant point, in a five-note cluster for a harsh one — roughness arises from neighbouring partials beating together, not from harsh intervals played one after another. The lower voice carries the energy, the others sound at 60%. Attacks are regular, one per step, and the synthesis timbre is soft, its energy median having to stay close to its fundamental for the register to be reached.\n\nWhat the node reaches. The register lands within 0.03 of the aimed point, the speed within 0.05, the loudness exactly, except on a motif whose peak forbids reaching the requested level without clipping. Articulation stays above its aimed value in the staccato range, the synthesizer's resonance filling part of the silences: around 0.28 for 0.10 requested. Consonance is the weakest of the five dimensions: it comes down from 0.99 to about 0.70 and no lower, where the sour region would ask for 0.15. The report gives all five gaps, dimension by dimension.\n\nThis node does not change the taste of any food. The studies establish that music shifts tasting judgements — cinder toffee rated sweeter and less bitter under a high-pitched soundscape, chocolate rated sweeter under positive music — with medium effect sizes, 0.54 to 0.66 in Cohen's d. Part of these correspondences runs through language and varies with the listener's culture and musical training.\n\nSources. B. Mesz, M. A. Trevisan and M. Sigman, “The Taste of Music”, Perception 40, 2011 (doi 10.1068/p6801): the four regions and the five-dimensional space. B. Mesz, M. Sigman and M. A. Trevisan, “A Composition Algorithm Based on Crossmodal Taste-Music Correspondences”, Frontiers in Human Neuroscience 6, 2012 (doi 10.3389/fnhum.2012.00071): the distance reduction to a region. A.-S. Crisinel and C. Spence, “As Bitter as a Trombone”, Attention, Perception & Psychophysics 72, 2010 (doi 10.3758/app.72.7.1994): pitch and timbre. K. Knöferle and C. Spence, “Crossmodal Correspondences Between Sounds and Tastes”, Psychonomic Bulletin & Review, 2012 (doi 10.3758/s13423-012-0321-z): the field's own review, and its caveats — the correspondences are partly mediated by language, and vary with culture and musical training. L. Euler, Tentamen novae theoriae musicae, 1739: the gradus suavitatis, from which the consonance measure comes. A.-S. Crisinel et al., “A Bittersweet Symphony”, Food Quality and Preference 24, 2012, and Q. J. Wang, B. Mesz and C. Spence on wine by temporal dominance of sensations: music shifts tasting judgements, with medium effect sizes, 0.54 to 0.66 in Cohen's d.",
    entrees: [],
    sorties: [
      { nom: "Audio", nomEn: "Audio", type: "audio" },
      { nom: "MIDI", nomEn: "MIDI", type: "midi" },
      { nom: "Plan", nomEn: "Plan", type: "texte" },
    ],
    parametres: [
      { nom: "Sucré", nomEn: "Sweet", type: "curseur", plage: [0, 100], pas: 1, defaut: 70, unite: "%",
        doc: "Intensité du sucré dans la dégustation. Seules les proportions entre les quatre goûts comptent.",
        docEn: "Sweetness in the tasting. Only the proportions between the four tastes count." },
      { nom: "Acide", nomEn: "Sour", type: "curseur", plage: [0, 100], pas: 1, defaut: 30, unite: "%",
        doc: "Intensité de l'acidité.", docEn: "Sourness." },
      { nom: "Amer", nomEn: "Bitter", type: "curseur", plage: [0, 100], pas: 1, defaut: 10, unite: "%",
        doc: "Intensité de l'amertume.", docEn: "Bitterness." },
      { nom: "Salé", nomEn: "Salty", type: "curseur", plage: [0, 100], pas: 1, defaut: 0, unite: "%",
        doc: "Intensité du salé. C'est le seul des quatre goûts pour lequel la littérature ne donne pas d'instrument.",
        docEn: "Saltiness. It is the only one of the four tastes for which the literature gives no instrument." },
      { nom: "Durée", nomEn: "Duration", type: "nombre", plage: [2, 120], pas: 1, defaut: 20, unite: "s",
        doc: "Durée de la musique.", docEn: "Music duration." },
      { nom: "Intensité", nomEn: "Loudness", type: "curseur", plage: [0, 100], pas: 1, defaut: 40, unite: "%",
        doc: "Niveau efficace visé, de −40 dB à 0 dB.",
        docEn: "Target root-mean-square level, from -40 dB to 0 dB." },
      { nom: "Graine", nomEn: "Seed", type: "nombre", plage: [1, 999999], pas: 1, defaut: 42,
        doc: "Pour le choix des degrés : à graine égale, la même musique.", docEn: "For the choice of degrees: same seed, same music." },
      PARAMETRE_SYNTHESE,
      { ...PARAMETRE_INSTRUMENT_SF2_SUIVI,
        doc: "Preset du SoundFont, ou Suivre le MIDI pour garder l'instrument que le goût dominant a écrit dans le fichier.",
        docEn: "SoundFont preset, or Follow MIDI to keep the instrument that the dominant taste wrote into the file." },
      { nom: "Volume", nomEn: "Volume", type: "nombre", plage: [0, 100], pas: 1, defaut: 80, unite: "%",
        doc: "Volume de la synthèse, avant la mise au niveau visé.", docEn: "Synthesis volume, before the target level is applied." },
    ],
    async executer(ctx: any) {
      const anglais = en();
      const degustation: ProfilDegustation = {
        "sucré": ctx.paramNombre("Sucré", 70),
        acide: ctx.paramNombre("Acide", 30),
        amer: ctx.paramNombre("Amer", 10),
        "salé": ctx.paramNombre("Salé", 0),
      };
      const point = pointDepuisDegustation(degustation);
      const dominant = goutDominant(degustation);
      if (!point || !dominant) {
        return {
          valeurs: [null, null, null], erreur: true,
          message: anglais ? "Nothing to taste: set at least one of the four tastes." : "Rien à goûter : donnez au moins un des quatre goûts.",
        };
      }
      const cible = { ...point, intensite: ctx.paramNombre("Intensité", 40) / 100 };
      const duree = ctx.paramNombre("Durée", 20);
      const instrument = instrumentPublie(dominant.gout);
      const premier = motifDepuisPoint(cible, {
        duree, hasard: creerAleatoire(ctx.paramNombre("Graine", 42)), programme: instrument.programme,
      });

      const mode = normaliserModeSynthèse(ctx.paramTexte("Synthèse", "Automatique"));
      const modeRendu: "FM/Oscillateurs" | "SoundFont" = mode === "SoundFont" || (mode === "Automatique" && sf2Chargee()) ? "SoundFont" : "FM/Oscillateurs";
      const impose = Math.round(ctx.paramNombre("Instrument", -1));
      // Le registre se corrige sur mesure : visé au grave de l'amer, un trombone de synthèse se
      // mesurait deux octaves au-dessus, et la musique s'analysait comme sucrée.
      // LE TIMBRE EST VOLONTAIREMENT DOUX (rapport 1, indice de modulation 0,7) : un timbre brillant
      // place la médiane de son énergie deux octaves au-dessus de sa fondamentale — mesuré, 6 202 Hz
      // contre 1 227 Hz pour les mêmes notes —, et le registre visé devenait alors hors d'atteinte.
      const { son: brut, motif, correction } = await rendreAuRegistre(premier, cible.hauteur, (m) =>
        rendreSequence(m.notes, modeRendu, ctx.paramNombre("Volume", 80), impose >= 0 ? impose : m.programme, 0, "douce"));
      const octets = octetsMidi(motif.notes, motif.tempo, motif.programme);
      const audio = viserNiveau(brut, dbDepuisIntensite(cible.intensite));

      const mesure = mesurer(audio);
      const parts = profil(mesure.dimensions);
      (ctx.noeud.data as Record<string, unknown>)._profilGout = parts.map((p) => ({ gout: p.gout, part: p.part }));

      const midi = new File([octets as unknown as BlobPart], `accord-${dominant.gout}.mid`, { type: "audio/midi" });
      const v = (x: number, d = 2) => (anglais ? x.toFixed(d) : x.toFixed(d).replace(".", ","));
      const noms: Record<string, string> = anglais
        ? { "sucré": "sweet", "acide": "sour", "amer": "bitter", "salé": "salty" } : {};
      const nomDominant = noms[dominant.gout] ?? dominant.gout;
      const ligne = (etiquette: string, vise: number, mesuree: number) =>
        `  ${etiquette.padEnd(14)} ${v(vise)} → ${v(mesuree)}`;
      // Un profil trop équilibré ne désigne aucune région : le dire vaut mieux que rendre une musique
      // neutre en laissant croire qu'elle tient d'un goût.
      const equilibre = dominant.part < 0.4;
      const plan = [
        anglais ? "Tasting" : "Dégustation",
        ...(["sucré", "acide", "amer", "salé"] as const).map((g) =>
          `  ${(noms[g] ?? g).padEnd(8)} ${String(Math.round(degustation[g]))} %`),
        `  ${anglais ? "dominant" : "dominant"} ${nomDominant} (${Math.round(dominant.part * 100)} % ${anglais ? "of the profile" : "du profil"})`,
        ...(equilibre
          ? [anglais
            ? "  profile too balanced for one region to prevail: the music stays neutral"
            : "  profil trop équilibré pour qu'une région l'emporte : la musique reste neutre"]
          : []),
        "",
        anglais ? "Plan" : "Plan",
        `  ${(anglais ? "register" : "registre").padEnd(14)} ${Math.round(hertzDepuisHauteur(cible.hauteur))} Hz · ${anglais ? "centre" : "centre"} ${nomDeNote(motif.noteCentre)}`,
        `  ${(anglais ? "speed" : "vitesse").padEnd(14)} ${v(motif.attaquesParSeconde, 2)} ${anglais ? "attacks/s" : "attaques/s"} · ${motif.tempo} ${anglais ? "BPM" : "BPM"}`,
        `  ${(anglais ? "articulation" : "articulation").padEnd(14)} ${Math.round(motif.partSonnante * 100)} % ${anglais ? "of each step sounded" : "de chaque pas tenu"}`,
        `  ${(anglais ? "voices" : "voix").padEnd(14)} ${motif.voix.join(", ")} ${anglais ? "semitones above the melody" : "demi-tons au-dessus de la mélodie"}`,
        `  ${(anglais ? "instrument" : "instrument").padEnd(14)} ${anglais ? instrument.nomEn : instrument.nom}${instrument.publie ? "" : (anglais ? " (default: the literature gives none for salty)" : " (défaut : la littérature n'en donne pas pour le salé)")}`,
        `  ${(anglais ? "level" : "niveau").padEnd(14)} ${v(dbDepuisIntensite(cible.intensite), 1)} dB`,
        "",
        anglais ? "Point, aimed → measured" : "Point, visé → mesuré",
        ...(correction !== 0
          ? [anglais
            ? `  register corrected by ${correction > 0 ? "+" : ""}${correction} semitones, measured on the first render`
            : `  registre corrigé de ${correction > 0 ? "+" : ""}${correction} demi-tons, mesuré sur le premier rendu`]
          : []),
        ligne(anglais ? "register" : "registre", cible.hauteur, mesure.dimensions.hauteur),
        ligne(anglais ? "articulation" : "articulation", cible.articulation, mesure.dimensions.articulation),
        ligne(anglais ? "speed" : "vitesse", cible.vitesse, mesure.dimensions.vitesse),
        ligne(anglais ? "consonance" : "consonance", cible.consonance, mesure.dimensions.consonance),
        ligne(anglais ? "loudness" : "intensité", cible.intensite, mesure.dimensions.intensite),
        "",
        anglais ? "Taste profile of the result" : "Profil de goût du résultat",
        ...parts.map((p) => `  ${(noms[p.gout] ?? p.gout).padEnd(8)} ${String(Math.round(p.part * 100)).padStart(3)} %`),
      ];
      return {
        valeurs: [audio, midi, plan.join("\n")],
        message: `${nomDominant} · ${anglais ? instrument.nomEn : instrument.nom} · ${nomDeNote(motif.noteCentre)} · ${audio.duration.toFixed(1)} s`,
      };
    },
  },
] as FicheAudio[]).map(avecDoc);
