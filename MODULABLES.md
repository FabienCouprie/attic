# Effets à rendre modulables

Généré par `npm run docs:modulables`. Ne pas modifier à la main.

Le critère est relevé sur les composants qui acceptent déjà une courbe : ils pilotent tous une
grandeur continue et audible. Un réglage qui décide de la façon de calculer, taille de fenêtre,
nombre d'itérations, graine, n'entre pas ici. Les composants écartés le sont nommément, avec leur
raison, et la liste décroît d'elle-même à mesure que les entrées Modulation sont posées.

Un composant marqué **⟨trames⟩** a un cœur qui travaille par blocs : une courbe n'y serait lue
qu'une fois par trame, non par échantillon. La marque est relevée sur la source par
`coeurs-par-trames.ts` ; elle n'écarte rien d'elle-même, elle dit de regarder avant de proposer.

- **acceptent déjà une courbe** : 44
- **restent à faire** : 14 composants, 30 couples composant / famille
- **dont le cœur travaille par trames** : 2
- **écartés** : 47, dont 1 famille de la palette écartée en bloc

## Ce qui reste, par famille

### melange · 7

- Beat Repeat / Stutter `beat-repeat` : Mix
- Granular freeze `granular-freeze` : Mix
- Réverbération hachée `reverbe-hachee` : Mix
- Réverbération à réseau (FDN) `reverbe-reseau` : Mix
- Réverbération velours `reverberation-velours` : Mélange
- Ring modulator `ring-modulator` : Mix
- Vocoder `vocoder` : Mix

### temps · 7

- Echo inversé `echo-inverse` : Temps
- Enveloppe ADSR `enveloppe-adsr` : Attaque, Maintien, Relâchement
- Gate/Expandeur `gate-expandeur` : Attaque, Relâchement
- Limiteur `limiteur` : Relâchement
- Réverbération hachée `reverbe-hachee` : Décroissance, Maintien, Chute
- Réverbération à réseau (FDN) `reverbe-reseau` : Queue
- Réverbération velours `reverberation-velours` : Chute

### dynamique · 4

- Gate/Expandeur `gate-expandeur` : Seuil, Ratio
- Limiteur `limiteur` : Seuil, Plafond
- Réverbération hachée `reverbe-hachee` : Seuil
- Sinusoïdes + bruit (SMS) `sms-sinusoides-bruit` : Seuil · **⟨trames⟩** traiterVoie (appelle analyserSms)

### espace · 3

- Brassage `brassage` : Dispersion
- Granular freeze `granular-freeze` : Position
- Réverbération à réseau (FDN) `reverbe-reseau` : Largeur

### frequence · 3

- Réduction de bruit `reduction-bruit` : Q · **⟨trames⟩** reduireBruit (boucle de trames), reduireBruitNotches (TAILLE_FFT)
- Ring modulator `ring-modulator` : Fréquence
- Vocoder `vocoder` : Q

### hauteur · 3

- Brassage `brassage` : Transposition
- Granular freeze `granular-freeze` : Pitch
- Sinusoïdes + bruit (SMS) `sms-sinusoides-bruit` : Transposition · **⟨trames⟩** traiterVoie (appelle analyserSms)

### retroaction · 2

- Beat Repeat / Stutter `beat-repeat` : Feedback
- Echo inversé `echo-inverse` : Feedback

### niveau · 1

- Réduction de bruit `reduction-bruit` : Réduction · **⟨trames⟩** reduireBruit (boucle de trames), reduireBruitNotches (TAILLE_FFT)

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
- `stn-sinus-transitoires-bruit` : traitement par trames : une valeur par bloc, non par échantillon
- `dereverberation` : traitement par trames : la réduction est lue une fois par bloc de FFT, non par échantillon
- `shift-formants` : traitement par trames : l'enveloppe est estimée par bloc, non par échantillon
- `filtrage-spectre` : traitement par trames : la profondeur est appliquée par trame d'analyse, non par échantillon
- `auto-pan-logistique` : composant logistique : reste tel qu'il est, il ne bouge pas
- `chopper-logistique` : composant logistique : reste tel qu'il est, il ne bouge pas
- `echo-logistique` : composant logistique : reste tel qu'il est, il ne bouge pas
- `melangeur-logistique` : composant logistique : reste tel qu'il est, il ne bouge pas
- `paulstretch-logistique` : composant logistique : reste tel qu'il est, il ne bouge pas
- `tremolo-logistique` : composant logistique : reste tel qu'il est, il ne bouge pas
- `vibrato-logistique` : composant logistique : reste tel qu'il est, il ne bouge pas
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
- `auto-pan` : Fréquence
- `bitcrusher` : Mix
- `chopper` : Fréquence
- `chorus` : Mix
- `convolution-deux-sons` : Mix
- `crible-harmonique` : Fondamentale
- `de-esser` : Seuil
- `decaleur-frequence` : Mélange
- `delay-stereo` : Mix
- `echo` : Temps
- `echo-ping-pong` : Temps
- `etirement-spectre` : Étirement
- `exciter` : Mix
- `flanger` : Mix
- `formule-echantillons` : Volume
- `glissando-interieur` : Mix
- `largeur-stereo` : Largeur
- `morphing-spectral` : Mélange
- `mosaiquage` : Volume
- `objet-sonore` : Azimut
- `octaver` : Mix
- `partition-aleatoire-csound` : (non déclarée)
- `partition-csound` : (non déclarée)
- `peignes-accordes` : Fondamentale
- `phaser` : Fréquence
- `profil-melodique` : (non déclarée)
- `quadrafuzz` : Mix
- `reponse-filtre` : Fréquence de coupure
- `resonateurs` : Fondamentale
- `retard-spectral` : Dispersion
- `reverberation` : Mix
- `spatialisation-stereo` : Position
- `spatialiseur` : Azimut
- `suppression-clics` : Seuil
- `transfert-enveloppe` : Mix
- `transient-shaper` : Attaque
- `tremolo` : Profondeur
- `vibrato` : (non déclarée)
- `visualiseur-courbe` : (non déclarée)
- `vitesse-variable` : Transposition
- `wahwah` : (non déclarée)
