// tests-e2e/demarrage-electron.ts — Ce que le processus principal d'Electron écrit à son démarrage.
//
// POURQUOI CETTE AIDE. `electron.launch` de Playwright branche son écoute sur la sortie du processus
// une fois l'application lancée : ce que le processus principal écrit au chargement de son module
// est perdu. Relevé le 2026-11-19 sur `configuration-dans-electron.spec.ts`, où la sortie restait
// vide. Le binaire est donc lancé directement, sa sortie lue dès le premier octet, puis l'arbre de
// ses processus arrêté.
//
// ELLE NE LANCE AUCUN SERVEUR : `serveur-de-developpement.ts` reste le seul endroit où Vite démarre,
// et `src/docs/contrat-serveur-de-specs.test.ts` le tient pour les specs. Elle vit hors d'un spec pour
// la même raison que lui : une aide se corrige une fois.
//
// UN PROFIL JETABLE, TOUJOURS : un démarrage sur le profil de la personne y efface ce que son
// application installée a posé.
import { spawn } from "child_process";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { createRequire } from "module";
import { tmpdir } from "os";
import { join } from "path";

const ELECTRON = createRequire(import.meta.url)("electron") as unknown as string;

/** Un profil neuf, où l'on a posé ce `config.json`, ou rien. */
export function profilAvec(config: string | null): string {
  const profil = mkdtempSync(join(tmpdir(), "attic-configuration-"));
  if (config !== null) writeFileSync(join(profil, "config.json"), config);
  return profil;
}

/**
 * Efface un profil jetable ; sous Windows, un fichier peut rester tenu un instant après l'arrêt.
 *
 * L'ATTENTE EST LA NÔTRE, et non celle de `rmSync`. Relevé le 2026-11-19 (pièce C1) : sept effacements
 * sur huit tombaient en EPERM sur `Local Storage\leveldb\LOCK`, chaque cas durant 2,5 s, alors que
 * `maxRetries: 10` promet des secondes d'attente ; les mêmes dossiers s'effaçaient sans peine une
 * minute plus tard, aucun processus d'Electron ne vivant plus. On réessaie donc soi-même, en
 * attendant vraiment, jusqu'à 15 s.
 */
export async function effacerProfil(profil: string, delaiMs = 15_000): Promise<void> {
  const limite = Date.now() + delaiMs;
  for (;;) {
    try {
      rmSync(profil, { recursive: true, force: true });
      return;
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code;
      if (!["EPERM", "EBUSY", "ENOTEMPTY"].includes(code ?? "") || Date.now() > limite) throw e;
      await new Promise((r) => setTimeout(r, 250));
    }
  }
}

/**
 * Lance l'application de cette racine sur un profil où l'on a posé ce `config.json`, et rend ce que
 * son processus principal écrit jusqu'à la première ligne qui satisfait `attendu`.
 */
export async function journalDeDemarrage(racine: string, config: string, attendu: RegExp, delaiMs = 60_000): Promise<string> {
  const profil = profilAvec(config);
  const enfant = spawn(ELECTRON, [racine, `--user-data-dir=${profil}`], { cwd: racine, env: { ...process.env, NODE_ENV: "" } });
  let journal = "";
  try {
    await new Promise<void>((fini, echec) => {
      const delai = setTimeout(() => echec(new Error(`aucune ligne ${attendu} en ${delaiMs / 1000} s :\n${journal}`)), delaiMs);
      const lire = (d: Buffer) => {
        journal += String(d);
        if (attendu.test(journal)) { clearTimeout(delai); fini(); }
      };
      enfant.stdout.on("data", lire);
      enfant.stderr.on("data", lire);
    });
    return journal;
  } finally {
    // L'ARBRE ENTIER : sous Windows, tuer le seul processus principal laisserait ses enfants. Puis
    // on attend que le principal soit sorti, avant d'effacer ce qu'il tenait.
    const sorti = enfant.exitCode !== null ? Promise.resolve() : new Promise((r) => enfant.once("exit", r));
    if (process.platform === "win32") await new Promise((r) => spawn("taskkill", ["/pid", String(enfant.pid), "/T", "/F"]).on("exit", r));
    else enfant.kill();
    await sorti;
    await effacerProfil(profil);
  }
}
