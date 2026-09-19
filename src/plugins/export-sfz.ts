// plugins/export-sfz.ts — Écrire une banque de clavier au format SFZ.
//
// SFZ est un format TEXTE : un fichier `.sfz` qui décrit des régions, et les échantillons à côté. Il
// se lit par presque tous les échantillonneurs — Sforzando, Kontakt via conversion, LinuxSampler,
// Bitwig, Renoise. Un SF2 serait un autre chantier : format binaire, tables et générateurs.
//
// La génération du texte est dans `audio/clavier-banque.ts`, testée — les tests RELISENT ce qui est
// écrit et vérifient que les quatre-vingt-huit touches sont couvertes une fois chacune. Ce fichier
// n'écrit que sur le disque.

import type { FicheAudio } from "../audio/types-domaine";
import { traduire } from "../i18n";
import { avecDoc } from "./notices";
import { bufferVersWavBlob } from "../audio/io";
import { nomEchantillon, versSfz, type Banque } from "../audio/clavier-banque";

/** Retire l'extension d'un nom de fichier, pour en tirer le nom du dossier d'échantillons. */
const sansExtension = (nom: string): string => nom.replace(/\.[^./\\]*$/, "");

export const fiches: FicheAudio[] = ([
  {
    id: "export-sfz", nom: "Export SFZ", nomEn: "SFZ Export",
    univers: "Sorties", famille: "Export",
    resume: "Écrit une banque de clavier au format SFZ : un fichier texte et ses échantillons, lisibles par n'importe quel échantillonneur.",
    resumeEn: "Writes a keyboard bank as SFZ: a text file and its samples, readable by any sampler.",
    entrees: [{ nom: "Banque", nomEn: "Bank", type: "banque" }],
    sorties: [{ nom: "Chemin", nomEn: "Path", type: "texte" }],
    parametres: [
      { nom: "Nom", nomEn: "Name", type: "texte", defaut: "banque.sfz",
        doc: "Nom du fichier SFZ, écrit dans le répertoire de travail. Les échantillons vont dans un dossier du même nom, à côté — un fichier WAV par zone, nommé d'après sa note-racine.",
        docEn: "Name of the SFZ file, written in the working directory. The samples go into a folder of the same name beside it — one WAV file per zone, named after its root note." },
      { nom: "Relâchement", nomEn: "Release", type: "curseur", plage: [10, 3000], pas: 10, defaut: 300, unite: "ms",
        doc: "Relâchement écrit dans l'enveloppe globale du SFZ (`ampeg_release`). Il ne change pas les échantillons : c'est l'échantillonneur qui l'appliquera.",
        docEn: "Release written into the SFZ's global envelope (`ampeg_release`). It does not change the samples: the sampler will apply it." },
    ],
    async executer(ctx: any) {
      const api = (window as any).api;
      if (!api?.ecrireFichier) {
        return { valeurs: [null], message: traduire("msg.n_cessite_electron") };
      }
      const banque = ctx.entree(0) as Banque | null;
      if (!banque || !Array.isArray(banque.zones) || banque.zones.length === 0) {
        return { valeurs: [null], message: traduire("msg.banque.absente") };
      }
      const nom = ctx.paramTexte("Nom", "banque.sfz");
      const nomSfz = /\.sfz$/i.test(nom) ? nom : `${nom}.sfz`;
      const dossier = sansExtension(nomSfz);
      const base = ctx.repertoireTravail;
      // Sans dossier de travail, le chemin serait RELATIF : les fichiers partiraient là où le
      // processus se trouve, et le nœud annoncerait « écrit » sans qu'on puisse les retrouver.
      // Constaté en vérifiant : dix-neuf fichiers écrits quelque part, introuvables sur deux
      // racines de disque. Mieux vaut ne rien écrire et le dire.
      if (!base) return { valeurs: [null], message: traduire("msg.sfz.sansDossier") };

      // Les échantillons d'abord : si l'un d'eux échoue, le SFZ qu'on écrirait ensuite renverrait
      // vers un fichier absent, et l'échantillonneur se tairait sans dire pourquoi.
      let ecrits = 0, octets = 0;
      for (const zone of banque.zones) {
        const blob = bufferVersWavBlob(zone.audio);
        const bytes = new Uint8Array(await blob.arrayBuffer());
        const chemin = `${base}/${dossier}/${nomEchantillon(zone)}`;
        const ok = await api.ecrireFichier(chemin, bytes);
        if (!ok) {
          return { valeurs: [null], message: traduire("msg.sfz.echec", nomEchantillon(zone)) };
        }
        ecrits++;
        octets += bytes.length;
      }

      const texte = versSfz(banque, {
        dossier,
        relachement: ctx.paramNombre("Relâchement", 300) / 1000,
        nom: dossier,
      });
      const cheminSfz = `${base}/${nomSfz}`;
      const ok = await api.ecrireFichier(cheminSfz, new TextEncoder().encode(texte));
      if (!ok) return { valeurs: [null], message: traduire("msg.sfz.echec", nomSfz) };

      return {
        valeurs: [cheminSfz],
        message: traduire("msg.sfz.ecrit", nomSfz, String(ecrits), (octets / 1048576).toFixed(1)),
      };
    },
  },
] as FicheAudio[]).map(avecDoc);
