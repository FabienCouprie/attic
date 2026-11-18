// core/instantane-de-graphe.ts — Le graphe qu'une passe lit, copié à son départ, et ce qu'on y écrit, relevé.
//
// POURQUOI. Pièce P2 du plan de l'architecture par messages entre l'interface et le moteur. La passe
// lisait le tableau des nœuds de React Flow, et l'objet `data` de chaque nœud lui était prêté par
// référence : l'aplatissement copie un nœud sans copier son `data`, et un exécuteur lit ses réglages
// paresseusement, quand il appelle `paramNombre`, parfois après plusieurs secondes de calcul. Un méta
// modifié en place pendant ce temps, ce que fait l'édition d'un méta ouvert, changeait donc ce que lisait
// une passe déjà partie. La passe lit désormais une COPIE, prise par la question `graphe()` au départ de
// chacune d'elles, au même instant que la lecture d'avant.
//
// CE QUI EST COPIÉ, ET PAR QUI. La copie est celle de l'historique, `copierPourHistorique`, qui vit au
// shell et que ce module reçoit : les objets simples et les tableaux sont recopiés, et ce qui n'en est
// pas un, un fichier, un tampon, un tableau typé, est gardé par référence. Une seconde copie écrite ici
// vieillirait à côté de la première. Les métas employés sont copiés avec, à toute profondeur, un méta
// pouvant en contenir un autre : la préparation les lit dans l'instantané, et non dans le registre.
//
// CE QU'ON Y ÉCRIT SE RELÈVE, ET PAR UN SCEAU, NON PAR UN PROXY. Le plan prévoyait d'envelopper chaque
// `data` d'un `Proxy` qui relève les écritures sans lever. Mesuré le 2026-11-17 : `structuredClone`
// refuse un tableau enveloppé, un objet enveloppé et un objet simple qui en contient un, tous trois en
// `DataCloneError`. Or `plugins/montage.ts` rend `ctx.noeud.data.zonesSelectionnees` dans ses valeurs,
// qui partent au cache, au paquet `.attic` et aux workers. Décidé par Fabien le même jour : chaque
// `data` est scellé à l'instantané, et ce qui a changé se relève à la fin de la passe. Aucun objet ne
// change d'identité, aucun ne cesse de se cloner.
//
// CE QUE LE SCEAU VOIT : une clé posée, changée ou retirée, à toute profondeur, et une valeur lourde
// remplacée par une autre. CE QU'IL NE VOIT PAS : l'intérieur d'une valeur lourde, un exécuteur qui
// écrirait dans le `getChannelData` d'un tampon d'entrée (risque R4 du plan) ; une écriture qui remet
// la valeur d'avant ; et l'instant de l'écriture, que le relevé ne donne pas, seul le nœud.
import type { AreteG, MetaComposant, NoeudG } from "./meta";
import type { InstantaneDeGraphe } from "./protocole-moteur";

/** Une copie profonde des objets simples, le reste par référence : celle de l'historique, au shell. */
export type Copieur = <T>(valeur: T) => T;

export interface OptionsInstantane {
  noeuds: readonly NoeudG[];
  aretes: readonly AreteG[];
  trouverMeta: (ficheId: string) => MetaComposant | undefined;
  copier: Copieur;
}

/** Le graphe tel qu'une passe le lira : nœuds, arêtes et métas employés, copiés à cet instant. */
export function prendreInstantane(o: OptionsInstantane): InstantaneDeGraphe {
  const noeuds = o.copier(o.noeuds as NoeudG[]);
  const aretes = o.copier(o.aretes as AreteG[]);
  const metas = new Map<string, MetaComposant>();
  const parcourir = (liste: readonly NoeudG[]) => {
    for (const n of liste) {
      const ficheId = n.data?.ficheId;
      if (typeof ficheId !== "string" || metas.has(ficheId)) continue;
      const meta = o.trouverMeta(ficheId);
      if (!meta) continue;
      const copie = o.copier(meta);
      metas.set(ficheId, copie);
      parcourir(copie.sousNoeuds);
    }
  };
  parcourir(noeuds);
  return { noeuds, aretes, metas: [...metas.values()] };
}

