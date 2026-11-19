// ui/moteur/cache.test.ts — Le cache du moteur fait ce que faisaient les appels à la `Map`.
//
// CE QUI DOIT ÊTRE TENU :
//   - `oublierAvecMetas` efface un nœud et les internes de ses métas, à toute profondeur, et rien
//     d'autre : ni un nœud au nom voisin, ni l'interne d'un autre méta. C'est la règle que la remise à
//     zéro écrivait à la main, et la seule de ce fichier qui ne soit pas un appel de `Map` renommé.
//   - et les copies qu'une passe a rattachées au nœud visible : `debut#k::corps` part avec `corps`,
//     `fin@k::noeud` avec `noeud`, et un nœud rattaché à un autre reste. `vider` oublie les
//     rattachements.
//   - `oublier` efface dans l'ordre donné, et un identifiant absent ne lève rien.
//   - `entrees` est le cache lui-même, vu en lecture : une écriture faite après s'y voit.
import { describe, expect, it } from "vitest";

import type { EntreeDeCache } from "../../core/cache-execution";
import { creerCacheDuMoteur } from "./cache";

const entree = (v: string) => ({ valeurs: [v] }) as unknown as EntreeDeCache;

describe("le cache du moteur", () => {
  it("OUBLIE UN NŒUD AVEC LES INTERNES DE SES MÉTAS, et rien d'autre", () => {
    const c = creerCacheDuMoteur();
    for (const id of ["outil", "outil::cd", "outil::sous::ab", "outil2", "outil2::cd", "autre"]) c.ecrire(id, entree(id));
    c.oublierAvecMetas(new Set(["outil"]));
    expect([...c.entrees().keys()]).toEqual(["outil2", "outil2::cd", "autre"]);
  });

  it("OUBLIE LES COPIES QU'UNE PASSE A RATTACHÉES AU NŒUD, que la règle du `::` ne voit pas", () => {
    const c = creerCacheDuMoteur();
    const copies = ["debut#0::corps", "debut#1::corps", "fin@0::note", "fin@0::filtre", "m::debut#0::m::x"];
    for (const id of ["source", ...copies, "fin"]) c.ecrire(id, entree(id));
    c.rattacher(new Map([
      ["debut#0::corps", "corps"], ["debut#1::corps", "corps"], ["fin@0::note", "note"],
      ["fin@0::filtre", "filtre"], ["m::debut#0::m::x", "m"], ["source", "source"],
    ]));
    // LE ↺ DU CORPS ET DU FILTRE, avec leur aval : la fin.
    c.oublierAvecMetas(new Set(["corps", "filtre", "fin"]));
    expect([...c.entrees().keys()]).toEqual(["source", "fin@0::note", "m::debut#0::m::x"]);
    // SANS RATTACHEMENT, la règle du `::` seule : c'est l'aveuglement d'avant.
    c.vider();
    for (const id of copies) c.ecrire(id, entree(id));
    c.oublierAvecMetas(new Set(["corps"]));
    expect([...c.entrees().keys()]).toEqual(copies);
  });

  it("OUBLIE DANS L'ORDRE DONNÉ, sans lever sur un absent, et se vide", () => {
    const c = creerCacheDuMoteur();
    for (const id of ["a", "b", "c"]) c.ecrire(id, entree(id));
    c.oublier(["c", "x", "a"]);
    expect([...c.entrees().keys()]).toEqual(["b"]);
    expect(c.lire("b")).toEqual(entree("b"));
    expect(c.lire("a")).toBeUndefined();
    expect(c.taille()).toBe(1);
    c.vider();
    expect(c.taille()).toBe(0);
  });

  it("REND LE CACHE LUI-MÊME EN LECTURE, et non une copie", () => {
    const c = creerCacheDuMoteur();
    const vue = c.entrees();
    c.ecrire("tard", entree("tard"));
    expect(vue.get("tard")).toEqual(entree("tard"));
  });
});
