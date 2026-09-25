// plugins/bruitage-ia.ts — Un son décrit en mots, et rendu.
//
// POURQUOI UN NŒUD DE PLUS, ET NON UN RÉGLAGE SUR CELUI QUI EXISTE. Le même moteur peut servir aux
// deux, mais l'intention n'est pas la même et ce sont les DÉFAUTS qui la portent : un prompt de
// bruitage, une durée courte, et surtout une sortie mise à niveau. Mesuré sur six clips engendrés
// par ce moteur, les bruitages sortent à 0,018 de valeur efficace là où la musique sort à 0,209,
// soit dix fois plus bas : un nœud de bruitage qui rendrait cela tel quel passerait pour muet.
// Même partage que « Séparateur IA », qui range trois modèles sous un réglage « Modèle ».
//
// LE CHOIX DU MOTEUR EST LA CHARPENTE, et non un ornement, MAIS IL NE PROMET RIEN. « MOSS
// SoundEffect » y a figuré le temps d'un essai, en disant qu'il n'était pas câblé : un menu qui
// propose ce qui ne marchera pas avant longtemps se lit comme un défaut, et Fabien l'a retiré. Le
// réglage reste, avec le seul moteur qui répond ; le suivant y entrera le jour où il fonctionne.
// Le recensement des candidats et ce que chacun coûte vivent dans `MODELES-BRUITAGE.md`.
//
// IL A D'ABORD TOURNÉ SUR LA VARIANTE MUSICALE, ET C'ÉTAIT LE DÉFAUT. Fabien a relevé que le
// composant retombait sur de la musique, de façon apparemment aléatoire : la cause n'était ni le
// prompt ni le tirage, mais le paquet, `stable-audio-3-small-music`. Stability en publie une
// variante de bruitage, et ses graphes ONNX officiels avec.
//
// LE REMÈDE A DONC ÉTÉ UN PAQUET, ET NON DU CODE. Voir `MODELES-BRUITAGE.md` : ce qui a été mesuré,
// les deux pièges des graphes officiels, et le recensement des modèles concurrents.
//
// CE QUE LE SECOND MOTEUR COÛTERA, puisque la question se reposera. MOSS-SoundEffect v2.0 est en
// Apache 2.0, rend du 48 kHz jusqu'à trente secondes, et c'est un transformeur de diffusion de
// 1,3 milliard de paramètres attelé à un encodeur de texte Qwen3 de 1,7 milliard. Il n'a aucun
// chemin ONNX, et aucun des quinze dépôts publiés n'en propose : le porter ici demande l'export que
// « Stable Audio 3 » a déjà reçu, sur cinq fois plus de poids. Le chemin sans PyTorch annoncé par
// cette famille concerne ses modèles de parole, pas celui-ci.

import type { FicheAudio } from "../audio/types-domaine";
import { langueCourante } from "../i18n";
import { avecDoc } from "./notices";

const en = () => langueCourante() === "en";

/**
 * Le prompt de départ, qui vaut exemple.
 *
 * IL A PORTÉ UN CADRE, « sound effect, foley recording, no music, no melody », ET NE LE PORTE PLUS.
 * Ce cadre était un palliatif au temps du paquet musical, où il pesait lourd : sur la même porte et
 * la même graine, la force de la pulsation tombait de 0,660 pour « door creaking » à 0,117 avec le
 * cadre, quand un prompt musical franc était à 0,758.
 *
 * SUR LE PAQUET DE BRUITAGE, IL NE FAIT PLUS RIEN, et c'est la mesure qui le dit. Mêmes deux
 * graines, sans cadre 0,207 et 0,230, avec cadre 0,172 et 0,280 : aucun effet systématique, et la
 * seconde graine y perd. Le modèle n'a pas d'attirance musicale dont il faille le détourner. Garder
 * ces mots enseignerait une superstition, et un prompt d'exemple doit s'imiter.
 */
const PROMPT_DEFAUT = "a heavy wooden door creaking open slowly, close mic, dry room";

