// ui/Songsee.tsx — Affiche l'image générée par le node Songsee.
import { useState, useEffect } from "react";
import { NodeResizer } from "@xyflow/react";
import { useI18n } from "../i18n";

interface Props {
  fichier?: File;
  url?: string;
  message?: string;
}

export function SongseeVue({ fichier, url, message }: Props) {
  const { t } = useI18n();
  const [src, setSrc] = useState<string | null>(url ?? null);
  const [chargement, setChargement] = useState(false);

  useEffect(() => {
    if (!fichier) { setSrc(url ?? null); return; }
    setChargement(true);
    const objectUrl = URL.createObjectURL(fichier);
    setSrc(objectUrl);
    setChargement(false);
    return () => { URL.revokeObjectURL(objectUrl); };
  }, [fichier, url]);

  if (chargement) return <div className="attic-node-onde-attente">{t("onde.chargement")}</div>;
  if (!src) return <div className="attic-node-onde-attente">{message === undefined ? t("msg.connecter.image") : message}</div>;

  return (
    <div className="attic-node-songsee nodrag" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()} style={{ width: "100%", height: "100%" }}>
      <NodeResizer minWidth={260} minHeight={160} maxWidth={1200} maxHeight={800} />
      <img src={src} alt="Songsee" style={{ width: "100%", height: "100%", objectFit: "contain", display: "block", borderRadius: 4 }} />
    </div>
  );
}
