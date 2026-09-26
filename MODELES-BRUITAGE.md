# Le bruitage par modèle : ce qui est en place, ce qui manque, ce qui existe ailleurs

> Note de travail du 25 septembre 2026, écrite à la demande de Fabien pour que la question se
> retrouve. Elle porte sur le nœud « Bruitage IA » (`src/plugins/bruitage-ia.ts`) et sur le choix du
> modèle qui l'alimente. Tout ce qui est chiffré ici a été mesuré sur cette machine, sauf mention
> contraire.

## 1. Le défaut, et sa cause

Le nœud retombe sur de la musique, de façon apparemment aléatoire. **La cause n'est ni le prompt ni
le hasard : c'est le modèle installé.**

Attic embarque `stable-audio-3-small-music`, la variante **musicale** d'une fratrie qui en compte
trois :

| variante | ce à quoi elle est destinée |
| --- | --- |
| `stable-audio-3-small-music` | la musique |
| `stable-audio-3-small-sfx` | **le bruitage**, étiqueté `sound-effects` par Stability |
| `stable-audio-3-medium` | les deux, pour plus gros |

Le suffixe « music » nomme donc la variante, pas le domaine : le modèle installé sait bruiter,
puisque plus du tiers de son apprentissage est de la prise de terrain, mais il retombe vers ce qui
domine son corpus dès que la demande lui laisse du jeu.

**Une précision que j'avais d'abord donnée à tort.** J'ai écrit que la variante bruitage était le
même corpus dont on aurait retiré la musique par étiquetage PANNs. Les deux fiches de modèle
décrivent en fait **le même jeu d'entraînement**, 1 278 902 enregistrements dont 806 284 d'AudioSparx
et 472 618 de Freesound, et la mention de PANNs y désigne une **vérification de droits** sur la part
Freesound, non un filtre entre les deux variantes. Comment elles diffèrent n'est écrit nulle part.
Ce qui est établi, c'est que Stability en publie une pour le bruitage et l'annonce comme telle.

## 2. Ce qui a été mesuré

### La musicalité se mesure à la pulsation, pas à la platitude

Le premier relevé employait la platitude spectrale et n'a rien vu : une nappe de synthétiseur est
aussi peu plate qu'un orage. La mesure qui sépare vraiment est **l'autocorrélation de l'enveloppe
d'attaques** sur les retards de 0,25 à 2 secondes. Une boucle y fait un maximum franc, une ambiance
n'en fait aucun.

### La formulation pèse cinq fois plus que la graine

Même modèle, même durée, six secondes, huit étapes.

| ce qui change | force de la pulsation |
| --- | --- |
| cinq graines, un seul prompt | 0,212 · 0,264 · 0,286 · 0,236 · 0,266 (écart-type **0,026**) |
| « door creaking » | **0,660** |
| la porte décrite en détail | 0,212 |
| la même, plus « foley, no music, no melody » | **0,117** |
| témoin : « a rhythmic electronic loop with deep bass and crisp drums » | 0,758 |

Du simple au **5,6 fois** selon les mots, contre 1,3 fois selon le tirage. Un prompt court donne une
boucle à peine moins marquée que le témoin musical. Vingt étapes au lieu de huit n'y changent rien.

### Le niveau de sortie

Six clips engendrés sur des sujets variés : les bruitages sortent à **0,018** de valeur efficace
quand la musique sort à **0,209**, dix fois plus bas. D'où la normalisation par défaut du nœud, qui
porte la crête à −1 dBFS. Relevé de bout en bout sur le prompt par défaut : crête brute −7,9 dBFS,
gain 6,9 dB, crête obtenue −1,00 dBFS.

## 3. Le palliatif en place, et sa limite

Le prompt de départ du nœud porte désormais le cadre :

```
sound effect, foley recording of a heavy wooden door creaking open slowly, dry,
no music, no melody, no instruments
```

