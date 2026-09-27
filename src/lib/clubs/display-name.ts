// Nom de club affiché à l'utilisateur (classements, matchs, fiches joueurs, visuels) :
// Club.displayName (« Chambéry », « St-Raph »…), repli sur l'abréviation technique
// Club.shortName (« CSMBH ») tant qu'aucun nom n'est renseigné. shortName reste la clé
// technique (logos, imports, correspondances lnh.fr) — ne jamais l'afficher directement.
export interface ClubNameSource {
  shortName: string;
  displayName?: string | null;
}

export function clubDisplayName(club: ClubNameSource): string {
  const name = club.displayName?.trim();
  return name ? name : club.shortName;
}
