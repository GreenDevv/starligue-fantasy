// Retrouve le joueur mentionné dans le texte libre d'un événement live lnh.fr
// (ex: "But de Micke Brasseleur (Saint-Raphaël)", "Arrêt de Alexandre Demaille sur
// un tir de Taras Minotskyi (Dunkerque)") — pas de champ structuré firstName/lastName
// côté lnh.fr sur ce flux (contrairement au boxscore, src/lib/ingestion/boxscore.ts),
// donc recherche du nom complet ("Prénom Nom") comme sous-chaîne du texte, parmi
// l'effectif des 2 clubs du match. Le plus long nom trouvé gagne (évite qu'un nom
// court soit un faux positif contenu dans un nom plus long, ex: joueurs homonymes
// partiels) — pas besoin d'exactitude parfaite, sert un affichage (toast), pas le
// scoring fantasy.
export interface EventPlayerCandidate {
  id: string;
  firstName: string;
  lastName: string;
}

export function resolveEventPlayerId(text: string, candidates: EventPlayerCandidate[]): string | null {
  let best: { id: string; length: number } | null = null;
  for (const c of candidates) {
    const fullName = `${c.firstName} ${c.lastName}`;
    if (!text.includes(fullName)) continue;
    if (!best || fullName.length > best.length) best = { id: c.id, length: fullName.length };
  }
  return best?.id ?? null;
}
