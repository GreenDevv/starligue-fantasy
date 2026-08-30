export const dynamic = "force-dynamic";

// GET    /api/account — infos du compte connecté (pseudo, email, joueur préféré, club d'origine)
// PUT    /api/account — modifie le pseudo, le joueur préféré et/ou le club d'origine
// DELETE /api/account — supprime le compte (App Store guideline 5.1.1(v))

import { NextResponse } from "next/server";
import { z } from "zod";
import { compare } from "bcryptjs";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { deleteTeamsCascade, deleteSimulationTeamsCascade } from "@/lib/leagues/standings";
import { SIMULATION_SEASON_LABEL } from "@/lib/simulation/constants";
import { homeClubInputSchema, resolveHomeClubId, HomeClubError } from "@/lib/clubs/home-club-input";

const homeClubSelect = {
  select: { id: true, name: true, city: true, country: true, verified: true },
} as const;

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Connexion requise" } }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      name: true,
      email: true,
      favoritePlayerId: true,
      favoritePlayer: { select: { id: true, firstName: true, lastName: true, club: { select: { shortName: true } } } },
      homeClubId: true,
      homeClub: homeClubSelect,
    },
  });
  if (!user) {
    return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
  }

  return NextResponse.json({ data: user });
}

const updateSchema = z.object({
  name: z.string().min(1).max(50).optional(),
  // "" = retirer le joueur préféré, undefined = ne pas toucher au champ.
  favoritePlayerId: z.string().min(1).nullable().optional(),
  // { clubId } | { newClub } | null (retire). undefined = ne pas toucher.
  // Modifiable librement (pas de verrou, contrairement au joueur préféré) — §23.
  homeClub: homeClubInputSchema.optional(),
});

export async function PUT(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Connexion requise" } }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "INVALID_INPUT", message: parsed.error.issues[0]?.message ?? "Données invalides" } },
      { status: 400 },
    );
  }

  const { name, favoritePlayerId, homeClub } = parsed.data;

  let homeClubId: string | null | undefined;
  if (homeClub !== undefined) {
    try {
      homeClubId = await resolveHomeClubId(homeClub);
    } catch (e) {
      if (e instanceof HomeClubError) {
        return NextResponse.json({ error: { code: e.code, message: e.message } }, { status: 422 });
      }
      throw e;
    }
  }

  if (favoritePlayerId !== undefined) {
    // Définitif une fois déclaré (à l'inscription ou ici la toute première fois) —
    // évite les allers-retours ("mon joueur préféré" doit rester un vrai choix
    // engageant, pas un champ qu'on retouche à chaque bonne/mauvaise perf).
    const current = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { favoritePlayerId: true },
    });
    if (current?.favoritePlayerId && favoritePlayerId !== current.favoritePlayerId) {
      return NextResponse.json(
        { error: { code: "FAVORITE_PLAYER_LOCKED", message: "Le joueur préféré est définitif une fois déclaré" } },
        { status: 409 },
      );
    }

    if (favoritePlayerId) {
      const player = await prisma.player.findUnique({ where: { id: favoritePlayerId }, select: { id: true } });
      if (!player) {
        return NextResponse.json({ error: { code: "INVALID_PLAYER", message: "Joueur préféré introuvable" } }, { status: 422 });
      }
    }
  }

  const user = await prisma.user.update({
    where: { id: session.user.id },
    data: {
      ...(name !== undefined ? { name } : {}),
      ...(favoritePlayerId !== undefined ? { favoritePlayerId: favoritePlayerId || null } : {}),
      ...(homeClubId !== undefined ? { homeClubId } : {}),
    },
    select: {
      name: true,
      email: true,
      favoritePlayerId: true,
      favoritePlayer: { select: { id: true, firstName: true, lastName: true, club: { select: { shortName: true } } } },
      homeClubId: true,
      homeClub: homeClubSelect,
    },
  });

  return NextResponse.json({ data: user });
}

const deleteSchema = z.object({
  password: z.string().min(1),
});

