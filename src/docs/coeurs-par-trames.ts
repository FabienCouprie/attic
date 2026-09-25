// src/docs/coeurs-par-trames.ts — Quels composants calculent par trames, et lesquels par échantillon.
//
// POURQUOI CE FICHIER EXISTE, et c'est une faute de ma part qu'il répare.
//
// Le recensement des effets à rendre modulables lit les NOMS des réglages. Il a donc proposé quatre
// composants dont le cœur travaille par trames — la déréverbération, le décalage de formants, le
// filtrage par un spectre, la décomposition STN —, alors qu'une règle déjà posée les écartait : dans
// un traitement par blocs, une courbe n'est lue qu'une fois par bloc, et la modulation n'a pas la
// résolution qu'elle promet. Le recensement ne pouvait pas le voir, et moi je l'ai vu en ouvrant les
// quatre fichiers un par un. C'est exactement le travail qu'un inventaire engendré doit supprimer.
//
// CE QUE CE FICHIER DÉCIDE, ET CE QU'IL NE DÉCIDE PAS. Il dit si le cœur d'un composant passe par une
// transformée de Fourier, donc si son réglage se lit par bloc et non par échantillon. Il ne dit pas
// qu'un composant doit être écarté : cette décision reste celle de Fabien, et les exclusions restent
// nommées une par une. Il l'INFORME, et il l'informe avant qu'on ouvre les fichiers.
//
// POURQUOI L'ANALYSE EST STATIQUE ET NON À L'EXÉCUTION. La fabrique `effet()` engendre un SEUL
// `executer` partagé par une grande partie du catalogue : lire `String(fiche.executer)` y rendrait
// toujours le même texte, où le nom du cœur appelé n'apparaît pas, puisqu'il est capturé dans une
// fermeture. C'est la SOURCE des greffons qu'il faut lire, où l'appel est écrit en clair.
//
// CE QUE COÛTE UNE APPROXIMATION ICI. Un faux positif fait ouvrir un fichier pour rien. Un faux
// négatif laisse proposer un composant qui sera écarté à l'examen, c'est-à-dire l'état d'avant. Le
// test qui accompagne ce fichier vérifie donc les DEUX SENS sur des cas connus, et c'est lui qui rend
// la liste de marqueurs digne de foi plutôt que vraisemblable.

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { lignesDeCode } from "./dependances-audio";

/**
 * Ce qui fait un cœur PAR TRAMES.
 *
 * Une transformée de Fourier suppose une fenêtre : un réglage lu dans la boucle qui les enchaîne
 * prend une valeur par fenêtre. Les trois autres marqueurs nomment les outils du dépôt qui portent
 * cette découpe, un module pouvant appeler l'analyse sans écrire `fft` lui-même.
 */
export const MARQUEURS_TRAMES: (string | RegExp)[] = [
  // LA BOUCLE DE TRAMES ELLE-MÊME : une fenêtre qui avance d'un saut plus petit qu'elle. C'est le
  // marqueur le plus sûr, parce qu'il décrit la chose et non l'un de ses outils.
  /for\s*\(\s*(?:let|const|var)\s+\w+\s*=\s*0\s*;\s*\w+\s*\+\s*\w+\s*<=\s*[^;]+;\s*\w+\s*\+=\s*\w+\s*\)/,
  // Les fenêtres comptées, et la fenêtre de pondération qu'aucun traitement par trames n'omet.
  "nTrames",
  "fenetreHann",
  "spectrogramme",
  "TAILLE_FFT",
  // UNE FONCTION QUI REÇOIT UNE ANALYSE PAR TRAMES TRAVAILLE PAR TRAMES, sans avoir à transformer
  // elle-même. `filtrerParSpectre` en est le cas : il ne contient aucune FFT, il opère sur les trames
  // qu'une autre fonction a produites. Sans ces deux types, le détecteur l'aurait manqué.
  "AnalysePV",
  "TramePV",
  "analyserPV(",
];

