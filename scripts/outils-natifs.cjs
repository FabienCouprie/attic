// scripts/outils-natifs.cjs — Les exécutables tiers qu'Attic embarque, épinglés et publiés.
//
// POURQUOI CE SCRIPT EXISTE, ET CE QU'IL REMPLACE. Jusqu'ici, la release clonait le dépôt amont de
// Songsee et le compilait au moment du paquetage, SANS ÉTIQUETTE NI COMMIT : ce qui partait dans
// l'installeur était l'état de la branche par défaut ce jour-là. Un amont qui change, et la release
// embarque autre chose que ce qui a été éprouvé ; un amont qui disparaît, et elle échoue.
//
// LE MODÈLE EST CELUI DES MODÈLES. `scripts/modeles.cjs` publie ses poids sur la release `assets`
// avec leur taille et leur empreinte, et les retire de là au besoin. Les exécutables suivent le même
// chemin, pour la même raison : ce qu'on embarque doit être nommé, daté et vérifiable.
//
// TROIS RÈGLES EN DÉCOULENT.
//
//   1. UNE VERSION ÉPINGLÉE. Chaque outil déclare un dépôt et une version — étiquette ou commit —
//      et rien ne se construit en dehors d'elle.
//   2. UN NOM D'ASSET QUI PORTE LA VERSION ET LA PLATEFORME. `gh release upload` est appelé sans
//      `--clobber`, comme pour les modèles : un contenu qui change change de nom, sans quoi une
//      installation déjà faite vérifierait une empreinte qui ne correspond plus.
//   3. UNE EMPREINTE VÉRIFIÉE À L'ARRIVÉE. Un binaire téléchargé qui ne correspond pas à son
//      SHA-256 n'est pas installé.
//
// Usage :
//   node scripts/outils-natifs.cjs --construire [id]   compile depuis la version épinglée
//   node scripts/outils-natifs.cjs --publier [id]      téléverse sur la release et note l'empreinte
//   node scripts/outils-natifs.cjs --telecharger [id]  récupère pour CETTE plateforme, et vérifie
//   node scripts/outils-natifs.cjs --verifier          dit ce qui manque, sans rien toucher
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { spawnSync } = require("child_process");

const RACINE = path.join(__dirname, "..");
const MANIFESTE = path.join(__dirname, "outils-manifest.json");
const RELEASE = "assets";
const BASE_RELEASE = "https://github.com/FabienCouprie/attic/releases/download/assets";

/** La plateforme telle que le manifeste la nomme. */
const PLATEFORME = `${process.platform}-${process.arch}`;

// « Mo » designe un million d'octets : le diviseur etait 1 048 576, donc des mebioctets
// portant le mot megaoctet, 4,9 % sous la verite. `src/core/octets.ts` porte le meme
// calcul pour l'application.
const mo = (o) => (o / 1000000).toFixed(1);
const sha256 = (fichier) =>
  crypto.createHash("sha256").update(fs.readFileSync(fichier)).digest("hex");

const lire = () => JSON.parse(fs.readFileSync(MANIFESTE, "utf8"));
const ecrire = (m) => fs.writeFileSync(MANIFESTE, JSON.stringify(m, null, 2) + "\n", "utf8");

const choisis = (manifeste, ids) =>
  manifeste.outils.filter((o) => (ids.length === 0 ? true : ids.includes(o.id)));

/** Ce que cet outil attend sur CETTE plateforme, ou `null` s'il n'y est pas prévu. */
const pourIci = (outil) => outil.plateformes[PLATEFORME] ?? null;

function executer(commande, args, options = {}) {
  const r = spawnSync(commande, args, {
    stdio: "inherit", shell: process.platform === "win32", ...options,
  });
  if (r.status !== 0) {
    console.error(`échec : ${commande} ${args.join(" ")}`);
    process.exit(1);
  }
}

/**
 * Clone le dépôt amont À LA VERSION ÉPINGLÉE, et rien d'autre.
 *
 * `--branch` accepte une étiquette comme un nom de branche ; un commit demande un clone complet
 * puis un `checkout`, d'où les deux chemins.
 */
function clonerEpingle(amont, dossier) {
  const estCommit = /^[0-9a-f]{7,40}$/i.test(amont.version);
  if (estCommit) {
    executer("git", ["clone", amont.depot, dossier]);
    executer("git", ["-C", dossier, "checkout", amont.version]);
  } else {
    executer("git", ["clone", "--depth", "1", "--branch", amont.version, amont.depot, dossier]);
  }
  if (amont.sousModules) {
    executer("git", ["-C", dossier, "submodule", "update", "--init", "--recursive", "--depth", "1"]);
  }
}

