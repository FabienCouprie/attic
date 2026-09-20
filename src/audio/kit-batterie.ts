// audio/kit-batterie.ts — Le kit de batterie livré AVEC Attic.
//
// POURQUOI UN KIT EMBARQUÉ. Un arrangement à quatre instruments a besoin d'une banque de percussions,
// et il ne peut pas être demandé d'aller en télécharger une : Attic doit marcher sans réseau, comme
// le SF2 par défaut et les modèles ONNX du mode embarqué. Le kit part donc dans l'installeur.
//
// POURQUOI IL EST SYNTHÉTISÉ ET NON ENREGISTRÉ. Attic sait déjà faire ces huit sons : ce sont ceux du
// « Séquenceur de batterie avancé », synthétisés au vol dans `batterie.ts` — recettes de boîte à
// rythmes, oscillateurs et rafales de bruit filtrées. Les rendre en fichiers coûte quelques centaines
// de kilo-octets, contre des mégaoctets pour des échantillons, et surtout : ils sont à NOUS. Aucune
// licence à déclarer dans `THIRD_PARTY.md`, aucune redistribution à négocier, et le kit reste
// reproductible — la graine de ses rafales de bruit est fixe, le même code rend le même fichier.
//
// LES NOTES SONT CELLES DU GENERAL MIDI, et ce n'est pas un détail : c'est ce qui fait qu'un fichier
// MIDI trouvé n'importe où, dont le canal 10 suit la convention, joue juste — 36 la grosse caisse,
// 38 la caisse claire, 42 le charley fermé. Choisir d'autres numéros aurait obligé à transposer
// chaque fichier à la main. Elles sont DÉCLARÉES UNE FOIS, dans `batterie-midi.ts`, d'où les
// séquenceurs les tirent aussi pour écrire leur MIDI : les deux ne peuvent donc pas dériver.
import { bufferVersWavBlob } from "./io";
import { NOTES_PERCUSSION_GM } from "./batterie-midi";
import { rendreSequenceurBatterieAvance } from "./batterie";

/** Où le kit est posé, en chemin RELATIF — le seul que le main sache résoudre des deux côtés. */
export const DOSSIER_KIT_EMBARQUE = "./sfz/kit-attic";
/** Le fichier SFZ du kit embarqué. */
export const CHEMIN_KIT_EMBARQUE = `${DOSSIER_KIT_EMBARQUE}/kit-attic.sfz`;

export interface VoixKit {
  /** Nom du fichier WAV, à côté du .sfz. */
  fichier: string;
  /** Note du General MIDI. */
  note: number;
  /** Rangée de la grille du séquenceur avancé : c'est elle qui décide du son rendu. */
  piste: number;
  nom: string;
  nomEn: string;
  /** Durée utile attendue, en secondes — sert de plafond au rognage. */
  duree: number;
}

/**
 * Les huit voix du kit, dans l'ordre des rangées du séquenceur avancé.
 *
 * Les numéros de notes suivent le General MIDI. Le charley ouvert (46) et le clap (39) ne sont pas
 * contigus à leurs voisins : c'est la norme qui en décide, pas nous.
 */
export const VOIX_KIT: readonly VoixKit[] = [
  { fichier: "grosse-caisse.wav", note: NOTES_PERCUSSION_GM[0], piste: 0, nom: "Grosse caisse", nomEn: "Kick", duree: 0.5 },
  { fichier: "caisse-claire.wav", note: NOTES_PERCUSSION_GM[1], piste: 1, nom: "Caisse claire", nomEn: "Snare", duree: 0.4 },
  { fichier: "charley-ferme.wav", note: NOTES_PERCUSSION_GM[2], piste: 2, nom: "Charley fermé", nomEn: "Closed hi-hat", duree: 0.2 },
  { fichier: "charley-ouvert.wav", note: NOTES_PERCUSSION_GM[3], piste: 3, nom: "Charley ouvert", nomEn: "Open hi-hat", duree: 0.5 },
  { fichier: "clap.wav", note: NOTES_PERCUSSION_GM[4], piste: 4, nom: "Clap", nomEn: "Clap", duree: 0.3 },
  { fichier: "crash.wav", note: NOTES_PERCUSSION_GM[5], piste: 5, nom: "Crash", nomEn: "Crash", duree: 1.2 },
  { fichier: "tom-grave.wav", note: NOTES_PERCUSSION_GM[6], piste: 6, nom: "Tom grave", nomEn: "Low tom", duree: 0.5 },
  { fichier: "tom-aigu.wav", note: NOTES_PERCUSSION_GM[7], piste: 7, nom: "Tom aigu", nomEn: "High tom", duree: 0.5 },
];

