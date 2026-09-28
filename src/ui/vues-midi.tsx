// ui/vues-midi.tsx — MIDI, SoundFont, et les modeles charges depuis un fichier.
//
// Une part des vues de noeud, decoupees par domaine. Le registre qui les associe a un
// identifiant de fiche vit dans `vues.tsx`, avec le type `VueProps` que toutes recoivent.
// Aucune ligne n'a ete retouchee au passage.

import { useI18n } from "../i18n";
import type { VueProps } from "./vues";

export function VueUploadMidi({ id, data }: VueProps) {
  const { t } = useI18n();
  return (
    <div className="attic-node-fichier" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
      <label className="attic-node-fichier-btn">
        {data.midiNom ? t("btn.changer.midi") : t("btn.charger.midi")}
        <input type="file" accept=".mid,.midi" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) data.onChargerMidi?.(id, f); }} />
      </label>
      {data.midiNom && <div className="attic-node-fichier-nom">{data.midiNom}</div>}
    </div>
  );
}

// LE SÉLECTEUR D'INSTRUMENT SOUNDFONT A ÉTÉ RETIRÉ, relevé par Fabien en cherchant les réglages sans
// effet. Il se gardait derrière `if (!data.sf2Data) return null;`, et RIEN N'ÉCRIVAIT JAMAIS
// `sf2Data` : trois occurrences dans tout l'arbre de travail, une déclaration de type, une entrée de
// liste de pertes, et ce garde. La vue rendait donc `null` en toutes circonstances, et le champ
// `sf2InstrumentIdx` qu'elle seule écrivait n'était lu par personne, tout en voyageant dans le
// fichier de projet et les méta-composants. Le choix d'instrument existe par ailleurs, et il marche :
// c'est le paramètre « Instrument » du « Lecteur MIDI », que son exécuteur lit. Un second sélecteur
// mutait de surcroît `data` sans passer par `setNodes`, donc React n'en aurait rien vu.

// ── Téléchargement du MIDI transcrit ──
export function VueTranscription({ data }: VueProps) {
  const { t } = useI18n();
  return (
    <div className="attic-node-fichier" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
      {data.midiFichierSortie ? (
        <a href="#" className="attic-node-fichier-btn" onClick={(e) => {
          e.preventDefault();
          const u = URL.createObjectURL(data.midiFichierSortie! as File);
          const a = document.createElement("a"); a.href = u; a.download = "transcription.mid"; a.click(); URL.revokeObjectURL(u);
        }}>⬇ MIDI ({(data.midiFichierSortie as unknown as File).size.toLocaleString()} o)</a>
      ) : (
        <div className="attic-node-fichier-nom" style={{ opacity: .5 }}>{t("msg.connecter.audio")}</div>
      )}
    </div>
  );
}

// ── Chargement d'un modèle ONNX ──
export function VueUploadOnnx({ data }: VueProps) {
  const { t } = useI18n();
  return (
    <div className="attic-node-fichier" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
      <label className="attic-node-fichier-btn">
        {data.modeleFichier?.name || t("btn.charger.onnx")}
        <input type="file" accept=".onnx" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) data.modeleFichier = f; }} />
      </label>
    </div>
  );
}

// ── Chargement d'une réponse impulsionnelle (IR) ──
export function VueUploadIR({ id, data }: VueProps) {
  const { t } = useI18n();
  const d = data as { irFichier?: File; irNom?: string; onChargerIR?: (id: string, f: File) => void };
  return (
    <div className="attic-node-fichier" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
      <label className="attic-node-fichier-btn">
        {d.irNom ? t("btn.changer.audio") : t("btn.charger.ir")}
        <input type="file" accept="audio/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) { d.irFichier = f; d.irNom = f.name; d.onChargerIR?.(id, f); } }} />
      </label>
      {d.irNom && <div className="attic-node-fichier-nom">{d.irNom}</div>}
    </div>
  );
}

// ── Chargement d'un patch Pure Data ──
export function VueUploadPd({ id, data }: VueProps) {
  const { t } = useI18n();
  const d = data as {
    pureDataFichier?: File;
    pureDataNom?: string;
    onChangerParametre?: (id: string, nom: string, v: string | number) => void;
  };
  return (
    <div className="attic-node-fichier" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
      <label className="attic-node-fichier-btn">
        {d.pureDataNom ? t("btn.changer.pd") : t("btn.charger.pd")}
        <input
          type="file"
          accept=".pd"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) {
              d.pureDataFichier = f;
              d.pureDataNom = f.name;
              d.onChangerParametre?.(id, "Patch", `${f.name}@${f.lastModified}`);
            }
          }}
        />
      </label>
      {d.pureDataNom && <div className="attic-node-fichier-nom">{d.pureDataNom}</div>}
    </div>
  );
}

// ── Paramètres inline des collections (sélecteurs de dossier) ──
