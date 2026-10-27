// electron/resume-node-zip.test.ts — Ce qui est montre avant d'installer un composant recu.
//
// ═══ LE DEFAUT, RELEVE PAR UNE REVUE LE 2026-10-27 ═══
//
// « Le consentement se donne a l'aveugle : le nom du composant, ses ports et son empreinte ne sont
// montres nulle part au moment de dire oui. » La question est desormais posee par le processus
// principal avant toute extraction ; ces cas tiennent ce qu'elle dit.
import { describe, expect, it } from "vitest";
import { createHash } from "crypto";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { resumerManifeste, empreinteDuCode } = require("./resume-node-zip.cjs");

const MANIFESTE = {
  id: "echo-recu", nom: "Écho reçu", nomEn: "Received echo", univers: "Traitement", famille: "Écho",
  entrees: [{ nom: "Audio", type: "audio" }],
  sorties: [{ nom: "Audio", type: "audio" }],
  parametres: [{ nom: "Retard", nomEn: "Delay" }],
  dependencies: ["lamejs"],
};
const CODE = "module.exports = async () => ({ valeurs: [] });";

describe("le resume d'un composant recu, avant son installation", () => {
  it("L'EMPREINTE EST LE SHA-256 DU CODE, EN ENTIER, et non de l'archive", () => {
    const attendu = createHash("sha256").update(CODE, "utf8").digest("hex");
    expect(empreinteDuCode(CODE)).toBe(attendu);
    const r = resumerManifeste(MANIFESTE, CODE, false);
    expect(r.empreinte).toBe(attendu);
    expect(r.detail, "l'empreinte doit se lire en entier pour se comparer").toContain(attendu);
  });

  it("UN SEUL CARACTERE DE CODE CHANGE L'EMPREINTE MONTREE", () => {
    const a = resumerManifeste(MANIFESTE, CODE, false).empreinte;
    const b = resumerManifeste(MANIFESTE, CODE + " ", false).empreinte;
    expect(a).not.toBe(b);
  });

  it("NOMME CE QUI VA S'INSTALLER : nom, identifiant, ports, reglages, dependances", () => {
    const fr = resumerManifeste(MANIFESTE, CODE, false).detail;
    for (const attendu of ["Écho reçu", "echo-recu", "Entrées : Audio", "Sorties : Audio", "Réglages : Retard", "lamejs"]) {
      expect(fr, `le resume ne dit pas « ${attendu} »`).toContain(attendu);
    }
    const en = resumerManifeste(MANIFESTE, CODE, true).detail;
    expect(en).toContain("Received echo");
    expect(en).toContain("Settings: Delay");
  });

  it("DIT QUE TOUT, SAUF L'EMPREINTE, EST DECLARE PAR L'ARCHIVE : un manifeste porte le nom qu'il veut", () => {
    expect(resumerManifeste(MANIFESTE, CODE, false).detail).toContain("sauf l'empreinte");
    expect(resumerManifeste(MANIFESTE, CODE, true).detail).toContain("except the fingerprint");
  });

  it("ANNULER EST LE SECOND BOUTON, celui que la boite prend par defaut", () => {
    // `main.cjs` pose `defaultId: 1, cancelId: 1` : Entree ou Echap refusent, jamais n'installent.
    expect(resumerManifeste(MANIFESTE, CODE, false).boutons).toEqual(["Installer", "Annuler"]);
    expect(resumerManifeste(MANIFESTE, CODE, true).boutons).toEqual(["Install", "Cancel"]);
  });

  it("UN MANIFESTE SANS PORTS NI DEPENDANCES LE DIT, au lieu d'afficher du vide", () => {
    const r = resumerManifeste({ id: "x", nom: "X" }, "", false).detail;
    expect(r).toContain("Entrées : aucun");
    expect(r).toContain("Dépendances : aucune");
  });
});
