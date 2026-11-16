// src/docs/compatibilite-ecarts.ts — Ce qui sépare deux manifestes, et ce qui en casse un graphe.
//
// ═══ LA LIGNE QUI SÉPARE LES DEUX CLASSES ═══
//
// UNE RUPTURE EST CE QU'UN GRAPHE DÉJÀ ENREGISTRÉ PERD OU CHANGE EN S'OUVRANT. Tout le reste est
// compatible, et ne demande que de régénérer le manifeste. La classe ne se déduit pas du geste
// (ajouter, retirer, renommer) mais de ce que le chargement en fait :
//
//   · UN RÉGLAGE SE TIENT PAR SA CLÉ. Ce qui compte est l'ensemble des clés qu'un projet peut porter
//     et que le moteur relit encore : les noms vivants, leurs `nomsHerites` et les `anciensReglages`.
//     Une clé qui en sort est une valeur perdue ; un renommage déclaré par `nomsHerites` n'en perd
//     aucune, et c'est pourquoi il est compatible.
//   · UN PORT SE TIENT PAR SON RANG. Un câble enregistré arrive au même rang, quel que soit le port
//     qui s'y trouve désormais. Un nom changé à un rang est donc une rupture, et non une retouche :
//     le garde ne distingue pas un renommage d'un port remplacé par un autre, et deux ports du même
//     type qui échangent leur rang se lisent exactement ainsi, avec tous leurs câbles croisés.
//   · UNE VALEUR DE CHOIX SE TIENT SI LE CHARGEMENT LA RECONNAÎT ENCORE, par le relecteur que
//     l'appelant fournit. Une valeur retirée que `optionsHeritees` ramène à une autre est relue.
//   · UN COMPOSANT SE TIENT PAR SON IDENTIFIANT, OU PAR UN ALIAS. Un alias n'efface pas la rupture
//     à lui seul : le composant d'arrivée est comparé à celui qui est parti, et ce qu'il ne reprend
//     pas, réglage ou port, est rompu sous l'ancien identifiant.
//
// CE QUE LE GARDE NE VOIT PAS, ET IL LE DIT : un réglage ajouté est compatible s'il rend l'ancien
// son à son défaut, et cela ne se lit pas dans un manifeste. Les empreintes le mesurent.
import type { ComposantManifeste, Manifeste, PortManifeste, Relecteur, ReglageManifeste } from "./compatibilite";

/** Les sortes d'écart, chacune rangée une fois dans sa classe. */
export const SORTES = {
  "composant-retire": true, "alias-retire": true, "alias-deplace": true,
  "reglage-retire": true, "reglage-type": true, "reglage-defaut": true, "reglage-bornes": true,
  "reglage-unite": true, "reglage-graine": true, "choix-retire": true,
  "port-retire": true, "port-type": true, "port-contenu": true, "port-module": true,
  "port-renomme": true, "port-requis": true, "port-ajoute-requis": true,
  "composant-ajoute": false, "composant-remplace": false, "alias-ajoute": false,
  "reglage-ajoute": false, "reglage-renomme": false, "reglage-ancien": false, "migration-ajoutee": false,
  "choix-ajoute": false, "choix-relu": false, "bornes-elargies": false,
  "port-ajoute": false, "port-facultatif": false, "retouche": false,
} as const;

export type SorteEcart = keyof typeof SORTES;

export interface Ecart {
  composant: string;
  sorte: SorteEcart;
  /** Vrai pour une rupture : le garde exige qu'elle soit déclarée. */
  rupture: boolean;
  /** Ce qui a changé, en une ligne. C'est aussi la clé par laquelle le journal la déclare. */
  texte: string;
}

type Pousser = (sorte: SorteEcart, texte: string) => void;

const j = (v: unknown) => (v === undefined ? "aucun" : JSON.stringify(v));

