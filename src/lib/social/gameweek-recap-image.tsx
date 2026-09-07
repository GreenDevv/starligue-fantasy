// Rendu du visuel partageable "récap de journée" (1080×1350) — séparé de la route
// GET /api/og/gameweek-recap pour être rendu aussi hors requête (script de preview
// scripts/preview-gameweek-recap-image.tsx). Même gabarit que /api/og/stat-leaders
// (§17) : fond #0E1116 + dégradés teal/ambre, Barlow Condensed titres/chiffres,
// Inter corps.
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- runtime JSX classique quand importé hors build Next (scripts/preview-gameweek-recap-image.tsx)
import * as React from "react";
import { ImageResponse } from "next/og";
import type { Position } from "@/lib/squad/validation";

export const RECAP_IMAGE_SIZE = { width: 1080, height: 1350 };

const POS_SHORT: Record<Position, string> = {
  GK: "GB",
  LW: "AG",
  LB: "ARG",
  CB: "DC",
  RB: "ARD",
  RW: "AD",
  PV: "PIV",
};
const POS_COLOR: Record<Position, string> = {
  GK: "#2DD4BF",
  LW: "#F59E0B",
  LB: "#38BDF8",
  CB: "#A78BFA",
  RB: "#38BDF8",
  RW: "#F59E0B",
  PV: "#34D399",
};

export interface RecapImagePlayer {
  playerId: string;
  firstName: string;
  lastName: string;
  position: Position;
  isCaptain: boolean;
  points: number | null;
}

export interface RecapImageRank {
  globalRank: number;
  leagueRank: number;
  globalDelta: number | null;
  leagueDelta: number | null;
  totalTeams: number;
}

export interface RecapImageTopPerformer {
  firstName: string;
  lastName: string;
  position: Position;
  clubShortName: string;
  clubLogoDataUri: string | null;
  photoUrl: string | null; // hotlink ou data URI — next/og fetch les deux
  points: number | null;
}

export interface GameweekRecapImageData {
  gameweekNumber: number;
  teamName: string;
  leagueName: string;
  totalPoints: number;
  rank: RecapImageRank | null;
  topPerformer: RecapImageTopPerformer | null;
  starters: RecapImagePlayer[];
  bench: RecapImagePlayer[];
}

function fmt(n: number | null): string {
  if (n === null) return "0";
  return n > 0 ? `+${n}` : String(n);
}
function pointsColor(n: number | null): string {
  if (n === null || n === 0) return "#64748B";
  return n > 0 ? "#34D399" : "#F87171";
}
function initials(f: string, l: string): string {
  return `${f.trim().charAt(0)}${l.trim().charAt(0)}`.toUpperCase() || "?";
}

function DeltaChip({ delta }: { delta: number | null }) {
  if (delta === null || delta === 0) {
    return <div style={{ display: "flex", fontSize: 20, color: "#94A3B8" }}>—</div>;
  }
  const up = delta > 0;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        fontSize: 22,
        fontWeight: 700,
        color: up ? "#34D399" : "#F87171",
        backgroundColor: up ? "rgba(52,211,153,0.14)" : "rgba(248,113,113,0.14)",
        padding: "4px 12px",
      }}
    >
      {up ? "▲" : "▼"} {Math.abs(delta)}
    </div>
  );
}

function SquadColumn({ title, rows }: { title: string; rows: RecapImagePlayer[] }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
      <div style={{ display: "flex", fontSize: 18, letterSpacing: 3, color: "#64748B", fontWeight: 700, marginBottom: 10 }}>
        {title}
      </div>
      {rows.map((p) => (
        <div
          key={p.playerId}
          style={{ display: "flex", alignItems: "center", padding: "14px 0", borderBottom: "1px solid rgba(38,45,56,0.7)" }}
        >
          <div style={{ display: "flex", justifyContent: "center", width: 46, fontSize: 15, fontWeight: 700, color: POS_COLOR[p.position] }}>
            {POS_SHORT[p.position]}
          </div>
          <div style={{ display: "flex", fontSize: 24, color: "#F1F5F9", flexGrow: 1 }}>
            {p.firstName.charAt(0)}. {p.lastName}
          </div>
          {p.isCaptain ? (
            <div style={{ display: "flex", fontSize: 13, fontWeight: 700, color: "#0E1116", backgroundColor: "#F59E0B", padding: "1px 5px", marginRight: 10 }}>
              C
            </div>
          ) : null}
          <div
            style={{
              display: "flex",
              fontFamily: "display",
              fontSize: 26,
              fontWeight: 700,
              color: pointsColor(p.points),
              minWidth: 54,
              justifyContent: "flex-end",
            }}
          >
            {fmt(p.points)}
          </div>
        </div>
      ))}
    </div>
  );
}

