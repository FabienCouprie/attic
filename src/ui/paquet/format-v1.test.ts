// ui/paquet/format-v1.test.ts — Le format 1 du paquet `.attic` est figé, et un témoin versionné le tient.
//
// DÉCIDÉ PAR FABIEN LE 2026-11-16 : « oui le format v1, figé ». Et, le même jour, « le cache se
// reprend uniquement pour les versions futures » : un paquet écrit aujourd'hui doit s'ouvrir, cache
// compris, dans toute version d'Attic à venir. Le témoin `temoin-format-v1.attic` a été écrit ce
// jour-là par le code qui définit le format, et il tient les deux sens :
//
//   1. TOUTE VERSION D'ATTIC LE RELIT : le projet à l'octet, chaque valeur du cache avec sa classe,
//      ses échantillons et ses étiquettes, chaque marque du JSON, chaque sorte d'atome, le média.
//   2. L'ÉCRITURE LE REFAIT ENTRÉE POUR ENTRÉE : les mêmes noms dans le même ordre, les mêmes octets
//      une fois décompressés. Les octets compressés ne sont pas comparés : ils sont ceux du zlib de la
//      machine, pas du format.
//
// LE TÉMOIN NE SE RÉÉCRIT PAS. Son empreinte est écrite ci-dessous, et `ECRIRE_TEMOIN_PAQUET_V1=1`
// ne l'écrit que s'il est absent. Si le second sens tombe, c'est que l'écriture a changé de format :
// la sortie est `VERSION_PAQUET = 2`, un témoin du format 2 à côté de celui-ci, et le premier sens
// gardé pour le format 1, que la lecture doit encore savoir ouvrir.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { configurerServicesDomaine, oublierServicesDomaine } from "../../core/services-domaine";
import type { EntreeDeCache } from "../../core/cache-execution";
import { depuisPaquetAudio, versPaquetAudio } from "../../audio/paquet-audio";
import { dispositionDe, etiqueter } from "../../audio/multicanal";
import { departDe, poserDepart } from "../../audio/depart-bwf";
import { ecrirePaquet } from "./ecrire-paquet";
import { lirePaquet } from "./lire-paquet";
import { extraire, lireRepertoire } from "./zip";
import { sha256, VERSION_APPLICATION, VERSION_PAQUET } from "./format-paquet";

const TEMOIN = join("src", "ui", "paquet", "temoin-format-v1.attic");
const EMPREINTE_DU_TEMOIN = "bf956f88eddc95bfeae7a4252f58039fc0a44090bc479a7f7aa99018c259efde";

beforeAll(() => configurerServicesDomaine({ versPaquet: versPaquetAudio, depuisPaquet: depuisPaquetAudio }));
afterAll(() => oublierServicesDomaine());

// ═══ CE QUE LE TÉMOIN PORTE : chaque forme que le format sait écrire, une fois au moins ═══

const PROJET = `${JSON.stringify({ formatVersion: 1, nodes: [
  { id: "a", data: { ficheId: "source", parametres: { Titre: "Été, à l'aube" } } },
  { id: "b", data: { ficheId: "analyse", parametres: {} } },
  { id: "c", data: { ficheId: "sortie", parametres: {} } },
], edges: [{ id: "ab", source: "a", target: "b" }, { id: "ac", source: "a", target: "c" }] }, null, 2)}\n`;
const MODIFIE = 1_763_251_200_000;
const voix = () => new File([new Uint8Array([82, 73, 70, 70, 0, 1, 2, 255])], "voix été.wav", { type: "audio/wav", lastModified: MODIFIE });
const IMAGE = new Uint8Array([60, 115, 118, 103, 47, 62]);

