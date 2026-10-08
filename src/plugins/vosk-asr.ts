// plugins/vosk-asr.ts — Nœud « Vosk » : reconnaissance vocale locale, par un portage WebAssembly
// de Vosk (Kaldi).
//
// POURQUOI UN TROISIÈME MOTEUR, et ce n'est pas un doublon. Attic en avait deux, tous deux Whisper :
// `whisper-en`, anglais seulement, 281 Mo ; `sherpa-asr`, un Whisper tiny multilingue, 99 Mo. Vosk
// apporte trois choses qu'aucun des deux ne fait.
//
//   LES MOTS SONT HORODATÉS UN À UN, avec leur confiance. Les deux autres rendent un bloc de texte,
//   et jettent ce qu'ils savent du temps. C'est cette sortie-là qui rend la parole exploitable en
//   musique, et elle est portée par la sortie « Mots » de ce nœud.
//
//   LE MODÈLE PÈSE QUARANTE MÉGAOCTETS par langue, contre 99 et 281. Sur une machine modeste, c'est
//   la différence entre un nœud qu'on lance et un nœud qu'on évite.
//
//   ET DEUX MOTEURS QUI SE TROMPENT DIFFÉREMMENT VALENT MIEUX QU'UN SEUL. Là où l'un bute, l'autre
//   peut passer ; le français en est l'exemple, le modèle livré ici lui étant dédié quand les deux
//   autres l'abordent par un modèle anglais ou par un tiny multilingue.
//
// DEUX PARTICULARITÉS DE LA BIBLIOTHÈQUE, dites ici parce qu'elles surprennent.
//
//   ELLE S'EXPOSE EN GLOBAL, et non en module. `vosk-browser` est un paquet UMD de 2022 : l'importer
//   ne rend aucun export, il POSE `globalThis.Vosk`. D'où la forme ci-dessous, qui importe pour
//   l'effet puis lit le global — vérifié, un `import { createModel }` rend `undefined`.
//
//   ELLE PORTE SON PROPRE WORKER. `createModel` en lance un et y tient le WebAssembly : le calcul
//   est donc déjà hors du fil principal, et ce fichier n'a pas de worker à lui. C'est la raison pour
//   laquelle il n'y a pas de `garde-worker` ici — il n'y a pas de worker à garder, et la
//   bibliothèque rend ses erreurs par son propre canal.
import type { FicheAudio } from "../audio/types-domaine";
import { traduire } from "../i18n";
import { avecDoc } from "./notices";
import { baseModeleLivre } from "./base-modeles";
import { annoncerModele } from "./message-modele";

/** Les modèles livrés, et le fichier de chacun sous `oonx/`. */
export const MODELES: Record<string, { fichier: string; id: string }> = {
  fr: { fichier: "vosk-model-small-fr-0.22.tar.gz", id: "vosk-fr" },
  en: { fichier: "vosk-model-small-en-us-0.15.tar.gz", id: "vosk-en" },
};

/** Vosk travaille à seize kilohertz, comme les deux autres moteurs. */
export const FREQUENCE_VOSK = 16000;

/** Un mot reconnu : son texte, ses deux instants en secondes, et la confiance du moteur. */
export interface MotVosk { word: string; start: number; end: number; conf: number }

/** Ce qu'un modèle Vosk rend : le texte, et les mots datés quand on les a demandés. */
export interface ResultatVosk { texte: string; mots: MotVosk[] }

type Reconnaisseur = {
  setWords(mots: boolean): void;
  acceptWaveformFloat(tampon: Float32Array, frequence: number): void;
  retrieveFinalResult(): void;
  remove(): void;
  on(evenement: string, ecouteur: (m: never) => void): void;
};
/** Un modèle chargé, tel que la bibliothèque le rend. Exporté : `parole-vers-sequence` en tient un. */
export type ModeleVosk = { KaldiRecognizer: new (frequence: number, grammaire?: string) => Reconnaisseur; terminate(): void };

/** Ce que la bibliothèque expose, par son module ou par son global selon la forme qu'elle prend. */
type ApiVosk = { createModel(url: string): Promise<ModeleVosk> };

