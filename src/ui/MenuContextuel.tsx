// ui/MenuContextuel.tsx — Le menu du clic droit sur le canevas.
//
// Le canevas interceptait déjà `contextmenu`, mais seulement pour supprimer le menu du navigateur : il
// n'en proposait aucun. Celui-ci ne porte que les gestes des bulles. Il se ferme au clic ailleurs, à la
// molette et à Échap, et il ne dépasse jamais la fenêtre.
//
// ATTENTION, LE BOUTON DROIT DÉPLACE AUSSI LA VUE (`panOnDrag={[2]}`) : l'appelant ne l'ouvre que si le
// pointeur n'a pas bougé entre la descente du bouton et l'événement de menu.

import { useEffect, useRef, useState } from "react";

export interface EntreeMenu {
  cle: string;
  libelle: string;
  titre?: string;
  action: () => void;
}

export interface EtatMenu {
  x: number;
  y: number;
  entrees: EntreeMenu[];
}

export function MenuContextuel({ etat, onFermer }: { etat: EtatMenu | null; onFermer: () => void }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [place, setPlace] = useState<{ x: number; y: number } | null>(null);

  // Replacé APRÈS la mesure : un menu ouvert près du bord droit sortirait de la fenêtre, et on ne
  // connaît sa taille qu'une fois monté.
  useEffect(() => {
    if (!etat || !ref.current) { setPlace(null); return; }
    const r = ref.current.getBoundingClientRect();
    setPlace({
      x: Math.min(etat.x, window.innerWidth - r.width - 8),
      y: Math.min(etat.y, window.innerHeight - r.height - 8),
    });
  }, [etat]);

  useEffect(() => {
    if (!etat) return;
    const fermer = () => onFermer();
    const surTouche = (e: KeyboardEvent) => { if (e.key === "Escape") onFermer(); };
    window.addEventListener("pointerdown", fermer);
    window.addEventListener("wheel", fermer, { passive: true });
    window.addEventListener("keydown", surTouche);
    return () => {
      window.removeEventListener("pointerdown", fermer);
      window.removeEventListener("wheel", fermer);
      window.removeEventListener("keydown", surTouche);
    };
  }, [etat, onFermer]);

  if (!etat || etat.entrees.length === 0) return null;
  return (
    <div
      ref={ref}
      className="attic-menu-contextuel"
      style={{ left: place?.x ?? etat.x, top: place?.y ?? etat.y }}
      onPointerDown={(e) => e.stopPropagation()}
      role="menu"
    >
      {etat.entrees.map((e) => (
        <button
          key={e.cle}
          className="attic-menu-contextuel-item"
          title={e.titre}
          role="menuitem"
          onClick={() => { onFermer(); e.action(); }}
        >
          {e.libelle}
        </button>
      ))}
    </div>
  );
}
