// ui/soundfont-cache.ts — Quand un SoundFont qui arrive doit vider le cache d'exécution, et quand non.
//
// LE DÉFAUT QUE CETTE RÈGLE FERME, relevé le 2026-11-02 en écrivant le cas d'emboîtement d'une
// boucle dans un lot. Le SoundFont global se charge seul au démarrage et aboutit quelques secondes
// après l'ouverture ; à son arrivée, le crochet vidait TOUT le cache d'exécution, sans regarder si
// une exécution tournait ni si l'instrument avait changé. Tombé au milieu d'un lot de deux fichiers,
// le vidage faisait rejouer la chaîne audio à la passe suivante : trois écritures pour deux fichiers,
// mesuré trois fois sur trois. Et sous StrictMode l'effet part deux fois, la seconde rendant aussitôt
// l'instrument déjà chargé : le cache était vidé une seconde fois sans que rien ait changé.
//
// LA RÈGLE TIENT EN DEUX QUESTIONS, et c'est pour qu'un test les pose qu'elle est ici, hors de React.
// L'instrument a-t-il changé ? Sinon, rien à vider : trente-quatre modules lisent le SoundFont, et un
// résultat calculé avec le même instrument reste juste. Une exécution tourne-t-elle ? Alors le
// vidage attend sa fin : vider en plein run fait rejouer la passe suivante, ce qui est le défaut
// même. Le résultat d'une passe commencée avec l'ancien instrument reste en cache jusqu'au prochain
// changement : c'est le prix consenti, et il n'est payé que par qui lance avant la fin du chargement.

export type DecisionDeVidage = "maintenant" | "a-la-fin-du-run" | "non";

export function decisionDeVidage(
  { nomAvant, nomApres, enExecution }: { nomAvant: string; nomApres: string; enExecution: boolean },
): DecisionDeVidage {
  if (nomApres === nomAvant) return "non";
  return enExecution ? "a-la-fin-du-run" : "maintenant";
}
