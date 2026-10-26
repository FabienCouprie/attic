// electron/hotes-telechargement.test.ts — Ce que `telecharger:url` a le droit d'aller chercher.
//
// ═══ LE DEFAUT, RELEVE LE 2026-10-26 ═══
//
// « Le pont lit toujours n'importe quel fichier. `telecharger:url` accepte de son cote n'importe
// quelle adresse http(s), et une adresse peut transporter des donnees dans ses parametres. »
//
// VERIFIE : la liste d'hotes existait, mais DANS LE RENDERER — `isModelDownloadUrl` de
// `src/plugins/electronFetch.ts`. Un noeud installe, qui a `window.api` puisqu'il s'evalue par
// `new Function` dans le contexte principal de l'interface, appelait `api.telechargerUrl`
// directement et la contournait. Une regle qui vit dans le renderer n'est pas une regle.
//
// CE QUE CES CAS TIENNENT, ET C'EST LA PARTIE QUI PEUT SE TROMPER : comparer un nom d'hote sans se
// laisser prendre par ce qui lui ressemble.
import { describe, expect, it } from "vitest";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { HOTES_TELECHARGEMENT, hoteDeTelechargementAutorise } = require("./hotes-telechargement.cjs");

const ok = (adresse: string) => hoteDeTelechargementAutorise(new URL(adresse));

describe("les hotes du telechargement", () => {
  it("LAISSE PASSER CE QUE L'APPLICATION VA CHERCHER VRAIMENT", () => {
    // Seul `storage.googleapis.com` sert aujourd'hui : les points de controle DDSP. Les autres
    // viennent du chargement TensorFlow Hub, qui redirige.
    expect(ok("https://storage.googleapis.com/magentadata/js/checkpoints/ddsp/violin")).toBe(true);
    expect(ok("https://tfhub.dev/google/model/1")).toBe(true);
    expect(ok("https://www.kaggle.com/models/x")).toBe(true);
  });

  it("ET UN SOUS-DOMAINE PASSE, puisqu'une redirection en emploie", () => {
    expect(ok("https://sous.storage.googleapis.com/x")).toBe(true);
    expect(ok("https://kagglesdsdata.blob.core.windows.net/data/x")).toBe(true);
  });

  it("REFUSE UN HOTE QUI RESSEMBLE, et c'est tout l'objet d'une comparaison par NOM", () => {
    // `kaggle.com.evil.com` se termine par rien d'autorise, et `evil.com/?x=kaggle.com` contient la
    // chaine sans etre Kaggle. Une recherche de sous-chaine dans l'adresse entiere, comme celle du
    // renderer, laisse passer le second.
    expect(ok("https://kaggle.com.evil.com/x"), "suffixe trompeur").toBe(false);
    expect(ok("https://evil.com/?x=kaggle.com"), "la chaine est dans le chemin").toBe(false);
    expect(ok("https://evil.com/storage.googleapis.com/x")).toBe(false);
    expect(ok("https://notkaggle.com/x")).toBe(false);
  });

  it("ET REFUSE TOUT LE RESTE, ce qui est la forme meme d'une liste d'autorisation", () => {
    expect(ok("https://exfiltration.example/?donnees=secret")).toBe(false);
    expect(ok("https://localhost/x")).toBe(false);
  });

  it("HTTPS SEUL : une redirection qui retombe en clair est un affaiblissement", () => {
    expect(ok("http://storage.googleapis.com/x"), "le meme hote, en clair").toBe(false);
    expect(hoteDeTelechargementAutorise(new URL("file:///C:/secret.txt"))).toBe(false);
  });

  it("et une adresse absente se refuse plutot que de partir au reseau", () => {
    expect(hoteDeTelechargementAutorise(null)).toBe(false);
    expect(hoteDeTelechargementAutorise(undefined)).toBe(false);
  });

  it("LA LISTE EST CELLE DU RENDERER, pour que ce lot ne casse rien", () => {
    // `isModelDownloadUrl` nommait ces cinq-la. En descendre moins aurait ferme un chemin de
    // redirection qu'aucun cas ne peut exercer sans reseau.
    expect([...HOTES_TELECHARGEMENT].sort()).toEqual([
      "googleusercontent.com", "kaggle.com", "kagglesdsdata.blob.core.windows.net",
      "storage.googleapis.com", "tfhub.dev",
    ]);
  });
});
