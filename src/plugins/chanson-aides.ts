// plugins/chanson-aides.ts — Ce que les six nœuds d'ACE-Step partagent : les langues, le
// périphérique, les réglages de rendu, les canaux et le passage d'un audio au processus principal.
//
// UN FICHIER D'AIDES ET NON UN IMPORT CROISÉ. `chanson-locale.ts` porte les deux nœuds de départ
// et `chanson-variantes.ts` les quatre autres ; si l'un tirait ces pièces de l'autre, le cycle
// d'imports laisserait un tableau de réglages à `undefined` au moment où une fiche l'étale, selon
// l'ordre d'évaluation des modules. Les pièces communes n'ont donc aucune dépendance sur les
// fiches, et les deux fichiers de fiches en dépendent tous les deux.
import { traduire } from "../i18n";
import { messageEchecPont } from "./pont-electron";

/**
 * Les dix langues que l'amont donne pour les mieux tenues.
 *
 * LE MOTEUR N'EN VALIDE AUCUNE : il recopie ce qu'on lui passe, `xx` et `klingon` compris. La
 * liste ne peut donc pas venir de lui, et elle ne vient pas non plus des cinquante et quelques
 * langues que le modèle annonce pour les paroles : dix sont données comme les mieux chantées, et
 * ce sont celles-là. Au-delà, le chant se dégrade sans que rien ne prévienne.
 */
export const LANGUES = ["fr", "en", "es", "de", "it", "pt", "ru", "ja", "ko", "zh"];

/**
 * Le réglage du périphérique, partagé par les six nœuds : même liste, même sens.
 *
 * UNE LISTE ET NON UN CHAMP LIBRE. Le contrat des réglages le dit : dès qu'on peut mettre une
 * glissière, une liste déroulante ou un sélecteur, il faut le faire, et le champ libre n'est
 * légitime que pour ce qui n'est pas une valeur. Les périphériques sont une poignée de noms que
 * le moteur reconnaît ; ils se choisissent, ils ne s'écrivent pas.
 */
const CALCULS = [
  { id: "", fr: "Automatique", en: "Automatic" },
  { id: "CPU", fr: "Processeur", en: "Processor" },
  { id: "Vulkan0", fr: "Vulkan 0", en: "Vulkan 0" },
  { id: "Vulkan1", fr: "Vulkan 1", en: "Vulkan 1" },
  { id: "CUDA0", fr: "CUDA 0", en: "CUDA 0" },
];

export const PARAMETRE_CALCUL = {
  nom: "Calcul", nomEn: "Compute", type: "choix" as const,
  options: CALCULS.map((c) => c.fr), optionsEn: CALCULS.map((c) => c.en),
  optionIds: CALCULS.map((c) => c.id),
  defaut: "Automatique", defautEn: "Automatic",
  doc: "Le périphérique de calcul. « Automatique » laisse le moteur prendre ce qu'il juge le meilleur, ce qui n'est pas toujours la carte graphique : une machine à deux cartes expose souvent le circuit intégré en premier, et les deux numéros sont là pour les départager. « Processeur » tourne partout, et bien plus lentement.",
  docEn: "The compute device. « Automatic » lets the engine take what it deems best, which is not always the graphics card: a machine with two cards often exposes the integrated one first, and the two numbers are there to tell them apart. « Processor » runs everywhere, and far more slowly.",
};

/**
 * Les réglages que tout rendu partage : le débruitage, le périphérique et le découpage du
 * décodage. Les quatre nœuds qui appellent le moteur de rendu les portent tous, et aucun ne les
 * recopie.
 */
