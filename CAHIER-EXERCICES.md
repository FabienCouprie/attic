# Attic — Cahier d'exercices de recette

> Document de validation de la phase 1 du projet. Chaque section décrit un
> exercice à réaliser manuellement dans l'application. Cocher [ ] quand validé.
>
> **Prérequis** : lancer `npm run dev:electron` (ou `npm run dev` + navigateur).
> Vérifier que `tsc` 0 erreur · 26 tests · build OK avant de commencer.

---

## 1. Démarrage et interface

### 1.1 Lancement
- [ ] L'application démarre sans erreur dans la console
- [ ] La palette s'affiche à gauche, repliée au niveau des univers
- [ ] Le canevas occupe le centre, l'inspecteur est à droite
- [ ] La barre d'outils affiche le titre « Attic » + nombre de plugins
- [ ] Le bouton Run (vert) est visible et non couvert par Grouper/Dégrouper

### 1.2 Navigation dans la palette
- [ ] Cliquer sur un univers le déplie (ex : « Entrées »)
- [ ] Cliquer sur une famille la déplie (ex : « Audio »)
- [ ] Les nodes sont triés par ordre alphabétique dans chaque famille
- [ ] La recherche filtre les nodes (ex : taper « delay »)
- [ ] Les résultats de recherche déplient tout automatiquement

### 1.3 Bascule bilingue FR/EN
- [ ] Cliquer sur le toggle FR/EN (en haut à droite)
- [ ] Les univers se traduisent (Entrées → Inputs, Traitement → Processing…)
- [ ] Les familles se traduisent (Effets → Effects, Écoute → Monitoring…)
- [ ] Les noms des nodes se traduisent
- [ ] Les notices (« en savoir plus ») se traduisent
- [ ] Les docs de paramètres (« ? ») se traduisent
- [ ] Revenir en français

---

## 2. Workflow audio de base

### 2.1 Chaîne simple
- [ ] Glisser un node « Entrée audio » sur le canevas
- [ ] Charger un fichier audio (WAV ou MP3) via le bouton du node
- [ ] Le nom du fichier s'affiche, un lecteur audio apparaît
- [ ] Glisser un node « Sortie audio »
- [ ] Relier la sortie de l'Entrée audio à l'entrée de la Sortie audio (drag)
- [ ] L'arête est verte (type audio)
- [ ] Cliquer ▶ sur le node Entrée audio → statut « Terminé »
- [ ] Le lecteur de la Sortie audio joue le son
- [ ] Barre d'espace = lancer tout le graphe

### 2.2 Effets en chaîne
- [ ] Insérer un « Filtre » entre l'Entrée et la Sortie
- [ ] Régler la fréquence de coupure à 500 Hz (passe-bas)
- [ ] Lancer → le son est atténué dans les aigus
- [ ] Insérer un « Compresseur » après le filtre
- [ ] Régler le seuil à −20 dB, ratio 4:1
- [ ] Lancer → le son est compressé (plus dense)

### 2.3 Inspecteur
- [ ] Sélectionner un node → l'inspecteur affiche ses paramètres
- [ ] Changer un paramètre → le node se met à jour
- [ ] La notice « en savoir plus » se déplie/replie
- [ ] Les info-bulles « ? » des paramètres s'affichent
- [ ] Le bouton ↺ réinitialise le node (statut → attente, résultat effacé)

---

## 3. Copier/coller et suppression

### 3.1 Copier/coller
- [ ] Sélectionner un node configuré (ex : Filtre avec coupure réglée)
- [ ] Ctrl+C → rien de visible mais le node est copié
- [ ] Ctrl+V → un nouveau node apparaît, décalé, avec les mêmes paramètres
- [ ] Le node copié a un nom et des ports identiques
- [ ] Modifier la copie n'affecte pas l'original

### 3.2 Suppression
- [ ] Sélectionner un node, cliquer × sur le node → le node disparaît
- [ ] L'inspecteur se vide (ne reste pas planté sur l'ancien node)
- [ ] Les arêtes connectées au node supprimé disparaissent aussi
- [ ] Sélectionner un node, appuyer sur Suppr → même comportement
- [ ] Supprimer via l'inspecteur (bouton ×) → l'inspecteur se vide

---

## 4. Méta-composants