/** Les clés qu'un projet peut porter pour ce composant, et que le moteur relit encore. */
function clesLues(c: ComposantManifeste): Set<string> {
  const cles = new Set<string>(c.anciensReglages ?? []);
  for (const r of c.reglages) {
    cles.add(r.nom);
    for (const h of r.nomsHerites ?? []) cles.add(h);
  }
  return cles;
}

function comparerPorts(
  quoi: "entrée" | "sortie", avant: PortManifeste[], apres: PortManifeste[],
  memeReglage: (ancien: string, neuf: string) => boolean, pousser: Pousser,
): void {
  const entree = quoi === "entrée";
  for (let i = 0; i < Math.max(avant.length, apres.length); i++) {
    const p = avant[i], q = apres[i];
    const ou = `${quoi} ${i} « ${(p ?? q).nom} »`;
    if (!q) { pousser("port-retire", `${ou} retirée`); continue; }
    if (!p) {
      if (entree && q.requis !== false) pousser("port-ajoute-requis", `${ou} ajoutée, obligatoire`);
      else pousser("port-ajoute", `${ou} ajoutée`);
      continue;
    }
    if (p.type !== q.type) { pousser("port-type", `${ou} : type ${p.type} → ${q.type}`); continue; }
    if ((p.sousType ?? "") !== (q.sousType ?? "")) pousser("port-contenu", `${ou} : contenu ${j(p.sousType)} → ${j(q.sousType)}`);
    const moduleTenu = p.module === q.module || (p.module !== undefined && q.module !== undefined && memeReglage(p.module, q.module));
    if (!moduleTenu) pousser("port-module", `${ou} : module ${j(p.module)} → ${j(q.module)}`);
    if (p.nom !== q.nom) pousser("port-renomme", `${ou} : renommée « ${q.nom} »`);
    if (entree && p.requis === false && q.requis !== false) pousser("port-requis", `${ou} : devenue obligatoire`);
    if (entree && p.requis !== false && q.requis === false) pousser("port-facultatif", `${ou} : devenue facultative`);
  }
}

/** Les bornes d'avant sont-elles toutes encore permises ? Une borne absente ne borne rien. */
function bornesResserrees(p: ReglageManifeste, q: ReglageManifeste): boolean {
  const bas = q.min !== undefined && (p.min === undefined || q.min > p.min);
  const haut = q.max !== undefined && (p.max === undefined || q.max < p.max);
  return bas || haut;
}

