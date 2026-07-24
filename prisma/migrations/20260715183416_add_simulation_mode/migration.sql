-- CreateTable
CREATE TABLE "SimulationTeam" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "seasonId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "budget" DECIMAL(6,1) NOT NULL,
    "totalPoints" DECIMAL(8,1) NOT NULL DEFAULT 0,
    "isValidated" BOOLEAN NOT NULL DEFAULT false,
    "currentGameweekNumber" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SimulationTeam_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SimulationSquadPlayer" (
    "id" TEXT NOT NULL,
    "simulationTeamId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "role" "SquadRole" NOT NULL DEFAULT 'BENCH',
    "purchasePrice" DECIMAL(5,1) NOT NULL,

    CONSTRAINT "SimulationSquadPlayer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SimulationLineup" (
    "id" TEXT NOT NULL,
    "simulationTeamId" TEXT NOT NULL,
    "gameweekId" TEXT NOT NULL,
    "entries" JSONB NOT NULL,
    "points" DECIMAL(7,1),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SimulationLineup_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SimulationTeam_userId_seasonId_key" ON "SimulationTeam"("userId", "seasonId");

-- CreateIndex
CREATE UNIQUE INDEX "SimulationSquadPlayer_simulationTeamId_playerId_key" ON "SimulationSquadPlayer"("simulationTeamId", "playerId");

-- CreateIndex
CREATE UNIQUE INDEX "SimulationLineup_simulationTeamId_gameweekId_key" ON "SimulationLineup"("simulationTeamId", "gameweekId");

-- AddForeignKey
ALTER TABLE "SimulationTeam" ADD CONSTRAINT "SimulationTeam_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SimulationTeam" ADD CONSTRAINT "SimulationTeam_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SimulationSquadPlayer" ADD CONSTRAINT "SimulationSquadPlayer_simulationTeamId_fkey" FOREIGN KEY ("simulationTeamId") REFERENCES "SimulationTeam"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SimulationSquadPlayer" ADD CONSTRAINT "SimulationSquadPlayer_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SimulationLineup" ADD CONSTRAINT "SimulationLineup_simulationTeamId_fkey" FOREIGN KEY ("simulationTeamId") REFERENCES "SimulationTeam"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SimulationLineup" ADD CONSTRAINT "SimulationLineup_gameweekId_fkey" FOREIGN KEY ("gameweekId") REFERENCES "Gameweek"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