### 4.1 Grouper
- [ ] Sélectionner 2 nodes (ctrl+clic ou rectangle de sélection)
- [ ] Cliquer « Grouper » → un méta-nœud remplace les 2 nodes
- [ ] Le méta apparaît dans la palette (univers « Méta-composants »)
- [ ] Double-clic sur le méta → ouvre l'intérieur + fil d'Ariane
- [ ] Les nœuds-frontière (entrée/sortie exposées) sont visibles
- [ ] Cliquer « Atelier » dans le fil d'Ariane → retour au graphe racine

### 4.2 Dégrouper
- [ ] Sélectionner le méta-nœud
- [ ] Cliquer « Dégrouper » → les 2 nodes originaux réapparaissent
- [ ] Le méta disparaît de la palette

### 4.3 Persistance
- [ ] Créer un méta, quitter l'app, relancer → le méta est toujours dans la palette
- [ ] Supprimer un méta via le × dans la palette → il disparaît + ses instances du graphe

---

## 5. Effets audio

### 5.1 Réverbération à convolution (IR)
- [ ] Brancher de l'audio sur le node « Réverbération à convolution (IR) »
- [ ] Régler Type = Hall, Decay = 3s, Mix = 50%
- [ ] Lancer → le son a une réverbération
- [ ] Changer Type = Spring → le son change (caractéristique ressort)
- [ ] Charger un fichier IR externe (WAV) via le bouton → les paramètres de synthèse sont ignorés
- [ ] L'IR externe fonctionne

### 5.2 Bitcrusher
- [ ] Brancher de l'audio
- [ ] Régler Bits = 4, Fréquence = 8000 Hz, Mix = 100%
- [ ] Lancer → le son est très crunch/aliased (style 8-bit)
- [ ] Bits = 16, Fréquence = 44100 → le son est quasi inchangé

### 5.3 Gate/Expandeur
- [ ] Brancher un audio avec des silences (ex : voix avec bruit de fond)
- [ ] Mode Gate, Seuil = −40 dB, Atténuation = 40 dB
- [ ] Lancer → le bruit de fond est coupé pendant les silences
- [ ] Mode Expandeur, Ratio = 4 → atténuation plus douce

### 5.4 De-esser
- [ ] Brancher une voix avec des sibilances (s, ch, sh)
- [ ] Fréquence = 7000 Hz, Seuil = −20 dB, Ratio = 3
- [ ] Lancer → les sibilances sont atténuées

### 5.5 Ring modulator
- [ ] Brancher un son continu (ex : Générateur de fréquence 440 Hz)
- [ ] Fréquence porteuse = 200 Hz, Mix = 100%
- [ ] Lancer → le son produit des sidebands (métallique/alien)

---

## 6. Générateurs

### 6.1 Générateur de fréquence
- [ ] Mode Fréquence, 440 Hz, Sinus, 2s → un La pur
- [ ] Mode Note, « A4 », Sinus → même résultat
- [ ] Mode Note, « C#5 », Carré → son riche 8-bit
- [ ] Vérifier le fondu anti-clic (pas de clic au début/fin)

### 6.2 Métronome
- [ ] Tempo = 120 BPM, 4/4, Durée = 10s, Timbre = Clic
- [ ] Lancer → clics réguliers, 1er temps accentué
- [ ] Changer en 3/4 → motif à 3 temps
- [ ] Changer en Woodblock → son différent

### 6.3 Générateur de bruit
- [ ] Type = Blanc, 2s → spectre plat (vérifier avec Analyseur de spectre)
- [ ] Type = Rose → −3 dB/octave
- [ ] Type = Brownien → −6 dB/octave, son grave

### 6.4 Séquenceur de batterie
- [ ] Cliquer des cases dans la grille → le motif se met à jour
- [ ] Tempo = 120, 16 pas → kicks réguliers
- [ ] Changer en 32 pas → grille s'étend
- [ ] Swing = 50% → groove ternaire

### 6.5 Séquenceur mélodique
- [ ] Cliquer des cases dans le piano-roll → notes activées
- [ ] Changer la gamme (ex : pentatonique) → les rangées changent
- [ ] La fondamentale est surlignée en jaune
- [ ] Changer le timbre (Carré) → son différent
- [ ] Lancer → la mélodie se joue

---

## 7. Réservoirs neuronaux

### 7.1 Réservoir audio
- [ ] Lancer le node → une mélodie émergente se joue
- [ ] Changer Neurones = 5 → motif plus court/répétitif
- [ ] Changer Neurones = 40 → motif plus complexe
- [ ] Spectre = 150% → son chaotique (divergent)
- [ ] Graine = 12345 → reproductible (même mélodie à chaque lancement)
- [ ] Graine = 0 → nouvelle mélodie à chaque lancement

