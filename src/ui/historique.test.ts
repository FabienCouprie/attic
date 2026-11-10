// ui/historique.test.ts — Instantanés d'annulation qui gardent les médias chargés, et les deux piles
// de Ctrl+Z et de Ctrl+Y.
import "node-web-audio-api/polyfill.js";
import { describe, expect, it, vi } from "vitest";
import {
  annuler, copierPourHistorique, instantane, empiler, noterAction, pilesVides, retablir,
  type EntreeHistorique, type PilesHistorique,
} from "./historique";

describe("copierPourHistorique", () => {
  it("garde un File, un Blob, un AudioBuffer et un tableau typé par référence — JSON les réduisait à {}", () => {
    const fichier = new File([new Uint8Array([1, 2, 3])], "piste.wav", { type: "audio/wav" });
    const blob = new Blob(["x"]);
    const tampon = new AudioBuffer({ numberOfChannels: 1, length: 10, sampleRate: 48000 });
    const echantillons = new Float32Array([0.5, -0.5]);
    const data = { audioFichier: fichier, enregistrementBlob: blob, audioResultatBuffer: tampon, signal: echantillons };
    const copie = copierPourHistorique(data);
    expect(copie.audioFichier).toBe(fichier);
    expect(copie.enregistrementBlob).toBe(blob);
    expect(copie.audioResultatBuffer).toBe(tampon);
    expect(copie.signal).toBe(echantillons);
    // Le défaut corrigé, montré sur le même objet :
    expect(JSON.parse(JSON.stringify(data)).audioFichier).toEqual({});
  });

  it("copie en profondeur les objets simples et les tableaux : l'instantané ne bouge plus", () => {
    const n = { id: "n1", position: { x: 1, y: 2 }, data: { parametres: { Gain: 3 }, zones: [{ debut: 0 }] } };
    const copie = copierPourHistorique(n);
    n.position.x = 99;
    n.data.parametres.Gain = 42;
    n.data.zones[0].debut = 7;
    expect(copie).toEqual({ id: "n1", position: { x: 1, y: 2 }, data: { parametres: { Gain: 3 }, zones: [{ debut: 0 }] } });
  });

  it("retire les fonctions, comme le faisait JSON — undo rattache les gestionnaires", () => {
    const copie = copierPourHistorique({ data: { onSupprimerNoeud: () => {}, nom: "Filtre" } });
    expect(copie).toEqual({ data: { nom: "Filtre" } });
  });

  it("supporte un objet qui se référence lui-même", () => {
    const a: Record<string, unknown> = { nom: "a" };
    a.soi = a;
    const copie = copierPourHistorique(a) as Record<string, unknown>;
    expect(copie.soi).toBe(copie);
    expect(copie).not.toBe(a);
  });
});

describe("instantane et empiler", () => {
  it("n'ajoute le contexte que s'il est fourni", () => {
    expect(instantane([{ id: "n" }], [])).not.toHaveProperty("contexte");
    const e = instantane([], [], { pile: [{ metaId: "m", nom: "M" }], racine: { nodes: [{ id: "r" }], edges: [] }, cheminFichier: "C:/w.json" });
    expect(e.contexte).toEqual({ pile: [{ metaId: "m", nom: "M" }], racine: { nodes: [{ id: "r" }], edges: [] }, cheminFichier: "C:/w.json" });
  });

  it("garde au plus `max` entrées en retirant les plus anciennes", () => {
    const pile: EntreeHistorique[] = [];
    for (let i = 0; i < 5; i++) empiler(pile, instantane([{ i }], []), 3);
    expect(pile.map((e) => (e.nodes[0] as { i: number }).i)).toEqual([2, 3, 4]);
  });
});

