// audio/alias.ts — Les anciens identifiants de fiche du domaine audio, et celle que chacun ouvre.
//
// UN GRAPHE ENREGISTRÉ PORTE L'IDENTIFIANT QU'AVAIT SON NŒUD LE JOUR OÙ IL A ÉTÉ ÉCRIT. Un composant
// renommé, fusionné dans un autre ou retiré y garde donc son ancien nom, et cette table dit lequel
// l'ouvre aujourd'hui. Rien ne la réécrit au chargement : elle sert à chaque lecture, et ne se vide
// jamais. Le manifeste de compatibilité refuse qu'une entrée disparaisse sans être déclarée.
//
// ELLE EST DU DOMAINE, ET C'EST LE CONTRAT DE DÉPART. Elle vivait dans `core/registre.ts`, en constante
// du module : le cœur portait quatorze identifiants audio, et TOUT registre les résolvait, celui d'un
// autre domaine compris. Une fiche d'un autre domaine nommée `filtre` ou `boucle` y aurait été
// introuvable, `trouverDef` cherchant `reponse-filtre` ou `simple-boucle`. Relevé par la relecture de
// `PORTING-A-DOMAIN.md` (PR 403) ; Fabien a décidé le 2026-11-20 de la donner au registre. C'est
// `audio/adaptateur.ts` qui la lui remet, par `creerRegistre({ alias: ALIAS })`.
//
// EXPORTÉE POUR ÊTRE ÉNUMÉRÉE : le manifeste (`docs/compatibilite.ts`) dit pour chaque composant les
// identifiants qui l'ouvrent. `trouverDef` résout un alias, il ne sait pas les lister.

export const ALIAS: Readonly<Record<string, string>> = {
  "placer-son-zones": "placer-sons-zones",
  "dererverb": "dereverberation",
  "reverbe-progressive": "reverb-progressive",
  "melangeur-audio": "melangeur",
  "boite-a-rythmes": "boite-rythmes",
  "variateur-vitesse": "changement-tempo",
  "filtre": "reponse-filtre",
  "boucle": "simple-boucle",
  "fusionneur": "melangeur",
  "entree-micro": "enregistreur-audio",
  "reservoir-midi": "reservoir-musical",
  // « Fin de boucle » est devenue « Fin de boucle A » quand B et C sont arrivées. Son
  // identifiant n'a pas bougé — les graphes enregistrés le portent —, mais qui écrit un
  // graphe à la main attend le suffixe du nom.
  "boucle-graphe-fin-a": "boucle-graphe-fin",
  // « Séquenceur de batterie » était un sous-ensemble strict de « Séquenceur de batterie avancé » :
  // mêmes cinq pistes, dans le même ordre, sans la vélocité ni les trois pistes supplémentaires. Il
  // a été supprimé ; les graphes enregistrés qui le portent ouvrent donc le second, qui sait relire
  // leurs motifs binaires (voir `audio/batterie.ts`, `estMotifBinaire`).
  "sequenceur-batterie": "sequenceur-batterie-avance",
  // « Transcripteur MIDI » faisait le travail de « Transcription MIDI », un son rendu en notes MIDI,
  // et sa méthode polyphonique transcrivait mal, relevé par Fabien. Il a été supprimé le 2026-11-14 ;
  // les graphes enregistrés qui le portent ouvrent donc le second. L'entrée audio et la sortie MIDI
  // y sont au même rang, de sorte que les câbles tiennent. Ses réglages n'y ont pas d'équivalent et
  // ne sont plus lus : le second prend les siens par défaut.
  "transcripteur-midi": "transcription-midi",
};
