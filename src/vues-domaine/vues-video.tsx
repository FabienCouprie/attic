// ui/vues-video.tsx — Les vues des noeuds de video.
//
// Une part des vues de noeud, decoupees par domaine. Le registre qui les associe a un
// identifiant de fiche vit dans `vues.tsx`, avec le type `VueProps` que toutes recoivent.
// Aucune ligne n'a ete retouchee au passage.

import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { useNodeConnections } from "@xyflow/react";
import { useI18n } from "../i18n";
import { PistesMultiples, type PisteVue } from "./PistesMultiples";
import { MontageVideo, type InfosFilm } from "./MontageVideo";
import type { ColonneVue } from "./montage-video-geometrie";
import { ExtraitVideo } from "./ExtraitVideo";
import { urlMedia } from "./url-media";
import type { VueProps } from "../ui/registre-vues";

export function VuePistesMultiples({ data }: VueProps) {
  const pistes = ((data as unknown as { _designe?: { pistes?: PisteVue[] } })._designe?.pistes ?? []);
  return <PistesMultiples pistes={pistes} />;
}

// ── Montage vidéo : le film, et les sons posés dessous ──
//
// LA VUE MESURE LE FILM ELLE-MÊME, sans attendre une exécution : ouvrir un film par plages coûte
// moins d'un mégaoctet, et la cadence est ce qui permet de compter en images. Sans elle, on placerait
// des sons sur un axe muet.
export function VueMontageVideo({ id, data }: VueProps) {
  const params = (data.parametres ?? {}) as Record<string, unknown>;
  const chemin = String(params.Chemin ?? "").trim();
  const connexions = useNodeConnections({ handleType: "target", id });
  const api = (window as { api?: any }).api;

  // LA VUE NE POSE PLUS RIEN SUR LE NŒUD. Elle mesurait le film elle-même quand le composant
  // n'avait pas encore tourné, et écrivait le relevé dans le champ que l'exécuteur écrit aussi :
  // deux auteurs pour un même champ, dont l'un n'a aucun droit sur ce qu'un run produit. Sa mesure
  // vit désormais dans son propre état, et ce que le run a reçu se lit dans le canal déclaré.
  const dejaConnu = (data as unknown as { _designe?: { infos?: InfosFilm } })._designe?.infos ?? null;
  const [mesure, setMesure] = useState<InfosFilm | null>(null);
  const filmMesure = useRef<string | null>(null);
  const infos = dejaConnu ?? mesure;

  const onMesurer = useCallback(() => {
    if (!chemin || !api?.tailleFichier || !api?.lirePlage || filmMesure.current === chemin) return;
    filmMesure.current = chemin;
    (async () => {
      try {
        const { ouvrirFilmParPlages } = await import("../audio/video-sortie");
        const v = await ouvrirFilmParPlages(chemin, api);
        const releve: InfosFilm = {
          dureeSec: v.dureeSec, cadence: v.cadence, largeur: v.largeur, hauteur: v.hauteur,
        };
        setMesure(releve);
      } catch {
        // Un film illisible le dira à l'exécution, avec sa cause ; la vue n'a pas à doubler ce message.
      }
    })();
  }, [chemin, api, data]);

  const branchees = useMemo(
    () => connexions
      .map((c) => Number(String(c.targetHandle ?? "in:0").split(":")[1]))
      .filter((k) => Number.isFinite(k)),
    [connexions],
  );

  // UNE PISTE DÉBRANCHÉE SE FILTRE AU RENDU, ELLE NE S'EFFACE PLUS DU NŒUD. La vue retirait la piste
  // et son tampon du nœud lui-même, ce qui revenait à corriger le résultat d'un run depuis
  // l'affichage. Le filtrage dit la même chose sans rien écrire, et il ne coûte pas la mémoire que
  // l'effacement prétendait rendre : ces tampons sont DÉSIGNÉS, c'est-à-dire ceux des composants
  // d'amont, déjà tenus par le cache d'exécution, et les enveloppes pèsent seize kilo-octets.
  const dsg = (data as unknown as {
    _designe?: {
      pistes?: { piste: number; dureeSec: number; crete: number; colonnes: ColonneVue[] }[];
      sons?: Record<string, AudioBuffer>;
    };
  })._designe;
  const vivantes = useMemo(() => new Set(branchees), [branchees]);
  const enveloppes = useMemo(
    () => (dsg?.pistes ?? []).filter((p) => vivantes.has(p.piste)),
    [dsg, vivantes],
  );
  const sons = useMemo(
    () => Object.fromEntries(
      Object.entries(dsg?.sons ?? {}).filter(([k]) => vivantes.has(Number(k))),
    ) as Record<number, AudioBuffer>,
    [dsg, vivantes],
  );

  const aff = (data as unknown as {
    _affichage?: { url?: string; nom?: string; octets?: number };
  })._affichage;
  const resultat = aff?.url
    ? { url: aff.url, nom: aff.nom ?? "montage.mp4", octets: aff.octets ?? 0 }
    : null;

  return (
    <MontageVideo
      id={id}
      chemin={chemin}
      // L'ADRESSE EST FABRIQUÉE ICI, dans la fenêtre : le préchargement est en bac à sable et ne
      // peut pas partager le module du processus principal. `url-media.test.ts` tient les deux
      // écritures d'accord. Sans l'application de bureau, le protocole n'existe pas, donc pas
      // d'adresse : un navigateur ne montrerait qu'une vidéo cassée.
      urlFilm={chemin && api ? urlMedia(chemin) : null}
      resultat={resultat}
      infos={infos}
      enveloppes={enveloppes}
      sons={sons}
      branchees={branchees}
      imageDePiste={(piste) => Number(params[`Image ${piste + 1}`] ?? 0)}
      gainFilmDb={Number(params["Gain du film"] ?? 0)}
      reglagesDePiste={(piste) => ({
        gainDb: Number(params[`Gain ${piste + 1}`] ?? 0),
        fonduEntreeMs: Number(params[`Fondu entrée ${piste + 1}`] ?? 10),
        fonduSortieMs: Number(params[`Fondu sortie ${piste + 1}`] ?? 10),
      })}
      onDeplacer={(piste, image) => data.onChangerParametre?.(id, `Image ${piste + 1}`, image)}
      onMesurer={onMesurer}
    />
  );
}

