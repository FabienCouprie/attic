// tests-e2e/pilote-graphe.ts — Semer un graphe, le lancer, attendre qu'il ait fini, lire ce qu'il rend.
//
// POURQUOI CE FICHIER EXISTE. Le garde du son des exemples a dû apprendre à piloter l'application
// de bout en bout : poser un graphe, presser Lancer, savoir quand c'est fini, relire les aperçus.
// Le verbe `exécuter` demande exactement la même chose. Recopier ces quarante lignes aurait recopié
// leurs corrections — et il y en a trois, chacune payée d'une mesure fausse.
//
// LES TROIS CORRECTIONS QUI VOYAGENT AVEC, et qu'un second exemplaire perdrait :
//
//   1. LE CLIC EST UN VRAI CLIC. Un `b.click()` écrit dans la page n'est pas un geste utilisateur :
//      un contexte audio peut rester suspendu, et l'on mesure alors le silence d'un graphe qui n'a
//      jamais eu le droit de sonner.
//   2. UN RUN EST FINI QUAND L'ÉTAT LE DIT, non après une durée fixe. Trente-huit secondes
//      mesuraient un graphe à moitié calculé sur les exemples longs, et perdaient du temps sur les
//      courts.
//   3. LES APERÇUS SE POSENT APRÈS LE STATUT, ET PAS TOUS ENSEMBLE. Une attente fixe d'une seconde
//      et demie relevait six lecteurs sur `canon-de-proportions` à une passe et huit à la suivante.
//      On attend que leur nombre CESSE DE BOUGER, ce qui s'arrête tout seul quand il n'y en a aucun.
//
// CE QU'IL NE FAIT PAS : juger. Il rend l'état de chaque nœud et ce que chacun fait entendre ;
// c'est à l'appelant de décider si cela lui convient.
import type { Page } from "@playwright/test";

/** Au-delà, on considère que le graphe ne finira pas : un graphe bloqué ne bloque pas la passe. */
export const DELAI_RUN_MS = 180_000;

export interface EtatNoeud {
  id: string;
  statut: "termine" | "erreur" | "en-cours" | "attente";
  /** Ce que le nœud a PRODUIT et affiche : « Metal C3 — 3.00s ». Rien à voir avec une erreur. */
  message: string | null;
  /**
   * POURQUOI le nœud est en erreur, et ce champ manquait.
   *
   * L'application met la cause d'une erreur DANS L'INFOBULLE du libellé de statut, et non dans le
   * message du nœud — décision écrite dans `AtelierNode.tsx` : « le message va dans l'infobulle
   * plutôt que dans le libellé, qui doit rester court ». Un premier jet de ce pilote ne lisait que
   * `.attic-node-message`, qui porte le RÉSULTAT d'un run réussi : il annonçait donc « sans
   * message » sur un nœud dont la cause était là, à côté, lisible.
   *
   * CE QUE CELA COÛTAIT, relevé dans la base du son des exemples : HUIT ENTRÉES SUR DIX étaient des
   * identifiants nus — `clavier`, `ecoute`, `extrait`, `jouer`, `phase`, `selecteur`, `stretch`,
   * `noeud-2` — alors que chacun portait « Entrée en erreur : … ». Un instrument qui tait la cause
   * fait diagnostiquer autre chose : j'ai failli réparer un message vide qui ne l'était pas.
   */
  cause: string | null;
}

