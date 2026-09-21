// plugins/ondelettes.ts — Le nœud « Ondelettes ». La transformée et son seuillage sont dans
// `audio/ondelettes.ts`, avec leurs preuves ; ici, la prise.
//
// POURQUOI UNE SECONDE SORTIE AUDIO. Comme pour la décomposition atomique, ce que le nœud retire
// en apprend plus que ce qu'il garde. On écoute le son nettoyé, on le trouve propre, et l'on ne
// sait pas ce qui est parti avec le bruit : un souffle, ou la moitié des attaques. La sortie
// « Retiré » est la différence exacte entre l'entrée et la sortie — si l'on y entend le son, le
// seuil est trop fort, et l'oreille le dit en une seconde là où aucun chiffre ne le dirait.

import type { FicheAudio } from "../audio/types-domaine";
import { langueCourante } from "../i18n";
import { avecDoc } from "./notices";
import {
  EST_ONDELETTE, EST_OPERATION, ONDELETTES, OPERATIONS,
  bandesDetages, etagesPossibles, filtreDe, traiterAvecDecalages,
} from "../audio/ondelettes";

export const fiches: FicheAudio[] = ([
  {
    id: "ondelettes", nom: "Ondelettes", nomEn: "Wavelets",
    univers: "Traitement", famille: "Effets",
    resume: "Analyse le son par ondelettes — fenêtre courte dans l'aigu, longue dans le grave — et n'en garde que les coefficients qui portent quelque chose.",
    resumeEn: "Analyses the sound with wavelets — short window in the treble, long in the bass — and keeps only the coefficients that carry something.",
    notice: "D'après Ingrid Daubechies, « Orthonormal bases of compactly supported wavelets », Communications on Pure and Applied Mathematics 41(7), 1988 ; le seuillage vient de David Donoho et Iain Johnstone, « Ideal spatial adaptation by wavelet shrinkage », Biometrika 81(3), 1994, et la moyenne sur des décalages de Ronald Coifman et David Donoho, « Translation-invariant de-noising », 1995.\n\nCe qu'une ondelette a que la transformée de Fourier n'a pas. Une transformée à court terme impose une fenêtre unique à tout le son : longue, elle sépare finement les hauteurs et étale les attaques ; courte, elle place les attaques et confond les graves. Il faut choisir une fois pour toutes, et le choix est toujours mauvais quelque part. Une ondelette ne choisit pas : elle regarde l'octave la plus aiguë à travers une fenêtre courte, la suivante à travers une fenêtre deux fois plus longue, et ainsi de suite jusqu'au grave. C'est le principe du grainlet — aigus courts, graves longs — mais exact, et réversible.\n\nLa reconstruction est parfaite, et c'est le seul point qui ne se négocie pas. Sans toucher aux coefficients, le nœud rend le son d'entrée au dix-millionième près : c'est ce que « Reconstruire » permet de vérifier soi-même, et ce qu'un test exige de chacune des quatre ondelettes sur du bruit, le signal le plus difficile qui soit.\n\nCe que le seuillage apporte vraiment. Le bruit se répand sur tous les coefficients ; un son structuré se concentre dans quelques-uns. Effacer les petits coefficients efface donc surtout du bruit. Le risque, en mesurant ce gain, est de s'applaudir pour un vulgaire passe-bas : sur une note tenue, couper l'aigu suffirait à gagner des décibels. Le test décisif emploie donc des clics à large bande, qu'aucune coupure de bande ne peut nettoyer — le témoin qui annule entièrement les mêmes bandes y gagne 0,01 dB, et le seuillage 11 dB. La différence est ce que la parcimonie apporte, et rien d'autre.\n\nLes décalages valent leur coût. Une transformée décimée n'est pas invariante par translation : le même son avancé d'un échantillon ne donne pas les mêmes coefficients, et il reste autour des attaques un fourmillement caractéristique. Traiter le son à plusieurs décalages et faire la moyenne l'efface, puisque les artefacts dépendent du décalage et le son non. Quatre décalages suffisent en général ; au-delà, le coût monte plus vite que le gain.\n\nUn avertissement utile. Avec peu d'étages, le grave entier échappe au traitement : le nœud se comporte alors en partie comme un filtre, et un son à bande étroite paraîtra magnifiquement nettoyé sans que les ondelettes y soient pour grand-chose. Le réglage honnête va chercher assez d'étages pour que la bande du son soit elle-même seuillée.\n\nLa seconde sortie rend exactement ce qui a été retiré. Si l'on y entend le son et non le souffle, le seuil est trop fort — l'oreille le dit en une seconde, là où aucun chiffre ne le dirait.",
    noticeEn: "After Ingrid Daubechies, « Orthonormal bases of compactly supported wavelets », Communications on Pure and Applied Mathematics 41(7), 1988; thresholding comes from David Donoho and Iain Johnstone, « Ideal spatial adaptation by wavelet shrinkage », Biometrika 81(3), 1994, and averaging over shifts from Ronald Coifman and David Donoho, « Translation-invariant de-noising », 1995.\n\nWhat a wavelet has that the Fourier transform has not. A short-term transform imposes one single window on the whole sound: long, it separates pitches finely and smears attacks; short, it places attacks and blurs the bass. You must choose once and for all, and the choice is always wrong somewhere. A wavelet does not choose: it looks at the highest octave through a short window, the next one through a window twice as long, and so on down to the bass. It is the grainlet principle — short highs, long lows — but exact, and reversible.\n\nReconstruction is perfect, and that is the one point that is not negotiable. Without touching the coefficients, the node returns the input sound to within a ten-millionth: that is what « Reconstruct » lets you check for yourself, and what a test demands of each of the four wavelets on noise, the hardest signal there is.\n\nWhat thresholding really brings. Noise spreads over every coefficient; a structured sound concentrates into a few. Erasing the small coefficients therefore erases mostly noise. The risk, when measuring that gain, is to applaud oneself for a plain low-pass: on a held note, cutting the treble alone would win decibels. The decisive test therefore uses broadband clicks, which no band cut can clean — the control that zeroes the very same bands gains 0.01 dB there, and thresholding 11 dB. The difference is what sparsity brings, and nothing else.\n\nShifts are worth their cost. A decimated transform is not translation invariant: the same sound moved forward by one sample does not give the same coefficients, and a characteristic shimmer is left around attacks. Processing the sound at several shifts and averaging removes it, since the artefacts depend on the shift and the sound does not. Four shifts are usually enough; beyond that, cost rises faster than gain.\n\nA useful warning. With few levels, the whole bass escapes processing: the node then behaves partly as a filter, and a narrowband sound will look beautifully cleaned without wavelets having much to do with it. The honest setting reaches for enough levels that the sound's own band is thresholded too.\n\nThe second output returns exactly what was removed. If you hear the sound there rather than the hiss, the threshold is too strong — the ear says so in a second, where no number would.",
    entrees: [{ nom: "Audio", nomEn: "Audio", type: "audio" }],
    sorties: [
      { nom: "Audio", nomEn: "Audio", type: "audio" },
      { nom: "Retiré", nomEn: "Removed", type: "audio" },
      { nom: "Rapport", nomEn: "Report", type: "texte" },
    ],
    parametres: [
      { nom: "Opération", nomEn: "Operation", type: "choix",
        options: OPERATIONS.map((o) => o.fr), optionsEn: OPERATIONS.map((o) => o.en),
        optionIds: OPERATIONS.map((o) => o.id), defaut: "Débruiter", defautEn: "Denoise",
        doc: "Ce qu'on fait des coefficients. « Reconstruire » n'y touche pas, et sert à vérifier que la transformée rend bien le son d'entrée intact. « Débruiter » efface les coefficients plus petits que le seuil de Donoho, estimé sur le bruit du son lui-même. « Garder les plus forts » n'en conserve qu'une part choisie, quel que soit le niveau de bruit — c'est une esquisse du son, à la manière de la décomposition atomique mais pour un coût sans commune mesure.",
        docEn: "What is done with the coefficients. « Reconstruct » leaves them alone, and serves to check that the transform does return the input sound untouched. « Denoise » erases coefficients smaller than Donoho's threshold, estimated from the sound's own noise. « Keep the strongest » retains only a chosen share of them whatever the noise level — a sketch of the sound, in the manner of atomic decomposition but for a cost beyond comparison." },
      { nom: "Ondelette", nomEn: "Wavelet", type: "choix",
        options: ONDELETTES.map((o) => o.fr), optionsEn: ONDELETTES.map((o) => o.en),
        optionIds: ONDELETTES.map((o) => o.id), defaut: "Daubechies (8)", defautEn: "Daubechies (8)",
        doc: "La forme de l'onde élémentaire, donnée par son nombre de coefficients. Haar est une simple marche : elle ne voit que les sauts, et les rend avec leurs angles. Les Daubechies sont d'autant plus lisses qu'elles sont longues, et ignorent d'autant mieux les parties régulières du son — ce qui concentre l'information dans moins de coefficients et rend le seuillage plus efficace. Le prix en est un étalement dans le temps : une ondelette longue place une attaque moins nettement.",
        docEn: "The shape of the elementary wave, given by its number of coefficients. Haar is a plain step: it sees only jumps, and returns them with their corners. The Daubechies wavelets are smoother the longer they are, and the better they ignore the regular parts of the sound — which concentrates the information into fewer coefficients and makes thresholding more effective. The price is a spread in time: a long wavelet places an attack less sharply." },
      { nom: "Étages", nomEn: "Levels", type: "curseur", plage: [1, 12], pas: 1, defaut: 6,
        doc: "Jusqu'où descendre en octaves. Chaque étage coupe en deux la bande qui reste : à un étage, seule l'octave la plus aiguë est analysée ; à six, on descend jusqu'aux environs de 340 Hz. Tout ce qui reste en dessous n'est pas traité du tout — c'est le piège du réglage, car un son grave paraîtra alors nettoyé par le seul fait qu'on ne l'a pas touché. Le rapport indique les bandes réellement atteintes.",
        docEn: "How far down in octaves to go. Each level halves the band that remains: at one level, only the highest octave is analysed; at six, you reach down to around 340 Hz. Everything below is not processed at all — which is the trap of this setting, since a bass-heavy sound will then look cleaned by the mere fact that it was left alone. The report states which bands were actually reached." },
      { nom: "Force du seuil", nomEn: "Threshold strength", type: "curseur", plage: [0, 2], pas: 0.05, defaut: 0.6,
        doc: "Multiplie le seuil universel de Donoho, qui est le plus petit seuil effaçant du bruit pur presque à coup sûr. À un, il est souvent trop sévère sur du son et emporte des attaques avec le souffle ; les mesures placent l'optimum vers 0,6 pour un seuillage dur et 0,4 pour un seuillage doux. À zéro, rien n'est effacé. Sans effet sur « Garder les plus forts », qui fixe son seuil autrement.",
        docEn: "Multiplies Donoho's universal threshold, which is the smallest threshold that erases pure noise almost surely. At one it is often too severe on sound and takes attacks away with the hiss; measurements put the optimum near 0.6 for hard thresholding and 0.4 for soft. At zero, nothing is erased. No effect on « Keep the strongest », which sets its threshold otherwise." },
      { nom: "Seuillage", nomEn: "Thresholding", type: "choix",
        options: ["Doux", "Dur"], optionsEn: ["Soft", "Hard"], optionIds: ["doux", "dur"],
        defaut: "Doux", defautEn: "Soft",
        doc: "Le doux soustrait le seuil aux coefficients gardés au lieu de couper net. Il perd un peu du son, mais évite le fourmillement d'un coefficient qui passe et repasse la barre d'un instant à l'autre. Le dur mesure souvent mieux et s'entend souvent moins bien : à juger sur la sortie « Retiré ».",
        docEn: "Soft subtracts the threshold from the coefficients it keeps instead of cutting sharply. It loses a little of the sound, but avoids the shimmer of a coefficient crossing the line back and forth from one instant to the next. Hard often measures better and often sounds worse: judge it on the « Removed » output." },
      { nom: "Décalages", nomEn: "Shifts", type: "curseur", plage: [1, 8], pas: 1, defaut: 4,
        doc: "Combien de versions décalées du son traiter avant d'en faire la moyenne. Une transformée décimée n'est pas invariante par translation, et le fourmillement qu'elle laisse autour des attaques dépend de la place du son dans le fichier ; la moyenne l'annule. Le coût est proportionnel : quatre décalages, quatre fois le calcul, pour un gain d'environ un décibel qui se tarit ensuite.",
        docEn: "How many shifted versions of the sound to process before averaging them. A decimated transform is not translation invariant, and the shimmer it leaves around attacks depends on where the sound sits in the file; averaging cancels it. Cost is proportional: four shifts, four times the computation, for about a decibel of gain that then dries up." },
      { nom: "Part gardée", nomEn: "Share kept", type: "curseur", plage: [0, 100], pas: 0.5, defaut: 5, unite: "%",
        doc: "La part des coefficients que « Garder les plus forts » conserve. À cinq pour-cent, un son tenu garde presque toute son énergie et du bruit n'en garde qu'un tiers : c'est la mesure même de sa parcimonie. Descendre plus bas donne une esquisse de plus en plus sommaire, et de plus en plus intéressante à écouter. Sans effet sur les deux autres opérations.",
        docEn: "The share of coefficients that « Keep the strongest » retains. At five per cent, a held sound keeps nearly all its energy and noise keeps only a third: that is the very measure of its sparsity. Going lower gives an ever rougher sketch, and an ever more interesting one to listen to. No effect on the other two operations." },
    ],
    async executer(ctx: any) {
      const en = langueCourante() === "en";
      const audio = ctx.entree(0);
      if (!(audio instanceof AudioBuffer)) {
        return { valeurs: [null, null, null], message: en ? "No input." : "Aucune entrée." };
      }
      const frequence = audio.sampleRate;
      const nomOndelette = ctx.paramTexte("Ondelette", "d8");
      const h = filtreDe(EST_ONDELETTE(nomOndelette) ? nomOndelette : "d8");
      const choixOperation = ctx.paramTexte("Opération", "debruiter");
      const operation = EST_OPERATION(choixOperation) ? choixOperation : "debruiter";
      const decalages = Math.max(1, Math.round(ctx.paramNombre("Décalages", 4)));
      const options = {
        operation,
        forceSeuil: Math.max(0, ctx.paramNombre("Force du seuil", 0.6)),
        doux: ctx.paramTexte("Seuillage", "doux") !== "dur",
        gardePc: ctx.paramNombre("Part gardée", 5),
      };

      // Le nombre d'étages est borné par la longueur du son : demander douze étages sur une seconde
      // à 44 100 Hz reviendrait à décomposer jusqu'à onze échantillons, où le filtre ne tient plus.
      const voulus = Math.max(1, Math.round(ctx.paramNombre("Étages", 6)));
      const etages = Math.max(1, Math.min(voulus, etagesPossibles(audio.length, h.length)));

      const debut = performance.now();
      const traites: Float32Array[] = [];
      const retires: Float32Array[] = [];
      let annules = 0, total = 0, seuil = 0, sigma = 0;
      for (let c = 0; c < audio.numberOfChannels; c++) {
        const source = audio.getChannelData(c);
        const r = traiterAvecDecalages(source, h, etages, options, decalages);
        traites.push(r.son);
        const retire = new Float32Array(source.length);
        for (let i = 0; i < source.length; i++) retire[i] = source[i] - r.son[i];
        retires.push(retire);
        // Les chiffres annoncés sont ceux du premier canal : deux canaux d'une même prise donnent
        // des décompositions très voisines, et une moyenne laisserait croire à une mesure
        // d'ensemble alors que chaque canal est traité pour lui-même.
        if (c === 0) { annules = r.annules; total = r.total; seuil = r.seuil; sigma = r.sigma; }
      }
      const millisecondes = performance.now() - debut;

      const buffer = (canaux: Float32Array[]) => {
        const b = new AudioBuffer({ numberOfChannels: canaux.length, length: Math.max(1, canaux[0].length), sampleRate: frequence });
        for (let c = 0; c < canaux.length; c++) b.copyToChannel(new Float32Array(canaux[c]), c);
        return b;
      };

      const bandes = bandesDetages(frequence, etages);
      const plusBasse = bandes[bandes.length - 1];
      const partAnnulee = total > 0 ? (100 * annules) / total : 0;
      const nomOperation = OPERATIONS.find((o) => o.id === operation)!;
      const lignes: string[] = [];
      lignes.push(en ? "Wavelets" : "Ondelettes");
      lignes.push("");
      lignes.push(`  ${(en ? "Wavelet" : "Ondelette").padEnd(22)}${ONDELETTES.find((o) => o.id === nomOndelette)?.[en ? "en" : "fr"] ?? nomOndelette}`);
      lignes.push(`  ${(en ? "Operation" : "Opération").padEnd(22)}${en ? nomOperation.en : nomOperation.fr}`);
      lignes.push(`  ${(en ? "Levels" : "Étages").padEnd(22)}${etages}${etages < voulus ? (en ? ` (of ${voulus} asked, sound too short)` : ` (sur ${voulus} demandés, son trop court)`) : ""}`);
      lignes.push(`  ${(en ? "Shifts" : "Décalages").padEnd(22)}${decalages}`);
      lignes.push(`  ${(en ? "Computed in" : "Calculé en").padEnd(22)}${Math.round(millisecondes)} ms`);
      lignes.push("");
      if (operation !== "reconstruire") {
        lignes.push(`  ${(en ? "Coefficients" : "Coefficients").padEnd(22)}${Math.round(total / decalages)}`);
        lignes.push(`  ${(en ? "Erased" : "Effacés").padEnd(22)}${partAnnulee.toFixed(1)} %`);
        lignes.push(`  ${(en ? "Threshold" : "Seuil").padEnd(22)}${seuil.toExponential(2)}`);
        if (operation === "debruiter") {
          lignes.push(`  ${(en ? "Noise estimated at" : "Bruit estimé à").padEnd(22)}${sigma.toExponential(2)}`);
        }
        lignes.push("");
      }
      lignes.push(en ? "Bands processed" : "Bandes traitées");
      for (const b of bandes) {
        const nombre = (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(2)} kHz` : `${v.toFixed(0)} Hz`);
        lignes.push(`  ${(en ? "level" : "étage").padStart(6)} ${b.etage}   ${nombre(b.basHz).padStart(9)} — ${nombre(b.hautHz)}`);
      }
      lignes.push("");
      lignes.push(en
        ? `  Below ${plusBasse.basHz.toFixed(0)} Hz the sound is left untouched.`
        : `  Sous ${plusBasse.basHz.toFixed(0)} Hz, le son n'est pas touché.`);

      return {
        valeurs: [buffer(traites), buffer(retires), lignes.join("\n")],
        message: [
          operation === "reconstruire"
            ? (en ? "Reconstructed, untouched" : "Reconstruit, intact")
            : `${partAnnulee.toFixed(1)} % ${en ? "erased" : "effacés"} · ${etages} ${en ? "levels" : "étages"}`,
          `${Math.round(millisecondes)} ms`,
        ].join("\n"),
      };
    },
  },
] as FicheAudio[]).map(avecDoc);
