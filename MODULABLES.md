# Effets à rendre modulables

Généré par `npm run docs:modulables`. Ne pas modifier à la main.

Le critère est relevé sur les composants qui acceptent déjà une courbe : ils pilotent tous une
grandeur continue et audible. Un réglage qui décide de la façon de calculer, taille de fenêtre,
nombre d'itérations, graine, n'entre pas ici. Les composants écartés le sont nommément, avec leur
raison, et la liste décroît d'elle-même à mesure que les entrées Modulation sont posées.

- **acceptent déjà une courbe** : 27
- **restent à faire** : 48 composants, 80 couples composant / famille
- **écartés** : 26

## Ce qui reste, par famille

### melange · 20

- Anneau de Möbius `anneau-moebius` : Mélange
- Beat Repeat / Stutter `beat-repeat` : Mix
- Chorus `chorus` : Mix
- Convolution de deux sons `convolution-deux-sons` : Mix
- Décaleur de fréquence `decaleur-frequence` : Mélange
- Delay stéréo `delay-stereo` : Mix
- Exciter / Aural enhancer `exciter` : Mix
- Flanger `flanger` : Mix
- Glissando intérieur `glissando-interieur` : Mix
- Granular freeze `granular-freeze` : Mix
- Octaver `octaver` : Mix
- Quadrafuzz `quadrafuzz` : Mix
- Réverbération fractale `reverb-fractale` : Mix
- Réverbération à convolution (IR) `reverbe-convolution` : Mix
- Réverbération hachée `reverbe-hachee` : Mix
- Réverbération à réseau (FDN) `reverbe-reseau` : Mix
- Réverbération velours `reverberation-velours` : Mélange
- Ring modulator `ring-modulator` : Mix
- Transfert d'enveloppe `transfert-enveloppe` : Mix
- Vocoder `vocoder` : Mix

### espace · 13

- Brassage `brassage` : Dispersion
- Chorus `chorus` : Profondeur
- De-esser `de-esser` : Largeur
- Doppler `doppler` : Distance
- Filtrage par un spectre `filtrage-spectre` : Profondeur
- Flanger `flanger` : Profondeur
- Granular freeze `granular-freeze` : Position
- Largeur stéréo / MS `largeur-stereo` : Largeur
- Particules `particules` : Dispersion, Position
- Resonance Audio `resonance-audio` : Largeur, Profondeur
- Réverbération à réseau (FDN) `reverbe-reseau` : Largeur
- Tore `tore` : Profondeur
- Tresse `tresse` : Largeur

### temps · 13

- Compresseur multibande `compresseur-multibande` : Attaque, Relâchement
- De-esser `de-esser` : Attaque, Relâchement
- Echo inversé `echo-inverse` : Temps
- Enveloppe ADSR `enveloppe-adsr` : Attaque, Maintien, Relâchement
- Gate/Expandeur `gate-expandeur` : Attaque, Relâchement
- Limiteur `limiteur` : Relâchement
- Pièce de Lucier `piece-lucier` : Decay
- Réverbération fractale `reverb-fractale` : Decay
- Réverbération à convolution (IR) `reverbe-convolution` : Decay
- Réverbération hachée `reverbe-hachee` : Décroissance, Maintien, Chute
- Réverbération à réseau (FDN) `reverbe-reseau` : Queue
- Réverbération velours `reverberation-velours` : Chute
- Transient Shaper `transient-shaper` : Attaque

### dynamique · 8

- De-esser `de-esser` : Seuil, Ratio
- Gate/Expandeur `gate-expandeur` : Seuil, Ratio
- Limiteur `limiteur` : Seuil, Plafond
- Montage par grains `montage-grains` : Seuil
- Réverbération hachée `reverbe-hachee` : Seuil
- Sinusoïdes + bruit (SMS) `sms-sinusoides-bruit` : Seuil
- Sinus + transitoires + bruit (STN) `stn-sinus-transitoires-bruit` : Seuil
- Suppression de clics `suppression-clics` : Seuil

### frequence · 8

- Ceinture de Dirac `ceinture-dirac` : Coupure
- De-esser `de-esser` : Fréquence
- Exciter / Aural enhancer `exciter` : Fréquence
- Grave en mono `mono-grave` : Coupure
- Particules `particules` : Fréquence
- Réduction de bruit `reduction-bruit` : Q
- Ring modulator `ring-modulator` : Fréquence
- Vocoder `vocoder` : Q

### hauteur · 6

