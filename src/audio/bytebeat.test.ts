// audio/bytebeat.test.ts — Une formule recopiée doit rendre ce qu'elle rend ailleurs.
//
// CE QUE CES CAS GARDENT, ET C'EST TOUTE LA PROMESSE DU NŒUD. Le genre vit de formules qu'on
// recopie : si la précédence ou un opérateur diffèrent d'un dixième de ce que fait le C, la formule
// rend autre chose sans que rien ne le signale. Les cas comparent donc l'analyseur à l'arithmétique
// de JavaScript, qui est celle des lecteurs par lesquels le genre circule, opérateur par opérateur
// et sur la précédence.
//
// ET LE PIÈGE EST DÉJÀ MESURÉ AILLEURS : les deux nœuds à formule du catalogue passent par `mathjs`,
// où `^` est une élévation à la puissance. Relevé dans l'application, `i ^ 3` y sort à −41,92 LUFS
// sans hauteur, c'est-à-dire i³ écrêté, et le son sort quand même. C'est pourquoi le ou-exclusif a
// ici son cas à lui.
import { describe, expect, it } from "vitest";
import { FormuleInvalide, bytebeat, compilerBytebeat, octet } from "./bytebeat";

const T = [0, 1, 2, 3, 7, 63, 64, 255, 256, 1000, 4095, 65535, 1000000];

/** La même formule, calculée par l'analyseur et par JavaScript. */
const memeQueJs = (formule: string, js: (t: number) => number) => {
  const f = compilerBytebeat(formule);
  for (const t of T) {
    expect(f(t), `${formule} à t = ${t}`).toBe(js(t));
  }
};

