// plugins/texte-image-moss.ts — Une image tirée d'un texte, ou d'une mise en page, par MOSS-Image.
//
// CE QU'EST MOSS-IMAGE. Un transformeur de diffusion de cinq milliards de paramètres, publié par
// OpenMOSS le 2026-10-16 sous Apache-2.0, dont la version SFT sert ici. Ce qui le distingue est la
// MISE EN PAGE : son prompt peut être un JSON qui place chaque texte et chaque objet dans une boîte,
// et il écrit les mots demandés là où on les demande.
//
// LE MOTEUR EST stable-diffusion.cpp, lancé par le processus principal (`electron/sdcpp.cjs`).
// Mesuré le 2026-10-28 sur une RTX 2060, 20 étapes : 156 s en 512 × 512, 720 s en 1024 × 1024.
// Une pochette mise en page en JSON y a rendu son titre, son objet et son sous-titre à leur place,
// accents compris. Le jugement du rendu est celui de Fabien, qui a demandé l'intégration.
//
// LE COMPOSANT S'OUVRE EN 320 × 320 ET 30 ÉTAPES, réglages fixés par Fabien le même jour : une image
// petite et finie plutôt qu'une grande longue à venir. Le modèle a appris sur 1024 pixels de côté, et
// la notice le dit pour qui veut monter.
//
// LES QUATRE FICHIERS SE PRENNENT À LA PREMIÈRE EXÉCUTION, 9,4 Go dont deux tirés de Hugging Face
// par l'exception que le manifeste nomme. `annoncerModele` en dit le poids avant de commencer.
//
// UNE DESCRIPTION EN MOTS PEUT DEVENIR UNE MISE EN PAGE, demandé par Fabien le 2026-10-30 : un modèle
// de langue servi par Ollama la rédige avant le dessin, et la sortie « Mise en page » rend le JSON
// remis au modèle. La méthode et ses mesures sont dans `moss-mise-en-page.ts`. Le réglage s'ouvre sur
// « Aucune », ce qui garde le composant tel qu'il était pour qui n'a pas Ollama.
import type { FicheAudio } from "../audio/types-domaine";
import { resoudreGraine } from "../core/hasard";
import { traduire } from "../i18n";
import { avecDoc } from "./notices";
import { annoncerModele } from "./message-modele";
import { estMiseEnPage, MODELE_MISE_EN_PAGE, redigerMiseEnPage } from "./moss-mise-en-page";
import { ollamaGenerer } from "./ollama";
import { messageEchecPont } from "./pont-electron";
import { parametreCalcul } from "./parametre-calcul";
import { relayerProgression } from "./progression-pont";

/** Le canal du processus principal, nommé une fois : le nœud l'appelle et le reconnaît en cas d'échec. */
const CANAL = "sdcpp:moss";

const PROMPT_DEFAUT = "an old brass gramophone in a dusty attic, morning light, film photography";

const api = () => (globalThis as unknown as { api?: Record<string, (...a: unknown[]) => Promise<unknown>> }).api;

/** Le côté de l'image et le nombre d'étapes à l'ouverture, lus par la fiche comme par l'exécution. */
const COTE_DEFAUT = 320;
const ETAPES_DEFAUT = 30;

/** Un côté de l'image : le modèle veut un multiple de seize, la glissière avance par soixante-quatre. */
const cote = (nom: string, nomEn: string, doc: string, docEn: string) => ({
  nom, nomEn, type: "curseur" as const, plage: [256, 1536], pas: 64, defaut: COTE_DEFAUT, unite: "px", doc, docEn,
});

