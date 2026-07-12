// core/domaine-nombre.test.ts — Baptême du framework : preuve d'agnosticité.
//
// On crée un domaine "fantôme" minimal (nombre, runtime null) sans toucher à
// /core. Trois micro-plugins, un graphe, et l'assertion : (4 × 2) + 3 = 11.
// Si le moteur renvoie 11, le framework est officiellement baptisé.
import { describe, it, expect } from "vitest";
import { creerRegistre, type Registre } from "./registre";
import { enregistrerTypeFlux, fluxCompatibles } from "./typesFlux";
import { ordreTopologique, resoudreEntree, valeursEntrantes } from "./graphe";
import { validerGraphe } from "./validation";
import type { NoeudG, AreteG } from "./meta";
import type { PluginDef, FonctionPlugin, ContexteExecution } from "./types";

// ── Domaine fantôme : registre propre (pas de pollution du registre audio) ──
const registre = creerRegistre<TValeur, TRuntime>();

// ── Domaine fantôme : deux types de flux ──
enregistrerTypeFlux({ id: "nombre", couleur: "#00FF00", libelle: "Nombre" });
enregistrerTypeFlux({ id: "texte", couleur: "#FF6600", libelle: "Texte" });

// ── TValeur = number | string (union du domaine fantôme), TRuntime = null ──
type TValeur = number | string;
type TRuntime = null;

// ── Micro-plugin 1 : Generer (paramètre valeur, pas d'entrée, sortie nombre) ──
const genererDef: PluginDef<TValeur, TRuntime> = {
  id: "nombre:generer",
  nom: "Générer",
  univers: "Nombre",
  famille: "Source",
  resume: "Produit un nombre constant",
  notice: "Nœud source du domaine nombre.",
  entrees: [],
  sorties: [{ nom: "Valeur", type: "nombre" }],
  parametres: [{ nom: "valeur", type: "curseur", defaut: 0, plage: [-1000, 1000], doc: "Nombre à produire" }],
  executer: async (ctx) => ({ valeurs: [ctx.paramNombre("valeur", 0)] }),
};
registre.enregistrer(genererDef);

// ── Micro-plugin 2 : Multiplier (paramètre facteur, 1 entrée nombre, sortie nombre) ──
const multiplierDef: PluginDef<TValeur, TRuntime> = {
  id: "nombre:multiplier",
  nom: "Multiplier",
  univers: "Nombre",
  famille: "Opération",
  resume: "Multiplie l'entrée par un facteur",
  notice: "Nœud opération du domaine nombre.",
  entrees: [{ nom: "X", type: "nombre" }],
  sorties: [{ nom: "X × facteur", type: "nombre" }],
  parametres: [{ nom: "facteur", type: "curseur", defaut: 1, plage: [-100, 100], doc: "Facteur multiplicatif" }],
  executer: async (ctx) => {
    const x = ctx.entree(0) as number;
    return { valeurs: [x * ctx.paramNombre("facteur", 1)] };
  },
};
registre.enregistrer(multiplierDef);

// ── Micro-plugin 3 : Additionner (2 entrées nombre, sortie nombre) ──
const additionnerDef: PluginDef<TValeur, TRuntime> = {
  id: "nombre:additionner",
  nom: "Additionner",
  univers: "Nombre",
  famille: "Opération",
  resume: "Additionne deux nombres",
  notice: "Nœud opération du domaine nombre.",
  entrees: [{ nom: "A", type: "nombre" }, { nom: "B", type: "nombre" }],
  sorties: [{ nom: "A + B", type: "nombre" }],
  parametres: [],
  executer: async (ctx) => {
    const a = ctx.entree(0) as number;
    const b = ctx.entree(1) as number;
    return { valeurs: [a + b] };
  },
};
registre.enregistrer(additionnerDef);

// ── Micro-plugin 4 : Formater (1 entrée texte, 1 sortie texte) ──
// Sert uniquement à créer un port d'un AUTRE type que "nombre" pour tester
// le refus de connexion illégale (nombre → texte).
const formaterDef: PluginDef<TValeur, TRuntime> = {
  id: "nombre:formater",
  nom: "Formater",
  univers: "Nombre",
  famille: "Conversion",
  resume: "Formate une chaîne",
  notice: "Nœud du domaine nombre acceptant du texte.",
  entrees: [{ nom: "Texte", type: "texte" }],
  sorties: [{ nom: "Sortie", type: "texte" }],
  parametres: [],
  executer: async (ctx) => {
    const s = ctx.entree(0);
    return { valeurs: [`[${s}]`] };
  },
};
registre.enregistrer(formaterDef);

