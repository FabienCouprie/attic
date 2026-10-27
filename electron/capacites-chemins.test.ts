// electron/capacites-chemins.test.ts — Une racine ne contient que ce qui est dans elle.
//
// CE QUE CES CAS GARDENT. Le pont du bureau ecrivait a n'importe quel chemin sans validation, et un
// noeud installe atteint le pont — mesure par `src/core/node-essai.ts`. La reparation retenue par
// Fabien le 2026-10-25 est de BORNER LE PONT plutot que d'isoler le noeud, parce qu'isoler aurait
// oblige l'API des noeuds installes a devenir asynchrone, donc a casser le contrat du code tiers.
//
// LA PRIMITIVE EST DONC « ce chemin est-il sous une racine declaree ». Elle est la piece critique :
// un contournement ici rend tout le reste decoratif. Trois en sont connus, et chacun a son cas.
import { describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const cap = require("./capacites-chemins.cjs");

const win = process.platform === "win32";
/** Une racine absolue valable sur les deux plateformes, pour que ces cas disent la meme chose partout. */
const R = win ? "C:/permis" : "/permis";
const AILLEURS = win ? "C:/interdit" : "/interdit";

describe("une racine declaree", () => {
  it("CONTIENT CE QUI EST DEDANS, et elle-meme", () => {
    cap.oublierLesRacines();
    cap.declarerRacine(R);
    expect(cap.sousUneRacine(`${R}/son.wav`)).toBe(true);
    expect(cap.sousUneRacine(`${R}/sous/dossier/son.wav`)).toBe(true);
    expect(cap.sousUneRacine(R), "la racine elle-meme en fait partie").toBe(true);
  });

  it("NE CONTIENT PAS UN VOISIN DE MEME PREFIXE — c'est le piege du prefixe", () => {
    // Sans le separateur obligatoire apres la racine, `/permisXXL/secret` passerait pour etre sous
    // `/permis`. C'est la faute la plus facile a ecrire dans ce genre de verification.
    cap.oublierLesRacines();
    cap.declarerRacine(R);
    expect(cap.sousUneRacine(`${R}XXL/secret`)).toBe(false);
    expect(cap.sousUneRacine(`${R}-bis/secret`)).toBe(false);
  });

  it("ET LES `..` NE LA TRAVERSENT PAS, parce que le chemin est resolu avant d'etre compare", () => {
    cap.oublierLesRacines();
    cap.declarerRacine(R);
    expect(cap.sousUneRacine(`${R}/../interdit/x`)).toBe(false);
    expect(cap.sousUneRacine(`${R}/sous/../../interdit/x`)).toBe(false);
    // Et un aller-retour qui revient dedans reste dedans.
    expect(cap.sousUneRacine(`${R}/sous/../son.wav`)).toBe(true);
  });

  it("les separateurs ne font pas deux racines d'une seule", () => {
    cap.oublierLesRacines();
    cap.declarerRacine(win ? "C:\\permis" : "/permis");
    expect(cap.sousUneRacine(`${R}/son.wav`)).toBe(true);
  });

  it.runIf(win)("ET LA CASSE NE COMPTE PAS SOUS WINDOWS, ou c'est le meme dossier", () => {
    cap.oublierLesRacines();
    cap.declarerRacine("C:/Permis");
    expect(cap.sousUneRacine("c:/permis/son.wav")).toBe(true);
    expect(cap.sousUneRacine("C:/PERMIS/SON.WAV")).toBe(true);
  });

  it.skipIf(win)("mais elle compte ailleurs, ou deux casses sont deux dossiers", () => {
    cap.oublierLesRacines();
    cap.declarerRacine("/Permis");
    expect(cap.sousUneRacine("/permis/son.wav")).toBe(false);
  });

  it("SANS AUCUNE RACINE, RIEN N'EST DEDANS — l'ensemble vide ne tolere pas tout", () => {
    cap.oublierLesRacines();
    expect(cap.sousUneRacine(`${R}/son.wav`)).toBe(false);
    expect(cap.racinesConnues()).toEqual([]);
  });

  it("et ce qu'un dialogue rend est un FICHIER : c'est son dossier qui devient la racine", () => {
    cap.oublierLesRacines();
    cap.declarerRacineDuFichier(`${R}/projet.attic`);
    expect(cap.sousUneRacine(`${R}/autre.wav`), "le dossier choisi est autorise").toBe(true);
    expect(cap.sousUneRacine(`${AILLEURS}/autre.wav`)).toBe(false);
  });
});

// ═══ LA SANCTION EST ARMEE PAR DEFAUT DEPUIS LE 2026-10-27, ET L'ETEINDRE EST UN ETAT DECLARE ═══
//
// Elle a ete eteinte le temps d'un releve ; elle est armee depuis que les ecritures refusees se
// disent. `ATTIC_RACINES_STRICTES=0` l'eteint pour un diagnostic.
describe("la sanction", () => {
  const avec = (strict: boolean, faire: () => void) => {
    const avant = process.env.ATTIC_RACINES_STRICTES;
    // ARMEE, C'EST L'ETAT PAR DEFAUT : on retire la variable plutot que de la poser a « 1 », pour
    // que les cas « rallumee » eprouvent bien le defaut et non un drapeau.
    if (strict) delete process.env.ATTIC_RACINES_STRICTES;
    else process.env.ATTIC_RACINES_STRICTES = "0";
    try { faire(); } finally {
      if (avant === undefined) delete process.env.ATTIC_RACINES_STRICTES;
      else process.env.ATTIC_RACINES_STRICTES = avant;
    }
  };

  it("SANS RIEN DECLARER, ELLE EST ARMEE : un chemin hors racine est refuse", () => {
    const avant = process.env.ATTIC_RACINES_STRICTES;
    delete process.env.ATTIC_RACINES_STRICTES;
    try {
      cap.oublierLesRacines();
      expect(cap.racinesStrictes(), "la sanction n'est plus armee par defaut").toBe(true);
      expect(cap.verdictRacine(`${AILLEURS}/x.wav`).ok).toBe(false);
    } finally {
      if (avant !== undefined) process.env.ATTIC_RACINES_STRICTES = avant;
    }
  });

  it("ETEINTE, un chemin hors racine PASSE — mais le verdict dit qu'il n'etait pas dedans", () => {
    // TROIS ETATS ET NON DEUX : « passe parce qu'on ne sanctionne pas encore » n'est pas « passe
    // parce qu'il est sous une racine ». Confondre les deux ferait croire le releve inutile.
    avec(false, () => {
      cap.oublierLesRacines();
      const v = cap.verdictRacine(`${AILLEURS}/x.wav`);
      expect(v.ok, "rien ne casse pendant le releve").toBe(true);
      expect(v.sousRacine, "mais ce n'etait pas sous une racine, et c'est ce qu'on releve").toBe(false);
    });
  });

  it("RALLUMEE, il est REFUSE, et la raison dit d'ou naît une racine", () => {
    avec(true, () => {
      cap.oublierLesRacines();
      const v = cap.verdictRacine(`${AILLEURS}/x.wav`);
      expect(v.ok).toBe(false);
      expect(v.raison).toMatch(/dialogue/);
    });
  });

  it("et rallumee, ce qui est sous une racine passe toujours", () => {
    avec(true, () => {
      cap.oublierLesRacines();
      cap.declarerRacine(R);
      const v = cap.verdictRacine(`${R}/x.wav`);
      expect(v.ok).toBe(true);
      expect(v.sousRacine).toBe(true);
    });
  });
});

// ═══ LES ACCORDS QUI SURVIVENT À LA FERMETURE ═══
//
// POURQUOI ILS EXISTENT, ET C'EST UNE MESURE. Un dialogue n'autorisait que la session où il s'était
// ouvert, et deux chemins du code rendaient cela intenable :
//
//   · `src/ui/App.tsx` garde le dossier de travail choisi dans `attic-repertoire`, et ne redemande
//     `dossier:travail-defaut` que s'il est vide. Au lancement suivant, aucun dialogue ne s'ouvre.
//   · SIX écrivains prennent leur destination d'un paramètre `type: "dossier"` posé sur le nœud,
//     rempli par un dialogue puis ENREGISTRÉ DANS LE PROJET. Rouvrir le projet ne le rouvre pas.
//
// Sans ces accords, rallumer la sanction aurait cassé l'ouverture des projets EN SILENCE.
describe("les accords d'un dialogue", () => {
  /** Un dossier jetable, et le fichier d'accords dedans. */
  function bac() {
    const base = mkdtempSync(join(tmpdir(), "attic-racines-"));
    return { base, fichier: join(base, "racines-accordees.json") };
  }

  it("SURVIVENT À LA FERMETURE : relus au lancement, ils autorisent encore", () => {
    const { base, fichier } = bac();
    try {
      cap.oublierLesRacines();
      cap.memoriserLesAccords(fichier);
      cap.accorderRacine(join(base, "choisi"));

      // LA FERMETURE EST SIMULÉE PAR L'OUBLI, qui est exactement ce que la fin du processus fait de
      // l'ensemble en mémoire. Ce qui reste est le fichier.
      cap.oublierLesRacines();
      expect(cap.sousUneRacine(join(base, "choisi", "son.wav")),
        "après l'oubli, et avant la relecture, rien n'est autorisé").toBe(false);

      const relus = cap.memoriserLesAccords(fichier);
      expect(relus.length).toBe(1);
      expect(cap.sousUneRacine(join(base, "choisi", "son.wav"))).toBe(true);
      expect(cap.sousUneRacine(join(base, "ailleurs", "son.wav")),
        "et la relecture n'autorise que ce qui avait été accordé").toBe(false);
    } finally {
      cap.oublierLesRacines();
      rmSync(base, { recursive: true, force: true });
    }
  });

  it("et UN DOSSIER DE L'APPLICATION NE SURVIT PAS, lui : il se recalcule", () => {
    // Les garder ferait tomber de vrais accords sous le plafond, pour y remettre des dossiers que
    // le démarrage déclare de toute façon.
    const { base, fichier } = bac();
    try {
      cap.oublierLesRacines();
      cap.memoriserLesAccords(fichier);
      cap.declarerRacine(join(base, "userData"));
      cap.oublierLesRacines();
      expect(cap.memoriserLesAccords(fichier).length).toBe(0);
    } finally {
      cap.oublierLesRacines();
      rmSync(base, { recursive: true, force: true });
    }
  });

  // ═══ LE PLAFOND SE MESURE DES DEUX CÔTÉS, ET IL LE FAUT ═══
  //
  // UN SEUL CAS NE PROUVAIT RIEN, et deux défauts plantés l'ont montré. Il y a DEUX plafonds — l'un
  // à l'écriture, l'autre à la relecture — et chacun masquait l'absence de l'autre : retirer
  // l'éviction à l'écriture laissait le fichier grossir, mais la relecture n'en prenait que les
  // soixante-quatre derniers, et le cas restait vert ; retirer le plafond de la relecture ne se
  // voyait pas non plus, l'éviction ayant déjà gardé le fichier court.
  //
  // DEUX CAS DONC, chacun aveugle à l'autre mécanisme : l'un lit LE FICHIER, l'autre part d'un
  // fichier écrit à la main.
  it("SONT BORNÉS À L'ÉCRITURE : le fichier lui-même ne grossit pas sans fin", () => {
    const { base, fichier } = bac();
    try {
      cap.oublierLesRacines();
      cap.memoriserLesAccords(fichier);
      for (let i = 0; i < cap.ACCORDS_GARDES + 5; i++) cap.accorderRacine(join(base, `d${i}`));
      // ON LIT LE FICHIER, et non l'ensemble relu : c'est le seul endroit où l'éviction à
      // l'écriture se voit, la relecture ayant son propre plafond.
      const surLeDisque = JSON.parse(readFileSync(fichier, "utf8"));
      expect(surLeDisque.length, "une racine est une capacité permanente ; leur nombre est borné")
        .toBe(cap.ACCORDS_GARDES);
      expect(surLeDisque.some((r: string) => r.endsWith("/d0")), "le plus ancien est tombé").toBe(false);
      expect(surLeDisque.some((r: string) => r.endsWith(`/d${cap.ACCORDS_GARDES + 4}`)),
        "le plus récent est gardé").toBe(true);
    } finally {
      cap.oublierLesRacines();
      rmSync(base, { recursive: true, force: true });
    }
  });

  it("ET BORNÉS À LA RELECTURE : un fichier écrit à la main ne déclare pas mille racines", () => {
    const { base, fichier } = bac();
    try {
      const trop = Array.from({ length: cap.ACCORDS_GARDES * 4 }, (_, i) => join(base, `m${i}`));
      writeFileSync(fichier, JSON.stringify(trop));
      cap.oublierLesRacines();
      const relus = cap.memoriserLesAccords(fichier);
      expect(relus.length, "le plafond s'applique aussi à ce qu'on relit").toBe(cap.ACCORDS_GARDES);
      expect(cap.sousUneRacine(join(base, "m0", "x")), "le début du fichier est ignoré").toBe(false);
      expect(cap.sousUneRacine(join(base, `m${cap.ACCORDS_GARDES * 4 - 1}`, "x"))).toBe(true);
    } finally {
      cap.oublierLesRacines();
      rmSync(base, { recursive: true, force: true });
    }
  });

  it("et un accord RÉEMPLOYÉ remonte la file, au lieu de vieillir sur place", () => {
    const { base, fichier } = bac();
    try {
      cap.oublierLesRacines();
      cap.memoriserLesAccords(fichier);
      cap.accorderRacine(join(base, "quotidien"));
      for (let i = 0; i < cap.ACCORDS_GARDES - 1; i++) cap.accorderRacine(join(base, `d${i}`));
      // Employé une fois de plus, juste avant que le plafond ne morde.
      cap.accorderRacine(join(base, "quotidien"));
      cap.accorderRacine(join(base, "le-dernier"));
      cap.oublierLesRacines();
      cap.memoriserLesAccords(fichier);
      expect(cap.sousUneRacine(join(base, "quotidien", "x")),
        "un dossier employé chaque jour ne doit pas tomber avant un dossier ouvert une fois").toBe(true);
      expect(cap.sousUneRacine(join(base, "d0", "x")),
        "c'est le plus ancien NON RÉEMPLOYÉ qui tombe").toBe(false);
    } finally {
      cap.oublierLesRacines();
      rmSync(base, { recursive: true, force: true });
    }
  });

  it("ET UN FICHIER ABÎMÉ N'OUVRE RIEN : il n'enlève que des racines", () => {
    const { base, fichier } = bac();
    try {
      writeFileSync(fichier, "{ ceci n'est pas du JSON");
      cap.oublierLesRacines();
      expect(cap.memoriserLesAccords(fichier).length).toBe(0);
      expect(cap.sousUneRacine(join(base, "quoi-que-ce-soit"))).toBe(false);
    } finally {
      cap.oublierLesRacines();
      rmSync(base, { recursive: true, force: true });
    }
  });

  it("et SANS FICHIER DÉCLARÉ, rien n'est écrit sur le disque de qui n'a rien demandé", () => {
    const { base, fichier } = bac();
    try {
      cap.oublierLesRacines();
      cap.accorderRacine(join(base, "choisi"));
      expect(cap.sousUneRacine(join(base, "choisi", "x")), "l'accord vaut pour la session").toBe(true);
      expect(existsSync(fichier), "mais rien ne s'écrit tant qu'aucun fichier n'est désigné").toBe(false);
    } finally {
      cap.oublierLesRacines();
      rmSync(base, { recursive: true, force: true });
    }
  });
});

// ═══ ET CE QUE LE PROPRIÉTAIRE DÉCLARE LUI-MÊME ═══
//
// L'en-tête du module annonçait `ATTIC_RACINES` ALORS QUE RIEN NE LA LISAIT. Une source annoncée et
// absente est pire qu'une source absente : elle fait croire la porte ouverte quand il faudra la
// franchir. Ces cas existent pour que l'annonce et le code ne puissent plus diverger.
describe("ATTIC_RACINES", () => {
  it("déclare des racines, séparées comme un PATH", () => {
    const avant = process.env.ATTIC_RACINES;
    try {
      cap.oublierLesRacines();
      process.env.ATTIC_RACINES = [R, AILLEURS].join(delimiter);
      expect(cap.declarerRacinesDeLEnvironnement().length).toBe(2);
      expect(cap.sousUneRacine(`${R}/x.wav`)).toBe(true);
      expect(cap.sousUneRacine(`${AILLEURS}/x.wav`)).toBe(true);
    } finally {
      if (avant === undefined) delete process.env.ATTIC_RACINES; else process.env.ATTIC_RACINES = avant;
      cap.oublierLesRacines();
    }
  });

  it("et sans elle, aucune racine n'apparaît", () => {
    const avant = process.env.ATTIC_RACINES;
    try {
      delete process.env.ATTIC_RACINES;
      cap.oublierLesRacines();
      expect(cap.declarerRacinesDeLEnvironnement().length).toBe(0);
    } finally {
      if (avant !== undefined) process.env.ATTIC_RACINES = avant;
    }
  });

  it("et elle N'EST PAS PERSISTÉE : la retirer la retire vraiment", () => {
    // La recopier dans les accords la rendrait permanente après qu'on l'a enlevée, ce qui est le
    // contraire de ce qu'une variable d'environnement promet.
    const { base, fichier } = bac2();
    const avant = process.env.ATTIC_RACINES;
    try {
      cap.oublierLesRacines();
      cap.memoriserLesAccords(fichier);
      process.env.ATTIC_RACINES = join(base, "par-env");
      cap.declarerRacinesDeLEnvironnement();
      delete process.env.ATTIC_RACINES;
      cap.oublierLesRacines();
      cap.memoriserLesAccords(fichier);
      expect(cap.sousUneRacine(join(base, "par-env", "x"))).toBe(false);
    } finally {
      if (avant !== undefined) process.env.ATTIC_RACINES = avant;
      cap.oublierLesRacines();
      rmSync(base, { recursive: true, force: true });
    }
  });
});

/** Le même bac jetable, pour le dernier cas : `describe` n'hérite pas des fonctions d'un autre. */
function bac2() {
  const base = mkdtempSync(join(tmpdir(), "attic-racines-env-"));
  return { base, fichier: join(base, "racines-accordees.json") };
}

// ═══ ET PERSONNE NE FRAPPE UNE RACINE AVEC UN CHEMIN VENU DU RENDU ═══
//
// C'EST LA PROPRIÉTÉ DONT TOUT LE RESTE DÉPEND. Les cas ci-dessus vérifient qu'une racine contient
// ce qu'elle doit contenir ; celui-ci vérifie D'OÙ ELLE VIENT. Un seul `declarerRacine(chemin)`
// posé dans un gestionnaire qui reçoit son chemin du rendu, et le bornage entier devient décoratif :
// le nœud installé n'aurait qu'à faire déclarer la racine avant d'écrire dedans.
//
// CE QUE CE CAS PROUVE, ET CE QU'IL NE PROUVE PAS. Il ne démontre pas qu'une expression est sûre —
// il fige la LISTE des expressions employées. Un site neuf le fait tomber, et son auteur doit alors
// dire pourquoi son expression est mintée par le côté privilégié. C'est un garde qui force une
// décision à être reprise, pas un garde qui la prend.
describe("les sites qui frappent une racine, dans le processus principal", () => {
  const MAIN = readFileSync(join(__dirname, "main.cjs"), "utf8");

  /**
   * LES EXPRESSIONS AUTORISÉES, et pourquoi chacune l'est.
   *
   *   · `r.filePath` et `p` viennent d'un RETOUR DE DIALOGUE : `dialog.showSaveDialog` et
   *     `showOpenDialog` rendent ce que l'utilisateur a désigné, et le rendu n'a pas la main sur ce
   *     retour — il ne peut que demander l'ouverture du dialogue.
   *   · `dossier` est un élément de la liste de candidats que `dossierDeTravailParDefaut` calcule
   *     elle-même ; aucun argument n'y entre.
   *   · `app.getPath("userData")` est le dossier de l'application.
   */
  const PERMISES = new Set(['r.filePath', 'p', 'dossier', 'app.getPath("userData")']);

  it("n'emploient que des expressions mintées par le côté privilégié", () => {
    // LES PARENTHÈSES IMBRIQUÉES COMPTENT, et mon premier jet les a manquées : `[^)]*` coupait
    // `app.getPath("userData")` à la parenthèse intérieure, et le garde refusait une expression
    // qu'il aurait dû reconnaître. Un niveau d'imbrication est capturé explicitement.
    const sites = [...MAIN.matchAll(/\b(?:declarer|accorder)Racine(?:DuFichier)?\(((?:[^()]|\([^()]*\))*)\)/g)]
      .map((m) => m[1].trim())
      .filter((a) => a);
    expect(sites.length, "les sites qui frappent une racine ont disparu de main.cjs")
      .toBeGreaterThan(0);
    for (const arg of sites) {
      expect(PERMISES.has(arg), [
        "",
        `Un site frappe une racine avec « ${arg} », qui n'est pas dans la liste des expressions`,
        "mintées par le côté privilégié.",
        "",
        "SI CETTE EXPRESSION VIENT D'UN ARGUMENT DE GESTIONNAIRE, elle est le contournement que tout",
        "ce module existe pour fermer : le rendu ferait déclarer la racine avant d'écrire dedans.",
        "",
        "Si elle est légitime, l'ajouter à PERMISES ci-dessus AVEC SA RAISON — c'est précisément la",
        "décision que ce garde force à reprendre.",
        "",
      ].join("\n")).toBe(true);
    }
  });

  it("TOUT CANAL QUI REÇOIT UN CHEMIN DU RENDU LE PÈSE ET L'INSCRIT", () => {
    // ═══ LE GARDE QUI MANQUAIT, ET CE QU'IL A COÛTÉ ═══
    //
    // Relevé par une revue le 2026-10-26 : « `fichier:supprimer` n'a aucune garde. Il supprime
    // n'importe quel fichier que l'utilisateur a le droit de supprimer, et il n'est soumis ni à la
    // règle des racines, ni au journal des chemins. » Vrai : un `fs.unlinkSync` sans une ligne de
    // validation, pendant que ses trois voisins pesaient le leur.
    //
    // LE BORNAGE AVAIT ÉTÉ POSÉ CANAL PAR CANAL, et rien ne disait lesquels devaient l'avoir. Un
    // canal oublié ne se voyait donc pas — et le prochain ne se verrait pas davantage.
    for (const canal of ["fichier:ecrire", "fichier:copier", "fichier:ouvrir-chemin", "fichier:supprimer"]) {
      const debut = MAIN.indexOf(`ipcMain.handle("${canal}"`);
      expect(debut, `le canal ${canal} a disparu`).toBeGreaterThan(-1);
      const fin = MAIN.indexOf("ipcMain.handle(", debut + 20);
      const corps = MAIN.slice(debut, fin > debut ? fin : undefined);
      expect(corps, [
        "",
        `LE CANAL « ${canal} » NE PÈSE PAS LE CHEMIN QU'IL REÇOIT.`,
        "",
        "Il doit consulter `verdictRacine` : c'est ce qui borne l'endroit, et la seule chose qui",
        "vaille pour une suppression, où l'extension ne protège personne.",
        "",
      ].join("\n")).toMatch(/\bverdictRacine\b/);
      expect(corps, `${canal} doit s'inscrire au journal, sans quoi le relevé des racines l'ignore`)
        .toMatch(/\binscrireChemin\b/);
    }
  });

  it("et AUCUN n'est posé dans un gestionnaire qui reçoit un chemin du rendu", () => {
    // Les quatre canaux qui reçoivent un chemin nommé par le rendu. Un `declarerRacine` dans leur
    // corps autoriserait le chemin qu'ils sont chargés de vérifier.
    for (const canal of ["fichier:ecrire", "fichier:copier", "fichier:ouvrir-chemin", "fichier:supprimer"]) {
      const debut = MAIN.indexOf(`ipcMain.handle("${canal}"`);
      expect(debut, `le canal ${canal} a disparu`).toBeGreaterThan(-1);
      const fin = MAIN.indexOf("ipcMain.handle(", debut + 20);
      const corps = MAIN.slice(debut, fin > debut ? fin : undefined);
      expect(corps, `${canal} ne doit pas pouvoir frapper une racine`)
        .not.toMatch(/\b(?:declarer|accorder)Racine/);
    }
  });
});
