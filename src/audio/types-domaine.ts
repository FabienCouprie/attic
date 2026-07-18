// audio/types-domaine.ts — Liaison des contrats génériques du cœur au domaine AUDIO.
//
// Le cœur (`core/types.ts`) expose `PluginDef<TValeur, TRuntime>` SANS paramètre
// par défaut : chaque domaine doit expliciter ce qui circule sur ses arêtes et
// quel runtime il utilise. Ce fichier fait cette liaison une fois pour toutes,
// pour que les ~40 fiches audio écrivent `FicheAudio` au lieu de répéter les
// paramètres génériques.
//
// Un autre domaine (image, données…) crée son propre équivalent — par ex.
// `type ValeurImage = ImageBitmap | Float32Array | number | null` puis
// `type FicheImage = PluginDef<ValeurImage, CanvasRenderingContext2D>` — sans
// jamais toucher au cœur. C'est le point d'extension de la spec §12.
//
// Fichier FEUILLE : il n'importe que des types du cœur, donc aucun cycle possible
// avec `audio/index.ts` (que les plugins importent déjà pour le DSP).
import type { PluginDef, ContexteExecution, FonctionPlugin, TypeValeur } from "../core";

/** Ce qui circule sur les arêtes du domaine audio. */
export type ValeurAudio = TypeValeur;

/** Runtime passé aux plugins audio (Web Audio). */
export type RuntimeAudio = AudioContext;

/** Fiche de nœud du domaine audio — à utiliser dans tous les plugins. */
export type FicheAudio = PluginDef<ValeurAudio, RuntimeAudio>;

/** Contexte d'exécution reçu par un `executer` audio. */
export type ContexteAudio = ContexteExecution<ValeurAudio, RuntimeAudio>;

/** Signature d'un `executer` audio. */
export type FonctionAudio = FonctionPlugin<ValeurAudio, RuntimeAudio>;