// ── Extrait vidéo : le film, et la portion qu'on en garde ──
export function VueExtraitVideo({ id, data }: VueProps) {
  const params = (data.parametres ?? {}) as Record<string, unknown>;
  const chemin = String(params.Chemin ?? "").trim();
  const api = (window as { api?: any }).api;

  // MÊME RÈGLE QUE LE MONTAGE VIDÉO : la vue ne pose plus rien sur le nœud. Sa mesure vit dans son
  // état, ce que le run a reçu se lit dans le canal déclaré, et le film produit dans `affichage`.
  const n = data as unknown as {
    _designe?: { infos?: InfosFilm };
    _affichage?: { url?: string; nom?: string; octets?: number };
  };
  const dejaConnu = n._designe?.infos ?? null;
  const [mesure, setMesure] = useState<InfosFilm | null>(null);
  const filmMesure = useRef<string | null>(null);
  const infos = dejaConnu ?? mesure;

  const onMesurer = useCallback(() => {
    if (!chemin || !api?.tailleFichier || !api?.lirePlage || filmMesure.current === chemin) return;
    filmMesure.current = chemin;
    (async () => {
      try {
        const { ouvrirFilmParPlages } = await import("../audio/video-sortie");
        const v = await ouvrirFilmParPlages(chemin, api);
        setMesure({ dureeSec: v.dureeSec, cadence: v.cadence, largeur: v.largeur, hauteur: v.hauteur });
      } catch { /* l'exécution dira la cause, la vue n'a pas à doubler ce message */ }
    })();
  }, [chemin, api]);

  return (
    <ExtraitVideo
      chemin={chemin}
      urlFilm={chemin && api ? urlMedia(chemin) : null}
      infos={infos}
      imageDebut={Number(params["Image de début"] ?? 0)}
      imageFin={Number(params["Image de fin"] ?? 0)}
      onBorner={(borne, image) => data.onChangerParametre?.(
        id, borne === "debut" ? "Image de début" : "Image de fin", image,
      )}
      resultat={n._affichage?.url
        ? { url: n._affichage.url, nom: n._affichage.nom ?? "extrait.mp4", octets: n._affichage.octets ?? 0 }
        : null}
      onMesurer={onMesurer}
    />
  );
}