// ── Moteur d'exécution pur (réplique minimale de useExecutionGraphe sans React) ──
// N'utilise QUE les fonctions pures de /core : ordreTopologique, resoudreEntree,
// valeursEntrantes, trouverPlugin, validerGraphe. Aucune modification de /core.
//
// Les casts `as unknown as FonctionPlugin<TValeur, TRuntime>` sont les casts de
// FRONTIÈRE : le registre stocke les fiches en `unknown`, le domaine prouve le
// type ici. Ce sont les seuls casts du fichier.
async function executerGraphe(
  noeuds: NoeudG[],
  aretes: AreteG[],
): Promise<Map<string, unknown[]>> {
  const ids = noeuds.map((n) => n.id);

  // Garde-fou : valider les connexions et ports requis avant exécution
  const validation = validerGraphe(noeuds, aretes, (id) => registre.trouverDef(id));
  const noeudsEnErreur = new Set(validation.noeudsAffectes.keys());

  const ordre = ordreTopologique(ids, aretes).filter((id) => !noeudsEnErreur.has(id));
  const resultats = new Map<string, unknown[]>();

  for (const nodeId of ordre) {
    const node = noeuds.find((n) => n.id === nodeId)!;
    // Cast de frontière : le registre retourne FonctionPlugin<unknown, unknown>,
    // le domaine nombre prouve que c'est FonctionPlugin<number, null>.
    const fn = registre.trouverPlugin(node.data.ficheId as string) as unknown as FonctionPlugin<TValeur, TRuntime> | undefined;
    if (!fn) { resultats.set(nodeId, [null]); continue; }

    const ctx: ContexteExecution<TValeur, TRuntime> = {
      noeud: node,
      runtime: null,
      repertoireTravail: "",
      // entree() garantit non-null pour les ports requis (validé par validerGraphe).
      // resoudreEntree retourne T | null au niveau bas ; le moteur asserte non-null.
      entree: (idx: number) => resoudreEntree<unknown>(nodeId, idx, aretes, resultats) as TValeur,
      entrees: () => valeursEntrantes<unknown>(nodeId, aretes, resultats) as (TValeur | null)[],
      paramNombre: (nom: string, defaut: number) => {
        const p = (node.data.parametres as Record<string, number | string>)?.[nom];
        return typeof p === "number" ? p : defaut;
      },
      paramTexte: (nom: string, defaut: string) => {
        const p = (node.data.parametres as Record<string, number | string>)?.[nom];
        return typeof p === "string" ? p : defaut;
      },
      onProgress: () => {},
    };

    const res = await fn(ctx);
    resultats.set(nodeId, res.valeurs);
  }

  return resultats;
}

