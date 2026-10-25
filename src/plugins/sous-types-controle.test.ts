// plugins/sous-types-controle.test.ts — Un port « controle » declare ce qu'il transporte.
//
// POURQUOI CE GARDE LIT LE REGISTRE, ET NON LA SOURCE. Le chantier des contenus de TEXTE a paye
// cette lecon : un script qui balayait les fichiers avait pose vingt sous-types et manque QUATRE
// ports, parce qu'ils venaient d'une constante partagee, `ENTREES_SOURCE`, qui ne vit dans aucun
// tableau `entrees`. Le garde, lui, lit les fiches ENREGISTREES — ce que le moteur voit — et il
// les avait nommes tous les quatre.
//
// CE QU'IL TIENT ICI. Le type `controle` porte QUATRE contenus sur vingt-sept ports : une duree,
// des zones, un tempo, un profil de bruit. Avant cela, brancher un tempo sur une entree de zones
// etait licite, aux couleurs accordees, et rendait un refus a l'execution.
//
// « ZONE » ET « ZONES » SONT UN SEUL CONTENU, et c'est une decision, non un raccourci :
// `reinserer-zone` ecrit lui-meme qu'il accepte l'un ou l'autre. Ce cas doit donc accepter les deux
// noms pour le contenu `zones`, et c'est la seule difference avec son jumeau du texte.
import { describe, expect, it } from "vitest";

import { CONTENUS_CONTROLE, contenusControleCompatibles } from "../audio/sous-types-controle";
import { toutesLesFiches } from "./index";

/** Le contenu attendu d'apres le NOM du port. « Zone » et « Zones » tombent tous deux sur `zones`. */
const CONTENU_PAR_NOM: Record<string, string> = {
  ...Object.fromEntries(Object.entries(CONTENUS_CONTROLE).map(([id, c]) => [c.nom, id])),
  Zone: "zones",
};

/** Tous les ports de contrôle du catalogue, avec leur fiche et leur sens. */
function portsControle() {
  const out: { fiche: string; sens: "entrees" | "sorties"; rang: number; nom: string; sousType?: string }[] = [];
  for (const f of toutesLesFiches as any[]) {
    for (const sens of ["entrees", "sorties"] as const) {
      (f[sens] ?? []).forEach((p: any, rang: number) => {
        if (p.type === "controle") out.push({ fiche: f.id, sens, rang, nom: p.nom, sousType: p.sousType });
      });
    }
  }
  return out;
}

describe("les contenus du flux controle", () => {
  it("UN PORT NOMME COMME UN CONTENU LE PORTE, et aucun autre ne le porte", () => {
    const manquants: string[] = [], intrus: string[] = [];
    for (const p of portsControle()) {
      const attendu = CONTENU_PAR_NOM[p.nom];
      if (attendu && p.sousType !== attendu) manquants.push(`${p.fiche} ${p.sens}[${p.rang}] « ${p.nom} »`);
      if (!attendu && p.sousType) intrus.push(`${p.fiche} ${p.sens}[${p.rang}] « ${p.nom} » porte ${p.sousType}`);
    }
    expect(manquants, "ces ports portent le nom d'un contenu sans le declarer").toEqual([]);
    expect(intrus, "ces ports declarent un contenu que leur nom ne dit pas").toEqual([]);
  });

  it("LES QUATRE CONTENUS SONT POSES, et le releve dit combien", () => {
    const ports = portsControle().filter((p) => p.sousType);
    const compte = (st: string, sens: "entrees" | "sorties") =>
      ports.filter((p) => p.sousType === st && p.sens === sens).length;
    // Le releve du 2026-10-25, qui a decide des quatre contenus. Un compte qui bouge n'est pas une
    // faute : c'est un port ajoute ou retire, et il faut le regarder.
    expect(compte("zones", "sorties")).toBeGreaterThanOrEqual(4);
    expect(compte("zones", "entrees")).toBeGreaterThanOrEqual(8);
    expect(compte("duree", "sorties")).toBeGreaterThanOrEqual(7);
    expect(compte("tempo", "entrees")).toBeGreaterThanOrEqual(2);
    expect(compte("profil", "entrees")).toBe(1);
    expect(ports.length, "vingt-sept ports de controle portent un contenu").toBeGreaterThanOrEqual(26);
  });

  it("ET AUCUN PORT DE CONTROLE N'EST LAISSE SANS CONTENU, sans quoi la regle ne tient rien", () => {
    // C'EST LE CAS QUI AURAIT ATTRAPE LES QUATRE PORTS MANQUES SUR LE TEXTE. Un port de controle
    // sans contenu accepte tout : il suffit d'un pour que la regle cesse de proteger la chaine
    // dont il fait partie.
    const nus = portsControle().filter((p) => !p.sousType)
      .map((p) => `${p.fiche} ${p.sens}[${p.rang}] « ${p.nom} »`);
    expect(nus, [
      "Ces ports de controle ne declarent aucun contenu.",
      "Un port nu accepte tout : un tempo entre dans une entree de zones sans que rien ne le refuse.",
      "Nommez-le comme un contenu connu, ou ajoutez le contenu a CONTENUS_CONTROLE.",
    ].join("\n")).toEqual([]);
  });

  it("la regle refuse deux contenus differents, et laisse passer un contenu absent", () => {
    expect(contenusControleCompatibles("zones", "zones")).toBe(true);
    expect(contenusControleCompatibles("tempo", "zones")).toBe(false);
    expect(contenusControleCompatibles("profil", "duree")).toBe(false);
    expect(contenusControleCompatibles(undefined, "zones")).toBe(true);
    expect(contenusControleCompatibles("zones", undefined)).toBe(true);
    expect(contenusControleCompatibles(undefined, undefined)).toBe(true);
  });
});
