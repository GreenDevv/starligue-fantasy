-- CreateEnum
CREATE TYPE "Position" AS ENUM ('GK', 'LW', 'LB', 'CB', 'RB', 'RW', 'PV');

-- CreateEnum
CREATE TYPE "SquadRole" AS ENUM ('STARTER', 'BENCH');

-- CreateEnum
CREATE TYPE "MatchStatus" AS ENUM ('SCHEDULED', 'LIVE', 'FINISHED', 'POSTPONED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('USER', 'ADMIN');

-- CreateEnum
CREATE TYPE "DataSource" AS ENUM ('CSV', 'API_SPORTS', 'LNH_SCRAPER', 'MANUAL');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT,
    "name" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'USER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Season" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Season_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Club" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "shortName" TEXT NOT NULL,
    "logoUrl" TEXT,
    "externalIds" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "Club_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Player" (
    "id" TEXT NOT NULL,
    "seasonId" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "position" "Position" NOT NULL,
    "marketValue" DECIMAL(5,1) NOT NULL,
    "photoUrl" TEXT,
    "externalIds" JSONB NOT NULL DEFAULT '{}',
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Player_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlayerValueHistory" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "value" DECIMAL(5,1) NOT NULL,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlayerValueHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Gameweek" (
    "id" TEXT NOT NULL,
    "seasonId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "deadlineAt" TIMESTAMP(3) NOT NULL,
    "isScored" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Gameweek_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Match" (
    "id" TEXT NOT NULL,
    "seasonId" TEXT NOT NULL,
    "gameweekId" TEXT NOT NULL,
    "homeClubId" TEXT NOT NULL,
    "awayClubId" TEXT NOT NULL,
    "kickoffAt" TIMESTAMP(3) NOT NULL,
    "status" "MatchStatus" NOT NULL DEFAULT 'SCHEDULED',
    "homeScore" INTEGER,
    "awayScore" INTEGER,
    "externalIds" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "Match_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlayerMatchStat" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "lnhRating" DECIMAL(3,1),
    "played" BOOLEAN NOT NULL DEFAULT false,
    "goals" INTEGER,
    "saves" INTEGER,
    "source" "DataSource" NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlayerMatchStat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FantasyTeam" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "budget" DECIMAL(6,1) NOT NULL,
    "totalPoints" DECIMAL(8,1) NOT NULL DEFAULT 0,
    "isValidated" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FantasyTeam_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FantasySquadPlayer" (
    "id" TEXT NOT NULL,
    "fantasyTeamId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "role" "SquadRole" NOT NULL DEFAULT 'BENCH',
    "purchasePrice" DECIMAL(5,1) NOT NULL,

    CONSTRAINT "FantasySquadPlayer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FantasyLineup" (
    "id" TEXT NOT NULL,
    "fantasyTeamId" TEXT NOT NULL,
    "gameweekId" TEXT NOT NULL,
    "entries" JSONB NOT NULL,
    "points" DECIMAL(7,1),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FantasyLineup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "League" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "inviteCode" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "maxMembers" INTEGER NOT NULL DEFAULT 50,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "League_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeagueMember" (
    "id" TEXT NOT NULL,
    "leagueId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeagueMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GameConfig" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,

    CONSTRAINT "GameConfig_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Season_label_key" ON "Season"("label");

-- CreateIndex
CREATE INDEX "Player_seasonId_position_idx" ON "Player"("seasonId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "Player_seasonId_clubId_firstName_lastName_key" ON "Player"("seasonId", "clubId", "firstName", "lastName");

-- CreateIndex
CREATE UNIQUE INDEX "Gameweek_seasonId_number_key" ON "Gameweek"("seasonId", "number");

-- CreateIndex
CREATE INDEX "Match_gameweekId_idx" ON "Match"("gameweekId");

-- CreateIndex
CREATE UNIQUE INDEX "PlayerMatchStat_matchId_playerId_key" ON "PlayerMatchStat"("matchId", "playerId");

-- CreateIndex
CREATE UNIQUE INDEX "FantasyTeam_userId_key" ON "FantasyTeam"("userId");

-- CreateIndex
CREATE INDEX "FantasyTeam_totalPoints_idx" ON "FantasyTeam"("totalPoints" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "FantasySquadPlayer_fantasyTeamId_playerId_key" ON "FantasySquadPlayer"("fantasyTeamId", "playerId");

-- CreateIndex
CREATE INDEX "FantasyLineup_gameweekId_points_idx" ON "FantasyLineup"("gameweekId", "points" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "FantasyLineup_fantasyTeamId_gameweekId_key" ON "FantasyLineup"("fantasyTeamId", "gameweekId");

-- CreateIndex
CREATE UNIQUE INDEX "League_inviteCode_key" ON "League"("inviteCode");

-- CreateIndex
CREATE UNIQUE INDEX "LeagueMember_leagueId_userId_key" ON "LeagueMember"("leagueId", "userId");

-- AddForeignKey
ALTER TABLE "Player" ADD CONSTRAINT "Player_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Player" ADD CONSTRAINT "Player_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerValueHistory" ADD CONSTRAINT "PlayerValueHistory_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Gameweek" ADD CONSTRAINT "Gameweek_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_gameweekId_fkey" FOREIGN KEY ("gameweekId") REFERENCES "Gameweek"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_homeClubId_fkey" FOREIGN KEY ("homeClubId") REFERENCES "Club"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_awayClubId_fkey" FOREIGN KEY ("awayClubId") REFERENCES "Club"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerMatchStat" ADD CONSTRAINT "PlayerMatchStat_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerMatchStat" ADD CONSTRAINT "PlayerMatchStat_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FantasyTeam" ADD CONSTRAINT "FantasyTeam_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FantasySquadPlayer" ADD CONSTRAINT "FantasySquadPlayer_fantasyTeamId_fkey" FOREIGN KEY ("fantasyTeamId") REFERENCES "FantasyTeam"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FantasySquadPlayer" ADD CONSTRAINT "FantasySquadPlayer_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FantasyLineup" ADD CONSTRAINT "FantasyLineup_fantasyTeamId_fkey" FOREIGN KEY ("fantasyTeamId") REFERENCES "FantasyTeam"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FantasyLineup" ADD CONSTRAINT "FantasyLineup_gameweekId_fkey" FOREIGN KEY ("gameweekId") REFERENCES "Gameweek"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "League" ADD CONSTRAINT "League_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeagueMember" ADD CONSTRAINT "LeagueMember_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeagueMember" ADD CONSTRAINT "LeagueMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
