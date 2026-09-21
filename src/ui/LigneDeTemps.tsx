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

export interface PisteMontage { piste: number; duree: number }

const HAUTEUR_PISTE = 34, REGLE = 22, POIGNEE = 9;
const DUREE_INCONNUE = 2;

/** Un pas de graduation lisible pour une étendue donnée : 1, 2, 5, 10… secondes. */
export function pasDeGraduation(etendueS: number, largeurPx: number): number {
  const brut = etendueS / Math.max(1, largeurPx / 70);
  const puissance = Math.pow(10, Math.floor(Math.log10(Math.max(brut, 1e-3))));
  for (const m of [1, 2, 5, 10]) if (m * puissance >= brut) return m * puissance;
  return 10 * puissance;
}

type Prise = {
  piste: number; quoi: "corps" | "entree" | "sortie"; x0: number; valeur0: number;
  /** L'échelle figée pendant le geste : déplacer la dernière piste change l'étendue affichée, et une
   *  échelle recalculée à chaque mouvement ferait glisser la barre sous le pointeur. */
  vue: { debutMin: number; etendue: number };
};

export function LigneDeTemps({ pistes, branchees, params, onChanger }: {
  /** Les durées de la dernière exécution. */
  pistes: PisteMontage[];
  /** Les rangs des pistes branchées maintenant. */
  branchees: number[];
  params: Record<string, unknown>;
  onChanger: (nom: string, valeur: number) => void;
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

  const num = (nom: string, defaut: number) => { const v = Number(params[nom]); return Number.isFinite(v) ? v : defaut; };
  const lignes = [...branchees].sort((a, b) => a - b).map((k) => {
    const connue = pistes.find((p) => p.piste === k);
    return {
      k, connue: !!connue,
      duree: connue?.duree ?? DUREE_INCONNUE,
      debut: num(`Début ${k + 1}`, k * 2),
      gain: num(`Gain ${k + 1}`, 0),
      entree: num(`Fondu entrée ${k + 1}`, 10) / 1000,
      sortie: num(`Fondu sortie ${k + 1}`, 10) / 1000,
    };
  });

  if (!lignes.length) {
    return <div className="ligne-temps ligne-temps-vide">{t("montage.aucunePiste")}</div>;
  }

  const calculee = {
    debutMin: Math.min(0, ...lignes.map((l) => l.debut)),
    etendue: Math.max(4, (Math.max(...lignes.map((l) => l.debut + l.duree)) - Math.min(0, ...lignes.map((l) => l.debut))) * 1.08),
  };
  const { debutMin, etendue } = prise?.vue ?? calculee;
  const zoneG = 44;
  const utile = Math.max(100, largeur - zoneG - 8);
  const px = utile / etendue;
  const X = (s: number) => zoneG + (s - debutMin) * px;
  const pas = pasDeGraduation(etendue, utile);
  const graduations: number[] = [];
  for (let s = Math.ceil(debutMin / pas) * pas; s <= debutMin + etendue; s += pas) graduations.push(+s.toFixed(6));
  const hauteur = REGLE + lignes.length * HAUTEUR_PISTE + 6;
  const virgule = (v: number, d: number) => (lang === "en" ? v.toFixed(d) : v.toFixed(d).replace(".", ","));

  const saisir = (e: React.PointerEvent, l: typeof lignes[number], quoi: Prise["quoi"]) => {
    e.preventDefault(); e.stopPropagation();
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    const valeur0 = quoi === "corps" ? l.debut : quoi === "entree" ? l.entree : l.sortie;
    setPrise({ piste: l.k, quoi, x0: e.clientX, valeur0, vue: { debutMin, etendue } });
  };
  const bouger = (e: React.PointerEvent) => {
    if (!prise) return;
    const ds = (e.clientX - prise.x0) / px;
    const l = lignes.find((x) => x.k === prise.piste);
    if (!l) return;
    // Au centième de seconde : assez fin pour placer, assez rond pour se relire.
    if (prise.quoi === "corps") {
      onChanger(`Début ${l.k + 1}`, Math.round((prise.valeur0 + ds) * 100) / 100);
    } else {
      // Tirer le coin gauche vers la droite allonge le fondu d'entrée ; le coin droit vers la gauche, celui de sortie.
      const v = prise.quoi === "entree" ? prise.valeur0 + ds : prise.valeur0 - ds;
      const borne = Math.max(0, Math.min(l.duree, v));
      onChanger(prise.quoi === "entree" ? `Fondu entrée ${l.k + 1}` : `Fondu sortie ${l.k + 1}`, Math.round(borne * 1000));
    }
  };
  const lacher = (e: React.PointerEvent) => {
    if (!prise) return;
    (e.currentTarget as Element).releasePointerCapture?.(e.pointerId);
    setPrise(null);
  };

  return (
    <div className="ligne-temps" ref={boite}>
      <svg width={largeur} height={hauteur} role="img" aria-label={t("montage.ligneTemps")}
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
              {we > 0 && <path d={`M${x0},${y + h} L${x0},${y} L${x0 + we},${y} Z`} className="ligne-temps-fondu" pointerEvents="none" />}
              {ws > 0 && <path d={`M${x0 + w},${y + h} L${x0 + w},${y} L${x0 + w - ws},${y} Z`} className="ligne-temps-fondu" pointerEvents="none" />}
              <rect x={x0 + we - POIGNEE / 2} y={y - 2} width={POIGNEE} height={POIGNEE} rx={2} className="ligne-temps-poignee"
                style={{ cursor: "ew-resize" }} onPointerDown={(e) => saisir(e, l, "entree")}>
                <title>{t("montage.fonduEntree")}</title>
              </rect>
              <rect x={x0 + w - ws - POIGNEE / 2} y={y - 2} width={POIGNEE} height={POIGNEE} rx={2} className="ligne-temps-poignee"
                style={{ cursor: "ew-resize" }} onPointerDown={(e) => saisir(e, l, "sortie")}>
                <title>{t("montage.fonduSortie")}</title>
              </rect>
              {w > 70 && (
                <text x={x0 + Math.max(we, 6)} y={y + h - 7} className="ligne-temps-texte ligne-temps-legende" pointerEvents="none">
                  {`${virgule(l.debut, 2)} s${l.gain !== 0 ? ` · ${l.gain > 0 ? "+" : ""}${virgule(l.gain, 1)} dB` : ""}`}
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
