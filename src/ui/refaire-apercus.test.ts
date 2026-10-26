// ui/refaire-apercus.test.ts — Changer la profondeur refait les aperçus, et rien d'autre.
//
// ═══ CE QUE CES CAS GARDENT, ET POURQUOI ILS NE POUVAIENT PAS EXISTER AVANT ═══
//
// Le sélecteur de profondeur d'export était INOPÉRANT, et même en relançant — relevé dans
// l'application, le détail est dans l'en-tête de `refaire-apercus.ts`. Aucun garde ne l'attrapait,
// et la raison est instructive : toutes les épreuves posent `attic-profondeur-export` AVANT le
// premier lancement, jamais en cours de séance. Elles éprouvaient donc la valeur, jamais son
// CHANGEMENT.
import { beforeEach, describe, expect, it, vi } from "vitest";

import { refaireLesApercus } from "./refaire-apercus";
import { effacerResultats, poserResultat, resultatDe } from "./resultats";
import { configurerServicesApercu, oublierServicesApercu, type OptionsApercu } from "./services-apercu";

const adresses: string[] = [];
const revoquees: string[] = [];

beforeEach(() => {
  effacerResultats();
  oublierServicesApercu();
  adresses.length = 0;
  revoquees.length = 0;
  let n = 0;
  globalThis.URL.createObjectURL = () => { const u = `blob:faux/${++n}`; adresses.push(u); return u; };
  globalThis.URL.revokeObjectURL = (u: string) => { revoquees.push(u); };
});

/** Un domaine d'essai qui note les options reçues, et rend un blob à chaque fois. */
function domaineQuiNote(): OptionsApercu[] {
  const recues: OptionsApercu[] = [];
  configurerServicesApercu({
    blobApercu: async (_v, o) => { recues.push(o); return new Blob(["x"]); },
  });
  return recues;
}

const poserUnApercu = (id: string, bits: 16 | 24 | 32, reecriture = { securiser: false }) =>
  poserResultat(id, {
    audioResultatUrl: `blob:avant/${id}`,
    audioResultatBuffer: { faux: id },
    audioResultatRefaisable: { bits, reecriture },
  });

describe("refaire les aperçus à une autre profondeur", () => {
  it("REFAIT CEUX QUI NE SONT PAS À LA BONNE PROFONDEUR, ET RÉVOQUE L'ANCIENNE ADRESSE", async () => {
    const recues = domaineQuiNote();
    poserUnApercu("a", 24);
    poserUnApercu("b", 24);

    expect(await refaireLesApercus(32)).toBe(2);
    expect(recues.map((o) => o.bits), "le domaine doit être appelé à la profondeur demandée")
      .toEqual([32, 32]);
    // L'ANCIENNE ADRESSE EST RÉVOQUÉE : un `blob:` qui n'est plus référencé retient son contenu en
    // mémoire jusqu'au rechargement de la page. Vingt aperçus d'une minute en 32 bits font 400 Mo.
    expect(revoquees.sort()).toEqual(["blob:avant/a", "blob:avant/b"]);
    expect(resultatDe("a").audioResultatUrl).toBe(adresses[0]);
    expect((resultatDe("a").audioResultatRefaisable as { bits: number }).bits).toBe(32);
  });

  it("ET NE TOUCHE PAS CEUX QUI Y SONT DÉJÀ : un garde qui refait tout serait pire", async () => {
    // Refaire un aperçu déjà juste coûte le réencodage entier — 2,3 s pour cinq minutes de son,
    // 46 s pour une heure, mesuré dans le moteur. Sur un graphe de vingt nœuds, choisir deux fois
    // de suite la même valeur figerait l'interface pour rien.
    const recues = domaineQuiNote();
    poserUnApercu("deja", 32);
    expect(await refaireLesApercus(32)).toBe(0);
    expect(recues).toEqual([]);
    expect(revoquees, "aucune adresse ne doit être révoquée").toEqual([]);
    expect(resultatDe("deja").audioResultatUrl).toBe("blob:avant/deja");
  });

  it("UN NŒUD DONT LE TAMPON A ÉTÉ LIBÉRÉ N'EST PAS TOUCHÉ", async () => {
    // L'économie de mémoire et les bulles repliées lâchent le tampon : il n'y a alors rien à
    // réécrire, et l'aperçu se refera au prochain run, à la bonne profondeur. Essayer quand même
    // appellerait le domaine avec `undefined`.
    const recues = domaineQuiNote();
    poserResultat("libere", {
      audioResultatUrl: "blob:avant/libere", audioResultatBuffer: undefined,
      audioResultatRefaisable: { bits: 24, reecriture: { securiser: false } },
    });
    expect(await refaireLesApercus(32)).toBe(0);
    expect(recues).toEqual([]);
  });

  it("CE QU'IL FAUT POUR RÉÉCRIRE EST REPRIS TEL QUEL, graphe embarqué compris", async () => {
    // ═══ LE DÉFAUT QUE CE CAS EMPÊCHE EST UNE PERTE SILENCIEUSE ═══
    //
    // Le graphe embarqué vient du canal `moteur` de l'exécution du nœud, et le nom pour les
    // métadonnées de sa fiche : NI L'UN NI L'AUTRE NE SE REDÉRIVE. Réécrire sans eux rendrait un
    // fichier qui s'ouvre, qui s'écoute, et qui a perdu le graphe qu'il portait — c'est-à-dire
    // pire que de ne rien refaire, puisque personne ne s'en apercevrait.
    const recues = domaineQuiNote();
    poserUnApercu("sortie", 24, {
      securiser: true, grapheAEmbarquer: '{"nodes":[]}', nomPourMetadonnees: "Sortie audio",
    } as never);
    await refaireLesApercus(16);
    expect(recues[0].grapheAEmbarquer).toBe('{"nodes":[]}');
    expect(recues[0].nomPourMetadonnees).toBe("Sortie audio");
    expect(recues[0].securiser).toBe(true);
  });

  it("et une réécriture qui échoue laisse l'aperçu d'avant, jouable", async () => {
    // La profondeur est un confort, pas une correction : perdre un lecteur pour un encodage raté
    // serait échanger un défaut contre un pire.
    const avertir = vi.spyOn(console, "warn").mockImplementation(() => {});
    configurerServicesApercu({ blobApercu: async () => { throw new Error("encodage impossible"); } });
    poserUnApercu("casse", 24);
    expect(await refaireLesApercus(32)).toBe(0);
    expect(resultatDe("casse").audioResultatUrl).toBe("blob:avant/casse");
    expect(revoquees).toEqual([]);
    expect(avertir).toHaveBeenCalled();
    avertir.mockRestore();
  });
});
