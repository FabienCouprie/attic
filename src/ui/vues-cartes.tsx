// ui/vues-cartes.tsx — Les cartes, et le trace d'une courbe.
//
// Une part des vues de noeud, decoupees par domaine. Le registre qui les associe a un
// identifiant de fiche vit dans `vues.tsx`, avec le type `VueProps` que toutes recoivent.
// Aucune ligne n'a ete retouchee au passage.

import { useState } from "react";
import { useI18n } from "../i18n";
import type { VueProps } from "./vues";

export function VueCarteSonore({ data }: VueProps) {
  const { t } = useI18n();
  const [erreur, setErreur] = useState<string | null>(null);
  const htmlPath = (data as any)._affichage?.htmlPath as string | undefined;
  const message = data.audioResultatMessage ?? "";

  async function ouvrirDansNavigateur() {
    if (!htmlPath) return;
    setErreur(null);
    const api = (window as any).api;
    if (!api?.ouvrirChemin) {
      setErreur(t("msg.n_cessite_electron"));
      return;
    }
    const res = await api.ouvrirChemin(htmlPath);
    if (!res?.ok) setErreur(res?.erreur || t("msg.erreur_ouverture"));
  }

  return (
    <div className="nodrag" onPointerDown={(e) => e.stopPropagation()} style={{ padding: "4px 2px", minWidth: 220 }}>
      {!htmlPath ? (
        <div style={{ padding: 8, fontSize: 11, opacity: 0.6 }}>
          {t("export.avantLancer")}
        </div>
      ) : (
        <>
          <button className="attic-node-fichier-btn" style={{ display: "block", width: "100%", marginBottom: 6 }} onClick={ouvrirDansNavigateur}>
            🌐 {t("btn.ouvrir_navigateur")}
          </button>
          <div style={{ fontSize: 10, opacity: 0.55, wordBreak: "break-all" }}>{htmlPath}</div>
          {message && <div style={{ fontSize: 10, marginTop: 6, color: "var(--text-secondary)", whiteSpace: "pre-line" }}>{message}</div>}
          {erreur && <div style={{ fontSize: 10, marginTop: 6, color: "#e76f51" }}>{erreur}</div>}
        </>
      )}
    </div>
  );
}

// ── Coordonnées sur carte (variante de Carte sonore pilotée par des
// coordonnées reçues en entrée — carte-sonore.ts et VueCarteSonore ne sont
// pas modifiés, ceci est une copie adaptée volontairement séparée) ──
export function VueCoordonneesSurCarte({ data }: VueProps) {
  const { t } = useI18n();
  const [erreur, setErreur] = useState<string | null>(null);
  const htmlPath = (data as any)._affichage?.htmlPath as string | undefined;
  const message = data.audioResultatMessage ?? "";

  async function ouvrirDansNavigateur() {
    if (!htmlPath) return;
    setErreur(null);
    const api = (window as any).api;
    if (!api?.ouvrirChemin) {
      setErreur(t("msg.n_cessite_electron"));
      return;
    }
    const res = await api.ouvrirChemin(htmlPath);
    if (!res?.ok) setErreur(res?.erreur || t("msg.erreur_ouverture"));
  }

  return (
    <div className="nodrag" onPointerDown={(e) => e.stopPropagation()} style={{ padding: "4px 2px", minWidth: 220 }}>
      {!htmlPath ? (
        <div style={{ padding: 8, fontSize: 11, opacity: 0.6 }}>
          {t("export.avantLancer")}
        </div>
      ) : (
        <>
          <button className="attic-node-fichier-btn" style={{ display: "block", width: "100%", marginBottom: 6 }} onClick={ouvrirDansNavigateur}>
            🌐 {t("btn.ouvrir_navigateur")}
          </button>
          <div style={{ fontSize: 10, opacity: 0.55, wordBreak: "break-all" }}>{htmlPath}</div>
          {message && <div style={{ fontSize: 10, marginTop: 6, color: "var(--text-secondary)", whiteSpace: "pre-line" }}>{message}</div>}
          {erreur && <div style={{ fontSize: 10, marginTop: 6, color: "#e76f51" }}>{erreur}</div>}
        </>
      )}
    </div>
  );
}


/**
 * La courbe qu'un nœud vient de produire, tracée sur le nœud lui-même.
 *
 * CE QUI MANQUAIT LE PLUS. On branchait une modulation et rien à l'écran ne disait ce qu'elle
 * faisait : ni sa forme, ni son amplitude, ni si elle bougeait. Pour une courbe engendrée on
 * pouvait encore la deviner des réglages ; pour un suiveur de caractéristique — la brillance d'un
 * son, son énergie — personne ne peut la prévoir, et c'est justement celle-là qu'il faut voir.
 *
 * L'échelle verticale est fixe, de zéro à un, et ne se normalise pas. Une courbe qui ne bouge
 * presque pas DOIT se voir comme une ligne presque plate : l'étirer pour remplir le cadre
 * montrerait un beau relief là où le paramètre ne bouge pas, ce qui est le contraire du service
 * rendu. Les deux tirets marquent le tiers et les deux tiers, de quoi juger d'un coup d'œil.
 */
export function VueCourbe({ data }: VueProps) {
  const points = (data as unknown as { apercuCourbe?: number[] }).apercuCourbe;
  if (!points || points.length < 2) return null;
  const L = 200, H = 46;
  const trace = points
    .map((v, i) => `${((i / (points.length - 1)) * L).toFixed(1)},${(H - v * H).toFixed(1)}`)
    .join(" ");
  const bas = Math.min(...points), haut = Math.max(...points);
  return (
    <div className="attic-node-courbe">
      <svg viewBox={`0 0 ${L} ${H}`} preserveAspectRatio="none" role="img"
        aria-label={`Courbe de modulation, de ${bas.toFixed(2)} a ${haut.toFixed(2)}`}>
        <line x1="0" y1={H / 3} x2={L} y2={H / 3} className="attic-node-courbe-repere" />
        <line x1="0" y1={(2 * H) / 3} x2={L} y2={(2 * H) / 3} className="attic-node-courbe-repere" />
        <polyline points={trace} className="attic-node-courbe-trace" />
      </svg>
      <div className="attic-node-courbe-bornes"><span>{bas.toFixed(2)}</span><span>{haut.toFixed(2)}</span></div>
    </div>
  );
}

// ── Registre : id (ou prédicat) → vue(s), position relative au lecteur ──
