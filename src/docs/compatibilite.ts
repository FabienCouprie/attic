// src/docs/compatibilite.ts — Le manifeste de compatibilité : le contrat de chaque composant, projeté
// du registre, tel qu'un graphe enregistré en dépend.
//
// ═══ POURQUOI CE MODULE, ET LE TROU QU'IL COMBLE ═══
//
// Le point du long terme d'`ARCHITECTURE.md` : « un manifeste de compatibilité des plugins (version
// de contrat, paramètres, entrées/sorties) pour détecter les ruptures automatiquement ». Le dépôt
// tenait déjà chaque morceau du problème, et aucun ne tenait le problème :
//
//   · `plugins/fiche.ts` fait vérifier par le compilateur qu'un exécuteur ne lit que ses réglages
//     déclarés. Il dit ce que le code lit AUJOURD'HUI ; il ne sait rien de ce qu'un fichier écrit
//     HIER portait.
//   · `nomsHerites`, `optionsHeritees`, `anciensReglages` et la table `ALIAS` sont les quatre
//     migrations du dépôt. Rien n'exige qu'on les pose : un réglage renommé sans `nomsHerites`
//     compile, passe, et fait retomber chaque projet de quelqu'un sur le défaut.
//   · `contrat-cles-de-reglage.test.ts` relit les clés des graphes LIVRÉS. Les projets de
//     l'utilisateur, eux, sont sur son disque, et ne se relisent pas d'ici.
//   · `ordre-du-catalogue.txt` voit un composant disparaître, et se réécrit sans demander d'alias.
//   · Les deux bases d'empreintes mesurent le SON : 88 composants à leurs réglages par défaut, et les
//     exemples livrés. Un défaut changé sur l'un des autres, un port retiré ou une valeur de choix
//     perdue n'y paraissent pas.
//
// LE MANIFESTE EST LA MÉMOIRE QUI MANQUAIT : l'état du contrat au dernier commit, versionné. Le
// garde compare le registre vivant à cette mémoire, et une différence qui casserait un graphe
// enregistré ne passe plus sans être déclarée.
//
// ═══ CE QUI EN FAIT PARTIE, ET POURQUOI CELA ET RIEN D'AUTRE ═══
//
// Ce que retient un fichier de projet, et ce que le moteur en relit :
//   · LES PORTS PAR RANG. Une arête désigne `in:2` ou `out:0`, jamais un nom : c'est le rang qui
//     tient un câble. Le nom, le type, le contenu et la cible d'une modulation y sont, parce que
//     chacun dit ce qui arrive au bout du câble.
//   · LES RÉGLAGES PAR NOM. Un projet les enregistre par libellé (`format-projet.ts`). Le défaut y
//     est parce qu'un graphe écrit à la main, ou d'avant le réglage, ne porte pas la clé et lit le
//     défaut de la fiche (`core/contexte-de-passe.ts`). Les bornes, l'unité et le rôle de graine y
//     sont parce qu'ils changent le sens d'un nombre déjà écrit.
//   · LES VALEURS D'UN CHOIX SOUS LEUR FORME CANONIQUE : l'identifiant quand la fiche en déclare,
//     le libellé français sinon. C'est ce que l'inspecteur écrit et ce que `valeurCanoniqueChoix`
//     relit. Les libellés traduits n'y sont pas : un graphe ne les porte plus depuis les identifiants.
//   · LES QUATRE MIGRATIONS ELLES-MÊMES, pour qu'en retirer une soit vu comme la rupture que c'est.
//
// N'en font pas partie : les notices, les libellés anglais, `defautEn` (le moteur ne le lit jamais au
// run), le pas d'un curseur, et les indices du moteur (`jamaisCache`, `memoire`…), qu'aucun fichier
// n'enregistre.
//
// LA VERSION DE CONTRAT d'un composant vaut un, plus le nombre de ruptures déclarées pour lui dans
// `ruptures-declarees.json`. Elle ne se tient donc pas à la main : le manifeste est une fonction du
// registre et du journal, et le régénérer deux fois rend le même fichier.
import { valeurCanoniqueChoix } from "../i18n";
import type { ParametreDef, PortDef } from "../core/types";