// Suppression = anonymisation + purge des identifiants, pas un DELETE de la ligne
// User : énormément de tables (FantasyTeam, LeagueMember, LeagueChatMessage,
// League.owner...) référencent userId sans onDelete cascade (voir
// prisma/schema.prisma), et on veut de toute façon garder l'intégrité des
// classements/chats partagés avec d'autres membres plutôt que de les corrompre.
// En pratique le compte est bien supprimé : plus de mot de passe/email d'origine
// donc plus aucun moyen de se reconnecter — ce n'est pas une simple désactivation.
// Les ligues possédées sont détruites en cascade (même comportement que DELETE
// /api/leagues/[id], que le owner peut déjà déclencher lui-même) ; les ligues où
// l'utilisateur n'est que membre sont quittées (même comportement que DELETE
// /api/leagues/[id]/members/me).
export async function DELETE(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Connexion requise" } }, { status: 401 });
  }
  const userId = session.user.id;

  const body = await req.json().catch(() => null);
  const parsed = deleteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "INVALID_INPUT", message: parsed.error.issues[0]?.message ?? "Mot de passe requis" } },
      { status: 400 },
    );
  }

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { passwordHash: true } });
  if (!user?.passwordHash) {
    return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
  }

  const valid = await compare(parsed.data.password, user.passwordHash);
  if (!valid) {
    return NextResponse.json(
      { error: { code: "INVALID_PASSWORD", message: "Mot de passe incorrect" } },
      { status: 401 },
    );
  }

  await prisma.$transaction(async (tx) => {
    const ownedLeagues = await tx.league.findMany({
      where: { ownerId: userId },
      select: { id: true, season: { select: { label: true } } },
    });
    for (const league of ownedLeagues) {
      const isSimulation = league.season.label === SIMULATION_SEASON_LABEL;
      if (isSimulation) {
        const teams = await tx.simulationTeam.findMany({ where: { leagueId: league.id }, select: { id: true } });
        await deleteSimulationTeamsCascade(tx, teams.map((t) => t.id));
      } else {
        const teams = await tx.fantasyTeam.findMany({ where: { leagueId: league.id }, select: { id: true } });
        await deleteTeamsCascade(tx, teams.map((t) => t.id));
      }
      await tx.leagueMember.deleteMany({ where: { leagueId: league.id } });
      await tx.league.delete({ where: { id: league.id } });
    }

    const memberships = await tx.leagueMember.findMany({
      where: { userId },
      select: { leagueId: true, league: { select: { season: { select: { label: true } } } } },
    });
    for (const membership of memberships) {
      const isSimulation = membership.league.season.label === SIMULATION_SEASON_LABEL;
      if (isSimulation) {
        const team = await tx.simulationTeam.findFirst({
          where: { userId, leagueId: membership.leagueId },
          select: { id: true },
        });
        if (team) await deleteSimulationTeamsCascade(tx, [team.id]);
      } else {
        const team = await tx.fantasyTeam.findUnique({
          where: { userId_leagueId: { userId, leagueId: membership.leagueId } },
          select: { id: true },
        });
        if (team) await deleteTeamsCascade(tx, [team.id]);
      }
      await tx.leagueMember.delete({ where: { leagueId_userId: { leagueId: membership.leagueId, userId } } });
    }

    await tx.pushToken.deleteMany({ where: { userId } });
    await tx.passwordResetToken.deleteMany({ where: { userId } });
    await tx.account.deleteMany({ where: { userId } });
    await tx.blockedUser.deleteMany({ where: { OR: [{ blockerId: userId }, { blockedId: userId }] } });

    // Ligne User conservée (voir commentaire plus haut) mais entièrement
    // scrubée : email unique dérivé de l'id pour ne jamais entrer en conflit
    // avec un futur compte, passwordHash à null (login impossible même si
    // l'email était deviné).
    await tx.user.update({
      where: { id: userId },
      data: {
        name: "Utilisateur supprimé",
        email: `deleted-${userId}@starliguefantasy.fr`,
        passwordHash: null,
        favoritePlayerId: null,
        homeClubId: null,
      },
    });
  });

  return NextResponse.json({ data: { success: true } });
}
