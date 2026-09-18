// electron/fermeture-sauvegarde.test.ts — Fermer la fenêtre sans perdre le travail.
//
// La sauvegarde automatique écrit toutes les 30 secondes : entre deux battements, jusqu'à
// une demi-minute de travail ne tient qu'en mémoire, et fermer la fenêtre la perdait. Le
// renderer ne peut pas écrire depuis `beforeunload` — l'écriture passe par IPC, donc elle
// est asynchrone, et la page est déjà partie quand la réponse arrive —, d'où cette
// séquence menée par le processus principal.
//
// Ce que ces tests protègent : la fermeture est retardée UNE fois, le renderer est
// prévenu, et la fenêtre finit toujours par se fermer — même si personne ne répond.
import { describe, it, expect, vi } from "vitest";
import { EventEmitter } from "node:events";
import { createRequire } from "node:module";

const require_ = createRequire(import.meta.url);
const { installerSauvegardeAvantFermeture, DELAI_MAX_MS } = require_("./fermeture-sauvegarde.cjs");

function montage() {
  const fenetre: any = new EventEmitter();
  fenetre.destroy = vi.fn();
  fenetre.webContents = { send: vi.fn() };
  const ipcMain = new EventEmitter();
  const minuteurs: { fn: () => void; delai: number; annule: boolean }[] = [];
  const minuteur = (fn: () => void, delai: number) => {
    const m = { fn, delai, annule: false };
    minuteurs.push(m);
    return m;
  };
  const annulerMinuteur = (m: any) => { if (m) m.annule = true; };
  const etat = installerSauvegardeAvantFermeture({ fenetre, ipcMain, minuteur, annulerMinuteur });
  const fermer = () => {
    const evenement = { defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } };
    fenetre.emit("close", evenement);
    return evenement;
  };
  return { fenetre, ipcMain, minuteurs, etat, fermer };
}

describe("sauvegarde avant fermeture", () => {
  it("retient la fermeture et demande la sauvegarde au renderer", () => {
    const m = montage();
    const evenement = m.fermer();
    expect(evenement.defaultPrevented).toBe(true);
    expect(m.fenetre.webContents.send).toHaveBeenCalledWith("fermeture:sauvegarder");
    expect(m.fenetre.destroy).not.toHaveBeenCalled();
  });

  it("ferme dès que le renderer a fini, et annule le délai de secours", () => {
    const m = montage();
    m.fermer();
    m.ipcMain.emit("fermeture:prete");
    expect(m.fenetre.destroy).toHaveBeenCalledTimes(1);
    expect(m.etat.raison).toBe("sauvegarde");
    expect(m.minuteurs[0].annule).toBe(true);
  });

  it("ferme quand même si le renderer ne répond jamais", () => {
    const m = montage();
    m.fermer();
    expect(m.minuteurs[0].delai).toBe(DELAI_MAX_MS);
    m.minuteurs[0].fn(); // le délai expire
    expect(m.fenetre.destroy).toHaveBeenCalledTimes(1);
    expect(m.etat.raison).toBe("delai");
  });

  it("ne retient pas une deuxième fermeture : on ne piège pas l'utilisateur", () => {
    const m = montage();
    m.fermer();
    const second = m.fermer();
    expect(second.defaultPrevented).toBe(false);
    expect(m.fenetre.webContents.send).toHaveBeenCalledTimes(1);
  });

  it("ne détruit la fenêtre qu'une fois, même si la réponse arrive après le délai", () => {
    const m = montage();
    m.fermer();
    m.minuteurs[0].fn();
    m.ipcMain.emit("fermeture:prete");
    expect(m.fenetre.destroy).toHaveBeenCalledTimes(1);
    expect(m.etat.raison).toBe("delai");
  });

  it("ignore l'accusé d'une AUTRE fenêtre : le canal est partagé", () => {
    const m = montage();
    m.fermer();
    m.ipcMain.emit("fermeture:prete", { sender: { autre: true } });
    expect(m.fenetre.destroy).not.toHaveBeenCalled();
    // Le sien, en revanche, ferme bien.
    m.ipcMain.emit("fermeture:prete", { sender: m.fenetre.webContents });
    expect(m.fenetre.destroy).toHaveBeenCalledTimes(1);
  });

  it("retire son écouteur une fois la fermeture jouée", () => {
    const m = montage();
    m.fermer();
    m.ipcMain.emit("fermeture:prete");
    expect(m.ipcMain.listenerCount("fermeture:prete")).toBe(0);
  });

  it("laisse trois secondes au plus : une fenêtre doit se fermer quand on le demande", () => {
    expect(DELAI_MAX_MS).toBe(3000);
  });
});
