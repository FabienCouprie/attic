// tests-e2e/barre-stable.spec.ts — La barre d'outils ne bouge pas quand on change de langue.
//
// POURQUOI CE TEST. Relevé par Fabien : changer de langue déplaçait le menu du haut. La cause est
// ordinaire et se reproduira — un contrôle dont le libellé est traduit se dimensionne sur son texte,
// et tout ce qui le suit glisse d'autant. Trois l'ont fait ensemble : la liste de profondeur
// d'export, dont la plus large option passe de « 32 bits flottants » à « 32-bit float » et qui
// perdait vingt-deux pixels ; le bouton de lancement, « Lancer » contre « Run », dix-huit pixels ; et
// le bouton de langue lui-même, six dixièmes de pixel entre « FR » et « EN ».
//
// CE QUE LE TEST EXIGE, ET POURQUOI C'EST SI STRICT. Aucun élément de la barre ne change de position
// ni de taille, AU PIXEL PRÈS et jusqu'aux icônes. Une tolérance aurait laissé passer les six
// dixièmes du bouton de langue, qui se voient pourtant : le regard suit une barre qui frémit.
//
// IL COUVRE PLUS QUE LA LANGUE. Le bouton de lancement porte aussi « Arrêter » pendant l'exécution :
// sa largeur plancher tient les quatre libellés, si bien que le même réglage empêche le saut qui se
// produisait à chaque lancement.
import { expect, test } from "@playwright/test";

const devUrl = process.env.DEV_URL || "http://localhost:5175";

interface Boite { x: number; y: number; w: number; h: number }