// ── Le film du cercle : le regarder, puis l'enregistrer ──
//
// CE NŒUD N'A AUCUN PORT, ni d'entrée ni de sortie : il est purement illustratif et ne sert qu'à
// l'export. Son film n'existe donc qu'ici, dans ses données, et cette vue est le seul endroit où on
// le voit et d'où on l'écrit. Tant qu'il n'est pas enregistré, le fichier n'existe qu'en mémoire.
export function VueFilmCercle({ data }: VueProps) {
  const { t } = useI18n();
  const api = (window as { api?: any }).api;
  const n = data as unknown as { _filmUrl?: string; _filmNom?: string; _filmOctets?: number };
  if (!n._filmUrl) return null;
  const nom = n._filmNom ?? "cercle.mp4";
  return (
    <div className="attic-vue-film-cercle" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
      <video src={n._filmUrl} controls loop className="attic-vue-film-cercle-lecteur" />
      <div className="attic-vue-film-resultat">
        {api?.sauvegarderBinaire ? (
          <button className="attic-node-fichier-btn" onClick={async () => {
            const buffer = await (await fetch(n._filmUrl!)).arrayBuffer();
            await api.sauvegarderBinaire({ defaultPath: nom, filters: [{ name: "MP4", extensions: ["mp4"] }], buffer });
          }}>💾 {t("film.enregistrer")}</button>
        ) : (
          <a className="attic-node-fichier-btn" href={n._filmUrl} download={nom}>
            💾 {t("film.enregistrer")}
          </a>
        )}
        <span>{nom}</span>
        <span>{((n._filmOctets ?? 0) / (1024 * 1024)).toFixed(1)} Mo</span>
      </div>
    </div>
  );
}

// ── Séparer image et son : récupérer la vidéo muette ──
//
// SANS CE BOUTON, LA MOITIÉ IMAGE SERAIT PERDUE. Le son rendu par ce nœud reçoit le lecteur commun
// et s'enregistre comme tout audio ; la vidéo, elle, n'existe qu'en mémoire tant qu'on ne l'écrit
// pas, et rien d'autre dans le catalogue ne sait encore écrire un fichier vidéo.
export function VueVideoMuette({ data }: VueProps) {
  const { t } = useI18n();
  const api = (window as { api?: any }).api;
  const n = (data as unknown as { _affichage?: { url?: string; nom?: string; octets?: number } })._affichage ?? {};
  if (!n.url) return null;
  const nom = n.nom ?? "muet.mp4";
  return (
    <div className="attic-vue-film-resultat" onClick={(e) => e.stopPropagation()}>
      {api?.sauvegarderBinaire ? (
        <button className="attic-node-fichier-btn" onClick={async () => {
          const buffer = await (await fetch(n.url!)).arrayBuffer();
          await api.sauvegarderBinaire({ defaultPath: nom, filters: [{ name: "MP4", extensions: ["mp4"] }], buffer });
        }}>💾 {t("separerImageSon.enregistrer")}</button>
      ) : (
        <a className="attic-node-fichier-btn" href={n.url} download={nom}>
          💾 {t("separerImageSon.enregistrer")}
        </a>
      )}
      <span>{nom}</span>
      <span>{((n.octets ?? 0) / (1024 * 1024)).toFixed(1)} Mo</span>
    </div>
  );
}

// ── Forme d'onde (WaveSurfer.js) ──