- Brassage `brassage` : Transposition
- Granular freeze `granular-freeze` : Pitch
- Particules `particules` : Transposition
- Resonance Audio `resonance-audio` : Hauteur
- Shift formants `shift-formants` : Hauteur
- Sinusoïdes + bruit (SMS) `sms-sinusoides-bruit` : Transposition

### niveau · 6

- Déréverbération `dereverberation` : Réduction
- Distorsion `distorsion` : Gain
- Formule sur échantillons `formule-echantillons` : Volume
- Mosaïquage par corpus `mosaiquage` : Volume
- Particules `particules` : Volume
- Réduction de bruit `reduction-bruit` : Réduction

### retroaction · 6

- Beat Repeat / Stutter `beat-repeat` : Feedback
- Delay stéréo `delay-stereo` : Feedback
- Echo inversé `echo-inverse` : Feedback
- Pièce de Lucier `piece-lucier` : Damping
- Réverbération fractale `reverb-fractale` : Damping
- Réverbération à convolution (IR) `reverbe-convolution` : Damping

## Écartés, et pourquoi

- `normaliseur` : le niveau et le plafond visent le fichier entier ; les faire varier détruirait la normalisation
- `recaler-niveau` : le plafond vise le recalage entier, qui est une mesure globale
- `rogner-silences` : le seuil décide d'une découpe, pas d'un traitement au fil du son
- `auto-similarite` : le seuil règle l'affichage d'une analyse, non un traitement
- `boucle-graphe-fin-c` : le niveau appartient à la mécanique de boucle du graphe
- `fiche-technique` : les seuils règlent un rapport de mesure
- `csound` : le volume est passé à un interpréteur externe, qui ne lit pas une valeur par échantillon
- `csound-effet` : idem, interpréteur externe
- `csound-spectral` : idem, interpréteur externe
- `griffin-lim` : traitement par trames : une valeur par bloc, non par échantillon
- `phase-pghi` : traitement par trames : une valeur par bloc, non par échantillon
- `gel-spectral` : traitement par trames : une valeur par bloc, non par échantillon
- `flou-spectral` : traitement par trames : une valeur par bloc, non par échantillon
- `tracage-spectral` : traitement par trames : une valeur par bloc, non par échantillon
- `arpege-spectral` : traitement par trames : une valeur par bloc, non par échantillon
- `formule-spectrale` : traitement par trames : une valeur par bloc, non par échantillon
- `auto-pan-logistique` : composant logistique : reste tel qu'il est, il ne bouge pas
- `chopper-logistique` : composant logistique : reste tel qu'il est, il ne bouge pas
- `echo-logistique` : composant logistique : reste tel qu'il est, il ne bouge pas
- `melangeur-logistique` : composant logistique : reste tel qu'il est, il ne bouge pas
- `paulstretch-logistique` : composant logistique : reste tel qu'il est, il ne bouge pas
- `tremolo-logistique` : composant logistique : reste tel qu'il est, il ne bouge pas
- `vibrato-logistique` : composant logistique : reste tel qu'il est, il ne bouge pas
- `shimmer` : quatre réglages modulables à la fois : transposition, mélange, rebouclage, décroissance
- `compresseur` : trois réglages modulables à la fois : seuil et ratio, gain, attaque et relâchement
- `ducking` : trois réglages modulables à la fois : seuil, réduction, attaque et relâchement

## Acceptent déjà une courbe

- `ambisonique` : Rotation
- `ampleur` : Mix
- `amplificateur` : Gain
- `auto-pan` : Fréquence
- `bitcrusher` : Mix
- `chopper` : Fréquence
- `crible-harmonique` : Fondamentale
- `echo` : Temps
- `echo-ping-pong` : Temps
- `etirement-spectre` : Étirement
- `morphing-spectral` : Mélange
- `objet-sonore` : Azimut
- `partition-aleatoire-csound` : (non déclarée)
- `partition-csound` : (non déclarée)
- `peignes-accordes` : Fondamentale
- `phaser` : Fréquence
- `reponse-filtre` : Fréquence de coupure
- `resonateurs` : Fondamentale
- `retard-spectral` : Dispersion
- `reverberation` : Mix
- `spatialisation-stereo` : Position
- `spatialiseur` : Azimut
- `tremolo` : Profondeur
- `vibrato` : (non déclarée)
- `visualiseur-courbe` : (non déclarée)
- `vitesse-variable` : Transposition
- `wahwah` : (non déclarée)
