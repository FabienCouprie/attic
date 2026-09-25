# INTERFACE.md — l'habillage des composants

> Fichier **généré**. Ne pas éditer à la main : `npm run docs:interface`.

Ce que chaque composant fait est dans [COMPONENTS.md](COMPONENTS.md). Ce fichier-ci dit comment
il est **montré**, ce qui se décide dans des tables partagées et non dans son propre fichier :
`ui/vues.tsx`, `ui/tailles-noeuds.ts`, `ui/AtelierNode.tsx`.

Il est versionné pour une seule raison : **rendre visible dans un diff** le composant qu'une
modification touche sans qu'on l'ait voulu. Une ligne qui change ici est un composant à rouvrir.

## Comment lire une ligne

- **Vue avant / après** — le composant React qui habille le nœud, avant ou après le lecteur audio.
- **Taille** — ce que le nœud mesure à sa création. Une vue dont la hauteur se déduit d'un ancêtre
  n'affiche rien si cette hauteur ne laisse pas de place : c'est la panne du cercle pulsant.
- **Redimensionnable** — un `NodeResizer` pose une hauteur explicite en pixels sur le nœud.
- **Lecteur générique** : `non` veut dire qu'une vue de ce composant déclare porter elle-même un
  moyen d'écouter, et que le nœud retire donc le sien.

**403 composants**, dont **87** avec une vue propre et **4** sans lecteur générique.

## Les composants habillés d'une vue

