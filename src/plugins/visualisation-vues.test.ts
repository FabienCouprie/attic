// plugins/visualisation-vues.test.ts — Les réglages que l'exécuteur ne lit pas, et que la vue lit.
//
// POURQUOI UN FICHIER À PART. `analyseur-spectre` et `spectrogramme` sont des passe-plats : leur
// exécuteur rend l'audio reçu et ne touche à aucun de ses deux réglages. « Fenêtre » et « Échelle »
// sont lus par `vues-domaine/vues-analyse.tsx`, qui calcule la représentation. Le garde habituel
// des batteries de ce dépôt — « tout paramètre déclaré est lu par son exécuteur » — est donc
// AVEUGLE par construction sur ces deux fiches : il passerait au vert sur un nœud dont les deux
// boutons ne feraient plus rien.
//
// Ce que les cas ci-dessous tiennent n'est pas un calcul mais une FRONTIÈRE : d'un côté la fiche
// qui déclare, de l'autre la vue qui lit, et entre les deux un accord que rien ne rend visible. Un
// désaccord ne produit ni exception ni message — seulement un nœud qui affiche autre chose que ce
// que sa propre notice promet. D'où un fichier séparé : ces cas n'exercent aucun audio, ils lisent
// le texte de la vue et le comparent à la déclaration, et ils n'ont donc rien à partager avec la
// batterie d'exécution de `visualisation.test.ts`.
//
// LE GARDE CHERCHE UNE FORME, JAMAIS UN NOM : `p["Fenêtre"] ?? "…"` est reconnaissable où que la
// vue soit déplacée ou renommée, et c'est le COMPTE des lecteurs qui est exigé — non leur simple
// présence. La première version se contentait de trouver la chaîne une fois dans le fichier ;
// planté, le défaut est passé, parce que l'autre vue la lisait encore.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { valeurCanoniqueChoix } from "../i18n";
import { fiches } from "./visualisation";

const fiche = (id: string) => {
  const f = fiches.find((x) => x.id === id);
  if (!f) throw new Error(`fiche introuvable : ${id}`);
  return f;
};

const reglage = (id: string, nom: string) => {
  const p = (fiche(id).parametres ?? []).find((x) => x.nom === nom);
  if (!p) throw new Error(`${id} ne déclare plus « ${nom} »`);
  return p;
};

const SOURCE_DES_VUES = readFileSync("src/vues-domaine/vues-analyse.tsx", "utf-8");
const SPECTRALES = ["analyseur-spectre", "spectrogramme"];

// ─────────────────────────────────────────────────────────────────────────────────────────────────

