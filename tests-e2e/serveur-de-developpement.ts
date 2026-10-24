// tests-e2e/serveur-de-developpement.ts — Le serveur qu'un spec allume pour se mesurer.
//
// POURQUOI CE FICHIER EXISTE, ET CE QU'IL A COÛTÉ DE NE PAS L'AVOIR.
//
// Trente-trois specs recopiaient le même amorçage d'une trentaine de lignes, en SEPT FORMES qui ne
// différaient que par la mise en forme et les compteurs d'attente. Aucune ne différait par le sens.
// Et une correction y restait locale : `detacher-fichier.spec.ts` portait depuis longtemps
// `test.setTimeout(180_000)` avec le commentaire « Démarrer Vite dépasse largement le délai par
// défaut d'un hook (30 s) », pendant que les trente-deux autres gardaient le défaut.
//
// TROIS DÉFAUTS MESURÉS LE 2026-10-24, et ce fichier les tient tous les trois.
//
// 1. PAS DE `--strictPort`, DONC UNE DÉRIVE SILENCIEUSE. Quand le port demandé est pris, vite passe
//    au suivant sans rien dire. L'attente guettait alors dans le journal une ligne
//    `http://localhost:<port demandé>` qui ne viendrait jamais : quatre-vingts secondes perdues,
//    puis un délai de crochet qui n'expliquait rien. Relevé : un vite orphelin lancé la veille avec
//    `--port 5193` occupait 5194 ; une passe demandant 5194 a pris 5195 ; le spec attendait 5194.
//    PIRE SUR LE PORT DE FABIEN : dix-neuf specs demandaient 5175. Son serveur y répondant, le spec
//    finissait par le trouver « prêt » et mesurait SUR SON SERVEUR, en laissant un vite de plus
//    derrière lui. C'est le mécanisme par lequel mes passes tuaient son serveur.
//
// 2. LE DÉLAI D'UN CROCHET VAUT TRENTE SECONDES, et allumer vite à froid passe au travers. L'échec
//    était alors `"beforeAll" hook timeout of 30000ms exceeded`, sans un mot de ce que vite a dit.
//
// 3. `kill()` TUAIT `cmd`, PAS VITE. Les specs passaient par `cmd /c npm run dev` : tuer `cmd`
//    laissait le petit-fils vivant. Chaque passe laissait donc un serveur derrière elle — c'est ce
//    qui a causé le défaut 1. Vite est maintenant lancé DIRECTEMENT, et `kill()` l'atteint.
//
// ET L'ATTENTE NE LIT PLUS LE JOURNAL. Elle interroge l'adresse, ce qui est la seule question qui
// compte, et le journal ne sert plus qu'à EXPLIQUER un échec.
import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "@playwright/test";

const ICI = dirname(fileURLToPath(import.meta.url));
const RACINE = resolve(ICI, "..");
const VITE = resolve(RACINE, "node_modules", "vite", "bin", "vite.js");

/**
 * Les ports qu'aucun spec ne prend.
 *
 * 5175 est celui du serveur de Fabien, 5191 celui du serveur de vérification. Un spec qui en
 * demanderait un se mesurerait sur un serveur qui n'est pas le sien, ou ferait tomber le travail en
 * cours. Le garde `scripts/ports-de-verification.test.ts` refuse les deux.
 */
export const PORTS_RESERVES: readonly number[] = [5175, 5191];

/** Interroge l'adresse jusqu'à ce qu'elle réponde. Cinq cents millisecondes par essai. */
async function attendre(url: string, essais = 120): Promise<void> {
  for (let i = 0; i < essais; i++) {
    try { const res = await fetch(url); if (res.ok) return; } catch { /* pas encore là */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`le serveur n'a pas répondu à ${url} après ${(essais * 500) / 1000} s`);
}

/**
 * Installe les crochets qui allument et éteignent le serveur, et rend son adresse.
 *
 * `DEV_URL` prime : sur un poste où un serveur tourne déjà, on le réutilise au lieu d'en lancer un
 * second, et le port passé ici n'est alors pas touché. C'est ainsi que tournent les passes de
 * vérification, sur `attic-verif`.
 */
export function serveurDeVerification(port: number): string {
  if (PORTS_RESERVES.includes(port)) {
    throw new Error(`le port ${port} est réservé (${PORTS_RESERVES.join(", ")}) : un spec ne le prend pas`);
  }
  const url = process.env.DEV_URL || `http://localhost:${port}`;
  let serveur: ReturnType<typeof spawn> | null = null;
  let journal = "";
  let pret = false;

  test.beforeAll(async () => {
    // Le délai du crochet, sans quoi il vaut trente secondes : voir le défaut 2 en tête de fichier.
    test.setTimeout(300_000);
    if (process.env.DEV_URL) { await attendre(url); pret = true; return; }
    serveur = spawn(process.execPath, [VITE, "--port", String(port), "--strictPort"],
      { cwd: RACINE, stdio: "pipe" });
    serveur.stdout?.on("data", (d) => { journal += d.toString(); });
    serveur.stderr?.on("data", (d) => { journal += d.toString(); });
    // UN VITE QUI MEURT AVANT D'ÊTRE PRÊT NE S'ATTEND PAS SOIXANTE SECONDES. Avec `--strictPort`,
    // c'est ce qu'il fait quand le port est pris, et c'est la réponse qu'on veut tout de suite.
    const mort = new Promise<never>((_, rejeter) => {
      serveur?.on("exit", (code) => {
        if (!pret) rejeter(new Error(`vite s'est arrêté avant d'être prêt (code ${code}) : le port ${port} est-il déjà pris ?`));
      });
    });
    try {
      await Promise.race([attendre(url), mort]);
      pret = true;
    } catch (e) {
      // ET L'ÉCHEC PORTE LE JOURNAL. Un message nu obligeait à relancer à la main pour apprendre ce
      // que vite avait dit, alors que c'est précisément là qu'est la cause.
      throw new Error(`${(e as Error).message}\n--- journal de vite ---\n${journal.slice(-2000)}`);
    }
  });

  test.afterAll(async () => {
    if (!serveur) return;
    serveur.kill("SIGTERM");
    await new Promise((r) => setTimeout(r, 1000));
    if (serveur.exitCode === null) serveur.kill("SIGKILL");
  });

  return url;
}
