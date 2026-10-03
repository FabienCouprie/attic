// audio/montage-morceaux.test.ts — Ce qu'une coupe, un déplacement et un collage doivent conserver.
//
// CE QUE CES CAS TIENNENT. Le montage sait désormais porter plusieurs morceaux par piste, chacun
// avec un endroit où il commence dans le son et une durée. Deux choses ne se vérifient pas à
// l'oreille et se vérifient ici : qu'une coupe ne perde ni n'ajoute rien, et qu'un graphe enregistré
// avant les morceaux sonne exactement comme avant.
//
// LA COUPE EST L'OPÉRATION DÉLICATE, parce qu'elle touche aux DEUX repères à la fois : l'instant sur
// la ligne de temps et l'endroit dans le son. Se tromper d'un seul des deux donne une coupe qu'on
// entend, et une coupe qu'on entend sur une pièce de cinquante secondes ne se distingue pas d'un
// défaut du son lui-même.
import { describe, expect, it } from "vitest";
import {
  appliquerGeste, collerMorceaux, couperA, couperMorceau, deplacerMorceau, dureeSonnante,
  etendueDesMorceaux, morceauA, morceauxAEcrire, morceauxCompletes, morceauxDepuisParametres,
  normaliserMorceau, nouvelId,
  remplacerMorceau, retirerMorceau, type Morceau,
} from "./montage-morceaux";

const M = (p: Partial<Morceau> = {}): Morceau => ({
  id: "m1", piste: 0, debut: 0, dans: 0, duree: 0, gain: 0, entree: 10, sortie: 10, ...p,
});

describe("ce qu'un morceau fait sonner", () => {
  it("une duree a zero veut dire tout ce qui reste du son", () => {
    expect(dureeSonnante(M(), 8)).toBe(8);
    expect(dureeSonnante(M({ dans: 3 }), 8)).toBe(5);
  });

  it("une duree posee ne depasse jamais ce qui reste", () => {
    expect(dureeSonnante(M({ dans: 6, duree: 5 }), 8)).toBe(2);
    expect(dureeSonnante(M({ duree: 3 }), 8)).toBe(3);
  });

  it("un morceau qui commence apres la fin du son ne sonne pas, et rend zero", () => {
    expect(dureeSonnante(M({ dans: 12 }), 8)).toBe(0);
    expect(dureeSonnante(M({ dans: 12, duree: 4 }), 8)).toBe(0);
  });
});

describe("la coupe ne perd ni n'ajoute rien", () => {
  const source = 8;

  it("LES DEUX MORCEAUX SE SUIVENT SANS TROU NI RECOUVREMENT", () => {
    const [a, b] = couperMorceau(M({ debut: 2 }), 5, source);
    expect(a.debut).toBe(2);
    expect(a.duree).toBe(3);
    expect(b.debut).toBe(5);                       // la ou le premier s'arrete
    expect(a.debut + dureeSonnante(a, source)).toBe(b.debut);
  });

  it("ET LE SECOND REPREND DANS LE SON LA OU LE PREMIER L'A LAISSE, seule coupe qu'on n'entend pas", () => {
    const [a, b] = couperMorceau(M({ debut: 2, dans: 1 }), 5, source);
    expect(a.dans).toBe(1);
    expect(b.dans).toBe(1 + 3);                    // le dans d'origine, plus ce que le premier a joue
  });

  it("LA SOMME DE CE QUI SONNE EST CONSERVEE, sur toute coupe interieure", () => {
    const m = M({ debut: 2, dans: 1.5 });
    const avant = dureeSonnante(m, source);
    for (const t of [2.01, 3, 4.25, 5, 7, 8.4]) {
      const deux = couperMorceau(m, t, source);
      expect(deux.length, `coupe a ${t}`).toBe(2);
      const apres = deux.reduce((s, x) => s + dureeSonnante(x, source), 0);
      expect(apres, `coupe a ${t}`).toBeCloseTo(avant, 9);
    }
  });

  it("couper au bord ou au dehors ne coupe rien, et ne fabrique pas de morceau vide", () => {
    const m = M({ debut: 2 });
    for (const t of [-1, 2, 10, 10.5]) expect(couperMorceau(m, t, source), `a ${t}`).toEqual([m]);
  });

  it("une coupe se recoupe, et la somme tient encore", () => {
    const m = M({ debut: 0 });
    const [a, b] = couperMorceau(m, 3, source);
    const [b1, b2] = couperMorceau(b, 6, source);
    expect([a, b1, b2].reduce((s, x) => s + dureeSonnante(x, source), 0)).toBeCloseTo(source, 9);
    expect(b1.dans).toBe(3);
    expect(b2.dans).toBe(6);
  });
});

