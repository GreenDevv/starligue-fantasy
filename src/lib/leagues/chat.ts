// Validation du contenu d'un message de chat de ligue — trash talk uniquement,
// pas une messagerie générale (voir prisma/schema.prisma, LeagueChatMessage).
// Fonction PURE : aucun effet de bord, aucun import Prisma.

export const CHAT_MESSAGE_MAX_LENGTH = 500;

export type ChatMessageValidationError = { code: "EMPTY" } | { code: "TOO_LONG"; max: number };

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
  return { valid: true, error: null, content };
}
