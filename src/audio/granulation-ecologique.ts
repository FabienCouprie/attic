// audio/granulation-ecologique.ts — Les grains suivent un modèle d'événement physique.
//
// D'après Damián Keller et Barry Truax, « Ecologically-based granular synthesis », International
// Computer Music Conference, Ann Arbor, 1998 ; et la suite, Damián Keller, « touch'n'go : Ecological
// Models in Composition », mémoire, Simon Fraser University, 1999.
//
// CE QUE L'ARTICLE AJOUTE À UNE GRANULATION. Les deux auteurs reprochent aux granulations de leur
// temps de poser les grains sur une ligne de temps abstraite, où le compositeur décide de tout :
// durée, densité, distribution. Leur réponse est de contraindre le temps par un ÉVÉNEMENT du monde
// quotidien, c'est-à-dire par une fonction de contrôle à l'échelle dite méso, de dix millisecondes
// à plusieurs secondes, qu'ils tiennent pour la plus négligée par la recherche. Les trois modèles
// qu'ils mettent en œuvre sont le REBOND, l'ÉCOULEMENT d'eau et le FROTTEMENT.
//
// LE REBOND EST UNE RÉCURRENCE, ET NON UNE EXPONENTIELLE, et c'est leur point précis. Un rebond
// peut s'approcher par une courbe exponentielle, mais celle-ci ne donne qu'UN cas de la classe ;
// la récurrence `amortissement · [x(n) + x(n − 1)]` en donne toute la famille, et il suffit de
// changer l'amortissement pour passer de l'une à l'autre. L'intervalle entre deux chocs suit donc
// cette suite, dont le rapport asymptotique est la racine positive de `r² = d(r + 1)` : à
// amortissement 45 pour cent, 0,933 par choc. La somme des intervalles converge, de sorte que le
// rebond S'ARRÊTE de lui-même, ce qui est la contrainte d'événement fini que l'article réclame.
//
// L'ÉCOULEMENT EST UN PASSAGE CONTINU DE LA GOUTTE AU FLUX. Plusieurs flux parallèles de grains de
// goutte ; quand la durée d'un grain croît, les grains se recouvrent, et le recouvrement fait une
// région de formants que l'oreille interprète comme de l'eau qui coule. Rien ne change de modèle en
// route : c'est le même générateur, et c'est le recouvrement qui décide de ce qu'on entend.
//
// LE FROTTEMENT A UNE FONCTION DE CONTRÔLE PÉRIODIQUE ET UN CONTENU ALÉATOIRE. L'article le dit
// ainsi, et c'est ce qui le sépare d'une répétition : les chocs tombent à intervalle régulier, mais
// chaque grain est découpé ailleurs dans la source. À rugosité nulle tous viennent du même endroit,
// et l'on entend une hauteur, celle du débit ; à rugosité pleine ils viennent de partout, et l'on
// entend du bruit. Les auteurs opposent cela à l'approche de Gaver, un bruit à bande limitée dont la
// fréquence suit la vitesse de frottement et la largeur la rugosité de la surface.
//
// CE QUE CE MODULE NE FAIT PAS, ET C'EST LA DÉCISION À DIRE. L'article part de sons quotidiens
// ENREGISTRÉS, gouttes d'eau et tessons de bouteille, dont il extrait les grains. Ici la matière est
// celle qu'on branche : le composant impose un motif d'événement à un son reçu, il ne porte pas de
// banque de sons de choc. C'est le chemin de leur propre méthode, dont la troisième étape est
// d'extraire les grains du matériau collecté, et c'est aussi le précédent du montage par grains.
//
// LA SOMME EST RAMENÉE À LA SOMME DES FENÊTRES ACTIVES, plancher à un. C'est la même règle que le
// retard granulaire, pour la même raison : des grains issus du même endroit d'une source sont
// COHÉRENTS, et leur somme croît comme leur nombre, de sorte que diviser par la racine du
// recouvrement laisserait écrêter. Les deux endroits calculent ce diviseur chacun de son côté, trois
// lignes dans la boucle ; les mettre en commun est à faire, et n'est pas fait ici.
import { valeurA } from "./courbe";
import { creerAleatoire } from "../core/hasard";
import { fenetre, type Fenetre } from "./micromontage";

export const MODELES = ["rebond", "ecoulement", "frottement"] as const;
export type Modele = (typeof MODELES)[number];
export const EST_MODELE = (x: string): x is Modele => (MODELES as readonly string[]).includes(x);