/** Le `trouverMeta` d'une passe : les métas de son instantané, et aucun autre. */
export function metaDeLInstantane(instantane: InstantaneDeGraphe): (ficheId: string) => MetaComposant | undefined {
  const parId = new Map(instantane.metas.map((m) => [m.id, m]));
  return (ficheId) => parId.get(ficheId);
}

const estSimple = (v: object): boolean => {
  const proto = Object.getPrototypeOf(v);
  return Array.isArray(v) || proto === Object.prototype || proto === null;
};

/** Ce que le sceau retient d'un `data` : son texte, les valeurs lourdes y étant remplacées par leur rang. */
interface Sceau { texte: string; lourdes: readonly unknown[] }

function sceller(data: unknown): Sceau {
  const lourdes: unknown[] = [];
  const texte = JSON.stringify(data ?? null, (_cle, v: unknown) => {
    if (typeof v === "function") return { "@fonction": true };
    if (v === undefined) return { "@undefined": true };
    if (v !== null && typeof v === "object" && !estSimple(v)) {
      lourdes.push(v);
      return { "@lourde": lourdes.length - 1 };
    }
    return v;
  });
  return { texte, lourdes };
}

const memeSceau = (a: Sceau, b: Sceau): boolean =>
  a.texte === b.texte && a.lourdes.length === b.lourdes.length && a.lourdes.every((v, i) => v === b.lourdes[i]);

/**
 * Scelle le `data` de chaque nœud de l'instantané, internes des métas compris, et rend de quoi dire
 * lesquels ont changé depuis.
 *
 * UN NŒUD INTERNE SE NOMME PAR SON MÉTA, « méta/nœud », comme il est rangé. Une copie de boucle ou
 * d'instrument partage le `data` de son nœud d'origine : elle n'a pas de sceau à elle, et ce qu'elle
 * écrit se relève sur lui.
 */
export function scellerLInstantane(instantane: InstantaneDeGraphe): () => string[] {
  const sceaux: { id: string; noeud: NoeudG; sceau: Sceau }[] = [];
  for (const n of instantane.noeuds) sceaux.push({ id: n.id, noeud: n, sceau: sceller(n.data) });
  for (const m of instantane.metas) {
    for (const sn of m.sousNoeuds) sceaux.push({ id: `${m.id}/${sn.id}`, noeud: sn, sceau: sceller(sn.data) });
  }
  return () => sceaux.filter((s) => !memeSceau(sceller(s.noeud.data), s.sceau)).map((s) => s.id);
}

/**
 * La globale où s'accumulent les écritures relevées, pour qu'une épreuve la lise.
 *
 * LE PRÉCÉDENT EST `__attic_runs_simultanes__` de `ui/moteur/ordonnanceur-runs.ts`. Elle ne coûte rien tant
 * qu'aucun exécuteur n'écrit, et elle est bornée : un exécuteur qui écrirait à chaque passe ne la
 * ferait pas grossir sans fin.
 */
const PORTEE = globalThis as unknown as { __attic_ecritures_instantane__?: string[] };
const RELEVE_MAX = 1000;

/** Dit les nœuds dont le `data` a changé, en console et sur la globale, avec l'endroit où on l'a vu. */
export function signalerLesEcritures(ids: readonly string[], ou: string): void {
  if (ids.length === 0) return;
  const releve = (PORTEE.__attic_ecritures_instantane__ ??= []);
  for (const id of ids) if (releve.length < RELEVE_MAX) releve.push(`${ou} · ${id}`);
  console.warn(`[instantane] ${ou} : le data de ${ids.join(", ")} a changé pendant la passe`);
}