export const PARAMETRES_RENDU = [
  { nom: "Pas de débruitage", nomEn: "Denoising steps", type: "nombre" as const, plage: [4, 50], pas: 1, defaut: 8,
    doc: "Nombre d'étapes de débruitage. Huit est la valeur du modèle rapide.",
    docEn: "Number of denoising steps. Eight is the fast model's value." },
  { nom: "Glissement", nomEn: "Shift", type: "nombre" as const, plage: [0.5, 6], pas: 0.5, defaut: 3,
    doc: "Déplace les instants auxquels le débruitage travaille.",
    docEn: "Moves the instants at which denoising works." },
  // LE SEUL RÉGLAGE DONT L'EFFET SUR LE SON EST NET, et il n'était offert que par un nœud sur six.
  // Le moteur lit `guidance_scale` et `acestep-plan.cjs` sait l'écrire depuis l'origine ; seul
  // « Accompagner une voix » le passait, de sorte que les cinq autres rendus tournaient sur le
  // défaut du moteur sans que personne puisse y toucher.
  //
  // MESURÉ SUR UN MÊME PLAN, MÊME GRAINE, dix secondes, sur une RTX 2060 :
  //
  //   non posé   −23,62 dB   centroïde 2 626 Hz   6,64 % de l'énergie au-dessus de 10 kHz
  //   3          −22,20 dB   centroïde 2 375 Hz   5,92 %
  //   7,5        −21,67 dB   centroïde 2 684 Hz   7,60 %
  //   15         −19,81 dB   centroïde 2 866 Hz   10,37 %
  //
  // La tendance est monotone de 3 à 15, là où le même banc sur « Pas de débruitage » ne donnait
  // que du bruit : 2 866, 3 007, 2 686 et 2 821 Hz pour 8, 16, 32 et 50 pas, soit quatre fois le
  // temps pour rien. C'est donc ici que se règle le son, et non là.
  //
  // ZÉRO NE POSE RIEN : le champ reste absent de la requête et le moteur décide seul. La même
  // convention que « Tempo » à zéro et « Graine » à moins un. Ce n'est plus le défaut, mais c'est
  // la valeur à poser pour retrouver le comportement d'avant ce réglage.
  //
  // LE DÉFAUT EST 7,5 SUR LES QUATRE RENDUS, par décision du propriétaire, et cela CHANGE LE SON
  // DES GRAPHES DÉJÀ ENREGISTRÉS : un projet écrit avant ce réglage ne porte pas la clé, donc il
  // retombe ici.
  //
  // CE QU'IL COÛTE AUX TROIS RENDUS QUI PARTENT D'UN AUDIO, mesuré sur une reprise de dix secondes
  // après que la décision a été prise, et qui mérite d'être relu avant de la reconduire :
  //
  //   sans guidage   corrélation à la source 0,2099   centroïde 4 995 Hz   15,96 % au-dessus de 10 kHz
  //   à 7,5          corrélation à la source 0,1408   centroïde 4 461 Hz   13,82 %
  //
  // DEUX CHOSES À EN TIRER. La reprise perd un tiers de sa ressemblance à ce qu'on lui demande de
  // reprendre, ce qui était la réserve posée. Et elle devient MOINS brillante, c'est-à-dire
  // l'inverse de ce que le guidage fait sur une génération sans source, où il monte l'aigu : le
  // raisonnement qui vaut pour « Rendre une chanson » ne se transporte donc pas tel quel ici.
  // Poser zéro sur ces trois composants rend le comportement d'avant.
  //
  // CE QUE LA MESURE NE DIT PAS : qu'un guidage haut sonne MIEUX. Elle dit qu'il monte le niveau et
  // l'aigu ; en diffusion, le prix habituel en est la saturation et les artefacts, et cela s'écoute.
  { nom: "Guidage", nomEn: "Guidance", type: "curseur" as const, plage: [0, 20], pas: 0.5, defaut: 7.5,
    doc: "Poids de la description du plan dans le rendu. À zéro, le champ n'est pas posé et le moteur décide seul. En montant, le rendu suit la description de plus près, et le risque d'artefacts croît avec elle. Sur un rendu qui part d'une entrée « Audio », monter le guidage éloigne aussi le résultat de cet audio.",
    docEn: "How much weight the plan's description carries in the render. At zero, the field is not set and the engine decides on its own. Higher up, the render follows the description more closely, and the risk of artefacts grows with it. On a render that starts from an « Audio » input, raising the guidance also moves the result away from that audio." },
  PARAMETRE_CALCUL,
  { nom: "Tuile du décodeur", nomEn: "Decoder tile", type: "nombre" as const, plage: [64, 1024], pas: 64, defaut: 256,
    unite: "trames", uniteEn: "frames",
    doc: "Trames latentes décodées d'un bloc, à vingt-cinq par seconde. La mémoire demandée suit cette taille, et non la durée du morceau.",
    docEn: "Latent frames decoded at once, at twenty-five per second. The memory required follows this size, not the piece's length." },
  { nom: "Recouvrement", nomEn: "Overlap", type: "nombre" as const, plage: [0, 128], pas: 8, defaut: 32,
    unite: "trames", uniteEn: "frames",
    doc: "Trames décodées en plus de part et d'autre de chaque tuile, et jetées ensuite. C'est ce qui empêche une jointure de s'entendre.",
    docEn: "Frames decoded on each side of every tile, then dropped. This is what keeps a seam from being heard." },
];

/** Les deux canaux du processus principal, nommes une fois : on les appelle et on les reconnait. */
export const CANAL_PLANIFIER = "acestep:planifier";
export const CANAL_RENDRE = "acestep:rendre";

