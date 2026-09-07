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

// Carrousel (2-10 images) — flow en 3 étapes : un conteneur "item" par image (pas de
// caption dessus), puis un conteneur parent média_type=CAROUSEL référençant tous les
// enfants (caption ici), puis publishContainer comme pour une image seule.
export async function createCarouselItemContainer(
  imageUrl: string,
  creds: InstagramCredentials
): Promise<string> {
  const url = new URL(`${GRAPH_API_BASE}/${creds.businessAccountId}/media`);
  url.searchParams.set("image_url", imageUrl);
  url.searchParams.set("is_carousel_item", "true");
  url.searchParams.set("access_token", creds.accessToken);

  const res = await fetch(url, { method: "POST" });
  const data = await parseGraphResponse(res, MediaContainerSchema);
  return data.id;
}

export async function createCarouselContainer(
  childrenIds: string[],
  caption: string,
  creds: InstagramCredentials
): Promise<string> {
  const url = new URL(`${GRAPH_API_BASE}/${creds.businessAccountId}/media`);
  url.searchParams.set("media_type", "CAROUSEL");
  url.searchParams.set("children", childrenIds.join(","));
  url.searchParams.set("caption", caption);
  url.searchParams.set("access_token", creds.accessToken);

  const res = await fetch(url, { method: "POST" });
  const data = await parseGraphResponse(res, MediaContainerSchema);
  return data.id;
}

const ContainerStatusSchema = z.object({
  status_code: z.enum(["EXPIRED", "ERROR", "FINISHED", "IN_PROGRESS", "PUBLISHED"]).optional(),
});

export interface ContainerPollOptions {
  // Délai entre deux vérifications de statut, en ms (0 = aucune attente, pour les tests).
  pollDelayMs?: number;
  // Nombre maximum de vérifications avant d'abandonner.
  pollMaxAttempts?: number;
}

const DEFAULT_POLL_DELAY_MS = 3000;
const DEFAULT_POLL_MAX_ATTEMPTS = 40; // ~2 min avec le délai par défaut

// Attend qu'un conteneur média soit prêt à publier. Instagram télécharge et valide
// les images de façon ASYNCHRONE après la création du conteneur : appeler
// media_publish sur un conteneur encore `IN_PROGRESS` échoue avec
// "Media ID is not available". Le délai grandit avec le nombre de slides — d'où
// l'échec observé le 2026-09-07 sur les carrousels attaque (8 slides) et défense
// (6) alors que gardiens (2) passait juste à temps. Doc Meta : sonder le champ
// `status_code` jusqu'à `FINISHED` avant de publier.
export async function waitForContainerReady(
  containerId: string,
  creds: InstagramCredentials,
  opts: ContainerPollOptions = {}
): Promise<void> {
  const delayMs = opts.pollDelayMs ?? DEFAULT_POLL_DELAY_MS;
  const maxAttempts = opts.pollMaxAttempts ?? DEFAULT_POLL_MAX_ATTEMPTS;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const url = new URL(`${GRAPH_API_BASE}/${containerId}`);
    url.searchParams.set("fields", "status_code");
    url.searchParams.set("access_token", creds.accessToken);

    const res = await fetch(url);
    const { status_code } = await parseGraphResponse(res, ContainerStatusSchema);

    if (status_code === "FINISHED" || status_code === "PUBLISHED") return;
    if (status_code === "ERROR" || status_code === "EXPIRED") {
      throw new InstagramApiError(`Conteneur média Instagram en état ${status_code}`);
    }
    // IN_PROGRESS (ou champ absent) → attendre et réessayer.
    if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  throw new InstagramApiError(
    `Conteneur média Instagram toujours pas prêt après ${maxAttempts} vérifications`
  );
}

export interface PostCarouselParams {
  imageUrls: string[]; // 2-10 images, ordre = ordre des slides
  caption: string;
}

// Enchaîne les 3 étapes du flow carrousel. Les créations d'enfants sont séquentielles
// (pas Promise.all) : plus simple à débugger si une image échoue au milieu, et la
// Graph API n'a pas de gain de perf notable à paralléliser ces appels. On sonde le
// statut du conteneur parent avant de publier (voir waitForContainerReady).
export async function postCarousel(
  params: PostCarouselParams,
  creds: InstagramCredentials,
  opts: ContainerPollOptions = {}
): Promise<PostImageResult> {
  const childrenIds: string[] = [];
  for (const imageUrl of params.imageUrls) {
    childrenIds.push(await createCarouselItemContainer(imageUrl, creds));
  }
  const creationId = await createCarouselContainer(childrenIds, params.caption, creds);
  await waitForContainerReady(creationId, creds, opts);
  const mediaId = await publishContainer(creationId, creds);
  return { mediaId, creationId };
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
  creds: InstagramCredentials,
  opts: ContainerPollOptions = {}
): Promise<PostImageResult> {
  const creationId = await createImageContainer(params.imageUrl, params.caption, creds);
  await waitForContainerReady(creationId, creds, opts);
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
