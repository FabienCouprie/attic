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

- **réglages déjà pilotés par une courbe** : 86, sur 60 composants
- **réglages restant à faire** : 76, sur 33 composants et 50 couples composant / famille
- **dont le cœur travaille par trames** : 1
- **réglages écartés un par un** : 32, sur 13 composants qui gardent les leurs
- **composants écartés** : 50, dont 1 famille de la palette écartée en bloc

## Ce qui reste, par famille

### frequence · 14

- Bitcrusher `bitcrusher` : Fréquence
- Compresseur multibande `compresseur-multibande` : Fréq Low, Fréq High
- De-esser `de-esser` : Fréquence
- Exciter / Aural enhancer `exciter` : Fréquence
- Haut-parleur rotatif `haut-parleur-rotatif` : Coupure
- Oscillateur à table d'onde `oscillateur-table-onde` : Fréquence
- Peignes accordés `peignes-accordes` : Résonance
- Quadrafuzz `quadrafuzz` : Coupure 1, Coupure 2, Coupure 3
- Résonateurs `resonateurs` : Résonance, Brillance
- Réverbération à réseau (FDN) `reverbe-reseau` : Fréquence de l'aigu
- Ring modulator `ring-modulator` : Fréquence
- Trémolo harmonique `tremolo-harmonique` : Coupure
- Vocoder `vocoder` : Fréq min, Fréq max, Q
- Wah-wah `wahwah` : Résonance

### temps · 13

- Ampleur `ampleur` : Pré-délai
- Compresseur `compresseur` : Attaque, Relâchement
- Compresseur multibande `compresseur-multibande` : Attaque, Relâchement
- De-esser `de-esser` : Attaque, Relâchement
- Delay stéréo `delay-stereo` : Temps G, Temps D
- Ducking `ducking` : Attaque, Relâchement, Maintien
- Écho flottant `echo-flottant` : Décroissance
- Réverbération hachée `reverbe-hachee` : Décroissance, Maintien, Chute
- Réverbération à réseau (FDN) `reverbe-reseau` : Retard court, Retard long, Queue
- Réverbération `reverberation` : Decay
- Réverbération velours `reverberation-velours` : Chute
- Shimmer `shimmer` : Décroissance
- Transient Shaper `transient-shaper` : Temps attaque, Temps sustain

### dynamique · 7

- Compresseur `compresseur` : Seuil, Ratio
- Compresseur multibande `compresseur-multibande` : Seuil Low, Ratio Low, Seuil Mid, Ratio Mid, Seuil High, Ratio High
- De-esser `de-esser` : Ratio
- Ducking `ducking` : Seuil
- Gate/Expandeur `gate-expandeur` : Seuil, Ratio
- Limiteur `limiteur` : Seuil, Plafond
- Réverbération hachée `reverbe-hachee` : Seuil

### espace · 5

- Rotation ambisonique `ambisonique` : Ouverture
- Arc-en-ciel acoustique `arc-en-ciel-acoustique` : Ouverture
- Granular freeze `granular-freeze` : Position
- Haut-parleur rotatif `haut-parleur-rotatif` : Profondeur du Doppler
- Spatialisation stéréo `spatialisation-stereo` : Largeur

### niveau · 4

- Compresseur `compresseur` : Gain
- Ducking `ducking` : Réduction
- Haut-parleur rotatif `haut-parleur-rotatif` : Profondeur d'amplitude
- Micromontage `micromontage` : Niveau

### retroaction · 3

- Beat Repeat / Stutter `beat-repeat` : Feedback
- Delay stéréo `delay-stereo` : Feedback
- Shimmer `shimmer` : Rebouclage

### hauteur · 2

- Granular freeze `granular-freeze` : Pitch
- Shimmer `shimmer` : Transposition

### melange · 2

- Harmonizer / Octaver `harmonizer` : Mix 1, Mix 2 · **⟨trames⟩** harmoniser (appelle harmoniserVoie), harmoniserVoie (appelle changerTonaliteVoie)
- Shimmer `shimmer` : Mix

## Familles écartées en bloc

- **Topologie** : la famille entière est écartée : le son y est promené sur une surface refermée sur elle-même, dont la géométrie est le sujet du nœud et non un réglage à faire varier
  - `anneau-moebius`, `bouteille-klein`, `tore`, `ceinture-dirac`, `tresse`, `tonnetz`, `spirale-spatiale`

## Écartés nommément, et pourquoi

Ces composants sont écartés **en entier** : la raison porte sur le composant.

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

## Réglages écartés un par un, et pourquoi

