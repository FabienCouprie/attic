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
import { ExtraitVideo } from "./ExtraitVideo";
import { urlMedia } from "./url-media";
import type { VueProps } from "./vues";

export function VuePistesMultiples({ data }: VueProps) {
  const pistes = ((data as unknown as { _pistesVisu?: PisteVue[] })._pistesVisu ?? []);
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

  const dejaConnu = (data as unknown as { _videoMontageInfos?: InfosFilm })._videoMontageInfos ?? null;
  const [infos, setInfos] = useState<InfosFilm | null>(dejaConnu);
  const mesure = useRef<string | null>(null);
  useEffect(() => { setInfos(dejaConnu); }, [dejaConnu]);

  const onMesurer = useCallback(() => {
    if (!chemin || !api?.tailleFichier || !api?.lirePlage || mesure.current === chemin) return;
    mesure.current = chemin;
    (async () => {
      try {
        const { ouvrirFilmParPlages } = await import("../audio/video-sortie");
        const v = await ouvrirFilmParPlages(chemin, api);
        const releve: InfosFilm = {
          dureeSec: v.dureeSec, cadence: v.cadence, largeur: v.largeur, hauteur: v.hauteur,
        };
        (data as unknown as { _videoMontageInfos?: InfosFilm })._videoMontageInfos = releve;
        setInfos(releve);
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

  // DÉBRANCHER UNE ENTRÉE DOIT RENDRE SA MÉMOIRE. La vue ne dessine déjà plus une piste débranchée ;
  // sans ce ménage, son enveloppe et surtout son tampon resteraient accrochés au nœud jusqu'à la
  // prochaine exécution, c'est-à-dire peut-être jamais.
  const cleBranchees = branchees.join(",");
  useEffect(() => {
    const n = data as unknown as {
      _videoMontagePistes?: { piste: number }[];
      _videoMontageSons?: Record<string, AudioBuffer>;
    };
    const vivantes = new Set(branchees);
    if (Array.isArray(n._videoMontagePistes)) {
      const reste = n._videoMontagePistes.filter((x) => vivantes.has(x.piste));
      if (reste.length !== n._videoMontagePistes.length) n._videoMontagePistes = reste;
    }
    if (n._videoMontageSons) {
      for (const k of Object.keys(n._videoMontageSons)) {
        if (!vivantes.has(Number(k))) delete n._videoMontageSons[k];
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cleBranchees]);

  const d = data as unknown as { _videoMontageUrl?: string; _videoMontageNom?: string; _videoMontageOctets?: number };
  const resultat = d._videoMontageUrl
    ? { url: d._videoMontageUrl, nom: d._videoMontageNom ?? "montage.mp4", octets: d._videoMontageOctets ?? 0 }
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
      enveloppes={(data as unknown as { _videoMontagePistes?: any[] })._videoMontagePistes ?? []}
      sons={(data as unknown as { _videoMontageSons?: Record<number, AudioBuffer> })._videoMontageSons ?? {}}
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

  const n = data as unknown as {
    _extraitVideoInfos?: InfosFilm; _extraitVideoUrl?: string;
    _extraitVideoNom?: string; _extraitVideoOctets?: number;
  };
  const [infos, setInfos] = useState<InfosFilm | null>(n._extraitVideoInfos ?? null);
  const mesure = useRef<string | null>(null);
  useEffect(() => { if (n._extraitVideoInfos) setInfos(n._extraitVideoInfos); }, [n._extraitVideoInfos]);

  const onMesurer = useCallback(() => {
    if (!chemin || !api?.tailleFichier || !api?.lirePlage || mesure.current === chemin) return;
    mesure.current = chemin;
    (async () => {
      try {
        const { ouvrirFilmParPlages } = await import("../audio/video-sortie");
        const v = await ouvrirFilmParPlages(chemin, api);
        const releve: InfosFilm = {
          dureeSec: v.dureeSec, cadence: v.cadence, largeur: v.largeur, hauteur: v.hauteur,
        };
        n._extraitVideoInfos = releve;
        setInfos(releve);
      } catch { /* l'exécution dira la cause, la vue n'a pas à doubler ce message */ }
    })();
  }, [chemin, api, n]);

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
      resultat={n._extraitVideoUrl
        ? { url: n._extraitVideoUrl, nom: n._extraitVideoNom ?? "extrait.mp4", octets: n._extraitVideoOctets ?? 0 }
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
  const n = data as unknown as { _videoMuetteUrl?: string; _videoMuetteNom?: string; _videoMuetteOctets?: number };
  if (!n._videoMuetteUrl) return null;
  const nom = n._videoMuetteNom ?? "muet.mp4";
  return (
    <div className="attic-vue-film-resultat" onClick={(e) => e.stopPropagation()}>
      {api?.sauvegarderBinaire ? (
        <button className="attic-node-fichier-btn" onClick={async () => {
          const buffer = await (await fetch(n._videoMuetteUrl!)).arrayBuffer();
          await api.sauvegarderBinaire({ defaultPath: nom, filters: [{ name: "MP4", extensions: ["mp4"] }], buffer });
        }}>💾 {t("separerImageSon.enregistrer")}</button>
      ) : (
        <a className="attic-node-fichier-btn" href={n._videoMuetteUrl} download={nom}>
          💾 {t("separerImageSon.enregistrer")}
        </a>
      )}
      <span>{nom}</span>
      <span>{((n._videoMuetteOctets ?? 0) / (1024 * 1024)).toFixed(1)} Mo</span>
    </div>
  );
}

// ── Forme d'onde (WaveSurfer.js) ──
