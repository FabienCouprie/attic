// src/workers/correction-pleurage-worker.ts — La correction du pleurage, hors du fil de l'interface.
//
// Le dialogue est dans `servir-par-lot`, le calcul dans `audio/correction-pleurage.ts` : ce fichier
// ne fait que les joindre.
//
// UNE SEULE TÂCHE ET NON UNE PAR CANAL : l'horloge se retrouve sur tous les canaux ensemble, et
// s'applique à tous. Calculés séparément, deux canaux recevraient deux horloges.
//
// **Relevé sur le banc : 122 ms pour trois secondes de stéréo, 15 ms de gel et 323 messages passés
// pendant le calcul.** La surveillance passe bien par ici : un canal multiplié par 1,001 dans ce
// seul fichier a fait rougir la base d'empreintes, les tests unitaires, qui calculent dans le fil,
// restant verts.
import { corrigerPleurage, type DemandePleurage, type ResultatPleurage } from "../audio/correction-pleurage";
import { servirUneFois } from "./servir-par-lot";

servirUneFois<DemandePleurage, ResultatPleurage>(corrigerPleurage);
