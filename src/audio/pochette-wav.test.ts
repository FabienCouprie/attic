// audio/pochette-wav.test.ts — La pochette relue dans le WAV écrit, par un lecteur qui ne doit rien à l'écrivain.
//
// LE LECTEUR EST `audio/lecteur-pochette-essai.ts`, ÉCRIT D'APRÈS LES NORMES RIFF ET ID3v2, et il
// n'importe rien de `metadonnees.ts` ni de `pochette.ts` : un lecteur qui réemploierait le code de
// l'écrivain relirait ses fautes sans les voir. Aucun analyseur tiers n'est installé dans le dépôt.
//
// L'ÉCRITURE PASSE PAR LE CHEMIN RÉEL DE « SORTIE AUDIO » : `APERCU_AUDIO.blobApercu`, avec le nom
// pour les métadonnées et le canal d'affichage que le shell lui transmet. Le seul autre chemin, le
// multicanal refait par la vue d'export, passe par `bufferVersWavBlob` avec la même option. Le nœud
// n'écrit pas d'autre format que le WAV, aux trois profondeurs de la barre d'outils.
//
// LE FICHIER SANS POCHETTE EST CELUI D'AVANT, et l'empreinte qui le dit a été relevée sur `master`
// (7a2d75f1) le 2026-11-16 : sept fichiers écrits par le code d'avant et par celui-ci, identiques au
// `cmp` près. L'empreinte ci-dessous ne lit pas le numéro de version d'Attic, que l'iXML porte en
// clair : elle changerait à chaque version sans que le fichier ait changé de forme.
import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { bufferVersWavBlob, type ProfondeurExport } from "./io";
import { blocsRiff, pochetteDuWav } from "./lecteur-pochette-essai";
import { decrire, VERSION_ATTIC } from "./metadonnees";
import { pngDEssai } from "./png-essai";
import { APERCU_AUDIO } from "../plugins/apercu-domaine";

const octetsDe = async (blob: Blob) => new Uint8Array(await blob.arrayBuffer());
const pochetteRelue = async (blob: Blob) => pochetteDuWav(await octetsDe(blob));
const memes = (a: Uint8Array, b: Uint8Array) => Buffer.from(a).equals(Buffer.from(b));

/** L'empreinte d'un WAV, le numéro de version d'Attic retiré de son iXML. */
async function empreinteSansVersion(blob: Blob): Promise<string> {
  const o = await octetsDe(blob);
  const h = createHash("sha256");
  h.update(String.fromCharCode(...o.subarray(8, 12)));
  for (const b of blocsRiff(o)) {
    let contenu = o.subarray(b.debut, b.debut + b.taille);
    if (b.id === "iXML") {
      const texte = new TextDecoder().decode(contenu).split(`Attic ${VERSION_ATTIC}`).join("Attic *");
      contenu = new TextEncoder().encode(texte);
    }
    const taille = new Uint8Array(4);
    new DataView(taille.buffer).setUint32(0, contenu.length, true);
    h.update(b.id); h.update(taille); h.update(contenu);
  }
  return h.digest("hex");
}

/** Le tampon de la sonde du 2026-11-16 : un sinus par canal, 220 Hz plus 110 Hz par rang. */
function tampon(canaux: number, longueur: number, frequence: number): AudioBuffer {
  const b = new AudioBuffer({ numberOfChannels: canaux, length: longueur, sampleRate: frequence });
  for (let c = 0; c < canaux; c++) {
    const d = b.getChannelData(c);
    for (let i = 0; i < longueur; i++) d[i] = 0.4 * Math.sin((2 * Math.PI * (220 + 110 * c) * i) / frequence);
  }
  return b;
}

/** Un JPEG pour le conteneur : sa signature, un segment JFIF, `n` octets de contenu, la fin d'image. */
function jpegDEssai(n = 301): Uint8Array {
  const corps = Array.from({ length: n }, (_, i) => (i * 37 + 11) & 0xff);
  return new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, ...corps, 0xff, 0xd9]);
}

const souffle = { tour: async () => false };
/** L'aperçu tel que le shell le demande ; `livre` dit si le nœud livre son aperçu comme fichier. */
const ecrireApercu = (b: AudioBuffer, bits: ProfondeurExport, affichage?: Record<string, unknown>, livre = true) =>
  APERCU_AUDIO.blobApercu(b, {
    securiser: false, bits, souffle,
    ...(livre ? { nomPourMetadonnees: "Sortie audio" } : {}),
    ...(affichage ? { affichage } : {}),
  }) as Promise<Blob>;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 10, 16, 12, 34, 56));
});
afterEach(() => { vi.useRealTimers(); });

const PNG = pngDEssai();
const JPEG = jpegDEssai();
const IMAGES = [
  { nom: "PNG", mime: "image/png", octets: PNG },
  { nom: "JPEG", mime: "image/jpeg", octets: JPEG },
] as const;

