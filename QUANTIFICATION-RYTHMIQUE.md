# Quantifier un rythme : état de l'art avant d'écrire une ligne

> Note du 26 septembre 2026, écrite à la demande de Fabien, qui a signalé GTTM et demandé si la
> littérature récente éviterait un redéveloppement pur et simple. Elle prépare l'étape 3 de
> [`COMPOSITION-ASSISTEE.md`](COMPOSITION-ASSISTEE.md), que cette note-là qualifiait de « fonction la
> plus demandée d'OpenMusic, et la plus difficile à écrire soi-même ».

## 1. Verdict

**Le travail exact que nous voulons faire a été fait trois fois, et sa dernière version rend
précisément la structure que nous avons construite : un arbre rythmique.** Aucune de ces
implémentations n'est réutilisable comme dépendance, toutes étant en copyleft. La méthode, elle,
est publiée et se réimplémente librement — c'est la règle que nous avions déjà adoptée pour
OpenMusic.

**La littérature récente, neuronale, résout un autre problème que le nôtre** et n'aide donc pas
directement. Elle transcrit une exécution humaine, tempo inconnu compris ; nous partons de durées
dont le tempo est connu.

**GTTM cadre le problème, il ne le résout pas**, et ses auteurs le disent eux-mêmes.

## 2. Ce que notre problème est exactement

Nous avons une suite de durées et un tempo. Nous voulons un arbre rythmique : une mesure divisée,
avec ses n-olets, ses silences et ses liaisons. C'est `omquantify` chez OpenMusic.

Ce n'est **pas** la transcription d'une exécution, qui suppose en plus de trouver la pulsation, le
tempo variable et la métrique. La distinction n'est pas de degré : elle change la famille
d'algorithmes qui s'applique, et elle explique pourquoi les chiffres les plus récents de la
littérature ne nous concernent qu'indirectement.

Le cas de l'exécution nous atteindra néanmoins par « MIDI → séquence », si l'on y branche un
enregistrement joué. Il faudra alors le dire plutôt que de rendre un résultat faux.

## 3. GTTM : le cadre, et son aveu

*A Generative Theory of Tonal Music*, Fred Lerdahl et Ray Jackendoff, 1983. Quatre composantes, qui
attribuent chacune une description structurelle séparée à ce qu'entend un auditeur : le groupement,
la **structure métrique**, la réduction par empans temporels, la réduction prolongationnelle.

Chaque composante a des **règles de bonne formation**, qui disent ce qu'une analyse peut être, et
des **règles de préférence**, qui départagent les analyses également bien formées.

**Les auteurs écrivent que leur théorie ne fournit pas de procédure calculable** pour déterminer une
analyse : les règles de préférence ne sont pas énoncées avec assez de rigueur — pas de poids
numériques — pour devenir un algorithme. C'est la phrase qui décide de tout ce qui suit.

Les tentatives de la rendre calculable, par Masatoshi Hamanaka, Keiji Hirata et Satoshi Tojo :

- **ATTA** (2005-2007), qui ajoute des paramètres numériques fournis par l'utilisateur ;
- **FATTA** (2009), qui automatise la recherche de ces paramètres ;
- **sGTTM** et **sGTTM-II**, qui y ajoutent l'apprentissage statistique ;
- **deepGTTM**, la version par réseaux profonds.

Le relevé publié est franc : les résultats **n'ont jamais atteint le niveau d'analyses faites par
des humains**. Une base de données d'analyses GTTM existe, faite pour l'entraînement et
l'évaluation.

**Ce que GTTM nous donne quand même, et ce n'est pas rien** : les règles de préférence métriques
disent *ce qui compte* — une note longue préfère tomber sur un temps fort, une attaque préfère
coïncider avec un niveau métrique élevé. Ce sont exactement les préférences qu'un modèle à poids
doit encoder. GTTM ne donne pas les nombres ; il donne la liste de ce qu'il faut peser.

## 4. Le chaînon : rendre les règles de préférence calculables

David Temperley et Daniel Sleator ont montré la voie : des systèmes de règles de préférence dotées
de **scores numériques**, et l'analyse optimale obtenue par **programmation dynamique**. Six
systèmes, dont la métrique, chacun avec ses règles de bonne formation.

C'est le passage de la théorie à l'algorithme, et c'est la même idée que celle qui suit : une
préférence devient un poids, et le meilleur compromis se cherche par un parcours optimal.

## 5. La lignée qui correspond à notre problème

### Kant (1994)

*Kant: a Critique of Pure Quantification*, Carlos Agon, Gérard Assayag, Joshua Fineberg et Camilo
Rueda, ICMC 1994. Le quantificateur d'OpenMusic, celui dont `omquantify` est la porte. La
bibliothèque OMKant, qui lui ajoutait segmentation et détection de tempo, **n'a pas survécu aux
changements d'environnement et n'est plus disponible**.

### RQ (2015-2016)

