// plugins/qui-parle-quand.ts — Découper un enregistrement en tours de parole, et isoler un locuteur.
//
// CE QUE LE MOTEUR REND, ET CE QU'IL NE REND PAS. Il rend des tours : un intervalle, un identifiant
// de locuteur, et le texte prononcé pendant ce tour. Il ne rend PAS de nom, et ne peut pas en
// rendre : les identifiants sont des rangs d'apparition, de sorte que le même locuteur garde le même
// numéro d'un bout à l'autre du fichier mais pas d'un fichier à l'autre.
//
// SA RÉSOLUTION EST CELLE DE SON HORLOGE D'ANALYSE. Mesuré le 2026-10-22 sur un témoin de quatre
// tours dont les bascules étaient connues à la construction : les bornes tombent entre quarante et
// deux cent quatre-vingts millisecondes de celles du plan. D'où le réglage « Fondu », qui existe
// pour que cette marge ne s'entende pas comme un clic.
//
// IL FAUT DU SEIZE KILOHERTZ, ET C'EST LE MOTEUR QUI L'EXIGE : « MOSS-Transcribe-Diarize requires
// SOXR for non-16-kHz audio », le binaire publié n'embarquant pas SOXR. Le nœud descend donc le son
// à seize kilohertz avant de le passer, et le fait en mono, puisque la diarisation ne lit qu'une
// voie. LE SON RENDU, LUI, GARDE SES CANAUX ET SA CADENCE : les intervalles s'appliquent à
// l'original, non à la copie réduite qui a servi à les trouver.
import { mixdownMono } from "../audio/commun";
import { garderIntervalles, formaterTours, locuteursDe, type Tour } from "../audio/parole-datee";
import type { FicheAudio } from "../audio/types-domaine";
import { traduire } from "../i18n";
import { avecDoc } from "./notices";
import { entreeAudio, sansEntree } from "./lire-entree";
import { annoncerModele } from "./message-modele";
import { messageEchecPont } from "./pont-electron";
import { resamplerVers16k } from "./sherpa-asr";
import { parametreCalcul } from "./parametre-calcul";
import { relayerProgression } from "./progression-pont";
import type { ContexteDeRelais } from "./progression-pont";

/** Les locuteurs qu'on peut demander : tous, ou l'un des quatre que le moteur distingue. */
const LOCUTEURS = [
  { id: "", fr: "Tous", en: "All" },
  { id: "1", fr: "Le premier", en: "The first" },
  { id: "2", fr: "Le deuxième", en: "The second" },
  { id: "3", fr: "Le troisième", en: "The third" },
  { id: "4", fr: "Le quatrième", en: "The fourth" },
];

const MONTAGES = [
  { id: "place", fr: "Garder la place", en: "Keep the place" },
  { id: "coller", fr: "Coller bout à bout", en: "Join end to end" },
];

const CANAL = "parole:diariser";

const api = () => (globalThis as unknown as { api?: Record<string, (...a: unknown[]) => Promise<unknown>> }).api;

/** Branche l'avancement du moteur sur celui du nœud, et rend de quoi se débrancher. */
function suivre(ctx: ContexteDeRelais) {
  return relayerProgression(ctx, api()?.paroleDiarisationProgression);
}

/** Le son réduit à ce que le moteur accepte : mono, seize kilohertz, en octets de WAV. */
async function wavMono16k(audio: AudioBuffer): Promise<Uint8Array> {
  const mono = await resamplerVers16k(mixdownMono(audio), audio.sampleRate, "");
  const seize = new AudioBuffer({ numberOfChannels: 1, length: mono.length, sampleRate: 16000 });
  seize.copyToChannel(new Float32Array(mono), 0);
  const { bufferVersWavBlob } = await import("../audio/io");
  return new Uint8Array(await bufferVersWavBlob(seize).arrayBuffer());
}

