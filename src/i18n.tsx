// i18n.ts — Internationalisation (React context)
import { createContext, useContext, useState, useCallback } from "react";

export type Langue = "fr" | "en";

const LANG_KEY = "attic-lang";

const DICO: Record<string, Record<Langue, string>> = {
  "app.title": { fr: "Attic", en: "Attic" },
  "btn.lancer": { fr: "Lancer", en: "Run" },
  "btn.nouveau": { fr: "Nouveau", en: "New" },
  "btn.exporter": { fr: "Exporter", en: "Export" },
  "btn.sauvegarder": { fr: "Sauvegarder l'en-cours", en: "Save work-in-progress" },
  "btn.importer": { fr: "Importer", en: "Import" },
  "btn.dossier": { fr: "Dossier", en: "Folder" },
  "btn.theme": { fr: "Thème", en: "Theme" },
  "btn.sf2": { fr: "SF2", en: "SF2" },
  "btn.executer": { fr: "Exécuter ce bloc", en: "Run this block" },
  "btn.reinitialiser": { fr: "Réinitialiser", en: "Reset" },
  "btn.doc": { fr: "Documentation", en: "Documentation" },
  "btn.charger.audio": { fr: "Charger audio…", en: "Load audio…" },
  "btn.changer.audio": { fr: "Changer…", en: "Change…" },
  "btn.charger.midi": { fr: "Charger MIDI…", en: "Load MIDI…" },
  "btn.changer.midi": { fr: "Changer…", en: "Change…" },
  "btn.charger.onnx": { fr: "Charger modèle ONNX…", en: "Load ONNX…" },
  "btn.charger.ir": { fr: "Charger IR…", en: "Load IR…" },
  "btn.charger.pd": { fr: "Charger patch Pd…", en: "Load Pd patch…" },
  "btn.changer.pd": { fr: "Changer…", en: "Change…" },
  "btn.copier": { fr: "Copier le texte", en: "Copy text" },
  "evolution.jaime": { fr: "J'aime", en: "Like" },
  "evolution.jaimePas": { fr: "J'aime pas", en: "Dislike" },
  "evolution.evoluer": { fr: "Évoluer", en: "Evolve" },
  "btn.record": { fr: "Enregistrer", en: "Record" },
  "btn.rerecord": { fr: "Réenregistrer", en: "Re-record" },
  "btn.stop": { fr: "Arrêter", en: "Stop" },
  "btn.device": { fr: "Périphérique", en: "Device" },
  "btn.detacher": { fr: "Détacher", en: "Detach" },
  "statut.attente": { fr: "En attente", en: "Waiting" },
  "statut.en_cours": { fr: "En cours", en: "Running" },
  "statut.termine": { fr: "Terminé", en: "Done" },
  "statut.erreur": { fr: "Erreur", en: "Error" },
  "palette.titre": { fr: "Catalogue", en: "Catalog" },
  "palette.recherche": { fr: "Rechercher…", en: "Search…" },
  "palette.supprimerMeta": { fr: "Supprimer ce méta-composant du catalogue", en: "Remove this meta-component from the catalog" },
  "palette.effacerToutMeta": { fr: "Effacer tous les méta-composants", en: "Delete all meta-components" },
  "palette.confirmEffacer": { fr: "Effacer tous les méta-composants du catalogue ?", en: "Delete all meta-components from the catalog?" },
  "univers.Entrées": { fr: "Entrées", en: "Inputs" },
  "univers.Traitement": { fr: "Traitement", en: "Processing" },
  "univers.Sorties": { fr: "Sorties", en: "Outputs" },
  "univers.Visualisation": { fr: "Visualisation", en: "Visualization" },
  "univers.Collections": { fr: "Collections", en: "Collections" },
  "univers.Nouvelles fonctionnalités": { fr: "Nouvelles fonctionnalités", en: "New features" },
  "univers.Méta-composants": { fr: "Méta-composants", en: "Meta-components" },
  "univers.Autres": { fr: "Autres", en: "Others" },
  "famille.Sous-graphes": { fr: "Sous-graphes", en: "Sub-graphs" },
  "famille.Texte": { fr: "Texte", en: "Text" },
  "famille.Text to Speech": { fr: "Text to Speech", en: "Text to Speech" },
  "famille.Speech to Text": { fr: "Speech to Text", en: "Speech to Text" },
  "famille.Audio": { fr: "Audio", en: "Audio" },
  "famille.Génération": { fr: "Génération", en: "Generation" },
  "famille.Effets": { fr: "Effets", en: "Effects" },
  "famille.Montage": { fr: "Montage", en: "Editing" },
  "famille.Écoute": { fr: "Écoute", en: "Monitoring" },
  "famille.Analyse": { fr: "Analyse", en: "Analysis" },
  "famille.Conversion": { fr: "Conversion", en: "Conversion" },
  "famille.Export": { fr: "Export", en: "Export" },
  "famille.Installation": { fr: "Installation", en: "Installation" },
  "inspecteur.vide": { fr: "Sélectionnez un bloc", en: "Select a block" },
  "inspecteur.savoirPlus": { fr: "En savoir plus", en: "Learn more" },
  "inspecteur.savoirMoins": { fr: "Réduire", en: "Show less" },
  "msg.connecter.audio": { fr: "Connectez une entrée audio → Lancer", en: "Connect audio input → Run" },
  "msg.aucun.fichier": { fr: "Aucun fichier chargé.", en: "No file loaded." },
  "msg.au-moins-2": { fr: "Branchez au moins 2 entrées.", en: "Connect at least 2 inputs." },
  "msg.sf2.non.charge": { fr: "SoundFont non chargé (barre du haut).", en: "SoundFont not loaded (top bar)." },
  "msg.erreur": { fr: "Erreur", en: "Error" },
  "export.nomFichier": { fr: "nom-du-fichier", en: "filename" },
  "export.telecharger": { fr: "⬇ Télécharger", en: "⬇ Download" },
  "export.sauvegarder": { fr: "💾 Sauvegarder", en: "💾 Save" },
  "export.avantLancer": { fr: "Lancez l'exécution pour générer le résultat.", en: "Run the workflow to generate the result." },
  "favs.titre": { fr: "Banque de son", en: "Sound bank" },
  "favs.sonotheque": { fr: "Sonothèque", en: "Sound library" },
  "favs.pixabay": { fr: "Pixabay", en: "Pixabay" },
  "favs.signature": { fr: "Signature Sounds (CC0)", en: "Signature Sounds (CC0)" },
  "favs.cc0sounds": { fr: "CC0 Sounds", en: "CC0 Sounds" },
  "favs.sonniss": { fr: "Sonniss GDC (7.5 GB)", en: "Sonniss GDC (7.5 GB)" },
  "favs.freesound": { fr: "Freesound", en: "Freesound" },
  "favs.openlofi": { fr: "Open Lofi (CC0)", en: "Open Lofi (CC0)" },
  "favs.birdsounds": { fr: "Bird Sounds (602 espèces)", en: "Bird Sounds (602 species)" },
  "favs.cornell": { fr: "Cornell Lab (oiseaux)", en: "Cornell Lab (birds)" },
  "favs.hawaii": { fr: "Oiseaux d'Hawaï (CC0)", en: "Birds of Hawaii (CC0)" },
  "favs.sounddino": { fr: "SoundDino (chants d'oiseaux)", en: "SoundDino (birdsong)" },
  "favs.vcsl": { fr: "VCSL (4000 échantillons CC0)", en: "VCSL (4000 samples CC0)" },
  "favs.philharmonia": { fr: "Philharmonia (orchestre)", en: "Philharmonia (orchestra)" },
  "favs.mutedio": { fr: "Muted.io (instruments CC0)", en: "Muted.io (CC0 instruments)" },
  "favs.chantcosmos": { fr: "Chants du Cosmos ( Philippe Zarka)", en: "Songs of the Cosmos (Philippe Zarka)" },
  "favs.sounddinoSea": { fr: "SoundDino (animaux marins)", en: "SoundDino (marine animals)" },
  "favs.aquaplan": { fr: "AquaPLAN (sons sous-marins)", en: "AquaPLAN (underwater sounds)" },
  "favs.marineMammals": { fr: "Mammifères marins (32 espèces)", en: "Marine mammals (32 species)" },
  "maj.disponible": { fr: "Mise à jour disponible", en: "Update available" },
  "maj.telechargement": { fr: "Téléchargement", en: "Downloading" },
  "maj.pret": { fr: "Mise à jour prête — relancer pour installer", en: "Update ready — restart to install" },
  "maj.relancer": { fr: "Relancer", en: "Restart" },
  "maj.a-jour": { fr: "À jour", en: "Up to date" },
  "maj.verification": { fr: "Vérifier les mises à jour", en: "Check for updates" },
  "maj.erreur": { fr: "Erreur de mise à jour", en: "Update error" },
  "maj.indisponible": { fr: "Mises à jour indisponibles (mode dev)", en: "Updates unavailable (dev mode)" },
  "meta.grouper": { fr: "Grouper", en: "Group" },
  "meta.grouperTitle": { fr: "Regrouper les nœuds sélectionnés en un méta-composant", en: "Group selected nodes into a meta-component" },
  "meta.degrouper": { fr: "Dégrouper", en: "Ungroup" },
  "meta.degrouperTitle": { fr: "Dégrouper le méta-composant sélectionné", en: "Ungroup the selected meta-component" },
  "meta.renommer": { fr: "Renommer", en: "Rename" },
  "meta.renommerTitle": { fr: "Renommer le méta-composant sélectionné", en: "Rename the selected meta-component" },
  "meta.entree": { fr: "Entrée", en: "Input" },
  "meta.ajoutEntree": { fr: "Ajouter une entrée exposée au méta-composant", en: "Add an exposed input to the meta-component" },
  "meta.sortie": { fr: "Sortie", en: "Output" },
  "meta.ajoutSortie": { fr: "Ajouter une sortie exposée au méta-composant", en: "Add an exposed output to the meta-component" },
  "meta.atelier": { fr: "Atelier", en: "Workshop" },
};

interface I18nContextType {
  lang: Langue;
  setLang: (l: Langue) => void;
  t: (cle: string) => string;
}

const I18nContext = createContext<I18nContextType>({
  lang: "fr",
  setLang: () => {},
  t: (cle: string) => DICO[cle]?.fr ?? cle,
});

export function useI18n() {
  return useContext(I18nContext);
}

// Langue courante hors React (pour les plugins/exécuteurs qui n'ont pas de hook).
// Même source que le provider (localStorage) → reste cohérent avec le toggle.
export function langueCourante(): Langue {
  return (localStorage.getItem(LANG_KEY) as Langue) || "fr";
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Langue>(
    () => (localStorage.getItem(LANG_KEY) as Langue) || "fr"
  );

  const setLang = useCallback((l: Langue) => {
    setLangState(l);
    localStorage.setItem(LANG_KEY, l);
  }, []);

  const t = useCallback((cle: string) => {
    return DICO[cle]?.[lang] ?? cle;
  }, [lang]);

  return (
    <I18nContext.Provider value={{ lang, setLang, t }}>
      {children}
    </I18nContext.Provider>
  );
}
