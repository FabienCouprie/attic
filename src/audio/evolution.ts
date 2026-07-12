// audio/evolution.ts — Évolution génétique de réservoirs de neurones aléatoires.
// Une population de réservoirs évolue par mutation + sélection utilisateur.
// L'utilisateur note chaque génération (j'aime / j'aime pas), les meilleurs
// réservoirs survivent et se reproduisent avec mutation. Après quelques
// générations, le réservoir s'adapte au goût de l'utilisateur.
//
// Inspiré par Allendia/EVY : pas d'entraînement, pas de dataset — de la
// sélection naturelle appliquée à des réseaux de neurones aléatoires.

import { genererReservoirMusical, rendreReservoirAudio, type ConfigReservoir, type NoteGeneree } from "./reservoir";
import { mulberry32 } from "./reservoir";

export interface Individu {
  id: number;
  graine: number;           // graine du réservoir (définit le réseau)
  parametres: Partial<ConfigReservoir>;  // paramètres mutables
  note: number;             // note utilisateur (-1 = pas encore noté, 0 = j'aime pas, 1 = j'aime)
  generation: number;
}

export interface Population {
  individus: Individu[];
  generation: number;
  taille: number;
}

// Créer une population initiale avec des graines aléatoires
export function creerPopulation(taille: number, configBase: ConfigReservoir): Population {
  const individus: Individu[] = [];
  for (let i = 0; i < taille; i++) {
    const graine = Math.floor(Math.random() * 99999) + 1;
    individus.push({
      id: i,
      graine,
      parametres: muterParams({}, configBase, 1.0, mulberry32(graine)),
      note: -1,
      generation: 0,
    });
  }
  return { individus, generation: 0, taille };
}

// Muter les paramètres d'un individu
function muterParams(
  base: Partial<ConfigReservoir>,
  configBase: ConfigReservoir,
  amplitude: number,
  rng: () => number,
): Partial<ConfigReservoir> {
  const params: Partial<ConfigReservoir> = { ...base };

  // Chaque paramètre a une probabilité de mutation
  const mutations: [keyof ConfigReservoir, number, number, number][] = [
    ["taille", 5, 50, 3],        // nom, min, max, delta max
    ["connectivite", 0, 1, 0.15],
    ["leaking", 0, 1, 0.15],
    ["spectre", 0.5, 1.5, 0.15],
    ["probaNote", 0, 1, 0.15],
    ["repetition", 0, 1, 0.15],
    ["silence", 0, 0.5, 0.1],
  ];

  for (const [key, min, max, delta] of mutations) {
    if (rng() < 0.5) { // 50% de chance de muter chaque paramètre
      const current = (params[key] as number) ?? (configBase[key] as number);
      const mutation = (rng() * 2 - 1) * delta * amplitude;
      params[key] = Math.max(min, Math.min(max, current + mutation)) as any;
    }
  }

  // Mutation de la graine (nouveau réseau) — rare
  if (rng() < 0.15 * amplitude) {
    params.graine = Math.floor(rng() * 99999) + 1;
  }

  return params;
}

// Évoluer la population : sélection + reproduction + mutation
export function evoluerPopulation(pop: Population, configBase: ConfigReservoir): Population {
  // Sélection : garder les individus notés positivement + quelques aléatoires
  const aimes = pop.individus.filter((ind) => ind.note === 1);
  const pasAimes = pop.individus.filter((ind) => ind.note === 0);
  const nonNotes = pop.individus.filter((ind) => ind.note === -1);

  // Si personne n'a été noté, on garde tout le monde
  let parents: Individu[];
  if (aimes.length === 0 && pasAimes.length === 0) {
    parents = pop.individus;
  } else {
    // Survivants : tous les aimés + 1/3 des non-notés (diversité)
    parents = [...aimes, ...nonNotes.slice(0, Math.max(1, Math.floor(pop.taille / 3)))];
    if (parents.length < 2) parents = pop.individus; // fallback
  }

  // Reproduction + mutation
  const nouveauxIndividus: Individu[] = [];
  const rng = mulberry32(Math.floor(Math.random() * 99999) + 1);

  // Élitisme : garder les 2 meilleurs intacts
  const elite = aimes.slice(0, 2);
  for (const e of elite) {
    nouveauxIndividus.push({
      ...e,
      id: nouveauxIndividus.length,
      generation: pop.generation + 1,
      note: -1,
    });
  }

  // Remplir le reste avec des enfants mutés
  while (nouveauxIndividus.length < pop.taille) {
    const parent = parents[Math.floor(rng() * parents.length)];
    const enfantParams = muterParams(parent.parametres, configBase, 0.8, rng);
    const enfantGraine = enfantParams.graine ?? parent.graine;

    // Croisement : 20% de chance de croiser avec un autre parent
    let finalParams = enfantParams;
    if (rng() < 0.2 && parents.length > 1) {
      const autre = parents[Math.floor(rng() * parents.length)];
      finalParams = croiserParams(enfantParams, autre.parametres, rng);
    }

    nouveauxIndividus.push({
      id: nouveauxIndividus.length,
      graine: enfantGraine,
      parametres: finalParams,
      note: -1,
      generation: pop.generation + 1,
    });
  }

  return {
    individus: nouveauxIndividus,
    generation: pop.generation + 1,
    taille: pop.taille,
  };
}

// Croisement : prendre la moitié des paramètres de chaque parent
function croiserParams(
  a: Partial<ConfigReservoir>,
  b: Partial<ConfigReservoir>,
  rng: () => number,
): Partial<ConfigReservoir> {
  const cles: (keyof ConfigReservoir)[] = ["taille", "connectivite", "leaking", "spectre", "probaNote", "repetition", "silence"];
  const result: Partial<ConfigReservoir> = {};
  for (const key of cles) {
    result[key] = (rng() < 0.5 ? a[key] : b[key]) as any;
  }
  result.graine = rng() < 0.5 ? a.graine : b.graine;
  return result;
}

// Fusionner les paramètres de l'individu avec la config de base
export function configIndividu(ind: Individu, base: ConfigReservoir): ConfigReservoir {
  return {
    ...base,
    ...ind.parametres,
    graine: ind.graine,
    taille: Math.round(ind.parametres.taille ?? base.taille),
  };
}

// Générer l'audio pour un individu
export function rendreIndividu(ind: Individu, base: ConfigReservoir): { buffer: AudioBuffer; notes: NoteGeneree[]; graine: number } {
  const config = configIndividu(ind, base);
  const { notes, graineUtilisee } = genererReservoirMusical(config);
  const buffer = rendreReservoirAudio(notes, config);
  return { buffer, notes, graine: graineUtilisee };
}
