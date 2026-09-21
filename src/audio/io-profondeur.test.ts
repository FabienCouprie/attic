// audio/io-profondeur.test.ts — L'écriture en 16, 24 et 32 bits, lue comme un tiers la lirait.
//
// LE LECTEUR DE CE FICHIER PARCOURT LES BLOCS, ET C'EST VOLONTAIRE. L'ancien test lisait les
// données à l'octet 44 en dur, ce qui ne vaut que pour un en-tête PCM minimal : un fichier en
// virgule flottante porte un bloc `fmt ` plus long et un bloc `fact` de plus, et des offsets fixes
// ne verraient qu'un fichier corrompu là où il est parfaitement conforme. Le lecteur ci-dessous
// fait donc ce que fait n'importe quel lecteur sérieux — il suit la chaîne des blocs —, si bien
// qu'il vérifie du même coup que l'en-tête est navigable.
//
// LE TEST QUI JUSTIFIE TOUT LE TRAVAIL EST CELUI DE LA PRÉCISION. Écrire « 24 » dans l'en-tête ne
// prouve rien du tout ; ce qui compte est que l'erreur de reconstruction baisse effectivement, et
// de la quantité annoncée par la théorie — six décibels par bit, donc quarante-huit décibels entre
// seize et vingt-quatre. On le mesure plutôt que de l'affirmer.
import { describe, expect, it, beforeAll } from "vitest";
import { bufferVersWavBlob, extraireGrapheWav, type ProfondeurExport } from "./io";

class AudioBufferPolyfill {
  numberOfChannels: number;
  length: number;
  sampleRate: number;
  duration: number;
  private canaux: Float32Array[];
  constructor(opts: { numberOfChannels: number; length: number; sampleRate: number }) {
    this.numberOfChannels = opts.numberOfChannels;
    this.length = opts.length;
    this.sampleRate = opts.sampleRate;
    this.duration = opts.length / opts.sampleRate;
    this.canaux = Array.from({ length: opts.numberOfChannels }, () => new Float32Array(opts.length));
  }
  getChannelData(c: number): Float32Array { return this.canaux[c]; }
  copyToChannel(src: Float32Array, c: number): void { this.canaux[c].set(src.subarray(0, this.length)); }
}

beforeAll(() => { (globalThis as any).AudioBuffer = AudioBufferPolyfill; });

const faireBuffer = (canaux: Float32Array[], sampleRate = 44100): AudioBuffer => {
  const b = new (globalThis as any).AudioBuffer({
    numberOfChannels: canaux.length, length: canaux[0].length, sampleRate,
  }) as AudioBuffer;
  for (let c = 0; c < canaux.length; c++) b.copyToChannel(new Float32Array(canaux[c]), c);
  return b;
};

interface Lu {
  formatCode: number;
  canaux: number;
  frequence: number;
  octetsParSeconde: number;
  blocAlign: number;
  bits: number;
  tailleRiff: number;
  tailleFichier: number;
  tailleDonnees: number;
  factTrames: number | null;
  blocs: string[];
  echantillons: Float32Array[];
}

