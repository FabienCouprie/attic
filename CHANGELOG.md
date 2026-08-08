# Changelog

All notable changes to Attic. Format based on [Keep a Changelog](https://keepachangelog.com/).

## [Unreleased]

### Added
- **Générateur d'accords et Groove Box : extension 7e/6e.** Nouveau paramètre « Extension » (Aucune/7e/6e) ajoutant une 4e note diatonique à chaque accord, en plus de la triade fondamentale-tierce-quinte déjà en place. La 7e est déterminée par comparaison entre 7e mineure et 7e majeure (celle dont l'écart réel à la gamme choisie est le plus petit gagne), pas par une cible fixe — sinon 6e (9 demi-tons) et 7e majeure (11 demi-tons) sont à égale distance d'une cible médiane et le résultat serait arbitraire. Vérifié sur les 7 modes heptatoniques : Cmaj7 sur Majeur/Lydien, C7 dominant sur Mixolydien, Cm7 sur Mineur naturel/Dorien/Phrygien, Cm7♭5 demi-diminué sur Locrien. Comportement par défaut (Aucune) inchangé pour les projets existants.

### Fixed
- **Numéro de version figé dans la barre d'outils.** Le `v1.1.2` affiché en haut de l'app était une chaîne codée en dur dans `BarreOutils.tsx`, jamais mise à jour depuis — sans lien avec la version réellement installée. Corrigé en l'injectant depuis `package.json` au build (`vite.config.ts`, option `define`), vérifié dans le bundle de production réel (celui utilisé pour l'app Electron packagée), pas seulement le serveur de dev.
- **Grille d'accords : tonalité en champ texte libre au lieu d'une liste déroulante.** Seul nœud de l'app où « Key »/« Tonalité » n'était pas un menu déroulant — corrigé, avec les 12 notes comme partout ailleurs. Au passage, l'exemple de la doc (« Dm » pour une tonalité mineure) ne fonctionnait en réalité pas du tout : `Progression.fromRomanNumerals` ignore silencieusement le suffixe « m » et retourne un résultat vide. Le mode mineur s'exprime en fait par la casse des chiffres romains dans le champ « Progression » (minuscules = accord mineur, ex. `i iv v VI`), pas par un suffixe sur la tonalité — doc corrigée en conséquence.
- **Grille d'accords : les chiffres romains avec extension (7e, maj7...) disparaissaient silencieusement.** La détection « Progression en chiffres romains vs symboles d'accords bruts » ne testait que si le premier jeton était entièrement composé de I/V/i/v — un jeton comme `IMaj7` ou `IV7` échouait ce test à cause du suffixe, tombait à tort en mode « symboles bruts », et comme « I »/« IV » ne sont pas des notes valides, l'accord ne produisait aucune note (sans erreur). La bibliothèque `tonal` gère pourtant nativement les extensions sur les chiffres romains (`V7` → G7, `IMaj7` → CMaj7). Corrigé en ne testant que le début du jeton plutôt que son intégralité — aucune ambiguïté possible puisqu'aucun symbole d'accord ne commence par I ou V (notes réelles : A–G).
- **Progression : tonalité en champ texte libre au lieu d'une liste déroulante.** Même correction que sur Grille d'accords, avec le même exemple de doc erroné (« Dm ») retiré — le mode mineur s'exprime par la casse des chiffres romains dans « Progression », pas par un suffixe sur la tonalité.
- **Gamme : tonique en champ texte libre au lieu d'une liste déroulante.** Même correction, pour cohérence avec les autres nœuds de théorie (Progression, Grille d'accords).
- **Analyse harmonique : le paramètre Style ignorait le mode détecté.** Jazz et Blues renvoyaient toujours une suggestion en accords majeurs (`ii V I`, grille de blues majeure), même quand la tonalité détectée était mineure — seul le style Pop tenait compte du mode. Corrigé : Jazz suggère désormais `ii V i` en mineur, Blues une grille en accords mineurs (`i i i i iv iv i i v iv i v`).

## [3.0.8] — 2026-08-08

### Added
- **Mélodie aléatoire, Musique fractale, Sampler personnalisé, Mappeur Mandelbrot, Arpège de Koch et Automate cellulaire : 5 nouveaux modes de gamme.** Dorien, Phrygien, Lydien, Mixolydien et Locrien s'ajoutent à Majeur, Mineur naturel, Mineur harmonique (nouveau sur Mandelbrot/Koch/Automate cellulaire), aux 2 gammes pentatoniques et à Chromatique déjà disponibles. Le paramètre `Gamme` de ces six nœuds n'avait pas d'`optionIds` — même bug que l'Oscillateur/Générateur d'accords plus tôt : en anglais, une gamme non reconnue retombait silencieusement sur la valeur par défaut. Corrigé partout, et les 6 copies dupliquées de la table de gammes fusionnées en une seule fonction partagée (`degresGammeMelodie`, `audio/generation.ts`).

### Fixed
- **Clé non reconnue en anglais sur Mélodie aléatoire, Musique fractale, Sampler personnalisé, Mappeur Mandelbrot et Arpège de Koch.** `DEMI_TONS_CLE` (`audio/commun.ts`) n'avait que des noms de notes français comme clés ; en anglais, sélectionner "C"/"D"/etc. ne correspondait à rien et retombait silencieusement sur Do, quelle que soit la note choisie. Corrigé en ajoutant les noms anglais directement dans la table (même technique que `traduireCle`, déjà robuste aux deux langues). Sampler personnalisé avait sa propre copie indépendante du même dict (repérée après coup) — remplacée par `DEMI_TONS_CLE` au passage. Automate cellulaire n'était pas concerné : il normalisait déjà FR/EN via sa propre fonction `normaliserCle`.
- **Filtre par catégorie vide en anglais sur Émotions, Noms d'instruments, Styles musicaux et Tessitures de voix.** Le paramètre de filtre (`Catégorie`/`Famille`/`Groupe`) n'avait pas d'`optionIds` ; les listes internes sont indexées par nom de catégorie français. En anglais, sélectionner une catégorie précise (autre que le défaut « All ») ne correspondait à aucune clé et renvoyait une liste **vide**, sans erreur — seul le cas par défaut « All → Toutes » était traité en dur. Corrigé en ajoutant `optionIds` (id canonique = le nom de catégorie français, qui sert déjà de clé aux dictionnaires internes) aux 4 nœuds.
- **Gamme incorrecte en anglais sur Séquenceur mélodique, Réservoir neuronal et Multi-réservoirs.** Même bug, un troisième système de gammes (`audio/melodie.ts`, `audio/reservoir.ts`) : le paramètre `Gamme` n'avait pas d'`optionIds`, indexé par nom français. En anglais, sélectionner une gamme retombait silencieusement sur Majeur — vérifié concrètement : demander la gamme mineure en anglais produisait des notes de la gamme majeure (ex. une septième majeure absente de la gamme mineure). Corrigé en ajoutant `optionIds` aux 3 nœuds (id canonique = le nom français, déjà utilisé comme clé interne — aucun changement aux fonctions de génération elles-mêmes).

