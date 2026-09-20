// plugins/instrument-graphe.test.ts — Ce que la fin d'instrument DIT quand tout ne va pas bien.
//
// Le dépliage est éprouvé dans `core/instrument-graphe.test.ts`, l'appariement des rendus aussi. Ce
// qui se joue ici est le MESSAGE, et ce n'est pas cosmétique : « des copies ont échoué, 1 rendu sur
// 18 » envoie chercher un défaut dans la chaîne, alors que le même symptôme vient le plus souvent
// d'un câblage — pas de « Note d'instrument » en amont, donc aucun dépliage. Les deux causes
// demandent deux gestes différents, et le nœud doit donc les distinguer.
import "../audio/polyfill-audiobuffer";
import { describe, expect, it } from "vitest";
import { fiches } from "./instrument-graphe";
import { racinesInstrument } from "../core/instrument-graphe";
import type { Banque } from "../audio/clavier-banque";

const fin = fiches.find((f) => f.id === "instrument-fin")!;
const SR = 8000;

const rendu = (longueur = 800) =>
  new AudioBuffer({ numberOfChannels: 1, length: longueur, sampleRate: SR });

const PARAMS = {
  "Largeur de zone": 2, "Note basse": 21, "Note haute": 108,
  "Boucle de maintien": "Non", "Début de boucle": 50,
};

function contexte(entrees: unknown[], params: Record<string, string | number> = {}) {
  const p = { ...PARAMS, ...params };
  return {
    noeud: { id: "fin", data: { ficheId: "instrument-fin", parametres: p } },
    entrees: () => entrees,
    entree: (i: number) => entrees[i] ?? null,
    paramTexte: (nom: string, defaut: string) => String((p as any)[nom] ?? defaut),
    paramNombre: (nom: string, defaut: number) => Number((p as any)[nom] ?? defaut),
  };
}

/** Les dix-huit notes du réglage par défaut, telles que le dépliage les calcule. */
const RACINES = racinesInstrument({ id: "fin", position: { x: 0, y: 0 }, data: { ficheId: "instrument-fin", parametres: PARAMS } } as any);

describe("Fin d'instrument", () => {
  it("attend bien dix-huit notes au réglage par défaut", () => {
    expect(RACINES.length).toBe(18);
    expect(RACINES[0]).toBe(23);
    expect(RACINES[RACINES.length - 1]).toBe(108);
  });

  it("rassemble les dix-huit rendus en une banque, et le dit", async () => {
    const res = await fin.executer(contexte(RACINES.map(() => rendu())) as any);
    const banque = res.valeurs[0] as unknown as Banque;
    expect(banque.zones.length).toBe(18);
    expect(res.message).toContain("18 notes rendues");
  });

  it("garde la BONNE note pour chaque rendu quand une copie du milieu échoue", async () => {
    // Le défaut corrigé : les rendus survivants étaient collés aux premières racines, si bien que
    // tout ce qui suivait la copie fautive se retrouvait étiqueté un cran trop grave — une banque
    // au bon nombre de zones et aux mauvaises hauteurs, sans que rien ne le signale.
    const entrees: unknown[] = RACINES.map(() => rendu());
    entrees[3] = null;
    const res = await fin.executer(contexte(entrees) as any);
    const banque = res.valeurs[0] as unknown as Banque;
    expect(banque.zones.length).toBe(17);
    expect(banque.zones.map((z) => z.racine)).toEqual(RACINES.filter((r) => r !== RACINES[3]));
    // Et le message NOMME la note manquante : c'est ce qui dit où chercher.
    expect(res.message).toContain(String(RACINES[3]));
    expect(res.message).toContain("17 rendus sur 18");
  });

  it("DISTINGUE un câblage sans dépliage d'une chaîne qui a échoué", async () => {
    // Une seule entrée pour dix-huit notes : le dépliage n'a pas eu lieu. Le nœud refuse de rendre
    // une banque plutôt que d'étiqueter ce rendu « note 23 » sans savoir ce qu'il est.
    const res = await fin.executer(contexte([rendu()]) as any);
    expect(res.valeurs).toEqual([null, null]);
    expect(res.message).toContain("pas été dépliée");
    expect(res.message).toContain("Note d'instrument");
  });

  it("refuse aussi un compte qui ne tombe pas juste — un nœud étranger branché sur la fin", async () => {
    const res = await fin.executer(contexte([...RACINES.map(() => rendu()), rendu()]) as any);
    expect(res.valeurs).toEqual([null, null]);
    expect(res.message).toContain("19");
  });

  it("dit qu'il n'y a rien à rassembler quand aucune copie n'a livré de rendu", async () => {
    const res = await fin.executer(contexte(RACINES.map(() => null)) as any);
    expect(res.valeurs).toEqual([null, null]);
    expect(res.message).toContain("Note d'instrument");
  });

  it("marche sur une seule note — un instrument réglé sur une seule touche", async () => {
    const params = { "Largeur de zone": 2, "Note basse": 60, "Note haute": 60 };
    const res = await fin.executer(contexte([rendu()], params) as any);
    const banque = res.valeurs[0] as unknown as Banque;
    expect(banque.zones.length).toBe(1);
    expect(banque.zones[0].racine).toBe(60);
  });
});
