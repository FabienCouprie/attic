// plugins/boucle-terminaison.test.ts — Le moteur de boucle s'arrête-t-il, toujours ?
//
// POURQUOI CE FICHIER EXISTE, ET POURQUOI IL EST SÉVÈRE. Les trois répétitions plus anciennes du
// dépôt — le dépliage de boucle, l'instrument, le lot — comptent leurs tours AVANT de commencer :
// un réglage borné les décide, et il n'y a rien à prouver. La quatrième ne le peut pas. Une boucle
// par voix fait un tour par voix, une boucle par créneau un tour par créneau, et ce compte n'est
// connu qu'APRÈS une première passe, puisqu'il vient des données. Le pilote avance donc à l'aveugle,
// et une mécanique qui avance à l'aveugle doit prouver qu'elle s'arrête.
//
// CE QUI FIGERAIT L'APPLICATION. Chaque passe est une exécution du graphe entier. Un compteur qui ne
// se terminerait pas ne rendrait pas une mauvaise réponse : il ne rendrait aucune réponse, la
// fenêtre cesserait de répondre, et le travail en cours serait perdu. C'est la raison pour laquelle
// les cas éprouvés ici sont les cas TORDUS — des morceaux qui grandissent d'un tour à l'autre, un
// nombre de tours absurde venu d'un fichier, trois boucles emboîtées — et non le cas courant.
import { describe, expect, it } from "vitest";

import type { Sequence } from "../audio/sequence";
import { ancetres, descendants } from "../core/graphe";
import type { AreteG } from "../core/meta";

import {
  avancerBoucles, FICHE_BOUCLE_DEBUT, FICHE_BOUCLE_FIN, FICHE_CRENEAU_DEBUT, FICHE_CRENEAU_FIN,
  PASSES_MAX_BOUCLE, PASSES_MAX_TOTAL, planifierBoucles, type BoucleCourante,
} from "./boucleSequencesGlobal";

const seq = (n: number): Sequence => ({ notes: [], titre: `m${n}` });

const etat = (debutId: string, combien: number): BoucleCourante => ({
  debutId, finsIds: [`${debutId}-fin`], index: 0,
  morceaux: Array.from({ length: combien }, (_, i) => seq(i)),
  recoltes: [],
});

/** Déroule le compteur jusqu'au bout, et rend le nombre de tours faits. Borné pour ne pas figer. */
function toursJusquAuBout(etats: BoucleCourante[], plafond = 100_000): number {
  let tours = 1;
  while (avancerBoucles(etats)) {
    tours++;
    if (tours > plafond) throw new Error("le compteur ne s'est pas arrêté");
  }
  return tours;
}

describe("le compteur de passes s'arrête", () => {
  it("SANS BOUCLE, IL NE FAIT RIEN : une passe, et pas une de plus", () => {
    expect(avancerBoucles([])).toBe(false);
    expect(toursJusquAuBout([])).toBe(1);
  });

  it("une boucle de n morceaux fait exactement n tours", () => {
    for (const n of [1, 2, 3, 7, 31]) {
      expect(toursJusquAuBout([etat("a", n)]), `${n} morceaux`).toBe(n);
    }
  });

  it("une boucle sans morceau découvert ne fait que la passe de découverte", () => {
    // La découverte n'a rien trouvé : il n'y a rien à parcourir, et surtout rien à répéter.
    expect(toursJusquAuBout([etat("a", 0)])).toBe(1);
  });

  it("DEUX BOUCLES EMBOÎTÉES FONT LE PRODUIT, et l'intérieure tourne la première", () => {
    const etats = [etat("dehors", 3), etat("dedans", 4)];
    const vus: string[] = [];
    vus.push(`${etats[0].index}${etats[1].index}`);
    while (avancerBoucles(etats)) {
      // L'intérieure est redécouverte à chaque tour de l'extérieure : on la regarnit, comme le fait
      // le nœud de début pendant la passe.
      if (etats[1].morceaux.length === 0) etats[1].morceaux = [seq(0), seq(1), seq(2), seq(3)];
      vus.push(`${etats[0].index}${etats[1].index}`);
    }
    expect(vus).toHaveLength(12);
    expect(vus.slice(0, 5)).toEqual(["00", "01", "02", "03", "10"]);
    expect(vus[vus.length - 1]).toBe("23");
  });

  it("TROIS BOUCLES EMBOÎTÉES S'ARRÊTENT AUSSI, et le compteur ne se perd pas", () => {
    const etats = [etat("a", 2), etat("b", 2), etat("c", 2)];
    let tours = 1;
    while (avancerBoucles(etats)) {
      if (etats[1].morceaux.length === 0) etats[1].morceaux = [seq(0), seq(1)];
      if (etats[2].morceaux.length === 0) etats[2].morceaux = [seq(0), seq(1)];
      tours++;
      if (tours > 1000) throw new Error("le compteur ne s'est pas arrêté");
    }
    expect(tours).toBe(8);
  });
});

