// ui/CercleVue.tsx — Le cercle qu'on clique, et le polygone qu'il dessine.
//
// LE POLYGONE N'EST PAS UN ORNEMENT. Son aire est une des mesures du rythme, maximale exactement
// quand les attaques se répartissent également ; ses cordes sont ce sur quoi la régularité se
// calcule. Tracer les cordes, c'est donc montrer la quantité, non l'illustrer. Le cercle rythmique
// en ligne dont vient cette représentation s'arrête aux pastilles.
//
// LE TEXTE EST LA SOURCE DE VÉRITÉ, LE DESSIN L'ÉCRIT. Le motif vit dans un réglage, sous la forme
// d'une chaîne de zéros et de uns : il se sauvegarde avec le projet, se recopie d'un nœud à l'autre
// et se colle depuis une adresse du cercle rythmique en ligne. La vue ne fait que le retoucher, de
// la même façon que l'arbre rythmique retouche le sien.
//
// AUCUNE GÉOMÉTRIE ICI, AUCUNE COULEUR NON PLUS. La première vit dans `ui/cercle-disposition.ts`
// avec ses tests, les secondes dans `atelier.css`, qui lit les variables du thème.

import { useCallback, useMemo, useState } from "react";
import { useReactFlow } from "@xyflow/react";

import { nomNote } from "../audio/nom-note";
import {
  POSITIONS_MAX, RYTHME_LIBRE, hauteursDuCercle, motifDuRythme, type Repartition,
} from "../audio/cercle";
import { useI18n } from "../i18n";

import {
  ajusterMotif, disposerCercle, lireMotif, nettoyerMotif, nomsTiennent, placeSousLePoint, TAILLE_NOM,
} from "./cercle-disposition";
import type { VueProps } from "./vues";

/** Le carré du document. Les coordonnées du calcul vont de moins un à un ; on les y ramène. */
const C = 1000;
const MARGE = 0.82;

const versDocument = (v: number) => C / 2 + v * (C / 2) * MARGE;


/**
 * Le cercle d'un composant, cliquable.
 *
 * `avecHauteurs` distingue les deux éditeurs : le mélodique nomme chaque sommet de la note qu'il
 * portera, le rythmique n'a qu'un son pour tout le cercle et n'a donc rien à écrire dessus.
 */
export function CercleVue({ id, data, avecHauteurs }: VueProps & { avecHauteurs?: boolean }) {
  const { t } = useI18n();
  const { setNodes } = useReactFlow();
  const [survol, setSurvol] = useState<number | null>(null);

  const parametres = (data as { parametres?: Record<string, unknown> }).parametres ?? {};
  // UN RYTHME CHOISI DANS LA LISTE GOUVERNE LE MOTIF SAISI, et le dessin suit la même règle que le
  // composant : ce qu'on voit est donc toujours ce qui sortira. Voir `motifDuRythme`.
  const motif = nettoyerMotif(motifDuRythme(
    String(parametres["Rythme"] ?? RYTHME_LIBRE),
    String(parametres["Motif"] ?? "1000100010001000"),
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

  const surClic = (e: React.MouseEvent<SVGSVGElement>) => {
    const boite = e.currentTarget.getBoundingClientRect();
    // Du pixel vers le cercle unité : c'est la seule conversion que la vue fait elle-même.
    const x = ((e.clientX - boite.left) / boite.width * C - C / 2) / ((C / 2) * MARGE);
    const y = ((e.clientY - boite.top) / boite.height * C - C / 2) / ((C / 2) * MARGE);
    const place = placeSousLePoint(x, y, positions);
    if (place !== null) basculer(place);
  };

  const changerPositions = (delta: number) => {
    const n = Math.max(2, Math.min(POSITIONS_MAX, positions + delta));
    ecrire(ajusterMotif(motif, n));
  };

  const quiSonnent = disposition.pastilles.filter((p) => p.sonne);
  const r = disposition.rayonPastille * (C / 2) * MARGE;

  // LES NOMS PARAISSENT TOUS OU AUCUN, et la décision se prend sur le plus long d'entre eux. Voir
  // `nomsTiennent` : à quarante-huit places un dièse déborde de sa pastille et touche sa voisine.
  const nomsDesSommets = avecHauteurs
    ? hauteursDuCercle(positions, quiSonnent.map((p) => p.place), fondamentale, repartition).map(nomNote)
    : [];
  const nomsVisibles = nomsDesSommets.length > 0
    && nomsTiennent(r, Math.max(...nomsDesSommets.map((n) => n.length)));

  return (
    <div className="cercle-vue" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
      <div className="cercle-barre nodrag">
        <button title={t("cercle.moins")} onClick={() => changerPositions(-1)} disabled={positions <= 2}>−</button>
        <span className="cercle-compte">{positions}</span>
        <button title={t("cercle.plus")} onClick={() => changerPositions(1)} disabled={positions >= POSITIONS_MAX}>+</button>
        <span className="cercle-attaques">{quiSonnent.length} {t("cercle.attaques")}</span>
      </div>

      <svg className="cercle-svg" viewBox={`0 0 ${C} ${C}`} onClick={surClic}>
        <circle className="cercle-piste" cx={C / 2} cy={C / 2} r={(C / 2) * MARGE} />

        {/* LE POLYGONE INSCRIT, tracé avant les pastilles pour passer dessous. Deux sommets ne font
            qu'une corde, et un seul ne fait rien : le tracé n'a de sens qu'à partir de deux. */}
        {disposition.polygone.length >= 2 && (
          <polygon className="cercle-polygone"
            points={disposition.polygone.map((p) => `${versDocument(p.x)},${versDocument(p.y)}`).join(" ")} />
        )}

        {disposition.pastilles.map((p) => {
          const rang = quiSonnent.findIndex((q) => q.place === p.place);
          // Le nom reste dans l'infobulle même quand il ne tient pas dans la pastille : on le lit
          // alors en survolant, plutôt que de devoir agrandir le nœud pour savoir ce qui sonne.
          const nom = rang >= 0 ? nomsDesSommets[rang] : undefined;
          return (
            <g key={p.place} onMouseEnter={() => setSurvol(p.place)} onMouseLeave={() => setSurvol(null)}>
              <circle
                className={`cercle-pastille${p.sonne ? " sonne" : ""}${survol === p.place ? " survolee" : ""}`}
                cx={versDocument(p.x)} cy={versDocument(p.y)} r={r} />
              {nom !== undefined && nomsVisibles && (
                <text className="cercle-nom" fontSize={TAILLE_NOM}
                  x={versDocument(p.x)} y={versDocument(p.y)}
                  textAnchor="middle" dominantBaseline="middle" pointerEvents="none">
                  {nom}
                </text>
              )}
              <title>{nom !== undefined ? `${p.place} · ${nom}` : String(p.place)}</title>
            </g>
          );
        })}

        {/* La place zéro est en haut : un repère le dit, sans quoi un motif tourné serait illisible. */}
        <line className="cercle-repere" x1={C / 2} y1={C / 2 - (C / 2) * MARGE - r - 6}
          x2={C / 2} y2={C / 2 - (C / 2) * MARGE + r + 6} />
      </svg>
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
