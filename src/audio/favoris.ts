// audio/favoris.ts — Les bibliothèques de sons proposées par la barre d'outils.
//
// POURQUOI CETTE LISTE A QUITTÉ `ui/BarreOutils.tsx`. Elle y était écrite en dur, et c'était du
// domaine du son logé dans le shell générique : lasonotheque, Sonniss, des chants d'oiseaux, une
// banque d'instruments échantillonnés. Un domaine « données tabulaires » branché sur le même cœur
// livrait donc un bouton proposant des chants d'oiseaux.
//
// COMMENT UN AUTRE DOMAINE S'EN SORT. `ui/favoris.ts` tient un registre vide par défaut, et c'est
// la racine de composition qui le remplit avec cette liste-ci. Un domaine qui n'en déclare aucune
// n'a pas de bouton : il disparaît de la barre, au lieu de s'ouvrir sur rien.
//
// CE QUE PORTE CHAQUE ENTRÉE. Une clé de traduction, `favs.<cle>` dans `i18n.tsx`, et l'adresse.
// Le libellé n'est pas écrit ici : ces noms s'affichent dans les deux langues du logiciel.

import type { Favori } from "../ui/favoris";

/** Les bibliothèques de sons, dans l'ordre où elles s'affichent. */
export const FAVORIS_SON: readonly Favori[] = [
  { cle: "sonotheque", url: "https://lasonotheque.org" },
  { cle: "pixabay", url: "https://pixabay.com/fr/sound-effects/" },
  { cle: "signature", url: "https://signaturesounds.org/" },
  { cle: "cc0sounds", url: "https://cc0-sounds.exi.software/" },
  { cle: "sonniss", url: "https://gdc.sonniss.com/" },
  { cle: "freesound", url: "https://freesound.org/" },
  { cle: "openlofi", url: "https://github.com/btahir/open-lofi" },
  { cle: "cresson", url: "https://aau.archi.fr/cresson/cressound-2025/la-boite-a-effets/" },
  { cle: "birdsounds", url: "https://www.bird-sounds.net/" },
  { cle: "cornell", url: "https://dl.allaboutbirds.org/backyardbirdsdownload-0" },
  { cle: "hawaii", url: "https://muted.io/birds-of-hawaii/" },
  { cle: "sounddino", url: "https://sounddino.com/en/effects/birdsong/" },
  { cle: "vcsl", url: "https://versilian-studios.com/vcsl/" },
  { cle: "philharmonia", url: "https://philharmonia.co.uk/resources/sound-samples/" },
  { cle: "mutedio", url: "https://muted.io/" },
  { cle: "chantcosmos", url: "https://lesia.obspm.fr/perso/philippe-zarka/Chants.html" },
  { cle: "sounddinoSea", url: "https://sounddino.com/en/effects/fish/" },
  { cle: "aquaplan", url: "https://aquaplan-project.eu/resources/outreach-activities/sound-recordings/" },
  { cle: "marineMammals", url: "https://huggingface.co/datasets/ardavey/marine_ocean_mammal_sound" },
];