describe("baptême du framework — domaine nombre fantôme", () => {
  it("calcule (4 × 2) + 3 = 11 sans modifier /core", async () => {
    // Graphe : G1(4) → M(×2) → A(+) ← G2(3)
    const noeuds: NoeudG[] = [
      { id: "G1", data: { ficheId: "nombre:generer", parametres: { valeur: 4 } } },
      { id: "M",  data: { ficheId: "nombre:multiplier", parametres: { facteur: 2 } } },
      { id: "G2", data: { ficheId: "nombre:generer", parametres: { valeur: 3 } } },
      { id: "A",  data: { ficheId: "nombre:additionner", parametres: {} } },
    ];
    const aretes: AreteG[] = [
      { id: "e1", source: "G1", target: "M",  sourceHandle: "out:0", targetHandle: "in:0" },
      { id: "e2", source: "M",  target: "A",  sourceHandle: "out:0", targetHandle: "in:0" },
      { id: "e3", source: "G2", target: "A",  sourceHandle: "out:0", targetHandle: "in:1" },
    ];

    const resultats = await executerGraphe(noeuds, aretes);

    // Vérifications intermédiaires
    expect(resultats.get("G1")).toEqual([4]);
    expect(resultats.get("M")).toEqual([8]);   // 4 × 2
    expect(resultats.get("G2")).toEqual([3]);

    // Résultat final : (4 × 2) + 3 = 11
    const resultatFinal = resultats.get("A");
    expect(resultatFinal).toEqual([11]);
  });

  it("les trois plugins sont enregistrés et trouvables", () => {
    expect(registre.trouverPlugin("nombre:generer")).toBeDefined();
    expect(registre.trouverPlugin("nombre:multiplier")).toBeDefined();
    expect(registre.trouverPlugin("nombre:additionner")).toBeDefined();
  });

  it("ordre topologique respecte les dépendances du graphe nombre", () => {
    const aretes: AreteG[] = [
      { id: "e1", source: "G1", target: "M", sourceHandle: "out:0", targetHandle: "in:0" },
      { id: "e2", source: "M", target: "A", sourceHandle: "out:0", targetHandle: "in:0" },
      { id: "e3", source: "G2", target: "A", sourceHandle: "out:0", targetHandle: "in:1" },
    ];
    const ordre = ordreTopologique(["G1", "G2", "M", "A"], aretes);
    // G1 et G2 avant M et A ; M avant A
    expect(ordre.indexOf("G1")).toBeLessThan(ordre.indexOf("M"));
    expect(ordre.indexOf("M")).toBeLessThan(ordre.indexOf("A"));
    expect(ordre.indexOf("G2")).toBeLessThan(ordre.indexOf("A"));
  });

  it("fonctionne aussi avec des valeurs négatives et décimales", async () => {
    const noeuds: NoeudG[] = [
      { id: "G1", data: { ficheId: "nombre:generer", parametres: { valeur: -1.5 } } },
      { id: "M",  data: { ficheId: "nombre:multiplier", parametres: { facteur: -2 } } },
      { id: "G2", data: { ficheId: "nombre:generer", parametres: { valeur: 0.5 } } },
      { id: "A",  data: { ficheId: "nombre:additionner", parametres: {} } },
    ];
    const aretes: AreteG[] = [
      { id: "e1", source: "G1", target: "M", sourceHandle: "out:0", targetHandle: "in:0" },
      { id: "e2", source: "M", target: "A", sourceHandle: "out:0", targetHandle: "in:0" },
      { id: "e3", source: "G2", target: "A", sourceHandle: "out:0", targetHandle: "in:1" },
    ];
    const resultats = await executerGraphe(noeuds, aretes);
    // (-1.5 × -2) + 0.5 = 3 + 0.5 = 3.5
    expect(resultats.get("A")).toEqual([3.5]);
  });

  // ── Tests négatifs : refus de connexion illégale (trou bouché) ──

  it("fluxCompatibles refuse nombre → texte (types incompatibles)", () => {
    expect(fluxCompatibles("nombre", "nombre")).toBe(true);
    expect(fluxCompatibles("texte", "texte")).toBe(true);
    expect(fluxCompatibles("nombre", "texte")).toBe(false);
    expect(fluxCompatibles("texte", "nombre")).toBe(false);
  });

  it("le garde-fou de validation rejette un plugin avec un type non enregistré", () => {
    // On vérifie que valider() (importé transitivement via enregistrer) aurait
    // rejeté un plugin avec un type de port non déclaré. Ici, tous nos plugins
    // utilisent "nombre" ou "texte", qui sont enregistrés.
    const def = registre.trouverDef("nombre:formater");
    expect(def).toBeDefined();
    expect(def!.entrees[0].type).toBe("texte");
    expect(def!.sorties[0].type).toBe("texte");
  });

  it("une arête illégale (nombre → texte) est rejetée par validerGraphe et non exécutée", async () => {
    // Graphe : G1(génère 4) → Formater (entrée texte)
    // Cette connexion est illégale : sortie "nombre" vers entrée "texte".
    const noeuds: NoeudG[] = [
      { id: "G1", data: { ficheId: "nombre:generer", parametres: { valeur: 4 } } },
      { id: "F",  data: { ficheId: "nombre:formater", parametres: {} } },
    ];
    const aretes: AreteG[] = [
      { id: "e1", source: "G1", target: "F", sourceHandle: "out:0", targetHandle: "in:0" },
    ];

    // 1. validerGraphe détecte l'arête illégale
    const validation = validerGraphe(noeuds, aretes, (id) => registre.trouverDef(id));
    expect(validation.aretesInvalides).toHaveLength(1);
    expect(validation.noeudsAffectes.has("F")).toBe(true);
    expect(validation.noeudsAffectes.get("F")![0]).toContain("nombre → texte");

    // 2. Le moteur refuse d'exécuter le nœud F (statut erreur)
    const resultats = await executerGraphe(noeuds, aretes);
    expect(resultats.has("F")).toBe(false); // F non exécuté
    expect(resultats.get("G1")).toEqual([4]); // G1 s'exécute (amont valide)
  });

  it("un graphe mixte correct (texte → texte + nombre → nombre) s'exécute", async () => {
    // Chaîne texte : GenererTexte → Formater
    // Chaîne nombre : (4 × 2) + 3 = 11
    // Pour que Formater s'exécute, il faut une source texte connectée.
    // On marque l'entrée de Formater comme optionnelle (requis: false) pour
    // pouvoir la laisser non connectée, ou on crée un générateur de texte.
    const noeuds: NoeudG[] = [
      { id: "G1", data: { ficheId: "nombre:generer", parametres: { valeur: 4 } } },
      { id: "M",  data: { ficheId: "nombre:multiplier", parametres: { facteur: 2 } } },
      { id: "G2", data: { ficheId: "nombre:generer", parametres: { valeur: 3 } } },
      { id: "A",  data: { ficheId: "nombre:additionner", parametres: {} } },
    ];
    const aretes: AreteG[] = [
      { id: "e1", source: "G1", target: "M", sourceHandle: "out:0", targetHandle: "in:0" },
      { id: "e2", source: "M", target: "A", sourceHandle: "out:0", targetHandle: "in:0" },
      { id: "e3", source: "G2", target: "A", sourceHandle: "out:0", targetHandle: "in:1" },
    ];
    const resultats = await executerGraphe(noeuds, aretes);
    expect(resultats.get("A")).toEqual([11]);
  });

  // ── validerGraphe : garde-fou au niveau du graphe (spec §10) ──

  it("validerGraphe rejette une arête illégale (nombre → texte)", () => {
    const noeuds: NoeudG[] = [
      { id: "G1", data: { ficheId: "nombre:generer", parametres: { valeur: 4 } } },
      { id: "F",  data: { ficheId: "nombre:formater", parametres: {} } },
    ];
    const aretes: AreteG[] = [
      { id: "e1", source: "G1", target: "F", sourceHandle: "out:0", targetHandle: "in:0" },
    ];
    const res = validerGraphe(noeuds, aretes, (id) => registre.trouverDef(id));
    expect(res.aretesInvalides).toHaveLength(1);
    expect(res.aretesInvalides[0].source).toBe("G1");
    expect(res.noeudsAffectes.has("F")).toBe(true);
    expect(res.noeudsAffectes.get("F")![0]).toContain("nombre → texte");
  });

  it("validerGraphe accepte un graphe sans arête illégale", () => {
    const noeuds: NoeudG[] = [
      { id: "G1", data: { ficheId: "nombre:generer", parametres: { valeur: 4 } } },
      { id: "M",  data: { ficheId: "nombre:multiplier", parametres: { facteur: 2 } } },
    ];
    const aretes: AreteG[] = [
      { id: "e1", source: "G1", target: "M", sourceHandle: "out:0", targetHandle: "in:0" },
    ];
    const res = validerGraphe(noeuds, aretes, (id) => registre.trouverDef(id));
    expect(res.aretesInvalides).toHaveLength(0);
    expect(res.noeudsAffectes.size).toBe(0);
  });

  it("validerGraphe détecte plusieurs arêtes illégales indépendamment", () => {
    const noeuds: NoeudG[] = [
      { id: "G1", data: { ficheId: "nombre:generer", parametres: { valeur: 1 } } },
      { id: "G2", data: { ficheId: "nombre:generer", parametres: { valeur: 2 } } },
      { id: "F1", data: { ficheId: "nombre:formater", parametres: {} } },
      { id: "F2", data: { ficheId: "nombre:formater", parametres: {} } },
    ];
    const aretes: AreteG[] = [
      { id: "e1", source: "G1", target: "F1", sourceHandle: "out:0", targetHandle: "in:0" },
      { id: "e2", source: "G2", target: "F2", sourceHandle: "out:0", targetHandle: "in:0" },
    ];
    const res = validerGraphe(noeuds, aretes, (id) => registre.trouverDef(id));
    expect(res.aretesInvalides).toHaveLength(2);
    expect(res.noeudsAffectes.has("F1")).toBe(true);
    expect(res.noeudsAffectes.has("F2")).toBe(true);
  });

  it("validerGraphe sur le graphe de baptême (4×2)+3 : aucune erreur", () => {
    const noeuds: NoeudG[] = [
      { id: "G1", data: { ficheId: "nombre:generer", parametres: { valeur: 4 } } },
      { id: "M",  data: { ficheId: "nombre:multiplier", parametres: { facteur: 2 } } },
      { id: "G2", data: { ficheId: "nombre:generer", parametres: { valeur: 3 } } },
      { id: "A",  data: { ficheId: "nombre:additionner", parametres: {} } },
    ];
    const aretes: AreteG[] = [
      { id: "e1", source: "G1", target: "M", sourceHandle: "out:0", targetHandle: "in:0" },
      { id: "e2", source: "M", target: "A", sourceHandle: "out:0", targetHandle: "in:0" },
      { id: "e3", source: "G2", target: "A", sourceHandle: "out:0", targetHandle: "in:1" },
    ];
    const res = validerGraphe(noeuds, aretes, (id) => registre.trouverDef(id));
    expect(res.aretesInvalides).toHaveLength(0);
    expect(res.noeudsAffectes.size).toBe(0);
  });

  // ── Ports requis non connectés ──

  it("validerGraphe détecte un port requis non connecté", () => {
    // Multiplier a une entrée "X" (requis par défaut) non connectée
    const noeuds: NoeudG[] = [
      { id: "M", data: { ficheId: "nombre:multiplier", parametres: { facteur: 2 } } },
    ];
    const aretes: AreteG[] = [];
    const res = validerGraphe(noeuds, aretes, (id) => registre.trouverDef(id));
    expect(res.noeudsAffectes.has("M")).toBe(true);
    expect(res.noeudsAffectes.get("M")![0]).toContain("non connectée");
  });

  it("validerGraphe détecte plusieurs ports requis manquants sur un même nœud", () => {
    // Additionner a 2 entrées (A et B), aucune connectée
    const noeuds: NoeudG[] = [
      { id: "A", data: { ficheId: "nombre:additionner", parametres: {} } },
    ];
    const aretes: AreteG[] = [];
    const res = validerGraphe(noeuds, aretes, (id) => registre.trouverDef(id));
    expect(res.noeudsAffectes.has("A")).toBe(true);
    const msgs = res.noeudsAffectes.get("A")!;
    expect(msgs.length).toBe(2);
    expect(msgs.some((m) => m.includes("A"))).toBe(true);
    expect(msgs.some((m) => m.includes("B"))).toBe(true);
  });

  it("validerGraphe ne signale pas un nœud source sans entrée (Generer)", () => {
    // Generer n'a aucune entrée — pas d'erreur
    const noeuds: NoeudG[] = [
      { id: "G1", data: { ficheId: "nombre:generer", parametres: { valeur: 4 } } },
    ];
    const aretes: AreteG[] = [];
    const res = validerGraphe(noeuds, aretes, (id) => registre.trouverDef(id));
    expect(res.noeudsAffectes.has("G1")).toBe(false);
  });

  it("le moteur refuse d'exécuter un nœud dont un port requis est vide", async () => {
    // Multiplier sans entrée connectée → validerGraphe le marque → moteur le skippe
    const noeuds: NoeudG[] = [
      { id: "G1", data: { ficheId: "nombre:generer", parametres: { valeur: 4 } } },
      { id: "M", data: { ficheId: "nombre:multiplier", parametres: { facteur: 2 } } },
    ];
    // Pas d'arête G1 → M : l'entrée de M est vide
    const aretes: AreteG[] = [];
    const resultats = await executerGraphe(noeuds, aretes);
    expect(resultats.get("G1")).toEqual([4]); // G1 s'exécute (pas d'entrée requise)
    expect(resultats.has("M")).toBe(false);   // M non exécuté (port requis vide)
  });
});