### Changed
- **Nettoyage de code mort.** Suppression de `src/audio/evolution.ts` (moteur d'algorithme génétique pour réservoirs de neurones, jamais branché à aucun plugin — 3 de ses 4 fonctions n'étaient appelées nulle part, pas même entre elles) et de 3 fonctions jamais appelées : `bufferVersOggBlob`/`decoderAudioUrl` (`audio/io.ts`) et `chercherZoneInstrument` (`audio/soundfont.ts`, remplacée depuis longtemps par `chercherZonesInstrument`). Trouvé via un audit `knip`, vérifié à la main avant suppression.
- **Dépendances : 2 CVE high severity corrigées.** `nanoid` 3.3.16 → 3.3.18 (boucle infinie possible si `size=0`) et `js-yaml` 4.3.0 → 4.3.1 (consommation CPU quadratique sur `!!omap`) via `npm audit fix --force` — de simples montées de patch, aucun changement de version majeure. Les 7 alertes restantes (une seule CVE `image-size`, comptée une fois par paquet le long de la chaîne `@siteed/sherpa-onnx.rn → react-native → metro`) ne sont pas corrigeables sans risquer de casser l'extraction des binaires WASM sherpa-onnx, pour un code jamais exécuté par l'app (outillage de bundling React Native, présent uniquement comme dépendance incidente) — laissées telles quelles, décision assumée.

## [3.0.7] — 2026-08-07

### Changed
- **Texte → image : le modèle SDXS-512 est désormais embarqué dans l'installateur.** Le bundle ONNX (~680 Mo, quantifié int8) et son tokenizer sont inclus dans `assets.zip` et donc copiés dans `resources/oonx/sdxs-512-texte-image` de l'application packagée. Le paramètre « Chemin modèle » reste disponible pour un modèle personnalisé ; la valeur par défaut (vide) utilise le modèle embarqué.

## [3.0.6] — 2026-08-07

### Added
- **Nouveau nœud « Analyse émotionnelle ».** Associe une émotion à un morceau à partir de sa musique seule — tempo, mode majeur/mineur, énergie (RMS) et brillance spectrale (centroïde, via Meyda) — aucun texte ni parole n'est analysé. Ces indices sont combinés en un score valence/arousal (modèle circomplex de Russell, 1980 — le mode domine la valence d'après Gagnon & Peretz 2003, le tempo domine l'arousal), puis reprojetés sur 8 émotions nommées (Joyeux, Énergique, Tendu, Triste, Mélancolique, Calme, Serein, Content) ou « Neutre » si le signal est trop proche du centre. Entièrement heuristique, sans modèle ni entraînement — fonctionne comme le Détecteur d'accords ou l'Analyse audio existants, et se branche sur le nœud « Lecteur d'analyse » comme eux. `analyserAudio()` expose maintenant aussi `mode`/`modeConfiance` (majeur/mineur bruts), déjà calculés en interne mais pas encore exposés, réutilisés ici.
- **Palette harmonique : mode « Arpège ».** Le paramètre `Mode` propose maintenant Mélodie / Harmonie / Arpège, comme le nœud Dessin sonore. Arpège joue les notes de l'accord triadique l'une après l'autre (au lieu de simultanément en Harmonie, ou d'une seule note en Mélodie) sur la durée impartie à chaque couleur.

### Changed
- **Dessin sonore, Palette harmonique et Color Looper : mêmes gammes que le Générateur d'accords et Groove Box.** Les 7 modes heptatoniques (Dorien, Phrygien, Lydien, Mixolydien, Locrien, en plus de Majeur/Mineur naturel) sont maintenant disponibles sur ces trois nœuds, en plus des gammes déjà présentes (pentatoniques, blues, chromatique). Les trois nœuds partagent désormais la même table de gammes que les générateurs d'accords (`GAMMES_ACCORDS`), et leurs modes « Harmonie »/« Arpèges » construisent leur triade (tierce/quinte) en fonction de la gamme choisie au lieu d'une triade majeure/mineure figée — la quinte diminuée du Locrien est par exemple maintenant correctement prise en compte.

### Fixed
- **Générateur d'accords et Groove Box : paramètre « Progression » sans effet en anglais, et genre « Hip-hop » silencieusement remplacé par « Pop ».** Les deux nœuds comparaient le paramètre `Genre` à la chaîne française codée en dur `"personnalisé"` sans `optionIds` : en anglais, la valeur stockée était `"Custom"`, la comparaison échouait donc toujours et la progression personnalisée n'était jamais utilisée, quoi qu'on saisisse dans le champ « Progression » — d'où l'impression que ce paramètre ne servait à rien. Par ailleurs, le Générateur d'accords proposait l'option « hip-hop » (avec tiret) alors que la table interne des progressions par genre utilise la clé `hiphop` (sans tiret) : choisir « hip-hop » retombait donc silencieusement sur la progression de « pop ». Corrigé en ajoutant `optionIds` (ids canoniques stables, indépendants de la langue) au paramètre `Genre` des deux nœuds, avec la même clé `hiphop` que la table de progressions. Le paramètre `Progression` du Générateur d'accords, qui n'avait pas de description en français, précise maintenant qu'il n'est utilisé que si Genre = personnalisé — comme c'était déjà documenté côté Groove Box.
- **Générateur d'accords et Groove Box : gamme limitée à majeur/mineur.** Le paramètre `Gamme` propose maintenant les 7 modes heptatoniques (Majeur, Mineur naturel, Dorien, Phrygien, Lydien, Mixolydien, Locrien) et les 2 gammes pentatoniques (majeure, mineure) les plus courantes, au lieu de seulement majeur/mineur. La construction des accords (tierce et quinte) suit désormais la gamme choisie au lieu d'un intervalle fixe (tierce mineure + quinte juste) : elle retombe exactement sur le comportement précédent pour majeur/mineur, prend correctement en compte la quinte diminuée du mode Locrien, et généralise proprement aux gammes pentatoniques (qui n'ont pas de degré à exactement 2 crans d'écart, contrairement aux gammes à 7 notes).
- **Oscillateur : forme d'onde silencieuse selon la langue/l'historique du projet.** Le paramètre `Forme` n'avait pas d'`optionIds` (id canonique stable) : `executer()` comparait la valeur brute stockée à la chaîne affichée dans la langue courante (`"Sinus"`, `"Carré"`…). Un projet enregistré dans une langue puis rouvert dans l'autre (ou tout ancien projet dont la valeur ne correspondait plus exactement à l'option affichée) faisait échouer la comparaison sur toutes les formes, donnant `amp = 0` sur toutes les harmoniques — silence total sans erreur ni avertissement. Corrigé en ajoutant `optionIds: ["sine", "square", "sawtooth", "triangle"]`, comme le fait déjà le Générateur de fréquence pour le même paramètre : le contexte d'exécution résout désormais la valeur (FR, EN ou id) vers l'id canonique avant l'exécution du nœud.
- **Nœud Griffin-Lim quasi muet malgré un pic audio « sain ».** La reconstruction overlap-add divisait par `norm[i]` (somme des carrés de la fenêtre de Hann superposée) qui s'effondre près de zéro aux tout premiers/derniers échantillons du signal, faute de couverture complète par les trames voisines à cet endroit. Diviser par cette valeur quasi nulle amplifiait le moindre résidu numérique par un facteur énorme (mesuré : un seul échantillon en tout début de signal ~300 000× plus fort que le reste), ce qui dominait le rescale final du plugin et écrasait le reste du signal à un niveau quasi inaudible (RMS ~280× plus faible que le pic) — alors que le diagnostic du plugin, basé uniquement sur le pic, affichait des niveaux d'entrée/sortie identiques et donc a priori sains. Corrigé en bourrant le signal de `fftSize - hop` zéros de chaque côté avant analyse (retirés après resynthèse), pour que les bords bénéficient de la même couverture qu'en régime permanent — comme le fait `librosa` avec `center=True`. La phase aléatoire initiale progresse aussi désormais de façon cohérente d'une trame à l'autre (technique de phase vocoder), au lieu d'être indépendante par trame.

