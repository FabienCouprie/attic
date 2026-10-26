// docs/contrat-frequence-de-travail.test.ts — Rien ne génère à la fréquence de la carte son.
//
// ═══ LE DÉFAUT QUE CE GARDE EXISTE POUR EMPÊCHER DE REVENIR ═══
//
// Point 5 d'une revue du dépôt, le 2026-10-25. Onze sites dans sept fichiers généraient à
// `ctx.runtime?.sampleRate ?? 44100` — la fréquence de l'AudioContext, c'est-à-dire DE LA CARTE SON
// de la machine qui ouvre le projet. Les trois Risset, les six synthétiseurs de Tone, le crible, les
// écrans et le GENDYN de Xenakis, les pulsars de Roads.
//
// LE RAISONNEMENT ÉCRIT À CÔTÉ ÉTAIT JUSTE POUR UNE ÉCOUTE ET FAUX POUR UN PROJET : « on génère à la
// fréquence du contexte, cela évite une conversion inutile sur une carte à 48 kHz ». Vrai à la
// lecture. Mais la fréquence d'un livrable est celle du projet, pas celle de l'auditeur.
//
// MESURÉ AVANT LA CORRECTION, sur une carte à 48 kHz, et c'est ce qui rend ce garde nécessaire :
// DEUX DES CINQ GRAPHES LIVRÉS rendaient à deux fréquences à la fois —
// `ton-glisse-en-trompette-etiree` à 44 100 pour `ton` et `gliss`, 48 000 pour `ddsp`, `stretch` et
// `ecoute` ; `un-son-projete-en-microtonal` à 44 100 pour `echelle`, 48 000 pour `cloche` et
// `etale`. Le même fichier rendait un autre son sur une autre machine, et rien ne le disait.
//
// ET LE RECENSEMENT DES FRÉQUENCES MÊLÉES NE POUVAIT PAS LE VOIR : il guette un nœud qui reçoit DEUX
// fréquences, et là chaque nœud n'en recevait qu'une. C'est pourquoi il faut CE garde-ci en plus.
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  FREQUENCES_DE_TRAVAIL, FREQUENCE_DEFAUT, estFrequenceDeTravail, frequenceDeTravail,
  frequenceDuProjet, publierFrequenceDeTravail,
} from "../audio/frequence-de-travail";

const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Le code seul, commentaires retirés.
 *
 * SANS CELA CE GARDE SERAIT UN VERT QUI NE PROUVE RIEN, et il le serait DÈS MAINTENANT : l'en-tête
 * d'`audio/frequence-de-travail.ts` écrit `ctx.runtime.sampleRate` en toutes lettres pour raconter
 * le défaut qu'il répare. Le dépôt a déjà payé cette leçon deux fois — un garde qui cherchait
 * `--strictPort` dans le texte d'un fichier dont l'en-tête le nommait, et un autre qui se lisait
 * lui-même.
 */