export const fiches = ([
  {
    id: "qui-parle-quand", nom: "Qui parle quand", nomEn: "Who speaks when",
    univers: "Traitement", famille: "Montage",
    resume: "Découpe un enregistrement en tours de parole, dit qui parle et ce qui est dit, et isole un locuteur.",
    resumeEn: "Splits a recording into speaker turns, says who speaks and what is said, and isolates one speaker.",
    notice: "Ce composant découpe un enregistrement en tours de parole. Pour chaque tour il donne l'intervalle, "
      + "le locuteur et le texte prononcé, et il rend le son réduit au locuteur demandé.\n\n"
      + "« Locuteur » choisit qui garder. À « Tous », le son ressort tel quel et seules les sorties de texte "
      + "renseignent. Les locuteurs sont numérotés dans l'ordre où ils prennent la parole ; ces numéros tiennent "
      + "d'un bout à l'autre du fichier, et non d'un fichier au suivant.\n\n"
      + "« Montage » décide de la place de ce qui est gardé. À « Garder la place », la sortie fait la longueur de "
      + "l'entrée et tout le reste est tu : les instants ne bougent pas, ce qui permet de remettre le résultat "
      + "contre l'original. À « Coller bout à bout », les tours sont mis à la suite et la sortie raccourcit.\n\n"
      + "« Fondu » adoucit les deux bords de chaque tour gardé. Les bornes que le moteur donne tombent à quelques "
      + "dixièmes de seconde près, et un fondu court évite qu'une coupe s'entende comme un clic.\n\n"
      + "Le moteur lit la langue de lui-même, sur plus de cinquante. Il n'y a donc pas de réglage de langue, et "
      + "un enregistrement qui change de langue en cours de route est transcrit tel qu'il est dit.\n\n"
      + "« Calcul » nomme le périphérique employé.\n\n"
      + "La sortie « Audio » rend le son gardé. « Tours » donne une ligne par tour, avec son intervalle, son "
      + "locuteur et son texte. « Transcription » donne le texte seul, dans l'ordre. « Rapport » donne le nombre "
      + "de tours, le nombre de locuteurs trouvés et la part de la durée que le locuteur retenu occupe.",
    noticeEn: "This component splits a recording into speaker turns. For each turn it gives the interval, the "
      + "speaker and the spoken text, and it returns the sound reduced to the requested speaker.\n\n"
      + "« Speaker » chooses who to keep. At « All », the sound comes out unchanged and only the text outputs "
      + "inform. Speakers are numbered in the order they start speaking; those numbers hold from one end of the "
      + "file to the other, and not from one file to the next.\n\n"
      + "« Editing » decides where what is kept sits. At « Keep the place », the output is as long as the input "
      + "and all the rest is silenced: the instants do not move, which allows the result to be set against the "
      + "original. At « Join end to end », the turns are placed one after another and the output shortens.\n\n"
      + "« Fade » softens both edges of each kept turn. The bounds the engine gives land within a few tenths of "
      + "a second, and a short fade keeps a cut from sounding like a click.\n\n"
      + "The engine reads the language by itself, across more than fifty. There is therefore no language "
      + "setting, and a recording that changes language along the way is transcribed as it is spoken.\n\n"
      + "« Compute » names the device used.\n\n"
      + "The « Audio » output returns the kept sound. « Turns » gives one line per turn, with its interval, its "
      + "speaker and its text. « Transcript » gives the text alone, in order. « Report » gives the number of "
      + "turns, the number of speakers found and the share of the duration the chosen speaker occupies.",
    entrees: [
      { nom: "Audio", nomEn: "Audio", type: "audio" },
    ],
    sorties: [
      { nom: "Audio", nomEn: "Audio", type: "audio" },
      { nom: "Tours", nomEn: "Turns", type: "texte" },
      { nom: "Transcription", nomEn: "Transcript", type: "texte" },
      { nom: "Rapport", nomEn: "Report", type: "texte" },
    ],
    parametres: [
      { nom: "Locuteur", nomEn: "Speaker", type: "choix",
        options: LOCUTEURS.map((l) => l.fr), optionsEn: LOCUTEURS.map((l) => l.en),
        optionIds: LOCUTEURS.map((l) => l.id), defaut: "Tous", defautEn: "All",
        doc: "Le locuteur à garder dans le son rendu, par son ordre d'apparition. À « Tous », le son ressort tel quel et seuls les textes renseignent. Un rang que l'enregistrement ne contient pas rend un son tu, et le rapport le dit.",
        docEn: "The speaker to keep in the returned sound, by order of appearance. At « All », the sound comes out unchanged and only the texts inform. A rank the recording does not contain returns a silent sound, and the report says so." },
      { nom: "Montage", nomEn: "Editing", type: "choix",
        options: MONTAGES.map((m) => m.fr), optionsEn: MONTAGES.map((m) => m.en),
        optionIds: MONTAGES.map((m) => m.id), defaut: "Garder la place", defautEn: "Keep the place",
        doc: "Où placer ce qui est gardé. « Garder la place » tait le reste sans rien déplacer, de sorte que le résultat se superpose à l'original. « Coller bout à bout » met les tours à la suite, ce qui raccourcit la sortie d'autant. Sans effet quand « Locuteur » vaut « Tous », puisque le son ressort alors entier et qu'il n'y a rien à retirer.",
        docEn: "Where to place what is kept. « Keep the place » silences the rest without moving anything, so that the result overlays the original. « Join end to end » puts the turns one after another, which shortens the output accordingly. Without effect when « Speaker » is « All », since the sound then comes out whole and there is nothing to remove." },
      { nom: "Fondu", nomEn: "Fade", type: "nombre", plage: [0, 200], pas: 1, defaut: 10, unite: "ms",
        doc: "La durée du fondu aux deux bords de chaque tour gardé. À zéro, la coupe est franche et peut claquer. Un fondu plus long que la moitié d'un tour est ramené à cette moitié. Sans effet quand « Locuteur » vaut « Tous », puisqu'aucune coupe n'est faite.",
        docEn: "The fade length at both edges of each kept turn. At zero, the cut is abrupt and may click. A fade longer than half a turn is brought back to that half. Without effect when « Speaker » is « All », since no cut is made." },
      parametreCalcul(
        "Il change le temps de calcul et non les tours trouvés.",
        "It changes the compute time and not the turns found."),
    ],
    async executer(ctx) {
      const pont = api();
      if (!pont?.paroleDiariser) {
        return { valeurs: [null, null, null, null], erreur: true, message: traduire("msg.n_cessite_electron") };
      }
      const audio = entreeAudio(ctx, 0, { sorties: 4 });
      if (sansEntree(audio)) return audio;

      await annoncerModele(ctx, "qui-parle-quand", traduire("progress.parole.modele_diarisation"));
      const wav = await wavMono16k(audio);

      const debrancher = suivre(ctx);
      let r: { ok: boolean; tours?: Tour[]; journal?: string };
      try {
        r = await pont.paroleDiariser({
          audio: wav,
          calcul: ctx.paramTexte("Calcul", "").trim(),
        }) as typeof r;
      } catch (erreur) {
        return { valeurs: [null, null, null, null], erreur: true, message: messageEchecPont(erreur, CANAL) };
      } finally {
        debrancher();
      }
      if (!r.ok) {
        return { valeurs: [null, null, null, null], erreur: true, message: (r.journal ?? "").slice(-240) };
      }

      const tours = r.tours ?? [];
      const noms = locuteursDe(tours);
      const rang = ctx.paramTexte("Locuteur", "");
      const vise = rang === "" ? null : noms[Number(rang) - 1];

      // À « TOUS », LE SON RESSORT TEL QUEL. Le garder entier dit la vérité : aucun locuteur n'a été
      // retiré. Le réduire aux tours trouvés retirerait les silences, ce que personne n'a demandé.
      const retenus = vise === undefined ? [] : tours.filter((t) => vise === null || t.locuteur === vise);
      const sortie = vise === null ? audio : garderIntervalles(audio, retenus, {
        fonduMs: ctx.paramNombre("Fondu", 10),
        coller: ctx.paramTexte("Montage", "place") === "coller",
      });

      const duree = audio.length / audio.sampleRate;
      const parle = retenus.reduce((s, t) => s + Math.max(0, t.fin - t.debut), 0);
      const part = duree > 0 ? (parle / duree) * 100 : 0;
      const rapport = [
        traduire("msg.parole.tours", String(tours.length)),
        traduire("msg.parole.locuteurs", String(noms.length)),
        vise === null
          ? traduire("msg.parole.tous_gardes")
          : vise === undefined
            ? traduire("msg.parole.rang_absent", rang)
            : traduire("msg.parole.part", vise, part.toFixed(1)),
      ].join("\n");

      return {
        valeurs: [sortie, formaterTours(tours), tours.map((t) => t.texte).filter(Boolean).join("\n"), rapport],
        message: `${tours.length} · ${noms.length} · ${part.toFixed(0)} %`,
      };
    },
  },
] as FicheAudio[]).map(avecDoc);