export interface OptionsGranulationEcologique {
  sampleRate: number;
  modele: Modele;
  /** Durée rendue, en échantillons. */
  duree: number;
  /** Durée d'un grain, en secondes. Un tableau la fait varier au fil du rendu. */
  taille: number | Float32Array;
  /** Où le grain est découpé dans la source, de 0 à 1. Un tableau la fait varier. */
  prise?: number | Float32Array;
  /** Intervalle entre deux chocs au départ, en secondes. Un tableau le fait varier. */
  intervalle: number | Float32Array;
  /** L'amortissement de la récurrence du rebond, de 0 à 1. Un tableau le fait varier. */
  amortissement?: number | Float32Array;
  /** Part de hasard dans l'endroit de découpe, de 0 à 1. Un tableau la fait varier. */
  rugosite?: number | Float32Array;
  /** Nombre de flux parallèles. */
  flux?: number;
  /** Vrai : les flux partagent leurs instants. Faux : chacun a sa phase. */
  synchrone?: boolean;
  fenetre?: Fenetre;
  graine: number;
  /** Niveau de sortie, de 0 à 1. Un tableau le fait varier. */
  niveau?: number | Float32Array;
}

export interface RapportGranulationEcologique {
  /** Grains posés, tous flux confondus. */
  grains: number;
  /**
   * Instants DISTINCTS auxquels un grain tombe.
   *
   * C'EST LA MESURE DU RAPPORT DE PHASE ENTRE LES FLUX, et elle porte sur la fonction de contrôle
   * plutôt que sur le son. Des flux synchrones posent les mêmes instants, donc autant d'instants
   * que de grains divisés par le nombre de flux ; des flux asynchrones en posent chacun les siens.
   * Un détecteur d'attaques ne sait pas les séparer passé quelques centaines par seconde, ce qu'une
   * sonde a montré : il rendait soixante-sept d'un côté et soixante-six de l'autre.
   */
  instantsDistincts: number;
  /** Instant du dernier grain, en secondes : pour un rebond, la durée de l'événement. */
  fin: number;
  /** Intervalle du premier et du dernier choc, en millisecondes. */
  premierMs: number;
  dernierMs: number;
  /** Le facteur appliqué à la somme, en moyenne sur le rendu. */
  compensationMoyenne: number;
}

/** Un grain posé : où il est pris dans la source, où il tombe, et combien il dure. */
interface Pose {
  debut: number;
  duree: number;
  prise: number;
}

/**
 * Le rapport asymptotique de la récurrence du rebond, soit la racine positive de `r² = d(r + 1)`.
 *
 * EXPORTÉ PARCE QU'IL SE VÉRIFIE À LA VALEUR PRÈS, et parce que c'est lui qui dit ce que le réglage
 * d'amortissement fait : à `d` égal à un demi, il vaut un et le rebond ne s'arrête jamais.
 */
export const rapportDeRebond = (d: number): number => {
  const a = Math.min(0.499, Math.max(0.001, d));
  return (a + Math.sqrt(a * a + 4 * a)) / 2;
};

/**
 * Les instants d'un flux, selon le modèle.
 *
 * ELLE NE REND QUE DES INSTANTS, et c'est voulu : la fonction de contrôle de l'article est un objet
 * à elle seule, qui ne connaît ni le son ni les fenêtres. On peut donc l'éprouver sur ses nombres.
 */
export function instants(
  o: OptionsGranulationEcologique, decalage: number, aleatoire: () => number,
): number[] {
  const sr = o.sampleRate;
  const out: number[] = [];
  let t = decalage;
  // La récurrence a besoin de ses DEUX termes précédents : le premier intervalle est donné, et le
  // second lui est égal, faute de quoi la suite démarrerait sur une valeur arbitraire.
  let precedent = Math.max(1, valeurA(o.intervalle, 0) * sr);
  let courant = precedent;
  let garde = 0;
  while (t < o.duree && garde++ < 2_000_000) {
    out.push(Math.round(t));
    const i = Math.min(o.duree - 1, Math.max(0, Math.round(t)));
    if (o.modele === "rebond") {
      const d = Math.min(0.499, Math.max(0.001, valeurA(o.amortissement ?? 0.45, i)));
      const suivant = d * (courant + precedent);
      precedent = courant;
      courant = suivant;
      // UN INTERVALLE SOUS L'ÉCHANTILLON ARRÊTE L'ÉVÉNEMENT, et c'est le repos du corps qui
      // rebondit : la somme d'une suite de rapport inférieur à un converge, donc le rebond a une
      // fin. La borner à un échantillon ferait au contraire un bourdonnement sans terme.
      if (courant < 1) break;
      t += courant;
    } else {
      // Les deux autres modèles ont un débit : périodique pour le frottement, et de même espérance
      // mais réparti pour l'écoulement, dont les gouttes ne tombent pas en mesure.
      const base = Math.max(1, valeurA(o.intervalle, i) * sr);
      t += o.modele === "ecoulement" ? base * (0.5 + aleatoire()) : base;
    }
  }
  return out;
}