/**
 * Les modèles déjà chargés, par fichier.
 *
 * UN MODÈLE COÛTE UNE SECONDE ET DEMIE À OUVRIR et tient son worker : le rouvrir à chaque exécution
 * rendrait le nœud inutilisable dans une boucle. Le cache est donc au niveau du module, comme pour
 * les autres nœuds à worker du dépôt.
 */
const modeles = new Map<string, Promise<ModeleVosk>>();

export async function chargerModele(fichier: string): Promise<ModeleVosk> {
  const dejaLa = modeles.get(fichier);
  if (dejaLa) return dejaLa;
  const promesse = (async () => {
    // LA BIBLIOTHÈQUE S'EXPOSE À DEUX ENDROITS SELON LA FORME SOUS LAQUELLE ELLE ARRIVE, et ne
    // lire que le premier rendait la dictée impossible dans l'application installée.
    //
    // `vosk-browser` est un paquet UMD. Son enveloppe choisit à l'exécution : s'il existe un
    // `exports` et un `module`, elle y pose l'API ; sinon elle pose `globalThis.Vosk`. Servi tel
    // quel par le serveur de développement — il est exclu de l'optimiseur de dépendances, et
    // `build-plugins.ts` dit pourquoi — aucun des deux n'existe, donc c'est le global qui est posé
    // et tout marchait. MAIS `optimizeDeps.exclude` NE VAUT QU'EN DÉVELOPPEMENT : une construction
    // de production l'empaquette, Rollup lui fournit un `exports` de synthèse, la première branche
    // est prise, et `globalThis.Vosk` n'est JAMAIS posé.
    //
    // Mesuré sur le bundle de production, bouton de dictée cliqué : « Dictée impossible :
    // vosk-browser n'a pas posé son global », et `typeof globalThis.Vosk` vaut `undefined`. Le
    // défaut était donc invisible au développement et certain dans l'exe — les quatre composants
    // Vosk le subissaient avec elle.
    //
    // On lit les deux, le module d'abord puisque c'est la forme que livre l'application.
    const module = await import("vosk-browser") as unknown as Partial<ApiVosk>;
    const global = (globalThis as unknown as { Vosk?: Partial<ApiVosk> }).Vosk;
    const api = typeof module?.createModel === "function" ? module : global;
    if (!api?.createModel) throw new Error("vosk-browser n'expose createModel ni par son module ni par son global");
    return api.createModel(`${baseModeleLivre("oonx")}/${fichier}`);
  })();
  modeles.set(fichier, promesse);
  // Un chargement raté ne doit pas rester en cache : la tentative suivante le reprendrait.
  promesse.catch(() => modeles.delete(fichier));
  return promesse;
}

/** Mixe en mono. */
export function versMono(buffer: AudioBuffer): Float32Array {
  const n = buffer.numberOfChannels;
  const mono = new Float32Array(buffer.length);
  for (let c = 0; c < n; c++) {
    const d = buffer.getChannelData(c);
    for (let i = 0; i < buffer.length; i++) mono[i] += d[i] / n;
  }
  return mono;
}

/** Rééchantillonne vers seize kilohertz par Web Audio, qui filtre au lieu de décimer. */
export async function vers16k(mono: Float32Array, frequence: number): Promise<Float32Array> {
  if (frequence === FREQUENCE_VOSK) return mono;
  const source = new AudioBuffer({ numberOfChannels: 1, length: mono.length, sampleRate: frequence });
  source.getChannelData(0).set(mono);
  const longueur = Math.max(1, Math.ceil((mono.length * FREQUENCE_VOSK) / frequence));
  const ctx = new OfflineAudioContext(1, longueur, FREQUENCE_VOSK);
  const n = ctx.createBufferSource();
  n.buffer = source;
  n.connect(ctx.destination);
  n.start();
  return (await ctx.startRendering()).getChannelData(0);
}

/**
 * Transcrit un signal déjà en seize kilohertz.
 *
 * LE SIGNAL EST DONNÉ PAR TRANCHES, et c'est ce que la bibliothèque attend : elle reconnaît au fil
 * de l'eau et rend des résultats partiels. Une tranche d'un quart de seconde laisse la boucle rendre
 * la main assez souvent pour que l'avancement s'affiche, sans multiplier les allers-retours.
 *
 * `grammaire` RESTREINT LE VOCABULAIRE quand elle est donnée : Vosk n'y reconnaît alors que les mots
 * de la liste, ce qui relève beaucoup la justesse sur un lexique fermé. Sans elle, le modèle entier.
 */
