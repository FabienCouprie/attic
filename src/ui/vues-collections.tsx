// ui/vues-collections.tsx — Les collections, et l'export.
//
// Une part des vues de noeud, decoupees par domaine. Le registre qui les associe a un
// identifiant de fiche vit dans `vues.tsx`, avec le type `VueProps` que toutes recoivent.
// Aucune ligne n'a ete retouchee au passage.

import { useState } from "react";
import { useI18n, defautParametre, uniteParametre } from "../i18n";
import { bufferVersWavBlob } from "../audio/io";
import { decrire } from "../audio/metadonnees";
import { lireProfondeurExport } from "./profondeur-export";
import { registre } from "../audio/adaptateur";
import { tamponMulticanal } from "./vues";
import type { VueProps } from "./vues";

export function VueCollections({ id, data, def }: VueProps) {
  const { t, lang } = useI18n();
  if (!def || def.parametres.length === 0) return null;
  return (
    <div className="attic-node-params" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
      {def.parametres.map((p) => {
        const defautP = defautParametre(p, lang);
        return (
        <div key={p.nom} className="attic-node-param">
          <label>{lang === "en" && p.nomEn ? p.nomEn : p.nom}</label>
          {p.type === "dossier" || p.type === "fichier" ? (
            <div style={{ display: "flex", gap: 4 }}>
              <input type="text" value={String(data.parametres?.[p.nom] ?? defautP)} onChange={(e) => data.onChangerParametre?.(id, p.nom, e.target.value)}
                style={{ flex: 1, fontSize: 11, background: "var(--bg-input)", border: "1px solid var(--border)", borderRadius: 3, padding: "2px 4px", color: "var(--text-title)" }} />
              <button onClick={async () => {
                const api = (window as { api?: any }).api;
                if (p.type === "fichier" && api?.choisirFichier) {
                  const filtres = p.extensions?.length
                    ? [{ name: p.nom, extensions: p.extensions }, { name: "Tous", extensions: ["*"] }]
                    : undefined;
                  const f = await api.choisirFichier({ filters: filtres });
                  if (f) data.onChangerParametre?.(id, p.nom, f);
                } else if (api?.choisirDossier) {
                  const d = await api.choisirDossier();
                  if (d) data.onChangerParametre?.(id, p.nom, d);
                } else {
                  const inp = document.createElement("input");
                  inp.type = "file";
                  // Hors application de bureau, un navigateur ne rend que le nom : le repli reste un
                  // pis-aller, et il ne doit au moins pas demander un dossier pour un fichier.
                  if (p.type === "dossier") (inp as { webkitdirectory?: boolean }).webkitdirectory = true;
                  else if (p.extensions?.length) inp.accept = p.extensions.map((e) => `.${e}`).join(",");
                  inp.onchange = () => { const f = inp.files?.[0]; if (f) data.onChangerParametre?.(id, p.nom, (f as { path?: string }).path ?? f.name); };
                  inp.click();
                }
              }} className="attic-node-fichier-btn" title={t("btn.parcourir")}>…</button>
            </div>
          ) : (
            <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>{data.parametres?.[p.nom] ?? defautP}{p.unite ? ` ${uniteParametre(p, lang)}` : ""}</span>
          )}
        </div>
      );
      })}
    </div>
  );
}

// ── Export / téléchargement (sorties, convertisseurs) ──
/**
 * Profondeur et bloc iXML d'un fichier multicanal refait depuis son tampon. C'est là que l'iXML sert
 * le plus : ses pistes y sont nommées d'après la disposition — L, R, C, LFE… ou ACN0 à ACN15.
 */
function optionsMulticanal(b: AudioBuffer, ficheId: unknown) {
  const bits = lireProfondeurExport();
  const id = String(ficheId ?? "");
  return { bits, ixml: decrire(b, { noeud: registre.trouverDef(id)?.nom ?? id }, bits).ixml };
}

export function VueExport({ data }: VueProps) {
  const { t } = useI18n();
  const [nomFichierLocal, setNomFichierLocal] = useState(String(data.nomFichier ?? ""));
  const api = (window as { api?: any }).api;
  const mp3Url = (data as { _affichage?: { mp3Url?: string } })._affichage?.mp3Url;
  const nomOu = (defaut: string) => (data.nomFichier as string)?.toString().trim() || defaut;
  return (
    <div className="attic-node-fichier" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
      <input className="attic-node-export-nom" type="text" placeholder={t("export.nomFichier")}
        value={nomFichierLocal}
        onChange={(e) => { setNomFichierLocal(e.target.value); (data as { nomFichier?: string }).nomFichier = e.target.value; }} />
      {data.audioResultatUrl ? (
        <>
          {data.midiFichierSortie && (
            <a className="attic-node-fichier-btn" href="#" onClick={(e) => {
              e.preventDefault();
              const u = URL.createObjectURL(data.midiFichierSortie! as File);
              const a = document.createElement("a"); a.href = u; a.download = nomOu("sortie") + ".mid"; a.click(); URL.revokeObjectURL(u);
            }}>⬇ MIDI ({(data.midiFichierSortie as unknown as File).size.toLocaleString()} o)</a>
          )}
          {api ? (
            <button className="attic-node-fichier-btn" onClick={async () => {
              const ext = data.ficheId === "convertisseur-audio" ? "mp3" : "wav";
              const multi = ext === "wav" ? tamponMulticanal(data.audioResultatBuffer) : null;
              // UN FICHIER MULTICANAL SE REFAIT DEPUIS LE TAMPON. Son aperçu a été replié en stéréo
              // pour ne pas peser six à huit fois une stéréo dans le processus principal ; l'enregistrer
              // tel quel livrerait un repliement à la place du 7.1.4 composé.
              const buf = multi
                ? await bufferVersWavBlob(multi, undefined, false, optionsMulticanal(multi, data.ficheId)).arrayBuffer()
                : await (await fetch(data.ficheId === "convertisseur-audio" && mp3Url ? mp3Url : data.audioResultatUrl!)).arrayBuffer();
              await api.sauvegarderBinaire({
                defaultPath: nomOu(`sortie.${ext}`),
                filters: [{ name: "Audio", extensions: [ext] }],
                buffer: buf,
              });
            }}>💾 {t("export.sauvegarder").replace("💾 ", "")}</button>
          ) : tamponMulticanal(data.audioResultatBuffer) ? (
            <button className="attic-node-fichier-btn" onClick={() => {
              const b = tamponMulticanal(data.audioResultatBuffer)!;
              const u = URL.createObjectURL(bufferVersWavBlob(b, undefined, false, optionsMulticanal(b, data.ficheId)));
              const a = document.createElement("a"); a.href = u; a.download = nomOu((data.audioResultatNom as string) || "sortie.wav"); a.click();
              setTimeout(() => URL.revokeObjectURL(u), 1000);
            }}>💾 {t("export.sauvegarder").replace("💾 ", "")}</button>
          ) : (
            <a className="attic-node-fichier-btn" href={data.ficheId === "convertisseur-audio" && mp3Url ? mp3Url : data.audioResultatUrl}
              download={nomOu((data.audioResultatNom as string) || "sortie.wav")}>
              💾 {t("export.sauvegarder").replace("💾 ", "")}
            </a>
          )}
        </>
      ) : (
        <div className="attic-node-fichier-nom" style={{ opacity: 0.5 }}>{t("export.avantLancer")}</div>
      )}
    </div>
  );
}

// ── Clavier mélodie (instrument jouable + enregistrement de séquence) ──
// ── Clavier d'apprentissage : le MIDI reçu, montré main par main ──
