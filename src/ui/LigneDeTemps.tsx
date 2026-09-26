// ui/LigneDeTemps.tsx — La ligne de temps du Montage, dans l'inspecteur.
//
// Une règle en secondes et une barre par piste branchée, à son instant et à sa durée réelle. On
// déplace une piste en tirant sa barre, on règle ses fondus en tirant ses coins supérieurs. Les
// réglages numériques restent en dessous, pour la précision : la ligne de temps les écrit, ils la
// relisent — il n'y a qu'une vérité, les paramètres du nœud.
//
// LES DURÉES VIENNENT DE LA DERNIÈRE EXÉCUTION. Seule l'exécution connaît la longueur d'un son
// branché ; tant que le graphe n'a pas tourné, une piste branchée s'affiche en pointillé sur une
// durée nominale, et la ligne de temps le dit.

import { useEffect, useRef, useState } from "react";
import { useI18n } from "../i18n";
import {
  MODELE_MONTAGE, disposerPistes, echelle, pasDeGraduation, valeurAuRepos, valeurDuGeste,
  type Geste, type LigneMontage, type ModeleLigne, type PisteMontage, type Vue,
} from "./ligne-temps-calcul";

export type { PisteMontage } from "./ligne-temps-calcul";
export { pasDeGraduation } from "./ligne-temps-calcul";

const HAUTEUR_PISTE = 34, REGLE = 22, POIGNEE = 9;

type Prise = Geste & {
  x0: number;
  /** L'échelle figée pendant le geste : déplacer la dernière piste change l'étendue affichée, et une
   *  échelle recalculée à chaque mouvement ferait glisser la barre sous le pointeur. */
  vue: Vue;
};

