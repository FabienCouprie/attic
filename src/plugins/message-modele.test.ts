// plugins/message-modele.test.ts — Le message du modèle, et surtout : personne ne l'oublie.
//
// CE QUE CE FICHIER GARDE, ET POURQUOI C'EST LA PARTIE QUI COMPTE. Le champ `noeuds` du manifeste
// relie un paquet de modèle aux fiches qui s'en servent. Il était transporté de
// `scripts/modeles.cjs` jusqu'à `EtatModeles` sans que rien ne le lise — et **trois de ses quatre
// valeurs de séparation et de genre ne désignaient aucune fiche** : « separation-demucs »,
// « separation-voix », « genre-musical ». Un quatrième nœud, la continuation Stable Audio 3, n'y
// figurait pas du tout alors qu'il résout le même paquet. Un champ que personne ne lit ne peut pas
// être juste ; les trois assertions de structure ci-dessous le rendent impossible à laisser faux.
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { toutesLesFiches } from "./index";
import { annoncerModele, manqueAuNoeud, texteAvecModele } from "./message-modele";
import type { EtatModeles, ModeleEtat } from "../ui/etat-modeles";

const MANIFESTE = "scripts/modeles-manifest.json";

interface PaquetManifeste { id: string; noeuds?: string[]; octets: number }

function paquets(): PaquetManifeste[] {
  const brut = JSON.parse(readFileSync(MANIFESTE, "utf8")) as { modeles?: PaquetManifeste[] };
  return brut.modeles ?? [];
}

/** L'union des nœuds que le manifeste dit concernés par un modèle. */
function noeudsDuManifeste(): string[] {
  return [...new Set(paquets().flatMap((p) => p.noeuds ?? []))].sort();
}

/** Les identifiants passés à `annoncerModele` dans les sources, relevés statiquement. */
function noeudsQuiAnnoncent(): string[] {
  const vus = new Set<string>();
  const appel = /annoncerModele\(\s*ctx\s*,\s*"([^"]+)"/g;
  const parcourir = (racine: string) => {
    for (const entree of readdirSync(racine)) {
      const chemin = join(racine, entree);
      if (statSync(chemin).isDirectory()) { parcourir(chemin); continue; }
      if (!/\.tsx?$/.test(entree) || /\.test\.tsx?$/.test(entree)) continue;
      const source = readFileSync(chemin, "utf8");
      for (const m of source.matchAll(appel)) vus.add(m[1]);
    }
  };
  parcourir("src");
  return [...vus].sort();
}

const etat = (modeles: ModeleEtat[]): EtatModeles => ({
  complets: 0, total: modeles.length, octetsAPrendre: 0, manquants: [], sansAdresse: [], modeles,
});

const paquet = (id: string, noeuds: string[], octets: number, complet: boolean, partiel = false) =>
  ({ id, nom: id, octets, complet, partiel, telechargeable: true, noeuds });

describe("le manifeste et les nœuds se correspondent", () => {
  it("chaque nœud nommé par le manifeste existe vraiment", () => {
    const connus = new Set(toutesLesFiches.map((f) => f.id));
    const fantomes = noeudsDuManifeste().filter((id) => !connus.has(id));
    expect(fantomes, `identifiants du manifeste qui ne designent aucune fiche : ${fantomes.join(", ")}`)
      .toEqual([]);
  });

  it("chaque nœud à modèle annonce son téléchargement, et aucun autre ne le fait", () => {
    // LA DEUXIÈME MOITIÉ DE L'ASSERTION COMPTE AUTANT QUE LA PREMIÈRE : un nœud qui annonce un
    // paquet dont le manifeste ne le croit pas dépendant resterait muet à l'exécution, puisque
    // l'inventaire ne trouverait rien à son nom.
    expect(noeudsQuiAnnoncent()).toEqual(noeudsDuManifeste());
  });

  it("aucun paquet n'est orphelin de nœud", () => {
    const orphelins = paquets().filter((p) => (p.noeuds ?? []).length === 0).map((p) => p.id);
    expect(orphelins, `paquets sans nœud declare : ${orphelins.join(", ")}`).toEqual([]);
  });
});

describe("ce qui manque a un nœud", () => {
  it("ne dit rien quand tout est la", () => {
    expect(manqueAuNoeud(etat([paquet("p", ["n"], 1000, true)]), "n")).toBeNull();
  });

  it("additionne les paquets manquants du meme nœud", () => {
    // « Séparateur IA » en dépend de trois : c'est la somme qui doit s'afficher, pas la première.
    const e = etat([
      paquet("a", ["separateur-ia"], 260_000_000, false),
      paquet("b", ["separateur-ia"], 170_000_000, false),
      paquet("c", ["separateur-ia"], 33_000_000, true),
      paquet("d", ["autre"], 999, false),
    ]);
    expect(manqueAuNoeud(e, "separateur-ia")).toEqual({ octets: 430_000_000, paquets: ["a", "b"] });
  });

  it("compte un paquet a moitie pris comme absent, puisqu'il se reprend en entier", () => {
    expect(manqueAuNoeud(etat([paquet("p", ["n"], 500, true, true)]), "n"))
      .toEqual({ octets: 500, paquets: ["p"] });
  });

  it("ne dit rien hors de l'application de bureau, ou l'inventaire est absent", () => {
    expect(manqueAuNoeud(null, "n")).toBeNull();
    expect(manqueAuNoeud({ complets: 0, total: 0, octetsAPrendre: 0, manquants: [], sansAdresse: [] }, "n"))
      .toBeNull();
  });
});

describe("le texte affiche", () => {
  it("laisse l'action intacte quand le modele est la", () => {
    expect(texteAvecModele("Génération du son…", etat([paquet("p", ["n"], 10, true)]), "n"))
      .toBe("Génération du son…");
  });

  it("ajoute la note, avec la taille, quand le modele manque", () => {
    const t = texteAvecModele("Génération du son…", etat([paquet("p", ["n"], 1_879_048_192, false)]), "n");
    expect(t).toContain("Génération du son…");
    expect(t).toContain("1,8 Go");
  });

  it("rend la note seule quand le nœud ne dit rien de lui-meme", () => {
    const t = texteAvecModele("", etat([paquet("p", ["n"], 34_603_008, false)]), "n");
    expect(t.startsWith(" ")).toBe(false);
    expect(t).toContain("33 Mo");
  });

  it("ne rend rien du tout quand le nœud se tait et que le modele est la", () => {
    // Émettre cette chaîne vide effaçait la ligne d'état du calcul en cours : deux tests du score
    // esthétique l'ont attrapé, l'un comptant un avancement de trop, l'autre lisant « » au lieu
    // de « A · ». `annoncerModele` n'appelle donc `onProgress` que s'il y a quelque chose à dire.
    expect(texteAvecModele("", etat([paquet("p", ["n"], 10, true)]), "n")).toBe("");
  });
});

describe("annoncerModele n'ecrase pas la ligne d'etat", () => {
  it("se tait quand il n'y a rien a dire", async () => {
    const dits: string[] = [];
    await annoncerModele({ onProgress: (t) => dits.push(t) }, "score-esthetique", "");
    expect(dits).toEqual([]);
  });
});