Bibliothèque OpenMusic d'Adrien Ycart, Florent Jacquemard et Jean Bresson, IRCAM. Sa méthode, telle
que son dépôt la décrit : **subdiviser récursivement les segments en parts égales, puis aligner les
points d'entrée sur la frontière la plus proche**, et classer les résultats selon deux mesures — la
**distance** à l'entrée et la **complexité** de l'écriture, qui tient compte de la structure de
l'arbre et des signes employés. Son apport propre est de ne pas rendre une seule réponse : une
interface montre plusieurs transcriptions concurrentes et laisse choisir. **GPL-3.0.**

### qparse (2019 et depuis)

Florent Jacquemard (Inria), avec Francesco Foscarin, Philippe Rigaux, Masahiko Sakai et Clément
Poncelet. Bibliothèque C++. C'est la forme aboutie, et c'est celle qui nous intéresse :

- l'entrée est une suite d'événements datés ;
- le modèle est un **automate d'arbres pondéré**, ou une grammaire hors-contexte pondérée, qui
  tient lieu de **langage a priori de la notation** : les règles décrivent les divisions
  hiérarchiques, les n-olets, les liaisons, les points, et leurs poids disent les rythmes préférés ;
- le coût minimisé est la **complexité dénotationnelle**, somme des poids des règles employées, sous
  la contrainte de fidélité à l'entrée ;
- la solution se calcule par **programmation dynamique**, un algorithme 1-best proche de la
  généralisation par Knuth de Dijkstra des graphes pondérés aux hypergraphes pondérés ; une variante
  **k-best** rend les solutions suivantes, classées.

Publications : Foscarin, Jacquemard, Rigaux, Sakai, *A Parse-Based Framework for Coupled Rhythm
Quantization and Score Structuring*, MCM 2019 ; Foscarin, Jacquemard, Rigaux, *Modeling and Learning
Rhythm Structure*, SMC 2019. **Licence CeCILL v2.1**, c'est-à-dire un copyleft de la même famille
que la GPL.

**Pourquoi c'est la bonne cible.** Le résultat de qparse est un arbre rythmique, exactement la
structure que nous avons posée : le langage de notation et notre `NoeudRythme` décrivent la même
chose. Le coût qu'il minimise est la tension que nous avons décrite sans la nommer — fidélité contre
lisibilité. Et la programmation dynamique y est du même ordre de difficulté que ce que le dépôt
écrit déjà.

## 6. La lignée neuronale, et pourquoi elle vise ailleurs

Depuis 2022, la transcription rythmique passe aux réseaux :

- **PM2S**, Liu et al., ISMIR 2022 : conversion d'un MIDI d'exécution en partition par suivi de
  pulsation neuronal ;
- **Nakamura et al.**, 2017 : modèle de Markov caché à sorties fusionnées pour le polyphonique à
  plusieurs voix, longtemps l'état de l'art ;
- **transformeurs de bout en bout**, 2024 ;
- **quantification fondée sur la pulsation**, 2025-2026 : un T5 réduit — deux couches, quatre têtes,
  plongement de 128 — qui reçoit les annotations de pulsation et travaille sur une grille de douze
  sous-pulsations, soit la triple-croche de triolet.

Les chiffres, sur le corpus ASAP de 1067 exécutions pianistiques : **F1 des attaques 97,3 %**,
**exactitude des valeurs de note 83,3 %**. Sur ACPAS, avec la métrique MUSTER : taux d'erreur
d'attaque **12,30 %**, contre 15,55 % pour PM2S et 68,28 % pour le suivi de pulsation neuronal ; le
taux d'erreur sur les fins reste à **28,30 %**.

**Ce que ces chiffres disent, et ce qu'ils ne disent pas.** Ils mesurent la transcription d'une
exécution humaine, et l'exactitude des valeurs de note y plafonne à 83 % : le problème est
réellement difficile. Mais ces modèles reçoivent en entrée une exécution avec ses irrégularités, et
dépensent l'essentiel de leur peine à retrouver la pulsation. **Nous n'avons pas ce problème** :
notre tempo est donné, et nos durées viennent souvent d'un calcul, non d'un doigt.

Limites annoncées par les auteurs eux-mêmes : correspondance une pour une entre les notes de
l'exécution et celles de la partition, métriques principalement en 2/4, 3/4 et 4/4, nécessité de
données alignées avec annotations de pulsation, et modèles par instrument meilleurs que les modèles
universels. Ni le code ni les poids ne sont annoncés comme publiés.

## 7. Ce qui est réutilisable, et ce qui ne l'est pas

| | licence | rend un arbre ? | réutilisable ici |
| --- | --- | --- | --- |
| qparse / qparselib | CeCILL v2.1 | oui | non, copyleft |
| RQ (OpenMusic) | GPL-3.0 | oui | non, copyleft |
| OMKant | — | oui | n'existe plus |
| music21 `quantize()` | BSD | **non** | oui, mais ne fait que caler sur une grille |
| modèles neuronaux 2022-2026 | non publiés | non | non |

