// audio/bext.test.ts — Ce qu'on lit dans un bloc `bext`, et ce qu'on refuse d'en déduire.
//
// LES OCTETS SONT CONSTRUITS ICI, et non lus sur un fichier d'exemple. Un WAV de terrain pèse des
// méga-octets, ne tient pas dans un dépôt, et ne permet pas d'éprouver le cas tordu — un bloc
// tronqué, une version ancienne, un champ rempli d'espaces au lieu de zéros. Ce sont ces cas-là
// qui cassent un analyseur, et ils ne se rencontrent pas sur commande.
import { describe, expect, it } from "vitest";
import { blocBext, lireBextWav, lireBloc, secondesDepuisMinuit, horloge } from "./bext";
import { bufferVersWavBlob, extraireGrapheWav } from "./io";
import { frequenceDuFichier } from "./frequence-source";

/** La partie fixe d'un `bext` fait 602 octets ; l'historique de codage suit. */
const PARTIE_FIXE = 602;

function bloc(champs: {
  description?: string; origine?: string; reference?: string;
  date?: string; heure?: string; temps?: number; version?: number;
  umid?: number[]; sonie?: number[]; historique?: string;
  remplissage?: "zeros" | "espaces";
} = {}): Uint8Array {
  const histo = champs.historique ?? "";
  const o = new Uint8Array(PARTIE_FIXE + histo.length);
  if (champs.remplissage === "espaces") o.fill(0x20);
  const v = new DataView(o.buffer);
  const ecrire = (p: number, s: string) => { for (let i = 0; i < s.length; i++) o[p + i] = s.charCodeAt(i); };
  ecrire(0, champs.description ?? "");
  ecrire(256, champs.origine ?? "");
  ecrire(288, champs.reference ?? "");
  ecrire(320, champs.date ?? "");
  ecrire(330, champs.heure ?? "");
  const t = champs.temps ?? 0;
  v.setUint32(338, t % 2 ** 32, true);
  v.setUint32(342, Math.floor(t / 2 ** 32), true);
  v.setUint16(346, champs.version ?? 0, true);
  if (champs.umid) champs.umid.forEach((x, i) => { o[348 + i] = x; });
  if (champs.sonie) champs.sonie.forEach((x, i) => v.setInt16(412 + i * 2, x, true));
  ecrire(PARTIE_FIXE, histo);
  return o;
}

/** Un WAV minimal : `RIFF`/`WAVE`, un `fmt ` de taille impaire, puis le `bext`, puis `data`. */
function wav(contenuBext: Uint8Array, tailleFmt = 16): Uint8Array {
  const total = 12 + 8 + tailleFmt + (tailleFmt % 2) + 8 + contenuBext.length + 8;
  const o = new Uint8Array(total);
  const v = new DataView(o.buffer);
  const ecrire = (p: number, s: string) => { for (let i = 0; i < s.length; i++) o[p + i] = s.charCodeAt(i); };
  ecrire(0, "RIFF"); v.setUint32(4, total - 8, true); ecrire(8, "WAVE");
  let p = 12;
  ecrire(p, "fmt "); v.setUint32(p + 4, tailleFmt, true);
  p += 8 + tailleFmt + (tailleFmt % 2);
  ecrire(p, "bext"); v.setUint32(p + 4, contenuBext.length, true);
  o.set(contenuBext, p + 8);
  p += 8 + contenuBext.length;
  ecrire(p, "data"); v.setUint32(p + 4, 0, true);
  return o;
}

describe("le bloc bext d'un fichier", () => {
  it("SE TROUVE EN PARCOURANT LES BLOCS, bourrage compris", () => {
    // UN BLOC DE TAILLE IMPAIRE EST SUIVI D'UN OCTET DE REMPLISSAGE, que RIFF exige. L'oublier
    // décale tout ce qui suit : le dépôt a déjà payé cette faute à l'écriture, dans `io.ts`.
    const b = lireBextWav(wav(bloc({ origine: "Zoom F8", temps: 480_000 }), 17));
    expect(b?.origine).toBe("Zoom F8");
    expect(b?.referenceTemps).toBe(480_000);
  });

  it("rend null quand il n'y en a pas, et quand ce n'est pas un WAV", () => {
    const sansBext = new Uint8Array(wav(bloc()));
    sansBext.set([0x6a, 0x75, 0x6e, 0x6b], 12 + 8 + 16); // « junk » à la place de « bext »
    expect(lireBextWav(sansBext)).toBeNull();
    expect(lireBextWav(new Uint8Array(4))).toBeNull();
    expect(lireBextWav(new Uint8Array(64))).toBeNull();
  });
});

