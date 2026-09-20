// electron/esthetique.cjs — Audiobox Aesthetics (Meta) en natif, via onnxruntime-node.
//
// Le modèle (WavLM Base + quatre têtes, 94 M de paramètres, 420 Mo en FP32) est trop
// gros pour onnxruntime-web, qui a déjà échoué à charger Demucs à 166 Mo : il tourne donc
// ici, dans le processus principal. Il ne reçoit qu'une tranche à la fois —
// 160 000 échantillons à 16 kHz et le nombre d'échantillons réels — et rend les
// quatre scores déjà dénormalisés, dans l'ordre CE, CU, PC, PQ. Le rééchantillonnage,
// le découpage et la moyenne vivent côté rendu, dans src/audio/esthetique.ts.
//
// Pourquoi FP32 et pas une version allégée : mesuré sur les 317 tranches de la
// collection de démonstration contre le code PyTorch de Meta, le FP32 exporté rend les
// mêmes scores (écart max 2e-5). L'INT8 dynamique complet s'écartait jusqu'à 5,5 points,
// l'INT8 limité au transformer jusqu'à 0,32, et le FP16 fait planter onnxruntime au
// chargement.
//
// Module sans dépendance à Electron : testable en Node pur.
"use strict";

const ort = require("onnxruntime-node");

const ECHANTILLONS_TRANCHE = 160000;
const FICHIER_MODELE = "audiobox-aesthetics.onnx";

const sessions = new Map();

async function obtenirSession(cheminModele) {
  let session = sessions.get(cheminModele);
  if (!session) {
    session = ort.InferenceSession.create(cheminModele, { executionProviders: ["cpu"], graphOptimizationLevel: "all" });
    sessions.set(cheminModele, session);
    // Une création échouée ne doit pas rester en cache : la suivante réessaie.
    session.catch(() => sessions.delete(cheminModele));
  }
  return session;
}

/**
 * Note une tranche. `signal` : Float32Array de 160 000 échantillons (16 kHz, mono) ;
 * `utiles` : nombre d'échantillons réels, le reste étant du remplissage.
 * Rend [CE, CU, PC, PQ].
 */
async function noterTranche(cheminModele, signal, utiles) {
  if (!(signal instanceof Float32Array) || signal.length !== ECHANTILLONS_TRANCHE) {
    throw new Error(`Tranche invalide : ${signal?.length} échantillons au lieu de ${ECHANTILLONS_TRANCHE}.`);
  }
  const n = Math.max(1, Math.min(ECHANTILLONS_TRANCHE, Math.round(utiles)));
  const masque = new Uint8Array(ECHANTILLONS_TRANCHE);
  masque.fill(1, 0, n);
  const session = await obtenirSession(cheminModele);
  const sorties = await session.run({
    wav: new ort.Tensor("float32", signal, [1, ECHANTILLONS_TRANCHE]),
    mask: new ort.Tensor("bool", masque, [1, ECHANTILLONS_TRANCHE]),
  });
  return Array.from(sorties.scores.data);
}

module.exports = { noterTranche, FICHIER_MODELE, ECHANTILLONS_TRANCHE };