function comparerReglage(p: ReglageManifeste, q: ReglageManifeste, relire: (nom: string, v: string) => string | null, pousser: Pousser): void {
  const ou = `réglage « ${p.nom} »`;
  let ecarts = 0;
  const p2: Pousser = (s, t) => { ecarts += 1; pousser(s, t); };
  if (p.type !== q.type) { p2("reglage-type", `${ou} : type ${p.type} → ${q.type}`); return; }
  // UN DÉFAUT IDENTIQUE À LA LETTRE NE SE RELIT PAS : un choix dont les valeurs se remplissent à
  // l'exécution déclare une liste vide, et son défaut n'y serait jamais reconnu.
  const memeDefaut = p.defaut === q.defaut || (q.type === "choix" && p.defaut !== undefined
    && relire(q.nom, String(p.defaut)) === (q.defaut === undefined ? null : String(q.defaut)));
  if (!memeDefaut) p2("reglage-defaut", `${ou} : défaut ${j(p.defaut)} → ${j(q.defaut)}`);
  if (p.min !== q.min || p.max !== q.max) {
    const texte = `${ou} : bornes [${j(p.min)}, ${j(p.max)}] → [${j(q.min)}, ${j(q.max)}]`;
    p2(bornesResserrees(p, q) ? "reglage-bornes" : "bornes-elargies", texte);
  }
  if ((p.unite ?? "") !== (q.unite ?? "")) p2("reglage-unite", `${ou} : unité ${j(p.unite)} → ${j(q.unite)}`);
  if (Boolean(p.graine) !== Boolean(q.graine)) {
    p2("reglage-graine", `${ou} : ${q.graine ? "devient une graine" : "cesse d'être une graine"}`);
  }
  if (q.type === "choix") {
    const avant = p.choix ?? [];
    // UNE OPTION HÉRITÉE N'ÉTAIT LISIBLE QUE SI ELLE MENAIT À UNE VALEUR OFFERTE. Les tables
    // d'héritage sont partagées : celle des langues nomme « Auto », que tous les réglages de langue
    // n'offrent pas. Une clé qui ne menait nulle part n'a jamais rien relu, et ne peut rien perdre.
    const heritees = Object.entries(p.optionsHeritees ?? {}).filter(([, id]) => avant.includes(id)).map(([k]) => k);
    const lisibles = [...new Set([...avant, ...heritees])];
    for (const v of lisibles) {
      const lu = relire(q.nom, v);
      if (lu === null) p2("choix-retire", `${ou} : la valeur « ${v} » n'est plus reconnue`);
      else if (lu !== v && avant.includes(v)) p2("choix-relu", `${ou} : la valeur « ${v} » se relit « ${lu} »`);
    }
    for (const v of q.choix ?? []) if (!lisibles.includes(v)) p2("choix-ajoute", `${ou} : valeur « ${v} » ajoutée`);
  }
  // CE QUE RIEN N'A NOMMÉ reste un écart, compatible : une option héritée ajoutée, par exemple. Le
  // manifeste a changé, et le rapport doit le dire plutôt que de laisser croire qu'il n'a pas bougé.
  // Le nom et les noms hérités n'y entrent pas : les clés lues sont comparées au niveau du composant.
  const sansNom = (r: ReglageManifeste) => JSON.stringify({ ...r, nom: "", nomsHerites: undefined });
  if (ecarts === 0 && sansNom(p) !== sansNom(q)) pousser("retouche", `${ou} : retouché sans rupture`);
}

function comparerReglages(a: ComposantManifeste, b: ComposantManifeste, relire: (nom: string, v: string) => string | null, pousser: Pousser): void {
  const lusAvant = clesLues(a), lusApres = clesLues(b);
  for (const k of lusAvant) if (!lusApres.has(k)) pousser("reglage-retire", `réglage « ${k} » retiré, plus rien ne le relit`);
  const parNom = new Map(b.reglages.map((r) => [r.nom, r] as const));
  const parHeritage = new Map<string, ReglageManifeste>();
  for (const r of b.reglages) for (const h of r.nomsHerites ?? []) if (!parHeritage.has(h)) parHeritage.set(h, r);
  const apparies = new Set<string>();
  for (const p of a.reglages) {
    const q = parNom.get(p.nom) ?? parHeritage.get(p.nom);
    if (!q) {
      if (b.anciensReglages?.includes(p.nom)) pousser("reglage-ancien", `réglage « ${p.nom} » retiré de la fiche, encore lu par l'exécuteur`);
      continue;
    }
    apparies.add(q.nom);
    if (q.nom !== p.nom) pousser("reglage-renomme", `réglage « ${p.nom} » renommé « ${q.nom} », l'ancien nom est relu`);
    comparerReglage(p, q, relire, pousser);
  }
  for (const q of b.reglages) if (!apparies.has(q.nom)) pousser("reglage-ajoute", `réglage « ${q.nom} » ajouté`);
  const vivants = new Set(b.reglages.map((r) => r.nom));
  for (const k of lusApres) {
    if (!lusAvant.has(k) && !vivants.has(k)) pousser("migration-ajoutee", `l'ancienne clé « ${k} » est désormais relue`);
  }
}

/**
 * Ce qui sépare le contrat `a` d'un composant du contrat `b` qu'un graphe ouvre à sa place.
 *
 * `relire` lit une valeur de choix dans le composant `b`. `prefixe` dit, pour un alias, par où le
 * graphe arrive.
 */
