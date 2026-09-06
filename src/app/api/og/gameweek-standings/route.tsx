// GET /api/og/gameweek-standings?seasonId=&gameweekNumber=
// Slide PNG (1080×1350) "Classement Starligue après la journée N" pour Instagram.
// Lit le snapshot ClubStanding de la journée demandée (jamais recalculé). Même
// gabarit visuel que /api/og/stat-leaders. Runtime Node.js : Prisma + polices/logos.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";
import { z } from "zod";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

const SIZE = { width: 1080, height: 1350 };

const querySchema = z.object({
  seasonId: z.string().min(1),
  gameweekNumber: z.coerce.number().int().min(0),
});

const FONTS_DIR = path.join(process.cwd(), "src/lib/social/fonts");
let fontCache: { display: Buffer; sans: Buffer } | null = null;
async function loadFonts() {
  if (!fontCache) {
    const [display, sans] = await Promise.all([
      readFile(path.join(FONTS_DIR, "BarlowCondensed-Bold.ttf")),
      readFile(path.join(FONTS_DIR, "Inter-Regular.ttf")),
    ]);
    fontCache = { display, sans };
  }
  return fontCache;
}

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
  const { seasonId, gameweekNumber } = parsed.data;

  const [standing, fonts] = await Promise.all([
    prisma.clubStanding.findMany({
      where: { seasonId, gameweekNumber },
      orderBy: { rank: "asc" },
      include: { club: { select: { shortName: true, logoUrl: true } } },
    }),
    loadFonts(),
  ]);

  const rows = await Promise.all(
    standing.map(async (s) => ({
      rank: s.rank,
      shortName: s.club.shortName,
      played: s.played,
      goalAvg: s.goalAvg,
      points: s.points,
      logo: s.club.logoUrl ? await localImageDataUri(s.club.logoUrl) : null,
    }))
  );

  const AMBER = "#F59E0B";
  const TEAL = "#2DD4BF";
  const TEXT = "#F1F5F9";
  const MUTED = "#94A3B8";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          backgroundColor: "#0E1116",
          backgroundImage:
            "radial-gradient(ellipse 90% 40% at 50% 0%, rgba(45,212,191,0.16), transparent 60%), radial-gradient(ellipse 70% 40% at 90% 100%, rgba(245,158,11,0.12), transparent 60%)",
          fontFamily: "sans",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "44px 56px 0 56px" }}>
          <div
            style={{
              display: "flex",
              fontSize: 24,
              letterSpacing: 5,
              color: AMBER,
              border: "2px solid rgba(245,158,11,0.5)",
              padding: "8px 22px",
              marginBottom: 18,
            }}
          >
            DAIKIN STARLIGUE 2026 / 27
          </div>
          <div
            style={{
              display: "flex",
              fontFamily: "display",
              fontSize: 68,
              fontWeight: 700,
              color: TEXT,
              letterSpacing: -1,
              lineHeight: 1,
            }}
          >
            LE CLASSEMENT
          </div>
          <div
            style={{
              display: "flex",
              fontFamily: "display",
              fontSize: 28,
              fontWeight: 700,
              color: TEAL,
              letterSpacing: 3,
              marginTop: 8,
            }}
          >
            {gameweekNumber === 0 ? "AVANT LA JOURNÉE 1" : `APRÈS LA JOURNÉE ${gameweekNumber}`}
          </div>
        </div>

        {/* colonne d'en-tête */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            padding: "24px 60px 8px 60px",
            fontSize: 18,
            letterSpacing: 2,
            color: MUTED,
          }}
        >
          <div style={{ display: "flex", width: 56 }}>#</div>
          <div style={{ display: "flex", flexGrow: 1 }}>CLUB</div>
          <div style={{ display: "flex", width: 70, justifyContent: "center" }}>J</div>
          <div style={{ display: "flex", width: 90, justifyContent: "center" }}>+/-</div>
          <div style={{ display: "flex", width: 90, justifyContent: "flex-end" }}>PTS</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", padding: "0 60px", flexGrow: 1 }}>
          {rows.map((r) => (
            <div
              key={r.rank}
              style={{
                display: "flex",
                alignItems: "center",
                height: 58,
                borderBottom: "1px solid rgba(255,255,255,0.07)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  width: 56,
                  fontFamily: "display",
                  fontSize: 30,
                  fontWeight: 700,
                  color: r.rank === 1 ? AMBER : r.rank >= 15 ? "#F87171" : MUTED,
                }}
              >
                {r.rank}
              </div>
              <div style={{ display: "flex", alignItems: "center", flexGrow: 1 }}>
                {r.logo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={r.logo} width={38} height={38} style={{ objectFit: "contain", marginRight: 16 }} />
                ) : null}
                <div style={{ display: "flex", fontFamily: "display", fontSize: 32, fontWeight: 700, color: TEXT }}>
                  {r.shortName}
                </div>
              </div>
              <div style={{ display: "flex", width: 70, justifyContent: "center", fontSize: 24, color: MUTED }}>
                {r.played}
              </div>
              <div
                style={{
                  display: "flex",
                  width: 90,
                  justifyContent: "center",
                  fontSize: 24,
                  color: r.goalAvg > 0 ? TEAL : r.goalAvg < 0 ? "#F87171" : MUTED,
                }}
              >
                {r.goalAvg > 0 ? `+${r.goalAvg}` : r.goalAvg}
              </div>
              <div
                style={{
                  display: "flex",
                  width: 90,
                  justifyContent: "flex-end",
                  fontFamily: "display",
                  fontSize: 34,
                  fontWeight: 700,
                  color: AMBER,
                }}
              >
                {r.points}
              </div>
            </div>
          ))}
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            borderTop: "1px solid rgba(255,255,255,0.1)",
            padding: "20px 56px",
          }}
        >
          <div style={{ display: "flex", fontFamily: "display", fontSize: 24, fontWeight: 700, color: TEXT }}>
            STARLIGUE <span style={{ color: TEAL }}>FANTASY</span>
          </div>
          <div style={{ display: "flex", fontSize: 20, color: MUTED }}>starliguefantasy.fr</div>
        </div>
      </div>
    ),
    {
      ...SIZE,
      fonts: [
        { name: "display", data: fonts.display, weight: 700, style: "normal" },
        { name: "sans", data: fonts.sans, weight: 400, style: "normal" },
      ],
    }
  );
}
