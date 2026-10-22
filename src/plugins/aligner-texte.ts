// plugins/aligner-texte.ts — Placer un texte qu'on connaît sur la parole, mot par mot.
//
// CE N'EST PAS UNE RECONNAISSANCE, ET C'EST LÀ TOUT SON INTÉRÊT. Une reconnaissance devine les
// mots et se trompe ; un aligneur reçoit les mots et n'a qu'à les dater. Quand on dispose du texte
// — des paroles, un script, une transcription relue — l'alignement est donc plus juste, et il ne
// peut pas inventer un mot qui n'a pas été dit.
//
// SA RÉSOLUTION EST DE QUATRE-VINGTS MILLISECONDES, et c'est une mesure, non une estimation :
// relevé le 2026-10-22 sur un témoin fabriqué exprès, tous les instants rendus — début comme fin,
// trente mots — étaient des multiples de 0,08 s. Rien de plus fin ne peut être attendu de ce
// moteur, et la notice le dit plutôt que de laisser croire au centième.
//
// LE TÉMOIN QUI A SERVI, PARCE QU'IL DIT COMMENT ON ÉPROUVE UN ALIGNEUR SANS ÉCOUTER. Une phrase
// synthétisée, deux secondes de silence, puis la MÊME phrase ; le texte donné est la phrase
// doublée. Quatre choses doivent alors être vraies quoi qu'il arrive : les instants montent, aucun
// mot ne tombe dans le silence du milieu, les quinze derniers mots commencent tous après ce
// silence, et le décalage entre les deux copies vaut exactement la phrase plus le trou. Les quatre
// tenaient — le décalage à 6,880 s pour une phrase de 4,880 s et un trou de 2,000 s.
import { garderIntervalles, formaterMots, tranche, type Mot } from "../audio/parole-datee";
import type { FicheAudio } from "../audio/types-domaine";
import { traduire } from "../i18n";
import { avecDoc } from "./notices";
import { annoncerModele } from "./message-modele";
import { messageEchecPont } from "./pont-electron";

const CALCULS = [
  { id: "", fr: "Automatique", en: "Automatic" },
  { id: "CPU", fr: "Processeur", en: "Processor" },
  { id: "Vulkan0", fr: "Vulkan 0", en: "Vulkan 0" },
  { id: "Vulkan1", fr: "Vulkan 1", en: "Vulkan 1" },
  { id: "CUDA0", fr: "CUDA 0", en: "CUDA 0" },
];

/** Les onze langues que le moteur déclare. Une langue hors de cette liste serait refusée par lui. */
const LANGUES = [
  { id: "fr", fr: "Français", en: "French" },
  { id: "en", fr: "Anglais", en: "English" },
  { id: "de", fr: "Allemand", en: "German" },
  { id: "es", fr: "Espagnol", en: "Spanish" },
  { id: "it", fr: "Italien", en: "Italian" },
  { id: "pt", fr: "Portugais", en: "Portuguese" },
  { id: "ru", fr: "Russe", en: "Russian" },
  { id: "zh", fr: "Chinois", en: "Chinese" },
  { id: "yue", fr: "Cantonais", en: "Cantonese" },
  { id: "ja", fr: "Japonais", en: "Japanese" },
  { id: "ko", fr: "Coréen", en: "Korean" },
];

const MONTAGES = [
  { id: "place", fr: "Garder la place", en: "Keep the place" },
  { id: "coller", fr: "Coller bout à bout", en: "Join end to end" },
];

const CANAL = "parole:aligner";

const api = () => (globalThis as unknown as { api?: Record<string, (...a: unknown[]) => Promise<unknown>> }).api;

/** Branche l'avancement du moteur sur celui du nœud, et rend de quoi se débrancher. */
function suivre(ctx: { onProgress?: (m: string) => void }) {
  const pont = api()?.paroleAlignementProgression as unknown as
    ((cb: (e: { ligne: string }) => void) => () => void) | undefined;
  if (!pont) return () => { /* hors application : rien à suivre */ };
  return pont(({ ligne }) => ctx.onProgress?.(ligne));
}

