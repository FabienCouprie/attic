// tests-e2e/melange-frequences-dans-application.spec.ts — Deux fichiers, deux fréquences, un
// mélangeur : ce que l'application rend vraiment.
//
// ═══ POURQUOI CE CAS, ET POURQUOI IL FALLAIT DES FICHIERS ═══
//
// Point 5 d'une revue du dépôt, le 2026-10-25 : « `melangerPistes` prend la fréquence de la
// PREMIÈRE entrée, c'est-à-dire de l'ordre de création des câbles. » Deux gardes en sont nés —
// `audio/melanger-pistes.test.ts` pour la règle, `plugins/frequences-melees.test.ts` pour le
// relevé — et aucun des deux ne passe par l'application.
//
// OR LE RELEVÉ DE `types-au-port.spec.ts` REND ZÉRO, et il le dit lui-même : toutes les branches
// des graphes livrés naissent de générateurs, qui rendent tous à 44 100 Hz. LA SEULE SOURCE D'UNE
// AUTRE FRÉQUENCE EST UN FICHIER, décodé à la sienne depuis `audio/frequence-source.ts`. Tant
// qu'aucun fichier n'entre dans un graphe, l'application ne peut pas mêler deux fréquences, et le
// silence du relevé ne prouve donc rien sur le mélange.
//
// CE CAS APPORTE LES FICHIERS. Il les écrit lui-même plutôt que de les emporter : deux sinus, l'un
// à 44 100 Hz et l'autre à 32 000 Hz, posés par le bouton « Charger » du nœud d'entrée — le geste
// même de l'utilisateur. Puis il mesure TROIS choses sur ce que le mélangeur a rendu : la fréquence
// de son fichier, la hauteur de la piste convertie, et la ligne que le moteur a écrite.
//
// ═══ LES DEUX CHOIX DE MESURE, ET CE QU'ILS ÉCARTENT ═══
//
// 32 000 Hz ET NON 22 050 : le rapport à 44 100 serait exactement deux, de sorte qu'une piste lue
// sans conversion sonnerait à l'OCTAVE. Un témoin posé à l'octave se confond avec l'harmonique
// deux du son juste, et le garde deviendrait indécidable. À 32 000 le rapport vaut 1,378 : 400 Hz
// non convertis sonneraient à 551,25 Hz, qui n'est l'harmonique de rien.
//
// LE CÂBLE DE 32 000 EST POSÉ EN PREMIER, et c'est tout le cas. Sous l'ancienne règle, le mélange
// se faisait alors à 32 000 Hz : la piste à 44 100 était DÉCIMÉE, et ce qu'elle portait au-dessus
// de 16 kHz était perdu pour de bon. C'est aussi ce qui fait tomber ce cas si l'on replante
// `entrees[0].sampleRate` — vérifié, et le relevé est dans le corps du cas.
import { expect, test } from "@playwright/test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { serveurDeVerification } from "./serveur-de-developpement";
import { apercusEnWav, etatDesNoeuds, semerEtLancer } from "./pilote-graphe";

const devUrl = serveurDeVerification(5250);

/** Un sinus en WAV 16 bits mono, à la fréquence et à la hauteur demandées. */
function wav(frequence: number, hauteur: number, duree = 1.5): Buffer {
  const n = Math.round(frequence * duree);
  const corps = Buffer.alloc(n * 2);
  for (let i = 0; i < n; i++) {
    corps.writeInt16LE(Math.round(Math.sin((2 * Math.PI * hauteur * i) / frequence) * 0.4 * 32767), i * 2);
  }
  const tete = Buffer.alloc(44);
  tete.write("RIFF", 0); tete.writeUInt32LE(36 + corps.length, 4); tete.write("WAVE", 8);
  tete.write("fmt ", 12); tete.writeUInt32LE(16, 16); tete.writeUInt16LE(1, 20);
  tete.writeUInt16LE(1, 22); tete.writeUInt32LE(frequence, 24);
  tete.writeUInt32LE(frequence * 2, 28); tete.writeUInt16LE(2, 32); tete.writeUInt16LE(16, 34);
  tete.write("data", 36); tete.writeUInt32LE(corps.length, 40);
  return Buffer.concat([tete, corps]);
}