describe("le WAV de « Sortie audio » porte sa pochette, relue hors de l'écrivain", () => {
  for (const bits of [16, 24, 32] as ProfondeurExport[]) {
    for (const image of IMAGES) {
      it(`${bits} BITS, ${image.nom} : les octets et le type relus sont ceux de l'image reçue`, async () => {
        const pochette = { mime: image.mime, octets: image.octets };
        const { blocs, apic } = await pochetteRelue(await ecrireApercu(tampon(2, 12000, 48000), bits, { pochette }));
        expect(blocs.slice(-3), "le bloc id3 vient après les données et l'iXML").toEqual(["data", "iXML", "id3 "]);
        expect(apic).toBeDefined();
        expect(apic!.version).toBe(4);
        expect(apic!.mime).toBe(image.mime);
        expect(apic!.typeImage, "couverture, recto").toBe(3);
        expect(apic!.description).toBe("");
        expect(memes(apic!.image, image.octets), "octet pour octet").toBe(true);
      });
    }
  }

  it("UN BLOC id3 DE TAILLE IMPAIRE EST BOURRÉ, et l'image d'un octet de plus se relit aussi juste", async () => {
    // La parité du bloc dépend de l'image, de son type MIME et de la version d'Attic que l'étiquette
    // porte : deux images qui diffèrent d'un octet donnent les deux parités quelle que soit la version.
    const parites = new Set<number>();
    for (const octets of [jpegDEssai(301), jpegDEssai(302)]) {
      const o = await octetsDe(await ecrireApercu(tampon(2, 2000, 48000), 16, { pochette: { mime: "image/jpeg", octets } }));
      parites.add(blocsRiff(o).find((b) => b.id === "id3 ")!.taille % 2);
      expect(memes(pochetteDuWav(o).apic!.image, octets)).toBe(true);
    }
    expect(parites).toEqual(new Set([0, 1]));
  });

  it("UN MONO DE LONGUEUR IMPAIRE EN 24 BITS : données bourrées, puis iXML et pochette encore trouvés", async () => {
    const { blocs, apic } = await pochetteRelue(await ecrireApercu(tampon(1, 4801, 44100), 24, { pochette: { mime: "image/jpeg", octets: JPEG } }));
    expect(blocs).toContain("iXML");
    expect(memes(apic!.image, JPEG)).toBe(true);
  });

  it("LE MULTICANAL REFAIT PAR LA VUE D'EXPORT porte la même pochette", async () => {
    const six = tampon(6, 3000, 48000);
    const blob = bufferVersWavBlob(six, undefined, false, {
      bits: 24, ixml: decrire(six, { noeud: "Sortie audio" }, 24).ixml, pochette: { mime: "image/png", octets: PNG } });
    const { apic } = await pochetteRelue(blob);
    expect(apic!.mime).toBe("image/png");
    expect(memes(apic!.image, PNG)).toBe(true);
  });

  it("UN APERÇU INTERMÉDIAIRE NE LA PORTE PAS, même si on la lui donne : il n'est jamais livré", async () => {
    const { blocs } = await pochetteRelue(await ecrireApercu(tampon(2, 2000, 48000), 16, { pochette: { mime: "image/png", octets: PNG } }, false));
    expect(blocs).not.toContain("id3 ");
  });

  it("UN AFFICHAGE SANS POCHETTE, ou une pochette mal formée, n'écrit aucun bloc id3", async () => {
    for (const affichage of [{ mp3Url: "blob:x" }, { pochette: { mime: "image/gif", octets: PNG } }, { pochette: { mime: "image/png" } }]) {
      const { blocs } = await pochetteRelue(await ecrireApercu(tampon(2, 2000, 48000), 16, affichage));
      expect(blocs, JSON.stringify(affichage)).not.toContain("id3 ");
    }
  });
});

describe("sans pochette, le fichier est celui d'avant, octet pour octet", () => {
  // Relevées sur les fichiers que `master` (7a2d75f1) écrit pour ces mêmes cas, à la même heure fixée.
  const EMPREINTES: Record<string, string> = {
    "apercu-stereo-16": "f5f99b6b49fe7c3dba6e3cd7d45b6fd21439ec9221a1f489d8995d491a0054d5",
    "apercu-stereo-24": "bc4423d04c482454c5ed7098efa43420ad1faaab4e5b45870f1794f909eb7c92",
    "apercu-stereo-32": "f710c08d0c7af391394d5b12e08d82847be9932c3d361c92360653b35aa04ab0",
    "apercu-mono-impair-16": "8a14fa446d9708045ce14ec14685bce03504a54f925563807354d307f2ca3379",
    "apercu-mono-impair-24": "03829041fa3b3f62a47e6f7c97c54b6577ce684d4f2f8fb5429ba7b866be4ab6",
    "apercu-mono-impair-32": "a16001d207e5f638c2f6526252f34135e13a14e2661641dbd90a0669f5a98c9d",
    "multicanal-6-24": "f106cbe39917b7dff5fb1cff30a2bfb5caff207498fa2a2eab82b4611b94730c",
  };

  it("LES SEPT EMPREINTES RELEVÉES SUR MASTER SONT RETROUVÉES", async () => {
    const vues: Record<string, string> = {};
    for (const [nom, b] of [["stereo", tampon(2, 12000, 48000)], ["mono-impair", tampon(1, 4801, 44100)]] as const) {
      for (const bits of [16, 24, 32] as ProfondeurExport[]) vues[`apercu-${nom}-${bits}`] = await empreinteSansVersion(await ecrireApercu(b, bits));
    }
    const six = tampon(6, 3000, 48000);
    vues["multicanal-6-24"] = await empreinteSansVersion(
      bufferVersWavBlob(six, undefined, false, { bits: 24, ixml: decrire(six, { noeud: "Sortie audio" }, 24).ixml }));
    expect(vues).toEqual(EMPREINTES);
  });
});