Ici la raison ne porte que sur **un réglage** : le composant garde les siens, et ils restent
à faire tant qu'ils ne sont ni pilotés ni écartés à leur tour.

- `arc-en-ciel-acoustique/Dispersion` : elle fixe le retard de chaque bande ET la longueur du rendu, que `dureeArcEnCiel` calcule avant qu'un échantillon soit écrit
- `echo-flottant/Distance` : elle fixe la période entre les deux murs, donc tous les retards et la fréquence du peigne que le nœud annonce ; une distance qui se déplace est un effet Doppler, non un écho plus loin
- `haut-parleur-rotatif/Largeur` : c'est le déphasage entre les deux rotors : le faire varier change la vitesse instantanée du rotor droit, la dérivée de la phase s'ajoutant à sa pulsation, et désaccorderait la rotation au lieu d'élargir l'image
- `micromontage/Panoramique` : le composant porte déjà « Panoramique, fin » et « Panoramique, loi », soit une valeur par fragment ; une courbe y serait lue par fragment, non par échantillon
- `suiveur-hauteur/Hauteur min` : c'est une borne de la courbe que ce nœud ÉMET, sa documentation disant « ce que le zéro de la courbe veut dire » ; elle décide de l'échelle de sa sortie, non d'une grandeur qui court dans un son
- `suiveur-hauteur/Hauteur max` : idem, pour le un de la courbe émise
- `micromontage/Panoramique, fin` : c'est « la seconde borne, pour une rampe ou un tirage », celle de la loi que le composant applique lui-même à chaque fragment
- `micromontage/Transposition, fin` : idem, seconde borne de la loi par fragment
- `decoupage-objets/Seuil de silence` : il sert au critère des silences : ce qui passe dessous EST un silence, ce qui est une découpe et non un traitement
- `remplissage-trou/Seuil de silence` : il décide quel échantillon est tenu pour manquant, en détection automatique : un critère, non une grandeur rendue
- `restauration-ecretage/Seuil manuel` : il décide quel échantillon est tenu pour écrêté, et ne sert qu'en mode manuel : un critère de détection, dans un seul mode
- `banque-clavier/Largeur de zone` : elle dit sur combien de demi-tons une zone est rééchantillonnée : c'est la construction de la banque, faite avant le rendu, et elle se compte en demi-tons et non en largeur d'image
- `instrument-fin/Largeur de zone` : elle dit l'écart entre deux notes rendues, donc COMBIEN de notes le composant rejoue : la structure de ce qu'il produit, décidée avant le rendu
- `mosaiquage/Poids du niveau` : c'est l'importance donnée au niveau dans la RECHERCHE du grain le plus proche, lue une fois par grain et non par échantillon
- `mosaiquage/Poids de la brillance` : idem, l'importance donnée au centre de gravité du spectre dans la même recherche
- `ondelettes/Force du seuil` : elle multiplie le seuil universel de Donoho, appliqué à la décomposition entière : une décision globale sur le son, non une valeur qui le parcourt
- `montage/Gain 1` : c'est le niveau d'UNE piste parmi seize, et le montage s'allonge d'une piste à la demande : il faudrait un port de courbe par piste, en nombre variable ; il porte en outre « Fondu entrée » et « Fondu sortie », qui sont sa façon de faire bouger ce niveau dans le temps
- `montage/Gain 2` : c'est le niveau d'UNE piste parmi seize, et le montage s'allonge d'une piste à la demande : il faudrait un port de courbe par piste, en nombre variable ; il porte en outre « Fondu entrée » et « Fondu sortie », qui sont sa façon de faire bouger ce niveau dans le temps
- `montage/Gain 3` : c'est le niveau d'UNE piste parmi seize, et le montage s'allonge d'une piste à la demande : il faudrait un port de courbe par piste, en nombre variable ; il porte en outre « Fondu entrée » et « Fondu sortie », qui sont sa façon de faire bouger ce niveau dans le temps
- `montage/Gain 4` : c'est le niveau d'UNE piste parmi seize, et le montage s'allonge d'une piste à la demande : il faudrait un port de courbe par piste, en nombre variable ; il porte en outre « Fondu entrée » et « Fondu sortie », qui sont sa façon de faire bouger ce niveau dans le temps
- `montage/Gain 5` : c'est le niveau d'UNE piste parmi seize, et le montage s'allonge d'une piste à la demande : il faudrait un port de courbe par piste, en nombre variable ; il porte en outre « Fondu entrée » et « Fondu sortie », qui sont sa façon de faire bouger ce niveau dans le temps
- `montage/Gain 6` : c'est le niveau d'UNE piste parmi seize, et le montage s'allonge d'une piste à la demande : il faudrait un port de courbe par piste, en nombre variable ; il porte en outre « Fondu entrée » et « Fondu sortie », qui sont sa façon de faire bouger ce niveau dans le temps
- `montage/Gain 7` : c'est le niveau d'UNE piste parmi seize, et le montage s'allonge d'une piste à la demande : il faudrait un port de courbe par piste, en nombre variable ; il porte en outre « Fondu entrée » et « Fondu sortie », qui sont sa façon de faire bouger ce niveau dans le temps
- `montage/Gain 8` : c'est le niveau d'UNE piste parmi seize, et le montage s'allonge d'une piste à la demande : il faudrait un port de courbe par piste, en nombre variable ; il porte en outre « Fondu entrée » et « Fondu sortie », qui sont sa façon de faire bouger ce niveau dans le temps
- `montage/Gain 9` : c'est le niveau d'UNE piste parmi seize, et le montage s'allonge d'une piste à la demande : il faudrait un port de courbe par piste, en nombre variable ; il porte en outre « Fondu entrée » et « Fondu sortie », qui sont sa façon de faire bouger ce niveau dans le temps
- `montage/Gain 10` : c'est le niveau d'UNE piste parmi seize, et le montage s'allonge d'une piste à la demande : il faudrait un port de courbe par piste, en nombre variable ; il porte en outre « Fondu entrée » et « Fondu sortie », qui sont sa façon de faire bouger ce niveau dans le temps
- `montage/Gain 11` : c'est le niveau d'UNE piste parmi seize, et le montage s'allonge d'une piste à la demande : il faudrait un port de courbe par piste, en nombre variable ; il porte en outre « Fondu entrée » et « Fondu sortie », qui sont sa façon de faire bouger ce niveau dans le temps
- `montage/Gain 12` : c'est le niveau d'UNE piste parmi seize, et le montage s'allonge d'une piste à la demande : il faudrait un port de courbe par piste, en nombre variable ; il porte en outre « Fondu entrée » et « Fondu sortie », qui sont sa façon de faire bouger ce niveau dans le temps
- `montage/Gain 13` : c'est le niveau d'UNE piste parmi seize, et le montage s'allonge d'une piste à la demande : il faudrait un port de courbe par piste, en nombre variable ; il porte en outre « Fondu entrée » et « Fondu sortie », qui sont sa façon de faire bouger ce niveau dans le temps
- `montage/Gain 14` : c'est le niveau d'UNE piste parmi seize, et le montage s'allonge d'une piste à la demande : il faudrait un port de courbe par piste, en nombre variable ; il porte en outre « Fondu entrée » et « Fondu sortie », qui sont sa façon de faire bouger ce niveau dans le temps
- `montage/Gain 15` : c'est le niveau d'UNE piste parmi seize, et le montage s'allonge d'une piste à la demande : il faudrait un port de courbe par piste, en nombre variable ; il porte en outre « Fondu entrée » et « Fondu sortie », qui sont sa façon de faire bouger ce niveau dans le temps
- `montage/Gain 16` : c'est le niveau d'UNE piste parmi seize, et le montage s'allonge d'une piste à la demande : il faudrait un port de courbe par piste, en nombre variable ; il porte en outre « Fondu entrée » et « Fondu sortie », qui sont sa façon de faire bouger ce niveau dans le temps

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
- `chorus` : Profondeur
- `convolution-deux-sons` : Mix
- `creneau` : Niveau
- `crible-harmonique` : Fondamentale
- `de-esser` : Largeur
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
- `flanger` : Profondeur
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
- `oscillateur-table-onde` : Position
- `oscillateur-table-onde` : Volume
- `paulstretch` : Stretch
- `peignes-accordes` : Fondamentale
- `peignes-accordes` : Mix
- `phaser` : Fréquence
- `phaser` : Mix
- `phaser` : Profondeur
- `quadrafuzz` : Mix
- `reponse-filtre` : Fréquence de coupure
- `reponse-filtre` : Résonance
- `resonateurs` : Fondamentale
- `resonateurs` : Mix
- `retard-spectral` : Dispersion
- `retard-spectral` : Mix
- `reverbe-hachee` : Mix
- `reverbe-reseau` : Largeur
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
- `tremolo-harmonique` : Profondeur
- `ubiquite` : Dispersion
- `vague` : Ouverture
- `vague` : Profondeur
- `vibrato` : Fréquence
- `vibrato` : Profondeur
- `vitesse-variable` : Transposition
- `vocoder` : Mix
- `wahwah` : Fréquence
- `wahwah` : Mix
- `wahwah` : Profondeur
