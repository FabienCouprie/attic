// audio/particules.test.ts — La liste d'arguments qui a coûté trois tentatives.
//
// LE TEST QUI COMPTE EST CELUI DE L'ORDRE ET DU COMPTE. `partikkel` prend quarante arguments
// obligatoires — la note d'abandon en annonçait quarante-et-un, et ce test le corrige au passage ;
// une virgule de trop, un rang décalé, et Csound refuse l'orchestre entier par un
// message qui ne nomme pas le coupable — « Unable to find opcode entry for 'partikkel' with
// matching argument types ». C'est exactement ce qui a fait renoncer trois fois. L'ordre du manuel
// est donc recopié ici, à la main, et comparé à celui du module : les deux listes ne peuvent plus
// diverger sans qu'un test tombe.
//
// LE SECOND : LES SIX ARGUMENTS À TAUX AUDIO. Une constante y est refusée par le compilateur. Le
// test vérifie qu'aucun d'eux ne reçoit un nombre, ce qu'aucune relecture ne garantit sur une
// chaîne de quarante valeurs séparées par des virgules.
//
// LE TROISIÈME : LES BORNES DE BOUCLE DES TABLES DE MASQUE. Les valeurs commencent à l'indice 2 ;
// une table écrite sans ces deux bornes décrit autre chose que ce qu'on croit, et le son ne le dit
// pas — mesuré dans l'application, deux mélanges supposés opposés rendaient le même résultat au
// centième de décibel près.
import { describe, expect, it } from "vitest";
import {
  ARGUMENTS_AUDIO, ESPECES, NOMS_ARGUMENTS, POSITIONS_SPATIALES, csNombre, especeTenable,
  CASES_HAUTEUR, HAUTEUR_DEFAUT, compensationLargeur, graineParticules, hauteursPourTable,
  orchestreParticules, partitionParticules, positionsSpatiales, rapportDemiTons,
  tableMasque, type Espece, type ReglagesParticules,
} from "./particules";

/** L'ordre du manuel de Csound, recopié à la main — la seule source qui fasse autorité. */
const ORDRE_DU_MANUEL = [
  "agrainfreq", "kdistribution", "idisttab", "async", "kenv2amt", "ienv2tab", "ienv_attack",
  "ienv_decay", "ksustain_amount", "ka_d_ratio", "kduration", "kamp", "igainmasks", "kwavfreq",
  "ksweepshape", "iwavfreqstarttab", "iwavfreqendtab", "awavfm", "ifmamptab", "kfmenv", "icosine",
  "ktraincps", "knumpartials", "kchroma", "ichannelmasks", "krandommask", "kwaveform1",
  "kwaveform2", "kwaveform3", "kwaveform4", "iwaveamptab", "asamplepos1", "asamplepos2",
  "asamplepos3", "asamplepos4", "kwavekey1", "kwavekey2", "kwavekey3", "kwavekey4", "imax_grains",
];

const REGLAGES: ReglagesParticules = {
  espece: "grains", densite: 60, dureeGrainPc: 50, frequenceHz: 440, transposition: 0,
  partiels: 5, dispersionPc: 0, largeurPc: 0, positionPc: 0, vitesse: 1, dureeSec: 4,
  volumePc: 70, graine: 42, avecSource: false,
};

const avec = (x: Partial<ReglagesParticules>): ReglagesParticules => ({ ...REGLAGES, ...x });

/** Les arguments effectivement passés à l'opcode, dans l'ordre. */
function argumentsDe(orchestre: string): string[] {
  const ligne = orchestre.split("\n").find((l) => l.includes("partikkel"));
  expect(ligne, "l'orchestre doit appeler partikkel").toBeDefined();
  return ligne!.slice(ligne!.indexOf("partikkel") + "partikkel".length).split(",").map((s) => s.trim());
}

