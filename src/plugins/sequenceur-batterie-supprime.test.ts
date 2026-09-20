// plugins/sequenceur-batterie-supprime.test.ts — Un nœud supprimé ne doit pas casser les graphes.
//
// « Séquenceur de batterie » a été retiré : il faisait cinq pistes sans nuance, quand « Séquenceur de
// batterie avancé » fait les MÊMES CINQ, dans le même ordre, plus trois, avec une vélocité par pas —
// un sous-ensemble strict, à une exception près, la résolution de huit pas, reprise depuis.
//
// Ce que ce fichier garantit, et qui n'est pas visible en lisant le registre : un graphe enregistré
// qui porte l'ancien identifiant s'ouvre encore, sur le nœud restant, et JOUE encore son motif. Sans
// l'alias, il afficherait un nœud inconnu ; sans la relecture des motifs binaires, il s'ouvrirait
// muet. Les deux se vérifient d'un bout à l'autre : identifiant → fiche → exécution → son.
import "node-web-audio-api/polyfill.js";
import { describe, expect, it } from "vitest";
import { registre } from "../audio/adaptateur";

const ANCIEN_MOTIF = [
  "1000000010000000", // Kick
  "0000100000001000", // Snare
  "1010101010101010", // Charley fermé
  "0000000000000000", // Charley ouvert
  "0000000000000000", // Clap
].join("|");

/** Le contexte d'un nœud sans entrée, dont tous les réglages viennent d'un graphe enregistré. */
function contexte(params: Record<string, string | number>) {
  return {
    noeud: { id: "n1", data: { ficheId: "sequenceur-batterie", parametres: params } },
    runtime: null,
    entree: () => null,
    entrees: () => [],
    paramTexte: (nom: string, defaut: string) => String(params[nom] ?? defaut),
    paramNombre: (nom: string, defaut: number) => Number(params[nom] ?? defaut),
    onProgress: () => {},
  };
}

describe("le séquenceur de batterie supprimé", () => {
  it("n'est plus dans le registre sous son propre identifiant", () => {
    expect(registre.tousLesPlugins().some((p) => p.id === "sequenceur-batterie")).toBe(false);
  });

  it("mais son identifiant reste RÉSOLU, vers le séquenceur avancé", () => {
    expect(registre.trouverDef("sequenceur-batterie")?.id).toBe("sequenceur-batterie-avance");
  });

  it("garde les huit pas que lui seul offrait", () => {
    const pas = registre.trouverDef("sequenceur-batterie-avance")!.parametres
      .find((p) => p.nom === "Nombre de pas")!;
    expect(pas.options).toContain("8");
  });

  it("joue encore le motif d'un graphe enregistré, et à pleine puissance", async () => {
    const f = registre.trouverDef("sequenceur-batterie")!;
    const res = await f.executer(contexte({
      Tempo: 120, "Nombre de pas": "16", Swing: 0, Mesures: 1, Volume: 90,
      Motif: ANCIEN_MOTIF, Graine: 42,
    }) as any);
    const audio = res.valeurs[0] as AudioBuffer;
    expect(audio).toBeInstanceOf(AudioBuffer);
    let crete = 0;
    for (const v of audio.getChannelData(0)) crete = Math.max(crete, Math.abs(v));
    // Un motif relu à la vélocité 1 au lieu de 9 aurait donné une crête neuf fois plus basse : ce
    // seuil est ce qui distingue « ça joue » de « ça joue comme avant ».
    expect(crete).toBeGreaterThan(0.3);
    // Dix frappes dans l'ancien motif : deux kicks, deux snares, huit charleys… soit douze.
    expect(res.message).toContain("12");
  });

  it("ne joue pas plus fort qu'avant non plus : la crête reste celle d'un motif à pleine vélocité", async () => {
    const f = registre.trouverDef("sequenceur-batterie-avance")!;
    const neuf = Array(8).fill("0000000000000000");
    neuf[0] = "9000000000000000";
    const ancien = ["1000000000000000", "0000000000000000", "0000000000000000", "0000000000000000", "0000000000000000"];
    const creteDe = async (motif: string) => {
      const res = await f.executer(contexte({
        Tempo: 120, "Nombre de pas": "16", Swing: 0, Mesures: 1, Volume: 90, Motif: motif, Graine: 42,
      }) as any);
      let c = 0;
      for (const v of (res.valeurs[0] as AudioBuffer).getChannelData(0)) c = Math.max(c, Math.abs(v));
      return c;
    };
    const creteAncienne = await creteDe(ancien.join("|"));
    const creteNeuve = await creteDe(neuf.join("|"));
    expect(creteAncienne).toBeCloseTo(creteNeuve, 5);
  });
});
