// src/workers/inference-onnx-worker.ts — Les inférences onnxruntime-web, hors du fil de l'interface.
//
// Le dialogue est dans `servir-par-demande`, le calcul dans `audio/inference-onnx.ts` : ce fichier
// ne fait que les joindre. « Débruitage IA » et le séparateur MDX-Net passent par ici.
import { traiterDemandeOnnx, type DemandeOnnx, type ResultatOnnx } from "../audio/inference-onnx";
import { servirParDemande } from "./servir-par-demande";

servirParDemande<DemandeOnnx, ResultatOnnx>(traiterDemandeOnnx);
