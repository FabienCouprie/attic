// plugins/choix-modele-chanson.test.ts — Le choix du débruiteur d'ACE-Step, de la page au fichier.
//
// TROIS TABLES DISENT LA MÊME CHOSE, et c'est leur accord qui est gardé ici : `MODELES_RENDU` dans
// la page (identifiant et paquet), `MODELES` dans le processus principal (identifiant et fichier),
// et le manifeste des modèles (paquet, fichier et nœuds). Qu'une seule diverge, et le nœud choisit
// un modèle que le pont ne connaît pas, ou annonce le téléchargement de celui qu'il n'emploie pas.
//
// ET LE CHOIX DOIT ARRIVER AU PONT : les derniers cas lancent un exécuteur sur un pont factice et
// lisent ce qu'il reçoit, plutôt que de supposer que le réglage déclaré est lu.
import "node-web-audio-api/polyfill.js";
import { afterEach, describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { basename } from "node:path";

import { MODELES_RENDU, paquetsEcartes } from "./chanson-aides";
import { toutesLesFiches } from "./index";
import { formaterOctets } from "../ui/etat-modeles";
import { ctxDEssai } from "../core/contexte-essai";

const { MODELES } = createRequire(import.meta.url)("../../electron/acestep-plan.cjs") as {
  MODELES: Record<string, string>;
};

interface Paquet { id: string; noeuds?: string[]; fichiers?: { chemin: string }[] }
const paquets = (JSON.parse(readFileSync("scripts/modeles-manifest.json", "utf8")) as { modeles: Paquet[] }).modeles;

type Param = { nom: string; optionIds?: string[]; plage?: number[]; defaut?: unknown };
const parametres = (id: string) =>
  ((toutesLesFiches.find((f) => f.id === id) as unknown as { parametres?: Param[] })?.parametres ?? []);

const IDS = MODELES_RENDU.map((m) => m.id);

/** Les fiches qui offrent le choix, relevées par la FORME du réglage et non par une liste de noms. */
const offrantLeChoix = () => toutesLesFiches
  .filter((f) => parametres(f.id).some((p) => p.nom === "Modèle" && p.optionIds?.join("|") === IDS.join("|")))
  .map((f) => f.id).sort();

describe("les trois tables s'accordent", () => {
  it("le choix est offert par les quatre rendus qui peuvent prendre l'un ou l'autre", () => {
    expect(offrantLeChoix()).toEqual(["prolonger-chanson", "rendre-chanson", "reprendre-chanson", "retoucher-chanson"]);
  });

  it("chaque identifiant de la page est connu du processus principal, et lui seul", () => {
    expect([...IDS].sort()).toEqual(Object.keys(MODELES).sort());
  });

  it("chaque paquet porte le fichier que le processus principal nomme", () => {
    for (const m of MODELES_RENDU) {
      const p = paquets.find((x) => x.id === m.paquet);
      expect(p, `paquet ${m.paquet} absent du manifeste`).toBeDefined();
      expect((p!.fichiers ?? []).map((f) => basename(f.chemin)), m.id).toContain(MODELES[m.id]);
    }
  });

  it("chaque nœud qui offre le choix est relié aux deux paquets, sans quoi l'annonce se tairait", () => {
    for (const id of offrantLeChoix()) {
      for (const m of MODELES_RENDU) {
        expect(paquets.find((x) => x.id === m.paquet)?.noeuds, `${id} et ${m.paquet}`).toContain(id);
      }
    }
  });
});

describe("l'annonce ne parle que du débruiteur choisi", () => {
  const ctx = (id: string) => ({ paramTexte: (nom: string, repli: string) => (nom === "Modèle" ? id : repli) });

  it("écarte chaque fois l'autre paquet, et lui seul", () => {
    for (const m of MODELES_RENDU) {
      expect(paquetsEcartes(ctx(m.id))).toEqual(MODELES_RENDU.filter((x) => x.id !== m.id).map((x) => x.paquet));
    }
  });

  it("écarte la base quand rien n'est choisi, le rapide étant le défaut", () => {
    expect(paquetsEcartes(ctx(""))).toEqual(["acestep-debruiteur-base"]);
  });
});

describe("les pas et le glissement suivent le modèle", () => {
  it("partent de zéro sur les quatre rendus, et s'y ouvrent", () => {
    for (const id of offrantLeChoix()) {
      for (const nom of ["Pas de débruitage", "Glissement"]) {
        const p = parametres(id).find((x) => x.nom === nom);
        expect(p?.plage?.[0], `${id} · ${nom}`).toBe(0);
        expect(p?.defaut, `${id} · ${nom}`).toBe(0);
      }
    }
  });

  it("« Accompagner une voix », qui ne tourne que sur la base, garde ses valeurs écrites en clair", () => {
    const pas = parametres("accompagner-voix").find((x) => x.nom === "Pas de débruitage");
    const glissement = parametres("accompagner-voix").find((x) => x.nom === "Glissement");
    expect([pas?.plage, pas?.defaut]).toEqual([[4, 50], 50]);
    expect([glissement?.plage, glissement?.defaut]).toEqual([[0.5, 6], 1]);
  });
});

describe("le choix arrive au pont", () => {
  const recu: Record<string, unknown>[] = [];
  const pont = {
    acestepRendre: async (o: Record<string, unknown>) => { recu.push(o); return { ok: false, journal: "pont factice" }; },
  };
  (globalThis as unknown as { api?: unknown }).api = pont;
  afterEach(() => { recu.length = 0; });

  const contexte = (id: string, entrees: unknown[]) => ctxDEssai(entrees, { "Modèle": id });
  const plan = JSON.stringify({ caption: "une ballade", duration: 4 });
  const fiche = (id: string) => toutesLesFiches.find((f) => f.id === id) as unknown as {
    executer: (ctx: unknown) => Promise<unknown>;
  };

  it("« Rendre une chanson » transmet l'identifiant choisi, et zéro pour les pas et le glissement", async () => {
    for (const id of IDS) {
      await fiche("rendre-chanson").executer(contexte(id, [plan]));
      expect(recu.at(-1)?.modele, id).toBe(id);
      expect([recu.at(-1)?.pas, recu.at(-1)?.shift], id).toEqual([0, 0]);
    }
  });

  it("un rendu qui part d'un audio le transmet aussi, par la lecture commune", async () => {
    const audio = new AudioBuffer({ length: 4800, numberOfChannels: 1, sampleRate: 48000 });
    await fiche("retoucher-chanson").executer(contexte("base", [plan, audio]));
    expect(recu.at(-1)?.modele).toBe("base");
  });

  it("chaque rendu n'annonce que le téléchargement du débruiteur choisi", async () => {
    // L'INVENTAIRE DIT LES DEUX ABSENTS, et c'est ce qui rend le cas discriminant : un nœud qui
    // oublierait d'écarter l'autre annoncerait la somme des deux, près de quatre gigaoctets.
    const absents = paquets.filter((p) => MODELES_RENDU.some((m) => m.paquet === p.id));
    const fenetre = globalThis as unknown as { window?: unknown };
    fenetre.window = { api: { modelesEtat: async () => ({
      complets: 0, total: absents.length, octetsAPrendre: 0, manquants: [], sansAdresse: [],
      modeles: absents.map((p) => ({ ...p, nom: p.id, octets: (p as unknown as { octets: number }).octets,
        complet: false, partiel: false, telechargeable: true })),
    }) } };
    try {
      const audio = new AudioBuffer({ length: 4800, numberOfChannels: 1, sampleRate: 48000 });
      for (const id of offrantLeChoix()) {
        for (const m of MODELES_RENDU) {
          const dits: string[] = [];
          const c = { ...contexte(m.id, [plan, audio]), onProgress: (t: string) => dits.push(t) };
          await fiche(id).executer(c);
          const octets = (absents.find((p) => p.id === m.paquet) as unknown as { octets: number }).octets;
          expect(dits.join(" | "), `${id} sur « ${m.id} »`).toContain(formaterOctets(octets));
        }
      }
    } finally {
      delete fenetre.window;
    }
  });

  it("« Accompagner une voix » n'en transmet aucun, et laisse sa tâche choisir la base", async () => {
    const audio = new AudioBuffer({ length: 4800, numberOfChannels: 1, sampleRate: 48000 });
    await fiche("accompagner-voix").executer(contexte("", [plan, audio]));
    expect(recu.length).toBe(1);
    expect(Object.hasOwn(recu[0], "modele")).toBe(false);
  });
});