### 7.2 Réservoir MIDI
- [ ] Lancer → un fichier MIDI est généré (sortie port orange)
- [ ] Brancher sur « Sortie MIDI » → la mélodie se joue via FM/SoundFont
- [ ] Brancher sur « Transposeur/Quantiseur » puis « Sortie MIDI » → mélodie transformée

### 7.3 Multi-réservoirs
- [ ] Lancer → une pièce polyphonique (mélodie + basse + harmonie + rythme)
- [ ] Influence = 0% → les 4 voix sont indépendantes
- [ ] Influence = 100% → les voix ne jouent que sur les pas rythmiques

### 7.4 Évolution de réservoirs
- [ ] Lancer → individu 1/6 de génération 1
- [ ] Écouter, cliquer ♥ (j'aime) ou ✗ (j'aime pas)
- [ ] Naviguer ◀/▶ entre les individus
- [ ] Cliquer ↻ Évoluer → génération 2 (nouveaux individus)
- [ ] Après 3-4 générations, les mélodies s'améliorent (adaptées au goût)

---

## 8. IA générative (Transformers.js)

### 8.1 MusicGen
- [ ] Saisir un prompt : « A happy upbeat pop song with electric guitars »
- [ ] Durée = 10s, Guidance = 3
- [ ] Lancer (premier lancement = long : téléchargement ~300 MB)
- [ ] La musique générée se joue
- [ ] Relancer → plus rapide (modèle en cache)

### 8.2 SpeechT5 TTS
- [ ] Brancher une « Source de texte » (min 35 caractères) sur l'entrée
- [ ] Choisir voix BDL (homme américain)
- [ ] Lancer → la parole est synthétisée en anglais
- [ ] Changer voix SLT (femme) → voix différente

### 8.3 MMS-TTS Multilingue
- [ ] Brancher une Source de texte
- [ ] Langue = Français
- [ ] Lancer → la parole est en français

### 8.4 Whisper (Anglais)
- [ ] Brancher un enregistrement vocal en anglais
- [ ] Lancer → le texte transcrit s'affiche + sur la sortie texte
- [ ] Vérifier la qualité de la transcription

### 8.5 Whisper (Multilingue)
- [ ] Brancher un enregistrement vocal en français
- [ ] Langue = Auto, Traduire = Non
- [ ] Lancer → texte transcrit en français
- [ ] Traduire = Oui → texte traduit en anglais

---

## 9. Collections de données

### 9.1 Noms d'instruments
- [ ] Famille = Cordes → la liste ne contient que des cordes
- [ ] Format = Retour ligne → les noms sont sur des lignes séparées
- [ ] Lancer → le texte est émis sur la sortie (port bleu)
- [ ] Passer en EN → les noms sont en anglais

### 9.2 Styles musicaux
- [ ] Catégorie = Rock → liste de styles rock
- [ ] Catégorie = Toutes → tous les styles mélangés
- [ ] Passer en EN → les styles sont en anglais

### 9.3 Émotions
- [ ] Catégorie = Joie/Bonheur → liste d'émotions positives
- [ ] Format = Puces → liste avec « • »

### 9.4 Tessitures de voix
- [ ] Groupe = Hommes → tessitures masculines avec plages en notes
- [ ] Groupe = Femmes → tessitures féminines

---

## 10. Outils IA (script + couleurs)

### 10.1 Générateur de script IA
- [ ] Brancher les 4 sources (Instruments, Styles, Émotions, Tessitures) sur les 4 entrées
- [ ] Lancer → un script structuré est généré (style, instruments, émotions, voix, prompt, tags)
- [ ] Changer la graine → un nouveau tirage aléatoire

### 10.2 Combinaison de couleurs
- [ ] Couleur 1 = Bleu → script avec mélancolie/blues
- [ ] Couleur 2 = Rouge → fusion des profils (bleu + rouge)
- [ ] Le script est en anglais (prêt pour Suno)
- [ ] Passer en EN → les noms de couleurs se traduisent dans l'interface

### 10.3 Traduction
- [ ] Source de texte (français) → Traduction OPUS-MT, paire = Français → Anglais
- [ ] Lancer → texte traduit en anglais sur la sortie
- [ ] Source de texte → Traduction Whisper → texte anglais

---

## 11. Text to Speech / Speech to Text

