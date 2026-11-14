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
//
// LES DOMAINES SONT DÉCLARÉS DANS `plugins/nomenclatures.ts` depuis le 2026-11-14, et non plus ici :
// la passe de croisement des réglages doit relever les MÊMES réglages que ce garde, et un relevé
// écrit deux fois diverge sans que rien ne le dise.
import { describe, expect, it } from "vitest";
import { toutesLesFiches } from "./index";
import { DOMAINES, choix, relevesDuDomaine } from "./nomenclatures";

/**
 * Les concepts partagés qui ont été EXAMINÉS et qui ne sont pas des domaines, avec la raison.
 *
 * POURQUOI LES INSCRIRE PLUTÔT QUE LES TAIRE. Le relevé du 2026-10-23 a trouvé trente-quatre
 * concepts partagés divergents sur les 503 composants. Dix-huit sont gardés plus haut ; ceux-ci ont
 * été ouverts un par un et écartés, le plus souvent au troisième test : le mot est le même et la
 * chose ne l'est pas. Sans cette liste, le prochain relevé les retrouvera et refera le travail,
 * ou pire, « unifiera » deux vocabulaires qui n'ont en commun qu'une homonymie.
 */
const EXAMINES_ET_ECARTES: { ou: string; raison: string }[] = [
  { ou: "generateur-pochette·Palette", raison: "« magma » nomme trois couleurs lues par position ici et six arrêts interpolés dans l'attracteur : deux jeux de couleurs sous un même nom" },
  { ou: "attracteur-ifs·Palette", raison: "l'autre moitié de la même homonymie, six arrêts le long d'un scalaire de densité" },
  { ou: "styles-musicaux·Catégorie", raison: "onze genres musicaux ; « Rock » n'est pas une catégorie d'émotion" },
  { ou: "emotions·Catégorie", raison: "huit familles d'émotions ; « Joie » n'est pas un style musical" },
  { ou: "clavier-sfz·Source", raison: "les voies d'approvisionnement propres au nœud, donc ses propres ports" },
  { ou: "banque-sfz·Source", raison: "l'autre moitié : ce nœud n'a pas d'entrée, il ne peut pas offrir « Banque entrante »" },
  { ou: "montage-grains·Opération", raison: "« garder » y veut dire un grain sur deux, et dans les ondelettes une part des coefficients : faux ami" },
  { ou: "ondelettes·Opération", raison: "l'autre moitié du faux ami ; des coefficients n'existent pas hors de la transformée" },
  { ou: "tresse·Brins", raison: "un nombre de bandes de fréquence, que seule la forme de petits entiers rapproche d'une signature" },
  { ou: "qui-parle-quand·Locuteur", raison: "un rang de locuteur, de un à quatre" },
  { ou: "composer-plan·Signature", raison: "un nombre de temps par mesure, écrit comme une chaîne dans le plan" },
  { ou: "midi-vers-abc·Grille", raison: "un nombre de subdivisions par temps" },
  { ou: "carte-sonore·Style", raison: "quatre dispositions de carte ; « voronoi » n'est pas un style de pochette" },
  { ou: "generateur-pochette·Style", raison: "douze styles graphiques ; « bauhaus » n'est pas une disposition de carte" },
  { ou: "tonal-analyse·Style", raison: "trois idiomes de progression ; « Pop » y est I-V-vi-IV et non un accord par temps" },
  { ou: "spirale-logarithmique·Rapport par tour", raison: "un facteur de FRÉQUENCE : « quinte » et « octave » n'ont pas de sens comme facteurs de distance" },
  { ou: "spirale-spatiale·Rapport par tour", raison: "un facteur de DISTANCE : « quadruple » n'est pas un nom d'intervalle" },
  { ou: "generateur-courbe·Forme", raison: "quatorze courbes de modulation dont onze n'ont rien d'une onde, parmi lesquelles cinq lois de probabilité" },
  { ou: "ddsp-tone-transfer·Instrument", raison: "les quatre points de contrôle publiés du modèle ; il n'existe pas de checkpoint de clarinette" },
  { ou: "vent-guide-onde·Instrument", raison: "trois modèles physiques de tuyau ; un violon n'a pas de tuyau" },
];

