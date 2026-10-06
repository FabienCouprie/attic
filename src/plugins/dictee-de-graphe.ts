// plugins/dictee-de-graphe.ts — Nœud « Dictée de graphe » : dire un graphe plutôt que l'écrire.
//
// CE QUE CE NŒUD REND EST UN TEXTE, et c'est ce qui le relie au reste : « Prompt → graphe » sait
// déjà traduire une phrase en graphe de composants, et ce nœud lui donne la phrase. Les deux se
// branchent l'un sur l'autre, et c'est ce qui évite de redire ici comment un graphe se construit.
//
// LE VOCABULAIRE FERMÉ EST L'OUTIL CENTRAL, et son effet a été mesuré. Vosk accepte une liste de
// mots dont il ne sortira pas ; nourri de la liste des noms de composants, il rend une dictée faite
// de noms de composants. Sur « entrée audio réverbération compresseur sortie audio » : la liste des
// 472 noms rend la phrase EXACTE en 1,79 s, le vocabulaire entier du modèle la rend exacte aussi
// mais en 3,37 s.
//
// ET IL A UNE LIMITE QU'IL FAUT DIRE, parce qu'elle décide du réglage. Un nom dont les mots sont
// hors du lexique du modèle ne peut pas être entendu, et la liste ne le rend pas entendable : le
// moteur recompose alors ce qu'il peut avec les mots de la liste. Relevé sur « granulateur
// spectrogramme » : la liste du catalogue rend « grains du lecteur spectre gamme », le vocabulaire
// entier rend « granulats de spectre grammes ». Aucun des deux n'est juste, et le premier a ceci de
// traître qu'il est fait de noms de composants, donc qu'il désigne des composants. C'est la raison
// du mode « Liste donnée » : réduite aux noms qu'on compte dire, la liste laisse le moteur rendre
// « [unk] » là où il n'a pas compris, plutôt qu'un nom plausible.
import type { FicheAudio } from "../audio/types-domaine";
import { traduire } from "../i18n";
import { avecDoc } from "./notices";
import { annoncerModele } from "./message-modele";
import { MODELES, chargerModele, transcrire, versMono, vers16k } from "./vosk-asr";
import { composantsNommes, vocabulaireDeDictee } from "./prompt-graphe";

/** Ce que le moteur rend là où il n'a pas reconnu de mot de la liste. */
export const JETON_INCONNU = "[unk]";

export type ModeVocabulaire = "catalogue" | "liste" | "libre";

/**
 * La liste que le moteur reçoit, selon le mode.
 *
 * `undefined` veut dire « pas de liste » : le vocabulaire entier du modèle. C'est ce que
 * `transcrire` attend d'un vocabulaire vide, et le mode « Libre » revient à le demander.
 */
export function grammaireChoisie(
  mode: ModeVocabulaire, catalogue: readonly string[], liste: readonly string[],
): string[] | undefined {
  if (mode === "libre") return undefined;
  if (mode === "liste") return liste.length > 0 ? [...liste] : undefined;
  return [...catalogue];
}

/** Découpe une liste saisie, accents GARDÉS : c'est ainsi que le lexique du modèle les écrit. */
export const listeDictee = (texte: string): string[] =>
  String(texte).split(/[,\n]+/).map((m) => m.toLowerCase()
    .replace(/[^\p{L}\p{N} ]+/gu, " ").replace(/\s+/g, " ").trim()).filter(Boolean);

/** Les passages que le moteur n'a pas reconnus. */
export const compterInconnus = (texte: string): number =>
  texte.split(/\s+/).filter((m) => m === JETON_INCONNU).length;