| Composant | id | Vue avant | Vue après | Taille | Redim. | Lecteur | Msg masqué |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Accord mets-musique | `accord-mets-musique` | VueGout | — | 240 × 162 | non | oui | non |
| Analyseur de spectre | `analyseur-spectre` | VueSpectre | — | 420 × 300 | non | oui | non |
| Attracteur / IFS | `attracteur-ifs` | VueAttracteurIFS | — | 320 × 320 | oui | oui | non |
| Banque SFZ | `banque-sfz` | — | VueBanqueSfz | 240 × 140 | non | oui | non |
| Roue de Camelot | `camelot` | VueRenduImage | — | 240 × 162 | oui | oui | non |
| Carte sonore | `carte-sonore` | VueCarteSonore | — | 240 × 118 | non | oui | non |
| Cercle pulsant | `cercle-pulsant` | VueAnimationSvg | — | 300 × 500 | non | non | non |
| Classificateur de genre | `classificateur-genre` | VueUploadOnnx | — | 380 × 300 | non | oui | non |
| Clavier d'apprentissage | `clavier-apprentissage` | — | VueApprentissage | 240 × 162 | non | oui | non |
| Clavier mélodie | `clavier-melodie` | — | ClavierMelodie | 500 × 260 | non | oui | non |
| Clavier SFZ | `clavier-sfz` | — | ClavierSfz | 540 × 300 | non | oui | non |
| Lecteur musique | `collection-lecteur-musique` | — | VueLecteurMusique | 380 × 320 | non | oui | non |
| Conversion MIDI→MP3 | `collection-midi-vers-mp3` | — | VueCollections | 380 × 280 | non | oui | non |
| Conversion MP3→WAV | `collection-mp3-vers-wav` | — | VueCollections | 380 × 280 | non | oui | non |
| Conversion WAV→MP3 | `collection-vers-mp3` | — | VueCollections | 380 × 280 | non | oui | non |
| ColorSynth | `colorsynth` | VueColorSynth | — | 280 × 220 | non | oui | non |
| Comparaison esthétique | `comparaison-esthetique` | VueComparaisonEsth | — | 380 × 300 | non | oui | non |
| Comparateur A/B | `comparateur-ab` | VueComparateurAB | — | 240 × 140 | non | oui | non |
| WAV → MP3 | `convertisseur-audio` | — | VueExport | 240 × 140 | non | oui | non |
| MP3 → WAV | `convertisseur-mp3-wav` | — | VueExport | 240 × 140 | non | oui | non |
| Coordonnées sur carte | `coordonnees-sur-carte` | VueCoordonneesSurCarte | — | 240 × 140 | non | oui | non |
| Couleur → Son IA | `couleur-suno-ia` | VueCouleurSunoIA | — | 300 × 260 | non | oui | non |
| Démonstration | `demonstration` | — | VueDemonstration | 240 × 118 | non | oui | non |
| Détecteur d'accords | `detecteur-accords` | VueDetecteurAccords | — | 320 × 340 | non | oui | oui |
| Émotions | `emotions` | VueEmotions | — | 300 × 320 | non | oui | non |
| Entrée audio | `entree-audio` | VueUploadAudio | — | 240 × 118 | non | non | non |
| Entrée image | `entree-image` | VueUploadImage + VueRenduImage | — | 320 × 320 | oui | oui | non |
| Entrée PDF | `entree-pdf` | VueUploadPdf | — | 240 × 118 | non | oui | non |
| Enveloppe ADSR | `enveloppe-adsr` | VueADSR | — | 420 × 300 | non | oui | non |
| Explorateur musique | `explorateur-musique` | VueExplorateur | — | 240 × 118 | non | non | non |
| Extrait vidéo | `extrait-video` | VueExtraitVideo | — | 480 × 420 | non | oui | non |
| Film de l'application | `film-application` | — | VueFilmApplication | 240 × 118 | non | oui | non |
| Formule sur échantillons | `formule-echantillons` | EditeurFormule | — | 240 × 140 | non | oui | non |
| Formule spectrale | `formule-spectrale` | EditeurFormule | — | 240 × 118 | non | oui | non |
| Galerie d'exposition | `galerie-exposition` | VueGalerieExposition | — | 280 × 280 | non | oui | non |
| Générateur audio mathématique | `generateur-audio-mathematique` | EditeurFormule | — | 240 × 118 | non | oui | non |
| Courbe | `generateur-courbe` | VueCourbe | — | 240 × 118 | non | oui | non |
| Générateur de pochette | `generateur-pochette` | VuePochette | — | 300 × 420 | non | oui | non |
| Générateur de script IA | `generateur-script-ia` | VueGenerateurScriptIA | — | 380 × 400 | non | oui | non |
| Gestionnaire de nodes | `gestion-nodes` | VueGestionNodes | — | 280 × 220 | non | oui | non |
| Goniomètre | `goniometre` | VueImageDepuisAudio | — | 330 × 470 | non | oui | non |
| Le goût d'un son | `gout-du-son` | VueGout | — | 240 × 140 | non | oui | non |
| Julia Processor | `julia-processor` | VueJuliaProcessor | — | 240 × 162 | non | oui | non |
| Lecteur MIDI | `lecteur-midi` | VueUploadMidi + VueSoundFont | — | 240 × 140 | non | oui | non |
| Lecteur SVG | `lecteur-svg` | VueUploadSvg + VueRenduImage | — | 320 × 320 | oui | oui | non |
| Modifier le texte | `modifier-texte` | VueModifierTexte | — | 300 × 280 | non | oui | non |
| Montage vidéo | `montage-video` | VueMontageVideo | — | 520 × 560 | non | oui | non |
| Noms d'instruments | `noms-instruments` | VueNomsInstruments | — | 300 × 320 | non | oui | non |
| Orchestre Csound | `orchestre-csound` | — | VueOrchestreCsound | 340 × 420 | non | oui | non |
| Oscillateur | `oscillateur` | VueOscillo | — | 420 × 340 | non | oui | non |
| Parcours | `parcours` | Parcours | — | 240 × 140 | non | oui | non |
| Parfum → motif | `parfum-motif` | VueGout | — | 240 × 162 | non | oui | non |
| Partition gravée | `partition-verovio` | VueGravure | — | 420 × 320 | non | oui | non |
| Pure Data | `pure-data` | VueUploadPd | — | 240 × 118 | non | oui | non |
| Python Processor | `python-processor` | VuePythonProcessor | — | 380 × 300 | non | oui | non |
| Quiz | `quiz` | Quiz | — | 240 × 140 | non | oui | non |
| Rendu image | `rendu-image` | VueRenduImage | — | 320 × 320 | oui | oui | non |
| Filtre + réponse | `reponse-filtre` | VueReponseFiltre | — | 420 × 300 | non | oui | non |
| Réverbération à convolution (IR) | `reverbe-convolution` | — | VueUploadIR | 240 × 118 | non | oui | non |
| Sampler personnalisé | `sampler-personnalise` | VueUploadAudio | — | 240 × 118 | non | non | non |
| Score esthétique | `score-esthetique` | VueEsthetique | — | 420 × 380 | non | oui | non |
| Sélecteur multi-zones | `selecteur-multi-zones` | VueSelecteurMultiZones | — | 460 × 340 | non | oui | non |
| Séparateur IA | `separateur-ia` | VueUploadOnnx | — | 240 × 228 | non | oui | non |
| Séparer image et son | `separer-image-son` | — | VueVideoMuette | 240 × 140 | non | oui | non |
| Séquenceur d'accords | `sequenceur-accords` | VueSequenceurAccords | — | 480 × 380 | non | oui | non |
| Séquenceur de batterie avancé | `sequenceur-batterie-avance` | VueSequenceurBatterieAvance | — | 480 × 360 | non | oui | non |
| Séquenceur mélodique | `sequenceur-melodique` | VueSequenceurMelodique | — | 460 × 400 | non | oui | non |
| Sortie audio | `sortie-audio` | — | VueExport | 240 × 118 | non | oui | non |
| Sortie MIDI | `sortie-midi` | — | VueExport | 240 × 162 | non | oui | non |
| Sortie texte | `sortie-texte` | VueSortieTexte | — | 280 × 250 | non | oui | oui |
| Entrée texte | `source-texte` | VueSourceTexte | — | 280 × 200 | non | oui | non |
| Spectrogramme | `spectrogramme` | VueSpectrogramme | — | 420 × 300 | non | oui | non |
| Styles musicaux | `styles-musicaux` | VueStylesMusicaux | — | 300 × 320 | non | oui | non |
| Suiveur de caractéristique | `suiveur-caracteristique` | VueCourbe | — | 240 × 140 | non | oui | non |
| Tessitures de voix | `tessitures-voix` | VueTessituresVoix | — | 300 × 320 | non | oui | non |
| Texte → image | `texte-image` | VueRenduImage | — | 240 × 118 | oui | oui | non |
| Transcripteur MIDI | `transcripteur-midi` | VueTranscription | — | 240 × 118 | non | oui | non |
| Grille d'accords VexFlow | `vexflow-grille` | VueVexFlow | — | 500 × 200 | oui | oui | oui |
| Partition MIDI | `vexflow-midi` | VueVexFlow | — | 800 × 200 | oui | oui | oui |
| Partition VexFlow | `vexflow-partition` | VueVexFlow | — | 500 × 160 | oui | oui | oui |
| Portée VexFlow | `vexflow-portee` | VueVexFlow | — | 500 × 160 | oui | oui | oui |
| Tablature VexFlow | `vexflow-tab` | VueVexFlow | — | 500 × 160 | oui | oui | oui |
| Visualisation Songsee | `visualisation-songsee` | VueImageDepuisAudio | — | 240 × 118 | non | oui | non |
| Visualiseur de courbe | `visualiseur-courbe` | VueTraceCourbe | — | 240 × 162 | non | oui | non |
| Visualiseur | `visualiseur-forme-onde` | VueFormeOnde | — | 420 × 240 | non | oui | non |
| Visualiseur multipiste | `visualiseur-multipiste` | VuePistesMultiples | — | 240 × 228 | non | oui | non |
| VU-mètre / LUFS | `vu-metre` | VueVuMetre | — | 300 × 260 | non | oui | non |

