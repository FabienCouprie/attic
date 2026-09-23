// plugins/masquage-schillinger-gammes.ts — Ce qu'une piste cache, le rythme par interférence,
// et les gammes que le clavier ne sait pas jouer.
//
// La logique est dans `audio/masquage.ts`, `audio/schillinger.ts` et `audio/gammes-monde.ts`,
// testées ; ce fichier n'est que la prise.

import type { FicheAudio } from "../audio/types-domaine";
import { traduire, langueCourante } from "../i18n";
import { avecDoc } from "./notices";
import { NB_BANDES, bandesCritiques, bark, masquageParBande, proportionMasquee } from "../audio/masquage";
import { analyserResultante } from "../audio/schillinger";
import { GAMMES, degresInjouables, ecartAuTempere, frequences, gammeParId, intervalles } from "../audio/gammes-monde";
import { analyser, modules, TAILLE_TRAME } from "../audio/spectral-wishart";

const sansEntree = () => ({ valeurs: [null], message: traduire("msg.aucune_entr_e") });

/** La fréquence centrale approximative d'une bande critique, pour nommer ce qu'on montre. */
function frequenceDeBande(b: number): number {
  let bas = 0, haut = 20000;
  for (let i = 0; i < 40; i++) {
    const milieu = (bas + haut) / 2;
    if (bark(milieu) < b + 0.5) bas = milieu; else haut = milieu;
  }
  return (bas + haut) / 2;
}