/**
 * Le rendu : la fonction de contrôle pose les grains, la source les remplit.
 *
 * Le coût est celui du nombre de grains simultanés, non du nombre de grains posés.
 */
export function granulationEcologique(
  x: Float32Array, o: OptionsGranulationEcologique,
): { sortie: Float32Array; rapport: RapportGranulationEcologique } {
  const sr = o.sampleRate;
  const n = Math.max(1, Math.round(o.duree));
  const flux = Math.max(1, Math.round(o.flux ?? 1));
  const forme = o.fenetre ?? "expodec";
  const aleatoire = creerAleatoire(Math.max(1, Math.round(o.graine)));
  const reglages = { ...o, duree: n };

  // LES FLUX SYNCHRONES PARTAGENT LEURS INSTANTS, les asynchrones ont chacun leur phase. C'est la
  // classification de l'article, qui range la granulation selon le nombre de flux et leur rapport
  // de phase : un flux unique, des flux asynchrones pour l'eau, des flux synchrones pour un vent
  // dense. Un décalage tiré au sort est ce qui sépare les deux, et rien d'autre.
  const departs: number[][] = [];
  const premier = instants(reglages, 0, aleatoire);
  for (let f = 0; f < flux; f++) {
    if (f === 0 || o.synchrone) { departs.push(premier); continue; }
    const base = Math.max(1, valeurA(o.intervalle, 0) * sr);
    departs.push(instants(reglages, aleatoire() * base, aleatoire));
  }

  const poses: Pose[] = [];
  for (const flot of departs) {
    for (const debut of flot) {
      const i = Math.min(n - 1, Math.max(0, debut));
      const duree = Math.max(1, Math.round(Math.max(0.001, valeurA(o.taille, i)) * sr));
      // LA PRISE EST TIRÉE AUTOUR DE SON RÉGLAGE, D'AUTANT QUE LA RUGOSITÉ EST FORTE. À rugosité
      // nulle tous les grains viennent du même endroit, et le flux rend une hauteur, celle du
      // débit ; à rugosité pleine ils viennent de partout, et le flux rend du bruit. C'est le
      // « contrôle périodique, contenu aléatoire » de l'article.
      const r = Math.min(1, Math.max(0, valeurA(o.rugosite ?? 0, i)));
      const centre = Math.min(1, Math.max(0, valeurA(o.prise ?? 0, i)));
      const place = r <= 0 ? centre : Math.min(1, Math.max(0, centre + (aleatoire() * 2 - 1) * r));
      poses.push({ debut, duree, prise: Math.round(place * Math.max(0, x.length - duree)) });
    }
  }

  const sortie = new Float32Array(n);
  const fenetres = new Float32Array(n);
  for (const p of poses) {
    for (let k = 0; k < p.duree; k++) {
      const i = p.debut + k;
      if (i < 0 || i >= n) continue;
      const w = fenetre(forme, k / p.duree);
      sortie[i] += w * (x[p.prise + k] ?? 0);
      fenetres[i] += w;
    }
  }

  let sommeCompensations = 0;
  for (let i = 0; i < n; i++) {
    const c = 1 / Math.max(1, fenetres[i]);
    sommeCompensations += c;
    sortie[i] *= c * Math.min(1, Math.max(0, valeurA(o.niveau ?? 1, i)));
  }

  const debuts = poses.map((p) => p.debut).sort((a, b) => a - b);
  const ecarts = premier.length > 1 ? premier.map((t, k) => t - (premier[k - 1] ?? t)).slice(1) : [];
  return {
    sortie,
    rapport: {
      grains: poses.length,
      instantsDistincts: new Set(poses.map((p) => p.debut)).size,
      fin: (debuts[debuts.length - 1] ?? 0) / sr,
      premierMs: ((ecarts[0] ?? 0) / sr) * 1000,
      dernierMs: ((ecarts[ecarts.length - 1] ?? 0) / sr) * 1000,
      compensationMoyenne: sommeCompensations / n,
    },
  };
}
