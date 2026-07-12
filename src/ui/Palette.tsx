// ui/Palette.tsx — Catalogue des nœuds
import { useMemo, useState } from "react";
import type { PluginDef } from "../core";
import { useI18n } from "../i18n";

const COULEURS: Record<string, string> = {
  Entrées: "#4c6ef5", Traitement: "#495057", Sorties: "#e8590c",
  Collections: "#2b8a3e", Visualisation: "#ae3ec9", "Méta-composants": "#c2255c",
  "Nouvelles fonctionnalités": "#1a73e8",
  Autres: "#fab005",
};

interface Props { plugins: PluginDef[]; onAjouter: (id: string) => void; onSupprimerMeta?: (id: string) => void }

export function Palette({ plugins, onAjouter, onSupprimerMeta }: Props) {
  const [q, setQ] = useState("");
  const { t, lang } = useI18n();

  function nomDef(def: PluginDef) { return lang === "en" && def.nomEn ? def.nomEn : def.nom; }

  const filtres = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return plugins;
    return plugins.filter((p) =>
      p.nom.toLowerCase().includes(s) ||
      p.resume.toLowerCase().includes(s) ||
      p.famille.toLowerCase().includes(s) ||
      (p.nomEn || "").toLowerCase().includes(s) ||
      (p.resumeEn || "").toLowerCase().includes(s) ||
      (lang === "en" ? t(`famille.${p.famille}`) : "").toLowerCase().includes(s)
    );
  }, [q, plugins]);

  const groupes = useMemo(() => {
    const map = new Map<string, Map<string, PluginDef[]>>();
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
    setReplies((prev) => { const n = new Set(prev); n.has(cle) ? n.delete(cle) : n.add(cle); return n; });
  }
  // Un groupe est ouvert s'il n'est pas replié — mais une recherche déplie tout
  // pour que les résultats restent visibles.
  const ouvert = (cle: string) => !!q.trim() || !replies.has(cle);

  return (
    <div className="palette">
      <div className="palette-titre">{t("palette.titre")}</div>
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
                    <div key={def.id} className="palette-composant" draggable
                      onDragStart={(e) => { e.dataTransfer.setData("application/attic-fiche-id", def.id); e.dataTransfer.effectAllowed = "move"; }}
                      onClick={() => onAjouter(def.id)}
                      title={def.resume}
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
    </div>
  );
}
