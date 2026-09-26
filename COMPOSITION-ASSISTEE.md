# Ce qu'il faudrait pour héberger la composition assistée par ordinateur

> Note d'évaluation du 26 septembre 2026, écrite à la demande de Fabien. Elle répond à une question
> précise : peut-on adapter, ou envelopper, les fonctionnalités d'[OpenMusic](https://openmusic-project.github.io/)
> dans Attic ? Les recoupements avec le catalogue actuel ont été relevés dans le code ; ce qui vient
> d'OpenMusic vient de son manuel et de ses dépôts.

## 1. Verdict

**Envelopper OpenMusic : non. Porter son code : impossible. Reprendre ses idées : oui, et c'est déjà
commencé sans qu'on l'ait su.**

Le coût n'est pas dans les fonctions. Il est dans **ce qu'elles se passent** : Attic n'a pas de
représentation musicale symbolique qui circule entre les nœuds, et c'est elle qui décide de tout le
reste.

## 2. Le modèle est le même, et plus qu'on ne croit

OpenMusic appelle « patch » ce qu'Attic appelle graphe. La correspondance n'est pas de surface : ce
sont les mêmes primitives, trouvées deux fois.

| OpenMusic | Attic |
| --- | --- |
| patch, boîtes connectées | le canevas |
| abstraction, sous-patch | méta-composants (`core/meta.ts`, `aplatirGraphe`) et bulles |
| OMLoop | `core/boucle-graphe.ts`, dépliage en chaîne, trois façons de rassembler les tours |
| BPF, courbe de points de rupture | le type de flux `controle`, une `Courbe` échantillonnée |
| mode réactif, chapitre 14 du manuel | le moteur d'Attic l'est par nature |
| bibliothèque Tonnetz | le nœud `tonnetz` |
| Alea, Chaos, Clouds | la famille Xenakis, les fractales, les réservoirs |
| OM2Csound, OMChroma | les neuf nœuds du enrobage Csound |
| OMCS, Situation, OMRC (contraintes) | « Contrepoint d'espèce », « Contraintes ABC » |
| Esquisse (harmonie spectrale) | la famille Spectre |

Une différence de forme, pas de fond, sur les boucles : OpenMusic répète un processus, Attic déplie
la chaîne en autant de copies, plafonnées à trente-deux tours. La sémantique visée est la même.

## 3. Ce qui bloque, et c'est une seule chose

Le flux d'Attic porte ceci, dans `audio/note.ts` :

```ts
export interface Note {
  note: number;      // demi-tons entiers
  velocite: number;
  debut: number;     // temps absolu, en secondes
  fin: number;
  canal?: number;
}
```

OpenMusic porte autre chose.

**Des midicents.** Do central vaut 6000, et le quart de ton s'écrit 6050. Attic connaît les cents
dans `temperaments`, `gammes-monde` et « Gammes du monde », mais **pas dans le flux qui circule
entre les nœuds** : dès qu'une note passe d'un nœud au suivant, le microton est perdu.

> **Corrigé depuis, et la cause n'était pas celle-ci.** La sonde `audio/microtons.test.ts` a mesuré
> la chaîne chemin par chemin. Le champ de hauteur est **déjà un nombre à virgule**, et
> `440 × 2^((n − 69) / 12)` accepte 69,5 : les midicents n'apportaient rien. Ce qui perdait le
> microton était le **câble**, un port `midi` portant un fichier `.mid` dont le numéro de note est
> un octet — 69,9 en ressortait à 69. Le flux `sequence` transporte désormais les notes elles-mêmes,
> et cinq fonctions de notation qui arrondissaient en silence ont été réparées.

**Des arbres rythmiques.** Une durée notée, hiérarchique, avec ses divisions et ses n-olets. Attic
n'a de rythme noté qu'au bord, à la conversion vers ABC, MusicXML ou VexFlow.

**Des objets composés.** `chord-seq`, `voice`, `poly`, `multi-seq`, avec deux régimes de temps : le
pulsé, par arbres rythmiques, et le linéaire, en millisecondes.

**La conséquence est mécanique.** Une fonction d'OpenMusic enveloppée dans Attic aurait à analyser
puis à réécrire un fichier MIDI à chaque passage, et perdrait en route ce que la fonction sait dire.
**Deux fonctions à la suite ne composeraient pas.** Or composer est tout l'intérêt d'un graphe.

Deux autres manques, moindres. La **maquette**, ce conteneur temporel dont chaque boîte porte un
début, une durée, et calcule sa valeur dans ce contexte : les nœuds de montage d'Attic en ont déjà
la moitié. Et les **fonctions d'ordre supérieur**, une fonction passée comme valeur, qu'Attic n'a
pas du tout.

## 4. Les licences tranchent la question du portage

**Attic est en MIT. OpenMusic est en GPL-3.0.**

- **Traduire son Lisp en TypeScript est exclu.** Ce serait une œuvre dérivée, et Attic devrait
  passer en GPL-3.0. Ce n'est pas une nuance à négocier, c'est une impasse.
