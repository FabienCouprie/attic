// ui/en-cours-a-relire.test.ts — Un en-cours écrit puis relu rend ce que le fichier de projet garde.
//
// POURQUOI CE CAS. L'en-cours est la reprise de séance : `ui/projet-a-ecrire.ts` l'écrit à chaque
// sauvegarde, `hooks/useEnCours.ts` le relit au démarrage. Les deux énuméraient leurs clés à la
// main, chacun sa liste, et aucune n'était celle du fichier. Relevé le 2026-11-11 en dérivant la
// liste du fichier : l'écriture oubliait les quatre noms de fichier et `nomFichier`, que la relecture
// attendait ; la relecture oubliait les ports ouverts, que l'écriture posait. Une séance reprise sans
// le fichier sur le disque montrait un nœud sans nom, et refermait les ports ouverts à la main.
//
// LE CAS FAIT L'ALLER-RETOUR ENTIER, par les deux modules et par JSON comme le stockage le fait, et
// compare au nœud du fichier, champ par champ : un oubli d'un côté ou de l'autre tombe ici.
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { configurerRegistreMeta, creerRegistre } from "../core";
import { oublierServicesDomaine } from "../core/services-domaine";
import { CHAMPS_DU_PROJET } from "../core/saisies";
import { noeudsRelus } from "./en-cours-a-relire";
import { projetAEcrire } from "./projet-a-ecrire";
import { configurerRegistreUI } from "./registre-actif";

/** Un nœud qui porte, avec une valeur reconnaissable, chaque champ que le fichier garde. */
function porteur() {
  const data: Record<string, unknown> = {
    ficheId: "generateur-courbe", parametres: { Durée: 8 }, portsVisibles: 3, portsVisiblesSortie: 2,
    statut: "termine", audioResultatUrl: "blob:resultat",
  };
  for (const c of CHAMPS_DU_PROJET) data[c] ??= `valeur de ${c}`;
  return { id: "p", type: "atelier", position: { x: 10, y: 20 }, width: 300, height: 120, data };
}

/** L'en-cours que la sauvegarde écrit, passé par JSON comme le stockage le fait, puis relu. */
function allerRetour(noeuds: object[], gestes: Record<string, unknown> = {}) {
  const ecrit = projetAEcrire({ nodes: noeuds as never[], edges: [] }, () => undefined);
  return { ecrit, relus: noeudsRelus(JSON.parse(JSON.stringify(ecrit.encours)).nodes, gestes) };
}

describe("l'en-cours, écrit puis relu", () => {
  // DEUX REGISTRES VIDES : aucune fiche n'est connue, et c'est ce qu'il faut. Le cas éprouve ce que
  // l'en-cours transporte, non ce qu'une fiche déclare ; un nœud sans fiche prend la taille par défaut.
  beforeEach(() => {
    configurerRegistreMeta(creerRegistre<unknown, unknown>());
    configurerRegistreUI(creerRegistre<unknown, unknown>());
  });
  afterEach(() => oublierServicesDomaine());

  it("CE QUE LE FICHIER GARDE D'UN NŒUD REVIENT D'UNE SÉANCE REPRISE, champ par champ", () => {
    const { ecrit, relus } = allerRetour([porteur()]);
    const fichier = ecrit.cleanNodes[0].data as Record<string, unknown>;
    const perdus = [...CHAMPS_DU_PROJET]
      .filter((c) => JSON.stringify(relus[0].data[c]) !== JSON.stringify(fichier[c]));
    expect(perdus, "gardé par le fichier, perdu par la reprise de séance").toEqual([]);
  });

  // LE STATUT « ATTENTE » QUE LA RELECTURE POSE N'EST PAS TENU ICI, et c'est voulu : rien ne le lit,
  // `ui/statuts.test.ts` interdit qu'on le lise, et la pièce 3 du chantier le retire de `data`. Le
  // premier jet de ces cas l'affirmait, et ce garde les a fait tomber.
  it("UN NŒUD RELU GARDE SA PLACE ET SA TAILLE, et porte les gestes", () => {
    const geste = () => undefined;
    const { relus } = allerRetour([porteur()], { onReinitialiser: geste });
    expect(relus[0].data.onReinitialiser).toBe(geste);
    expect(relus[0]).toMatchObject({ id: "p", type: "atelier", position: { x: 10, y: 20 }, width: 300, height: 120 });
  });

  it("UN EN-COURS QUI PORTERAIT UN RÉSULTAT OU UN CHAMP INCONNU NE LES REND PAS", () => {
    // L'écriture les écarte déjà ; la relecture aussi, car un en-cours peut venir d'ailleurs : les
    // cas d'application y posent des fichiers de projet, et un fichier se modifie à la main.
    const relus = noeudsRelus([{ id: "r", position: { x: 0, y: 0 }, data: {
      ficheId: "generateur-courbe", parametres: {}, statut: "termine", audioResultatUrl: "blob:x", champInconnu: 1,
    } }], {});
    expect(relus[0].data.audioResultatUrl, "un résultat ne survit pas à la séance").toBeUndefined();
    expect(relus[0].data.champInconnu).toBeUndefined();
  });

  it("SANS TAILLE NI RÉGLAGES, le nœud prend une taille par défaut et des réglages vides", () => {
    const relus = noeudsRelus([{ id: "q", position: { x: 0, y: 0 }, data: { ficheId: "inconnue" } }], {});
    expect(relus[0]).toMatchObject({ width: 230, height: 200, data: { parametres: {} } });
  });
});
