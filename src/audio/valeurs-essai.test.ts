// audio/valeurs-essai.test.ts — Un type de flux est nourri, ou declare sans valeur, jamais oublie.
//
// CE QUE CE FICHIER EMPECHE, ET C'EST L'ETAT D'OU IL VIENT. Le banc ne savait fabriquer qu'un SON.
// Sur les 367 composants du catalogue qui rendent de l'audio, soixante exigent d'abord autre chose :
// ils etaient hors de portee de `mesurer`, de `comparer` et d'`ecouter`, et rien ne le disait. Un
// composant qu'aucun instrument n'atteint ne figure dans aucun releve — il disparait de la mesure
// en donnant l'impression que la mesure est complete.
//
// LA REGLE EST DONC BINAIRE : chaque type de flux ENREGISTRE porte une valeur d'essai, ou figure
// dans `SANS_VALEUR_DESSAI` avec sa raison. Le cas lit le REGISTRE, non une liste ecrite a cote :
// un seizieme type arrive avec son nom, et il tombe ici tant que personne ne s'est prononce.
import "./polyfill-audiobuffer";
import { describe, expect, it } from "vitest";

import { registre } from "./adaptateur";
import { estSequence } from "./sequence";
import {
  CONTENUS_FABRIQUES, SANS_VALEUR_DESSAI,
  banqueDEssai, midiDEssai, sequenceDEssai, texteDEssai, valeurDEssai,
} from "./valeurs-essai";

/** Un son court, pour les valeurs qui en demandent un. Le banc a le sien, deterministe. */
function son(secondes = 0.2): AudioBuffer {
  const sr = 48000, n = Math.round(sr * secondes);
  const b = new AudioBuffer({ numberOfChannels: 2, length: n, sampleRate: sr });
  for (let c = 0; c < 2; c++) {
    const d = b.getChannelData(c);
    for (let i = 0; i < n; i++) d[i] = 0.4 * Math.sin((2 * Math.PI * 440 * i) / sr);
  }
  return b;
}

describe("les valeurs d'essai", () => {
  it("LA SEQUENCE est un OBJET a notes, et non un tableau nu", () => {
    // LA FORME A ETE LUE CHEZ UN CONSOMMATEUR, NON SUPPOSEE. Un premier jet rendait `Note[]` :
    // `cantor-deplacement` repondait « Aucune sequence a l'entree » sur une sequence qu'il recevait,
    // parce qu'une sequence du domaine est `{ notes, tempo? }` et que `estSequence` le verifie.
    // Quinze composants l'attendent ainsi ; le banc aurait mesure quinze refus.
    const s = sequenceDEssai();
    expect(estSequence(s), "le predicat du domaine doit l'accepter").toBe(true);
    expect(s.notes).toHaveLength(8);
    for (let i = 1; i < s.notes.length; i++) {
      expect(s.notes[i].note, "la gamme monte").toBeGreaterThan(s.notes[i - 1].note);
      expect(s.notes[i].debut, "et les notes ne se chevauchent pas")
        .toBeGreaterThanOrEqual(s.notes[i - 1].fin);
    }
    expect(s.notes[0].note).toBe(60);
    expect(s.notes[7].note).toBe(72);
  });

  it("ET ELLE EST LA MEME DEUX FOIS : deux empreintes ne se comparent pas autrement", () => {
    expect(JSON.stringify(sequenceDEssai())).toBe(JSON.stringify(sequenceDEssai()));
  });

  it("LE MIDI est un vrai fichier, en-tete comprise", async () => {
    const f = midiDEssai();
    const octets = new Uint8Array(await f.arrayBuffer());
    expect(String.fromCharCode(...octets.slice(0, 4)), "l'en-tete MThd d'un fichier MIDI").toBe("MThd");
    expect(octets.length).toBeGreaterThan(40);
  });

  it("LE TEXTE depend du CONTENU declare, et chaque contenu a le sien", () => {
    // Donner la meme chaine aux cinq ferait rendre un refus a quatre d'entre eux : on mesurerait
    // alors un refus et non un composant.
    const rendus = CONTENUS_FABRIQUES.map((c) => texteDEssai(c));
    expect(new Set(rendus).size, "les cinq contenus doivent differer").toBe(CONTENUS_FABRIQUES.length);
    for (const t of rendus) expect(t.length).toBeGreaterThan(10);
    expect(texteDEssai("abc")).toContain("K:C");
    expect(texteDEssai("notation")).toMatch(/^[A-G]\d \d/);
    expect(texteDEssai(undefined).length).toBeGreaterThan(10);
  });

  it("LA BANQUE sert les notes de son etendue, et c'est tout ce qu'on lui demande", () => {
    const b = banqueDEssai(son());
    expect(b.zones.length).toBeGreaterThan(0);
    expect(b.noteBasse).toBe(48);
    expect(b.noteHaute).toBe(72);
  });

  it("L'ACCORDAGE est le tempere a douze degres", () => {
    const a = valeurDEssai("accordage") as { degres: number[] };
    expect(a.degres).toHaveLength(12);
    expect(a.degres[0]).toBe(0);
  });

  it("UNE BANQUE SANS SON NE SE FABRIQUE PAS, et le dire vaut mieux qu'en rendre une vide", () => {
    expect(valeurDEssai("banque")).toBeNull();
    expect(valeurDEssai("banque", undefined, { source: son() })).not.toBeNull();
  });
});

describe("la couverture des types de flux", () => {
  it("CHAQUE TYPE ENREGISTRE est nourri, ou declare sans valeur avec sa raison", () => {
    const types = registre.tousTypesFlux().map((t) => t.id).sort();
    expect(types.length, "le registre doit porter ses types").toBeGreaterThan(10);
    const oublies = types.filter((t) =>
      valeurDEssai(t, undefined, { source: son() }) === null && !(t in SANS_VALEUR_DESSAI));
    expect(oublies, [
      "Ces types de flux n'ont ni valeur d'essai ni raison declaree.",
      "Un composant qui en attend un sort de la portee de `mesurer`, `comparer` et `ecouter`,",
      "et rien ne le dit. Fabriquez-en une, ou inscrivez le type dans SANS_VALEUR_DESSAI",
      "en ecrivant pourquoi.",
    ].join("\n")).toEqual([]);
  });

  it("ET AUCUNE RAISON NE SURVIT A SA VALEUR : la liste des absents ne ment pas", () => {
    // Sans ce garde-fou, un type qui recoit enfin sa valeur resterait declare « sans valeur » pour
    // toujours, et le compte des composants hors de portee resterait faux.
    const encoreAbsents = Object.keys(SANS_VALEUR_DESSAI)
      .filter((t) => valeurDEssai(t, undefined, { source: son() }) !== null);
    expect(encoreAbsents, "Ces types ont une valeur d'essai mais sont encore declares sans.")
      .toEqual([]);
  });

  it("et les types declares sans valeur existent vraiment au registre", () => {
    const types = new Set(registre.tousTypesFlux().map((t) => t.id));
    const fantomes = Object.keys(SANS_VALEUR_DESSAI).filter((t) => !types.has(t));
    expect(fantomes, "Ces types declares sans valeur ne sont plus enregistres.").toEqual([]);
  });
});
