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

Aucune clé à ce jour : le socle est posé (pièce C0), et chaque pièce suivante ajoute la sienne ici.

| Clé | Type | Défaut sous Windows | Défaut sous Linux | Variable | Lue par |
|---|---|---|---|---|---|

## Ce qui n'y sera jamais

- Le niveau d'écoute et le bridage des formules (`AGENTS.md` §4) : amplifier reste un acte explicite.
- Ce dont dépend le son d'un graphe enregistré.
- La désactivation du bac à sable de Chromium (`BUILD-LINUX.md` §10.4).