function entrees() {
  const son = new AudioBuffer({ numberOfChannels: 2, length: 8, sampleRate: 44100 });
  son.copyToChannel(Float32Array.from([0, 0.5, -0.5, 1, -1, 0.25, Math.fround(1 / 3), -0]), 0);
  son.copyToChannel(Float32Array.from([1e-30, -1e-30, 0.125, -0.125, 0.75, -0.75, 0.0625, 0]), 1);
  poserDepart(etiqueter(son, "stereo"), 3600.5);
  const partage = { note: 60, duree: 0.5 };
  const trou: number[] = [];
  trou[0] = 1;
  trou[2] = 3;
  const cache = new Map<string, EntreeDeCache>([
    ["a", {
      valeurs: [son], message: "source prête", affichage: { forme: new Float32Array([0.25, -0.5]), apercu: "blob:attic/temoin" },
      hashParams: "{\"Titre\":\"Été, à l'aube\"}", hashEntree: "", hashSorties: "AudioBuffer(8,44100,2)", hashValeursEntree: "[]",
      consulteSorties: false, tempsExecution: 12,
    } as unknown as EntreeDeCache],
    ["b", {
      valeurs: [
        new Int16Array([-32768, -1, 0, 1, 32767]),
        { nan: NaN, plus: Infinity, moins: -Infinity, zero: -0, rien: undefined, nul: null, long: 12345678901234567890n, trou },
        { $cle: "une clé qui commence par un dollar", liste: [partage, partage] },
        new File([new Uint8Array([77, 84, 104, 100])], "suite.mid", { type: "audio/midi", lastModified: MODIFIE }),
        new Blob([IMAGE], { type: "image/svg+xml" }),
        new Uint8Array([1, 2, 3, 4]).buffer,
        new Float64Array([Math.PI, -Number.MAX_VALUE, Number.MIN_VALUE]),
      ],
      message: "analyse faite", hashParams: "{}", hashEntree: "a:0", hashSorties: "x", hashValeursEntree: "[\"AudioBuffer(8,44100,2)\"]",
      consulteSorties: true, tempsExecution: 3, empreinteBoucle: "boucle:1",
    } as unknown as EntreeDeCache],
    ["c", {
      valeurs: [son], hashParams: "{}", hashEntree: "a:0", hashSorties: "AudioBuffer(8,44100,2)", hashValeursEntree: "[]", tempsExecution: 0,
    } as unknown as EntreeDeCache],
  ]);
  return { cache, noeuds: [{ id: "a", data: { ficheId: "source", audioFichier: voix() } }] };
}

const ecrireLeTemoin = () => ecrirePaquet({
  projet: PROJET, application: "5.1.2", ...entrees(),
  lireUrl: async (u) => (u === "blob:attic/temoin" ? new Blob([IMAGE], { type: "image/svg+xml" }) : null),
});

async function decompresse(octets: Uint8Array): Promise<[string, number[]][]> {
  const r = lireRepertoire(octets);
  const sortie: [string, number[]][] = [];
  for (const [nom, e] of r) sortie.push([nom, Array.from(await extraire(octets, e, 1e8))]);
  return sortie;
}

const echantillons = (b: AudioBuffer) => Array.from({ length: b.numberOfChannels }, (_, c) => Array.from(b.getChannelData(c)));
const octetsDe = async (b: Blob) => Array.from(new Uint8Array(await b.arrayBuffer()));
const classe = (v: unknown) => (v as object).constructor.name;

