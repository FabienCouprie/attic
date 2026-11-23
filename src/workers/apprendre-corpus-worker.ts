// workers/apprendre-corpus-worker.ts — L'apprentissage d'un modèle harmonique, hors du fil.
//
// LE MÊME CALCUL QUE DANS LE FIL, `apprendreSurCorpus`, pur et déterministe : l'épreuve
// `tests-e2e/apprendre-corpus-dans-application.spec.ts` compare les deux modèles à l'octet.
import { apprendreSurCorpus, type DemandeApprentissage, type ResultatApprentissage } from "../audio/champ-apprentissage";
import { servirUneFois } from "./servir-par-lot";

servirUneFois<DemandeApprentissage, ResultatApprentissage>(apprendreSurCorpus);