describe("la liste d'arguments", () => {
  it("SUIT L'ORDRE DU MANUEL, argument par argument", () => {
    expect([...NOMS_ARGUMENTS]).toEqual(ORDRE_DU_MANUEL);
  });

  it("en compte quarante, ni un de plus ni un de moins", () => {
    expect(NOMS_ARGUMENTS.length).toBe(40);
    for (const e of ESPECES) {
      expect(argumentsDe(orchestreParticules(avec({ espece: e.id as Espece, avecSource: true }))).length, e.id).toBe(40);
    }
  });

  it("ne laisse aucune valeur vide, indéfinie ou impossible", () => {
    for (const e of ESPECES) {
      const orchestre = orchestreParticules(avec({ espece: e.id as Espece, avecSource: true }));
      expect(orchestre, e.id).not.toContain("undefined");
      expect(orchestre, e.id).not.toContain("NaN");
      expect(orchestre, e.id).not.toContain("Infinity");
      for (const a of argumentsDe(orchestre)) expect(a.length, `${e.id} : argument vide`).toBeGreaterThan(0);
    }
  });

  it("LES SIX ARGUMENTS À TAUX AUDIO NE REÇOIVENT JAMAIS DE CONSTANTE", () => {
    for (const e of ESPECES) {
      const args = argumentsDe(orchestreParticules(avec({ espece: e.id as Espece, avecSource: true })));
      for (const nom of ARGUMENTS_AUDIO) {
        const valeur = args[NOMS_ARGUMENTS.indexOf(nom as never)];
        expect(valeur, `${e.id} · ${nom}`).toMatch(/^a[A-Za-z]/);
      }
    }
  });

  it("déclare les variables audio qu'il emploie", () => {
    const orchestre = orchestreParticules(REGLAGES);
    expect(orchestre).toContain("azero init 0");
    expect(orchestre).toContain("agrainfreq interp kdensite");
  });
});

describe("les tables", () => {
  it("PORTENT LEURS DEUX BORNES DE BOUCLE avant la première valeur", () => {
    expect(tableMasque("giX", [1, 0, 0, 0, 0])).toContain("-2, 0, 4, 1.0, 0.0, 0.0, 0.0, 0.0");
  });

  it("LA BORNE DE FIN EST LE RANG DE LA DERNIÈRE VALEUR, jamais un rang de remplissage", () => {
    // Une seule valeur : la boucle ne doit lire QUE celle-là. Une fin à 1 faisait lire le zéro qui
    // suit, et un grain sur deux partait vers rien — constaté au centroïde, dans l'application.
    expect(tableMasque("giX", [4])).toContain("-2, 0, 0, 4.0");
    expect(tableMasque("giX", [1, 2, 3])).toContain("-2, 0, 2, 1.0, 2.0, 3.0");
  });

  it("une table par paquets compte ses PAQUETS, et non ses valeurs", () => {
    // Les amplitudes vont par cinq : une seule rangée de cinq valeurs est un seul paquet.
    expect(tableMasque("giX", [1, 0, 0, 0, 0], 5)).toContain("-2, 0, 0, 1.0, 0.0, 0.0, 0.0, 0.0");
    expect(tableMasque("giX", [1, 0, 0, 0, 0, 0, 1, 0, 0, 0], 5)).toContain("-2, 0, 1, 1.0");
  });

  it("ne sont pas normalisées : un générateur négatif garde les rapports", () => {
    expect(tableMasque("giX", [0.5, 1])).toContain(", -2, ");
  });

  it("prennent une taille en puissance de deux, bornes comprises", () => {
    expect(tableMasque("giX", [1]).split(",")[1].trim()).toBe("0");
    expect(tableMasque("giX", [1, 2, 3, 4, 5, 6, 7, 8]).includes(" 16, -2,")).toBe(true);
  });

  it("le cosinus des trainlets fait plus de deux mille points, comme le manuel l'exige", () => {
    expect(orchestreParticules(REGLAGES)).toContain("giCosinus ftgen 0, 0, 8193, 9, 1, 1, 90");
  });
});

