# Attic — Roadmap

Suivi du reste à faire, priorisé. Voir aussi `ARCHITECTURE.md` (spec technique du
framework) et `Atelier-Specification.md` (spec conceptuelle §3).

État vérifié en continu : **tsc 0 erreur · 26 tests unitaires · build OK**.

---

## ✅ Fait (session 2026-07)

### Séparation IA
- ✅ **Séparateur IA 6-stem** — Demucs 6s (258 MB, `public/oonx/htdemucs_6s.onnx`) ajouté. 6 pistes : batterie, basse, autre, voix, guitare, piano. Par défaut.
- ✅ **MDX-Net corrigé** — modèle `UVR_MDXNET_9482` (29.7 MB) téléchargé et câblé. Les 3 modèles sont embarqués.
- ✅ **`extraResources`** — modèles ONNX livrés hors asar via `electron-builder` (`process.resourcesPath/oonx/`). Pas de duplication dans `dist/`.

### Effets
- ✅ **Réverbération à convolution (IR)** — `reverbe-convolution` : IR synthétique (5 types : Room/Hall/Plate/Spring/Cathédrale, pre-delay, damping, decay, mix) + chargement IR externe (WAV).
- ✅ **Bitcrusher** — quantification (1-16 bits) + sous-échantillonnage (1-44 kHz) + mix.
- ✅ **Gate/Expandeur** — 2 modes, seuil, ratio, attaque, relâchement, atténuation plancher.
- ✅ **De-esser** — compression dynamique des sibilances (sidechain passe-bande 5-9 kHz).
- ✅ **Ring modulator** — multiplication par porteuse sinusoïdale (1-8000 Hz), sidebands.

### Générateurs
- ✅ **Séquenceur mélodique** — grille piano-roll 13 rangées × 8/16/32 pas, 5 gammes, 4 timbres, clé/octave/tempo/swing.
- ✅ **Générateur de fréquence** — saisie Hz ou note (A4, C#5, Bb3), 4 formes d'onde, fondu anti-clic.
- ✅ **Métronome** — clic régulier 40-240 BPM, 6 signatures, 3 timbres (Clic/Woodblock/Bip), accentuation.
- ✅ **VU-mètre / LUFS** — bargraphes RMS, Peak, True Peak (dBTP), LUFS (K-weighting ITU-R BS.1770) + crest factor + LRA. Vue canvas.
- ✅ **Réservoir neuronal** — générateur par réseau de neurones aléatoires (Reservoir Computing, inspiré Allendia/EVY). 16 paramètres (neurones, connectivité, mémoire, spectre, gamme, graine, etc.). Aucun entraînement, aucun modèle, JS pur.

### MIDI
- ✅ **Arpégiateur MIDI** — 5 directions (Up/Down/UpDown/DownUp/Random), motifs intra-accord, 5 vitesses, 1-4 octaves, durée note réglable.
- ✅ **Transposeur/Quantiseur MIDI** — transposition ±24 demi-tons, quantisation (1/4 à 1/32 + triplets), option quantifier fins.
- ✅ **Détecteur d'accords** — chromagramme fenêtré + templates (10 types d'accords), progression avec horodatage. Vue intégrée.
- ✅ **Lecteur MIDI** — ajout d'une sortie MIDI (port orange) pour chaîner vers l'arpégiateur/transposeur.

### IA générative (Transformers.js + ONNX)
- ✅ **MusicGen** — génération de musique depuis un prompt texte (`Xenova/musicgen-small`, Web Worker, auto-download HuggingFace).
- ✅ **SpeechT5 TTS** — synthèse vocale anglais, 7 voix (CMU Arctic embeddings).
- ✅ **MMS-TTS Multilingue** — 10 langues (Meta MMS, un modèle par langue).
- ✅ **Whisper (Anglais)** — transcription vocale ASR (`whisper-base.en`, ~75 MB).
- ✅ **Whisper (Multilingue)** — 99 langues + option traduction vers anglais (`whisper-large-v2`, ~1.5 GB).
- ✅ **Traduction Whisper** — texte → TTS → Whisper translate → texte anglais (chaîne interne).
- ✅ **Traduction OPUS-MT** — 18 paires de langues texte→texte (modèles légers ~30 MB).

