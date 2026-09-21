// ui/PanneauInspecteur.tsx — L'inspecteur qu'on peut tirer sur la surface du canevas.
//
// POURQUOI PAR-DESSUS, ET NON EN ÉLARGISSANT LA COLONNE. Élargir la colonne rétrécirait le canevas :
// le graphe se déplacerait, et React Flow le recadrerait sous les yeux de l'utilisateur — tout cela
// pour un besoin passager, lire les huit pistes d'un montage, une longue notice, une plage étroite.
// Le panneau garde donc sa colonne de 280 px et s'étend PAR-DESSUS le canevas, qui ne bouge pas.
// Demandé par Fabien pour le Montage, « à l'occasion » : un double-clic sur la poignée le replie.
//
// La largeur est retenue d'une séance à l'autre — une commodité, sans plus : si le stockage manque,
// le panneau reprend simplement sa largeur ordinaire.

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useI18n } from "../i18n";

export const LARGEUR_ORDINAIRE = 280;
/** Ce qu'on laisse visible à gauche : la palette (260 px) et un peu de canevas pour s'y retrouver. */
const MARGE_GAUCHE = 260 + 80;
const CLE = "attic-inspecteur-largeur";

/** La largeur bornée : jamais sous l'ordinaire, jamais jusqu'à couvrir la palette. */
export function bornerLargeur(l: number, fenetre: number): number {
  return Math.round(Math.max(LARGEUR_ORDINAIRE, Math.min(l, fenetre - MARGE_GAUCHE)));
}

function lireLargeur(): number {
  try {
    const v = Number(localStorage.getItem(CLE));
    return Number.isFinite(v) && v > 0 ? v : LARGEUR_ORDINAIRE;
  } catch { return LARGEUR_ORDINAIRE; }
}
function ecrireLargeur(l: number): void {
  try { localStorage.setItem(CLE, String(l)); } catch { /* commodité seulement */ }
}

export function PanneauInspecteur({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const [largeur, setLargeur] = useState(() => bornerLargeur(lireLargeur(), window.innerWidth));
  const glisse = useRef<{ x: number; l: number } | null>(null);

  const poser = useCallback((l: number) => {
    const b = bornerLargeur(l, window.innerWidth);
    setLargeur(b);
    ecrireLargeur(b);
  }, []);

  // Une fenêtre qu'on rétrécit ne doit pas laisser le panneau recouvrir la palette.
  useEffect(() => {
    const surRedim = () => setLargeur((l) => bornerLargeur(l, window.innerWidth));
    window.addEventListener("resize", surRedim);
    return () => window.removeEventListener("resize", surRedim);
  }, []);

  const deploye = largeur > LARGEUR_ORDINAIRE;
  return (
    <div className="inspecteur-emplacement">
      <div className={`inspecteur-panneau${deploye ? " inspecteur-panneau-deploye" : ""}`} style={{ width: largeur }}>
        <div
          className="inspecteur-poignee"
          role="separator"
          aria-orientation="vertical"
          aria-label={t("inspecteur.poignee")}
          aria-valuenow={largeur}
          aria-valuemin={LARGEUR_ORDINAIRE}
          title={t("inspecteur.poignee")}
          tabIndex={0}
          onPointerDown={(e) => {
            e.preventDefault();
            (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
            glisse.current = { x: e.clientX, l: largeur };
          }}
          onPointerMove={(e) => {
            if (!glisse.current) return;
            // Tirer vers la gauche élargit : le panneau est ancré à droite.
            setLargeur(bornerLargeur(glisse.current.l + glisse.current.x - e.clientX, window.innerWidth));
          }}
          onPointerUp={(e) => {
            if (!glisse.current) return;
            glisse.current = null;
            (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
            ecrireLargeur(largeur);
          }}
          onDoubleClick={() => poser(LARGEUR_ORDINAIRE)}
          onKeyDown={(e) => {
            if (e.key === "ArrowLeft") { e.preventDefault(); poser(largeur + 40); }
            else if (e.key === "ArrowRight") { e.preventDefault(); poser(largeur - 40); }
            else if (e.key === "Home" || e.key === "Escape") { e.preventDefault(); poser(LARGEUR_ORDINAIRE); }
          }}
        />
        {children}
      </div>
    </div>
  );
}