describe("les cinq espèces", () => {
  const argument = (r: ReglagesParticules, nom: string) =>
    argumentsDe(orchestreParticules(r))[NOMS_ARGUMENTS.indexOf(nom as never)];

  it("UN TRAINLET SONNE PAR SON TRAIN, et non par une forme d'onde", () => {
    const orchestre = orchestreParticules(avec({ espece: "trainlets", partiels: 8 }));
    // Cinq amplitudes : les quatre formes d'onde muettes, le trainlet à un.
    expect(orchestre).toContain("giAmplitudes ftgen 0, 0, 8, -2, 0, 0, 0.0, 0.0, 0.0, 0.0, 1.0");
    expect(argument(avec({ espece: "trainlets", partiels: 8 }), "knumpartials")).toBe("8.0");
  });

  it("les autres espèces n'ont pas de trainlet du tout", () => {
    for (const espece of ["grains", "pulsars", "glissons"] as Espece[]) {
      const orchestre = orchestreParticules(avec({ espece }));
      expect(orchestre, espece).toContain("giAmplitudes ftgen 0, 0, 8, -2, 0, 0, 1.0, 0.0, 0.0, 0.0, 0.0");
      expect(argument(avec({ espece }), "knumpartials"), espece).toBe("1.0");
    }
  });

  it("UN GLISSON BALAIE : deux tables de fréquence, et une forme de balayage", () => {
    const r = avec({ espece: "glissons", transposition: 12 });
    expect(argument(r, "iwavfreqstarttab")).toBe("giDebut");
    expect(argument(r, "iwavfreqendtab")).toBe("giFin");
    expect(argument(r, "ksweepshape")).toBe("0.5");
    // Une octave : le rapport d'arrivée vaut deux.
    expect(orchestreParticules(r)).toContain("giFin ftgen 0, 0, 8, -2, 0, 0, 2.0");
  });

  it("sans balayage, les deux tables sont laissées au défaut", () => {
    expect(argument(REGLAGES, "iwavfreqstarttab")).toBe("-1");
    expect(argument(REGLAGES, "ksweepshape")).toBe("0");
  });

  it("UN PULSAR TIENT SA DURÉE DE SA FRÉQUENCE, et non de sa cadence", () => {
    // C'est tout le propos : le formant ne bouge pas quand la fondamentale descend.
    expect(orchestreParticules(avec({ espece: "pulsars", frequenceHz: 800 })))
      .toContain("kduree = 0.5 * 1000 / 800.0");
    expect(orchestreParticules(avec({ espece: "grains" }))).toContain("kduree = 0.5 * 1000 / kdensite");
  });

  it("UNE GRANULATION LIT LE SON BRANCHÉ, et avance à la vitesse demandée", () => {
    const r = avec({ espece: "granulation", avecSource: true, positionPc: 25, vitesse: 0.5 });
    const orchestre = orchestreParticules(r);
    expect(orchestre).toContain('giSource ftgen 0, 0, 0, 1, "entree1.wav", 0, 0, 1');
    expect(orchestre).toContain("idebut = 0.25");
    expect(orchestre).toContain("asamplepos1 line idebut, p3, ifin");
    expect(argument(r, "kwaveform1")).toBe("giSource");
    expect(argument(r, "asamplepos1")).toBe("asamplepos1");
  });

  it("une vitesse nulle fige la lecture — c'est le gel granulaire, cas particulier du modèle", () => {
    expect(orchestreParticules(avec({ espece: "granulation", avecSource: true, vitesse: 0 })))
      .toContain("ifin limit idebut + 0.0 * p3 / idureeSource, 0, 1");
  });

  it("SANS SON BRANCHÉ, LA GRANULATION RETOMBE SUR LES GRAINS plutôt que d'échouer", () => {
    expect(especeTenable(avec({ espece: "granulation", avecSource: false }))).toBe("grains");
    expect(especeTenable(avec({ espece: "granulation", avecSource: true }))).toBe("granulation");
    const orchestre = orchestreParticules(avec({ espece: "granulation", avecSource: false }));
    expect(orchestre).not.toContain("entree1.wav");
    expect(orchestre).toContain("giSinus");
  });
});

