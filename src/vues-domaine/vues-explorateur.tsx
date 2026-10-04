// ui/vues-explorateur.tsx — L'explorateur d'une discotheque.
//
// Une part des vues de noeud, decoupees par domaine. Le registre qui les associe a un
// identifiant de fiche vit dans `vues.tsx`, avec le type `VueProps` que toutes recoivent.
// Aucune ligne n'a ete retouchee au passage.

import { useState, useRef, useEffect } from "react";
import { useReactFlow } from "@xyflow/react";
import { useI18n } from "../i18n";
import type { VueProps } from "../ui/registre-vues";

import { LecteurAudio } from "../ui/lecteur-audio";
export function VueExplorateur({ id, data }: VueProps) {
  const { t } = useI18n();
  const [fichiersMusique, setFichiersMusique] = useState<{ nom: string; chemin: string }[] | null>(null);
  const [chargementMusique, setChargementMusique] = useState(false);
  const [audioLocale, setAudioLocale] = useState<string | null>(data.audioUrl ?? null);
  const { setNodes } = useReactFlow();
  const api = (window as { api?: any }).api;

  // Restaurer la sélection de piste si le workflow a été rechargé.
  useEffect(() => {
    if (!api || !data.audioChemin || fichiersMusique) return;
    const dossier = String(data.parametres?.["Chemin"] || "music collection");
    const rel = dossier.replace(/^[/\\]+|[/\\]+$/g, "");
    api.lireDossier(rel).then((liste: { nom: string; chemin: string }[] | null) => {
      if (liste) setFichiersMusique(liste);
    }).catch((e: any) => console.warn("[VueExplorateur] échec du re-scan du dossier", e));
  }, [api, data.audioChemin, data.parametres, fichiersMusique]);

  // Garder le lecteur local synchronisé avec l'URL rechargée depuis le disque.
  useEffect(() => {
    if (data.audioUrl) setAudioLocale(data.audioUrl);
  }, [data.audioUrl]);

  const dossierCourant = String(data.parametres?.["Chemin"] || "music collection");

  // LA SURBRILLANCE SUIT LE CLIC, ET NON LA FIN DE LA LECTURE DU FICHIER.
  //
  // Elle se déduisait de `data.audioChemin`, qui n'arrive qu'une fois le fichier lu sur le disque.
  // Entre le clic et cette arrivée, le navigateur mettait bien la ligne cliquée en surbrillance,
  // puis le rendu suivant de React y reposait l'ANCIENNE valeur — la piste d'avant, ou la première
  // ligne quand rien n'était encore choisi — et la bonne ligne ne revenait qu'au retour de la
  // lecture. D'où une surbrillance qui partait ailleurs et revenait, à chaque choix de piste.
  //
  // La ligne choisie est donc tenue ici, posée dès le clic, et remise d'accord avec le nœud quand
  // celui-ci change de chemin — au retour de la lecture, à la réinitialisation, ou au rechargement
  // d'un projet.
  const [choisi, setChoisi] = useState<string | null>(data.audioChemin ?? null);
  const demande = useRef<string | null>(data.audioChemin ?? null);
  useEffect(() => {
    setChoisi(data.audioChemin ?? null);
    demande.current = data.audioChemin ?? null;
  }, [data.audioChemin]);
  const selectedIndex = fichiersMusique?.findIndex((f) => f.chemin === choisi) ?? -1;

  // RIEN NE DOIT PARAÎTRE CHOISI TANT QUE RIEN NE L'EST. Une liste déroulée (`size` > 1) met sa
  // première ligne en surbrillance quand aucune option n'est sélectionnée : le nœud semblait tenir
  // la première piste, et choisir une autre ligne donnait l'impression de revenir à celle-là.
  // `value=""` ne suffit pas — le navigateur retombe sur l'indice 0 —, on le dit donc au DOM.
  // Sans tableau de dépendances : n'importe quel rendu — le chargement qui se termine, une autre
  // piste lue — repose `value=""` sur la liste, et le navigateur y revient à sa première ligne.
  const listeRef = useRef<HTMLSelectElement>(null);
  useEffect(() => {
    if (listeRef.current && selectedIndex < 0) listeRef.current.selectedIndex = -1;
  });

  // Sélection d'une piste, partagée par `onChange` et `onClick` du <select>.
  async function choisirPiste(index: number) {
    const f = fichiersMusique?.[index];
    if (!f) return;
    // UN SEUL CLIC FAIT PARTIR `click` ET `change` : sans cette garde, le fichier était lu deux fois
    // et deux URL étaient créées pour la même piste. Un état ne s'y prête pas — les deux
    // gestionnaires partent du même rendu et y liraient la même valeur périmée —, d'où la référence.
    if (demande.current === f.chemin) return;
    demande.current = f.chemin;
    setChoisi(f.chemin);                         // la ligne cliquée est en surbrillance dès maintenant
    if (f.chemin === data.audioChemin) return;   // déjà chargée : rien à refaire
    const resultat = await api?.lireFichierAudio(f.chemin);
    if (!resultat) {
      // Le fichier n'a pas pu être lu : la surbrillance revient là où elle était, plutôt que de
      // montrer comme choisie une piste que le nœud n'a pas.
      demande.current = data.audioChemin ?? null;
      setChoisi(data.audioChemin ?? null);
      return;
    }
    const blob = new Blob([resultat.donnees], { type: "audio/mpeg" });
    const fichier = new File([blob], resultat.nom, { type: "audio/mpeg" });
    const url = URL.createObjectURL(fichier);
    setAudioLocale(url);
    setNodes((nds) => nds.map((nd) => nd.id === id ? {
      ...nd,
      data: { ...nd.data, audioFichier: fichier, audioNom: fichier.name, audioUrl: url, audioChemin: f.chemin },
    } : nd));
  }

  return (
    <div className="attic-node-fichier nodrag" onClick={(e) => e.stopPropagation()}>
      {!api ? (
        <div className="attic-node-fichier-nom" style={{ opacity: 0.5 }}>{t("msg.electronUniquement")}</div>
      ) : (
        <>
          {/* `minWidth: 0` est indispensable : un élément flex a `min-width: auto`
              par défaut et refuse donc de rétrécir sous la largeur de son
              contenu. Sans lui, un chemin long élargissait ce bouton au-delà du
              conteneur et poussait l'icône de dossier hors du cadre du nœud.
              Le chemin est tronqué par des points de suspension, et reste
              lisible en entier au survol grâce au `title`. */}
          <div style={{ display: "flex", gap: 4, minWidth: 0 }}>
            <button className="attic-node-fichier-btn"
              // `display: block` (et non le `inline-flex` centré de la classe) :
              // `text-overflow: ellipsis` ne s'applique pas au contenu d'un
              // conteneur flex — le texte y était rogné des DEUX côtés, sans
              // points de suspension. En bloc aligné à gauche, on garde le début
              // du chemin et l'ellipse apparaît bien à la fin.
              style={{ flex: 1, minWidth: 0, display: "block", textAlign: "left",
                       overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
              title={`/${dossierCourant}`}
              disabled={chargementMusique} onClick={async () => {
              setChargementMusique(true);
              const rel = dossierCourant.replace(/^[/\\]+|[/\\]+$/g, "");
              const fichiers = (await api?.lireDossier(rel)) ?? null;
              setFichiersMusique(fichiers);
              setChargementMusique(false);
            }}>
              ⟳ /{dossierCourant}
            </button>
            <button className="attic-node-fichier-btn" style={{ flexShrink: 0 }} title={t("btn.choisirDossier")} onClick={async () => {
              const dossier = await api?.choisirDossier();
              if (dossier) { data.parametres!["Chemin"] = dossier; data.onChangerParametre?.(id, "Chemin", dossier); }
            }}>
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M2 4a1 1 0 011-1h3l2 2h5a1 1 0 011 1v6a1 1 0 01-1 1H3a1 1 0 01-1-1V4z" /></svg>
            </button>
          </div>
          {fichiersMusique && fichiersMusique.length > 0 && (
            // `onClick` EN PLUS de `onChange` : tant qu'aucune piste n'est
            // choisie, React pose value="" — qui ne correspond à aucune option,
            // si bien que le navigateur replie sur la première et l'affiche en
            // surbrillance. Cliquer cette première ligne ne changeait alors RIEN
            // dans le DOM : `change` ne partait pas, le nœud restait sans
            // fichier, et l'exécution répondait « Aucun fichier » alors que la
            // liste montrait bien la piste sélectionnée. Les autres lignes
            // fonctionnaient, elles, puisqu'elles changeaient réellement l'index.
            <select ref={listeRef} className="attic-node-select" size={Math.min(fichiersMusique.length, 6)}
              value={selectedIndex >= 0 ? String(selectedIndex) : ""}
              onClick={(e) => {
                const cible = e.target as HTMLElement;
                if (cible instanceof HTMLOptionElement && cible.value !== "") {
                  void choisirPiste(parseInt(cible.value, 10));
                }
              }}
              onChange={(e) => void choisirPiste(parseInt(e.target.value, 10))}>
              {fichiersMusique.map((f, i) => <option key={f.chemin} value={i}>{f.nom}</option>)}
            </select>
          )}
          {fichiersMusique && fichiersMusique.length === 0 && (
            <div className="attic-node-fichier-nom" style={{ opacity: 0.5 }}>{t("msg.aucunFichierAudio")}</div>
          )}
          {audioLocale && !data.audioUrl && <LecteurAudio key={audioLocale} src={audioLocale} className="attic-node-audio" trace />}
          {data.audioResultatUrl && <LecteurAudio key={data.audioResultatUrl} src={data.audioResultatUrl} className="attic-node-audio" trace />}
        </>
      )}
    </div>
  );
}

// ── Lecteur musique (Electron) ──