export const fiches: FicheAudio[] = ([
  {
    id: "dictee-de-graphe", nom: "Dictée de graphe", nomEn: "Graph Dictation",
    univers: "Autres", famille: "Texte",
    resume: "Transcrit une consigne dite à voix haute, en n'y reconnaissant que des noms de composants.",
    resumeEn: "Transcribes a spoken instruction, recognising nothing in it but node names.",
    entrees: [{ nom: "Audio", nomEn: "Audio", type: "audio" }],
    sorties: [
      { nom: "Texte", nomEn: "Text", type: "texte" },
      { nom: "Composants", nomEn: "Nodes", type: "texte" },
    ],
    // Une prise sans parole reconnue est un résultat, et non une panne : le nœud a tourné.
    sortieNullePermise: true,
    parametres: [
      { nom: "Langue", nomEn: "Language", type: "choix",
        options: ["Français", "Anglais"], optionsEn: ["French", "English"],
        optionIds: ["fr", "en"], defaut: "Français", defautEn: "French",
        doc: "Le modèle de reconnaissance employé, et la langue dans laquelle les noms de composants sont donnés au moteur.",
        docEn: "The recognition model used, and the language the node names are given to the engine in." },
      { nom: "Vocabulaire", nomEn: "Vocabulary", type: "choix",
        options: ["Noms des composants", "Liste donnée", "Libre"],
        optionsEn: ["Node names", "Given list", "Free"],
        optionIds: ["catalogue", "liste", "libre"],
        defaut: "Noms des composants", defautEn: "Node names",
        doc: "Ce que le moteur a le droit de rendre. Les noms des composants : la dictée est faite de noms du catalogue, et rien d'autre. Liste donnée : les seuls noms du champ « Mots », ce qui laisse le moteur rendre « [unk] » là où il n'a pas compris au lieu d'un nom plausible. Libre : le vocabulaire entier du modèle, à employer quand le nom cherché n'est pas de ceux que le modèle sait écrire.",
        docEn: "What the engine is allowed to return. Node names: the dictation is made of catalogue names, and of nothing else. Given list: only the names in the « Words » field, which lets the engine return « [unk] » where it did not understand instead of a plausible name. Free: the model's whole vocabulary, to be used when the name sought is not one the model knows how to write." },
      { nom: "Mots", nomEn: "Words", type: "texte", defaut: "", defautEn: "",
        placeholder: "entrée audio, réverbération, sortie audio",
        placeholderEn: "audio input, reverberation, audio output",
        doc: "Les noms que l'on compte dicter, séparés par des virgules ou des retours à la ligne. Les accents comptent, le lexique du modèle les portant. N'agit qu'en vocabulaire « Liste donnée » ; laissé vide dans ce mode, le vocabulaire entier du modèle est employé.",
        docEn: "The names one intends to dictate, separated by commas or line breaks. Accents matter, the model's lexicon carrying them. Acts only in the « Given list » vocabulary; left empty in that mode, the model's whole vocabulary is used." },
    ],
    async executer(ctx: any) {
      const audio = ctx.entree(0);
      if (!(audio instanceof AudioBuffer)) {
        return { valeurs: [null, null], message: traduire("msg.aucune_entr_e_audio") };
      }
      const langue = ctx.paramTexte("Langue", "fr");
      const choisi = MODELES[langue] ?? MODELES.fr;
      await annoncerModele(ctx, "dictee-de-graphe", traduire("progress.vosk.chargement"));
      const modele = await chargerModele(choisi.fichier);
      const seize = await vers16k(versMono(audio), audio.sampleRate);

      const mode = ctx.paramTexte("Vocabulaire", "catalogue") as ModeVocabulaire;
      const grammaire = grammaireChoisie(
        mode,
        mode === "catalogue" ? await vocabulaireDeDictee(langue === "en") : [],
        listeDictee(ctx.paramTexte("Mots", "")),
      );
      const { texte } = await transcrire(modele, seize, {
        grammaire,
        surPartiel: (p) => ctx.onProgress?.(p),
      });
      if (!texte) {
        return { valeurs: [null, null], message: traduire("msg.dictee.rien") };
      }

      const nommes = await composantsNommes(texte);
      return {
        valeurs: [texte, nommes.map((n) => n.label).join("\n")],
        message: traduire("msg.dictee.resume",
          String(nommes.length), String(compterInconnus(texte)), texte.slice(0, 60)),
      };
    },
  },
] as FicheAudio[]).map(avecDoc);