describe("l'éparpillement des grains dans l'espace", () => {
  it("À ZÉRO, TOUS LES GRAINS TOMBENT AU CENTRE — et non tous à gauche", () => {
    // Le piège : un masque absent enverrait tout sur la sortie 1, c'est-à-dire à gauche. Le masque
    // est donc toujours écrit, et vaut un demi partout quand la largeur est nulle.
    expect(positionsSpatiales(0, 42)).toEqual(new Array(POSITIONS_SPATIALES).fill(0.5));
    expect(argumentsDe(orchestreParticules(REGLAGES))[NOMS_ARGUMENTS.indexOf("ichannelmasks")]).toBe("giCanaux");
  });

  it("en ouvrant, les positions s'écartent du centre sans sortir du cadre", () => {
    for (const largeur of [10, 50, 100]) {
      const p = positionsSpatiales(largeur, 42);
      expect(p.length, `${largeur} %`).toBe(POSITIONS_SPATIALES);
      for (const v of p) {
        expect(v, `${largeur} %`).toBeGreaterThanOrEqual(0);
        expect(v, `${largeur} %`).toBeLessThanOrEqual(1);
        // L'écart au centre ne peut pas dépasser la moitié de la largeur demandée.
        expect(Math.abs(v - 0.5), `${largeur} %`).toBeLessThanOrEqual(largeur / 200 + 1e-9);
      }
    }
  });

  it("une largeur plus grande écarte davantage, et c'est mesurable", () => {
    const ecart = (largeur: number) =>
      positionsSpatiales(largeur, 7).reduce((s, v) => s + Math.abs(v - 0.5), 0);
    expect(ecart(100)).toBeGreaterThan(ecart(50));
    expect(ecart(50)).toBeGreaterThan(ecart(10));
    expect(ecart(0)).toBe(0);
  });

  it("LES POSITIONS VONT PAR PAIRES MIROIR : l'équilibre est nul par construction", () => {
    // Un tirage libre laissait 0,72 dB d'écart entre les canaux à pleine ouverture, mesuré dans
    // l'application. Chaque grain placé à gauche a donc son jumeau à droite.
    for (const largeur of [10, 50, 100]) {
      const p = positionsSpatiales(largeur, 42);
      const somme = p.reduce((s, v) => s + (v - 0.5), 0);
      expect(Math.abs(somme), `${largeur} %`).toBeLessThan(1e-12);
      for (let i = 0; i < p.length; i += 2) {
        expect(p[i] + p[i + 1], `paire ${i}`).toBeCloseTo(1, 12);
      }
    }
  });

  it("LA LOI POUSSE VERS LES BORDS, sinon la largeur promise n'arrive jamais", () => {
    // À tirage uniforme l'écart moyen ne vaudrait que le quart de la largeur ; la racine carrée le
    // porte aux deux tiers, ce qui rend le réglage lisible sur toute sa course.
    const ecartMoyen = (largeur: number) => {
      const p = positionsSpatiales(largeur, 5);
      return p.reduce((s, v) => s + Math.abs(v - 0.5), 0) / p.length;
    };
    expect(ecartMoyen(100)).toBeGreaterThan(0.25);
    expect(ecartMoyen(100)).toBeLessThanOrEqual(0.5);
  });

  it("LA MÊME GRAINE REJOUE LE MÊME ÉPARPILLEMENT, une autre en donne un autre", () => {
    expect(positionsSpatiales(100, 42)).toEqual(positionsSpatiales(100, 42));
    expect(positionsSpatiales(100, 43)).not.toEqual(positionsSpatiales(100, 42));
  });

  it("LA LARGEUR NE FAIT PAS MONTER LE NIVEAU, et c'est calculé sur les positions réelles", () => {
    // La loi de panoramique étant linéaire en amplitude, un grain sur un bord porte deux fois la
    // puissance d'un grain au centre : sans compensation, ouvrir la largeur ajoutait 1,8 dB.
    expect(compensationLargeur(positionsSpatiales(0, 42))).toBe(1);
    expect(compensationLargeur(positionsSpatiales(100, 42))).toBeLessThan(1);
    expect(compensationLargeur(positionsSpatiales(100, 42))).toBeGreaterThan(0.7);
    // Deux grains aux deux bords : la puissance double, l'amplitude se divise par racine de deux.
    expect(compensationLargeur([0, 1])).toBeCloseTo(Math.SQRT1_2, 12);
    expect(compensationLargeur([0.5, 0.5])).toBe(1);
    expect(compensationLargeur([])).toBe(1);
  });

  it("la compensation descend quand on ouvre, sans à-coup", () => {
    const facteurs = [0, 25, 50, 75, 100].map((l) => compensationLargeur(positionsSpatiales(l, 3)));
    for (let i = 1; i < facteurs.length; i++) expect(facteurs[i]).toBeLessThanOrEqual(facteurs[i - 1]);
  });

  it("LA SORTIE EST STÉRÉO, sans quoi le masque de canal ne servirait à rien", () => {
    const orchestre = orchestreParticules(avec({ largeurPc: 80 }));
    expect(orchestre).toContain("aGauche, aDroite partikkel ");
    expect(orchestre).toContain("outs aGauche, aDroite");
  });

  it("la table des positions porte ses seize valeurs et sa borne de fin", () => {
    expect(orchestreParticules(REGLAGES)).toContain(`giCanaux ftgen 0, 0, 32, -2, 0, ${POSITIONS_SPATIALES - 1}, 0.5`);
  });
});