Repassé sur les cinq mêmes graines : 0,122 · 0,144 · 0,148 · 0,187 · **0,368**. La moyenne descend
de 0,253 à 0,194, **mais l'étendue s'élargit** et la cinquième graine fait pire que n'importe
laquelle sans cadre. Quatre exécutions sur cinq y gagnent, la cinquième repart vers la boucle.

**C'est un palliatif.** Il abaisse le cas courant, il ne corrige pas la cause.

## 4. Le vrai remède, et il est plus proche qu'annoncé

**Stability publie officiellement les graphes ONNX des trois variantes**, dans
[`stabilityai/stable-audio-3-optimized`](https://huggingface.co/stabilityai/stable-audio-3-optimized)
(13 668 téléchargements, licence Stability AI Community, la même que le paquet en place). Il n'y a
donc **aucun export à faire** : ce que j'avais annoncé comme un chantier de plusieurs heures se
réduit à une adaptation du pipeline.

### Les fichiers qui composeraient un paquet « bruitage »

| fichier | taille |
| --- | ---: |
| `onnx/sa3-sm-sfx/dit_fp16.onnx` | 878 Mo |
| `onnx/same-s/dec_bf16.onnx` | 208 Mo |
| `onnx/same-s/enc_bf16.onnx` (pour la continuation) | 205 Mo |
| `onnx/t5gemma/encoder.onnx` | 592 Mo |
| `tokenizer.model` | 4 Mo |

Soit environ **1,9 Go**, contre 719 Mo pour le paquet int4 actuel. Des variantes fp8 existent, trois
fois plus légères, mais `onnxruntime-node` ne sait pas les exécuter sur processeur : c'est le fp16 et
le bf16 qu'il faut prendre.

### Le mode d'emploi, relevé dans le runtime officiel

`optimized/tensorRT/scripts/sa3_trt_core.py` du dépôt `Stability-AI/stable-audio-3` donne la recette
sans ambiguïté :

```
T5_MAX_LEN = 256   COND_DIM = 768   SAMPLES_PER_LATENT = 4096

tokeniser(prompt, max_length=256, padding="max_length", truncation=True)
  -> input_ids (1,256), attention_mask (1,256)
encodeur de texte -> hidden_states (1,256,768)

DiT : x, t, t5_hidden (1,256,768), t5_mask (1,256), seconds_total (1,),
      local_add_cond (1,257,L)  ->  velocity
```

Le masque passé au DiT est le `attention_mask` du tokeniseur, en flottants. Le tokeniseur lui-même
est livré au format `tokenizer.json` dans ce dépôt, ce qui convient à la bibliothèque déjà employée.

### Ce qui demande du travail : la signature des graphes diffère

Relevée dans le graphe officiel, en lisant les déclarations du fichier `dit_fp8.onnx`, qui ne pèse
que 2,5 Mo puisqu'il ne porte pas ses poids.

| pipeline actuel (export `lsb`) | graphe officiel Stability |
| --- | --- |
| `x`, `t` | `x`, `t` (identiques) |
| `local_add_cond` | `local_add_cond` (identique) |
| `cross_attn_cond` + `global_embed` | **`t5_hidden` + `seconds_total`** |
| `padding_mask` | **`t5_mask`** |
| sortie `out` | sortie **`velocity`** |

Le graphe officiel **assemble le conditionnement lui-même** : c'est pourquoi il n'a pas de
`number_conditioner` séparé, la durée entrant directement par `seconds_total`. L'adaptation de
`electron/stable-audio-3.cjs` consiste donc surtout à **retirer** du code : plus de
`buildCrossAttentionAndGlobalConditioning`, plus de graphe de conditionnement de durée. L'échantillonneur
ping-pong ne bouge pas, `velocity` étant le même `v`.

Le tokeniseur ne pose pas de problème : le dépôt `Stability-AI/stable-audio-3` livre un
`tokenizer.json` dans `optimized/tensorRT/scripts/`, au format que la bibliothèque déjà employée
attend.

### Ce qui a été fait, le 25 septembre 2026

- `scripts/download-sa3-sfx.cjs` prend les quatre fichiers et les range dans
  `public/oonx/stable-audio-3-small-sfx/`, sous des noms neutres.
- `electron/stable-audio-3.cjs` **reconnaît le paquet à ses noms d'entrée** et non au nom du
  dossier : `sessions.dit.inputNames.includes("t5_hidden")` suffit à trancher. Les deux chemins de
  conditionnement cohabitent, la sortie du DiT et les ports du décodeur sont pris par leur rang
  plutôt que par leur nom, et `number_conditioner` n'est chargé que s'il existe.
- `electron/main.cjs` accepte un `paquet` nommé, « music » ou « sfx », plutôt qu'un chemin.
  **Aucun repli de l'un sur l'autre** : un paquet absent le dit, faute de quoi le bruitage
  repasserait par le modèle musical, c'est-à-dire par le défaut qu'on répare.
- Le nœud « Bruitage IA » demande `paquet: "sfx"`.

Reste ouvert : l'encodeur de texte officiel expose `full_mask` et `sliding_mask` en plus du masque
d'attention, T5Gemma alternant couches globales et couches à fenêtre glissante. Le code ne fournit
ces masques que si le graphe les déclare, et la largeur de fenêtre retenue, 512, est à confirmer sur
le graphe lui-même.

### Deux défauts trouvés au branchement

Les graphes officiels ne rendent pas ce que rendait l'export communautaire, et rien ne le disait.

- **La sortie du décodeur est en entiers**, et son nom le dit : `pcm`. Relevé sur un rendu de deux
  secondes : min −2949, max 2253, valeur efficace 170. Bornées à ±1 telles quelles, ces valeurs
  donnaient un signal dont la valeur efficace égalait presque la crête, **0,887 contre 0,891**,
  c'est-à-dire un carré. Division par 32768.
- **Les canaux sont entrelacés**, `[1, 360448, 2]`, là où l'autre décodeur rend `[1, 2, N]`. La
  corrélation gauche-droite est passée de 0,86 à **0,994** une fois corrigé.

### Ce que le paquet de bruitage donne

Même prompt, mêmes cinq graines, six secondes, huit étapes.

| | paquet musical | paquet bruitage |
| --- | --- | --- |
| pulsation | 0,122 · 0,144 · 0,148 · 0,187 · **0,368** | 0,172 · 0,190 · 0,182 · 0,217 · 0,280 |
| moyenne | 0,194 | 0,208 |
| écart-type | 0,090 | **0,038** |
| crête brute | −7,9 dBFS | −17,8 à −21,8 dBFS |
| temps pour 6 s | 9 à 14 s | **47 à 59 s** |

**La dispersion est divisée par plus de deux et le cas catastrophique disparaît ; la moyenne ne
bouge pas.** Il faut le dire ainsi : la mesure détecte la périodicité des attaques, et une porte qui
grince est périodique. Elle savait repérer une dérive vers la boucle sur un modèle qui en fait ; sur
un modèle qui n'en fait pas, ce qu'elle mesure est peut-être la structure propre du son.

**L'écoute a tranché, et elle est favorable.** Deux paires comparées par Fabien le 26 septembre
2026, même graine et même prompt, le paquet musical contre le paquet de bruitage : une porte qui
grince, cas ordinaire, et un impact de verre brisé, cas décisif puisqu'un modèle musical rend une
cloche là où il faudrait un éclat. Le paquet de bruitage est retenu. **C'est le seul juge que cette
question ait trouvé** : aucune de mes mesures ne concluait.

Le prix est réel : **quatre fois plus lent**, le paquet officiel étant en fp16 quand l'autre est en
int4. La piste, si cela gêne à l'usage, serait une quantisation int4 du paquet officiel, ce qui
ramènerait à un export.

### La livraison

- Archive de **1428 Mo** publiée sur la release `assets` du dépôt, sous
  `stable-audio-3-small-sfx.zip`. Le paquet ne vient donc pas d'un tiers.
- Entrée `stable-audio-3-sfx` au manifeste des modèles, avec l'empreinte de l'archive et celle de
  chacun des sept fichiers.
- **Le paquet se prend tout seul à la première utilisation du nœud.** Cela renverse la règle écrite
  en tête de `telechargement-modeles.cjs`, qui voulait qu'on ne prenne rien sans que l'utilisateur
  le décide ; elle vaut toujours pour le bouton de la barre d'outils, qui prend tout. Décision de
  Fabien.
- `resoudreRessource` remplace la liste de dossiers candidats qui était écrite dans le gestionnaire :
  elle seule connaît le dossier inscriptible où les modèles téléchargés se posent, si bien qu'un
  paquet pris par la barre d'outils n'y aurait **jamais** été trouvé.

## 5. Ce qui est déjà en magasin

À vérifier avant de chercher ailleurs, faute de quoi on recense un modèle qu'on possède.

| nœud | modèle | comment il tourne |
| --- | --- | --- |
| `musicgen` | `Xenova/musicgen-small`, CC-BY-NC | ONNX par Transformers.js, dans un Web Worker, téléchargé au premier usage |
| `stable-audio-3` | `stable-audio-3-small-music`, Stability Community | ONNX int4 par `onnxruntime-node`, dans le processus principal |
| `bruitage-ia` | le même paquet que ci-dessus | idem, avec d'autres défauts et une sortie mise à niveau |
| `tts-kokoro`, `tts-piper`, `tts-mms`, `tts-speecht5`, `tts-francais` | synthèse vocale | ONNX, workers dédiés |

**AudioGen n'est pas de ceux-là**, contrairement à ce qu'on pourrait croire : c'est `musicgen` qui
est au catalogue, son frère de la même famille AudioCraft. Deux conséquences, et elles vont en sens
contraire. D'un côté **la licence non commerciale n'est plus un obstacle de principe**, puisque
MusicGen est sous la même et figure déjà au catalogue. De l'autre, AudioGen est **plus difficile**
que son frère malgré l'architecture commune : `facebook/audiogen-medium` est étiqueté `audiocraft` et
non `transformers`, si bien que la recette d'export qui a donné `Xenova/musicgen-small` ne s'y
applique pas, et aucun ONNX n'en existe sur le dépôt public.

## 6. Les autres modèles, puisque la liste pouvait être incomplète

Un banc public récent, TTA-Bench, évalue treize modèles ouverts de texte vers son : AudioLDM 2,
Make-An-Audio 2, MMAudio, Tango 2, TangoFlux, EzAudio, MAGNeT, AudioGen, Stable Audio Open,
Foley-Omni, Omni2Sound, AudioStory et Dasheng AudioGen. Relevé sur les dépôts, le 25 septembre 2026.

| modèle | licence | poids | formats publiés | verdict pour Attic |
| --- | --- | ---: | --- | --- |
| **`stable-audio-3-small-sfx`** | Stability Community | 3,2 Go | safetensors + **ONNX officiel** | **le seul directement exploitable** |
| `stable-audio-open-small` | Stability Community | 4,7 Go | safetensors | pas d'ONNX ; supplanté par le précédent |
| `stable-audio-open-1.0` | Stability Community | 14,6 Go | diffusers | trop gros, et sans ONNX |
| MOSS-SoundEffect v2.0 | **Apache 2.0** | 9,1 Go | diffusers, MLX, GGUF, NF4 | aucun ONNX sur quinze dépôts ; 1,3 Md + encodeur Qwen3 de 1,7 Md |
| EzAudio | **MIT** | 12,2 Go | diffusers | la licence la plus libre, mais le plus gros du lot |
| AudioGen medium (Meta) | CC-BY-NC | 3,7 Go | — | frère de `musicgen`, déjà au catalogue ; mais `audiocraft` et non `transformers`, donc sans recette d'export |
| MAGNeT medium (Meta) | CC-BY-NC | 3,6 Go | — | non commercial |
| MMAudio | CC-BY-NC | **0,4 Go** | — | le plus léger de tous, mais vidéo vers son, et non commercial |
| Tango 2 | CC-BY-NC-SA | 4,9 Go | — | non commercial |
| TangoFlux | non déclarée sur la fiche | 3,8 Go | — | licence à vérifier avant tout usage |
| AudioLDM 2 | CC-BY-NC-SA | 8,3 Go | diffusers | non commercial ; supplanté |
| Woosh (Sony AI) | code MIT, **poids CC-BY-NC** | — | PyTorch | gardé pour un composant à part, sa force étant la vidéo vers son |

**La conclusion tient en une ligne : un seul fournisseur publie de l'ONNX pour cette tâche, et c'est
celui qui est déjà en place.** Un balayage des modèles de texte vers son étiquetés ONNX sur le dépôt
public rend quarante résultats, dont trente-huit sont de la synthèse vocale ; les deux autres sont
Stable Audio 3 et MusicGen. La liste initiale n'était donc pas incomplète d'une piste qui changerait
la décision.

À noter pour plus tard : **MMAudio ne pèse que 0,4 Go**, ce qui est dix fois moins que tout le reste.
Sa licence non commerciale et sa vocation vidéo vers son l'écartent aujourd'hui, mais c'est le seul
du lot dont la taille rendrait un export confortable.

## 7. Ce qui a été décidé, et pourquoi

**Le pont ComfyUI est écarté.** Il aurait ouvert d'un coup tous les modèles PyTorch sans en porter
aucun, mais il reconstitue la chaîne `attic → comfy → hugging face` que le dépôt a justement coupée,
et il fait dépendre Attic d'un projet porté par une société. Décision de Fabien. Précision
utile : le risque juridique ne vient pas du pont, qui n'est qu'un appel d'interface ; il vient des
**poids**, dont la licence suit le modèle où qu'il tourne.

**Woosh est remis à plus tard**, pour un composant à part : sa sortie vidéo vers son ne tient pas
dans « un prompt, un son », et elle tombe sur les nœuds vidéo récemment ajoutés.

**MOSS SoundEffect est retiré du réglage « Modèle »**, le 25 septembre 2026. Il y avait figuré en
disant qu'il n'était pas câblé ; un menu qui propose ce qui ne marchera pas avant longtemps se lit
comme un défaut. Il y reviendra le jour où il fonctionne.

## 8. L'état de la machine, pour un export éventuel

| | relevé |
| --- | --- |
| Python | 3.14.6, et un 3.13 installé à côté |
| torch, onnx, onnxruntime, transformers, diffusers, optimum | **tous absents** |
| carte | NVIDIA RTX 2060, **6144 Mio** au total d'après le pilote, 5828 libres |
| mémoire vive | 63,8 Go |
| disque | 372 Go libres sur C:, 114 sur E: |

Le champ `AdapterRAM` de Windows annonce 4 Go sur cette carte : c'est un entier 32 bits qui plafonne,
et il se trompe sur toute carte au-dessus. C'est la lecture du pilote qui fait foi.

Trois milliards de paramètres en bf16 pèsent six gigaoctets rien qu'en poids : **aucun export de
cette taille ne tiendrait sur la carte**, il se ferait sur le processeur. Cela dit, le paquet ONNX
officiel de Stability rend la question sans objet pour la piste principale.

## 9. Sources

- [`stabilityai/stable-audio-3-small-sfx`](https://huggingface.co/stabilityai/stable-audio-3-small-sfx)
- [`stabilityai/stable-audio-3-optimized`](https://huggingface.co/stabilityai/stable-audio-3-optimized), les graphes ONNX officiels
- [`stabilityai/stable-audio-3-small-music`](https://huggingface.co/stabilityai/stable-audio-3-small-music), le paquet en place
- [`OpenMOSS/MOSS-TTS`](https://github.com/OpenMOSS/MOSS-TTS) et [`MOSS-SoundEffect-v2.0`](https://huggingface.co/OpenMOSS-Team/MOSS-SoundEffect-v2.0)
- [`SonyResearch/Woosh`](https://github.com/SonyResearch/Woosh)
- [TTA-Bench](https://arxiv.org/pdf/2509.02398), le banc qui recense les treize modèles
