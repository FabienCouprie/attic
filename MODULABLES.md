# Effets à rendre modulables

Généré par `npm run docs:modulables`. Ne pas modifier à la main.

Le critère est relevé sur les réglages qui pilotent une grandeur continue et audible. Un réglage
qui décide de la façon de calculer, taille de fenêtre, nombre d'itérations, graine, n'entre pas
ici. Les composants écartés le sont nommément, avec leur raison.

**CE RECENSEMENT SE FAIT PAR RÉGLAGE, ET NON PAR COMPOSANT.** Il écartait un composant dès qu'il
portait UN SEUL port de courbe : ses autres réglages quittaient la liste sans avoir été ouverts,
et l'écart grandissait à chaque lot. Au moment du changement, la liste par composant était vide
et trente composants gardaient pourtant cinquante-trois réglages non ouverts, dont cinq dans une
famille déclarée finie. Un réglage sort donc de la liste quand il est PILOTÉ, non quand son
voisin l'est.

ET UN PORT DE COURBE N'EST PAS TOUJOURS UN PORT DE MODULATION. Ce qui le dit est le champ
`module`, qui nomme le réglage piloté : un port qui n'en déclare aucun reçoit une courbe comme
MATIÈRE, non comme pilotage, et ne compte donc pas ici.

Un composant marqué **⟨trames⟩** a un cœur qui travaille par blocs : une courbe n'y serait lue
qu'une fois par trame, non par échantillon. La marque est relevée sur la source par
`coeurs-par-trames.ts` ; elle n'écarte rien d'elle-même, elle dit de regarder avant de proposer.

- **réglages déjà pilotés par une courbe** : 73, sur 60 composants
- **réglages restant à faire** : 53, sur 30 composants et 46 couples composant / famille
- **dont le cœur travaille par trames** : 0
- **composants écartés** : 54, dont 1 famille de la palette écartée en bloc

## Ce qui reste, par famille

### espace · 15

- Rotation ambisonique `ambisonique` : Ouverture
- Arc-en-ciel acoustique `arc-en-ciel-acoustique` : Ouverture, Dispersion
- Chorus `chorus` : Profondeur
- De-esser `de-esser` : Largeur
- Écho flottant `echo-flottant` : Distance
- Flanger `flanger` : Profondeur
- Granular freeze `granular-freeze` : Position
- Haut-parleur rotatif `haut-parleur-rotatif` : Largeur
- Micromontage `micromontage` : Panoramique
- Oscillateur à table d'onde `oscillateur-table-onde` : Position
- Phaser `phaser` : Profondeur
- Réverbération à réseau (FDN) `reverbe-reseau` : Largeur
- Spatialisation stéréo `spatialisation-stereo` : Largeur
- Trémolo harmonique `tremolo-harmonique` : Profondeur
- Wah-wah `wahwah` : Profondeur

### frequence · 11

- Bitcrusher `bitcrusher` : Fréquence
- De-esser `de-esser` : Fréquence
- Exciter / Aural enhancer `exciter` : Fréquence
- Haut-parleur rotatif `haut-parleur-rotatif` : Coupure
- Oscillateur à table d'onde `oscillateur-table-onde` : Fréquence
- Peignes accordés `peignes-accordes` : Résonance
- Résonateurs `resonateurs` : Résonance, Brillance
- Ring modulator `ring-modulator` : Fréquence
- Trémolo harmonique `tremolo-harmonique` : Coupure
- Vocoder `vocoder` : Q
- Wah-wah `wahwah` : Résonance

### temps · 7

- Ampleur `ampleur` : Pré-délai
- De-esser `de-esser` : Attaque, Relâchement
- Écho flottant `echo-flottant` : Décroissance
- Réverbération hachée `reverbe-hachee` : Décroissance, Maintien, Chute
- Réverbération à réseau (FDN) `reverbe-reseau` : Queue
- Réverbération `reverberation` : Decay
- Réverbération velours `reverberation-velours` : Chute

### melange · 5

- Peignes accordés `peignes-accordes` : Mix
- Phaser `phaser` : Mix
- Résonateurs `resonateurs` : Mix
- Retard spectral `retard-spectral` : Mix
- Wah-wah `wahwah` : Mix

### dynamique · 4

- De-esser `de-esser` : Ratio
- Gate/Expandeur `gate-expandeur` : Seuil, Ratio
- Limiteur `limiteur` : Seuil, Plafond
- Réverbération hachée `reverbe-hachee` : Seuil

