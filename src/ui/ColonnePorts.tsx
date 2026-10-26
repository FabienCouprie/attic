// ui/ColonnePorts.tsx — Une colonne de ports d'un nœud, et ses deux boutons d'extension.
//
// POURQUOI ELLE EST SORTIE D'`AtelierNode.tsx`. Les deux colonnes y étaient écrites en entier, et
// elles ne diffèrent que par trois choses : le côté, le sens de la poignée, et l'ordre du libellé
// et du point. Les rendre extensibles TOUTES LES DEUX aurait recopié une troisième fois le bloc des
// boutons dans un fichier déjà en dette de taille.
//
// ET C'EST CE QUI REND LES DEUX CÔTÉS IDENTIQUES PAR CONSTRUCTION. Une correction faite sur une
// colonne valait pour une seule ; il n'y a plus qu'une colonne, employée deux fois.

import { Handle, Position } from "@xyflow/react";
import type { CSSProperties } from "react";

import type { EtatPorts } from "./ports-extensibles";
import type { FormePort } from "../core/typesFlux";
import { registreUI } from "./registre-actif";

export interface PortDessine {
  nom: string;
  nomEn?: string;
  type: string;
}

export interface ProprietesColonnePorts {
  /** `entree` dessine à gauche, la poignée avant le libellé ; `sortie` l'inverse. */
  cote: "entree" | "sortie";
  ports: readonly PortDessine[];
  etat: EtatPorts;
  /** Vrai quand la fiche déclare ce côté extensible : sans cela, pas de boutons. */
  extensible: boolean;
  lang: string;
  survolPort: string | null;
  setSurvolPort: (h: string | null) => void;
  supprimerAretesHandle: (h: string) => void;
  reglerVisibles: (n: number) => void;
  couleurFlux: (type: string) => string;
  stylePort: (forme: FormePort, couleur: string) => CSSProperties;
  t: (cle: string, ...args: unknown[]) => string;
}

export function ColonnePorts(p: ProprietesColonnePorts) {
  const entree = p.cote === "entree";
  const prefixe = entree ? "in" : "out";
  // LES PORTS AU-DELÀ DU COMPTE VISIBLE NE SONT PAS DESSINÉS, et ils existent toujours : le moteur,
  // la validation et les fichiers déjà enregistrés les voient tous. C'est un fait d'affichage.
  const dessines = p.ports.slice(0, p.etat.visibles);
  return (
    <div className={`attic-node-ports-col ${entree ? "left" : "right"}`}>
      {!p.ports.length && <div className="attic-node-port-vide">—</div>}
      {dessines.map((port, i) => {
        const hid = `${prefixe}:${i}`;
        const couleur = p.couleurFlux(port.type);
        const libelleType = registreUI().typeFlux(port.type)?.libelle ?? port.type;
        const poignee = (
          <Handle type={entree ? "target" : "source"} position={entree ? Position.Left : Position.Right}
            id={hid} title={libelleType}
            style={p.stylePort(registreUI().formeFlux(port.type), couleur)} />
        );
        const libelle = (
          <span className="attic-node-port-label">
            {p.lang === "en" && port.nomEn ? port.nomEn : port.nom}
          </span>
        );
        return (
          <div key={hid} className={`attic-node-port${entree ? "" : " sortie"}`}
            onMouseEnter={() => p.setSurvolPort(hid)} onMouseLeave={() => p.setSurvolPort(null)}>
            {entree ? poignee : libelle}
            {entree ? libelle : null}
            {p.survolPort === hid && (
              <button className="attic-node-port-del"
                onClick={(e) => { e.stopPropagation(); p.supprimerAretesHandle(hid); }}>×</button>
            )}
            {entree ? null : poignee}
          </div>
        );
      })}
      {p.extensible && (
        <div className="attic-node-ports-plus nodrag">
          <button disabled={!p.etat.peutRetirer} title={p.t("ports.retirer")}
            onClick={(e) => { e.stopPropagation(); p.reglerVisibles(p.etat.visibles - 1); }}>−</button>
          <span>{p.etat.visibles}</span>
          <button disabled={!p.etat.peutAjouter} title={p.t("ports.ajouter")}
            onClick={(e) => { e.stopPropagation(); p.reglerVisibles(p.etat.visibles + 1); }}>+</button>
        </div>
      )}
    </div>
  );
}
