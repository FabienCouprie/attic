// plugins/nomenclatures-registre.test.ts — Un concept, des formes déclarées, et rien d'autre.
//
// POURQUOI CE GARDE EST D'UNE AUTRE NATURE QUE CEUX DES SOURCES. Relevé par Fabien : « ce qui
// m'inquiète c'est qu'on se centre sur ces trois objets que sont les accords, les gammes, les
// rythmes, il doit y en avoir d'autres. »
//
// `audio/nomenclatures.test.ts` lit les SOURCES et cherche des données écrites à la main : il
// rattrape le passé. Celui-ci lit le REGISTRE VIVANT et regarde ce que les composants OFFRENT :
// il ferme l'avenir. Aucun garde de source ne peut voir qu'un trente-troisième composant vient
// d'écrire sa propre liste de douze clés, puisque douze noms de notes ne sont pas une donnée
// musicale, seulement un choix.
//
// CE QUE LE RELEVÉ A DONNÉ, sur 454 composants et 489 réglages à choix. 296 vocabulaires distincts,
// dont 247 n'appartiennent qu'à un seul composant : ceux-là ne sont pas des nomenclatures, ce sont
// des réglages. Restent 48 concepts partagés par au moins deux composants, et VINGT-CINQ D'ENTRE
// EUX portaient déjà plusieurs orthographes.
//
// TROIS TESTS FONT QU'UN VOCABULAIRE EST UN DOMAINE :
//  1. Il s'ENREGISTRE. Son identifiant finit dans un fichier de projet, et le renommer ou le
//     réordonner change silencieusement le projet de quelqu'un. C'est le test dur.
//  2. Il est PARTAGÉ. Un vocabulaire d'un seul composant lui appartient.
//  3. Il a un SENS HORS du composant qui l'offre. « Do dièse » existe indépendamment de qui le
//     propose ; les `p4, p5, p6` de Csound n'existent que dans Csound, même employés par quatre.
//
// CE FICHIER EST UN REGISTRE DE DETTE, ET NON UN BULLDOZER. Chaque domaine y déclare le nombre de
// formes que le dépôt assume aujourd'hui. Une forme de plus est une liste écrite à la main, et la
// suite échoue ; une forme de moins est une dette remboursée, et la suite échoue AUSSI, pour qu'on
// vienne l'inscrire. Le nombre déclaré est donc la mesure de ce qui reste à unifier, et il se lit
// ici sans rien relancer.
import { describe, expect, it } from "vitest";
import { toutesLesFiches } from "./index";
import { gammeDe } from "../audio/gammes";
import { gammeParId as gammeMondeDe } from "../audio/gammes-monde";
import { qualiteDe } from "../audio/qualites-accords";
import { demiTonDeCle } from "../audio/cles";

/**
 * Un réglage à choix, avec les identifiants qu'un projet enregistrera ET les libellés qu'il montre.
 *
 * LES LIBELLÉS COMPTENT AUTANT QUE LES IDENTIFIANTS, et le relevé des clés l'a montré : dix-sept
 * composants affichaient « C# » EN FRANÇAIS quand les autres affichaient « Do♯ ». L'identifiant est
 * invisible et se résout par alias ; le libellé, lui, se voit, et il s'enregistre aussi.
 */
interface Choix { ou: string; ids: string[]; forme: string }

function choix(): Choix[] {
  const out: Choix[] = [];
  for (const f of toutesLesFiches as { id: string; parametres?: unknown[] }[]) {
    for (const p of (f.parametres ?? []) as { nom: string; type?: string; options?: unknown[]; optionsEn?: unknown[]; optionIds?: string[] }[]) {
      const ids = (p.optionIds ?? (p.type === "choix" ? p.options : undefined) ?? []).map(String);
      if (ids.length < 2) continue;
      const fr = (p.options ?? []).map(String).join(",");
      const en = (p.optionsEn ?? []).map(String).join(",");
      out.push({ ou: `${f.id}·${p.nom}`, ids, forme: `${ids.join(",")} ⟨${fr}⟩ ⟨${en}⟩` });
    }
  }
  return out;
}

/** Un domaine gardé au niveau du registre. */
interface Domaine {
  nom: string;
  /** Ce qui relève du domaine, reconnu par la FORME de ses identifiants et jamais par un nom. */
  releve: (ids: string[]) => boolean;
  /**
   * Quand le domaine a une table, l'identifiant canonique de celui-ci — ou `undefined` si la table
   * ne le connaît pas. Un domaine sans table ne déclare rien ici.
   */
  canonique?: (id: string) => string | undefined;
  /**
   * Les composants qui offrent des identifiants non canoniques, nommés un par un avec leur raison.
   *
   * CE N'EST PAS UNE INDULGENCE : ces identifiants sont ENREGISTRÉS DANS LES PROJETS. Les changer
   * demande de déclarer les anciens dans `optionsHeritees`, ce qui se fait composant par composant.
   * En attendant, ils sont sûrs — la table les connaît en alias, donc les DEGRÉS sont justes — et
   * cette liste est la dette, qui doit décroître et jamais grandir.
   */
  anciennesEcritures?: { ou: string; raison: string }[];
  /** Le nombre de formes distinctes que le dépôt assume. La mesure de ce qui reste à unifier. */
  formesAssumees: number;
  remede: string;
}