describe("ce que le bloc dit", () => {
  it("L'HEURE DU PREMIER ÉCHANTILLON, qui est tout l'intérêt du bloc", () => {
    // 10 h 30 min 00 s à 48 kHz : c'est ce chiffre qui permet de reposer deux prises l'une par
    // rapport à l'autre sans rien aligner à l'oreille.
    const b = lireBloc(bloc({ temps: 10 * 3600 * 48_000 + 30 * 60 * 48_000 }))!;
    expect(secondesDepuisMinuit(b, 48_000)).toBe(37_800);
    expect(horloge(secondesDepuisMinuit(b, 48_000)!)).toBe("10:30:00.000");
  });

  it("ET UN COMPTE DE SOIXANTE-QUATRE BITS RESTE EXACT : une journée à 192 kHz y tient", () => {
    // 16,6 milliards d'échantillons : au-delà de ce que `getUint32` porte, loin en deçà de ce
    // qu'un nombre JavaScript tient exactement. C'est pourquoi il n'y a pas de `BigInt` ici.
    const unJour = 24 * 3600 * 192_000;
    expect(unJour).toBeGreaterThan(2 ** 32);
    const b = lireBloc(bloc({ temps: unJour - 1 }))!;
    expect(b.referenceTemps).toBe(unJour - 1);
    expect(Number.isSafeInteger(b.referenceTemps)).toBe(true);
  });

  it("les champs texte, quel que soit le remplissage employé pour les compléter", () => {
    // La norme demande des zéros ; les enregistreurs n'obéissent pas tous, et complètent par des
    // espaces. Les deux doivent donner la même chaîne, sans quoi un nom ressort avec sa traîne.
    const champs = { description: "Scene 12 / Take 3", origine: "SOUND DEVICES", date: "2026-03-14", heure: "10:30:00" };
    const zeros = lireBloc(bloc(champs))!;
    const espaces = lireBloc(bloc({ ...champs, remplissage: "espaces" }))!;
    const attendu = {
      description: "Scene 12 / Take 3", origine: "SOUND DEVICES",
      dateOrigine: "2026-03-14", heureOrigine: "10:30:00",
    };
    expect(zeros).toMatchObject(attendu);
    expect(espaces).toMatchObject(attendu);
  });

  it("l'historique de codage, qui vient après la partie fixe et n'a pas de longueur déclarée", () => {
    const b = lireBloc(bloc({ historique: "A=PCM,F=48000,W=24,M=stereo\r\n" }))!;
    expect(b.historique).toBe("A=PCM,F=48000,W=24,M=stereo");
  });
});

describe("ce qui dépend de la version, et qu'on ne lit pas sans elle", () => {
  it("UN UMID DE ZÉROS N'EST PAS UN UMID : la norme fait remplir le champ même quand on n'en a pas", () => {
    const sansUmid = lireBloc(bloc({ version: 1, umid: new Array(64).fill(0) }))!;
    expect(sansUmid.umid).toBeUndefined();
    const avec = lireBloc(bloc({ version: 1, umid: [0x06, 0x0a, 0x2b, ...new Array(61).fill(0)] }))!;
    expect(avec.umid?.slice(0, 6)).toBe("060a2b");
  });

  it("et rien n'est lu au-delà de ce que la version annonce", () => {
    // Un bloc de version 0 porte des octets à l'emplacement de l'UMID et de la sonie — du
    // remplissage. Les interpréter donnerait une sonie inventée, que personne ne pourrait
    // contredire sans rouvrir le fichier.
    const v0 = lireBloc(bloc({ version: 0, umid: new Array(64).fill(0xff), sonie: [-2300, 700, -100, -1800, -2000] }))!;
    expect(v0.umid).toBeUndefined();
    expect(v0.sonie).toBeUndefined();
  });

  it("LA SONIE SE LIT EN CENTIÈMES, et la version 2 est ce qui l'autorise", () => {
    const b = lireBloc(bloc({ version: 2, sonie: [-2300, 700, -100, -1800, -2000] }))!;
    expect(b.sonie).toEqual({ sonie: -23, plage: 7, cretteVraie: -1, momentanee: -18, courtTerme: -20 });
  });
});

