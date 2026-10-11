// plugins/modulation-ports.test.ts — Les ports de modulation, tenus contre le registre vivant.
//
// CE QUE CES TESTS EMPÊCHENT. Un port de modulation nomme le paramètre qu'il pilote, par une
// chaîne de caractères. Une faute de frappe — un accent oublié, un nom changé plus tard dans la
// fiche — ne casse rien visiblement : le port reste branchable, le son sort, et l'inspecteur se
// contente de ne jamais montrer la plage. Le réglage d'origine continue alors d'être affiché comme
// vivant alors qu'une courbe le pilote, c'est-à-dire exactement le mensonge qu'on vient de
// corriger, rétabli en silence.
//
// On vérifie donc que chaque cible existe, que ses bornes existent, et que les deux déclarations —
// celle du port et celle des bornes — désignent bien le même paramètre.
import { describe, expect, it } from "vitest";
import { registre } from "../audio/adaptateur";
import { toutesLesFiches } from "./index";

const portsDeModulation = () =>
  toutesLesFiches.flatMap((f: any) =>
    (f.entrees ?? [])
      .map((port: any, rang: number) => ({ fiche: f, port, rang }))
      .filter((x: any) => x.port.type === "courbe" && x.port.module));

describe("les ports de modulation", () => {
  it("il y en a, et ils sont sur des ports de type courbe", () => {
    const ports = portsDeModulation();
    expect(ports.length).toBeGreaterThanOrEqual(9);
    for (const { port } of ports) expect(port.type).toBe("courbe");
  });

  it("CHAQUE PORT NOMME UN PARAMÈTRE QUI EXISTE — sinon l'inspecteur ne montrerait jamais la plage", () => {
    for (const { fiche, port } of portsDeModulation()) {
      const noms = fiche.parametres.map((p: any) => p.nom);
      expect(noms, `${fiche.id} · port « ${port.nom} »`).toContain(port.module);
    }
  });

  it("CHAQUE CIBLE A SES DEUX BORNES, et elles la désignent en retour", () => {
    for (const { fiche, port } of portsDeModulation()) {
      const bornes = fiche.parametres.filter((p: any) => p.modulationDe === port.module);
      expect(bornes.length, `${fiche.id} · ${port.module}`).toBe(2);
      // Un minimum et un maximum, pas deux fois le même.
      const min = bornes.filter((b: any) => /min/i.test(b.nom));
      expect(min.length, `${fiche.id} · ${port.module}`).toBe(1);
    }
  });

  it("une borne ne pointe jamais vers un paramètre absent de sa fiche", () => {
    for (const f of toutesLesFiches as any[]) {
      const noms = f.parametres.map((p: any) => p.nom);
      for (const p of f.parametres) {
        if (!p.modulationDe) continue;
        expect(noms, `${f.id} · borne « ${p.nom} »`).toContain(p.modulationDe);
      }
    }
  });

  it("une borne ne se borne pas elle-même", () => {
    for (const f of toutesLesFiches as any[]) {
      for (const p of f.parametres) {
        if (p.modulationDe) expect(p.modulationDe, `${f.id} · ${p.nom}`).not.toBe(p.nom);
      }
    }
  });

  it("LE PORT ET SES BORNES SONT TOUJOURS DÉCLARÉS ENSEMBLE, dans les deux sens", () => {
    // Des bornes sans port ne se montreraient jamais ; un port sans bornes n'aurait rien à régler.
    for (const f of toutesLesFiches as any[]) {
      const cibles = new Set((f.parametres as any[]).filter((p) => p.modulationDe).map((p) => p.modulationDe));
      const pilotes = new Set((f.entrees as any[]).filter((e) => e.module).map((e) => e.module));
      // Deux exceptions assumées : le wah-wah et le vibrato pilotent sans bornes dédiées — le
      // premier balaie entre deux réglages qui valent aussi sans courbe, le second travaille dans
      // la plage que « Profondeur » fixe déjà.
      if (["wahwah", "vibrato"].includes(f.id)) continue;
      expect([...cibles].sort(), `${f.id} : bornes sans port`).toEqual([...pilotes].sort());
    }
  });

  it("DEUX PORTS D'UN MÊME NŒUD NE PILOTENT PAS LE MÊME PARAMÈTRE", () => {
    // Deux courbes sur un seul réglage : rien ne dirait laquelle l'emporte.
    for (const f of toutesLesFiches as any[]) {
      const pilotes = (f.entrees as any[]).filter((e) => e.module).map((e) => e.module);
      expect(new Set(pilotes).size, f.id).toBe(pilotes.length);
    }
  });

  it("UN NŒUD PEUT EN PILOTER PLUSIEURS, et « Filtre + réponse » le prouve", () => {
    // C'était la limite de la première version : un port, donc un seul paramètre. Un vrai wah
    // déplace sa coupure ET sa résonance, et deux filtres en série ne le reproduisent pas.
    const filtre: any = registre.trouverDef("reponse-filtre");
    const pilotes = filtre.entrees.filter((e: any) => e.module).map((e: any) => e.module);
    expect(pilotes).toEqual(["Fréquence de coupure", "Résonance"]);
    // Et les deux ports sont optionnels : un graphe qui n'en branche aucun reste valide.
    for (const e of filtre.entrees.filter((x: any) => x.module)) expect(e.requis).toBe(false);
  });

  it("L'AUDIO RESTE LE PREMIER PORT — les ports se désignent par leur rang", () => {
    // Insérer un port de modulation ailleurs qu'en fin de liste débrancherait l'audio de tous les
    // graphes déjà enregistrés, en silence.
    for (const { fiche, rang } of portsDeModulation()) {
      expect(rang, `${fiche.id}`).toBeGreaterThan(0);
      const avant = fiche.entrees.slice(0, rang);
      expect(avant.some((e: any) => e.type === "audio" || e.type === "courbe"), fiche.id).toBe(true);
    }
  });

  it("UNE BORNE NE DÉPASSE JAMAIS LA COURSE DU RÉGLAGE QU'ELLE BORNE", () => {
    // UNE BORNE DIT CE QUE VAUT LE ZÉRO OU LE UN D'UNE COURBE, dans l'unité du réglage. Plus
    // ÉTROITE que son réglage, elle est légitime et c'est même une intention écrite : le limiteur
    // le dit de son relâchement, « une plage de trois décades est là pour que chacun trouve son
    // réglage, non pour qu'une courbe la parcoure d'un bout à l'autre ».
    //
    // PLUS LARGE, C'EST UNE CONTRADICTION : la courbe demande alors une valeur que le réglage ne
    // peut pas prendre, et l'écran montre deux courses qui se contredisent. DOUZE bornes sur six
    // réglages étaient dans ce cas, et chacune a demandé de décider laquelle des deux avait
    // raison : cinq fois la borne, une fois le réglage. Les raisons sont écrites à côté de chaque
    // déclaration, et c'est la documentation de chaque réglage qui a tranché.
    const hors: string[] = [];
    for (const f of toutesLesFiches as any[]) {
      for (const b of f.parametres ?? []) {
        if (!b.modulationDe || !b.plage) continue;
        const cible = (f.parametres ?? []).find((p: any) => p.nom === b.modulationDe);
        if (!cible?.plage) continue;
        if (b.plage[0] < cible.plage[0] || b.plage[1] > cible.plage[1]) {
          hors.push(`${f.id} · ${b.nom} : borne de ${b.plage[0]} à ${b.plage[1]},`
            + ` réglage de ${cible.plage[0]} à ${cible.plage[1]}`);
        }
      }
    }
    expect(hors, hors.length === 0 ? "" :
      `${hors.length} borne(s) dépassent la course de leur réglage :\n  ${hors.join("\n  ")}`)
      .toEqual([]);
  });

  it("ET SES DEUX DÉFAUTS TIENNENT DANS SA PROPRE COURSE", () => {
    // Un défaut hors course se voit mal : le curseur l'affiche écrêté, et la valeur lue au run
    // reste celle d'avant jusqu'à ce qu'on y touche.
    const hors: string[] = [];
    for (const f of toutesLesFiches as any[]) {
      for (const b of f.parametres ?? []) {
        if (!b.modulationDe || !b.plage || typeof b.defaut !== "number") continue;
        if (b.defaut < b.plage[0] || b.defaut > b.plage[1]) {
          hors.push(`${f.id} · ${b.nom} : défaut ${b.defaut} hors de ${b.plage[0]}-${b.plage[1]}`);
        }
      }
    }
    expect(hors, hors.length === 0 ? "" :
      `${hors.length} borne(s) ont un défaut hors de leur course :\n  ${hors.join("\n  ")}`)
      .toEqual([]);
  });

  it("UNE BORNE SE RÈGLE : son curseur offre assez de positions pour qu'on l'atteigne", () => {
    // CE QUE CE GARDE CHERCHE, ET POURQUOI IL NE CHERCHE PAS LE PAS. Une borne plus grossière que
    // le réglage qu'elle borne n'est pas fautive en soi : trente-quatre le sont, et la plupart
    // offrent de dix à deux cents positions, ce qui se règle très bien. Ce qui est fautif, c'est
    // le NOMBRE DE POSITIONS qu'un curseur de borne laisse atteindre, et c'est lui qu'on compte.
    //
    // LE SEUIL EST MESURÉ, NON CHOISI. Relevé sur les deux cent quatre-vingt-dix bornes du
    // catalogue, l'écart est franc : six d'entre elles n'offraient qu'UNE ou DEUX positions, et la
    // suivante en offre DIX. Huit tombe donc dans le vide entre les deux. Les six étaient les
    // bornes en secondes de l'attaque et du relâchement du ducking et de la chute de la
    // réverbération hachée : `bornesModulation` pose un pas de un par défaut, ce qui convient à un
    // pour cent et à rien qui se compte en millièmes de seconde.
    const MINIMUM = 8;
    const pauvres: string[] = [];
    for (const f of toutesLesFiches as any[]) {
      for (const b of f.parametres ?? []) {
        if (!b.modulationDe || !b.plage) continue;
        const pas = b.pas ?? 1;
        const positions = Math.floor((b.plage[1] - b.plage[0]) / pas) + 1;
        if (positions < MINIMUM) {
          pauvres.push(`${f.id} · ${b.nom} : ${positions} position(s)`
            + ` sur une plage de ${b.plage[0]} à ${b.plage[1]} au pas de ${pas}`);
        }
      }
    }
    expect(pauvres, pauvres.length === 0 ? "" :
      `${pauvres.length} borne(s) ne se règlent pas :\n  ${pauvres.join("\n  ")}`).toEqual([]);
  });
});
