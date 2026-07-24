// GET  /api/admin/transfer-windows — liste toutes les fenêtres de transfert (live + simulation)
// POST /api/admin/transfer-windows — crée une fenêtre { seasonId, label, opensAt, closesAt }
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

async function requireAdmin() {
  const session = await auth();
  // @ts-expect-error — role étendu
  if (!session || session.user?.role !== "ADMIN") return null;
  return session;
}

export async function GET() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  const [windows, seasons] = await Promise.all([
    prisma.transferWindow.findMany({
      include: { season: { select: { id: true, label: true } } },
      orderBy: { opensAt: "asc" },
    }),
    prisma.season.findMany({ select: { id: true, label: true, isActive: true }, orderBy: { label: "desc" } }),
  ]);

  return NextResponse.json({
    data: {
      windows: windows.map((w) => ({
        id: w.id,
        seasonId: w.seasonId,
        seasonLabel: w.season.label,
        label: w.label,
        opensAt: w.opensAt,
        closesAt: w.closesAt,
      })),
      seasons,
    },
  });
}

const CreateSchema = z.object({
  seasonId: z.string().min(1),
  label: z.string().min(1).max(100),
  opensAt: z.string().datetime(),
  closesAt: z.string().datetime(),
});

export async function POST(req: Request) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "INVALID_INPUT", details: parsed.error.issues } }, { status: 400 });
  }
  const { seasonId, label, opensAt, closesAt } = parsed.data;

  if (new Date(closesAt) <= new Date(opensAt)) {
    return NextResponse.json(
      { error: { code: "INVALID_RANGE", message: "La date de fermeture doit être après la date d'ouverture" } },
      { status: 400 }
    );
  }

  const window = await prisma.transferWindow.create({
    data: { seasonId, label, opensAt: new Date(opensAt), closesAt: new Date(closesAt) },
    include: { season: { select: { id: true, label: true } } },
  });

  return NextResponse.json({
    data: {
      id: window.id,
      seasonId: window.seasonId,
      seasonLabel: window.season.label,
      label: window.label,
      opensAt: window.opensAt,
      closesAt: window.closesAt,
    },
  });
}