describe("la coupe a la tete de lecture", () => {
  const duree = () => 8;

  it("tombe sur TOUT ce que l'instant traverse, et sur rien d'autre", () => {
    const morceaux = [
      M({ id: "a", piste: 0, debut: 0 }),          // 0 -> 8, traverse
      M({ id: "b", piste: 1, debut: 6 }),          // 6 -> 14, traverse
      M({ id: "c", piste: 2, debut: 20 }),         // 20 -> 28, non
    ];
    const apres = couperA(morceaux, 7, duree);
    expect(apres.length).toBe(5);                  // deux coupes, un intact
    expect(apres.filter((m) => m.piste === 2).length).toBe(1);
  });

  it("ET AUCUN IDENTIFIANT N'EST EN DOUBLE, sans quoi la selection en designerait deux", () => {
    const morceaux = [M({ id: "a", piste: 0, debut: 0 }), M({ id: "a-b", piste: 1, debut: 0 })];
    const apres = couperA(morceaux, 4, duree);
    expect(new Set(apres.map((m) => m.id)).size).toBe(apres.length);
  });
});

describe("le morceau qu'un instant designe", () => {
  const duree = () => 8;
  const morceaux = [M({ id: "a", piste: 0, debut: 0, duree: 4 }), M({ id: "b", piste: 0, debut: 4, duree: 4 })];

  it("se trouve par sa piste et son instant", () => {
    expect(morceauA(morceaux, 0, 1, duree)?.id).toBe("a");
    expect(morceauA(morceaux, 0, 5, duree)?.id).toBe("b");
  });

  it("le bord droit appartient au suivant, et non aux deux", () => {
    expect(morceauA(morceaux, 0, 4, duree)?.id).toBe("b");
  });

  it("rien avant, rien apres, rien sur une piste vide", () => {
    expect(morceauA(morceaux, 0, -1, duree)).toBeNull();
    expect(morceauA(morceaux, 0, 9, duree)).toBeNull();
    expect(morceauA(morceaux, 3, 1, duree)).toBeNull();
  });

  it("LE DERNIER POSE L'EMPORTE quand deux se recouvrent, car c'est celui qu'on voit", () => {
    const deux = [M({ id: "dessous", piste: 0, debut: 0, duree: 8 }), M({ id: "dessus", piste: 0, debut: 2, duree: 2 })];
    expect(morceauA(deux, 0, 3, duree)?.id).toBe("dessus");
  });
});

describe("copier et coller", () => {
  it("LE COLLAGE GARDE LES ECARTS DU GROUPE, et ne l'empile pas sur un point", () => {
    const presse = [M({ id: "a", debut: 10 }), M({ id: "b", debut: 13 }), M({ id: "c", debut: 11.5 })];
    const colles = collerMorceaux(presse, 100, []);
    const par = (id: string) => colles[presse.findIndex((m) => m.id === id)].debut;
    expect(par("a")).toBe(100);                    // le plus precoce arrive sur l'instant
    expect(par("b")).toBe(103);
    expect(par("c")).toBe(101.5);
  });

  it("ET CHAQUE MORCEAU COLLE RECOIT UN IDENTIFIANT NEUF", () => {
    const existants = [M({ id: "m1" }), M({ id: "m2" })];
    const colles = collerMorceaux([M({ id: "m1" }), M({ id: "m2" })], 0, existants);
    const tous = [...existants, ...colles];
    expect(new Set(tous.map((m) => m.id)).size).toBe(tous.length);
  });

  it("coller ce qu'on n'a pas copie ne pose rien", () => {
    expect(collerMorceaux([], 5, [])).toEqual([]);
  });

  it("un identifiant neuf ne heurte jamais les anciens", () => {
    expect(nouvelId([M({ id: "m1" }), M({ id: "m2" })])).toBe("m3");
    expect(nouvelId([])).toBe("m1");
  });

  it("deplacer ne touche pas a ce que le morceau joue du son", () => {
    const m = M({ debut: 2, dans: 1, duree: 3 });
    const d = deplacerMorceau(m, 40);
    expect(d.debut).toBe(40);
    expect({ dans: d.dans, duree: d.duree }).toEqual({ dans: 1, duree: 3 });
  });
});

