// tests-e2e/journal-de-passe.spec.ts — L'ORDRE des écritures d'une passe dans les magasins, surveillé.
//
// POURQUOI CE GARDE EXISTE. Le chantier de l'architecture par messages déplace qui écrit dans les
// trois magasins de l'interface, statuts, résultats et priorité : la boucle, le ménage d'après passe
// et le correctif passent derrière une frontière, et chaque pièce se dit sans changement de
// comportement. Le son ne suffit pas à le prouver. Un résultat posé avant son temps, un temps
// d'exécution écrit avant la pose finale, un statut posé deux fois : les empreintes d'exemples n'en
// voient rien, puisque le son final est le même. Ce garde-ci voit la SUITE des écritures, nœud par
// nœud et champ par champ, telle qu'une passe la produit sur les exemples livrés.
//
// DEUX SCÉNARIOS PAR EXEMPLE, parce que Lancer n'est pas le seul geste qui fait écrire le moteur.
//   « lancer » : le graphe semé, Lancer pressé, tout calculé à neuf.
//   « gestes » : le graphe semé, le ▶ d'un nœud pressé, qui pose la priorité et ne calcule que ce dont
//   ce nœud dépend ; puis son ↺, qui efface le nœud et son aval ; puis Lancer, qui reprend le reste du
//   cache ; puis son ↺ encore, qui efface cette fois un aval calculé. Le nœud est le premier du
//   fichier qui reçoit un câble et en rend un, son ▶ à l'écran.
//
// LA SONDE EST ARMÉE PAR L'APPLICATION. La spec pose une globale avant le chargement de la page, et
// `src/ui/journal-de-passe.ts`, importé par `main.tsx` avant l'application, s'abonne alors aux trois
// magasins. Une sonde importée depuis la page par `import()` relèverait le module que la page a déjà
// chargé, et non celui du disque. Le journal repart de zéro au premier geste, et chaque geste y pose
// sa marque : ce que l'application écrit en se chargeant n'est pas la passe.
//
// CE QUI EST RETIRÉ, ET POURQUOI. Les adresses `blob:`, neuves à chaque passe ; `tempsExecution`,
// sa valeur toujours, et sa réécriture, dont seule la première pose reste, voir `DUREES` ;
// l'avancement des lecteurs posé par `poserApercu`, qui suit
// l'écriture d'un WAV tranche par tranche et dépend donc du temps ; le nombre d'une graine dans un
// message, et les décimales d'un écart de niveau au-delà du millième, voir `valeurComparee`. Les
// autres valeurs sont décrites par `decrire` : un tampon par ses canaux, sa longueur et son taux.
//
// IL MESURE SON PROPRE BRUIT, comme l'établissement des empreintes d'exemples : chaque scénario est
// joué trois fois. Une ligne dont une valeur change d'une passe à l'autre, même nœud et mêmes champs,
// est gardée préfixée de « ~ », CE SEUL CHAMP masqué d'un « * » : les autres restent surveillés. Un
// premier jet masquait toute la ligne, et une valeur variable faisait perdre de vue le tampon posé à
// côté d'elle. Un scénario dont la suite elle-même change est déclaré variable, avec son premier
// écart, et sort de la surveillance en le disant à chaque passe.
//
// LES EXEMPLES SONT CEUX QUE SURVEILLE LA BASE DU SON, lus dans `empreintes-exemples.json` : ceux
// qui attendent un fichier de l'utilisateur ou dont le son varie en sont déjà sortis. Ce qu'ils ne
// contiennent pas, ce garde ne le voit pas : aucun ne porte de boucle, et le lot demande un dossier
// de fichiers.
//
//   npm run test:journal-de-passe
//   EXEMPLE=canon-de-proportions npm run test:journal-de-passe
//   ECRIRE_JOURNAUX_DE_PASSE=1 npm run test:journal-de-passe
//
// AVEC `EXEMPLE=`, L'ÉTABLISSEMENT NE RÉÉCRIT QUE CET EXEMPLE : les autres restent dans la base. La
// base du son, elle, se réécrivait entière avec le seul exemple joué.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test, type Page } from "@playwright/test";

