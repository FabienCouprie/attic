// ui/Palette.tsx — Catalogue des nœuds
import { useEffect, useMemo, useRef, useState } from "react";
import type { FicheAudio } from "../audio/types-domaine";
import { useI18n } from "../i18n";
import { registre } from "../audio/adaptateur";
import { filtrerFiches } from "./recherche-palette";
import { nomFiche, resumeFiche } from "./libelles-fiche";
import { contenuInfobulle, type ContenuInfobulle, type Rectangle } from "./infobulle-fiche";
import { InfobulleFiche } from "./InfobulleFiche";

// Le survol ouvre après un court délai : parcourir la liste à la souris ne doit pas
// faire clignoter un panneau à chaque entrée traversée. 120 ms se ressent comme
// immédiat, là où l'infobulle du système demandait près d'une seconde.
const DELAI_SURVOL_MS = 120;

const COULEURS: Record<string, string> = {
  Entrées: "#4c6ef5", Traitement: "#495057", Sorties: "#e8590c",
  Collections: "#2b8a3e", Visualisation: "#ae3ec9", "Méta-composants": "#c2255c",
  "Nouvelles fonctionnalités": "#1a73e8",
  Autres: "#fab005",
};

interface Props {
  plugins: FicheAudio[];
  onSupprimerMeta?: (id: string) => void;
  ouverte?: boolean;
  onToggle?: () => void;
}

