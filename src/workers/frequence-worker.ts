// src/workers/frequence-worker.ts — Un canal porté à la fréquence du projet, hors du fil de l'interface.
//
// Le dialogue est dans `servir-par-lot`, le calcul dans `audio/convertir-frequence.ts` : ce fichier
// ne fait que les joindre. Le moteur en lance un par canal, qui tournent donc de front.
//
// **Relevé avant, dans l'application : deux minutes de stéréo à 48 kHz portées à 44,1, treize
// secondes sans qu'un message passe.** Le passe-bas de 191 coefficients qui précède toute descente
// en est la cause, et c'est lui qui retire le repliement : on le déplace, on ne l'allège pas.
import { reechantillonnerCanal } from "../audio/convertir-frequence";
import { servirUneFois } from "./servir-par-lot";

servirUneFois<{ x: Float32Array; depart: number; arrivee: number }, Float32Array>(
  (o) => reechantillonnerCanal(o.x, o.depart, o.arrivee),
);
