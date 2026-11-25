// workers/ecart-reference-worker.ts — La description d'un son pour « Écart à une référence », hors du fil.
//
// UN OUVRIER PAR SON, les deux de front : le composant en démarre un pour l'audio et un pour la
// référence. Le même calcul que dans le fil, `decrireSon`, pur et déterministe : l'épreuve
// `tests-e2e/ecart-reference-dans-application.spec.ts` compare les deux rapports à l'octet.
//
// **Relevé avant, dans le fil : 2,2 s pour décrire 133 s de stéréo à 44,1 kHz, 2,1 s pour 112 s à
// 48 kHz, les trois transformées de Fourier en prenant 1,5.**
import { decrireDemande, type DemandeDescription, type DescriptionSon } from "../audio/ecart-reference-mesures";
import { servirUneFois } from "./servir-par-lot";

servirUneFois<DemandeDescription, DescriptionSon>(decrireDemande);
