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
}

/**
 * Sème un graphe dans l'application, le lance, et rend la main quand tout est calculé et affiché.
 */
export async function semerEtLancer(
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

  await page.locator('button[title*="Lancer"]').first().click({ timeout: 15000 });

  await page.waitForFunction(() => {
    const puces = document.querySelectorAll(".attic-node-statut-puce");
    if (puces.length === 0) return false;
    return document.querySelectorAll(".attic-node-statut-puce.en-cours").length === 0
      && document.querySelectorAll(".attic-node-statut-puce.attente").length === 0;
  }, undefined, { timeout: o.delaiRunMs ?? DELAI_RUN_MS });

  await page.waitForFunction(() => {
    const n = document.querySelectorAll("[data-id] audio[src]").length;
    const w = window as unknown as { __nb?: number; __stable?: number };
    if (w.__nb === n) w.__stable = (w.__stable ?? 0) + 1;
    else { w.__nb = n; w.__stable = 0; }
    return (w.__stable ?? 0) >= 6;
  }, undefined, { timeout: 120_000, polling: 500 });
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
