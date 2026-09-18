// ui/InfobulleFiche.tsx — Le panneau qui s'affiche au survol d'un nœud du catalogue.
//
// Il remplace l'attribut `title` : celui-ci mettait une seconde à paraître et ne savait
// montrer qu'un bloc de texte. Ici, le résumé et les ports d'un coup d'œil, tout de
// suite. Le contenu et le placement sont calculés dans `infobulle-fiche.ts`, testé ;
// ce fichier ne fait que les poser à l'écran.
import { useLayoutEffect, useRef, useState } from "react";
import { useI18n } from "../i18n";
import { positionInfobulle, type ContenuInfobulle, type Rectangle } from "./infobulle-fiche";

export function InfobulleFiche({ contenu, cible }: { contenu: ContenuInfobulle; cible: Rectangle }) {
  const { t } = useI18n();
  const ref = useRef<HTMLDivElement | null>(null);
  // Première passe hors de l'écran : la position dépend de la taille du panneau, qui
  // dépend du texte. On mesure, puis on pose — sans que l'intermédiaire soit visible.
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos(positionInfobulle(
      cible,
      { largeur: r.width, hauteur: r.height },
      { largeur: window.innerWidth, hauteur: window.innerHeight },
    ));
  }, [cible, contenu]);

  const colonne = (titre: string, ports: ContenuInfobulle["entrees"], cote: string) => (
    <div className={`attic-infobulle-col ${cote}`}>
      <div className="attic-infobulle-col-titre">{titre}</div>
      {ports.length === 0 && <div className="attic-infobulle-port-vide">—</div>}
      {ports.map((p, i) => (
        <div key={`${p.nom}-${i}`} className="attic-infobulle-port" title={p.libelleType}>
          <span className="attic-infobulle-puce" style={{ background: p.couleur }} />
          <span className="attic-infobulle-port-nom">{p.nom}</span>
          <span className="attic-infobulle-port-type">{p.libelleType}</span>
        </div>
      ))}
    </div>
  );

  return (
    <div
      ref={ref}
      className="attic-infobulle"
      role="tooltip"
      style={pos ? { left: pos.left, top: pos.top } : { left: -9999, top: -9999 }}
    >
      <div className="attic-infobulle-nom">{contenu.nom}</div>
      {contenu.resume && <div className="attic-infobulle-resume">{contenu.resume}</div>}
      <div className="attic-infobulle-ports">
        {colonne(t("infobulle.entrees"), contenu.entrees, "entrees")}
        {colonne(t("infobulle.sorties"), contenu.sorties, "sorties")}
      </div>
    </div>
  );
}
