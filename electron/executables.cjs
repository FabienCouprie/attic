// electron/executables.cjs — Interroger un exécutable externe (Python, Julia)
// pour sa version, sans shell et sans jamais lever.
//
// POURQUOI CE MODULE
//
// Les gestionnaires `python:info` et `julia:info` faisaient ceci :
//
//     execSync(`${CHEMIN_PYTHON} --version`, …).toString().trim()
//
// Deux défauts, dans une seule ligne.
//
// 1. LE CHEMIN N'ÉTAIT PAS CITÉ, et `execSync` passe par un shell. Un Python
//    installé dans « C:\Program Files\Python313\python.exe » faisait lire
//    « C:\Program » au shell. Les gestionnaires `*:definir-chemin`, eux,
//    citaient — d'où le comportement déroutant : on choisit ce Python dans le
//    dialogue, il est accepté et enregistré, puis `python:info` échoue dessus.
//
// 2. AUCUN try/catch. L'appel vit dans le littéral d'objet retourné : quand il
//    lève — binaire déplacé, désinstallé, chemin cassé — la promesse IPC est
//    rejetée au lieu de rendre « indisponible ».
//
// LE PIÈGE DU CORRECTIF NAÏF : citer partout casserait un cas légitime. La
// détection de Python peut stocker « py -3 » (main.cjs, branche `c.includes(" ")`)
// — une commande AVEC argument, pas un chemin. Citer donnerait
// « "py -3" --version », où le shell cherche un fichier nommé « py -3 ».
//
// D'où le choix de ne plus passer par un shell du tout : `execFile` reçoit un
// fichier et un tableau d'arguments, la question de la citation disparaît, et
// avec elle toute possibilité d'injection. Reste à distinguer un chemin
// contenant une espace d'une commande suivie d'arguments — c'est la seule règle
// de ce module, et elle est testée.
const fs = require("fs");

/**
 * Décompose la valeur stockée en `{ fichier, args }` pour `execFile`.
 *
 * La règle : si la valeur désigne un fichier existant, c'est un chemin, espaces
 * comprises. Sinon, c'est une commande suivie d'arguments, qu'on découpe. On
 * interroge donc le disque plutôt que de deviner d'après la forme — « py -3 »
 * et « C:\Program Files\…\python.exe » contiennent tous deux une espace, et
 * rien dans leur écriture ne les sépare.
 *
 * @param existe injecté pour que les tests n'aient pas besoin d'un vrai fichier
 */
function commandeVersion(valeur, existe = fs.existsSync) {
  if (typeof valeur !== "string") return null;
  const v = valeur.trim();
  if (v === "") return null;
  if (existe(v)) return { fichier: v, args: ["--version"] };
  const morceaux = v.split(/\s+/);
  return { fichier: morceaux[0], args: [...morceaux.slice(1), "--version"] };
}

/**
 * État d'un exécutable : disponible ou non, son chemin, sa version.
 *
 * Ne lève JAMAIS — c'est tout l'objet. Un binaire disparu rend
 * `{ disponible: false }` avec la cause, là où la version précédente rejetait
 * la promesse IPC et laissait le renderer avec une erreur non traitée.
 *
 * @param executer (fichier, args) => sortie — injecté, pour que les tests ne
 *        lancent aucun processus
 */
function infoExecutable(valeur, executer, existe = fs.existsSync) {
  const commande = commandeVersion(valeur, existe);
  if (!commande) return { disponible: false, chemin: null, version: null };
  try {
    const version = String(executer(commande.fichier, commande.args)).trim();
    return { disponible: true, chemin: valeur, version };
  } catch (err) {
    // Le chemin est conservé : savoir QUEL exécutable a échoué vaut mieux que
    // « indisponible » tout court, quand il s'agit d'aider à le reconfigurer.
    return { disponible: false, chemin: valeur, version: null, erreur: String(err?.message || err) };
  }
}

module.exports = { commandeVersion, infoExecutable };
