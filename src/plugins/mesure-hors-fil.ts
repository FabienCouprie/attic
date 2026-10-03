// plugins/mesure-hors-fil.ts — La mesure complète d'un son, calculée hors du fil de l'interface.
//
// POURQUOI CE PETIT MODULE. Deux composants mesurent un son par la MÊME fonction, et c'est tout
// l'enjeu de la fiche technique : elle existe pour que l'élève retrouve les chiffres sur lesquels
// une épreuve du parcours le juge. Deux appels au socle écrits deux fois auraient fini par diverger,
// et c'est exactement ce que les deux notices promettent qui ne peut pas arriver.
//
// TOUT LE COÛT EST DANS LE SUIVI DE HAUTEUR, et le profil l'a tranché : sur trois secondes de son,
// le suivi pYIN prend 330 millisecondes et les onze autres mesures en prennent onze. C'est donc le
// suivi SEUL qui part dans un ouvrier, et le reste se calcule dans le fil, où il ne se voit pas.
//
// L'OUVRIER EST CELUI DU SUIVEUR DE HAUTEUR, non un second : la fiche promet de ne pas pouvoir
// contredire le nœud « Suiveur de hauteur », et deux chemins de calcul finiraient par diverger.
// `conclureHauteur` est pareillement celle qu'emploient les épreuves.
//
// **RELEVÉ AVANT, sur trois secondes de son et sans qu'un seul message passe : 354 millisecondes
// pour la fiche technique, 376 pour le parcours.**

import { suivreVoie, type OptionsVoieHauteur, type SuiviHauteur } from "../audio/hauteur";
import { conclureHauteur, mesurerCopie, voieAHauteur, type MesureCopie } from "../parcours/mesures";
import { parCanal } from "./hors-fil";

/**
 * Tout ce qu'on sait d'un son, le suivi de hauteur calculé dans un ouvrier quand on en a un.
 *
 * `avecHauteur` à faux saute le suivi : les champs de hauteur sont alors vides, non calculés à
 * blanc, et aucun ouvrier n'est démarré.
 */
export async function mesurerCopieHorsFil(
  audio: AudioBuffer, avecHauteur = true,
): Promise<MesureCopie> {
  const brute = mesurerCopie(audio, { hauteur: false });
  if (!avecHauteur) return brute;
  const voie = voieAHauteur(audio);
  // Un son plus court qu'un vingtième de seconde n'a pas de hauteur à chercher : démarrer un
  // ouvrier pour le lui demander coûterait plus que la réponse.
  if (!voie) return brute;
  // UNE SEULE VOIE, comme pour le suiveur : une hauteur est une propriété de la note jouée.
  const [suivi] = await parCanal<OptionsVoieHauteur, SuiviHauteur>(
    [voie],
    { sampleRate: audio.sampleRate },
    {
      creerWorker: () => new Worker(new URL("../workers/hauteur-worker.ts", import.meta.url), { type: "module" }),
      calcul: suivreVoie,
    },
  );
  return { ...brute, ...conclureHauteur(suivi) };
}
