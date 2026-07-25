export const dynamic = "force-dynamic";

// POST /api/admin/instagram/post — publication manuelle sur @starliguefantasy
// Étape "action admin" du plan Instagram : prend une image déjà hébergée
// (URL publique) + une légende, et publie via la Graph API (src/lib/instagram).
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminSession } from "@/lib/auth/require-admin";
import {
  postImage,
  getMediaPermalink,
  getInstagramCredentialsFromEnv,
  InstagramApiError,
} from "@/lib/instagram/client";

const PostSchema = z.object({
  imageUrl: z.string().url(),
  caption: z.string().min(1).max(2200),
});

export async function POST(req: Request) {
  if (!(await requireAdminSession())) {
    return NextResponse.json({ error: { code: "FORBIDDEN", message: "Accès refusé" } }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = PostSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "INVALID_INPUT", message: "imageUrl et caption requis", details: parsed.error.issues } },
      { status: 400 }
    );
  }

  let creds;
  try {
    creds = getInstagramCredentialsFromEnv();
  } catch {
    return NextResponse.json(
      { error: { code: "CONFIG_MISSING", message: "Identifiants Instagram non configurés (INSTAGRAM_ACCESS_TOKEN / INSTAGRAM_BUSINESS_ACCOUNT_ID)" } },
      { status: 500 }
    );
  }

  try {
    const { mediaId } = await postImage(parsed.data, creds);
    const permalink = await getMediaPermalink(mediaId, creds);
    return NextResponse.json({ data: { mediaId, permalink } });
  } catch (err) {
    if (err instanceof InstagramApiError) {
      return NextResponse.json(
        { error: { code: "INSTAGRAM_API_ERROR", message: err.message } },
        { status: 502 }
      );
    }
    throw err;
  }
}
