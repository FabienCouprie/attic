// plugins/series-morphologie.ts — Deux emprunts à la composition assistée : engendrer, puis comparer.
//
// CE QUI LES RÉUNIT. L'un produit un matériau dont on garantit la variété, l'autre dit ce que deux
// matériaux ont en commun. Ce sont les deux dernières fonctions que l'évaluation d'OpenMusic rangeait
// comme bon marché une fois le flux de notes posé ; elles le sont restées.
//
// LES DEUX SONT DES CALCULS PUBLIÉS. Le dénombrement des séries à tous les intervalles date de 1965,
// la distance d'édition de 1966 ; ni l'un ni l'autre ne vient d'un code sous licence GPL, ce qui
// serait une œuvre dérivée. Voir la section 4 de `COMPOSITION-ASSISTEE.md`.

import type { FicheAudio } from "../audio/types-domaine";
import { langueCourante, traduire } from "../i18n";
import { avecDoc } from "./notices";
import { estSequence, type Sequence } from "../audio/sequence";
import { decrireSerie, serieTousIntervalles } from "../audio/series-intervalles";
import { forme, type FormeSerielle } from "../audio/theorie-serielle";
import { analyseContrastive, motifsRepetes, profilPrimaire } from "../audio/morphologie";
import { nomNote } from "../audio/nom-note";

const en = () => langueCourante() === "en";

const NOMS = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

const FORMES = [
  { id: "originale", nom: "Originale", nomEn: "Prime" },
  { id: "retrograde", nom: "Rétrograde", nomEn: "Retrograde" },
  { id: "inversion", nom: "Inversion", nomEn: "Inversion" },
  { id: "retrograde-inversion", nom: "Rétrograde de l'inversion", nomEn: "Retrograde inversion" },
];

const MATIERES = [
  { id: "hauteurs", nom: "Hauteurs", nomEn: "Pitches" },
  { id: "durees", nom: "Durées", nomEn: "Durations" },
  { id: "nuances", nom: "Nuances", nomEn: "Velocities" },
];

