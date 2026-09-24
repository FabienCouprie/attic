# Effets à rendre modulables

Généré par `npm run docs:modulables`. Ne pas modifier à la main.

Le critère est relevé sur les composants qui acceptent déjà une courbe : ils pilotent tous une
grandeur continue et audible. Un réglage qui décide de la façon de calculer, taille de fenêtre,
nombre d'itérations, graine, n'entre pas ici. Les composants écartés le sont nommément, avec leur
raison, et la liste décroît d'elle-même à mesure que les entrées Modulation sont posées.

- **acceptent déjà une courbe** : 26
- **restent à faire** : 66 composants, 115 couples composant / famille
- **écartés** : 9

## Ce qui reste, par famille

### melange · 33

- Anneau de Möbius `anneau-moebius` : Mélange
- Auto-pan logistique `auto-pan-logistique` : Mix
- Beat Repeat / Stutter `beat-repeat` : Mix
- Chopper logistique `chopper-logistique` : Mix
- Chorus `chorus` : Mix
- Convolution de deux sons `convolution-deux-sons` : Mix
- Décaleur de fréquence `decaleur-frequence` : Mélange
- Delay stéréo `delay-stereo` : Mix
- Écho logistique `echo-logistique` : Mix
- Exciter / Aural enhancer `exciter` : Mix
- Flanger `flanger` : Mix
- Flou spectral `flou-spectral` : Mix
- Gel spectral `gel-spectral` : Mix
- Glissando intérieur `glissando-interieur` : Mix
- Granular freeze `granular-freeze` : Mix
- Griffin-Lim `griffin-lim` : Mix
- Octaver `octaver` : Mix
- Paulstretch logistique `paulstretch-logistique` : Mix
- Reconstruction de phase (PGHI) `phase-pghi` : Mix
- Quadrafuzz `quadrafuzz` : Mix
- Réverbération fractale `reverb-fractale` : Mix
- Réverbération à convolution (IR) `reverbe-convolution` : Mix
- Réverbération hachée `reverbe-hachee` : Mix
- Réverbération à réseau (FDN) `reverbe-reseau` : Mix
- Réverbération `reverberation` : Mix
- Réverbération velours `reverberation-velours` : Mélange
- Ring modulator `ring-modulator` : Mix
- Shimmer `shimmer` : Mix
- Traçage spectral `tracage-spectral` : Mix
- Transfert d'enveloppe `transfert-enveloppe` : Mix
- Tremolo logistique `tremolo-logistique` : Mix
- Vibrato logistique `vibrato-logistique` : Mix
- Vocoder `vocoder` : Mix

### espace · 18

- Arpège spectral `arpege-spectral` : Largeur
- Brassage `brassage` : Dispersion
- Chopper logistique `chopper-logistique` : Profondeur
- Chorus `chorus` : Profondeur
- De-esser `de-esser` : Largeur
- Doppler `doppler` : Distance
- Filtrage par un spectre `filtrage-spectre` : Profondeur
- Flanger `flanger` : Profondeur
- Flou spectral `flou-spectral` : Largeur
- Granular freeze `granular-freeze` : Position
- Largeur stéréo / MS `largeur-stereo` : Largeur
- Particules `particules` : Dispersion, Position
- Resonance Audio `resonance-audio` : Largeur, Profondeur
- Réverbération à réseau (FDN) `reverbe-reseau` : Largeur
- Tore `tore` : Profondeur
- Tremolo logistique `tremolo-logistique` : Profondeur
- Tresse `tresse` : Largeur
- Vibrato logistique `vibrato-logistique` : Profondeur

### temps · 18

