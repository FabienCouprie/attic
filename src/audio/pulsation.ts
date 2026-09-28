// audio/pulsation.ts — Les frappes d'un son, tirées de ses atomes.
//
// POURQUOI CE MODULE EXISTE, décidé avec Fabien : « cela conduit à regarder si nous pouvons
// transformer une musique en pulsations pures, certains nœuds approchent mais ne vont pas jusqu'au
// bout. Obtenir un son unique qui bat que l'on peut associer à chaque piste musicale. »
//
// CE QUI APPROCHAIT, ET CE QUI MANQUAIT. Un composant détecte de vraies attaques par flux spectral,
// mais il rend des ZONES ; un autre estime le tempo et rend UN NOMBRE, or une pulsation n'est pas
// un nombre mais une liste d'instants. Aucun ne rendait la pulsation elle-même.
//
// LES TROIS CRITÈRES SONT LES TROIS CHAMPS D'UNE NOTE, et c'est ce qui rend ce tri simple. Une
// frappe se décrit d'un atome COURT, la poursuite adaptative choisissant l'échelle la plus brève là
// où le signal est le plus transitoire ; elle est FORTE, puisqu'une attaque porte l'essentiel de
// l'énergie de son instant ; et elle est GRAVE, l'énergie d'une frappe se concentrant dans le bas
// du spectre. Après `atomesEnNotes`, la durée d'une note EST l'échelle de son atome, sa vélocité
// EST son poids, et sa hauteur EST sa fréquence : les trois critères se lisent sans rien recalculer.
//
// ET IL FAUT REGROUPER, SANS QUOI UNE FRAPPE EN FERAIT CINQ. Une seule attaque reçoit plusieurs
// atomes, un par partiel et un par échelle : les compter séparément donnerait une pulsation
// beaucoup trop dense. Deux atomes plus proches qu'un seuil sont donc la même frappe.
//
// CE QUE CE MODULE NE FAIT PAS, DIT PLUTÔT QUE TU. Il rend les ATTAQUES, non une grille régulière.
// Trouver la pulsation isochrone au milieu des attaques est un autre problème, celui du suivi de
// tempo, et le prétendre ici ferait croire à une régularité que rien n'a cherchée.

import type { Note } from "./note";

/** Une frappe retenue : son instant, sa force, et de combien d'atomes elle est faite. */
export interface Frappe {
  /** L'instant de l'atome le plus tôt du groupe, en secondes. */
  instant: number;
  /** De 1 à 127, rapportée à la frappe la plus forte. */
  force: number;
  /** Combien d'atomes ont été réunis en elle. */
  atomes: number;
}

export interface CriteresDePulsation {
  /** Au-delà, l'atome décrit une tenue et non une frappe. En secondes. */
  dureeMax: number;
  /** Au-dessus, ce n'est plus le grave. En demi-tons. */
  hauteurMax: number;
  /** En deçà, l'atome n'est pas une attaque mais un reste. De 1 à 127. */
  forceMin: number;
  /** Deux atomes plus proches que cela sont la même frappe. En secondes. */
  regroupement: number;
}

/**
 * Les frappes d'une suite d'atomes.
 *
 * L'INSTANT D'UNE FRAPPE EST CELUI DE SON ATOME LE PLUS TÔT, et non de son plus fort : une attaque
 * commence où elle commence, et le sommet d'énergie vient après. Prendre le plus fort retarderait
 * chaque frappe de quelques millisecondes, ce qui est exactement ce qu'on cherche à mesurer.
 *
 * LA FORCE EST LA SOMME DU GROUPE, PUIS RAPPORTÉE À LA PLUS FORTE. Une frappe riche en partiels est
 * plus forte qu'une frappe pauvre, et la somme le dit ; le rapport la rend comparable d'un son à
 * l'autre, le poids d'un atome n'ayant pas d'échelle absolue.
 */
export function pulsationDeSequence(
  notes: readonly Note[],
  criteres: CriteresDePulsation,
): Frappe[] {
  const retenus = notes
    .filter((n) => n.fin - n.debut <= criteres.dureeMax)
    .filter((n) => n.note <= criteres.hauteurMax)
    .filter((n) => n.velocite >= criteres.forceMin)
    .sort((a, b) => a.debut - b.debut);
  if (retenus.length === 0) return [];

  const groupes: { instant: number; somme: number; atomes: number }[] = [];
  for (const n of retenus) {
    const dernier = groupes[groupes.length - 1];
    if (dernier && n.debut - dernier.instant <= criteres.regroupement) {
      dernier.somme += n.velocite;
      dernier.atomes++;
    } else {
      groupes.push({ instant: n.debut, somme: n.velocite, atomes: 1 });
    }
  }
  const plusForte = groupes.reduce((m, g) => Math.max(m, g.somme), 0) || 1;
  return groupes.map((g) => ({
    instant: g.instant,
    force: Math.max(1, Math.min(127, Math.round((g.somme / plusForte) * 126) + 1)),
    atomes: g.atomes,
  }));
}