/**
 * Les moteurs du réglage. Un moteur n'y entre que s'il répond.
 *
 * LE LIBELLÉ DIT LA VARIANTE, ET NON LA FAMILLE. « Stable Audio 3 » tout court désignait ici le
 * paquet de bruitage et ailleurs le paquet musical : deux modèles différents sous un seul nom.
 * Relevé par Fabien en regardant le réglage.
 */
const MOTEURS = [
  { id: "stable-audio-3", nom: "Stable Audio 3 (bruitage)", nomEn: "Stable Audio 3 (sound effects)" },
] as const;

/**
 * Met le son à un niveau de crête donné.
 *
 * LA CRÊTE PLUTÔT QUE LA VALEUR EFFICACE : un bruitage est fait de transitoires, et caler sa
 * moyenne ferait saturer son impact. Un son muet est laissé tel quel, faute de quoi le gain
 * partirait à l'infini sur du silence.
 */
export function mettreAuNiveau(canaux: Float32Array[], dbfs: number): number {
  let crete = 0;
  for (const c of canaux) for (let i = 0; i < c.length; i++) {
    const v = Math.abs(c[i]);
    if (v > crete) crete = v;
  }
  if (crete < 1e-6) return 0;
  const gain = Math.pow(10, dbfs / 20) / crete;
  for (const c of canaux) for (let i = 0; i < c.length; i++) c[i] *= gain;
  return gain;
}

