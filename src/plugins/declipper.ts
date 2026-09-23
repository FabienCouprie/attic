// plugins/declipper.ts — Rendre à un son écrêté les sommets qu'on lui a coupés.
//
// D'après Kitić, Bertin et Gribonval, LVA/ICA 2015 (A-SPADE), et le panorama de Záviška et al.,
// IEEE/ACM TASLP 2021. La logique est dans `audio/declipper.ts`, testée ; ce fichier n'est que la
// prise.

import type { FicheAudio } from "../audio/types-domaine";
import { traduire } from "../i18n";
import { avecDoc } from "./notices";
import { declipper, devinerSeuil } from "../audio/declipper";

export const fiches: FicheAudio[] = ([
  {
    id: "restauration-ecretage", nom: "Restauration d'écrêtage", nomEn: "Declipper",
    univers: "Traitement", famille: "Effets",
    resume: "Reconstruit les sommets coupés d'un son écrêté, en cherchant le signal le plus simple qui rende compte de ce qui reste.",
    resumeEn: "Rebuilds the clipped peaks of a saturated sound, by looking for the simplest signal that accounts for what is left.",
    entrees: [{ nom: "Audio", type: "audio" }],
    sorties: [{ nom: "Audio", type: "audio" }],
    parametres: [
      { nom: "Seuil", nomEn: "Threshold", type: "choix",
        options: ["Automatique", "Manuel"], optionsEn: ["Automatic", "Manual"],
        optionIds: ["auto", "manuel"], defaut: "Automatique", defautEn: "Automatic",
        doc: "En automatique, le seuil est deviné à la longueur des plateaux : un son écrêté garde des échantillons consécutifs à la même valeur, là où une sinusoïde intacte n'effleure son sommet qu'un échantillon à la fois. Sans plateau, le composant le dit et rend le son tel quel.",
        docEn: "In automatic mode the threshold is guessed from plateau length: a clipped sound holds consecutive samples at the same value, where an intact sine only grazes its peak one sample at a time. With no plateau, the node says so and returns the sound unchanged." },
      { nom: "Seuil manuel", nomEn: "Manual threshold", type: "curseur", plage: [0.05, 1], pas: 0.01, defaut: 0.5,
        doc: "Valeur au-dessus de laquelle un échantillon est tenu pour écrêté. Ne sert qu'en mode manuel.",
        docEn: "Value above which a sample counts as clipped. Only used in manual mode." },
      { nom: "Fenêtre", nomEn: "Window", type: "choix",
        options: ["512", "1024", "2048"], optionsEn: ["512", "1024", "2048"],
        optionIds: ["512", "1024", "2048"], defaut: "1024", defautEn: "1024",
        doc: "Longueur des trames. Longue, le modèle dispose de plus de raies pour rendre compte du son et répare mieux ; courte, il suit mieux un son qui change vite.",
        docEn: "Frame length. Long, the model has more spectral lines to account for the sound and repairs better; short, it follows a fast-changing sound better." },
      { nom: "Tours", nomEn: "Passes", type: "curseur", plage: [10, 200], pas: 5, defaut: 60,
        doc: "Tours maximum par trame. La parcimonie se desserre d'une raie par tour : le nombre de tours est donc aussi le nombre de raies que le modèle finira par s'autoriser. Mesuré à 41 % d'échantillons écrêtés : 3,4 dB gagnés en dix tours, 11,2 en trente, 15,3 en soixante.",
        docEn: "Maximum passes per frame. Sparsity loosens by one line per pass: the number of passes is therefore also the number of lines the model will eventually allow itself. Measured at 41 % clipped samples: 3.4 dB gained in ten passes, 11.2 in thirty, 15.3 in sixty." },
      { nom: "Dépassement max", nomEn: "Max overshoot", type: "curseur", plage: [1.1, 4], pas: 0.1, defaut: 2,
        doc: "Jusqu'à combien de fois le seuil un échantillon reconstruit peut monter. Ce n'est pas dans l'article, et c'est dit comme tel : quand le modèle n'explique plus le son, son erreur se réfugie dans les échantillons libres, justement ceux qu'on reconstruit, et la crête partait à trois fois le seuil. Le plafond borne les dégâts sans rien changer quand la méthode fonctionne : sur un son à cinq harmoniques, la crête reconstruite ne dépasse pas 1,5 fois le seuil.",
        docEn: "How many times the threshold a reconstructed sample may reach. This is not in the paper, and is stated as such: when the model no longer explains the sound, its error takes refuge in the free samples, precisely those being reconstructed, and the peak ran up to three times the threshold. The ceiling bounds the damage without changing anything when the method works: on a five-harmonic sound the reconstructed peak stays under 1.5 times the threshold." },
      { nom: "Tolérance", nomEn: "Tolerance", type: "curseur", plage: [0.001, 0.3], pas: 0.001, defaut: 0.01,
        doc: "Écart en dessous duquel une trame est jugée expliquée, et le calcul s'arrête. Ce réglage compte plus qu'il n'en a l'air : mesuré sur un son écrêté à 24 %, 0,01 rend 16,8 dB là où 0,1 n'en rend que 8,5, l'arrêt anticipé coupait la convergence bien trop tôt.",
        docEn: "Gap below which a frame is deemed explained, and computation stops. This setting matters more than it looks: measured on a sound clipped at 24 %, 0.01 gives 16.8 dB where 0.1 gives only 8.5, stopping early was cutting convergence far too short." },
    ],
    async executer(ctx: any) {
      const entree = ctx.entree(0);
      if (!(entree instanceof AudioBuffer)) {
        return { valeurs: [null], message: traduire("msg.aucune_entr_e") };
      }
      const auto = ctx.paramTexte("Seuil", "auto") !== "manuel";
      const options = {
        taille: parseInt(ctx.paramTexte("Fenêtre", "1024"), 10) || 1024,
        iterations: Math.round(ctx.paramNombre("Tours", 60)),
        epsilon: ctx.paramNombre("Tolérance", 0.01),
        depassementMax: ctx.paramNombre("Dépassement max", 2),
      };
      const { numberOfChannels: canaux, length, sampleRate } = entree;
      const sortie = new AudioBuffer({ numberOfChannels: canaux, length, sampleRate });
      let reparees = 0, seuil = 0, tours = 0, crete = 0, residu = 0;

      for (let c = 0; c < canaux; c++) {
        ctx.onProgress?.(traduire("msg.declip.canal", String(c + 1), String(canaux)));
        const voie = entree.getChannelData(c);
        // Le seuil se devine sur CHAQUE canal : un enregistrement peut n'écrêter qu'à gauche.
        const s = auto ? devinerSeuil(voie) : ctx.paramNombre("Seuil manuel", 0.5);
        const r = declipper(voie, { ...options, seuil: s });
        sortie.getChannelData(c).set(r.signal);
        reparees += r.reparees;
        seuil = Math.max(seuil, r.seuil);
        tours = Math.max(tours, r.toursMoyens);
        residu = Math.max(residu, r.residu);
        for (const v of r.signal) { const a = Math.abs(v); if (a > crete) crete = a; }
      }

      if (reparees === 0) {
        return { valeurs: [sortie], message: traduire("msg.declip.rien") };
      }
      // La crête est annoncée parce que le son réparé DÉPASSE forcément le seuil qui le bornait :
      // c'est le but même du nœud, et cela peut faire sortir le signal de [−1, 1].
      return {
        valeurs: [sortie],
        // Le RÉSIDU est annoncé parce qu'il est la seule chose que le nœud sache dire sur la qualité de sa
        // propre réparation : il n'a pas l'original pour se comparer. Haut, le modèle n'a pas rendu compte
        // du son, et ce qu'il a mis dans les trous est une invention.
        message: traduire("msg.declip.repare",
          ((100 * reparees) / Math.max(1, length * canaux)).toFixed(1),
          seuil.toFixed(3), crete.toFixed(2), (100 * residu).toFixed(0)),
      };
    },
  },
] as FicheAudio[]).map(avecDoc);
