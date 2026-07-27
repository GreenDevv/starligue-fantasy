export const dynamic = "force-dynamic";

// POST /api/season-mode — bascule le cookie httpOnly de mode de saison (live/simulation)
// lu par resolveSeasonMode() côté serveur sur toutes les pages (game)/*.
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
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

  // Le mode Simulation (rejeu 2025/26) n'est plus ouvert au public au lancement —
  // réservé aux admins (voir SeasonToggle, masqué en (game)/layout.tsx pour les
  // autres utilisateurs). "live" reste toujours autorisé (c'est le mode par défaut).
  if (parsed.data.mode === "simulation") {
    const session = await auth();
    // @ts-expect-error — role étendu
    if (!session || session.user?.role !== "ADMIN") {
      return NextResponse.json({ error: { code: "FORBIDDEN", message: "Mode Simulation réservé aux admins" } }, { status: 403 });
    }
  }

  const response = NextResponse.json({ data: { mode: parsed.data.mode } });
  setSeasonModeCookie(response, parsed.data.mode);
  return response;
}