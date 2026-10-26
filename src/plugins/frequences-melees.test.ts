// plugins/frequences-melees.test.ts — Quand un nœud reçoit deux fréquences, on le dit.
//
// ═══ POURQUOI CE RECENSEMENT, ET POURQUOI IL NE CONVERTIT RIEN ═══
//
// Point 5 d'une revue du dépôt, le 2026-10-25 : « aucune fréquence d'échantillonnage commune au
// graphe ». Vérifié, et trois régimes coexistent : les générateurs à 44 100 Hz EN DUR — 107
// occurrences dans 68 fichiers hors tests, dont 73 dans 54 fichiers sont bien une fréquence
// d'échantillonnage et non un seuil ou une durée —, le décodage figé à 48 000 Hz pour ne plus
// dépendre de la carte son, et les fichiers à leur propre fréquence pour qu'une conversion ne se
// fasse pas sans qu'on l'ait demandée.
//
// La conversion a donc lieu, mais IMPLICITEMENT : partout où un `OfflineAudioContext` s'en mêle,
// par le rééchantillonneur du navigateur, dont personne ne choisit la qualité.
//
// CE QUI SE DÉCIDE ICI EST DE MESURER AVANT DE CONVERTIR, et c'est la décision de Fabien : convertir
// à l'entrée de chaque nœud changerait ce que rend TOUT graphe déjà enregistré, et l'on ne sait pas
// encore sur combien d'arêtes cela arrive vraiment. Le relevé le dira ; d'ici là, rien n'est touché.
import { describe, expect, it } from "vitest";
import { AudioBuffer } from "node-web-audio-api";
import { servicesApercu } from "../ui/services-apercu";
// LE DOMAINE DOIT ETRE BRANCHE, sans quoi `servicesApercu()` rend les reponses NEUTRES -- et toutes
// valent la liste vide. Mon premier jet n importait que l adaptateur : trois cas tombaient, et les
// trois qui attendaient une liste vide « passaient » pour la mauvaise raison. C est la racine de
// composition qui installe ces services, comme `composition.test.ts` le tient.
import "../composition";

globalThis.AudioBuffer = AudioBuffer as never;

const tampon = (frequence: number) =>
  new AudioBuffer({ numberOfChannels: 1, length: 8, sampleRate: frequence }) as unknown;

const melees = (entrees: unknown[]) => servicesApercu().frequencesMelees(entrees);

describe("les fréquences mêlées sur les entrées d'un nœud", () => {
  it("DEUX FRÉQUENCES DIFFÉRENTES SE DISENT, dans l'ordre où elles arrivent", () => {
    // L'ORDRE N'EST PAS TRIÉ, et ce n'est pas une négligence : savoir laquelle arrive la PREMIÈRE
    // est exactement ce qui manquait pour comprendre le défaut du mélangeur, dont la sortie suivait
    // le premier câble posé.
    expect(melees([tampon(44100), tampon(48000)])).toEqual([44100, 48000]);
    expect(melees([tampon(48000), tampon(44100)])).toEqual([48000, 44100]);
  });

  it("UNE SEULE FRÉQUENCE NE DIT RIEN, et c'est le cas ordinaire", () => {
    // Un garde qui parlerait sur le cas ordinaire s'apprendrait à ne plus lire — et il parlerait
    // alors sur chaque nœud de chaque run.
    expect(melees([tampon(44100), tampon(44100), tampon(44100)])).toEqual([]);
    expect(melees([tampon(48000)])).toEqual([]);
    expect(melees([])).toEqual([]);
  });

  it("ET CE QUI N'EST PAS UN TAMPON EST IGNORÉ : un texte n'a pas de fréquence", () => {
    // Les entrées d'un nœud portent de tout — du texte, une courbe, un fichier. Les compter ferait
    // crier le garde sur des nœuds qui ne mêlent rien.
    expect(melees([tampon(44100), "du texte", null, undefined, 42, { quoi: 1 }])).toEqual([]);
    expect(melees(["a", "b"])).toEqual([]);
  });

  it("et une fréquence répétée ne compte qu'une fois", () => {
    expect(melees([tampon(44100), tampon(48000), tampon(44100), tampon(48000)]))
      .toEqual([44100, 48000]);
  });

  it("TROIS FRÉQUENCES SE DISENT TOUTES LES TROIS, parce que c'est le relevé qu'on cherche", () => {
    // Le relevé sert à décider si le moteur devra convertir. Un nœud qui mêle trois fréquences est
    // précisément le cas qui le justifierait, et n'en montrer que deux le sous-estimerait.
    expect(melees([tampon(22050), tampon(44100), tampon(48000)])).toEqual([22050, 44100, 48000]);
  });
});
