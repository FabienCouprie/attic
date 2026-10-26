// core/types-au-port.test.ts — Un écart de type se voit, et le fonctionnement normal se tait.
//
// ═══ CE QUE CES CAS TIENNENT ═══
//
// Point 6 d'une revue du dépôt : un composant qui déclare une sortie audio pouvait rendre n'importe
// quoi, et rien ne le disait.
//
// LE CAS LE PLUS IMPORTANT N'EST PAS CELUI QUI ATTRAPE, C'EST CELUI QUI SE TAIT. Un garde qui crie
// sur le fonctionnement ordinaire — un `null` rendu par un composant qui n'a rien produit, un port
// de frontière, un type sans prédicat — s'apprend à ne plus lire, et le jour où il dit vrai personne
// ne l'entend. Quatre cas gardent donc ses silences, et deux ses alertes.
import { describe, expect, it } from "vitest";
import { ecartsDeType, genreDe, signalerEcartsDeType } from "./types-au-port";

/** Un domaine jouet : « nombre » sait ce qu'il est, « opaque » ne déclare rien. */
const TYPES: Record<string, { estDuType?: (v: unknown) => boolean }> = {
  nombre: { estDuType: (v) => typeof v === "number" },
  texte: { estDuType: (v) => typeof v === "string" },
  opaque: {},
};
const typeDe = (id: string) => TYPES[id];

describe("les écarts de type sur une sortie", () => {
  it("UNE VALEUR DU MAUVAIS TYPE EST RELEVÉE, avec le port, la promesse et ce qu'on a reçu", () => {
    const e = ecartsDeType([{ nom: "Sortie", type: "nombre" }], ["pas un nombre"], typeDe);
    expect(e).toEqual([{ rang: 0, port: "Sortie", attendu: "nombre", recu: "string" }]);
  });

  it("et chaque port est jugé sur SA promesse, non sur celle du premier", () => {
    const e = ecartsDeType(
      [{ nom: "A", type: "nombre" }, { nom: "B", type: "texte" }],
      [1, 2], typeDe,
    );
    expect(e.map((x) => x.port), "seul B est en écart").toEqual(["B"]);
  });

  it("UNE VALEUR JUSTE NE DIT RIEN", () => {
    expect(ecartsDeType([{ nom: "A", type: "nombre" }], [42], typeDe)).toEqual([]);
  });

  // ═══ LES QUATRE SILENCES, ET CHACUN A SA RAISON ═══

  it("`null` ET `undefined` NE SONT PAS DES ÉCARTS : un composant sans résultat rend null", () => {
    // Une fiche peut même déclarer `sortieNullePermise`, et un nœud en erreur rend `null`. En faire
    // un écart ferait crier le garde sur le fonctionnement normal du moteur.
    expect(ecartsDeType([{ nom: "A", type: "nombre" }], [null], typeDe)).toEqual([]);
    expect(ecartsDeType([{ nom: "A", type: "nombre" }], [undefined], typeDe)).toEqual([]);
  });

  it("UN PORT SANS VALEUR NON PLUS : un composant peut en rendre moins qu'il n'a de ports", () => {
    expect(ecartsDeType(
      [{ nom: "A", type: "nombre" }, { nom: "B", type: "nombre" }], [1], typeDe,
    )).toEqual([]);
    expect(ecartsDeType([{ nom: "A", type: "nombre" }], undefined, typeDe)).toEqual([]);
  });

  it("UN TYPE SANS PRÉDICAT SE TAIT, et c'est le défaut voulu", () => {
    // Un prédicat FAUX est pire que pas de prédicat. Sept des treize types de flux audio n'en
    // déclarent pas, chacun pour une raison écrite dans l'adaptateur.
    expect(ecartsDeType([{ nom: "A", type: "opaque" }], [{ quoi: 1 }], typeDe)).toEqual([]);
    expect(ecartsDeType([{ nom: "A", type: "inconnu" }], ["x"], typeDe),
      "et un type que personne ne connaît non plus").toEqual([]);
  });

  it("ET UN PORT DE FRONTIÈRE EST ÉCARTÉ : son type n'est pas le sien", () => {
    // Il prend celui du port interne auquel il se relie, de sorte que son `type` déclaré ne promet
    // rien sur son contenu. Le vérifier ferait crier sur tous les méta-composants.
    expect(ecartsDeType([{ nom: "Entrée exposée", type: "frontiere" }], [12345], typeDe)).toEqual([]);
  });

  it("et le genre d'une valeur se nomme sans que le cœur connaisse le domaine", () => {
    expect(genreDe(null)).toBe("null");
    expect(genreDe(undefined)).toBe("undefined");
    expect(genreDe(3)).toBe("number");
    expect(genreDe("x")).toBe("string");
    expect(genreDe(new Float32Array(2)), "le constructeur porte son nom tout seul")
      .toBe("Float32Array");
    expect(genreDe({ a: 1 }), "un objet simple n'a pas de nom utile").toBe("object");
  });

  it("LE SIGNALEMENT ÉCRIT UNE LIGNE PAR ÉCART, et rend la liste pour qui veut la compter", () => {
    const vues: string[] = [];
    const avant = console.error;
    console.error = (m?: unknown) => { vues.push(String(m)); };
    try {
      const e = signalerEcartsDeType("n-1", "mon-composant",
        [{ nom: "Audio", type: "nombre" }], ["oups"], typeDe);
      expect(e).toHaveLength(1);
      expect(vues).toHaveLength(1);
      // LE MESSAGE NOMME LES TROIS CHOSES QU'IL FAUT POUR CHERCHER : le nœud, son composant, son port.
      expect(vues[0]).toContain("n-1");
      expect(vues[0]).toContain("mon-composant");
      expect(vues[0]).toContain("Audio");
      expect(vues[0]).toContain("nombre");
      expect(vues[0]).toContain("string");
    } finally {
      console.error = avant;
    }
  });

  it("et il ne dit RIEN quand tout est juste : un garde bavard ne se lit plus", () => {
    const vues: string[] = [];
    const avant = console.error;
    console.error = (m?: unknown) => { vues.push(String(m)); };
    try {
      signalerEcartsDeType("n-1", "c", [{ nom: "A", type: "nombre" }], [1], typeDe);
      expect(vues).toEqual([]);
    } finally {
      console.error = avant;
    }
  });
});