/** Un lecteur WAV qui suit la chaîne des blocs, comme le ferait n'importe quel autre. */
async function lireWav(blob: Blob): Promise<Lu> {
  const ab = await blob.arrayBuffer();
  const vue = new DataView(ab);
  const chaine = (o: number, n: number) => {
    let s = "";
    for (let i = 0; i < n; i++) s += String.fromCharCode(vue.getUint8(o + i));
    return s;
  };
  expect(chaine(0, 4)).toBe("RIFF");
  expect(chaine(8, 4)).toBe("WAVE");

  const blocs: string[] = [];
  let fmt = -1, fmtTaille = 0, data = -1, dataTaille = 0, factTrames: number | null = null;
  let o = 12;
  while (o + 8 <= vue.byteLength) {
    const id = chaine(o, 4);
    const taille = vue.getUint32(o + 4, true);
    blocs.push(id);
    if (id === "fmt ") { fmt = o + 8; fmtTaille = taille; }
    if (id === "data") { data = o + 8; dataTaille = taille; }
    if (id === "fact") factTrames = vue.getUint32(o + 8, true);
    o += 8 + taille + (taille % 2);
  }
  expect(fmt, "bloc fmt introuvable").toBeGreaterThan(0);
  expect(data, "bloc data introuvable").toBeGreaterThan(0);

  const formatCode = vue.getUint16(fmt, true);
  const canaux = vue.getUint16(fmt + 2, true);
  const frequence = vue.getUint32(fmt + 4, true);
  const octetsParSeconde = vue.getUint32(fmt + 8, true);
  const blocAlign = vue.getUint16(fmt + 12, true);
  const bits = vue.getUint16(fmt + 14, true);

  const octets = bits / 8;
  const trames = dataTaille / (canaux * octets);
  const echantillons = Array.from({ length: canaux }, () => new Float32Array(trames));
  for (let t = 0; t < trames; t++) {
    for (let c = 0; c < canaux; c++) {
      const p = data + (t * canaux + c) * octets;
      if (formatCode === 3) {
        echantillons[c][t] = vue.getFloat32(p, true);
      } else if (bits === 24) {
        // Trois octets de poids croissant, puis extension du signe depuis le bit 23.
        const brut = vue.getUint8(p) | (vue.getUint8(p + 1) << 8) | (vue.getUint8(p + 2) << 16);
        const signe = brut & 0x800000 ? brut - 0x1000000 : brut;
        echantillons[c][t] = signe / 8388607;
      } else {
        echantillons[c][t] = vue.getInt16(p, true) / 32767;
      }
    }
  }
  return {
    formatCode, canaux, frequence, octetsParSeconde, blocAlign, bits,
    tailleRiff: vue.getUint32(4, true), tailleFichier: vue.byteLength,
    tailleDonnees: dataTaille, factTrames, blocs, echantillons,
  };
}

/** Un signal riche : la quantification n'a de sens que sur autre chose qu'une constante. */
function signal(n: number): Float32Array {
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    x[i] = 0.6 * Math.sin((2 * Math.PI * 440 * i) / 44100)
      + 0.25 * Math.sin((2 * Math.PI * 1170 * i) / 44100);
  }
  return x;
}

const rapportDb = (reference: Float32Array, essai: Float32Array): number => {
  let bruit = 0, sig = 0;
  for (let i = 0; i < reference.length; i++) { bruit += (reference[i] - essai[i]) ** 2; sig += reference[i] ** 2; }
  return bruit <= 0 ? 200 : 10 * Math.log10(sig / bruit);
};

describe("l'en-tête, lu comme un tiers le lirait", () => {
  for (const bits of [16, 24, 32] as ProfondeurExport[]) {
    it(`${bits} bits : le format, l'alignement et les tailles concordent`, async () => {
      const x = signal(1000);
      const lu = await lireWav(bufferVersWavBlob(faireBuffer([x, x], 48000), undefined, false, { bits }));

      // Balise de format : 1 pour du PCM entier, 3 pour de la virgule flottante.
      expect(lu.formatCode).toBe(bits === 32 ? 3 : 1);
      expect(lu.bits).toBe(bits);
      expect(lu.canaux).toBe(2);
      expect(lu.frequence).toBe(48000);
      expect(lu.blocAlign).toBe((2 * bits) / 8);
      expect(lu.octetsParSeconde).toBe(48000 * lu.blocAlign);
      expect(lu.tailleDonnees).toBe(1000 * lu.blocAlign);

      // LA TAILLE ANNONCÉE PAR RIFF DOIT ÊTRE CELLE DU FICHIER MOINS HUIT, et c'est la faute
      // classique d'un en-tête à taille variable : un lecteur strict refuse tout le fichier.
      expect(lu.tailleRiff).toBe(lu.tailleFichier - 8);
    });
  }

  it("LA VIRGULE FLOTTANTE PORTE SON BLOC `fact`, que la norme exige hors du PCM", async () => {
    const x = signal(777);
    const flottant = await lireWav(bufferVersWavBlob(faireBuffer([x]), undefined, false, { bits: 32 }));
    expect(flottant.blocs).toContain("fact");
    expect(flottant.factTrames).toBe(777);

    // Et le PCM ne le porte pas : il n'y a rien à y déclarer.
    const pcm = await lireWav(bufferVersWavBlob(faireBuffer([x]), undefined, false, { bits: 24 }));
    expect(pcm.blocs).not.toContain("fact");
  });

  it("le défaut reste le seize bits, pour ne rien changer aux appels internes", async () => {
    const x = signal(200);
    const lu = await lireWav(bufferVersWavBlob(faireBuffer([x])));
    expect(lu.bits).toBe(16);
    expect(lu.formatCode).toBe(1);
  });
});

