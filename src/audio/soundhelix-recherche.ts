// audio/soundhelix-recherche.ts — La recherche des voix actives section par section, exacte ou
// gloutonne, sous les contraintes que `audio/soundhelix-arrangement.ts` lit.
//
// UNE CONTRAINTE EST JUGÉE DÈS QU'ELLE EST DÉCIDABLE. Sur un début de matrice, une voix viole sa
// part maximale dès qu'elle a joué trop de sections, sa part minimale dès que les sections qui
// restent ne suffisent plus, sa fenêtre d'entrée dès que sa première section tombe hors d'elle ou
// que la fenêtre est passée sans elle, sa longueur de segment dès qu'un segment fini est trop court
// ou qu'un segment en cours est trop long, sa pause dès qu'une pause finie, entre deux segments,
// sort de ses bornes, son nombre de segments dès qu'il dépasse. Le reste ne se juge qu'à la fin : le
// minimum de segments, la fenêtre de sortie, le dernier segment, la voix qui n'a jamais joué.
//
// LES POIDS DE LA RECHERCHE GLOUTONNE sont ceux que la description du modèle donne : 250 pour une
// longueur ou une pause hors bornes, 400 pour un nombre de segments, 100 pour une fenêtre d'entrée
// ou de sortie, 15 par point d'écart à la part.

import type { ContraintesVoix } from "./soundhelix-arrangement";

export type Contrainte = "part" | "entree" | "sortie" | "segments" | "longueur" | "pause" | "muette";

const POIDS: Record<Contrainte, number> = { part: 15, entree: 100, sortie: 100, segments: 400, longueur: 250, pause: 250, muette: 400 };

/** Une faute, sa voix et son poids. */
export interface Faute { voix: string; contrainte: Contrainte; poids: number }

/** Les fautes d'une voix sur un début de matrice de `fait` sections sur `total`. */
export function fautesDeVoix(v: ContraintesVoix, jeu: readonly boolean[], total: number): Faute[] {
  const fait = jeu.length;
  const fin = fait === total;
  const out: Faute[] = [];
  const faute = (contrainte: Contrainte, poids = POIDS[contrainte]) => out.push({ voix: v.nom, contrainte, poids });
  const actifs = jeu.filter(Boolean).length;
  const premier = jeu.indexOf(true);
  // La part, en pour cent des sections du morceau.
  if (actifs * 100 > v.part.max * total) faute("part", POIDS.part * Math.ceil((actifs * 100) / total - v.part.max));
  if ((actifs + total - fait) * 100 < v.part.min * total && !(v.muette && actifs === 0 && fin)) {
    faute("part", POIDS.part * Math.ceil(v.part.min - ((actifs + total - fait) * 100) / total));
  }
  // L'entrée.
  if (premier >= 0 && (premier + 1 < v.entree.min || premier + 1 > v.entree.max)) faute("entree");
  if (premier < 0 && fait >= v.entree.max && !v.muette) faute("entree");
  if (premier < 0 && fin) {
    if (!v.muette) faute("muette");
    return out;
  }
  // Les segments et les pauses, finis ou en cours.
  const segments: { debut: number; longueur: number }[] = [];
  for (let s = 0; s < fait; s++) {
    if (!jeu[s]) continue;
    if (s > 0 && jeu[s - 1]) segments[segments.length - 1].longueur++;
    else segments.push({ debut: s, longueur: 1 });
  }
  if (segments.length > v.segments.max) faute("segments");
  segments.forEach((g, k) => {
    const fini = g.debut + g.longueur < fait || fin;
    if (g.longueur > v.longueur.max) faute("longueur");
    if (fini && g.longueur < v.longueur.min) faute("longueur");
    if (k > 0) {
      const avant = segments[k - 1];
      const pause = g.debut - (avant.debut + avant.longueur);
      if (pause < v.pause.min || pause > v.pause.max) faute("pause");
    }
  });
  if (fin) {
    if (segments.length < v.segments.min) faute("segments");
    const dernier = segments[segments.length - 1];
    const depuisLaFin = total - (dernier.debut + dernier.longueur) + 1;
    if (depuisLaFin < v.sortie.min || depuisLaFin > v.sortie.max) faute("sortie");
  }
  return out;
}

export interface OptionsRecherche {
  voix: readonly ContraintesVoix[];
  comptes: readonly number[];
  exacte: boolean;
  /** Exacte : le plafond de propositions de toute la recherche. Gloutonne : les propositions par section. */
  essais: number;
  aleatoire: () => number;
}