### retroaction · 2

- Beat Repeat / Stutter `beat-repeat` : Feedback
- Delay stéréo `delay-stereo` : Feedback

### hauteur · 1

- Granular freeze `granular-freeze` : Pitch

### niveau · 1

- Micromontage `micromontage` : Niveau

## Familles écartées en bloc

- **Topologie** : la famille entière est écartée : le son y est promené sur une surface refermée sur elle-même, dont la géométrie est le sujet du nœud et non un réglage à faire varier
  - `anneau-moebius`, `bouteille-klein`, `tore`, `ceinture-dirac`, `tresse`, `tonnetz`, `spirale-spatiale`

## Écartés nommément, et pourquoi

- `normaliseur` : le niveau et le plafond visent le fichier entier ; les faire varier détruirait la normalisation
- `recaler-niveau` : le plafond vise le recalage entier, qui est une mesure globale
- `rogner-silences` : le seuil décide d'une découpe, pas d'un traitement au fil du son
- `montage-grains` : le seuil décide où les grains sont coupés, donc d'une découpe et non d'un traitement au fil du son
- `auto-similarite` : le seuil règle l'affichage d'une analyse, non un traitement
- `boucle-graphe-fin-c` : le niveau appartient à la mécanique de boucle du graphe
- `fiche-technique` : les seuils règlent un rapport de mesure
- `csound` : le volume est passé à un interpréteur externe, qui ne lit pas une valeur par échantillon
- `csound-effet` : idem, interpréteur externe
- `csound-spectral` : idem, interpréteur externe
- `particules` : les réglages partent dans une partition Csound, qui ne lit pas une valeur par échantillon
- `griffin-lim` : traitement par trames : une valeur par bloc, non par échantillon
- `phase-pghi` : traitement par trames : une valeur par bloc, non par échantillon
- `gel-spectral` : traitement par trames : une valeur par bloc, non par échantillon
- `flou-spectral` : traitement par trames : une valeur par bloc, non par échantillon
- `tracage-spectral` : traitement par trames : une valeur par bloc, non par échantillon
- `arpege-spectral` : traitement par trames : une valeur par bloc, non par échantillon
- `formule-spectrale` : traitement par trames : une valeur par bloc, non par échantillon
- `reduction-bruit` : traitement par trames de 8192 échantillons par sauts de 4096 : une courbe n'y serait lue que onze fois par seconde, soit par paliers de 93 ms
- `echo-inverse` : le cœur somme des copies décalées du son entier, et « Temps » comme « Feedback » fixent les décalages et la longueur de sortie avant qu'un échantillon soit écrit
- `enveloppe-adsr` : ses durées sont les cinq points d'ancrage d'une enveloppe en un coup, calculés avant qu'elle soit tracée ; et son « Maintien » est un niveau, non une durée
- `haas` : déplacer la position de lecture transposerait le canal retardé, alors que l'effet tient à ce que l'oreille fusionne un décalage FIXE
- `brassage` : ses deux réglages sont lus une fois par segment, à la cadence de « Densité » : 40 par seconde au défaut, soit par paliers de 25 ms
- `visualiseur-courbe` : il DESSINE une courbe au lieu d'en être piloté ; « Largeur » et « Hauteur » sont les dimensions de son image, non des grandeurs du son
- `profil-melodique` : la courbe est sa matière : il en tire un profil de hauteurs, il n'en est pas piloté
- `evolution-melodie` : la courbe est sa matière : elle décrit l'évolution demandée, elle ne pilote aucun réglage
- `matrice-parametres` : la courbe est sa matière : elle alimente la matrice, elle ne pilote aucun réglage
- `partition-csound` : la courbe est sa matière : elle devient une partition, elle ne pilote aucun réglage
- `partition-aleatoire-csound` : la courbe est sa matière : elle devient une partition, elle ne pilote aucun réglage
- `parole-vers-sequence` : sa transposition s'applique une fois par MOT, sur un numéro de note MIDI arrondi : quelques valeurs par seconde, et elle n'a de sens qu'au moment où une note se pose
- `sms-sinusoides-bruit` : une transposition nulle DÉCOUPE les partiels dans le son, une transposition non nulle les REFABRIQUE par addition : à 0,001 demi-ton, le rendu s'écarte déjà de celui à zéro de 113 % de sa valeur efficace, et son « Seuil » décide quels partiels sont suivis, par trames
- `stn-sinus-transitoires-bruit` : traitement par trames : une valeur par bloc, non par échantillon
- `dereverberation` : traitement par trames : la réduction est lue une fois par bloc de FFT, non par échantillon
- `shift-formants` : traitement par trames : l'enveloppe est estimée par bloc, non par échantillon
- `filtrage-spectre` : traitement par trames : la profondeur est appliquée par trame d'analyse, non par échantillon
- `melangeur-logistique` : composant logistique : reste tel qu'il est, il ne bouge pas
- `distorsion` : le gain de saturation est la table d'un distordeur, non un réglage automatisable
- `reverb-fractale` : le decay décide de la longueur d'une réponse impulsionnelle, reconstruite à chaque valeur
- `reverbe-convolution` : le decay décide de la longueur d'une réponse impulsionnelle, reconstruite à chaque valeur
- `piece-lucier` : le decay et le damping fabriquent la réponse impulsionnelle, une fois, avant les passages
- `resonance-audio` : la largeur, la hauteur et la profondeur sont les dimensions de la pièce ; la position de la source passe par une méthode du SDK, non par un AudioParam
- `doppler` : la distance est la géométrie du passage, dont toute la trajectoire se déduit, et non une valeur lue à chaque instant
- `mono-grave` : la coupure fixe les coefficients de quatre biquads et sert aussi à la mesure que le nœud rapporte
- `shimmer` : quatre réglages modulables à la fois : transposition, mélange, rebouclage, décroissance
- `compresseur` : trois réglages modulables à la fois : seuil et ratio, gain, attaque et relâchement
- `ducking` : trois réglages modulables à la fois : seuil, réduction, attaque et relâchement
- `compresseur-multibande` : trois seuils et une paire attaque / relâchement : aucune cible unique à piloter

