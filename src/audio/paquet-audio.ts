// audio/paquet-audio.ts — Un tampon audio décrit pour un paquet `.attic`, et refait à la relecture.
//
// CE QUE LE DOMAINE RÉPOND À `versPaquet` ET `depuisPaquet` de `core/services-domaine.ts`. Le shell
// écrit le cache d'un projet dans un paquet, et il ne sait pas ce qu'est un tampon : il demande au
// domaine une forme faite d'objets simples et de tableaux typés, qu'il sait écrire, et la lui rend à
// la relecture.
//
// SANS PERTE, ET C'EST LA DIFFÉRENCE AVEC `versTransport`. Le transport vers un cadre isolé ne porte
// que les canaux et la fréquence. Un tampon porte aussi, hors de lui, deux étiquettes que des tables
// faibles tiennent : sa DISPOSITION (« 7.1.4 », « ambisonie d'ordre 2 », `audio/multicanal.ts`) et
// l'HEURE de son premier échantillon (`audio/depart-bwf.ts`). Un tampon relu sans elles serait le même
// son, mais l'export multicanal ne saurait plus quel canal est le centre, et un BWF perdrait son heure.
//
// LES CANAUX SONT RENDUS EN VUES, et non en copies : le paquet les copie aussitôt dans ses propres
// octets, pendant que le tampon est encore tenu par le cache qu'on écrit. Les copier ici doublerait
// la mémoire de l'export pour rien.
import { departDe, poserDepart } from "./depart-bwf";
import { dispositionDe, etiqueter } from "./multicanal";

const estTampon = (v: unknown): v is AudioBuffer => typeof AudioBuffer !== "undefined" && v instanceof AudioBuffer;

/** La forme d'un tampon dans un paquet, ou `null` pour ce qui n'est pas un tampon. */
export function versPaquetAudio(valeur: unknown): Record<string, unknown> | null {
  if (!estTampon(valeur)) return null;
  const canaux: Float32Array[] = [];
  for (let c = 0; c < valeur.numberOfChannels; c++) canaux.push(valeur.getChannelData(c));
  const forme: Record<string, unknown> = { genre: "AudioBuffer", frequence: valeur.sampleRate, longueur: valeur.length, canaux };
  const disposition = dispositionDe(valeur)?.id;
  if (disposition) forme.disposition = disposition;
  const depart = departDe(valeur);
  if (depart !== undefined) forme.depart = depart;
  return forme;
}

/** Le tampon que décrit une forme, ou `null` quand la forme n'en est pas une. */
export function depuisPaquetAudio(forme: Record<string, unknown>): unknown {
  if (forme.genre !== "AudioBuffer" || typeof AudioBuffer === "undefined") return null;
  const { frequence, longueur, canaux } = forme;
  if (typeof frequence !== "number" || typeof longueur !== "number" || !Array.isArray(canaux) || canaux.length === 0) return null;
  if (!canaux.every((c) => c instanceof Float32Array && c.length === longueur)) return null;
  const tampon = new AudioBuffer({ numberOfChannels: canaux.length, length: longueur, sampleRate: frequence });
  canaux.forEach((c: Float32Array, i) => tampon.copyToChannel(c as Float32Array<ArrayBuffer>, i));
  if (typeof forme.disposition === "string") etiqueter(tampon, forme.disposition);
  if (typeof forme.depart === "number") poserDepart(tampon, forme.depart);
  return tampon;
}
