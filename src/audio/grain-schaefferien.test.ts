// audio/grain-schaefferien.test.ts — Les trois espèces se séparent, et aucun axe seul n'y suffit.
//
// CE FICHIER A ÉTÉ ÉCRIT AVANT LE MODULE, et ce n'est pas une coquetterie de méthode. Le piège de
// ce composant a été nommé au relevé : un descripteur qui ne serait en fait qu'un RUGOSIMÈTRE
// « marcherait » sur tout et ne prouverait rien. Le dépôt a déjà payé cette classe de faute deux
// fois, le passe-bas déguisé des ondelettes et le compresseur de Di Scipio. Le test exigible était
// donc connu d'avance, et il devait être écrit avant qu'un seul chiffre existe, sans quoi il
// aurait été taillé sur ce que le code rend.
//
// LE TEST DES TROIS SONS. Schaeffer tire le grain des trois manières dont un corps entretient sa
// vibration : la résonance donne le grain HARMONIQUE, le frottement le grain COMPACT, l'itération
// le grain DISCONTINU. Trois sons de même durée et de même niveau, un par espèce, doivent se
// ranger en trois places distinctes.
//
// ET LES DEUX CAS DE CONTRÔLE SONT CE QUI COMPTE VRAIMENT. Ils montrent qu'aucun des deux axes ne
// suffit seul, donc que le descripteur n'est pas une grandeur unique déguisée :
//
//   · l'HARMONICITÉ seule confond le frottement et l'itération, tous deux sans hauteur ;
//   · la NETTETÉ de la modulation seule confond la résonance et l'itération, toutes deux modulées
//     à un débit net.
//
// Il faut les deux pour obtenir trois classes, et c'est exactement la figure de Schaeffer.
//
// CE QUE LE DESCRIPTEUR NE DIT PAS, et Schaeffer en fait un principe : des causes différentes
// donnent le même grain, et c'est de là qu'il tire l'écoute réduite. Rien ici ne prétend nommer la
// cause. L'espèce décrit la microstructure perçue de l'entretien, non ce qui l'a produite.
import { describe, expect, it } from "vitest";
import { grainSchaefferien } from "./grain-schaefferien";

const SR = 16000;
const DUREE = 2;

/** Un bruit à bande, de niveau tenu : la matière frottée. L'entretien y est continu. */
function frottement(): Float32Array {
  const n = Math.round(DUREE * SR);
  const x = new Float32Array(n);
  let etat = 24691;
  let lisse = 0;
  for (let i = 0; i < n; i++) {
    etat = (etat * 1103515245 + 12345) >>> 0;
    const blanc = (etat / 4294967296) * 2 - 1;
    // Un passe-bas d'ordre un : la bande est bornée, le niveau reste tenu.
    lisse += 0.25 * (blanc - lisse);
    x[i] = lisse;
  }
  return normaliser(x);
}

/** Un roulement : des chocs identiques à débit régulier. L'entretien y est par percussions répétées. */
function iteration(chocsParSeconde = 20): Float32Array {
  const n = Math.round(DUREE * SR);
  const x = new Float32Array(n);
  const periode = SR / chocsParSeconde;
  const duree = Math.round(0.015 * SR);
  let etat = 13579;
  const choc = new Float32Array(duree);
  for (let k = 0; k < duree; k++) {
    etat = (etat * 1103515245 + 12345) >>> 0;
    choc[k] = ((etat / 4294967296) * 2 - 1) * Math.exp(-8 * (k / duree));
  }
  for (let e = 0; e * periode < n; e++) {
    const debut = Math.round(e * periode);
    for (let k = 0; k < duree && debut + k < n; k++) x[debut + k] += choc[k];
  }
  return normaliser(x);
}

/** Un son tenu qui scintille : des partiels harmoniques dont deux battent. L'entretien y est actif. */
function resonance(battement = 6): Float32Array {
  const n = Math.round(DUREE * SR);
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    let v = 0;
    for (let h = 1; h <= 5; h++) v += Math.sin(2 * Math.PI * 220 * h * t) / h;
    // Un second partiel décalé du battement : le scintillement de Schaeffer.
    v += Math.sin(2 * Math.PI * (440 + battement) * t) / 2;
    x[i] = v;
  }
  return normaliser(x);
}

/** Tous les sons d'essai sortent au même niveau : la comparaison ne porte pas sur un volume. */
function normaliser(x: Float32Array): Float32Array {
  let s = 0;
  for (let i = 0; i < x.length; i++) s += x[i] * x[i];
  const eff = Math.sqrt(s / Math.max(1, x.length));
  const g = eff > 1e-12 ? 0.2 / eff : 0;
  return Float32Array.from(x, (v) => v * g);
}

const mesure = (x: Float32Array) => grainSchaefferien(x, SR);