describe("la granulation synchrone de la période", () => {
  const r = avec({ espece: "synchrone", avecSource: true, hauteurs: [200, 200, 210, 210] });

  it("LA CADENCE VIENT DU SON : la fréquence de grains est mise à zéro", () => {
    // Le manuel est formel : à zéro, toute la cadence est remise au signal de synchronisation.
    const args = argumentsDe(orchestreParticules(r));
    expect(args[NOMS_ARGUMENTS.indexOf("agrainfreq")]).toBe("azero");
    expect(args[NOMS_ARGUMENTS.indexOf("async")]).toBe("asynchro");
  });

  it("le phaseur reboucle une fois par période, et la table porte la courbe", () => {
    const orchestre = orchestreParticules(r);
    expect(orchestre).toContain("aphase, asynchro syncphasor khauteur, azero");
    expect(orchestre).toContain(`giHauteurs ftgen 0, 0, ${CASES_HAUTEUR}, -2, 200.0`);
    expect(orchestre).toContain(`kcase line 0, p3, ${CASES_HAUTEUR - 2}`);
    expect(orchestre).toContain("khauteur tablei kcase, giHauteurs");
  });

  it("LA DURÉE DU GRAIN SUIT LA PÉRIODE, et non une cadence fixe", () => {
    expect(orchestreParticules(r)).toContain("kduree = 0.5 * 1000 / khauteur");
    expect(orchestreParticules(avec({ espece: "grains" }))).toContain("kduree = 0.5 * 1000 / kdensite");
  });

  it("les autres espèces n'écrivent ni table de hauteurs ni phaseur", () => {
    for (const espece of ["grains", "pulsars", "glissons", "trainlets", "granulation"] as Espece[]) {
      const orchestre = orchestreParticules(avec({ espece, avecSource: true }));
      expect(orchestre, espece).not.toContain("giHauteurs");
      expect(orchestre, espece).not.toContain("syncphasor");
    }
  });

  it("sans son branché, elle retombe sur les grains comme la granulation", () => {
    expect(especeTenable(avec({ espece: "synchrone", avecSource: false }))).toBe("grains");
    expect(especeTenable(avec({ espece: "synchrone", avecSource: true }))).toBe("synchrone");
  });
});

