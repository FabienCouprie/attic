# acestep.cpp

Ce dossier reçoit les exécutables d'[acestep.cpp](https://github.com/ServeurpersoCom/acestep.cpp),
qui génère une chanson en local : `ace-lm` écrit les paroles, les métadonnées et les codes audio,
`ace-synth` rend l'audio en WAV ou MP3 48 kHz. Les bibliothèques `ggml*` les accompagnent.

Les binaires ne sont pas versionnés. Ils vivent sur la release `assets`, à la version épinglée dans
`scripts/outils-manifest.json`, et se récupèrent avec leur empreinte :

```bash
npm run outils              # récupère pour cette plateforme, et vérifie le SHA-256
npm run outils:verifier     # dit ce qui manque, sans rien toucher
```

## Reconstruire depuis la source

La version épinglée se reconstruit seule, pour peu que l'environnement soit en place :

```bash
npm run outils:construire acestep
```

Sous Windows, cela demande un invite de développeur Visual Studio — `vcvars64.bat` appelé au
préalable, pour que `cmake`, `ninja` et `cl.exe` soient dans le chemin — ainsi que le **SDK Vulkan**
(paquet winget `KhronosGroup.VulkanSDK`). Deux pièges relevés à la mise en place : le chemin de
construction doit rester court, MSVC refusant de poser un objet au-delà de 250 caractères, et
`--device` nomme un périphérique précis, `Vulkan0` pouvant être le circuit intégré plutôt que la
carte graphique.

Une fois construits, `npm run outils:publier acestep` les téléverse sur la release et inscrit
taille et empreinte au manifeste.

## Modèles

Les exécutables ne portent aucun poids : les GGUF d'ACE-Step 1.5 se téléchargent à part et se
passent par `--models <dossier>`.
