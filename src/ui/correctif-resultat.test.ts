// ui/correctif-resultat.test.ts — Ce que le magasin reçoit pour un nœud, éprouvé hors du moteur.
//
// CE QUE CES CAS GARDENT. La fonction vivait en fermeture dans `lancerUnePasse`, et rien ne
// l'éprouvait qu'à travers l'application entière : un lecteur refait à chaque run, une adresse
// révoquée trop tôt ou un méta figé « en cours » se voyaient à l'écran, jamais au banc. Sortie du
// moteur avec ses tables nommées, elle se joue ici sur un magasin d'essai, un domaine d'essai et des
// adresses d'objet remplacées, sur les cas que ses propres commentaires énumèrent.
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { calculerCorrectifResultat } from "./correctif-resultat";
import type { EtatDePasse } from "./etat-de-passe";
import { effacerResultats, poserResultat } from "./resultats";
import { configurerServicesApercu, oublierServicesApercu } from "./services-apercu";
import { lireProfondeurExport } from "./profondeur-export";
import { reparerApercu } from "./refaire-apercus";
import { reinitialiserStatuts, statutDe } from "./statuts";
import { Respiration } from "../core/respirer";
import { configurerRegistreMeta, enregistrerMeta, supprimerMeta, type NoeudG, type AreteG } from "../core";

/** Un son d'essai : le domaine d'essai le reconnaît à son tampon, et le dit lourd s'il l'est. */
type Son = { tampon: string; lourd?: boolean };
const estSon = (v: unknown): v is Son => !!v && typeof v === "object" && "tampon" in (v as object);
const son = (tampon: string, lourd = false): Son => ({ tampon, lourd });

const adresses: string[] = [];
const revoquees: string[] = [];

/** Les fiches d'essai, par identifiant : ce que le correctif demande à une fiche, et rien de plus. */
const FICHES: Record<string, Record<string, unknown>> = {
  son: { id: "son", entrees: [], sorties: [{ nom: "Audio", type: "audio" }] },
  autonome: { id: "autonome", affichageAutonome: true, entrees: [], sorties: [{ nom: "Audio", type: "audio" }] },
  fichier: { id: "fichier", nom: "Fichier", apercuEstLeFichier: true, sortieHorsPlagePossible: true, entrees: [], sorties: [{ nom: "Audio", type: "audio" }] },
};
const trouverDef = ((id: string) => FICHES[id]) as unknown as EtatDePasse["trouverDef"];

const noeud = (id: string, ficheId: string, data: Record<string, unknown> = {}): NoeudG =>
  ({ id, selected: true, data: { ficheId, ...data } });

/** Les tables d'une passe, vides sauf ce que le cas pose. */
function etat(partiel: Partial<EtatDePasse> = {}): EtatDePasse {
  return {
    resultats: new Map(), messages: new Map(), affichageParNoeud: new Map(), designeParNoeud: new Map(),
    tousNoeudsG: [], aretesReelles: [], ordreFiltre: [], noeudsPlats: [],
    estMetaEnScope: () => true, trouverDef, lecteursAEcrire: new Map(), souffle: new Respiration(),
    aretesRef: { current: [] }, t: (cle) => cle,
    ...partiel,
  };
}

beforeEach(() => {
  effacerResultats();
  reinitialiserStatuts();
  oublierServicesApercu();
  adresses.length = 0;
  revoquees.length = 0;
  let n = 0;
  globalThis.URL.createObjectURL = () => { const u = `blob:faux/${++n}`; adresses.push(u); return u; };
  globalThis.URL.revokeObjectURL = (u: string) => { revoquees.push(u); };
  configurerServicesApercu({
    valeurRepresentative: (vals) => vals.find(estSon),
    // Un son lourd n'a d'aperçu utile que regardé, ou hors économie : c'est la règle du domaine, réduite.
    apercuUtile: (v, { regarde, economie }) => !estSon(v) || !v.lourd || regarde || !economie,
    blobApercu: async () => new Blob(["x"]),
    apercuCourbe: () => undefined,
  });
});
afterEach(() => { oublierServicesApercu(); });

