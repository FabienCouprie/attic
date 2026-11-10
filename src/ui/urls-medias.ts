// ui/urls-medias.ts — Les URL des médias posés sur les nœuds, et le moment de les révoquer.
//
// ═══ LE DÉFAUT, POINT A6 DE LA REVUE D'ARCHITECTURE DU 2026-10-31 ═══
//
// Charger un fichier sur une « Entrée audio » crée une URL d'objet pour son lecteur, et en charger un
// autre en crée une seconde sans révoquer la première : son blob restait au navigateur jusqu'à la
// fermeture. Personne ne la révoquait parce que personne ne pouvait savoir qu'elle n'était plus
// tenue. L'historique d'annulation la garde dans ses instantanés, le presse-papiers d'une coupe
// aussi, et deux nœuds collés de la même coupe la partagent : la révoquer au remplacement aurait
// rendu un lecteur mort à Ctrl+Z.
//
// ═══ LA RÈGLE, DE FABIEN ═══
//
// Une URL ne se révoque que quand plus rien ne la tient : ni un nœud vivant, ni une entrée
// d'annulation ou de rétablissement, ni le presse-papiers.
//
// ═══ MARQUER CE QUI EST TENU, ET BALAYER LE RESTE ═══
//
// Compter les prises, chaque détenteur prenant et rendant l'URL, demanderait que chacun pense à la
// rendre : une seule omission, et l'URL survit, ou elle meurt sous un lecteur. Ici, rien n'est rendu.
// Chaque détenteur se déclare une fois comme RACINE, une fonction qui rend ce qu'il tient ; le
// balayage lit toutes les racines, relève les URL inscrites qu'il y trouve, et révoque les autres.
// C'est la forme d'`orphelins` dans `ui/oubli-noeuds.ts`, appliquée aux adresses.
//
// TROIS ÉTATS, ET UN SEUL RÉVOQUE :
//
//   · une URL NON INSCRITE n'est jamais révoquée. C'est ce qui rend la migration sûre : une
//     naissance qui ne passe pas encore par `creerUrlMedia` garde l'ancien sort, la fuite, et rien
//     de pire.
//   · une URL INSCRITE QU'AUCUN BALAYAGE N'A ENCORE VUE TENUE vient de naître : elle est entre sa
//     création et sa pose sur un nœud. Elle attend. Et comme chaque création balaie d'abord, une URL
//     remplacée avant tout balayage ordinaire a quand même été vue sur son nœud.
//   · une URL VUE TENUE PUIS PLUS TENUE par aucune racine est révoquée, et le registre l'oublie.
//
// ET UNE RACINE QUI LÈVE SUSPEND LE BALAYAGE : révoquer sur une lecture incomplète, ce serait
// révoquer ce que la racine illisible tenait.
//
// ═══ OÙ LA RECHERCHE DESCEND, ET LA RÈGLE QUI EN DÉCOULE ═══
//
// Dans les objets simples et les tableaux, jusqu'aux nœuds ; jamais dans un `File`, un tampon ou un
// objet d'une autre classe, ce que `ui/historique.ts` garde par référence. Et dans un nœud, un objet
// qui porte un `data` simple, LE PREMIER NIVEAU DE SON `data` SEULEMENT. Et un instantané de
// l'historique, qui ne change plus, ne se relit pas : `urlsDUnFige` retient ses adresses. MESURÉ sur
// deux cents nœuds et cinquante instantanés : 124 ms de gel en médiane en descendant partout, 3,8 ms
// au premier niveau du `data`, 0,18 ms une fois les instantanés retenus, 0,47 ms au pire.
//
// D'OÙ LA RÈGLE : UNE URL INSCRITE SE POSE AU PREMIER NIVEAU DU `data` D'UN NŒUD, comme `audioUrl`.
// Rangée plus bas, elle ne serait pas vue, et serait révoquée sous son détenteur.
//
// LES RACINES, au 2026-11-10 : le canevas et le graphe racine d'un méta ouvert
// (`hooks/useUrlsMedias.ts`), les deux piles de l'historique (`hooks/useHistorique.ts`), le
// presse-papiers de la fenêtre (`hooks/useCopierColler.ts`), la copie que garde la démonstration
// filmée (`demo/useRealisateurDemo.tsx`), et la piste que la vue de l'explorateur de musique garde
// pour son lecteur (`vues-domaine/vues-explorateur.tsx`). Un endroit neuf qui garde des nœuds ou des
// URL de côté se déclare par `useRacineDesUrls`, sans quoi ce qu'il garde sera révoqué sous lui.
//
// LES NAISSANCES, au 2026-11-10 : toutes celles de l'interface passent par `creerUrlMedia`, et
// `ui/urls-medias-naissances.test.ts` refuse une URL d'objet créée à côté sans être classée. Restent
// les deux films posés sur le nœud, celui du cercle pulsant et celui de la démonstration.

type Lecteur = () => unknown;

const estSimple = (v: object): boolean => {
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
};

/**
 * Les URL inscrites trouvées dans `valeurs`.
 *
 * La recherche descend dans les objets simples et les tableaux jusqu'aux NŒUDS, un objet qui porte
 * un `data` simple, et ne lit dans un nœud que le premier niveau de son `data`. MESURÉ : en
 * descendant partout, un balayage gelait le fil 124 ms en médiane sur deux cents nœuds et cinquante
 * instantanés, et 384 ms sur cinq cents, la mélodie d'un clavier ou le découpage d'un montage se
 * relisant cinquante et une fois ; au premier niveau du `data`, 3,8 ms et 10 ms.
 */
