// @vitest-environment jsdom
// core/nodes-installes.test.ts — Quand le code d'un noeud installe s'evalue, et sous quelle condition.
//
// ═══ LE CAS QUI MANQUAIT, ET QUI SE DISAIT ECRIT ═══
//
// `node-essai.test.ts` recopie volontairement la mecanique d'evaluation, et son en-tete promet :
// « si `nodes-installes` change de mecanique, ce cas ne le verra pas tout seul, et c'est pourquoi
// il y a aussi un cas qui tient la FORME de l'appel dans `nodes-installes.ts` ». CE CAS N'EXISTAIT
// PAS. Rien ne lisait ce module, rien n'attachait la copie a l'original.
//
// C'EST LA FAUTE MEME QUE CE DOSSIER DENONCE : une affirmation sur une propriete de securite que
// personne n'avait eprouvee. Le commentaire « Sans window » l'avait deja payee une fois.
//
// ET IL EST ECRIT PAR LE COMPORTEMENT, NON PAR LA FORME. Chercher `new Function` dans une source
// dirait qu'un appel EXISTE, jamais QUAND il a lieu, ce qui est toute la question ici.
import { beforeEach, describe, expect, it } from "vitest";

import { chargerNodesInstalles, configurerRegistreNodes, installerNode } from "./nodes-installes";
import type { PluginDef } from "./types";

/** La trace qu'un code evalue laisse derriere lui, et que rien d'autre ne pose. */
const TEMOIN = "__attic_essai_code_evalue__";

/** Un code de noeud qui MARQUE son evaluation, puis se comporte en noeud ordinaire. */
const CODE_TEMOIN = `
  globalThis["${TEMOIN}"] = (globalThis["${TEMOIN}"] ?? 0) + 1;
  module.exports = async () => ({ valeurs: ["tourne"] });
`;

const noeud = (id: string, consenti?: string) => ({
  manifest: {
    id, nom: id, univers: "Autres", famille: "Essai", resume: "Un noeud d'essai.",
    entrees: [], sorties: [{ nom: "Texte", type: "texte" }], parametres: [],
  },
  executerCode: CODE_TEMOIN,
  consenti,
});

/** Un registre d'essai, reduit a ce que ce module lui demande. */
function registreDEssai() {
  const defs = new Map<string, PluginDef<unknown, unknown>>();
  configurerRegistreNodes({
    enregistrer: (d: PluginDef<unknown, unknown>) => { defs.set(d.id, d); },
    tousLesPlugins: () => [...defs.values()],
    desenregistrer: (id: string) => { defs.delete(id); },
    enregistrerTypeFlux: () => {},
  } as never);
  return defs;
}

const evaluations = () => (globalThis as Record<string, unknown>)[TEMOIN] ?? 0;

describe("l'evaluation du code d'un noeud installe", () => {
  beforeEach(() => {
    (globalThis as Record<string, unknown>)[TEMOIN] = 0;
    localStorage.clear();
  });

  it("N'A PAS LIEU A L'INSTALLATION : la fiche se declare sans que le code soit lu", () => {
    const defs = registreDEssai();
    installerNode(noeud("essai-pose", new Date().toISOString()) as never);
    expect(defs.has("essai-pose"), "la fiche doit etre declaree").toBe(true);
    expect(evaluations(), "mais son code ne doit pas avoir tourne").toBe(0);
  });

  it("NI AU DEMARRAGE, ce qui etait le defaut le plus grave", () => {
    // `ui/App.tsx` appelle `chargerNodesInstalles()` au chargement du module, avant meme que React
    // ne rende : le code d'un noeud recu tournait a CHAQUE lancement, sans action de personne.
    const defs = registreDEssai();
    installerNode(noeud("essai-demarrage", new Date().toISOString()) as never);
    (globalThis as Record<string, unknown>)[TEMOIN] = 0;
    defs.clear();

    // LE COMPTE N'EST PAS LA MESURE : la carte du module survit d'un cas a l'autre, et le stockage
    // porte donc aussi les noeuds installes plus haut. Ce qui compte est qu'on relise, qu'on
    // redeclare, et que rien ne s'evalue.
    expect(chargerNodesInstalles(), "le noeud est bien relu du stockage").toBeGreaterThanOrEqual(1);
    expect(defs.has("essai-demarrage"), "et redeclare").toBe(true);
    expect(evaluations(), "mais rien ne s'evalue au demarrage").toBe(0);
  });

  it("ELLE A LIEU AU PREMIER RUN, et une seule fois", async () => {
    const defs = registreDEssai();
    installerNode(noeud("essai-run", new Date().toISOString()) as never);
    const executer = defs.get("essai-run")!.executer as (c: unknown) => Promise<{ valeurs: string[] }>;

    expect(await executer({}), "le noeud rend ce que son code rend").toEqual({ valeurs: ["tourne"] });
    expect(evaluations(), "une evaluation").toBe(1);
    await executer({});
    await executer({});
    expect(evaluations(), "et pas une de plus : le code n'est lu qu'une fois").toBe(1);
  });

  it("ET SANS CONSENTEMENT, ELLE N'A JAMAIS LIEU : le noeud refuse et le dit", async () => {
    // Un noeud installe avant ce lot n'a pas de consentement. Il se declare — sa fiche, ses ports,
    // ses reglages sont connus —, et il refuse de tourner tant qu'on ne l'a pas reimporte.
    const defs = registreDEssai();
    installerNode(noeud("essai-sans") as never);
    const executer = defs.get("essai-sans")!.executer as (c: unknown) => Promise<{ erreur?: boolean; message?: string }>;

    const rendu = await executer({});
    expect(rendu.erreur, "un refus est un resultat, pas une panne").toBe(true);
    expect(rendu.message, "et il dit quoi faire").toMatch(/Exécution|Execution/);
    expect(evaluations(), "LE CODE N'A PAS TOURNE").toBe(0);
  });

  it("et un refus ne s'use pas : trois lancements, zero evaluation", async () => {
    const defs = registreDEssai();
    installerNode(noeud("essai-tetu") as never);
    const executer = defs.get("essai-tetu")!.executer as (c: unknown) => Promise<unknown>;
    await executer({}); await executer({}); await executer({});
    expect(evaluations()).toBe(0);
  });
});
