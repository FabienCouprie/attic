// ui/CercleVue.tsx — Le cercle qu'un composant déduit de ses réglages, et qu'on clique.
//
// LE TEXTE EST LA SOURCE DE VÉRITÉ, LE DESSIN L'ÉCRIT. Le motif vit dans un réglage, sous la forme
// d'une chaîne de zéros et de uns : il se sauvegarde avec le projet, se recopie d'un nœud à l'autre
// et se colle depuis une adresse du cercle rythmique en ligne. La vue ne fait que le retoucher, de
// la même façon que l'arbre rythmique retouche le sien.
//
// LE DESSIN LUI-MÊME EST DANS `ui/CercleDessin.tsx`, PARTAGÉ. Ce fichier ne décide que de ce qu'on
// lui donne : combien de places, lesquelles sonnent, et le nom de chacune.

import { useCallback, useMemo } from "react";
import { useReactFlow } from "@xyflow/react";

import { nomNote } from "../audio/nom-note";
import {
  POSITIONS_MAX, RYTHME_LIBRE, hauteursDuCercle, motifDuRythme, motifNomme, type Repartition,
} from "../audio/cercle";
import { useI18n } from "../i18n";

import { CercleDessin } from "./CercleDessin";
import { ajusterMotif, disposerCercle, lireMotif, nettoyerMotif } from "./cercle-disposition";
import type { VueProps } from "./vues";

/**
 * Le cercle d'un composant, cliquable.
 *
 * `avecHauteurs` distingue les deux éditeurs : le mélodique nomme chaque sommet de la note qu'il
 * portera, le rythmique n'a qu'un son pour tout le cercle et n'a donc rien à écrire dessus.
 */
export function CercleVue({ id, data, avecHauteurs }: VueProps & { avecHauteurs?: boolean }) {
  const { t } = useI18n();
  const { setNodes } = useReactFlow();

  const parametres = (data as { parametres?: Record<string, unknown> }).parametres ?? {};
  // UN RYTHME CHOISI DANS LA LISTE GOUVERNE LE MOTIF SAISI, et le dessin suit la même règle que le
  // composant : ce qu'on voit est donc toujours ce qui sortira. Voir `motifDuRythme`.
  // LE REPLI VIENT DU CATALOGUE, `audio/cercle.ts`, ET NON D'UNE CHAÎNE ÉCRITE ICI. Il ne sert que
  // si le réglage manque, ce que le défaut déclaré du composant empêche normalement ; mais un motif
  // écrit à la main dans une vue est une quatrième valeur que rien ne tient d'accord avec les
  // trois autres, et celle qui s'y trouvait ne correspondait à aucun des deux composants.
  const motif = nettoyerMotif(motifDuRythme(
    String(parametres["Rythme"] ?? RYTHME_LIBRE),
    String(parametres["Motif"] ?? motifNomme("son")),
  ));
  const positions = Math.max(1, motif.length);
  // LE MÊME CALCUL QUE LE COMPOSANT, ET NON UNE COPIE. Les hauteurs se déduisent de la fondamentale
  // et de la place : ce que le dessin nomme est donc, par construction, ce que la sortie portera.
  const fondamentale = parseInt(String(parametres["Fondamentale"] ?? "60"), 10) || 60;
  const repartition = String(parametres["Répartition"] ?? "octave") as Repartition;

  const ecrire = useCallback((valeur: string) => {
    const changer = (data as { onChangerParametre?: (n: string, p: string, v: string | number) => void })
      .onChangerParametre;
    changer?.(id, "Motif", valeur);
    // LE CLIC REND LA MAIN AU MOTIF, en remettant le choix sur « Libre ». Sans cela, un rythme
    // choisi continuerait à gouverner et le dessin reviendrait à lui dès le rendu suivant : on
    // cliquerait une place, elle s'allumerait, puis s'éteindrait toute seule. Le rythme choisi
    // reste le point de départ, puisque c'est lui qu'on vient d'écrire dans le motif.
    changer?.(id, "Rythme", RYTHME_LIBRE);
    // Sans le rappel de l'application — vue isolée —, on écrit dans le nœud directement, sans quoi
    // le dessin reviendrait à son état d'avant le clic.
    setNodes((nds) => nds.map((n) => n.id === id
      ? {
        ...n,
        data: {
          ...n.data,
          parametres: { ...(n.data.parametres as object), Motif: valeur, Rythme: RYTHME_LIBRE },
        },
      }
      : n));
  }, [data, id, setNodes]);

  const disposition = useMemo(() => disposerCercle(positions, lireMotif(motif)), [positions, motif]);

  const basculer = (place: number) => {
    const suivant = [...ajusterMotif(motif, positions)];
    suivant[place] = suivant[place] === "1" ? "0" : "1";
    ecrire(suivant.join(""));
  };

  const changerPositions = (delta: number) => {
    const n = Math.max(2, Math.min(POSITIONS_MAX, positions + delta));
    ecrire(ajusterMotif(motif, n));
  };

  const quiSonnent = disposition.pastilles.filter((p) => p.sonne).map((p) => p.place);
  const nomsDesSommets = avecHauteurs
    ? hauteursDuCercle(positions, quiSonnent, fondamentale, repartition).map((n) => nomNote(n))
    : [];

  return (
    <div className="cercle-vue" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
      <div className="cercle-barre nodrag">
        <button title={t("cercle.moins")} onClick={() => changerPositions(-1)} disabled={positions <= 2}>−</button>
        <span className="cercle-compte">{positions}</span>
        <button title={t("cercle.plus")} onClick={() => changerPositions(1)} disabled={positions >= POSITIONS_MAX}>+</button>
        <span className="cercle-attaques">{quiSonnent.length} {t("cercle.attaques")}</span>
      </div>

      <CercleDessin positions={positions} sonnent={quiSonnent} noms={nomsDesSommets} surPlace={basculer} />
    </div>
  );
}

/** Le cercle d'un composant rythmique : une percussion pour tout le cercle, aucun nom sur les sommets. */
export function CercleRythmiqueVue(props: VueProps) {
  return <CercleVue {...props} />;
}

/** Le cercle d'un composant mélodique : chaque sommet porte la note qu'il jouera. */
export function CercleMelodiqueVue(props: VueProps) {
  return <CercleVue {...props} avecHauteurs />;
}