export interface OptionsPilote {
  /**
   * La profondeur d'export à épingler, en bits.
   *
   * C'EST UNE PRÉFÉRENCE UTILISATEUR, et on ne peut pas la laisser décider d'une mesure : le même
   * aperçu écrit en seize et en vingt-quatre bits donne deux chiffres. Trente-deux bits flottants
   * n'arrondit rien — l'aperçu porte alors le tampon rendu et non sa quantification.
   */
  profondeurExport?: 16 | 24 | 32;
  delaiRunMs?: number;
  /**
   * Ce qu'il y a à faire une fois le graphe POSÉ et AVANT qu'on lance.
   *
   * POURQUOI CE CRÉNEAU EXISTE. Un graphe ne se sème pas toujours entier : un nœud d'entrée audio
   * attend un `File`, qui ne traverse pas le JSON de l'en-cours. Il faut donc le poser par le
   * bouton du nœud, entre le rechargement et le clic sur Lancer — et c'est le seul instant où ce
   * n'est possible ni avant ni après.
   *
   * ET IL N'Y EN A QU'UN, plutôt qu'un pilotage de plus dans le spec qui en a besoin. Le contrat
   * `docs/contrat-pilote-de-graphe.test.ts` l'exige : un appelant qui garde son propre pilotage est
   * la façon dont la divergence revient — une correction posée dans l'un, l'autre garde le défaut.
   */
  avantDeLancer?: (page: Page) => Promise<void>;
  /**
   * Les nœuds qu'on admet « en attente » à la fin d'un run, par leur identifiant.
   *
   * LE DÉBUT D'UNE BOUCLE DE GRAPHE Y RESTE, par décision écrite dans `ui/hooks/useExecutionGraphe.ts` :
   * il est retiré du graphe exécuté, et son statut dit ce que le dépliage a décidé, non le compte
   * rendu d'un calcul. Sans cette liste, aucun graphe à boucle ne pouvait se mener : le pilote
   * attendait jusqu'à son délai un nœud qui ne quittera jamais l'attente.
   */
  attentesAdmises?: readonly string[];
}

/**
 * Sème un graphe dans l'application, le lance, et rend la main quand tout est calculé et affiché.
 */
export async function semerEtLancer(
  page: Page, url: string, grapheJson: string, o: OptionsPilote = {},
): Promise<void> {
  await semer(page, url, grapheJson, o);
  if (o.avantDeLancer) await o.avantDeLancer(page);
  await relancerEtAttendre(page, o);
}

/**
 * Sème un graphe dans l'application SANS le lancer.
 *
 * POURQUOI CE VERBE EXISTE À PART. Le ▶ d'un nœud ne s'éprouve que sur un graphe dont rien n'a encore
 * tourné : semer puis presser Lancer aurait déjà tout calculé. Voir `lancerLeNoeudEtAttendre`.
 */
export async function semer(
  page: Page, url: string, grapheJson: string, o: OptionsPilote = {},
): Promise<void> {
  await page.goto(url);
  await page.waitForSelector(".attic-app", { timeout: 15000 });
  await page.evaluate(([g, bits]) => {
    localStorage.setItem("attic-encours", g as string);
    localStorage.setItem("attic-profondeur-export", String(bits));
  }, [grapheJson, o.profondeurExport ?? 32] as const);
  await page.reload();
  await page.waitForSelector(".attic-app", { timeout: 15000 });
  await page.waitForTimeout(2500);
}

/**
 * Presser Lancer sur le graphe DÉJÀ POSÉ, et rendre la main quand tout est calculé et affiché.
 *
 * POURQUOI CE VERBE EXISTE À PART. `semerEtLancer` resème avant de lancer, et un cas qui veut
 * éprouver l'effet d'un RÉGLAGE doit relancer SANS resemer — sans quoi il mesure un graphe neuf et
 * non l'effet du réglage. C'est aussi le seul chemin par lequel le CACHE est en jeu : un réglage
 * dont la valeur n'entre pas dans la clé de cache paraît agir au premier run et plus au second, ce
 * qui est la pire espèce de panne. Voir `frequence-de-travail-dans-application.spec.ts`, qui le
 * garde — il a d'ailleurs trouvé ce défaut en naissant.
 *
 * ET LES TROIS CORRECTIONS DE L'EN-TÊTE VOYAGENT AVEC, puisque c'est le même corps : le clic est un
 * vrai clic, un run est fini quand l'état le dit, et les aperçus se posent après le statut.
 */