export const fiches: FicheAudio[] = ([
  {
    id: "masquage", nom: "Masquage", nomEn: "Masking",
    univers: "Visualisation", famille: "Analyse",
    resume: "Dit ce qu'une piste rend inaudible dans une autre, bande critique par bande critique.",
    resumeEn: "Says what one track makes inaudible in another, critical band by critical band.",
    notice: "D'après Eberhard Zwicker (Journal of the Acoustical Society of America 33, 1961) pour l'échelle des bandes critiques, et Manfred Schroeder, Brian Atal et Joseph Hall (même journal, 66, 1979) pour la fonction d'étalement, celle que les codeurs perceptifs emploient depuis.\n\nAucun composant ne disait ce qu'une piste cache. C'est pourtant la question qu'on se pose devant un mixage qui ne dégage pas : non pas « cette piste est-elle trop forte », mais « qu'est-ce qu'elle rend inaudible ».\n\nLe modèle, et son asymétrie. Un son fort élève le seuil d'audition autour de lui, et pas également des deux côtés : il masque beaucoup plus vers l'aigu que vers le grave, parce que l'onde progresse du grave vers l'aigu dans la cochlée. D'où la grosse caisse qui mange le bas-médium sans toucher les cymbales, et la voix qui recouvre tout ce qui est au-dessus d'elle.\n\nLes chiffres, calculés : à une bande critique, un masquant abaisse de 4,3 décibels vers l'aigu contre 7,9 vers le grave ; à trois bandes, de 21,4 contre 50,7. L'écart se creuse avec la distance, et c'est là que le modèle devient franc.\n\nLe déclencheur ne sort pas du composant : seul le son masqué est rendu, accompagné de ce qu'on lui a pris.",
    noticeEn: "After Eberhard Zwicker (Journal of the Acoustical Society of America 33, 1961) for the critical-band scale, and Manfred Schroeder, Brian Atal and Joseph Hall (same journal, 66, 1979) for the spreading function, the one perceptual coders have used since.\n\nNo node said what one track hides. Yet that is the question one asks of a mix that will not clear: not « is this track too loud » but « what is it making inaudible ».\n\nThe model, and its asymmetry. A loud sound raises the hearing threshold around it, and not equally on both sides: it masks far more towards the treble than towards the bass, because the wave travels from bass to treble in the cochlea. Hence the kick that eats the low mids without touching the cymbals, and the voice that covers everything above it.\n\nThe figures, computed: at one critical band, a masker lowers by 4.3 decibels upwards against 7.9 downwards; at three bands, by 21.4 against 50.7. The gap widens with distance, and that is where the model becomes clear-cut.\n\nThe trigger does not come out of the node: only the masked sound is returned, together with what has been taken from it.",
    entrees: [
      { nom: "Masqué", nomEn: "Masked", type: "audio" },
      { nom: "Masquant", nomEn: "Masker", type: "audio" },
    ],
    sorties: [
      { nom: "Analyse", nomEn: "Analysis", type: "texte" },
      { nom: "Courbe", nomEn: "Curve", type: "courbe" },
    ],
    parametres: [
      { nom: "Nature du masquant", nomEn: "Masker nature", type: "choix",
        options: ["Tonal", "Bruité", "Entre les deux"], optionsEn: ["Tonal", "Noisy", "In between"],
        optionIds: ["tonal", "bruit", "entre"], defaut: "Entre les deux", defautEn: "In between",
        doc: "Un son tonal masque moins qu'un bruit de même énergie : l'oreille le sépare mieux du reste. Les codeurs perceptifs retranchent couramment une dizaine de décibels pour un son tonal contre cinq pour un bruit. « Entre les deux » prend une valeur intermédiaire, ce qu'est une piste réelle la plupart du temps.",
        docEn: "A tonal sound masks less than noise of equal energy: the ear separates it better from the rest. Perceptual coders commonly subtract some ten decibels for a tonal sound against five for noise. « In between » takes a middle value, which is what a real track usually is." },
      { nom: "Finesse", nomEn: "Resolution", type: "choix",
        options: ["Ordinaire (2048)", "Fine en fréquence (4096)"], optionsEn: ["Ordinary (2048)", "Sharp in frequency (4096)"],
        optionIds: ["2048", "4096"], defaut: "Ordinaire (2048)", defautEn: "Ordinary (2048)",
        doc: "Taille de la fenêtre d'analyse. Une fenêtre longue sépare mieux les bandes graves, où elles sont étroites.",
        docEn: "Analysis window size. A long window separates the low bands better, where they are narrow." },
    ],
    async executer(ctx: any) {
      const en = langueCourante() === "en";
      const masque = ctx.entree(0);
      const masquant = ctx.entree(1);
      if (!(masque instanceof AudioBuffer) || !(masquant instanceof AudioBuffer)) return sansEntree();
      const taille = parseInt(ctx.paramTexte("Finesse", "2048"), 10) || TAILLE_TRAME;
      const saut = Math.round(taille / 4);
      const nature = ctx.paramTexte("Nature du masquant", "entre");
      const offset = nature === "tonal" ? 11 : nature === "bruit" ? 5.5 : 8;

      const a = analyser(masque.getChannelData(0), taille, saut).map(modules);
      const b = analyser(masquant.getChannelData(0), taille, saut).map(modules);
      if (a.length === 0 || b.length === 0) return { valeurs: [null, null], message: traduire("msg.masquage.tropCourt") };

      const proportions: number[] = [];
      const cumulEnfoui = new Float64Array(NB_BANDES);
      const comptes = new Float64Array(NB_BANDES);
      for (let k = 0; k < a.length; k++) {
        const ba = bandesCritiques(a[k], masque.sampleRate, taille);
        // Le masquant peut être plus court : au-delà, il ne masque plus rien.
        const bb = k < b.length ? bandesCritiques(b[k], masquant.sampleRate, taille) : new Float64Array(NB_BANDES);
        proportions.push(proportionMasquee(ba, bb, offset));
        const par = masquageParBande(ba, bb, offset);
        // UNE BANDE QUI NE PORTE PRESQUE RIEN N'EST PAS « ENFOUIE ». Toute analyse laisse des
        // fuites minuscules dans les bandes voisines, et les compter faisait annoncer six bandes
        // enfouies à côté d'un total de 0,0 % — deux chiffres qui se contredisaient dans le même
        // message. On exige donc un millième de l'énergie de la trame avant de parler de masquage.
        let energieTrame = 0;
        for (let z = 0; z < NB_BANDES; z++) energieTrame += ba[z];
        const plancher = energieTrame / 1000;
        for (let z = 0; z < NB_BANDES; z++) {
          if (ba[z] <= plancher) continue;
          cumulEnfoui[z] += par[z].enfouiDb;
          comptes[z]++;
        }
      }
      const moyenne = proportions.reduce((x, y) => x + y, 0) / proportions.length;
      const pires = Array.from({ length: NB_BANDES }, (_, z) => ({
        z, hz: frequenceDeBande(z), db: comptes[z] > 0 ? cumulEnfoui[z] / comptes[z] : -Infinity,
      })).filter((x) => x.db > 0).sort((x, y) => y.db - x.db).slice(0, 6);

      const lignes = [
        `${en ? "Masked energy" : "Énergie masquée"} : ${(moyenne * 100).toFixed(1)} %`,
        "",
        pires.length > 0
          ? `${en ? "Most buried bands" : "Bandes les plus enfouies"} :`
          : (en ? "Nothing is masked." : "Rien n'est masqué."),
        ...pires.map((x) => `  ${x.hz.toFixed(0).padStart(6)} Hz   ${x.db.toFixed(1)} dB ${en ? "below the threshold" : "sous le seuil"}`),
      ].filter((l) => l !== "");
      return {
        valeurs: [
          lignes.join("\n"),
          { valeurs: Float32Array.from(proportions), cadence: masque.sampleRate / saut },
        ],
        message: traduire("msg.masquage.resume", (moyenne * 100).toFixed(1), String(pires.length)),
      };
    },
  },
  {
    id: "resultante-schillinger", nom: "Résultante (Schillinger)", nomEn: "Resultant (Schillinger)",
    univers: "Entrées", famille: "Génération",
    resume: "Le rythme qui naît de la superposition de deux pulsations régulières.",
    resumeEn: "The rhythm that arises from superposing two regular pulses.",
    notice: "Engendre un motif rythmique par superposition de deux pulsations. D'après Joseph Schillinger, « The Schillinger System of Musical Composition », Carl Fischer, 1946, livre I : « Theory of Rhythm ».\n\nDeux périodes battent côte à côte sur un même cycle. La résultante est la suite des intervalles entre les instants où l'une ou l'autre marque : le motif tombe où il tombe, et c'est de ce hasard réglé que sortent les figures que Schillinger poursuivait.\n\nDeux pulsations de 3 et 2 donnent 2-1-1-2, la figure la plus reconnaissable du système. Elle est palindromique, et ce n'est pas un hasard : la résultante de deux nombres premiers entre eux l'est toujours, par symétrie du cycle autour de son milieu.\n\nLe cycle dure le produit des deux périodes, mais si celles-ci partagent un facteur, elles retombent ensemble avant la fin et le motif se répète à l'intérieur de lui-même : la résultante de 4 et 2 n'est pas plus riche que celle de 2 et 1, c'est la même, jouée deux fois plus lentement. Le composant le dit plutôt que de laisser croire à un réglage sans effet.\n\nCe que ce composant ne fait pas : le fractionnement, par lequel Schillinger enrichit ses résultantes et obtient des structures auto-similaires. Les sources consultées nomment la technique sans en donner la règle.",
    noticeEn: "Generates a rhythmic pattern by superposing two pulses. After Joseph Schillinger, « The Schillinger System of Musical Composition », Carl Fischer, 1946, book I: « Theory of Rhythm ».\n\nTwo periods beat side by side over one cycle. The resultant is the sequence of intervals between the instants where one or the other marks: the pattern falls where it falls, and from that governed chance come the figures Schillinger pursued.\n\nTwo pulses of 3 and 2 give 2-1-1-2, the system's most recognisable figure. It is palindromic, and that is no accident: the resultant of two coprime numbers always is, by symmetry of the cycle about its midpoint.\n\nThe cycle lasts the product of the two periods, but if they share a factor they fall together before the end and the pattern repeats inside itself: the resultant of 4 and 2 is no richer than that of 2 and 1, it is the same, played twice as slowly. The node says so rather than letting one believe in a setting with no effect.\n\nWhat this node does not do: fractioning, by which Schillinger enriches his resultants and obtains self-similar structures. The sources consulted name the technique without giving its rule.",
    entrees: [],
    sorties: [
      { nom: "Analyse", nomEn: "Analysis", type: "texte" },
      { nom: "MIDI", nomEn: "MIDI", type: "midi" },
    ],
    parametres: [
      { nom: "Pulsation A", nomEn: "Pulse A", type: "curseur", plage: [1, 16], pas: 1, defaut: 3,
        doc: "Période de la première pulsation, en battements. Avec 3 et 2, on obtient la figure de base du système.",
        docEn: "Period of the first pulse, in beats. With 3 and 2 one gets the system's basic figure." },
      { nom: "Pulsation B", nomEn: "Pulse B", type: "curseur", plage: [1, 16], pas: 1, defaut: 2,
        doc: "Période de la seconde. Prenez-la première avec la première : sans cela le motif se répète à l'intérieur du cycle, et le composant vous le dira.",
        docEn: "Period of the second. Take it coprime with the first: otherwise the pattern repeats inside the cycle, and the node will say so." },
      { nom: "Tempo", nomEn: "Tempo", type: "curseur", plage: [30, 300], pas: 1, defaut: 120, unite: "bpm",
        doc: "Vitesse du battement, pour le MIDI rendu.", docEn: "Beat speed, for the rendered MIDI." },
      { nom: "Note", nomEn: "Note", type: "curseur", plage: [21, 108], pas: 1, defaut: 38,
        doc: "Note MIDI des frappes. 38 est la caisse claire du General MIDI.",
        docEn: "MIDI note of the onsets. 38 is the General MIDI snare." },
    ],
    async executer(ctx: any) {
      const en = langueCourante() === "en";
      const a = analyserResultante(ctx.paramNombre("Pulsation A", 3), ctx.paramNombre("Pulsation B", 2));
      const tempo = ctx.paramNombre("Tempo", 120);
      const note = Math.round(ctx.paramNombre("Note", 38));
      const parBattement = 60 / tempo;
      const { notesVersFichierMidi } = await import("../audio");
      const notes = a.instants.map((t) => ({
        note, velocite: 100, debut: t * parBattement, fin: (t + 0.9) * parBattement, canal: 9,
      }));
      const lignes = [
        `${a.a} ${en ? "against" : "contre"} ${a.b}   ${en ? "cycle" : "cycle"} ${a.cycle}`,
        `${en ? "Attacks" : "Frappes"} : ${a.instants.join(", ")}`,
        `${en ? "Durations" : "Écarts"} : ${a.ecarts.join("-")}`,
        a.palindrome
          ? (en ? "Palindromic — it reads the same both ways." : "Palindromique — elle se lit pareil dans les deux sens.")
          : (en ? "Not palindromic." : "Non palindromique."),
        a.premieresEntreElles
          ? ""
          : (en
            ? `The two pulses share a factor of ${a.repetitions}: the pattern repeats ${a.repetitions} times inside the cycle, and is no richer than the resultant of ${a.a / a.repetitions} against ${a.b / a.repetitions}.`
            : `Les deux pulsations partagent un facteur ${a.repetitions} : le motif se répète ${a.repetitions} fois dans le cycle, et n'est pas plus riche que la résultante de ${a.a / a.repetitions} contre ${a.b / a.repetitions}.`),
      ].filter((l) => l !== "");
      return {
        valeurs: [lignes.join("\n"), notesVersFichierMidi(notes, tempo, 0)],
        message: traduire("msg.resultante.resume", a.ecarts.join("-"), String(a.cycle)),
      };
    },
  },
  {
    id: "gammes-monde", nom: "Gammes du monde", nomEn: "World Scales",
    univers: "Autres", famille: "Théorie",
    resume: "Maqamat, ragas et gammes de gamelan, en cents, les degrés qu'un clavier ne sait pas jouer.",
    resumeEn: "Maqamat, ragas and gamelan scales, in cents, the degrees a keyboard cannot play.",
    notice: "Donne les degrés des systèmes musicaux non occidentaux : maqamat arabes, ragas indiens, gammes de gamelan.\n\nCes systèmes ne tiennent pas dans les douze demi-tons égaux. Le maqam Rast a une tierce à mi-chemin entre la majeure et la mineure ; les shrutis indiennes divisent l'octave en vingt-deux degrés inégaux ; le slendro javanais n'a ni octave juste ni intervalle égal. Les écrire demande des cents, pas des numéros de note, et c'est pour cela que ce composant rend des fréquences et jamais des touches.\n\nLes chiffres viennent de trois sources :\n• les maqamat suivent la division en quarts de ton adoptée au Congrès du Caire de 1932, qui reste la référence écrite même si les praticiens en dévient\n• les ragas sont donnés en intonation juste, comme les shrutis les définissent : la tierce du Bhairav est à 386 cents, la tierce pure, et non les 400 du piano\n• les gammes de gamelan sont des moyennes, chaque ensemble étant accordé pour lui-même, deux gamelans ne jouent pas la même gamme, et c'est une propriété du genre et non une imprécision de la mesure.\n\nL'exemple central de Sethares est précisément le gamelan : les métallophones ont des spectres inharmoniques, et slendro comme pelog suivent ces spectres plutôt que la série harmonique. L'octave du slendro vaut 1208 cents et non 1200 : elle est étirée, comme le sont ces spectres.",
    noticeEn: "Gives the degrees of non-Western musical systems: Arabic maqamat, Indian ragas, gamelan scales.\n\nThese systems do not fit in twelve equal semitones. Maqam Rast has a third midway between major and minor; the Indian shrutis divide the octave into twenty-two unequal degrees; Javanese slendro has neither a just octave nor an equal interval. Writing them takes cents, not note numbers, and that is why this node returns frequencies and never keys.\n\nThe figures come from three sources:\n• the maqamat follow the quarter-tone division adopted at the 1932 Cairo Congress, which remains the written reference even where practitioners depart from it\n• the ragas are given in just intonation, as the shrutis define them: Bhairav's third is at 386 cents, the pure third, not the piano's 400\n• the gamelan scales are averages, each ensemble being tuned for itself, two gamelans do not play the same scale, and that is a property of the genre rather than an imprecision of the measurement.\n\nSethares' central example is precisely the gamelan: metallophones have inharmonic spectra, and both slendro and pelog follow those spectra rather than the harmonic series. Slendro's octave is 1208 cents and not 1200: it is stretched, as those spectra are.",
    entrees: [],
    sorties: [{ nom: "Gamme", nomEn: "Scale", type: "texte" }],
    parametres: [
      { nom: "Gamme", nomEn: "Scale", type: "choix",
        options: GAMMES.map((g) => g.nom), optionsEn: GAMMES.map((g) => g.nomEn),
        optionIds: GAMMES.map((g) => g.id), defaut: GAMMES[0].nom, defautEn: GAMMES[0].nomEn,
        doc: "Le système à lire. Chacun porte sa propre note, qui dit ce qu'il faut en savoir avant de s'en servir.",
        docEn: "The system to read. Each carries its own note, saying what one should know before using it." },
      { nom: "Tonique", nomEn: "Tonic", type: "curseur", plage: [55, 880], pas: 1, defaut: 220, unite: "Hz",
        doc: "Fréquence du premier degré. En hertz et non en note, parce que ces gammes ne se posent pas sur un clavier.",
        docEn: "Frequency of the first degree. In hertz and not as a note, because these scales do not sit on a keyboard." },
      { nom: "Tolérance", nomEn: "Tolerance", type: "curseur", plage: [1, 50], pas: 1, defaut: 20, unite: "cents",
        doc: "Écart au demi-ton tempéré au-delà duquel un degré est déclaré injouable sur un clavier. Vingt cents est à peu près ce qu'une oreille exercée entend comme faux.",
        docEn: "Deviation from the tempered semitone beyond which a degree is declared unplayable on a keyboard. Twenty cents is about what a trained ear hears as out of tune." },
    ],
    async executer(ctx: any) {
      const en = langueCourante() === "en";
      const g = gammeParId(ctx.paramTexte("Gamme", GAMMES[0].id)) ?? GAMMES[0];
      const tonique = ctx.paramNombre("Tonique", 220);
      const tolerance = ctx.paramNombre("Tolérance", 20);
      const f = frequences(g, tonique);
      const ecarts = ecartAuTempere(g);
      const injouables = degresInjouables(g, tolerance);
      const lignes = [
        `${g.nom} — ${en ? g.noteEn : g.note}`,
        "",
        `${en ? "degree" : "degré"}   cents   Hz        ${en ? "keyboard" : "clavier"}`,
        ...g.cents.map((c, i) => {
          const marque = Math.abs(ecarts[i]) > tolerance ? `${ecarts[i] > 0 ? "+" : ""}${ecarts[i]} ¤` : "—";
          return `  ${String(i).padStart(3)}   ${String(c).padStart(5)}   ${f[i].toFixed(1).padStart(7)}   ${marque}`;
        }),
        "",
        `${en ? "Intervals" : "Intervalles"} : ${intervalles(g).join("-")} cents`,
        injouables.length > 0
          ? `${en ? "Degrees no keyboard can play" : "Degrés qu'aucun clavier ne peut jouer"} : ${injouables.join(", ")} cents`
          : (en ? "Every degree falls on a key." : "Tous les degrés tombent sur une touche."),
      ];

      // PAS DE SORTIE MIDI, ET C'EST UNE DÉCISION. Le MIDI ne porte que des demi-tons : un maqam
      // Rast y perdrait sa tierce neutre et redeviendrait une gamme occidentale, c'est-à-dire
      // exactement le contraire de ce que ce nœud enseigne. Un garde-fou du dépôt l'avait signalé
      // autrement — un nœud à sortie MIDI doit quitter la famille Théorie —, et la bonne réponse
      // n'était pas de déplacer le nœud mais de retirer une sortie qui dément sa propre notice.
      // Les fréquences du tableau, elles, sont exactes.
      return {
        valeurs: [lignes.join("\n")],
        message: traduire("msg.gammesMonde.resume",
          String(g.cents.length - 1), String(injouables.length)),
      };
    },
  },
] as FicheAudio[]).map(avecDoc);