export function urlsTenues(valeurs: Iterable<unknown>, inscrites: { has(url: string): boolean }): Set<string> {
  const tenues = new Set<string>();
  const vus = new Set<object>();
  const pile: unknown[] = [...valeurs];
  while (pile.length > 0) {
    const v = pile.pop();
    if (typeof v === "string") {
      if (inscrites.has(v)) tenues.add(v);
      continue;
    }
    if (v === null || typeof v !== "object" || vus.has(v)) continue;
    vus.add(v);
    if (Array.isArray(v)) {
      for (const x of v) pile.push(x);
      continue;
    }
    if (!estSimple(v)) continue;
    const data = (v as { data?: unknown }).data;
    if (data !== null && typeof data === "object" && !Array.isArray(data) && estSimple(data)) {
      for (const x of Object.values(data)) if (typeof x === "string" && inscrites.has(x)) tenues.add(x);
      continue;
    }
    for (const x of Object.values(v)) pile.push(x);
  }
  return tenues;
}

const urlsRetenues = new WeakMap<object, string[]>();

/**
 * Les adresses `blob:` d'un objet QUI NE CHANGE PLUS, relevées à sa première lecture et retenues.
 *
 * POUR LES INSTANTANÉS DE L'HISTORIQUE, que rien ne modifie après leur prise : `ui/historique.ts`
 * les copie, et Ctrl+Z comme Ctrl+Y en font des nœuds neufs au lieu de les toucher. MESURÉ : relus
 * à chaque balayage, les cinquante d'un atelier de deux cents nœuds coûtaient 3,8 ms en médiane, et
 * dix sur cinq cents. Un objet qu'on modifierait après sa première lecture garderait ses anciennes
 * adresses : ne pas s'en servir pour autre chose qu'un objet figé.
 */
export function urlsDUnFige(objet: object): string[] {
  let urls = urlsRetenues.get(objet);
  if (!urls) {
    urls = [...urlsTenues([objet], { has: (u) => u.startsWith("blob:") })];
    urlsRetenues.set(objet, urls);
  }
  return urls;
}

export class RegistreUrlsMedias {
  /** Chaque URL inscrite, et si un balayage l'a déjà vue tenue. */
  private readonly inscrites = new Map<string, boolean>();
  private readonly racines = new Set<{ nom: string; lire: Lecteur }>();
  private readonly fabriquer: (objet: Blob) => string;
  private readonly revoquer: (url: string) => void;

  /** `fabriquer` et `revoquer` ne sont remplacés que par les cas d'essai. */
  constructor(
    fabriquer: (objet: Blob) => string = (objet) => URL.createObjectURL(objet),
    revoquer: (url: string) => void = (url) => URL.revokeObjectURL(url),
  ) {
    this.fabriquer = fabriquer;
    this.revoquer = revoquer;
  }

  /**
   * Une URL d'objet que le registre révoquera quand plus rien ne la tiendra.
   *
   * ELLE BALAIE D'ABORD. Une URL ne devient révocable qu'une fois vue tenue, et le balayage ordinaire
   * attend que les nœuds se taisent : MESURÉ, charger A, lancer et charger B en moins d'un quart de
   * seconde laissait A « naissante » pour toujours, aucun balayage ne l'ayant vue sur son nœud. Au
   * moment où B se crée, A y est encore : ce balayage-ci la voit, et le suivant la révoque.
   */
  creer(objet: Blob): string {
    this.balayer();
    const url = this.fabriquer(objet);
    this.inscrites.set(url, false);
    return url;
  }

  /** Déclare ce qu'un détenteur tient. Rend de quoi le retirer, lui seul. */
  declarerRacine(nom: string, lire: Lecteur): () => void {
    const racine = { nom, lire };
    this.racines.add(racine);
    return () => { this.racines.delete(racine); };
  }

  /** Révoque les URL vues tenues que plus aucune racine ne tient. Rend celles qu'il a révoquées. */
  balayer(): string[] {
    if (this.inscrites.size === 0) return [];
    let tenues: Set<string>;
    try {
      tenues = urlsTenues([...this.racines].map((r) => r.lire()), this.inscrites);
    } catch (e) {
      console.warn("[attic] balayage des URL de médias suspendu : une racine n'a pas pu être lue", e);
      return [];
    }
    const revoquees: string[] = [];
    for (const [url, vueTenue] of this.inscrites) {
      if (tenues.has(url)) {
        if (!vueTenue) this.inscrites.set(url, true);
        continue;
      }
      if (!vueTenue) continue;
      this.revoquer(url);
      this.inscrites.delete(url);
      revoquees.push(url);
    }
    return revoquees;
  }

  /** Les URL inscrites, et si chacune a été vue tenue : pour les cas d'essai et le diagnostic. */
  etat(): ReadonlyMap<string, boolean> {
    return this.inscrites;
  }
}

/** Le registre de la fenêtre : une URL d'objet ne vaut que dans la page qui l'a créée. */
export const registreUrlsMedias = new RegistreUrlsMedias();

/** L'URL d'un média posé sur un nœud : la seule façon d'en créer une que le registre révoquera. */
export const creerUrlMedia = (objet: Blob): string => registreUrlsMedias.creer(objet);