describe("le format 1 du paquet est figé", () => {
  if (process.env.ECRIRE_TEMOIN_PAQUET_V1 && !existsSync(TEMOIN)) {
    it("ÉCRIT LE TÉMOIN, UNE FOIS", async () => { writeFileSync(TEMOIN, (await ecrireLeTemoin()).octets); });
  }

  it("LE TÉMOIN EST CELUI DU 2026-11-16, et le format qu'il porte est le format 1", async () => {
    const temoin = new Uint8Array(readFileSync(TEMOIN));
    expect(await sha256(temoin), "le témoin a été réécrit : il ne se réécrit pas").toBe(EMPREINTE_DU_TEMOIN);
    const manifeste = JSON.parse(new TextDecoder().decode(new Uint8Array((await decompresse(temoin))[0][1])));
    expect([manifeste.format, manifeste.version, manifeste.application]).toEqual(["attic-paquet", 1, "5.1.2"]);
    const donnees = new TextDecoder().decode(new Uint8Array((await decompresse(temoin)).find(([n]) => n === "donnees.json")![1]));
    for (const forme of ["$u", "$h", "$n", "$b", "$o", "$p", "\"t\":\"octets\"", "\"t\":\"fichier\"", "\"t\":\"blob\"", "\"t\":\"url\"", "\"t\":\"domaine\""]) {
      expect(donnees, `le témoin ne porte pas ${forme}`).toContain(forme);
    }
  });

  it("TOUTE VERSION D'ATTIC LE RELIT, CACHE COMPRIS : chaque valeur, chaque marque, chaque étiquette", async () => {
    const urls: Blob[] = [];
    const lu = await lirePaquet(new Uint8Array(readFileSync(TEMOIN)), {
      application: VERSION_APPLICATION, creerUrl: (b) => { urls.push(b); return `blob:relu/${urls.length}`; },
    });
    expect(lu.projet).toBe(PROJET);
    expect([lu.application, lu.illisibles, lu.ignorees]).toEqual(["5.1.2", { cache: 0, medias: 0 }, []]);
    expect([...lu.cache.keys()]).toEqual(["a", "b", "c"]);
    const attendu = entrees().cache;
    for (const [id, e] of lu.cache) {
      for (const cle of ["hashParams", "hashEntree", "hashSorties", "hashValeursEntree", "empreinteBoucle", "message", "consulteSorties", "tempsExecution"] as const) {
        expect(e[cle], `${id}.${cle}`).toEqual(attendu.get(id)![cle]);
      }
    }
    const a = lu.cache.get("a")!, b = lu.cache.get("b")!.valeurs, c = lu.cache.get("c")!;
    const son = a.valeurs[0] as AudioBuffer;
    expect([son.numberOfChannels, son.length, son.sampleRate]).toEqual([2, 8, 44100]);
    expect(echantillons(son)).toEqual(echantillons(attendu.get("a")!.valeurs[0] as AudioBuffer));
    expect(Object.is(son.getChannelData(0)[7], -0), "le zéro négatif d'un échantillon").toBe(true);
    expect([dispositionDe(son)?.id, departDe(son)]).toEqual(["stereo", 3600.5]);
    expect(c.valeurs[0], "un tampon présent deux fois est relu comme un seul").toBe(son);
    const affichage = a.affichage as unknown as { forme: Float32Array; apercu: string };
    expect([classe(affichage.forme), Array.from(affichage.forme), affichage.apercu]).toEqual(["Float32Array", [0.25, -0.5], "blob:relu/1"]);
    expect([urls[0].type, await octetsDe(urls[0])]).toEqual(["image/svg+xml", Array.from(IMAGE)]);

    expect([classe(b[0]), Array.from(b[0] as Int16Array)]).toEqual(["Int16Array", [-32768, -1, 0, 1, 32767]]);
    const m = b[1] as Record<string, unknown>;
    expect([Number.isNaN(m.nan), m.plus, m.moins, Object.is(m.zero, -0), "rien" in m, m.rien, m.nul, m.long]).toEqual([true, Infinity, -Infinity, true, true, undefined, null, 12345678901234567890n]);
    const trou = m.trou as number[];
    expect([trou.length, 1 in trou, trou[0], trou[2]]).toEqual([3, false, 1, 3]);
    const d = b[2] as { $cle: string; liste: object[] };
    expect(d.$cle).toBe("une clé qui commence par un dollar");
    // UN OBJET SIMPLE PRÉSENT DEUX FOIS EST ÉCRIT DEUX FOIS : seuls les atomes se partagent, et c'est
    // le format 1. L'empreinte du moteur ne regarde que la forme, et les deux copies l'ont.
    expect(d.liste).toEqual([{ note: 60, duree: 0.5 }, { note: 60, duree: 0.5 }]);
    const f = b[3] as File;
    expect([f instanceof File, f.name, f.type, f.lastModified, await octetsDe(f)]).toEqual([true, "suite.mid", "audio/midi", MODIFIE, [77, 84, 104, 100]]);
    const blob = b[4] as Blob;
    expect([blob instanceof File, blob.type, await octetsDe(blob)]).toEqual([false, "image/svg+xml", Array.from(IMAGE)]);
    expect([b[5] instanceof ArrayBuffer, Array.from(new Uint8Array(b[5] as ArrayBuffer))]).toEqual([true, [1, 2, 3, 4]]);
    expect([classe(b[6]), Array.from(b[6] as Float64Array)]).toEqual(["Float64Array", [Math.PI, -Number.MAX_VALUE, Number.MIN_VALUE]]);

    const media = lu.medias.get("a")!.audioFichier as File;
    expect([[...lu.medias.keys()], media.name, media.type, media.lastModified, await octetsDe(media)])
      .toEqual([["a"], "voix été.wav", "audio/wav", MODIFIE, await octetsDe(voix())]);
  });

  it("L'ÉCRITURE LE REFAIT ENTRÉE POUR ENTRÉE, tant que le format est le 1", async () => {
    expect(VERSION_PAQUET, "le format a changé de version : garder la relecture du témoin, et écrire celui du format 2").toBe(1);
    const refait = await decompresse((await ecrireLeTemoin()).octets);
    const temoin = await decompresse(new Uint8Array(readFileSync(TEMOIN)));
    expect(refait.map(([n]) => n)).toEqual(temoin.map(([n]) => n));
    for (let i = 0; i < temoin.length; i++) expect(refait[i][1], temoin[i][0]).toEqual(temoin[i][1]);
  });
});