describe("un nœud ordinaire, et son lecteur", () => {
  it("LE TAMPON PART TOUT DE SUITE, LE LECTEUR EST PROMIS : rien n'est écrit avant la pose", async () => {
    const s = son("a");
    const passe = etat({ resultats: new Map([["a", [s]]]) });
    const patch = await calculerCorrectifResultat(noeud("a", "son"), passe);
    expect(patch).toMatchObject({ audioResultatBuffer: s, audioResultatUrl: undefined, audioResultatNom: undefined });
    expect((patch!.audioResultatRefaisable as { bits: number }).bits).toBe(lireProfondeurExport());
    expect(adresses, "aucune adresse avant que le lecteur ne s'écrive").toEqual([]);
    expect([...passe.lecteursAEcrire.keys()]).toEqual(["a"]);
    await expect(passe.lecteursAEcrire.get("a")!()).resolves.toBe("blob:faux/1");
  });

  it("MÊME TAMPON, MÊME PROFONDEUR : l'adresse est gardée avec son compagnon, rien n'est révoqué ni refait", async () => {
    const s = son("a");
    const refaisable = { bits: lireProfondeurExport(), reecriture: { securiser: false } };
    poserResultat("a", { audioResultatUrl: "blob:avant/a", audioResultatBuffer: s, audioResultatRefaisable: refaisable });
    const passe = etat({ resultats: new Map([["a", [s]]]) });
    const patch = await calculerCorrectifResultat(noeud("a", "son"), passe);
    expect(patch).toMatchObject({ audioResultatUrl: "blob:avant/a", audioResultatNom: "son.wav" });
    expect(patch!.audioResultatRefaisable).toBe(refaisable);
    expect(revoquees).toEqual([]);
    expect(passe.lecteursAEcrire.size).toBe(0);
  });

  it("MÊME TAMPON, MAIS SON LECTEUR A PERDU SES OCTETS : l'adresse n'est plus réemployée, le lecteur se refait", async () => {
    // Relevé dans l'application construite : une seconde instance sur le même profil efface les
    // blobs que Chromium a posés sur le disque, et relancer un nœud venu du cache rendait LE MÊME
    // lecteur grisé, faute de regarder autre chose que l'identité du tampon. Voir `refaire-apercus.ts`.
    const s = son("a");
    const refaisable = { bits: lireProfondeurExport(), reecriture: { securiser: false } };
    poserResultat("a", { audioResultatUrl: "blob:perdue/a" });
    expect(await reparerApercu("a", "blob:perdue/a"), "sans tampon, rien à réécrire").toBe(false);
    poserResultat("a", { audioResultatBuffer: s, audioResultatRefaisable: refaisable });
    const passe = etat({ resultats: new Map([["a", [s]]]) });
    const patch = await calculerCorrectifResultat(noeud("a", "son"), passe);
    expect(patch!.audioResultatUrl, "l'adresse perdue ne doit pas revenir à l'écran").toBeUndefined();
    expect(revoquees).toEqual(["blob:perdue/a"]);
    expect(passe.lecteursAEcrire.has("a"), "le lecteur doit se réécrire depuis le tampon").toBe(true);
  });

  it("AUTRE PROFONDEUR : l'ancienne adresse est révoquée et le lecteur se refait à la nouvelle", async () => {
    const s = son("a");
    poserResultat("a", { audioResultatUrl: "blob:avant/a", audioResultatBuffer: s, audioResultatRefaisable: { bits: 16, reecriture: { securiser: false } } });
    const passe = etat({ resultats: new Map([["a", [s]]]) });
    const patch = await calculerCorrectifResultat(noeud("a", "fichier"), passe);
    expect(revoquees).toEqual(["blob:avant/a"]);
    expect(patch!.audioResultatUrl).toBeUndefined();
    // Ce qu'il faudrait pour le réécrire est déposé à côté, d'après la fiche.
    expect(patch!.audioResultatRefaisable).toEqual({
      bits: lireProfondeurExport(), reecriture: { securiser: true, nomPourMetadonnees: "Fichier" },
    });
    expect(passe.lecteursAEcrire.has("a")).toBe(true);
  });

  it("AUTRE TAMPON : l'ancienne adresse est révoquée, même sans nouveau son à écouter", async () => {
    poserResultat("a", { audioResultatUrl: "blob:avant/a", audioResultatBuffer: son("vieux") });
    const passe = etat({ resultats: new Map([["a", ["un texte"]]]) });
    const patch = await calculerCorrectifResultat(noeud("a", "son"), passe);
    expect(revoquees).toEqual(["blob:avant/a"]);
    expect(patch).toMatchObject({ audioResultatUrl: undefined, audioResultatBuffer: undefined, scriptGenere: "un texte" });
  });

  it("RIEN À CHANGER sans valeur ni message ; un message seul passe", async () => {
    expect(await calculerCorrectifResultat(noeud("a", "son"), etat())).toBeNull();
    const patch = await calculerCorrectifResultat(noeud("a", "son"), etat({ messages: new Map([["a", "dit"]]) }));
    expect(patch).toMatchObject({ audioResultatMessage: "dit", audioResultatBuffer: undefined });
  });

  it("UN COMPOSANT AUTONOME NE REÇOIT QUE SES CANAUX ET SON MESSAGE, jamais un lecteur", async () => {
    const passe = etat({ resultats: new Map([["a", [son("a")]]]), affichageParNoeud: new Map([["a", { htmlPath: "x" }]]) });
    const patch = await calculerCorrectifResultat(noeud("a", "autonome"), passe);
    expect(patch).toEqual({ audioResultatMessage: undefined, _affichage: { htmlPath: "x" }, _designe: undefined });
    expect(passe.lecteursAEcrire.size).toBe(0);
    // Et rien quand il n'a rien désigné : ses données ne sont pas écrasées.
    expect(await calculerCorrectifResultat(noeud("b", "autonome"), etat({ resultats: new Map([["b", [son("b")]]]) }))).toBeNull();
  });

  it("UNE IMAGE REÇOIT UNE ADRESSE, gardée tant que c'est le même fichier", async () => {
    const image = new File(["x"], "i.png", { type: "image/png" });
    const passe = etat({ resultats: new Map([["a", [image]]]) });
    const premier = await calculerCorrectifResultat(noeud("a", "son"), passe);
    expect(premier).toMatchObject({ imageResultatUrl: "blob:faux/1", imageResultatFile: image });
    poserResultat("a", premier!);
    const second = await calculerCorrectifResultat(noeud("a", "son"), passe);
    expect(second!.imageResultatUrl).toBe("blob:faux/1");
    expect(revoquees).toEqual([]);
  });
});

