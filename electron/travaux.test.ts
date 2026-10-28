// electron/travaux.test.ts — Le registre des travaux, et ce qu'« Arrêter » atteint.
//
// ═══ LE DEFAUT, RELEVE PAR UNE REVUE LE 2026-10-26 ═══
//
// « Les travaux confies au processus principal ne s arretent pas. Douze canaux de progression, un
// seul canal d annulation -- celui des telechargements de modeles --, et aucun `.kill(` dans
// electron/. Arreter ne stoppe pas une generation de plusieurs minutes : l ordonnanceur attend sa
// fin avant de lancer la demande suivante, et la carte graphique reste occupee. »
//
// VERIFIE, ET VRAI.
//
// ═══ CE QUE CES CAS TIENNENT, ET POURQUOI C EST LA PARTIE QUI PEUT SE TROMPER ═══
//
// LE REGISTRE EST UN ETAT PARTAGE, et un etat partage se salit. Un enfant mort qui y resterait
// ferait croire a un travail en cours ; un enfant vivant qui n y serait pas serait un travail
// qu « Arreter » ne peut pas tuer. Les deux fautes sont silencieuses, et aucune ne se voit sur un
// run qui se termine bien.
//
// LES CAS LANCENT DE VRAIS PROCESSUS -- `process.execPath`, le Node d Electron, qui est toujours
// la. Un faux `spawn` aurait prouve que mon faux `spawn` marche.
import { describe, expect, it } from "vitest";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { lancerTravail, inscrireTravail, annulerLesTravaux, travauxEnCours, avecProprietaire } = require("./travaux.cjs");

/** Un Node qui dort, et qui ne s arretera donc que si on le tue. */
const DORT = ["-e", "setTimeout(() => process.exit(0), 60000)"];
/** Un Node qui ecrit trois lignes et sort. */
const PARLE = ["-e", "console.log('une'); console.log('deux'); console.error('trois');"];

describe("le registre des travaux", () => {
  it("INSCRIT PENDANT, ET RETIRE APRES : c est ce qui empeche de croire a un travail fini", async () => {
    const avant = travauxEnCours();
    const promesse = lancerTravail(process.execPath, PARLE, () => {});
    // L enfant est deja la : `spawn` rend avant que le processus ait fini de demarrer, et
    // l inscription est faite dans la meme pile.
    expect(travauxEnCours()).toBe(avant + 1);
    const r = await promesse;
    expect(r.code).toBe(0);
    expect(travauxEnCours(), "un mort reste au registre").toBe(avant);
  });

  it("RETIRE AUSSI CE QUI N A JAMAIS DEMARRE, et c est l autre moitie du meme oubli", async () => {
    const avant = travauxEnCours();
    const r = await lancerTravail("attic-binaire-qui-n-existe-pas", [], () => {});
    expect(r.code).toBe(-1);
    expect(r.journal).toMatch(/ENOENT|not recognized|introuvable/i);
    expect(travauxEnCours(), "un lancement rate reste au registre").toBe(avant);
  });

  it("VERSE LES LIGNES DES DEUX SORTIES, parce qu un moteur parle par les deux", async () => {
    const lignes: string[] = [];
    await lancerTravail(process.execPath, PARLE, (l: string) => lignes.push(l));
    expect(lignes).toContain("une");
    expect(lignes).toContain("deux");
    expect(lignes, "stderr est perdu").toContain("trois");
  });

  it("COUPE AU RETOUR CHARIOT QUAND ON LE DEMANDE, et seulement alors", async () => {
    // La barre d etapes de stable-diffusion.cpp avance par retour chariot seul : sans ce
    // separateur, ses etapes n arriveraient qu a la fin, en une seule ligne.
    const BARRE = ["-e", "process.stdout.write(['1/3', '2/3', '3/3'].join(String.fromCharCode(13)) + String.fromCharCode(10))"];
    const coupees: string[] = [];
    await lancerTravail(process.execPath, BARRE, (l: string) => coupees.push(l), { separateur: /\r\n|\r|\n/ });
    expect(coupees).toEqual(["1/3", "2/3", "3/3"]);
    const entieres: string[] = [];
    await lancerTravail(process.execPath, BARRE, (l: string) => entieres.push(l));
    expect(entieres, "le defaut ne coupe qu a la fin de ligne").toHaveLength(1);
  });

  it("TUE CE QUI DORT, et le registre se vide par `close` et non par `kill`", async () => {
    const avant = travauxEnCours();
    const promesse = lancerTravail(process.execPath, DORT, () => {});
    expect(travauxEnCours()).toBe(avant + 1);

    expect(annulerLesTravaux()).toBe(avant + 1);
    // LA PROMESSE SE RESOUT, et c est le point : sans cela l appelant attendrait une minute un
    // travail deja mort, et l ordonnanceur avec lui.
    const r = await promesse;
    expect(r.code === null || typeof r.code === "number", "code inattendu").toBe(true);
    expect(travauxEnCours()).toBe(avant);
  });

  it("TUE TOUT CE QUI TOURNE, et rend combien -- un chiffre, non `{ ok: true }`", async () => {
    const avant = travauxEnCours();
    const deux = [
      lancerTravail(process.execPath, DORT, () => {}),
      lancerTravail(process.execPath, DORT, () => {}),
    ];
    expect(travauxEnCours()).toBe(avant + 2);
    expect(annulerLesTravaux()).toBe(avant + 2);
    await Promise.all(deux);
    expect(travauxEnCours()).toBe(avant);
  });

  it("N A RIEN A TUER QUAND RIEN NE TOURNE, et le dit par zero", () => {
    expect(travauxEnCours()).toBe(0);
    expect(annulerLesTravaux()).toBe(0);
  });

  it("INSCRIT UN ENFANT ENGENDRE AILLEURS, puisque `execFile` en rend un aussi", async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { execFile } = require("child_process");
    const avant = travauxEnCours();
    await new Promise<void>((resoudre) => {
      let retirer = () => {};
      const enfant = execFile(process.execPath, PARLE, () => { retirer(); resoudre(); });
      retirer = inscrireTravail(enfant);
      expect(travauxEnCours()).toBe(avant + 1);
    });
    expect(travauxEnCours(), "le retrait rendu par `inscrireTravail` ne retire pas").toBe(avant);
  });

  it("NE S ETOUFFE PAS SUR RIEN : `inscrireTravail(undefined)` rend un retrait inoffensif", () => {
    const avant = travauxEnCours();
    const retirer = inscrireTravail(undefined);
    expect(travauxEnCours()).toBe(avant);
    expect(() => retirer()).not.toThrow();
  });
});

