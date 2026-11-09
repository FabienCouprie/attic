// ui/projet-a-ecrire.test.ts — Ce qu'un projet écrit est ce que le crochet écrivait.
//
// LE TÉMOIN EST L'ANCIEN CORPS, recopié de `ui/hooks/usePersistance.ts` sur `bc79523` sans ses
// commentaires, et il garde sa lecture `o.rfInstance?.getViewport()`. Une seule retouche : la liste
// blanche que `detecterPertes` lisait d'elle-même, `CHAMPS_ENREGISTRES`, lui est passée, puisqu'elle
// la reçoit désormais. Chaque cas le fait tourner avec le module sur la même entrée, à la même
// heure, et exige le même fichier, octet pour octet, et le même en-cours.
//
// LA CONSOLE, ELLE, A CHANGÉ EXPRÈS : elle annonçait purgés cinq champs que le fichier écrit. Le
// module doit dire tout ce que l'ancien corps disait, sauf ce que le fichier garde.
//
// ET QUELQUES AFFIRMATIONS DIRECTES, parce qu'une égalité avec un témoin ne dit pas ce que le
// témoin faisait : le numéro de format en tête, les arêtes de substitution écartées, le méta non
// employé laissé dans la bibliothèque, chaque champ enregistré par la table arrivé dans le fichier.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  estSubstitution, metasEmployes, tousLesMetas, FORMAT_PROJET, configurerRegistreMeta, creerRegistre,
  enregistrerMeta, supprimerMeta, type AreteG, type MetaComposant, type NoeudG,
} from "../core";
import { configurerServicesDomaine, oublierServicesDomaine, servicesDomaine } from "../core/services-domaine";
import { CHAMPS_ENREGISTRES } from "../core/saisies";
import { detecterPertes, formaterRapportPertes } from "../core/pertes";
import { serialiserMeta } from "./metasLocaux";
import { projetAEcrire } from "./projet-a-ecrire";

/** L'ancien `buildExportData`, après sa première ligne : le corps tel qu'il était, sa lecture `o` comprise. */
function ancien(racine: { nodes: any[]; edges: any[] }, o: { rfInstance: any }) {
  // ── Détection des pertes de données (Chantier B) ──
  const pertes: { noeud: string; champs: ReturnType<typeof detecterPertes> }[] = [];
  for (const n of racine.nodes) {
    const champsPurges = detecterPertes(n.data as Record<string, unknown>, CHAMPS_ENREGISTRES);
    if (champsPurges.length > 0) {
      pertes.push({ noeud: n.data?.ficheId ?? n.id, champs: champsPurges });
    }
  }
  if (pertes.length > 0) {
    const rapport = formaterRapportPertes(pertes);
    console.warn(`[attic] Données non-sérialisables purgées lors de l'export :\n${rapport}`);
  }

  const cleanNodes = racine.nodes.map(({ id, type, position, width, height, data }) => ({
    id, type, position, width, height,
    data: {
      ficheId: data.ficheId,
      parametres: data.parametres,
      audioNom: data.audioNom,
      audioChemin: data.audioChemin,
      midiNom: data.midiNom,
      imageNom: data.imageNom,
      svgNom: data.svgNom,
      zonesSelectionnees: data.zonesSelectionnees,
      sfzChemin: data.sfzChemin,
      sfzNom: data.sfzNom,
      sequenceNotes: data.sequenceNotes,
      morceaux: data.morceaux,
      portsVisibles: data.portsVisibles,
      portsVisiblesSortie: data.portsVisiblesSortie,
      nomFichier: data.nomFichier,
      nom: data.nom,
      nomEn: data.nomEn,
      couleur: data.couleur,
      bulle: data.bulle,
      bulleOuverte: data.bulleOuverte,
    },
  }));
  const cleanEdges = racine.edges
    .filter((e: { id: string }) => !estSubstitution(e as unknown as AreteG))
    .map(({ id, source, target, sourceHandle, targetHandle, type, style }: any) => ({
      id, source, target, sourceHandle, targetHandle, type, style,
    }));
  const metas = metasEmployes(racine.nodes as unknown as NoeudG[], tousLesMetas()).map(serialiserMeta);
  const json = JSON.stringify({
    formatVersion: FORMAT_PROJET, ...servicesDomaine().reglagesDeProjet(),
    nodes: cleanNodes, edges: cleanEdges, metas, viewport: o.rfInstance?.getViewport(),
  }, null, 2);

  const encours = {
    nodes: cleanNodes.map((n: any) => ({ id: n.id, type: n.type, position: n.position, width: n.width, height: n.height, data: { ficheId: n.data.ficheId, parametres: n.data.parametres, zonesSelectionnees: n.data.zonesSelectionnees, audioChemin: n.data.audioChemin, sfzChemin: n.data.sfzChemin, sfzNom: n.data.sfzNom, sequenceNotes: n.data.sequenceNotes, morceaux: n.data.morceaux,portsVisibles: n.data.portsVisibles, portsVisiblesSortie: n.data.portsVisiblesSortie, nom: n.data.nom, nomEn: n.data.nomEn, couleur: n.data.couleur, bulle: n.data.bulle, bulleOuverte: n.data.bulleOuverte } })),
    edges: cleanEdges.map((e: any) => ({ id: e.id, source: e.source, target: e.target, sourceHandle: e.sourceHandle, targetHandle: e.targetHandle })),
    viewport: o.rfInstance?.getViewport(),
    ...servicesDomaine().reglagesDeProjet(),
    date: new Date().toISOString(),
  };

  return { json, cleanNodes, cleanEdges, encours };
}

