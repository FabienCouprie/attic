// src/docs/verbes.test.ts — Les deux verbes du pilotage, et leurs gardes.
//
// POURQUOI UN FICHIER DE TEST SERT DE GUICHET. Le dépôt n'embarque aucun lanceur de TypeScript :
// ses cinq générateurs de tables passent par vitest, pilotés par une variable d'environnement, et
// c'est l'idiome qu'on suit plutôt que d'ajouter une dépendance pour deux commandes.
//
//   npm run decrire              écrit le catalogue en données dans DESCRIPTION.json
//   GRAPHE=… npm run valider     relit un graphe écrit et dit ce qui ne va pas
//
// LES DEUX VERBES QUI MANQUENT, ET POURQUOI ILS NE SONT PAS LÀ. « exécuter » et « relire » demandent
// Web Audio, les ouvriers et le rendu : ils ne tournent pas en Node, et prétendre le contraire
// ferait un pilote qui ment. Ceux-ci n'exécutent rien, et c'est le bon défaut : proposer le graphe,
// savoir s'il tient debout, attendre le Lancer.
//
// LE CODE DE SORTIE PORTE LE VERDICT, et c'est ce qui rend ce guichet utilisable par un script :
// un graphe fautif fait échouer la passe. Le risque est nommé plutôt qu'évité — une passe rouge se
// lit d'ordinaire « le dépôt est cassé » —, et le message du refus le dit en toutes lettres avant
// de rendre le rapport. Un vrai serveur rendrait une structure ; ceci est un guichet.
import "node-web-audio-api/polyfill.js";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { decrireCatalogue, decrireComposant } from "./description";
import { rapportEnTexte, validerGrapheEcrit } from "./assemblage";
import { toutesLesFiches } from "./index";
import "../audio/adaptateur";

const CHEMIN_DESCRIPTION = "DESCRIPTION.json";

describe("décrire", () => {
  it("rend un composant par fiche, et rien que des identifiants", () => {
    const d = decrireCatalogue();
    expect(d.forme).toBe(1);
    expect(d.composants.length).toBe((toutesLesFiches as any[]).length);
    expect(new Set(d.composants.map((c) => c.id)).size).toBe(d.composants.length);
  });

  it("porte les contenus d'un port, qui disent ce qui se branche", () => {
    const c = decrireComposant("texte-vers-midi")!;
    expect(c.entrees[0]).toMatchObject({ nom: "Notation", type: "texte", contenu: "notation" });
    const abc = decrireComposant("midi-vers-abc")!;
    expect(abc.sorties[0]).toMatchObject({ type: "texte", contenu: "abc" });
    // Et le flux qui distingue des contenus les énumère, pour qu'un lecteur sache lesquels existent.
    const texte = decrireCatalogue().flux.find((f) => f.id === "texte")!;
    expect(texte.contenus).toEqual(["plan", "notation", "abc", "paroles", "prompt"]);
  });

  it("DONNE LES IDENTIFIANTS D'UN CHOIX, jamais ses libellés traduits", () => {
    // C'est la leçon la plus chère du mois : un exécuteur compare un identifiant, et un pilote qui
    // désignerait une option par son libellé français écrirait des graphes qui ne font rien.
    const banque = decrireComposant("banque-clavier")!;
    const compter = banque.reglages.find((r) => r.nom === "Compter en")!;
    expect(compter.options).toEqual(["demi-tons", "degres"]);
  });

  it("borne les réglages numériques, pour qu'une valeur écrite à la main tienne", () => {
    const iso = decrireComposant("clavier-isomorphe")!;
    const tonique = iso.reglages.find((r) => r.nom === "Tonique")!;
    expect([tonique.min, tonique.max, tonique.defaut]).toEqual([24, 96, 60]);
  });

  it("n'emporte aucune notice, et reste donc petit devant le catalogue lu", () => {
    const d = decrireCatalogue();
    // LE CHAMP, ET NON LE MOT : « notice » paraît légitimement dans le résumé de quelques
    // composants, et chercher la chaîne faisait tomber ce cas sur une phrase juste.
    const avecNotice = d.composants.filter((c) => "notice" in c || "noticeEn" in c).map((c) => c.id);
    expect(avecNotice).toEqual([]);
    // `COMPONENTS.md` pèse ses notices ; celle-ci ne doit pas s'en approcher, sans quoi elle
    // n'aurait aucune raison d'exister à côté.
    const taille = JSON.stringify(d).length;
    if (existsSync("COMPONENTS.md")) {
      expect(taille).toBeLessThan(readFileSync("COMPONENTS.md", "utf8").length / 2);
    }
    if (process.env.ECRIRE_DESCRIPTION) {
      writeFileSync(CHEMIN_DESCRIPTION, JSON.stringify(d, null, 1) + "\n", "utf8");
    }
  });
});

