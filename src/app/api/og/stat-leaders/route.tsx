// GET /api/og/stat-leaders?statKey=&scope=season|average&seasonId=&gameweekNumber=
// Rend une slide PNG (1080×1350) pour le carrousel Instagram "Leaders Starligue"
// (cron src/app/api/cron/post-stat-leaders/route.ts) : le n°1 de la ligne de stat
// demandée en grand format ("hero", photo pleine largeur + dégradé + nom/valeur en
// overlay), puis une mini-liste des rangs 2 à 5 — une image par appel, Instagram
// Graph API va chercher chaque image par URL publique au moment de créer le média
// (createCarouselItemContainer), donc cette route doit rester stable et rapide à
// chaque requête, pas de cache d'état.
//
// Runtime Node.js (pas edge, par défaut pour un Route Handler) : requis pour
// interroger Prisma (getStatLeaders) et lire les polices/logos depuis le disque —
// contrairement à src/app/opengraph-image.tsx qui est en edge mais ne touche pas la DB.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";
import { z } from "zod";
import { STAT_LINE_KEYS, getStatLine } from "@/lib/stats/stat-lines";
import { getStatLeaders, type StatLeaderRow } from "@/lib/stats/get-stat-leaders";

export const dynamic = "force-dynamic";

const SIZE = { width: 1080, height: 1350 };
const HERO_HEIGHT = 620;