describe("les bornes, et ce qu'elles arrêtent", () => {
  it("UN NOMBRE DE MORCEAUX ABSURDE EST BORNÉ, et ne vient pas d'un réglage qu'on surveille", () => {
    // Le compte vient des données : un fichier qui déclarerait dix mille voix ferait dix mille
    // exécutions du graphe entier. La borne par boucle vaut le budget entier depuis que le nombre
    // de tours est un champ ouvert, et c'est elle qui arrête le compteur.
    expect(toursJusquAuBout([etat("a", 10_000)])).toBe(PASSES_MAX_BOUCLE);
  });

  it("LA BORNE PAR BOUCLE NE SUFFIT PAS QUAND ELLES S'EMBOÎTENT, et c'est pourquoi l'autre existe", () => {
    // Deux boucles de trente-deux feraient 32 × 32 = 1024 exécutions du graphe entier, soit quatre
    // fois le total permis. Le compteur les produit bel et bien : c'est le pilote qui s'arrête à
    // `PASSES_MAX_TOTAL`, et ce cas dit pourquoi cette seconde borne n'est pas redondante. Les
    // comptes sont écrits ici plutôt que pris de la borne par boucle : celle-ci vaut le budget
    // entier depuis que le nombre de tours est un champ ouvert, et deux fois le budget ferait
    // soixante-cinq mille tours de compteur pour la même démonstration.
    const CHACUNE = 32;
    const etats = [etat("a", CHACUNE), etat("b", CHACUNE)];
    let tours = 1;
    while (avancerBoucles(etats)) {
      if (etats[1].morceaux.length === 0) {
        etats[1].morceaux = Array.from({ length: CHACUNE }, (_, i) => seq(i));
      }
      tours++;
      if (tours > 5000) throw new Error("le compteur ne s'est pas arrêté");
    }
    expect(tours).toBe(CHACUNE * CHACUNE);
    expect(tours).toBeGreaterThan(PASSES_MAX_TOTAL);
  });

  it("DES MORCEAUX QUI GRANDISSENT À CHAQUE TOUR NE REPOUSSENT PAS LA FIN", () => {
    // Le cas qui ferait boucler sans fin une mécanique naïve : la chaîne rend un morceau de plus à
    // chaque passe, si bien que la condition d'arrêt recule aussi vite qu'on l'approche. La borne
    // est prise sur le compte du moment, donc le nombre d'états reste fini.
    const e = etat("a", 2);
    let tours = 1;
    while (avancerBoucles([e])) {
      e.morceaux.push(seq(e.morceaux.length));
      tours++;
      if (tours > 1000) throw new Error("le compteur ne s'est pas arrêté");
    }
    expect(tours).toBe(PASSES_MAX_BOUCLE);
  });

  it("UN RANG NÉGATIF NE DONNE PAS DE TOURS EN PLUS, et c'était le cas avant ce test", () => {
    // Relevé en écrivant ce fichier : à moins cinq sur une boucle sans morceau, le compteur rendait
    // « oui » cinq fois de suite — cinq exécutions du graphe entier pour une boucle vide. Aucun
    // chemin d'aujourd'hui ne pose un rang négatif, et c'est bien pour cela que rien ne le disait.
    expect(toursJusquAuBout([{ ...etat("a", 0), index: -5 }])).toBe(1);
    expect(toursJusquAuBout([{ ...etat("a", 3), index: -5 }])).toBe(3);
  });

  it("un rang fractionnaire est ramené au tour entier, et ne décale pas le compte", () => {
    expect(toursJusquAuBout([{ ...etat("a", 4), index: 1.5 }])).toBe(3);
  });
});