/** Un port, à son rang. */
export interface PortManifeste {
  nom: string;
  type: string;
  sousType?: string;
  /** Posé seulement sur une entrée facultative : le défaut d'une entrée est « obligatoire ». */
  requis?: false;
  /** Le réglage que ce port module, quand c'en est un. */
  module?: string;
}

/** Un réglage, par son nom. */
export interface ReglageManifeste {
  nom: string;
  type: string;
  /** Sous sa forme canonique pour un choix. */
  defaut?: string | number;
  min?: number;
  max?: number;
  unite?: string;
  graine?: true;
  /** Les valeurs canoniques d'un choix. */
  choix?: string[];
  optionsHeritees?: Record<string, string>;
  nomsHerites?: string[];
}

export interface ComposantManifeste {
  version: number;
  /** Les anciens identifiants qui ouvrent ce composant. */
  alias?: string[];
  entrees: PortManifeste[];
  sorties: PortManifeste[];
  reglages: ReglageManifeste[];
  anciensReglages?: string[];
}

/** Un composant qui a quitté le registre après une rupture déclarée : sa dernière version. */
export interface RetireManifeste { version: number; alias: string | null }

export interface Manifeste {
  /** La forme de ce document. Un lecteur qui ne la reconnaît pas s'arrête plutôt que de deviner. */
  forme: 1;
  composants: Record<string, ComposantManifeste>;
  retires: Record<string, RetireManifeste>;
}

/** Ce que le manifeste lit d'une fiche : son identifiant, ses ports, ses réglages, ses migrations. */
export interface FicheContrat {
  id: string;
  entrees: PortDef[];
  sorties: PortDef[];
  parametres: ParametreDef[];
  anciensReglages?: readonly string[];
}

/**
 * Relit une valeur de choix enregistrée sous un ancien contrat, avec les règles d'aujourd'hui.
 *
 * Rend la valeur canonique qu'un graphe ouvert aujourd'hui obtient, ou `null` si plus rien ne la
 * reconnaît. Le garde la tire du registre vivant, par `valeurCanoniqueChoix` elle-même : une seconde
 * écriture de la règle vieillirait à côté de la première.
 */
export type Relecteur = (composant: string, reglage: string, valeur: string) => string | null;

/** Les valeurs canoniques d'un choix : ses identifiants s'il en déclare, ses libellés sinon. */
export function choixCanoniques(p: ParametreDef): string[] | undefined {
  if ((p.type ?? "curseur") !== "choix") return undefined;
  const ids = p.optionIds && p.optionIds.length > 0 ? p.optionIds : p.options;
  return Array.isArray(ids) ? ids.map(String) : undefined;
}

function port(p: PortDef, entree: boolean): PortManifeste {
  return {
    nom: p.nom, type: p.type,
    ...(p.sousType ? { sousType: p.sousType } : {}),
    ...(entree && p.requis === false ? { requis: false as const } : {}),
    ...(p.module ? { module: p.module } : {}),
  };
}

function trier(o: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.keys(o).sort().map((k) => [k, o[k]]));
}