export function renderGameweekRecapImage(
  data: GameweekRecapImageData,
  fonts: { display: Buffer; sans: Buffer }
): ImageResponse {
  const { rank, topPerformer: top } = data;
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
            "radial-gradient(ellipse 90% 40% at 10% 0%, rgba(45,212,191,0.16), transparent 60%), radial-gradient(ellipse 80% 45% at 100% 100%, rgba(245,158,11,0.13), transparent 60%)",
          fontFamily: "sans",
          padding: "52px 56px",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", fontFamily: "display", fontSize: 26, fontWeight: 700, color: "#2DD4BF", letterSpacing: 2 }}>
            STARLIGUE FANTASY
          </div>
          <div style={{ display: "flex", fontSize: 18, letterSpacing: 3, color: "#64748B", fontWeight: 700 }}>
            {data.leagueName.toUpperCase()}
          </div>
        </div>

        <div style={{ display: "flex", fontFamily: "display", fontSize: 66, fontWeight: 700, color: "#F1F5F9", marginTop: 26, lineHeight: 1 }}>
          JOURNÉE {data.gameweekNumber}
        </div>
        <div style={{ display: "flex", fontSize: 24, color: "#94A3B8", marginTop: 4 }}>{data.teamName}</div>

        <div
          style={{
            display: "flex",
            fontFamily: "display",
            fontSize: 128,
            fontWeight: 700,
            color: data.totalPoints >= 0 ? "#34D399" : "#F87171",
            lineHeight: 0.9,
            marginTop: 12,
          }}
        >
          {fmt(data.totalPoints)}
          <div style={{ display: "flex", fontSize: 34, color: "#94A3B8", marginLeft: 10, alignItems: "flex-end", paddingBottom: 14 }}>PTS</div>
        </div>

        {rank ? (
          <div style={{ display: "flex", gap: 14, marginTop: 22 }}>
            <div style={{ display: "flex", flexDirection: "column", flex: 1, backgroundColor: "#171C24", border: "1px solid #262D38", padding: "14px 18px" }}>
              <div style={{ display: "flex", fontSize: 16, letterSpacing: 2, color: "#64748B", fontWeight: 700 }}>CLASSEMENT GÉNÉRAL</div>
              <div style={{ display: "flex", alignItems: "center", marginTop: 8 }}>
                <div style={{ display: "flex", fontFamily: "display", fontSize: 40, fontWeight: 700, color: "#F1F5F9" }}>{rank.globalRank}ᵉ</div>
                <div style={{ display: "flex", fontSize: 20, color: "#94A3B8", marginLeft: 8, marginRight: "auto" }}>/ {rank.totalTeams}</div>
                <DeltaChip delta={rank.globalDelta} />
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", flex: 1, backgroundColor: "#171C24", border: "1px solid #262D38", padding: "14px 18px" }}>
              <div style={{ display: "flex", fontSize: 16, letterSpacing: 2, color: "#64748B", fontWeight: 700 }}>DANS LA LIGUE</div>
              <div style={{ display: "flex", alignItems: "center", marginTop: 8 }}>
                <div style={{ display: "flex", fontFamily: "display", fontSize: 40, fontWeight: 700, color: "#F1F5F9", marginRight: "auto" }}>{rank.leagueRank}ᵉ</div>
                <DeltaChip delta={rank.leagueDelta} />
              </div>
            </div>
          </div>
        ) : null}

        {top ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              backgroundImage: "linear-gradient(120deg, rgba(45,212,191,0.16), rgba(245,158,11,0.12))",
              border: "1px solid #262D38",
              padding: 16,
              marginTop: 22,
            }}
          >
            <div style={{ display: "flex", width: 108, height: 108, marginRight: 18, overflow: "hidden", border: "1px solid #2DD4BF", backgroundColor: "#0b0f14" }}>
              {top.photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={top.photoUrl} width={108} height={108} style={{ objectFit: "cover", objectPosition: "center top" }} />
              ) : (
                <div
                  style={{
                    display: "flex",
                    width: "100%",
                    height: "100%",
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundImage: "linear-gradient(135deg, rgba(45,212,191,0.9), rgba(14,17,22,0.9))",
                    fontFamily: "display",
                    fontSize: 46,
                    fontWeight: 700,
                    color: "#0E1116",
                  }}
                >
                  {initials(top.firstName, top.lastName)}
                </div>
              )}
            </div>
            <div style={{ display: "flex", flexDirection: "column", flexGrow: 1 }}>
              <div style={{ display: "flex", fontSize: 16, letterSpacing: 2, color: "#2DD4BF", fontWeight: 700 }}>MEILLEUR DE TA COMPO</div>
              <div style={{ display: "flex", fontFamily: "display", fontSize: 34, fontWeight: 700, color: "#F1F5F9", marginTop: 4 }}>
                {top.firstName} {top.lastName.toUpperCase()}
              </div>
              <div style={{ display: "flex", alignItems: "center", marginTop: 4 }}>
                {top.clubLogoDataUri ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={top.clubLogoDataUri} width={26} height={26} style={{ objectFit: "contain", marginRight: 8 }} />
                ) : null}
                <div style={{ display: "flex", fontSize: 20, color: "#94A3B8" }}>
                  {top.clubShortName} · {POS_SHORT[top.position]}
                </div>
              </div>
            </div>
            <div style={{ display: "flex", fontFamily: "display", fontSize: 68, fontWeight: 700, color: "#F59E0B" }}>{fmt(top.points)}</div>
          </div>
        ) : null}

        <div style={{ display: "flex", gap: 40, marginTop: 34 }}>
          <SquadColumn title="TITULAIRES" rows={data.starters} />
          <SquadColumn title="BANC · ×0,5" rows={data.bench} />
        </div>

        <div style={{ display: "flex", flexGrow: 1 }} />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid rgba(255,255,255,0.1)", paddingTop: 20 }}>
          <div style={{ display: "flex", fontFamily: "display", fontSize: 24, fontWeight: 700, color: "#F1F5F9", letterSpacing: 1 }}>
            STARLIGUE <div style={{ display: "flex", color: "#2DD4BF", marginLeft: 8 }}>FANTASY</div>
          </div>
          <div style={{ display: "flex", fontSize: 18, color: "#94A3B8" }}>starliguefantasy.fr</div>
        </div>
      </div>
    ),
    {
      ...RECAP_IMAGE_SIZE,
      fonts: [
        { name: "display", data: fonts.display, weight: 700, style: "normal" },
        { name: "sans", data: fonts.sans, weight: 400, style: "normal" },
      ],
    }
  );
}