describe("un graphe enregistre avant les morceaux", () => {
  it("SONNE EXACTEMENT COMME AVANT : un morceau par piste branchee, le son entier", () => {
    const params = {
      "Début 1": 0, "Gain 1": -3, "Fondu entrée 1": 20, "Fondu sortie 1": 30,
      "Début 3": 5.5, "Gain 3": 2,
    };
    const m = morceauxDepuisParametres([0, 2], params);
    expect(m.length).toBe(2);
    expect(m[0]).toEqual({ id: "p0", piste: 0, debut: 0, dans: 0, duree: 0, gain: -3, entree: 20, sortie: 30 });
    // Les reglages absents retombent sur leurs defauts, ceux memes que la fiche declare.
    expect(m[1]).toEqual({ id: "p2", piste: 2, debut: 5.5, dans: 0, duree: 0, gain: 2, entree: 10, sortie: 10 });
  });

  it("et une piste sans reglage prend le debut que la fiche lui donne", () => {
    expect(morceauxDepuisParametres([3], {})[0].debut).toBe(6);   // k * 2
  });

  it("les pistes sortent dans l'ordre, quel que soit l'ordre ou l'on a tire les cables", () => {
    expect(morceauxDepuisParametres([5, 1, 3], {}).map((m) => m.piste)).toEqual([1, 3, 5]);
  });

  it("SES DEFAUTS SONT CEUX QUE LA FICHE DECLARE, et le cas les confronte", async () => {
    // POURQUOI CE CAS EXISTE. La migration doit rendre EXACTEMENT ce que le montage faisait avant
    // elle, donc retomber sur les memes defauts. Ils sont ecrits deux fois : dans la fiche, qui les
    // montre a l'ecran, et ici, qui les applique a un graphe ancien. Deux ecritures derivent, et la
    // derive serait silencieuse : un vieux projet rouvert sonnerait autrement sans que rien ne le
    // dise. Le cas va donc LIRE la fiche plutot que de recopier ses nombres.
    const { toutesLesFiches } = await import("../plugins");
    await import("./adaptateur");
    const fiche = (toutesLesFiches as { id: string; parametres?: { nom: string; defaut?: unknown }[] }[])
      .find((f) => f.id === "montage");
    expect(fiche, "la fiche du montage doit exister").toBeTruthy();
    const declare = (nom: string) => fiche!.parametres?.find((p) => p.nom === nom)?.defaut;

    const m = morceauxDepuisParametres([0], {})[0];
    expect(m.debut).toBe(declare("Début 1"));
    expect(m.gain).toBe(declare("Gain 1"));
    expect(m.entree).toBe(declare("Fondu entrée 1"));
    expect(m.sortie).toBe(declare("Fondu sortie 1"));
    // Et sur une piste plus loin, ou le debut par defaut depend du rang.
    expect(morceauxDepuisParametres([3], {})[0].debut).toBe(declare("Début 4"));
  });
});

describe("l'arithmetique du geste", () => {
  const saisi = M({ debut: 4, dans: 1, duree: 3, entree: 20, sortie: 30 });

  it("tirer le corps deplace, et ne touche a rien d'autre", () => {
    const apres = appliquerGeste(saisi, "corps", 2.5);
    expect(apres.debut).toBe(6.5);
    expect({ dans: apres.dans, duree: apres.duree, entree: apres.entree, sortie: apres.sortie })
      .toEqual({ dans: 1, duree: 3, entree: 20, sortie: 30 });
  });

  it("IL PART TOUJOURS DE L'ETAT DU DEBUT, sans quoi la barre deriverait du pointeur", () => {
    // Deux gestes successifs depuis le meme saisi donnent le meme resultat pour un meme ecart.
    expect(appliquerGeste(saisi, "corps", 1).debut).toBe(5);
    expect(appliquerGeste(saisi, "corps", 1).debut).toBe(5);
  });

  it("le fondu d'entree s'allonge vers la droite", () => {
    expect(appliquerGeste(saisi, "entree", 0.05).entree).toBe(20 + 50);
  });

  it("ET LE FONDU DE SORTIE A REBOURS, sa poignee etant sur le bord droit", () => {
    expect(appliquerGeste(saisi, "sortie", -0.05).sortie).toBe(30 + 50);
  });

  it("aucun fondu ne devient negatif", () => {
    expect(appliquerGeste(saisi, "entree", -10).entree).toBe(0);
    expect(appliquerGeste(saisi, "sortie", 10).sortie).toBe(0);
  });

  it("MAIS LE DEBUT PEUT L'ETRE : un montage a le droit de commencer avant zero", () => {
    expect(appliquerGeste(saisi, "corps", -12).debut).toBe(-8);
  });

  it("remplacer ne touche que le morceau nomme, retirer ne retire que lui", () => {
    const liste = [M({ id: "a" }), M({ id: "b" }), M({ id: "c" })];
    expect(remplacerMorceau(liste, M({ id: "b", debut: 99 })).map((m) => m.debut)).toEqual([0, 99, 0]);
    expect(retirerMorceau(liste, "b").map((m) => m.id)).toEqual(["a", "c"]);
    expect(retirerMorceau(liste, "inconnu").length).toBe(3);
  });
});