`music21` mérite d'être regardé de près, parce qu'il est permissif et qu'il montre ce que vaut la
solution naïve : il cale les événements sur une grille qu'on lui donne, par exemple la double-croche
et le triolet de croches, en prenant le plus proche. C'est **exactement la solution paresseuse** —
aucune notion de complexité d'écriture, aucun arbre, aucun classement d'alternatives.

Le même constat que pour OpenMusic vaut donc ici : **traduire du code sous copyleft est exclu,
réimplémenter d'après les publications est libre**, à la condition de ne pas lire leur code en
écrivant le nôtre.

## 8. Ce que je recommande

**Réimplémenter la ligne Kant-RQ-qparse, et rien d'autre.** Concrètement :

1. **Énumérer les arbres candidats** par subdivision récursive, dans les limites d'un langage qu'on
   se donne : quelles divisions sont permises à quel étage, quelle profondeur maximale. Nous avons
   déjà le catalogue et le générateur, qui sont la moitié de ce travail.
2. **Chiffrer chaque candidat par deux nombres** : la distance aux durées d'entrée, et la complexité
   de l'écriture. La seconde se lit sur l'arbre lui-même — profondeur, n-olets, liaisons, points.
3. **Rendre les k meilleurs**, et non le meilleur seul. C'est l'apport propre de RQ, et c'est
   honnête : il n'existe pas une bonne réponse, il existe un compromis que le compositeur tranche.
4. **Peser d'après GTTM** plutôt qu'au jugé : une attaque sur un temps fort coûte moins qu'une
   attaque sur une subdivision faible, une note longue préfère un niveau métrique élevé.

**Ce que cela n'inclut pas** : le suivi de pulsation, la détection de tempo, la séparation de voix.
Si une exécution enregistrée arrive un jour, le pont de données existe déjà et ne coûte rien — les
autres outils exportent du MusicXML, que le dépôt lit.

**Ce qu'il faut mesurer pour savoir si c'est réussi.** Les métriques de la littérature — F1 des
attaques, exactitude des valeurs de note, MUSTER — supposent un corpus aligné que nous n'avons pas.
Le contrôle à notre portée est l'**aller-retour** : dérouler un arbre en durées, les requantifier, et
retrouver l'arbre. Le catalogue de 340 en donne autant de cas, et un test en boucle dirait
immédiatement sur lesquels le compromis se trompe.

## 9. Ce qui n'a pas été vérifié

Le contenu exact des deux articles de 2019, lus par leurs résumés et par la description scientifique
de qparse, non dans leur texte intégral. La licence d'OMKant, la bibliothèque n'étant plus
distribuée. Et l'existence éventuelle d'une implémentation permissive plus récente que `music21` :
la recherche n'en a pas montré, ce qui n'est pas une preuve d'absence.

## 10. Sources

- Fred Lerdahl et Ray Jackendoff, *A Generative Theory of Tonal Music*, MIT Press, 1983
- [Liste de publications de Masatoshi Hamanaka sur GTTM](https://gttm.jp/hamanaka/en/paper-list/)
- [Implementing Methods for Analysing Music Based on GTTM](https://link.springer.com/chapter/10.1007/978-3-319-25931-4_9)
- [deepGTTM-IV](https://link.springer.com/chapter/10.1007/978-3-032-02042-0_20)
- [Description scientifique de qparse](https://qparse.gitlabpages.inria.fr/docs/scientific/) et [à propos](https://qparse.gitlabpages.inria.fr/docs/about/)
- [A Parse-Based Framework for Coupled Rhythm Quantization and Score Structuring, MCM 2019](https://link.springer.com/chapter/10.1007/978-3-030-21392-3_20)
- [Modeling and Learning Rhythm Structure, SMC 2019](https://zenodo.org/records/3249476)
- [RQ, bibliothèque de transcription rythmique pour OpenMusic](https://github.com/openmusic-project/RQ)
- [Documentation OpenMusic, Quantification](https://support.ircam.fr/docs/om/om6-manual/co/Quantification.html)
- [Rythme, équipe Représentations musicales de l'IRCAM](http://repmus.ircam.fr/cao/rhythm/home)
- [Quantification rythmique dans OpenMusic, rapport d'Adrien Ycart](http://www.atiam.ircam.fr/Archives/Stages1415/YCART_Adrien_Rapport.pdf)
- [Beat-Based Rhythm Quantization of MIDI Performances, 2025](https://arxiv.org/html/2508.19262)
- [Transformer-Based Rhythm Quantization of Performance MIDI Using Beat Annotations](https://arxiv.org/html/2604.22290v1)
- [Performance MIDI-to-Score Conversion by Neural Beat Tracking, ISMIR 2022](https://www.turing.ac.uk/sites/default/files/2022-09/midi_quantisation_paper_ismir_2022_0.pdf)
- [Rhythm Transcription of Polyphonic Piano Music Based on Merged-Output HMM, Nakamura et al.](https://arxiv.org/pdf/1701.08343)
- [partitura, paquet Python pour les données musicales symboliques](https://arxiv.org/pdf/2201.13144)
- [music21, traduction MIDI et quantification](https://music21.org/music21docs/moduleReference/moduleMidiTranslate.html)
