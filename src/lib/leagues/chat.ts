// Validation du contenu d'un message de chat de ligue — trash talk uniquement,
// pas une messagerie générale (voir prisma/schema.prisma, LeagueChatMessage).
// Fonction PURE : aucun effet de bord, aucun import Prisma.

export const CHAT_MESSAGE_MAX_LENGTH = 500;

// React échappe déjà tout ce qui est rendu via {m.content} (LeagueChat.tsx
// n'utilise jamais dangerouslySetInnerHTML) — aucune balise ne peut donc
// s'exécuter. Mais un message contenant "<script>" ou "<b>" reste affiché tel
// quel en clair, ce qui ressemble à une tentative d'injection ou pollue le
// chat visuellement — demande explicite de l'utilisateur (un membre a tenté
// d'y coller une balise). On rejette purement et simplement < et > à la
// saisie plutôt que de les échapper/tronquer silencieusement : l'auteur voit
// une erreur claire et peut reformuler, au lieu de retrouver son message
// mutilé une fois posté.
const FORBIDDEN_CHARS_PATTERN = /[<>]/;

export type ChatMessageValidationError =
  | { code: "EMPTY" }
  | { code: "TOO_LONG"; max: number }
  | { code: "INVALID_CHARACTERS" };

export interface ChatMessageValidationResult {
  valid: boolean;
  error: ChatMessageValidationError | null;
  content: string; // trim() appliqué
}

export function validateChatMessageContent(raw: string): ChatMessageValidationResult {
  const content = raw.trim();

  if (content.length === 0) {
    return { valid: false, error: { code: "EMPTY" }, content };
  }
  if (content.length > CHAT_MESSAGE_MAX_LENGTH) {
    return { valid: false, error: { code: "TOO_LONG", max: CHAT_MESSAGE_MAX_LENGTH }, content };
  }
  if (FORBIDDEN_CHARS_PATTERN.test(content)) {
    return { valid: false, error: { code: "INVALID_CHARACTERS" }, content };
  }
  return { valid: true, error: null, content };
}
