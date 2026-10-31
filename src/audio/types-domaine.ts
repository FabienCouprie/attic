// audio/types-domaine.ts — Liaison des contrats génériques du cœur au domaine AUDIO.
//
// Le cœur (`core/types.ts`) expose `PluginDef<TValeur, TRuntime>` SANS paramètre
// par défaut : chaque domaine doit expliciter ce qui circule sur ses arêtes et
// quel runtime il utilise. Ce fichier fait cette liaison une fois pour toutes,
// pour que les fiches audio écrivent `FicheAudio` au lieu de répéter les
// paramètres génériques.
//
// Un autre domaine (image, données…) crée son propre équivalent — par ex.
// `type ValeurImage = ImageBitmap | Float32Array | number | null` puis
// `type FicheImage = PluginDef<ValeurImage, CanvasRenderingContext2D>` — sans
// jamais toucher au cœur. C'est le point d'extension de la spec §12.
//
// Fichier FEUILLE : il n'importe que des TYPES, du cœur et du domaine, et un import de type
// s'efface à la compilation. Aucun cycle possible avec `audio/index.ts`, que les plugins importent
// déjà pour le DSP.
import type { PluginDef, ContexteExecution } from "../core";
import type { Accordage } from "./accordage";
import type { Cercle, Suite } from "./cercle";
import type { Banque } from "./clavier-banque";
import type { Courbe } from "./courbe";
import type { ObjetSonore } from "./multicanal";
import type { Sequence } from "./sequence";
import type { SpectrogrammeMel } from "./spectrogramme-mel";

/** Une zone de son, en secondes : ce qu'un sélecteur désigne dans un tampon. */
export interface Zone {
  debut: number;
  duree: number;
}

/**
 * Ce qui circule sur les arêtes du domaine audio.
 *
 * ELLE ÉTAIT DÉCLARÉE DANS LE CŒUR, sous le nom `TypeValeur`, et c'était la dernière chose que le
 * cœur savait de l'audio. Elle est ici, où elle a toujours eu sa place : un domaine déclare son
 * union et la passe en paramètre générique, comme le fait le domaine nombre de
 * `core/domaine-nombre.test.ts` avec `number | string`.
 *
 * ELLE DISAIT SIX TYPES, ET LE DOMAINE EN FAIT CIRCULER QUINZE. Relevé le 2026-10-31, en retirant
 * `ctx: any` des quatre cent soixante-neuf exécuteurs : une séquence, un objet sonore, un cercle,
 * une suite de cercles, une courbe, un spectrogramme, une banque, un accordage passaient sur les
 * arêtes sans figurer ici, et les fiches qui les rendaient se typaient `as unknown as FicheAudio[]`
 * pour que le compilateur se taise. L'union dit désormais ce que l'adaptateur enregistre comme types
 * de flux (`audio/adaptateur.ts`) et ce que les contenus de contrôle transportent
 * (`audio/sous-types-controle.ts`) : une zone, des zones, une durée, un tempo, un profil.
 */
export type ValeurAudio =
  | AudioBuffer
  | Float32Array
  | File
  | string
  | Zone
  | Zone[]
  | { tempo: number }
  | Courbe
  | Sequence
  | ObjetSonore
  | Cercle
  | Suite
  | SpectrogrammeMel
  | Banque
  | Accordage
  | null;

/** Runtime passé aux plugins audio (Web Audio). */
export type RuntimeAudio = AudioContext;

/** Fiche de nœud du domaine audio — à utiliser dans tous les plugins. */
export type FicheAudio = PluginDef<ValeurAudio, RuntimeAudio>;

/**
 * Le contexte qu'un exécuteur audio reçoit.
 *
 * Une fiche écrite dans un tableau `as FicheAudio[]` n'a pas à le nommer : le compilateur le déduit.
 * Il sert aux fonctions d'aide qui prennent le contexte en argument, là où `ctx: any` le prenait.
 */
export type ContexteAudio = ContexteExecution<ValeurAudio, RuntimeAudio>;