export interface Recherche {
  /** Une ligne par voix, un signe par section ; `null` quand la recherche exacte n'a rien trouvé. */
  matrice: boolean[][] | null;
  essais: number;
  /** Les fautes que la matrice rendue garde : toujours aucune en recherche exacte. */
  fautes: Faute[];
  /** Ce qui a bloqué le plus souvent, voix et contrainte, quand la recherche exacte échoue. */
  blocage: { voix: string; contrainte: Contrainte } | null;
}

/** Les voix de la section qui suit : celles d'avant, allumées ou éteintes au hasard jusqu'au compte. */
function proposer(avant: readonly boolean[], compte: number, echanger: boolean, alea: () => number): boolean[] {
  const jeu = [...avant];
  const au = (b: boolean) => jeu.flatMap((x, i) => (x === b ? [i] : []));
  const tirer = (l: number[]) => l[Math.floor(alea() * l.length)];
  while (au(true).length > compte) jeu[tirer(au(true))] = false;
  while (au(false).length > 0 && au(true).length < compte) jeu[tirer(au(false))] = true;
  if (echanger && au(true).length > 0 && au(false).length > 0 && alea() < 0.5) {
    const sortante = tirer(au(true));
    jeu[tirer(au(false))] = true;
    jeu[sortante] = false;
  }
  return jeu;
}

/** Les fautes de toutes les voix sur un début de matrice, sections × voix. */
function fautesDuDebut(voix: readonly ContraintesVoix[], sections: readonly (readonly boolean[])[], total: number): Faute[] {
  return voix.flatMap((v, i) => fautesDeVoix(v, sections.map((s) => s[i]), total));
}

/** Combien une section essaie de propositions avant que la recherche exacte revienne en arrière. */
const ESSAIS_PAR_SECTION = 8;

/** Cherche la matrice. */
export function rechercherMatrice(o: OptionsRecherche): Recherche {
  const n = o.comptes.length;
  const vide = o.voix.map(() => false);
  const sections: boolean[][] = [];
  let essais = 0;
  if (!o.exacte) {
    for (let s = 0; s < n; s++) {
      let meilleure: { jeu: boolean[]; poids: number } | null = null;
      for (let k = 0; k < Math.max(1, o.essais); k++) {
        essais++;
        const jeu = proposer(s > 0 ? sections[s - 1] : vide, o.comptes[s], s > 0 && o.comptes[s] === o.comptes[s - 1], o.aleatoire);
        const poids = fautesDuDebut(o.voix, [...sections, jeu], n).reduce((t, f) => t + f.poids, 0);
        if (!meilleure || poids < meilleure.poids) meilleure = { jeu, poids };
        if (poids === 0) break;
      }
      sections.push(meilleure!.jeu);
    }
    return { matrice: transposer(sections, o.voix.length), essais, fautes: fautesDuDebut(o.voix, sections, n), blocage: null };
  }
  const restants = [ESSAIS_PAR_SECTION];
  const blocages = new Map<string, number>();
  let s = 0;
  while (s < n) {
    if (essais >= o.essais) {
      const [cle] = [...blocages.entries()].sort((a, b) => b[1] - a[1])[0] ?? [""];
      const [voix, contrainte] = cle.split("\u0000");
      return { matrice: null, essais, fautes: [], blocage: cle ? { voix, contrainte: contrainte as Contrainte } : null };
    }
    if (restants[s] === 0) {
      if (s === 0) restants[0] = ESSAIS_PAR_SECTION;
      else { s--; continue; }
    }
    restants[s]--;
    essais++;
    sections.length = s;
    const jeu = proposer(s > 0 ? sections[s - 1] : vide, o.comptes[s], s > 0 && o.comptes[s] === o.comptes[s - 1], o.aleatoire);
    const fautes = fautesDuDebut(o.voix, [...sections, jeu], n);
    if (fautes.length === 0) {
      sections[s] = jeu;
      s++;
      restants[s] = ESSAIS_PAR_SECTION;
    } else {
      for (const f of fautes) blocages.set(`${f.voix}\u0000${f.contrainte}`, (blocages.get(`${f.voix}\u0000${f.contrainte}`) ?? 0) + 1);
    }
  }
  return { matrice: transposer(sections, o.voix.length), essais, fautes: [], blocage: null };
}

/** Sections × voix en voix × sections. */
function transposer(sections: readonly (readonly boolean[])[], voix: number): boolean[][] {
  return Array.from({ length: voix }, (_, i) => sections.map((s) => s[i]));
}