### Collections de données
- ✅ **Styles musicaux** — 200+ styles par 11 catégories (Rock/Métal/Pop/Électronique/Hip-Hop/Jazz/Blues-Soul-Funk/Country-Folk/Reggae-Latin/Classique/World).
- ✅ **Émotions** — 160+ émotions par 8 catégories (Joie/Tristesse/Colère/Peur/Amour/Surprise/Dégoût/Mixte).
- ✅ **Tessitures de voix** — 31 tessitures par 3 groupes (Hommes/Femmes/Enfants), avec plages en notes.

### Outils IA
- ✅ **Générateur de script IA** — combine aléatoirement instruments + styles + émotions + tessitures → prompt structuré pour Suno/Udio.
- ✅ **Combinaison de couleurs** — 1 ou 2 couleurs → script IA musical (psychologie des couleurs + synesthésie). 11 couleurs, fusion de profils.
- ✅ **Source de texte** — saisie texte sur le nœud (textarea redimensionnable, min 35 caractères), sortie port bleu.

### i18n
- ✅ **`optionsEn`** — ajout du champ `optionsEn?: string[]` à `ParametreDef` pour traduire les dropdowns bilingues.
- ✅ **Famille « Text to Speech » / « Speech to Text »** — ajoutées au dictionnaire i18n.
- ✅ **Tri alphabétique** des nodes dans chaque famille du catalogue.

### UI / robustesse
- ✅ **Copier/coller de nœuds** — Ctrl+C / Ctrl+V, nouvel id + callbacks re-créés.
- ✅ **Fix : suppression de nœud** — `setSel(null)` quand le nœud supprimé était sélectionné (inspector ne reste plus planté).
- ✅ **Fix : reset `scriptGenere`** — le reset du nœud efface maintenant `scriptGenere` (champ texte).
- ✅ **Fix : chevauchement CSS** — boutons Grouper/Dégrouper déplacés à gauche sous la barre d'outils.
- ✅ **Palette : tri alphabétique** des nodes par nom affiché dans chaque famille.

---

## 1. Vision « Studio pédagogique »

### 1.1 Parcours guidés interactifs
Workflows pré-construits embarqués (`presets/`) avec annotations pédagogiques sur le canevas :
- « Comment fonctionne un compresseur ? »
- « La chaîne du mixage » : EQ → Compresseur → Reverb → Limiteur
- « Synthèse soustractive » avec tutoriel interactif
- Exercices (« changez le seuil et écoutez la différence »)

### 1.2 Comparateur pédagogique A/B
Version enrichie du comparateur A/B : affichage **simultané** des deux formes d'onde/spectres côte à côte + **diff spectral** (fréquences qui diffèrent en rouge).

### 1.3 Annotateur de forme d'onde
Marqueurs textuels sur la forme d'onde (« refrain », « couplet », « solo ») — persistés avec le graphe. Un parcours peut pré-annoter un extrait et poser des questions.

---

## 2. Vision « Atelier IA créatif »

### 2.1 Réservoir neuronal MIDI
Version MIDI du réservoir — génère des fichiers MIDI branchables sur Transposeur/Quantiseur, Arpégiateur ou Sortie MIDI. Permet de chaîner plusieurs réservoirs.

### 2.2 Multi-réservoirs en réseau
Un node qui connecte plusieurs réservoirs en parallèle/série (mélodie, basse, harmonie, rythme). Chaque réservoir « écoute » les autres via une entrée de contrôle → émergence polyphonique.

### 2.3 Évolution génétique de réservoirs
Un méta-node qui fait évoluer une population de réservoirs : mutation aléatoire des poids/paramètres, sélection par l'utilisateur (j'aime / j'aime pas), croisement. Après quelques générations, le réservoir s'adapte au goût. Pas d'entraînement — de la sélection naturelle.

### 2.4 ColorSynth
L'inverse du node « Combinaison de couleurs » : écoute le signal audio et déduit une palette de couleurs. Spectre → espace colorimétrique (basses = chaud, aigus = froid). Vue canvas. Pédagogique : « voir » le timbre.

### 2.5 Prompt musical → graphe
Un node qui prend un prompt texte (« un delay stéréo avec feedback court sur une réverbération hall ») et génère le graphe correspondant en reliant automatiquement les nodes. Parser de règles mots-clés → plugins + connexions. Magique pour la découverte.