## [3.0.5] — 2026-08-06

### Security
- **Hard output clamp at -6 dBFS for the 5 sensitive nodes.** `formule-echantillons`, `formule-spectrale`, `generateur-audio-mathematique`, `julia-processor` and `python-processor` now clamp their audio output to `[-0.5, 0.5]`. Users can amplify downstream with an Amplifier node if they want more level.
- **Default volume 30% for formula nodes.** The three math formula nodes now default to 30% output volume.
- **First-run warning for formula nodes.** A one-time `window.confirm` warns about high-intensity signals before the first execution of any formula node.
- **VU meter on audio nodes.** The generic node player shows a peak/RMS level bar (green/orange/red) so users can see the output level.
- **Default player volume 30%.** The `<audio>` player in the node UI starts at 30% volume on each new audio load.
- **Preview limiter at -6 dBFS.** Preview WAV generation applies an additional -6 dBFS hard ceiling only for the 5 sensitive nodes.

### Fixed
- **English formula defaults used `ft` instead of `pi`.** `defautEn` for Sample Formula and Mathematical Audio Generator corrected from `sin(t * 2 * ft * 440)` to `sin(t * 2 * pi * 440)`.

## [3.0.3] — 2026-08-05

### Fixed
- **Nœud « Entrée texte » partiellement traduit en anglais.** Le placeholder et le compteur de caractères de la vue du nœud étaient codés en dur en français ; ils passent désormais par le dictionnaire i18n et s'affichent en anglais quand la langue est EN.
- **Passe de traduction anglaise.** Correction de nombreuses traductions anglaises erronées ou incomplètes : `chord(s)` (et non `agreement`), `drums` (et non `battery`), `vocal ranges` (et non `tesses`), `lyrics` (et non `words`), `steps` (et non `not`), la typo `seed`/`see`, les messages tronqués de Julia/Python/Pure Data, les messages mal formés d'export/install de nœud, et de nombreuses formulations de progress.
- **Bordure des ports de nœud en thème black.** Passe de `--bg-surface` à `--bg-node` dans `AtelierNode.tsx` pour un meilleur contraste sur le fond du nœud.

## [3.0.2] — 2026-08-05

