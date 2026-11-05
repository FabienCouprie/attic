# Construire un exécutable Linux d'Attic

Ce document dit tout ce qu'il faut faire pour produire Attic sous Linux. Le dépôt ne produit
aujourd'hui qu'un installeur Windows (NSIS) ; rien de ce qui suit n'est encore fait, et rien n'a été
construit ni lancé sous Linux pour l'écrire. Chaque affirmation sur le dépôt cite son fichier et sa
ligne, relevés le 2026-11-02 sur `origin/master` (après la PR 282). Ce qui n'a pas été vérifié est
marqué **non vérifié**. Les marches sont écrites pour Linux x86-64 seulement ; arm64 est hors champ.

## 1. En bref

- **Cible recommandée : AppImage**, seule, en premier. C'est le seul format Linux pour lequel
  `electron-updater` sait faire la mise à jour sans droits d'administrateur, et il ne demande ni
  dépôt de paquets ni adresse de mainteneur. Le `.deb` vient ensuite, s'il est demandé (§ 3).
- **Quatre exécutables tiers sont à fournir en version Linux** : songsee, acestep.cpp, audio.cpp
  et stable-diffusion.cpp. Deux amonts publient des binaires Linux, deux sont à compiler (§ 5).
- **Un défaut bloquant dans la configuration actuelle** : `build.files` exclut tous les `.so`
  (`package.json:117-118`), donc `libonnxruntime.so.1` ; sans correction, tous les ponts ONNX du
  processus principal tombent dans l'application Linux (§ 4.1).
- **Le processus principal est déjà en grande partie portable** : les noms d'exécutables, la
  recherche de Python et de Julia, l'arrêt des travaux et les chemins passent déjà par
  `process.platform` (§ 6).
- **Où construire : un job `ubuntu-24.04` dans `.github/workflows/release.yml`**, jamais dans
  `E:\attic` par WSL (§ 7).