describe("annuler et rétablir : les deux piles", () => {
  /** Un graphe d'essai, réduit à un nom : c'est ce que chaque instantané photographie. */
  type Etat = { etat: string };
  const photo = (etat: string, contexte = false): EntreeHistorique<Etat, never> =>
    instantane<Etat, never>([{ etat }], [], contexte ? { pile: [], racine: null, cheminFichier: `C:/${etat}.json` } : undefined);
  const nom = (e: EntreeHistorique<Etat, never> | undefined) => e?.nodes[0]?.etat;
  const noms = (pile: EntreeHistorique<Etat, never>[]) => pile.map(nom);

  /** L'atelier d'essai : l'état à l'écran, et ce que les gestes en font, comme le crochet le fait. */
  function atelier(max = 50) {
    const piles: PilesHistorique<Etat, never> = pilesVides();
    let ecran = "A";
    const courant = (avecContexte: boolean) => photo(ecran, avecContexte);
    return {
      piles,
      get ecran() { return ecran; },
      agir(suivant: string, contexte = false) { noterAction(piles, photo(ecran, contexte), max); ecran = suivant; },
      annuler() { const e = annuler(piles, courant); if (e) ecran = nom(e)!; return e; },
      retablir() { const e = retablir(piles, courant); if (e) ecran = nom(e)!; return e; },
    };
  }

  it("RIEN À ANNULER NI À RÉTABLIR : rien ne se rend, et l'état courant n'est pas photographié", () => {
    const piles = pilesVides<Etat, never>();
    const courant = vi.fn(() => photo("A"));
    expect(annuler(piles, courant)).toBeUndefined();
    expect(retablir(piles, courant)).toBeUndefined();
    expect(courant).not.toHaveBeenCalled();
    expect(piles).toEqual({ annulation: [], retablissement: [] });
  });

  it("CTRL+Y REND CE QUE CTRL+Z VIENT DE RETIRER, et Ctrl+Z le reprend", () => {
    const a = atelier();
    a.agir("B");
    a.annuler();
    expect(a.ecran).toBe("A");
    expect(noms(a.piles.retablissement)).toEqual(["B"]);
    a.retablir();
    expect(a.ecran).toBe("B");
    expect(noms(a.piles.annulation)).toEqual(["A"]);
    expect(a.piles.retablissement).toEqual([]);
    a.annuler();
    expect(a.ecran).toBe("A");
  });

  it("PLUSIEURS PAS, DANS LES DEUX SENS, et rien au-delà du dernier", () => {
    const a = atelier();
    a.agir("B");
    a.agir("C");
    a.agir("D");
    a.annuler(); a.annuler(); a.annuler();
    expect(a.ecran).toBe("A");
    expect(a.annuler()).toBeUndefined();
    expect(a.ecran).toBe("A");
    a.retablir();
    expect(a.ecran).toBe("B");
    a.retablir(); a.retablir();
    expect(a.ecran).toBe("D");
    expect(a.retablir()).toBeUndefined();
    expect(a.ecran).toBe("D");
    expect(noms(a.piles.annulation)).toEqual(["A", "B", "C"]);
  });

  it("UNE ACTION NEUVE APRÈS UNE ANNULATION EFFACE CE QUI SE RÉTABLISSAIT", () => {
    const a = atelier();
    a.agir("B");
    a.agir("C");
    a.annuler();
    expect(noms(a.piles.retablissement)).toEqual(["C"]);
    a.agir("X");
    expect(a.piles.retablissement).toEqual([]);
    expect(a.retablir()).toBeUndefined();
    expect(a.ecran).toBe("X");
    a.annuler();
    expect(a.ecran).toBe("B");
  });

  it("LE CONTEXTE SUIT L'ENTRÉE : l'état courant est photographié avec lui quand l'entrée en porte un", () => {
    const a = atelier();
    a.agir("vide", true);
    a.annuler();
    expect(a.piles.retablissement[0].contexte?.cheminFichier).toBe("C:/vide.json");
    a.retablir();
    expect(a.piles.annulation[0].contexte?.cheminFichier).toBe("C:/A.json");
    a.agir("B");
    a.annuler();
    expect(a.piles.retablissement[0]).not.toHaveProperty("contexte");
  });

  it("LES DEUX PILES ENSEMBLE GARDENT AU PLUS `max` ENTRÉES, à chaque geste", () => {
    const a = atelier(3);
    const total = () => a.piles.annulation.length + a.piles.retablissement.length;
    const gestes: (() => unknown)[] = [];
    for (const e of ["B", "C", "D", "E", "F"]) gestes.push(() => a.agir(e));
    gestes.push(() => a.annuler(), () => a.annuler(), () => a.retablir(), () => a.annuler(), () => a.annuler());
    gestes.push(() => a.annuler(), () => a.agir("G"), () => a.annuler(), () => a.retablir(), () => a.retablir());
    for (const geste of gestes) { geste(); expect(total()).toBeLessThanOrEqual(3); }
    expect(a.ecran).toBe("G");
    expect(noms(a.piles.annulation)).toEqual(["C"]);
    a.agir("H"); a.agir("I"); a.agir("J"); a.agir("K");
    expect(noms(a.piles.annulation)).toEqual(["H", "I", "J"]);
    for (let i = 0; i < 4; i++) a.annuler();
    expect(a.ecran).toBe("H");
    expect(noms(a.piles.retablissement)).toEqual(["K", "J", "I"]);
  });
});
