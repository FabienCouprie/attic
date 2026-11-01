// plugins/graphe-embarque-retire.test.ts — Un fichier audio ne porte pas de graphe : les
// convertisseurs n'en écrivent plus, « Entrée audio » n'en lit plus.
//
// LE DÉFAUT QUE CE FICHIER GARDE FERMÉ, relevé par Fabien le 2026-11-01. « WAV → MP3 » et
// « MP3 → WAV » écrivaient le graphe entier du canevas dans chaque fichier produit, depuis le
// premier commit et sans réglage ; « Entrée audio » le retrouvait et le moteur le reposait sur le
// canevas à chaque exécution non mise en cache. Un run local de « Fiche technique », qui embrasse
// son amont, a ainsi fait apparaître quinze nœuds d'un graphe exporté trois semaines plus tôt.
//
// LES DEUX SENS SONT ÉPROUVÉS SÉPARÉMENT. À l'import, le témoin est un WAV qui porte ENCORE un
// graphe, écrit par la fonction de format que le dépôt garde : le nœud doit le laisser où il est.
// À l'export, le MP3 produit garde son iXML et perd la trame ATTIC_GRAPH ; le WAV ne demande plus
// rien au moteur.
//
// VUS ROUGES SOUS L'ANCIEN CODE : les deux premiers cas, en remettant les fichiers de master. Le
// troisième ne pouvait pas l'être au banc — l'ancien convertisseur n'écrivait le graphe que si
// l'application lui avait confié le canevas par `setGrapheRef`, ce qu'aucun test ne fait — ; il
// tient le format du MP3 produit, iXML gardé et trame absente.
import { describe, expect, it } from "vitest";
import { ctxDEssai } from "../core/contexte-essai";
import { bufferVersWavBlob, extraireGrapheMp3, extraireGrapheWav } from "../audio/io";
import { fiches as entrees } from "./entrees";
import { fiches as conversions } from "./sortie-conversion";

const GRAPHE = '{"nodes":[{"id":"a","ficheId":"entree-audio"}],"edges":[]}';

function unSon(): AudioBuffer {
  const b = new AudioBuffer({ numberOfChannels: 1, length: 2000, sampleRate: 44100 });
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = 0.5 * Math.sin(i * 0.05);
  return b;
}

const fiche = (id: string) => {
  const f = [...entrees, ...conversions].find((x) => x.id === id);
  if (!f) throw new Error(`fiche ${id} introuvable`);
  return f;
};

describe("un fichier audio ne porte pas de graphe", () => {
  it("« Entrée audio » ne relit plus le graphe qu'un WAV porte encore", async () => {
    const son = unSon();
    const octets = await bufferVersWavBlob(son, GRAPHE).arrayBuffer();
    // Le témoin porte vraiment un graphe : c'est la fonction de format, gardée, qui le dit.
    expect(extraireGrapheWav(octets)).toBe(GRAPHE);
    const fichier = new File([octets], "avec-graphe.wav", { type: "audio/wav" });
    // Le décodeur ne lit que `sampleRate` et `decodeAudioData` : un faux contexte suffit au banc.
    const runtime = { sampleRate: 44100, decodeAudioData: async () => son } as unknown as AudioContext;
    const r = await fiche("entree-audio").executer(ctxDEssai([], {}, { data: { audioFichier: fichier }, runtime }));
    expect(r.valeurs[0]).toBe(son);
    expect(r.moteur, "rien n'est demandé au moteur").toBeUndefined();
    expect(r.message ?? "", "et rien n'est annoncé").not.toMatch(/graphe/i);
  });

  it("« MP3 → WAV » ne demande plus au moteur d'embarquer le graphe", async () => {
    const r = await fiche("convertisseur-mp3-wav").executer(ctxDEssai([unSon()]));
    expect(r.moteur).toBeUndefined();
    expect(r.valeurs).toHaveLength(2);
  });

  it("« WAV → MP3 » écrit son iXML mais plus de trame ATTIC_GRAPH", async () => {
    let produit: Blob | null = null;
    const createObjectURL = URL.createObjectURL;
    URL.createObjectURL = ((b: Blob) => { produit = b; return "blob:essai"; }) as typeof URL.createObjectURL;
    try {
      const r = await fiche("convertisseur-audio").executer(ctxDEssai([unSon()], { Qualité: 128 }));
      expect(r.message ?? "").not.toMatch(/^MP3 :/);
    } finally {
      URL.createObjectURL = createObjectURL;
    }
    expect(produit, "le nœud a bien produit un MP3").not.toBeNull();
    const octets = await (produit as unknown as Blob).arrayBuffer();
    expect(extraireGrapheMp3(octets)).toBeNull();
    const entete = new TextDecoder("latin1").decode(new Uint8Array(octets, 0, Math.min(4096, octets.byteLength)));
    expect(entete).toContain("iXML");
    expect(entete).not.toContain("ATTIC_GRAPH");
  });
});