const estPuissanceDeDeux = (x: string) =>
  /^\d+$/.test(x) && Number(x) >= 256 && (Number(x) & (Number(x) - 1)) === 0;

const DOMAINES: Domaine[] = [
  {
    nom: "gamme",
    releve: (ids) => ids.length >= 5 && ids.every((x) => gammeDe(x) || gammeMondeDe(x)),
    canonique: (id) => (gammeMondeDe(id) ? id : gammeDe(id)?.id),
    // SEPT COMPOSANTS PORTENT LES ORTHOGRAPHES D'AVANT LA TABLE. Elles sont des alias, donc les
    // degrés sont justes ; ce sont les identifiants qui ne le sont pas.
    anciennesEcritures: [
      { ou: "reservoir-musical·Gamme", raison: "« pentatonique majeur » sans accord, enregistré dans les projets" },
      { ou: "multi-reservoirs·Gamme", raison: "« pentatonique majeur » sans accord, enregistré dans les projets" },
      { ou: "sequenceur-melodique·Gamme", raison: "« pentatonique majeur » sans accord, enregistré dans les projets" },
      { ou: "arbre-rythmique·Gamme", raison: "« majeure » et « penta-majeure », les orthographes de la famille du contrepoint" },
      { ou: "evolution-melodie·Gamme", raison: "« majeure » et « penta-majeure », les orthographes de la famille du contrepoint" },
      { ou: "solveur-contraintes·Gamme", raison: "« majeure » et « penta-majeure », les orthographes de la famille du contrepoint" },
      { ou: "correction-hauteur·Gamme", raison: "« majeure » et « penta-majeure », et `audio/correction-hauteur.ts` porte la raison écrite à côté de la liste" },
    ],
    // Les huit formes : deux ordres historiques de vingt-cinq que `completer` conserve, les
    // trente-cinq gammes réunies, les dix gammes du monde, et les quatre listes d'avant la table.
    formesAssumees: 8,
    remede: "offrir la liste de `audio/gammes.ts`, par `completer` pour garder l'ordre d'un composant ancien",
  },
  {
    nom: "accord",
    releve: (ids) => ids.length >= 3 && ids.every((x) => qualiteDe(x) !== undefined),
    canonique: (id) => qualiteDe(id)?.id,
    anciennesEcritures: [
      { ou: "arpege-koch·Accord", raison: "les noms français de la table de Koch, enregistrés dans les projets" },
    ],
    formesAssumees: 2,
    remede: "offrir la liste de `audio/qualites-accords.ts`",
  },
  {
    nom: "clé",
    // LE GARDE PASSE PAR `demiTonDeCle` ET NON PAR `DEMI_TONS_CLE`, parce que celui-ci ne voyait
    // pas tout. Un composant offrait ses clés en minuscules avec le bémol typographique — « c, c#,
    // d, e♭, … » — et restait donc INVISIBLE au relevé, tout en étant enregistré dans des projets.
    // Un garde qui ne voit pas une forme ne la compte pas, et ne la bloque pas davantage.
    releve: (ids) => ids.length === 12
      && (ids.every((x) => demiTonDeCle(x) !== undefined) || ids.every((x) => /^\d+$/.test(x))),
    // DOMAINE UNIFIÉ. Les trente-deux réglages sont branchés sur `audio/cles.ts`, et les deux
    // formes qui restent sont les deux qui doivent rester : vingt-trois offrent les clés PAR LEUR
    // NOM, neuf PAR LEUR DEMI-TON. Un composant qui nomme une tonalité veut un nom ; un composant
    // qui compte des demi-tons veut un nombre, dont il fera de l'arithmétique.
    //
    // CE NOMBRE EST PASSÉ DE QUATRE À DEUX, et le garde a tiré à chaque palier : deux fois pour
    // dire qu'une dette était payée sans être inscrite, ce qui est sa seconde raison d'être.
    formesAssumees: 2,
    remede: "étaler `PARAMETRE_CLE` ou `PARAMETRE_TONIQUE` de `audio/cles.ts`, au lieu de recopier douze noms",
  },
  {
    nom: "fenêtre d'analyse",
    releve: (ids) => ids.length >= 2 && ids.every(estPuissanceDeDeux),
    // Dix formes pour des puissances de deux : sept membres différents, et trois composants qui
    // n'ont pas de libellé anglais là où les autres en ont un.
    formesAssumees: 10,
    remede: "déclarer une liste centrale des tailles de fenêtre, et dire pourquoi un composant en offre une part",
  },
  {
    nom: "métrique",
    releve: (ids) => ids.length >= 2 && ids.every((x) => /^\d+\/\d+$/.test(x))
      && ids.some((x) => Number(x.split("/")[0]) > 1),
    formesAssumees: 4,
    remede: "déclarer une liste centrale des signatures",
  },
  {
    nom: "valeur de note",
    releve: (ids) => ids.length >= 2 && ids.every((x) => /^1\/\d+$/.test(x)),
    formesAssumees: 4,
    remede: "déclarer une liste centrale des valeurs de note",
  },
  {
    nom: "forme d'onde",
    releve: (ids) => ids.length >= 3
      && ids.every((x) => ["sine", "square", "sawtooth", "saw", "triangle"].includes(x)),
    formesAssumees: 5,
    remede: "offrir `FORMES_ONDE` de `audio/timbres.ts`",
  },
  {
    nom: "oui ou non",
    releve: (ids) => ids.length === 2
      && ["non,oui", "no,yes"].includes([...ids].sort().join(",")),
    formesAssumees: 6,
    remede: "déclarer une paire centrale, dans chacun des deux ordres, puisque l'ordre d'un composant est enregistré",
  },
];