describe("le grain schaefferien", () => {
  it("LES TROIS SONS D'ESSAI SONT ÉGAUX PAR AILLEURS : même durée, même niveau", () => {
    // Sans cela, la mesure pourrait séparer un volume ou une longueur, et non un grain.
    const sons = [frottement(), iteration(), resonance()];
    for (const s of sons) expect(s.length).toBe(Math.round(DUREE * SR));
    const niveaux = sons.map((s) => {
      let somme = 0;
      for (let i = 0; i < s.length; i++) somme += s[i] * s[i];
      return Math.sqrt(somme / s.length);
    });
    for (const v of niveaux) expect(v).toBeCloseTo(0.2, 3);
  });

  it("LE TÉMOIN : LES TROIS ESPÈCES SE RANGENT EN TROIS PLACES DISTINCTES", () => {
    const f = mesure(frottement());
    const i = mesure(iteration());
    const r = mesure(resonance());
    const dit = `frottement ${f.espece}, itération ${i.espece}, résonance ${r.espece}`;
    expect(f.espece, dit).toBe("compact");
    expect(i.espece, dit).toBe("discontinu");
    expect(r.espece, dit).toBe("harmonique");
  });

  it("LE CONTRÔLE : L'HARMONICITÉ SEULE CONFOND LE FROTTEMENT ET L'ITÉRATION", () => {
    // Tous deux sont sans hauteur : cet axe les met au même endroit, et c'est pourquoi il n'y
    // suffit pas. S'il suffisait, le descripteur ne serait qu'un détecteur de hauteur.
    const f = mesure(frottement());
    const i = mesure(iteration());
    const r = mesure(resonance());
    const dit = `harmonicité : frottement ${f.harmonicite.toFixed(2)},`
      + ` itération ${i.harmonicite.toFixed(2)}, résonance ${r.harmonicite.toFixed(2)}`;
    expect(Math.abs(f.harmonicite - i.harmonicite), dit).toBeLessThan(0.25);
    expect(r.harmonicite, dit).toBeGreaterThan(f.harmonicite + 0.4);
    expect(r.harmonicite, dit).toBeGreaterThan(i.harmonicite + 0.4);
  });

  it("LE CONTRÔLE : LA PROFONDEUR SEULE CONFOND LE FROTTEMENT ET LA RÉSONANCE", () => {
    // Tous deux sont d'entretien continu : cet axe les met au même endroit. Il faut donc bien les
    // DEUX axes pour obtenir trois classes, et c'est l'ordre des trois modes d'entretien.
    const f = mesure(frottement());
    const i = mesure(iteration());
    const r = mesure(resonance());
    const dit = `profondeur : frottement ${f.profondeur.toFixed(3)},`
      + ` itération ${i.profondeur.toFixed(3)}, résonance ${r.profondeur.toFixed(3)}`;
    expect(Math.abs(f.profondeur - r.profondeur), dit).toBeLessThan(0.1);
    expect(i.profondeur, dit).toBeGreaterThan(f.profondeur * 3);
    expect(i.profondeur, dit).toBeGreaterThan(r.profondeur * 3);
  });

  it("ET LA NETTETÉ NE POUVAIT PAS SERVIR DE PREMIER AXE, ce que le relevé a montré", () => {
    // ELLE A ÉTÉ LE PREMIER AXE, et c'était faux : elle met la RÉSONANCE plus haut que l'itération,
    // donc elle ne sépare pas dans le sens qu'on lui demandait. Le classement ne marchait que parce
    // que l'harmonicité passait d'abord et attrapait la résonance avant elle. Le cas garde la trace
    // du relevé, pour qu'on ne refasse pas le même choix.
    const i = mesure(iteration());
    const r = mesure(resonance());
    const dit = `netteté : itération ${i.nettete.toFixed(2)}, résonance ${r.nettete.toFixed(2)}`;
    expect(r.nettete, dit).toBeGreaterThan(i.nettete);
  });

  it("LE DÉBIT RELEVÉ EST CELUI DES CHOCS, et il se vérifie à la valeur près", () => {
    for (const chocs of [8, 20, 40]) {
      const m = mesure(iteration(chocs));
      expect(m.debit, `${chocs} chocs par seconde, débit relevé ${m.debit.toFixed(1)} Hz`)
        .toBeCloseTo(chocs, 0);
    }
  });

  it("ET CELUI DU SCINTILLEMENT EST LE BATTEMENT", () => {
    for (const battement of [4, 6, 11]) {
      const m = mesure(resonance(battement));
      expect(m.debit, `battement ${battement} Hz, débit relevé ${m.debit.toFixed(1)} Hz`)
        .toBeCloseTo(battement, 0);
    }
  });

  it("LA PROFONDEUR SÉPARE UN GRAIN SERRÉ D'UN GRAIN LÂCHE, à débit égal", () => {
    // Schaeffer range le grain sur une échelle de calibre. La profondeur de modulation en est la
    // mesure : un roulement dont les chocs se recouvrent module moins qu'un roulement aéré.
    const aere = mesure(iteration(8));
    const serre = mesure(iteration(60));
    expect(serre.profondeur, `aéré ${aere.profondeur.toFixed(2)}, serré ${serre.profondeur.toFixed(2)}`)
      .toBeLessThan(aere.profondeur);
  });

  it("UN SILENCE NE PORTE PAS DE GRAIN, et le dire est préférable à rendre une espèce au hasard", () => {
    const m = mesure(new Float32Array(Math.round(DUREE * SR)));
    expect(m.espece).toBe("aucun");
    expect(m.debit).toBe(0);
    expect(m.profondeur).toBe(0);
  });

  it("LE RELEVÉ PORTE SUR L'ENTRETIEN, non sur l'attaque", () => {
    // Le grain est la microstructure de l'entretien : une attaque placée devant ne doit pas le
    // changer. Le même son tenu, précédé d'un claquement, garde son espèce et son débit.
    const tenu = iteration(20);
    const avecAttaque = Float32Array.from(tenu);
    for (let k = 0; k < Math.round(0.01 * SR); k++) avecAttaque[k] = k % 2 ? 0.9 : -0.9;
    const a = mesure(tenu);
    const b = mesure(avecAttaque);
    expect(b.espece).toBe(a.espece);
    expect(b.debit, `${a.debit.toFixed(1)} Hz puis ${b.debit.toFixed(1)} Hz`).toBeCloseTo(a.debit, 0);
  });
});