/**
 * L'archive que l'amont publie lui-même, dépliée dans le dossier de travail.
 *
 * TOUS LES AMONTS NE SE COMPILENT PAS, ET CELUI QUI PUBLIE SES BINAIRES N'A PAS À L'ÊTRE. audio.cpp
 * livre une archive par plateforme et par dos de calcul ; la recompiler demanderait le kit Vulkan et
 * rendrait un exécutable différent du leur, donc non comparable au nôtre. On prend donc le leur,
 * épinglé à son étiquette et vérifié par empreinte, et on le republie sur la release `assets` comme
 * tout le reste : rien ne se télécharge chez un tiers à l'installation.
 */
async function recupererAmont(outil, ici, travail) {
  const a = ici.amontAsset;
  const base = outil.amont.depot.replace(/\.git$/, "");
  const url = `${base}/releases/download/${a.release}/${a.nom}`;
  console.log(`\n${outil.id} ${outil.amont.version} : récupération de ${url}`);
  const reponse = await fetch(url);
  if (!reponse.ok) {
    console.error(`${outil.id} : ${reponse.status} sur ${url}`);
    process.exit(1);
  }
  const archive = path.join(travail, a.nom);
  fs.writeFileSync(archive, Buffer.from(await reponse.arrayBuffer()));
  const empreinte = sha256(archive);
  if (a.sha256 && empreinte !== a.sha256) {
    console.error(`${outil.id} : empreinte amont inattendue.\n  attendue ${a.sha256}\n  reçue    ${empreinte}`);
    process.exit(1);
  }
  const deplie = path.join(travail, "deplie");
  new (require("adm-zip"))(archive).extractAllTo(deplie, true);
  console.log(`  ${mo(fs.statSync(archive).size)} Mo, empreinte amont vérifiée`);
  return deplie;
}

async function construire(ids) {
  const manifeste = lire();
  for (const outil of choisis(manifeste, ids)) {
    const ici = pourIci(outil);
    if (!ici) {
      console.log(`${outil.id} : rien de prévu pour ${PLATEFORME}, passé.`);
      continue;
    }
    const travail = fs.mkdtempSync(path.join(require("os").tmpdir(), `attic-${outil.id}-`));
    const dest = path.join(RACINE, outil.destination);
    fs.mkdirSync(dest, { recursive: true });

    let source;
    if (ici.amontAsset) {
      source = await recupererAmont(outil, ici, travail);
    } else {
      source = path.join(travail, outil.id);
      console.log(`\n${outil.id} ${outil.amont.version} : clonage de ${outil.amont.depot}`);
      clonerEpingle(outil.amont, source);
      for (const etape of ici.construction) {
        console.log(`  ${etape.commande} ${etape.args.join(" ")}`);
        executer(etape.commande, etape.args, { cwd: path.join(source, etape.dans ?? "") });
      }
      source = path.join(source, ici.produits);
    }

    for (const f of ici.fichiers) {
      const de = path.join(source, f);
      if (!fs.existsSync(de)) {
        console.error(`${outil.id} : ${f} est absent de ${source}`);
        process.exit(1);
      }
      fs.copyFileSync(de, path.join(dest, path.basename(f)));
    }
    console.log(`${outil.id} : ${ici.fichiers.length} fichier(s) dans ${outil.destination}`);
  }
}

/** L'archive d'un outil à plusieurs fichiers, ou le fichier seul quand il n'y en a qu'un. */
function paquet(outil, ici, tmp) {
  const dest = path.join(RACINE, outil.destination);
  if (ici.fichiers.length === 1) {
    // LE NOM DE L'ASSET EST CELUI DU FICHIER TÉLÉVERSÉ, et `gh release upload` ne sait pas le
    // renommer : il prend le nom de base de ce qu'on lui donne. Un fichier seul part donc par une
    // copie portant le nom voulu, sans quoi `songsee.exe` arriverait sur la release sans version,
    // ce que le téléchargeur chercherait en vain. Relevé en mesurant : 404.
    const copie = path.join(tmp, ici.asset);
    fs.copyFileSync(path.join(dest, path.basename(ici.fichiers[0])), copie);
    return { fichier: copie, asset: ici.asset };
  }
  const AdmZip = require("adm-zip");
  const zip = new AdmZip();
  for (const f of ici.fichiers) zip.addLocalFile(path.join(dest, path.basename(f)));
  const fichier = path.join(tmp, ici.asset);
  zip.writeZip(fichier);
  return { fichier, asset: ici.asset };
}

