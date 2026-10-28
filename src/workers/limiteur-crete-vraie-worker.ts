// src/workers/limiteur-crete-vraie-worker.ts — Le limiteur à crête vraie, hors du fil de l'interface.
//
// Le dialogue est dans `servir-par-lot`, le calcul dans `audio/limiteur-crete-vraie.ts` : ce fichier
// ne fait que les joindre.
//
// **Relevé avant, sur le banc : 65 à 102 ms pour trois secondes de stéréo, sans qu'un seul message
// passe ; 1,3 s pour un morceau de 214 s.** Le gel était total : ni la progression ni « Arrêter »
// n'étaient atteignables pendant ce temps.
//
// **Après, sur le même banc : 13 ms de gel et 1 993 messages passés pendant les 116 ms du calcul, et
// une empreinte identique à neuf décimales à celle du calcul dans le fil.** La surveillance passe bien
// par ici : un canal multiplié par 1,001 dans ce seul fichier a fait rougir la base d'empreintes,
// les tests unitaires, qui calculent dans le fil, restant verts.
//
// UNE SEULE TÂCHE ET NON UNE PAR CANAL : le limiteur applique UN gain à tous les canaux, tiré de la
// plus haute crête de tous. Calculés séparément, les deux côtés d'une stéréo recevraient deux gains
// différents, et l'image se déplacerait à chaque crête d'un seul côté.
import { limiterDemande, type DemandeLimiteur, type ResultatLimiteur } from "../audio/limiteur-crete-vraie";
import { servirUneFois } from "./servir-par-lot";

servirUneFois<DemandeLimiteur, ResultatLimiteur>(limiterDemande);