export const fiches = ([
  {
    id: "aligner-texte", nom: "Aligner un texte sur la parole", nomEn: "Align text to speech",
    univers: "Traitement", famille: "Montage",
    resume: "Date chaque mot d'un texte donné sur l'enregistrement qui le prononce, et découpe la suite de mots demandée.",
    resumeEn: "Dates each word of a given text on the recording that speaks it, and cuts out the requested word range.",
    notice: "Ce composant reçoit un enregistrement et le texte qui y est prononcé, et dit où tombe chaque mot. "
      + "Il ne reconnaît rien : les mots viennent de l'entrée « Texte », de sorte qu'il ne peut pas en inventer "
      + "un. Quand on a déjà le texte, c'est plus juste qu'une reconnaissance.\n\n"
      + "« Du mot » et « Au mot » désignent la suite de mots à découper, par leur rang dans le texte, le premier "
      + "mot portant le rang un. À zéro, « Au mot » va jusqu'au dernier. Un rang de départ au-delà du dernier mot "
      + "rend un son tu plutôt que le son entier, et le rapport le dit.\n\n"
      + "« Marge » élargit la découpe de chaque côté. Les instants rendus tombent sur une horloge de "
      + "quatre-vingts millisecondes : une marge de cet ordre évite de rogner une attaque ou une fin de mot.\n\n"
      + "« Montage » décide de la place de ce qui est gardé. À « Garder la place », la sortie fait la longueur de "
      + "l'entrée et tout le reste est tu. À « Coller bout à bout », les mots gardés sont mis à la suite.\n\n"
      + "« Fondu » adoucit les deux bords de la découpe. Des mots qui se suivent sont recollés avant le fondu, "
      + "de sorte qu'une suite de mots ne reçoit qu'un fondu à ses deux extrémités, et non un par mot.\n\n"
      + "« Langue » doit être celle du texte, parmi les onze que le moteur connaît. « Calcul » nomme le "
      + "périphérique employé.\n\n"
      + "La sortie « Audio » rend le son découpé. « Mots » donne une ligne par mot, avec son rang et son "
      + "intervalle. « Rapport » donne le nombre de mots placés, l'intervalle de la découpe et sa durée. La "
      + "résolution du moteur est de quatre-vingts millisecondes : les instants rendus en sont tous des "
      + "multiples, et rien de plus fin n'en est obtenu.",
    noticeEn: "This component receives a recording and the text spoken in it, and says where each word falls. It "
      + "recognizes nothing: the words come from the « Text » input, so that it cannot invent one. When the text "
      + "is already at hand, this is more accurate than recognition.\n\n"
      + "« From word » and « To word » designate the word range to cut out, by their rank in the text, the first "
      + "word having rank one. At zero, « To word » goes to the last. A starting rank beyond the last word "
      + "returns a silent sound rather than the whole sound, and the report says so.\n\n"
      + "« Margin » widens the cut on each side. The returned instants fall on an eighty-millisecond clock: a "
      + "margin of that order avoids clipping an onset or a word ending.\n\n"
      + "« Editing » decides where what is kept sits. At « Keep the place », the output is as long as the input "
      + "and all the rest is silenced. At « Join end to end », the kept words are placed one after another.\n\n"
      + "« Fade » softens both edges of the cut. Words that follow one another are joined before the fade, so "
      + "that a word sequence receives only one fade at each of its ends, and not one per word.\n\n"
      + "« Language » must be that of the text, among the eleven the engine knows. « Compute » names the device "
      + "used.\n\n"
      + "The « Audio » output returns the cut sound. « Words » gives one line per word, with its rank and its "
      + "interval. « Report » gives the number of words placed, the interval of the cut and its duration. The "
      + "engine's resolution is eighty milliseconds: the returned instants are all multiples of it, and nothing "
      + "finer is obtained from it.",
    entrees: [
      { nom: "Audio", nomEn: "Audio", type: "audio" },
      { nom: "Texte", nomEn: "Text", type: "texte" },
    ],
    sorties: [
      { nom: "Audio", nomEn: "Audio", type: "audio" },
      { nom: "Mots", nomEn: "Words", type: "texte" },
      { nom: "Rapport", nomEn: "Report", type: "texte" },
    ],
    parametres: [
      { nom: "Du mot", nomEn: "From word", type: "nombre", plage: [1, 10000], pas: 1, defaut: 1,
        doc: "Le rang du premier mot à garder, le premier mot du texte portant le rang un. La sortie « Mots » donne ces rangs, de sorte qu'on lise lequel demander.",
        docEn: "The rank of the first word to keep, the first word of the text having rank one. The « Words » output gives those ranks, so that one can read which to ask for." },
      { nom: "Au mot", nomEn: "To word", type: "nombre", plage: [0, 10000], pas: 1, defaut: 0,
        doc: "Le rang du dernier mot à garder, ce rang compris. À zéro, la découpe va jusqu'au dernier mot du texte. Un rang inférieur au départ rend un son tu.",
        docEn: "The rank of the last word to keep, that rank included. At zero, the cut goes to the last word of the text. A rank below the start returns a silent sound." },
      { nom: "Marge", nomEn: "Margin", type: "nombre", plage: [0, 500], pas: 5, defaut: 40, unite: "ms",
        doc: "Ce qui est ajouté de chaque côté de la découpe. Les instants du moteur tombent sur une horloge de quatre-vingts millisecondes, et une marge de cet ordre évite de rogner une attaque.",
        docEn: "What is added on each side of the cut. The engine's instants fall on an eighty-millisecond clock, and a margin of that order avoids clipping an onset." },
      { nom: "Montage", nomEn: "Editing", type: "choix",
        options: MONTAGES.map((m) => m.fr), optionsEn: MONTAGES.map((m) => m.en),
        optionIds: MONTAGES.map((m) => m.id), defaut: "Garder la place", defautEn: "Keep the place",
        doc: "Où placer ce qui est gardé. « Garder la place » tait le reste sans rien déplacer, de sorte que le résultat se superpose à l'original. « Coller bout à bout » met la découpe au début et raccourcit la sortie.",
        docEn: "Where to place what is kept. « Keep the place » silences the rest without moving anything, so that the result overlays the original. « Join end to end » puts the cut at the start and shortens the output." },
      { nom: "Fondu", nomEn: "Fade", type: "nombre", plage: [0, 200], pas: 1, defaut: 10, unite: "ms",
        doc: "La durée du fondu aux deux bords de la découpe. À zéro, la coupe est franche et peut claquer. Les mots qui se suivent étant recollés d'abord, une suite de mots ne reçoit qu'un fondu à chaque extrémité.",
        docEn: "The fade length at both edges of the cut. At zero, the cut is abrupt and may click. Since words that follow one another are joined first, a word sequence receives only one fade at each end." },
      { nom: "Langue", nomEn: "Language", type: "choix",
        options: LANGUES.map((l) => l.fr), optionsEn: LANGUES.map((l) => l.en),
        optionIds: LANGUES.map((l) => l.id), defaut: "Français", defautEn: "French",
        doc: "La langue du texte, parmi les onze que le moteur connaît. Une langue qui ne correspond pas au texte dégrade le placement sans refuser le travail.",
        docEn: "The language of the text, among the eleven the engine knows. A language that does not match the text degrades the placement without refusing the work." },
      { nom: "Calcul", nomEn: "Compute", type: "choix",
        options: CALCULS.map((c) => c.fr), optionsEn: CALCULS.map((c) => c.en),
        optionIds: CALCULS.map((c) => c.id), defaut: "Automatique", defautEn: "Automatic",
        doc: "Le périphérique de calcul. Il change le temps de calcul et non les instants trouvés. « Automatique » laisse le moteur prendre ce qu'il juge le meilleur, ce qui n'est pas toujours la carte graphique : une machine à deux cartes expose souvent le circuit intégré en premier, et les deux numéros sont là pour les départager. « Processeur » tourne partout, et bien plus lentement.",
        docEn: "The compute device. It changes the compute time and not the instants found. « Automatic » lets the engine take what it deems best, which is not always the graphics card: a machine with two cards often exposes the integrated one first, and the two numbers are there to tell them apart. « Processor » runs everywhere, and far more slowly." },
    ],
    async executer(ctx: any) {
      const pont = api();
      if (!pont?.paroleAligner) {
        return { valeurs: [null, null, null], erreur: true, message: traduire("msg.n_cessite_electron") };
      }
      const audio = ctx.entree(0);
      if (!(audio instanceof AudioBuffer)) {
        return { valeurs: [null, null, null], erreur: true, message: traduire("msg.aucune_entr_e") };
      }
      const texte = typeof ctx.entree(1) === "string" ? String(ctx.entree(1)).trim() : "";
      if (!texte) {
        return { valeurs: [null, null, null], erreur: true, message: traduire("msg.aligner.sans_texte") };
      }

      await annoncerModele(ctx, "aligner-texte", traduire("progress.parole.modele_alignement"));
      const { bufferVersWavBlob } = await import("../audio/io");
      const wav = new Uint8Array(await bufferVersWavBlob(audio).arrayBuffer());

      const debrancher = suivre(ctx);
      let r: { ok: boolean; mots?: Mot[]; journal?: string };
      try {
        r = await pont.paroleAligner({
          audio: wav,
          texte,
          langue: ctx.paramTexte("Langue", "fr"),
          calcul: ctx.paramTexte("Calcul", "").trim(),
        }) as typeof r;
      } catch (erreur) {
        return { valeurs: [null, null, null], erreur: true, message: messageEchecPont(erreur, CANAL) };
      } finally {
        debrancher();
      }
      if (!r.ok) {
        return { valeurs: [null, null, null], erreur: true, message: (r.journal ?? "").slice(-240) };
      }

      const mots = r.mots ?? [];
      const du = ctx.paramNombre("Du mot", 1);
      const au = ctx.paramNombre("Au mot", 0);
      const gardes = tranche(mots, du, au);
      const sortie = garderIntervalles(audio, gardes, {
        fonduMs: ctx.paramNombre("Fondu", 10),
        margeS: ctx.paramNombre("Marge", 40) / 1000,
        coller: ctx.paramTexte("Montage", "place") === "coller",
      });

      const duree = sortie.length / sortie.sampleRate;
      const rapport = [
        traduire("msg.aligner.mots", String(mots.length)),
        gardes.length === 0
          ? traduire("msg.aligner.tranche_vide", String(du), String(mots.length))
          : traduire("msg.aligner.tranche",
            String(gardes.length), gardes[0].mot, gardes[gardes.length - 1].mot,
            gardes[0].debut.toFixed(2), gardes[gardes.length - 1].fin.toFixed(2)),
        traduire("msg.aligner.duree", duree.toFixed(2)),
      ].join("\n");

      return {
        valeurs: [sortie, formaterMots(mots), rapport],
        message: `${mots.length} · ${gardes.length} · ${duree.toFixed(1)} s`,
      };
    },
  },
] as FicheAudio[]).map(avecDoc);
