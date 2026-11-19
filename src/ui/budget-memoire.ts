// ui/budget-memoire.ts — Ce que le budget mémoire de `config.json` règle dans l'interface.
//
// POURQUOI CE MODULE. Pièce C2 du plan du fichier de configuration (2026-11-19), après la demande de
// Fabien : « la RAM disponible pour le programme ». Le budget ne BORNE PAS la mémoire : le tas
// JavaScript reste à 4 Gio sur les deux systèmes, et rien ne peut forcer Chromium à rendre ce que ses
// processus tiennent. Il règle ce qu'Attic CHOISIT de garder :
//   — le seuil des aperçus, au-delà duquel l'économie de mémoire ne construit plus celui d'un nœud
//     qu'on ne regarde pas (`audio/memoire-audio.ts`, qui en garde la règle) ;
//   — la profondeur de l'historique, dont chaque état tient les adresses de ses médias
//     (`ui/hooks/useHistorique.ts`) ;
//   — l'alerte de l'indicateur de mémoire, dans la barre d'outils.
//
// LA RÈGLE EST UNE PROPORTION. Les seuils d'avant C2 (600 s, 50 états) ont été posés pour une
// « machine courante », que ce module fixe à 16 Gio : le facteur est le budget utile rapporté à
// celui de cette machine-là. Un budget de 16 Gio sous Windows rend donc exactement le comportement
// d'avant, et c'est ce qu'il faut écrire pour le retrouver sur une machine mieux pourvue.
//
// LA PART UTILE EST PLUS ÉTROITE SOUS LINUX, comme le plan le demandait : un dépassement y fait tuer
// le processus par le noyau, quand Windows écrit sur son fichier d'échange. 80 % du budget sous
// Windows, 60 % sous Linux, pour l'alerte comme pour le facteur.
//
// HORS D'ELECTRON, AUCUN BUDGET : le facteur vaut 1, et il n'y a rien à alerter.
import { configurationRecue } from "./configuration";
import { poserFacteurMemoire } from "./services-apercu";

/** La mémoire de la « machine courante », en Gio : `BUDGET_REFERENCE_GIO` de `electron/configuration.cjs`. */
export const BUDGET_REFERENCE_GIO = 16;

/** La part du budget qu'Attic s'autorise avant d'alerter, par système. */
export const PART_UTILE: Readonly<Record<"windows" | "linux", number>> = Object.freeze({ windows: 0.8, linux: 0.6 });

/** La profondeur de l'historique sur la machine de référence, celle d'avant C2. */
export const PROFONDEUR_HISTORIQUE = 50;

const GIO = 1024 ** 3;

export interface ReglagesDuBudget {
  /** Le budget en Gio ; `null` hors d'Electron. */
  gio: number | null;
  /** Le budget utile rapporté à celui de la machine de référence : 1 sur elle, et hors d'Electron. */
  facteur: number;
  /** Le nombre d'états que Ctrl+Z peut défaire, de 10 à 200. */
  profondeurHistorique: number;
  /** Au-delà de ce total, l'indicateur de mémoire alerte ; `null` hors d'Electron. */
  alerteOctets: number | null;
}

const SANS_BUDGET: ReglagesDuBudget = Object.freeze({ gio: null, facteur: 1, profondeurHistorique: PROFONDEUR_HISTORIQUE, alerteOctets: null });

/** Les réglages d'un budget, en Gio, sur ce système. Sans budget lisible, ceux d'avant C2. */
export function reglagesDuBudget(gio: unknown, systeme?: string): ReglagesDuBudget {
  if (typeof gio !== "number" || !Number.isFinite(gio) || gio <= 0) return SANS_BUDGET;
  const part = systeme === "linux" ? PART_UTILE.linux : PART_UTILE.windows;
  // AU MILLIONIÈME : 9,6 / 12,8 rend 0,7499999…, et 16 Gio sous Linux auraient fait 37 états et
  // 7 minutes au lieu de 38 et 8, relevé au premier passage des cas.
  const facteur = Math.round(((gio * part) / (BUDGET_REFERENCE_GIO * PART_UTILE.windows)) * 1e6) / 1e6;
  return Object.freeze({
    gio,
    facteur,
    profondeurHistorique: Math.min(200, Math.max(10, Math.round(PROFONDEUR_HISTORIQUE * facteur))),
    alerteOctets: Math.floor(gio * part * GIO),
  });
}

let courant: ReglagesDuBudget = SANS_BUDGET;

/** Les réglages en vigueur. Avant que la configuration ne soit reçue, ceux d'avant C2. */
export const budgetCourant = (): ReglagesDuBudget => courant;

/** Demande la configuration et pose ses réglages ; appelé une fois, au démarrage (`main.tsx`). */
export async function chargerLeBudget(): Promise<ReglagesDuBudget> {
  const c = await configurationRecue();
  courant = reglagesDuBudget(c.valeurs.budgetMemoireGio, c.systeme);
  poserFacteurMemoire(courant.facteur);
  return courant;
}

/** Rend les réglages d'avant C2. Pour un test seulement. */
export function oublierLeBudget(): void {
  courant = SANS_BUDGET;
  poserFacteurMemoire(1);
}

/** Le total mesuré dépasse-t-il la part utile du budget ? */
export const memoireAuDela = (totalOctets: number, b: ReglagesDuBudget = courant): boolean =>
  b.alerteOctets !== null && totalOctets > b.alerteOctets;

/**
 * La ligne que l'infobulle de l'indicateur ajoute au-delà de la part utile, ou `null` en deçà.
 *
 * ELLE DIT LE BUDGET ET LA PART, et la clé qui les règle : l'alerte n'arrête rien, elle dit seulement
 * qu'Attic tient plus que ce que la personne lui a accordé.
 */
export function alerteMemoire(totalOctets: number, t: (cle: string) => string, b: ReglagesDuBudget = courant): string | null {
  if (!memoireAuDela(totalOctets, b) || b.gio === null || b.alerteOctets === null) return null;
  return t("barre.memoire.alerte")
    .replace("{part}", String(Math.round((b.alerteOctets / (b.gio * GIO)) * 100)))
    .replace("{budget}", String(b.gio));
}