export const api = () => (globalThis as unknown as { api?: Record<string, (...a: unknown[]) => Promise<unknown>> }).api;

/**
 * Un audio d'entrée en octets de WAV, ou néant si rien n'est branché.
 *
 * LE MOTEUR NE LIT QUE DES FICHIERS pour l'audio source et pour le timbre : la requête JSON ne
 * porte aucun des deux. Le processus principal les écrit sur disque, et c'est ici que la mémoire
 * du navigateur devient des octets transmissibles.
 */
export async function octetsWav(valeur: unknown): Promise<Uint8Array | undefined> {
  if (!(valeur instanceof AudioBuffer)) return undefined;
  const { bufferVersWavBlob } = await import("../audio/io");
  return new Uint8Array(await bufferVersWavBlob(valeur).arrayBuffer());
}

/** Branche l'avancement du moteur sur celui du nœud, et rend de quoi se débrancher. */
export function suivre(ctx: { onProgress?: (m: string) => void }) {
  const pont = api()?.acestepProgression as unknown as
    ((cb: (e: { phase: string; ligne: string }) => void) => () => void) | undefined;
  if (!pont) return () => { /* hors application : rien à suivre */ };
  return pont(({ ligne }) => ctx.onProgress?.(ligne));
}

/**
 * Le guidage à passer au moteur, ou rien.
 *
 * ZÉRO NE SE TRANSMET PAS, et c'est ce qui rend ce réglage sans effet sur les graphes déjà
 * enregistrés : `appliquerTache` n'écrit `guidance_scale` que sur un nombre fini, donc un champ
 * absent laisse le moteur décider, comme avant que ce réglage existe. Un zéro transmis serait au
 * contraire un guidage NUL, c'est-à-dire un rendu qui n'écoute plus du tout sa description.
 */
export function guidageDe(ctx: { paramNombre: (nom: string, repli: number) => number }) {
  const g = ctx.paramNombre("Guidage", 0);
  return Number.isFinite(g) && g > 0 ? { guidage: g } : {};
}

/** Les mêmes réglages de rendu, avec d'autres valeurs par défaut quand le modèle n'est pas le même. */
export function parametresRenduAvec(remplacements: Record<string, Record<string, unknown>>) {
  return PARAMETRES_RENDU.map((p) => (remplacements[p.nom] ? { ...p, ...remplacements[p.nom] } : p));
}

/**
 * Les trois entrées que tout rendu partant d'un audio existant partage.
 *
 * QUATRE FICHES LES PARTAGENT, et c'est ce qui a fait manquer le sous-type du plan au premier
 * passage : la déclaration ne vit dans aucun tableau `entrees`, elle est posée ici et reprise par
 * « Reprendre la chanson », « Retoucher la chanson », « Prolonger la chanson » et « Accompagner une
 * voix ». Le garde de `plugins/sous-types-texte.test.ts` lit le REGISTRE, pas la source : il les a
 * nommées toutes les quatre.
 */
export const ENTREES_SOURCE = [
  { nom: "Plan", nomEn: "Plan", type: "texte" as const, sousType: "plan" as const },
  { nom: "Audio", nomEn: "Audio", type: "audio" as const },
  { nom: "Timbre", nomEn: "Timbre", type: "audio" as const, requis: false },
];

export const SORTIE_AUDIO = [{ nom: "Audio", type: "audio" as const, sousType: "stereo" as const }];

/** Le paragraphe des réglages partagés, écrit une fois pour toutes les notices qui le portent. */
export const NOTICE_RENDU_FR =
  "« Pas de débruitage » décide du nombre d'étapes. Davantage allonge le calcul sans toujours "
  + "changer ce qu'on entend.\n\n"
  + "« Glissement » déplace les instants auxquels le débruitage travaille.\n\n"
  + "« Guidage » décide du poids que la description du plan porte dans le rendu. À zéro, le champ "
  + "n'est pas posé et le moteur décide seul. En montant, le rendu suit la description de plus "
  + "près, et le risque d'artefacts croît avec elle. Sur un rendu qui part d'une entrée « Audio », "
  + "monter le guidage éloigne aussi le résultat de cet audio.\n\n"
  + "« Calcul » nomme le périphérique employé.\n\n"
  + "« Tuile du décodeur » et « Recouvrement » décident du découpage du décodage audio. La mémoire "
  + "demandée suit la taille de la tuile, jamais la durée du morceau. Le recouvrement est ce qui "
  + "empêche une jointure de s'entendre.\n\n";

