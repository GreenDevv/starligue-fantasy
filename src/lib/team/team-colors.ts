// Palette assignée aux équipes de l'utilisateur par ordre (première ligue
// rejointe = première couleur) — sert à distinguer visuellement "je possède ce
// joueur dans TELLE équipe" quand plusieurs ligues sont en jeu. Mêmes teintes que
// POSITION_THEME (ui/positionTheme.ts), pas une palette catégorielle inventée.
export const TEAM_COLORS = ["#2DD4BF", "#F59E0B", "#38BDF8", "#A78BFA", "#F472B6", "#34D399"];

export function teamColor(index: number): string {
  return TEAM_COLORS[index % TEAM_COLORS.length]!;
}
