// audio/csound-formules-en.ts — Les commentaires des formules Csound, en anglais.
//
// Les formules écrivaient leurs commentaires en français, interface anglaise comprise : « ; Le même
// la, avec un indice de plus en plus fort… » partait tel quel dans l'orchestre et la partition.
// Décision de Fabien du 2026-11-22, « The interface language », revue des notations en texte : chaque
// commentaire suit maintenant la langue de l'interface.
//
// LA TABLE VA LIGNE POUR LIGNE, la ligne française pour clé, indentation et « ; » compris. Les
// formules gardent ainsi leur texte d'un seul tenant, et le garde de `plugins/points-ouverts.test.ts`
// tombe sur un commentaire neuf que cette table n'aurait pas.

export const COMMENTAIRES_EN: Readonly<Record<string, string>> = {
  // FM
  "  ; L'INDICE DÉCROÎT PENDANT LA NOTE : c'est ce qui fait la cloche de Chowning — beaucoup de":
    "  ; THE INDEX FALLS DURING THE NOTE: this is what makes Chowning's bell, many partials",
  "  ; partiels à l'attaque, un son presque pur à la fin.":
    "  ; at the attack, an almost pure sound at the end.",
  "; Le même la, avec un indice de plus en plus fort : le timbre s'enrichit sans changer de note.":
    "; The same A, with a stronger and stronger index: the timbre grows richer without changing pitch.",
  "; Puis un rapport non entier : la cloche, inharmonique.":
    "; Then a non-integer ratio: the bell, inharmonic.",
  // Soustractive
  "  ; Le filtre BALAIE de p6 à p7 fois la fréquence de la note : c'est le geste du synthétiseur":
    "  ; The filter SWEEPS from p6 to p7 times the note's frequency: the gesture of the analog",
  "  ; analogique, et la raison d'être de l'échelle de Moog.":
    "  ; synthesizer, and the reason for the Moog ladder.",
  "; Un balayage qui descend, puis un qui monte, puis le même très résonant.":
    "; A sweep going down, then one going up, then the same one very resonant.",
  // Additive
  "  ; `gbuzz` empile p6 harmoniques dont l'amplitude décroît d'un facteur p7 à chaque rang.":
    "  ; `gbuzz` stacks p6 harmonics whose amplitude falls by a factor p7 at each rank.",
  "  ; C'est la synthèse additive d'avant les ordinateurs rapides : une seule formule pour une":
    "  ; This is additive synthesis from before fast computers: a single formula for a",
  "  ; somme d'harmoniques.":
    "  ; sum of harmonics.",
  "; Le spectre se vide pendant la note : trente harmoniques au départ, un seul à la fin.":
    "; The spectrum empties during the note: thirty harmonics at the start, a single one at the end.",
  // Karplus-Strong
  "  ; Une ligne à retard remplie de bruit, moyennée à chaque tour : la corde s'éteint d'elle-même.":
    "  ; A delay line filled with noise, averaged at each pass: the string dies away by itself.",
  "  ; p6 choisit la méthode de lissage — 1 moyenne simple, 3 récursive, 6 mélange.":
    "  ; p6 picks the smoothing method: 1 simple average, 3 recursive, 6 blend.",
  "; Les trois méthodes sur la même note : la décroissance et le grain changent.":
    "; The three methods on the same note: the decay and the grain change.",
  // Anneau
  "  ; Deux sinus multipliés : il ne reste que la somme et la différence de leurs fréquences.":
    "  ; Two sines multiplied: only the sum and the difference of their frequencies remain.",
  "  ; Avec p6 non entier, plus aucun harmonique n'est en rapport simple — le son de cloche fêlée.":
    "  ; With a non-integer p6, no harmonic is in a simple ratio any more: the cracked bell sound.",
  "; Rapport entier, puis quinte, puis irrationnel : le dernier n'a plus de fondamentale.":
    "; Integer ratio, then a fifth, then irrational: the last one has no fundamental left.",
  // Granulaire
  "  ; Des centaines de grains par seconde, chacun d'une durée de p7, dispersés en hauteur de p8.":
    "  ; Hundreds of grains per second, each lasting p7, scattered in pitch by p8.",
  "  ; La densité est en p6 : au-delà de quelques dizaines, les grains fusionnent en une texture.":
    "  ; The density is in p6: beyond a few dozen, the grains merge into a texture.",
  "; Le même nuage de plus en plus dense : on passe d'un pointillé à une texture continue.":
    "; The same cloud, denser and denser: from a stipple to a continuous texture.",
  "; L'AMPLITUDE BAISSE QUAND LA DENSITÉ MONTE, en raison inverse de sa racine : des grains qui":
    "; THE AMPLITUDE FALLS AS THE DENSITY RISES, inversely to its square root: overlapping grains",
  "; se recouvrent s'additionnent, et à quatre cents par seconde l'amplitude 0,4 saturait — crête":
    "; add up, and at four hundred per second an amplitude of 0.4 saturated, with a peak",
  "; mesurée à 0,95, c'est-à-dire le limiteur.":
    "; measured at 0.95, that is, the limiter.",
  // Bus et réverbération
  "; LE BUS : une variable globale audio, que les instruments alimentent et que la réverbération":
    "; THE BUS: a global audio variable that the instruments feed and the reverb",
  "; lit. C'est la structure qu'un orchestre à un seul instrument ne peut pas montrer, et celle de":
    "; reads. This is the structure a one-instrument orchestra cannot show, and that of",
  "; presque toutes les pièces sérieuses.":
    "; almost every serious piece.",
  "  ; p6 décide de la part envoyée à la réverbération : 0 sec, 1 noyé.":
    "  ; p6 decides the share sent to the reverb: 0 dry, 1 drowned.",
  "  ; La réverbération tourne pendant TOUTE la pièce : elle est lancée par la partition, et sa":
    "  ; The reverb runs for the WHOLE piece: the score launches it and writes its",
  "  ; durée y est écrite. Sans elle, les queues seraient coupées net.":
    "  ; duration. Without it, the tails would be cut short.",
  "; La réverbération d'abord, sur toute la durée — sans cette ligne, on n'entend rien d'elle.":
    "; The reverb first, over the whole duration: without this line, nothing of it is heard.",
  "; Puis des notes de plus en plus noyées.":
    "; Then notes more and more drowned.",
};
