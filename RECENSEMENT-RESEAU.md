# Ce qu'Attic tire de l'extérieur

Recensement de chaque accès réseau sortant du code livré : `src/`, `electron/`, `scripts/`,
`public/`, `index.html`, la configuration de Vite et d'electron-builder, et les deux workflows de
`.github/`. Pour chacun : le fichier et la ligne, le fournisseur, ce qui est tiré, et le moment.

Relevé le 2026-10-31. Les numéros de ligne sont ceux de `master` à `a89b24a`. La lecture du code a
été doublée d'une mesure, décrite en fin de fichier : l'application lancée dans un navigateur puis
dans Electron, chaque composant du catalogue exécuté, chaque requête sortie relevée. La mesure a
tourné sur `6f1c135` ; les deux pull requests fusionnées depuis, le retrait de « CUDA 0 » (#240) et
le choix du modèle d'ACE-Step (#241), n'ajoutent ni adresse ni téléchargement, relu dans leur diff.

**Le moment** prend cinq valeurs :

- **exécution** : la requête part quand un composant tourne, sans autre geste que le lancement ;
- **action** : la requête part sur un geste explicite (un bouton, un lien) ;
- **installation** : `npm ci` d'un clone du dépôt, `postinstall` compris ;
- **construction** : l'intégration continue et la fabrication de l'installeur ;
- **mainteneur** : un script lancé à la main pour fabriquer ou publier une ressource.

**La colonne « mesuré »** dit si la requête a été vue sortir, et où : *navigateur* (le banc sur le
serveur de développement), *Electron* (l'application sur `dist/`, profil jetable), *paquet*
(l'exécutable empaqueté), *installation* (`npm ci` sondé), *journal CI* (le journal d'une passe
GitHub Actions), *1 octet* (une requête d'un octet qui suit la chaîne de redirection), ou *non*.

## 1. Le recensement

### 1.1 Dans l'application, côté page : ce qu'un composant tire en tournant

Le registre compte 511 fiches. Dans le navigateur, 507 ont été lancées, les quatre générateurs
Ollama étant écartés (section 4) ; **treize** ont fait sortir une requête, toutes vers les hôtes
ci-dessous, et les 494 autres n'ont rien tiré de l'extérieur. Dans Electron, 499 ont été lancées,
huit de plus étant écartées pour la carte graphique ; **onze** sont sorties, vers les mêmes hôtes.
Les deux qui manquent, « whisper-en » et « gpt2-paroles », ont trouvé dans le cache du profil ce
que « couleur-suno-ia » venait de tirer.

| Fichier (ligne) | Fournisseur | Ce qui est tiré | Quand | Mesuré |
|---|---|---|---|---|
| `src/plugins/ocr.ts:13` (`createWorker` sans chemin), défauts de la bibliothèque : `node_modules/tesseract.js/src/worker/browser/defaultOptions.js:11`, `node_modules/tesseract.js/src/worker-script/browser/getCore.js:14`, `node_modules/tesseract.js/src/worker-script/index.js:130` | `cdn.jsdelivr.net` | le worker de Tesseract, son cœur WebAssembly, et les données de chaque langue demandée, sept par défaut (`eng`, `fra`, `deu`, `spa`, `rus`, `ell`, `ara`) | exécution (« OCR ») | navigateur, Electron |
| `src/audio/ia.ts:20`, chargé par `src/plugins/debruitage-ia.ts:78` et `src/plugins/separation.ts:78` | `cdn.jsdelivr.net` | `ort-wasm-simd-threaded.jsep.mjs` et `.wasm` d'onnxruntime-web 1.27.0 : le moteur d'inférence lui-même, exécuté par la page | exécution (« Débruitage IA », « Séparateur IA » en MDX-Net) | navigateur, Electron (débruitage) |
| `src/workers/textgen-worker.js:3`, `opus-worker.js:3`, `image-to-text-worker.js:3`, `tts-worker.js:4`, `asr-worker.js:12` ; défaut de Transformers.js 4.2.0, `node_modules/@huggingface/transformers/src/backends/onnx.js:350` | `cdn.jsdelivr.net` | `ort-wasm-simd-threaded.asyncify.mjs` et `.wasm` d'onnxruntime-web 1.26.0-dev, que Transformers.js va chercher quand aucun chemin n'est posé, ce qu'aucun de ces cinq workers ne fait | exécution | navigateur (« couleur-suno-ia », « gpt2-paroles », « nllb-paroles », « tts-mms », « whisper-en ») ; Electron (« couleur-suno-ia », les suivantes le trouvant en cache) |
| `src/plugins/textgen.ts:297`, `:405`, `:460`, `:490` ; `src/plugins/couleur-suno-ia.ts:129` | `huggingface.co` puis `us.aws.cdn.hf.co` | `Xenova/distilgpt2`, `onnx-community/Qwen2.5-0.5B`, et les `Xenova/opus-mt-*` de la traduction des paroles : l'identifiant devient une adresse dans Transformers.js | exécution (« gpt2-paroles », « nllb-paroles », « qwen2.5-lyrics », « couleur-suno-ia ») | navigateur, Electron |
| `src/plugins/traduction.ts:13`, `:29` → `src/workers/opus-worker.js` | `huggingface.co` puis `us.aws.cdn.hf.co` | le modèle `Xenova/opus-mt-<paire>`, dix-huit paires | exécution (« traduction-opus ») | navigateur, Electron |
| `src/plugins/legende-image.ts:66` → `src/workers/image-to-text-worker.js` | `huggingface.co` puis `us.aws.cdn.hf.co` | `Mozilla/distilvit` | exécution (« legende-image ») | navigateur, Electron |
| `src/plugins/tts.ts:68`, `:122` → `src/workers/tts-worker.js` | `huggingface.co` puis `us.aws.cdn.hf.co` | `Xenova/speecht5_tts`, `Xenova/speecht5_hifigan` et les `Xenova/mms-tts-*`, **alors que le miroir local est présent et complet** : voir la section 3 | exécution (« tts-speecht5 », « tts-mms ») | navigateur, Electron |
| `src/plugins/tts.ts:36` → `src/workers/tts-worker.js:60` | `huggingface.co` (jeu de données `Xenova/cmu-arctic-xvectors-extracted`) | le vecteur de la voix de SpeechT5 ; le relais de `src/workers/tts-local.js:28` le détourne vers le miroir quand il est là | exécution, miroir absent | non (le délai de 90 s est tombé avant) |
| `src/workers/kokoro-local.js:32`, `:83`, par `src/workers/kokoro-tts-worker.js` et `kokoro-francais-worker.js` | `huggingface.co` puis `us.aws.cdn.hf.co` | `onnx-community/Kokoro-82M-v1.0-ONNX` et ses voix, **seulement quand le miroir manque** : il n'est pas posé par le `postinstall`, donc un clone fraîchement installé le tire | exécution, miroir absent | navigateur (clone frais) ; rien avec le miroir, dans le navigateur comme dans Electron |
| `src/workers/piper-tts-worker.js:31` (`PiperWebEngine` sans fournisseur de voix), défaut de la bibliothèque : `node_modules/piper-tts-web/dist/piper-tts-web.js:52959` | `huggingface.co` puis `us.aws.cdn.hf.co` | la voix choisie du dépôt `rhasspy/piper-voices`, `.onnx` et `.onnx.json` (par défaut `ru_RU-irina-medium`) | exécution (« tts-piper ») | navigateur, Electron |
| `src/plugins/ddsp.ts:15` à `:25`, `:57` | `storage.googleapis.com` (`magentadata/js/checkpoints/ddsp/…`) | le point de contrôle de l'instrument, quatre au choix | exécution (« ddsp-tone-transfer ») | navigateur ; Electron, par le pont (1.2) |
| `src/plugins/ddsp.ts:41`, défaut de la bibliothèque : `node_modules/@magenta/music/esm/spice/model.js:2` | `tfhub.dev`, qui redirige vers `www.kaggle.com`, qui redirige vers `storage.googleapis.com/kagglesdsdata` | le modèle de hauteur SPICE | exécution (« ddsp-tone-transfer ») | navigateur ; Electron, par le pont (1.2) |
| `src/plugins/ddsp.ts:105` (« URL modèle »), `src/plugins/separation.ts:79` (« URL du modèle ») → `src/audio/ia.ts:29` | **n'importe quel hôte**, celui que l'utilisateur écrit ; dans Electron, la liste du pont borne DDSP et la politique de sécurité borne la séparation | un modèle désigné par l'utilisateur | action | non |
| `src/plugins/ollama.ts:29`, `:67` (hors Electron ; dans Electron, le pont de 1.2) | Ollama local, `127.0.0.1:11434` | la génération de texte et la liste des modèles | exécution (« ollama-llm », « edition-abc-llm », « prompt-vers-graphe », « contraintes-abc ») ; action | navigateur, Electron (la liste seulement : les quatre fiches n'ont pas été lancées) |

Les composants à miroir local qui n'ont rien tiré : Kokoro (avec son miroir), Whisper et
Sherpa-Whisper (pour le modèle : `asr-worker.js:15` interdit l'amont), Vosk, Magenta, GTCRN, la
SoundFont. Dans un clone fraîchement installé, tous restent muets sauf Kokoro : le `postinstall`
pose les autres, et la SoundFont absente ne se cherche nulle part.

### 1.2 Dans l'application, processus principal d'Electron

| Fichier (ligne) | Fournisseur | Ce qui est tiré | Quand | Mesuré |
|---|---|---|---|---|
| `electron/main.cjs:845`, `:870` (`telecharger:url`), appelé par `src/plugins/electronFetch.ts:36` | `storage.googleapis.com`, `tfhub.dev`, `www.kaggle.com` | les points de contrôle de « DDSP » et le modèle SPICE, pour le compte de la page ; seuls les hôtes de `electron/hotes-telechargement.cjs:32` passent, à chaque redirection | exécution | Electron |
| `electron/main.cjs:972` (`telechargerModeles`), `electron/telechargement-modeles.cjs:148`, adresses lues dans `scripts/modeles-manifest.json` | `github.com` (release `assets`) puis `release-assets.githubusercontent.com` | les paquets de modèles du manifeste ; aucune liste d'hôtes, la redirection est suivie où qu'elle mène | action (panneau des modèles, `main.cjs:1028`) | Electron (`gtcrn`) |
| idem, deux entrées du manifeste (`modeles-manifest.json:1415`, `:1437`) | `huggingface.co` puis `us.aws.cdn.hf.co` | MOSS-Image et Qwen3.5-9B, les deux fichiers au-delà du plafond de 2 Gio d'un asset | action (panneau) | 1 octet |
| `electron/main.cjs:770` (« Bruitage IA ») et `:1687` (« Texte → image (MOSS) ») | les mêmes, par le même téléchargeur | le paquet manquant du seul composant lancé | exécution, quand le paquet manque | non : les paquets sont présents sur ce poste ; le chemin est celui du panneau, mesuré |
| `electron/main.cjs:1437`, `:1449`, `:1506` | Ollama local, `127.0.0.1:11434` (`ATTIC_OLLAMA_URL` le déplace où l'on veut) | la génération de texte et la liste des modèles | exécution (composants Ollama) ; action (listes) | Electron (liste) |
| `electron/main.cjs:177`, `:1894`, `:1923` (electron-updater, `package.json` `build.publish`) | `github.com` (`releases.atom`, `releases/latest`, `releases/tag/…`, `latest.yml`) puis `release-assets.githubusercontent.com` | la description de la dernière version ; l'installeur seulement sur le second clic, `autoDownload` étant faux | action (bouton de mise à jour) | paquet (5.0.4, version 5.1.0 trouvée) |
| `electron/main.cjs`, au démarrage | aucun | rien : ni le processus principal ni la page ne sortent au lancement | démarrage | Electron (sondes, puis connexions TCP de tous ses processus pendant 30 s : zéro) ; paquet (sondes) |
| `electron/main.cjs:1047`, `:1050` | `github.com/FabienCouprie/attic/wiki` | la documentation, ouverte dans le navigateur du système | action | Electron (`shell.openExternal`, relevé sans ouvrir) |
| `electron/main.cjs:375`, `:376` | tout lien `http(s)` d'une page : les dix-neuf favoris de `src/audio/favoris.ts:19` à `:37`, les liens des notices (`src/ui/texteAvecLiens.tsx`) | rien n'est tiré par Attic : le lien s'ouvre dans le navigateur du système | action | Electron (`window.open`) |

### 1.3 À l'installation d'un clone : `npm ci`

| Fichier (ligne) | Fournisseur | Ce qui est tiré | Quand | Mesuré |
|---|---|---|---|---|
| `package.json`, `package-lock.json` | `registry.npmjs.org` | les paquets, et l'audit de sécurité que `npm ci` envoie de lui-même | installation | installation |
| `package.json:57` → `scripts/download-sherpa-wasm.cjs:28` | `github.com` (release `assets`) puis `release-assets.githubusercontent.com` | les cinq fichiers WASM de Sherpa-ONNX, 13 Mo | installation | installation |
| `package.json:57` → `scripts/download-gtcrn.cjs:33` | `raw.githubusercontent.com` (dépôt `Xiaobin-Rong/gtcrn`) | le modèle GTCRN, 344 ko, **chez l'auteur** et non sur la release, alors que le manifeste l'y porte | installation | installation |
| `package.json:57` → `scripts/download-magenta.cjs:30` | `storage.googleapis.com` (`magentadata`) | les cinq points de contrôle Magenta, 30 fichiers, 76,78 Mo, **chez Google** et non sur la release, alors que le manifeste les y porte | installation | installation |
| `package.json:57` → `scripts/download-asr-models.cjs` | `github.com` (release `assets`) | les paquets Whisper et Sherpa-Whisper, 59,5 et 168 Mo | installation | installation |
| `package.json:57` → `scripts/download-vosk-models.cjs` | `github.com` (release `assets`) | les deux modèles Vosk, 42,9 et 41,7 Mo | installation | installation |
| `node_modules/electron/index.js` (premier lancement), `node_modules/electron/install.js` | `github.com/electron/electron` puis `release-assets.githubusercontent.com` | le binaire d'Electron, quand il manque | installation, premier lancement | 1 octet |
| scripts d'installation des paquets (`onnxruntime-node`, `protobufjs`, `tesseract.js`…) | aucun | npm ne les a pas exécutés : « 8 packages have install scripts not yet covered by allowScripts » ; celui d'`onnxruntime-node` ne télécharge que sous Linux x64 | installation | installation |

### 1.4 À la construction : intégration continue et installeur

| Fichier (ligne) | Fournisseur | Ce qui est tiré | Quand | Mesuré |
|---|---|---|---|---|
| `.github/workflows/ci.yml:18`, `:21` ; `release.yml:22`, `:27` | GitHub (`actions/checkout@v5`, `actions/setup-node@v5`, cache npm des Actions) | les deux actions ; Node 22 vient du cache de l'image | construction | journal CI |
| `ci.yml:27`, `release.yml:33` (`npm ci`) | ceux de la section 1.3 | les paquets et le `postinstall` | construction | journal CI |
| `ci.yml:47` (`choco install nsis`) | `community.chocolatey.org` | NSIS 3.13, l'installeur inclus dans le paquet Chocolatey | construction | journal CI |
| `ci.yml:84`, `release.yml:51` (`electron/install.js`) | `github.com/electron/electron` | le binaire d'Electron | construction | non (le journal ne dit rien ; lu) |
| `ci.yml:137` (`npx playwright install chromium`) | `cdn.playwright.dev` | Chrome for Testing, son shell sans tête, FFmpeg et Winldd | construction | journal CI |
| `release.yml:68` (`gh release download`) | `github.com` (release `assets`) | `assets.zip`, 2 060 571 648 octets, pour en extraire la SoundFont | construction | journal CI |
| `release.yml:85` → `scripts/download-music-collection.cjs:36` | `github.com` (release `assets`) | `music-collection.zip` | construction | journal CI |
| `release.yml:99` → `scripts/outils-natifs.cjs:231` | `github.com` (release `assets`) | Songsee, acestep.cpp, audio.cpp, stable-diffusion.cpp, aux versions épinglées | construction | journal CI |
| `release.yml:122` | `registry.npmjs.org` | `electron-builder@26.15.3` | construction | journal CI |
| `release.yml:143` (electron-builder, `package.json` `build.toolsets`) | `github.com/electron-userland/electron-builder-binaries` puis `release-assets.githubusercontent.com` | `nsis-bundle-3.12` et `7zip-win-x64` | construction | journal CI, 1 octet |
| `release.yml:165`, `:169` (`gh release create`, `upload`) | `api.github.com`, `uploads.github.com` | rien n'est tiré : l'installeur part sur la release de l'étiquette | construction | journal CI |

### 1.5 Les scripts du mainteneur

| Fichier (ligne) | Fournisseur | Ce qui est tiré | Quand | Mesuré |
|---|---|---|---|---|
| `scripts/modeles.cjs:47` (`--telecharger`, `npm run assets`) | `github.com` (release `assets`) ; `huggingface.co` pour les deux fichiers de MOSS | les paquets du manifeste, par le téléchargeur d'Electron | mainteneur | non (même tuyau que 1.2, mesuré) |
| `scripts/modeles.cjs:695`, `:825` (`--publier`) | `api.github.com`, `uploads.github.com` (`gh`) | la liste des assets ; puis le téléversement | mainteneur | non |
| `scripts/outils-natifs.cjs:75`, `:78`, `:81` (`--construire`) | `github.com` : `openclaw/songsee`, `ServeurpersoCom/acestep.cpp` et ses sous-modules | les sources, clonées à la version épinglée ; `go build` tire en plus les modules Go de Songsee | mainteneur | non |
| `scripts/outils-natifs.cjs:99` (`--construire`, `amontAsset`) | `github.com` : `0xShug0/audio.cpp`, `leejet/stable-diffusion.cpp`, puis `release-assets.githubusercontent.com` | les binaires publiés par l'amont, vérifiés par empreinte | mainteneur | 1 octet |
| `scripts/outils-natifs.cjs:203`, `:231` | `github.com` (release `assets`), `gh` | téléversement, et `npm run outils` | mainteneur, construction | journal CI (`:231`) |
| `scripts/download-music-collection.cjs:36`, `scripts/download-audiobox-aesthetics.cjs:25` | `github.com` (release `assets`) | la collection de démonstration ; le modèle Audiobox, 420 Mo | mainteneur | non (même release, mesurée) |
| `scripts/download-asr-models.cjs:49`, `:55` (`--amorcer`) | `huggingface.co` (`csukuangfj`, `Xenova`) | l'amont des deux paquets Whisper, avant leur première publication | mainteneur | 1 octet |
| `scripts/download-vosk-models.cjs:40`, `:45` (`--amorcer`) | `alphacephei.com` | les deux modèles Vosk en `.zip` | mainteneur | 1 octet |
| `scripts/download-kokoro.cjs:46`, `:47` (`--amorcer`) | `huggingface.co` (API et fichiers de `onnx-community/Kokoro-82M-v1.0-ONNX`) | l'amont du miroir Kokoro | mainteneur | 1 octet |
| `scripts/download-tts.cjs:108`, `:141` (`--amorcer`) | `huggingface.co` (API, modèles et jeux de données `Xenova`) | l'amont des miroirs SpeechT5 et MMS | mainteneur | non |
| `scripts/download-sa3-sfx.cjs:16`, `:17` | `huggingface.co` (`stabilityai`), `raw.githubusercontent.com` (`Stability-AI`) | le paquet Stable Audio 3 SFX, **toujours chez l'amont**, sans empreinte ni manifeste | mainteneur | 1 octet |
| `scripts/export-audiobox-aesthetics.py:6` | PyPI (`pip install`) ; les poids pris à la main sur `huggingface.co/facebook/audiobox-aesthetics` | PyTorch et les bibliothèques de l'export | mainteneur | non |
| `scripts/build-electron.cjs:165`, `:175` | `registry.npmjs.org` ; ceux d'electron-builder (1.4) | `electron-builder@26.15.3` et ses outils | mainteneur | non |
| `package.json:40` (`publish:electron`, `-p always`), `build.publish` | `api.github.com`, `uploads.github.com`, et ceux d'electron-builder (1.4) | les outils de construction ; puis l'installeur part sur la release, par electron-builder lui-même | mainteneur | non |

### 1.6 Nommé dans le code livré, jamais atteint

| Fichier (ligne) | Adresse | Pourquoi rien ne part |
|---|---|---|
| `public/sherpa-onnx-wasm/sherpa-onnx-core.js:471` | `cdnjs.cloudflare.com` (JSZip) | dans `extractZip`, que le worker de `public/sherpa-asr-worker.js` n'appelle pas : il charge ses fichiers un à un ; et `document` n'existe pas dans un worker |
| `node_modules/vexflow/build/esm/src/font.js:258` | `unpkg.com`, `cdn.jsdelivr.net` (`vexflow-fonts`) | `Font.loadWebFonts()` n'est appelé ni par VexFlow ni par Attic |
| `node_modules/resonance-audio/build/resonance-audio.js:6257` (Omnitone) | `raw.githubusercontent.com/GoogleChrome/omnitone` | sert au seul `FOADecoder`, le décodeur d'un élément vidéo, qu'Attic ne crée pas ; les rendus ambisoniques prennent leurs réponses impulsionnelles en base64 dans la bibliothèque |
| `src/workers/asr-worker.js:15` | `huggingface.co`, l'hôte par défaut de Transformers.js | `allowRemoteModels = false` : le modèle ne vient que du dossier local |
| `src/audio/musicxml.ts:152`, `src/audio/musicxml-arbre.ts:197` | `www.musicxml.org` | la DTD est écrite dans le fichier exporté ; rien ne la lit |
| `src/audio/favoris.ts:37` | `huggingface.co/datasets/…` | un favori, ouvert par l'utilisateur, comme les dix-huit autres |
| `electron/main.cjs:387` | `localhost:5175` | le serveur de développement, en mode développement seulement |
| les en-têtes de `src/audio/` (`arxiv.org`, `dafx.de`…) | articles cités | des commentaires |

## 2. Les hôtes, et ce que les listes du dépôt en savent

Trois listes d'hôtes vivent dans le dépôt, pour trois usages :

- **le garde de provenance**, `src/plugins/provenance-modeles.test.ts:32` : les hébergeurs de
  modèles dont aucune source de composant ne doit écrire l'adresse. Il connaît `huggingface.co`,
  `storage.googleapis.com`, `tfhub.dev`, `raw.githubusercontent.com` et `kaggle.com` ;
- **la liste du pont**, `electron/hotes-telechargement.cjs:32` : ce que `telecharger:url` accepte
  pour la page. `tfhub.dev`, `storage.googleapis.com`, `kaggle.com`, `googleusercontent.com`,
  `kagglesdsdata.blob.core.windows.net`, et leurs sous-domaines ;
- **la politique de sécurité**, `electron/politique-securite.cjs:26` et `:33` : ce que la page peut
  joindre dans Electron. `connect-src` : `huggingface.co`, `cdn.jsdelivr.net`, `*.hf.co`,
  `*.xet-bridge-us.hf.co`, `tfhub.dev`, `*.tfhub.dev`, `storage.googleapis.com`, `*.kaggle.com`,
  `*.googleusercontent.com`, `127.0.0.1:11434`, `localhost:11434` ; `script-src` :
  `cdn.jsdelivr.net`.

Seul le premier est un garde. Il ne connaît que des hôtes, et seulement sous forme d'adresse écrite
en toutes lettres dans un fichier de `src/plugins/`, `src/workers/` ou `src/audio/`, sans
sous-dossier. **Il ne voit pas** une adresse que construit une bibliothèque (Tesseract, Piper,
Transformers.js), un identifiant de modèle que Transformers.js change lui-même en adresse
`huggingface.co`, ni ce qui vit dans `electron/`, `scripts/`, `public/` ou `.github/`.

**Les hôtes que le garde de provenance ne connaît pas sont marqués ✗.** Le garde compare des
chaînes : `www.kaggle.com` y passe pour `kaggle.com`, mais `us.aws.cdn.hf.co` n'y passe pas pour
`huggingface.co`.

| Hôte | Ce qui en vient | Garde de provenance | Liste du pont | Politique de sécurité | Vu sortir |
|---|---|---|---|---|---|
| `huggingface.co` | modèles de Transformers.js, voix de Piper, Kokoro sans son miroir, MOSS-Image et Qwen3.5 du manifeste, amorçage des miroirs | oui | non | oui | navigateur, Electron, 1 octet |
| `us.aws.cdn.hf.co` ✗ | la fin de la redirection de tout gros fichier de Hugging Face | **non** | non | oui (`*.hf.co`) | navigateur, Electron, 1 octet |
| `cdn.jsdelivr.net` ✗ | le moteur onnxruntime-web (`ia.ts`, Transformers.js), Tesseract et ses langues | **non** | non | oui (`connect-src` et `script-src`) | navigateur, Electron |
| `storage.googleapis.com` | DDSP, SPICE au bout de la redirection de Kaggle, Magenta à l'installation | oui | oui | oui | navigateur, Electron, installation |
| `tfhub.dev` | SPICE | oui | oui | oui | navigateur, Electron |
| `www.kaggle.com` | la redirection de `tfhub.dev` | oui | oui | oui (`*.kaggle.com`) | navigateur, Electron |
| `raw.githubusercontent.com` | GTCRN à l'installation ; Stable Audio 3 SFX par script | oui | non | non | installation, 1 octet |
| `github.com` ✗ | la release `assets` (modèles, moteurs, WASM de Sherpa), la mise à jour, la documentation, le binaire d'Electron, les outils d'electron-builder, les dépôts amont | **non** | non | non | Electron, paquet, installation, journal CI |
| `release-assets.githubusercontent.com` ✗ | la fin de la redirection de toute release GitHub | **non** | non | non | Electron, paquet, 1 octet |
| `127.0.0.1:11434` ✗ | Ollama, sur le poste | **non** | non | oui | navigateur, Electron |
| `registry.npmjs.org` ✗ | les paquets npm, l'audit | **non** | non | non | installation, journal CI |
| `alphacephei.com` ✗ | Vosk, à l'amorçage | **non** | non | non | 1 octet |
| `api.github.com`, `uploads.github.com` ✗ | `gh` : liste et téléversement des assets | **non** | non | non | journal CI |
| GitHub Actions ✗ | `actions/checkout`, `actions/setup-node`, le cache npm | **non** | non | non | journal CI |
| `community.chocolatey.org` ✗ | NSIS en intégration continue | **non** | non | non | journal CI |
| `cdn.playwright.dev` ✗ | Chromium en intégration continue | **non** | non | non | journal CI |
| PyPI ✗ | les bibliothèques de l'export d'Audiobox | **non** | non | non | non |
| le mandataire des modules Go ✗ | les dépendances de Songsee, à sa construction | **non** | non | non | non |
| les dix-neuf favoris et le wiki ✗ | des liens, ouverts dans le navigateur du système | **non** | non | sans objet | Electron (`shell.openExternal`) |

**Dans les listes, jamais vus sortir** : `googleusercontent.com` et
`kagglesdsdata.blob.core.windows.net` (pont et politique), `*.xet-bridge-us.hf.co`, `*.tfhub.dev`
et `localhost:11434` (politique). La redirection de SPICE aboutit aujourd'hui à
`storage.googleapis.com/kagglesdsdata`, déjà connu ; celle de Hugging Face à `us.aws.cdn.hf.co`.

**Nommés dans le code livré, jamais atteints** (section 1.6) : `cdnjs.cloudflare.com`, `unpkg.com`,
`raw.githubusercontent.com/GoogleChrome/omnitone`, `www.musicxml.org`.

## 3. Les écarts entre la lecture et la mesure

### Ce que la mesure a vu et que le code d'Attic ne dit pas

- **« tts-speecht5 » et « tts-mms » tirent leurs poids de `huggingface.co` alors que leurs miroirs
  sont complets.** Mesuré : la sonde du miroir rend 200 sur
  `/oonx/tts-speecht5/Xenova/speecht5_tts/config.json`, puis `config.json`, `tokenizer.json`,
  `encoder_model.onnx` et `decoder_model_merged.onnx` partent vers Hugging Face. Le garde de
  provenance tient pourtant `tts.ts` pour une « dette payée le 2026-10-20 », et
  `src/workers/tts-worker.js:10` dit le miroir branché. Le même relevé vaut dans Electron. La cause
  se lit dans la bibliothèque : Transformers.js 4.2.0 capture `globalThis.fetch` au chargement du
  module (`node_modules/@huggingface/transformers/src/env.js:169`) et passe ensuite par
  `env.fetch` (`node_modules/@huggingface/transformers/src/utils/hub.js:70`), tandis que le relais
  de `src/workers/tts-local.js` remplace `self.fetch` après coup. À la lecture, le relais ne sert
  plus que le vecteur de voix, que le worker va chercher lui-même par le `fetch` global. Kokoro,
  qui embarque sa propre copie de la bibliothèque, est bien servi par son miroir. **Ce relevé ne
  corrige rien** ; la correction suit à part, par la pull request #242.
- **Les fins de redirection** : `us.aws.cdn.hf.co`, `release-assets.githubusercontent.com`,
  `www.kaggle.com` et `storage.googleapis.com/kagglesdsdata` ne sont écrits nulle part dans le
  dépôt. Ce sont pourtant eux qui servent les octets.
- **Le moteur d'onnxruntime-web 1.26.0-dev** que Transformers.js va chercher sur `cdn.jsdelivr.net`
  n'est écrit que dans la bibliothèque. Il part pour Whisper aussi, dont le modèle est local.
- **L'audit de `npm ci`**, `registry.npmjs.org/-/npm/v1/security/advisories/bulk`, part de
  lui-même à chaque installation.
- **Dans Electron, la politique de sécurité n'a rien refusé** : aucun message de refus sur les 499
  fiches. Tout ce que la page tire dans le navigateur, elle le tire aussi dans l'application.

### Ce que la lecture a trouvé et que la mesure n'a pas vu

- Le WebAssembly de Transformers.js depuis `opus-worker.js` et `image-to-text-worker.js` : pour
  « traduction-opus » et « legende-image », le délai de 90 s est tombé pendant le téléchargement du
  modèle, avant le chargement du moteur. Les trois autres workers de la bibliothèque, qui le
  chargent par le même défaut, l'ont tiré.
- Le vecteur de voix de SpeechT5 sans miroir (`tts.ts:36`) : même délai.
- Les sorties de la section 4, qui n'ont pas été exercées.

## 4. Ce qui n'a pas pu être exercé

| Ce qui | Pourquoi | Ce qui en tient lieu |
|---|---|---|
| Les quatre générateurs Ollama (« ollama-llm », « edition-abc-llm », « prompt-vers-graphe », « contraintes-abc ») | ils font charger un modèle sur la carte graphique, qu'Ollama y garde cinq minutes, alors qu'une autre session y faisait tourner ACE-Step | la liste des modèles, mesurée dans le navigateur et dans Electron ; même hôte, même port |
| Dans Electron, la famille ACE-Step (sept fiches) et « Texte → image (MOSS) » | même raison : la carte, et des calculs de plusieurs minutes même sur processeur. Les autres moteurs natifs ont tourné sur le processeur ; Songsee s'est arrêté avant de lancer son exécutable (« Répertoire de travail non résolu ») | le guet TCP des exécutables de `bin/` : quatre exécutions d'audio.cpp, aucune connexion ; et la lecture de leurs chaînes : ni libcurl, ni WinHTTP |
| Le démarrage du processus principal avant la pose des sondes | la sonde précoce (`NODE_OPTIONS=--require`) n'a été chargée ni par `electron .` lancé par Playwright, ni par le paquet | les connexions TCP de tous les processus de l'application, relevées par le système pendant 30 s de démarrage : aucune. Le même relevé voit la connexion d'un témoin vers `github.com` |
| La récupération automatique d'un paquet manquant (`main.cjs:770`, `:1687`) | les paquets sont présents sur ce poste, et ceux de MOSS pèsent plusieurs gigaoctets | le même téléchargeur, mesuré par le panneau sur `gtcrn` |
| MOSS-Image et Qwen3.5-9B depuis Hugging Face | 9 007 923 264 octets à eux deux | une requête d'un octet : `huggingface.co` puis `us.aws.cdn.hf.co` |
| Le téléchargement de l'installeur par la mise à jour | il téléchargerait l'installeur entier et proposerait de l'installer | la vérification, mesurée sur l'exécutable 5.0.4 |
| Les adresses saisies par l'utilisateur (« URL modèle », « URL du modèle ») | aucun hôte n'est fixé : c'est celui qu'on écrit | la lecture, et les bornes du pont et de la politique de sécurité dans Electron |
| Les scripts du mainteneur qui publient ou construisent (`--publier`, `--construire`, `--amorcer`) | ils écrivent sur la release ou compilent | une requête d'un octet par hôte amont ; la lecture |
| Les workflows GitHub | ils tournent chez GitHub | leurs journaux du 2026-10-29 et du 2026-10-31 |
| Les composants Python et Julia (`main.cjs:1336`, `:1411`) | ils exécutent le code de l'utilisateur, qui peut joindre ce qu'il veut | rien : c'est hors du code livré |
| Un nœud installé depuis une archive | son code est celui d'un tiers ; il tourne dans le cadre isolé, borné par la même `connect-src` | la politique de sécurité, lue |
| Le téléchargement du binaire d'Electron | il est en cache sur ce poste | une requête d'un octet |
| Le script d'installation d'`onnxruntime-node` sous Linux x64 | ce poste est sous Windows, où il ne télécharge rien | la lecture : il prend les binaires CUDA 12 |

## 5. Comment la mesure a été faite

**Dans un navigateur.** Chaque fiche du registre lancée sur le banc de mesure
(`tests-e2e/banc-mesure.ts`), sur un serveur de vérification (`tests-e2e/serveur-de-developpement.ts`),
avec un délai de 90 s par fiche : 507 fiches en 37 minutes. Deux relevés se recoupent : les
requêtes du contexte Playwright, workers compris, et le domaine Network de CDP. Chaque requête dont
l'origine n'est pas le serveur est notée avec la fiche qui tournait, et chaque lecture d'un dossier
de modèles local aussi. Les dix-huit fiches qui en lisent un ont été relancées dans un **clone
fraîchement installé** par `npm ci` : leurs modèles y sont ceux du `postinstall`, sans les miroirs
de Kokoro et des deux synthèses Transformers.js, ce qui montre le repli réel quand un miroir manque.

**Dans Electron.** L'application lancée par `electron .` sur `dist/` reconstruit le jour même, hors
développement, avec un profil jetable (`--user-data-dir`). Des sondes posées par `app.evaluate`,
sans rien modifier au dépôt, sur `http`, `https` et `fetch` de Node, `net.request` et `net.fetch`
d'Electron, `webRequest.onBeforeRequest` de chaque session, et `shell.openExternal`, remplacé par
un relevé pour qu'aucun navigateur ne s'ouvre. Puis le démarrage rejoué sondes posées, cinq gestes
(documentation, lien externe, liste Ollama, mise à jour, un modèle du panneau), et le banc dans la
fenêtre d'Electron, politique de sécurité comprise : 499 fiches en 44 minutes. Les moteurs natifs
y tournaient sur le processeur, et les connexions TCP des exécutables de `bin/` étaient guettées
par le système, les sondes ne voyant pas un processus enfant.

**Le démarrage, vu par le système.** Une sonde chargée avant `main.cjs` par
`NODE_OPTIONS=--require` devait couvrir ce qui précède la pose des autres ; elle n'a jamais été
chargée. Le démarrage a donc été relevé sans elle : l'application lancée sur `dist/` avec un profil
jetable, et toutes les connexions TCP de ses neuf processus relevées pendant 30 s. Le même relevé,
lancé sur un témoin qui ouvre une connexion vers `github.com`, la voit.

**L'exécutable empaqueté.** `release/win-unpacked/Attic.exe`, version 5.0.4, profil jetable : le
démarrage et la vérification de mise à jour, par les sondes posées après le lancement.

**L'installation.** `npm ci` complet dans un arbre séparé tiré d'`origin/master`, une sonde Node
chargée dans chacun des dix-neuf processus Node par `NODE_OPTIONS`.

**La construction.** Les journaux de la dernière passe de `ci.yml` (2026-10-31) et de la
construction de la v5.1.0 par `release.yml` (2026-10-29), lus par `gh run view --log`.

**Le bundle livré.** Les hôtes écrits dans `dist/`, construit le 2026-10-31, ont été relevés, une
cinquantaine. Ceux qui ne figurent pas ici n'ont été vus sortir par aucune des mesures : ce sont
les textes de licence, les espaces de noms XML et les liens de documentation des bibliothèques
(`apache.org`, `w3.org`, `music-encoding.org`, `reactflow.dev`…). C'est par ce relevé qu'est
apparue l'adresse dormante d'Omnitone.

**Les redirections.** `fetch` de Node suit une redirection sans la montrer. La fin de chaque chaîne
a donc été relevée à part, par une requête d'un seul octet (`Range: bytes=0-0`).

**Ce que l'instrument a d'abord manqué.** Le premier balayage s'est arrêté vers la centième fiche :
un rechargement de la page a détruit le contexte du banc ; au passage suivant, il est resté figé au
même endroit, sans connexion extérieure ouverte, la cause probable étant un composant qui calcule
sans rendre la main dans le processus de rendu où la page suivante s'ouvrait. Cette cause n'est pas
prouvée : rejouées seules, les douze fiches de la zone passent. L'instrument reprend désormais
chaque fiche une fois sur un contexte neuf, qui a son propre processus, et borne ses appels CDP.

Les scripts de la mesure sont restés hors du dépôt, dans `work/recensement-reseau/`, que git ignore.
