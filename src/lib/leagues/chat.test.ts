import { describe, it, expect } from "vitest";
import { validateChatMessageContent, CHAT_MESSAGE_MAX_LENGTH } from "./chat";

describe("validateChatMessageContent", () => {
  it("accepte un message normal", () => {
    const result = validateChatMessageContent("gg les nuls, on vous attend en playoffs");
    expect(result.valid).toBe(true);
    expect(result.error).toBeNull();
  });

  it("trim les espaces superflus", () => {
    const result = validateChatMessageContent("   salut   ");
    expect(result.content).toBe("salut");
  });

  it("rejette un message vide", () => {
    const result = validateChatMessageContent("   ");
    expect(result.valid).toBe(false);
    expect(result.error).toEqual({ code: "EMPTY" });
  });

  it(`rejette un message de plus de ${CHAT_MESSAGE_MAX_LENGTH} caractères`, () => {
    const result = validateChatMessageContent("a".repeat(CHAT_MESSAGE_MAX_LENGTH + 1));
    expect(result.valid).toBe(false);
    expect(result.error).toEqual({ code: "TOO_LONG", max: CHAT_MESSAGE_MAX_LENGTH });
  });

  it(`accepte pile ${CHAT_MESSAGE_MAX_LENGTH} caractères`, () => {
    const result = validateChatMessageContent("a".repeat(CHAT_MESSAGE_MAX_LENGTH));
    expect(result.valid).toBe(true);
  });

  it("rejette une tentative de balise HTML", () => {
    const result = validateChatMessageContent("<script>alert(1)</script>");
    expect(result.valid).toBe(false);
    expect(result.error).toEqual({ code: "INVALID_CHARACTERS" });
  });

  it("rejette un simple chevron isolé", () => {
    expect(validateChatMessageContent("gg > vous").valid).toBe(false);
    expect(validateChatMessageContent("gg < vous").valid).toBe(false);
  });

  it("accepte un message avec accents et ponctuation normale", () => {
    const result = validateChatMessageContent("gg les gars, à la revanche !! 😅");
    expect(result.valid).toBe(true);
  });
});
