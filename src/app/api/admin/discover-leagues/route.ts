// GET /api/admin/discover-leagues?country=France
// Liste les ligues disponibles dans API-Sports pour trouver le bon league ID.

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

async function requireAdmin() {
  const session = await auth();
  // @ts-expect-error — role étendu
  if (!session || session.user?.role !== "ADMIN") return null;
  return session;
}

export async function GET(req: Request) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  const apiKey = process.env.API_SPORTS_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: { code: "NO_KEY", message: "API_SPORTS_KEY manquant" } }, { status: 503 });
  }

  const { searchParams } = new URL(req.url);
  const country = searchParams.get("country") ?? "France";

  try {
    const url = `https://v1.handball.api-sports.io/leagues?country=${encodeURIComponent(country)}`;
    const res = await fetch(url, {
      headers: { "x-apisports-key": apiKey, "Accept": "application/json" },
      cache: "no-store",
    });

    const raw: unknown = await res.json();

    // Retourne la réponse brute pour debug + la liste formatée si possible
    const response = raw as Record<string, unknown>;
    const items = Array.isArray(response.response) ? response.response : [];

    const leagues = items.map((r: unknown) => {
      const row = r as Record<string, Record<string, unknown>>;
      return {
        id: row.league?.id,
        name: row.league?.name,
        type: row.league?.type,
        country: row.country?.name,
      };
    });

    return NextResponse.json({
      data: { leagues, _raw: raw },
    });
  } catch (err) {
    console.error("[discover-leagues]", err);
    return NextResponse.json(
      { error: { code: "FETCH_ERROR", message: String(err) } },
      { status: 500 }
    );
  }
}