/** L'écart moyen entre deux frappes, et ce qu'il vaut en battements par minute. */
export function cadenceDesFrappes(frappes: readonly Frappe[]): { ecartMoyen: number; parMinute: number } {
  if (frappes.length < 2) return { ecartMoyen: 0, parMinute: 0 };
  const ecarts = frappes.slice(1).map((f, i) => f.instant - frappes[i].instant);
  const moyen = ecarts.reduce((s, e) => s + e, 0) / ecarts.length;
  return { ecartMoyen: moyen, parMinute: moyen > 0 ? 60 / moyen : 0 };
}

/**
 * L'irrégularité de la pulsation, de zéro à un.
 *
 * ZÉRO EST UNE GRILLE PARFAITE, un vaut un écart type aussi grand que l'écart moyen. Ce nombre ne
 * corrige rien : il DIT si les frappes trouvées forment une pulsation régulière ou une suite
 * d'attaques quelconques, ce que ce module ne cherche pas à décider à la place de qui l'écoute.
 */
export function irregularite(frappes: readonly Frappe[]): number {
  if (frappes.length < 3) return 0;
  const ecarts = frappes.slice(1).map((f, i) => f.instant - frappes[i].instant);
  const m = ecarts.reduce((s, e) => s + e, 0) / ecarts.length;
  if (m <= 0) return 0;
  const variance = ecarts.reduce((s, e) => s + (e - m) ** 2, 0) / ecarts.length;
  return Math.min(1, Math.sqrt(variance) / m);
}

export interface OptionsBattement {
  /** La fréquence du son sourd, en hertz. */
  frequence: number;
  /** Le temps que met un battement à s'éteindre, en secondes. */
  longueur: number;
  /** Le niveau de crête, de zéro à un. */
  niveau: number;
  /** La durée totale du son rendu, en secondes. */
  duree: number;
  sampleRate: number;
}

/**
 * Les frappes rendues comme un seul son qui bat.
 *
 * UN SEUL SON POUR TOUTES LES FRAPPES, demandé par Fabien : ce qu'on veut entendre est la
 * pulsation, non ce qui la porte. Une sinusoïde grave qui retombe vite est ce qu'un métronome
 * grave fait entendre, et la force de la frappe en règle l'amplitude.
 *
 * LA PHASE REPART À ZÉRO À CHAQUE FRAPPE, ce qui donne l'attaque : c'est le seul endroit où une
 * discontinuité est voulue, et l'enveloppe la borne à un échantillon.
 */
export function echantillonsDeBattements(
  frappes: readonly Frappe[],
  o: OptionsBattement,
): Float32Array {
  const sr = Math.max(1, Math.round(o.sampleRate));
  const n = Math.max(1, Math.round(Math.max(0, o.duree) * sr));
  const sortie = new Float32Array(n);
  const longueur = Math.max(0.005, o.longueur);
  const echantillonsParBattement = Math.round(longueur * sr);
  const niveau = Math.max(0, Math.min(1, o.niveau));

  for (const f of frappes) {
    const depart = Math.round(f.instant * sr);
    const amplitude = (f.force / 127) * niveau;
    for (let k = 0; k < echantillonsParBattement; k++) {
      const i = depart + k;
      if (i < 0 || i >= n) continue;
      const t = k / sr;
      // La retombée exponentielle atteint un millième de son départ à la longueur demandée.
      const env = Math.exp((-t / longueur) * 6.9);
      sortie[i] += Math.sin(2 * Math.PI * o.frequence * t) * env * amplitude;
    }
  }
  // DEUX FRAPPES QUI SE RECOUVRENT S'ADDITIONNENT, et peuvent dépasser un. On ramène l'ensemble
  // plutôt que d'écrêter chaque frappe, ce qui déformerait celles qui ne se recouvrent pas.
  let crete = 0;
  for (let i = 0; i < n; i++) crete = Math.max(crete, Math.abs(sortie[i]));
  if (crete > niveau && crete > 0) {
    const g = niveau / crete;
    for (let i = 0; i < n; i++) sortie[i] *= g;
  }
  return sortie;
}