export function LigneDeTemps({ pistes, branchees, params, onChanger, modele = MODELE_MONTAGE }: {
  /** Les durées de la dernière exécution. */
  pistes: PisteMontage[];
  /** Les rangs des pistes branchées maintenant. */
  branchees: number[];
  params: Record<string, unknown>;
  onChanger: (nom: string, valeur: number) => void;
  /** Ce qu'une barre veut dire ici. Par défaut celle du Montage, qui est la première à s'en servir. */
  modele?: ModeleLigne;
}) {
  const { t, lang } = useI18n();
  const boite = useRef<HTMLDivElement>(null);
  const [largeur, setLargeur] = useState(400);
  const [prise, setPrise] = useState<Prise | null>(null);

  useEffect(() => {
    const el = boite.current;
    if (!el) return;
    const obs = new ResizeObserver(() => setLargeur(el.clientWidth || 400));
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const lignes = disposerPistes(branchees, pistes, params, modele);

  if (!lignes.length) {
    return <div className="ligne-temps ligne-temps-vide">{t(modele.cleVide)}</div>;
  }

  const { debutMin, etendue } = prise?.vue ?? echelle(lignes);
  const zoneG = 44;
  const utile = Math.max(100, largeur - zoneG - 8);
  const px = utile / etendue;
  const X = (s: number) => zoneG + (s - debutMin) * px;
  const pas = pasDeGraduation(etendue, utile);
  const graduations: number[] = [];
  for (let s = Math.ceil(debutMin / pas) * pas; s <= debutMin + etendue; s += pas) graduations.push(+s.toFixed(6));
  const hauteur = REGLE + lignes.length * HAUTEUR_PISTE + 6;
  const virgule = (v: number, d: number) => (lang === "en" ? v.toFixed(d) : v.toFixed(d).replace(".", ","));
  /** Le second nombre écrit dans la barre. Il n'y paraît que s'il dit quelque chose. */
  const legende = (l: LigneMontage) => {
    if (modele.legende === "gain" && l.gain !== 0) return ` · ${l.gain > 0 ? "+" : ""}${virgule(l.gain, 1)} dB`;
    if (modele.legende === "transposition" && l.transposition !== 0) {
      return ` · ${l.transposition > 0 ? "+" : ""}${virgule(l.transposition, 1)}`;
    }
    return "";
  };

  const saisir = (e: React.PointerEvent, l: LigneMontage, quoi: Prise["quoi"]) => {
    e.preventDefault(); e.stopPropagation();
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    setPrise({ piste: l.k, quoi, x0: e.clientX, valeur0: valeurAuRepos(quoi, l), vue: { debutMin, etendue } });
  };
  const bouger = (e: React.PointerEvent) => {
    if (!prise) return;
    const l = lignes.find((x) => x.k === prise.piste);
    if (!l) return;
    const { nom, valeur } = valeurDuGeste(prise, (e.clientX - prise.x0) / px, l);
    onChanger(nom, valeur);
  };
  const lacher = (e: React.PointerEvent) => {
    if (!prise) return;
    (e.currentTarget as Element).releasePointerCapture?.(e.pointerId);
    setPrise(null);
  };

  return (
    <div className="ligne-temps" ref={boite}>
      <svg width={largeur} height={hauteur} role="img" aria-label={t(modele.cleTitre)}
        onPointerMove={bouger} onPointerUp={lacher} onPointerCancel={lacher}>
        {graduations.map((s) => (
          <g key={s}>
            <line x1={X(s)} x2={X(s)} y1={REGLE - 6} y2={hauteur} className="ligne-temps-grad" />
            <text x={X(s) + 3} y={REGLE - 9} className="ligne-temps-texte">{virgule(s, pas < 1 ? 1 : 0)} s</text>
          </g>
        ))}
        <line x1={X(0)} x2={X(0)} y1={REGLE - 6} y2={hauteur} className="ligne-temps-zero" />
        {lignes.map((l, rangee) => {
          const y = REGLE + rangee * HAUTEUR_PISTE + 4, h = HAUTEUR_PISTE - 8;
          const x0 = X(l.debut), w = Math.max(2, l.duree * px);
          const we = Math.min(w, l.entree * px), ws = Math.min(w, l.sortie * px);
          return (
            <g key={l.k} className={`ligne-temps-piste${l.connue ? "" : " ligne-temps-inconnue"}${prise?.piste === l.k ? " ligne-temps-prise" : ""}`}>
              <text x={4} y={y + h / 2 + 4} className="ligne-temps-texte">{`${lang === "en" ? "T" : "P"}${l.k + 1}`}</text>
              <rect x={x0} y={y} width={w} height={h} rx={3} className="ligne-temps-barre"
                style={{ cursor: "grab" }} onPointerDown={(e) => saisir(e, l, "corps")} />
              {/* Les fondus : deux triangles qui mangent les coins, comme sur un banc de montage. */}
              {modele.poignees.includes("entree") && we > 0
                && <path d={`M${x0},${y + h} L${x0},${y} L${x0 + we},${y} Z`} className="ligne-temps-fondu" pointerEvents="none" />}
              {modele.poignees.includes("sortie") && ws > 0
                && <path d={`M${x0 + w},${y + h} L${x0 + w},${y} L${x0 + w - ws},${y} Z`} className="ligne-temps-fondu" pointerEvents="none" />}
              {modele.poignees.includes("entree") && (
                <rect x={x0 + we - POIGNEE / 2} y={y - 2} width={POIGNEE} height={POIGNEE} rx={2} className="ligne-temps-poignee"
                  style={{ cursor: "ew-resize" }} onPointerDown={(e) => saisir(e, l, "entree")}>
                  <title>{t("montage.fonduEntree")}</title>
                </rect>
              )}
              {modele.poignees.includes("sortie") && (
                <rect x={x0 + w - ws - POIGNEE / 2} y={y - 2} width={POIGNEE} height={POIGNEE} rx={2} className="ligne-temps-poignee"
                  style={{ cursor: "ew-resize" }} onPointerDown={(e) => saisir(e, l, "sortie")}>
                  <title>{t("montage.fonduSortie")}</title>
                </rect>
              )}
              {/* LA DURÉE SE TIRE PAR LE BORD DROIT, sur toute la hauteur de la barre : ce n'est pas
                  un coin qu'on entame, c'est la barre entière qu'on allonge. */}
              {modele.poignees.includes("duree") && (
                <rect x={x0 + w - POIGNEE / 2} y={y} width={POIGNEE} height={h} rx={2} className="ligne-temps-poignee"
                  style={{ cursor: "ew-resize" }} onPointerDown={(e) => saisir(e, l, "duree")}>
                  <title>{t("maquette.dureeBoite")}</title>
                </rect>
              )}
              {w > 70 && (
                <text x={x0 + Math.max(we, 6)} y={y + h - 7} className="ligne-temps-texte ligne-temps-legende" pointerEvents="none">
                  {`${virgule(l.debut, 2)} s${legende(l)}`}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      {lignes.some((l) => !l.connue) && <div className="ligne-temps-note">{t("montage.dureesInconnues")}</div>}
    </div>
  );
}
