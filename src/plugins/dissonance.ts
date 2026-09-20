// plugins/dissonance.ts — La gamme qu'un timbre appelle, et la rugosité d'un son.
//
// D'après Plomp et Levelt (JASA 38, 1965) et Sethares (JASA 94, 1993 ; « Tuning, Timbre, Spectrum,
// Scale », 1998). La logique est dans `audio/dissonance.ts`, testée ; ce fichier n'est que la prise.

import type { FicheAudio } from "../audio/types-domaine";
import { traduire, langueCourante } from "../i18n";
import { avecDoc } from "./notices";
import {
  courbeDissonance, creux, partielsDepuisModules, rapportProche, rugositeParTrame,
  timbreEtire, timbreHarmonique, type Partiel,
} from "../audio/dissonance";
import { analyser, modules, TAILLE_TRAME, SAUT } from "../audio/spectral-wishart";

const sansEntree = () => ({ valeurs: [null], message: traduire("msg.aucune_entr_e") });

/** Les partiels d'un son : ceux de la trame la plus forte, là où le timbre est le plus net. */
export function partielsDuSon(
  x: Float32Array, frequence: number, taille: number, combien: number,
): Partiel[] {
  const trames = analyser(x, taille, Math.round(taille / 4));
  if (trames.length === 0) return [];
  let meilleure = 0, energieMax = -1;
  trames.forEach((t, k) => {
    const m = modules(t);
    let e = 0;
    for (let i = 0; i < m.length / 2; i++) e += m[i] * m[i];
    if (e > energieMax) { energieMax = e; meilleure = k; }
  });
  return partielsDepuisModules(modules(trames[meilleure]), frequence, taille, combien);
}

