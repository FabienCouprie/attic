// ui/EditeurCode.tsx — Éditeur de code partagé (Python / Julia Processor).
//
// POURQUOI NON-CONTRÔLÉ : la version précédente utilisait un <textarea>
// contrôlé (`value={editCode}`). Quand un re-render arrivait entre une frappe
// et son commit React (synchro différée → setNodes → re-render du canevas,
// ou n'importe quelle mise à jour du store React Flow), React forçait le DOM
// à revenir à une valeur en retard d'une frappe : lettres dédoublées, dernière
// lettre déplacée, curseur décalé. Ici React ne touche JAMAIS au texte après
// le montage : le textarea est non-contrôlé (defaultValue) et la coloration
// est mise à jour impérativement. Bénéfice collatéral : Ctrl+Z, copier/coller
// et couper redeviennent natifs (on n'écrit jamais dans .value).
//
// La surbrillance (<pre>) et la gouttière sont rendues par React UNE fois
// (dangerouslySetInnerHTML avec un HTML figé au montage) puis pilotées à la
// main : tant que la chaîne __html du rendu ne change pas, React laisse les
// enfants du DOM tranquilles.
import { useRef, useEffect, useMemo, useCallback } from "react";

export type Token = { text: string; type: string };

interface Props {
  codeInitial: string;
  tokenize: (code: string) => Token[];
  couleurs: Record<string, string>;
  // Appelé (débouncé 400 ms + au blur) avec le code courant.
  onSync: (code: string) => void;
  // Texte du pied de bloc, recalculé à chaque frappe (ex. « · numpy requis »).
  suffixePied: string;
}

function echapper(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function EditeurCode({ codeInitial, tokenize, couleurs, onSync, suffixePied }: Props) {
  const taRef = useRef<HTMLTextAreaElement>(null);
  const preRef = useRef<HTMLPreElement>(null);
  const gutterRef = useRef<HTMLPreElement>(null);
  const piedRef = useRef<HTMLSpanElement>(null);
  const syncRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onSyncRef = useRef(onSync);
  onSyncRef.current = onSync;

  const versHtml = useCallback((code: string) => {
    return tokenize(code).map((t) => `<span style="color:${couleurs[t.type] || "#d4d4d4"}">${echapper(t.text)}</span>`).join("");
    // tokenize et couleurs sont stables (définis au niveau module côté appelant)
  }, [tokenize, couleurs]);

  // HTML du PREMIER rendu — figé : tant que cette chaîne ne change pas d'un
  // rendu à l'autre, React ne réécrit pas innerHTML et nos mises à jour
  // impératives survivent aux re-renders du canevas.
  const htmlInitial = useMemo(() => ({ __html: versHtml(codeInitial) }), []);
  const gutterInitial = useMemo(() => ({
    __html: echapper(codeInitial.split("\n").map((_, i) => `${i + 1}`).join("\n")),
  }), []);

  const majVisuel = useCallback((code: string) => {
    if (preRef.current) preRef.current.innerHTML = versHtml(code);
    if (gutterRef.current) gutterRef.current.innerHTML = echapper(code.split("\n").map((_, i) => `${i + 1}`).join("\n"));
    if (piedRef.current) piedRef.current.textContent = `${code.split("\n").length} lignes ${suffixePied}`;
  }, [versHtml, suffixePied]);

  const onInput = useCallback(() => {
    const code = taRef.current?.value ?? "";
    majVisuel(code);
    if (syncRef.current) clearTimeout(syncRef.current);
    syncRef.current = setTimeout(() => onSyncRef.current(code), 400);
  }, [majVisuel]);

  useEffect(() => {
    return () => {
      if (syncRef.current) {
        clearTimeout(syncRef.current);
        // Dernière chance de ne pas perdre les 400 dernières ms de frappe.
        if (taRef.current) onSyncRef.current(taRef.current.value);
      }
    };
  }, []);

  const onScroll = () => {
    if (taRef.current && preRef.current) {
      preRef.current.scrollTop = taRef.current.scrollTop;
      preRef.current.scrollLeft = taRef.current.scrollLeft;
    }
    if (taRef.current && gutterRef.current) gutterRef.current.scrollTop = taRef.current.scrollTop;
  };

  return (
    <>
      <div style={{ position: "relative", fontFamily: "'Cascadia Code', 'Fira Code', 'Consolas', monospace", fontSize: 12, lineHeight: 1.5, display: "flex", flex: 1, minHeight: 0 }}>
        <pre ref={gutterRef} aria-hidden="true"
          style={{
            margin: 0, padding: "8px 4px 8px 8px", overflow: "hidden",
            background: "#1a1a1e", borderRadius: "4px 0 0 4px", textAlign: "right",
            color: "#555", userSelect: "none", minWidth: 36, flexShrink: 0, minHeight: 0,
            whiteSpace: "pre", tabSize: 4,
          }}
          dangerouslySetInnerHTML={gutterInitial}
        />
        <div style={{ position: "relative", flex: 1, minHeight: 0 }}>
          <pre ref={preRef} aria-hidden="true"
            style={{
              position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
              margin: 0, padding: "8px", overflow: "auto",
              background: "#1e1e1e", border: "1px solid transparent", borderLeft: "none", borderRadius: "0 4px 4px 0", pointerEvents: "none",
              whiteSpace: "pre", overflowWrap: "normal", tabSize: 4,
            }}
            dangerouslySetInnerHTML={htmlInitial}
          />
          <textarea
            ref={taRef}
            className="nodrag nowheel"
            defaultValue={codeInitial}
            onInput={onInput}
            onBlur={() => {
              if (syncRef.current) clearTimeout(syncRef.current);
              onSyncRef.current(taRef.current?.value ?? "");
            }}
            onScroll={onScroll}
            spellCheck={false}
            style={{
              position: "relative", width: "100%", height: "100%",
              margin: 0, padding: "8px", border: "1px solid #333", borderLeft: "none", borderRadius: "0 4px 4px 0",
              background: "transparent", color: "transparent",
              caretColor: "#fff", resize: "none", outline: "none",
              fontFamily: "inherit", fontSize: "inherit", lineHeight: "inherit",
              whiteSpace: "pre", overflowWrap: "normal", tabSize: 4,
            }}
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Tab") {
                e.preventDefault();
                const ta = e.currentTarget;
                // execCommand préserve la pile d'annulation native (Ctrl+Z) et
                // déclenche l'événement input (donc coloration + sync). Le repli
                // setRangeText couvre un éventuel retrait futur de l'API.
                if (!document.execCommand("insertText", false, "    ")) {
                  const start = ta.selectionStart;
                  ta.setRangeText("    ", start, ta.selectionEnd, "end");
                  ta.dispatchEvent(new Event("input", { bubbles: true }));
                }
              }
            }}
          />
        </div>
      </div>
      <div style={{ fontSize: 10, marginTop: 4, color: "var(--text-muted)", background: "var(--bg-surface)", padding: "2px 4px", borderRadius: "0 0 6px 6px" }}>
        <span ref={piedRef}>{codeInitial.split("\n").length} lignes {suffixePied}</span>
      </div>
    </>
  );
}
