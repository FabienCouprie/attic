# Le fichier de configuration d'Attic

Attic lit au démarrage un fichier de configuration, sous Windows comme sous Linux. Il règle ce qui
dépend de la machine : des chemins, des seuils, des adresses. Il ne règle jamais ce dont dépend le
son d'un graphe enregistré : un projet sonne pareil sur toutes les machines.

Le code est `electron/configuration.cjs` ; son garde, `src/docs/configuration.test.ts`, refuse une
clé qui n'aurait pas sa ligne ci-dessous et un lecteur dans le code.

## Où il est

| | Windows | Linux |
|---|---|---|
| Le fichier de la personne | `%APPDATA%\attic\config.json` | `~/.config/attic/config.json` |
| Le fichier proposé | `%APPDATA%\attic\config.propose.json` | `~/.config/attic/config.propose.json` |

Le dossier est celui des réglages de l'application (`userData`), et sous Linux celui que la
convention XDG leur réserve (`$XDG_CONFIG_HOME/attic`). Jamais à côté de l'exécutable : le dossier
d'installation n'est pas inscriptible, et un AppImage est en lecture seule.

**`config.json` n'existe que si la personne l'écrit.** Absent, ce sont les défauts.

**`config.propose.json` est réécrit à chaque lancement** avec les valeurs en vigueur sur cette
machine : les chemins y sont ceux que l'installeur a posés et ceux que le système impose. On y
recopie dans `config.json` ce qu'on veut changer, et rien d'autre : ce qui n'est pas écrit dans
`config.json` suit les défauts de la version installée, qui peuvent changer d'une version à l'autre.

## Comment il s'écrit

Du JSON strict, en UTF-8 : pas de commentaire. Un BOM et des fins de ligne Windows sont acceptés.

```json
{
  "uneCleCommune": 2,
  "windows": { "unChemin": "E:/modeles" },
  "linux": { "unChemin": "~/modeles" }
}
```

- **La partie commune vaut sur les deux systèmes ; la section `windows` ou `linux` la complète** et
  l'emporte sur elle. La section de l'autre système est ignorée, si bien qu'un même fichier peut
  servir sur les deux.
- **Un chemin est absolu.** Sous Windows, une lettre de lecteur ou un partage réseau
  (`\\serveur\partage`), et les barres obliques sont acceptées : `E:/modeles` vaut `E:\modeles`, qui
  s'écrirait `"E:\\modeles"` en JSON. `~/` en tête désigne le dossier personnel, sur les deux
  systèmes. Aucune autre expansion : ni `%VAR%`, ni `$VAR`.
- **Une variable d'environnement l'emporte sur le fichier**, qui l'emporte sur le défaut. Dans
  l'environnement, une liste de chemins se sépare comme un `PATH` : `;` sous Windows, `:` sous Linux.

## Quand il est faux

Rien n'empêche le démarrage. Une erreur de syntaxe, une clé inconnue, une valeur du mauvais type ou
hors de ses bornes, une clé propre à l'autre système hors de sa section : chacune est nommée dans le
journal du processus principal, ligne `[attic] configuration`, et le défaut s'applique.

**Sous Linux, un fichier inscriptible par le groupe ou par tous n'est pas appliqué**, et le journal
le dit. Aucun canal de l'interface ne peut écrire le fichier.

## Les clés

Chaque pièce du plan ajoute la sienne ici ; le socle (pièce C0) n'en portait aucune.

| Clé | Type | Défaut sous Windows | Défaut sous Linux | Variable | Lue par |
|---|---|---|---|---|---|
| `plafondPaquetMio` | nombre, de 256 à 2000 | 1024 | 1024 | — | l'export et l'import d'un paquet `.attic` |
| `budgetMemoireGio` | nombre, de 2 à 4096 | la mémoire de la machine | la mémoire de la machine, ou la limite de son groupe de contrôle si elle est plus basse | — | le seuil des aperçus, l'historique, l'indicateur de mémoire |
| `dossierModeles` | chemin | `%APPDATA%\attic\ressources` | `$XDG_DATA_HOME/attic/ressources`, soit `~/.local/share/attic/ressources` | — | le téléchargement et la lecture des modèles |
| `racines` | liste de chemins | aucune | aucune | `ATTIC_RACINES` | le pont des fichiers |
| `python` | chemin | celui que l'application trouve | celui que l'application trouve | `ATTIC_PYTHON` | les nœuds Python, après le choix fait dans le nœud |
| `julia` | chemin | celui que l'application trouve | celui que l'application trouve | `ATTIC_JULIA` | les nœuds Julia, après le choix fait dans le nœud |
| `ollama` | adresse `http` ou `https` | `http://127.0.0.1:11434` | `http://127.0.0.1:11434` | `ATTIC_OLLAMA_URL` | le nœud Ollama |
| `calcul` | `auto`, `processeur` ou `carte` | `auto` | `auto` | — | le sens d'« Automatique » dans le réglage « Calcul » des nœuds |
| `affichage` | `auto`, `x11` ou `wayland`, dans la section `linux` | sans objet | `auto` | — | le démarrage, sous Linux ; **non vérifié** |
| `horsLigne` | `true` ou `false` | `false` | `false` | `ATTIC_HORS_LIGNE` (`1`, `true`, `oui`) | le navigateur, les téléchargements, Ollama, la mise à jour |