export const fiches: FicheAudio[] = ([
  {
    id: "courbe-dissonance", nom: "Courbe de dissonance", nomEn: "Dissonance Curve",
    univers: "Autres", famille: "Théorie",
    resume: "Trouve la gamme qu'un timbre appelle : les creux de sa courbe de dissonance sont ses intervalles.",
    resumeEn: "Finds the scale a timbre calls for: the dips of its dissonance curve are its intervals.",
    notice: "D'après William Sethares, « Local consonance and the relationship between timbre and scale », Journal of the Acoustical Society of America 94(3), 1993, repris dans « Tuning, Timbre, Spectrum, Scale » (1998).\n\nAttic mesurait des spectres et connaissait les tempéraments, sans jamais relier les deux. C'est pourtant la thèse de Sethares : la consonance ne tient pas à des intervalles fixés d'avance, mais à l'accord entre le spectre d'un son et la gamme qu'on lui applique.\n\nLe procédé. On fait sonner le timbre contre lui-même transposé, pour tous les intervalles d'une octave, et l'on mesure à chaque fois la rugosité de l'ensemble. Là où la courbe creuse, le timbre supporte l'intervalle ; ailleurs, ses partiels battent. Les creux sont donc sa gamme.\n\nCe que le calcul montre, et qui n'est écrit nulle part dans le code : pour un son harmonique, les creux tombent sur l'octave, la quinte à 702 cents, la quarte à 498, les tierces à 386 et 316. L'intonation juste n'est pas un choix culturel — c'est la conséquence d'un spectre harmonique.\n\nEt réciproquement. Un timbre dont les partiels ne sont pas des multiples entiers appelle une autre gamme, dont l'octave même peut ne plus être à 1200 cents. L'exemple que Sethares développe est le gamelan : les métallophones ont des spectres inharmoniques, et les gammes slendro et pelog les suivent. Branchez un enregistrement de cloche, de plaque ou de voix : la gamme qui sort n'a aucune raison d'être la nôtre.",
    noticeEn: "After William Sethares, « Local consonance and the relationship between timbre and scale », Journal of the Acoustical Society of America 94(3), 1993, taken up in « Tuning, Timbre, Spectrum, Scale » (1998).\n\nAttic measured spectra and knew about temperaments, without ever connecting the two. Yet this is Sethares' thesis: consonance does not rest on intervals fixed in advance, but on the agreement between a sound's spectrum and the scale applied to it.\n\nThe procedure. The timbre is sounded against a transposed copy of itself, at every interval within an octave, and the roughness of the whole is measured each time. Where the curve dips, the timbre supports that interval; elsewhere its partials beat. The dips are therefore its scale.\n\nWhat the computation shows, and what is written nowhere in the code: for a harmonic sound the dips fall on the octave, the fifth at 702 cents, the fourth at 498, the thirds at 386 and 316. Just intonation is not a cultural choice — it is the consequence of a harmonic spectrum.\n\nAnd conversely. A timbre whose partials are not whole multiples calls for another scale, whose very octave may no longer sit at 1200 cents. The example Sethares develops is the gamelan: metallophones have inharmonic spectra, and the slendro and pelog scales follow them. Feed in a recording of a bell, a plate or a voice: the scale that comes out has no reason to be ours.",
    entrees: [{ nom: "Audio", type: "audio", requis: false }],
    sorties: [
      { nom: "Gamme", nomEn: "Scale", type: "texte" },
      { nom: "Courbe", nomEn: "Curve", type: "courbe" },
    ],
    parametres: [
      { nom: "Timbre", nomEn: "Timbre", type: "choix",
        options: ["Mesuré sur l'entrée", "Harmonique", "Étiré"],
        optionsEn: ["Measured from input", "Harmonic", "Stretched"],
        optionIds: ["mesure", "harmonique", "etire"], defaut: "Mesuré sur l'entrée", defautEn: "Measured from input",
        doc: "D'où viennent les partiels. « Mesuré » les prend dans le son branché, à l'instant où il est le plus fort. « Harmonique » emploie un timbre de référence, celui dont la courbe retrouve l'intonation juste — c'est le point de comparaison. « Étiré » sert à voir le procédé à l'œuvre : on déforme le spectre et l'on regarde la gamme se déplacer avec lui.",
        docEn: "Where the partials come from. « Measured » takes them from the connected sound, at its loudest moment. « Harmonic » uses a reference timbre, the one whose curve recovers just intonation — the point of comparison. « Stretched » is there to see the process at work: the spectrum is deformed and one watches the scale move with it." },
      { nom: "Partiels", nomEn: "Partials", type: "curseur", plage: [2, 24], pas: 1, defaut: 8,
        doc: "Combien de partiels retenir. Peu, et la courbe est lisse mais grossière ; beaucoup, et elle se hérisse de creux minuscules dus aux partiels faibles. Entre six et dix convient à la plupart des sons.",
        docEn: "How many partials to keep. Few, and the curve is smooth but coarse; many, and it bristles with tiny dips due to faint partials. Between six and ten suits most sounds." },
      { nom: "Étirement", nomEn: "Stretch", type: "curseur", plage: [1.5, 2.6], pas: 0.05, defaut: 2.1,
        doc: "Facteur d'étirement de l'octave du timbre, quand « Étiré » est choisi. À 2, le timbre est harmonique et rien ne bouge. À 2,1, l'octave de ce timbre passe à 1249 cents, et tous les autres creux suivent.",
        docEn: "Octave stretch factor of the timbre, when « Stretched » is chosen. At 2 the timbre is harmonic and nothing moves. At 2.1, that timbre's octave goes to 1249 cents, and every other dip follows." },
      { nom: "Étendue", nomEn: "Range", type: "curseur", plage: [600, 2400], pas: 100, defaut: 1300, unite: "cents",
        doc: "Jusqu'où la courbe est calculée. Il faut demander un peu au-delà de l'intervalle qui vous intéresse : les deux bouts d'une courbe ne peuvent pas être détectés comme creux, faute d'un voisin de chaque côté, et une courbe arrêtée pile à 1200 ne rend pas l'octave.",
        docEn: "How far the curve is computed. Ask a little beyond the interval of interest: neither end of a curve can be detected as a dip, having no neighbour on one side, and a curve stopped exactly at 1200 does not return the octave." },
      { nom: "Profondeur", nomEn: "Depth", type: "curseur", plage: [0.001, 0.1], pas: 0.001, defaut: 0.005,
        doc: "Profondeur minimale d'un creux pour être retenu, en fraction de l'amplitude de la courbe. Monter ce réglage ne garde que les intervalles francs ; le baisser fait apparaître les degrés que le timbre ne supporte qu'à peine.",
        docEn: "Minimum depth for a dip to be kept, as a fraction of the curve's range. Raising it keeps only the clear intervals; lowering it brings out the degrees the timbre barely supports." },
    ],
    async executer(ctx: any) {
      const en = langueCourante() === "en";
      const combien = Math.round(ctx.paramNombre("Partiels", 8));
      const mode = ctx.paramTexte("Timbre", "mesure");
      const entree = ctx.entree(0);

      let partiels: Partiel[];
      let origine: string;
      if (mode === "harmonique") {
        partiels = timbreHarmonique(250, combien);
        origine = en ? "reference harmonic timbre" : "timbre harmonique de référence";
      } else if (mode === "etire") {
        const e = ctx.paramNombre("Étirement", 2.1);
        partiels = timbreEtire(250, combien, e);
        origine = `${en ? "timbre stretched by" : "timbre étiré de"} ${e}`;
      } else {
        if (!(entree instanceof AudioBuffer)) return sansEntree();
        partiels = partielsDuSon(entree.getChannelData(0), entree.sampleRate, TAILLE_TRAME, combien);
        origine = en ? "measured from the sound" : "mesuré sur le son";
      }
      if (partiels.length < 2) return { valeurs: [null, null], message: traduire("msg.dissonance.tropPeu") };

      const points = courbeDissonance(partiels, Math.round(ctx.paramNombre("Étendue", 1300)), 1);
      const trouves = creux(points, ctx.paramNombre("Profondeur", 0.005));
      const rapports = points.map((p) => p.dissonance);
      const max = Math.max(...rapports) || 1;

      const lignes = [
        `${en ? "Partials" : "Partiels"} (${origine}) : ${partiels.map((p) => p.frequence.toFixed(0)).join(", ")} Hz`,
        "",
        `${en ? "Scale — the curve's dips" : "Gamme — les creux de la courbe"} :`,
        ...trouves.map((p) => {
          const nom = rapportProche(p.cents, 18);
          return `  ${String(p.cents).padStart(5)} ${en ? "cents" : "cents"}${nom ? `   ≈ ${nom}` : ""}`;
        }),
        trouves.length === 0 ? `  ${en ? "no dip at this depth" : "aucun creux à cette profondeur"}` : "",
      ].filter((l) => l !== "");

      return {
        valeurs: [
          lignes.join("\n"),
          // La courbe sort RETOURNÉE — un creux de dissonance devient un sommet — pour qu'une
          // modulation branchée dessus monte là où le timbre est consonant, ce qui est le sens
          // dans lequel on veut s'en servir.
          { valeurs: Float32Array.from(rapports, (v) => 1 - v / max), cadence: 200 },
        ],
        message: traduire("msg.dissonance.creux",
          String(trouves.length), trouves.map((p) => p.cents).slice(0, 6).join(", ")),
      };
    },
  },
  {
    id: "rugosite", nom: "Rugosité", nomEn: "Roughness",
    univers: "Visualisation", famille: "Analyse",
    resume: "Mesure la dissonance sensorielle d'un son au fil du temps, d'après le modèle de Plomp et Levelt.",
    resumeEn: "Measures a sound's sensory dissonance over time, after Plomp and Levelt's model.",
    notice: "D'après Reinier Plomp et Willem Levelt, « Tonal Consonance and Critical Bandwidth », Journal of the Acoustical Society of America 38(4), 1965.\n\nAttic mesurait le niveau, le centroïde, le rolloff, le taux de passages par zéro, la corrélation de phase. Il ne mesurait nulle part la dissonance perçue.\n\nCe que le modèle dit. Deux sons voisins battent : tant qu'ils tombent dans la même bande critique, l'oreille ne les sépare pas et entend une rugosité. Elle est nulle à l'unisson, maximale vers un quart de la bande critique, et retombe quand les deux sons s'écartent assez pour être entendus séparément. C'est pourquoi une tierce grave sonne trouble et la même tierce, deux octaves plus haut, ne l'est plus : la bande critique s'élargit avec la fréquence.\n\nLa mesure est rapportée à l'énergie des partiels retenus, et c'est nécessaire : sans cela un passage fort serait déclaré rugueux et un passage doux consonant, alors que c'est le même accord joué à deux nuances. On mesure la qualité du son, pas son volume.",
    noticeEn: "After Reinier Plomp and Willem Levelt, « Tonal Consonance and Critical Bandwidth », Journal of the Acoustical Society of America 38(4), 1965.\n\nAttic measured level, centroid, rolloff, zero-crossing rate, phase correlation. Nowhere did it measure perceived dissonance.\n\nWhat the model says. Two neighbouring sounds beat: as long as they fall within the same critical band, the ear does not separate them and hears roughness. It is nil at the unison, greatest at about a quarter of the critical band, and falls away once the two sounds are far enough apart to be heard separately. This is why a low third sounds murky and the same third two octaves higher does not: the critical band widens with frequency.\n\nThe measure is referred to the energy of the retained partials, and that is necessary: without it a loud passage would be declared rough and a quiet one consonant, when it is the same chord at two dynamics. What is measured is the sound's quality, not its volume.",
    entrees: [{ nom: "Audio", type: "audio" }],
    sorties: [
      { nom: "Analyse", nomEn: "Analysis", type: "texte" },
      { nom: "Courbe", nomEn: "Curve", type: "courbe" },
    ],
    parametres: [
      { nom: "Partiels", nomEn: "Partials", type: "curseur", plage: [2, 24], pas: 1, defaut: 10,
        doc: "Combien de partiels retenir par instant. Les partiels faibles ajoutent du bruit de mesure plus que de la rugosité entendue.",
        docEn: "How many partials to keep at each moment. Faint partials add measurement noise more than audible roughness." },
      { nom: "Finesse", nomEn: "Resolution", type: "choix",
        options: ["Fine en temps (1024)", "Ordinaire (2048)", "Fine en fréquence (4096)"],
        optionsEn: ["Sharp in time (1024)", "Ordinary (2048)", "Sharp in frequency (4096)"],
        optionIds: ["1024", "2048", "4096"], defaut: "Ordinaire (2048)", defautEn: "Ordinary (2048)",
        doc: "Taille de la fenêtre d'analyse. Une fenêtre longue sépare mieux les partiels voisins, donc mesure mieux la rugosité d'un accord tenu ; une fenêtre courte suit mieux un passage qui bouge.",
        docEn: "Analysis window size. A long window separates neighbouring partials better, hence measures a held chord's roughness better; a short one follows a moving passage better." },
    ],
    async executer(ctx: any) {
      const en = langueCourante() === "en";
      const e = ctx.entree(0);
      if (!(e instanceof AudioBuffer)) return sansEntree();
      const taille = parseInt(ctx.paramTexte("Finesse", "2048"), 10) || TAILLE_TRAME;
      const saut = Math.max(1, Math.round(taille / (TAILLE_TRAME / SAUT)));
      const trames = analyser(e.getChannelData(0), taille, saut).map(modules);
      const valeurs = rugositeParTrame(trames, e.sampleRate, taille, Math.round(ctx.paramNombre("Partiels", 10)));
      if (valeurs.length === 0) return { valeurs: [null, null], message: traduire("msg.dissonance.tropPeu") };

      const moyenne = valeurs.reduce((a, b) => a + b, 0) / valeurs.length;
      const max = Math.max(...valeurs);
      const iMax = valeurs.indexOf(max);
      const instant = (iMax * saut) / e.sampleRate;
      // QUATRE DÉCIMALES NE SUFFISENT PAS EN BAS DE L'ÉCHELLE. Une octave pure rend une rugosité
      // de l'ordre du millionième — ce qui est le bon résultat, et non une erreur —, et l'afficher
      // « 0,0000 » ferait croire à un calcul qui n'a pas tourné. Sous un millième, on passe donc
      // aux chiffres significatifs.
      const chiffre = (v: number) => (v < 1e-3 && v > 0 ? v.toPrecision(2) : v.toFixed(4));
      const lignes = [
        `${en ? "Mean roughness" : "Rugosité moyenne"} : ${chiffre(moyenne)}`,
        `${en ? "Peak" : "Maximum"} : ${chiffre(max)} ${en ? "at" : "à"} ${instant.toFixed(2)} s`,
        `${en ? "Frames measured" : "Trames mesurées"} : ${valeurs.length}`,
      ];
      return {
        valeurs: [
          lignes.join("\n"),
          { valeurs: Float32Array.from(valeurs, (v) => (max > 0 ? v / max : 0)), cadence: e.sampleRate / saut },
        ],
        message: traduire("msg.rugosite.resume", chiffre(moyenne), chiffre(max), instant.toFixed(2)),
      };
    },
  },
] as FicheAudio[]).map(avecDoc);