function reglage(p: ParametreDef): ReglageManifeste {
  const type = p.type ?? "curseur";
  const choix = choixCanoniques(p);
  const defaut = p.defaut === undefined ? undefined
    : type === "choix" ? valeurCanoniqueChoix(p, p.defaut) : p.defaut;
  // UNE BORNE INFINIE NE BORNE RIEN, ET LE JSON NE SAIT PAS L'ÉCRIRE : il rend `null`. Gardée
  // telle quelle, elle faisait comparer le `null` du fichier à l'`Infinity` du registre, d'où un
  // faux écart, et une borne passée d'infinie à 1000 se rangeait parmi les élargies, `1000 < null`
  // étant faux. Absente, elle se lit comme partout ici : rien ne borne ce côté.
  const plage = Array.isArray(p.plage) && p.plage.length === 2 ? p.plage.map(Number) : [];
  const [bas, haut] = plage;
  return {
    nom: p.nom, type,
    ...(defaut !== undefined ? { defaut } : {}),
    ...(Number.isFinite(bas) ? { min: bas } : {}),
    ...(Number.isFinite(haut) ? { max: haut } : {}),
    ...(p.unite ? { unite: p.unite } : {}),
    ...(p.graine ? { graine: true as const } : {}),
    ...(choix ? { choix } : {}),
    ...(p.optionsHeritees && Object.keys(p.optionsHeritees).length > 0
      ? { optionsHeritees: trier(p.optionsHeritees) } : {}),
    ...(p.nomsHerites && p.nomsHerites.length > 0 ? { nomsHerites: [...p.nomsHerites] } : {}),
  };
}

/** La version de contrat de chaque identifiant que le journal nomme : sa dernière déclaration. */
export type VersionsDeclarees = ReadonlyMap<string, number>;

/**
 * Le manifeste du registre, à la version que le journal lui donne.
 *
 * `alias` est la table de `core/registre.ts`. Un alias dont la cible n'est pas inscrite n'est
 * rangé nulle part : `homonymesDuContrat` le refuse, et le manifeste ne doit pas l'inventer.
 */
export function manifesteDuRegistre(
  fiches: readonly FicheContrat[], alias: Readonly<Record<string, string>>, versions: VersionsDeclarees,
): Manifeste {
  const inscrits = new Set(fiches.map((f) => f.id));
  const composants: Record<string, ComposantManifeste> = {};
  for (const f of [...fiches].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))) {
    const siens = Object.keys(alias).filter((a) => alias[a] === f.id).sort();
    composants[f.id] = {
      version: versions.get(f.id) ?? 1,
      ...(siens.length > 0 ? { alias: siens } : {}),
      entrees: f.entrees.map((p) => port(p, true)),
      sorties: f.sorties.map((p) => port(p, false)),
      reglages: f.parametres.map(reglage),
      ...(f.anciensReglages && f.anciensReglages.length > 0 ? { anciensReglages: [...f.anciensReglages] } : {}),
    };
  }
  const retires: Record<string, RetireManifeste> = {};
  for (const id of [...versions.keys()].sort()) {
    if (inscrits.has(id)) continue;
    retires[id] = { version: versions.get(id)!, alias: alias[id] && inscrits.has(alias[id]) ? alias[id] : null };
  }
  return { forme: 1, composants, retires };
}

/**
 * Le manifeste en texte : un composant par bloc, un port ou un réglage par ligne.
 *
 * UNE LIGNE PAR RÉGLAGE, ET NON UNE PAR COMPOSANT, pour que le diff d'un défaut changé montre ce
 * réglage-là et non deux cents caractères où le chercher. Le texte se relit par `JSON.parse`.
 */
export function manifesteEnTexte(m: Manifeste): string {
  const j = (v: unknown) => JSON.stringify(v);
  const liste = (xs: unknown[], retrait: string) => xs.length === 0 ? "[]"
    : `[\n${xs.map((x) => `${retrait} ${j(x)}`).join(",\n")}\n${retrait}]`;
  const blocs = Object.entries(m.composants).map(([id, c]) => {
    const lignes = [`   "version": ${c.version}`];
    if (c.alias) lignes.push(`   "alias": ${j(c.alias)}`);
    lignes.push(`   "entrees": ${liste(c.entrees, "   ")}`);
    lignes.push(`   "sorties": ${liste(c.sorties, "   ")}`);
    lignes.push(`   "reglages": ${liste(c.reglages, "   ")}`);
    if (c.anciensReglages) lignes.push(`   "anciensReglages": ${j(c.anciensReglages)}`);
    return `  ${j(id)}: {\n${lignes.join(",\n")}\n  }`;
  });
  const retires = Object.entries(m.retires).map(([id, r]) => `  ${j(id)}: ${j(r)}`);
  return [
    "{",
    ` "forme": ${m.forme},`,
    blocs.length === 0 ? ` "composants": {},` : ` "composants": {\n${blocs.join(",\n")}\n },`,
    retires.length === 0 ? ` "retires": {}` : ` "retires": {\n${retires.join(",\n")}\n }`,
    "}",
    "",
  ].join("\n");
}