export const NOTICE_RENDU_EN =
  "« Denoising steps » decides the number of steps. More lengthens the computation without always "
  + "changing what is heard.\n\n"
  + "« Shift » moves the instants at which denoising works.\n\n"
  + "« Guidance » decides how much weight the plan's description carries in the render. At zero, "
  + "the field is not set and the engine decides on its own. Higher up, the render follows the "
  + "description more closely, and the risk of artefacts grows with it. On a render that starts "
  + "from an « Audio » input, raising the guidance also moves the result away from that audio.\n\n"
  + "« Compute » names the device used.\n\n"
  + "« Decoder tile » and « Overlap » decide how the audio decoding is cut up. The memory required "
  + "follows the tile size, never the piece's length. The overlap is what keeps a seam from being "
  + "heard.\n\n";

export const NOTICE_TIMBRE_FR =
  "L'entrée « Timbre » reçoit un audio dont la couleur sonore est reprise ; elle est facultative.\n\n";
export const NOTICE_TIMBRE_EN =
  "The « Timbre » input receives an audio whose tone colour is taken up; it is optional.\n\n";

export const SORTIE_NOTICE_FR = "La sortie « Audio » rend le son, en stéréo à quarante-huit kilohertz.";
export const SORTIE_NOTICE_EN = "The « Audio » output returns the sound, in stereo at forty-eight kilohertz.";

/**
 * Le rendu commun aux nœuds qui partent d'un audio existant.
 *
 * `supplements` reçoit l'audio d'entrée pour ce qui en dépend : le prolongement a besoin de sa
 * durée, que seul le rendu connaît.
 *
 * L'ANNONCE DU MODÈLE EST PASSÉE EN FONCTION, ET NON FAITE ICI. `message-modele.test.ts` apparie
 * le champ `noeuds` du manifeste aux annonces en balayant les sources pour `annoncerModele(ctx,
 * "…")` : un identifiant transmis par variable échapperait à ce balayage, et l'appariement se
 * romprait sans que rien ne le dise. L'identifiant reste donc écrit en clair dans chaque fiche, et
 * c'est ce qui le rend vérifiable. L'ordre, lui, reste ici : on n'annonce pas de téléchargement
 * avant d'avoir constaté qu'il y a de quoi travailler.
 */
export async function rendreSurAudio(
  ctx: any, annoncer: () => Promise<unknown>,
  supplements: (ctx: any, source: AudioBuffer) => Record<string, unknown>,
) {
  const pont = api();
  if (!pont?.acestepRendre) {
    return { valeurs: [null], erreur: true, message: traduire("msg.n_cessite_electron") };
  }
  const plan = ctx.entree(0);
  if (typeof plan !== "string" || plan.trim() === "") {
    return { valeurs: [null], erreur: true, message: traduire("msg.chanson.aucunPlan") };
  }
  const source = ctx.entree(1);
  if (!(source instanceof AudioBuffer)) {
    return { valeurs: [null], erreur: true, message: traduire("msg.aucune_entr_e_audio") };
  }

  await annoncer();
  const [audioSource, audioTimbre] = [await octetsWav(source), await octetsWav(ctx.entree(2))];
  const debrancher = suivre(ctx);
  try {
    let r: { ok: boolean; donnees?: Uint8Array; journal?: string };
    try {
      r = await pont.acestepRendre({
        plan, audioSource, audioTimbre,
        pas: ctx.paramNombre("Pas de débruitage", 8),
        shift: ctx.paramNombre("Glissement", 3),
        peripherique: ctx.paramTexte("Calcul", "").trim(),
        tuile: ctx.paramNombre("Tuile du décodeur", 256),
        recouvrement: ctx.paramNombre("Recouvrement", 32),
        ...guidageDe(ctx),
        ...supplements(ctx, source),
      }) as typeof r;
    } catch (erreur) {
      // Même cas que pour les deux premiers nœuds : le canal peut manquer au processus principal.
      return { valeurs: [null], erreur: true, message: messageEchecPont(erreur, CANAL_RENDRE) };
    }
    if (!r.ok || !r.donnees) {
      return { valeurs: [null], erreur: true, message: (r.journal ?? "").slice(-240) };
    }
    const { decoderBlob } = await import("../audio");
    const audio = await decoderBlob(new Blob([new Uint8Array(r.donnees)]), ctx.runtime);
    return {
      valeurs: [audio],
      message: traduire("msg.chanson.rendu",
        audio.duration.toFixed(1), String(audio.sampleRate), String(audio.numberOfChannels)),
    };
  } finally {
    debrancher();
  }
}
