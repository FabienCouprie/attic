// ui/SelecteurProfondeurExport.tsx — Le sélecteur de la profondeur des fichiers écrits.
//
// ═══ POURQUOI IL A QUITTÉ LA BARRE D'OUTILS, ET C'EST UNE RÉPARATION ═══
//
// Il y vivait en six lignes, piloté par un état d'`App.tsx` qui ne servait qu'à l'afficher : la
// valeur était déjà dans `profondeur-export.ts`, et le moteur la relit de là au moment d'écrire.
// L'état de React en était une SECONDE copie, descendue en prop à travers les deux plus gros
// fichiers du dépôt — tous deux en dette de taille.
//
// ET LE RÉGLAGE ÉTAIT INOPÉRANT, mesuré : voir `ui/refaire-apercus.ts`. Le réparer demandait de
// refaire les aperçus au changement, donc d'ajouter du code à `App.tsx`. L'extraire rend les deux
// fichiers plus petits qu'avant au lieu de plus gros, et met ce sélecteur dans la MÊME FORME que
// son voisin de fréquence — qui ne prend pas de prop non plus. Deux réglages côte à côte dans la
// barre méritent d'avoir la même forme dans le code.

import { useSyncExternalStore } from "react";

import { refaireLesApercus } from "./refaire-apercus";
import {
  PROFONDEURS, ecrireProfondeurExport, lireProfondeurExport, sAbonnerALaProfondeur,
} from "./profondeur-export";
import { useI18n } from "../i18n";
import type { ProfondeurExport } from "../audio/io";

export function SelecteurProfondeurExport() {
  const { t, lang } = useI18n();
  const bits = useSyncExternalStore(sAbonnerALaProfondeur, lireProfondeurExport, lireProfondeurExport);
  return (
    <select className="attic-profondeur-export" value={bits}
      title={t("barre.profondeurExport.titre")}
      aria-label={t("barre.profondeurExport.titre")}
      onChange={(e) => {
        ecrireProfondeurExport(Number(e.target.value) as ProfondeurExport);
        // LES APERÇUS SONT REFAITS, SANS REJOUER UN SEUL NŒUD. Le même blob est l'aperçu écoutable
        // ET le fichier sauvegardé : sans cela, changer la profondeur puis enregistrer écrivait
        // l'ancienne, ce qu'aucune ligne ne signalait.
        void refaireLesApercus(lireProfondeurExport());
      }}>
      {PROFONDEURS.map((p) => (
        <option key={p.valeur} value={p.valeur} title={lang === "en" ? p.noteEn : p.note}>
          {lang === "en" ? p.en : p.fr}
        </option>
      ))}
    </select>
  );
}