export const fiches: FicheAudio[] = ([
  {
    id: "bruitage-ia", nom: "Bruitage IA", nomEn: "AI Sound Effect",
    univers: "Entrées", famille: "Génération",
    resume: "Engendre un bruitage ou une ambiance à partir d'une description, et le rend au niveau demandé.",
    resumeEn: "Generates a sound effect or an ambience from a description, and returns it at the requested level.",
    notice: "Engendre un son à partir d'une description en mots : un impact, un grincement, une ambiance, une foule, un orage. La description se donne au réglage « Prompt », ou arrive sur l'entrée « Prompt », qui a la priorité quand elle est branchée. L'anglais donne de meilleurs résultats que le français, les modèles ayant été entraînés sur des descriptions anglaises.\n\n« Modèle » choisit le moteur. « Stable Audio 3 (bruitage) » est la variante de bruitage de sa famille, un transformeur de diffusion de 0,6 milliard de paramètres, distincte de la variante musicale que sert le composant de génération musicale. Elle est seule pour l'instant.\n\nLe paquet pèse un gigaoctet et demi et se récupère à la première exécution, ce qui prend plusieurs minutes ; l'avancement paraît sur le bouton des modèles, dans la barre d'outils. Les exécutions suivantes partent du disque. Un rendu de six secondes à huit étapes demande une cinquantaine de secondes, le calcul se faisant sur le processeur.\n\n« Durée » est la longueur demandée. Le modèle ajoute six secondes de marge interne, qui ne se retrouvent pas dans la sortie.\n\n« Étapes » est le nombre d'étapes du débruitage. Peu d'étapes donnent un son plus rugueux et plus vite ; au-delà d'une douzaine, le gain devient faible.\n\n« Graine » fixe le tirage aléatoire, ce qui permet de retrouver le même son. À moins un, une graine est tirée à chaque exécution, et le message dit laquelle.\n\n« Sortie » décide du niveau. « Normalisée » porte la crête du son au « Niveau crête » demandé ; « Telle quelle » rend ce que le modèle a produit, sans y toucher. Les bruitages sortent du modèle à un niveau bien plus bas que la musique, d'où la normalisation par défaut.\n\n« Niveau crête » est la crête visée, en décibels sous la pleine échelle. Il n'agit que sur la sortie normalisée.\n\nLa sortie « Audio » rend le son en deux canaux, à 44 100 hertz. Le message donne la durée, le nombre d'étapes, la graine employée et le gain appliqué.\n\nLe modèle demande l'application de bureau : il est lu depuis le disque et calculé hors de la page.",
    noticeEn: "Generates a sound from a description in words: an impact, a creak, an ambience, a crowd, a storm. The description is given in the « Prompt » setting, or arrives on the « Prompt » input, which takes priority when connected. English gives better results than French, the models having been trained on English descriptions.\n\n« Model » chooses the engine. « Stable Audio 3 (sound effects) » is the sound-effect variant of its family, a 0.6 billion parameter diffusion transformer, distinct from the music variant used by the music generation node. It is alone for now.\n\nThe package weighs a gigabyte and a half and is fetched on the first run, which takes several minutes; progress appears on the models button, in the toolbar. Later runs start from disk. A six second render at eight steps takes about fifty seconds, the computation being done on the processor.\n\n« Duration » is the requested length. The model adds six seconds of internal headroom, which do not appear in the output.\n\n« Steps » is the number of denoising steps. Few steps give a rougher sound and give it faster; beyond a dozen, the gain becomes small.\n\n« Seed » fixes the random draw, which allows the same sound to be found again. At minus one, a seed is drawn at each run, and the message says which.\n\n« Output » decides the level. « Normalised » brings the peak of the sound to the requested « Peak level »; « As is » returns what the model produced, untouched. Sound effects come out of the model at a much lower level than music, hence normalisation by default.\n\n« Peak level » is the peak aimed at, in decibels below full scale. It acts only on the normalised output.\n\nThe « Audio » output returns the sound in two channels, at 44,100 hertz. The message gives the length, the number of steps, the seed used and the gain applied.\n\nThe model requires the desktop application: it is read from disk and computed outside the page.",
    entrees: [{ nom: "Prompt", nomEn: "Prompt", type: "texte", requis: false }],
    sorties: [{ nom: "Audio", type: "audio", sousType: "stereo" }],
    parametres: [
      { nom: "Modèle", nomEn: "Model", type: "choix",
        options: MOTEURS.map((m) => m.nom) as unknown as string[],
        optionsEn: MOTEURS.map((m) => m.nomEn) as unknown as string[],
        optionIds: MOTEURS.map((m) => m.id) as unknown as string[],
        defaut: MOTEURS[0].nom, defautEn: MOTEURS[0].nomEn,
        doc: "Le moteur qui engendre le son. Un seul est câblé à ce jour.",
        docEn: "The engine that generates the sound. Only one is wired so far." },
      { nom: "Prompt", nomEn: "Prompt", type: "texte",
        defaut: PROMPT_DEFAUT, defautEn: PROMPT_DEFAUT,
        doc: "Description du son à engendrer, en anglais. La prise de son se décrit comme le son lui-même : « close mic », « dry room », « field recording » orientent le rendu autant que le sujet.",
        docEn: "Description of the sound to generate, in English. The recording describes itself as much as the sound does: « close mic », « dry room », « field recording » steer the result as much as the subject." },
      { nom: "Durée", nomEn: "Duration", type: "curseur", plage: [1, 30], pas: 1, defaut: 6, unite: "s",
        doc: "Longueur du son engendré. Le modèle ajoute six secondes de marge interne.",
        docEn: "Length of the generated sound. The model adds six seconds of internal headroom." },
      { nom: "Étapes", nomEn: "Steps", type: "curseur", plage: [1, 20], pas: 1, defaut: 8,
        doc: "Nombre d'étapes du débruitage. Peu d'étapes donnent un son plus rugueux, et plus vite.",
        docEn: "Number of denoising steps. Few steps give a rougher sound, and give it faster." },
      { nom: "Graine", nomEn: "Seed", type: "curseur", plage: [-1, 999999], pas: 1, defaut: -1,
        doc: "Tirage aléatoire. À moins un, une graine est tirée à chaque exécution.",
        docEn: "Random draw. At minus one, a seed is drawn at each run." },
      { nom: "Sortie", nomEn: "Output", type: "choix",
        options: ["Normalisée", "Telle quelle"], optionsEn: ["Normalised", "As is"],
        optionIds: ["normalisee", "brute"], defaut: "Normalisée", defautEn: "Normalised",
        doc: "« Normalisée » porte la crête au niveau demandé. « Telle quelle » rend le son du modèle sans y toucher.",
        docEn: "« Normalised » brings the peak to the requested level. « As is » returns the model's sound untouched." },
      { nom: "Niveau crête", nomEn: "Peak level", type: "curseur", plage: [-30, 0], pas: 0.5, defaut: -1, unite: "dBFS",
        doc: "Crête visée pour la sortie normalisée, en décibels sous la pleine échelle.",
        docEn: "Peak aimed at for the normalised output, in decibels below full scale." },
    ],
    async executer(ctx: any) {
      const api = typeof window !== "undefined" ? (window as any).api : null;
      if (!api?.genererStableAudio3) {
        return {
          valeurs: [null], erreur: true,
          message: en() ? "This node requires the desktop application."
            : "Ce composant demande l'application de bureau.",
        };
      }

      // L'ENTRÉE PRIME SUR LE RÉGLAGE quand elle porte quelque chose : c'est elle qui permet
      // d'enchaîner une description venue d'ailleurs, et le réglage sert alors de valeur d'essai.
      const entree = ctx.entree(0);
      const prompt = typeof entree === "string" && entree.trim()
        ? entree.trim()
        : ctx.paramTexte("Prompt", PROMPT_DEFAUT);
      const seconds = ctx.paramNombre("Durée", 6);
      const steps = ctx.paramNombre("Étapes", 8);
      let seed = ctx.paramNombre("Graine", -1);
      if (seed < 0) seed = Math.floor(Math.random() * 1_000_000);

      // LA PREMIÈRE UTILISATION PEUT COMMENCER PAR UN TÉLÉCHARGEMENT de plus d'un gigaoctet, et le
      // message doit le dire : sans cela, une attente de plusieurs minutes passerait pour un gel.
      // L'avancement lui-même paraît sur le bouton des modèles, qui écoute déjà ce canal.
      ctx.onProgress(en()
        ? "Generating the sound… (the first run fetches the package, over a gigabyte)"
        : "Génération du son… (la première fois, le paquet est récupéré, plus d'un gigaoctet)");
      try {
        // LE PAQUET DE BRUITAGE, NOMMÉ ET NON DEVINÉ. Le moteur sert aussi le nœud musical, qui
        // emploie l'autre variante ; c'est ce nom qui les sépare.
        const rep = await api.genererStableAudio3({ prompt, seconds, steps, seed, modelPath: "", paquet: "sfx" });
        if (!rep?.ok) {
          return { valeurs: [null], erreur: true, message: String(rep?.erreur ?? (en() ? "unknown error" : "erreur inconnue")) };
        }
        const length = rep.left?.length ?? 0;
        if (length === 0) {
          return { valeurs: [null], erreur: true, message: en() ? "The model returned an empty sound." : "Le modèle a rendu un son vide." };
        }
        const gauche = new Float32Array(rep.left);
        const droite = new Float32Array(rep.right);

        const brute = ctx.paramTexte("Sortie", "normalisee") === "brute";
        const gain = brute ? 1 : mettreAuNiveau([gauche, droite], ctx.paramNombre("Niveau crête", -1));

        const buf = new AudioBuffer({ numberOfChannels: 2, length, sampleRate: rep.sampleRate });
        buf.copyToChannel(gauche, 0);
        buf.copyToChannel(droite, 1);

        const dit = brute
          ? (en() ? "as is" : "telle quelle")
          : `${en() ? "gain" : "gain"} ${(20 * Math.log10(Math.max(gain, 1e-9))).toFixed(1)} dB`;
        return {
          valeurs: [buf],
          message: `${(length / rep.sampleRate).toFixed(2)} s · ${steps} ${en() ? "steps" : "étapes"} · ${en() ? "seed" : "graine"} ${seed} · ${dit}`,
        };
      } catch (err: any) {
        return { valeurs: [null], erreur: true, message: String(err?.message ?? err) };
      }
    },
  },
] as FicheAudio[]).map(avecDoc);