describe("analyseur-spectre et spectrogramme : leurs réglages sont lus par la vue", () => {
  it("aucun des deux exécuteurs ne lit ses propres réglages : c'est voulu", () => {
    for (const id of SPECTRALES) {
      const source = fiche(id).executer.toString();
      for (const p of fiche(id).parametres ?? []) {
        expect(source, `${id} lit « ${p.nom} » : le présent fichier n'a plus lieu d'être`)
          .not.toContain(`"${p.nom}"`);
      }
    }
  });

  it("LA VUE, ELLE, LES LIT — ET AUTANT DE FOIS QU'IL Y A DE FICHES", () => {
    for (const p of fiche("analyseur-spectre").parametres ?? []) {
      const lecteurs = [...SOURCE_DES_VUES.matchAll(
        new RegExp(String.raw`p\["${p.nom}"\]`, "g"))].length;
      expect(lecteurs, `« ${p.nom} » : ${lecteurs} lecteur(s) dans les vues pour ${SPECTRALES.length} fiches`)
        .toBe(SPECTRALES.length);
    }
  });

  it("LE DÉFAUT DE LA VUE EST CELUI DE LA FICHE, taille par taille", () => {
    // Les deux fiches déclarent 4096 et 1024 ; un repli qui s'en écarterait ferait afficher à un
    // nœud jamais touché une résolution autre que celle que sa notice annonce.
    const replis = [...SOURCE_DES_VUES.matchAll(/p\["Fenêtre"\]\s*\?\?\s*"(\d+)"/g)].map((m) => m[1]);
    expect(replis.length, "la forme du repli a changé dans la vue").toBe(SPECTRALES.length);
    const declares = SPECTRALES.map((id) => String(reglage(id, "Fenêtre").defaut));
    expect(declares).toEqual(["4096", "1024"]);
    expect([...replis].sort(), "le repli de la vue et le défaut de la fiche ont divergé")
      .toEqual([...declares].sort());
  });

  it("CHAQUE TAILLE PROPOSÉE EST UNE PUISSANCE DE DEUX que la vue saura lire", () => {
    // La vue fait `parseInt(...) || 4096` : une option non numérique retomberait silencieusement
    // sur le défaut, et une taille qui n'est pas une puissance de deux casserait la FFT.
    for (const id of SPECTRALES) {
      const p = reglage(id, "Fenêtre");
      for (const o of p.options ?? []) {
        const n = parseInt(String(o));
        expect(Number.isFinite(n), `${id} : « ${o} » n'est pas un nombre`).toBe(true);
        expect(Math.log2(n) % 1, `${id} : ${o} n'est pas une puissance de deux`).toBe(0);
      }
      expect(p.options, `${id} : le défaut doit figurer parmi les options`).toContain(String(p.defaut));
    }
  });

  it("LES TAILLES NE SE TRADUISENT PAS, et la fiche ne prétend pas le contraire", () => {
    // Ces deux champs ont déjà porté des formes d'onde — « Sine », « Square » — copiées depuis un
    // paramètre d'oscillateur, ce qui affichait des noms d'ondes à la place des tailles en anglais.
    // Les laisser absents est la correction ; ce cas empêche qu'on les remplisse à nouveau de
    // travers.
    for (const id of SPECTRALES) {
      const p = reglage(id, "Fenêtre");
      expect(p.optionsEn, `${id} : une taille de fenêtre n'a pas de traduction`).toBeUndefined();
      expect(p.defautEn, `${id} : ni de défaut traduit`).toBeUndefined();
    }
  });

  it("TOUTE ORTHOGRAPHE D'« Échelle » SE RÉSOUT SUR UN DES DEUX IDENTIFIANTS", () => {
    // La vue tranche avec `estLog`, qui tient pour logarithmique tout ce qui n'est pas
    // explicitement linéaire. Une option dont l'identifiant ne serait pas reconnu ferait donc
    // afficher une échelle LOGARITHMIQUE à qui demande la linéaire — sans aucun message.
    for (const id of SPECTRALES) {
      const p = reglage(id, "Échelle");
      expect(p.optionIds).toEqual(["log", "lineaire"]);
      for (const brut of [...(p.options ?? []), ...(p.optionsEn ?? []), ...(p.optionIds ?? [])]) {
        const canon = String(valeurCanoniqueChoix(p, brut as string));
        expect(p.optionIds, `${id} : « ${brut} » ne se résout pas (donne « ${canon} »)`)
          .toContain(canon);
      }
    }
  });

  it("et le mot que la vue reconnaît comme linéaire est bien celui que la fiche déclare", () => {
    // `estLog` ne connaît que trois mots : « lineaire », « linéaire », « linear ». Les trois
    // orthographes déclarées par la fiche doivent être dans ce lot, sinon le réglage est inerte.
    const connus = ["lineaire", "linéaire", "linear"];
    for (const id of SPECTRALES) {
      const p = reglage(id, "Échelle");
      const lineaires = [p.options?.[1], p.optionsEn?.[1], p.optionIds?.[1]]
        .map((x) => String(x).toLowerCase());
      for (const mot of lineaires) {
        expect(connus, `${id} : « ${mot} » n'est pas reconnu comme linéaire par la vue`).toContain(mot);
      }
    }
  });
});