describe("valider", () => {
  const noeud = (id: string, ficheId: string) => ({ id, data: { ficheId, parametres: {} } });
  const arete = (id: string, s: string, t: string, so = "out:0", ta = "in:0") =>
    ({ id, source: s, target: t, sourceHandle: so, targetHandle: ta });

  it("RELIT LE CÂBLE QUI A OUVERT CE CHANTIER, et le refuse avant tout rendu", () => {
    // « Composer un plan » rend un plan, « Texte → MIDI » attend une notation : licite au
    // transport, et rendant zéro note.
    const r = validerGrapheEcrit({
      nodes: [noeud("a", "composer-plan"), noeud("b", "texte-vers-midi")] as never,
      edges: [arete("e1", "a", "b")] as never,
    });
    expect(r.problemes.some((p) => /texte:plan → texte:notation/.test(p.quoi))).toBe(true);
  });

  it("laisse passer le même câble entre deux contenus qui s'accordent", () => {
    const r = validerGrapheEcrit({
      nodes: [noeud("a", "composer-plan"), noeud("b", "rendre-chanson")] as never,
      edges: [arete("e1", "a", "b")] as never,
    });
    expect(r.problemes.filter((p) => /connexion illégale/.test(p.quoi))).toEqual([]);
  });

  it("nomme les fiches qu'il ne connaît pas, au lieu de se taire", () => {
    const r = validerGrapheEcrit({
      nodes: [noeud("a", "composant-qui-n-existe-pas")] as never, edges: [],
    });
    expect(r.fichesInconnues).toEqual(["composant-qui-n-existe-pas"]);
  });

  it("signale une entrée obligatoire laissée en l'air", () => {
    const r = validerGrapheEcrit({ nodes: [noeud("b", "texte-vers-midi"), noeud("c", "sortie-audio")] as never, edges: [] });
    expect(r.problemes.some((p) => p.ou === "c" && /obligatoire/.test(p.quoi))).toBe(true);
  });

  it("et rend un rapport lisible, qui dit son compte même quand tout va", () => {
    const r = validerGrapheEcrit({ nodes: [], edges: [] });
    expect(rapportEnTexte(r)).toContain("rien à signaler");
    expect(rapportEnTexte(r)).toContain("0 nœuds");
  });

  it("relit le graphe que la variable d'environnement désigne, et tombe s'il est fautif", () => {
    const chemin = process.env.GRAPHE;
    if (!chemin) return; // sans graphe désigné, ce cas n'a rien à relire : c'est le guichet.
    const r = validerGrapheEcrit(JSON.parse(readFileSync(chemin, "utf8")));
    const rapport = rapportEnTexte(r);
    // LE RAPPORT S'ÉCRIT AVANT LE VERDICT, et il le faut : un refus l'interrompt, et c'est
    // justement le cas où l'on veut relire le détail sur le disque.
    writeFileSync("VALIDATION.txt", `${chemin}\n${rapport}\n`, "utf8");
    const combien = r.fichesInconnues.length + r.problemes.length;
    expect(combien, [
      "", "", "CE N'EST PAS LE DÉPÔT QUI EST EN FAUTE, C'EST LE GRAPHE RELU.", "",
      chemin, rapport, "",
    ].join("\n")).toBe(0);
  });
});
