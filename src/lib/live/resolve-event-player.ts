// Retrouve le joueur mentionné dans le texte libre d'un événement live lnh.fr
// (ex: "But de Micke Brasseleur (Saint-Raphaël)", "Arrêt de Alexandre Demaille sur
// un tir de Taras Minotskyi (Dunkerque)") — pas de champ structuré firstName/lastName
// côté lnh.fr sur ce flux (contrairement au boxscore, src/lib/ingestion/boxscore.ts),
// donc recherche du nom complet ("Prénom Nom") comme sous-chaîne du texte, parmi
// l'effectif des 2 clubs du match. Le plus long nom trouvé gagne (évite qu'un nom
// court soit un faux positif contenu dans un nom plus long, ex: joueurs homonymes
// partiels) — pas besoin d'exactitude parfaite, sert un affichage (toast), pas le
// scoring fantasy.
//
// ⚠️ Comparaison insensible à la casse, PAS optionnelle : Player.lastName est
// stocké tout en majuscules pour une partie des clubs en base ("LUCIANI") alors que
// le texte lnh.fr est en casse normale ("Luciani") — un match sensible à la casse
// ne matchait ZÉRO événement en prod le 11/09 (280/280 joueurs non résolus, aucune
// photo affichée). scripts/backfill-live-event-players.ts pour rattraper les lignes
// déjà en base au moment du bug.
export interface EventPlayerCandidate {
  id: string;
  firstName: string;
  lastName: string;
}

export function resolveEventPlayerId(text: string, candidates: EventPlayerCandidate[]): string | null {
  const lowerText = text.toLowerCase();
  let best: { id: string; length: number } | null = null;
  for (const c of candidates) {
    const fullName = `${c.firstName} ${c.lastName}`;
    if (!lowerText.includes(fullName.toLowerCase())) continue;
    if (!best || fullName.length > best.length) best = { id: c.id, length: fullName.length };
  }
  return best?.id ?? null;
}