### `plafondPaquetMio`, le plafond d'un paquet `.attic`

Ce qu'un paquet porte au plus, **décompressé et en tout**, en Mio (1 Mio = 1 048 576 octets). Il
borne l'écriture comme la lecture : à l'export, un résultat qui ferait dépasser le plafond est
laissé hors du paquet, et l'alerte le nomme ; à l'ouverture, un paquet qui déclare davantage est
refusé avant qu'un octet ne soit décompressé, et le message dit les deux nombres. C'est la garde
contre une archive piégée qui se décompresserait sans fin.

**Un paquet écrit sous un plafond haut ne s'ouvre que sous un plafond aussi haut.** Le donner à une
autre machine, c'est lui demander le même réglage.

**Pourquoi 2000 Mio au plus, et non 4 Gio.** Relevé le 2026-11-19 dans Electron 43, sous Windows :
l'interface ne sait pas réserver d'un seul tenant plus de 2 145 386 496 octets (2 Gio moins 2 Mio),
et l'archive y existe d'un seul tenant, à l'export comme à l'ouverture. 2000 Mio laissent la place
des en-têtes de l'archive. La borne n'a pas été relevée sous Linux.

**Ce que cela coûte en mémoire.** L'export garde deux copies des données le temps d'écrire, et
l'archive traverse le pont entre l'interface et le processus principal. Relevé pour une archive de
1,95 Gio : environ 6,4 Go de pointe dans chacun des deux processus, et 10,6 Go dans l'interface après
l'ouverture. Sur une machine de 16 Go, rester sous 1024 Mio est prudent.

### `budgetMemoireGio`, le budget mémoire

Ce que la personne accorde à Attic sur cette machine, en Gio (1 Gio = 1 073 741 824 octets). **Par
défaut, la mémoire vive de la machine**, au dixième de Gio inférieur ; sous Linux, la limite du
groupe de contrôle (un conteneur, une session bornée par `systemd`) quand elle est plus basse.
`config.propose.json` montre la valeur lue sur la machine.

**Il ne borne pas la mémoire.** Le tas JavaScript reste à 4 Gio, et rien ne peut forcer Chromium à
rendre ce que ses processus tiennent. Il règle ce qu'Attic choisit de garder, en proportion d'une
machine de 16 Gio, pour laquelle les réglages d'avant ont été posés :

| | 16 Gio sous Windows | 16 Gio sous Linux | 64 Gio sous Windows |
|---|---|---|---|
| Seuil des aperçus, quand l'économie de mémoire est active | 10 min | 8 min | 40 min |
| États que Ctrl+Z peut défaire | 50 | 38 | 200 |
| L'indicateur de mémoire alerte au-delà de | 12,8 Gio | 9,6 Gio | 51,2 Gio |

- **Le seuil des aperçus** : au-delà, un nœud qu'on ne regarde pas ne garde plus l'aperçu qu'on
  écoute sous lui ; il le refait quand on le demande. Et le même seuil décide ce que l'économie de
  mémoire lâche du cache à la fin d'une passe : un résultat plus long que lui se recalcule au run
  suivant. Arrondi à la minute, de 2 min à 1 h.
- **La profondeur de l'historique** : chaque état garde les fichiers de ses nœuds. De 10 à 200.
- **L'alerte** : l'indicateur de la barre d'outils passe en rouge, et son infobulle le dit. Elle
  n'arrête rien.
- **La part utile est de 80 % du budget sous Windows, 60 % sous Linux** : un dépassement y fait
  tuer le processus par le noyau, quand Windows écrit sur son fichier d'échange.

**Pour retrouver exactement les réglages d'avant sur une machine mieux pourvue**, écrire
`"budgetMemoireGio": 16` sous Windows.

### `dossierModeles`, le dossier des modèles téléchargés

Où descendent les modèles que le gestionnaire télécharge, et où les nœuds les cherchent avant ceux
que l'installeur a livrés. Ils pèsent des dizaines de gigaoctets. **Le défaut est le dossier que
l'application sert déjà** : sous Windows, dans le profil itinérant (`%APPDATA%`), qu'un domaine
d'entreprise peut recopier d'une machine à l'autre ; sous Linux, le dossier des données de la
convention XDG. `config.propose.json` montre celui de la machine.

Un chemin s'écrit de préférence dans la section du système, puisqu'il n'est valable que sur lui :

```json
{ "windows": { "dossierModeles": "E:/modeles" }, "linux": { "dossierModeles": "~/modeles" } }
```

**Changer de dossier déplace l'ancien par un renommage, une fois, au lancement**, quand le nouveau
n'existe pas encore : instantané sur le même disque. **Rien n'est jamais recopié d'un disque à
l'autre** : recopier des dizaines de gigaoctets sans l'avoir demandé figerait l'application. L'ancien
dossier sert alors encore, et le journal (`[attic] ressources : conserve …`) dit de le déplacer à la
main. Si le nouveau dossier existe déjà, il sert, et l'ancien reste où il est.