export const fiches: FicheAudio[] = ([
  {
    id: "serie-tous-intervalles",
    nom: "Série à tous les intervalles", nomEn: "All-Interval Series",
    univers: "Entrées", famille: "Génération",
    resume: "Engendre une série de douze notes dont les onze intervalles sont tous différents.",
    resumeEn: "Generates a twelve-note series whose eleven intervals are all different.",
    notice: "Engendre une série de douze notes dont les onze intervalles successifs sont tous différents, et la rend sur une sortie « Séquence ».\n\nUne série dodécaphonique ordinaire ordonne les douze classes de hauteurs, sans rien garantir de ses mouvements : elle peut monter six fois d'un demi-ton. Une série à tous les intervalles épuise en plus les onze intervalles possibles, chacun une fois, de sorte que le matériau est aussi varié dans ses gestes que dans ses hauteurs. La série de la « Suite lyrique » d'Alban Berg en est l'exemple le plus étudié.\n\nIl en existe 3856 qui commencent sur do, dénombrées par Seymour Bauer-Mengelberg et Melvin Ferentz en 1965. La dernière note est toujours à un triton de la première : la somme des onze intervalles vaut 66, et 66 modulo 12 fait 6.\n\n« Numéro » choisit la série parmi celles que la recherche rencontre, dans son ordre. Un numéro au-delà du catalogue revient à la première.\n\n« Note de départ » transpose la série entière. Les intervalles ne changent pas.\n\n« Forme » applique une des quatre opérations sérielles : originale, rétrograde, inversion, rétrograde de l'inversion.\n\n« Octave » place la série sur le clavier. « Durée » est la durée de chaque note, « Nuance » leur vélocité.\n\nLa sortie « Séquence » rend les douze notes. La sortie « Analyse » donne les noms des hauteurs, puis les onze intervalles dans leur ordre d'apparition.\n\nLe message rappelle le numéro, la forme et la note de départ.",
    noticeEn: "Generates a twelve-note series whose eleven successive intervals are all different, and returns it on a « Sequence » output.\n\nAn ordinary twelve-tone series orders the twelve pitch classes without guaranteeing anything about its motions: it may rise six times by a semitone. An all-interval series also exhausts the eleven possible intervals, each once, so that the material is as varied in its gestures as in its pitches. The series of Alban Berg's « Lyric Suite » is its most studied example.\n\nThere are 3856 of them beginning on C, counted by Seymour Bauer-Mengelberg and Melvin Ferentz in 1965. The last note is always a tritone from the first: the sum of the eleven intervals is 66, and 66 modulo 12 is 6.\n\n« Number » selects the series among those the search meets, in its order. A number beyond the catalogue comes back to the first.\n\n« Starting note » transposes the whole series. The intervals do not change.\n\n« Form » applies one of the four serial operations: prime, retrograde, inversion, retrograde inversion.\n\n« Octave » places the series on the keyboard. « Duration » is the length of each note, « Velocity » their velocity.\n\nThe « Sequence » output returns the twelve notes. The « Analysis » output gives the pitch names, then the eleven intervals in their order of appearance.\n\nThe message recalls the number, the form and the starting note.",
    entrees: [],
    sorties: [
      { nom: "Séquence", nomEn: "Sequence", type: "sequence" },
      { nom: "Analyse", nomEn: "Analysis", type: "texte" },
    ],
    parametres: [
      { nom: "Numéro", nomEn: "Number", plage: [0, 3855], pas: 1, defaut: 0,
        doc: "La série choisie parmi les 3856. Au-delà, on revient à la première.",
        docEn: "The series chosen among the 3856. Beyond, it comes back to the first." },
      { nom: "Note de départ", nomEn: "Starting note", plage: [0, 11], pas: 1, defaut: 0,
        doc: "Transpose la série entière, sans changer ses intervalles.",
        docEn: "Transposes the whole series, without changing its intervals." },
      { nom: "Forme", nomEn: "Form", type: "choix",
        options: FORMES.map((f) => f.nom), optionsEn: FORMES.map((f) => f.nomEn),
        optionIds: FORMES.map((f) => f.id), defaut: FORMES[0].nom, defautEn: FORMES[0].nomEn,
        doc: "L'opération sérielle appliquée à la série.",
        docEn: "The serial operation applied to the series." },
      { nom: "Octave", nomEn: "Octave", plage: [1, 7], pas: 1, defaut: 4,
        doc: "L'octave où la série est placée.", docEn: "The octave where the series is placed." },
      { nom: "Durée", nomEn: "Duration", plage: [0.05, 4], pas: 0.05, defaut: 0.5, unite: "s",
        doc: "La durée de chaque note.", docEn: "The length of each note." },
      { nom: "Nuance", nomEn: "Velocity", plage: [1, 127], pas: 1, defaut: 90,
        doc: "La vélocité des notes.", docEn: "The velocity of the notes." },
    ],
    async executer(ctx: any) {
      const rang = Math.round(ctx.paramNombre("Numéro", 0));
      const depart = Math.round(ctx.paramNombre("Note de départ", 0));
      const choisie = ctx.paramTexte("Forme", FORMES[0].id);
      const def = FORMES.find((f) => f.id === choisie || f.nom === choisie || f.nomEn === choisie) ?? FORMES[0];
      const serie = forme(serieTousIntervalles(rang, depart), def.id as FormeSerielle);
      const octave = Math.round(ctx.paramNombre("Octave", 4));
      const duree = ctx.paramNombre("Durée", 0.5);
      const velocite = Math.round(ctx.paramNombre("Nuance", 90));
      // LA SÉRIE MONTE PLUTÔT QUE DE BONDIR : sans ce déroulage, deux classes voisines peuvent se
      // trouver à onze demi-tons l'une de l'autre, et le profil entendu n'est plus celui des
      // intervalles écrits. Chaque note est placée dans l'octave la plus proche de la précédente.
      const base = (octave + 1) * 12;
      const hauteurs: number[] = [base + serie[0]];
      for (let i = 1; i < serie.length; i++) {
        const precedente = hauteurs[i - 1];
        let h = base + serie[i];
        while (h - precedente > 6) h -= 12;
        while (precedente - h > 6) h += 12;
        hauteurs.push(Math.max(0, Math.min(127, h)));
      }
      const sequence: Sequence = {
        notes: hauteurs.map((note, i) => ({ note, velocite, debut: i * duree, fin: (i + 1) * duree })),
        tempo: 120,
        titre: `${def.nom} ${rang}`,
      };
      return {
        valeurs: [sequence, decrireSerie(serie, NOMS)],
        message: `${en() ? def.nomEn : def.nom} · ${en() ? "number" : "numéro"} ${rang} · ${NOMS[((depart % 12) + 12) % 12]}`,
      };
    },
  },
  {
    id: "morphologie",
    nom: "Morphologie", nomEn: "Morphology",
    univers: "Visualisation", famille: "Analyse",
    resume: "Relève la forme d'une séquence, ses figures récurrentes, et ce qu'elle partage avec une autre.",
    resumeEn: "Reports the shape of a sequence, its recurring figures, and what it shares with another.",
    notice: "Analyse la forme d'une séquence : la façon dont elle monte et descend, les figures qui y reviennent, et ce qu'elle partage avec une seconde séquence.\n\nLe profil primaire est la brique du procédé. Chaque couple de valeurs successives est remplacé par le signe de leur différence : monte, descend, ou reste. Il ne reste alors que le geste, dépouillé de la hauteur comme de l'intervalle, et deux passages se comparent sur ce qu'ils font plutôt que sur ce qu'ils emploient. Une mélodie et sa transposition ont le même profil.\n\nLa ressemblance de deux suites se mesure par la distance d'édition de Vladimir Levenshtein, publiée en 1966 : le nombre minimal d'insertions, de suppressions et de substitutions qui mènent de l'une à l'autre, ramené à la longueur de la plus longue. Elle est donnée deux fois, sur les valeurs et sur les profils, et c'est l'écart entre les deux qui renseigne : des valeurs peu semblables et des profils très semblables signalent une même figure transposée.\n\n« Sur quoi » choisit ce qui est analysé : les hauteurs, les durées ou les nuances.\n\n« Tolérance » est l'écart en dessous duquel deux valeurs successives sont tenues pour égales, donc le profil pour plat. À zéro, le moindre mouvement compte.\n\n« Longueur minimale d'un motif » et « Occurrences minimales » filtrent les figures relevées. Une figure entièrement contenue dans une figure plus longue déjà retenue n'est pas répétée.\n\nLa sortie « Rapport » décrit ce qui a été trouvé. La sortie « Profil » rend le profil primaire comme courbe, qui se branche partout où une courbe se branche.\n\nSans seconde séquence, seule la première est analysée.\n\nLe procédé mesure une forme, non une impression : le timbre, le registre et le tempo, qui pèsent dans la perception, n'y entrent pas.",
    noticeEn: "Analyses the shape of a sequence: the way it rises and falls, the figures that recur in it, and what it shares with a second sequence.\n\nThe primary profile is the building block. Each pair of successive values is replaced by the sign of their difference: up, down, or level. Only the gesture remains, stripped of pitch and interval, and two passages compare on what they do rather than on what they use. A melody and its transposition have the same profile.\n\nThe resemblance of two sequences is measured by Vladimir Levenshtein's edit distance, published in 1966: the minimum number of insertions, deletions and substitutions leading from one to the other, divided by the length of the longer. It is given twice, on the values and on the profiles, and the gap between the two is the information: values that resemble little with profiles that resemble much signal the same figure transposed.\n\n« On what » selects what is analysed: pitches, durations or velocities.\n\n« Tolerance » is the gap below which two successive values are held equal, hence the profile level. At zero, the slightest motion counts.\n\n« Minimum figure length » and « Minimum occurrences » filter the figures reported. A figure entirely contained in a longer one already kept is not repeated.\n\nThe « Report » output describes what was found. The « Profile » output returns the primary profile as a curve, which connects wherever a curve connects.\n\nWith no second sequence, only the first is analysed.\n\nThe procedure measures a shape, not an impression: timbre, register and tempo, which weigh in perception, do not enter it.",
    entrees: [
      { nom: "Séquence", nomEn: "Sequence", type: "sequence" },
      { nom: "Séquence B", nomEn: "Sequence B", type: "sequence", requis: false },
    ],
    sorties: [
      { nom: "Rapport", nomEn: "Report", type: "texte" },
      { nom: "Profil", nomEn: "Profile", type: "courbe" },
    ],
    parametres: [
      { nom: "Sur quoi", nomEn: "On what", type: "choix",
        options: MATIERES.map((m) => m.nom), optionsEn: MATIERES.map((m) => m.nomEn),
        optionIds: MATIERES.map((m) => m.id), defaut: MATIERES[0].nom, defautEn: MATIERES[0].nomEn,
        doc: "Ce qui est analysé : les hauteurs, les durées ou les nuances.",
        docEn: "What is analysed: pitches, durations or velocities." },
      { nom: "Tolérance", nomEn: "Tolerance", plage: [0, 12], pas: 0.25, defaut: 0,
        doc: "L'écart en dessous duquel deux valeurs successives sont tenues pour égales.",
        docEn: "The gap below which two successive values are held equal." },
      { nom: "Longueur minimale d'un motif", nomEn: "Minimum figure length", plage: [2, 12], pas: 1, defaut: 3,
        doc: "En dessous, une figure n'est pas relevée.", docEn: "Below this, a figure is not reported." },
      { nom: "Occurrences minimales", nomEn: "Minimum occurrences", plage: [2, 8], pas: 1, defaut: 2,
        doc: "Combien de fois une figure doit revenir pour être relevée.",
        docEn: "How many times a figure must recur to be reported." },
    ],
    async executer(ctx: any) {
      const a = ctx.entree(0);
      if (!estSequence(a)) return { valeurs: [null, null], message: traduire("msg.aucune_entr_e") };
      const choisie = ctx.paramTexte("Sur quoi", MATIERES[0].id);
      const matiere = MATIERES.find((m) => m.id === choisie || m.nom === choisie || m.nomEn === choisie) ?? MATIERES[0];
      const extraire = (s: Sequence) => s.notes.map((n) =>
        matiere.id === "durees" ? n.fin - n.debut : matiere.id === "nuances" ? n.velocite : n.note);

      const va = extraire(a);
      const tolerance = ctx.paramNombre("Tolérance", 0);
      const profil = profilPrimaire(va, tolerance);
      const motifs = motifsRepetes(profil,
        Math.round(ctx.paramNombre("Longueur minimale d'un motif", 3)),
        Math.round(ctx.paramNombre("Occurrences minimales", 2)));

      const signe = (x: number) => (x > 0 ? "↑" : x < 0 ? "↓" : "→");
      const lignes: string[] = [];
      lignes.push(`${en() ? "Analysed" : "Analysé"} : ${en() ? matiere.nomEn : matiere.nom}, ${va.length} ${en() ? "values" : "valeurs"}`);
      lignes.push(`${en() ? "Profile" : "Profil"} : ${profil.map(signe).join("")}`);
      if (matiere.id === "hauteurs" && a.notes.length > 0) {
        const basse = Math.min(...va), haute = Math.max(...va);
        lignes.push(`${en() ? "Range" : "Étendue"} : ${nomNote(basse)} → ${nomNote(haute)} (${(haute - basse).toFixed(2)} ${en() ? "semitones" : "demi-tons"})`);
      }
      lignes.push("");
      lignes.push(`${en() ? "Recurring figures" : "Figures récurrentes"} : ${motifs.length}`);
      for (const m of motifs.slice(0, 12)) {
        lignes.push(`  ${m.motif.map(signe).join("")} × ${m.positions.length} (${en() ? "at" : "aux rangs"} ${m.positions.join(", ")})`);
      }

      const b = ctx.entree(1);
      let resume = `${motifs.length} ${en() ? "figures" : "figures"}`;
      if (estSequence(b)) {
        const vb = extraire(b);
        const c = analyseContrastive(va, vb);
        lignes.push("");
        lignes.push(`${en() ? "Against sequence B" : "Face à la séquence B"} : ${vb.length} ${en() ? "values" : "valeurs"}`);
        lignes.push(`  ${en() ? "on the values" : "sur les valeurs"} : ${(c.surLesValeurs * 100).toFixed(1)} %`);
        lignes.push(`  ${en() ? "on the profiles" : "sur les profils"} : ${(c.surLeProfil * 100).toFixed(1)} %`);
        if (c.transposition !== null) {
          lignes.push(`  ${en() ? "exact transposition of" : "transposition exacte de"} ${c.transposition > 0 ? "+" : ""}${c.transposition}`);
        }
        lignes.push(`  ${en() ? "profiles diverge at" : "les profils divergent aux rangs"} : ${c.divergences.length === 0 ? (en() ? "nowhere" : "nulle part") : c.divergences.join(", ")}`);
        resume = `${(c.surLeProfil * 100).toFixed(0)} % ${en() ? "of shape" : "de forme"} · ${(c.surLesValeurs * 100).toFixed(0)} % ${en() ? "of values" : "de valeurs"}`;
      }

      // Le profil sort aussi comme courbe : ses trois valeurs, ramenées de zéro à un.
      const valeurs = Float32Array.from(profil.map((x) => (x + 1) / 2));
      const duree = a.notes.reduce((m, n) => Math.max(m, n.fin), 0) || 1;
      const cadence = valeurs.length > 0 ? valeurs.length / duree : 1;
      return {
        valeurs: [lignes.join("\n"), { valeurs: valeurs.length > 0 ? valeurs : new Float32Array(1), cadence }],
        message: resume,
      };
    },
  },
] as FicheAudio[]).map(avecDoc);