describe("l'etendue et les bornes", () => {
  const duree = () => 8;

  it("l'etendue part du plus precoce, meme avant zero", () => {
    expect(etendueDesMorceaux([M({ debut: -3 }), M({ debut: 10 })], duree)).toEqual({ debut: -3, fin: 18 });
  });

  it("sans morceau, elle est nulle plutot qu'infinie", () => {
    expect(etendueDesMorceaux([], duree)).toEqual({ debut: 0, fin: 0 });
  });

  it("UN DANS NEGATIF EST RAMENE A ZERO : le son n'existe pas avant son debut", () => {
    expect(normaliserMorceau(M({ dans: -4 }), 8).dans).toBe(0);
  });

  it("et une duree plus longue que ce qui reste est ramenee", () => {
    expect(normaliserMorceau(M({ dans: 6, duree: 9 }), 8).duree).toBe(2);
  });

  it("MAIS UN DEBUT NEGATIF RESTE PERMIS : le montage peut commencer avant zero", () => {
    expect(normaliserMorceau(M({ debut: -12 }), 8).debut).toBe(-12);
  });
});

describe("les morceaux completes piste par piste", () => {
  // CE QUE CES CAS GARDENT, ET POURQUOI ILS EXISTENT. Les morceaux poses REMPLACAIENT les reglages
  // au lieu de les completer : un seul morceau quelque part rendait muets les reglages de TOUTES les
  // pistes. Releve par Fabien, en quatre symptomes qui n'en faisaient qu'un : une piste branchee
  // apres coup n'apparaissait pas, il semblait falloir reserver les pistes d'avance, les glissieres
  // de gain paraissaient mortes, et les fondus obeissaient a deux systemes sans rapport.
  const params = {
    "Début 1": 0, "Gain 1": -6, "Fondu entrée 1": 50, "Fondu sortie 1": 60,
    "Début 2": 4, "Gain 2": -12, "Fondu entrée 2": 70, "Fondu sortie 2": 80,
    "Début 3": 9, "Gain 3": -18, "Fondu entrée 3": 90, "Fondu sortie 3": 100,
  };

  it("UNE PISTE BRANCHEE APRES COUP RECOIT SON MORCEAU, au lieu de rester invisible", () => {
    const poses = [M({ id: "a", piste: 0, debut: 1 }), M({ id: "b", piste: 1, debut: 5 })];
    const tous = morceauxCompletes(poses, [0, 1, 2], params);
    expect(tous).toHaveLength(3);
    const neuf = tous.find((m) => m.piste === 2)!;
    expect(neuf.debut).toBe(9);
  });

  it("ET IL PREND SES QUATRE REGLAGES, non des valeurs par defaut", () => {
    // Le symptome des glissieres mortes et celui des deux systemes de fondu tiennent a ce seul
    // point : les reglages d'une piste sans morceau doivent la decrire entierement.
    const neuf = morceauxCompletes([M({ piste: 0 })], [0, 2], params).find((m) => m.piste === 2)!;
    expect(neuf.gain).toBe(-18);
    expect(neuf.entree).toBe(90);
    expect(neuf.sortie).toBe(100);
  });

  it("ET LES MORCEAUX POSES NE SONT PAS TOUCHES : ce qu'on a decoupe reste tel quel", () => {
    const poses = [M({ id: "a", piste: 0, debut: 1, gain: -3, duree: 2, dans: 1 })];
    const garde = morceauxCompletes(poses, [0, 1], params).find((m) => m.piste === 0)!;
    expect(garde).toEqual(poses[0]);
  });

  it("ET UNE PISTE QUI PORTE DEJA UN MORCEAU N'EN RECOIT PAS UN SECOND", () => {
    const poses = [M({ id: "a", piste: 0 }), M({ id: "b", piste: 0, debut: 10 })];
    const tous = morceauxCompletes(poses, [0], params);
    expect(tous).toHaveLength(2);
  });

  it("ET LES IDENTIFIANTS NE SE HEURTENT PAS, la selection s'y retrouvant par le nom", () => {
    // Un morceau deduit prenait le nom « p<piste> », que des morceaux poses portent deja.
    const poses = [M({ id: "p1", piste: 0 }), M({ id: "p2", piste: 0, debut: 3 })];
    const tous = morceauxCompletes(poses, [0, 1], params);
    expect(new Set(tous.map((m) => m.id)).size).toBe(tous.length);
  });

  it("ET SANS AUCUN MORCEAU POSE, LE RESULTAT EST CELUI DES REGLAGES SEULS", () => {
    // La migration d'un graphe enregistre avant les morceaux : il doit sonner exactement comme avant.
    const deduits = morceauxDepuisParametres([0, 1], params);
    const completes = morceauxCompletes([], [0, 1], params);
    expect(completes.map((m) => ({ ...m, id: "" }))).toEqual(deduits.map((m) => ({ ...m, id: "" })));
  });

  it("ET UNE PISTE DEBRANCHEE NE FAIT PAS NAITRE DE MORCEAU", () => {
    expect(morceauxCompletes([], [1], params).map((m) => m.piste)).toEqual([1]);
  });
});