describe("une bulle, et ses membres", () => {
  const bulle = (ouverte: boolean): NoeudG[] => [
    noeud("b", "bulle::b", ouverte ? { bulleOuverte: true } : {}),
    noeud("m", "son", { bulle: "b" }),
    noeud("z", "son"),
  ];
  const aretes: AreteG[] = [{ id: "e", source: "m", target: "z", sourceHandle: "out:0", targetHandle: "in:0" }];

  it("UNE BULLE MONTRE LA SORTIE QUI LA REPRÉSENTE, celle d'un membre qui en sort", async () => {
    const s = son("m");
    const passe = etat({ tousNoeudsG: bulle(true), aretesReelles: aretes, resultats: new Map([["m", [s]]]) });
    const patch = await calculerCorrectifResultat(noeud("b", "bulle::b"), passe);
    expect(patch!.audioResultatBuffer).toBe(s);
    expect(patch!.audioResultatNom).toBeUndefined();
  });

  it("UN MEMBRE DE BULLE REPLIÉE LOURD NE RETIENT RIEN : ni tampon, ni lecteur ; léger, il garde les deux", async () => {
    const lourd = son("m", true);
    const replie = etat({ tousNoeudsG: bulle(false), aretesReelles: aretes, resultats: new Map([["m", [lourd]]]) });
    const patch = await calculerCorrectifResultat(noeud("m", "son", { bulle: "b" }), replie);
    expect(patch!.audioResultatBuffer).toBeUndefined();
    expect(replie.lecteursAEcrire.size).toBe(0);

    const leger = son("m");
    const sousLeSeuil = etat({ tousNoeudsG: bulle(false), aretesReelles: aretes, resultats: new Map([["m", [leger]]]) });
    const patch2 = await calculerCorrectifResultat(noeud("m", "son", { bulle: "b" }), sousLeSeuil);
    expect(patch2!.audioResultatBuffer).toBe(leger);
    // Et son lecteur avec : « Développer » le montre aussitôt, sans rien recalculer.
    expect(sousLeSeuil.lecteursAEcrire.has("m")).toBe(true);
  });
});

describe("un méta, d'après ce que ses internes ont rendu", () => {
  beforeEach(() => {
    configurerRegistreMeta({ enregistrer: () => {}, desenregistrer: () => {} } as never);
    enregistrerMeta({
      id: "meta-essai", nom: "Essai", entrees: [], sorties: [{ nom: "Audio", type: "audio" }],
      mapEntrees: [], mapSorties: [{ noeudInterne: "cd", portIndex: 0 }], sousNoeuds: [], sousAretes: [],
    } as never);
  });
  afterEach(() => { supprimerMeta("meta-essai"); });

  it("HORS DU PÉRIMÈTRE DU RUN, il n'est pas touché", async () => {
    const passe = etat({ estMetaEnScope: () => false, resultats: new Map([["x::cd", [son("cd")]]]) });
    expect(await calculerCorrectifResultat(noeud("x", "meta-essai"), passe)).toBeNull();
  });

  it("IL MONTRE CE QUE SON INTERNE A RENDU SUR LA SORTIE EXPOSÉE, et dit terminé", async () => {
    const s = son("cd");
    const passe = etat({ resultats: new Map([["x::cd", [s]]]) });
    const patch = await calculerCorrectifResultat(noeud("x", "meta-essai"), passe);
    expect(patch).toMatchObject({ audioResultatBuffer: s, audioResultatMessage: "execution.termine" });
  });

  it("SES INTERNES N'ONT RIEN RENDU : il passe en erreur et nomme le premier resté sans résultat", async () => {
    const passe = etat({
      ordreFiltre: ["x::ab", "x::cd"],
      resultats: new Map([["x::ab", [null]]]),
      noeudsPlats: [noeud("x::ab", "gain"), noeud("x::cd", "son")],
    });
    const patch = await calculerCorrectifResultat(noeud("x", "meta-essai"), passe);
    expect(patch).toEqual({ audioResultatMessage: "execution.brancheEchecSansResultat" });
    expect(statutDe("x").statut).toBe("erreur");
    // Et sans fautif identifiable, l'autre message.
    const sansOrdre = etat({ resultats: new Map([["x::cd", [null]]]) });
    const patch2 = await calculerCorrectifResultat(noeud("y", "meta-essai"), sansOrdre);
    expect(patch2).toEqual({ audioResultatMessage: "execution.brancheEchecAucunResultat" });
  });
});
