// POST /api/season-mode — bascule le cookie httpOnly de mode de saison (live/simulation)
// lu par resolveSeasonMode() côté serveur sur toutes les pages (game)/*.
import { NextResponse } from "next/server";
import { z } from "zod";
import { setSeasonModeCookie } from "@/lib/team/active-team-context";

const bodySchema = z.object({ mode: z.enum(["live", "simulation"]) });

export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "INVALID_INPUT", message: parsed.error.message } },
      { status: 400 }
    );
  }

  const response = NextResponse.json({ data: { mode: parsed.data.mode } });
  setSeasonModeCookie(response, parsed.data.mode);
  return response;
}
