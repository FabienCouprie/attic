// core/typesFlux.ts — Interface du type de flux (couleur + règle de compatibilité).
//
// Le Map des types de flux vit désormais dans le registre (creerRegistre),
// cloisonné par domaine. Cette interface est la seule chose qui reste partagée.
export interface TypeFlux {
  id: string;
  couleur: string;
  libelle?: string;
  compatible?: (cibleId: string) => boolean;
}