- **L'appeler comme processus séparé reste licite** : la frontière admise est celle du processus.
  Mais c'est l'objection déjà faite au pont ComfyUI, en plus lourd, puisqu'il faudrait embarquer une
  application Lisp à interface graphique et que la chaîne deviendrait `attic → OpenMusic → IRCAM`.
- **Réimplémenter d'après les publications est libre.** Les algorithmes de l'équipe Représentations
  musicales sont abondamment publiés, Assayag, Agon, Bresson : une idée ne s'approprie pas. Cela
  demande en revanche de ne pas lire leur code en écrivant le sien.

## 5. Le recensement, et la confrontation

Relevé le 26 septembre 2026. Le côté OpenMusic vient du manuel et du catalogue de ses bibliothèques,
**non de ses sources** : c'est la condition d'une réimplémentation propre. Le côté Attic vient de
`COMPONENTS.md`, donc du registre.

### Ce qu'Attic couvre déjà

| chez OpenMusic | chez Attic |
| --- | --- |
| l'environnement : patch, abstraction, OMLoop, mode réactif | le canevas, les méta-composants, `boucle-graphe`, un moteur réactif par nature |
| Alea, Chaos, Clouds : aléatoire et systèmes dynamiques | les sept nœuds de la famille Logistique, les sept Fractales, les cinq Réservoirs |
| OM-ModTile : canons rythmiques modulo 2 | `canon-pavage` |
| Tonnetz | `tonnetz`, plus six autres surfaces refermées |
| Pixels, COMUS : image vers son | `couleur-rgb`, `color-looper`, `spectre-visible`, `dessin-sonore`, `mappeur-mandelbrot` |
| OM2Csound, OM-Faust, OMCollider, OM-pd : piloter un moteur externe | les neuf nœuds Csound, les processeurs Python et Julia, le pont Ollama |
| OM-SuperVP, OM-pm2 : analyse et resynthèse spectrales | `sms-sinusoides-bruit`, `stn-sinus-transitoires-bruit`, `phase-pghi`, `griffin-lim`, les dix-neuf nœuds Spectre |
| OMLily, export de partitions | `musicxml`, `midi-vers-abc`, la gravure ABC, MEI et Humdrum |
| TextFile, Picture | les quinze nœuds Texte, la famille Image |
| Patterns, LZ : modèles de style | `markov-midi`, `generateur-musical`, `boite-groove` |
| Combine, OM-AIS : combinatoire et séries | `serie-dodecaphonique`, `classes-hauteurs`, `miroir-inversion`, `motif-retrograde` |
| Harmonic-Analysis | `tonal-accord`, `tonal-progression`, `detecteur-accords` |
| Streamsep, mais côté signal | `separateur-ia`, `separation-harmonique-percussive` |

**Le recoupement est plus large qu'on ne l'attendrait**, et il n'est le fruit d'aucune imitation :
les deux catalogues sont arrivés aux mêmes objets par le même chemin, celui de la littérature.

### Ce qui manque, et pourquoi c'est une seule cause

| ce qui manque | ce qui l'empêche |
| --- | --- |
| les objets de partition : `chord-seq`, `voice`, `poly`, `multi-seq` | la représentation |
| ~~les arbres rythmiques~~, et Rewrite qui les réécrit | **structure faite** ; leur réécriture reste à venir |
| la quantification, la bibliothèque RQ | la représentation |
| ~~Esquisse, OMTristan : l'harmonie spectrale **symbolique**~~ | **fait** : nœud « Harmonie spectrale », série, distorsion, anneau, modulation de fréquence |
| ~~OM-JI : l'intonation juste~~ | **faite**, et elle existait à moitié : le nœud « Tempérament » la calculait déjà, mais rendait du son. Il rend maintenant aussi une séquence, donc elle s'enchaîne et se grave |
| ~~Profile : le contrôle des profils mélodiques~~ | **fait** : nœud « Profil mélodique », piloté par le flux `courbe` qui existait déjà |
| Streamsep : la séparation de voix **symbolique** | la représentation |
| la maquette, et la Sheet | un conteneur temporel, à écrire |
| Situation, OMCS, OMRC, Cluster Engine, OMGecode : les solveurs de contraintes | un solveur, à écrire. Attic ne sait que **vérifier**, avec `contrepoint-especes` et « Contraintes ABC » |
| ~~Morphologie : l'analyse contrastive de suites~~ | **faite** : nœud « Morphologie », profil primaire et distance d'édition |
| OM-Darwin, GA : les algorithmes génétiques | un algorithme, à écrire |
| class-array : la matrice de paramètres d'OMChroma | une structure, à écrire |
| Orchidee : l'orchestration assistée | un serveur et une base de timbres, hors de portée |
| SDIF : le format d'échange d'analyses de l'IRCAM | un format, à écrire, d'intérêt limité hors de l'IRCAM |
| les fonctions d'ordre supérieur | le moteur, qui ne fait pas circuler de fonction |