export function Palette({ plugins, onSupprimerMeta, ouverte = true, onToggle }: Props) {
  const [q, setQ] = useState("");
  const { t, lang } = useI18n();

  function nomDef(def: FicheAudio) { return nomFiche(def, lang); }

  // ── Infobulle maison ──
  const [survol, setSurvol] = useState<{ contenu: ContenuInfobulle; cible: Rectangle } | null>(null);
  const minuterie = useRef<number | null>(null);

  const annulerOuverture = () => {
    if (minuterie.current !== null) { window.clearTimeout(minuterie.current); minuterie.current = null; }
  };
  const fermerInfobulle = () => { annulerOuverture(); setSurvol(null); };
  const ouvrirInfobulle = (def: FicheAudio, el: HTMLElement) => {
    annulerOuverture();
    const r = el.getBoundingClientRect();
    const cible = { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
    minuterie.current = window.setTimeout(() => {
      setSurvol({
        contenu: contenuInfobulle(def, lang, {
          couleurFlux: (type) => registre.couleurFlux(type),
          libelleType: (type) => {
            // Le libellé du registre est français ; le dictionnaire traduit ceux qu'il
            // connaît, et un type venu d'un plugin garde le sien plutôt que rien.
            const cle = `typeFlux.${type}`;
            const traduit = t(cle);
            return traduit === cle ? (registre.typeFlux(type)?.libelle ?? type) : traduit;
          },
        }),
        cible,
      });
    }, DELAI_SURVOL_MS);
  };

  // Le panneau est en position fixe : il suivrait mal un défilement ou un
  // redimensionnement, et resterait affiché pendant un glisser-déposer. On le ferme.
  useEffect(() => {
    const fermer = () => fermerInfobulle();
    window.addEventListener("scroll", fermer, true);
    window.addEventListener("resize", fermer);
    window.addEventListener("dragstart", fermer);
    return () => {
      window.removeEventListener("scroll", fermer, true);
      window.removeEventListener("resize", fermer);
      window.removeEventListener("dragstart", fermer);
      annulerOuverture();
    };
  }, []);

  const filtres = useMemo(
    () => filtrerFiches(plugins, q, (famille) => (lang === "en" ? t(`famille.${famille}`) : "")),
    [q, plugins, lang, t],
  );

  const groupes = useMemo(() => {
    const map = new Map<string, Map<string, FicheAudio[]>>();
    for (const p of filtres) {
      if (!map.has(p.univers)) map.set(p.univers, new Map());
      const fam = map.get(p.univers)!;
      if (!fam.has(p.famille)) fam.set(p.famille, []);
      fam.get(p.famille)!.push(p);
    }
    // « Autres » est toujours la DERNIÈRE rubrique, « Nouvelles fonctionnalités »
    // juste avant. Le tri est stable — les autres univers conservent leur ordre.
    const poids = (u: string) => u === "Autres" ? 2 : u === "Nouvelles fonctionnalités" ? 1 : 0;
    return [...map]
      .sort((a, b) => poids(a[0]) - poids(b[0]))
      .map(([univers, familles]) => ({
        univers,
        familles: [...familles].map(([famille, defs]) => ({ famille, defs: [...defs].sort((a, b) => nomDef(a).localeCompare(nomDef(b))) })),
      }));
  }, [filtres]);

  // Au démarrage, la palette est REPLIÉE au niveau des univers (menu non déployé).
  // L'utilisateur déplie ce dont il a besoin ; une recherche ré-ouvre tout.
  const [replies, setReplies] = useState<Set<string>>(() => new Set(plugins.map((p) => p.univers)));

  function basculer(cle: string) {
    setReplies((prev) => {
      const n = new Set(prev);
      if (n.has(cle)) n.delete(cle);
      else n.add(cle);
      return n;
    });
  }
  // Un groupe est ouvert s'il n'est pas replié — mais une recherche déplie tout
  // pour que les résultats restent visibles.
  const ouvert = (cle: string) => !!q.trim() || !replies.has(cle);

  return (
    <div className={`palette ${ouverte ? "" : "palette--repliee"}`}>
      {ouverte ? (
        <>
          <div className="palette-titre">
            <span>{t("palette.titre")}</span>
            <button className="palette-toggle" title={t("palette.replier")} onClick={onToggle} aria-label={t("palette.replier")}>‹</button>
          </div>
          <input className="palette-recherche" placeholder={t("palette.recherche")} value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="palette-arbre">
            {groupes.map((g) => (
              <div key={g.univers} className="palette-univers">
                <div className="palette-univers-titre" style={{ borderLeftColor: COULEURS[g.univers] ?? "#999" }} onClick={() => basculer(g.univers)}>
                  <span><span className="palette-chevron">{ouvert(g.univers) ? "▾" : "▸"}</span>{t(`univers.${g.univers}`)}</span>
                  <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    {g.univers === "Méta-composants" && onSupprimerMeta && g.familles.reduce((n, f) => n + f.defs.length, 0) > 0 && (
                      <button className="palette-composant-suppr" title={t("palette.effacerToutMeta")}
                        onClick={(e) => { e.stopPropagation(); if (window.confirm(t("palette.confirmEffacer"))) { for (const fg of g.familles) for (const def of fg.defs) onSupprimerMeta(def.id); } }}>🗑</button>
                    )}
                    <span className="palette-compteur">{g.familles.reduce((n, f) => n + f.defs.length, 0)}</span>
                  </span>
                </div>
                {ouvert(g.univers) && g.familles.map((fg) => {
                  const cle = `${g.univers}/${fg.famille}`;
                  return (
                    <div key={cle} className="palette-famille">
                      <div className="palette-famille-titre" onClick={() => basculer(cle)}>
                        <span><span className="palette-chevron">{ouvert(cle) ? "▾" : "▸"}</span>{t(`famille.${fg.famille}`)}</span>
                        <span className="palette-compteur">{fg.defs.length}</span>
                      </div>
                      {ouvert(cle) && fg.defs.map((def) => (
                        <div key={def.id} className="palette-composant" draggable style={{ cursor: "grab" }}
                          onDragStart={(e) => { e.dataTransfer.setData("application/attic-fiche-id", def.id); e.dataTransfer.effectAllowed = "move"; }}
                          // `title` est parti : l'infobulle du système doublait celle-ci,
                          // une seconde plus tard. `aria-label` garde le résumé pour qui
                          // lit la palette autrement qu'à l'œil.
                          aria-label={`${nomDef(def)} — ${resumeFiche(def, lang)}`}
                          onMouseEnter={(e) => ouvrirInfobulle(def, e.currentTarget)}
                          onMouseLeave={fermerInfobulle}
                        >
                          <span className="palette-composant-puce" style={{ background: COULEURS[g.univers] ?? "#999" }} />
                          <span className="palette-composant-nom">{nomDef(def)}</span>
                          {g.univers === "Méta-composants" && onSupprimerMeta && (
                            <button className="palette-composant-suppr" title={t("palette.supprimerMeta")}
                              onClick={(e) => { e.stopPropagation(); onSupprimerMeta(def.id); }}>×</button>
                          )}
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </>
      ) : (
        <button className="palette-toggle palette-toggle--repliee" title={t("palette.deplier")} onClick={onToggle} aria-label={t("palette.deplier")}>›</button>
      )}
      {survol && <InfobulleFiche contenu={survol.contenu} cible={survol.cible} />}
    </div>
  );
}
