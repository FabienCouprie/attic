// plugins/meta-exemples.ts — Méta-composants embarqués par défaut.
//
// Au premier lancement, ces métas sont enregistrés dans le registre et
// persistés en localStorage. L'utilisateur les voit dans la palette dès le
// démarrage, sans avoir à les créer.
import { enregistrerMeta, tousLesMetas } from "../core";
import { registre } from "../audio/adaptateur";
import type { MetaComposant } from "../core";

const synthetiseurSoustractif: MetaComposant = {
  id: "meta-synth-soustractif",
  nom: "Synthétiseur soustractif",
  nomEn: "Subtractive Synthesizer",
  entrees: [],
  sorties: [{ nom: "Out 1", nomEn: "Out 1", type: "audio" }],
  mapEntrees: [],
  mapSorties: [{ noeudInterne: "noeud-3", portIndex: 0 }],
  sousNoeuds: [
    {
      id: "noeud-1",
      position: { x: -140, y: 140 },
      width: 420,
      height: 340,
      data: {
        ficheId: "oscillateur",
        parametres: { Forme: "Dent de scie", Fréquence: 110, Durée: 1.5, Volume: 80 },
     },
   },
    {
      id: "noeud-2",
      position: { x: 70, y: 140 },
      width: 230,
      height: 372,
      data: {
        ficheId: "reponse-filtre",
        // ═══ LES CLÉS SONT CELLES QUE LA FICHE DÉCLARE, et elles ne l'étaient pas ═══
        //
        // CE NŒUD PORTAIT `{ Fréquence: 600, Q: 4 }`, et la fiche de « Filtre + réponse » déclare
        // « Fréquence de coupure » et « Résonance ». Les réglages étant indexés par leur LIBELLÉ, le
        // moteur ne trouvait rien sous ces deux clés et retombait sur les défauts : le filtre de ce
        // méta tournait à 1000 Hz et Q 0,7 au lieu de 600 Hz et Q 4.
        //
        // IL EST NÉ AINSI, le 2026-07-13 : la fiche déclarait déjà « Fréquence de coupure » ce
        // jour-là. Ce n'est donc pas un renommage mal suivi, c'est un méta écrit à la main avec deux
        // clés qui n'ont jamais existé — et trois mois et demi sans que rien ne le dise, parce qu'une
        // clé inconnue ne lève pas : elle se tait et le défaut s'applique.
        //
        // `src/docs/contrat-cles-de-reglage.test.ts` est né de ce défaut et le garde.
        parametres: { Type: "Passe-bas", "Fréquence de coupure": 600, Résonance: 4 },
     },
   },
    {
      id: "noeud-3",
      position: { x: 280, y: 140 },
      width: 420,
      height: 300,
      data: {
        ficheId: "enveloppe-adsr",
        parametres: { Attaque: 5, Déclin: 250, Maintien: 30, Relâchement: 400 },
     },
   },
  ],
  sousAretes: [
    { id: "e-1-2", source: "noeud-1", target: "noeud-2", sourceHandle: "out:0", targetHandle: "in:0" },
    { id: "e-2-3", source: "noeud-2", target: "noeud-3", sourceHandle: "out:0", targetHandle: "in:0" },
  ],
};

const EXEMPLES: MetaComposant[] = [synthetiseurSoustractif];

/**
 * Répare les clés de réglage d'un méta déjà en magasin, à partir de la définition embarquée.
 *
 * ═══ POURQUOI UNE RÉPARATION, ET NON UN REMPLACEMENT ═══
 *
 * CORRIGER LA SOURCE NE SUFFIT PAS. Ces métas sont persistés en stockage local au premier
 * lancement : qui emploie Attic depuis juillet a la version FAUTIVE chez lui, et
 * `installerMetasExemples` passait son tour dès que l'identifiant était présent. Le défaut aurait
 * donc survécu à sa propre correction, chez tout le monde sauf un utilisateur neuf.
 *
 * ET REMPLACER TOUT LE MÉTA DÉTRUIRAIT LE TRAVAIL DE QUI L'A MODIFIÉ. Un méta embarqué est aussi
 * un point de départ : on l'ouvre, on règle sa coupure, on change son oscillateur. Écraser cela
 * pour corriger deux clés serait payer la réparation avec le travail de quelqu'un.
 *
 * ON NE TOUCHE DONC QU'À CE QUI EST DÉJÀ PERDU : une clé qu'aucune fiche ne déclare est une valeur
 * que personne ne lit. Si la définition embarquée porte la même valeur sous une clé que la fiche
 * déclare, c'est le nom que l'auteur voulait, et il est rendu. Tout le reste est laissé tel quel —
 * une valeur réglée par l'utilisateur sous une clé valable n'est pas touchée.
 */
function reparerLesCles(enMagasin: MetaComposant, embarque: MetaComposant): string[] {
  const faits: string[] = [];
  for (const sous of enMagasin.sousNoeuds ?? []) {
    const def = registre.trouverDef(sous.data?.ficheId as string);
    if (!def) continue;
    const declares = new Set(def.parametres.map((p) => p.nom));
    const reference = embarque.sousNoeuds.find((s) => s.id === sous.id
      && s.data?.ficheId === sous.data?.ficheId);
    if (!reference) continue;
    const parametres = sous.data?.parametres as Record<string, unknown> | undefined;
    if (!parametres) continue;
    for (const cle of Object.keys(parametres)) {
      if (declares.has(cle)) continue;
      // LA CLÉ DE REMPLACEMENT EST CELLE QUE LA DÉFINITION EMBARQUÉE EMPLOIE POUR LA MÊME VALEUR.
      // Rapprocher sur la valeur, et non sur une ressemblance de libellés : un rapprochement par
      // ressemblance inventerait une correspondance là où il n'y en a pas.
      const perdue: unknown = parametres[cle];
      const modele = (reference.data?.parametres ?? {}) as Record<string, unknown>;
      const neuve: string | undefined = Object.keys(modele)
        .find((k) => declares.has(k) && modele[k] === perdue);
      if (!neuve || neuve in parametres) continue;
      parametres[neuve] = perdue;
      delete parametres[cle];
      faits.push(`${sous.id} : « ${cle} » → « ${neuve} »`);
    }
  }
  return faits;
}

export function installerMetasExemples(): void {
  const enMagasin = new Map(tousLesMetas().map((m) => [m.id, m]));
  for (const meta of EXEMPLES) {
    const tousPresents = meta.sousNoeuds.every((n) => registre.trouverDef(n.data.ficheId) !== undefined);
    if (!tousPresents) {
      console.warn(`[attic] Méta exemple « ${meta.nom} » non installé : fiche(s) manquante(s)`);
      continue;
    }
    const deja = enMagasin.get(meta.id);
    if (deja) {
      const faits = reparerLesCles(deja, meta);
      if (faits.length) {
        enregistrerMeta(deja);
        console.log(`[attic] Méta exemple « ${meta.nom} » : ${faits.length} clé(s) réparée(s) —`
          + ` ${faits.join(" ; ")}`);
      }
      continue;
    }
    enregistrerMeta(meta);
    console.log(`[attic] Méta exemple « ${meta.nom} » installé`);
  }
}