export async function relancerEtAttendre(page: Page, o: OptionsPilote = {}): Promise<void> {
  await page.locator('button[title*="Lancer"]').first().click({ timeout: 15000 });

  await page.waitForFunction((admis) => {
    const puces = document.querySelectorAll(".attic-node-statut-puce");
    if (puces.length === 0) return false;
    const enAttente = [...document.querySelectorAll(".attic-node-statut-puce.attente")]
      .filter((p) => !admis.includes(p.closest("[data-id]")?.getAttribute("data-id") ?? ""));
    return document.querySelectorAll(".attic-node-statut-puce.en-cours").length === 0 && enAttente.length === 0;
  }, [...(o.attentesAdmises ?? [])], { timeout: o.delaiRunMs ?? DELAI_RUN_MS });

  await apercusPoses(page);
}

/**
 * Presser le ▶ d'UN nœud sur le graphe déjà posé, et rendre la main quand ce run-là est fini.
 *
 * POURQUOI CE VERBE EXISTE À PART. Le ▶ d'un nœud ne calcule que ce dont il dépend : ce qui est hors
 * de ce périmètre reste « en attente », et la fin d'un run global, plus rien en attente, ne viendrait
 * jamais. La fin se lit donc sur le nœud visé : plus rien ne tourne, et lui a quitté l'attente. Les
 * deux autres corrections de l'en-tête voyagent avec : le clic est un vrai clic, et les aperçus se
 * posent après le statut.
 *
 * LE NŒUD VISÉ DOIT ÊTRE EN ATTENTE AVANT LE CLIC, ce qu'est tout nœud d'un graphe qu'on vient de
 * `semer` : un nœud déjà terminé l'est encore avant que son run ne parte, et l'attente rendrait la
 * main trop tôt. UN ▶ QUI NE LANCE RIEN laisse le nœud en attente, et c'est le délai qui le dit.
 */
export async function lancerLeNoeudEtAttendre(page: Page, id: string, o: OptionsPilote = {}): Promise<void> {
  await page.locator(`[data-id="${id}"] .attic-node-btn-prio`).click({ timeout: 15000 });

  await page.waitForFunction((cible) => {
    const puce = document.querySelector(`[data-id="${cible}"] .attic-node-statut-puce`);
    return !!puce && !puce.classList.contains("attente")
      && document.querySelectorAll(".attic-node-statut-puce.en-cours").length === 0;
  }, id, { timeout: o.delaiRunMs ?? DELAI_RUN_MS });

  await apercusPoses(page);
}

/**
 * Attendre que le nombre de lecteurs posés CESSE DE BOUGER, ce qui s'arrête tout seul quand il n'y en
 * a aucun. Voir la troisième correction de l'en-tête.
 *
 * LE COMPTE REPART DE ZÉRO À CHAQUE APPEL. Il vit sur `window`, et un second run sur la même page le
 * trouverait déjà à six : le premier relevé rendrait la main, avant que le moindre aperçu ait bougé.
 */
async function apercusPoses(page: Page): Promise<void> {
  await page.evaluate(() => { (window as unknown as { __stable?: number }).__stable = 0; });
  await page.waitForFunction(() => {
    const n = document.querySelectorAll("[data-id] audio[src]").length;
    const w = window as unknown as { __nb?: number; __stable?: number };
    if (w.__nb === n) w.__stable = (w.__stable ?? 0) + 1;
    else { w.__nb = n; w.__stable = 0; }
    return (w.__stable ?? 0) >= 6;
  }, undefined, { timeout: 120_000, polling: 500 });
}

/**
 * Commence à relever les nœuds qui passent « en cours », pour savoir ce qu'un run a VRAIMENT refait.
 *
 * L'ÉTAT FINAL NE LE DIT PAS : un nœud repris du cache et un nœud recalculé finissent tous deux
 * « terminés ». Seul le passage par « en cours » distingue les deux — le moteur ne le pose qu'après
 * avoir écarté le cache —, et il faut donc le guetter pendant le run.
 */