/**
 * POURQUOI `fft(` N'EST PAS UN MARQUEUR, et c'était mon premier.
 *
 * Une transformée ne dit pas qu'un traitement est découpé en trames : `convoluer` transforme le signal
 * ENTIER, une fois, pour multiplier deux spectres. La réverbération velours et la réverbération hachée
 * s'en servent, et leur mélange s'applique bel et bien échantillon par échantillon. Les accuser aurait
 * fait écarter deux composants parfaitement modulables.
 */
const marqueurTrouve = (texte: string): string | null => {
  for (const m of MARQUEURS_TRAMES) {
    if (typeof m === "string") { if (texte.includes(m)) return m; }
    else if (m.test(texte)) return "boucle de trames";
  }
  return null;
};

/** Un nom de fonction, et le marqueur qui l'a classée. */
export type Verdict = { nom: string; marqueur: string };

/**
 * Le corps de chaque fonction de plus haut niveau d'un fichier, par son nom.
 *
 * Les fonctions non exportées y figurent aussi : c'est par elles que la propriété se propage, une
 * fonction exportée appelant souvent un cœur privé qui porte la boucle de trames.
 */
export function fonctionsDuFichier(source: string): Map<string, string> {
  const code = lignesDeCode(source).join("\n");
  const out = new Map<string, string>();
  const formes = [
    /(?:export\s+)?(?:async\s+)?function\s+([A-Za-z0-9_$]+)\s*[(<]/g,
    /(?:export\s+)?const\s+([A-Za-z0-9_$]+)\s*(?::[^=]*)?=\s*(?:async\s*)?[(<]/g,
  ];
  for (const forme of formes) {
    forme.lastIndex = 0;
    for (let m = forme.exec(code); m; m = forme.exec(code)) {
      const nom = m[1];
      const corps = corpsDepuis(code, m.index + m[0].length - 1);
      if (corps && !out.has(nom)) out.set(nom, corps);
    }
  }
  return out;
}

/**
 * Le texte d'une déclaration, depuis sa parenthèse ouvrante jusqu'à sa fin.
 *
 * Une flèche sans accolades s'arrête au point-virgule de profondeur nulle : `const aigu = (x) =>
 * passeHaut(passeHaut(x))` est une déclaration entière, et son appel est ce qui nous intéresse.
 */
function corpsDepuis(code: string, debutParenthese: number): string | null {
  let i = debutParenthese;
  let profondeur = 0;
  for (; i < code.length; i++) {
    const c = code[i];
    if (c === "(" || c === "[" || c === "{") profondeur++;
    else if (c === ")" || c === "]" || c === "}") {
      profondeur--;
      if (profondeur === 0) { i++; break; }
    }
  }
  // Après la liste des arguments : soit un corps entre accolades, soit une expression.
  const reste = code.slice(i);
  const accolade = reste.indexOf("{");
  const pointVirgule = reste.indexOf(";");
  if (accolade >= 0 && (pointVirgule < 0 || accolade < pointVirgule)) {
    let p = 0;
    for (let j = i + accolade; j < code.length; j++) {
      if (code[j] === "{") p++;
      else if (code[j] === "}") {
        p--;
        if (p === 0) return code.slice(debutParenthese, j + 1);
      }
    }
    return code.slice(debutParenthese);
  }
  if (pointVirgule >= 0) return code.slice(debutParenthese, i + pointVirgule + 1);
  return null;
}

/** Les mots que suit une parenthèse sans qu'ils nomment une fonction du dépôt. */
const MOTS_CLES = new Set([
  "function", "if", "for", "while", "switch", "catch", "return", "typeof", "new", "await", "import",
]);

/**
 * Tous les identifiants d'un texte, appelés ou non.
 *
 * UN CŒUR PASSÉ EN ARGUMENT N'EST PAS SUIVI D'UNE PARENTHÈSE. Le worker de la décomposition STN
 * s'écrit `servirParCanal(separerStn)` : chercher les appels n'y trouve que le socle, et le cœur, qui
 * est le sujet, passe inaperçu. Au niveau du composant, c'est donc la mention qui compte.
 */
export function identifiantsDe(texte: string): Set<string> {
  const out = new Set<string>();
  const re = /[A-Za-z_$][A-Za-z0-9_$]*/g;
  for (let m = re.exec(texte); m; m = re.exec(texte)) {
    const avant = m.index > 0 ? texte[m.index - 1] : " ";
    if (avant !== ".") out.add(m[0]);
  }
  return out;
}

/** Les identifiants appelés dans un texte, c'est-à-dire suivis d'une parenthèse. */
export function appelsDe(texte: string): Set<string> {
  const out = new Set<string>();
  const re = /([A-Za-z0-9_$]+)\s*\(/g;
  for (let m = re.exec(texte); m; m = re.exec(texte)) {
    // `x.slice(` est une méthode d'un objet, non une fonction du dépôt.
    const avant = m.index > 0 ? texte[m.index - 1] : " ";
    if (avant !== "." && !MOTS_CLES.has(m[1])) out.add(m[1]);
  }
  return out;
}

/**
 * Les fonctions de `src/audio/` dont le cœur travaille par trames, et ce qui l'a décidé.
 *
 * LA PROPRIÉTÉ SE PROPAGE AUX APPELANTS, jusqu'à ce que plus rien ne bouge : une enveloppe extraite
 * par blocs reste extraite par blocs quand une seconde fonction l'appelle. Sans cette propagation, la
 * fonction publique d'un module paraîtrait travailler par échantillon parce que sa boucle de trames
 * est dans une fonction privée juste au-dessus.
 */
export function fonctionsParTrames(racine: string): Map<string, string> {
  const dossier = join(racine, "src", "audio");
  const corps = new Map<string, string>();
  for (const f of readdirSync(dossier)) {
    if (!f.endsWith(".ts") || f.endsWith(".test.ts") || f.endsWith(".d.ts")) continue;
    for (const [nom, texte] of fonctionsDuFichier(readFileSync(join(dossier, f), "utf8"))) {
      if (!corps.has(nom)) corps.set(nom, texte);
    }
  }

  const verdict = new Map<string, string>();
  for (const [nom, texte] of corps) {
    const m = marqueurTrouve(texte);
    if (m) verdict.set(nom, m);
  }
  const appels = new Map<string, Set<string>>();
  for (const [nom, texte] of corps) appels.set(nom, appelsDe(texte));
  for (let bouge = true; bouge;) {
    bouge = false;
    for (const [nom, cibles] of appels) {
      if (verdict.has(nom)) continue;
      for (const c of cibles) {
        if (c !== nom && verdict.has(c)) { verdict.set(nom, `appelle ${c}`); bouge = true; break; }
      }
    }
  }
  return verdict;
}

/**
 * Pour chaque composant, les cœurs par trames que sa déclaration appelle.
 *
 * LE DÉCOUPAGE PAR COMPOSANT EST EXACT, et non deviné : une région ne commence qu'à un identifiant
 * que le registre connaît, sous l'une des deux formes que prennent les fiches, `id: "…"` pour celles
 * écrites à la main et `effet("…"` pour celles que la fabrique engendre. Un identifiant inventé ne
 * coupe donc rien, et deux fiches voisines ne se mélangent pas.
 *
 * LE WORKER EST SUIVI, et c'est ce qui manquait le plus. Un composant dont le calcul a été déplacé
 * hors du fil ne nomme plus son cœur : il nomme un fichier de worker. La décomposition STN échappait
 * ainsi au détecteur, alors qu'elle est le cas d'école du traitement par trames. La région est donc
 * lue, puis le worker qu'elle nomme l'est à son tour.
 */
/**
 * Le code débarrassé de ses chaînes de caractères.
 *
 * UNE NOTICE EST DE LA PROSE, PAS DU CODE. Celle du brassage contient les mots « recoller » et
 * « shimmer », qui sont aussi des noms de fonctions du dépôt : le composant a été accusé de
 * travailler par trames sur la foi de sa propre documentation. Deux faux positifs, et la même cause
 * que ceux que `lignesDeCode` écarte pour les commentaires.
 */
export function sansChaines(code: string): string {
  let out = "";
  let i = 0;
  while (i < code.length) {
    const c = code[i];
    if (c === '"' || c === "'" || c === "`") {
      i++;
      while (i < code.length && code[i] !== c) i += code[i] === "\\" ? 2 : 1;
      i++;
      out += '""';
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

/**
 * Les noms que ce fichier importe de `src/audio/`, statiquement ou par un import dynamique.
 *
 * DEUX FONCTIONS PEUVENT PORTER LE MÊME NOM. `parCanal` existe dans `audio/spectral-cdp.ts`, qui
 * travaille sur une analyse par trames, et dans `plugins/hors-fil.ts`, qui n'est que le dialogue avec
 * un worker. Un composant qui emploie le second était accusé à cause du premier. C'est l'import qui
 * dit lequel des deux est en jeu, et lui seul.
 */
export function nomsImportesDeAudio(code: string): Set<string> {
  const out = new Set<string>();
  const listes = [
    /import\s+(?:type\s+)?\{([^}]*)\}\s*from\s*["'][^"']*audio[^"']*["']/g,
    /(?:const|let|var)\s*\{([^}]*)\}\s*=\s*await\s+import\(\s*["'][^"']*audio[^"']*["']\s*\)/g,
  ];
  for (const re of listes) {
    re.lastIndex = 0;
    for (let m = re.exec(code); m; m = re.exec(code)) {
      for (const brut of m[1].split(",")) {
        const nom = brut.replace(/\btype\b/g, "").trim().split(/\s+as\s+/).pop()?.trim();
        if (nom) out.add(nom);
      }
    }
  }
  return out;
}

/** La source des workers qu'une région nomme, concaténée pour être lue avec elle. */
function sourcesDesWorkers(racine: string, region: string): string {
  let out = "";
  const re = /workers\/([A-Za-z0-9_.-]+)\.ts/g;
  for (let m = re.exec(region); m; m = re.exec(region)) {
    try {
      out += "\n" + readFileSync(join(racine, "src", "workers", `${m[1]}.ts`), "utf8");
    } catch {
      // Un worker nommé mais absent est une faute que d'autres tests attrapent ; ici on l'ignore.
    }
  }
  return out;
}

export function coeursParTrames(
  racine: string, ids: readonly string[],
): Map<string, Verdict[]> {
  const parTrames = fonctionsParTrames(racine);
  const connus = new Set(ids);
  const out = new Map<string, Verdict[]>();
  const dossier = join(racine, "src", "plugins");

  for (const f of readdirSync(dossier)) {
    if (!f.endsWith(".ts") || f.endsWith(".test.ts") || f.endsWith(".d.ts")) continue;
    const code = lignesDeCode(readFileSync(join(dossier, f), "utf8")).join("\n");
    // Les débuts de fiche, dans l'ordre où le fichier les écrit.
    const bornes: { id: string; index: number }[] = [];
    const re = /(?:id:\s*|effet\()\s*"([^"]+)"/g;
    for (let m = re.exec(code); m; m = re.exec(code)) {
      if (connus.has(m[1])) bornes.push({ id: m[1], index: m.index });
    }
    // Les noms qui viennent bien de `src/audio/`, pour ce fichier et pour les workers qu'il nomme.
    const duFichier = nomsImportesDeAudio(code);
    for (let k = 0; k < bornes.length; k++) {
      const debut = bornes[k].index;
      const fin = k + 1 < bornes.length ? bornes[k + 1].index : code.length;
      const region = code.slice(debut, fin);
      const workers = sourcesDesWorkers(racine, region);
      const permis = new Set([...duFichier, ...nomsImportesDeAudio(lignesDeCode(workers).join("\n"))]);
      const trouves: Verdict[] = [];
      for (const nom of identifiantsDe(sansChaines(region + workers))) {
        if (!permis.has(nom)) continue;
        const marqueur = parTrames.get(nom);
        if (marqueur) trouves.push({ nom, marqueur });
      }
      if (trouves.length > 0) {
        const deja = out.get(bornes[k].id) ?? [];
        for (const t of trouves) if (!deja.some((d) => d.nom === t.nom)) deja.push(t);
        out.set(bornes[k].id, deja.sort((a, b) => a.nom.localeCompare(b.nom)));
      }
    }
  }
  return out;
}