describe("le planificateur devant un graphe cyclique", () => {
  // CE N'EST PLUS CENSÉ ARRIVER, la pose d'une arête refusant de refermer un cycle. Un projet
  // enregistré avant ce contrôle peut pourtant en porter un, et le planificateur descend et remonte
  // le graphe : il doit rendre la main, et non figer la fenêtre avant même la première passe.
  const a = (source: string, target: string): AreteG =>
    ({ id: `${source}-${target}`, source, target, sourceHandle: "out:0", targetHandle: "in:0" });

  const noeud = (id: string, ficheId: string) => ({ id, data: { ficheId } });

  it("RÉPOND SUR UN CYCLE au lieu de s'y perdre", () => {
    const graphe = [
      noeud("d", FICHE_BOUCLE_DEBUT), noeud("x", "gain"), noeud("y", "gain"),
      noeud("f", FICHE_BOUCLE_FIN),
    ];
    // d → x → y → x : le corps de la boucle se referme sur lui-même.
    const aretes = [a("d", "x"), a("x", "y"), a("y", "x"), a("y", "f")];
    const plan = planifierBoucles(
      graphe, (id) => [...descendants(id, aretes)], (id) => [...ancetres(id, aretes)],
    );
    expect(plan).not.toBeNull();
    expect(plan!.boucles.map((b) => b.debutId)).toEqual(["d"]);
    expect(plan!.boucles[0].finsIds).toEqual(["f"]);
  });

  it("répond aussi quand le cycle passe par les deux bouts de la boucle", () => {
    const graphe = [noeud("d", FICHE_CRENEAU_DEBUT), noeud("f", FICHE_CRENEAU_FIN)];
    const aretes = [a("d", "f"), a("f", "d")];
    const plan = planifierBoucles(
      graphe, (id) => [...descendants(id, aretes)], (id) => [...ancetres(id, aretes)],
    );
    expect(plan).not.toBeNull();
    expect(plan!.boucles[0].debutId).toBe("d");
  });

  it("DEUX BOUCLES QUI SE CONTIENNENT L'UNE L'AUTRE NE FONT PAS TOURNER LE TRI", () => {
    // Le comparateur répondrait « oui » dans les deux sens. Un tri n'y perd pas la main, mais
    // l'ordre en serait arbitraire : ce test fige le fait qu'on en ressort, et avec les deux boucles.
    const graphe = [
      noeud("d1", FICHE_CRENEAU_DEBUT), noeud("d2", FICHE_CRENEAU_DEBUT),
      noeud("f1", FICHE_CRENEAU_FIN), noeud("f2", FICHE_CRENEAU_FIN),
    ];
    const aretes = [a("d1", "d2"), a("d2", "d1"), a("d1", "f1"), a("d2", "f2"), a("f1", "f2"), a("f2", "f1")];
    const plan = planifierBoucles(
      graphe, (id) => [...descendants(id, aretes)], (id) => [...ancetres(id, aretes)],
    );
    expect(plan!.boucles.map((b) => b.debutId).sort()).toEqual(["d1", "d2"]);
  });
});
