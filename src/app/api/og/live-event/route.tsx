// GET /api/og/live-event?home=<clubId>&away=<clubId>
// Bannière (1200×600) "écusson vs écusson" utilisée comme `image` des notifications
// Web Push d'événements live (voir src/lib/notifications/notify-live-events.ts +
// public/sw.js). Volontairement minimale — pas de texte/police, juste les deux
// logos sur fond sombre — pour rester lisible en petit dans une notification.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";
import { z } from "zod";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

const SIZE = { width: 1200, height: 600 };

const querySchema = z.object({
  home: z.string().min(1),
  away: z.string().min(1),
});

const logoCache = new Map<string, string>();
async function localImageDataUri(publicPath: string): Promise<string | null> {
  if (logoCache.has(publicPath)) return logoCache.get(publicPath)!;
  try {
    const buf = await readFile(path.join(process.cwd(), "public", publicPath));
    const uri = `data:image/png;base64,${buf.toString("base64")}`;
    logoCache.set(publicPath, uri);
    return uri;
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const parsed = querySchema.safeParse(Object.fromEntries(searchParams));
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: { code: "INVALID_QUERY", message: parsed.error.message } }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const [homeClub, awayClub] = await Promise.all([
    prisma.club.findUnique({ where: { id: parsed.data.home }, select: { logoUrl: true } }),
    prisma.club.findUnique({ where: { id: parsed.data.away }, select: { logoUrl: true } }),
  ]);

  const [homeLogo, awayLogo] = await Promise.all([
    homeClub?.logoUrl ? localImageDataUri(homeClub.logoUrl) : null,
    awayClub?.logoUrl ? localImageDataUri(awayClub.logoUrl) : null,
  ]);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#0E1116",
          backgroundImage:
            "radial-gradient(ellipse 80% 60% at 50% 50%, rgba(45,212,191,0.14), transparent 65%)",
        }}
      >
        {homeLogo && (
          <img src={homeLogo} width={280} height={280} style={{ objectFit: "contain", marginRight: 48 }} />
        )}
        <div style={{ width: 2, height: 360, backgroundColor: "rgba(241,245,249,0.15)" }} />
        {awayLogo && (
          <img src={awayLogo} width={280} height={280} style={{ objectFit: "contain", marginLeft: 48 }} />
        )}
      </div>
    ),
    SIZE
  );
}
