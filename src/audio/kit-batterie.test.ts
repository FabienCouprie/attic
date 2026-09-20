// audio/kit-batterie.test.ts — Le kit embarqué : sa génération, et la garantie qu'il est à jour.
//
// MÊME PATRON QUE COMPONENTS.md, et pour la même raison : un fichier de test plutôt qu'un script,
// parce que vitest est installé alors que vite-node ne l'est pas — la commande échouerait sur toute
// machine où npx ne l'a pas en cache.
//
//   · `npm run kit:generer` passe ECRIRE_KIT=1 et ÉCRIT les huit WAV et le .sfz dans `public/sfz`.
//   · La suite ordinaire VÉRIFIE le kit versionné : les fichiers sont là, le .sfz se relit, il est
//     reconnu comme un kit, ses notes sont celles du General MIDI, et chaque son a de l'énergie.
//
// Ce que cette vérification attrape : un kit oublié après un changement des recettes de synthèse, un
// WAV tronqué par une écriture interrompue, et surtout un `extraResources` non déclaré — un kit
// parfait dans le dépôt mais absent de l'installeur, ce qui ne se voit qu'après installation.
import "node-web-audio-api/polyfill.js";
import { describe, expect, it } from "vitest";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  CHEMIN_KIT_EMBARQUE, DOSSIER_KIT_EMBARQUE, VOIX_KIT, finUtile, rendreVoixKit, sfzDuKit, wavDeVoix,
} from "./kit-batterie";
import { analyserSfz, banqueDepuisSfz, estKitSfz } from "./sfz";
import { choisirZone, voixPourNote } from "./clavier-banque";

