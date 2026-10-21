// electron/pont-canaux.test.ts — Les deux moitiés du pont se répondent.
//
// POURQUOI CE GARDE EXISTE. Un canal IPC est un NOM, écrit deux fois : une fois dans
// `preload.cjs`, qui l'invoque, une fois dans `main.cjs`, qui l'écoute. Rien ne relie les deux
// qu'une chaîne de caractères, et une faute de frappe d'un côté ne se découvre qu'à l'exécution du
// nœud qui l'emprunte — par « No handler registered for … », l'erreur que `pont-electron.ts` existe
// pour traduire. Le dépôt savait la rattraper ; il ne savait pas l'empêcher.
//
// LE SENS COMPTE, ET LES DEUX SONT TENUS SÉPARÉMENT. Un `invoke` attend un `handle` : c'est la
// fenêtre qui demande et le processus principal qui répond. Un `on` attend un `send` : c'est
// l'inverse, le principal qui pousse un avancement. Confondre les deux laisserait passer un canal
// d'avancement déclaré que personne n'alimente — un nœud muet pendant toute une exécution.
//
// LE GARDE CHERCHE UNE FORME, JAMAIS UN NOM DE CANAL : il lit les deux fichiers et apparie ce qu'il
// y trouve. Un canal ajouté demain est couvert sans qu'on y touche.
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "fs";

const dossier = new URL(".", import.meta.url);
const lire = (nom: string) => readFileSync(new URL(nom, dossier), "utf8");

const preload = lire("./preload.cjs");

// LE CÔTÉ PRINCIPAL N'EST PAS UN SEUL FICHIER, et le garde l'a appris en se trompant : écrit sur
// `main.cjs` seul, il dénonçait `fermeture:sauvegarder`, dont l'envoi vit dans
// `fermeture-sauvegarde.cjs`. Un module extrait de `main.cjs` reste le processus principal, donc
// tous les `.cjs` de ce dossier sont lus, moins le préchargement lui-même.
const main = readdirSync(dossier)
  .filter((f) => f.endsWith(".cjs") && f !== "preload.cjs")
  .map((f) => lire(`./${f}`))
  .join("\n");

/** Les noms de canaux que tel appel cite, dans tel source. */
function canaux(source: string, motif: RegExp): string[] {
  const trouves = new Set<string>();
  for (const m of source.matchAll(motif)) trouves.add(m[1]);
  return [...trouves].sort();
}

// `ipcRenderer.invoke("canal"` et `ipcMain.handle("canal"`. Les guillemets simples et doubles sont
// acceptés : le dépôt emploie les doubles, et un garde qui ne verrait que ceux-là se tairait sur
// une ligne écrite autrement.
const invoques = canaux(preload, /ipcRenderer\.invoke\(\s*["']([^"']+)["']/g);
const traites = canaux(main, /ipcMain\.handle\(\s*["']([^"']+)["']/g);
const ecoutes = canaux(preload, /ipcRenderer\.on\(\s*["']([^"']+)["']/g);
const pousses = canaux(main, /\.send\(\s*["']([^"']+)["']/g);

// UN NOM DE CANAL PEUT ÊTRE FABRIQUÉ, et le garde l'a appris en se trompant une seconde fois :
// `fermeture-sauvegarde.cjs` envoie `` `${canal}:sauvegarder` ``, où le préfixe est un argument.
// Aucun motif littéral ne peut le voir. Plutôt que d'exempter ce canal par son nom — ce qui
// désarmerait le garde sur lui pour toujours —, les SUFFIXES envoyés par interpolation sont relevés,
// et un canal écouté est accepté si le sien y figure. Une faute de frappe reste attrapée :
// « sauvegarde » n'est pas « sauvegarder ».
const suffixesFabriques = canaux(main, /\.send\(\s*`\$\{[^}]+\}:([^`]+)`/g);
const fabriqueDe = (canal: string) => suffixesFabriques.includes(canal.split(":").slice(1).join(":"));

// `sendSync` passe par `ipcMain.on` et non par `handle` : le cas est à part, et il est nommé ici
// plutôt que d'élargir le motif, pour qu'un second appel bloquant ne se glisse pas sans qu'on le voie.
const synchrones = canaux(preload, /ipcRenderer\.sendSync\(\s*["']([^"']+)["']/g);
const surEcoute = canaux(main, /ipcMain\.on\(\s*["']([^"']+)["']/g);

describe("les canaux du pont", () => {
  it("le préchargement en déclare, sans quoi ce garde ne regarderait rien", () => {
    expect(invoques.length).toBeGreaterThanOrEqual(40);
    expect(ecoutes.length).toBeGreaterThanOrEqual(4);
  });

  it("CHAQUE CANAL INVOQUÉ EST TRAITÉ par le processus principal", () => {
    const orphelins = invoques.filter((c) => !traites.includes(c));
    expect(orphelins, [
      "Ces canaux sont invoqués par « preload.cjs » et aucun « ipcMain.handle » ne les écoute dans",
      "« main.cjs ». Le nœud qui les emprunte échouera sur « No handler registered for … », et",
      "seulement à l'exécution. Vérifier l'orthographe des deux côtés.",
    ].join("\n")).toEqual([]);
  });

  it("CHAQUE CANAL ÉCOUTÉ EST ALIMENTÉ par le processus principal", () => {
    const muets = ecoutes.filter((c) => !pousses.includes(c) && !fabriqueDe(c));
    expect(muets, [
      "Ces canaux sont écoutés par « preload.cjs » et rien ne les envoie dans « main.cjs ». Un",
      "canal d'avancement que personne n'alimente laisse le nœud muet pendant toute son exécution,",
      "ce qui passe pour un gel.",
    ].join("\n")).toEqual([]);
  });

  it("un appel bloquant est traité par « ipcMain.on », et il n'y en a qu'un", () => {
    // UN SEUL EST ACCEPTÉ, et c'est volontaire : `maj:restaurer-backup-sync` est lu au tout début
    // du chargement de la page, avant qu'il y ait une interface à geler, et `preload.cjs` écrit
    // pourquoi. Un second gèlerait une interface déjà montée.
    expect(synchrones).toEqual(["maj:restaurer-backup-sync"]);
    for (const c of synchrones) expect(surEcoute, c).toContain(c);
  });
});