### 11.1 Source de texte
- [ ] Le node a une zone de texte éditable (textarea)
- [ ] Le compteur affiche le nombre de caractères (min 35)
- [ ] Le contour est rouge si < 35 caractères
- [ ] Le node est redimensionnable (coins/edges)
- [ ] On peut saisir des espaces

### 11.2 Chaîne TTS → Whisper
- [ ] Source de texte → SpeechT5 TTS → audio
- [ ] Audio → Whisper (Anglais) → texte
- [ ] Le texte transcrit correspond (approximativement) au texte source

---

## 12. Séparation IA

### 12.1 Demucs 6s (nécessite Electron)
- [ ] Brancher un mix audio sur « Séparateur IA »
- [ ] Modèle = Demucs 6s (par défaut)
- [ ] Lancer → 6 pistes (batterie, basse, autre, voix, guitare, piano)
- [ ] Chaque sortie produit un son distinct
- [ ] Modèle = Demucs (HT) → 4 pistes (guitare/piano = null)

### 12.2 MDX-Net
- [ ] Modèle = MDX-Net
- [ ] Lancer → voix + instrumental (2 pistes)

---

## 13. MIDI

### 13.1 Lecteur MIDI → sortie MIDI
- [ ] Charger un fichier MIDI dans « Lecteur MIDI »
- [ ] La sortie MIDI (port orange) est disponible
- [ ] Brancher sur « Sortie MIDI » → le MIDI est synthétisé en audio

### 13.2 Transposeur/Quantiseur
- [ ] Lecteur MIDI → Transposeur (Transposition = +5)
- [ ] → Sortie MIDI → le son est plus aigu
- [ ] Quantisation = 1/16 → les notes sont alignées sur la grille

### 13.3 Arpégiateur
- [ ] Lecteur MIDI → Arpégiateur (Direction = Montant, Vitesse = 1/16)
- [ ] → Sortie MIDI → les accords sont arpégés
- [ ] Changer Direction = UpDown → aller-retour
- [ ] Octaves = 2 → l'arpège s'étend sur 2 octaves

### 13.4 Détecteur d'accords
- [ ] Brancher un fichier audio harmonique
- [ ] Lancer → la progression d'accords s'affiche dans le node (avec timestamps)
- [ ] Régler la fenêtre d'analyse à 0.2s → détection plus fine

---

## 14. Visualisation

### 14.1 Analyseur de spectre
- [ ] Brancher un son → le spectre s'affiche (barres de fréquence)
- [ ] Un sinus 440 Hz → pic net à 440 Hz
- [ ] Bascule log/linéaire → l'axe change

### 14.2 Spectrogramme
- [ ] Brancher un son → spectrogramme 2D (temps × fréquence × couleur)
- [ ] Un son harmonique → lignes horizontales (harmoniques)

### 14.3 Oscillateur pédagogique
- [ ] Lancer → l'onde + les harmoniques s'affichent
- [ ] Sinus → 1 raie ; Carré → harmoniques impaires ; Scie → toutes

### 14.4 Réponse de filtre
- [ ] Régler Type = Passe-bas, Coupure = 1000 Hz, Q = 1
- [ ] La courbe de gain se trace instantanément (sans exécution)

### 14.5 VU-mètre / LUFS
- [ ] Brancher un son → 4 bargraphes (RMS, Peak, True Peak, LUFS)
- [ ] Les valeurs en dB s'affichent sous chaque barre
- [ ] Crest factor et LRA s'affichent

### 14.6 ColorSynth
- [ ] Brancher un son → palette de 6 couleurs (Sub → Air)
- [ ] Un son grave → couleurs chaudes dominantes
- [ ] Un son aigu → couleurs froides dominantes
- [ ] Liseré lumineux au niveau d'énergie de chaque bande

---

## 15. Aligneur de piste

### 15.1 Piste trop courte
- [ ] Référence = 10s, Piste = 5s
- [ ] Position = Après → piste au début, 5s de silence à la fin
- [ ] Position = Avant → 5s de silence au début, piste à la fin
- [ ] La sortie fait bien 10s

### 15.2 Piste trop longue
- [ ] Référence = 5s, Piste = 10s
- [ ] Position = Avant → garde le début, fade out à la fin
- [ ] Position = Après → fade in au début, garde la fin
- [ ] La sortie fait bien 5s

### 15.3 Pistes de même longueur
- [ ] Référence = 5s, Piste = 5s
- [ ] Aucune modification — copie exacte, pas de fade

---

## 16. Prompt → graphe

