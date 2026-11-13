// plugins/index.ts — Les fiches de tous les plugins du domaine audio, dans l'ordre du catalogue.
// L'adaptateur (audio/adaptateur.ts) importe ces fiches et les enregistre dans
// le registre. Aucun side-effect à l'import — les modules ne font qu'exporter.
//
// ELLES ARRIVENT PAR HUIT CATÉGORIES, rangées dans `categories/`. Ce fichier était un baril de deux
// cent cinquante-cinq imports, en dette de taille ; chaque catégorie en porte maintenant une tranche,
// et ce fichier n'écrit plus que l'ordre des huit.
//
// UNE CATÉGORIE EST UNE TRANCHE CONTIGUË DE L'ORDRE DU CATALOGUE, ET NON UN UNIVERS. Dix-sept
// fichiers de plugins portent des fiches de plusieurs univers (`analyse`, `sorties`, `tonal`…) :
// couper par univers aurait changé l'ordre du registre ou demandé de couper ces fichiers. Le nom
// d'une catégorie dit ce qui y domine ; l'ordre étant historique, chacune a des voisins inattendus.
//
// DEUX GARDES TIENNENT LA COUTURE : `ordre-du-catalogue.test.ts`, les mêmes fiches dans le même
// ordre que la référence, et `categories-du-catalogue.test.ts`, aucun fichier de fiches oublié ni
// repris deux fois. Un composant neuf s'ajoute à la catégorie qui lui convient, puis
// `npm run docs:components` réécrit la référence.
import type { FicheAudio } from "../audio/types-domaine";

import { fiches as entreesEffetsSorties } from "./categories/entrees-effets-sorties";
import { fiches as generateurs } from "./categories/generateurs";
import { fiches as montageEtSpectral } from "./categories/montage-et-spectral";
import { fiches as sequencesEtCercles } from "./categories/sequences-et-cercles";
import { fiches as electroacoustique } from "./categories/electroacoustique";
import { fiches as voixEtTexte } from "./categories/voix-et-texte";
import { fiches as notationEtMoteurs } from "./categories/notation-et-moteurs";
import { fiches as imageEtCompositeurs } from "./categories/image-et-compositeurs";
import { rangerParStyle } from "./familles-palette";
import { avecSortieAudio } from "./sortie-audio";

export const toutesLesFiches: FicheAudio[] = [
  ...entreesEffetsSorties,
  ...generateurs,
  ...montageEtSpectral,
  ...sequencesEtCercles,
  ...electroacoustique,
  ...voixEtTexte,
  ...notationEtMoteurs,
  ...imageEtCompositeurs,
// TOUT COMPOSANT QUI REND UNE SÉQUENCE REÇOIT UNE SORTIE AUDIO, posée ici plutôt que dans
// vingt-cinq fiches. Voir `sortie-audio.ts` pour ce que cela suppose et ce que cela coûte.
].map(rangerParStyle).map(avecSortieAudio);
