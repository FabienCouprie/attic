// ui/SelecteurFrequenceDeTravail.tsx — Le sélecteur de la fréquence de travail du projet.
//
// POURQUOI UN COMPOSANT À PART, et non six lignes dans la barre d'outils. `BarreOutils.tsx` est en
// dette de taille — 441 lignes de code, son plafond —, et la norme du dépôt est claire : ce qu'on
// ajoute à un fichier trop gros va ailleurs.
//
// ET IL NE PREND AUCUN PROP. Il lit et écrit `audio/frequence-de-travail.ts`, qui porte la valeur.
// Le faire descendre en prop depuis `App.tsx` aurait traversé les deux plus gros fichiers du dépôt
// pour rien, et surtout aurait fait vivre la valeur à deux endroits — c'est le défaut qui a coûté
// quatre relevés à la table de montage.

import { useSyncExternalStore } from "react";

import {
  FREQUENCES_DE_TRAVAIL, estFrequenceDeTravail, frequenceDeTravail,
  publierFrequenceDeTravail, sAbonnerALaFrequence,
} from "../audio/frequence-de-travail";
import { useI18n } from "../i18n";

export function SelecteurFrequenceDeTravail() {
  const { t, lang } = useI18n();
  const frequence = useSyncExternalStore(sAbonnerALaFrequence, frequenceDeTravail, () => frequenceDeTravail());
  return (
    // LA LARGEUR EST FIXE, ET EN LIGNE. Fixe parce qu'un `select` se dimensionne sur son option la
    // plus large, et que « 44,1 kHz » et « 44.1 kHz » n'ont pas la même largeur — la virgule et le
    // point diffèrent de quelques dixièmes de pixel, ce qui décalerait tout ce qui suit dans la
    // barre au changement de langue. `tests-e2e/barre-stable.spec.ts` le vérifie. En ligne parce
    // qu'`atelier.css` est en dette de taille : la règle de style est PARTAGÉE avec le sélecteur de
    // profondeur, dont la largeur de 112 px tient « 32 bits flottants » et serait ici du vide.
    <select className="attic-frequence-travail" value={frequence} style={{ width: 76 }}
      title={t("barre.frequenceTravail.titre")}
      aria-label={t("barre.frequenceTravail.titre")}
      onChange={(e) => {
        const v = Number(e.target.value);
        if (estFrequenceDeTravail(v)) publierFrequenceDeTravail(v);
      }}>
      {FREQUENCES_DE_TRAVAIL.map((f) => (
        <option key={f.valeur} value={f.valeur} title={lang === "en" ? f.noteEn : f.note}>
          {lang === "en" ? f.en : f.fr}
        </option>
      ))}
    </select>
  );
}
