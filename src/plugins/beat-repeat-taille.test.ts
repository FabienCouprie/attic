// plugins/beat-repeat-taille.test.ts — La taille offerte reste sous l'intervalle offert.
//
// CE QUE LE RELEVÉ DES NOMENCLATURES AVAIT TROUVÉ, ET LAISSÉ INDÉCIS. Le composant « beat-repeat »
// offre « 1/1 » sur « Intervalle » et s'arrête à « 1/2 » sur « Taille ». Deux listes de divisions
// rythmiques, l'une plus courte que l'autre, sans qu'aucune raison ne soit écrite nulle part : ni
// une valeur manquante à ajouter, ni une borne à tenir, impossible de savoir lequel des deux.
//
// LA MESURE A TRANCHÉ, et contre ce que je croyais. Le calcul n'exclut pas la mesure entière : il
// divise la durée d'une mesure par le dénominateur, et « 1/1 » lui donnerait une longueur comme
// une autre. Mais le segment est capturé AU DÉBUT de l'intervalle, et sa répétition est bornée par
// cet intervalle. Dès que la taille atteint l'intervalle, les échantillons écrits sont exactement
// ceux qu'ils remplacent, et la sortie égale l'entrée au bit près. « 1/1 » sur « Taille » serait
// donc inerte pour TOUS les intervalles offerts, ce que le contrat de composant interdit.
//
// CE QUE CE FICHIER TIENT, ET QUE `audio/effets-temporel.test.ts` NE PEUT PAS TENIR. Celui-là
// mesure la fonction : il montre qu'une taille égale à son intervalle ne change rien, et qu'une
// taille plus courte s'entend. Il ne voit pas les LISTES, qui vivent sur la fiche. Un « 1/1 »
// ajouté à « Taille » le laisserait vert, et le composant offrirait un réglage sans effet.
//
// LA BORNE EST TENUE DEUX FOIS, par l'arithmétique et par le son :
//   1. le plus petit dénominateur de « Taille » dépasse strictement celui de « Intervalle » ;
//   2. chaque valeur offerte sur « Taille » change le son pour au moins un intervalle offert.
// Le premier cas tombe sur la liste, le second sur ce que la liste produit ; ni l'un ni l'autre ne
// se contente de relire la valeur écrite dans la fiche.
import "node-web-audio-api/polyfill.js";
import { describe, expect, it } from "vitest";
import { registre } from "../audio/adaptateur";
import type { ParametreDef } from "../core/types";
import { beatRepeat } from "../audio";

const SR = 44100;
const TEMPO = 60; // Un temps par seconde, donc une mesure par quatre secondes.

const fiche = (registre.tousLesPlugins() as any[]).find((f) => f.id === "beat-repeat");
const parametre = (nom: string): ParametreDef => {
  const p = (fiche?.parametres ?? []).find((q: ParametreDef) => q.nom === nom);
  if (!p) throw new Error(`le composant « beat-repeat » n'offre plus de réglage « ${nom} »`);
  return p;
};

// La même lecture que l'exécuteur : seul le dénominateur compte, et il vaut un à défaut.
const denominateur = (s: string) => {
  const parts = s.split("/");
  return parts.length === 2 ? Math.max(1, Number(parts[1]) || 1) : 1;
};

// Une rampe plutôt qu'un continu : la répétition d'un segment constant ne se verrait pas.
const rampe = (secondes: number): AudioBuffer => {
  const b = new AudioBuffer({ numberOfChannels: 1, length: Math.round(secondes * SR), sampleRate: SR });
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = i / d.length;
  return b;
};

const ecart = (entree: AudioBuffer, sortie: AudioBuffer) => {
  const a = entree.getChannelData(0);
  const b = sortie.getChannelData(0);
  let e = 0;
  for (let i = 0; i < a.length; i++) e = Math.max(e, Math.abs(b[i] - a[i]));
  return e;
};

// Quatre secondes tiennent exactement une mesure à ce tempo, donc un intervalle « 1/1 » entier.
const change = (intervalle: string, taille: string, repetitions = 4) => {
  const entree = rampe(4);
  return ecart(entree, beatRepeat(entree, TEMPO, denominateur(intervalle), denominateur(taille), repetitions, 40, 100));
};

describe("la taille du segment de « beat-repeat »", () => {
  it("RESTE SOUS L'INTERVALLE, ce qui est la raison de l'absence de 1/1", () => {
    const intervalles = (parametre("Intervalle").options ?? []).map(denominateur);
    const tailles = (parametre("Taille").options ?? []).map(denominateur);
    expect(intervalles.length, "le réglage « Intervalle » doit offrir des divisions").toBeGreaterThan(1);
    expect(tailles.length, "le réglage « Taille » doit offrir des divisions").toBeGreaterThan(1);
    // Le plus petit dénominateur est la plus longue durée. Celle de la taille doit rester
    // strictement sous celle de l'intervalle, sans quoi la plus longue taille est inerte partout.
    expect(Math.min(...tailles), "une taille aussi longue que le plus long intervalle serait inerte pour tous les intervalles")
      .toBeGreaterThan(Math.min(...intervalles));
  });

  it("ET CHAQUE VALEUR OFFERTE S'ENTEND, pour au moins un intervalle offert", () => {
    const intervalles = parametre("Intervalle").options ?? [];
    const tailles = parametre("Taille").options ?? [];
    const inertes: string[] = [];
    for (const taille of tailles) {
      const audible = intervalles.some((intervalle) => change(intervalle, taille) > 0.05);
      if (!audible) inertes.push(taille);
    }
    expect(inertes, "ces tailles ne changent le son pour aucun intervalle offert").toEqual([]);
  });

  it("y compris le couple de départ, que personne ne règle avant d'écouter", () => {
    const intervalle = String(parametre("Intervalle").defaut);
    const taille = String(parametre("Taille").defaut);
    expect(change(intervalle, taille), `${taille} sur ${intervalle} doit s'entendre`).toBeGreaterThan(0.05);
  });

  it("alors qu'une mesure entière, la valeur écartée, est inerte sur tous les intervalles", () => {
    // CE CAS DIT POURQUOI LA BORNE EXISTE. Il n'interroge pas la liste, il interroge le calcul sur
    // la valeur que la liste n'offre pas : si elle cessait d'être inerte, la borne cesserait d'être
    // justifiée et les deux cas précédents devraient être réécrits plutôt que subis.
    for (const intervalle of parametre("Intervalle").options ?? []) {
      expect(change(intervalle, "1/1"), `1/1 sur ${intervalle}`).toBe(0);
    }
  });
});
