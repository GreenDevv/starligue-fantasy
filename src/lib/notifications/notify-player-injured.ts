// Notifie par email tous les utilisateurs qui ont un joueur donné dans un de leurs
// effectifs Fantasy (saison live — FantasySquadPlayer, jamais SimulationSquadPlayer,
// naturellement exclu puisqu'un joueur de la saison Simulation n'est jamais acheté
// via un FantasyTeam) quand il vient d'être déclaré blessé — leur donne l'occasion
// d'utiliser leur joker médical (§13.6 ARCHITECTURE.md) sans attendre une fenêtre de
// transfert. Appelé best-effort depuis PUT /api/admin/players/[id], uniquement à la
// transition injuredAt null → non-null (jamais à la levée de blessure).
//
// Un même utilisateur peut posséder ce joueur dans plusieurs équipes (une par ligue
// rejointe, @@unique([userId, leagueId]) sur FantasyTeam) — un seul email par
// utilisateur, qui liste toutes les équipes concernées plutôt que d'en spammer
// plusieurs.
import type { Position } from "@prisma/client";
import { prisma } from "@/lib/db";
import { sendInjuryEmail } from "@/lib/email/send-injury-email";

const DEFAULT_JOKER_QUOTA = 2; // même défaut que POST /api/my-team/transfer si GameConfig absent

export interface NotifyInjuredResult {
  notified: number;
  failed: number;
}

interface InjuredPlayerForNotify {
  id: string;
  firstName: string;
  lastName: string;
  position: Position;
  marketValue: number;
  club: { shortName: string };
}

export async function notifyPlayerInjuredOwners(player: InjuredPlayerForNotify): Promise<NotifyInjuredResult> {
  const [owners, jokerQuotaConfig] = await Promise.all([
    prisma.fantasySquadPlayer.findMany({
      where: { playerId: player.id },
      select: {
        fantasyTeam: {
          select: {
            name: true,
            jokersUsed: true,
            league: { select: { name: true } },
            user: { select: { id: true, email: true } },
          },
        },
      },
    }),
    prisma.gameConfig.findUnique({ where: { key: "JOKER_QUOTA_PER_SEASON" } }),
  ]);

  if (owners.length === 0) return { notified: 0, failed: 0 };

  const jokerQuota = jokerQuotaConfig ? parseInt(jokerQuotaConfig.value, 10) : DEFAULT_JOKER_QUOTA;

  const byUser = new Map<string, { email: string; teams: { teamName: string; leagueName: string; jokersLeft: number }[] }>();
  for (const row of owners) {
    const u = row.fantasyTeam.user;
    const entry = byUser.get(u.id) ?? { email: u.email, teams: [] };
    entry.teams.push({
      teamName: row.fantasyTeam.name,
      leagueName: row.fantasyTeam.league.name,
      jokersLeft: Math.max(0, jokerQuota - row.fantasyTeam.jokersUsed),
    });
    byUser.set(u.id, entry);
  }

  const transfersUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? "https://starliguefantasy.fr"}/fr/team/transfers`;

  let notified = 0;
  let failed = 0;
  // Séquentiel (pas Promise.all) : volumes toujours faibles (une poignée
  // d'utilisateurs par joueur blessé dans une communauté de quelques dizaines de
  // comptes), évite de rafaler l'API Resend sans avoir à gérer de rate-limiting.
  for (const { email, teams } of byUser.values()) {
    try {
      await sendInjuryEmail(email, {
        playerFirstName: player.firstName,
        playerLastName: player.lastName,
        position: player.position,
        clubShortName: player.club.shortName,
        marketValue: player.marketValue,
        teams,
        transfersUrl,
      });
      notified++;
    } catch (e) {
      failed++;
      console.error("[injury-email]", email, e);
    }
  }

  return { notified, failed };
}
