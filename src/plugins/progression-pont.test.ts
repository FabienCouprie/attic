// plugins/progression-pont.test.ts — Une annulation ne part pas dans l'écouteur IPC.
//
// ═══ LA RÉGRESSION QUE CES CAS FERMENT ═══
//
// Le 2026-10-26, `onProgress` s'est mis à LEVER après un arrêt demandé — c'est ce qui rend 74
// exécuteurs interruptibles. Mais onze nœuds du pont relaient l'avancement depuis un écouteur
// `ipcRenderer.on` : l'exception y part À CÔTÉ de la promesse que le composant attend. Elle ne la
// rejette pas, et elle remonte en erreur non rattrapée, une fois par ligne d'avancement.
//
// AVANT CE LOT, L'APPEL ÉTAIT IGNORÉ EN SILENCE. On avait donc troqué un silence contre du bruit,
// sans rien arrêter — une régression, introduite par la réparation d'un autre défaut.
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { ErreurAnnulation } from "../core/annulation";
import { relayerProgression } from "./progression-pont";

const ICI = dirname(fileURLToPath(import.meta.url));

/** Un canal de progression d'essai : on tient le rappel, et l'on sait si l'on s'est débranché. */
function canal() {
  let rappel: ((e: { ligne: string }) => void) | null = null;
  const etat = { debranche: false };
  const pont = (cb: (e: { ligne: string }) => void) => {
    rappel = cb;
    return () => { etat.debranche = true; };
  };
  return { pont, etat, dire: (ligne: string) => rappel?.({ ligne }) };
}

describe("le relais d'avancement d'un moteur externe", () => {
  it("RELAIE LES LIGNES, ce qui est son travail ordinaire", () => {
    const c = canal();
    const vues: string[] = [];
    relayerProgression({ onProgress: (m) => vues.push(m) }, c.pont);
    c.dire("étape 1");
    c.dire("étape 2");
    expect(vues).toEqual(["étape 1", "étape 2"]);
  });

  it("UNE ANNULATION NE S'ÉCHAPPE PAS DANS L'ÉCOUTEUR, et le relais se débranche", () => {
    // C'EST LE CAS QUI NOMME LA RÉGRESSION. Sans lui, l'exception traverse le rappel et sort dans
    // l'écouteur IPC, où personne ne l'attend — une fois par ligne.
    const c = canal();
    relayerProgression({ onProgress: () => { throw new ErreurAnnulation(); } }, c.pont);
    expect(() => c.dire("étape"), "rien ne doit sortir du rappel").not.toThrow();
    expect(c.etat.debranche, "et l'abonnement ne doit pas rester derrière soi").toBe(true);
  });

  it("et plus rien ne passe après, même si le moteur continue de parler", () => {
    // Le processus principal, lui, n'est pas arrêté : il parlera encore. Voir l'en-tête du module,
    // qui dit ce qui manque pour l'arrêter vraiment.
    const c = canal();
    const vues: string[] = [];
    let annuler = false;
    relayerProgression({
      onProgress: (m) => { if (annuler) throw new ErreurAnnulation(); vues.push(m); },
    }, c.pont);
    c.dire("avant");
    annuler = true;
    c.dire("pendant");
    annuler = false;
    c.dire("après");
    expect(vues, "seule la première ligne passe").toEqual(["avant"]);
  });

  it("MAIS UNE VRAIE FAUTE REMONTE : seule l'annulation est avalée", () => {
    // Une erreur tue dans l'œuf vaut moins qu'une erreur bruyante : celle-là est un défaut du
    // composant, et la cacher enverrait chercher la panne ailleurs.
    const c = canal();
    relayerProgression({ onProgress: () => { throw new Error("vraie panne"); } }, c.pont);
    expect(() => c.dire("étape")).toThrow(/vraie panne/);
  });

  it("et sans pont — hors de l'application — il n'y a rien à suivre", () => {
    expect(() => relayerProgression({ onProgress: () => {} }, undefined)()).not.toThrow();
    expect(() => relayerProgression({}, "pas une fonction")()).not.toThrow();
  });

  it("LE RELAIS N'EST ÉCRIT QU'À UN SEUL ENDROIT, et il l'était onze fois", () => {
    // ═══ POURQUOI CETTE RÈGLE ═══
    //
    // Les onze copies étaient identiques au nom du pont près, et c'est la même régression qui s'y
    // répétait. Une douzième la ramènerait sans que rien ne le dise.
    const copies = readdirSync(ICI)
      .filter((n) => n.endsWith(".ts") && !n.endsWith(".test.ts") && n !== "progression-pont.ts")
      .filter((n) => /ctx\.onProgress\?\.\(ligne\)/.test(readFileSync(join(ICI, n), "utf8")));
    expect(copies, [
      "",
      "UN RELAIS D'AVANCEMENT EST ÉCRIT HORS DE SON MODULE.",
      "",
      "Il doit passer par `relayerProgression`, sans quoi une annulation repart dans l'écouteur IPC",
      "et remonte en erreur non rattrapée, une fois par ligne d'avancement.",
      "",
    ].join("\n")).toEqual([]);
  });
});
