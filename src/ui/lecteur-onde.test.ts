// ui/lecteur-onde.test.ts — Le bouton lecture/pause ne doit pas pouvoir se bloquer.
//
// Le défaut signalé : une entrée audio alimente le sélecteur multi-zones, on
// lance la lecture, puis on change le fichier en amont et on relance le run.
// Le bouton restait alors sur « ❚❚ » et plus aucun clic ne relançait la lecture.
import { describe, it, expect } from "vitest";
import { actionBoutonLecture } from "./lecteur-onde";

// Un élément `<audio>` réduit à ce qui compte ici, avec la sémantique du HTML
// reproduite fidèlement : remplacer `src` arrête la lecture **sans prévenir
// personne**. C'est ce silence qui désynchronise l'état React, et c'est donc la
// partie du faux élément qu'il ne faut surtout pas « arranger ».
class FauxAudio {
  paused = true;
  src = "";
  /** Événements émis, pour vérifier lesquels ne le sont PAS. */
  evenements: string[] = [];

  play() { this.paused = false; this.evenements.push("play"); }
  pause() {
    if (this.paused) return;      // pause() sur un élément en pause : sans effet
    this.paused = true;
    this.evenements.push("pause");
  }
  changerSource(src: string) {
    this.src = src;
    this.paused = true;           // ...et aucun événement « pause »
  }
}

describe("la sémantique qu'on reproduit", () => {
  it("changer la source arrête la lecture sans émettre « pause »", () => {
    // Si ce test tombe un jour parce que le faux élément a été « corrigé »,
    // tous les autres deviennent sans objet : c'est de ce silence que vient le
    // défaut, et c'est lui que le faux élément doit imiter.
    const a = new FauxAudio();
    a.play();
    a.changerSource("blob:nouveau");
    expect(a.paused).toBe(true);
    expect(a.evenements).toEqual(["play"]);
  });

  it("pause() sur un élément déjà en pause n'émet rien non plus", () => {
    const a = new FauxAudio();
    a.pause();
    expect(a.evenements).toEqual([]);
  });
});

describe("le cas signalé : la source change en pleine lecture", () => {
  // L'interface croit encore « en lecture » — c'est l'état qu'aucun événement
  // n'est venu corriger.
  const ETAT_AFFICHE_PERIME = true;

  it("un clic relance la lecture au lieu de re-mettre en pause", () => {
    const a = new FauxAudio();
    a.play();
    a.changerSource("blob:nouveau");

    expect(actionBoutonLecture(a.paused, ETAT_AFFICHE_PERIME)).toBe("lire");
  });

  it("l'ancienne règle bloquait le bouton pour de bon", () => {
    // Ce que faisait le code d'origine : décider depuis l'affichage. Reproduit
    // ici pour montrer que le blocage n'était pas une malchance de timing mais
    // un état stable — dix clics n'en sortaient pas.
    const ancienneRegle = (etatAffiche: boolean) => (etatAffiche ? "pause" : "lire");
    const a = new FauxAudio();
    a.play();
    a.changerSource("blob:nouveau");

    for (let clic = 0; clic < 10; clic++) {
      const action = ancienneRegle(ETAT_AFFICHE_PERIME);
      expect(action).toBe("pause");
      if (action === "pause") a.pause();
    }
    expect(a.paused, "l'élément ne redémarre jamais").toBe(true);
    expect(a.evenements, "et aucun événement ne corrige l'état affiché").toEqual(["play"]);
  });

  it("la nouvelle règle en sort dès le premier clic", () => {
    const a = new FauxAudio();
    a.play();
    a.changerSource("blob:nouveau");

    const action = actionBoutonLecture(a.paused, ETAT_AFFICHE_PERIME);
    if (action === "lire") a.play();
    expect(a.paused).toBe(false);
    // Et l'événement qui remet l'affichage d'accord est bien émis.
    expect(a.evenements).toEqual(["play", "play"]);
  });
});

describe("la règle", () => {
  it("ne dépend que de l'élément", () => {
    for (const affiche of [true, false]) {
      expect(actionBoutonLecture(true, affiche), `affiché=${affiche}`).toBe("lire");
      expect(actionBoutonLecture(false, affiche), `affiché=${affiche}`).toBe("pause");
    }
  });

  it("ne fait rien sans élément monté", () => {
    // Le lecteur n'est rendu qu'une fois l'audio décodé : un clic ne peut pas
    // arriver avant, mais rendre « rien » évite d'avoir à le supposer.
    expect(actionBoutonLecture(undefined, true)).toBe("rien");
    expect(actionBoutonLecture(undefined, false)).toBe("rien");
  });
});

describe("un aller-retour ordinaire n'est pas affecté", () => {
  it("alterne lecture et pause tant que la source ne change pas", () => {
    const a = new FauxAudio();
    const cliquer = () => {
      const action = actionBoutonLecture(a.paused, !a.paused);
      if (action === "lire") a.play(); else if (action === "pause") a.pause();
    };
    cliquer(); expect(a.paused).toBe(false);
    cliquer(); expect(a.paused).toBe(true);
    cliquer(); expect(a.paused).toBe(false);
    expect(a.evenements).toEqual(["play", "pause", "play"]);
  });
});
