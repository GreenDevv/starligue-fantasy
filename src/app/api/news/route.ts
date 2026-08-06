export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getNewsFeed } from "@/lib/news/get-feed";

// Endpoint public (aucune auth requise, mêmes données que la home /) utilisé
// uniquement par NewsFeedLoadMore.tsx pour charger les actus suivantes sans
// recharger la page (bouton "Afficher plus"). Saison toujours "isActive": true,
// même résolution que src/app/[locale]/(public)/page.tsx — cette page est
// toujours la saison live, jamais la simulation (voir commentaire de page.tsx).
const querySchema = z.object({
  category: z.enum(["TRANSFER", "INJURY", "TEAM_OF_WEEK", "PERFORMANCE", "GENERAL"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
});

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const parsed = querySchema.safeParse(Object.fromEntries(searchParams));

  if (!parsed.success) {
    return NextResponse.json({ error: { code: "INVALID_QUERY", message: parsed.error.message } }, { status: 400 });
  }

  const { category, page } = parsed.data;

  const season = await prisma.season.findFirst({ where: { isActive: true } });
  if (!season) {
    return NextResponse.json({ data: { items: [], page, hasMore: false } });
  }

  const feed = await getNewsFeed(season.id, { category, page });
  return NextResponse.json({ data: feed });
}