describe("un bloc abîmé rend ce qu'il porte, plutôt que rien", () => {
  it("tronqué après la version, il garde l'heure — c'est elle qu'on vient chercher", () => {
    const court = bloc({ origine: "Nagra", temps: 48_000, version: 1 }).subarray(0, 348);
    const b = lireBloc(court)!;
    expect(b.referenceTemps).toBe(48_000);
    expect(b.umid).toBeUndefined();
    expect(b.historique).toBe("");
  });

  it("mais tronqué AVANT la version, il ne rend rien : l'heure n'y serait pas sûre", () => {
    expect(lireBloc(bloc({ temps: 48_000 }).subarray(0, 340))).toBeNull();
    expect(lireBloc(new Uint8Array(0))).toBeNull();
  });
});

describe("l'heure affichée", () => {
  it("se lit comme sur une feuille de rapport, au millième", () => {
    expect(horloge(0)).toBe("00:00:00.000");
    expect(horloge(37_800.25)).toBe("10:30:00.250");
    expect(horloge(86_399.999)).toBe("23:59:59.999");
  });

  it("ET NE REMONTE PAS À 1000 MILLIÈMES, ce qu'un arrondi fait sans qu'on y pense", () => {
    // 59,9999 s s'arrondit à 60,000 au millième : écrit tel quel, cela donnerait « 00:00:59.1000 ».
    expect(horloge(59.9999)).toBe("00:01:00.000");
  });

  it("ne dépend pas de la fréquence, qui n'est PAS dans le bloc", () => {
    // `TimeReference` compte des échantillons ; sans le `fmt ` du même fichier, le chiffre a l'air
    // d'une heure et n'en est pas une. Deux fréquences, deux heures, pour le même compte.
    const b = lireBloc(bloc({ temps: 48_000 }))!;
    expect(secondesDepuisMinuit(b, 48_000)).toBe(1);
    expect(secondesDepuisMinuit(b, 96_000)).toBe(0.5);
    expect(secondesDepuisMinuit(b, 0)).toBeNull();
  });
});

// ── L'écriture ────────────────────────────────────────────────────────────────────────────────
//
// CE QUE CES CAS GARDENT, et c'est une décision de Fabien du 2026-10-09 : le bloc porte la VRAIE
// date. `audio/metadonnees.ts` tenait à ce que deux rendus du même graphe donnent deux fichiers
// identiques octet pour octet, et une date d'écriture casse cette propriété par construction. Elle
// reste disponible à qui la veut, l'horodatage s'injectant ; c'est ce que le deuxième cas vérifie.
describe("le bloc écrit", () => {
  /** Le contenu du bloc, sans son en-tête de quatre octets ni sa taille. */
  const contenu = (c: Uint8Array) => c.subarray(8);

  it("SE RELIT PAR L'ANALYSEUR, qui est le seul juge utile", () => {
    const quand = new Date(2026, 2, 14, 10, 30, 0);
    const ecrit = blocBext({
      description: "Scene 12 / Take 3", origine: "Attic", referenceOrigine: "a1b2c3",
      horodatage: quand, referenceTemps: 10 * 3600 * 48_000,
      historique: "A=PCM,F=48000,W=24,M=stereo,T=Attic\r\n",
    });
    const relu = lireBloc(contenu(ecrit))!;
    expect(relu).toMatchObject({
      description: "Scene 12 / Take 3", origine: "Attic", referenceOrigine: "a1b2c3",
      dateOrigine: "2026-03-14", heureOrigine: "10:30:00",
      referenceTemps: 10 * 3600 * 48_000, version: 1,
    });
    expect(relu.historique).toBe("A=PCM,F=48000,W=24,M=stereo,T=Attic");
  });

  it("L'HORODATAGE S'INJECTE, et c'est ce qui garde le déterminisme disponible", () => {
    const quand = new Date(2026, 0, 2, 3, 4, 5);
    expect([...blocBext({ horodatage: quand })]).toEqual([...blocBext({ horodatage: quand })]);
    const relu = lireBloc(contenu(blocBext({ horodatage: quand })))!;
    expect(relu.dateOrigine).toBe("2026-01-02");
    expect(relu.heureOrigine).toBe("03:04:05");
  });

  it("et sans horodatage il prend l'heure courante, qui change d'un rendu à l'autre", () => {
    const relu = lireBloc(contenu(blocBext()))!;
    expect(relu.dateOrigine).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(relu.heureOrigine).toMatch(/^\d{2}:\d{2}:\d{2}$/);
  });

  it("UN CHAMP TROP LONG EST TRONQUÉ, JAMAIS DÉBORDÉ : il écraserait le champ suivant", () => {
    const relu = lireBloc(contenu(blocBext({
      description: "x".repeat(400), origine: "SOUND DEVICES 833", horodatage: new Date(2026, 2, 14),
    })))!;
    expect(relu.description.length).toBe(256);
    expect(relu.origine).toBe("SOUND DEVICES 833");
    expect(relu.dateOrigine).toBe("2026-03-14");
  });

  it("la taille déclarée est la taille utile, et le bloc est de longueur paire", () => {
    // RIFF veut des blocs de taille paire : un historique impair doit être complété, sans que la
    // taille déclarée compte l'octet de bourrage.
    const c = blocBext({ historique: "ABC" });
    expect(new DataView(c.buffer).getUint32(4, true)).toBe(PARTIE_FIXE + 3);
    expect(c.length % 2).toBe(0);
  });

  it("et un compte de temps au-delà de trente-deux bits passe par les deux mots", () => {
    const grand = 20 * 3600 * 192_000;
    expect(grand).toBeGreaterThan(2 ** 32);
    expect(lireBloc(contenu(blocBext({ referenceTemps: grand })))!.referenceTemps).toBe(grand);
  });
});

