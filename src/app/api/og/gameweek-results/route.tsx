// GET /api/og/gameweek-results?seasonId=&gameweekNumber=
// Slide PNG (1080×1350) "Résultats de la journée" pour Instagram : les 8 scores de la
// journée, ordre chrono, vainqueur mis en avant. Même gabarit visuel que
// /api/og/stat-leaders (fond #0E1116 + dégradés teal/ambre, polices Barlow/Inter,
// footer STARLIGUE FANTASY). Runtime Node.js : Prisma + lecture polices/logos disque.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";
import { z } from "zod";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

const SIZE = { width: 1080, height: 1350 };

const querySchema = z.object({
  seasonId: z.string().min(1),
  gameweekNumber: z.coerce.number().int().min(1),
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

  const [gameweek, fonts] = await Promise.all([
    prisma.gameweek.findUnique({
      where: { seasonId_number: { seasonId, number: gameweekNumber } },
      include: {
        matches: {
          orderBy: { kickoffAt: "asc" },
          include: {
            homeClub: { select: { shortName: true, logoUrl: true } },
            awayClub: { select: { shortName: true, logoUrl: true } },
          },
        },
      },
    }),
    loadFonts(),
  ]);

  const matches = gameweek?.matches ?? [];
  const rows = await Promise.all(
    matches.map(async (m) => ({
      home: m.homeClub,
      away: m.awayClub,
      homeScore: m.homeScore,
      awayScore: m.awayScore,
      homeLogo: m.homeClub.logoUrl ? await localImageDataUri(m.homeClub.logoUrl) : null,
      awayLogo: m.awayClub.logoUrl ? await localImageDataUri(m.awayClub.logoUrl) : null,
    }))
  );

  const AMBER = "#F59E0B";
  const MUTED = "#64748B";
  const TEXT = "#F1F5F9";

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
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "48px 56px 0 56px" }}>
          <div
            style={{
              display: "flex",
              fontSize: 24,
              letterSpacing: 5,
              color: AMBER,
              border: "2px solid rgba(245,158,11,0.5)",
              padding: "8px 22px",
              marginBottom: 20,
            }}
          >
            DAIKIN STARLIGUE 2026 / 27
          </div>
          <div
            style={{
              display: "flex",
              fontFamily: "display",
              fontSize: 72,
              fontWeight: 700,
              color: TEXT,
              letterSpacing: -1,
              lineHeight: 1,
            }}
          >
            LES RÉSULTATS
          </div>
          <div
            style={{
              display: "flex",
              fontFamily: "display",
              fontSize: 30,
              fontWeight: 700,
              color: "#2DD4BF",
              letterSpacing: 3,
              marginTop: 10,
            }}
          >
            JOURNÉE {gameweekNumber}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: "34px 52px 0 52px", flexGrow: 1 }}>
          {rows.map((r, i) => {
            const homeWin = r.homeScore !== null && r.awayScore !== null && r.homeScore > r.awayScore;
            const awayWin = r.homeScore !== null && r.awayScore !== null && r.awayScore > r.homeScore;
            return (
              <div
                key={i}
                style={{
                  display: "flex",
                  alignItems: "center",
                  backgroundColor: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  borderRadius: 16,
                  padding: "14px 24px",
                  height: 96,
                }}
              >
                {/* home */}
                <div style={{ display: "flex", alignItems: "center", width: 340 }}>
                  {r.homeLogo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={r.homeLogo} width={44} height={44} style={{ objectFit: "contain", marginRight: 16 }} />
                  ) : null}
                  <div
                    style={{
                      display: "flex",
                      fontFamily: "display",
                      fontSize: 34,
                      fontWeight: 700,
                      color: homeWin ? TEXT : MUTED,
                    }}
                  >
                    {r.home.shortName}
                  </div>
                </div>

                {/* score */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", flexGrow: 1 }}>
                  <div
                    style={{
                      display: "flex",
                      fontFamily: "display",
                      fontSize: 42,
                      fontWeight: 700,
                      color: homeWin ? AMBER : TEXT,
                      minWidth: 54,
                      justifyContent: "flex-end",
                    }}
                  >
                    {r.homeScore ?? "–"}
                  </div>
                  <div style={{ display: "flex", fontSize: 26, color: MUTED, margin: "0 14px" }}>-</div>
                  <div
                    style={{
                      display: "flex",
                      fontFamily: "display",
                      fontSize: 42,
                      fontWeight: 700,
                      color: awayWin ? AMBER : TEXT,
                      minWidth: 54,
                    }}
                  >
                    {r.awayScore ?? "–"}
                  </div>
                </div>

                {/* away */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", width: 340 }}>
                  <div
                    style={{
                      display: "flex",
                      fontFamily: "display",
                      fontSize: 34,
                      fontWeight: 700,
                      color: awayWin ? TEXT : MUTED,
                    }}
                  >
                    {r.away.shortName}
                  </div>
                  {r.awayLogo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={r.awayLogo} width={44} height={44} style={{ objectFit: "contain", marginLeft: 16 }} />
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            borderTop: "1px solid rgba(255,255,255,0.1)",
            padding: "24px 56px",
          }}
        >
          <div style={{ display: "flex", fontFamily: "display", fontSize: 24, fontWeight: 700, color: TEXT }}>
            STARLIGUE <span style={{ color: "#2DD4BF" }}>FANTASY</span>
          </div>
          <div style={{ display: "flex", fontSize: 20, color: "#94A3B8" }}>starliguefantasy.fr</div>
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