describe("l'analyseur de Bytebeat", () => {
  it("REND LES OPÉRATEURS BINAIRES DU C, un par un", () => {
    memeQueJs("t & 255", (t) => t & 255);
    memeQueJs("t | 1", (t) => t | 1);
    memeQueJs("t >> 8", (t) => t >> 8);
    memeQueJs("t << 2", (t) => t << 2);
    memeQueJs("t + 3", (t) => t + 3);
    memeQueJs("t - 3", (t) => t - 3);
    memeQueJs("t * 5", (t) => t * 5);
    memeQueJs("t % 7", (t) => t % 7);
    memeQueJs("~t", (t) => ~t);
    memeQueJs("-t", (t) => -t);
  });

  it("ET « ^ » EST LE OU-EXCLUSIF, non une élévation à la puissance", () => {
    memeQueJs("t ^ 3", (t) => t ^ 3);
    memeQueJs("t ^ t >> 5", (t) => t ^ t >> 5);
    // La différence est énorme et c'est ce qui rend le piège grave : à t = 1000, le ou-exclusif
    // rend 1003 et la puissance un milliard.
    expect(compilerBytebeat("t ^ 3")(1000)).toBe(1003);
    expect(compilerBytebeat("t ^ 3")(1000)).not.toBe(1e9);
  });

  it("LA PRÉCÉDENCE EST CELLE DU C, et c'est là que tout se joue", () => {
    // Le cas d'école du genre : « t*5 & t>>7 » se lit « (t*5) & (t>>7) ».
    memeQueJs("t*5 & t>>7", (t) => t * 5 & t >> 7);
    memeQueJs("(t*5 & t>>7) | (t*3 & t>>10)", (t) => (t * 5 & t >> 7) | (t * 3 & t >> 10));
    // Le ET lie plus fort que le OU, et le décalage plus fort que les deux.
    memeQueJs("t & 3 | t >> 2 & 1", (t) => t & 3 | t >> 2 & 1);
    // L'addition lie plus fort que le décalage, ce qui surprend et est bien le C.
    memeQueJs("t + 1 >> 3", (t) => t + 1 >> 3);
    memeQueJs("t >> 3 + 1", (t) => t >> 3 + 1);
    // Le ou-exclusif se place entre le ET et le OU.
    memeQueJs("t & 6 ^ t & 3 | t >> 9", (t) => t & 6 ^ t & 3 | t >> 9);
    // Et la formule de Viznut, qui est la raison d'être de tout ceci.
    memeQueJs("t*(((t>>12)|(t>>8))&(63&(t>>4)))",
      (t) => t * (((t >> 12) | (t >> 8)) & (63 & (t >> 4))));
  });

  it("LES COMPARAISONS ET LE TERNAIRE SUIVENT AUSSI, le ternaire associant à droite", () => {
    memeQueJs("t > 1000", (t) => (t > 1000 ? 1 : 0));
    // UNE COMPARAISON LIE PLUS FORT QUE LE ET BINAIRE, ce qui surprend et est bien le C :
    // « t & 255 > 128 » se lit « t & (255 > 128) », donc « t & 1 », et non « (t & 255) > 128 ».
    // La référence s'écrit avec le choix à trois termes parce que JavaScript convertit le vrai en
    // un, là où TypeScript refuse un booléen comme opérande binaire.
    // oxlint-disable-next-line no-constant-condition, no-constant-binary-expression
    memeQueJs("t & 255 > 128", (t) => t & (255 > 128 ? 1 : 0));
    memeQueJs("t > 1000 ? t >> 2 : t", (t) => (t > 1000 ? t >> 2 : t));
    // a ? b : c ? d : e se lit a ? b : (c ? d : e).
    memeQueJs("t > 1000 ? 1 : t > 100 ? 2 : 3",
      (t) => (t > 1000 ? 1 : t > 100 ? 2 : 3));
  });

  it("UNE FORMULE INVALIDE LÈVE EN NOMMANT CE QU'ELLE PORTE, et ne rend pas du silence", () => {
    // Rendre du silence laisserait la formule passer pour jouée. Le genre a une variante en
    // virgule flottante, avec sinus et plancher, que ce module ne porte pas : il faut le dire.
    expect(() => compilerBytebeat("sin(t)")).toThrow(FormuleInvalide);
    expect(() => compilerBytebeat("sin(t)")).toThrow(/« s »/);
    expect(() => compilerBytebeat("t +")).toThrow(FormuleInvalide);
    expect(() => compilerBytebeat("(t")).toThrow(/parenthèse/);
    expect(() => compilerBytebeat("t)")).toThrow(/parenthèse/);
    expect(() => compilerBytebeat("")).toThrow(/vide/);
  });

  it("LE REPLI SUR HUIT BITS REPLIE, il n'écrête pas", () => {
    // C'est ce que fait `putchar`, et c'est ce qui fabrique la dent de scie dont les huit ondes
    // carrées sont les bits. Écrêter détruirait le procédé.
    expect(octet(0, true)).toBeCloseTo(-1, 12);
    expect(octet(128, true)).toBeCloseTo(0, 12);
    expect(octet(255, true)).toBeCloseTo(255 / 128 - 1, 12);
    // 256 revient à zéro, 300 à 44 : le repli, non le plafond.
    expect(octet(256, true)).toBeCloseTo(-1, 12);
    expect(octet(300, true)).toBeCloseTo(44 / 128 - 1, 12);
    expect(octet(1000000, true)).toBeCloseTo(((1000000 % 256) / 128) - 1, 12);
    // Et un négatif replie aussi, comme un octet non signé le fait.
    expect(octet(-1, true)).toBeCloseTo(255 / 128 - 1, 12);
  });

  it("ET L'OCTET SE LIT SIGNÉ OU NON, les deux conventions existant chez les lecteurs", () => {
    expect(octet(0, false)).toBeCloseTo(0, 12);
    expect(octet(64, false)).toBeCloseTo(0.5, 12);
    expect(octet(128, false)).toBeCloseTo(-1, 12);
    expect(octet(255, false)).toBeCloseTo(-1 / 128, 12);
  });

  it("LE TÉMOIN : LA DENT DE SCIE SEULE A UNE PÉRIODE DE 256 OCTETS, soit 31,25 Hz à 8000", () => {
    // C'est le premier exemple de Viznut, et il donne le chiffre lui-même.
    const { sortie, rapport } = bytebeat({
      formule: "t", cadence: 8000, sampleRate: 8000, dureeSec: 1,
    });
    expect(8000 / 256).toBeCloseTo(31.25, 10);
    // Sans tenue, la sortie EST le flux d'octets : la périodicité est exacte.
    for (let i = 0; i < 8000 - 256; i++) {
      expect(sortie[i], `échantillon ${i}`).toBe(sortie[i + 256]);
    }
    // Et les 256 valeurs de l'octet sont toutes prises.
    expect(rapport.valeurs).toBe(256);
    expect(rapport.octets).toBe(8000);
  });

  it("ET « t & t>>8 » DESCEND D'UNE OCTAVE À CHAQUE DOUBLEMENT : c'est l'autre exemple de l'auteur", () => {
    // J'AVAIS ANNONCÉ UNE PÉRIODE DE 512 ÉCHANTILLONS, ET C'ÉTAIT FAUX : `t>>8` croît sans borne,
    // donc la formule n'est pas périodique du tout. Ce qu'elle fait est ce que l'analyse de l'auteur
    // décrit : sur le bloc de 256 octets numéro k, la sortie vaut `t & k`, dont la période est deux
    // puissance le rang du bit de poids fort de k, plus un. Chaque doublement de k descend donc
    // d'une octave, et c'est là toute la « propriété harmonique » que Viznut lui prête.
    const { sortie } = bytebeat({
      formule: "t & t>>8", cadence: 8000, sampleRate: 8000, dureeSec: 1,
    });
    // Le premier bloc est muet : `t>>8` y vaut zéro, donc le ET aussi.
    for (let i = 0; i < 256; i++) expect(sortie[i], `échantillon ${i}`).toBe(octet(0, true));
    // Puis les blocs 1, 2, 4 et 8 portent des carrés de période 2, 4, 8 et 16 échantillons.
    for (const [k, periode] of [[1, 2], [2, 4], [4, 8], [8, 16]] as const) {
      const de = 256 * k + 32;
      const a = 256 * (k + 1) - 32;
      for (let i = de; i < a - periode; i++) {
        expect(sortie[i], `bloc ${k}, échantillon ${i}`).toBe(sortie[i + periode]);
      }
      // Et la moitié de cette période ne suffit pas : c'est bien celle-là.
      if (periode > 2) {
        let differe = false;
        for (let i = de; i < a - periode; i++) if (sortie[i] !== sortie[i + periode / 2]) { differe = true; break; }
        expect(differe, `bloc ${k} : la période n'est pas ${periode / 2}`).toBe(true);
      }
    }
    // Soit, à 8000 octets par seconde, 4000, 2000, 1000 et 500 hertz : une octave par doublement.
    expect(8000 / 2).toBe(4000);
    expect(8000 / 16).toBe(500);
  });

  it("LA TENUE EN ESCALIER DONNE UN OCTET PAR PAS DE LA CADENCE, non par échantillon", () => {
    const { rapport } = bytebeat({
      formule: "t", cadence: 8000, sampleRate: 44100, dureeSec: 1,
    });
    // Mille échantillons rendus pour huit cents octets : c'est la cadence qui compte les octets.
    expect(rapport.octets).toBe(8000);
    // Et chaque octet tient cinq ou six échantillons, 44100 sur 8000 valant 5,5125.
    const { sortie } = bytebeat({
      formule: "t", cadence: 8000, sampleRate: 44100, dureeSec: 0.01,
    });
    let tenues = 0;
    for (let i = 1; i < sortie.length; i++) if (sortie[i] === sortie[i - 1]) tenues++;
    expect(tenues / sortie.length).toBeGreaterThan(0.75);
  });

  it("LA CADENCE N'EST PAS UNE TRANSPOSITION : elle déplace les intervalles", () => {
    // C'est ce que l'analyse de l'auteur explique par l'aliasage. Ici le constat suffit : la même
    // formule à deux cadences ne rend pas la même suite d'octets ramenée au même nombre.
    const lent = bytebeat({ formule: "t*5 & t>>7", cadence: 8000, sampleRate: 8000, dureeSec: 0.5 });
    const vite = bytebeat({ formule: "t*5 & t>>7", cadence: 16000, sampleRate: 16000, dureeSec: 0.5 });
    // Deux fois plus d'octets dans la même durée.
    expect(vite.rapport.octets).toBe(2 * lent.rapport.octets);
    // Mais les octets ne sont pas les mêmes un sur deux : la formule n'est pas homogène.
    let pareils = 0;
    for (let i = 0; i < lent.sortie.length; i++) if (lent.sortie[i] === vite.sortie[2 * i]) pareils++;
    expect(pareils / lent.sortie.length, "la suite d'octets n'est pas un simple étirement")
      .toBeLessThan(0.9);
  });

  it("UNE COURBE PLATE SUR LA CADENCE REND CE QUE REND LE RÉGLAGE, au bit près", () => {
    const o = { formule: "t*5 & t>>7", sampleRate: 16384, dureeSec: 0.25, amplitude: 0.5 };
    const n = Math.round(o.dureeSec * o.sampleRate);
    const fixe = bytebeat({ ...o, cadence: 8192 });
    const plate = bytebeat({
      ...o, cadence: new Float32Array(n).fill(8192), amplitude: new Float32Array(n).fill(0.5),
    });
    expect(Array.from(plate.sortie)).toEqual(Array.from(fixe.sortie));
    expect(plate.rapport.octets).toBe(fixe.rapport.octets);
  });

  it("ET UNE COURBE QUI VARIE NE REND PAS CE QUE REND SA PREMIÈRE VALEUR", () => {
    const o = { formule: "t*5 & t>>7", sampleRate: 16384, dureeSec: 0.25 };
    const n = Math.round(o.dureeSec * o.sampleRate);
    const montante = new Float32Array(n);
    for (let i = 0; i < n; i++) montante[i] = 4096 + (8192 * i) / n;
    const tenue = bytebeat({ ...o, cadence: new Float32Array(n).fill(4096) });
    const balayee = bytebeat({ ...o, cadence: montante });
    expect(balayee.rapport.octets).toBeGreaterThan(tenue.rapport.octets);
    expect(Array.from(balayee.sortie)).not.toEqual(Array.from(tenue.sortie));
  });
});
