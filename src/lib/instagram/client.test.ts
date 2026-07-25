import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createImageContainer, publishContainer, postImage, InstagramApiError } from "./client";

const creds = { accessToken: "TOKEN", businessAccountId: "IG123" };

describe("instagram client", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = vi.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("crée un conteneur média avec les bons paramètres", async () => {
    const mockFetch = global.fetch as ReturnType<typeof vi.fn>;
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: "CREATION_1" }),
    });

    const id = await createImageContainer("https://example.com/img.jpg", "Hello", creds);

    expect(id).toBe("CREATION_1");
    const calledUrl = mockFetch.mock.calls[0]![0] as URL;
    expect(calledUrl.toString()).toContain("/IG123/media");
    expect(calledUrl.searchParams.get("image_url")).toBe("https://example.com/img.jpg");
    expect(calledUrl.searchParams.get("caption")).toBe("Hello");
    expect(calledUrl.searchParams.get("access_token")).toBe("TOKEN");
  });

  it("publie un conteneur existant", async () => {
    const mockFetch = global.fetch as ReturnType<typeof vi.fn>;
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: "MEDIA_1" }),
    });

    const id = await publishContainer("CREATION_1", creds);

    expect(id).toBe("MEDIA_1");
    const calledUrl = mockFetch.mock.calls[0]![0] as URL;
    expect(calledUrl.toString()).toContain("/IG123/media_publish");
    expect(calledUrl.searchParams.get("creation_id")).toBe("CREATION_1");
  });

  it("chaîne création puis publication dans postImage", async () => {
    const mockFetch = global.fetch as ReturnType<typeof vi.fn>;
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: "CREATION_1" }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: "MEDIA_1" }) });

    const result = await postImage({ imageUrl: "https://example.com/img.jpg", caption: "Hello" }, creds);

    expect(result).toEqual({ mediaId: "MEDIA_1", creationId: "CREATION_1" });
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("lève une InstagramApiError lisible sur erreur Graph API", async () => {
    const mockFetch = global.fetch as ReturnType<typeof vi.fn>;
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({
        error: {
          message: "Invalid image_url",
          type: "OAuthException",
          code: 100,
          error_subcode: 2108006,
          fbtrace_id: "abc123",
        },
      }),
    });

    await expect(createImageContainer("bad-url", "Hello", creds)).rejects.toMatchObject({
      name: "InstagramApiError",
      message: "Invalid image_url",
      code: 100,
      subcode: 2108006,
      fbtraceId: "abc123",
    });
  });

  it("lève une erreur générique si la réponse d'erreur ne correspond pas au format Graph API", async () => {
    const mockFetch = global.fetch as ReturnType<typeof vi.fn>;
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 502,
      json: async () => null,
    });

    await expect(createImageContainer("x", "y", creds)).rejects.toBeInstanceOf(InstagramApiError);
  });
});
