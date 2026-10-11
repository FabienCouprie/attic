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
import {
  enveloppe, grainSchaefferien, imagesDePorteuse, residuDePorteuse, SEUIL_ALLURE, SEUIL_RELIEF,
  PORTEUSE_SUR_DEBIT, SEUIL_TENUE, DEBIT_MAX, gainDuSuiveur,
} from "./grain-schaefferien";

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

/**
 * Un son tenu qui scintille : des partiels harmoniques dont deux battent. L'entretien y est actif.
 *
 * LE BATTEMENT PAR DÉFAUT ÉTAIT À 6 Hz, ET C'ÉTAIT UN TÉMOIN FAUX. Un battement à 6 Hz se SUIT à
 * l'oreille : c'est une allure, critère de forme, et non un grain, critère de matière. Le témoin de
 * l'espèce harmonique porte donc maintenant son battement dans la bande de rugosité, et les
 * battements lents servent de témoins à l'allure, qui est ce qu'ils sont.
 *
 * LE CHANGEMENT NE DÉPLACE RIEN D'AUTRE, et c'est ce qui le rend sûr : à 6 Hz comme à 40, ce son
 * donne la même profondeur à trois millièmes près et la même harmonicité à six. Seul son débit
 * change, ce qui est exactement la grandeur en cause.
 */
function resonance(battement = 40): Float32Array {
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

/**
 * Un entretien continu modulé par une IMPULSION périodique, non par un sinus : son spectre de
 * modulation est un peigne. `aigu` dit la brièveté de l'impulsion, `p` sa profondeur.
 */
function peigneModule(fm: number, p: number, aigu: number): Float32Array {
  const n = Math.round(DUREE * SR);
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    let v = 0;
    for (let h = 1; h <= 5; h++) v += Math.sin(2 * Math.PI * 220 * h * t) / h;
    x[i] = (1 - p + p * Math.exp(-aigu * ((t * fm) % 1))) * v;
  }
  return normaliser(x);
}