/**
 * Le texte SFZ du kit.
 *
 * `pitch_keytrack=0` est l'opcode qui dit tout : l'échantillon sort tel qu'il est enregistré, quelle
 * que soit la touche. Sans lui, un lecteur qui verrait des régions d'une seule touche pourrait encore
 * les transposer — et surtout, tout autre échantillonneur que le nôtre a besoin de le lire.
 */
export function sfzDuKit(o: { relachement?: number } = {}): string {
  const relachement = o.relachement ?? 0.05;
  const lignes: string[] = [
    "// Kit de batterie d'Attic — synthétisé par Attic lui-même, aucun échantillon tiers.",
    `// ${VOIX_KIT.length} sons aux notes du General MIDI. Regénéré par « npm run kit:generer ».`,
    "",
    "<global>",
    `ampeg_release=${relachement.toFixed(3)}`,
    // Une touche est un SON : le lecteur ne doit ni transposer, ni chercher « la plus proche ».
    "pitch_keytrack=0",
    "loop_mode=one_shot",
    "",
  ];
  for (const v of VOIX_KIT) {
    lignes.push("<region>");
    lignes.push(`sample=${v.fichier}`);
    lignes.push(`key=${v.note} // ${v.nom}`);
    lignes.push("");
  }
  return lignes.join("\n");
}

/** Où s'arrête vraiment un son : le dernier échantillon au-dessus d'un millième de la crête. */
export function finUtile(audio: AudioBuffer, seuilRelatif = 0.001): number {
  let crete = 0;
  for (let c = 0; c < audio.numberOfChannels; c++) {
    const d = audio.getChannelData(c);
    for (let i = 0; i < d.length; i++) crete = Math.max(crete, Math.abs(d[i]));
  }
  if (crete === 0) return 0;
  const seuil = crete * seuilRelatif;
  let fin = 0;
  for (let c = 0; c < audio.numberOfChannels; c++) {
    const d = audio.getChannelData(c);
    for (let i = d.length - 1; i > fin; i--) {
      if (Math.abs(d[i]) > seuil) { fin = i; break; }
    }
  }
  return fin + 1;
}

/** Coupe un son à sa longueur utile, avec un fondu court pour ne pas laisser de clic. */
export function rogner(audio: AudioBuffer, longueur: number, fonduSec = 0.005): AudioBuffer {
  const n = Math.max(1, Math.min(audio.length, Math.round(longueur)));
  const sortie = new AudioBuffer({
    numberOfChannels: audio.numberOfChannels, length: n, sampleRate: audio.sampleRate,
  });
  const f = Math.min(Math.round(fonduSec * audio.sampleRate), n);
  for (let c = 0; c < audio.numberOfChannels; c++) {
    const src = audio.getChannelData(c), dst = sortie.getChannelData(c);
    for (let i = 0; i < n; i++) dst[i] = src[i];
    for (let i = 0; i < f; i++) dst[n - f + i] *= 1 - i / f;
  }
  return sortie;
}

/**
 * Rend UNE voix du kit, seule.
 *
 * La grille du séquenceur avancé est remplie de zéros sauf une frappe à pleine vélocité sur la
 * rangée voulue, au premier pas. Le rendu fait une mesure entière ; on le rogne ensuite à la durée
 * utile du son, plafonnée par la durée déclarée — un crash décroît longtemps, un charley fermé non,
 * et livrer huit fichiers de deux secondes gonflerait l'installeur pour du silence.
 */
export async function rendreVoixKit(voix: VoixKit, graine = 42): Promise<AudioBuffer> {
  const NB_PAS = 16;
  const grille = Array.from({ length: VOIX_KIT.length }, () => new Array(NB_PAS).fill(0));
  grille[voix.piste][0] = 9;
  let etat = graine >>> 0;
  const hasard = () => {
    // Le même générateur que les nœuds à graine fixe : le kit doit être reproductible au bit près.
    etat = (etat * 1103515245 + 12345) & 0x7fffffff;
    return etat / 0x7fffffff;
  };
  const brut = await rendreSequenceurBatterieAvance(grille, 120, NB_PAS, 0, 1, 100, hasard);
  const plafond = Math.round(voix.duree * brut.sampleRate);
  return rogner(brut, Math.min(plafond, Math.max(1, finUtile(brut))));
}

/** Les octets WAV d'une voix, prêts à écrire. */
export async function wavDeVoix(voix: VoixKit, graine = 42): Promise<Uint8Array> {
  const audio = await rendreVoixKit(voix, graine);
  return new Uint8Array(await bufferVersWavBlob(audio).arrayBuffer());
}