import type { EntreeDuJournal } from "../src/ui/journal-de-passe";
import { lancerLeNoeudEtAttendre, relancerEtAttendre, semer, semerEtLancer } from "./pilote-graphe";
import { serveurDeVerification } from "./serveur-de-developpement";

const devUrl = serveurDeVerification(5284);
const ICI = dirname(fileURLToPath(import.meta.url));
const RACINE = resolve(ICI, "..");
const CHEMIN = resolve(ICI, "journaux-de-passe.json");
const BASE_DU_SON = resolve(ICI, "empreintes-exemples.json");
const ecrire = process.env.ECRIRE_JOURNAUX_DE_PASSE === "1";
const SEUL = process.env.EXEMPLE ?? "";

/** La forme de la référence. Une lecture qui ne la reconnaît pas refuse de comparer. */
const FORME = 1;

/** Combien de fois l'établissement joue chaque scénario : deux tirages ne caractérisent pas un bruit. */
const PASSES = 3;

const SCENARIOS = ["lancer", "gestes"] as const;
type Scenario = (typeof SCENARIOS)[number];

interface Base {
  forme: number;
  /** Les scénarios dont la suite d'écritures ne se reproduit pas, sous « exemple · scénario ». */
  variables: Record<string, string>;
  /** Sous la même clé, chaque champ masqué avec les valeurs que les passes de l'établissement lui ont vues. */
  bruit: Record<string, string[]>;
  exemples: Record<string, Partial<Record<Scenario, string[]>>>;
}

/** Une écriture rendue en ligne, avec ses champs, et la ligne qu'elle fait quand certains sont masqués. */
interface Ligne {
  ligne: string;
  champs: Record<string, string>;
  rendre: (masques: ReadonlySet<string>) => string;
}

/** Ce qui tient lieu d'une valeur qui ne se reproduit pas. Aucune valeur décrite ne s'écrit ainsi. */
const MASQUE = "*";

const ligneFixe = (l: string): Ligne => ({ ligne: l, champs: {}, rendre: () => l });

/** Les champs qu'une ligne de la référence masque, lus sur elle. */
function masquesDe(ref: string): Set<string> {
  const m = new Set([...ref.matchAll(/(?:^| )(\w+)=\*(?= |$)/g)].map((x) => x[1]));
  if (ref.endsWith(` « ${MASQUE} »`)) m.add("progression");
  return m;
}

/** Ce que la page rend : les écritures de la sonde, et les marques que la spec pose à chaque geste. */
type Brut = EntreeDuJournal | { magasin: "geste"; texte: string };

const lireJson = <T>(chemin: string): T => JSON.parse(readFileSync(chemin, "utf8")) as T;

const exemples = Object.keys(lireJson<{ exemples: Record<string, unknown> }>(BASE_DU_SON).exemples)
  .filter((f) => !SEUL || f === `${SEUL}.json` || f === SEUL)
  .sort();

const cleDe = (f: string, s: Scenario) => `${f} · ${s}`;

/**
 * Une valeur de résultat telle qu'on la compare : sans adresse `blob:`, sans durée, sans graine tirée,
 * et l'écart de niveau au millième de décibel.
 *
 * LES DEUX DERNIERS SONT MESURÉS, à l'établissement du 2026-11-16. Une graine laissée à zéro est
 * tirée à chaque passe, et le message le dit : « graine 200828 », puis « graine 628748 », le reste
 * identique. L'écart de niveau bouge de 9e-8 dB au plus, sur cinq nœuds de trois exemples, et pas à
 * chaque passe : sur `compositeur-sur-une-pulsion`, un établissement l'a vu, le suivant non, et la
 * comparaison aurait pu tomber au hasard. Le millième de décibel laisse dix mille fois ce bruit.
 */
