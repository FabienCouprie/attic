// electron/parole.test.ts — Les deux pièges du pont de la parole, tenus par un cas chacun.
//
// LE PREMIER EST LA CADENCE DES INDICES. Les deux moteurs comptent leurs échantillons à seize
// kilohertz quoi qu'on leur donne, et les nombres employés ici sont ceux qu'ils ont RÉELLEMENT
// rendus le 2026-10-22, sur un témoin fabriqué exprès : une phrase de 4,880 s, deux secondes de
// silence, puis la même phrase. Le premier mot de la première copie et le premier mot de la
// seconde doivent donc être séparés de 6,880 s exactement, et c'est ce que le cas vérifie. Divisés
// par la cadence du fichier — 24 000 Hz — les mêmes nombres donneraient 4,587 s, et la découpe
// tomberait à côté sans que rien ne le signale.
//
// LE SECOND EST LA CADENCE EXIGÉE EN ENTRÉE. La diarisation refuse tout ce qui n'est pas du seize
// kilohertz, faute de SOXR dans le binaire publié. Le pont lit donc l'en-tête du WAV avant de
// lancer quoi que ce soit, et la lecture cherche la FORME — « RIFF », « WAVE », puis le morceau
// « fmt » où qu'il soit — et non une position fixe.
import { describe, expect, it } from "vitest";
import { createRequire } from "module";

const { cadenceWav, secondes, CADENCE_MOTEUR, CADENCE_EXIGEE } =
  createRequire(import.meta.url)("./parole.cjs") as {
    cadenceWav: (octets: Uint8Array) => number | null;
    secondes: (indice: number) => number;
    CADENCE_MOTEUR: number;
    CADENCE_EXIGEE: number;
  };

/** Un en-tête de WAV, avec la cadence demandée et éventuellement un morceau glissé avant `fmt `. */
function enTete(cadence: number, { morceauAvant = false } = {}): Uint8Array {
  const extra = morceauAvant ? 12 : 0;
  const b = Buffer.alloc(44 + extra);
  b.write("RIFF", 0, "ascii");
  b.writeUInt32LE(36 + extra, 4);
  b.write("WAVE", 8, "ascii");
  let p = 12;
  if (morceauAvant) {
    // UN MORCEAU INCONNU AVANT `fmt ` EST LÉGAL, et plus d'un encodeur en met un.
    b.write("LIST", p, "ascii");
    b.writeUInt32LE(4, p + 4);
    p += 12;
  }
  b.write("fmt ", p, "ascii");
  b.writeUInt32LE(16, p + 4);
  b.writeUInt16LE(1, p + 8);
  b.writeUInt16LE(1, p + 10);
  b.writeUInt32LE(cadence, p + 12);
  b.writeUInt32LE(cadence * 2, p + 16);
  b.writeUInt16LE(2, p + 20);
  b.writeUInt16LE(16, p + 22);
  b.write("data", p + 24, "ascii");
  b.writeUInt32LE(0, p + 28);
  return new Uint8Array(b);
}

describe("la cadence dans laquelle les moteurs comptent", () => {
  it("vaut seize kilohertz, et c'est elle qui convertit les indices", () => {
    expect(CADENCE_MOTEUR).toBe(16000);
    expect(CADENCE_EXIGEE).toBe(16000);
  });

  it("LES DEUX COPIES DU TÉMOIN SONT SÉPARÉES DE 6,880 s, comme elles l'ont été à la mesure", () => {
    // Les deux indices sont ceux du premier mot de chaque copie, tels que l'aligneur les a rendus.
    const copie1 = secondes(1280);
    const copie2 = secondes(111360);
    expect(copie1).toBeCloseTo(0.08, 6);
    expect(copie2).toBeCloseTo(6.96, 6);
    // 4,880 s de phrase plus 2,000 s de silence : le décalage ne peut valoir que cela.
    expect(copie2 - copie1).toBeCloseTo(6.88, 6);
  });

  it("la résolution du moteur se lit dans ses indices : des multiples de quatre-vingts ms", () => {
    for (const indice of [1280, 3840, 6400, 111360, 180480]) {
      expect(Math.round(secondes(indice) / 0.08)).toBeCloseTo(secondes(indice) / 0.08, 6);
    }
  });
});

describe("la cadence lue dans l'en-tête d'un WAV", () => {
  it("se lit, et vaut celle qui est écrite", () => {
    expect(cadenceWav(enTete(16000))).toBe(16000);
    expect(cadenceWav(enTete(48000))).toBe(48000);
  });

  it("se lit même quand un morceau inconnu précède `fmt `", () => {
    // LA FORME EST CHERCHÉE, NON UNE POSITION : un `readUInt32LE(24)` codé en dur rendrait ici la
    // taille d'un morceau `LIST` prise pour une cadence, soit un refus sur un fichier valide.
    expect(cadenceWav(enTete(16000, { morceauAvant: true }))).toBe(16000);
  });

  it("rend null sur ce qui n'est pas un WAV, plutôt qu'un nombre inventé", () => {
    expect(cadenceWav(new Uint8Array(0))).toBe(null);
    expect(cadenceWav(new Uint8Array(Buffer.alloc(44)))).toBe(null);
    expect(cadenceWav(new Uint8Array(Buffer.from("ceci n'est pas un fichier audio du tout!!")))).toBe(null);
  });

  it("rend null sur un WAV tronqué avant sa cadence", () => {
    const court = new Uint8Array(enTete(16000).subarray(0, 44));
    expect(cadenceWav(court)).toBe(16000);
    const b = Buffer.alloc(44);
    b.write("RIFF", 0, "ascii");
    b.write("WAVE", 8, "ascii");
    b.write("fmt ", 12, "ascii");
    b.writeUInt32LE(16, 16);
    // L'en-tête s'arrête juste avant les quatre octets de la cadence.
    expect(cadenceWav(new Uint8Array(b.subarray(0, 23)))).toBe(null);
  });
});
