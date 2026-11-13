// plugins/fiche.test.ts — Une fiche ne lit que les réglages qu'elle déclare, et le compilateur y veille.
//
// POURQUOI CE GARDE, et c'est la pièce 1 de `work/plan-reglages-par-nom-2026-11-11.md`. Un réglage se
// lit par son libellé, et rien ne tenait ce libellé à ceux que la fiche déclare : un nom mal écrit,
// ou un réglage renommé dans sa fiche, retombait sans un mot sur le défaut de l'appel. `fiche()`, de
// `plugins/fiche.ts`, déduit les noms de la fiche et en type l'exécuteur ; ce garde tient le reste.
//
// CE QUE LE COMPILATEUR NE PEUT PAS DIRE, ET QUE CE GARDE DIT :
//   · une fiche écrite sans `fiche()` échappe à la vérification, sans erreur nulle part ;
//   · une fiche passée par `ficheSansNomsVerifies` lit tout nom, et la liste de ces fiches, vidée
//     par la pièce 2, doit le rester ;
//   · un ancien réglage qui serait encore vivant, ou hérité par un réglage vivant, ne serait jamais
//     lu sous son nom ;
//   · une aide qui lit un réglage sous un contexte aux noms libres ne vérifie rien, et la liste de
//     ces aides ne doit que rétrécir (pièce 3a).
//
// ET CE QUE LE COMPILATEUR DIT, CE GARDE LE PROUVE, par trois témoins écrits sous `@ts-expect-error`
// et que `tsc -b` lit avec les tests : si la vérification tombait, l'affirmation inutile ferait
// tomber le build.
import "node-web-audio-api/polyfill.js";
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import ts from "typescript";
import type { ParametreDef } from "../core";
import { fiche, ficheSansNomsVerifies } from "./fiche";
import { toutesLesFiches } from "./index";

const DOSSIER = resolve(__dirname);

/**
 * LES FICHES DONT LES NOMS NE SE DÉDUISENT PAS, relevées le 2026-11-11 quand ce garde est né. Elles
 * étaient 134, et la pièce 2 du plan les a toutes libérées, famille par famille, entre le 2026-11-12
 * et le 2026-11-13 : chaque réglage partagé ou construit garde désormais son nom.
 *
 * ELLE EST VIDE, ET ELLE LE RESTE. Une fiche neuve n'y entre pas : elle écrit ses réglages sur place,
 * ou les reprend d'une liste qui garde ses noms (`reglagePartage`).
 */
const SANS_NOMS_VERIFIES: Record<string, string[]> = {};

const nomDePropriete = (p: ts.ObjectLiteralElementLike) =>
  p.name && (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name)) ? p.name.text : null;

/**
 * L'`id` d'une fiche écrite sur place : un littéral d'objet qui porte un `id`, des réglages et un exécuteur.
 *
 * L'`id` EST UNE CHAÎNE, OU UNE CONSTANTE EN CAPITALES (`id: FICHE_LOT_DEBUT`) : dix fiches nomment le
 * leur ainsi, et la pièce 1 les avait laissées hors de `fiche()`. Un `id` en minuscules est celui
 * qu'une fabrique reçoit en argument, `effet(slug, …)`, et sa fiche n'est pas écrite sur place.
 */
function idDeFiche(n: ts.Node): string | null {
  if (!ts.isObjectLiteralExpression(n)) return null;
  const noms = new Map(n.properties.map((p) => [nomDePropriete(p), p]));
  const id = noms.get("id");
  if (!id || !noms.has("executer") || !noms.has("parametres") || !ts.isPropertyAssignment(id)) return null;
  if (ts.isStringLiteral(id.initializer)) return id.initializer.text;
  return ts.isIdentifier(id.initializer) && /^[A-Z][A-Z0-9_]+$/.test(id.initializer.text) ? id.initializer.text : null;
}