describe("un concept, des formes déclarées", () => {
  const tous = choix();

  it("CHAQUE CONCEPT ÉCARTÉ EXISTE ENCORE, sans quoi sa raison ne garde plus rien", () => {
    // Un réglage renommé ou retiré laisserait ici une raison orpheline, qui couvrirait un autre
    // réglage portant un jour le même nom.
    const offerts = new Set(tous.map((c) => c.ou));
    const orphelins = EXAMINES_ET_ECARTES
      .filter((e) => !offerts.has(e.ou))
      .map((e) => `${e.ou} : ce réglage n'existe plus, retirer la ligne`);
    expect(orphelins).toEqual([]);
  });

  it("LE REGISTRE EST LU, sans quoi tous les cas passeraient à vide", () => {
    expect(toutesLesFiches.length).toBeGreaterThan(400);
    expect(tous.length).toBeGreaterThan(400);
  });

  for (const d of DOMAINES) {
    const releves = relevesDuDomaine(d, tous);

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

    it(`« ${d.nom} » : ce qui ne relève pas du domaine est déclaré`, () => {
      // LE CAS QUI MANQUAIT, ET QUI EST TOUT L'OBJET DE LA RÉPARATION. Une valeur hors domaine
      // mise dans une liste du domaine était, avant, ce qui faisait DISPARAÎTRE la liste entière du
      // relevé. Elle est désormais vue, et elle doit porter sa raison : une sentinelle dit « prends
      // la valeur ailleurs », et tout le reste est une faute d'orthographe qui attend d'être lue.
      const nommees = new Set((d.sentinelles ?? []).map((s) => s.valeur));
      const fautifs: string[] = [];
      for (const c of releves) {
        for (const id of c.ids) {
          if (d.membre(id) || nommees.has(id)) continue;
          fautifs.push(`${c.ou} offre « ${id} », qui ne relève pas du domaine`);
        }
      }
      expect(
        fautifs.length,
        `${d.remede}, ou déclarer la valeur dans \`sentinelles\` avec sa raison :\n`
        + fautifs.map((f) => `  ${f}`).join("\n"),
      ).toBe(0);
    });

    it(`« ${d.nom} » : chaque sentinelle déclarée existe encore`, () => {
      // Une sentinelle qui a disparu des fiches couvrirait la réapparition d'une valeur du même nom.
      const offerts = new Set(releves.flatMap((c) => c.ids));
      const mortes = (d.sentinelles ?? [])
        .filter((s) => !offerts.has(s.valeur))
        .map((s) => `« ${s.valeur} » — ${s.raison} : plus aucun réglage ne l'offre, retirer la ligne`);
      expect(mortes).toEqual([]);
    });

    if (d.canonique) {
      it(`« ${d.nom} » : les identifiants offerts sont canoniques`, () => {
        const nommees = new Set((d.anciennesEcritures ?? []).map((e) => e.ou));
        // UNE SENTINELLE N'A PAS DE FORME CANONIQUE : elle ne relève pas du domaine, donc sa table
        // ne la connaît pas, et l'exiger canonique serait lui demander d'être ce qu'elle n'est pas.
        const sentinelles = new Set((d.sentinelles ?? []).map((s) => s.valeur));
        const fautifs = releves
          .filter((c) => !nommees.has(c.ou))
          .map((c) => ({
            ou: c.ou,
            faux: c.ids.filter((x) => !sentinelles.has(x) && d.canonique!(x) !== x),
          }))
          .filter((x) => x.faux.length > 0)
          .map((x) => `${x.ou} offre ${x.faux.join(", ")}`);
        expect(
          fautifs.length,
          `${d.remede}, ou nommer ce composant dans \`anciennesEcritures\` avec sa raison :\n`
          + fautifs.map((f) => `  ${f}`).join("\n"),
        ).toBe(0);
      });

      it(`« ${d.nom} » : chaque ancienne écriture nommée existe encore`, () => {
        // UNE DETTE INSCRITE QUI A ÉTÉ PAYÉE DOIT SORTIR DU REGISTRE, sans quoi elle couvrirait la
        // réapparition du défaut au même endroit.
        const payees = (d.anciennesEcritures ?? [])
          .filter((e) => {
            const c = releves.find((x) => x.ou === e.ou);
            const sentinelles = new Set((d.sentinelles ?? []).map((s) => s.valeur));
            return !c || c.ids.every((x) => sentinelles.has(x) || d.canonique!(x) === x);
          })
          .map((e) => `${e.ou} — ${e.raison} : l'écriture est canonique désormais, retirer la ligne`);
        expect(payees).toEqual([]);
      });
    }

    if (d.table) {
      it(`« ${d.nom} » : sa table est entière dans son domaine`, () => {
        // LA TABLE EST LA MESURE D'UNE LISTE ENTIÈRE, et la passe de croisement la lit : un
        // identifiant de la table que le domaine ne reconnaîtrait pas ferait passer une liste
        // entière pour une coupe.
        const etrangers = d.table!().filter((x) => !d.membre(x));
        expect(etrangers, `« ${d.nom} » : ces identifiants de la table ne relèvent pas du domaine`).toEqual([]);
      });
    }
  }

  it("CHAQUE FORME ASSUMÉE PORTE SA RAISON, sans quoi le chiffre ne dit pas s'il est dû ou mérité", () => {
    // LE CHAMP EXISTE POUR CETTE PROPRIÉTÉ, ET ELLE EST LA CONCLUSION DU CHANTIER. Les dix-huit
    // domaines ont été examinés un par un, et le relevé a montré que la plupart des formes qui
    // restent ne sont PAS une dette : ce sont des sous-ensembles bornés par un algorithme, ou des
    // ordres que la relecture d'un projet fige. Un chiffre seul ne distingue pas ces trois-là d'une
    // orthographe qui diverge sans raison, et c'est pourtant la seule distinction qui décide s'il
    // faut payer. Un domaine qui assume plus d'une forme doit donc dire laquelle il assume.
    const muets = DOMAINES
      .filter((d) => d.formesAssumees > 1 && (d.pourquoi ?? "").trim().length < 40)
      .map((d) => `« ${d.nom} » assume ${d.formesAssumees} formes sans dire pourquoi`);
    expect(
      muets,
      "écrire `pourquoi` : un SOUS-ENSEMBLE borné, un ORDRE que la relecture fige, ou une ORTHOGRAPHE qui diverge, "
      + "qui est la seule des trois à se payer :\n" + muets.join("\n"),
    ).toEqual([]);
  });

  it("et un domaine qui n'en assume qu'une n'a rien à expliquer", () => {
    // LA SYMÉTRIE COMPTE : une raison écrite à côté d'un domaine unifié serait une raison morte,
    // et elle couvrirait la réapparition d'une seconde forme au même endroit.
    const bavards = DOMAINES
      .filter((d) => d.formesAssumees === 1 && (d.pourquoi ?? "").trim().length > 0)
      .map((d) => `« ${d.nom} » n'assume qu'une forme : retirer son \`pourquoi\``);
    expect(bavards).toEqual([]);
  });

  it("LA DETTE EST CHIFFRÉE, et c'est elle qu'on vient lire", () => {
    // Le nombre de formes en trop, domaine par domaine : ce qu'il resterait à unifier si chaque
    // domaine se ramenait à une seule liste. Ce cas ne juge pas, il empêche le chiffre de croître
    // sans qu'on s'en aperçoive.
    // TRENTE-TROIS, PUIS VINGT-SEPT, PUIS TRENTE-HUIT, ET LA MONTÉE EST UNE BONNE NOUVELLE. Deux
    // domaines ont été unifiés — la métrique par `audio/signatures.ts`, la forme d'onde par
    // `FORMES_ONDE_CHOIX` — ce qui a fait tomber le chiffre de 33 à 27. Puis la mécanique du garde
    // a été réparée, et ONZE FORMES QU'IL NE VOYAIT PAS sont entrées dans le compte : une
    // sentinelle en tête d'une liste suffisait à la faire disparaître entièrement, et un plancher
    // de longueur cachait les listes courtes écrites à la main.
    //
    // CE CHIFFRE N'EST DONC PAS LA DETTE QUI A GRANDI, C'EST LA DETTE QU'ON VOIT ENFIN. Comparer 38
    // à 33 n'a pas de sens : les deux ne mesurent pas la même chose. C'est à partir d'ici qu'il se
    // compare à lui-même.
    // PUIS DE TRENTE-HUIT À CINQUANTE-TROIS, par DIX DOMAINES DE PLUS : le relevé des 503
    // composants a trouvé cinquante et un concepts partagés, dont trente-quatre divergents, quand
    // huit seulement étaient déclarés. Ce chiffre ne mesure donc pas la même chose qu'avant lui :
    // il couvre dix-huit domaines au lieu de huit. C'est là que la comparaison repart.
    // PUIS DE CINQUANTE-DEUX À CINQUANTE ET UN, par le caractère de timbre : la forme en trop était
    // la même table privée du sinus, pour un moteur dont la branche sinusoïdale manquait.
    // PUIS DE CINQUANTE ET UN À CINQUANTE, par la valeur de note : deux grilles de quantification
    // ne faisaient deux formes que par l'écriture française du triolet.
    // PUIS DE CINQUANTE À QUARANTE-SEPT, par le oui ou non : six formes sur trente-huit réglages,
    // dont trois ne tenaient qu'à cinq composants qui posaient `yes` et `no` dans les projets.
    // PUIS DE QUARANTE-SEPT À QUARANTE-HUIT, ET LA MONTÉE EST LÉGITIME : la granulation spectrale
    // offre la table ENTIÈRE des tailles de fenêtre, qu'aucun de ses deux réglages ne borne. Une
    // forme de plus qui vient de la table commune n'est pas une liste écrite à la main.
    // PUIS DE QUARANTE-HUIT À QUARANTE-NEUF, ET LA MONTÉE EST UNE DETTE QUI ENTRE AU REGISTRE : les
    // six styles de la reprise ABC, écrits à la main et écartés comme vocabulaire propre, sont
    // devenus les patrons rythmiques, précédés d'« Accords tenus ». Ils ne se voyaient pas ; la forme
    // qu'ils prennent désormais vient de la table, et elle se compte.
    const enTrop = DOMAINES.reduce((s, d) => s + d.formesAssumees - 1, 0);
    expect(enTrop, "unifier un domaine fait baisser ce nombre ; en laisser un nouveau le fait monter")
      .toBe(49);
  });
});