describe("LA PRÉCISION AUGMENTE VRAIMENT, et c'est tout l'objet du travail", () => {
  it("SIX DÉCIBELS PAR BIT : quarante-huit décibels séparent le seize du vingt-quatre", async () => {
    const x = signal(20000);
    const mesurer = async (bits: ProfondeurExport) => {
      const lu = await lireWav(bufferVersWavBlob(faireBuffer([x]), undefined, false, { bits }));
      return rapportDb(x, lu.echantillons[0]);
    };
    const seize = await mesurer(16);
    const vingtQuatre = await mesurer(24);

    // Un seize bits dithéré tient autour de 90 dB sur ce signal, un vingt-quatre autour de 138.
    expect(seize).toBeGreaterThan(80);
    expect(seize).toBeLessThan(105);
    // L'écart théorique vaut 8 × 6,02 = 48,2 dB. On l'exige à quelques décibels près.
    expect(vingtQuatre - seize).toBeGreaterThan(44);
    expect(vingtQuatre - seize).toBeLessThan(54);
  });

  it("LE TRENTE-DEUX BITS FLOTTANT REND LE TAMPON AU BIT PRÈS — il ne quantifie rien", async () => {
    const x = signal(5000);
    const lu = await lireWav(bufferVersWavBlob(faireBuffer([x]), undefined, false, { bits: 32 }));
    // Pas « très proche » : identique. Le tampon est déjà en flottant simple précision.
    expect(Array.from(lu.echantillons[0])).toEqual(Array.from(x));
  });

  it("le vingt-quatre bits rend les valeurs négatives comme les positives", async () => {
    // Le complément à deux sur trois octets est l'endroit exact où une faute de signe se glisse,
    // et elle ne s'entendrait que comme un craquement sur les demi-alternances négatives.
    const x = Float32Array.from([-1, -0.75, -0.5, -0.25, 0, 0.25, 0.5, 0.75, 1]);
    const lu = await lireWav(bufferVersWavBlob(faireBuffer([x]), undefined, false, { bits: 24 }));
    for (let i = 0; i < x.length; i++) {
      expect(lu.echantillons[0][i], `valeur ${x[i]}`).toBeCloseTo(x[i], 5);
    }
  });
});

