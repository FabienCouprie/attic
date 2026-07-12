// core/types.ts — Types du moteur et du registre de plugins
import type { Edge } from "@xyflow/react";

export type StatutExecution = "attente" | "en_cours" | "termine" | "erreur";

// Valeur transportée sur les arêtes. `TypeValeur` est le type PAR DÉFAUT du
// framework (actuellement teinté audio). Le cœur ne manipule les valeurs que de
// façon opaque : un autre domaine fournit son propre type via le paramètre
// `TValeur` des contrats génériques ci-dessous, sans toucher au cœur (§1 roadmap).
export type TypeValeur = AudioBuffer | Float32Array | File | string | { debut: number; duree: number } | null;

// Contexte d'exécution passé à chaque plugin. Générique sur :
//  - `TValeur`  : le type des valeurs sur les arêtes (défaut : audio) ;
//  - `TRuntime` : l'environnement d'exécution opaque du domaine (défaut :
//    AudioContext du Web Audio). Le cœur ne l'utilise jamais, il le transmet.
export interface ContexteExecution<TValeur = TypeValeur, TRuntime = AudioContext> {
  noeud: { id: string; data: Record<string, unknown> };
  aretes: Edge[];
  resultats: Map<string, TValeur[]>;
  runtime: TRuntime;
  repertoireTravail: string;
  entree: (index: number) => TValeur;
  // Toutes les valeurs branchées en entrée (dans l'ordre des arêtes), null pour
  // les entrées non connectées/non calculées. Le filtrage par type (ex. n'en
  // garder que les AudioBuffer) relève du domaine, pas du cœur.
  entrees: () => TValeur[];
  paramNombre: (nom: string, defaut: number) => number;
  paramTexte: (nom: string, defaut: string) => string;
  onProgress: (msg: string) => void;
}

export type FonctionPlugin<TValeur = TypeValeur, TRuntime = AudioContext> = (ctx: ContexteExecution<TValeur, TRuntime>) => Promise<{
  valeurs: TValeur[];
  message?: string;
  mp3Url?: string;
  erreur?: boolean;
}>;

export interface PortDef {
  // `type` = id d'un type de flux enregistré dans le domaine (voir
  // core/typesFlux). Le domaine audio déclare audio|midi|controle|texte|fichier
  // (spec §3.2) ; un autre domaine peut en déclarer d'autres. La couleur et la
  // compatibilité de connexion sont portées par le registre, plus par le cœur.
  nom: string;
  type: string;
  sousType?: "stereo" | "mono";
  dynamique?: boolean;
}

export interface ParametreDef {
  nom: string;
  nomEn?: string;
  type?: "choix" | "curseur" | "texte" | "dossier";
  options?: string[];
  optionsEn?: string[];
  plage?: [number, number];
  pas?: number;
  defaut: string | number;
  unite?: string;
  doc?: string;
  docEn?: string;
}

export interface PluginDef<TValeur = TypeValeur, TRuntime = AudioContext> {
  id: string;
  nom: string;
  nomEn?: string;
  univers: string;
  famille: string;
  resume: string;
  resumeEn?: string;
  notice?: string;
  noticeEn?: string;
  entrees: PortDef[];
  sorties: PortDef[];
  parametres: ParametreDef[];
  executer: FonctionPlugin<TValeur, TRuntime>;
  etiquettes?: string[];
}