/**
 * LES AIDES QUI LISENT ENCORE UN RÉGLAGE SOUS UN CONTEXTE AUX NOMS LIBRES, relevées le 2026-11-12.
 *
 * ELLE NE PEUT QUE DÉCROÎTRE. Une aide qui prend `ContexteQuiDeclare<N, M>` de `plugins/fiche.ts`
 * fait vérifier ses lectures, et que la fiche appelante déclare tout ce qu'elle lit ; elle sort de la
 * liste. Les treize du relevé se sont typées avec la famille de la pièce 2 qui libérait leurs fiches
 * (décidé par Fabien le 2026-11-12). Il n'en reste qu'une : l'exécuteur de `effet()` lit par
 * construction les réglages qu'il déclare, `ctx.paramNombre(p.nom, …)`, et y reste à ce titre.
 */
const AIDES_NON_VERIFIEES: Record<string, string[]> = {
  "effets-aides.ts": ["effet (exécuteur de fabrique)"],
};

/**
 * Les noms des fonctions qui contiennent ce nœud, de la plus proche à la plus lointaine, comme une
 * déclaration ou une constante les donne.
 *
 * TOUTES, ET NON LA PLUS PROCHE SEULE : une fonction imbriquée dans une aide vérifiée, la `piste` de
 * `trajectoireDe` dans `multicanal.ts`, ne lit qu'à travers le contexte de cette aide, que le
 * compilateur vérifie. Elle n'a pas à le redéclarer.
 */
function fonctionsDe(n: ts.Node): string[] {
  const noms: string[] = [];
  for (let p = n.parent; p; p = p.parent) {
    if ((ts.isFunctionDeclaration(p) || ts.isMethodDeclaration(p)) && p.name && nomDePropriete(p as never) !== "executer") noms.push(p.name.getText());
    else if ((ts.isArrowFunction(p) || ts.isFunctionExpression(p)) && ts.isVariableDeclaration(p.parent)) noms.push(p.parent.name.getText());
  }
  return noms;
}

/** Les aides qui lisent un réglage hors de l'exécuteur d'une fiche enveloppée, et sans contexte vérifié. */
function aidesNonVerifiees(): string[] {
  const trouvees = new Set<string>();
  for (const nom of readdirSync(DOSSIER).sort()) {
    if (!nom.endsWith(".ts") || nom.includes(".test.") || nom === "fiche.ts") continue;
    const sf = ts.createSourceFile(nom, readFileSync(join(DOSSIER, nom), "utf8"), ts.ScriptTarget.Latest, true);
    // Les fonctions dont une déclaration, surcharges comprises, prend un contexte vérifié.
    const verifiees = new Set<string>();
    const lecteurs: { fonctions: string[]; dansExecuteur: boolean }[] = [];
    const visiter = (n: ts.Node) => {
      if ((ts.isFunctionDeclaration(n) && n.name) || (ts.isVariableDeclaration(n) && n.initializer
        && (ts.isArrowFunction(n.initializer) || ts.isFunctionExpression(n.initializer)))) {
        if (/\bContexteQuiDeclare\b/.test(n.getText(sf).split("{")[0] ?? "")) verifiees.add(n.name!.getText(sf));
      }
      if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression)
        && ["paramNombre", "paramTexte"].includes(n.expression.name.text)) {
        let dansFiche = false, dansExecuteur = false;
        for (let p: ts.Node | undefined = n.parent; p; p = p.parent) {
          if ((ts.isMethodDeclaration(p) || ts.isPropertyAssignment(p)) && nomDePropriete(p as never) === "executer") {
            dansExecuteur = true;
            const appel = p.parent?.parent;
            dansFiche = !!appel && ts.isCallExpression(appel) && ts.isIdentifier(appel.expression)
              && ["fiche", "ficheSansNomsVerifies"].includes(appel.expression.text);
            break;
          }
        }
        if (!dansFiche) lecteurs.push({ fonctions: fonctionsDe(n), dansExecuteur });
      }
      ts.forEachChild(n, visiter);
    };
    visiter(sf);
    for (const l of lecteurs) {
      if (l.fonctions.some((f) => verifiees.has(f))) continue;
      const fonction = l.fonctions[0] ?? "(module)";
      trouvees.add(`${nom} : ${l.dansExecuteur ? `${fonction} (exécuteur de fabrique)` : fonction}`);
    }
  }
  return [...trouvees].sort();
}