- Compresseur `compresseur` : Attaque, Relâchement
- Compresseur multibande `compresseur-multibande` : Attaque, Relâchement
- De-esser `de-esser` : Attaque, Relâchement
- Ducking `ducking` : Attaque, Relâchement, Maintien
- Echo inversé `echo-inverse` : Temps
- Écho logistique `echo-logistique` : Temps
- Enveloppe ADSR `enveloppe-adsr` : Attaque, Maintien, Relâchement
- Gate/Expandeur `gate-expandeur` : Attaque, Relâchement
- Limiteur `limiteur` : Relâchement
- Pièce de Lucier `piece-lucier` : Decay
- Réverbération fractale `reverb-fractale` : Decay
- Réverbération à convolution (IR) `reverbe-convolution` : Decay
- Réverbération hachée `reverbe-hachee` : Décroissance, Maintien, Chute
- Réverbération à réseau (FDN) `reverbe-reseau` : Queue
- Réverbération `reverberation` : Decay
- Réverbération velours `reverberation-velours` : Chute
- Shimmer `shimmer` : Décroissance
- Transient Shaper `transient-shaper` : Attaque

### frequence · 11

- Ceinture de Dirac `ceinture-dirac` : Coupure
- Chopper logistique `chopper-logistique` : Fréquence
- De-esser `de-esser` : Fréquence
- Exciter / Aural enhancer `exciter` : Fréquence
- Grave en mono `mono-grave` : Coupure
- Particules `particules` : Fréquence
- Réduction de bruit `reduction-bruit` : Q
- Ring modulator `ring-modulator` : Fréquence
- Tremolo logistique `tremolo-logistique` : Fréquence
- Vibrato logistique `vibrato-logistique` : Fréquence
- Vocoder `vocoder` : Q

### dynamique · 10

- Compresseur `compresseur` : Seuil, Ratio
- De-esser `de-esser` : Seuil, Ratio
- Ducking `ducking` : Seuil
- Gate/Expandeur `gate-expandeur` : Seuil, Ratio
- Limiteur `limiteur` : Seuil, Plafond
- Montage par grains `montage-grains` : Seuil
- Réverbération hachée `reverbe-hachee` : Seuil
- Sinusoïdes + bruit (SMS) `sms-sinusoides-bruit` : Seuil
- Sinus + transitoires + bruit (STN) `stn-sinus-transitoires-bruit` : Seuil
- Suppression de clics `suppression-clics` : Seuil

### niveau · 10

- Compresseur `compresseur` : Gain
- Déréverbération `dereverberation` : Réduction
- Distorsion `distorsion` : Gain
- Ducking `ducking` : Réduction
- Formule sur échantillons `formule-echantillons` : Volume
- Formule spectrale `formule-spectrale` : Volume
- Mélangeur logistique `melangeur-logistique` : Volume
- Mosaïquage par corpus `mosaiquage` : Volume
- Particules `particules` : Volume
- Réduction de bruit `reduction-bruit` : Réduction

### retroaction · 8

- Beat Repeat / Stutter `beat-repeat` : Feedback
- Delay stéréo `delay-stereo` : Feedback
- Echo inversé `echo-inverse` : Feedback
- Écho logistique `echo-logistique` : Feedback
- Pièce de Lucier `piece-lucier` : Damping
- Réverbération fractale `reverb-fractale` : Damping
- Réverbération à convolution (IR) `reverbe-convolution` : Damping
- Shimmer `shimmer` : Rebouclage

### hauteur · 7

- Brassage `brassage` : Transposition
- Granular freeze `granular-freeze` : Pitch
- Particules `particules` : Transposition
- Resonance Audio `resonance-audio` : Hauteur
- Shift formants `shift-formants` : Hauteur
- Shimmer `shimmer` : Transposition
- Sinusoïdes + bruit (SMS) `sms-sinusoides-bruit` : Transposition

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
- `spatialisation-stereo` : Position
- `spatialiseur` : Azimut
- `tremolo` : Profondeur
- `vibrato` : (non déclarée)
- `visualiseur-courbe` : (non déclarée)
- `vitesse-variable` : Transposition
- `wahwah` : (non déclarée)