const meta = (id: string, sousFiche: string): MetaComposant => ({
  id, nom: id, entrees: [], sorties: [{ nom: "Out 1", type: "audio" }],
  mapEntrees: [], mapSorties: [{ noeudInterne: "a", portIndex: 0 }],
  sousNoeuds: [{ id: "a", position: { x: 0, y: 0 }, data: { ficheId: sousFiche, parametres: {} } }],
  sousAretes: [],
});

/** Un nœud qui porte, avec une valeur reconnaissable, chaque champ que l'ancien corps écrivait. */
const porteur = () => ({
  id: "p", type: "atelier", position: { x: 10, y: 20 }, width: 300, height: 120,
  measured: { width: 300, height: 120 }, selected: true,
  data: {
    ficheId: "generateur-courbe", parametres: { Durée: 8 }, statut: "termine", message: "fini",
    audioNom: "voix.wav", audioChemin: "C:/sons/voix.wav", midiNom: "theme.mid", imageNom: "p.png",
    svgNom: "t.svg", zonesSelectionnees: [{ debut: 0.5, duree: 1 }], sfzChemin: "C:/p.sfz", sfzNom: "p.sfz",
    sequenceNotes: [{ note: 60 }], morceaux: [{ id: "m" }], portsVisibles: 3, portsVisiblesSortie: 2,
    nomFichier: "c.json", nom: "Courbe", nomEn: "Curve", couleur: "#123456", champInconnu: 1,
    onReinitialiser: () => undefined,
  },
});

/** Un graphe qui exerce chaque branche : bulle repliée, arête de substitution, méta employé dans un méta. */
const graphe = () => ({
  nodes: [
    porteur(),
    { id: "b", type: "atelier", position: { x: 0, y: 0 }, data: { ficheId: "bulle::b", parametres: {}, bulleOuverte: false } },
    { id: "e", type: "atelier", position: { x: 5, y: 5 }, data: { ficheId: "echo", parametres: {}, bulle: "b", cacheParBulle: true } },
    { id: "m", type: "atelier", position: { x: 9, y: 9 }, data: { ficheId: "meta-dehors", parametres: {} } },
  ],
  edges: [
    { id: "e1", source: "p", target: "e", sourceHandle: "out:0", targetHandle: "in:0", type: "arete-personnalisee", style: { stroke: "red" }, animated: true },
    { id: "sub::b-e1", source: "p", target: "b", sourceHandle: "out:0", targetHandle: "in:0" },
  ],
});