describe("un concept, des formes déclarées", () => {
  const tous = choix();

  it("LE REGISTRE EST LU, sans quoi tous les cas passeraient à vide", () => {
    expect(toutesLesFiches.length).toBeGreaterThan(400);
    expect(tous.length).toBeGreaterThan(400);
  });

  for (const d of DOMAINES) {
    const releves = tous.filter((c) => {
      try { return d.releve(c.ids); } catch { return false; }
    });

    it(`« ${d.nom} » : le nombre de formes est celui qui est déclaré`, () => {
      const formes = new Map<string, string[]>();
      for (const c of releves) {
        if (!formes.has(c.forme)) formes.set(c.forme, []);
        formes.get(c.forme)!.push(c.ou);
      }
      const vues = [...formes.entries()]
        .sort((a, b) => b[1].length - a[1].length)
        .map(([forme, ou]) => `  ${String(ou.length).padStart(2)} × ${forme.slice(0, 110)}${forme.length > 110 ? "…" : ""}  ${ou[0]}`);
      expect(
        formes.size,
        `« ${d.nom} » est offert par ${releves.length} réglages sous ${formes.size} formes, `
        + `${d.formesAssumees} étant déclarées.\n`
        + `UNE DE PLUS est une liste écrite à la main : ${d.remede}.\n`
        + `UNE DE MOINS est une dette remboursée : inscrire le nouveau nombre ici.\n`
        + `Les formes vues :\n${vues.join("\n")}`,
      ).toBe(d.formesAssumees);
    });

    if (d.canonique) {
      it(`« ${d.nom} » : les identifiants offerts sont canoniques`, () => {
        const nommees = new Set((d.anciennesEcritures ?? []).map((e) => e.ou));
        const fautifs = releves
          .filter((c) => !nommees.has(c.ou))
          .map((c) => ({ ou: c.ou, faux: c.ids.filter((x) => d.canonique!(x) !== x) }))
          .filter((x) => x.faux.length > 0)
          .map((x) => `${x.ou} offre ${x.faux.join(", ")}`);
        expect(fautifs, `${d.remede}, ou nommer ce composant dans \`anciennesEcritures\` avec sa raison`)
          .toEqual([]);
      });

      it(`« ${d.nom} » : chaque ancienne écriture nommée existe encore`, () => {
        // UNE DETTE INSCRITE QUI A ÉTÉ PAYÉE DOIT SORTIR DU REGISTRE, sans quoi elle couvrirait la
        // réapparition du défaut au même endroit.
        const payees = (d.anciennesEcritures ?? [])
          .filter((e) => {
            const c = releves.find((x) => x.ou === e.ou);
            return !c || c.ids.every((x) => d.canonique!(x) === x);
          })
          .map((e) => `${e.ou} — ${e.raison} : l'écriture est canonique désormais, retirer la ligne`);
        expect(payees).toEqual([]);
      });
    }
  }

  it("LA DETTE EST CHIFFRÉE, et c'est elle qu'on vient lire", () => {
    // Le nombre de formes en trop, domaine par domaine : ce qu'il resterait à unifier si chaque
    // domaine se ramenait à une seule liste. Ce cas ne juge pas, il empêche le chiffre de croître
    // sans qu'on s'en aperçoive.
    const enTrop = DOMAINES.reduce((s, d) => s + d.formesAssumees - 1, 0);
    expect(enTrop, "unifier un domaine fait baisser ce nombre ; en laisser un nouveau le fait monter")
      .toBe(33);
  });
});