**Sur une soixantaine de bibliothèques, ce qui manque ne fait pas soixante chantiers.** Il fait une
représentation, huit familles d'algorithmes, et un conteneur temporel. Le reste est déjà là, ou ne
regarde pas Attic.

### Ce qui serait bon marché une fois la représentation posée

Petit, publié, sans dépendance : ~~les calculs d'intervalles et de fréquences d'Esquisse~~ et
d'OMTristan, ~~les profils mélodiques~~, ~~l'intonation juste~~, ~~les séries à tous les intervalles~~,
~~l'analyse contrastive de Morphologie~~, ~~les filtres de listes~~.

**Les six sont faits**, et trois d'entre eux ont coûté moins que prévu parce que le calcul
existait déjà quelque part : `noteTemperee` retempérait sans que rien ne sorte, le flux `courbe`
attendait un consommateur de hauteurs. Les deux derniers ont demandé un peu plus : une recherche par élagage
pour les séries, une distance d'édition pour la ressemblance. Les deux se contrôlent par des
nombres publiés, 3856 séries et la distance de trois entre « kitten » et « sitting ».

### Ce qui resterait difficile

La **quantification** d'une suite de durées en rythme noté, qui est la fonction la plus demandée
d'OpenMusic et la plus délicate à écrire. Un **solveur de contraintes** musical, qui est un sujet en
soi. La **maquette**, dont la sémantique, une boîte qui calcule sa valeur dans un contexte temporel,
n'a pas d'équivalent dans un graphe acyclique.

## 6. Le chemin, par incréments

Le seul investissement qui rende le reste possible est **un type de flux qui porte des notes**, et
non un fichier. Tant qu'il n'existe pas, chaque fonction reprise est un cul-de-sac ; une fois qu'il
existe, elles s'ajoutent une par une et se composent. Il s'appelle `sequence` et non « partition » :
ce dernier mot désigne déjà la partition Csound, la partition gravée et le verbe partitionner, et il
promettrait une notation là où ne circule qu'un convoi d'événements.

1. ~~**Le passage en midicents** du flux de notes, avec compatibilité descendante.~~ **Fait
   autrement, et la mesure a montré que cette étape était inutile.** Multiplier toute hauteur par
   cent aurait touché chaque nœud et chaque graphe enregistré, pour rien : le champ est déjà un
   flottant. Ce qui a été posé à la place est un **type de flux `sequence`**, qui porte des notes
   au lieu d'un fichier, avec son premier producteur, « Harmonie spectrale », et son rendu. Additif :
   aucun nœud existant n'a changé de port, et le nœud MusicXML a reçu une seconde entrée après la
   première. Reste que la microtonalité ne se propage que **sur ce flux** : un nœud qui ne parle que
   MIDI arrondit toujours, et c'est la limite du format et non du chaînage.
2. ~~**L'arbre rythmique** comme structure~~ **fait** : structure, notation en listes avec silences et
   liaisons, déroulement exact en secondes, et un nœud qui pose le rythme sur des hauteurs reçues.
   Chaque événement porte le rang et la nature de la division qui le porte, ce dont la gravure aura
   besoin. **Cette étape est close** : le n-olet est relevé ET écrit, le
   graveur ayant appris `time-modification` et le crochet de n-olet. L'unité de la partition se
   déduit du plus petit commun multiple des dénominateurs, de sorte qu'un tiers de noire s'écrive
   en durée entière ; un triolet s'entend juste ET se grave en croches sous un crochet 3:2.
3. **La quantification** : une liste de durées vers un rythme noté. C'est la fonction la plus
   demandée d'OpenMusic, et la plus difficile à écrire soi-même.
4. **Les objets composés**, `chord-seq` puis `voice`, une fois que 1 et 2 tiennent.
5. **La maquette**, si l'envie persiste.

**Un pont de données est disponible aujourd'hui, et ne coûte rien** : OpenMusic exporte MusicXML et
MIDI, Attic lit les deux. Qui veut faire tourner une passe dans OpenMusic peut déjà le faire et
rentrer le résultat. Ce n'est pas de l'intégration, mais cela existe sans qu'on écrive une ligne.

## 7. Ce qui n'a pas été vérifié

Si OpenMusic a un mode sans interface pilotable en ligne de commande, ce qui déciderait de la
faisabilité technique du pont écarté ici pour d'autres raisons. Et les quarante-six dépôts de
l'écosystème n'ont pas été ouverts un par un : le relevé des recoupements vient de leurs noms et de
ce que le manuel en dit.

## 8. Sources

- [Manuel d'OpenMusic](https://openmusic-project.github.io/openmusic/doc/om-manual/OM-User-Manual),
  dont les chapitres 5 (programmation visuelle avancée), 7 (objets de partition) et 8 (maquettes)
- [`openmusic-project/openmusic`](https://github.com/openmusic-project/openmusic), GPL-3.0, Common
  Lisp, actif
- Les quarante-six dépôts de [l'organisation](https://github.com/openmusic-project/), dont Esquisse,
  OMChroma, Morphologie, Profile, Situation, RQ, Tonnetz
