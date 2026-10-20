// ui/apparence-maj.ts — Ce que l'icône de mise à jour montre, et ce qu'un clic y fait.
//
// POURQUOI CE MODULE EXISTE, ET CE QU'IL REMPLACE. Les six états de la mise à jour s'écrivaient en
// toutes lettres DANS la rangée de la barre d'outils, chacun avec sa propre longueur. Relevé par
// Fabien : cliquer sur la mise à jour faisait bouger le menu — le texte poussait le numéro de
// version, le trait, et le groupe d'exécution avec le bouton « Lancer » ; la barre étant en
// `flex-wrap`, une fenêtre étroite pouvait même le renvoyer à la ligne.
//
// RÉSERVER LA PLACE ÉTAIT UNE MAUVAISE RÉPONSE, et c'est lui qui l'a dit : « à quoi ça sert si plus
// aucun message n'apparaît ? ». En développement le metteur à jour n'existe pas — `if (!DEV)` dans
// `electron/main.cjs` — de sorte que la vérification rend `indisponible`, un état qu'AUCUNE des six
// branches ne montrait. La place réservée restait donc vide là où le travail se fait.
//
// L'ÉTAT VA DANS L'ICÔNE, comme pour les modèles juste à côté : un bouton de taille fixe ne bouge
// jamais, sa couleur dit où l'on en est, sa pastille ce qu'il y a à prendre, son infobulle le dit
// en toutes lettres. Plus rien n'est réservé et plus rien ne se déplace — par construction, non
// par ajustement.
//
// ET LE CLIC SUIT L'ÉTAT. Une mise à jour disponible se prend d'un clic, une mise à jour prête
// s'installe d'un clic ; ailleurs, le clic vérifie. Pendant une vérification ou un téléchargement
// il ne fait rien, parce qu'il n'y a rien à demander de plus.

/** Ce que le bouton de mise à jour montre et fait, pour un état donné. */
export interface ApparenceMaj {
  /** La teinte de l'icône : le nom d'une variante, que la barre traduit en couleur. */
  variante: "neutre" | "attente" | "bon" | "offre" | "cours" | "faute" | "muet";
  /** Ce qui s'écrit dans la pastille, ou `null` quand il n'y a rien à signaler. */
  badge: string | null;
  /** La clé d'infobulle, et ses variables, à passer à `traduire`. */
  cle: string;
  vars: (string | number)[];
  /** Ce qu'un clic demande : vérifier, prendre, installer, ou rien. */
  action: "verifier" | "telecharger" | "installer" | null;
}

/** L'état que le processus principal rend, réduit à ce qui décide de l'apparence. */
export interface EtatMaj {
  statut?: string;
  version?: string;
  progression?: number;
  notes?: string;
}

export function apparenceMaj(maj: EtatMaj | null | undefined): ApparenceMaj {
  const version = maj?.version ?? "";
  switch (maj?.statut) {
    case "verification":
      // Pendant la vérification, le clic ne relance pas : il n'y a rien à demander de plus, et
      // deux vérifications en vol ne donnent pas une réponse plus rapide.
      return { variante: "attente", badge: "…", cle: "maj.enVerification", vars: [], action: null };
    case "a-jour":
      return { variante: "bon", badge: null, cle: "maj.a-jour", vars: [], action: "verifier" };
    case "disponible":
      return { variante: "offre", badge: "↓", cle: "maj.disponibleClic", vars: [version], action: "telecharger" };
    case "telechargement":
      return {
        variante: "cours", badge: `${Math.round(maj.progression ?? 0)}`,
        cle: "maj.telechargementEnCours", vars: [Math.round(maj.progression ?? 0)], action: null,
      };
    case "pret":
      return { variante: "bon", badge: "⟳", cle: "maj.pretClic", vars: [version], action: "installer" };
    case "erreur":
      return { variante: "faute", badge: "!", cle: "maj.erreur", vars: [], action: "verifier" };
    case "indisponible":
      // L'ÉTAT QUI N'ÉTAIT JAMAIS MONTRÉ, et qui est le seul que voie qui travaille sur les
      // sources : l'icône s'éteint et dit pourquoi, au lieu de ne rien répondre à un clic.
      return { variante: "muet", badge: null, cle: "maj.indisponible", vars: [], action: null };
    default:
      return { variante: "neutre", badge: null, cle: "maj.verification", vars: [], action: "verifier" };
  }
}
