// core/saut-de-boucle.ts — Une boucle inchangée ne se recalcule pas, même quand son corps a été lâché.
//
// ═══ LE DÉFAUT, SIGNALÉ PAR FABIEN LE 2026-10-28 ═══
//
// « On exécute cette boucle, qui prend fin sans erreur. Si on place un nœud Point d'écoute à sa
// suite, toute la boucle est réexécutée. » Mesuré dans l'application sur son graphe, ramené à trois
// tours : au second run, les huit nœuds du corps, la fin et le point d'écoute repartaient, 5 s ; le
// même geste sans l'économie de mémoire ne relançait que le point d'écoute, 1 s.
//
// CE N'ÉTAIT PAS UNE PANNE MAIS UN PRIX, écrit dans `core/memoire.ts` : le corps d'une boucle dépliée
// est lâché en fin de run, demandé par Fabien pour la mémoire, et « une boucle inchangée ne se
// recalculait pas ; désormais elle se recalcule ». Les copies n'ayant plus de cache, elles tournent,
// et une fin de boucle dont une source a tourné ne peut plus croire le sien : c'est la règle de
// `core/cache-execution.ts`, qui ne se fie pas aux empreintes de valeurs, faites de formes.
//
// ═══ CE QUE CE MODULE FAIT, ET POURQUOI L'ÉCONOMIE RESTE ═══
//
// LA FIN DE BOUCLE RANGE, AVEC SON RÉSULTAT, L'EMPREINTE DE SA BOUCLE ENTIÈRE : les réglages de
// chaque copie et son numéro de tour, le câblage du corps, et ce qui y entre du dehors. Au run
// suivant, si cette empreinte est la même et qu'aucune source du dehors n'a tourné, le corps n'a
// rien de neuf à dire : on le saute, et la fin rend ce qu'elle avait rendu. Les copies restent
// lâchées — l'économie de mémoire ne change pas —, c'est l'ouvrage qu'on garde, pas l'échafaudage.
//
// LES VALEURS DU DEHORS ENTRENT PAR LEUR EMPREINTE, ET CE N'EST SÛR QU'À UNE CONDITION. Une empreinte
// décrit une forme ; deux sons différents de même durée la partagent. On n'y croit donc que si leur
// source n'a PAS tourné pendant ce run, c'est-à-dire qu'elle rend l'objet même du run d'avant : la
// même règle que pour un nœud seul.
//
// ═══ QUAND ON NE SAUTE PAS, ET L'ON REVIENT AU CALCUL ORDINAIRE ═══
//
//   · un câble sort du corps ailleurs que par la fin : son destinataire a besoin d'une copie ;
//   · un nœud du corps ou la fin refuse le cache (`jamaisCache`) ;
//   · une source du dehors n'est pas encore calculée quand le corps commence, ou vient de tourner ;
//   · la fin elle-même a changé : ses réglages, son câblage d'entrée, ou son câblage de sortie
//     quand elle l'a consulté.
import type { AreteG, NoeudG } from "./meta";
import type { CachePrecedent } from "./cache-execution";
import { empreinteEntrees, empreinteParametres, empreinteSorties, empreinteValeur } from "./graphe";
import { resultatRetenu } from "./memoire";

/** Ce que le dépliage dit d'une boucle, et dont la décision a besoin. */
export interface BoucleDepliee {
  finId: string;
  copies: readonly string[];
  sortiesVersDehors: number;
}

/** Ce que le cache garde d'une fin de boucle : ses empreintes ordinaires, et celle de sa boucle. */
export interface CacheDeFin extends CachePrecedent {
  empreinteBoucle?: string;
}

/** Ce que le moteur prête pour un run. */
export interface MoteurDuRun {
  noeuds: readonly NoeudG[];
  aretes: readonly AreteG[];
  resultats: ReadonlyMap<string, readonly unknown[]>;
  cache: ReadonlyMap<string, CacheDeFin>;
  /** Les réglages de projet, tels que le moteur les mêle à chaque clé. */
  reglages: string;
  toursDesCopies: ReadonlyMap<string, number>;
  jamaisCache: (id: string) => boolean;
}

