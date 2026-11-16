// plugins/sortie-audio-pochette.test.ts — L'entrée « Pochette » de « Sortie audio », du port au fichier.
//
// TROIS CHOSES SONT TENUES ICI. Le port est le second, facultatif, et nommé dans les deux langues.
// L'exécuteur, sans image, rend exactement ce qu'il rendait avant ce port, si bien que l'écriture du
// fichier, déjà tenue octet pour octet par `audio/pochette-wav.test.ts`, ne voit aucune différence.
// Avec une image, il la prépare et la rend par son canal d'affichage, et ce canal transmis à
// l'écriture donne un WAV dont la pochette, relue par `audio/lecteur-pochette-essai.ts`, est l'image
// branchée. Les graphes livrés qui contiennent ce nœud, tous enregistrés avant ce port, s'ouvrent
// sans perdre un câble.
//
// CE QUI N'EST PAS TENU ICI : la conversion d'un SVG ou d'un WebP en PNG, qui demande un canevas,
// donc le navigateur. L'épreuve dans l'application la relève ; sous node, le nœud doit seulement
// dire qu'il l'écarte.
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { registre } from "../audio/adaptateur";
import { lancerFiche, sonDEssai, type FicheLancable } from "../audio/lancer-fiche";
import { pochetteDuWav } from "../audio/lecteur-pochette-essai";
import { pngDEssai } from "../audio/png-essai";
import { traduire } from "../i18n";
import { filtrerAretesInvalides, validerArete } from "../ui/validerGraphe";
import { configurerRegistreUI, type RegistreUI } from "../ui/registre-actif";
import { APERCU_AUDIO } from "./apercu-domaine";

configurerRegistreUI(registre as unknown as RegistreUI);