/** Un bruit passe-bas d'ordre un : `coef` à un le laisse presque blanc, bas il le resserre. */
function bruitLisse(coef: number): Float32Array {
  const n = Math.round(DUREE * SR);
  const x = new Float32Array(n);
  let etat = 24691, l = 0;
  for (let i = 0; i < n; i++) {
    etat = (etat * 1103515245 + 12345) >>> 0;
    l += coef * ((etat / 4294967296) * 2 - 1 - l);
    x[i] = l;
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
      expect(m.debit, `${chocs} chocs par seconde, débit relevé ${m.debit?.toFixed(1)} Hz`)
        .toBeCloseTo(chocs, 0);
    }
  });

  it("ET CELUI DU SCINTILLEMENT EST LE BATTEMENT", () => {
    for (const battement of [25, 40, 70, 100]) {
      const m = mesure(resonance(battement));
      expect(m.debit, `battement ${battement} Hz, débit relevé ${m.debit?.toFixed(1)} Hz`)
        .toBeCloseTo(battement, 0);
    }
  });

  it("UN BATTEMENT LENT N'EST PAS UN GRAIN MAIS UNE ALLURE, et le relevé le nomme", () => {
    // LA FRONTIÈRE EST CELLE DE LA PSYCHOACOUSTIQUE, Schaeffer ne donnant aucun chiffre : la force
    // de fluctuation, qui est la sensation d'une modulation qu'on suit, s'éteint là où la rugosité,
    // qui est celle d'une modulation devenue texture, commence. Le même son, le même scintillement,
    // la même profondeur : seul le débit décide, et c'est ce que le cas vérifie de part en part.
    for (const battement of [4, 6, 11]) {
      const m = mesure(resonance(battement));
      const dit = `battement ${battement} Hz : ${m.espece} / ${m.absence}, débit ${m.debit?.toFixed(1)}`;
      expect(m.espece, dit).toBe("aucun");
      expect(m.absence, dit).toBe("allure");
      // Le débit reste relevé : ce n'est pas la mesure qui manque, c'est le critère qui change.
      expect(m.debit, dit).toBeCloseTo(battement, 0);
    }
    // ET DE PART ET D'AUTRE DU SEUIL, LE MÊME SON CHANGE DE CRITÈRE. Sans ce contrôle, le cas
    // au-dessus passerait aussi si le module refusait TOUT scintillement.
    const dessous = mesure(resonance(SEUIL_ALLURE / 2));
    const dessus = mesure(resonance(SEUIL_ALLURE * 2));
    expect(dessous.absence, `sous le seuil : ${dessous.espece} / ${dessous.absence}`).toBe("allure");
    expect(dessus.espece, `sur le seuil : ${dessus.espece} / ${dessus.absence}`).toBe("harmonique");
    expect(Math.abs(dessous.profondeur - dessus.profondeur), "la profondeur ne doit pas décider ici")
      .toBeLessThan(0.05);
  });

  it("LE GRAIN COMPACT N'A PAS DE DÉBIT, et le frottement en rendait un", () => {
    // LE SOMMET D'UN SPECTRE PLAT EST LE HASARD DU BRUIT : le frottement témoin, qui est un bruit à
    // bande, annonçait un débit de 2,80 Hz. Schaeffer tient justement le grain compact pour celui
    // dont on ne compte pas les grains.
    const f = mesure(frottement());
    expect(f.espece).toBe("compact");
    expect(f.debit, `relief ${f.relief.toFixed(2)}`).toBeNull();
    // ET LE RELIEF EST CE QUI LE DIT, là où la netteté ne pouvait pas : elle ne laisse qu'un facteur
    // 1,9 entre ce frottement et le roulement le plus lche, le relief en laisse 11.
    const lent = mesure(iteration(8));
    expect(lent.debit, "un roulement lâche garde son débit").not.toBeNull();
  });

  it("ET C'EST LE RELIEF QUI LE DIT, LA NETTETÉ NE POUVANT PAS, sur un entretien à modulation en peigne", () => {
    // LA NETTETÉ RAPPORTE LE SOMMET À LA MOYENNE DE LA BANDE, LE RELIEF À SA MÉDIANE, et la
    // différence décide dès que la modulation n'est pas sinusoïdale. Une modulation en impulsions
    // porte son débit ET tous ses harmoniques : ceux-ci relèvent la moyenne autant que le sommet,
    // de sorte que la netteté s'effondre alors que le débit est parfaitement franc. La médiane, qui
    // tombe entre les dents, ne bouge pas.
    //
    // LE CAS EST UN ENTRETIEN CONTINU, et c'est ce qui le rend exigible : l'espèce discontinue
    // déclare son débit sans condition de relief, donc elle ne peut rien montrer ici.
    const m = mesure(peigneModule(25, 0.45, 25));
    const dit = `${m.espece} / ${m.absence}, débit ${m.debit?.toFixed(1)}, netteté ${m.nettete.toFixed(2)}, relief ${m.relief.toFixed(1)}`;
    expect(m.espece, dit).toBe("harmonique");
    expect(m.debit, dit).toBeCloseTo(25, 0);
    expect(m.nettete, `la netteté est SOUS le seuil : ${dit}`).toBeLessThan(SEUIL_RELIEF);
    expect(m.relief, `le relief est bien au-dessus : ${dit}`).toBeGreaterThan(2 * SEUIL_RELIEF);
    // Et le frottement reste sous le seuil par les DEUX mesures : ce n'est pas un seuil mal posé.
    const f = mesure(frottement());
    expect(f.relief, `frottement : relief ${f.relief.toFixed(2)}`).toBeLessThan(SEUIL_RELIEF);
  });

  it("UNE TENUE LISSE EST LE GRAIN NUL, quelle qu'en soit la forme d'onde", () => {
    // Le module rendait « harmonique » avec un débit de 18,7 Hz pour un son qui ne module pas.
    const formes: [string, (t: number) => number][] = [
      ["sinus", (t) => Math.sin(2 * Math.PI * 220 * t)],
      ["carré", (t) => (((t * 220) % 1) < 0.5 ? 1 : -1)],
      ["dents de scie", (t) => 2 * ((t * 220) % 1) - 1],
      ["cinq harmoniques", (t) => { let v = 0; for (let h = 1; h <= 5; h++) v += Math.sin(2 * Math.PI * 220 * h * t) / h; return v; }],
    ];
    for (const [nom, forme] of formes) {
      const n = Math.round(DUREE * SR);
      const x = normaliser(Float32Array.from({ length: n }, (_, i) => forme(i / SR)));
      const m = mesure(x);
      const dit = `${nom} : ${m.espece} / ${m.absence}, profondeur ${m.profondeur.toFixed(4)}`;
      expect(m.espece, dit).toBe("aucun");
      expect(m.absence, dit).toBe("tenue");
    }
  });

  it("ET LE SEUIL DE LA TENUE N'ATTEINT PAS LE GRAIN COMPACT, à aucune hauteur de seuil", () => {
    // C'EST LA RAISON DE NE L'APPLIQUER QU'À L'HARMONIQUE : le grain compact ne tient pas à une
    // modulation d'enveloppe mais au bruit de la matière, de sorte que la profondeur n'en dit rien.
    // LA MARGE EST NULLE DE CE CÔTÉ, et le relevé l'a montré : un bruit presque blanc descend à
    // 0,0491 quand le seuil est à 0,045. L'exemption n'est donc pas un confort, et le cas la vérifie
    // là où elle compte, c'est-à-dire en poussant le seuil BIEN AU-DESSUS de ce bruit.
    const presqueBlanc = bruitLisse(1);
    const brut = mesure(presqueBlanc);
    expect(brut.espece, `au seuil par défaut : ${brut.espece} / ${brut.absence}`).toBe("compact");
    const haut = grainSchaefferien(presqueBlanc, SR, { seuilTenue: 0.5 });
    expect(haut.espece, `à seuil 0,5, profondeur ${haut.profondeur.toFixed(4)}`).toBe("compact");
    // ET LE MÊME SEUIL ATTRAPE BIEN UN ENTRETIEN HARMONIQUE, sans quoi le cas ne montrerait qu'un
    // seuil inerte : c'est l'harmonicité qui exempte, non la hauteur du seuil.
    const scintille = resonance();
    const avant = grainSchaefferien(scintille, SR);
    const apres = grainSchaefferien(scintille, SR, { seuilTenue: 0.5 });
    expect(avant.espece, `scintillation au seuil par défaut : ${avant.espece} / ${avant.absence}`).toBe("harmonique");
    expect(apres.absence, `scintillation à seuil 0,5 : ${apres.espece} / ${apres.absence}`).toBe("tenue");
  });

  it("UN SINUS PUR N'A PAS DE GRAIN, À AUCUNE HAUTEUR, et c'est ce qui était faux", () => {
    // LE DÉFAUT ÉTAIT DANS L'ENVELOPPE. Elle était la valeur efficace de trames jointives longues
    // d'un pas, soit 4,1 ms à 16 kHz : une telle moyenne ONDULE dès que la trame ne couvre pas un
    // nombre entier de périodes. Un sinus pur à 55 Hz, dont la période fait 18 ms, ressortait avec
    // une profondeur de 0,3715 quand le frottement témoin est à 0,089 — le son le plus lisse du
    // relevé était annoncé comme le plus grainé, et rangé en grain compact.
    for (const f of [40, 55, 70, 90, 110, 130, 150, 220, 440, 1000]) {
      const n = Math.round(DUREE * SR);
      const x = normaliser(Float32Array.from({ length: n }, (_, i) => Math.sin((2 * Math.PI * f * i) / SR)));
      const m = mesure(x);
      expect(m.espece, `sinus ${f} Hz : ${m.espece} / ${m.absence}, profondeur ${m.profondeur.toFixed(4)}, débit ${m.debit?.toFixed(1)}`)
        .toBe("aucun");
    }
  });

  it("UNE PORTEUSE TROP GRAVE SE DIT, et son faux débit vaut deux fois elle-même", () => {
    // Le carré d'une porteuse à f tombe à 2f. Sous la coupure du suiveur, ce résidu reste dans la
    // bande des débits et aucun filtrage ne l'en sortira : c'est la limite de la méthode, et elle se
    // déclare. Le suiveur de HAUTEUR ne pouvait pas la voir, son plancher étant à 55 Hz ; c'est la
    // partielle dominante qui la voit, et elle n'a pas de plancher.
    const n = Math.round(DUREE * SR);
    const x = normaliser(Float32Array.from({ length: n }, (_, i) => Math.sin((2 * Math.PI * 55 * i) / SR)));
    const m = mesure(x);
    expect(m.espece).toBe("aucun");
    expect(m.absence, `${m.espece} / ${m.absence}, débit ${m.debit?.toFixed(1)}`).toBe("porteuse");
    expect(m.debit, "le faux débit est bien le résidu de la porteuse").toBeCloseTo(110, 0);
    // ET LA RECONNAISSANCE DEMANDE LES DEUX CONDITIONS : une porteuse basse ne suffit pas, encore
    // faut-il que le débit en soit le double. Sinon on refuserait un grain porté par un son grave.
    // LA CADENCE VIENT DE L'ENVELOPPE ELLE-MÊME, ET NON DE DEUX FOIS LE DÉBIT MAXIMAL. Les deux ne
    // sont pas le même nombre, le pas de décimation étant un entier d'échantillons : à 16 kHz il
    // vaut 67, donc la cadence 238,806 Hz. Plier sur 240 mettait les images à 2,6 Hz de leur place.
    const { cadence } = enveloppe(x, SR);
    expect(cadence, "la cadence réelle, non deux fois le débit maximal").toBeCloseTo(238.806, 2);
    expect(residuDePorteuse(110, 55, cadence), "55 Hz, débit 110 : le résidu").toBe(true);
    expect(residuDePorteuse(40, 55, cadence), "55 Hz, débit 40 : un vrai grain sur un son grave").toBe(false);
    expect(residuDePorteuse(440, 220, cadence), "220 Hz : la porteuse suffit, quoi qu'en dise le débit").toBe(false);
    // ET LES IMAGES SONT CELLES QUE LE RELEVÉ A TROUVÉES : une porteuse harmonique de 220 Hz laisse
    // sa plus basse trace à 18,8 Hz, et c'est à 18,66 que l'artefact était relevé.
    expect(imagesDePorteuse(220, cadence)[0], "la trace de 220 Hz dans la bande").toBeCloseTo(18.81, 1);
  });

  it("UN GRAIN RAPIDE ET PEU PROFOND RESTE UN GRAIN, le plancher suivant la réponse du suiveur", () => {
    // LES CAS NE POUVAIENT PAS LE VOIR : ils éprouvaient le plancher sur des tenues lisses et sur
    // des scintillations à 25 et 40 Hz, où le suiveur laisse encore passer 0,92 et 0,81 de la
    // profondeur. À 70 Hz il n'en laisse que 0,56, et à 100 Hz 0,35.
    //
    // LA PROFONDEUR DE QUINZE POUR CENT EST CHOISIE POUR ÊTRE DANS LE RÉGIME QUI DÉCIDE, et non au
    // hasard : relevée, elle donne 0,0750 à 10 Hz, 0,0609 à 40, mais 0,0427 à 70 et 0,0276 à 100,
    // c'est-à-dire sous un plancher nu de 0,045. Sans la correction, les deux débits rapides
    // ressortiraient en tenue lisse, et plus profond le cas ne montrerait rien.
    //
    // LA MÊME PROFONDEUR DE MODULATION DOIT DONNER LA MÊME ESPÈCE À TOUT DÉBIT, et c'est la forme
    // que ce cas cherche : l'espèce ne doit pas dépendre de ce que le filtre a laissé passer.
    for (const fm of [10, 25, 40, 70, 100]) {
      const n = Math.round(DUREE * SR);
      const p = 0.15;
      const x = normaliser(Float32Array.from({ length: n }, (_, i) => {
        const t = i / SR;
        let v = 0;
        for (let h = 1; h <= 3; h++) v += Math.sin(2 * Math.PI * 330 * h * t) / h;
        return (1 - p + p * (0.5 + 0.5 * Math.sin(2 * Math.PI * fm * t))) * v;
      }));
      const m = mesure(x);
      const dit = `modulation ${fm} Hz à 15 % : ${m.espece} / ${m.absence}, profondeur ${m.profondeur.toFixed(4)},`
        + ` débit ${m.debit?.toFixed(1)}, gain du suiveur ${gainDuSuiveur(fm).toFixed(3)}`;
      expect(m.debit, dit).toBeCloseTo(fm, 0);
      expect(m.espece, dit).toBe(fm < SEUIL_ALLURE ? "aucun" : "harmonique");
      if (fm < SEUIL_ALLURE) expect(m.absence, dit).toBe("allure");
    }
    // ET LA RÉPONSE DÉCROÎT BIEN, sans quoi la correction ne corrigerait rien : quatre cellules
    // d'ordre un coupant à la borne de la bande laissent 0,56 à 70 Hz et 0,35 à 100.
    expect(gainDuSuiveur(70), "à 70 Hz").toBeCloseTo(0.557, 2);
    expect(gainDuSuiveur(100), "à 100 Hz").toBeCloseTo(0.349, 2);
    expect(gainDuSuiveur(4), "à 4 Hz, le filtre ne touche presque rien").toBeGreaterThan(0.99);
  });

  it("LA TRACE D'UNE PORTEUSE HARMONIQUE NE PEUT PAS FABRIQUER UN GRAIN, et c'est ce qui la borne", () => {
    // LE DÉFAUT EST RÉEL ET IL RESTE : le carré d'un son harmonique porte les différences entre ses
    // partiels, qui se replient dans la bande des débits, et la recherche du plus bas sommet franc
    // peut les prendre pour un débit. L'écarter coûterait plus cher, les images d'une porteuse
    // formant un peigne du même pas que les débits cherchés.
    //
    // CE QUI LE BORNE EST L'AMPLITUDE DE LA TRACE, et c'est ce que ce cas met sous contrat : elle
    // reste sous le seuil de tenue, de sorte qu'un son harmonique sans modulation ne reçoit jamais
    // d'espèce. Si cette borne tombait, le composant inventerait un grain à toute note tenue.
    // ET LES DEUX RÉGIMES SONT DISTINGUÉS, parce qu'ils ne sont pas pris par la même garde : sous la
    // frontière de la porteuse, l'artefact est GROS et c'est la garde de porteuse qui l'arrête ;
    // au-dessus, il est petit et c'est le seuil de tenue.
    const frontiere = PORTEUSE_SUR_DEBIT * DEBIT_MAX;
    for (const [f0, rangs] of [[110, 5], [130, 5], [150, 5], [180, 5], [220, 5], [330, 5], [440, 5],
      [220, 1], [220, 10], [440, 10]] as [number, number][]) {
      const n = Math.round(DUREE * SR);
      const x = normaliser(Float32Array.from({ length: n }, (_, i) => {
        const t = i / SR;
        let v = 0;
        for (let h = 1; h <= rangs; h++) v += Math.sin(2 * Math.PI * f0 * h * t) / h;
        return v;
      }));
      const m = mesure(x);
      const dit = `f0 ${f0} Hz, ${rangs} partiels : ${m.espece} / ${m.absence}, profondeur ${m.profondeur.toFixed(4)}, débit ${m.debit?.toFixed(1)}`;
      expect(m.espece, dit).toBe("aucun");
      if (f0 < frontiere) {
        expect(m.absence, dit).toBe("porteuse");
      } else {
        expect(m.absence, dit).toBe("tenue");
        expect(m.profondeur, dit).toBeLessThan(SEUIL_TENUE);
      }
    }
  });

  it("LE GRAIN D'ITÉRATION GARDE SON DÉBIT SOUS LE SEUIL DE L'ALLURE, et l'ordre le dit", () => {
    // LES TROIS REFUS NE VALENT QUE POUR UN ENTRETIEN CONTINU, et la profondeur passe donc avant
    // eux. Un roulement lâche à quatre chocs par seconde est bien une itération, parce qu'entre deux
    // chocs l'enveloppe RETOMBE — c'est ce qui le sépare d'une allure, non son débit.
    for (const chocs of [4, 6, 8, 12]) {
      const m = mesure(iteration(chocs));
      const dit = `${chocs} chocs/s : ${m.espece} / ${m.absence}, débit ${m.debit?.toFixed(1)}, relief ${m.relief.toFixed(1)}`;
      expect(m.espece, dit).toBe("discontinu");
      expect(m.debit, dit).toBeCloseTo(chocs, 0);
      expect(m.debit, "et il est bien sous le seuil de l'allure").toBeLessThan(SEUIL_ALLURE);
      // ET LE RELIEF D'UN ROULEMENT LENT NE SUFFIRAIT PAS À LE DÉCLARER : 7,9 à quatre chocs par
      // seconde contre un seuil de 16, son peigne d'harmoniques relevant la médiane de la bande.
      // C'est pourquoi la garde de relief ne porte pas sur l'espèce discontinue.
      if (chocs <= 4) expect(m.relief, dit).toBeLessThan(SEUIL_RELIEF);
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
    expect(m.absence).toBe("silence");
    expect(m.debit).toBeNull();
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
    const dit = `${a.debit?.toFixed(1)} Hz puis ${b.debit?.toFixed(1)} Hz`;
    expect(a.debit, dit).not.toBeNull();
    expect(b.debit, dit).toBeCloseTo(a.debit as number, 0);
  });
});