/** Hachage de 53 bits (cyrb53) : l'empreinte d'une boucle de trente-deux tours tient en treize chiffres. */
function hacher(texte: string): string {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < texte.length; i++) {
    const c = texte.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

const indexDe = (poignee: string | null | undefined, defaut: string) =>
  parseInt((poignee ?? defaut).split(":")[1] ?? "0", 10);

/** Les arêtes qui entrent dans le corps ou dans la fin, et la source de chacune. */
const aretesDeLaBoucle = (b: BoucleDepliee, aretes: readonly AreteG[], corps: ReadonlySet<string>) =>
  aretes.filter((a) => corps.has(a.target) || a.target === b.finId);

/**
 * L'empreinte d'une boucle dépliée, ou `null` quand une source du dehors n'est pas encore calculée.
 *
 * ELLE NE DÉPEND QUE DE CE QUI DÉCIDE DE CE QUE REND LA FIN : les réglages et le tour de chaque copie,
 * les réglages de la fin, le câblage du corps, et l'empreinte de chaque valeur qui entre du dehors.
 */
export function empreinteDeBoucle(b: BoucleDepliee, m: MoteurDuRun): string | null {
  const corps = new Set(b.copies);
  const parId = new Map(m.noeuds.map((n) => [n.id, n]));
  const reglagesDe = (id: string) => empreinteParametres((parId.get(id)?.data ?? {}) as Record<string, unknown>);
  const parties = [`r ${m.reglages}`, `f ${b.finId} ${reglagesDe(b.finId)}`];
  for (const id of corps) parties.push(`n ${id} ${reglagesDe(id)} ${m.toursDesCopies.get(id) ?? ""}`);
  for (const a of aretesDeLaBoucle(b, m.aretes, corps)) {
    const lien = `${a.source}[${a.sourceHandle ?? ""}]>${a.target}[${a.targetHandle ?? ""}]`;
    if (corps.has(a.source)) { parties.push(`i ${lien}`); continue; }
    const valeurs = m.resultats.get(a.source);
    if (!valeurs) return null;
    parties.push(`e ${lien} ${empreinteValeur(valeurs[indexDe(a.sourceHandle, "out:0")] ?? null)}`);
  }
  return hacher(parties.sort().join("\n"));
}

/** Peut-on sauter le corps de cette boucle et reprendre sa fin telle quelle ? Voir l'en-tête. */
export function peutSauterLaBoucle(b: BoucleDepliee, m: MoteurDuRun, retraites: ReadonlySet<string>): boolean {
  const fin = m.cache.get(b.finId);
  if (!fin?.empreinteBoucle || b.sortiesVersDehors > 0 || b.copies.length === 0) return false;
  if ([b.finId, ...b.copies].some(m.jamaisCache)) return false;
  const corps = new Set(b.copies);
  if (aretesDeLaBoucle(b, m.aretes, corps).some((a) => !corps.has(a.source) && retraites.has(a.source))) return false;
  const finNoeud = m.noeuds.find((n) => n.id === b.finId);
  const hashParams = empreinteParametres((finNoeud?.data ?? {}) as Record<string, unknown>) + m.reglages;
  if (fin.hashParams !== hashParams || fin.hashEntree !== empreinteEntrees(b.finId, m.aretes as AreteG[])) return false;
  if (fin.consulteSorties && fin.hashSorties !== empreinteSorties(b.finId, m.aretes as AreteG[])) return false;
  return fin.empreinteBoucle === empreinteDeBoucle(b, m);
}

/**
 * Les sauts d'un run : décidés au premier passage dans le corps d'une boucle, puis tenus.
 *
 * LE MOTEUR N'Y POSE QUE TROIS QUESTIONS, une copie est-elle sautée, une fin est-elle reprise, et
 * quelle empreinte ranger avec une fin qui vient de tourner. Tout le reste vit ici, où il s'éprouve.
 */
export function sautsDeBoucles(depliees: readonly BoucleDepliee[], m: MoteurDuRun) {
  const parCopie = new Map<string, BoucleDepliee>();
  for (const b of depliees) for (const c of b.copies) parCopie.set(c, b);
  const parFin = new Map(depliees.map((b) => [b.finId, b]));
  const sautees = new Map<string, boolean>();
  return {
    copieSautee(id: string, retraites: ReadonlySet<string>): boolean {
      const b = parCopie.get(id);
      if (!b) return false;
      if (!sautees.has(b.finId)) sautees.set(b.finId, peutSauterLaBoucle(b, m, retraites));
      return sautees.get(b.finId)!;
    },
    finReprise: (id: string): boolean => sautees.get(id) === true,
    empreintePour(id: string): string | undefined {
      const b = parFin.get(id);
      return b ? empreinteDeBoucle(b, m) ?? undefined : undefined;
    },
  };
}

/**
 * Le corps des boucles se lâche en fin de run, sauf sans économie de mémoire. Voir `resultatRetenu`.
 *
 * VENU DE `ui/hooks/useExecutionGraphe.ts`, qui est en dette de taille et ne peut pas grossir : ce
 * que ce lot y ajoute y est payé par ce qu'il en retire.
 */
export function lacherLeCorps(copies: Iterable<string>, cache: Map<string, unknown>, economie: boolean): void {
  if (resultatRetenu({ cacheParBulle: false, corpsDeBoucle: true, economie })) return;
  for (const c of copies) cache.delete(c);
}