export async function observerLesRelances(page: Page): Promise<void> {
  await page.evaluate(() => {
    const vus = new Set<string>();
    (window as unknown as { __relances__: Set<string> }).__relances__ = vus;
    new MutationObserver(() => {
      for (const p of document.querySelectorAll(".attic-node-statut-puce.en-cours")) {
        const id = p.closest("[data-id]")?.getAttribute("data-id");
        if (id) vus.add(id);
      }
    }).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["class"] });
  });
}

/** Les nœuds visibles passés « en cours » depuis `observerLesRelances`, triés. */
export async function lireLesRelances(page: Page): Promise<string[]> {
  return await page.evaluate(() => [...(window as unknown as { __relances__: Set<string> }).__relances__].sort());
}

/**
 * L'état de chaque nœud après un run : son statut, ce qu'il a produit, et pourquoi il a échoué.
 *
 * LES TROIS SONT NÉCESSAIRES, et le statut seul ne suffit pas : un relevé qui dirait « six nœuds en
 * erreur » obligerait à rejouer le graphe pour savoir lesquels et pourquoi. LE RÉSULTAT ET LA CAUSE
 * SONT DEUX CHOSES, posées par l'application à deux endroits différents — voir `EtatNoeud.cause`.
 */
export async function etatDesNoeuds(page: Page): Promise<EtatNoeud[]> {
  return await page.evaluate(() => {
    const out: { id: string; statut: string; message: string | null; cause: string | null }[] = [];
    for (const n of Array.from(document.querySelectorAll("[data-id]")) as HTMLElement[]) {
      const id = n.dataset.id;
      const puce = n.querySelector(".attic-node-statut-puce");
      if (!id || !puce) continue;
      const statut = ["termine", "erreur", "en-cours", "attente"].find((c) => puce.classList.contains(c)) ?? "attente";
      const message = n.querySelector(".attic-node-message")?.textContent?.replace(/^⧉/, "").trim() ?? null;
      const cause = n.querySelector(".attic-node-statut-label")?.getAttribute("title")?.trim() ?? null;
      out.push({ id, statut, message: message || null, cause: cause || null });
    }
    return out;
  }) as EtatNoeud[];
}

/**
 * Ce que chaque nœud fait ENTENDRE, en WAV encodé en base64.
 *
 * TOUT NŒUD QUI PRODUIT DE L'AUDIO EXPOSE SON APERÇU, et pas seulement « Sortie audio » : relevé en
 * ouvrant l'exemple microtonal, cinq lecteurs là où l'on en attendait deux. C'est donc la liste des
 * lecteurs qui dit ce qui s'entend, et non la liste des nœuds de sortie.
 *
 * LE BASE64 SE FAIT PAR TRANCHES de trente-deux kilo-octets : `String.fromCharCode(...octets)` fait
 * déborder la pile dès le mégaoctet, et trois secondes en seize bits stéréo en pèsent 1,15.
 */
export async function apercusEnWav(page: Page): Promise<{ id: string; base64: string; octets: number }[]> {
  return await page.evaluate(async () => {
    const out: { id: string; base64: string; octets: number }[] = [];
    for (const a of Array.from(document.querySelectorAll("[data-id] audio")) as HTMLAudioElement[]) {
      const id = (a.closest("[data-id]") as HTMLElement | null)?.dataset.id;
      if (!id || !a.src) continue;
      const octets = new Uint8Array(await (await fetch(a.src)).arrayBuffer());
      let s = "";
      for (let i = 0; i < octets.length; i += 0x8000) {
        s += String.fromCharCode.apply(null, octets.subarray(i, i + 0x8000) as unknown as number[]);
      }
      out.push({ id, base64: btoa(s), octets: octets.length });
    }
    return out;
  });
}