const codeSeul = (s: string) => s
  .replace(/\/\*[\s\S]*?\*\//g, " ")
  .split("\n").map((l) => l.replace(/\/\/.*$/, "")).join("\n");

function sources(dossier: string, acc: string[] = []): string[] {
  for (const e of readdirSync(dossier)) {
    const p = join(dossier, e);
    if (statSync(p).isDirectory()) sources(p, acc);
    else if (/\.(ts|tsx)$/.test(e) && !/\.test\.tsx?$/.test(e)) acc.push(p);
  }
  return acc;
}

describe("la fréquence de travail", () => {
  it("AUCUN COMPOSANT NE GÉNÈRE À LA FRÉQUENCE DE LA CARTE SON", () => {
    const fautifs = sources(RACINE)
      .filter((p) => /runtime\s*\??\s*\.\s*sampleRate/.test(codeSeul(readFileSync(p, "utf8"))))
      .map((p) => relative(RACINE, p).replace(/\\/g, "/"));
    expect(fautifs, [
      "",
      "UN COMPOSANT LIT LA FRÉQUENCE D'ÉCHANTILLONNAGE DE L'AUDIOCONTEXT.",
      "",
      "C'est celle de la CARTE SON de la machine, et non celle du projet : le même fichier rendra un",
      "autre son ailleurs, et rien ne le dira. Onze sites le faisaient ; mesuré sur une carte à",
      "48 kHz, deux des cinq graphes livrés rendaient alors à deux fréquences à la fois.",
      "",
      "Ce qu'il faut employer est `frequenceDeTravail()` d'`audio/frequence-de-travail.ts`, que le",
      "fichier de projet déclare et que le sélecteur de la barre d'outils règle.",
      "",
      "`ctx.runtime` reste légitime pour DÉCODER — `decoderFichier(f, ctx.runtime)` — : ce qui est",
      "interdit est d'en lire la fréquence pour décider de ce qu'on fabrique.",
      "",
    ].join("\n")).toEqual([]);
  });

  it("ET LA LISTE DES FICHIERS QUI ÉCRIVENT ENCORE 44 100 NE GRANDIT PAS", () => {
    // ═══ POURQUOI UNE LISTE GELÉE, ET NON UNE INTERDICTION ═══
    //
    // 44 100 reste légitime à quelques endroits, et chacun a sa raison écrite ci-dessous. Une
    // interdiction sèche serait donc fausse ; une liste force un fichier NEUF à se déclarer.
    //
    // ET CETTE LISTE EST L'INSTRUMENT QUI M'A MANQUÉ. La passe des 44 100 en dur a été faite sur un
    // recensement écrit à la main, filtré sur « sampleRate » et « const sr » : il a oublié SIX
    // générateurs qui nomment leur variable autrement — `const frequence`, ou une multiplication en
    // ligne. `spirale-logarithmique`, `ssp`, `suites-entieres`, `synthese-features`,
    // `visualisation`, `vosim`. Une liste de FICHIERS les aurait nommés du premier coup, puisqu'elle
    // ne suppose rien de la forme qu'on cherche. C'est la même leçon qu'un autre garde du dépôt a
    // payée : chercher la forme attendue, c'est ne trouver que ce qu'on imaginait.
    const RAISONS: Record<string, string> = {
      "audio/frequence-de-travail.ts": "c'est lui qui déclare les quatre valeurs et le défaut",
      "audio/frequence-source.ts": "les listes de fréquences valides d'un en-tête MP3 et AAC",
      "audio/io.ts": "l'encodeur MP3 n'accepte que 32 000, 44 100 et 48 000 : une contrainte de format",
      "audio/clavier-banque.ts": "le repli quand une banque ne dit pas la fréquence de ses zones",
      "audio/memoire-audio.ts": "les défauts de deux calculs de poids, que l'appelant renseigne",
      "audio/midi-soundfont.ts": "une ligne de journal, et le repli d'un échantillon SF2 sans taux",
      "plugins/effets.ts": "la PLAGE d'un réglage : la fréquence simulée d'un casseur de bits",
      "plugins/isoler-voix.ts": "la fréquence qu'EXIGE un modèle, et elle ne se négocie pas",
      "plugins/julia-processor.ts": "le défaut d'une variable d'environnement, dans du code Julia",
      "plugins/notices.ts": "des notices qui décrivent un comportement mesuré",
      "plugins/python-processor.ts": "le défaut d'une variable d'environnement, dans du code Python",
      "plugins/spectrogramme-image.ts": "un réglage à choix de l'utilisateur, dont 44 100 est le défaut",
      "vues-domaine/generation-code.ts": "le défaut d'une variable d'environnement, dans du code Python et Julia donné en exemple",
    };
    // LES COMMENTAIRES SONT RETIRÉS, ET C'EST UNE CORRECTION : ce garde lisait le texte BRUT, si
    // bien qu'un commentaire citant « 44100 Hz » pour raconter un défaut réparé le faisait crier
    // sur un fichier correct. Relevé sur `plugins/separateur-canaux.ts`, dont l'en-tête cite
    // l'ancien message du composant. C'est la faute dont son voisin, dix lignes plus haut, se
    // méfie explicitement — et elle était ici.
    //
    // LES NOTICES RESTENT COUVERTES : ce sont des chaînes de caractères, donc du code.
    const presents = sources(RACINE)
      .filter((p) => /\b44100\b/.test(codeSeul(readFileSync(p, "utf8"))))
      .map((p) => relative(RACINE, p).replace(/\\/g, "/"))
      .sort();
    expect(presents.filter((f) => !(f in RAISONS)), [
      "",
      "UN FICHIER ÉCRIT 44 100 EN DUR SANS QUE SA RAISON SOIT DÉCLARÉE.",
      "",
      "Si c'est la fréquence de travail d'un son qu'il FABRIQUE, elle doit venir de",
      "`frequenceDeTravail()` : un projet déclaré à 48 ou 96 kHz recevrait sinon du 44,1 converti.",
      "",
      "Si c'est autre chose — une contrainte de format, la fréquence qu'exige un modèle, la plage",
      "d'un réglage, un commentaire — ajoutez le fichier à RAISONS en disant laquelle.",
      "",
    ].join("\n")).toEqual([]);
    // L'AUTRE SENS COMPTE AUTANT : une raison pour un fichier qui n'en écrit plus fait une liste
    // tenue à la main, qui vieillit et finit par décrire un état qui n'existe plus.
    expect(Object.keys(RAISONS).filter((f) => !presents.includes(f)),
      "ces fichiers n'écrivent plus 44 100 : retirez-les de RAISONS").toEqual([]);
  });

  it("ET LE DÉFAUT EST 44 100, parce que c'est ce que les générateurs écrivaient en dur", () => {
    // SI CE DÉFAUT CHANGEAIT, TOUT PROJET ENREGISTRÉ RENDRAIT UN AUTRE SON. Un fichier antérieur au
    // réglage n'en porte pas, et vaut donc ce nombre ; les 107 occurrences de 44 100 en dur du
    // catalogue lui répondent. Le mettre à 48 000 « parce que c'est plus moderne » convertirait en
    // silence tout ce qui a été fait avant.
    expect(FREQUENCE_DEFAUT).toBe(44100);
    expect(frequenceDuProjet({})).toBe(44100);
    expect(frequenceDuProjet(null)).toBe(44100);
    expect(frequenceDuProjet({ nodes: [], edges: [] })).toBe(44100);
  });

  it("une valeur hors liste est REFUSÉE et non corrigée en silence", () => {
    // Corriger 44 101 en 44 100 serait pire que le refuser : le projet croirait travailler à la
    // valeur qu'il a écrite. Les quatre valeurs sont celles qu'un ingénieur du son emploie.
    try {
      publierFrequenceDeTravail(96000);
      expect(frequenceDeTravail()).toBe(96000);
      publierFrequenceDeTravail(44101);
      expect(frequenceDeTravail()).toBe(44100);
      publierFrequenceDeTravail("48000");
      expect(frequenceDeTravail()).toBe(44100);
      expect(estFrequenceDeTravail(22050)).toBe(false);
      expect(FREQUENCES_DE_TRAVAIL.map((f) => f.valeur)).toEqual([44100, 48000, 88200, 96000]);
    } finally {
      publierFrequenceDeTravail(44100);
    }
  });

  it("et chaque fréquence offerte porte ses deux libellés et ses deux notes", () => {
    // Un menu dont une entrée n'a pas de note est une entrée qu'on choisit au hasard ; et une note
    // en français seulement est une entrée que la moitié des utilisateurs ne lit pas.
    for (const f of FREQUENCES_DE_TRAVAIL) {
      expect(f.fr.length, String(f.valeur)).toBeGreaterThan(3);
      expect(f.en.length, String(f.valeur)).toBeGreaterThan(3);
      expect(f.note.length, String(f.valeur)).toBeGreaterThan(30);
      expect(f.noteEn.length, String(f.valeur)).toBeGreaterThan(30);
    }
  });
});