/**
 * La fréquence déclarée par le bloc `fmt ` d'un WAV, en PARCOURANT ses blocs.
 *
 * L'aperçu de l'application porte un `iXML` et un `bext` avant ses données : lire l'octet 24 d'un
 * décalage supposé rendrait n'importe quoi. On marche donc de bloc en bloc, comme le fait
 * `audio/frequence-source.ts`.
 */
function frequenceDuWav(o: Uint8Array): number | null {
  const v = new DataView(o.buffer, o.byteOffset, o.byteLength);
  for (let p = 12; p + 8 <= o.length; ) {
    const id = String.fromCharCode(...o.subarray(p, p + 4));
    const n = v.getUint32(p + 4, true);
    if (id === "fmt " && p + 16 <= o.length) return v.getUint32(p + 12, true);
    p += 8 + n + (n % 2);
  }
  return null;
}

/** L'énergie d'un WAV à une fréquence, par Goertzel. L'aperçu est en flottant 32 bits. */
function energie(o: Uint8Array, hz: number, frequence: number): number {
  const v = new DataView(o.buffer, o.byteOffset, o.byteLength);
  let debut = -1, longueur = 0;
  for (let p = 12; p + 8 <= o.length; ) {
    const id = String.fromCharCode(...o.subarray(p, p + 4));
    const n = v.getUint32(p + 4, true);
    if (id === "data") { debut = p + 8; longueur = n; break; }
    p += 8 + n + (n % 2);
  }
  if (debut < 0) return 0;
  const bits = v.getUint16(34, true), canaux = v.getUint16(22, true);
  const pas = (bits / 8) * canaux;
  const n = Math.floor(longueur / pas);
  const w = (2 * Math.PI * hz) / frequence, coef = 2 * Math.cos(w);
  let s1 = 0, s2 = 0;
  for (let i = 0; i < n; i++) {
    const a = debut + i * pas;
    const x = bits === 32 ? v.getFloat32(a, true) : v.getInt16(a, true) / 32768;
    const s0 = x + coef * s1 - s2; s2 = s1; s1 = s0;
  }
  return Math.sqrt(Math.max(0, s1 * s1 + s2 * s2 - coef * s1 * s2)) / n;
}

const GRAPHE = JSON.stringify({
  nodes: [
    { id: "grave", position: { x: -400, y: -120 }, data: { ficheId: "entree-audio", parametres: { Chemin: "" } } },
    { id: "aigu", position: { x: -400, y: 160 }, data: { ficheId: "entree-audio", parametres: { Chemin: "" } } },
    { id: "melange", position: { x: 80, y: 20 }, data: { ficheId: "melangeur", parametres: {} } },
  ],
  // L'ORDRE DES ARÊTES EST LE CAS : « grave », à 32 000 Hz, est le premier câble posé.
  edges: [
    { id: "e0", source: "grave", target: "melange", sourceHandle: "out:0", targetHandle: "in:0", type: "arete-personnalisee" },
    { id: "e1", source: "aigu", target: "melange", sourceHandle: "out:0", targetHandle: "in:0", type: "arete-personnalisee" },
  ],
});