function publier(ids) {
  const manifeste = lire();
  const tmp = path.join(RACINE, "release");
  fs.mkdirSync(tmp, { recursive: true });
  let publies = 0;
  for (const outil of choisis(manifeste, ids)) {
    const ici = pourIci(outil);
    if (!ici) continue;
    if (ici.url && ids.length === 0) {
      console.log(`${outil.id} : déjà publié pour ${PLATEFORME}.`);
      continue;
    }
    const { fichier, asset } = paquet(outil, ici, tmp);
    if (!fs.existsSync(fichier)) {
      console.error(`${outil.id} : rien à publier, construire d'abord.`);
      process.exit(1);
    }
    const octets = fs.statSync(fichier).size;
    console.log(`téléversement de ${asset} (${mo(octets)} Mo)…`);
    executer("gh", ["release", "upload", RELEASE, fichier], { cwd: RACINE });
    ici.url = `${BASE_RELEASE}/${asset}`;
    ici.octets = octets;
    ici.sha256 = sha256(fichier);
    publies += 1;
  }
  ecrire(manifeste);
  console.log(`\n${publies} outil(s) publié(s), manifeste mis à jour.`);
}

async function telecharger(ids) {
  const manifeste = lire();
  let pris = 0;
  for (const outil of choisis(manifeste, ids)) {
    const ici = pourIci(outil);
    if (!ici) continue;
    const dest = path.join(RACINE, outil.destination);
    const attendus = ici.fichiers.map((f) => path.join(dest, path.basename(f)));
    if (attendus.every((f) => fs.existsSync(f))) {
      console.log(`${outil.id} : déjà présent.`);
      continue;
    }
    if (!ici.url) {
      console.error(`${outil.id} : aucune adresse pour ${PLATEFORME}.`
        + " Construire puis publier, ou poser le binaire à la main.");
      process.exit(1);
    }
    console.log(`${outil.id} : téléchargement de ${ici.url}`);
    const reponse = await fetch(ici.url);
    if (!reponse.ok) {
      console.error(`${outil.id} : ${reponse.status} sur ${ici.url}`);
      process.exit(1);
    }
    const octets = Buffer.from(await reponse.arrayBuffer());
    fs.mkdirSync(dest, { recursive: true });
    const tmp = path.join(dest, `.${path.basename(ici.asset)}.part`);
    fs.writeFileSync(tmp, octets);
    const empreinte = sha256(tmp);
    if (ici.sha256 && empreinte !== ici.sha256) {
      fs.unlinkSync(tmp);
      console.error(`${outil.id} : empreinte inattendue.\n  attendue ${ici.sha256}\n  reçue    ${empreinte}`);
      process.exit(1);
    }
    if (ici.fichiers.length === 1) {
      fs.renameSync(tmp, path.join(dest, path.basename(ici.fichiers[0])));
    } else {
      const AdmZip = require("adm-zip");
      new AdmZip(tmp).extractAllTo(dest, true);
      fs.unlinkSync(tmp);
    }
    // Hors de Windows, un exécutable téléchargé n'est pas exécutable par lui-même.
    if (process.platform !== "win32") {
      for (const f of attendus) if (fs.existsSync(f)) fs.chmodSync(f, 0o755);
    }
    console.log(`${outil.id} : ${mo(octets.length)} Mo, empreinte vérifiée.`);
    pris += 1;
  }
  console.log(`\n${pris} outil(s) récupéré(s) pour ${PLATEFORME}.`);
}

function verifier() {
  const manifeste = lire();
  let fautes = 0;
  for (const outil of manifeste.outils) {
    const ici = pourIci(outil);
    console.log(`\n${outil.id} ${outil.amont.version} (${outil.licence.nom})`);
    if (!ici) { console.log(`  rien de prévu pour ${PLATEFORME}`); continue; }
    if (!ici.url) { console.log("  ADRESSE ABSENTE : non publié"); fautes += 1; }
    if (!ici.sha256) { console.log("  EMPREINTE ABSENTE"); fautes += 1; }
    for (const f of ici.fichiers) {
      const chemin = path.join(RACINE, outil.destination, path.basename(f));
      console.log(`  ${fs.existsSync(chemin) ? "présent " : "ABSENT  "} ${path.basename(f)}`);
      if (!fs.existsSync(chemin)) fautes += 1;
    }
  }
  console.log(fautes === 0 ? "\nTout est là." : `\n${fautes} manque(s).`);
  process.exit(fautes === 0 ? 0 : 1);
}

const arg = process.argv[2];
const reste = process.argv.slice(3);
if (arg === "--construire") construire(reste);
else if (arg === "--publier") publier(reste);
else if (arg === "--telecharger") telecharger(reste);
else if (arg === "--verifier") verifier();
else {
  console.log("node scripts/outils-natifs.cjs --construire | --publier | --telecharger | --verifier [id…]");
  process.exit(1);
}
