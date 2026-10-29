// ui/Songsee.tsx — Affiche l'image générée par le node Songsee.
import { useState, useEffect } from "react";
import { NodeResizer } from "@xyflow/react";
import { useI18n } from "../i18n";
import "./songsee.css";

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

  // UN DÉFAUT RELEVÉ PAR FABIEN LE 2026-10-28, ET LES NEUF COMPOSANTS QUI EMPLOIENT CETTE VUE
  // L'AVAIENT. Un nœud dont le corps ne remplit pas son cadre voit ce cadre recopié sur la hauteur de
  // son contenu (`AtelierNode`, l'observateur de taille). Sans image, rien ne le remplissait : « Rendu
  // image », né à 320 × 320, tombait à 320 × 123 dès sa pose, le goniomètre de 470 à 167. L'image
  // arrivée, le corps remplissait ce cadre réduit, et l'image, le message, les ports et le statut
  // débordaient dessous, de 1 036 px relevés sur « Rendu image ». Le nœud paraissait plus long que
  // lui-même et ne retrouvait jamais sa taille.
  //
  // CE QUI CORRIGE EST LA MISE EN PAGE DE `songsee.css` : le corps remplit son cadre en flex, et la
  // vue prend la place qui reste. L'observateur relit donc le cadre et ne le réduit plus ; l'image
  // s'ajuste dans la place restante, et le message d'attente occupe la même, de sorte que les ports
  // ne sautent pas entre un run et une remise à zéro. Éprouvé : sans cette feuille, le statut
  // déborde de 839 px au premier run.
  //
  // LA POIGNÉE EST POSÉE EN PERMANENCE, et non plus avec la seule image : un nœud se redimensionne
  // avant d'avoir rien montré, et sa taille ne dépend plus de ce qu'il affiche.
  return (
    <div className="attic-node-songsee">
      <NodeResizer minWidth={260} minHeight={160} maxWidth={1200} maxHeight={800} />
      {chargement || !src
        ? <div className="attic-node-onde-attente">{chargement ? t("onde.chargement") : message === undefined ? t("msg.connecter.image") : message}</div>
        : (
          <div className="attic-node-songsee-cadre nodrag" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
            <img src={src} alt="Songsee" />
          </div>
        )}
    </div>
  );
}