const VUE = { x: -4, y: 300.75, zoom: 0.5 };

/** Les deux corps, sur la même entrée et à la même heure, avec ce que chacun a dit en console. */
function lesDeux(racine: { nodes: any[]; edges: any[] }, vue: unknown) {
  const avertissements: unknown[][] = [];
  const espion = vi.spyOn(console, "warn").mockImplementation((...a: unknown[]) => { avertissements.push(a); });
  const rfInstance = vue === undefined ? null : { getViewport: () => ({ ...(vue as object) }) };
  const a = ancien(racine, { rfInstance });
  const consoleAncien = avertissements.splice(0);
  const lectures: unknown[] = [];
  const n = projetAEcrire(racine, () => { const v = rfInstance?.getViewport(); lectures.push(v); return v; });
  espion.mockRestore();
  return { a, n, consoleAncien, consoleNouveau: avertissements, lectures };
}

/** Les champs qu'un avertissement nomme, sous la forme `fiche.champ`, dans l'ordre où il les dit. */
function champsNommes(avertissements: unknown[][]): string[] {
  const out: string[] = [];
  for (const a of avertissements) {
    let noeud = "";
    for (const l of String(a[0]).split("\n").slice(1)) {
      const m = /^ {2}• (\S+) \(/.exec(l);
      if (m) out.push(`${noeud}.${m[1]}`); else noeud = l.replace(/:$/, "");
    }
  }
  return out;
}

/** Ce que le fichier garde d'un nœud : les clés d'un nœud propre, qui les porte toutes. */
const gardes = (n: { cleanNodes: { data: object }[] }) => new Set(Object.keys(n.cleanNodes[0].data));

describe("ce qu'un projet écrit", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-08T12:00:00.000Z"));
    configurerRegistreMeta(creerRegistre<unknown, unknown>());
    // Un méta employé qui en emploie un autre, et un méta que rien n'emploie.
    enregistrerMeta(meta("meta-dedans", "oscillateur"));
    enregistrerMeta(meta("meta-dehors", "meta-dedans"));
    enregistrerMeta(meta("meta-libre", "oscillateur"));
  });
  afterEach(() => {
    for (const id of ["meta-dedans", "meta-dehors", "meta-libre"]) supprimerMeta(id);
    oublierServicesDomaine();
    vi.useRealTimers();
  });

  it("REND LE FICHIER ET L'EN-COURS DE L'ANCIEN CORPS, sur un graphe qui exerce chaque branche", () => {
    const { a, n } = lesDeux(graphe(), VUE);
    expect(n.json).toBe(a.json);
    expect(n.encours).toEqual(a.encours);
    expect(n.cleanNodes).toEqual(a.cleanNodes);
    expect(n.cleanEdges).toEqual(a.cleanEdges);
  });

  it("LA CONSOLE DIT CE QUE L'ANCIENNE DISAIT, SAUF LES CHAMPS QUE LE FICHIER GARDE", () => {
    const { n, consoleAncien, consoleNouveau } = lesDeux(graphe(), VUE);
    const avant = champsNommes(consoleAncien);
    const garde = gardes(n);
    expect(avant, "l'ancienne console nommait ces champs gardés : le cas les exerce").toEqual(
      expect.arrayContaining(["generateur-courbe.audioChemin", "generateur-courbe.portsVisibles",
        "generateur-courbe.portsVisiblesSortie", "echo.bulle", "bulle::b.bulleOuverte"]));
    expect(champsNommes(consoleNouveau)).toEqual(avant.filter((c) => !garde.has(c.split(".").pop()!)));
    expect(champsNommes(consoleNouveau), "ce que rien n'écrit reste dit").toEqual(
      expect.arrayContaining(["generateur-courbe.champInconnu", "echo.cacheParBulle"]));
  });

  it("AUCUN CHAMP QUE LE FICHIER GARDE N'EST DIT PERDU, quel que soit le nœud qui le porte", () => {
    const p = porteur();
    const data = p.data as Record<string, unknown>;
    const garde = gardes(projetAEcrire({ nodes: [porteur()], edges: [] }, () => undefined));
    for (const c of garde) data[c] ??= `valeur de ${c}`;
    const avertissements: unknown[][] = [];
    const espion = vi.spyOn(console, "warn").mockImplementation((...a: unknown[]) => { avertissements.push(a); });
    projetAEcrire({ nodes: [p], edges: [] }, () => undefined);
    espion.mockRestore();
    expect(champsNommes(avertissements).filter((c) => garde.has(c.split(".").pop()!)), "gardé par le fichier, dit perdu").toEqual([]);
  });

  it("ET CE FICHIER-LÀ DIT CE QU'IL DOIT : format en tête, ni substitution, ni méta libre, ni champ inconnu", () => {
    const { n } = lesDeux(graphe(), VUE);
    const f = JSON.parse(n.json);
    expect(Object.keys(f)[0]).toBe("formatVersion");
    expect(f.edges.map((e: { id: string }) => e.id)).toEqual(["e1"]);
    expect(f.metas.map((m: { id: string }) => m.id).sort()).toEqual(["meta-dedans", "meta-dehors"]);
    expect(Object.keys(f.nodes[0].data)).not.toContain("champInconnu");
    expect(Object.keys(f.nodes[0].data)).not.toContain("statut");
    expect(f.viewport).toEqual(VUE);
    expect(n.encours.date).toBe("2026-11-08T12:00:00.000Z");
  });

  it("CHAQUE CHAMP QUE LA TABLE ENREGISTRE ARRIVE DANS LE FICHIER, avec sa valeur", () => {
    const p = porteur();
    const data = p.data as Record<string, unknown>;
    for (const c of CHAMPS_ENREGISTRES) data[c] ??= `valeur de ${c}`;
    const f = JSON.parse(projetAEcrire({ nodes: [p], edges: [] }, () => undefined).json);
    const perdus = [...CHAMPS_ENREGISTRES].filter((c) => JSON.stringify(f.nodes[0].data[c]) !== JSON.stringify(data[c]));
    expect(perdus, "enregistré par la table, perdu par le fichier").toEqual([]);
  });

  it("SANS VUE, le fichier n'en porte pas, comme avant", () => {
    const { a, n, lectures } = lesDeux(graphe(), undefined);
    expect(n.json).toBe(a.json);
    expect("viewport" in JSON.parse(n.json)).toBe(false);
    expect(lectures, "la vue est lue deux fois, pour le fichier puis pour l'en-cours").toEqual([undefined, undefined]);
  });

  it("LES RÉGLAGES DU DOMAINE VONT DANS LES DEUX, et le domaine est interrogé autant de fois qu'avant", () => {
    let appels = 0;
    configurerServicesDomaine({ reglagesDeProjet: () => { appels++; return { frequenceDeTravail: 48000 }; } });
    const { a, n } = lesDeux(graphe(), VUE);
    expect(appels, "deux appels par corps, quatre en tout").toBe(4);
    expect(n.json).toBe(a.json);
    expect(n.encours).toEqual(a.encours);
    expect(Object.keys(JSON.parse(n.json)).slice(0, 2)).toEqual(["formatVersion", "frequenceDeTravail"]);
    expect((n.encours as Record<string, unknown>).frequenceDeTravail).toBe(48000);
  });

  it("UN CHAMP QUI NE SE SÉRIALISE PAS EST DIT EN CONSOLE, avec son type", () => {
    const g = graphe();
    (g.nodes[0].data as Record<string, unknown>).audioFichier = new Blob(["x"]);
    (g.nodes[0].data as Record<string, unknown>).tampon = new ArrayBuffer(4);
    const { a, n, consoleNouveau } = lesDeux(g, VUE);
    expect(n.json).toBe(a.json);
    expect(String(consoleNouveau[0]?.[0])).toContain("• tampon (ArrayBuffer)");
    // Le fichier audio se refait depuis son chemin à l'ouverture : il n'est pas une perte.
    expect(champsNommes(consoleNouveau)).not.toContain("generateur-courbe.audioFichier");
  });
});