describe("ce qu'un geste ECRIT, et ce qu'il laisse sous ses reglages", () => {
  // CE QUE CES CAS GARDENT. Completer la liste a la LECTURE ne suffisait pas : la ligne de temps
  // travaille sur la liste completee, donc elle la REND completee, et le premier geste sur une barre
  // ecrivait un morceau pour CHAQUE piste branchee. Toutes devenaient des pistes decoupees d'un coup,
  // et leurs quatre reglages cessaient d'agir. Releve par Fabien : « dans la table montage modifie,
  // le gain a la lecture ne fonctionne pas ».
  const params = {
    "Début 1": 0, "Gain 1": -6, "Fondu entrée 1": 50, "Fondu sortie 1": 60,
    "Début 2": 4, "Gain 2": -12, "Fondu entrée 2": 70, "Fondu sortie 2": 80,
    "Début 3": 9, "Gain 3": -18, "Fondu entrée 3": 90, "Fondu sortie 3": 100,
  };
  const avecGain2 = (db: number) => ({ ...params, "Gain 2": db });
  const branchees = [0, 1, 2];

  /** Le geste de l'utilisateur, puis ce que le nœud garde : la vue n'en fait pas davantage. */
  const apresGeste = (vus: Morceau[], modifie: Morceau, avant: number[] = []) =>
    morceauxAEcrire(remplacerMorceau(vus, modifie), branchees, params, avant);

  it("UNE PISTE JAMAIS TOUCHEE GARDE SES REGLAGES APRES UN GESTE SUR UNE AUTRE", () => {
    // Le scenario exact : trois pistes, on deplace la premiere barre, puis on tire la glissiere de
    // gain de la DEUXIEME piste. C'est elle qui ne repondait plus.
    const vus = morceauxCompletes([], branchees, params);
    const e = apresGeste(vus, { ...vus[0], debut: 5 });
    const relu = morceauxCompletes(e.morceaux, branchees, avecGain2(-20), e.videes);
    expect(relu.find((m) => m.piste === 1)!.gain).toBe(-20);
    expect(relu.find((m) => m.piste === 2)!.gain).toBe(-18);
  });

  it("ET SEULE LA PISTE TOUCHEE EST ECRITE", () => {
    const vus = morceauxCompletes([], branchees, params);
    const e = apresGeste(vus, { ...vus[0], debut: 5 });
    expect(e.morceaux.map((m) => m.piste)).toEqual([0]);
    expect(e.morceaux[0].debut).toBe(5);
    expect(e.videes).toEqual([]);
  });

  it("ET LA PISTE TOUCHEE, ELLE, NE SUIT PLUS SES REGLAGES : c'est la regle de la notice", () => {
    const vus = morceauxCompletes([], branchees, params);
    const e = apresGeste(vus, { ...vus[0], debut: 5 });
    const relu = morceauxCompletes(e.morceaux, branchees, { ...params, "Début 1": 99 }, e.videes);
    expect(relu.find((m) => m.piste === 0)!.debut).toBe(5);
  });

  it("ET UNE PISTE QUI PORTE DEUX MORCEAUX S'ECRIT ENTIERE", () => {
    const coupes = [M({ id: "a", piste: 1, debut: 4, duree: 2 }), M({ id: "b", piste: 1, debut: 6 })];
    const e = morceauxAEcrire([...coupes, ...morceauxDepuisParametres([0, 2], params)], branchees, params);
    expect(e.morceaux.filter((m) => m.piste === 1)).toHaveLength(2);
    expect(e.morceaux.map((m) => m.piste)).toEqual([1, 1]);
  });

  it("ET UNE PISTE DEBRANCHEE S'ECRIT TOUJOURS, un cable rebranche devant retrouver son decoupage", () => {
    const e = morceauxAEcrire([M({ id: "a", piste: 7, debut: 3 }), ...morceauxDepuisParametres(branchees, params)], branchees, params);
    expect(e.morceaux.map((m) => m.piste)).toEqual([7]);
  });

  it("ET UNE LISTE ENCORE ENTIEREMENT SOUS SES REGLAGES NE S'ECRIT PAS DU TOUT", () => {
    // Un geste repris a son point de depart, ou une simple selection : rien n'a bouge, rien ne se fige.
    const vus = morceauxCompletes([], branchees, params);
    expect(morceauxAEcrire(vus, branchees, params)).toEqual({ morceaux: [], videes: [] });
  });
});