function valeurComparee(cle: string, v: string): string {
  if (cle === "ecartNiveau" && Number.isFinite(Number(v))) return Number(v).toFixed(3);
  return v.replace(/blob:[^"]*/g, "blob:…").replace(/graine \d+/g, "graine …");
}

/**
 * Les durées : leur valeur ne se compare jamais, et seule leur PREMIÈRE pose sur un nœud reste.
 *
 * LA RÉÉCRITURE D'UNE DURÉE NE SE REPRODUIT PAS. Mesuré le 2026-11-17 sur `gestion_graphe_complexite` :
 * ses boucles par passes enchaînent les passes, et un nœud trivial comme `tourner` y retrouve parfois
 * la même durée d'une passe à l'autre, au dixième de milliseconde, si bien que le magasin, qui
 * n'écrit pas une valeur inchangée, n'écrit rien. La ligne paraissait ou non selon l'horloge, et les
 * deux scénarios se sont déclarés variables.
 *
 * ET LA RETIRER TOUT ENTIÈRE AVEUGLAIT LE GARDE. Sans aucune ligne de durée, la pose des temps
 * passée avant la pose finale ne se voyait plus que par les écarts de niveau, qui bougent avec elle :
 * 9 exemples sur 15, mesuré, les six autres n'en ayant pas. La première pose, elle, a toujours lieu,
 * la clé étant absente sur une page neuve comme après un ↺ : elle reste, et c'est elle qui situe la
 * pose des temps dans la passe.
 */
const DUREES = new Set(["tempsExecution"]);

/** Une écriture relevée, en ligne. Rend `null` pour ce qui n'est que l'avancement d'un lecteur, ou une durée réécrite. */
function enLigne(e: Brut): Ligne | null {
  if (e.magasin === "geste") return ligneFixe(`— ${e.texte} —`);
  if (e.magasin === "priorite") return ligneFixe(`priorite ${e.apres ?? "aucune"}`);
  if (e.magasin === "statuts") {
    const { avant: a, apres: b } = e;
    if (a.statut === b.statut && a.progression === b.progression
      && a.progressionDuNoeud === b.progressionDuNoeud) return null;
    const tete = `statut ${e.id} ${b.statut}${b.progressionDuNoeud ? " ·nœud" : ""}`;
    const p = b.progression;
    const rendre = (m: ReadonlySet<string>) => (p === undefined ? tete : `${tete} « ${m.has("progression") ? MASQUE : p} »`);
    return { ligne: rendre(new Set()), champs: p === undefined ? {} : { progression: p }, rendre };
  }
  const poses = Object.keys(e.poses).filter((k) => !DUREES.has(k) || e.ajoutes.includes(k)).sort();
  const retires = [...e.retires].sort().map((k) => `-${k}`);
  if (poses.length === 0 && retires.length === 0) return null;
  const champs = Object.fromEntries(poses.map((k) => [k, DUREES.has(k) ? "…" : valeurComparee(k, e.poses[k])]));
  const rendre = (m: ReadonlySet<string>) =>
    `resultat ${e.id} ${[...poses.map((k) => `${k}=${m.has(k) ? MASQUE : champs[k]}`), ...retires].join(" ")}`;
  return { ligne: rendre(new Set()), champs, rendre };
}

/** Pose la marque d'un geste dans le journal ; `vider` le remet d'abord à zéro. */
async function marquer(page: Page, texte: string, vider = false): Promise<void> {
  const arme = await page.evaluate(([t, v]) => {
    const j = (window as unknown as { __attic_journal_de_passe__?: unknown[] }).__attic_journal_de_passe__;
    if (!Array.isArray(j)) return false;
    if (v) j.length = 0;
    j.push({ magasin: "geste", texte: t });
    return true;
  }, [texte, vider] as const);
  expect(arme, "la globale du journal n'est pas dans la page : `addInitScript` n'a pas tourné").toBe(true);
}

/**
 * Le nœud des gestes : le premier du fichier qui reçoit un câble et en rend un, son ▶ à l'écran.
 *
 * NI UNE SOURCE NI UN BOUT DE CHAÎNE, à défaut d'y être contraint : son ▶ laisse alors de l'aval en
 * attente, et son ↺ efface un aval que Lancer doit refaire pendant que l'amont sort du cache. Un nœud
 * replié dans une bulle n'a pas de ▶ à l'écran, et il est passé.
 *
 * À L'ÉCRAN VEUT DIRE QU'UN CLIC L'ATTEINT, et non qu'il est rendu. Un premier jet prenait
 * `isVisible`, vrai pour le ▶ de `tourne` sur `canon-de-proportions`, posé hors du cadre : le
 * canevas ne défile pas pour un clic. Le second voulait le ▶ dans la fenêtre, et celui de
 * `voir-forme`, sur `cercle-des-gammes`, l'était, sous la palette qui prenait le clic. Le nœud est donc
 * celui dont le ▶ est l'élément même qu'on trouve sous son centre.
 */
async function choisirLaCible(page: Page, graphe: string): Promise<string> {
  const g = JSON.parse(graphe) as { nodes: { id: string }[]; edges: { source: string; target: string }[] };
  const recoit = new Set(g.edges.map((e) => e.target));
  const rend = new Set(g.edges.map((e) => e.source));
  const aLEcran = async (id: string) => {
    const bouton = page.locator(`[data-id="${id}"] .attic-node-btn-prio`);
    if ((await bouton.count()) !== 1) return false;
    return await bouton.evaluate((b) => {
      const r = b.getBoundingClientRect();
      const dessous = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return !!dessous && (dessous === b || b.contains(dessous));
    });
  };
  const ordres = [g.nodes.filter((n) => recoit.has(n.id) && rend.has(n.id)), g.nodes.filter((n) => recoit.has(n.id)), g.nodes];
  for (const liste of ordres) for (const n of liste) if (await aLEcran(n.id)) return n.id;
  throw new Error("aucun nœud de ce graphe ne montre son ▶ dans la fenêtre");
}

/** Les écritures d'exécuteur que la passe a relevées sur l'instantané du graphe, depuis le chargement. */
const ecrituresRelevees = (page: Page): Promise<string[]> => page.evaluate(() =>
  (window as unknown as { __attic_ecritures_instantane__?: string[] }).__attic_ecritures_instantane__ ?? []);

/**
 * Presse le ↺ d'un nœud, par un `click` remis au bouton lui-même.
 *
 * ET NON PAR UN CLIC DE SOURIS, parce qu'un nœud grandit en montrant ses résultats : sur
 * `canon-de-proportions`, après Lancer, `rouleau` recouvre le ↺ de `maquette`, et le clic attendait
 * en vain qu'il se découvre. La remise à zéro n'ouvre aucun contexte audio et ne demande donc pas de
 * geste de l'utilisateur ; c'est le gestionnaire du bouton qui la fait, synchrone, écrite quand
 * l'événement est rendu.
 */
async function remettreAZero(page: Page, id: string): Promise<void> {
  await page.locator(`[data-id="${id}"] .attic-node-btn-reset`).dispatchEvent("click", undefined, { timeout: 15000 });
}

/**
 * Joue un scénario d'un exemple par le pilote, et rend la suite des écritures, marques comprises.
 *
 * LE SOUNDFONT ET LA FIN DU MÉNAGE SONT ATTENDUS PAR LE PILOTE, cinquième et sixième corrections de
 * son en-tête. Ce garde les attendait d'abord pour son compte, et la base du son, qui emploie le même
 * pilote, restait exposée au même défaut.
 */
async function jouer(page: Page, fichier: string, scenario: Scenario): Promise<Ligne[]> {
  const graphe = readFileSync(join(RACINE, "exemples", fichier), "utf8");
  if (scenario === "lancer") {
    await semerEtLancer(page, devUrl, graphe, {
      profondeurExport: 32,
      avantDeLancer: (p) => marquer(p, "Lancer", true),
    });
  } else {
    await semer(page, devUrl, graphe, { profondeurExport: 32 });
    const cible = await choisirLaCible(page, graphe);
    await marquer(page, `▶ ${cible}`, true);
    await lancerLeNoeudEtAttendre(page, cible);
    await marquer(page, `↺ ${cible}`);
    await remettreAZero(page, cible);
    await marquer(page, "Lancer");
    await relancerEtAttendre(page);
    // LE SECOND ↺ EFFACE UN AVAL CALCULÉ. Le premier ne trouvait que la cible : son ▶ n'avait rien
    // calculé de ce qui la suit.
    await marquer(page, `↺ ${cible}`);
    await remettreAZero(page, cible);
  }
  const brut = await page.evaluate(() =>
    (window as unknown as { __attic_journal_de_passe__: unknown[] }).__attic_journal_de_passe__) as Brut[];
  return brut.map(enLigne).filter((l): l is Ligne => l !== null);
}

/** Les lignes autour d'un rang, pour qu'un écart se lise dans son contexte. */
const autour = (lignes: string[], i: number) =>
  lignes.slice(Math.max(0, i - 3), i + 4).map((l, k) => `${Math.max(0, i - 3) + k === i ? "→" : " "} ${l}`);

/** Les trois passes d'un scénario, ramenées à une référence ; ou la raison pour laquelle elles ne le peuvent. */
function etablir(passes: Ligne[][]): { lignes: string[]; bruit: string[] } | { variable: string } {
  const longueurs = passes.map((p) => p.length);
  const n = Math.min(...longueurs);
  const lignes: string[] = [];
  const bruit: string[] = [];
  for (let i = 0; i < n; i++) {
    const vues = passes.map((p) => p[i]);
    if (vues.every((v) => v.ligne === vues[0].ligne)) { lignes.push(vues[0].ligne); continue; }
    // SEULS LES CHAMPS QUI DIFFÈRENT SONT MASQUÉS ; s'il reste une différence, c'est la suite qui varie.
    const masques = new Set(Object.keys(vues[0].champs).filter((k) => vues.some((v) => v.champs[k] !== vues[0].champs[k])));
    const rendues = vues.map((v) => v.rendre(masques));
    if (masques.size > 0 && rendues.every((r) => r === rendues[0])) {
      lignes.push(`~${rendues[0]}`);
      for (const k of masques) bruit.push(`rang ${i} · ${k} : ${vues.map((v) => v.champs[k]).join(" | ")}`.slice(0, 400));
      continue;
    }
    return { variable: `rang ${i} : ${vues.map((v) => v.ligne).join(" | ")}`.slice(0, 500) };
  }
  if (longueurs.some((l) => l !== n)) return { variable: `longueurs ${longueurs.join(", ")}, identiques jusqu'au rang ${n}` };
  return { lignes, bruit };
}

/** Ce qui sépare la référence de ce qu'on a vu, ou `null` quand ils disent la même chose. */
function ecartEntre(ref: string[], vu: Ligne[], quoi: string): string | null {
  const n = Math.max(ref.length, vu.length);
  for (let i = 0; i < n; i++) {
    const r = ref[i], v = vu[i];
    const egal = r !== undefined && v !== undefined && (r.startsWith("~") ? v.rendre(masquesDe(r)) === r.slice(1) : v.ligne === r);
    if (egal) continue;
    return [`${quoi} · premier écart au rang ${i} sur ${ref.length} lignes attendues, ${vu.length} vues`,
      "  attendu :", ...autour(ref, i).map((l) => `    ${l}`),
      "  vu :", ...autour(vu.map((x) => x.ligne), i).map((l) => `    ${l}`)].join("\n");
  }
  return null;
}

test.describe("le journal d'une passe", () => {
  test.setTimeout(10_800_000);

  test("chaque exemple écrit dans les magasins ce qu'il écrivait, dans le même ordre", async ({ page }) => {
    await page.addInitScript(() => {
      (window as unknown as { __attic_journal_de_passe__: unknown[] }).__attic_journal_de_passe__ = [];
    });
    const base: Base = existsSync(CHEMIN) ? lireJson<Base>(CHEMIN) : { forme: FORME, variables: {}, bruit: {}, exemples: {} };
    expect(base.forme, `${CHEMIN} est de forme ${base.forme}, ce garde lit la forme ${FORME}`).toBe(FORME);
    expect(exemples.length, "aucun exemple à jouer : la base du son est vide, ou `EXEMPLE=` ne la touche pas")
      .toBeGreaterThan(0);

    // ─── L'ÉTABLISSEMENT : chaque scénario joué trois fois, et ce qui ne se reproduit pas le dit ───
    if (ecrire) {
      for (const f of exemples) {
        const parScenario: Partial<Record<Scenario, string[]>> = {};
        for (const s of SCENARIOS) {
          const passes: Ligne[][] = [];
          for (let i = 0; i < PASSES; i++) passes.push(await jouer(page, f, s));
          const r = etablir(passes);
          const cle = cleDe(f, s);
          delete base.variables[cle]; delete base.bruit[cle];
          if ("variable" in r) {
            base.variables[cle] = r.variable;
            console.log(`${cle.padEnd(52)} VARIABLE · ${r.variable.slice(0, 110)}`);
            continue;
          }
          parScenario[s] = r.lignes;
          if (r.bruit.length > 0) base.bruit[cle] = r.bruit;
          console.log(`${cle.padEnd(52)} stable · ${r.lignes.length} écriture(s), dont ${r.bruit.length} valeur(s) masquée(s)`);
          for (const b of r.bruit) console.log(`${"".padEnd(55)}${b.slice(0, 150)}`);
        }
        base.exemples[f] = parScenario;
      }
      const trie = <T>(o: Record<string, T>) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)));
      writeFileSync(CHEMIN, `${JSON.stringify({ forme: FORME, variables: trie(base.variables), bruit: trie(base.bruit), exemples: trie(base.exemples) }, null, 2)}\n`, "utf8");
      console.log(`\nbase écrite : ${Object.keys(base.exemples).length} exemple(s), ${Object.keys(base.variables).length} scénario(s) variable(s).`);
      return;
    }

    // ─── LA COMPARAISON ───
    expect(existsSync(CHEMIN), `${CHEMIN} est absent : établissez-le avec ECRIRE_JOURNAUX_DE_PASSE=1`).toBe(true);
    const ecarts: string[] = [];
    const neufs: string[] = [];
    const releves: string[] = [];
    for (const f of exemples) {
      for (const s of SCENARIOS) {
        const cle = cleDe(f, s);
        const ref = base.exemples[f]?.[s];
        if (!ref) { if (!base.variables[cle]) neufs.push(cle); continue; }
        const vu = await jouer(page, f, s);
        releves.push(...(await ecrituresRelevees(page)).map((x) => `${cle} · ${x}`));
        const e = ecartEntre(ref, vu, cle);
        if (e) ecarts.push(e);
        console.log(`${cle.padEnd(52)} ${e ? "ÉCART" : `identique · ${ref.length} écriture(s)`}`);
      }
    }
    // CE QU'UN EXÉCUTEUR ÉCRIT SUR L'INSTANTANÉ DU GRAPHE SE DIT À CHAQUE PASSE, et ne la fait pas
    // tomber : relevée d'abord, décision 3 du plan des messages. Voir `core/instantane-de-graphe.ts`.
    console.log(`écritures sur l'instantané : ${releves.length}${releves.length ? `\n  ${releves.join("\n  ")}` : ""}`);
    // UN TROU DÉCIDÉ DOIT ÊTRE UN TROU VISIBLE : ce qui est déclaré variable le dit à chaque passe.
    for (const [cle, raison] of Object.entries(base.variables).filter(([x]) => exemples.some((f) => x.startsWith(`${f} · `)))) {
      console.log(`${cle.padEnd(52)} NON SURVEILLÉ · suite variable · ${raison.slice(0, 100)}`);
    }
    expect(neufs, ["", "Ces scénarios ne sont pas dans la base des journaux :", ...neufs.map((c) => `  ${c}`),
      "", "Inscrivez-les avec ECRIRE_JOURNAUX_DE_PASSE=1.", ""].join("\n")).toEqual([]);
    expect(ecarts, ["",
      "L'ORDRE DES ÉCRITURES D'UNE PASSE A CHANGÉ. Une pièce du chantier des messages se dit sans",
      "changement de comportement : ce qu'elle déplace doit écrire les mêmes champs, dans le même ordre.",
      "Si le changement est voulu, relisez-le, puis rétablissez la base avec ECRIRE_JOURNAUX_DE_PASSE=1.",
      "", ...ecarts, ""].join("\n")).toEqual([]);
  });
});