// ── Dans un vrai fichier ──────────────────────────────────────────────────────────────────────
describe("le bloc dans un fichier écrit par le graveur", () => {
  const tampon = (n = 480, frequence = 48_000) => ({
    numberOfChannels: 1, length: n, sampleRate: frequence, duration: n / frequence,
    getChannelData: () => new Float32Array(n),
  }) as unknown as AudioBuffer;

  it("SE PLACE AVANT LES DONNÉES, là où les outils le cherchent", async () => {
    const champs = { description: "Montage", origine: "Attic", referenceOrigine: "abc",
      horodatage: new Date(2026, 2, 14, 10, 30, 0), referenceTemps: 10 * 3600 * 48_000 };
    const octets = new Uint8Array(await bufferVersWavBlob(tampon(), undefined, false, { bext: champs }).arrayBuffer());
    const texte = String.fromCharCode(...octets.subarray(0, 4096));
    expect(texte.indexOf("bext")).toBeGreaterThan(-1);
    expect(texte.indexOf("bext")).toBeLessThan(texte.indexOf("data"));
  });

  it("et se relit par le même chemin qu'un fichier de terrain", async () => {
    const champs = { horodatage: new Date(2026, 2, 14, 10, 30, 0), referenceTemps: 37_800 * 48_000 };
    const octets = new Uint8Array(await bufferVersWavBlob(tampon(), undefined, false, { bext: champs }).arrayBuffer());
    const relu = lireBextWav(octets)!;
    expect(relu.dateOrigine).toBe("2026-03-14");
    expect(secondesDepuisMinuit(relu, 48_000)).toBe(37_800);
    expect(horloge(secondesDepuisMinuit(relu, 48_000)!)).toBe("10:30:00.000");
  });

  it("SANS CASSER CE QUI SE LIT DÉJÀ : la fréquence et le graphe embarqué", async () => {
    // Un bloc de plus entre le format et les données décale tout ce qui suit. Les deux lecteurs du
    // dépôt parcourent les blocs, mais c'est précisément ce genre d'insertion qui les éprouve.
    const octets = new Uint8Array(await bufferVersWavBlob(
      tampon(480, 44_100), "{\"nodes\":[],\"edges\":[]}", false,
      { bext: { horodatage: new Date(2026, 2, 14) } },
    ).arrayBuffer());
    expect(frequenceDuFichier(octets.buffer as ArrayBuffer)).toBe(44_100);
    expect(extraireGrapheWav(octets.buffer as ArrayBuffer)).toBe("{\"nodes\":[],\"edges\":[]}");
  });

  it("et un fichier écrit sans `bext` n'en porte pas", async () => {
    const octets = new Uint8Array(await bufferVersWavBlob(tampon()).arrayBuffer());
    expect(lireBextWav(octets)).toBeNull();
  });
});
