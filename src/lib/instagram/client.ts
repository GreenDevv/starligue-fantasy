// Client Instagram Graph API (Meta) — publication de médias sur un compte
// Instagram Professionnel relié à une Page Facebook. Pas d'API Instagram
// "grand public" pour publier : seule la Graph API le permet, en deux étapes
// (création d'un conteneur média, puis publication de ce conteneur).
// Doc : https://developers.facebook.com/docs/instagram-platform/content-publishing
import { z } from "zod";

const GRAPH_API_VERSION = "v21.0";
const GRAPH_API_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

export interface InstagramCredentials {
  accessToken: string;
  businessAccountId: string;
}

export function getInstagramCredentialsFromEnv(): InstagramCredentials {
  const accessToken = process.env.INSTAGRAM_ACCESS_TOKEN;
  const businessAccountId = process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID;
  if (!accessToken || !businessAccountId) {
    throw new Error(
      "INSTAGRAM_ACCESS_TOKEN et INSTAGRAM_BUSINESS_ACCOUNT_ID doivent être définis"
    );
  }
  return { accessToken, businessAccountId };
}

const GraphErrorSchema = z.object({
  error: z.object({
    message: z.string(),
    type: z.string().optional(),
    code: z.number().optional(),
    error_subcode: z.number().optional(),
    fbtrace_id: z.string().optional(),
  }),
});

export class InstagramApiError extends Error {
  code?: number;
  subcode?: number;
  fbtraceId?: string;

  constructor(message: string, opts?: { code?: number; subcode?: number; fbtraceId?: string }) {
    super(message);
    this.name = "InstagramApiError";
    this.code = opts?.code;
    this.subcode = opts?.subcode;
    this.fbtraceId = opts?.fbtraceId;
  }
}

async function parseGraphResponse<T>(res: Response, schema: z.ZodType<T>): Promise<T> {
  const body: unknown = await res.json().catch(() => null);

  if (!res.ok) {
    const parsedError = GraphErrorSchema.safeParse(body);
    if (parsedError.success) {
      const { message, code, error_subcode, fbtrace_id } = parsedError.data.error;
      throw new InstagramApiError(message, { code, subcode: error_subcode, fbtraceId: fbtrace_id });
    }
    throw new InstagramApiError(`Réponse Graph API inattendue (HTTP ${res.status})`);
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new InstagramApiError("Réponse Graph API mal formée", undefined);
  }
  return parsed.data;
}

const MediaContainerSchema = z.object({ id: z.string() });

// Étape 1/2 — crée un conteneur média (upload par URL publique, pas par fichier).
export async function createImageContainer(
  imageUrl: string,
  caption: string,
  creds: InstagramCredentials
): Promise<string> {
  const url = new URL(`${GRAPH_API_BASE}/${creds.businessAccountId}/media`);
  url.searchParams.set("image_url", imageUrl);
  url.searchParams.set("caption", caption);
  url.searchParams.set("access_token", creds.accessToken);

  const res = await fetch(url, { method: "POST" });
  const data = await parseGraphResponse(res, MediaContainerSchema);
  return data.id;
}

// Étape 2/2 — publie un conteneur déjà créé sur le feed du compte.
export async function publishContainer(
  creationId: string,
  creds: InstagramCredentials
): Promise<string> {
  const url = new URL(`${GRAPH_API_BASE}/${creds.businessAccountId}/media_publish`);
  url.searchParams.set("creation_id", creationId);
  url.searchParams.set("access_token", creds.accessToken);

  const res = await fetch(url, { method: "POST" });
  const data = await parseGraphResponse(res, MediaContainerSchema);
  return data.id;
}

export interface PostImageParams {
  imageUrl: string;
  caption: string;
}

export interface PostImageResult {
  mediaId: string;
  creationId: string;
}

export async function postImage(
  params: PostImageParams,
  creds: InstagramCredentials
): Promise<PostImageResult> {
  const creationId = await createImageContainer(params.imageUrl, params.caption, creds);
  const mediaId = await publishContainer(creationId, creds);
  return { mediaId, creationId };
}

const PermalinkSchema = z.object({ permalink: z.string().optional() });

// Best-effort : le permalien n'est pas renvoyé par media_publish, il faut le
// redemander. Ne doit jamais faire échouer une publication déjà réussie.
export async function getMediaPermalink(
  mediaId: string,
  creds: InstagramCredentials
): Promise<string | null> {
  try {
    const url = new URL(`${GRAPH_API_BASE}/${mediaId}`);
    url.searchParams.set("fields", "permalink");
    url.searchParams.set("access_token", creds.accessToken);
    const res = await fetch(url);
    const data = await parseGraphResponse(res, PermalinkSchema);
    return data.permalink ?? null;
  } catch {
    return null;
  }
}