---

## 3. Vision « Laboratoire multi-domaines »

### 3.1 Domaine image (proof of concept)
Un adaptateur image minimal pour prouver la règle d'or :
- Types de flux : `image` (rouge), `masque` (jaune)
- Nodes : Charger image, Flou gaussien, Seuil, Convolution 3×3, Composition alpha, Aperçu image
- Vues : `<canvas>` dans le node
- Même cœur, même palette, même inspecteur, même persistance
- **Objectif** : prouver que « livrer un nouveau domaine = fournir un adaptateur, sans modifier core ni UI »

### 3.2 Domaine données/ETL
- Types de flux : `table` (vert), `schéma` (orange)
- Nodes : Charger CSV, Filtrer, Agrégation, Jointure, Exporter
- Vues : mini-tableau dans le node

### 3.3 Visualiseur cross-domaine
Un node générique qui affiche n'importe quel type de flux (audio = forme d'onde, image = pixels, table = lignes/colonnes). Démontre la neutralité du cœur.

---

## 4. Vision « Plateforme collaborative »

### 4.1 Galerie de presets communautaires
Une page web ou un node « Importer depuis la galerie » listant des graphes partagés. Description, tags, preview audio. Import en un clic. Stockage sur HuggingFace ou GitHub (fichiers JSON).

### 4.2 Export audio + graphe embarqué
Le graphe qui a produit un WAV/MP3 est embarqué dans les métadonnées (chunk `INFO` du WAV ou tag ID3 du MP3). Importer le fichier audio dans Attic récupère le graphe — reproduction exacte.

### 4.3 Plugin system (user-defined nodes)
Créer son propre node sans coder : définir entrées/sorties/paramètres via UI, écrire `executer` en JS dans un éditeur intégré, enregistré dynamiquement (localStorage, exportable JSON).

### 4.4 Live coding / performance mode
Mode plein écran : palette repliée, contrôles macro (molettes), MIDI learn (assigner un contrôleur à un paramètre), exécution continue. Le musicien « joue » le graphe.

---

## 5. Robustesse & raffinements (transverse)

| # | Tâche | Priorité |
|---|---|---|
| 1 | **Ids de port stables** (au lieu d'index positionnels) — réindexation casse les arêtes | Haute |
| 2 | **`lienExterne?`** dans `PluginDef` (« pour aller plus loin ») + rendu dans la notice | Moyenne |
| 3 | **Persistance des fichiers** en base64 dans le JSON | Moyenne |
| 4 | **Relocaliser `TypeValeur`** hors du cœur vers le domaine audio | Basse |
| 5 | **Sous-diviser** `audio/generation.ts` (889 l.), `audio/analyse.ts` (820 l.) | Basse |
| 6 | **Éclater** `ui/vues.tsx` en `ui/vues/*.tsx` (un fichier par vue) | Basse |
| 7 | **Compatibilité** `compatible` pour sous-typage stéréo/mono | Basse |

---

## Ordre suggéré

| # | Tâche | Effort | Valeur |
|---|---|---|---|
| 2.1 | Réservoir MIDI | Faible | Forte — débloque le chaînage |
| 1.1 | Parcours guidés | Moyen | Forte — pédagogique = mission |
| 3.1 | Domaine image | Moyen | Stratégique — prouve le framework |
| 4.3 | Plugin user-defined | Moyen | Forte — extensible sans coder |
| 2.5 | Prompt → graphe | Faible | Magique — découverte |
| 2.3 | Évolution génétique | Moyen | Unique — aucune autre app fait ça |
| 4.4 | Live mode | Élevé | Forte pour la performance |
| 4.2 | Graphe embarqué | Faible | Élégant — reproductibilité |
| 2.2 | Multi-réservoirs | Moyen | Unique — émergence polyphonique |
| 2.4 | ColorSynth | Faible | Pédagogique — voir le son |
| 4.1 | Galerie communautaire | Élevé | Long terme |
| 1.2 | A/B pédagogique | Faible | Pédagogique |
| 1.3 | Annotateur | Faible | Pédagogique |
| 3.2 | Domaine ETL | Élevé | Stratégique mais moins urgent |
| 3.3 | Visualiseur cross | Moyen | Technique |