describe("la courbe de hauteur passée à Csound", () => {
  it("COMBLE LES TROUS : un zéro ne ferait jamais reboucler le phaseur", () => {
    // Sans cela, les consonnes et les silences ne déclencheraient aucun grain et disparaîtraient.
    const c = hauteursPourTable([0, 0, 220, 0, 0, 330, 0], 7);
    expect(c.some((v) => v <= 0)).toBe(false);
    expect(c[0]).toBe(220);   // le début emprunte la première hauteur tenue
    expect(c[4]).toBe(220);   // le creux prolonge la dernière
    expect(c[6]).toBe(330);
  });

  it("sans aucune hauteur, une valeur écrite plutôt qu'un silence", () => {
    expect(hauteursPourTable([], 4)).toEqual(new Array(4).fill(HAUTEUR_DEFAUT));
    expect(hauteursPourTable([0, 0, 0], 4)).toEqual(new Array(4).fill(HAUTEUR_DEFAUT));
  });

  it("rend toujours le nombre de cases demandé, plus court ou plus long que la source", () => {
    expect(hauteursPourTable([220, 440], 8)).toHaveLength(8);
    expect(hauteursPourTable(new Array(1000).fill(220), 16)).toHaveLength(16);
  });

  it("moyenne par case : une trame fautive isolée ne déplace pas la courbe entière", () => {
    const c = hauteursPourTable([220, 220, 220, 900, 220, 220, 220, 220], 2);
    expect(c[0]).toBeCloseTo((220 + 220 + 220 + 900) / 4, 6);
    expect(c[1]).toBe(220);
  });
});

describe("la dispersion", () => {
  it("branche une table de distribution quand on la demande, et rien sinon", () => {
    const args = (d: number) => argumentsDe(orchestreParticules(avec({ dispersionPc: d })));
    expect(args(0)[NOMS_ARGUMENTS.indexOf("idisttab")]).toBe("-1");
    expect(args(50)[NOMS_ARGUMENTS.indexOf("idisttab")]).toBe("giDispersion");
    expect(args(50)[NOMS_ARGUMENTS.indexOf("kdistribution")]).toBe("0.5");
  });
});

describe("ce qui est écrit pour Csound", () => {
  it("n'emploie jamais la notation exponentielle, que Csound ne lit pas", () => {
    expect(csNombre(0.0000001)).not.toContain("e");
    expect(csNombre(1e7)).not.toContain("e");
  });

  it("écrit toujours un point décimal, jamais une virgule", () => {
    expect(csNombre(0.5)).toBe("0.5");
    expect(csNombre(3)).toBe("3.0");
  });

  it("un rapport de demi-tons vaut deux à l'octave", () => {
    expect(rapportDemiTons(12)).toBeCloseTo(2, 9);
    expect(rapportDemiTons(-12)).toBeCloseTo(0.5, 9);
    expect(rapportDemiTons(0)).toBe(1);
  });

  it("la partition tient une seule note, de la durée demandée", () => {
    expect(partitionParticules(avec({ dureeSec: 6.5 }))).toBe("i1 0 6.5");
  });

  it("les réglages absurdes sont bornés plutôt que transmis", () => {
    const fou = avec({ densite: -5, frequenceHz: 1e9, dureeSec: 1e6, volumePc: 900, partiels: 1e3, espece: "trainlets" });
    const orchestre = orchestreParticules(fou);
    expect(orchestre).not.toContain("-5");
    expect(orchestre).toContain("kdensite = 0.1");
    expect(partitionParticules(fou)).toBe("i1 0 300.0");
    expect(argumentsDe(orchestre)[NOMS_ARGUMENTS.indexOf("kamp")]).toBe("1.0");
    expect(argumentsDe(orchestre)[NOMS_ARGUMENTS.indexOf("knumpartials")]).toBe("40.0");
  });

  it("la graine reste un entier positif, quelle que soit l'entrée", () => {
    expect(graineParticules(avec({ graine: 0 }))).toBe(1);
    expect(graineParticules(avec({ graine: 7.6 }))).toBe(8);
  });
});