### `racines`, `python`, `julia`, `ollama` : les variables d'environnement d'avant

Ces quatre réglages ne se faisaient que par une variable d'environnement, qu'on ne pose pas sans un
lanceur ou un shell. **Chaque variable garde son nom et l'emporte sur le fichier** ; le fichier les
rend écrivables à la main.

- **`racines`**, ou `ATTIC_RACINES` : des dossiers où l'application peut lire et écrire pour un
  nœud, en plus de ceux qu'elle s'accorde elle-même (son profil, le dossier de travail, et tout
  dossier choisi dans un dialogue). Des chemins absolus : une racine relative est refusée, et toute
  la liste avec elle. Ils ne sont pas retenus d'un lancement à l'autre : retirés du fichier, ils
  cessent d'en être. **Un lien ou une jonction posé dans une racine ne mène pas au dehors** : le
  chemin est comparé à ce qu'il désigne.
- **`python`** et **`julia`**, ou `ATTIC_PYTHON` et `ATTIC_JULIA` : l'interprète des nœuds de
  script. **Le fichier n'en donne que le défaut** : l'exécutable choisi dans le nœud passe avant lui,
  et sans les deux l'application cherche elle-même, aux emplacements connus puis dans le `PATH`.
  `config.propose.json` montre celui qu'elle a trouvé, s'il a un chemin absolu.
- **`ollama`**, ou `ATTIC_OLLAMA_URL` : l'adresse du serveur Ollama, en `http` ou `https`, que le
  processus principal interroge pour le nœud. Hors de l'application de bureau, dans le serveur de
  développement, le nœud appelle encore `http://127.0.0.1:11434` : il n'y a pas de fichier à lire.

### `calcul`, ce que veut dire « Automatique »

Les nœuds à modèle ont un réglage « Calcul », dont la valeur par défaut est « Automatique ». **La clé
ne change aucun nœud ni aucun graphe** : elle dit ce que « Automatique » veut dire sur cette machine.
Un choix explicite dans un nœud l'emporte toujours.

| | Moteurs du pont (audio.cpp, acestep.cpp, stable-diffusion.cpp) | Moteurs DirectML (Bruitage IA, image SDXS) |
|---|---|---|
| auto | le moteur choisit | la carte, puis le processeur si elle refuse le modèle |
| processeur | le processeur | le processeur |
| carte | le moteur choisit | la carte, sans repli ; **sans effet sous Linux**, où DirectML n'existe pas |

**« carte » laisse les moteurs du pont choisir**, parce que le numéro d'une carte dépend de la
machine : sur une machine à deux circuits, `Vulkan0` est souvent le circuit intégré. Pour imposer une
carte précise, la choisir par son numéro dans le nœud. Le journal du processus principal dit ce que
vaut « Automatique » quand la clé le change.

### `affichage`, X11 ou Wayland sous Linux

Electron choisit lui-même entre X11 et Wayland. L'interface n'a jamais été vue sous Wayland ; en cas
de défaut d'affichage, `x11` est le repli (`BUILD-LINUX.md` §10.5). La clé ne vaut que dans la
section `linux` :

```json
{ "linux": { "affichage": "x11" } }
```

`auto` ne pose rien. `x11` et `wayland` posent `--ozone-platform` au démarrage, et le journal le dit.
Une option `--ozone-platform` déjà donnée au lanceur l'emporte.

**Non vérifié** : aucune construction Linux n'existe encore, et que Chromium entende l'option posée
par l'application, si tôt soit-elle posée, reste à éprouver. Si le journal la dit posée et que
l'affichage ne change pas, la passer au lanceur : `attic --ozone-platform=x11`.

### `horsLigne`, rien ne sort de la machine

`"horsLigne": true` coupe tout ce qui viserait une autre machine que celle-ci, et le nomme dans le
journal du processus principal, une fois par adresse :

- **les requêtes de l'interface**, celles de la page, de ses workers et de ses cadres ;
- **les téléchargements de modèles**, refusés avant toute connexion, avec un message qui dit la clé ;
- **Ollama**, si son adresse vise une autre machine ; à `127.0.0.1`, il répond toujours ;
- **la recherche de mise à jour**, qui répond alors « indisponible ».

Ce qui reste permis : la machine elle-même (`localhost`, `127.0.0.1`, `[::1]`) et ce qui ne quitte
pas l'application (ses fichiers, `data:`, `blob:`). Un nœud dont le modèle n'est pas encore sur le
disque échoue au lieu de le tirer. Un lien de documentation ouvert dans le navigateur du système
n'est pas concerné : il quitte l'application.

## Ce qui n'y sera jamais

- Le niveau d'écoute et le bridage des formules (`AGENTS.md` §4) : amplifier reste un acte explicite.
- Ce dont dépend le son d'un graphe enregistré.
- La désactivation du bac à sable de Chromium (`BUILD-LINUX.md` §10.4).