export const fiches = ([
  {
    id: "texte-image-moss", nom: "Texte → image (MOSS)", nomEn: "Text to image (MOSS)",
    univers: "Entrées", famille: "Image",
    resume: "Tire une image d'une description ou d'une mise en page en JSON, avec MOSS-Image.",
    resumeEn: "Draws an image from a description or a JSON layout, with MOSS-Image.",
    notice: "Ce composant tire une image d'une description en mots, avec MOSS-Image, publié par OpenMOSS en 2026 "
      + "sous licence Apache-2.0.\n\n"
      + "« Prompt » décrit l'image. Il peut être une phrase, ou une mise en page en JSON qui place chaque élément : "
      + "un objet « summary » dont « caption » décrit l'ensemble, une liste « items » dont chaque élément porte un "
      + "« label » valant « text » ou « object », une « caption » qui le décrit, un « text » pour les mots à écrire, et "
      + "une « bbox » donnée en pixels sous la forme haut, gauche, bas, droite, mesurés depuis le centre de l'image ; "
      + "le tout accompagné de « bbox_format » valant « yxyx » et de « bbox_coord_space » valant « abs_centralized ». "
      + "Sur l'image de 320 pixels de côté que le composant rend à l'ouverture, chaque coordonnée va donc de moins "
      + "160 à 160. Les mots à écrire sont "
      + "rendus tels qu'ils sont donnés. Le modèle a appris en anglais et en chinois. L'entrée du même nom remplace "
      + "le réglage quand elle reçoit un texte.\n\n"
      + "« Prompt négatif » décrit ce qu'on veut écarter. Vide, rien ne l'est.\n\n"
      + "« Réécriture » dit ce qui arrive au prompt avant le dessin. « Aucune » le remet tel quel. « Mise en page par "
      + "un modèle » fait d'abord rédiger, à partir d'une description en mots, une mise en page en JSON par un modèle "
      + "de langue local servi par Ollama : une légende d'ensemble, puis les objets, les personnages et les textes à "
      + "écrire, chacun dans sa boîte. Les coordonnées sont ensuite vérifiées et converties sans le modèle, selon la "
      + "méthode de l'outil de réécriture publié par OpenMOSS ; une mise en page refusée est redemandée une fois, avec "
      + "la raison du refus. Un prompt déjà écrit en JSON est remis tel quel. La rédaction emploie la même graine que "
      + "l'image.\n\n"
      + "« Modèle de langue » nomme le modèle installé dans Ollama qui rédige la mise en page. Il est déchargé de la "
      + "mémoire dès la rédaction finie, et laisse la place au calcul de l'image.\n\n"
      + "« Largeur » et « Hauteur » fixent la taille de l'image. Le modèle a appris sur 1024 pixels de côté, et le "
      + "temps de calcul croît avec la surface.\n\n"
      + "« Étapes » est le nombre de pas de débruitage. Peu d'étapes rendent une image moins finie ; le temps de "
      + "calcul croît avec leur nombre.\n\n"
      + "« Guidage » règle à quel point l'image suit le texte. Faible, le modèle compose plus librement ; fort, il "
      + "colle aux mots, au risque de durcir l'image.\n\n"
      + "« Graine » fixe le tirage de départ. À moins un, elle est tirée au sort, et le message dit laquelle a servi. "
      + "La même graine rend la même image sur un même périphérique de calcul.\n\n"
      + "« Calcul » nomme le périphérique employé.\n\n"
      + "À la première exécution, les quatre fichiers du modèle sont téléchargés, et le message en annonce le poids. "
      + "La sortie « Image » rend un PNG. La sortie « Mise en page » rend le prompt remis au modèle : la mise en page "
      + "en JSON quand elle a été rédigée ou donnée, la description en mots sinon. Le message donne la graine retenue "
      + "et la taille, et le nombre d'éléments d'une mise en page rédigée.",
    noticeEn: "This component draws an image from a description in words, with MOSS-Image, published by OpenMOSS in "
      + "2026 under the Apache-2.0 licence.\n\n"
      + "« Prompt » describes the image. It can be a sentence, or a JSON layout that places each element: a "
      + "« summary » object whose « caption » describes the whole, an « items » list in which each element carries a "
      + "« label » worth « text » or « object », a « caption » describing it, a « text » for the words to write, and a "
      + "« bbox » given in pixels as top, left, bottom, right, measured from the centre of the image; all of it "
      + "together with « bbox_format » worth « yxyx » and « bbox_coord_space » worth « abs_centralized ». On the "
      + "320-pixel-square image the component renders when opened, each coordinate therefore runs from minus 160 to "
      + "160. The words to write are rendered as given. The model learned in English and Chinese. The input of the same name replaces the setting when it "
      + "receives a text.\n\n"
      + "« Negative prompt » describes what is to be kept out. Empty, nothing is.\n\n"
      + "« Rewriting » says what happens to the prompt before drawing. « None » passes it as it stands. « Layout by a "
      + "model » first has a local language model served by Ollama draft a JSON layout from a description in words: an "
      + "overall caption, then the objects, characters and texts to write, each in its box. The coordinates are then "
      + "checked and converted without the model, following the method of the rewriting tool published by OpenMOSS; a "
      + "rejected layout is asked for once more, with the reason for the rejection. A prompt already written in JSON is "
      + "passed as it stands. The drafting uses the same seed as the image.\n\n"
      + "« Language model » names the model installed in Ollama that drafts the layout. It is unloaded from memory as "
      + "soon as the drafting is done, leaving room for computing the image.\n\n"
      + "« Width » and « Height » set the size of the image. The model learned on 1024 pixels a side, and the compute "
      + "time grows with the area.\n\n"
      + "« Steps » is the number of denoising steps. Few steps give a less finished image; the compute time grows with "
      + "their number.\n\n"
      + "« Guidance » sets how closely the image follows the text. Low, the model composes more freely; high, it "
      + "sticks to the words, at the risk of hardening the image.\n\n"
      + "« Seed » fixes the starting draw. At minus one, it is drawn at random, and the message says which one was "
      + "used. The same seed gives the same image on the same compute device.\n\n"
      + "« Compute » names the device used.\n\n"
      + "On the first run, the four model files are downloaded, and the message announces their weight. The "
      + "« Image » output returns a PNG. The « Layout » output returns the prompt handed to the model: the JSON layout "
      + "when it was drafted or given, the description in words otherwise. The message gives the seed used and the "
      + "size, and the number of items of a drafted layout.",
    entrees: [{ nom: "Prompt", nomEn: "Prompt", type: "texte", sousType: "prompt", requis: false }],
    sorties: [{ nom: "Image", nomEn: "Image", type: "image" }, { nom: "Mise en page", nomEn: "Layout", type: "texte" }],
    parametres: [
      { nom: "Prompt", nomEn: "Prompt", type: "texte", defaut: PROMPT_DEFAUT, defautEn: PROMPT_DEFAUT,
        doc: "La description de l'image, ou sa mise en page en JSON. Le modèle a appris en anglais et en chinois.",
        docEn: "The description of the image, or its JSON layout. The model learned in English and Chinese." },
      { nom: "Prompt négatif", nomEn: "Negative prompt", type: "texte", defaut: "", defautEn: "",
        doc: "Ce qu'on veut écarter. Vide, rien ne l'est.",
        docEn: "What is to be kept out. Empty, nothing is." },
      { nom: "Réécriture", nomEn: "Rewriting", type: "choix", options: ["Aucune", "Mise en page par un modèle"],
        optionsEn: ["None", "Layout by a model"], optionIds: ["aucune", "mise-en-page"], defaut: "Aucune", defautEn: "None",
        doc: "Ce qui arrive au prompt avant le dessin. « Mise en page par un modèle » fait rédiger une mise en page en JSON par un modèle de langue servi par Ollama.",
        docEn: "What happens to the prompt before drawing. « Layout by a model » has a language model served by Ollama draft a JSON layout." },
      { nom: "Modèle de langue", nomEn: "Language model", type: "texte", defaut: MODELE_MISE_EN_PAGE, defautEn: MODELE_MISE_EN_PAGE,
        doc: "Le modèle installé dans Ollama qui rédige la mise en page. Sans effet quand « Réécriture » vaut « Aucune ».",
        docEn: "The model installed in Ollama that drafts the layout. No effect when « Rewriting » is « None »." },
      cote("Largeur", "Width",
        "La largeur de l'image. Le modèle a appris sur 1024 pixels, et le temps de calcul croît avec la surface.",
        "The width of the image. The model learned on 1024 pixels, and the compute time grows with the area."),
      cote("Hauteur", "Height",
        "La hauteur de l'image. Les coordonnées d'une mise en page se mesurent depuis le centre, sur cette taille.",
        "The height of the image. The coordinates of a layout are measured from the centre, on this size."),
      { nom: "Étapes", nomEn: "Steps", type: "curseur", plage: [4, 60], pas: 1, defaut: ETAPES_DEFAUT, unite: "",
        doc: "Le nombre de pas de débruitage. Peu d'étapes rendent une image moins finie ; le temps de calcul croît avec leur nombre.",
        docEn: "The number of denoising steps. Few steps give a less finished image; the compute time grows with their number." },
      { nom: "Guidage", nomEn: "Guidance", type: "curseur", plage: [1, 10], pas: 0.5, defaut: 3, unite: "",
        doc: "À quel point l'image suit le texte. Faible, le modèle compose plus librement ; fort, il colle aux mots.",
        docEn: "How closely the image follows the text. Low, the model composes more freely; high, it sticks to the words." },
      { nom: "Graine", graine: true, nomEn: "Seed", type: "curseur", plage: [-1, 999999], pas: 1, defaut: -1,
        doc: "Le tirage de départ. À moins un, il est tiré au sort et le message dit lequel a servi.",
        docEn: "The starting draw. At minus one, it is drawn at random and the message says which one was used." },
      parametreCalcul(),
    ],
    async executer(ctx: any) {
      const pont = api();
      if (!pont?.sdcppMoss) {
        return { valeurs: [null, null], erreur: true, message: traduire("msg.n_cessite_electron") };
      }
      const entree = ctx.entree(0);
      const prompt = typeof entree === "string" && entree.trim() ? entree.trim()
        : ctx.paramTexte("Prompt", PROMPT_DEFAUT).trim();
      if (!prompt) return { valeurs: [null, null], erreur: true, message: traduire("msg.moss.sans_prompt") };
      const graine = resoudreGraine(ctx.paramNombre("Graine", -1));
      const largeur = Math.round(ctx.paramNombre("Largeur", COTE_DEFAUT) / 16) * 16;
      const hauteur = Math.round(ctx.paramNombre("Hauteur", COTE_DEFAUT) / 16) * 16;

      // CE QUI PART AU MODÈLE D'IMAGE, et c'est aussi ce que rend la sortie « Mise en page ».
      let envoye = prompt;
      let elements: number | null = null;
      if (ctx.paramTexte("Réécriture", "aucune") === "mise-en-page" && !estMiseEnPage(prompt)) {
        const modele = ctx.paramTexte("Modèle de langue", MODELE_MISE_EN_PAGE).trim() || MODELE_MISE_EN_PAGE;
        ctx.onProgress(traduire("progress.moss.mise_en_page", modele));
        const m = await redigerMiseEnPage({ demande: prompt, largeur, hauteur, modele, graine, generer: ollamaGenerer });
        if (!m.ok) {
          const message = m.raison === "ollama" ? traduire("msg.ollama_var_0", m.detail) : traduire("msg.moss.mise_en_page_refusee", m.detail);
          return { valeurs: [null, null], erreur: true, message };
        }
        envoye = m.json;
        elements = m.elements;
      }

      await annoncerModele(ctx, "texte-image-moss", traduire("progress.moss"));
      const debrancher = relayerProgression(ctx, pont.sdcppProgression);
      let r: { ok: boolean; png?: Uint8Array; journal?: string };
      try {
        r = await pont.sdcppMoss({
          prompt: envoye,
          negatif: ctx.paramTexte("Prompt négatif", "").trim(),
          graine,
          etapes: Math.round(ctx.paramNombre("Étapes", ETAPES_DEFAUT)),
          guidage: ctx.paramNombre("Guidage", 3),
          largeur, hauteur,
          calcul: ctx.paramTexte("Calcul", "").trim(),
        }) as typeof r;
      } catch (erreur) {
        return { valeurs: [null, null], erreur: true, message: messageEchecPont(erreur, CANAL) };
      } finally {
        debrancher();
      }
      if (!r.ok || !r.png) {
        return { valeurs: [null, null], erreur: true, message: (r.journal ?? "").slice(-240) };
      }
      const image = new File([new Uint8Array(r.png) as unknown as BlobPart], `moss-${graine}.png`, { type: "image/png" });
      const message = elements === null ? traduire("msg.moss.fait", graine, largeur, hauteur)
        : traduire("msg.moss.fait_mise_en_page", graine, largeur, hauteur, elements);
      return { valeurs: [image, envoye], message };
    },
  },
] as unknown as FicheAudio[]).map(avecDoc);