describe("le dépassement du plein calibre", () => {
  it("LE FLOTTANT NE BORNE PAS, ET C'EST SON SEUL INTÉRÊT", async () => {
    const x = Float32Array.from([1.5, -1.5, 3, -3, 0.5]);
    const lu = await lireWav(bufferVersWavBlob(faireBuffer([x]), undefined, false, { bits: 32 }));
    // Un fichier qui sort à +9,5 dBFS se rattrape d'un gain négatif chez le destinataire, sans
    // qu'un seul échantillon ait été perdu. Borner ici détruirait ce qu'on vient chercher.
    expect(Array.from(lu.echantillons[0])).toEqual([1.5, -1.5, 3, -3, 0.5]);
  });

  it("les profondeurs entières bornent, elles, puisqu'elles ne peuvent pas faire autrement", async () => {
    const x = Float32Array.from([1.5, -1.5, 0.5]);
    for (const bits of [16, 24] as ProfondeurExport[]) {
      const lu = await lireWav(bufferVersWavBlob(faireBuffer([x]), undefined, false, { bits }));
      expect(lu.echantillons[0][0], `${bits} bits`).toBeCloseTo(1, 3);
      expect(lu.echantillons[0][1], `${bits} bits`).toBeLessThan(-0.999);
      expect(lu.echantillons[0][2], `${bits} bits`).toBeCloseTo(0.5, 3);
    }
  });

  it("LE PLAFOND D'APERÇU S'APPLIQUE À TOUTES LES PROFONDEURS, flottant compris", async () => {
    // Il protège les oreilles, ce qui prime sur la fidélité du format.
    const x = Float32Array.from([1, -1, 0.9]);
    for (const bits of [16, 24, 32] as ProfondeurExport[]) {
      const lu = await lireWav(bufferVersWavBlob(faireBuffer([x]), undefined, true, { bits }));
      for (const v of lu.echantillons[0]) expect(Math.abs(v), `${bits} bits`).toBeLessThanOrEqual(0.51);
    }
  });
});

describe("le graphe embarqué survit au changement d'en-tête", () => {
  const GRAPHE = JSON.stringify({ noeuds: [{ id: "un", ficheId: "ondelettes" }], aretes: [] });

  for (const bits of [16, 24, 32] as ProfondeurExport[]) {
    it(`${bits} bits : le graphe se relit, et les données restent intactes`, async () => {
      const x = signal(500);
      const blob = bufferVersWavBlob(faireBuffer([x, x]), GRAPHE, false, { bits });
      const ab = await blob.arrayBuffer();
      // C'est la régression à craindre : le bloc `LIST` est écrit après les données, dont
      // l'offset vient de changer. Un octet de décalage et le graphe devient illisible.
      expect(extraireGrapheWav(ab)).toBe(GRAPHE);

      const lu = await lireWav(blob);
      expect(lu.blocs).toContain("LIST");
      expect(lu.tailleDonnees).toBe(500 * lu.blocAlign);
      expect(lu.tailleRiff).toBe(lu.tailleFichier - 8);
    });
  }
});

describe("la reproductibilité et les cas limites", () => {
  it("deux écritures du même tampon donnent les mêmes octets, à chaque profondeur", async () => {
    const x = signal(300);
    for (const bits of [16, 24, 32] as ProfondeurExport[]) {
      const a = new Uint8Array(await bufferVersWavBlob(faireBuffer([x]), undefined, false, { bits }).arrayBuffer());
      const b = new Uint8Array(await bufferVersWavBlob(faireBuffer([x]), undefined, false, { bits }).arrayBuffer());
      expect(Array.from(a), `${bits} bits`).toEqual(Array.from(b));
    }
  });

  it("une valeur non finie ne corrompt pas le fichier", async () => {
    const x = Float32Array.from([0.5, NaN, Infinity, -Infinity, 0.5]);
    for (const bits of [16, 24, 32] as ProfondeurExport[]) {
      const lu = await lireWav(bufferVersWavBlob(faireBuffer([x]), undefined, false, { bits }));
      for (const v of lu.echantillons[0]) expect(Number.isFinite(v), `${bits} bits`).toBe(true);
      expect(lu.tailleRiff).toBe(lu.tailleFichier - 8);
    }
  });

  it("un tampon d'un seul échantillon, et une mono, restent conformes", async () => {
    for (const bits of [16, 24, 32] as ProfondeurExport[]) {
      const lu = await lireWav(bufferVersWavBlob(faireBuffer([Float32Array.from([0.25])]), undefined, false, { bits }));
      expect(lu.canaux).toBe(1);
      expect(lu.tailleDonnees).toBe(bits / 8);
      expect(lu.echantillons[0][0]).toBeCloseTo(0.25, 3);
    }
  });
});