### Fixed
- **Police Gras du générateur de pochette non appliquée.** Le style `"font-weight:900"` était injecté directement dans la balise SVG comme un attribut mal formé, sans guillemets ni préfixe `style=`. La police Gras (Impact) et l'italique Serif (Georgia) utilisent maintenant des attributs SVG valides (`font-weight="900"` / `font-style="italic"`).
- **Régression de renommage des méta-composants.** Le champ `data.nom` (nom personnalisé d'un méta-composant, d'un commentaire ou d'un cadre) n'était pas dans la liste `CHAMPS_UTILISATEUR`. Copier/coller un méta-composant renommé le faisait donc revenir à son nom par défaut. Le champ est désormais préservé comme les autres champs saisis par l'utilisateur.

### Changed
- **Stabilisation du test de réduction de bruit.** `effets-dynamique.test.ts` utilisait `Math.random()` pour générer le bruit de test, ce qui rendait le test `réduit l'énergie du bruit sur un signal sinus + bruit` aléatoirement instable. Un générateur pseudo-aléatoire déterministe (`mulberry32`) remplace désormais `Math.random()` dans ce fichier de test.
- **Thème black : liserets et anneau d'exécution en bleu connexion texte.** Dans le thème `data-theme="black"`, les liserets du nœud en cours d'exécution (`attic-node.running`) et du nœud terminé (`attic-node.termine`), ainsi que l'anneau de progression dans le coin bas droite (`attic-node-progress-ring-bar`), passent du vert au bleu des connexions texte (`#36a2eb`).

## [3.0.1] — 2026-08-05

### Fixed
- **Un nœud copié-collé (ou dupliqué) affichait/jouait le résultat de l'original avant même sa première exécution.** Ctrl+C copiait `data` du nœud sans filtre — y compris les champs de résultat calculés (`audioResultatBuffer`, `audioResultatUrl`, `audioResultatMessage`, etc.), pas seulement la configuration (`ficheId`, `parametres`). Le nœud collé affichait donc « En attente » tout en montrant/jouant l'audio (ou l'image) de l'original, jusqu'à sa propre exécution. Corrigé en filtrant via `CHAMPS_UTILISATEUR`, l'allowlist des champs réellement saisis par l'utilisateur déjà utilisée par la cascade de reset — même mécanisme, donc protège aussi par construction tout futur domaine (image, etc.) ajoutant ses propres champs de résultat.

## [3.0.0] — 2026-08-04

### Added
- **Partition MIDI** (`vexflow-midi`, Visualisation → Notation) — génère une portée SVG à partir d'un fichier MIDI. Accepte le MIDI en sortie du Transcripteur MIDI, du Lecteur MIDI, etc. Paramètres : tempo (0 = auto-détecté), canal (-1 = tous), quantification rythmique et clé. La sortie SVG (fichier) peut être exportée avec le nœud « Export SVG ».
- **Texte → image** (`texte-image`, Entrées → Image) — génère une image 512×512 depuis un prompt texte, en local, avec SDXS-512-0.9 (UNet distillé 1 pas + décodeur TAESD, quantifié int8, ~680 Mo, ~8-11 s/image en CPU pur). Tourne nativement via `onnxruntime-node` dans le process principal (même pattern que Demucs/Stable Audio 3). Le modèle n'est **pas** embarqué dans l'application (poids + provenance de licence pas totalement nette — distillé à partir de SD-Turbo, licence Stability AI Community, plus restrictive que la licence openrail++ déclarée par SDXS-512 lui-même) : publié en accès contrôlé ("gated", licence à accepter) sur Hugging Face à `Fcouprie/sdxs-512-texte-image`, à télécharger et placer soi-même via le paramètre « Chemin modèle » (sélecteur de dossier natif) — lien cliquable directement dans la notice du nœud.
- **Légende d'image** (`legende-image`, Traitement → Image) — décrit le contenu d'une image en une phrase (anglais) avec Mozilla/distilvit (ViT + GPT2 distillé, ~0,2 Md paramètres, licence Apache 2.0). Contrairement à Texte → image, s'intègre au pattern Transformers.js standard de l'app : un seul appel `pipeline("image-to-text", …)` dans un Web Worker, téléchargé et mis en cache au premier usage comme Whisper/MusicGen (aucune conversion ONNX manuelle, aucun hébergement à gérer). fp32 uniquement (~730 Mo) par contrainte de compatibilité déjà documentée (voir « ONNX Models » plus bas).

### Fixed
- **Le run d'un nœud isolé (bouton ▶ individuel) faisait réagir des nœuds totalement déconnectés.** `validerGraphe` (contrôle des entrées obligatoires non connectées) s'exécute sur l'ensemble du graphe, mais son résultat était appliqué sans tenir compte du périmètre du run ciblé : un nœud sans aucun lien avec celui qu'on venait de lancer passait quand même en statut « Erreur » s'il avait lui-même une entrée obligatoire non connectée. Exemple signalé : poser « Explorateur musique » et « Séparateur canaux » sans les relier, lancer seulement le premier faisait passer le second en erreur. Le résultat de validation est désormais restreint aux ancêtres du nœud ciblé, comme le sont déjà l'exécution et le passage en « en attente » ; un run global (bouton « Lancer » principal) continue de valider tout le canevas comme avant.
- **Générateur de pochette : l'aperçu restait une icône cassée au lieu de l'image.** `PochetteGen.tsx` créait l'URL blob via un `useMemo` séparé de son `useEffect` de nettoyage — sous `<StrictMode>` en dev, le double-invoke des effects (setup → cleanup → setup) révoquait l'unique URL partagée par les deux passes avant que la seconde ne s'affiche, cassant l'image de façon permanente (`naturalWidth: 0`). Corrigé en créant et révoquant l'URL dans le même effect, comme le fait déjà `stable-audio-3.cjs` pour un problème de nature similaire.
- **Notice de nœud : un lien de documentation n'était jamais cliquable.** La notice (inspecteur, popup « ? » du nœud, doc de paramètre) s'affichait toujours en texte brut. Nouveau composant `TexteAvecLiens` qui transforme les URL `https://…` en vrais liens — utilisé pour le lien de téléchargement du modèle sur le nœud Texte → image.

### Changed
- **Générateur de pochette déplacé de « Entrées » vers « Autres »** dans le catalogue — n'est pas une entrée de données, catégorie plus appropriée.

## [2.4.4] — 2026-08-04

### Added
- **MIDI Capture node** (`capture-midi`, Entrées → Audio) — records a live performance from a connected MIDI keyboard/controller via the Web MIDI API. Mirrors the existing microphone recorder: pick the device, click Record, play, click Stop — held notes are closed automatically at stop. The captured performance becomes a MIDI file (`ctx.noeud.data.midiFichier`), synthesized to audio (same FM/SoundFont pipeline as the MIDI Player node) and passed through unchanged on the MIDI output, so it chains directly into Transposer/Quantizer/Arpeggiator/MIDI Output. Requires the `midi` Electron permission (added to the app's permission allowlist) and browser/OS MIDI access on first use.
- **Ollama-driven graph generation** — "Prompt → graphe" gained a "Méthode" parameter: the existing offline keyword parser (default, unchanged) or a new "Ollama (IA)" mode where a local LLM reads the *entire* installed node catalog and picks the relevant blocks itself, understanding free-form phrasing the keyword matcher can't. Verified against a real local server (qwen3:4b): for a prompt containing no literal keyword at all ("je veux entendre ma voix comme si j'étais tout au fond d'une grotte immense, avec un son qui s'étire et devient de plus en plus lent et étrange"), it correctly picked Réverbération + Paulstretch — exactly what the wording implies, and something the keyword matcher cannot do (it falls back to a bare source→output chain). Untrusted-output hardening: the request sets Ollama's `format: "json"` decoder-level constraint (not just a prompt instruction — a "reasoning" model measurably ignored "respond with JSON only" and burned its entire token budget thinking out loud in plain text before ever reaching JSON; `format: "json"` fixed this outright: same model, same prompt, 38.8 s/2000 tokens of rambling → 1.7 s/90 tokens of clean JSON), the reply is extracted tolerating markdown fences, and any `ficheId` the model invents that isn't a real registered node is silently dropped (edges through it are dropped too, not left dangling) rather than creating a broken node on the canvas. On any Ollama failure (server down, invalid reply) the node automatically falls back to the keyword parser and says so in its message. New `Modèle` / `Délai max` parameters (Ollama mode only); `ollamaGenerer` (both the browser-fetch and Electron-IPC paths) gained a `format` passthrough for this.

### Fixed
- **"Prompt → graphe" never actually drew anything on the canvas.** Verified this was already broken on the unmodified code (not something the Ollama work introduced): the generated spec is attached to `ctx.noeud.data` inside the plugin, but `useExecutionGraphe`'s post-run check read from `noeudsRef.current` — a *different* object by then, because `definirStatut` had already replaced the node's `data` via spread before the plugin even ran. The check now reads the same flattened array (`nds`) the plugin actually mutated. Same fix applied to the sibling mechanisms sharing this pattern (audio-embedded graph import, dynamic `.zip` node installation) — none of the three could have been materializing their result either.
- **"Prompt → graphe" couldn't run standalone.** Its Text input had no `requis: false`, so validation blocked execution whenever nothing was connected — even though the node has always had a `Prompt` parameter specifically so it *can* run without a connected input. Pre-existing, unrelated to the Ollama addition, found while verifying it.
- **Edge ID collision in "Prompt → graphe"** — regenerated graphs from the same source node now use timestamped edge IDs, preventing React duplicate-key warnings and broken edge rendering on repeated generations or repeated audio-to-graph imports.

## [2.4.3] — 2026-08-03

### Added
- **Arpeggio mode in Dessin sonore** — the image-to-sound sonification node can now play its detected shapes as an arpeggio instead of a block chord.
- **Circulating playback marker** — nodes with a position-in-time concept (Dessin sonore and similar) show a moving point over the currently playing target.
- **Notes and frames on the canvas** — click the note/frame tool then click the canvas to place it at that exact spot, instead of a fixed offset from the toolbar.

### Fixed
- **Comment/frame node callbacks** — the callbacks wired to comment and frame nodes were not being invoked correctly after the note/frame placement rework; restored.
- **`test denoise/` folder** — corrected a `.gitignore` entry so local noise-reduction test assets (`audio.wav`, `output-notches.wav`, `output-spectral.wav`, `sample.wav`) are properly excluded.

### Changed
- **Smaller installer** — moved renderer-only packages to `devDependencies` so electron-builder's dependency scan (and the packaged `node_modules`) stays lean.

## [2.4.2] — 2026-08-03

### Fixed
- **Demucs stem order corrected** — the native Demucs separator (4-stem and 6-stem) reported stems in the order `[batterie, basse, autre, voix]`, but the embedded ONNX models actually output `[batterie, basse, voix, autre]`. **Vocals and "other" were swapped** on every native Demucs separation. Fixed in `electron/demucs.cjs`.
- **Spectral noise-reduction fixes** — corrections to the FFT-based denoiser's magnitude/phase handling (`effets-dynamique.ts`), covered by a new 179-case test file (`noise-nodes.test.ts`).

### Added
- **Notch-filter noise reduction** — `reduireBruitNotches()`, a second denoising strategy that detects narrowband noise components (mains hum, whine) above a profile threshold and notches them out (configurable threshold multiplier, max notch count, Q), as an alternative to the existing spectral-subtraction reducer (`reduireBruit`, which also gained a configurable relative floor).

## [2.4.0] — 2026-08-02

### Added
- **Node category colors** — a left accent border on each node reflects its catalog category at a glance.
- **MiniMap styling** — the React Flow minimap now reflects node colors instead of generic gray blocks.
- **Node description tooltips** and **per-node execution time badge** — hovering a node shows its description; after a run, a badge shows how long it took.
- **Red edges for invalid connections** — an edge that fails type-compatibility validation is drawn in red instead of failing silently.

### Changed
- **Note resize aligned with text output** — the sticky-note node now shares the same resizable-textarea behavior as the Text Output node.
- **Camera no longer zooms on execution** — running the graph used to re-fit the viewport; it now stays put so you don't lose your place on a large canvas.
- **Drum Synth moved** from its previous catalog spot to Traitement → Effets, next to the other percussion/rhythm processors.

## [2.3.3] — 2026-08-02

### Added
- **Global reset button** in the toolbar — clears execution state across the whole canvas in one action, instead of resetting nodes one by one.
- **Drum machine patterns** — additional preset rhythmic patterns for the drum-pattern generators.
- **Resizable text output** — the "Sortie texte" node now has a resizable textarea (drag the corner, 260×140 to 800×600) with a copy button, instead of a fixed-height box.

### Fixed
- **SoundFont default loading** — the embedded FluidR3 SoundFont (`FluidR3_GM.sf2` / `FluidR3_GM_GS.sf2`) now loads reliably both from the packaged app's `resources/sf2/` and from `public/sf2/` in dev, with RIFF/sfbk header validation before use.

## [2.3.2] — 2026-08-01

### Fixed
- **Meta-component ungroup position** — ungrouping a meta-component now restores its inner nodes at the correct canvas position instead of an offset location.
- **Multi-node copy/paste** — copying and pasting a multi-node selection (including internal edges between the copied nodes) now works correctly; covered by a new Playwright end-to-end test (`tests-e2e/meta-ungroup.spec.ts`).

## [2.3.1] — 2026-08-01

### Added
- **Logistic-map effects** — three new effects driven by the logistic chaos map: **Écho logistique** (echo whose feedback/delay drifts chaotically), **Chopper logistique** (rhythmic gate with a chaotically evolving pattern), and **Paulstretch logistique** (extreme time-stretch that grows in progressively rather than applying instantly).
- **Beat Repeat / Stutter** — captures and repeats a short audio segment at rhythmic intervals.
- **Mathematical audio nodes** — **Générateur audio mathématique**, **Formule sur échantillons** and **Formule spectrale** let you type a formula (evaluated per-sample or per-bin) to synthesize or process audio. A dedicated formula editor (`ui/EditeurFormule.tsx`) opens in an overlay outside the canvas — reusing the Python/Julia editor's fix for cursor drift inside a zoomed/transformed node.
- **Music player node** — browses a music folder from the Electron app (play/pause/stop/prev/next) instead of loading a single file.
- Additional collections and cellular-automaton refinements, plus i18n additions for the new nodes.

## [2.3.0] — 2026-07-31

### Added
- **Color ↔ sound node family**: **Camelot wheel** (musical journey across the Camelot wheel illustrating harmonic transitions), **Color-Looper** (step sequencer where each step is a color), **RGB color synth** (synthesizes an RGB color into three oscillators), **Dessin sonore** (sonifies the colored shapes of a drawing image into notes/chords), **Palette harmonique** (extracts an image's dominant colors and turns them into a melody/harmony), **Spectre visible** (transposes a visible color's wavelength into the audible range), and **ColorSynth** (the inverse: derives a 6-color palette from an audio signal's spectrum — Sub/Bass/Low-Mid/Mid/High/Air bands mapped to warm→cool HSL colors).
- A new **color-picker input component** (`ui/SaisieCouleurs.tsx`) backs the color-based nodes.

### Fixed
- **SVG rendering fix** in the pixel-art/pixeltone node.

## [2.2.4] — 2026-07-31

### Fixed
- **Race condition in shared AI workers** — Kokoro, textgen, MusicGen, TTS, ASR and Sherpa workers are singletons shared by every node of their kind. Concurrent requests (e.g. two TTS nodes running near-simultaneously) could have their progress messages and results cross-attributed. Added `requestId` correlation and a request queue to each worker so results always reach the node that asked for them.

## [2.2.3] — 2026-07-30

### Fixed
- **Export/import confirmation dialogs suppressed** — exporting an empty canvas or importing a graph with data loss no longer shows a blocking confirmation dialog; the summary is surfaced without interrupting the flow.
- Minor persistence cleanup (`usePersistance.ts`).

## [2.2.2] — 2026-07-30

### Added
- **Integration/smoke tests** for choice-parameter canonicalization and the zone selector, covering the UI → graph → plugin execution path end to end (`src/plugins/integration.test.ts`, `montage.test.ts`, `generateurs.test.ts`).

### Fixed
- **Canonical ids for choice parameters** — plugins like the zone mask/loop/gate nodes used to compare a `choix` parameter against its *displayed, localized* label (e.g. `"Conserver les zones"` in French). Switching the UI to English, renaming a label, or loading an older saved graph would then silently misinterpret the action. `ParametreDef` gained an `optionIds` field so plugins compare a stable id (`"keep"` / `"mute"`) instead — the first concrete fix from the `ARCHITECTURE.md` diagnostic on localized-string coupling.
- **Zone selector** — the "Masque de zones" / zone-extraction nodes had inconsistent behavior when combining multiple selected zones; corrected alongside the canonicalization work.

## [2.2.1] — 2026-07-30

### Fixed
- **Node deletion cleanup** — deleting a node via the red-cross button, the Delete key, the Inspector, Ctrl+X, or by removing a meta-component now clears the execution cache for the deleted node and its downstream nodes, revokes generated result object URLs, and resets downstream statuses. This prevents stale cached results and memory leaks from outliving the deleted node.
- **TTS voice parameter labels** — SpeechT5 and Piper TTS voice dropdowns now show readable labels (e.g., `US male (BDL)`, `RU-irina-medium`) instead of raw technical IDs, while the runtime still receives the correct voice. Old saved values remain supported.
- **MIDI output default** — MIDI output nodes now default to "Follow MIDI" so they respect the instrument/bank changes embedded in the incoming MIDI stream.
- **SoundFont drum mapping** — GM drum notes (36–50) were often inaudible with SoundFont kits because the drum kit patch was not applied. The Groove Box now always renders its own drum part via an internal drum synth, and a dedicated `Volume batterie` parameter controls the drum level independently.
- **Stuck mouse cursor** — pointer capture could remain active on the waveform/multi-zone selectors, the piano keyboard, or on the React Flow canvas if the mouse button was released outside the window (second screen, Alt-Tab, system menu). Added `pointercancel`/`lostpointercapture` handlers, `buttons===0` guards during `pointermove`, and a global safety net that dispatches `pointerup`/`pointercancel` to the canvas when a pointer is believed to be down but has no pressed buttons.
- **Kokoro TTS progress unit** — the loading message below the node now always shows a percentage (`Chargement du modèle Kokoro… 12%` / `Loading Kokoro model… 12%`). The progress callback now uses a `load` template with a `%` placeholder, normalizes the raw progress value to a 0–100 percent, and keeps only the file basename in download messages so the percentage stays visible.
- **End-of-track silence** — `analyserMidi` no longer adds a 1-second padding to the reported total duration. The `Générateur musical` and `Groove Box` mix now stop at the actual last note, so rendered tracks no longer end with an audible second of silence.
- **Build script shell injection** — `scripts/build-electron.cjs` now removes directories using `fs.rmSync(dir, { recursive: true, force: true })` instead of `cmd /c rmdir /s /q`, fixing the CodeQL `js/shell-command-injection-from-environment` warning.

### Added
- **Advanced Drum Sequencer** — new node `sequenceur-batterie-avance` with 8 drum tracks (kick, snare, closed hi-hat, open hi-hat, clap, crash, low tom, high tom), per-step velocity (0–9), and synthesized drum-machine sounds. The existing `Séquenceur de batterie` is unchanged.
- **Drum Synth** — new node `batterie-synth` ("Batterie synthétique") that renders GM drum notes (36–50) from a MIDI input into synthesized audio using Tone.js Membrane/Metal/Noise synths. It also outputs the MIDI passthrough.
- **Groove Box** — new node `boite-groove` that generates a complete backing track: deterministic chord progression, reservoir melody, and synthesized drum pattern. The final mix is normalized to 0.9 peak. Outputs four separate MIDI files (drums, chords, bass, melody) plus stereo audio. The same seed reproduces the same melody; chord progression is deterministic.
- **Visual feedback for running nodes** — a node whose status is `en_cours` now gets a pulsing outline (`outline: var(--success)` + `node-running-pulse` animation) in addition to the existing status dot, making it easy to spot which node is currently executing.
- **Collapsible node palette** — the left-hand catalog can now be fully collapsed to a narrow toggle bar via a chevron button in the palette header. The state is persisted in `localStorage` (`attic-palette-ouverte`) and the main canvas grid expands automatically when the palette is hidden.
- **Windows local build script** — `scripts/build-electron.cjs` now wraps the Electron build. It temporarily switches `package.json` to the `traversal` package manager collector, sets `NODE_OPTIONS=--max-old-space-size=32000`, and cleans the `release/` directory before packaging to avoid the out-of-memory failure caused by electron-builder's `npm list` collector on this large dependency tree. It also mirrors the CI shrink step: after `vite build` it keeps only the few packages the Electron main process actually needs (`onnxruntime-node`, `@huggingface/tokenizers`, `electron-updater`, `adm-zip`), prunes the full dev dependency tree, packages the app, and finally restores `package.json` and reinstalls dev dependencies so the workspace remains usable.
- **MIDI output for Clavier mélodie** — the `Clavier mélodie` node now outputs the recorded melody as a MIDI file on its second output, so it can be chained to other MIDI nodes. A new `Tempo` parameter sets the BPM of the generated MIDI.
- **Installer size reduction** — the local Windows build script mirrors the CI shrink step, cutting the packaged installer from ~1.48 GB to ~1.26 GB by pruning renderer-only dependencies.

### Changed
- **Générateur musical** — the non-working drum layer (`Instrument 4`) has been removed. The node now generates three tracks (chords, bass, melody) only, and the MIDI file uses 3 tracks instead of 4.

## [2.0.1] — 2026-07-27

### Fixed
- **Dev Electron stale renderer cache** — `electron/main.cjs` now clears the HTTP cache, V8 code cache, and storage data on startup when running in development mode. This prevents a stale Vite build from being served between dev-server restarts.
- **Dev server port collision** — `dev:electron` and `electron/main.cjs` now use port **5175** instead of the default **5173**, avoiding ghosted Vite processes that were serving an outdated renderer.
- **OCR default languages** — removed Hebrew from the default Tesseract language set to reduce unexpected model downloads and avoid the `language_model_ngram_on` LSTM-only warning for unsupported languages. Default is now `eng+fra+deu+spa+rus+ell+ara`.

### Changed
- **Version bump to 2.0.1** — local Windows installer rebuilt and tagged as `Attic Setup 2.0.1.exe`.

## [2.0.0] — 2026-07-27

### Security
- Patched Dependabot alerts by overriding transitive dependencies: `uuid` to `^11.1.1` (missing buffer bounds check in v3/v5/v6) and `brace-expansion` to `^5.0.8` (DoS via unbounded expansion length causing OOM). `npm audit` now reports `0 vulnerabilities`.

### Removed
- **Whisper (Multilingual)** and **Whisper Translation** nodes removed from the catalog. The English-only Whisper model (`Whisper (Anglais)`) and Sherpa-ONNX ASR remain available. This avoids shipping a ~1.5 GB model and a heavy TTS+ASR translation pipeline.
- Related catalog notices, prompt-graph aliases, and unused i18n keys were cleaned up.

### Fixed
- **React Flow error #008 on load** — restored/imported graphs are now sanitised: edges pointing to missing input handles (e.g., after a node definition changed or a node was removed) are silently dropped instead of causing React Flow warnings at startup.
- **Resonance Audio** — added a Playwright isolation test and diagnostic logs inside `appliquerResonanceAudio`; the node now produces a non-silent stereo buffer both in the isolation test and in the app.

### Changed
- **Version bump to 2.0.0** — local Windows installer rebuilt and tagged as `Attic Setup 2.0.0.exe`.
- **GitHub release v2.0** updated with the latest installer and release notes.

## [1.6.3] — 2026-07-26

### Added
- **Cellular automaton music generator** node (`automate-cellulaire`) — generates audio + MIDI from 1D Wolfram rules (18, 22, 26, 30, 45, 54, 60, 62, 73, 90, 102, 105, 110, 122, 126, 150, 160, 184, 204, 225, 232, 240, 250) plus custom 0-255 rules, and 2D topologies (Conway's Game of Life, Highlife). Supports Polyphony / Melody / Arpeggio voice modes and Pitch / Velocity / Duration / Pitch+velocity mappings. Configurable scale, key, width, height, generations, seed, density and mutation probability.
- **Sherpa-ONNX ASR runtime hardening** — worker `global` alias, high-quality Web Audio resampling with linear fallback, offline model cache control (auto / clear & re-download), and worker download progress messages.
- **Local Windows installer build** — production packaging path using a stripped dependency set to avoid electron-builder out-of-memory issues.

### Fixed
- **Inconsistent node reset** when editing parameters — all parameter changes now trigger the same cascade reset (`reinitialiserNoeud`) instead of partial ad-hoc cleanup.
- **Input nodes losing loaded file paths** after save/restart — `entree-image` now persists the file path via the hidden `Chemin` parameter; localStorage restore reloads audio, MIDI, SVG and image files from disk.
- **Chord detector result displayed twice** — the generic node message is now hidden when a custom view already renders it.
- **Export filename** (`nomFichier`) is now saved and restored.
- **Wrong English `optionsEn`/`defautEn` for "Key" / "Clé" and other parameters** in `reservoir-musical`, `reservoir-midi`, `multi-reservoirs`, `generateur-accords`, `generateur-musical`, `sequenceur`, `vexflow`, `tonal` and related nodes. The UI was showing resolution/style values instead of keys (e.g. "1/4") because of copy-pasted i18n metadata.
- **Additional copy-paste fixes** in `Mélodie aléatoire`, `Musique fractale`, `Sampler personnalisé`, `Métronome`, `Générateur musical`, `Générateur de paroles`, `Générateur de pochette` and `Visualisation Songsee` (time signatures, keys, scales, format, style default).
- **Cellular automaton node size** — removed its oversized 320×260 fixed size so it now uses the standard node sizing (240×140) like other non-visual nodes.
- **Node audio player aesthetic test** — added an inverted/sepia style for players inside nodes: background matches the node's `--bg-surface`, sepia inverted controls/icons.
- **Piper TTS loading** — replaced the default HuggingFace-only provider with a custom caching provider: tries local bundled voices first, then IndexedDB cache, then downloads with a 10-minute timeout and live progress reporting (MB + percentage). Prevents the "loading for hours" hang.
- **Execution cache** — cache key now includes a stable hash of the actual input values (not just the upstream node IDs). This fixes upstream nodes being re-executed when a downstream node is launched and makes cache invalidation correct for all nodes (text, audio, file, objects, arrays, typed arrays). Added diagnostic console logs temporarily to trace any remaining cache misses.
- **Piper TTS WASM MIME type** — Vite dev server now serves `.wasm` files with `application/wasm` so WebAssembly streaming compilation works in the worker. In the packaged app, Piper TTS runtime files are unpacked from `app.asar` to ensure Chromium fetches them with correct MIME types.
- **Piper TTS voice loading** — reverted to the original Piper TTS setup: the runtime WASM/data is bundled (from `node_modules/piper-tts-web/dist` into `public/piper-tts`), but the ONNX voice models are downloaded from HuggingFace on first use and cached. This keeps the installer small; no ~376 MB voice bundle is included.
- **OCR language string** — `createWorker` now receives a `+`-joined string of language codes instead of an array, which avoids corrupted/empty language values (`'\x01'`) that caused `Failed loading language` and `Error opening data file ./ .traineddata` in Tesseract.js v7.0.0.
- **Automate cellulaire documentation** — added missing parameter docs for `Octave`, `Vélocité`, `Clé`, `Gamme` and `Synthèse`.

### Changed
- **Equalizer** node upgraded to a **9-band graphic EQ** (32 Hz, 64 Hz, 125 Hz, 250 Hz, 500 Hz, 1 kHz, 2 kHz, 4 kHz, 8 kHz) with independent ±24 dB gain controls, replacing the previous 3-band EQ.
- **Speech-to-Text nodes** (`Whisper (Anglais)`, `Whisper (Multilingue)`, `Sherpa ASR`) moved from **Sorties** to **Autres** so they sit alongside other text-generation/analysis utilities instead of output nodes.
- **Limiter** node — peak limiter with instant attack, release and output ceiling, ideal for mastering loudness without clipping.
- **Transient Shaper** node — independent attack/sustain control via fast/slow envelope detectors, perfect for adding drum punch or shortening tails.
- **Stereo Width / MS** node — adjusts stereo width (0% mono → 200% widened) and independent Mid level via Mid/Side decoding.
- **Multiband Compressor** node — 3-band compressor (low/mid/high) with independent thresholds and ratios per band.
- **Harmonizer / Octaver** node — adds up to two pitch-shifted voices (semitone intervals) under the original signal.
- **Exciter / Aural enhancer** node — adds high-mid presence via asymmetrical distortion and high-pass filtering.
- **Granular Freeze** node — loops a grain with size, pitch and position control.
- **Vocoder (filterbank)** node — two-audio-input vocoder (modulator + carrier) with configurable band count, frequency range and Q.
- **COMPONENTS.md** generator script (`scripts/generate-components-md.ts`) and regenerated catalog (194 components).
- Version bumped to `1.6.3`.

## [1.2.6] — 2026-07-25

### Security
- **Added `SECURITY.md`** — supported versions, reporting channels (GitHub Security Advisories + `atticofsound@free.fr`), disclosure policy and acknowledgments.
- **Added CI workflow** (`Lint, build and test`) and set it as a required status check on the `master` branch.
- **Added automated release workflow** that builds and publishes the Windows installer using the native `GITHUB_TOKEN`.
- **Removed the placeholder SLSA workflow** that did not perform actual provenance generation.
- **Enabled Dependabot alerts and automated security fixes** on the repository.
- **Enabled secret scanning push protection** to block accidental secret commits.
- **Enforced branch protection on `master`** — pull requests required, CI status check required, admin rules enforced, no force pushes or deletions.

### Changed
- **Audio players in nodes now use a light beige tint** instead of the default white controls.

### Fixed
- **Electron IPC handlers are now registered once globally** (`capture:systeme-audio`, permission handler, CSP header) so opening a second window no longer throws a duplicate-handler error.
- **Added missing documentation for the `Chemin` parameter** in `entree-audio` and `lecteur-midi`.

## [1.2.5] — 2026-07-25

### Changed
- **Renamed text-generation AI nodes** — `DistilGPT-2 Lyrics` / `DistilGPT-2 Paroles` → `DistilGPT-2` and `Qwen2.5-0.5B Lyrics` → `Qwen2.5-0.5B`. The default prompts, system prompt, and notices were updated to describe generic text generation instead of lyrics, since these nodes do not generate lyrics.
- **Default theme is now dark purple** — the previous pale green "light" theme was replaced with a dark purple theme. The toggle switches between dark purple (default) and black. The internal theme name changed from `clair` to `violet`.

### Fixed
- **Magenta nodes are now cached** — they no longer force the whole downstream chain to re-run when an unrelated node is added or changed. The `jamaisCache: true` flag has been removed from all Magenta nodes so the execution cache can skip them when inputs and parameters are unchanged.

## [1.2.4] — 2026-07-24

### Security
- Patched dependency vulnerabilities: `electron`, `adm-zip`, `sharp`, `protobufjs`, `minimist`, `static-eval`.
- Fixed CodeQL Zip Slip alert in `node:importer-zip`.

### Changed
- Windows installer is a **standalone NSIS installer** (~1.4 GB) containing the full application.
- Updated NSIS toolset to **3.12**.
- Removed duplicate `dist/oonx` and `dist/sf2` files from the packaged app to bring the installer under the 2 GB GitHub asset limit.

## [1.2.3] — 2026-07-24

### Added
- **Sound Map city redesign** — denser buildings, districts, parks, water, street labels and a legend.
- **Voice Changer** node with Chipmunk, Monster, Robot, Phone, Alien, Helium and Ghost presets.
- **Random Slice** node for rearranging audio fragments.
- **Echo** node with ping-pong delay (Time, Feedback, Spread).

### Changed
- **Documentation** is now hosted on the GitHub wiki: `https://github.com/FabienCouprie/attic/wiki`. The top toolbar icon opens the wiki instead of the bundled docs.
- Removed bundled `doc/` folder from packaged resources.
- **Sound Map** map size increased to 1400×900 and points limit raised to 200.

## [1.1.1] — 2026-07-18

### Fixed
- **A failed branch now fails the workflow.** A workflow could report "terminé"
  while one of its parallel branches had never actually run. The root cause was
  not the execution order (verified correct) but plugins returning
  `{ valeurs: [null], message }` **without** `erreur: true` — the engine read
  that as a success and the false "terminé" cascaded downstream. Fixed in four
  layers: errors propagate transitively to descendants; an all-null output from
  a node that *has* output ports is treated as a failure; source nodes declare
  failure when nothing is loaded; and a meta node is marked failed as soon as
  one of its inner nodes fails, instead of running on "as if nothing happened".
  Distinct from the 1.1.0 parallel-branch fix, which was about cache
  invalidation, not error propagation.
- **Python and Julia code editing moved to an overlay window.** Two in-node
  attempts failed: a controlled textarea let canvas re-renders scramble
  keystrokes, and an uncontrolled transparent textarea layered over the
  highlighted `<pre>` depended on pixel-perfect layer alignment inside the
  zoomed (`transform: scale`) canvas — caret one step ahead, wrong mouse
  selection, letters landing before the last letter. The node now shows a
  read-only syntax-highlighted preview; clicking it opens a plain, visible
  textarea in a fixed overlay outside the canvas (no transformed ancestor —
  the whole bug class is gone by construction). Native caret, selection,
  undo, copy/paste. Verified: click-to-caret exact (index 12/12), typed text
  inserted at the click point, double-click selects the right word, sync back
  to the node on close/blur/400 ms debounce, Escape closes.
- **Python and Julia processors actually produce output.** `obtenirRepertoireTravail()`
  returns a Promise and was used without `await`: every I/O path was
  `[object Promise]/…`, so scripts ran but their outputs were unreadable — the
  node then showed "Python exécuté · <stdout>" while transmitting nothing.
  Fixed the `await`, made the packaged work dir fall back to `userData/work`
  (creating it under `C:\Program Files` silently failed), and a run that
  produces no readable output is now reported as an **error** naming the
  expected `ATTIC_OUTPUT_*` variables and the work directory.
- **Phaser was inaudible** (measured: output ≈ input, 1.6% deviation). The
  all-pass coefficient had an inverted sign, placing the phase transition near
  20 kHz instead of the swept 200–2000 Hz band. Now produces moving notches
  (measured).
- **Octaver was inoperative.** The "octave up" phase trick never triggered
  (constant 0.5) and "octave down" added the signal every other sample
  (Nyquist modulation). Rewritten with classic analog-pedal techniques:
  full-wave rectification + DC blocker (up), polarity flip every other period
  (down). Energy at 2f and f/2 verified by measurement; docs now explain the
  two sliders (one per added voice).
- **Dereverb was an exact pass-through** (measured tail reduction: none). Its
  peak memory decayed at 60 dB/s — faster than any real reverb tail — so the
  gate never engaged. Recalibrated (20 dB/s, −6 dB knee): tails are now
  attenuated while sustained notes survive (measured).
- **Bookmark downloads in the packaged app** — sound-bank links opened inside
  an Electron window with no download handling; they now open in the system
  browser (`setWindowOpenHandler` + `shell.openExternal`).
- **Ollama "Délai dépassé"** — the node passed no timeout (120 s default),
  which a cold-loading large model (Qwen 3.6 = 24 GB) always exceeded. New
  "Délai max" parameter (default 600 s) and an error message explaining the
  first-call model load.
- **Inspector number fields are clamped** to the parameter's range and step on
  blur — it was possible to type nonsense values (0 bits, out-of-range dB)
  that the DSP silently corrected while the UI displayed them.
- **AI-model cache resilience** — the packaged app (`file://` origin) had its
  Cache Storage bucket evicted under quota pressure, forcing model
  re-downloads after an update. `persistent-storage` is now granted explicitly
  and the boot log reports `persisted()` state and cache usage/quota. (The
  durable file-based cache is recorded in ROADMAP.)
- **Effects measurement bench** (`audio/effets-verification.test.ts`) —
  normalizer, compressor, bitcrusher, phaser, octaver and dereverb are now
  locked by 12 signal-level assertions (an effect regressing to a pass-through
  fails the suite). Compressor and normalizer were verified conform to their
  documented behavior (threshold/ratio/makeup, exact peak target).

### Changed
- **The engine no longer tests plugin ids.** `useExecutionGraphe` special-cased
  `galerie-exposition` and `entree-audio` by id. Two optional `PluginDef`
  properties replace them — `jamaisCache` (never reuse a cached result) and
  `affichageAutonome` (the node drives its own display from `data`) — so the
  behaviour is declared by the sheet and available to any node, in any domain.
- **Core contracts have no default generic.** `PluginDef`, `ContexteExecution`
  and `FonctionPlugin` now require `<TValeur, TRuntime>` explicitly, so a new
  domain cannot silently bind to the audio union. The audio domain declares its
  aliases once in `audio/types-domaine.ts` (`FicheAudio`, `ContexteAudio`, …).

### Added
- **`PORTING-A-DOMAIN.md`** — step-by-step guide to reuse the core, the
  execution engine, the metanodes and the UI shell for a non-audio domain,
  including an honest map of where the UI is still coupled to audio.

## [1.1.0] — 2026-07-16

### Added
- **LLM Ollama node** — text generation via a local Ollama server (Llama, Qwen, Mistral, Phi…). The call runs in the Electron main process, so no CORS/CSP issues; Ollama manages model download/cache/execution outside the renderer, avoiding the WASM memory ceiling. Clear errors when the server is down or the model isn't installed.
- **Text → MIDI node** — renders a simple text notation to a MIDI file **and** synthesized audio. One line per note: `C4 0.5`, chords via `C4+E4+G4 1`, `rest 0.5`, optional leading `TEMPO 120`. Accepts a text input or a parameter.
- **"Compositeur IA (Ollama)" meta-example** — a built-in, pre-wired `Ollama → Text→MIDI` chain (Audio + MIDI outputs) with the composer prompt already set. One drag from the palette; double-click to edit the prompt/model.
- **Exact numeric entry in the Inspector** — a number field beside every slider, so precise values (0, 3.0 s, −37 dB) are reachable instead of fighting the slider.
- **Copy button** on the Color→Sound generated script (like the text output).

### Changed
- **Palette: drag-and-drop only** — clicking a catalog item no longer drops a node at a random spot; only dragging adds a node, at the drop location.
- **Compressor & Normalizer parameter ranges** — Threshold −60→0, Ratio 1→20, Gain −12→24 dB, Level −40→0 dB, etc. (negative-dB params were previously unreachable on a broken 0–100 slider).
- **Loop node** shows `reps × input = total` so an unexpected input length is visible at a glance.
- **AI model memory** is released after each node (worker terminated), keeping only one model resident at a time; and the app requests persistent storage so the on-disk HuggingFace model cache isn't evicted.

### Fixed
- **Sequencers loop seamlessly** — the drum and melodic sequencers now output exactly one bar length (was +0.4/0.5 s of trailing silence), with the decay tail folded onto the start: no gap or click when looped.
- **Meta branch status** — a branch (meta) that produces no result now shows **erreur** and names the failing internal node, instead of staying stuck on "en cours" while the downstream node reads "terminé".
- **Per-node runs are scoped** — running a single node no longer marks disconnected branches as running; running a meta node now actually runs its branch; a following global run is no longer left filtered.
- **Parallel branches** no longer re-execute needlessly when a sibling branch is re-run (over-eager cache invalidation removed).
- **Text-output copy** worked around Electron's clipboard permission (async Clipboard API + `execCommand` fallback) — it was silently failing.
- **Canvas data loss** on save/export — the root graph is captured even from inside a meta, and empty saves/exports are guarded; imports with metas but no canvas nodes now warn instead of silently showing a blank canvas.
- **Plugin errors are logged** (spec §6.5) with node context instead of being swallowed.
- Ollama errors surface the server's message (e.g. `model "X" not found, try pulling it first`).
- Dead-code cleanup: 305 → 28 lint warnings.

## [1.0.5] and earlier

See git history.