describe("une piste videe reste vide", () => {
  // CE QUE CES CAS GARDENT. Supprimer le dernier morceau d'une piste la laissait absente de ce qui
  // s'ecrit, c'est-a-dire exactement dans l'etat d'une piste jamais touchee : elle se rededuisait de
  // ses reglages au relevé suivant, et le morceau revenait. Releve par Fabien. Une piste sans morceau
  // ne peut pas se dire par un morceau : il faut donc une liste a part.
  const params = {
    "Début 1": 0, "Gain 1": -6, "Fondu entrée 1": 50, "Fondu sortie 1": 60,
    "Début 2": 4, "Gain 2": -12, "Fondu entrée 2": 70, "Fondu sortie 2": 80,
    "Début 3": 9, "Gain 3": -18, "Fondu entrée 3": 90, "Fondu sortie 3": 100,
  };
  const branchees = [0, 1, 2];
  /** La suppression du dernier morceau de la piste 2, telle que la ligne de temps la rend. */
  const apresSuppression = (avant: number[] = []) => {
    const vus = morceauxCompletes([], branchees, params, avant);
    const reste = retirerMorceau(vus, vus.find((m) => m.piste === 2)!.id);
    return morceauxAEcrire(reste, branchees, params, avant);
  };

  it("UN MORCEAU SUPPRIME NE REVIENT PAS", () => {
    const e = apresSuppression();
    expect(e.videes).toEqual([2]);
    expect(morceauxCompletes(e.morceaux, branchees, params, e.videes).map((m) => m.piste)).toEqual([0, 1]);
  });

  it("ET LES AUTRES PISTES GARDENT LEURS REGLAGES : vider n'est pas toucher a tout", () => {
    const e = apresSuppression();
    const relu = morceauxCompletes(e.morceaux, branchees, { ...params, "Gain 2": -30 }, e.videes);
    expect(relu.find((m) => m.piste === 1)!.gain).toBe(-30);
  });

  it("ET REPOSER UN MORCEAU SUR LA PISTE LA REND A SES REGLAGES", () => {
    const e = apresSuppression();
    const colle = [...morceauxCompletes(e.morceaux, branchees, params, e.videes), M({ id: "colle", piste: 2, debut: 1 })];
    const e2 = morceauxAEcrire(colle, branchees, params, e.videes);
    expect(e2.videes).toEqual([]);
    expect(e2.morceaux.map((m) => m.piste)).toEqual([2]);
  });

  it("ET UNE PISTE VIDEE PUIS DEBRANCHEE GARDE SON ETAT", () => {
    // Sans ce report, rebrancher le cable ferait revenir le morceau qu'on avait retire.
    const e = apresSuppression();
    const apresDebranchement = morceauxAEcrire(
      morceauxCompletes(e.morceaux, [0, 1], params, e.videes), [0, 1], params, e.videes,
    );
    expect(apresDebranchement.videes).toEqual([2]);
    expect(morceauxCompletes(apresDebranchement.morceaux, branchees, params, apresDebranchement.videes)
      .map((m) => m.piste)).toEqual([0, 1]);
  });
});