const FICHE = registre.trouverDef("sortie-audio")! as unknown as FicheLancable;
const PORTS = registre.trouverDef("sortie-audio")!.entrees as { nom: string; nomEn?: string; type: string; requis?: boolean }[];
const fichier = (octets: Uint8Array, nom: string, type: string) => new File([octets as BlobPart], nom, { type });
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 1, 2, 3, 0xff, 0xd9]);
const SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="#c33"/></svg>`;
const memes = (a: Uint8Array, b: Uint8Array) => Buffer.from(a).equals(Buffer.from(b));

describe("le port « Pochette »", () => {
  it("EST LE SECOND, FACULTATIF, DE TYPE IMAGE, et le premier n'a pas bougé", () => {
    expect(PORTS.map((p) => [p.nom, p.nomEn, p.type, p.requis])).toEqual([
      ["Audio", undefined, "audio", undefined],
      ["Pochette", "Cover", "image", false],
    ]);
  });
});

describe("l'exécuteur", () => {
  it("SANS IMAGE, IL REND CE QU'IL RENDAIT : le tampon d'amont, sa durée, ni message ni affichage", async () => {
    const son = sonDEssai(0.5);
    const r = await lancerFiche(FICHE, {}, { entrees: [son, null] });
    expect(r.valeurs[0], "à 100 %, le tampon d'amont lui-même").toBe(son);
    expect(r.valeurs[1]).toEqual({ debut: 0, duree: son.duration });
    expect(r.valeurs.length).toBe(2);
    expect(r.message).toBe("");
    expect(r.affichage).toBeUndefined();
  });

  it("SANS IMAGE, LE VOLUME AGIT COMME AVANT", async () => {
    const son = sonDEssai(0.5);
    const r = await lancerFiche(FICHE, { Volume: 50 }, { entrees: [son, null] });
    const sortie = r.valeurs[0] as AudioBuffer;
    expect(sortie).not.toBe(son);
    expect(sortie.getChannelData(1)[1234]).toBeCloseTo(son.getChannelData(1)[1234] * 0.5, 7);
    expect(r.affichage).toBeUndefined();
  });

  it("UN PNG EST PRÉPARÉ TEL QUEL, et le message dit son format et sa taille", async () => {
    const png = pngDEssai();
    const r = await lancerFiche(FICHE, {}, { entrees: [sonDEssai(0.5), fichier(png, "p.png", "image/png")] });
    const pochette = (r.affichage as { pochette: { mime: string; octets: Uint8Array } }).pochette;
    expect(pochette.mime).toBe("image/png");
    expect(memes(pochette.octets, png)).toBe(true);
    expect(r.message).toBe(traduire("msg.sortie_audio.pochette", "PNG", png.length.toLocaleString()));
  });

  it("LE TYPE SE LIT SUR LES OCTETS : un JPEG étiqueté PNG reste un JPEG", async () => {
    const r = await lancerFiche(FICHE, {}, { entrees: [sonDEssai(0.5), fichier(JPEG, "faux.png", "image/png")] });
    expect((r.affichage as { pochette: { mime: string } }).pochette.mime).toBe("image/jpeg");
  });

  it("HORS DU NAVIGATEUR, UN SVG EST ÉCARTÉ et le nœud le dit ; le son passe", async () => {
    const son = sonDEssai(0.5);
    for (const image of [new File([SVG], "p.svg", { type: "image/svg+xml" }), SVG]) {
      const r = await lancerFiche(FICHE, {}, { entrees: [son, image] });
      expect(r.affichage).toBeUndefined();
      expect(r.message).toBe(traduire("msg.sortie_audio.pochette_hors_navigateur"));
      expect(r.valeurs[0]).toBe(son);
      expect(r.erreurRendue, "une pochette écartée n'est pas un échec").toBe(false);
    }
  });

  it("CE QUI N'EST PAS UNE IMAGE EST ÉCARTÉ, et le nœud le dit", async () => {
    for (const valeur of [42, "un texte", new File([], "vide.png", { type: "image/png" })]) {
      const r = await lancerFiche(FICHE, {}, { entrees: [sonDEssai(0.5), valeur] });
      expect(r.affichage, String(valeur)).toBeUndefined();
      expect(r.message).toBe(traduire("msg.sortie_audio.pochette_pas_image"));
    }
  });

  it("DU PORT AU FICHIER : le canal rendu, transmis à l'écriture, donne un WAV dont la pochette relue est l'image branchée", async () => {
    const png = pngDEssai();
    const r = await lancerFiche(FICHE, {}, { entrees: [sonDEssai(0.5), fichier(png, "p.png", "image/png")] });
    const blob = await APERCU_AUDIO.blobApercu(r.valeurs[0], {
      securiser: false, bits: 24, nomPourMetadonnees: "Sortie audio", affichage: r.affichage, souffle: { tour: async () => false },
    });
    const { apic } = pochetteDuWav(new Uint8Array(await blob!.arrayBuffer()));
    expect(apic!.mime).toBe("image/png");
    expect(memes(apic!.image, png)).toBe(true);
  });
});

describe("un graphe enregistré avant ce port", () => {
  const RACINE = resolve(__dirname, "../..");
  const graphes = readdirSync(join(RACINE, "exemples")).filter((f) => f.endsWith(".json"))
    .map((f) => ({ nom: f, g: JSON.parse(readFileSync(join(RACINE, "exemples", f), "utf8")) as { nodes?: any[]; edges?: any[] } }))
    .filter(({ g }) => (g.nodes ?? []).some((n) => n.data?.ficheId === "sortie-audio"));

  it("LES EXEMPLES LIVRÉS EN CONTIENNENT, sans quoi ce cas ne vérifierait rien", () => {
    expect(graphes.length).toBeGreaterThanOrEqual(10);
  });

  it("S'OUVRE SANS PERDRE UN CÂBLE vers « Sortie audio », chacun sur un port du même flux, et aucun sur la pochette", () => {
    // L'INDICE NE SUFFIT PAS : un port neuf posé en tête garderait tous les câbles d'avant, rangés
    // sur lui. `validerArete` compare les types de flux des deux bouts, et c'est ce qui le verrait.
    for (const { nom, g } of graphes) {
      const noeuds = new Map((g.nodes ?? []).map((n) => [n.id, n]));
      const vers = (g.edges ?? []).filter((e) => noeuds.get(e.target)?.data?.ficheId === "sortie-audio");
      const gardees = filtrerAretesInvalides(g.nodes ?? [], vers);
      expect(gardees.map((e) => e.id), nom).toEqual(vers.map((e) => e.id));
      const refusees = vers.filter((e) => noeuds.get(e.source)?.data?.ficheId !== undefined
        && !validerArete(noeuds.get(e.source), noeuds.get(e.target), e));
      expect(refusees.map((e) => `${e.source} → ${e.targetHandle}`), nom).toEqual([]);
      expect(vers.map((e) => e.targetHandle).filter((h) => h !== "in:0"), nom).toEqual([]);
    }
  });
});
