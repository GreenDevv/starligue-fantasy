// Requête serveur pour l'agrégat « D'où viennent les managers » — séparée de
// `home-clubs.ts` (partie pure + `abroadLabel`) qui est importée côté client par
// `HomeClubsMapWidget`. Appelée en SSR dans `dashboard/page.tsx`, pas de route API.
import { prisma } from "@/lib/db";
import { aggregateHomeClubs, type HomeClubMemberRow, type HomeClubsAggregate } from "./home-clubs";

export async function getHomeClubsAggregate(): Promise<HomeClubsAggregate> {
  const members = await prisma.user.findMany({
    where: { homeClub: { is: { verified: true } } },
    select: {
      homeClub: {
        select: { id: true, name: true, city: true, country: true, zipcode: true, latitude: true, longitude: true },
      },
    },
  });

  const rows: HomeClubMemberRow[] = members
    .filter((m): m is { homeClub: NonNullable<typeof m.homeClub> } => m.homeClub != null)
    .map((m) => ({
      clubId: m.homeClub.id,
      clubName: m.homeClub.name,
      clubCity: m.homeClub.city,
      country: m.homeClub.country,
      zipcode: m.homeClub.zipcode,
      latitude: m.homeClub.latitude,
      longitude: m.homeClub.longitude,
    }));

  return aggregateHomeClubs(rows);
}