test.describe("le mélangeur, dans l'application, sur deux fréquences", () => {
  test.setTimeout(240_000);

  test("LE MELANGE SORT A LA PLUS HAUTE DES DEUX, ET LA PISTE CONVERTIE GARDE SA HAUTEUR", async ({ page }) => {
    const dossier = mkdtempSync(join(tmpdir(), "attic-melange-"));
    const chemins = {
      grave: join(dossier, "grave-32k.wav"),
      aigu: join(dossier, "aigu-44k.wav"),
    };
    writeFileSync(chemins.grave, wav(32000, 400));
    writeFileSync(chemins.aigu, wav(44100, 1000));

    const frequences: string[] = [];
    page.on("console", (m) => { if (m.text().startsWith("[frequence] ")) frequences.push(m.text()); });

    // LE PILOTAGE EST CELUI DU PILOTE, et les fichiers se posent dans son créneau `avantDeLancer`.
    // Un `File` ne traverse pas le JSON de l'en-cours : il faut le poser PAR LE BOUTON DU NŒUD,
    // après le rechargement et avant le clic sur Lancer, et c'est le geste de l'utilisateur —
    // c'est lui qui déclenche le décodage à la fréquence de la source.
    await semerEtLancer(page, devUrl, GRAPHE, {
      profondeurExport: 32,
      avantDeLancer: async (p) => {
        for (const [id, chemin] of Object.entries(chemins)) {
          await p.locator(`[data-id="${id}"] .attic-node-fichier input[type=file]`)
            .setInputFiles(chemin, { timeout: 15_000 });
        }
        await p.waitForTimeout(1000);
      },
    });

    const etats = await etatDesNoeuds(page);
    for (const e of etats) console.log(`${e.id} · ${e.statut} · ${e.message ?? "—"}${e.cause ? ` · ${e.cause}` : ""}`);
    expect(etats.find((e) => e.id === "melange")?.statut,
      "le mélangeur doit avoir abouti avant qu'on mesure ce qu'il a rendu").toBe("termine");

    const apercus = await apercusEnWav(page);
    const brut = apercus.find((a) => a.id === "melange");
    expect(brut, "le mélangeur n'a pas livré d'aperçu : il n'y a rien à mesurer").toBeTruthy();
    const octets = Buffer.from(brut!.base64, "base64");

    // ═══ 1. LA FRÉQUENCE DU FICHIER RENDU ═══
    const sortie = frequenceDuWav(octets);
    console.log(`mélange rendu à ${sortie} Hz · ${brut!.octets} octets`);
    expect(sortie, [
      "",
      "LE MÉLANGE N'EST PAS SORTI À LA PLUS HAUTE DES FRÉQUENCES REÇUES.",
      "",
      "Deux fichiers sont entrés, à 32 000 et à 44 100 Hz, et le câble de 32 000 a été posé en",
      "premier. Une sortie à 32 000 Hz signifie que `melangerPistes` suit de nouveau",
      "`entrees[0].sampleRate` : l'ordre des câbles décide du fichier rendu, et la piste la plus",
      "fine est décimée — ce qu'elle portait au-dessus de 16 kHz est perdu pour de bon.",
      "",
      "La règle est dans `audio/effets-montage.ts`, et `audio/melanger-pistes.test.ts` la tient.",
      "",
    ].join("\n")).toBe(44100);

    // ═══ 2. LA PISTE CONVERTIE GARDE SA HAUTEUR ═══
    //
    // 400 Hz doit dominer 551,25 Hz — la hauteur qu'aurait la piste à 32 000 Hz si ses échantillons
    // étaient lus tels quels à 44 100 (400 × 44100/32000), soit 553 cents trop haut. Une fréquence
    // de sortie juste ne garantit pas une conversion juste : c'est le défaut mesuré dans la banque
    // aux zones mélangées, où le tampon était bon et la lecture fausse.
    const e400 = energie(octets, 400, 44100);
    const e551 = energie(octets, 551.25, 44100);
    const e1000 = energie(octets, 1000, 44100);
    console.log(`énergies · 400 Hz ${e400.toExponential(2)} · 551,25 Hz ${e551.toExponential(2)} · 1000 Hz ${e1000.toExponential(2)}`);
    expect(e400, "la piste à 32 000 Hz a été convertie faux : sa hauteur n'est plus là")
      .toBeGreaterThan(e551 * 4);
    expect(e1000, "la piste déjà à la fréquence du rendu doit traverser intacte")
      .toBeGreaterThan(e551 * 4);

    // ═══ 3. ET LE MOTEUR L'A DIT ═══
    //
    // Le relevé du point 5 ne vaut que s'il parle quand il y a quelque chose à dire. Il se taisait
    // sur les trois graphes de `types-au-port.spec.ts`, faute de fichier ; ici il doit nommer le
    // mélangeur et ses deux fréquences.
    for (const f of frequences) console.log(`  ${f}`);
    expect(frequences.join("\n"), [
      "",
      "LE MOTEUR N'A PAS SIGNALÉ LE MÉLANGE DE DEUX FRÉQUENCES.",
      "",
      "Un nœud a reçu du 32 000 et du 44 100 Hz, donc une conversion implicite a eu lieu, et aucune",
      "ligne « [frequence] » ne l'a dite. Le recensement vit dans `plugins/apercu-domaine.ts` et le",
      "moteur le pose dans `ui/hooks/useExecutionGraphe.ts`, après chaque exécution de nœud.",
      "",
    ].join("\n")).toMatch(/melange.*\(melangeur\).*(32000 et 44100|44100 et 32000)/);
  });
});
