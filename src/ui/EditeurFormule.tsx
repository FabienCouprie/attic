// ui/EditeurFormule.tsx — Éditeur de formules pour les nœuds mathématiques.
// Le curseur décalé dans les textarea placés dans un nœud ReactFlow (soumis à
// transform: scale(zoom)) est un problème récurrent. La solution utilisée pour
// l'éditeur Python/Julia est reprise ici : le nœud n'affiche qu'un aperçu
// cliquable ; l'édition se fait dans une modale portée sur document.body, hors
// de tout ancêtre transformé, avec un textarea ordinaire.
import { useRef, useState, useCallback, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { useI18n } from "../i18n";
import type { VueProps } from "./vues";
import type { ParametreDef } from "../core/types";

export function EditeurFormule({ id, data, def }: VueProps) {
  const { t } = useI18n();
  const params = useMemo(() => (def?.parametres ?? []).filter((p) => p.type === "texte"), [def]);
  const [ouvert, setOuvert] = useState<ParametreDef | null>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const syncRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const derniereValeur = useRef<string | null>(null);
  const onChange = useCallback((nom: string, v: string) => data.onChangerParametre?.(id, nom, v), [data, id]);

  const synchroniser = useCallback(() => {
    if (syncRef.current) { clearTimeout(syncRef.current); syncRef.current = null; }
    if (ouvert && taRef.current) onChange(ouvert.nom, taRef.current.value);
  }, [onChange, ouvert]);

  const fermer = useCallback(() => {
    synchroniser();
    setOuvert(null);
  }, [synchroniser]);

  const onInput = useCallback(() => {
    const v = taRef.current?.value ?? "";
    derniereValeur.current = v;
    if (syncRef.current) clearTimeout(syncRef.current);
    if (!ouvert) return;
    syncRef.current = setTimeout(() => {
      syncRef.current = null;
      onChange(ouvert.nom, v);
    }, 400);
  }, [onChange, ouvert]);

  useEffect(() => () => {
    if (syncRef.current) {
      clearTimeout(syncRef.current);
      if (ouvert && derniereValeur.current != null) onChange(ouvert.nom, derniereValeur.current);
    }
  }, [onChange, ouvert]);

  if (params.length === 0) return null;

  return (
    <div className="nodrag" onPointerDown={(e) => e.stopPropagation()} style={{ padding: "4px 2px" }}>
      {params.map((p) => {
        const valeur = String(data.parametres?.[p.nom] ?? p.defaut ?? "");
        return (
          <div key={p.nom} style={{ marginBottom: 4 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
              <div style={{ fontSize: 10, opacity: 0.7 }}>{p.nom}</div>
              <button
                onClick={(e) => { e.stopPropagation(); setOuvert(p); }}
                onPointerDown={(e) => e.stopPropagation()}
                style={{
                  fontSize: 10, padding: "1px 6px", cursor: "pointer",
                  border: "1px solid #444", borderRadius: 4,
                  background: "#2a2a35", color: "#bbb",
                }}
                title={t("code.editerTitle")}
              >✎ {t("code.editer")}</button>
            </div>
            <div
              onClick={(e) => { e.stopPropagation(); setOuvert(p); }}
              onPointerDown={(e) => e.stopPropagation()}
              style={{
                minHeight: 32, maxHeight: 72, overflow: "auto",
                fontSize: 11, lineHeight: 1.4,
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
                background: "var(--bg-input, #0d1117)",
                color: "var(--texte, #cbd5e1)",
                border: "1px solid var(--border, #333)",
                borderRadius: 4, padding: "4px 6px", cursor: "pointer",
                whiteSpace: "pre-wrap", wordBreak: "break-all",
              }}
            >
              {valeur || <span style={{ opacity: 0.4 }}>…</span>}
            </div>
          </div>
        );
      })}
      {ouvert && createPortal(
        <div
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { if (e.target === e.currentTarget) fermer(); }}
          onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Escape") fermer(); }}
          style={{
            position: "fixed", inset: 0, zIndex: 10000,
            background: "rgba(0,0,0,0.6)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >
          <div style={{
            width: "min(700px, 92vw)", height: "min(360px, 70vh)",
            display: "flex", flexDirection: "column",
            background: "#1b1b1f", border: "1px solid #3a3a40", borderRadius: 8,
            boxShadow: "0 12px 48px rgba(0,0,0,0.55)",
          }}>
            <div style={{
              display: "flex", alignItems: "center", gap: 8,
              padding: "8px 12px", borderBottom: "1px solid #2c2c31",
              color: "#ddd", fontSize: 13,
            }}>
              <span style={{ fontWeight: 600 }}>{ouvert.nom}</span>
              <span style={{ flex: 1 }} />
              <button
                onClick={fermer}
                style={{
                  fontSize: 12, padding: "4px 12px", cursor: "pointer",
                  border: "1px solid #444", borderRadius: 4,
                  background: "#2a9d8f", color: "#fff",
                }}
              >{t("code.fermer")}</button>
            </div>
            <textarea
              ref={taRef}
              autoFocus
              defaultValue={String(data.parametres?.[ouvert.nom] ?? ouvert.defaut ?? "")}
              onInput={onInput}
              onBlur={synchroniser}
              spellCheck={false}
              style={{
                flex: 1, margin: 0, padding: "12px",
                border: "none", outline: "none", resize: "none",
                background: "#1e1e1e", color: "#d4d4d4",
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
                fontSize: 13, lineHeight: 1.5,
                whiteSpace: "pre", tabSize: 2,
              }}
            />
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
