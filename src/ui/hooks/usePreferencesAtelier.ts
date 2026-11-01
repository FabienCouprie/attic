// ui/hooks/usePreferencesAtelier.ts — Les réglages de l'atelier qui se retiennent d'une session à
// l'autre : palette ouverte, sauvegarde automatique, économie de mémoire, thème, dossier de travail.
//
// Sorti d'`App.tsx` le 2026-11-01, à l'identique : mêmes clés de stockage, mêmes défauts, mêmes
// effets. Chaque réglage vit avec sa bascule, et c'est tout ce que le crochet rend.
import { useCallback, useEffect, useRef, useState } from "react";

import { ecrireEconomieMemoire, lireEconomieMemoire } from "../economie-memoire";
import { CLE_PREFERENCE, lirePreference } from "../sauvegarde-auto";

export function usePreferencesAtelier() {
  const [paletteOuverte, setPaletteOuverte] = useState(() => localStorage.getItem("attic-palette-ouverte") !== "false");
  const togglePalette = useCallback(() => {
    setPaletteOuverte((prev) => {
      const next = !prev;
      localStorage.setItem("attic-palette-ouverte", String(next));
      return next;
    });
  }, []);

  // Sauvegarde automatique : bascule du groupe Fichier, retenue d'une session à l'autre.
  // Coupée, elle l'est pour de bon — ni au battement des 30 s, ni à la fermeture.
  const [sauvegardeAutoActive, setSauvegardeAutoActive] = useState(() => lirePreference());
  const basculerSauvegardeAuto = useCallback(() => {
    setSauvegardeAutoActive((prev) => {
      const suivant = !prev;
      try { localStorage.setItem(CLE_PREFERENCE, suivant ? "1" : "0"); } catch {}
      return suivant;
    });
  }, []);

  // Économie de mémoire sur les pistes longues : bascule voisine, même groupe. Elle ne change
  // rien en deçà de dix minutes ; au-delà, elle décide si les nœuds intermédiaires reçoivent
  // leur aperçu écoutable ou le bouton qui le construit à la demande.
  //
  // LA PROFONDEUR DES FICHIERS ÉCRITS N'EST PAS ICI, et ce qui était écrit à sa place disait la
  // limite en la tenant pour voulue : « elle ne prend effet qu'au prochain lancement ». Mesuré,
  // c'était pire — elle ne prenait effet NI au prochain lancement, l'adresse de l'aperçu étant
  // gardée tant que le tampon est le même objet. Le réglage vit dans `ui/profondeur-export.ts`,
  // son sélecteur s'y abonne, et changer de valeur refait les aperçus sans rejouer un seul nœud :
  // voir `ui/SelecteurProfondeurExport.tsx` et `ui/refaire-apercus.ts`.
  const [economieMemoire, setEconomieMemoire] = useState(() => lireEconomieMemoire());
  const basculerEconomieMemoire = useCallback(() => {
    setEconomieMemoire((prev) => {
      const suivant = !prev;
      ecrireEconomieMemoire(suivant);
      return suivant;
    });
  }, []);
  // Le moteur la lit au moment où il écrit les résultats, et non à la construction de `lancer` :
  // une bascule pendant un rendu d'une heure doit valoir pour la suite de ce rendu-là.
  const economieMemoireRef = useRef(economieMemoire);
  economieMemoireRef.current = economieMemoire;

  const [theme, setTheme] = useState<"violet" | "black">("black");
  useEffect(() => {
    if (theme === "violet") delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = theme;
  }, [theme]);

  const [repertoire, setRepertoire] = useState(() => localStorage.getItem("attic-repertoire") || "");
  const changerRepertoire = useCallback((r: string) => {
    setRepertoire(r);
    localStorage.setItem("attic-repertoire", r);
  }, []);
  // Répertoire de travail par défaut (Electron) : le dossier « work » du projet.
  // Sert de dossier initial aux dialogues d'export/import tant que l'utilisateur
  // n'a pas choisi le sien (via l'icône « dossier » de la barre d'outils).
  useEffect(() => {
    if (repertoire) return;
    (async () => {
      const w = await (window as any).api?.obtenirRepertoireTravail?.();
      if (w) setRepertoire(w);
    })();
    // Exécuté une seule fois au montage ; le garde interne évite d'écraser un choix.
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    paletteOuverte, togglePalette,
    sauvegardeAutoActive, basculerSauvegardeAuto,
    economieMemoire, basculerEconomieMemoire, economieMemoireRef,
    theme, setTheme,
    repertoire, changerRepertoire,
  };
}