export async function transcrire(
  modele: ModeleVosk,
  mono: Float32Array,
  options: { grammaire?: string[]; surPartiel?: (texte: string) => void } = {},
): Promise<ResultatVosk> {
  const grammaire = options.grammaire && options.grammaire.length > 0
    ? JSON.stringify([...options.grammaire, "[unk]"])
    : undefined;
  const rec = new modele.KaldiRecognizer(FREQUENCE_VOSK, grammaire);
  rec.setWords(true);
  const mots: MotVosk[] = [];
  const morceaux: string[] = [];
  // ON ATTEND L'ÉVÉNEMENT, ET NON UN DÉLAI. Donner le signal ne coûte rien — mesuré, 33 ms pour
  // près de trois secondes de parole, puisque chaque tranche n'est qu'un message au worker ; c'est
  // la RECONNAISSANCE qui prend le temps, et elle arrive ensuite. Un premier jet attendait quatre
  // cents millisecondes après la demande de résultat final : rien n'était encore arrivé à ce
  // moment-là — le premier événement tombe vers huit cents millisecondes et le dernier vers deux
  // secondes huit —, et le nœud rendait un texte vide sans la moindre erreur.
  let dernierEvenement = 0;
  rec.on("result", (m: never) => {
    const r = (m as { result: { text?: string; result?: MotVosk[] } }).result;
    if (r.text) morceaux.push(r.text);
    if (r.result) mots.push(...r.result);
    dernierEvenement = Date.now();
  });
  rec.on("partialresult", (m: never) => {
    const p = (m as { result: { partial?: string } }).result.partial;
    dernierEvenement = Date.now();
    if (p && options.surPartiel) options.surPartiel(p);
  });
  const PAS = FREQUENCE_VOSK / 4;
  for (let i = 0; i < mono.length; i += PAS) {
    rec.acceptWaveformFloat(mono.slice(i, Math.min(i + PAS, mono.length)), FREQUENCE_VOSK);
    await new Promise((r) => setTimeout(r, 0));
  }
  rec.retrieveFinalResult();
  // ON ATTEND QUE LE MOTEUR SE TAISE, et non son premier résultat. Un enregistrement de plusieurs
  // phrases en rend plusieurs, et tous arrivent APRÈS la demande puisque l'alimentation est déjà
  // finie : rendre la main au premier tronquait la transcription à sa première phrase. Un cas de
  // `vosk-asr.test.ts` le tient, et c'est lui qui l'a trouvé.
  //
  // L'ÉCHÉANCE EST UN FILET, PAS LE CHEMIN ORDINAIRE : un signal sans aucune parole ne produit
  // jamais rien, et il faut bien rendre la main. Elle suit la durée du signal, la reconnaissance de
  // ce modèle allant plus vite que le temps réel.
  // DEUX TEMPS, ET LE PREMIER EST CELUI QU'ON OUBLIE. Le moteur met un moment à répondre — relevé,
  // huit cents millisecondes avant le premier événement : un repos compté depuis la demande serait
  // écoulé avant que rien ne soit arrivé, ce qui ramènerait exactement le défaut d'origine. On
  // attend donc d'abord QUELQUE CHOSE, puis le silence.
  // LE REPOS EST LE DOUBLE DU PLUS GRAND ÉCART MESURÉ, et c'est ce qui le rend sûr. Relevé sur deux
  // phrases séparées de deux secondes de silence : seize événements, dont six partiels VIDES — le
  // moteur parle pendant qu'il travaille, y compris sur du silence, et c'est ce qui rend le silence
  // significatif. Le plus grand écart entre deux événements consécutifs y vaut 439 ms, et 584 ms
  // séparent les deux résultats. Six cents millisecondes passaient de justesse ; une machine un peu
  // plus lente aurait tronqué la seconde phrase.
  const REPOS_MS = 1200;
  const limite = Math.max(5000, (mono.length / FREQUENCE_VOSK) * 1000 + 5000);
  const debut = Date.now();
  while (Date.now() - debut < limite) {
    if (dernierEvenement > 0 && Date.now() - dernierEvenement >= REPOS_MS) break;
    await new Promise((r) => setTimeout(r, 100));
  }
  rec.remove();
  return { texte: morceaux.join(" ").trim(), mots };
}