/** Le relecteur du registre vivant : la règle même du chargement. */
export function relecteurDuRegistre(trouver: (id: string) => FicheContrat | undefined): Relecteur {
  return (composant, nom, valeur) => {
    const p = trouver(composant)?.parametres.find((q) => q.nom === nom);
    const canon = p ? choixCanoniques(p) : undefined;
    if (!p || !canon) return null;
    const lu = String(valeurCanoniqueChoix(p, valeur));
    return canon.includes(lu) ? lu : null;
  };
}

/**
 * Le relecteur d'un manifeste seul : une valeur canonique, ou une option héritée qui mène à l'une.
 *
 * IL NE SAIT PAS TOUT CE QUE SAIT LE CHARGEMENT : ni le rang d'un libellé, ni la tolérance de casse.
 * Il sert aux cas d'essai, où le registre est écrit à la main, et c'est pourquoi le garde ne s'en
 * sert pas.
 */
export function relecteurDuManifeste(m: Manifeste): Relecteur {
  return (composant, nom, valeur) => {
    const r = m.composants[composant]?.reglages.find((q) => q.nom === nom);
    if (!r?.choix) return null;
    if (r.choix.includes(valeur)) return valeur;
    const h = r.optionsHeritees?.[valeur];
    return h !== undefined && r.choix.includes(h) ? h : null;
  };
}

/**
 * Ce qui rendrait le manifeste ambigu, ou un alias trompeur.
 *
 *   · DEUX RÉGLAGES DU MÊME NOM dans une fiche : un projet n'en garde qu'une valeur, et le manifeste,
 *     qui les range par nom, ne saurait pas lequel il compare.
 *   · UN ANCIEN RÉGLAGE QUI PORTE LE NOM D'UN RÉGLAGE VIVANT : le retirer de la fiche ne serait plus
 *     vu, la clé restant « lue » par l'ancien.
 *   · UN ALIAS QUI PORTE L'IDENTIFIANT D'UN COMPOSANT INSCRIT : `resoudre` passe avant la fiche, et
 *     le composant de ce nom deviendrait injoignable.
 *   · UN ALIAS VERS UN COMPOSANT QUI N'EST PAS INSCRIT : un graphe qui le porte perd son nœud.
 *
 * Un nom hérité égal à un réglage vivant est refusé par `plugins/noms-herites.test.ts`.
 */
export function homonymesDuContrat(
  fiches: readonly FicheContrat[], alias: Readonly<Record<string, string>>,
): string[] {
  const fautes: string[] = [];
  const inscrits = new Set(fiches.map((f) => f.id));
  for (const f of fiches) {
    const vus = new Set<string>();
    for (const p of f.parametres) {
      if (vus.has(p.nom)) fautes.push(`${f.id} · deux réglages se nomment « ${p.nom} »`);
      vus.add(p.nom);
    }
    for (const a of f.anciensReglages ?? []) {
      if (vus.has(a)) fautes.push(`${f.id} · l'ancien réglage « ${a} » porte le nom d'un réglage vivant`);
    }
  }
  for (const [a, cible] of Object.entries(alias)) {
    if (inscrits.has(a)) fautes.push(`l'alias « ${a} » porte l'identifiant d'un composant inscrit`);
    if (!inscrits.has(cible)) fautes.push(`l'alias « ${a} » mène à « ${cible} », qui n'est pas inscrit`);
  }
  return fautes;
}