## Les composants sans vue propre

Ils reçoivent l'habillage ordinaire : le lecteur audio générique, le message, les ports.

| Composant | id | Taille |
| --- | --- | --- |
| ▸ Entrée exposée | `__entree-frontiere` | 240 × 118 |
| Sortie exposée ◂ | `__sortie-frontiere` | 240 × 118 |
| ABC → MIDI | `abc-vers-midi` | 240 × 162 |
| Accords → Notation MIDI | `accords-vers-notation` | 240 × 162 |
| Ajouter silence | `ajouter-silence` | 240 × 118 |
| Similarité audio | `alignement-dtw` | 240 × 140 |
| Aligneur de piste | `aligneur-piste` | 240 × 140 |
| Rotation ambisonique | `ambisonique` | 240 × 140 |
| Ampleur | `ampleur` | 240 × 140 |
| Amplificateur | `amplificateur` | 240 × 140 |
| Analyse audio | `analyse-audio` | 240 × 140 |
| Analyse émotionnelle | `analyse-emotionnelle` | 240 × 140 |
| Analyse rythmique | `analyse-rythme` | 240 × 118 |
| Anneau de Möbius | `anneau-moebius` | 240 × 118 |
| Arpège flocon de Koch | `arpege-koch` | 240 × 140 |
| Arpège spectral | `arpege-spectral` | 240 × 118 |
| Arpégiateur MIDI | `arpegiateur-midi` | 240 × 118 |
| Assaisonnement sonore | `assaisonnement-sonore` | 240 × 140 |
| Auto-pan | `auto-pan` | 240 × 140 |
| Auto-pan logistique | `auto-pan-logistique` | 240 × 118 |
| Matrice d'auto-similarité | `auto-similarite` | 240 × 162 |
| Automate cellulaire | `automate-cellulaire` | 240 × 140 |
| Étaler sur le clavier | `banque-clavier` | 240 × 140 |
| Barre modale | `barre-modale` | 240 × 118 |
| Beat Repeat / Stutter | `beat-repeat` | 240 × 118 |
| Bitcrusher | `bitcrusher` | 240 × 140 |
| Groove Box | `boite-groove` | 240 × 206 |
| Boîte à rythmes | `boite-rythmes` | 240 × 140 |
| Début de boucle collection | `boucle-collection-debut` | 240 × 118 |
| Fin de boucle collection | `boucle-collection-fin` | 240 × 118 |
| Début de boucle | `boucle-graphe-debut` | 240 × 118 |
| Fin de boucle A | `boucle-graphe-fin` | 240 × 118 |
| Fin de boucle B | `boucle-graphe-fin-b` | 240 × 118 |
| Fin de boucle C | `boucle-graphe-fin-c` | 240 × 118 |
| Boucle MIDI | `boucle-midi` | 240 × 118 |
| Bouteille de Klein | `bouteille-klein` | 240 × 118 |
| Brassage | `brassage` | 240 × 118 |
| Canon de tempo (Nancarrow) | `canon-nancarrow` | 240 × 118 |
| Canon par pavage | `canon-pavage` | 240 × 162 |
| Capture MIDI | `capture-midi` | 240 × 140 |
| Capture système audio | `capture-systeme-audio` | 240 × 118 |
| Caractéristiques de piste | `caracteristiques-piste` | 240 × 140 |
| Ceinture de Dirac | `ceinture-dirac` | 240 × 118 |
| Centroïde spectral (Meyda) | `centroide-spectral` | 240 × 140 |
| Changement de tempo | `changement-tempo` | 240 × 118 |
| Changement de tonalité | `changement-tonalite` | 240 × 118 |
| Chopper | `chopper` | 240 × 140 |
| Chopper logistique | `chopper-logistique` | 240 × 118 |
| Chorus | `chorus` | 240 × 140 |
| Classes de hauteurs | `classes-hauteurs` | 240 × 118 |
| Classification de pistes | `classification-pistes` | 240 × 206 |
| Cloche de Risset | `cloche-risset` | 240 × 118 |
| Color Looper | `color-looper` | 240 × 140 |
| Compresseur | `compresseur` | 240 × 118 |
| Compresseur multibande | `compresseur-multibande` | 240 × 118 |
| Continuation AR | `continuation-spectrale-ar` | 240 × 118 |
| Continuation LSTM | `continuation-spectrale-lstm` | 240 × 118 |
| Continuation Stable Audio 3 | `continuation-stable-audio-3` | 240 × 140 |
| Continuum hauteur ↔ rythme | `continuum-stockhausen` | 240 × 118 |
| Contraintes ABC | `contraintes-abc` | 240 × 140 |
| Contrepoint d'espèces | `contrepoint-especes` | 240 × 118 |
| Convolution de deux sons | `convolution-deux-sons` | 240 × 162 |
| Correction de hauteur | `correction-hauteur` | 240 × 140 |
| Couleur RGB | `couleur-rgb` | 240 × 118 |
| Courbe de dissonance | `courbe-dissonance` | 240 × 140 |
| Crible harmonique | `crible-harmonique` | 240 × 140 |
| Crible (Xenakis) | `crible-xenakis` | 240 × 118 |
| Csound | `csound` | 240 × 184 |
| Effet Csound | `csound-effet` | 240 × 162 |
| Instrument Csound | `csound-instrument` | 240 × 140 |
| Instruments Csound | `csound-instruments-physiques` | 240 × 140 |
| Spectral Csound | `csound-spectral` | 240 × 140 |
| DDSP Tone Transfer | `ddsp-tone-transfer` | 240 × 118 |
| De-esser | `de-esser` | 240 × 140 |
| Débruitage IA | `debruitage-ia` | 240 × 118 |
| Décaleur de fréquence | `decaleur-frequence` | 240 × 140 |
| Déclarer la disposition | `declarer-disposition` | 240 × 118 |
| Décodeur ambisonique | `decodeur-ambisonique` | 240 × 118 |
| Décomposition atomique | `decomposition-atomique` | 240 × 162 |
| Découpage en objets | `decoupage-objets` | 240 × 162 |
| Découpe aléatoire | `decoupe-aleatoire` | 240 × 118 |
| Delay stéréo | `delay-stereo` | 240 × 140 |
| Déphasage de Reich | `dephasage-reich` | 240 × 118 |
| Déréverbération | `dereverberation` | 240 × 118 |
| Dessin sonore | `dessin-sonore` | 240 × 140 |
| Détecteur de tempo | `detecteur-tempo` | 240 × 162 |
| Distance de conduite de voix | `distance-conduite-voix` | 240 × 118 |
| Distorsion | `distorsion` | 240 × 118 |
| Documentation du graphe | `documentation-graphe` | 240 × 140 |
| Doppler | `doppler` | 240 × 118 |
| Batterie synthétique | `drum-synth` | 240 × 140 |
| Ducking | `ducking` | 240 × 140 |
| Échange canaux | `echange-canaux` | 240 × 118 |
| Echo | `echo` | 240 × 162 |
| Echo inversé | `echo-inverse` | 240 × 118 |
| Écho logistique | `echo-logistique` | 240 × 118 |
| Echo Ping-Pong | `echo-ping-pong` | 240 × 162 |
| Écosystème (Di Scipio) | `ecosysteme` | 240 × 140 |
| Écoute binaurale | `ecoute-binaurale` | 240 × 118 |
| Écrans (Xenakis) | `ecrans-xenakis` | 240 × 140 |
| Édition ABC par LLM | `edition-abc-llm` | 240 × 140 |
| Enregistreur | `enregistreur-audio` | 240 × 118 |
| Égaliseur | `equaliseur` | 240 × 118 |
| Étirement temporel (DTW) | `etirement-dtw` | 240 × 140 |
| Étirement glissant | `etirement-glissant` | 240 × 118 |
| Étirement du spectre | `etirement-spectre` | 240 × 140 |
| Exciter / Aural enhancer | `exciter` | 240 × 140 |
| Export image | `export-image` | 240 × 118 |
| Export SFZ | `export-sfz` | 240 × 118 |
| Export SVG | `export-svg` | 240 × 118 |
| Extraction centre/côté | `extraction-centre-cote` | 240 × 118 |
| Extraction PDF | `extraction-pdf` | 240 × 118 |
| Extraire durée | `extraire-duree` | 240 × 140 |
| Extraire une zone | `extraire-zone` | 240 × 140 |
| Extraire zones (sélecteur) | `extraire-zones-selecteur` | 240 × 140 |
| Fiche technique | `fiche-technique` | 240 × 140 |
| Filtrage par un spectre | `filtrage-spectre` | 240 × 140 |
| Flanger | `flanger` | 240 × 140 |
| Flou spectral | `flou-spectral` | 240 × 118 |
| FM / AM Synth | `fm-synth` | 240 × 118 |
| Fondu | `fondu` | 240 × 118 |
| Formules Csound | `formules-csound` | 240 × 140 |
| Note d'instrument | `frontiere-note` | 240 × 162 |
| Fusionner en stéréo | `fusion-stereo` | 240 × 140 |
| Gammes du monde | `gammes-monde` | 240 × 118 |
| Gate/Expandeur | `gate-expandeur` | 240 × 118 |
| Gel spectral | `gel-spectral` | 240 × 118 |
| GENDYN (Xenakis) | `gendyn-xenakis` | 240 × 118 |
| Générateur d'accords | `generateur-accords` | 240 × 118 |
| Générateur de bruit | `generateur-bruit` | 240 × 118 |
| Musique fractale | `generateur-fractal` | 240 × 140 |
| Générateur de fréquence | `generateur-frequence` | 240 × 118 |
| Générateur musical | `generateur-musical` | 240 × 184 |
| Générateur de paroles | `generateur-paroles` | 240 × 118 |
| Glissando intérieur | `glissando-interieur` | 240 × 140 |
| Glissando de Risset | `glissando-risset` | 240 × 118 |
| Glissando de tonalité | `glissando-tonalite` | 240 × 118 |
| DistilGPT-2 | `gpt2-paroles` | 240 × 118 |
| Granular freeze | `granular-freeze` | 240 × 118 |
| Griffin-Lim | `griffin-lim` | 240 × 118 |
| Hard panner | `hard-panner` | 240 × 118 |
| Harmonie négative | `harmonie-negative` | 240 × 162 |
| Harmonizer / Octaver | `harmonizer` | 240 × 118 |
| Fin d'instrument | `instrument-fin` | 240 × 140 |
| Lecture inversée | `inverseur-audio` | 240 × 118 |
| Inversion de polarité | `inversion-polarite` | 240 × 118 |
| Jointure audio | `jointure-audio` | 240 × 140 |
| Jointure MIDI | `jointure-midi` | 240 × 140 |
| L-système | `l-systeme` | 240 × 162 |
| Largeur stéréo / MS | `largeur-stereo` | 240 × 140 |
| Lecteur d'analyse | `lecteur-analyse` | 380 × 300 |
| Légende d'image | `legende-image` | 240 × 118 |
| Limiteur | `limiteur` | 240 × 118 |
| Magenta Continuation | `magenta-continuation` | 240 × 118 |
| Magenta Drums | `magenta-drums` | 240 × 118 |
| Magenta Générer batterie | `magenta-generer-batterie` | 240 × 118 |
| Magenta Générer mélodie | `magenta-generer-melodie` | 240 × 118 |
| Magenta Humaniser groove | `magenta-humaniser-groove` | 240 × 118 |
| Magenta Improvisation | `magenta-improvisation` | 240 × 118 |
| Magenta Interpoler MIDI | `magenta-interpoler-midi` | 240 × 140 |
| Magnétophone | `magnetophone` | 240 × 118 |
| Mappeur Mandelbrot | `mappeur-mandelbrot` | 240 × 140 |
| Chaîne de Markov | `markov-midi` | 240 × 162 |
| Masquage | `masquage` | 240 × 140 |
| Masque de zones | `masque-zones` | 240 × 140 |
| Mélange des fenêtres | `melange-fenetres` | 240 × 118 |
| Mélangeur | `melangeur` | 240 × 118 |
| Mélangeur logistique | `melangeur-logistique` | 240 × 140 |
| Mélodie aléatoire | `melodie-aleatoire` | 240 × 140 |
| Membrane Synth | `membrane-synth` | 240 × 118 |
| Metal Synth | `metal-synth` | 240 × 118 |
| Métronome | `metronome` | 240 × 118 |
| MIDI → ABC | `midi-vers-abc` | 240 × 140 |
| Miroir d'inversion | `miroir-inversion` | 240 × 118 |
| Grave en mono | `mono-grave` | 240 × 118 |
| Montage | `montage` | 240 × 448 |
| Montage par grains | `montage-grains` | 240 × 140 |
| Morphing spectral | `morphing-spectral` | 240 × 162 |
| Mosaïquage par corpus | `mosaiquage` | 240 × 162 |
| Écho de notes | `motif-echo-notes` | 240 × 140 |
| Éclaircir | `motif-eclaircir` | 240 × 140 |
| Imposer un rythme | `motif-imposer-rythme` | 240 × 140 |
| Répéter et tourner | `motif-repeter-tourner` | 240 × 140 |
| Rétrograde et palindrome | `motif-retrograde` | 240 × 140 |
| Multi-réservoirs | `multi-reservoirs` | 280 × 540 |
| MusicGen | `musicgen` | 240 × 118 |
| MusicXML | `musicxml` | 240 × 140 |
| Paroles multilingues (IA) | `nllb-paroles` | 240 × 118 |
| Normaliseur | `normaliseur` | 240 × 118 |
| Objet sonore | `objet-sonore` | 240 × 184 |
| OCR | `ocr` | 240 × 118 |
| Octaver | `octaver` | 240 × 140 |
| LLM Ollama | `ollama-llm` | 240 × 118 |
| Ondelettes | `ondelettes` | 240 × 162 |
| Palette harmonique | `palette-harmonique` | 240 × 140 |
| Particules | `particules` | 240 × 140 |
| Partition aléatoire Csound | `partition-aleatoire-csound` | 240 × 140 |
| Partition Csound | `partition-csound` | 240 × 140 |
| Paulstretch | `paulstretch` | 240 × 118 |
| Paulstretch logistique | `paulstretch-logistique` | 240 × 118 |
| PCA neuronale | `pca-neuronale` | 240 × 118 |
| Peignes accordés | `peignes-accordes` | 240 × 140 |
| Reconstruction de phase (PGHI) | `phase-pghi` | 240 × 118 |
| Phase Vocoder Tempo | `phase-vocoder-tempo` | 240 × 118 |
| Phase Vocoder Tonalité | `phase-vocoder-tonalite` | 240 × 118 |
| Phaser | `phaser` | 240 × 140 |
| Pièce de Lucier | `piece-lucier` | 240 × 118 |
| Tonalité progressive | `pitch-progressif` | 240 × 118 |
| Pixeltone | `pixeltone` | 240 × 118 |
| Placer un son sur zones | `placer-sons-zones` | 240 × 184 |
| Pluck Synth | `pluck-synth` | 240 × 118 |
| Point d'écoute | `point-ecoute` | 240 × 118 |
| Point d'écoute MIDI | `point-ecoute-midi` | 240 × 140 |
| Poly Synth | `poly-synth` | 240 × 118 |
| Poussière de Cantor | `poussiere-cantor` | 240 × 118 |
| Profil de bruit | `profil-bruit` | 240 × 118 |
| Prompt → graphe | `prompt-vers-graphe` | 240 × 118 |
| Synthèse par pulsars | `pulsars-roads` | 240 × 118 |
| Quadrafuzz | `quadrafuzz` | 240 × 140 |
| Qwen2.5-0.5B | `qwen2.5-lyrics` | 240 × 118 |
| Recaler le niveau | `recaler-niveau` | 240 × 140 |
| Réduction de bruit | `reduction-bruit` | 240 × 140 |
| Réinsérer une zone | `reinserer-zone` | 240 × 162 |
| Remplissage de trou | `remplissage-trou` | 240 × 140 |
| Rendu d'objets | `rendu-objets` | 240 × 118 |
| Réordonner les objets | `reordonner-objets` | 240 × 140 |
| Répartiteur MIDI | `repartiteur-midi` | 240 × 206 |
| Reprise ABC | `reprise-abc` | 240 × 184 |
| Réservoir neuronal | `reservoir-musical` | 240 × 140 |
| Réservoir textuel | `reservoir-textuel` | 240 × 118 |
| Resonance Audio | `resonance-audio` | 240 × 118 |
| Résonateurs | `resonateurs` | 240 × 140 |
| Restauration d'écrêtage | `restauration-ecretage` | 240 × 118 |
| Résultante (Schillinger) | `resultante-schillinger` | 240 × 140 |
| Retard spectral | `retard-spectral` | 240 × 140 |
| Réverbération fractale | `reverb-fractale` | 240 × 118 |
| Reverb Progressive | `reverb-progressive` | 240 × 118 |
| Réverbération hachée | `reverbe-hachee` | 240 × 118 |
| Réverbération à réseau (FDN) | `reverbe-reseau` | 240 × 140 |
| Réverbération | `reverberation` | 240 × 140 |
| Réverbération velours | `reverberation-velours` | 240 × 140 |
| Ring modulator | `ring-modulator` | 240 × 118 |
| RMS (Meyda) | `rms-meyda` | 240 × 140 |
| Rogner les silences | `rogner-silences` | 240 × 118 |
| Rolloff spectral (Meyda) | `rolloff-spectral-meyda` | 240 × 140 |
| Rugosité | `rugosite` | 240 × 140 |
| Rythme de Cantor | `rythme-cantor` | 240 × 140 |
| Rythme euclidien | `rythme-euclidien` | 240 × 140 |
| Rythme de Risset | `rythme-risset` | 240 × 118 |
| Sampler MIDI | `sampler-midi` | 240 × 140 |
| Sampler multi-zones | `sampler-multizones` | 240 × 140 |
| Secoueurs | `secoueurs` | 240 × 118 |
| Séparateur canaux | `separateur-canaux` | 240 × 140 |
| Séparation harmonique / percussive | `separation-harmonique-percussive` | 240 × 140 |
| Opérations sérielles | `serie-dodecaphonique` | 240 × 162 |
| Série de l'infini (Nørgård) | `serie-infinie` | 240 × 162 |
| Sherpa ASR | `sherpa-asr` | 240 × 118 |
| Shift formants | `shift-formants` | 240 × 118 |
| Shimmer | `shimmer` | 240 × 118 |
| Boucle | `simple-boucle` | 240 × 118 |
| Sinusoïdes + bruit (SMS) | `sms-sinusoides-bruit` | 240 × 162 |
| SoundTouch Vitesse | `soundtouch-rate` | 240 × 118 |
| SoundTouch Tempo | `soundtouch-tempo` | 240 × 118 |
| SoundTouch Tonalité | `soundtouch-tonalite` | 240 × 118 |
| Spatialisation stéréo | `spatialisation-stereo` | 240 × 140 |
| Spatialiseur | `spatialiseur` | 240 × 184 |
| Spectre visible | `spectre-visible` | 240 × 140 |
| Spectrogramme fractal | `spectrogramme-fractal` | 240 × 140 |
| Spirale logarithmique | `spirale-logarithmique` | 240 × 140 |
| Spirale des quintes | `spirale-quintes` | 240 × 140 |
| Spirale spatiale | `spirale-spatiale` | 240 × 118 |
| SSP (Koenig) | `ssp-koenig` | 240 × 140 |
| Stable Audio 3 | `stable-audio-3` | 240 × 118 |
| Sinus + transitoires + bruit (STN) | `stn-sinus-transitoires-bruit` | 240 × 162 |
| Suiveur de hauteur | `suiveur-hauteur` | 240 × 162 |
| Suppression de clics | `suppression-clics` | 240 × 140 |
| Synthèse par caractéristiques | `synthese-features` | 240 × 140 |
| Synthèse par scanning | `synthese-scanning` | 240 × 118 |
| Tempérament | `temperament` | 240 × 140 |
| Terrain d'onde | `terrain-onde` | 240 × 118 |
| Texte → MIDI | `texte-vers-midi` | 240 × 140 |
| Texture par statistiques | `texture-statistique` | 240 × 118 |
| Accord | `tonal-accord` | 240 × 118 |
| Analyse harmonique | `tonal-analyse` | 240 × 162 |
| Gamme | `tonal-gamme` | 240 × 118 |
| Grille d'accords | `tonal-grille` | 240 × 140 |
| Progression | `tonal-progression` | 240 × 118 |
| Transposer | `tonal-transposer` | 240 × 118 |
| Tonnetz | `tonnetz` | 240 × 162 |
| Tore | `tore` | 240 × 118 |
| Traçage spectral | `tracage-spectral` | 240 × 118 |
| Traduction OPUS-MT | `traduction-opus` | 240 × 118 |
| Transfert d'enveloppe | `transfert-enveloppe` | 240 × 162 |
| Transient Shaper | `transient-shaper` | 240 × 140 |
| Transposeur/Quantiseur MIDI | `transposeur-quantiseur-midi` | 240 × 118 |
| Tremolo | `tremolo` | 240 × 162 |
| Tremolo logistique | `tremolo-logistique` | 240 × 118 |
| Tresse | `tresse` | 240 × 118 |
| TTS Français | `tts-francais` | 240 × 118 |
| Kokoro TTS | `tts-kokoro` | 240 × 118 |
| MMS-TTS Multilingue | `tts-mms` | 240 × 118 |
| Piper TTS | `tts-piper` | 240 × 118 |
| SpeechT5 TTS | `tts-speecht5` | 240 × 118 |
| Instrument à vent | `vent-guide-onde` | 240 × 118 |
| Vibrato | `vibrato` | 240 × 162 |
| Vibrato logistique | `vibrato-logistique` | 240 × 118 |
| Vitesse MIDI | `vitesse-midi` | 240 × 140 |
| Vitesse variable | `vitesse-variable` | 240 × 140 |
| Vocoder | `vocoder` | 240 × 140 |
| Voice Changer | `voice-changer` | 240 × 118 |
| Renversements et voicings | `voicings-accords` | 240 × 140 |
| Voyelle chantée (FOF) | `voyelle-fof` | 240 × 118 |
| Wah-wah | `wahwah` | 240 × 162 |
| Wavesets (Wishart) | `wavesets-wishart` | 240 × 118 |
| Whisper (Anglais) | `whisper-en` | 240 × 118 |
| ZCR (Meyda) | `zcr-meyda` | 240 × 140 |