/** Les fiches de chaque fichier de greffons, rangées par la fonction qui les enveloppe. */
function fichesEcrites() {
  const nues: string[] = [];
  const sansNoms: Record<string, string[]> = {};
  let verifiees = 0;
  for (const nom of readdirSync(DOSSIER).sort()) {
    if (!nom.endsWith(".ts") || nom.includes(".test.") || nom === "fiche.ts") continue;
    const sf = ts.createSourceFile(nom, readFileSync(join(DOSSIER, nom), "utf8"), ts.ScriptTarget.Latest, true);
    const visiter = (n: ts.Node) => {
      const id = idDeFiche(n);
      if (id) {
        const p = n.parent;
        const par = ts.isCallExpression(p) && ts.isIdentifier(p.expression) ? p.expression.text : null;
        if (par === "fiche") verifiees++;
        else if (par === "ficheSansNomsVerifies") (sansNoms[nom] ??= []).push(id);
        else nues.push(`${nom} : ${id}`);
      }
      ts.forEachChild(n, visiter);
    };
    visiter(sf);
  }
  return { nues, sansNoms, verifiees };
}

const ECRITES = fichesEcrites();

describe("une fiche ne lit que les réglages qu'elle déclare", () => {
  it("le garde lit les fiches des greffons, sans quoi il ne dirait rien", () => {
    // 334 vérifiées et 134 sans noms vérifiés le 2026-11-11 ; 392 et 76 le 2026-11-12, puis 402 et 76
    // quand les dix fiches à identifiant constant sont passées par fiche(), 416 et 62 avec le
    // réglage « Calcul », 431 et 47 avec les réglages de rendu, 450 et 28 avec la tonalité, et 478
    // et 0 avec les dernières familles, sur 511 fiches.
    expect(ECRITES.verifiees).toBeGreaterThanOrEqual(300);
  });

  it("CHAQUE FICHE ÉCRITE SUR PLACE PASSE PAR fiche() : une fiche nue échappe à la vérification", () => {
    expect(ECRITES.nues, [
      "Enveloppez la fiche dans fiche({...}), de plugins/fiche.ts : sans lui, ses noms de réglage",
      "s'élargissent à string, et une faute de frappe dans une lecture retombe sans un mot sur le défaut.",
    ].join("\n")).toEqual([]);
  });

  it("LES FICHES SANS NOMS VÉRIFIÉS SONT CELLES DE LA LISTE, et la liste ne fait que rétrécir", () => {
    const attendues = Object.entries(SANS_NOMS_VERIFIES).flatMap(([f, ids]) => ids.map((id) => `${f} : ${id}`));
    const trouvees = Object.entries(ECRITES.sansNoms).flatMap(([f, ids]) => ids.map((id) => `${f} : ${id}`));
    expect({
      enTrop: trouvees.filter((x) => !attendues.includes(x)),
      sortiesDeLaListe: attendues.filter((x) => !trouvees.includes(x)),
    }, [
      "enTrop : une fiche de plus lit ses réglages sans vérification. Écrivez ses réglages sur place,",
      "ou typez la liste partagée, pour que fiche() en déduise les noms.",
      "sortiesDeLaListe : la fiche passe désormais par fiche(), ou n'existe plus ; retirez-la de la liste.",
    ].join("\n")).toEqual({ enTrop: [], sortiesDeLaListe: [] });
  });

  it("LES AIDES QUI LISENT SOUS DES NOMS LIBRES SONT CELLES DE LA LISTE, et la liste ne fait que rétrécir", () => {
    const attendues = Object.entries(AIDES_NON_VERIFIEES).flatMap(([f, noms]) => noms.map((n) => `${f} : ${n}`)).sort();
    const trouvees = aidesNonVerifiees();
    expect({
      enTrop: trouvees.filter((x) => !attendues.includes(x)),
      sortiesDeLaListe: attendues.filter((x) => !trouvees.includes(x)),
    }, [
      "enTrop : une aide de plus lit un réglage sous un contexte aux noms libres. Faites-lui prendre",
      "ContexteQuiDeclare<N, …> de plugins/fiche.ts, et lire par lecteurDe.",
      "sortiesDeLaListe : l'aide est désormais vérifiée, ou ne lit plus rien ; retirez-la de la liste.",
    ].join("\n")).toEqual({ enTrop: [], sortiesDeLaListe: [] });
  });

  it("UN ANCIEN RÉGLAGE N'EST NI VIVANT NI HÉRITÉ : sinon il ne serait jamais lu sous son nom", () => {
    const fautes: string[] = [];
    let anciens = 0;
    for (const f of toutesLesFiches) {
      const vivants = new Set(f.parametres.flatMap((p: ParametreDef) => [p.nom, ...(p.nomsHerites ?? [])]));
      for (const nom of f.anciensReglages ?? []) {
        anciens++;
        if (vivants.has(nom)) fautes.push(`${f.id} : « ${nom} » est encore un réglage, ou un nom hérité`);
      }
    }
    // « Fondu » du masque de zones et « Instrument » de la boîte à groove, le 2026-11-11.
    expect(anciens, "le garde doit voir les anciens réglages déclarés").toBeGreaterThanOrEqual(2);
    expect(fautes).toEqual([]);
  });

  it("LE COMPILATEUR REFUSE UN NOM QUE LA FICHE NE DÉCLARE PAS, et accepte ses anciens réglages", () => {
    // Les trois `@ts-expect-error` sont le témoin : `tsc -b` lit ce fichier, et une affirmation qui
    // n'attrape plus d'erreur fait elle-même tomber le build.
    const temoin = fiche({
      id: "temoin-des-noms", nom: "Témoin", univers: "Essai", famille: "Essai", resume: "Témoin.",
      entrees: [], sorties: [],
      parametres: [{ nom: "Gain", plage: [0, 2], pas: 0.1, defaut: 1 }],
      anciensReglages: ["Volume"],
      async executer(ctx) {
        ctx.paramNombre("Gain", 1);
        ctx.paramNombre("Volume", 1);
        // @ts-expect-error « Gian » n'est pas un réglage de la fiche.
        ctx.paramNombre("Gian", 1);
        return { valeurs: [] };
      },
    });
    const sansReglage = fiche({
      id: "temoin-sans-reglage", nom: "Témoin", univers: "Essai", famille: "Essai", resume: "Témoin.",
      entrees: [], sorties: [], parametres: [],
      async executer(ctx) {
        // @ts-expect-error une fiche sans réglage n'en lit aucun.
        ctx.paramTexte("Gain", "");
        return { valeurs: [] };
      },
    });
    const partages: ParametreDef[] = [{ nom: "Gain", defaut: 1 }];
    const refusee = fiche({
      id: "temoin-noms-elargis", nom: "Témoin", univers: "Essai", famille: "Essai", resume: "Témoin.",
      entrees: [], sorties: [],
      // @ts-expect-error une liste dont les noms ne se déduisent pas est refusée par fiche().
      parametres: partages,
      async executer() { return { valeurs: [] }; },
    });
    const libre = ficheSansNomsVerifies({
      id: "temoin-libre", nom: "Témoin", univers: "Essai", famille: "Essai", resume: "Témoin.",
      entrees: [], sorties: [], parametres: partages,
      async executer(ctx) { ctx.paramNombre("Gian", 1); return { valeurs: [] }; },
    });
    // À l'exécution, les deux fonctions rendent la fiche telle quelle.
    expect([temoin.id, sansReglage.id, refusee.id, libre.id])
      .toEqual(["temoin-des-noms", "temoin-sans-reglage", "temoin-noms-elargis", "temoin-libre"]);
  });
});