const querySchema = z.object({
  statKey: z.enum(STAT_LINE_KEYS),
  scope: z.enum(["season", "average"]),
  seasonId: z.string().min(1),
  gameweekNumber: z.coerce.number().int().min(1).optional(),
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

// Logos de club : chemins locaux publics (Club.logoUrl = "/clubs/xxx.png"), lus depuis
// le disque et encodés en data URI — plus fiable qu'un fetch HTTP vers soi-même pour
// quelques dizaines de PNG déjà présents dans le repo (public/clubs), et évite tout
// souci CORS/latence réseau au moment du rendu.
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

function initials(firstName: string, lastName: string): string {
  const a = firstName.trim().charAt(0);
  const b = lastName.trim().charAt(0);
  return `${a}${b}`.toUpperCase() || "?";
}

function formatValue(value: number, scope: "season" | "average"): string {
  return scope === "average" ? value.toFixed(1) : String(Math.round(value));
}

// Repli quand il n'y a pas (encore) de photo hotlinkée pour ce joueur (~119/252
// couverts, cf. mémoire player_photos_sourcing) — même dégradé teal que la mini-liste,
// juste à l'échelle du bandeau hero.
function InitialsFallback({ leader, fontSize }: { leader: StatLeaderRow; fontSize: number }) {
  return (
    <div
      style={{
        display: "flex",
        width: "100%",
        height: "100%",
        alignItems: "center",
        justifyContent: "center",
        backgroundImage: "linear-gradient(135deg, rgba(45,212,191,0.9), rgba(14,17,22,0.9))",
      }}
    >
      <div style={{ display: "flex", fontFamily: "display", fontWeight: 700, fontSize, color: "#0E1116" }}>
        {initials(leader.firstName, leader.lastName)}
      </div>
    </div>
  );
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
  const { statKey, scope, seasonId, gameweekNumber } = parsed.data;
  const statLine = getStatLine(statKey);

  const [{ leaders }, fonts] = await Promise.all([
    getStatLeaders({ statKey, scope, seasonId }),
    loadFonts(),
  ]);

  const rows = await Promise.all(
    leaders.map(async (leader: StatLeaderRow, index: number) => ({
      leader,
      rank: index + 1,
      clubLogo: leader.club.logoUrl ? await localImageDataUri(leader.club.logoUrl) : null,
    }))
  );

  const hero = rows[0] ?? null;
  const rest = rows.slice(1, 5);

  const title = statLine?.label.toUpperCase() ?? statKey;
  const scopeBadge = scope === "average" ? "MOYENNE / MATCH" : "TOTAL SAISON";

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
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            padding: "48px 56px 0 56px",
          }}
        >
          <div
            style={{
              display: "flex",
              fontSize: 24,
              letterSpacing: 5,
              color: "#F59E0B",
              border: "2px solid rgba(245,158,11,0.5)",
              padding: "8px 22px",
              marginBottom: 20,
            }}
          >
            SAISON 2026 / 27{gameweekNumber ? ` • APRÈS LA JOURNÉE ${gameweekNumber}` : ""}
          </div>
          <div
            style={{
              display: "flex",
              fontFamily: "display",
              fontSize: 64,
              fontWeight: 700,
              color: "#F1F5F9",
              letterSpacing: -1,
              lineHeight: 1,
              textAlign: "center",
            }}
          >
            {title}
          </div>
          <div
            style={{
              display: "flex",
              fontFamily: "display",
              fontSize: 28,
              fontWeight: 700,
              color: "#2DD4BF",
              letterSpacing: 3,
              marginTop: 10,
            }}
          >
            {scopeBadge}
          </div>
        </div>

        {hero ? (
          <div
            style={{
              display: "flex",
              position: "relative",
              width: "100%",
              height: HERO_HEIGHT,
              marginTop: 28,
              overflow: "hidden",
            }}
          >
            {hero.leader.photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={hero.leader.photoUrl}
                width={SIZE.width}
                height={HERO_HEIGHT}
                style={{ position: "absolute", top: 0, left: 0, objectFit: "cover" }}
              />
            ) : (
              <div style={{ display: "flex", position: "absolute", top: 0, left: 0, width: "100%", height: "100%" }}>
                <InitialsFallback leader={hero.leader} fontSize={220} />
              </div>
            )}

            {/* Masque : dégradé sombre plaqué sur le bas de la photo pour la lisibilité du texte */}
            <div
              style={{
                display: "flex",
                position: "absolute",
                left: 0,
                right: 0,
                bottom: 0,
                height: "62%",
                backgroundImage:
                  "linear-gradient(to bottom, rgba(14,17,22,0) 0%, rgba(14,17,22,0.55) 45%, #0E1116 100%)",
              }}
            />

            <div
              style={{
                display: "flex",
                flexDirection: "column",
                position: "absolute",
                left: 0,
                right: 0,
                bottom: 0,
                padding: "0 56px 28px 56px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  fontFamily: "display",
                  fontSize: 48,
                  fontWeight: 700,
                  color: "#F1F5F9",
                  letterSpacing: -0.5,
                }}
              >
                {hero.leader.firstName} {hero.leader.lastName.toUpperCase()}
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-end",
                  justifyContent: "space-between",
                  marginTop: 8,
                }}
              >
                <div style={{ display: "flex", alignItems: "center" }}>
                  {hero.clubLogo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={hero.clubLogo}
                      width={40}
                      height={40}
                      style={{ objectFit: "contain", marginRight: 12 }}
                    />
                  ) : null}
                  <div style={{ display: "flex", fontSize: 26, color: "#CBD5E1" }}>{hero.leader.club.shortName}</div>
                </div>
                <div style={{ display: "flex", fontFamily: "display", fontSize: 84, fontWeight: 700, color: "#F59E0B" }}>
                  {formatValue(hero.leader.value, scope)}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: "100%",
              height: HERO_HEIGHT,
              marginTop: 28,
              color: "#94A3B8",
              fontSize: 30,
            }}
          >
            Pas encore de données pour cette ligne de stat
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 14, padding: "28px 56px 0 56px" }}>
          {rest.map(({ leader, rank, clubLogo }) => (
            <div
              key={leader.playerId}
              style={{
                display: "flex",
                alignItems: "center",
                backgroundColor: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: 16,
                padding: "12px 22px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 40,
                  height: 40,
                  borderRadius: 20,
                  backgroundColor: "rgba(255,255,255,0.08)",
                  color: "#94A3B8",
                  fontFamily: "display",
                  fontSize: 22,
                  fontWeight: 700,
                  marginRight: 18,
                }}
              >
                {rank}
              </div>

              <div style={{ display: "flex", flexDirection: "column", flexGrow: 1 }}>
                <div style={{ display: "flex", fontSize: 24, fontWeight: 700, color: "#F1F5F9" }}>
                  {leader.firstName} {leader.lastName.toUpperCase()}
                </div>
                <div style={{ display: "flex", alignItems: "center", marginTop: 4 }}>
                  {clubLogo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={clubLogo}
                      width={24}
                      height={24}
                      style={{ objectFit: "contain", marginRight: 8 }}
                    />
                  ) : null}
                  <div style={{ display: "flex", fontSize: 18, color: "#94A3B8" }}>{leader.club.shortName}</div>
                </div>
              </div>

              <div style={{ display: "flex", fontFamily: "display", fontSize: 32, fontWeight: 700, color: "#F59E0B" }}>
                {formatValue(leader.value, scope)}
              </div>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", flexGrow: 1 }} />

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            borderTop: "1px solid rgba(255,255,255,0.1)",
            padding: "24px 56px",
          }}
        >
          <div style={{ display: "flex", fontFamily: "display", fontSize: 24, fontWeight: 700, color: "#F1F5F9" }}>
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
