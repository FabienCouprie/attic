// ui/paquet/ouvrir-paquet.test.ts — Un `.json` ouvert par le dialogue se lit comme le pont le lisait.
//
// LE DIALOGUE RENDAIT UN TEXTE, décodé par le processus principal (`fs.readFile(chemin, "utf-8")`) ;
// il rend désormais des octets, que la fenêtre décode. Les deux décodages doivent être LE MÊME, octet
// pour octet, faute de quoi un projet qui s'ouvrait cesserait de s'ouvrir — ou s'ouvrirait autre. Le
// cas les compare sur une marque d'ordre d'octets, sur les séquences invalides qu'on sait nommer, et
// sur vingt mille suites tirées au hasard, où les octets hauts sont surreprésentés.
import { describe, expect, it } from "vitest";
import { creerAleatoire } from "../../core/hasard";
import { FILTRES_OUVERTURE, lireLeFichierAOuvrir, texteCommeLePont } from "./ouvrir-paquet";
import { ecrireZip } from "./zip";

const commeNode = (o: Uint8Array) => Buffer.from(o).toString("utf-8");

describe("le texte d'un projet ouvert par le dialogue", () => {
  it("UNE MARQUE D'ORDRE D'OCTETS EST GARDÉE, comme le pont la gardait — et JSON.parse la refuse donc toujours", () => {
    const o = new Uint8Array([0xef, 0xbb, 0xbf, 0x7b, 0x7d]);
    expect(texteCommeLePont(o)).toBe(commeNode(o));
    expect(texteCommeLePont(o).charCodeAt(0)).toBe(0xfeff);
    expect(() => JSON.parse(texteCommeLePont(o))).toThrow();
  });

  it("LES SÉQUENCES INVALIDES QU'ON SAIT NOMMER sont remplacées comme Node les remplace", () => {
    const cas = [
      [0x80], [0xc0, 0xaf], [0xe0, 0x80, 0xaf], [0xed, 0xa0, 0x80], [0xf4, 0x90, 0x80, 0x80], [0xf8, 0x88, 0x80, 0x80, 0x80],
      [0xe2, 0x82], [0xf0, 0x9f, 0x98], [0x41, 0xc3], [0xfe, 0xff], [0xc3, 0xa9, 0x80, 0xe2, 0x82, 0xac],
    ];
    for (const c of cas) expect(texteCommeLePont(new Uint8Array(c)), c.join(",")).toBe(commeNode(new Uint8Array(c)));
  });

  it("VINGT MILLE SUITES TIRÉES AU HASARD : aucune différence", () => {
    const alea = creerAleatoire(20261116);
    let ecarts = 0;
    for (let k = 0; k < 20000; k++) {
      const o = new Uint8Array(1 + Math.floor(alea() * 24));
      for (let i = 0; i < o.length; i++) {
        const r = alea();
        o[i] = r < 0.3 ? 0x20 + Math.floor(alea() * 0x5f) : r < 0.6 ? 0x80 + Math.floor(alea() * 0x40) : 0xc0 + Math.floor(alea() * 0x40);
      }
      if (texteCommeLePont(o) !== commeNode(o)) ecarts++;
    }
    expect(ecarts).toBe(0);
  });
});

describe("ce que l'import lit", () => {
  const json = new TextEncoder().encode("{\"nodes\":[]}");

  it("PAR LE DIALOGUE : un texte pour un projet, des octets pour un paquet, et les deux extensions proposées", async () => {
    const zip = await ecrireZip([{ nom: "paquet.json", octets: json }]);
    const demandes: unknown[] = [];
    const api = (donnees: Uint8Array) => ({
      ouvrirFichierBinaire: async (o: unknown) => { demandes.push(o); return { donnees, nom: "x", chemin: "C:/p/x.attic" }; },
    });
    expect(await lireLeFichierAOuvrir(undefined, "D:/travail", api(json))).toEqual({ chemin: "C:/p/x.attic", texte: "{\"nodes\":[]}" });
    expect(await lireLeFichierAOuvrir(undefined, "", api(zip))).toEqual({ chemin: "C:/p/x.attic", octets: zip });
    expect(demandes).toEqual([{ defaultPath: "D:/travail", filters: FILTRES_OUVERTURE }, { defaultPath: undefined, filters: FILTRES_OUVERTURE }]);
    expect(FILTRES_OUVERTURE[0].extensions).toEqual(["json", "attic"]);
  });

  it("PAR UN FICHIER : son texte par `File.text()`, comme avant, ou ses octets ; et son chemin quand le pont le sait", async () => {
    const zip = await ecrireZip([{ nom: "paquet.json", octets: json }]);
    expect(await lireLeFichierAOuvrir(new File([json], "p.json"), "", undefined)).toEqual({ chemin: null, texte: "{\"nodes\":[]}" });
    const lu = await lireLeFichierAOuvrir(new File([zip as BlobPart], "p.attic"), "", { cheminFichier: () => "C:/p/p.attic" });
    expect(lu).toEqual({ chemin: "C:/p/p.attic", octets: zip });
  });

  it("SANS PONT NI FICHIER, rien n'est lu ; et un dialogue fermé ne rend rien", async () => {
    expect(await lireLeFichierAOuvrir(undefined, "", undefined)).toBeNull();
    expect(await lireLeFichierAOuvrir(undefined, "", { ouvrirFichierBinaire: async () => null })).toBeNull();
  });
});