/** Le processus `pid` vit-il encore ? `kill(pid, 0)` n envoie rien, il demande seulement. */
function vivant(pid: number): boolean {
  try { process.kill(pid, 0); return true; } catch { return false; }
}

/** Attend que `pid` soit mort, jusqu a `delaiMs`. `taskkill` est asynchrone. */
async function attendreLaMort(pid: number, delaiMs = 10000): Promise<boolean> {
  const fin = Date.now() + delaiMs;
  while (Date.now() < fin) {
    if (!vivant(pid)) return true;
    await new Promise((r) => setTimeout(r, 50));
  }
  return !vivant(pid);
}

describe("l annulation vise la fenetre qui la demande", () => {
  // ═══ LE DEFAUT, RELEVE PAR UNE REVUE LE 2026-10-27 ═══
  //
  // `annulerLesTravaux` tuait TOUT le registre. Les fenetres partagent le processus principal :
  // « Arreter » dans l une tuait la separation en cours dans l autre.

  it("N ATTEINT QUE LES ENFANTS DE SA FENETRE, et laisse vivre ceux de l autre", async () => {
    const avant = travauxEnCours();
    const dansUn = avecProprietaire(1, () => lancerTravail(process.execPath, DORT, () => {}));
    const dansDeux = avecProprietaire(2, () => lancerTravail(process.execPath, DORT, () => {}));
    expect(travauxEnCours(1)).toBe(1);
    expect(travauxEnCours(2)).toBe(1);

    expect(annulerLesTravaux(1), "la fenetre 1 n a pas tue son propre travail").toBe(1);
    await dansUn;
    expect(travauxEnCours(2), "la fenetre 1 a tue le travail de la fenetre 2").toBe(1);

    expect(annulerLesTravaux(2)).toBe(1);
    await dansDeux;
    expect(travauxEnCours()).toBe(avant);
  });

  it("LE PROPRIETAIRE SUIT LES PROMESSES, jusqu a un `spawn` lance apres un `await`", async () => {
    // C est la forme reelle : un gestionnaire attend un fichier, puis lance le binaire.
    const travail = avecProprietaire(7, async () => {
      await new Promise((r) => setTimeout(r, 20));
      return lancerTravail(process.execPath, DORT, () => {});
    });
    await new Promise((r) => setTimeout(r, 60));
    expect(travauxEnCours(7), "le contexte s est perdu a travers l attente").toBe(1);
    expect(annulerLesTravaux(7)).toBe(1);
    await travail;
    expect(travauxEnCours(7)).toBe(0);
  });

  it("UN ENFANT SANS PROPRIETAIRE n est atteint que par une annulation sans proprietaire", async () => {
    const orphelin = lancerTravail(process.execPath, DORT, () => {});
    expect(annulerLesTravaux(3), "une fenetre a tue un travail qui n etait pas le sien").toBe(0);
    expect(annulerLesTravaux()).toBe(1);
    await orphelin;
  });

  it("L ARBRE ENTIER TOMBE : le petit-enfant ne survit pas a son parent", async () => {
    // Un Node qui engendre un Node dormeur, en dit le pid, et dort lui aussi. Sous Windows,
    // `kill()` seul laissait ce petit-enfant vivant.
    //
    // LE PETIT-ENFANT EST DETACHE, ET SANS CELA LE CAS NE PROUVAIT RIEN. Premier jet vert AVEC LE
    // DEFAUT PLANTE (`kill()` seul) : sous Windows, libuv range les enfants d un Node dans un objet
    // de travail qui les tue a la mort de ce Node. Un temoin Node meurt donc quoi qu on fasse, la
    // ou un sous-processus lance par Python, qui n a pas cet objet, survit. `detached` le sort de
    // l objet, et le rend semblable au cas reel.
    const PARENT = ["-e",
      "const c = require('child_process').spawn(process.execPath, ['-e', 'setTimeout(() => {}, 60000)'], { stdio: 'ignore', detached: true });"
      + " console.log('PID ' + c.pid); setTimeout(() => {}, 60000);"];
    let pidPetitEnfant = 0;
    let signaler: () => void = () => {};
    const annonce = new Promise<void>((r) => { signaler = r; });
    const travail = avecProprietaire(9, () => lancerTravail(process.execPath, PARENT, (l: string) => {
      const m = /^PID (\d+)$/.exec(l);
      if (m) { pidPetitEnfant = Number(m[1]); signaler(); }
    }));
    await annonce;
    expect(vivant(pidPetitEnfant), "le petit-enfant n a pas demarre : le cas ne prouverait rien").toBe(true);

    expect(annulerLesTravaux(9)).toBe(1);
    await travail;
    expect(await attendreLaMort(pidPetitEnfant), "le petit-enfant a survecu a l arret").toBe(true);
  });
});