export function comparerComposant(
  id: string, a: ComposantManifeste, b: ComposantManifeste,
  relire: (nom: string, v: string) => string | null, prefixe = "",
): Ecart[] {
  const ecarts: Ecart[] = [];
  const pousser: Pousser = (sorte, texte) => ecarts.push({ composant: id, sorte, rupture: SORTES[sorte], texte: prefixe + texte });
  const memeReglage = (ancien: string, neuf: string) =>
    ancien === neuf || (b.reglages.find((r) => r.nom === neuf)?.nomsHerites ?? []).includes(ancien);
  comparerPorts("entrée", a.entrees, b.entrees, memeReglage, pousser);
  comparerPorts("sortie", a.sorties, b.sorties, memeReglage, pousser);
  comparerReglages(a, b, relire, pousser);
  const contrat = (c: ComposantManifeste) => JSON.stringify({ ...c, version: 0, alias: undefined });
  if (ecarts.length === 0 && contrat(a) !== contrat(b)) pousser("retouche", "contrat retouché sans rupture, un ordre ou une forme");
  return ecarts;
}

/** Les alias d'un manifeste : l'ancien identifiant, et le composant qu'il ouvre. */
function ciblesDesAlias(m: Manifeste): Map<string, string> {
  const cibles = new Map<string, string>();
  for (const [id, c] of Object.entries(m.composants)) for (const a of c.alias ?? []) cibles.set(a, id);
  return cibles;
}

/**
 * Tous les écarts entre le manifeste `ancien`, celui qui est versionné, et `courant`, celui que le
 * registre rend aujourd'hui. La version de contrat n'y entre pas : elle se tire du journal.
 */
export function comparerManifestes(ancien: Manifeste, courant: Manifeste, relire: Relecteur): Ecart[] {
  const ecarts: Ecart[] = [];
  const pousser = (composant: string, sorte: SorteEcart, texte: string) =>
    ecarts.push({ composant, sorte, rupture: SORTES[sorte], texte });
  const cibles = ciblesDesAlias(courant);
  const ciblesAvant = ciblesDesAlias(ancien);
  for (const [id, a] of Object.entries(ancien.composants)) {
    const b = courant.composants[id];
    if (b) { ecarts.push(...comparerComposant(id, a, b, (n, v) => relire(id, n, v))); continue; }
    const y = cibles.get(id);
    if (!y) { pousser(id, "composant-retire", "composant retiré, sans alias"); continue; }
    pousser(id, "composant-remplace", `remplacé par l'alias vers « ${y} »`);
    ecarts.push(...comparerComposant(id, a, courant.composants[y], (n, v) => relire(y, n, v), `par l'alias vers « ${y} », `));
  }
  for (const id of Object.keys(courant.composants)) {
    if (!ancien.composants[id]) pousser(id, "composant-ajoute", "composant ajouté");
  }
  // UNE RUPTURE D'ALIAS SE RANGE SOUS LE COMPOSANT QUI LE PORTAIT, et non sous l'alias : c'est lui
  // que le manifeste versionné connaît, donc lui que le journal peut déclarer.
  for (const [a, y] of ciblesAvant) {
    const z = cibles.get(a);
    if (z === y) continue;
    if (z !== undefined) pousser(y, "alias-deplace", `l'alias « ${a} » ouvre désormais « ${z} »`);
    else if (courant.composants[a]) pousser(y, "alias-deplace", `l'alias « ${a} » ouvre désormais le composant « ${a} »`);
    else pousser(y, "alias-retire", `l'alias « ${a} » est retiré`);
  }
  for (const [a, z] of cibles) {
    if (!ciblesAvant.has(a) && !ancien.composants[a]) pousser(z, "alias-ajoute", `alias « ${a} » ajouté`);
  }
  return ecarts;
}