/** Le tableau des mots, tel que la sortie « Mots » le rend. */
export function tableauDesMots(mots: MotVosk[], en: boolean): string {
  if (mots.length === 0) return en ? "No word recognised." : "Aucun mot reconnu.";
  const lignes = [
    `${en ? "start" : "début"}      ${en ? "end" : "fin"}   ${en ? "conf." : "conf."}   ${en ? "word" : "mot"}`,
    ...mots.map((m) =>
      `${m.start.toFixed(2).padStart(6)}  ${m.end.toFixed(2).padStart(6)}  ${m.conf.toFixed(2).padStart(6)}   ${m.word}`),
  ];
  return lignes.join("\n");
}

export const fiches: FicheAudio[] = ([
  {
    id: "vosk-asr", nom: "Vosk (reconnaissance vocale)", nomEn: "Vosk (speech recognition)",
    univers: "Traitement", famille: "Analyse",
    resume: "Transcrit la parole, et rend chaque mot avec son instant et sa confiance.",
    resumeEn: "Transcribes speech, and returns each word with its instant and confidence.",
    entrees: [{ nom: "Audio", nomEn: "Audio", type: "audio" }],
    sorties: [
      { nom: "Texte", nomEn: "Text", type: "texte" },
      { nom: "Mots", nomEn: "Words", type: "texte" },
    ],
    parametres: [
      { nom: "Langue", nomEn: "Language", type: "choix",
        options: ["Français", "Anglais"], optionsEn: ["French", "English"],
        optionIds: ["fr", "en"], defaut: "Français", defautEn: "French",
        doc: "Le modèle employé. Chaque langue a le sien, dédié : un modèle français n'est pas un modèle multilingue réglé sur le français, et il le montre.",
        docEn: "The model used. Each language has its own, dedicated: a French model is not a multilingual model set to French, and it shows." },
      { nom: "Vocabulaire", nomEn: "Vocabulary", type: "texte", defaut: "", defautEn: "",
        placeholder: "do ré mi fa sol", placeholderEn: "do re mi fa sol",
        doc: "Liste de mots séparés par des espaces ou des virgules. Donnée, elle restreint ce que le moteur peut reconnaître à ces seuls mots, ce qui relève beaucoup la justesse sur un lexique fermé. Laissée vide, le vocabulaire entier du modèle est employé.",
        docEn: "Words separated by spaces or commas. When given, it restricts what the engine may recognise to those words alone, which greatly raises accuracy on a closed lexicon. Left empty, the model's whole vocabulary is used." },
    ],
    async executer(ctx: any) {
      const en = (await import("../i18n")).langueCourante() === "en";
      const audio = ctx.entree(0);
      if (!(audio instanceof AudioBuffer)) {
        return { valeurs: [null, null], message: traduire("msg.aucune_entr_e_audio") };
      }
      const langue = ctx.paramTexte("Langue", "fr");
      const choisi = MODELES[langue] ?? MODELES.fr;
      await annoncerModele(ctx, "vosk-asr", traduire("progress.vosk.chargement"));
      const modele = await chargerModele(choisi.fichier);
      const mono = await vers16k(versMono(audio), audio.sampleRate);
      const vocabulaire = String(ctx.paramTexte("Vocabulaire", ""))
        .split(/[\s,]+/).map((m: string) => m.trim().toLowerCase()).filter(Boolean);
      const { texte, mots } = await transcrire(modele, mono, {
        grammaire: vocabulaire,
        surPartiel: (p) => ctx.onProgress?.(p),
      });
      return {
        valeurs: [texte, tableauDesMots(mots, en)],
        message: traduire("msg.vosk.resume", String(mots.length), texte.slice(0, 60)),
      };
    },
  },
] as FicheAudio[]).map(avecDoc);