test("la barre d'outils ne bouge pas d'un pixel au changement de langue", async ({ page }) => {
  await page.goto(devUrl);
  await page.waitForSelector(".attic-barre-outils", { timeout: 15000 });

  // LES DEUX BARRES, et non la seule du haut : celle des méta-composants portait le même défaut,
  // « Rename » contre « Renommer ». Une règle qui ne vaudrait que pour une barre en laisserait
  // passer une autre.
  // CE QUI EST HORS DU FLUX EST ÉCARTÉ, ET LE CRITÈRE EST UNE FORME, NON UN NOM.
  //
  // `.attic-sf2-check` est une pastille d'état posée en `position: absolute` dans le bouton du
  // SoundFont : son glyphe passe de « ? » à « ✓ » quand le SoundFont finit de charger, et sa largeur
  // de 4,047 à 6,750 px. Ce chargement prend une seconde ou deux, c'est-à-dire qu'il tombe presque
  // toujours entre les deux relevés, et le test accusait le changement de langue d'un écart de
  // 2,703 px qui ne lui devait rien — il échouait ainsi de façon reproductible, pour une raison
  // étrangère à son sujet.
  //
  // On n'écarte pas cette pastille PAR SON NOM, qui ne dirait rien du prochain indicateur d'état
  // qu'on ajoutera : on écarte ce qui est SORTI DU FLUX. Un élément en `position: absolute` ou
  // `fixed` ne pousse aucun voisin ; il ne peut donc pas produire le défaut que ce test existe pour
  // empêcher, qui est qu'un libellé traduit décale ce qui le suit. Et c'est à cela qu'on a reconnu
  // que l'écart n'en était pas un : un seul élément bougeait, et rien après lui.
  const releve = () => page.evaluate((): Boite[] =>
    [...document.querySelectorAll(".attic-barre-outils *, .attic-meta-actions *")]
      .filter((e) => !["absolute", "fixed"].includes(getComputedStyle(e).position))
      .map((e) => {
        const r = e.getBoundingClientRect();
        return { x: r.x, y: r.y, w: r.width, h: r.height };
      }));

  const basculer = () => page.evaluate(() => {
    const b = [...document.querySelectorAll("button")]
      .find((x) => ["FR", "EN"].includes((x.textContent ?? "").trim()));
    if (!b) throw new Error("bouton de langue introuvable");
    b.click();
  });

  const avant = await releve();
  expect(avant.length, "la barre d'outils paraît vide").toBeGreaterThan(20);

  await basculer();
  await page.waitForTimeout(400);
  const apres = await releve();

  expect(apres.length, "le changement de langue a ajouté ou retiré des éléments").toBe(avant.length);
  const bouges = apres
    .map((e, i) => ({
      i,
      dx: +(e.x - avant[i].x).toFixed(3),
      dy: +(e.y - avant[i].y).toFixed(3),
      dw: +(e.w - avant[i].w).toFixed(3),
      dh: +(e.h - avant[i].h).toFixed(3),
    }))
    .filter((d) => d.dx || d.dy || d.dw || d.dh);

  expect(bouges, "des éléments de la barre se déplacent au changement de langue").toEqual([]);

  // On rend la langue d'origine : un test ne laisse pas l'application dans un autre état que celui
  // où il l'a trouvée.
  await basculer();
  await page.waitForTimeout(200);
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// ET LA BARRE TIENT DANS LA FENÊTRE, À TOUTES LES LARGEURS PERMISES.
//
// POURQUOI CE SECOND CAS. La barre vivait dans la colonne du canevas, c'est-à-dire la fenêtre moins
// la palette et l'inspecteur : 1060 px à 1600, 860 à 1400, 360 au minimum d'Electron. Son contenu
// réclame 1134 px, et chaque groupe, chaque séparateur et chaque bouton porte `flex-shrink: 0`.
// **Elle débordait donc à TOUTES les largeurs** et se peignait par-dessus la colonne de
// l'inspecteur ; au-dessus de 1394 px de fenêtre le débordement retombait encore dans l'écran, ce
// qui est tout ce qui masquait le défaut. En dessous, « Lancer » était à x = 1290 pour une fenêtre
// de 1280 : hors de l'écran, la pile d'éléments en son centre vide. Rien ne le couvrait.
//
// CE QUE CE CAS EXIGE. À chaque largeur, la barre tient dans la fenêtre sans déborder, et TOUT ce
// qu'elle contient y tient aussi. Les deux assertions sont nécessaires : la première seule passe
// quand le contenu déborde d'une barre qui, elle, a la bonne taille — c'est exactement l'état
// d'avant, où `scrollWidth` valait 1134 pour un `clientWidth` de 740.
//
// LES LARGEURS NE SONT PAS CHOISIES AU HASARD : 1400 est la fenêtre qu'Electron ouvre, 900 est son
// `minWidth`, et 1280 est celle où le défaut se voyait. Entre les deux, la barre passe à deux
// rangées plutôt que de sortir de l'écran, ce que `flex-wrap` permet et que le test accepte — il
// mesure l'absence de débordement, pas un nombre de rangées.
for (const largeur of [1600, 1400, 1280, 1100, 900]) {
  test(`la barre d'outils tient dans une fenêtre de ${largeur} px, et « Lancer » s'y clique`, async ({ page }) => {
    await page.setViewportSize({ width: largeur, height: 760 });
    await page.goto(devUrl);
    await page.waitForSelector(".attic-barre-outils", { timeout: 15000 });
    await page.waitForTimeout(300);

    const releve = await page.evaluate(() => {
      const barre = document.querySelector(".attic-barre-outils") as HTMLElement;
      const dehors = [...barre.querySelectorAll("*")]
        .map((e) => ({ e: e as HTMLElement, r: (e as HTMLElement).getBoundingClientRect() }))
        .filter(({ r }) => r.width > 0 && (r.right > window.innerWidth + 0.5 || r.left < -0.5))
        .map(({ e, r }) => `${typeof e.className === "string" ? e.className.split(" ")[0] : e.tagName} à ${r.left.toFixed(0)}–${r.right.toFixed(0)}`);
      const b = document.querySelector(".attic-btn-lancer") as HTMLElement;
      const rb = b.getBoundingClientRect();
      const dessus = document.elementFromPoint(rb.x + rb.width / 2, rb.y + rb.height / 2);
      return {
        debordementDeLaBarre: barre.scrollWidth - barre.clientWidth,
        debordementDuDocument: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        dehors,
        lancerDansLaFenetre: rb.left >= -0.5 && rb.right <= window.innerWidth + 0.5
          && rb.top >= -0.5 && rb.bottom <= window.innerHeight + 0.5,
        lancerLibre: !!dessus && (dessus === b || b.contains(dessus as Node)),
      };
    });

    expect(releve.debordementDeLaBarre, "le contenu de la barre déborde de la barre").toBe(0);
    expect(releve.dehors, "des éléments de la barre sortent de la fenêtre").toEqual([]);
    expect(releve.debordementDuDocument, "la page a pris une largeur de défilement").toBe(0);
    expect(releve.lancerDansLaFenetre, "« Lancer » n'est pas entièrement dans la fenêtre").toBe(true);
    expect(releve.lancerLibre, "quelque chose couvre « Lancer »").toBe(true);
    // Et le clic aboutit vraiment : une géométrie correcte que `pointer-events` annulerait ne
    // vaudrait rien.
    await page.locator(".attic-btn-lancer").click({ timeout: 5000 });
  });
}