### 16.1 Génération
- [ ] Saisir : « delay stéréo avec feedback sur une réverbération hall puis compresseur et sortie »
- [ ] Lancer → les nodes apparaissent sur le canevas, connectés en chaîne
- [ ] La chaîne contient bien : Entrée audio → Delay → Réverbération → Compresseur → Sortie audio
- [ ] Les nodes ont leurs paramètres par défaut

### 16.2 Prompt minimal
- [ ] Saisir : « bruit puis sortie »
- [ ] Lancer → Bruit → Sortie audio (2 nodes connectés)

---

## 17. Graphe embarqué

### 17.1 Export avec graphe
- [ ] Créer un graphe simple (Entrée → Filtre → Sortie)
- [ ] Ajouter un node « WAV → MP3 » ou « MP3 → WAV »
- [ ] Lancer → le fichier exporté contient le graphe dans ses métadonnées

### 17.2 Import avec récupération
- [ ] Charger le fichier exporté dans un node « Entrée audio »
- [ ] Lancer → message « Graphe embarqué détecté ! N nodes · M connexions »
- [ ] Les nodes du graphe original apparaissent sur le canevas

---

## 18. Générateur de pochette

### 18.1 Génération
- [ ] Prompt = « dark ambient night », Titre = « Nocturne », Style = bauhaus
- [ ] La pochette s'affiche dans le node (canvas 512×512)
- [ ] Le titre et l'artiste sont insérés dans l'image
- [ ] Cliquer ⬇ PNG → télécharge l'image

### 18.2 Variations
- [ ] Changer Style = concentrique → la pochette change
- [ ] Changer Prompt = « fire rock energy » → couleurs chaudes (rouge/orange)
- [ ] Changer Graine = 42 → même pochette à chaque fois
- [ ] Graine = 0 → nouvelle pochette à chaque exécution

---

## 19. Persistance (export/import)

### 19.1 Export
- [ ] Créer un graphe avec 3-4 nodes
- [ ] Cliquer Export (ou Ctrl+S) → un fichier JSON est téléchargé

### 19.2 Import
- [ ] Cliquer Import (ou Ctrl+O) → sélectionner le JSON
- [ ] Le graphe est restauré (nodes, edges, paramètres)
- [ ] Les méta-composants sont restaurés

---

## 20. Thème

### 20.1 Bascule clair/sombre
- [ ] Cliquer l'icône thème → bascule entre clair et noir
- [ ] Les couleurs des nodes, palette, inspecteur s'adaptent
- [ ] Relancer → le thème est conservé

---

## 21. Copie de texte depuis un node

### 21.1 Bouton de copie
- [ ] Exécuter un « Lecteur d'analyse » ou « Détecteur d'accords »
- [ ] Le bouton ⧉ apparaît en haut à droite du message
- [ ] Cliquer ⧉ → le texte est copié dans le presse-papier
- [ ] Coller (Ctrl+V) dans un éditeur externe → le texte est là

---

## 22. Onglets

### 22.1 Multi-onglets
- [ ] Cliquer + → un nouvel onglet vide apparaît
- [ ] Créer un graphe dans l'onglet 1, un autre dans l'onglet 2
- [ ] Basculer entre les onglets → chaque graphe est conservé
- [ ] Fermer un onglet → le graphe est perdu (normal, pas de sauvegarde auto)

---

## Récapitulatif

| Catégorie | Exercices | Validés |
|---|---|---|
| Démarrage & UI | 11 | ___ / 11 |
| Workflow audio | 14 | ___ / 14 |
| Copier/coller | 7 | ___ / 7 |
| Méta-composants | 8 | ___ / 8 |
| Effets | 14 | ___ / 14 |
| Générateurs | 17 | ___ / 17 |
| Réservoirs | 15 | ___ / 15 |
| IA générative | 12 | ___ / 12 |
| Collections | 10 | ___ / 10 |
| Outils IA | 7 | ___ / 7 |
| TTS / STT | 7 | ___ / 7 |
| Séparation IA | 6 | ___ / 6 |
| MIDI | 12 | ___ / 12 |
| Visualisation | 16 | ___ / 16 |
| Aligneur | 6 | ___ / 6 |
| Prompt → graphe | 4 | ___ / 4 |
| Graphe embarqué | 4 | ___ / 4 |
| Pochette | 6 | ___ / 6 |
| Persistance | 4 | ___ / 4 |
| Thème | 2 | ___ / 2 |
| Copie de texte | 2 | ___ / 2 |
| Onglets | 2 | ___ / 2 |
| **Total** | **~176** | ___ / 176 |
