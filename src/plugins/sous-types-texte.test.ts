// plugins/sous-types-texte.test.ts — Un contenu de texte se refuse au geste, et jamais à la lecture.
//
// CE QUE CES CAS TIENNENT. Le type d'un port dit le TRANSPORT, pas le CONTENU : une notation, un
// ABC et un prompt sont tous du « texte », et le graphe autorisait les trente combinaisons. Trois
// contenus sont désormais déclarés en sous-type, et la pose d'une arête les consulte.
//
// LES DEUX MOITIÉS COMPTENT, ET LA SECONDE PLUS QUE LA PREMIÈRE :
//
//   1. le nom du port et son sous-type se tiennent l'un l'autre, sans quoi ils dériveraient ;
//   2. LE REFUS EST AU GESTE SEULEMENT. `validerArete` passe les sous-types, `validerGraphe` ne les
//      passe pas. Un graphe enregistré avant cette règle garde donc ses câbles, et rien ne les lui
//      retire à l'ouverture. Sans cette asymétrie, resserrer une règle effacerait du travail.
import "node-web-audio-api/polyfill.js";
import { describe, expect, it } from "vitest";

import { registre } from "../audio/adaptateur";
import { CONTENUS_TEXTE, contenusTexteCompatibles } from "../audio/sous-types-texte";
import { toutesLesFiches } from "./index";

/** Tous les ports texte du catalogue, avec leur fiche et leur sens. */
function portsTexte() {
  const out: { fiche: string; sens: "entrees" | "sorties"; rang: number; nom: string; sousType?: string }[] = [];
  for (const f of toutesLesFiches as any[]) {
    for (const sens of ["entrees", "sorties"] as const) {
      (f[sens] ?? []).forEach((p: any, rang: number) => {
        if (p.type === "texte") out.push({ fiche: f.id, sens, rang, nom: p.nom, sousType: p.sousType });
      });
    }
  }
  return out;
}

describe("les contenus du flux texte", () => {
  it("un port nommé comme un contenu le porte en sous-type, et aucun autre ne le porte", () => {
    const parContenu = new Map(Object.entries(CONTENUS_TEXTE).map(([id, c]) => [c.nom, id]));
    const manquants: string[] = [], intrus: string[] = [];
    for (const p of portsTexte()) {
      const attendu = parContenu.get(p.nom);
      if (attendu && p.sousType !== attendu) manquants.push(`${p.fiche} ${p.sens}[${p.rang}] « ${p.nom} »`);
      if (!attendu && p.sousType) intrus.push(`${p.fiche} ${p.sens}[${p.rang}] « ${p.nom} » porte ${p.sousType}`);
    }
    expect(manquants, "ces ports portent le nom d'un contenu sans le déclarer").toEqual([]);
    expect(intrus, "ces ports déclarent un contenu que leur nom ne dit pas").toEqual([]);
  });

  it("les trois contenus sont posés, et leur compte est celui du relevé", () => {
    const ports = portsTexte().filter((p) => p.sousType);
    const compte = (st: string, sens: "entrees" | "sorties") =>
      ports.filter((p) => p.sousType === st && p.sens === sens).length;
    // Relevé sur les 271 ports texte du catalogue. Un chiffre qui bouge dit qu'un port est né ou
    // mort, et c'est exactement ce qu'on veut voir passer dans un diff.
    expect([compte("notation", "sorties"), compte("notation", "entrees")]).toEqual([4, 3]);
    expect([compte("abc", "sorties"), compte("abc", "entrees")]).toEqual([3, 3]);
    // PROMPT N'A AUCUN PRODUCTEUR, et il compte quand même : il refuse ce qui VA vers lui.
    expect([compte("prompt", "sorties"), compte("prompt", "entrees")]).toEqual([0, 7]);
    expect(ports.length).toBe(20);
  });

  it("deux contenus déclarés et différents ne vont pas ensemble", () => {
    expect(contenusTexteCompatibles("notation", "abc")).toBe(false);
    expect(contenusTexteCompatibles("abc", "prompt")).toBe(false);
    expect(contenusTexteCompatibles("notation", "notation")).toBe(true);
  });

  it("UN TEXTE SANS CONTENU DÉCLARÉ ENTRE PARTOUT, et il le faut", () => {
    // « Sortie texte », un modèle de langue, une transcription : tout ce qui produit du texte
    // quelconque. Refuser cela couperait des chaînes justes par dizaines.
    expect(contenusTexteCompatibles(undefined, "notation")).toBe(true);
    expect(contenusTexteCompatibles("notation", undefined)).toBe(true);
    expect(contenusTexteCompatibles(undefined, undefined)).toBe(true);
  });

  it("le registre refuse la paire au geste, et l'accepte sans les sous-types", () => {
    // Le geste : la pose d'une arête passe les deux sous-types.
    expect(registre.fluxCompatibles("texte", "texte", "abc", "notation")).toBe(false);
    expect(registre.fluxCompatibles("texte", "texte", "notation", "prompt")).toBe(false);
    // LA LECTURE D'UN GRAPHE DÉJÀ ENREGISTRÉ : la même fonction, sans eux, accepte comme avant.
    // C'est ce qui empêche `filtrerAretesInvalides` de retirer un câble à qui rouvre son travail.
    expect(registre.fluxCompatibles("texte", "texte")).toBe(true);
  });

  it("et le transport prime : deux types qui ne vont pas ensemble ne vont pas ensemble", () => {
    expect(registre.fluxCompatibles("texte", "audio", "notation", undefined)).toBe(false);
    expect(registre.fluxCompatibles("audio", "texte")).toBe(false);
  });

  it("les autres flux ne déclarent aucune règle de contenu, et acceptent donc tout", () => {
    // L'audio porte `stereo` et `mono` depuis toujours ; les brancher l'un sur l'autre est licite,
    // et ce cas dit que cette règle-ci ne l'a pas changé.
    expect(registre.fluxCompatibles("audio", "audio", "stereo", "mono")).toBe(true);
    const avecRegle = registre.tousTypesFlux().filter((t) => t.sousTypesCompatibles).map((t) => t.id);
    expect(avecRegle).toEqual(["texte"]);
  });
});
