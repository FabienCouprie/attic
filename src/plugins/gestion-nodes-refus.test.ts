// @vitest-environment jsdom
// plugins/gestion-nodes-refus.test.ts — Le Gestionnaire de nodes dit à la personne qu'un import est refusé.
//
// CE QUE CES CAS EMPÊCHENT, observé dans l'application le 2026-11-20. Un `.zip` dont le manifeste
// porte un identifiant que le registre refuse, un natif figé ou un alias, passait la confirmation,
// et le Gestionnaire rendait « ✓ Composant « filtre » installé » : `installerNode` rendait `true`
// sans lire le refus. Le refus n'était écrit qu'à la console, que personne ne lit dans
// l'application construite. Le composant manquait à la palette, et rien ne disait pourquoi.
//
// LES DEUX LANGUES, parce que le message se compose à l'exécution : ni le registre anglais ni le
// garde des vues ne le voient, et l'anglais se vérifie ici au détecteur du registre.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { configurerRegistreNodes, creerRegistre } from "../core";
import { francais } from "../docs/detecteur-francais";
import { configurerRegistreGestion, fiches } from "./gestion-nodes";

const gestion = fiches.find((f) => f.id === "gestion-nodes")!;

/** Le registre du domaine tel que l'adaptateur le monte : un alias remis, puis le socle figé. */
function registreDuDomaine() {
  const r = creerRegistre<unknown, unknown>({ alias: { filtre: "reponse-filtre" } });
  r.enregistrerTypeFlux({ id: "texte", couleur: "#888", forme: "rond", libelle: "Texte" });
  for (const id of ["reponse-filtre", "reverberation"]) {
    r.enregistrer({
      id, nom: `natif ${id}`, univers: "Essai", famille: "Essai",
      resume: "Un natif d'essai.", resumeEn: "A built-in test plugin.",
      entrees: [], sorties: [{ nom: "Texte", type: "texte" }], parametres: [],
      executer: async () => ({ valeurs: ["natif"] }),
    } as never);
  }
  r.figerLesNatifs();
  configurerRegistreNodes(r);
  configurerRegistreGestion(r as never);
  return r;
}

/** Ce que le pont d'Electron rend d'un `.zip` confirmé, sous l'identifiant qu'on lui donne. */
function pontQuiRend(id: string, sortie = "texte") {
  (window as unknown as { api: unknown }).api = {
    selectionnerNodeZip: async () => "C:/essai/recu.zip",
    importerNodeZip: async () => ({
      ok: true,
      manifest: {
        id, nom: `reçu ${id}`, univers: "Autres", famille: "Essai", resume: "Un nœud reçu.",
        entrees: [], sorties: [{ nom: "Texte", type: sortie }], parametres: [],
      },
      executerCode: "module.exports = async () => ({ valeurs: ['reçu'] });",
      dependencies: [],
    }),
  };
}

/** Lance l'import, « Exécution » sur « Autoriser », comme la personne le ferait. */
async function importer(): Promise<{ erreur?: boolean; message?: string; moteur?: unknown }> {
  const reglages: Record<string, string> = { Action: "Importer", "Exécution": "Autoriser" };
  const ctx = { paramTexte: (nom: string, defaut: string) => reglages[nom] ?? defaut, onProgress: () => {} };
  return await gestion.executer(ctx as never) as never;
}

const CAS = [
  { sorte: "un identifiant natif figé", id: "reverberation", fr: /cet identifiant est celui d'un composant natif/, en: /belongs to a built-in component/ },
  { sorte: "un alias du domaine", id: "filtre", fr: /ancien identifiant de « reponse-filtre »/, en: /former identifier of "reponse-filtre"/ },
] as const;

describe("l'import d'un nœud que le registre refuse", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
    delete (window as unknown as { api?: unknown }).api;
  });

  for (const { sorte, id, fr, en } of CAS) {
    for (const langue of ["fr", "en"] as const) {
      it(`SOUS ${sorte.toUpperCase()} (« ${id} »), en ${langue} : refusé, dit, et la palette n'est pas relue`, async () => {
        registreDuDomaine();
        localStorage.setItem("attic-lang", langue);
        pontQuiRend(id);
        const rendu = await importer();

        expect(rendu.message, "le message ne doit pas annoncer l'installation").not.toMatch(/✓/);
        expect(rendu.message, "il dit pourquoi, dans la langue de la personne").toMatch(langue === "fr" ? fr : en);
        expect(rendu.message).toContain(id);
        expect(rendu.erreur, "un import refusé est une erreur du nœud").toBe(true);
        expect(rendu.moteur, "rien n'est entré au catalogue").toBeUndefined();
        if (langue === "en") expect(francais(rendu.message), rendu.message).toBe(false);
      });
    }
  }

  it("SOUS UN MANIFESTE INVALIDE : refusé et dit, le nombre d'erreurs dans les deux langues", async () => {
    // LE DÉTAIL N'EST QU'EN FRANÇAIS, `core/validation.ts` le composant ainsi : il reste à la console,
    // et l'anglais n'en reçoit pas un mot.
    registreDuDomaine();
    pontQuiRend("mon-noeud", "type-inconnu");
    localStorage.setItem("attic-lang", "fr");
    const fr = await importer();
    expect(fr.erreur).toBe(true);
    expect(fr.message).toMatch(/« mon-noeud » non installé : son manifeste est invalide \(1 erreur\(s\)/);

    localStorage.setItem("attic-lang", "en");
    const en = await importer();
    expect(en.message).toMatch(/"mon-noeud" not installed: its manifest is invalid \(1 error\(s\)/);
    expect(francais(en.message), en.message).toBe(false);
  });

  it("ET UN NŒUD ACCEPTÉ S'ANNONCE TOUJOURS INSTALLÉ, palette relue", async () => {
    registreDuDomaine();
    pontQuiRend("mon-noeud");
    const rendu = await importer();
    expect(rendu.message).toMatch(/^✓ Composant « mon-noeud » installé/);
    expect(rendu.erreur).toBeUndefined();
    expect(rendu.moteur).toEqual({ paletteARelire: true });
  });
});