/** Le kit versionné vit sous `public/`, que l'installeur aplatit à la racine des ressources. */
const DOSSIER = join(process.cwd(), "public", DOSSIER_KIT_EMBARQUE.replace(/^\.\//, ""));
const SFZ = join(DOSSIER, "kit-attic.sfz");
const ecrire = process.env.ECRIRE_KIT === "1";

describe.skipIf(!ecrire)("génération du kit embarqué", () => {
  it("écrit les huit sons et leur fichier SFZ", async () => {
    mkdirSync(DOSSIER, { recursive: true });
    let octets = 0;
    for (const voix of VOIX_KIT) {
      const wav = await wavDeVoix(voix);
      writeFileSync(join(DOSSIER, voix.fichier), wav);
      octets += wav.length;
      console.log(`  ${voix.fichier.padEnd(20)} ${(wav.length / 1024).toFixed(0)} Ko`);
    }
    const texte = sfzDuKit();
    writeFileSync(SFZ, texte, "utf-8");
    console.log(`kit écrit : ${VOIX_KIT.length} sons, ${(octets / 1024).toFixed(0)} Ko + ${texte.length} octets de SFZ`);
    expect(existsSync(SFZ)).toBe(true);
  }, 60000);
});

describe.skipIf(ecrire)("le kit embarqué, tel qu'il est versionné", () => {
  it("est présent, avec son .sfz et ses huit sons", () => {
    expect(existsSync(SFZ), `absent : ${SFZ} — lancez « npm run kit:generer »`).toBe(true);
    for (const voix of VOIX_KIT) {
      const chemin = join(DOSSIER, voix.fichier);
      expect(existsSync(chemin), `absent : ${voix.fichier}`).toBe(true);
      // Un WAV d'en-tête seul fait 44 octets : ce seuil attrape une écriture interrompue.
      expect(statSync(chemin).size, voix.fichier).toBeGreaterThan(2000);
    }
  });

  it("pèse peu : c'est ce qui permet de l'embarquer", () => {
    const total = VOIX_KIT.reduce((s, v) => s + statSync(join(DOSSIER, v.fichier)).size, 0);
    expect(total).toBeLessThan(2 * 1024 * 1024);
  });

  it("se relit comme un KIT, aux notes du General MIDI", () => {
    const sfz = analyserSfz(readFileSync(SFZ, "utf-8"));
    expect(sfz.problemes).toEqual([]);
    expect(sfz.regions.length).toBe(VOIX_KIT.length);
    expect(estKitSfz(sfz.regions)).toBe(true);
    // 36 grosse caisse, 38 caisse claire, 42 charley fermé : la convention qui fait qu'un MIDI
    // trouvé ailleurs joue juste.
    expect(sfz.regions.map((r) => r.racine).sort((a, b) => a - b)).toEqual([36, 38, 39, 42, 45, 46, 49, 50]);
    for (const r of sfz.regions) {
      expect(r.lokey).toBe(r.racine);
      expect(r.hikey).toBe(r.racine);
      expect(r.suitLaTouche).toBe(false);
    }
  });

  it("ne référence que des fichiers qui existent", () => {
    const sfz = analyserSfz(readFileSync(SFZ, "utf-8"));
    for (const r of sfz.regions) {
      expect(existsSync(join(DOSSIER, r.sample)), r.sample).toBe(true);
    }
  });

  it("le texte versionné est CELUI que le code produit — sinon le kit a pris du retard", () => {
    expect(readFileSync(SFZ, "utf-8").replace(/\r\n/g, "\n")).toBe(sfzDuKit().replace(/\r\n/g, "\n"));
  });

  it("chargé en banque, il ne transpose rien et ne remplace aucune touche absente", async () => {
    const sfz = analyserSfz(readFileSync(SFZ, "utf-8"));
    // Les WAV versionnés sont décodés par le polyfill : c'est le même chemin que dans l'application.
    const ctx = new AudioContext({ sampleRate: 44100 });
    const audios = new Map<string, AudioBuffer>();
    for (const voix of VOIX_KIT) {
      const octets = readFileSync(join(DOSSIER, voix.fichier));
      const copie = octets.buffer.slice(octets.byteOffset, octets.byteOffset + octets.byteLength);
      audios.set(voix.fichier, await ctx.decodeAudioData(copie as ArrayBuffer));
    }
    const { banque, manquants } = banqueDepuisSfz(sfz, audios);
    expect(manquants).toEqual([]);
    expect(banque.kit).toBe(true);
    expect(banque.zones.length).toBe(VOIX_KIT.length);
    for (const voix of VOIX_KIT) {
      const voixJouee = voixPourNote(banque, voix.note);
      expect(voixJouee, `note ${voix.note}`).not.toBeNull();
      expect(voixJouee!.ratio).toBeCloseTo(1, 10);
      // Chaque son a de l'énergie : un WAV silencieux passerait tous les tests précédents.
      expect(finUtile(voixJouee!.zone.audio), voix.fichier).toBeGreaterThan(100);
    }
    // 37 n'existe pas dans le General MIDI de ce kit : elle doit rester muette.
    expect(choisirZone(banque, 37)).toBeNull();
    await ctx.close();
  }, 30000);

  it("est déclaré dans l'installeur, faute de quoi il manquerait à l'application installée", () => {
    const pkg = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf-8"));
    const ressources: { from: string; to: string }[] = pkg.build?.extraResources ?? [];
    expect(ressources.some((r) => r.from === "public/sfz" && r.to === "sfz"),
      "package.json : build.extraResources doit contenir { from: \"public/sfz\", to: \"sfz\" }").toBe(true);
  });

  it("le chemin déclaré au code est celui du fichier versionné", () => {
    expect(CHEMIN_KIT_EMBARQUE).toBe(`${DOSSIER_KIT_EMBARQUE}/kit-attic.sfz`);
    expect(existsSync(join(process.cwd(), "public", CHEMIN_KIT_EMBARQUE.replace(/^\.\//, "")))).toBe(true);
  });
});

describe("le rendu d'une voix", () => {
  it("rogne le silence : un charley fermé ne dure pas une mesure", async () => {
    const charley = VOIX_KIT.find((v) => v.fichier === "charley-ferme.wav")!;
    const audio = await rendreVoixKit(charley);
    expect(audio.duration).toBeLessThan(0.25);
    expect(finUtile(audio)).toBeGreaterThan(100);
  }, 30000);

  it("est reproductible : deux rendus donnent le même son", async () => {
    const kick = VOIX_KIT[0];
    const a = await rendreVoixKit(kick);
    const b = await rendreVoixKit(kick);
    expect(a.length).toBe(b.length);
    const da = a.getChannelData(0), db = b.getChannelData(0);
    let ecartMax = 0;
    for (let i = 0; i < da.length; i++) ecartMax = Math.max(ecartMax, Math.abs(da[i] - db[i]));
    expect(ecartMax).toBeLessThan(1e-6);
  }, 30000);
});