## Acceptent déjà une courbe

- `ambisonique` : Rotation
- `ampleur` : Mix
- `amplificateur` : Gain
- `arc-en-ciel-acoustique` : Mix
- `auto-pan` : Fréquence
- `auto-pan` : Profondeur
- `beat-repeat` : Mix
- `bitcrusher` : Mix
- `chopper` : Fréquence
- `chopper` : Profondeur
- `chorus` : Mix
- `convolution-deux-sons` : Mix
- `creneau` : Niveau
- `crible-harmonique` : Fondamentale
- `de-esser` : Seuil
- `decaleur-frequence` : Mélange
- `delay-stereo` : Mix
- `doser-effet` : Dose
- `echo` : Feedback
- `echo` : Temps
- `echo-flottant` : Mélange
- `echo-ping-pong` : Feedback
- `echo-ping-pong` : Temps
- `etirement-spectre` : Étirement
- `exciter` : Mix
- `flanger` : Mix
- `formule-echantillons` : Volume
- `gate-expandeur` : Attaque
- `gate-expandeur` : Relâchement
- `glissando-interieur` : Mix
- `granular-freeze` : Mix
- `haut-parleur-rotatif` : Mélange
- `largeur-stereo` : Largeur
- `limiteur` : Relâchement
- `micromontage` : Transposition
- `morphing-spectral` : Mélange
- `mosaiquage` : Volume
- `objet-sonore` : Azimut
- `objet-sonore` : Distance
- `objet-sonore` : Élévation
- `octaver` : Mix
- `oscillateur-table-onde` : Volume
- `paulstretch` : Stretch
- `peignes-accordes` : Fondamentale
- `phaser` : Fréquence
- `quadrafuzz` : Mix
- `reponse-filtre` : Fréquence de coupure
- `reponse-filtre` : Résonance
- `resonateurs` : Fondamentale
- `retard-spectral` : Dispersion
- `reverbe-hachee` : Mix
- `reverbe-reseau` : Mix
- `reverberation` : Mix
- `reverberation-velours` : Mélange
- `ring-modulator` : Mix
- `spatialisation-stereo` : Position
- `spatialiseur` : Azimut
- `spatialiseur` : Distance
- `spatialiseur` : Élévation
- `suppression-clics` : Seuil
- `transfert-enveloppe` : Mix
- `transient-shaper` : Attaque
- `tremolo` : Fréquence
- `tremolo` : Profondeur
- `tremolo-harmonique` : Mélange
- `ubiquite` : Dispersion
- `vague` : Ouverture
- `vague` : Profondeur
- `vibrato` : Fréquence
- `vibrato` : Profondeur
- `vitesse-variable` : Transposition
- `vocoder` : Mix
- `wahwah` : Fréquence