- **Ce qui ne marchera pas tout de suite** : le calcul ONNX sur la carte graphique (DirectML
  n'existe pas sous Linux), CUDA, et le bac à sable de Chromium dans un AppImage sous Ubuntu 24.04
  (§ 10).

## 2. Le relevé : ce qui suppose Windows

Chaque ligne dit ce qui casse sous Linux, ce qu'il faut changer, et comment le vérifier.

### 2.1 Construction et configuration

| Où | Ce qui suppose Windows | Ce qui casse sous Linux | À changer | Vérifier |
|---|---|---|---|---|
| `package.json:171-176` | Seule la cible `win` / `nsis` est déclarée, icône `.ico` | `electron-builder --linux` n'a ni cible ni icône déclarées | Ajouter un bloc `linux` (§ 4) | `release/` contient un `.AppImage` |
| `package.json:117-118` | `!**/*.so` et `!**/*.so.*` dans `build.files` | Retire `libonnxruntime.so.1` du paquet | Corrigé : exclusions de dossiers par `${platform}` dans le `files` commun (§ 4.1) | `find release/linux-unpacked -name 'libonnxruntime.so*'` rend un fichier |
| `package.json:123` | Ne retire que `win32/arm64` d'onnxruntime | Le paquet Linux embarquerait les DLL Windows (64 Mo pour `win32/x64`, mesuré) | Exclusions propres à Linux dans `linux.files` | `du -sh` du dossier onnxruntime dans le paquet |
| `package.json:40` | `publish:electron` passe `--win` | Rien à construire pour Linux | Ajouter un script `publish:electron:linux`, ou passer la plateforme | — |
| `package.json:96-98`, `181-188` | Bloc `toolsets.nsis` et bloc `nsis` | Rien : ignorés hors cible NSIS (**non vérifié**) | Aucun | Le journal d'electron-builder ne parle pas de NSIS |
| `scripts/build-electron.cjs:175` | `electron-builder --win` écrit en dur | La construction locale ne sait faire que Windows | Prendre la plateforme en argument, ou `process.platform` | `npm run build:electron` sous Linux produit l'AppImage |
| `scripts/build-electron.cjs:179` | Contrôle sur `release/win-unpacked/resources` | Le dossier Linux est `release/linux-unpacked` | Chemin selon la plateforme | Le contrôle a posteriori passe |
| `scripts/verify-bundled-resources.cjs:111` | Défaut `release/win-unpacked/resources` | Idem si l'argument est omis | Passer le chemin explicitement dans le job Linux | — |
| `.github/workflows/release.yml:17` | `runs-on: windows-latest`, étapes en `pwsh` | Aucun artefact Linux | Un second job (§ 7) | Le job publie l'AppImage et `latest-linux.yml` |
| `.github/workflows/release.yml:156-159` | Publie `Attic-Setup-*.exe`, son `.blockmap` et `latest.yml` | — | Le job Linux publie `*.AppImage` et `latest-linux.yml` | `gh release view` les liste avec une taille non nulle |
| `.github/workflows/ci.yml:15` | La CI ne tourne que sous Windows | La portabilité des tests n'est mesurée nulle part | Optionnel : un job `ubuntu-24.04` lint + build + test (§ 8) | — |
| `.gitignore:49-60` | Ignore `*.exe`, `*.dll`, `*.so` de `bin/` | `ace-lm`, `ace-synth`, `audiocpp_cli`, `sd-cli` (sans extension) et `bin/sdcpp/*.so` ne sont **pas** ignorés : un `git add` les prendrait | Ajouter ces noms et `bin/sdcpp/*.so` | `git status` reste propre après `npm run outils` sous Linux |

`.gitignore:77` ignore déjà `bin/songsee/songsee`, le nom Linux de songsee.

### 2.2 Les exécutables tiers : `scripts/outils-manifest.json`

Les quatre outils n'ont qu'une entrée `win32-x64` (`scripts/outils-manifest.json:19`, `58`, `113`,
`154`). `scripts/outils-natifs.cjs` choisit l'entrée par `${process.platform}-${process.arch}`
(`scripts/outils-natifs.cjs:38`) : sous Linux il cherche `linux-x64`, ne la trouve pas, et **passe
l'outil sans erreur** (`scripts/outils-natifs.cjs:217-218`). Le contrôle des ressources
(`scripts/verify-bundled-resources.cjs`) échoue ensuite, `bin/acestep` & co. restant vides — c'est
lui qui arrête la construction, pas `npm run outils`.

Les autres points Windows du script :

- `scripts/outils-natifs.cjs:112` : l'archive amont est dépliée par `adm-zip` seulement. audio.cpp
  publie ses binaires Linux en **`.tar.gz`** (§ 5.3) : il faut un second chemin par le paquet
  `tar`, déjà en dépendance de développement (`package.json:238`).
- `scripts/outils-natifs.cjs:143-151` : les « emprunts » copient le runtime Visual C++ d'audio.cpp
  vers stable-diffusion.cpp. Sans objet sous Linux ; l'entrée `linux-x64` n'en déclare pas.
- `scripts/outils-natifs.cjs:253-256` : le `chmod 755` après téléchargement **existe déjà**, pour
  tous les fichiers déclarés de l'outil. Rien à ajouter.

### 2.3 Dépendances natives de `node_modules`

Le paquet ne garde que quatre dépendances (`scripts/build-electron.cjs:152-157`,
`.github/workflows/release.yml:112-117`) : `@huggingface/tokenizers`, `adm-zip`, `electron-updater`
et `onnxruntime-node`. Une seule est native.

- **`onnxruntime-node` 1.29.0** (installé ; `package.json:203` demande `^1.27.0`). Le paquet npm
  porte déjà `bin/napi-v6/linux/x64/libonnxruntime.so.1` et `onnxruntime_binding.node`, 44 Mo
  mesurés dans `node_modules`. Rien à compiler : c'est du N-API précompilé.
- **Le piège de son `postinstall`** : sous `linux/x64`, son installeur demande par défaut le
  fournisseur CUDA 12 (`node_modules/onnxruntime-node/script/install-metadata.js:13`) et le
  télécharge s'il manque (`node_modules/onnxruntime-node/script/install.js:121-133`). Le code
  d'Attic ne demande jamais CUDA (§ 10.1) : c'est du poids mort, et un téléchargement de plus
  pendant `npm ci`. Le job Linux pose donc `ONNXRUNTIME_NODE_INSTALL=skip` (même fichier,
  ligne 46).
- **Les autres `.node` du dépôt** (`node-web-audio-api`, `sharp`, les liaisons de `rolldown`, de
  `oxlint`, de `lightningcss`, `jazz-midi`) sont des dépendances de développement : elles servent à
  construire et à tester, pas à l'application. `npm ci` sur Linux prend leur version Linux. C'est
  aussi pourquoi un `node_modules` posé par Windows ne vaut rien sous Linux (§ 7.2).

### 2.4 Le processus principal (`electron/`)

| Où | Ce qui suppose Windows | Sous Linux | À changer |
|---|---|---|---|
| `electron/travaux.cjs:93-104` | `taskkill /T /F` pour tuer l'arbre d'un travail | Déjà gardé par `process.platform === "win32"` ; ailleurs `enfant.kill()`, qui ne tue que l'enfant direct | Voir § 6.3 |
| `electron/travaux.cjs:116` | `spawn(binaire, args, { windowsHide: true })` | Le chargeur Linux ne cherche pas les `.so` à côté de l'exécutable, contrairement à Windows pour les DLL | Voir § 5.5 |
| `electron/sdxs-image.cjs:66-70`, `electron/stable-audio-3.cjs:121-125` | Fournisseur `dml` (DirectML) | N'existe pas ; « auto » doit retomber sur `cpu`, « carte » échoue | Voir § 10.1 |
| `electron/main.cjs:209-221`, `270-274` | Chemins connus de Python et Julia sous `C:\` et `%LOCALAPPDATA%` | Listes vides hors Windows ; on passe au `PATH` | Rien, sauf § 6.2 |
| `electron/main.cjs:1284-1286` | Filtre `.exe` du dialogue Python | Déjà « Tous » hors Windows | Rien |

## 3. Les cibles à produire

**Recommandation : AppImage seul pour la première version Linux, puis `.deb` si on le demande.**

| Cible | Pour | Contre |
|---|---|---|
| **AppImage** | Un fichier, toutes distributions dont la glibc suffit ; pas de droits d'administrateur ; **mise à jour automatique** par `electron-updater`, qui choisit `AppImageUpdater` hors Windows et macOS (`node_modules/electron-updater/out/main.js:50-51`) | Demande FUSE 2 (`libfuse2`, absent par défaut d'Ubuntu ≥ 22.04) ; pas d'entrée de menu sans intégration ; bac à sable de Chromium sous Ubuntu 24.04 (§ 10.3) |
| `.deb` | Installation et désinstallation propres, entrée de menu, dépendances déclarées (`libvulkan1`), pas de FUSE ; `chrome-sandbox` peut y être posé SUID | Mise à jour par `DebUpdater` qui demande les droits (`pkexec`) ; **electron-builder exige une adresse de mainteneur**, et `package.json` n'a ni `author` ni `linux.maintainer` (relevé : aucune occurrence) |
| `tar.gz` | Le plus simple, utile pour éprouver | Ni mise à jour ni intégration ; aucune raison de le publier |
| Flatpak, Snap | Diffusion par boutique | Bac à sable qui bloquerait l'accès libre au disque, à Python et aux binaires de `bin/` ; hors champ |

L'AppImage est le seul format qui reproduit ce que l'installeur Windows fait aujourd'hui : un
fichier publié sur la release, une mise à jour proposée par l'application (`electron/main.cjs:1825`, canaux `maj:*` à partir de la ligne 1884).

## 4. La configuration electron-builder à ajouter

Le bloc ci-dessous s'ajoute à `build` dans `package.json`, à côté de `win` (`package.json:171`).
Il n'est **pas** encore éprouvé.

```json
"linux": {
  "target": ["AppImage"],
  "icon": "public/icon.png",
  "category": "AudioVideo",
  "executableName": "attic",
  "artifactName": "Attic-${version}-${arch}.${ext}",
  "synopsis": "Visual node-editor for AI-powered music and sound design"
}
```

Le tri des bibliothèques d'onnxruntime par plateforme n'est **pas** dans ce bloc : il est dans le
`files` commun, et un `files` de plateforme fait de seules exclusions casse la liste blanche
(§ 4.1).

- **`icon`** : `public/icon.png` fait 256 × 256 (mesuré), le minimum qu'electron-builder accepte
  pour Linux.
- **`artifactName` sans espace**, pour la raison écrite dans `.github/workflows/release.yml:125-127` :
  un nom à espace est renommé au téléversement et ne correspond plus à `latest-linux.yml`.
- **`executableName: "attic"`** : un exécutable sans majuscule ni espace, l'usage sous Linux.

### 4.1 Le défaut des `.so`

**Corrigé.** `build.files` excluait `**/*.so` et `**/*.so.*` de **tout** le paquet, et sous Linux
`libonnxruntime.so.1` partait avec : `require("onnxruntime-node")` levait au premier pont ONNX
(`electron/demucs.cjs`, `esthetique.cjs`, `sdxs-image.cjs`, `stable-audio-3.cjs`, entre autres).
Ces deux motifs sont remplacés, dans le même `files` commun, par deux exclusions de dossiers :

```json
"!node_modules/onnxruntime-node/bin/napi-v6/!(${platform})/**/*",
"!node_modules/onnxruntime-node/bin/napi-v6/*/arm64/**/*"
```

electron-builder déplie `${platform}` dans les motifs (`app-builder-lib/out/fileMatcher.js:51`,
`util/macroExpander.js:34-35`) en `process.platform` **de la machine qui construit** : `win32`
sous Windows, `linux` sous Linux. Construire Linux depuis Windows garderait donc `win32/` ; ce
document fait construire chaque paquet sur sa plateforme (§ 7). `!**/*.dylib` reste : seul
onnxruntime en porte.

**Ne pas** déplacer ces exclusions vers `win.files` ou `linux.files` : essayé par la PR 285, cela
a fait avorter la première construction de la v5.1.1 au plafond NSIS. electron-builder range le
`files` commun dans un ensemble à part (`builder-effective-config.yaml` le montre sous `filter:`) ;
le `files` de plateforme, fait de seules exclusions, devient alors le motif principal, auquel
`fileMatcher.js:120-121` ajoute `**/*`. La liste blanche `dist/**/*` ne tient plus, et toute la
racine du projet part dans l'application.

**Le témoin d'une retouche de ces motifs** pose un fichier hors de la liste blanche et vérifie
qu'il n'est pas embarqué, en plus de compter les fichiers d'onnxruntime ; le côté Linux se lance
sous Linux, `${platform}` suivant la machine.

**Vérifier** que Windows n'a pas bougé : `scripts/verify-bundled-resources.cjs --paquet
release/win-unpacked/resources` passe, et le nombre de fichiers de `release/win-unpacked` est le
même avant et après (`find release/win-unpacked -type f | wc -l`). **Vérifier** Linux :
`find release/linux-unpacked -name 'libonnxruntime.so*'` rend un fichier.

`extraResources` (`package.json:125-170`) n'est **pas** touché par ces motifs : chaque entrée a son
propre filtre. Les `.so` de `bin/` partent donc tels quels.

### 4.2 Ce qui ne change pas

- `asar` reste désactivé par le workflow (`.github/workflows/release.yml:93`), pour la même raison
  de mémoire ; un AppImage n'en dépend pas.
- `asarUnpack` (`package.json:177-180`) reste sans objet quand `asar` est faux.
- `publish` (`package.json:189-194`) vaut pour les deux plateformes : electron-builder écrit
  `latest-linux.yml` à côté de l'AppImage, nom distinct de `latest.yml`, donc sans collision.

## 5. Les binaires à fournir en version Linux

Chacun reçoit une entrée `linux-x64` dans `scripts/outils-manifest.json`, publiée sur la release
`assets` par `npm run outils:publier` lancé **sous Linux** (le script nomme la plateforme d'après la
machine, `scripts/outils-natifs.cjs:38`). Les noms de fichiers sont déjà attendus sans `.exe` par les
ponts :

| Outil | Pont | Nom cherché sous Linux |
|---|---|---|
| songsee | `electron/songsee.cjs:14` | `bin/songsee/songsee` |
| acestep.cpp | `electron/acestep.cjs:15`, `29` | `bin/acestep/ace-lm`, `bin/acestep/ace-synth` |
| audio.cpp | `electron/muscriptor.cjs:33` | `bin/audiocpp/audiocpp_cli` |
| stable-diffusion.cpp | `electron/sdcpp.cjs:37` | `bin/sdcpp/sd-cli` |

Quand le fichier manque, les trois ponts ggml rendent le nom nu, cherché dans le `PATH`
(`electron/acestep.cjs:31`, `muscriptor.cjs:35`, `sdcpp.cjs:39`) : un binaire installé à la main
par la personne peut donc servir.

### 5.1 songsee (Go)

L'amont ne publie aucun binaire pour `v0.1.3` (relevé par `gh api repos/openclaw/songsee/releases`).
À compiler sous Linux avec l'étape déjà écrite pour Windows, sans le `.exe` :
`go build -o songsee .` dans `cmd/songsee` (`scripts/outils-manifest.json:22-31`). Un seul fichier,
`songsee`. **Non vérifié** : si songsee demande cgo, il dépendra de la glibc de la machine de
construction (§ 5.6).

### 5.2 acestep.cpp

Aucune release amont (`gh release list -R ServeurpersoCom/acestep.cpp` ne rend rien). À compiler
depuis `de858d8e1a94` avec les étapes Windows (`scripts/outils-manifest.json:61-83`), en remplaçant
le générateur : `cmake -S . -B build -G Ninja -DGGML_VULKAN=ON -DBUILD_SHARED_LIBS=OFF` puis
`cmake --build build`. Il faut `libvulkan-dev` et `glslc` (paquet `glslc` ou `shaderc`) sur la
machine de construction.

**`-DBUILD_SHARED_LIBS=OFF`** est la recommandation : il rend `ace-lm` et `ace-synth` autonomes, sans
`libggml*.so` à côté, et évite le piège du § 5.5. Le dossier produit change alors (`produits`
vaut `build/Release` sous Windows, `scripts/outils-manifest.json:60` ; sous Ninja simple, c'est
`build/bin` ou `build`, **non vérifié**).

### 5.3 audio.cpp

L'amont publie pour la même étiquette `v0.9.2-drama3-base-small` (relevé par `gh release view`) :

- `audio-v0.9.2-drama3-base-small-bin-ubuntu-x64-vulkan.tar.gz`, 82 569 293 octets ;
- `audio-v0.9.2-drama3-base-small-bin-ubuntu-x64-vulkan-portable.tar.gz`, 74 761 470 octets ;
- les mêmes en `cpu` et `cpu-portable`, et une variante `cuda12.8`.

**Prendre `vulkan`**, le pendant de l'archive Windows retenue (`scripts/outils-manifest.json:117`).
Ce que « portable » change (jeu d'instructions du processeur ou glibc) n'est **pas vérifié** ; le
contenu de l'archive (exécutable seul, ou avec ses `.so`) non plus — il donne la liste `fichiers`
de l'entrée. Le format `.tar.gz` demande le second chemin de dépliage du § 2.2.

### 5.4 stable-diffusion.cpp

L'amont publie pour `master-1017-be48649` :
`sd-master-be48649-bin-Linux-Ubuntu-24.04-x86_64-vulkan.zip`, 37 646 815 octets. Un `.zip` : le
chemin actuel suffit. Le nom dit **Ubuntu 24.04**, donc une glibc 2.39 au moins (§ 5.6). Les noms
des fichiers (`sd-cli`, `libstable-diffusion.so`, les `libggml*.so`) sont à relever dans l'archive ;
**non vérifié**.

### 5.5 Les bibliothèques à côté de l'exécutable

Sous Windows, une DLL posée à côté de l'exécutable est trouvée. **Sous Linux, non** : le chargeur
ne regarde que le `RUNPATH` du binaire, `LD_LIBRARY_PATH` et les dossiers du système. Un `sd-cli`
dont les `libggml*.so` sont dans `bin/sdcpp/` ne démarre que si son `RUNPATH` vaut `$ORIGIN`.

Trois remèdes, par ordre de préférence :

1. **Compiler en statique** ce qu'on compile (acestep.cpp, § 5.2).
2. **Réécrire le `RUNPATH`** des binaires amont à la construction : `patchelf --set-rpath '$ORIGIN'
   sd-cli`, dans l'étape `--construire` de `scripts/outils-natifs.cjs`, avant la publication. Le
   binaire publié sur `assets` est alors celui qui a été modifié, et son empreinte est la sienne.
3. En dernier recours, poser `LD_LIBRARY_PATH` sur le dossier du binaire dans l'environnement du
   `spawn` (`electron/travaux.cjs:116`). C'est un changement de code dans le pont commun.

**Vérifier**, pour chaque binaire : `readelf -d <binaire> | grep -i runpath`, puis
`ldd <binaire> | grep 'not found'` lancé depuis un autre dossier, qui doit ne rien rendre.

### 5.6 La glibc, plancher de l'exécutable

Un binaire compilé sur Ubuntu 24.04 demande la glibc de 24.04 (2.39) ; il ne démarre pas sur
Ubuntu 22.04 (2.35) ni sur Debian 12 (2.36). stable-diffusion.cpp est déjà dans ce cas (§ 5.4).

**DÉCIDÉ PAR FABIEN LE 2026-11-04 : LE PLANCHER EST GLIBC 2.35, Ubuntu 22.04 ET Debian 12
COMPRIS.** La recommandation d'origine (24.04 et 2.39) est écartée. Les trois outils C++ se
compilent dans un conteneur Ubuntu 22.04, `scripts/outils-linux.sh` (podman) sur
`scripts/outils-linux.Containerfile`, et non plus sur la machine qui construit ; songsee est
construit sans cgo et ne demande aucune glibc. Electron (2.25) et onnxruntime (2.28) sont en dessous.

- **Plus aucun binaire amont sous Linux** : audio.cpp et stable-diffusion.cpp se compilent depuis
  la version épinglée. Le binaire amont d'audio.cpp était de toute façon inutilisable : compilé
  avec `ENGINE_ENABLE_NATIVE_CPU` (le défaut), il porte de l'AVX2, du FMA et de l'AVX-512, et
  mourait sur « Instruction non permise » sur un i7-3610QM (Ivy Bridge), mesuré le 2026-11-04.
  Les trois sont désormais construits avec toutes les variantes de processeur
  (`GGML_CPU_ALL_VARIANTS`, `ENGINE_ENABLE_CPU_ALL_VARIANTS`), et ggml choisit au lancement.
- **`libgomp.so.1` part avec chaque outil** : les exécutables y sont liés, et une installation
  minimale ne l'a pas. Redistribuable sous la GCC Runtime Library Exception. `libvulkan.so.1`, lui,
  ne part pas : le moteur Vulkan est chargé à la demande, et sans lui ggml reste sur le processeur.
- **Mesuré** : dans des conteneurs `ubuntu:22.04` et `debian:12` nus, `ldd` ne signale plus rien
  de manquant, et `audiocpp_cli` rend une transcription MIDI sous Debian 12 sans Vulkan ni OpenMP
  installés. Plancher relevé : `GLIBC_2.35`, `GLIBCXX_3.4.30` (libstdc++ de 22.04 et de Debian 12).

**Vérifier** le plancher réel : pour chaque binaire de `bin/` et pour `attic`,
`objdump -T <fichier> | grep -o 'GLIBC_[0-9.]*' | sort -uV | tail -1`.

### 5.7 Ce qui ne change pas d'une plateforme à l'autre

- **Le SoundFont** (`public/sf2`, 142 Mo dans `release/win-unpacked/resources/sf2`), **le kit SFZ**
  (`public/sfz`, 377 Ko), **Magenta** (`public/magenta`, 74 Mo), **la collection de démonstration**
  (75 Mo) et les **exemples** : ce sont des données. Le job Linux les rapatrie comme le job Windows
  (`.github/workflows/release.yml:66-85`).
- **Les modèles ONNX et GGUF** ne sont plus embarqués depuis le 2026-10-08
  (`.github/workflows/release.yml:53-54`) : ils se prennent depuis l'application, dans
  `userData/ressources` (`electron/main.cjs:159`). Les mêmes fichiers servent sous Linux.
- **Le contenu de `dist/`** (WASM de Sherpa, Piper, Csound, Vosk…) est du web : identique.

## 6. Les chemins et appels système

### 6.1 Ce qui est déjà portable

- **Les dossiers de l'application** passent par `app.getPath` : `userData`
  (`electron/main.cjs:144`, `159`, `188`, `251`), `documents` pour le dossier de travail
  (`electron/main.cjs:1082-1084`), `temp` pour les scripts (`electron/main.cjs:1312`, `1389`),
  `home` pour les nœuds installés (`electron/main.cjs:141`). Sous Linux, `userData` devient
  `~/.config/Attic` (ou `~/.config/attic`, selon le nom que l'application packagée lit ; **non
  vérifié**), et `documents` le dossier XDG des documents. Aucun `%APPDATA%` n'est lu en dur hors
  des chemins de Julia, eux-mêmes gardés par la plateforme (`electron/main.cjs:270-274`).
- **Les ressources** passent par `resoudreRessource` (`electron/chemins-ressources.cjs:46-77`), sur
  `process.resourcesPath` : dans un AppImage, c'est le dossier `resources` du montage.
- **La comparaison de chemins** n'abaisse la casse que sous Windows
  (`electron/capacites-chemins.cjs:117`) : juste sous Linux, où la casse compte.
- **`shell.openPath`** n'ouvre que des `.html` (liste d'autorisation, `electron/chemin-sur.cjs:15-30`) :
  la barrière vaut sous Linux, où `xdg-open` remplace l'association de Windows.
- **La fenêtre** prend `dist/icon.png` (`electron/main.cjs:354`), un PNG : rien à changer.
- **La sortie** : `app.quit()` hors macOS (`electron/main.cjs:2074`), juste sous Linux.

### 6.2 Python et Julia lancés depuis un menu

Hors Windows, la recherche de Python essaie `python3` puis `python` dans le `PATH`
(`electron/main.cjs:223-225`), celle de Julia `julia` (`electron/main.cjs:282-286`). Une application
lancée depuis le menu du bureau **n'hérite pas du `PATH` du shell** : un Python de `pyenv`, d'un
environnement virtuel, ou un Julia de `juliaup` (`~/.juliaup/bin`) ne sera pas trouvé, alors qu'il
l'est depuis un terminal. Rien à changer dans le code : `ATTIC_PYTHON` / `ATTIC_JULIA`
(`electron/main.cjs:203`, `264`) et le choix par dialogue couvrent le cas. À écrire dans la notice
d'installation Linux.

### 6.3 L'arrêt d'un travail

`tuerArbre` (`electron/travaux.cjs:93-104`) emploie `taskkill /T` sous Windows et `enfant.kill()`
ailleurs, ce qui envoie `SIGTERM` à l'enfant direct seulement. Le commentaire
(`electron/travaux.cjs:49-51`) le juge suffisant, aucun lanceur ne passant par un shell. Ce qui
reste vrai sous Linux tant que les moteurs ggml ne lancent pas de sous-processus ; **non vérifié**
pour un script Python qui en lancerait. Si un orphelin est observé (§ 9.3), le remède est
`spawn(..., { detached: true })` puis `process.kill(-enfant.pid)`, qui tue le groupe.

## 7. Où construire

### 7.1 Recommandation : un job `ubuntu-24.04` dans le workflow de release

- **`ubuntu-24.04` écrit en toutes lettres, et non `ubuntu-latest`** : le plancher de glibc de
  l'exécutable suit l'image de construction (§ 5.6). `ubuntu-latest` le ferait monter sans
  prévenir le jour où GitHub change d'image.
- Le coureur standard a 16 Go de mémoire, comme celui de Windows ; `NODE_OPTIONS
  --max-old-space-size=14336` (`.github/workflows/release.yml:150`) y tient (**non vérifié** sous
  Linux).
- Les outils natifs (§ 5) se construisent **une fois**, à la main ou par un job déclenché à la
  main, puis se publient sur `assets`. Le job de release ne fait que les télécharger, comme sous
  Windows (`.github/workflows/release.yml:96-99`).

### 7.2 Pas dans `E:\attic` par WSL

WSL2 peut construire, mais **dans un clone à lui** (`~/attic`, sur le disque Linux), jamais dans
`/mnt/e/attic` : le `node_modules` de `E:\attic` porte les liaisons natives Windows (`rolldown`,
`oxlint`, `lightningcss`, `sharp`), et le `bin/` y porte les `.exe`, qui partiraient dans l'AppImage
par `extraResources`. Un `npm ci` lancé dans `E:\attic` depuis WSL remplacerait le `node_modules`
de Windows par celui de Linux, sous les pieds des autres sessions. WSLg suffit pour ouvrir la
fenêtre ; il ne mesure ni Vulkan ni le bureau d'une vraie distribution (§ 9).

Une machine Linux réelle (ou une VM Ubuntu 24.04) reste le seul endroit où **tester** (§ 9).

### 7.3 Le job à écrire

**ÉCRIT LE 2026-11-04** : le job `release-linux` de `.github/workflows/release.yml` en est la
version tenue, et c'est lui qui fait foi. Il s'écarte de l'ébauche ci-dessous sur trois points :
il est en `bash` et non en `pwsh` ; il tire le SoundFont seul par `tar -xf assets.zip
public/sf2/FluidR3_GM.sf2`, `assets.zip` étant en réalité une archive tar (mesuré : `7z l` y lit
« Type = tar », `unzip` le refuse) ; et il vérifie que les cinq exécutables restent exécutables
dans le paquet. Mesuré hors CI : `electron-builder --linux AppImage -p never` rend l'AppImage et
`latest-linux.yml`, sans `.blockmap` à part (la table est embarquée). **Non lancé sur GitHub** à
cette date.

L'ébauche d'origine, gardée pour mémoire :

```yaml
  release-linux:
    name: Build and publish the Linux AppImage
    runs-on: ubuntu-24.04
    needs: release          # le job Windows crée la release ; on n'y court pas en parallèle
    permissions:
      contents: write
    env:
      ONNXRUNTIME_NODE_INSTALL: skip   # § 2.3 : pas de fournisseur CUDA
    steps:
      - uses: actions/checkout@v5
        with:
          ref: ${{ github.event.inputs.tag || github.ref }}
      - uses: actions/setup-node@v5
        with:
          node-version: '22'
          cache: 'npm'
      - run: npm ci
      - run: npm run download:sherpa-wasm
      - run: node node_modules/electron/install.js
      - name: Download the bundled SoundFont
        run: |
          gh release download assets -p assets.zip --dir .
          7z x assets.zip -y
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
      - run: npm run download:music-collection
      - name: Build the AppImage
        shell: pwsh
        run: |
          # Les mêmes étapes que le job Windows (lignes 93 à 135), avec trois différences :
          #   · `npm exec -- electron-builder --linux AppImage -p never`
          #   · le contrôle a posteriori sur release/linux-unpacked/resources
          #   · pas de patch de `nsis.artifactName` (le bloc `linux` porte le sien, § 4)
        env:
          NODE_OPTIONS: --max-old-space-size=14336
      - name: Publish
        run: |
          tag="${{ github.event.inputs.tag || github.ref_name }}"
          gh release upload "$tag" release/Attic-*-x86_64.AppImage release/latest-linux.yml --clobber
          # puis la même vérification a posteriori que le job Windows (lignes 172-182)
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

- **`shell: pwsh` sur Ubuntu** : PowerShell est préinstallé sur les images Ubuntu de GitHub (à
  confirmer au premier passage), ce qui permet de reprendre les lignes 93-135 du job Windows presque
  telles quelles. Mieux : sortir ces patchs de `package.json` dans un script `.cjs` partagé, que
  `scripts/build-electron.cjs:143-170` duplique déjà.
- **`7z` sur Ubuntu** : présent sur l'image (**non vérifié**) ; sinon `unzip -o assets.zip`.
- **L'espace disque** : `assets.zip` pèse 2 060 571 648 octets (`.github/workflows/release.yml:62`),
  à décompresser à côté de `node_modules`. Un `df -h` en tête du job dira la marge.
- **Le nom de l'AppImage** : `${arch}` vaut `x86_64` pour un AppImage chez electron-builder
  (**non vérifié** ; le motif `Attic-*.AppImage` est plus sûr).
- **`scripts/bundled-resources.test.ts:93`** exige que le workflow contienne le contrôle Windows ;
  ajouter un job ne le casse pas, réécrire la ligne Windows si.

## 8. La CI, en option

`ci.yml` ne tourne que sous Windows (`.github/workflows/ci.yml:15`). Combien de tests supposent
Windows n'est **pas mesuré** : une passe `npm run lint && npm run build && npm test` sur
`ubuntu-24.04` le dirait, et serait le premier relevé honnête. `scripts/installeur-compile.test.ts`
s'y ignorera, faute de `makensis` (`.github/workflows/ci.yml:35-39`). Le harnais Electron
(`npm run test:electron`) y demande un serveur X : `xvfb-run -a npm run test:electron`.

## 9. Tester l'exécutable

### 9.1 Sans le lancer, sur l'artefact

```bash
./Attic-5.1.0-x86_64.AppImage --appimage-extract
```

Puis, dans `squashfs-root/` :

- `node scripts/verify-bundled-resources.cjs --paquet squashfs-root/resources` passe ;
- `find squashfs-root -name 'libonnxruntime.so*'` rend un fichier (§ 4.1) ;
- `find squashfs-root -name '*.dll' -o -name '*.exe'` ne rend rien ;
- `ls -l squashfs-root/resources/bin/*/` montre le bit d'exécution sur les quatre outils ;
- `ldd` et `objdump -T` sur chacun, comme au § 5.5 et au § 5.6.

### 9.2 Le lancer

Sur une VM ou une machine **Ubuntu 24.04** propre, et sur une seconde distribution (Fedora ou
Debian 13) si on veut annoncer plus qu'Ubuntu :

```bash
sudo apt install libfuse2t64
```

```bash
chmod +x Attic-5.1.0-x86_64.AppImage && ./Attic-5.1.0-x86_64.AppImage
```

Lancé depuis un terminal, les erreurs du processus principal s'y lisent.

### 9.3 Ce qu'il faut voir marcher

| Contrôle | Ce qu'il éprouve |
|---|---|
| Un instrument MIDI sonne | Le SoundFont embarqué, la sortie audio (PulseAudio / PipeWire) |
| Le nœud Songsee rend une image | `bin/songsee`, son bit d'exécution |
| Transcription MIDI | `bin/audiocpp`, Vulkan, le `RUNPATH` |
| Texte → image (MOSS) | `bin/sdcpp`, Vulkan, le `RUNPATH`, la glibc |
| Génération de chanson | `bin/acestep` |
| Stable Audio 3 ou SDXS en « auto » | onnxruntime chargé, repli de `dml` sur `cpu` |
| Le même en « carte » | Le message d'échec est lisible (§ 10.1) |
| Arrêter un travail en cours, puis `ps --ppid <pid d'attic>` | Aucun orphelin (§ 6.3) |
| Un nœud script Python | `python3` trouvé ; puis lancé depuis le menu (§ 6.2) |
| Télécharger un modèle, relancer, il est trouvé | `userData` sous `~/.config` |
| « Vérifier les mises à jour » | `latest-linux.yml` lu ; la mise à jour d'un AppImage (**non vérifié**) |
| Le harnais `tests-e2e/pont-electron-vivant.spec.ts` | Les canaux du pont, sous `xvfb-run` |

## 10. Ce qui ne marchera pas, ou pas tout de suite

### 10.1 Le calcul ONNX sur la carte graphique

Les ponts qui proposent la carte ne connaissent que DirectML : `auto: ["dml", "cpu"]`,
`carte: ["dml"]` (`electron/sdxs-image.cjs:66-70`, `electron/stable-audio-3.cjs:121-125`). DirectML
est une API Windows ; onnxruntime ne le porte pas sous Linux (la liste `linux/x64` de son paquet n'a
que `libonnxruntime.so.1` et la liaison, mesuré dans `node_modules`). Donc, sous Linux :

- **« auto »** retombe sur le processeur, puisque l'ouverture sur `dml` lève et que la boucle de
  `loadSessions` passe au suivant (`electron/sdxs-image.cjs:87-97`). Que onnxruntime **lève** bien
  sur un fournisseur inconnu, plutôt que de l'ignorer en silence, n'est **pas vérifié**.
- **« carte »** échoue. C'est le comportement voulu (`electron/stable-audio-3.cjs:117-119` : qui
  demande un périphérique veut savoir s'il répond), mais le message doit dire que la carte n'est pas
  offerte sous Linux plutôt que de rendre l'erreur brute d'onnxruntime.

Ce que coûte le processeur est mesuré sous Windows : Stable Audio 3, paquet de bruitage, 65,0 s
contre 35,1 s sur la carte pour dix secondes (`electron/stable-audio-3.cjs:112-113`) ; SDXS, environ
11,9 s contre 7,6 s par image (`electron/sdxs-image.cjs:58`).

### 10.2 CUDA

onnxruntime sait prendre CUDA 12 sous Linux (§ 2.3), mais cela demande trois choses qu'on n'a pas :
un fournisseur `cuda` dans les tables du § 10.1, les bibliothèques CUDA sur la machine de la
personne (des centaines de Mo, hors de l'AppImage), et une carte NVIDIA à pilote récent. La carte
de développement de Fabien ne prend que CUDA 11.8 (relevé lors de l'étude de faster-whisper) : rien
ne pourrait y être mesuré. **À ne pas faire dans la première version.** Les moteurs ggml n'en ont pas
besoin : Vulkan les sert sur NVIDIA, AMD et Intel.

### 10.3 Vulkan et les moteurs ggml

acestep.cpp, audio.cpp et stable-diffusion.cpp sont construits avec Vulkan
(`scripts/outils-manifest.json:71`, `117`, `158`). Sous Windows, `vulkan-1.dll` vient du pilote ;
sous Linux il faut `libvulkan1` et un pilote Vulkan (Mesa RADV / ANV, ou le pilote NVIDIA
propriétaire). Sans pilote, ces moteurs retombent-ils sur le processeur ou échouent-ils ? **Non
vérifié** ; `electron/muscriptor.cjs:25-28` choisit `backend: "best"` par défaut. Un `.deb`
déclarerait `libvulkan1` ; un AppImage ne peut que le dire dans sa notice.

### 10.4 Le bac à sable de Chromium dans un AppImage

Sous Ubuntu 24.04, AppArmor interdit par défaut les espaces de noms utilisateur non privilégiés,
dont le bac à sable de Chromium a besoin, et un AppImage ne peut pas poser `chrome-sandbox` en SUID.
C'est un problème connu des applications Electron en AppImage ; **non mesuré sur Attic**. Les
contournements sont `--no-sandbox` (qui affaiblit la sécurité, et Attic exécute des nœuds installés
par la personne, `electron/chemin-sur.cjs:8-10`) ou un profil AppArmor. Le `.deb` n'a pas ce
problème. **À éprouver en premier au § 9.2** : c'est le seul point qui peut empêcher la fenêtre de
s'ouvrir.

### 10.5 Wayland, l'accélération de l'interface

Electron 43 (`package.json:218`) choisit lui-même entre X11 et Wayland ; le rendu de React Flow, les
canevas et l'audio n'ont pas été vus sous Wayland. **Non vérifié.** En cas de défaut,
`--ozone-platform=x11` est le repli.

## 11. Taille attendue

Mesures sous Windows, seules disponibles :

- `Attic-Setup-5.1.0.exe` : 477 055 429 octets (release v5.1.0, relevé par `gh release view`).
- Le dossier `release/win-unpacked` local (v5.0.4, construit **avec** asar) : 1,1 Go, dont
  712 Mo de `resources` (`bin` 216 Mo, `sf2` 142 Mo, l'application 95 + 112 Mo, `music collection`
  75 Mo, `magenta` 74 Mo) et le reste pour Electron.

Ce qui change sous Linux : onnxruntime pèse 44 Mo au lieu de 64 ; les quatre outils Vulkan Linux
sont d'un ordre comparable (37,6 Mo d'archive pour stable-diffusion.cpp contre 29,7 Mo sous Windows,
82,6 Mo contre 63,4 Mo pour audio.cpp). **Estimation, non mesurée : un AppImage de 450 à 600 Mo**,
selon la compression de squashfs qu'electron-builder applique. Le chiffre se relève sur l'artefact,
jamais de mémoire.

## 12. L'ordre de travail proposé

1. `.gitignore` : ignorer les binaires Linux de `bin/` (§ 2.1). Petit, sans risque, à faire avant
   tout `npm run outils` sous Linux.
2. `package.json` : le bloc `linux` et le déplacement des exclusions `.so` (§ 4) ; vérifier que la
   construction Windows est inchangée (§ 4.1).
3. `scripts/outils-natifs.cjs` : le dépliage `.tar.gz`, et `patchelf` à la construction (§ 2.2, § 5.5).
4. Construire les quatre outils sous Linux, les publier sur `assets`, inscrire les entrées
   `linux-x64` du manifeste (§ 5).
5. `scripts/build-electron.cjs` : la plateforme en paramètre (§ 2.1).
6. Une première construction de l'AppImage, à la main sur une machine Linux ; les contrôles du § 9.
7. Le job `release-linux` (§ 7.3).
8. Le message de « carte » sous Linux (§ 10.1), la notice d'installation Linux (`libfuse2`,
   `libvulkan1`, Python et Julia lancés depuis le menu, le bac à sable).
