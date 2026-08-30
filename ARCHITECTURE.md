# Handball Fantasy — Architecture système v1.0

> Jeu de fantasy handball basé sur la Liqui Moly Starligue (D1 française), saison 2026/2027.
> Document de référence pour le développement avec Claude Code. À placer à la racine du repo.

---

## 1. Vue d'ensemble

Handball Fantasy reprend le modèle Premier League Fantasy appliqué au handball français :

- À l'inscription, chaque utilisateur reçoit un **budget** (valeur configurable, ex : 100 M).
- Il compose un effectif de **14 joueurs : 2 par poste × 7 postes** (Gardien, Ailier Gauche, Arrière Gauche, Demi-Centre, Arrière Droit, Ailier Droit, Pivot).
- Chaque joueur Starligue a une **valeur marchande** ; l'achat est contraint par le budget.
- Avant chaque journée, l'utilisateur désigne **7 titulaires et 7 remplaçants** (1 titulaire par poste).
- Les points sont dérivés de la **note LNH** de chaque joueur à chaque match. Un titulaire génère plus de points (positifs OU négatifs) qu'un remplaçant.
- Les utilisateurs créent des **ligues privées** ; un **classement global** couvre toute l'appli.

### Décisions techniques (résumé)

| Sujet | Choix | Raison |
|---|---|---|
| Framework | Next.js 14 (App Router) + TypeScript | Stack déjà maîtrisée, SSR + API routes dans un seul déploiement |
| UI | Tailwind CSS + Framer Motion | Cohérent avec tes projets existants |
| ORM / DB | Prisma + PostgreSQL | Relations complexes (effectifs, journées, scores) → SQL relationnel |
| Auth | Auth.js (NextAuth v5) — credentials + Google | Simple, self-hosted, session JWT |
| Déploiement | Railway (web + Postgres + cron) | Pattern déjà en place chez toi |
| Ingestion données | Couche d'adapters (API-Sports + scraper LNH + import CSV) | Aucune API ne fournit tout, voir §3 |
| Cache / jobs | Cron Railway + routes `/api/cron/*` protégées par secret | Pas besoin de Redis en v1 |
| Validation | Zod partout (API input + parsing données externes) | Les données externes sont non fiables par nature |

---

## 2. Règles métier (source de vérité)

### 2.1 Postes

```
GK  — Gardien
LW  — Ailier gauche
LB  — Arrière gauche
CB  — Demi-centre
RB  — Arrière droit
RW  — Ailier droit
PV  — Pivot
```

Effectif obligatoire : exactement **2 joueurs par poste** (14 au total).
Alignement par journée : exactement **1 titulaire par poste** (7 titulaires + 7 remplaçants).
Maximum **3 joueurs d'un même club** dans l'effectif (`MAX_PLAYERS_PER_CLUB`, défaut 3) — contrôlé
à la validation d'effectif (`validateSquad`), aux transferts (`validateTransfer`) et aux trades
(`validateTradeExecution`), voir `src/lib/squad/validation.ts`.

### 2.2 Budget et valeurs marchandes

- Budget initial : `INITIAL_BUDGET` (env / table `game_config`), défaut proposé **100.0** (unité arbitraire, 1 décimale).
- Chaque joueur a une `marketValue` (défaut proposé : entre 3.0 et 15.0 selon le niveau).
- Contrainte à la validation de l'effectif : `SUM(marketValue des 14 joueurs) <= budget`.
- Les valeurs seront importées plus tard (CSV admin) ou seedées avec des valeurs par défaut par poste/club. Une table `PlayerValueHistory` trace les évolutions — le marché dynamique évoqué ici comme "plus tard, hors scope v1" est en fait livré, voir §13.3.

### 2.3 Scoring (basé sur la note LNH)

La note LNH est sur 10. Principe : **5 = neutre**. En dessous → points négatifs, au-dessus → points positifs. Le statut titulaire amplifie dans les deux sens.

```
pointsBruts = (noteLNH - 5) × 4        // note 8 → +12 ; note 3 → −8
multiplicateur:
  TITULAIRE   → ×1.0
  REMPLACANT  → ×0.5
  + si le joueur est capitaine ce jour-là ET titulaire : ×2.0 au lieu de ×1.0
    (×3.0 si le bonus Triple Capitaine est actif — voir §13)
pointsJoueur = round(pointsBruts × multiplicateur, 1)
```

Cas particuliers (tous configurables dans `game_config`) :
- Joueur non noté / n'a pas joué → **0 point** (pas de pénalité en v1).
- Bonus victoire d'équipe : +2 si le club du joueur gagne et que le joueur a joué (optionnel, flag `WIN_BONUS_ENABLED`, défaut off en v1).
- Toutes les constantes (`×4`, `5`, `×0.5`, `×2.0`) vivent dans `game_config`, jamais en dur : tu pourras les régler après quelques journées de test.
- Capitaine et bonus de saison : voir §13.

`pointsGameweek(user) = Σ pointsJoueur des 14 joueurs sur la journée`
`pointsSaison(user) = Σ pointsGameweek`

### 2.4 Deadlines et verrouillage

- Chaque journée (`gameweek`) a une `deadlineAt` = horaire du premier match − 1h.
- Après la deadline : l'alignement (titulaires/remplaçants) et l'effectif sont **gelés** pour cette journée (snapshot en base, voir `fantasy_lineup`).
- Les changements faits après deadline s'appliquent à la journée suivante.
- Transferts en cours de saison : **livrés** (contrairement à la mention "hors scope v1" que cette ligne portait encore) — effectif modifiable sans limite de nombre pendant une fenêtre de transfert ouverte, verrouillé le reste du temps. Détail complet en §13.1.

### 2.5 Ligues et classements

- Ligue privée : créée par un utilisateur, rejointe via un **code d'invitation** à 8 caractères.
- Créer/rejoindre une ligue crée **sa propre équipe** (effectif, budget, points, maillot indépendants) — pas d'équipe globale par utilisateur. Un utilisateur peut donc avoir plusieurs équipes, une par ligue.
- Créer/rejoindre une ligue est **obligatoire** avant de pouvoir constituer un effectif : `/leagues` sert de verrou juste après l'inscription (redirection si l'utilisateur n'a encore aucune ligue).
- Classement de ligue = tri des équipes de la ligue par `totalPoints` (tiebreak : date de création de l'équipe).
- Classement global = même logique sur **toutes les équipes**, toutes ligues confondues, paginé, calculé à la volée avec index sur `total_points`. Un utilisateur membre de plusieurs ligues y apparaît donc plusieurs fois (une ligne par équipe) — voulu, chaque équipe est une entité distincte.

---

## 3. Données externes : ce qui existe réellement (état juillet 2026)

### 3.1 Constat

| Besoin | Source disponible | Fiabilité |
|---|---|---|
| Calendrier + résultats Starligue | **API-Sports Handball** (`v1.handball.api-sports.io`) — plan gratuit 100 req/jour, endpoints `leagues`, `teams`, `games`, `standings` | Bonne, API stable et documentée |
| Idem (alternative) | Highlightly Handball API (RapidAPI, free tier 100 req/jour) ; Goalserve (payant B2B) | Backup |
| **Notes LNH des joueurs** | **Aucune API publique.** Les notes n'existent que sur lnh.fr (pages stats/feuilles de match) | À scraper OU importer manuellement |
| Effectifs + joueurs 2026/27 | Partiellement API-Sports (équipes oui, rosters joueurs limités en handball) ; lnh.fr fait référence | Import CSV admin recommandé |
| Valeurs marchandes | N'existe nulle part → **on les définit nous-mêmes** | Seed + CSV admin |

### 3.2 Conséquence architecturale : le pattern Provider

Toute donnée externe passe par une interface unique. Le reste de l'app ne connaît **jamais** la source.

```ts
// src/lib/data-providers/types.ts
export interface StarligueDataProvider {
  name: string;
  fetchTeams(season: string): Promise<ExternalTeam[]>;
  fetchFixtures(season: string): Promise<ExternalFixture[]>;   // calendrier + résultats
  fetchMatchPlayerStats(externalMatchId: string): Promise<ExternalPlayerStat[]>; // notes LNH
}
```

Trois implémentations, par ordre de priorité de dev :

1. **`CsvImportProvider`** (v1, jour 1) — l'admin uploade des CSV (équipes, joueurs, résultats, notes). C'est le fallback ultime : le jeu fonctionne même si tout le reste casse. Formats définis en §7.
2. **`ApiSportsProvider`** (v1) — résultats + calendrier automatiques. Clé API en env (`API_SPORTS_KEY`). Attention au quota gratuit : 100 req/jour largement suffisant (1 fetch fixtures/jour + 8 fetch résultats le soir de journée).
3. **`LnhScraperProvider`** (v1.5) — scraping des feuilles de match lnh.fr pour les notes. Points d'attention : structure HTML susceptible de changer → parser défensif avec Zod, alerte admin si le parsing échoue, et le CSV reste le fallback. Vérifier les CGU lnh.fr ; usage personnel/projet non commercial = risque faible, mais prévoir le mode manuel de toute façon.

Règle d'or de l'ingestion : **tout est idempotent** (upsert par `externalId` + `source`). Relancer un job deux fois ne duplique rien.

---

## 4. Architecture système

```
                    ┌─────────────────────────────────────────────┐
                    │                RAILWAY                       │
                    │                                              │
 ┌──────────┐       │  ┌────────────────────────────────────────┐ │
 │ Browser  │◄─────►│  │  Next.js 14 (App Router)               │ │
 │ (React)  │  SSR/ │  │                                        │ │
 └──────────┘  API  │  │  /app/(public)     landing, auth       │ │
                    │  │  /app/(game)       équipe, marché,     │ │
                    │  │                    ligues, classements │ │
                    │  │  /app/(admin)      imports, config     │ │
                    │  │  /app/api/*        route handlers      │ │
                    │  │  /app/api/cron/*   jobs (secret)       │ │
                    │  └───────┬───────────────────┬────────────┘ │
                    │          │ Prisma            │               │
                    │  ┌───────▼────────┐          │               │
                    │  │  PostgreSQL    │          │               │
                    │  └────────────────┘          │               │
                    │                              │               │
                    │  ┌────────────────┐          │               │
                    │  │ Railway Cron   │──────────┘               │
                    │  │ (curl cron API)│  1) sync fixtures (daily)│
                    │  └────────────────┘  2) sync results (H+3    │
                    │                         après matchs)        │
                    │                      3) compute scores       │
                    └──────────────┬──────────────────────────────┘
                                   │ HTTPS sortant
                     ┌─────────────┼──────────────┐
                     ▼             ▼              ▼
              API-Sports      lnh.fr         CSV admin
              (résultats)     (notes,        (fallback
                              scraper)        universel)
```

### 4.1 Flux d'une journée de championnat

```
J-7   Cron daily : sync calendrier → upsert matchs de la journée, calcul deadlineAt
J-0   deadline − 1h : plus de modif d'alignement (contrôle côté API, pas de job nécessaire)
      deadline : job `snapshot-lineups` fige l'alignement de chaque user (copie en fantasy_lineup)
J-0   soir : cron `sync-results` (toutes les 2h de 20h à 2h) → scores des matchs
J+1   matin : notes LNH publiées → cron `sync-ratings` (scraper) OU import CSV admin
      dès que toutes les notes d'un match sont là → job `compute-scores` :
        pour chaque lineup snapshoté → calcul points joueurs → points gameweek
        → mise à jour total_points user → classements à jour instantanément
```

Le calcul des scores est **rejouable** : `compute-scores(gameweekId)` efface et recalcule. Indispensable quand la LNH corrige une note a posteriori.

### 4.2 Ajustement des dates officielles + diffuseur TV

Ajouté le 2026-08-27, demande explicite de l'utilisateur : lnh.fr publie
d'abord une date **générique** par journée (ex: J1 → "4 septembre" pour
tous les matchs), avant d'ajuster **chaque match individuellement** (±2
jours) une fois les horaires TV confirmés — exemple constaté : Caen–Dunkerque
J1, initialement 4 septembre, confirmé dimanche 6 septembre 17h00. Le
calendrier de la saison en direct n'étant importé **qu'une fois** par CSV
(`prisma/fixtures_starligue_2026.csv`, §4 ci-dessus), rien ne corrigeait
`Match.kickoffAt` une fois cette date générique figée en base.

- `Match.kickoffAt`/`broadcasterName`/`broadcasterUrl` sont désormais
  resynchronisés depuis lnh.fr par `syncCalendarsIdsForSeason`
  (`src/lib/ingestion/boxscore.ts`) — la même fonction qui résolvait déjà
  `lnh_calendars_id` et mettait à jour `status`/`homeScore`/`awayScore`.
  Automatique via le cron `sync-ratings` (quotidien) ou le déclencheur
  manuel équivalent sur `/admin` (section "Déclencheurs manuels").
- **Diffuseur TV** : scrapé depuis le bloc `col-tv` du calendrier lnh.fr
  (`parseCalendarFromHtml`, `src/lib/data-providers/lnh-scraper.provider.ts`)
  — deux diffuseurs observés à ce jour, beIN Sport et Handball TV
  (`BROADCASTER_NAMES`, mapping par préfixe de fichier logo). Le lien
  fourni par lnh.fr est **générique par diffuseur** (page
  abonnement/calendrier), pas un lien direct vers un match précis — c'est
  la seule donnée que lnh.fr expose. Affiché en badge cliquable (icône TV)
  sur `MatchesStrip` (home/team/simulation) et sur `/matches` (liste par
  journée) pour un match pas encore joué.
- **`Gameweek.deadlineAt` recalculée en conséquence** (`recomputeGameweekDeadlines`,
  même fichier) : 1h avant le match le plus tôt de la journée, même règle
  qu'à l'import CSV initial (`src/lib/ingestion/sync.ts`). Deux garde-fous
  volontaires pour ne jamais impacter un utilisateur sans préavis :
  journée déjà notée (`isScored`) jamais touchée, et nouvelle deadline
  appliquée **seulement si elle reste dans le futur** — si le recalcul
  donnait une deadline déjà passée, l'ancienne valeur reste en place
  plutôt que de faire apparaître d'un coup une deadline désormais
  derrière le joueur.
- Mode Simulation (`src/lib/simulation/setup.ts`) : bénéficie de la même
  donnée `broadcasterName`/`broadcasterUrl` dès l'import initial (déjà
  présente dans `ScrapedFixture`, pas de nouveau scrape), par cohérence —
  la saison 2025/26 étant terminée, son `kickoffAt` n'a en revanche plus
  de raison de bouger.

---

## 5. Modèle de données (Prisma)

```prisma
// prisma/schema.prisma

generator client { provider = "prisma-client-js" }
datasource db { provider = "postgresql"; url = env("DATABASE_URL") }

enum Position { GK LW LB CB RB RW PV }
enum SquadRole { STARTER BENCH }
enum MatchStatus { SCHEDULED LIVE FINISHED POSTPONED CANCELLED }
enum UserRole { USER ADMIN }
enum DataSource { CSV API_SPORTS LNH_SCRAPER MANUAL }

model User {
  id            String   @id @default(cuid())
  email         String   @unique
  passwordHash  String?
  name          String
  role          UserRole @default(USER)
  createdAt     DateTime @default(now())
  fantasyTeams  FantasyTeam[]           // une équipe par ligue rejointe/créée (§2.5)
  leagueMembers LeagueMember[]
  ownedLeagues  League[] @relation("LeagueOwner")
}

model Season {
  id        String   @id @default(cuid())
  label     String   @unique          // "2026-2027"
  isActive  Boolean  @default(false)
  gameweeks Gameweek[]
  players   Player[]
  matches   Match[]
}

model Club {
  id          String  @id @default(cuid())
  name        String                      // "Montpellier Handball"
  shortName   String                      // "MHB"
  logoUrl     String?
  externalIds Json    @default("{}")      // { "api_sports": "123", "lnh": "mhb" }
  players     Player[]
  homeMatches Match[] @relation("HomeClub")
  awayMatches Match[] @relation("AwayClub")
}

model Player {
  id           String   @id @default(cuid())
  seasonId     String
  season       Season   @relation(fields: [seasonId], references: [id])
  clubId       String
  club         Club     @relation(fields: [clubId], references: [id])
  firstName    String
  lastName     String
  position     Position
  marketValue  Decimal  @db.Decimal(5, 1)   // ex: 12.5
  photoUrl     String?
  externalIds  Json     @default("{}")
  isActive     Boolean  @default(true)      // blessure longue durée / départ
  stats        PlayerMatchStat[]
  squadEntries FantasySquadPlayer[]
  valueHistory PlayerValueHistory[]

  @@unique([seasonId, clubId, firstName, lastName])
  @@index([seasonId, position])
}

model PlayerValueHistory {
  id        String   @id @default(cuid())
  playerId  String
  player    Player   @relation(fields: [playerId], references: [id])
  value     Decimal  @db.Decimal(5, 1)
  changedAt DateTime @default(now())
}

model Gameweek {
  id         String   @id @default(cuid())
  seasonId   String
  season     Season   @relation(fields: [seasonId], references: [id])
  number     Int                          // J1..J30
  deadlineAt DateTime
  isScored   Boolean  @default(false)     // tous les points calculés
  matches    Match[]
  lineups    FantasyLineup[]

  @@unique([seasonId, number])
}

model Match {
  id          String      @id @default(cuid())
  seasonId    String
  season      Season      @relation(fields: [seasonId], references: [id])
  gameweekId  String
  gameweek    Gameweek    @relation(fields: [gameweekId], references: [id])
  homeClubId  String
  homeClub    Club        @relation("HomeClub", fields: [homeClubId], references: [id])
  awayClubId  String
  awayClub    Club        @relation("AwayClub", fields: [awayClubId], references: [id])
  kickoffAt   DateTime
  status      MatchStatus @default(SCHEDULED)
  homeScore   Int?
  awayScore   Int?
  externalIds Json        @default("{}")
  playerStats PlayerMatchStat[]

  @@index([gameweekId])
}

model PlayerMatchStat {
  id         String     @id @default(cuid())
  matchId    String
  match      Match      @relation(fields: [matchId], references: [id])
  playerId   String
  player     Player     @relation(fields: [playerId], references: [id])
  lnhRating  Decimal?   @db.Decimal(3, 1)  // note LNH /10, null = pas noté
  played     Boolean    @default(false)
  goals      Int?                          // enrichissement futur
  saves      Int?                          // gardiens
  source     DataSource
  updatedAt  DateTime   @updatedAt

  @@unique([matchId, playerId])
}

model FantasyTeam {
  id           String   @id @default(cuid())
  userId       String
  user         User     @relation(fields: [userId], references: [id])
  leagueId     String                       // une équipe PAR ligue, pas une équipe globale (§2.5)
  league       League   @relation(fields: [leagueId], references: [id])
  name         String                       // "Les Experts de Tish"
  budget       Decimal  @db.Decimal(6, 1)   // budget restant
  totalPoints  Decimal  @default(0) @db.Decimal(8, 1)
  isValidated  Boolean  @default(false)     // 14 joueurs OK + budget OK
  jerseyConfig Json                         // JerseyConfig — voir §5.x, pas de @default (toujours fourni à la création)
  createdAt    DateTime @default(now())
  squad        FantasySquadPlayer[]
  lineups      FantasyLineup[]

  @@unique([userId, leagueId])
  @@index([leagueId, totalPoints(sort: Desc)]) // classement de ligue
  @@index([totalPoints(sort: Desc)])           // classement global (toutes ligues confondues)
}

model FantasySquadPlayer {
  id            String      @id @default(cuid())
  fantasyTeamId String
  fantasyTeam   FantasyTeam @relation(fields: [fantasyTeamId], references: [id])
  playerId      String
  player        Player      @relation(fields: [playerId], references: [id])
  role          SquadRole   @default(BENCH)   // rôle COURANT (modifiable avant deadline)
  purchasePrice Decimal     @db.Decimal(5, 1)

  @@unique([fantasyTeamId, playerId])
}

// Snapshot immuable de l'alignement à la deadline d'une journée
model FantasyLineup {
  id            String      @id @default(cuid())
  fantasyTeamId String
  fantasyTeam   FantasyTeam @relation(fields: [fantasyTeamId], references: [id])
  gameweekId    String
  gameweek      Gameweek    @relation(fields: [gameweekId], references: [id])
  entries       Json        // [{ playerId, position, role, purchasePrice }]
  points        Decimal?    @db.Decimal(7, 1)  // null tant que non calculé
  createdAt     DateTime    @default(now())

  @@unique([fantasyTeamId, gameweekId])
  @@index([gameweekId, points(sort: Desc)])    // classement de la journée
}

model League {
  id         String   @id @default(cuid())
  name       String
  inviteCode String   @unique              // 8 chars alphanum
  ownerId    String
  owner      User     @relation("LeagueOwner", fields: [ownerId], references: [id])
  maxMembers Int      @default(50)
  createdAt  DateTime @default(now())
  members    LeagueMember[]
  teams      FantasyTeam[]
}

model LeagueMember {
  id       String   @id @default(cuid())
  leagueId String
  league   League   @relation(fields: [leagueId], references: [id])
  userId   String
  user     User     @relation(fields: [userId], references: [id])
  joinedAt DateTime @default(now())

  @@unique([leagueId, userId])
}

model GameConfig {
  key   String @id       // "INITIAL_BUDGET", "STARTER_MULTIPLIER", ...
  value String           // stocké en string, parsé par Zod
}
```

Notes de design :
- `FantasyLineup.entries` en JSON : le snapshot doit être **immuable** même si le joueur change de valeur/club ensuite. Une jointure vivante mentirait sur le passé.
- `externalIds` en JSON sur Club/Player/Match : permet de mapper plusieurs sources sans multiplier les colonnes.
- `FantasyTeam` unique sur `(userId, leagueId)`, pas sur `userId` seul : chaque ligue créée/rejointe a sa propre équipe (effectif, budget, points, maillot indépendants). Créer/rejoindre une ligue crée l'équipe correspondante dans la même transaction (`POST /api/leagues`, `POST /api/leagues/join`) — l'inscription (`POST /api/auth/register`) ne crée plus que le `User`.
- Le rôle STARTER/BENCH « courant » vit dans `FantasySquadPlayer.role` ; le job de snapshot le copie dans le lineup à la deadline.

### 5.x Le système de maillot (affichage seul — éditeur supprimé)

`FantasyTeam.jerseyConfig` (Json, jamais de `@default` DB — toujours fourni à la
création, même convention que `FantasyLineup.entries`) stocke un `JerseyConfig`
(`src/lib/team/jersey.ts`, validé par Zod) :

```ts
interface KitZone {
  patternId: string;     // référence vers KIT_PATTERNS (src/lib/team/kitPatterns.ts)
  colors: string[];      // 1 à 4 couleurs hex, selon pattern.slots
}

interface JerseyConfig {
  jersey: KitZone;
  shorts: KitZone;
  socks: KitZone;
  collar: "crew" | "v-neck" | "polo";   // maillot uniquement
  trimColor: string;                    // col + manches contrastées (maillot)
  contrastSleeves: boolean;
  number: number;          // 0-99, dos du maillot
  nameFlock: string;       // ≤ 12 caractères, flocage dos
}
```

⚠️ **Il n'existe plus d'éditeur.** `DEFAULT_JERSEY_CONFIG` (teal/noir/ambre,
palette §8.1) est appliqué à la création d'une équipe et n'est ensuite plus
modifiable par l'utilisateur — le champ reste en base et continue d'être
rendu partout où l'identité d'une équipe apparaît, juste figé. Historique :
plusieurs itérations d'un éditeur visuel se sont succédé (3D sculpté en
`THREE.LatheGeometry`, puis silhouette 2D plein corps illustrée en SVG) sans
jamais convaincre côté produit ; l'éditeur (`JerseyEditor`/`KitFigure`/
`KitViewer3D`, la dépendance `three`/`@react-three/*`, et la personnalisation
short/chaussettes de `kitSilhouettes.ts`) a été retiré plutôt que ré-itéré une
fois de plus. `/team/identity` sert désormais uniquement au **renommage
d'équipe** (seule UI existante pour ça, cf. §6.3) — même URL conservée, mais
contenu remplacé par un simple champ nom.

**Registre de motifs (`src/lib/team/kitPatterns.ts`)** : ~25 `PatternDefinition`
partagées par les 3 zones, chacune une liste de régions polygonales en
coordonnées `0-100` (mêmes conventions que le SVG) référençant un index de
`colors`. Quelques générateurs paramétrés (`stripes`, `hoops`, `sash`,
`halves`/`diagonalSplit`, `chevron`, `yoke`, `cross`…) peuplent la galerie sans
dessiner chaque motif à la main. Reste la source de vérité du rendu (même si
seul le maillot, pas short/chaussettes, est affiché — voir plus bas).

**Silhouette (`src/lib/team/kitSilhouettes.ts`)** : le contour 2D du maillot
seul, en polygone dense `0-100`, utilisé comme clip SVG par `Jersey.tsx`.

`safeJerseyConfig` migre défensivement l'ancien format plat (avant
l'introduction des zones et du registre élargi) — un `jerseyConfig` legacy en
base continue de se charger sans erreur.

Le rendu (`Jersey.tsx`) est un SVG à viewBox fixe, même convention que
`HandballPitch.tsx` (couleurs en hex bruts, `<defs>`/`<clipPath>` pour les
motifs) — il n'affiche que le maillot (pas le short/chaussettes, jamais montré
nulle part maintenant que l'éditeur plein-corps a disparu), utilisé par
`JerseyBadge.tsx` partout où l'identité d'une équipe apparaît (en-tête
`/team`, listes de ligues, classements).

---

## 6. API — Endpoints (Next.js Route Handlers)

Convention : réponses `{ data } | { error: { code, message } }`, validation Zod sur tous les inputs, auth via session Auth.js. Préfixe `/api`.

### 6.1 Auth
```
POST   /api/auth/register            { email, password, name, favoritePlayerId? } → crée User (aucune
                                        équipe : voir §6.4, chaque équipe est liée à une ligue créée/
                                        rejointe ensuite) — favoritePlayerId facultatif, jamais bloquant,
                                        vérifié référencer un Player existant si fourni
POST   /api/auth/forgot-password     { email, locale } → réponse toujours { data: { sent: true } }
                                        (anti-enumeration, ne révèle jamais si l'email existe) ; si un
                                        User correspond, émet un PasswordResetToken (TTL 1h, un seul
                                        actif par utilisateur) et envoie l'email via Resend
                                        (src/lib/email) — lien /reset-password?token=...
POST   /api/auth/reset-password      { token, password } → vérifie PasswordResetToken (tokenHash =
                                        sha256(token)), 400 INVALID_TOKEN/TOKEN_EXPIRED sinon met à
                                        jour passwordHash + purge tous les tokens de l'utilisateur
                                        (transaction Prisma)
[Auth.js gère /api/auth/* : signin, signout, session, callback Google]
```

### 6.2 Référentiel (public, cache fort)
```
GET    /api/clubs                                    → liste clubs saison active
GET    /api/players?position=&clubId=&search=&sort=  → marché des joueurs (paginé)
GET    /api/players/:id                              → fiche joueur + historique notes/points
GET    /api/gameweeks                                → journées + deadlines + isScored
GET    /api/gameweeks/current                        → journée en cours (prochaine deadline)
GET    /api/matches?gameweek=                        → matchs + scores
```

### 6.3 Mon équipe (auth requise)

Toutes les routes ci-dessous acceptent un `leagueId` optionnel (query `?league=`
en GET, champ `leagueId` dans le body en POST/PUT) pour désambiguïser quelle
équipe (un utilisateur peut en avoir plusieurs, une par ligue) — à défaut,
résolu via le cookie `activeLeagueId` (`src/lib/team/active-league.ts`),
lui-même revérifié contre `LeagueMember` à chaque requête. `404 NO_ACTIVE_LEAGUE`
si l'utilisateur n'a encore aucune ligue.

```
GET    /api/my-team                       → effectif, budget restant, alignement courant, points,
                                             leagueId/leagueName, jerseyConfig
POST   /api/my-team/squad                 { playerIds: string[14] }
         → validation : 2/poste, budget, joueurs actifs ; transaction atomique
         → v1 : re-soumission complète autorisée tant que isValidated=false ou avant J1
PUT    /api/my-team/lineup                { starters: string[7] }
         → validation : 1/poste, joueurs ∈ effectif, deadline non passée
PUT    /api/my-team/identity              { name } → renommage d'équipe (voir §5.x ;
         gérait aussi jerseyConfig avant la suppression de l'éditeur de maillot,
         nom du endpoint conservé tel quel) — lien "Renommer l'équipe" depuis /team
GET    /api/my-team/history               → points par journée (lineups passés)
GET    /api/my-team/lineup/:gameweekId    → détail d'une journée (points par joueur)
```

### 6.4 Ligues (auth requise)
```
POST   /api/leagues                       { name } → crée la ligue + génère inviteCode
                                             + crée la FantasyTeam correspondante (nom/maillot par
                                             défaut) et pose le cookie activeLeagueId
POST   /api/leagues/join                  { inviteCode } → idem : crée aussi la FantasyTeam
GET    /api/leagues                       → mes ligues + mon rang dans chacune + jerseyConfig
GET    /api/leagues/:id                   → détail + classement complet (équipe par équipe, + jerseyConfig)
POST   /api/team/active-league            { leagueId } → bascule la ligue courante (sélecteur, si > 1 ligue)
DELETE /api/leagues/:id/members/me        → quitter (supprime aussi l'équipe de l'utilisateur dans cette ligue)
DELETE /api/leagues/:id                   → supprimer (owner only ; supprime aussi toutes les équipes de la ligue)
```

### 6.5 Classements
```
GET    /api/leaderboard?page=&perPage=    → classement global, toutes équipes/ligues confondues
                                             (totalPoints desc) — un utilisateur multi-ligues y
                                             apparaît plusieurs fois (une ligne par équipe) ; chaque
                                             ligne porte leagueId/leagueName/jerseyConfig
GET    /api/leaderboard/gameweek/:number  → classement d'une journée, même logique
```

### 6.6 Admin (role ADMIN)
```
POST   /api/admin/import/clubs            CSV multipart → upsert clubs
POST   /api/admin/import/players          CSV → upsert joueurs (avec marketValue)
POST   /api/admin/import/fixtures         CSV → upsert calendrier
POST   /api/admin/import/results          CSV → scores de matchs
POST   /api/admin/import/ratings          CSV → notes LNH (déclenche compute si journée complète)
PUT    /api/admin/config                  { key, value } → GameConfig
POST   /api/admin/recompute/:gameweekId   → rejoue le scoring d'une journée
GET    /api/admin/ingestion-log           → derniers runs, erreurs de parsing
```

### 6.7 Cron (header `Authorization: Bearer ${CRON_SECRET}`)
```
POST   /api/cron/sync-fixtures            → provider.fetchFixtures (1×/jour) — PAS PLANIFIÉ,
                                             déclenchement manuel admin seulement (API_SPORTS_KEY
                                             jamais configurée en prod, échoue en 503 sinon)
POST   /api/cron/sync-results             → résultats des matchs du jour (soirs de journée) — PAS
                                             PLANIFIÉ, même dépendance API_SPORTS_KEY que ci-dessus
POST   /api/cron/sync-ratings             → scraper notes LNH (matin J+1) — PLANIFIÉ,
                                             cron-daily.yml, 06:00 UTC. Met aussi à jour
                                             Match.status/homeScore/awayScore depuis lnh.fr
                                             (syncCalendarsIdsForSeason, src/lib/ingestion/
                                             boxscore.ts, ajouté le 2026-07-31 — jusque-là rien ne
                                             le faisait pour la saison en direct ; le scoring
                                             fantasy n'en dépend pas — PlayerMatchStat seul suffit
                                             — mais les pages match/club et le règlement des
                                             pronostics §14 en ont besoin)
POST   /api/cron/snapshot-lineups         → gèle les alignements (à chaque deadline) — pas planifié
POST   /api/cron/compute-scores           → calcule points des journées complètes — pas planifié
POST   /api/cron/compute-prediction-odds  → crée les marchés de pronostic des matchs sans cotes
                                             (§14) — pas planifié
POST   /api/cron/sync-news                → scrape lnh.fr + sites de clubs, alimente la page
                                             d'accueil (§16) — PLANIFIÉ, cron-daily.yml, 06:00 UTC
POST   /api/cron/sync-standings           → classement officiel Daikin StarLigue (widget
                                             dashboard) — pas planifié
POST   /api/cron/sync-players-lnh         → effectifs depuis lnh.fr (upsert) — pas planifié
POST   /api/cron/sync-warmup              → matchs de préparation "Warm Up" (§19) — PLANIFIÉ,
                                             cron-daily.yml, 06:00 UTC
POST   /api/cron/post-stat-leaders        → publie les 3 carrousels Instagram "Leaders Starligue"
                                             (attaque/gardiens/défense) des journées notées pas encore
                                             postées (matin J+1, après compute-scores) — §17.
                                             PLANIFIÉ, post-stat-leaders.yml, 07:00 UTC
POST   /api/cron/notify-deadlines         → rappels push (app mobile) avant deadline
                                             alignement/pronostic (§20.2) — PLANIFIÉ,
                                             cron-notifications.yml, toutes les 15 min
```

**Déclenchement (routes planifiées) : GitHub Actions, pas Railway**
(`.github/workflows/cron-daily.yml`, `post-stat-leaders.yml`). Railway avait deux
services vides `cron-daily`/`cron-hourly` (image Docker `curlimages/curl`, supprimés le
2026-07-30) qui n'ont jamais fonctionné : ni schedule (`cronSchedule: null` côté API
Railway) ni commande de démarrage configurés — le conteneur tournait juste `curl` sans
argument en boucle de crash (`ON_FAILURE`), jamais un vrai job planifié. Même famille de
souci que celui déjà diagnostiqué pour `post-stat-leaders` (ENTRYPOINT de cette image
déjà = `curl`, donc toute commande custom donne `curl curl ...`, échec sans log
exploitable) — d'où le choix de GitHub Actions comme remplacement, cohérent avec la
solution déjà en place pour ce cron-là.

**`sync-news`, `sync-ratings` et `sync-warmup` ont un cron actif** (`cron-daily.yml`,
06:00 UTC, 3 jobs indépendants — l'échec de l'un ne bloque pas les autres). Les 6
autres routes de synchro
listées ci-dessus (fixtures/résultats API-Sports/snapshot-lineups/scores/classement/
effectifs/pronostics) existent et fonctionnent, mais n'ont **aucun déclenchement
automatique** pour l'instant — utilisables uniquement en manuel (dashboard admin, ou
`curl` avec `CRON_SECRET`). `sync-fixtures`/`sync-results` ont de toute façon besoin de
`API_SPORTS_KEY` (jamais configurée en prod) avant de pouvoir tourner, planifiées ou
non — mais ce n'est pas bloquant pour le scoring fantasy (indépendant de `Match`, voir
`sync-ratings` ci-dessus) ni pour le calendrier de la saison en direct (importé une
fois par CSV, `prisma/fixtures_starligue_2026.csv`, pas par ces routes). Secret
`CRON_SECRET` dupliqué en secret de repo GitHub (Settings → Secrets and variables →
Actions), même valeur que côté Railway (`railway variables --service web`). Chaque
workflow expose aussi `workflow_dispatch` pour un déclenchement manuel sans attendre
l'horaire planifié.

**Piège d'ordre corrigé le 2026-07-31** dans `sync-ratings/route.ts` : le mode par
défaut (sans `?gameweek`/`?matchId`) détecte "les matchs terminés hier" en filtrant sur
`Match.status = FINISHED` — qui est justement le champ que `syncCalendarsIdsForSeason`
vient de commencer à mettre à jour. Appeler cette fonction *après* la détection
(comme c'était fait à l'origine, pour la seule résolution de `calendars_id`) aurait
retardé la détection d'un jour à chaque fois (statut pas encore à jour au moment du
filtre). Corrigé en déplaçant l'appel avant la détection des journées à synchroniser.

### 6.8 Pronostics (auth requise) — voir §14
```
GET    /api/predictions?gw=&leagueId=     → matchs de la journée : cotes + mon pronostic + verrouillage
POST   /api/predictions                   { matchId, outcome, leagueId? } → pose/modifie mon pronostic
```

---

## 7. Formats d'import CSV (contrat admin)

Encodage UTF-8, séparateur `,`, header obligatoire. Parsés avec Zod, rapport d'erreurs ligne par ligne.

```csv
# clubs.csv
name,shortName,logoUrl
Montpellier Handball,MHB,https://...

# players.csv          position ∈ GK|LW|LB|CB|RB|RW|PV
clubShortName,firstName,lastName,position,marketValue
MHB,Rémi,Desbonnet,GK,11.5

# fixtures.csv
gameweek,date,homeShortName,awayShortName
1,2026-09-10 20:00,PSG,MHB

# results.csv
gameweek,homeShortName,awayShortName,homeScore,awayScore
1,PSG,MHB,32,29

# ratings.csv          note vide = joueur non noté ; played ∈ 0|1
gameweek,homeShortName,awayShortName,clubShortName,firstName,lastName,lnhRating,played
1,PSG,MHB,MHB,Rémi,Desbonnet,7.5,1
```

---

## 8. Design & UI

### 8.1 Identité visuelle

Dark, énergique, lisible en mobile-first (les users consulteront leurs points au téléphone le dimanche soir).

```
Fond principal      #0E1116   (quasi-noir bleuté)
Surface / cartes    #171C24
Bordures            #262D38
Accent primaire     #2DD4BF   (teal — fraîcheur, distinct des codes foot)
Accent secondaire   #F59E0B   (ambre — points, valeurs, alertes deadline)
Points positifs     #34D399
Points négatifs     #F87171
Texte               #F1F5F9 / #94A3B8 (secondaire)
Titres              Barlow Condensed (700, uppercase, tracking léger)
Corps / data        Inter (tabular-nums pour les points et valeurs)
```

Composants signature :
- **Le terrain** : demi-terrain de handball stylisé en SVG (arc des 6m/9m), les 7 titulaires positionnés dessus, les 7 remplaçants en banc horizontal en dessous. Drag & drop (ou tap-swap mobile) entre titulaire/remplaçant du même poste. C'est LA vue centrale de l'app. **Bandeau nom (`PitchNamePlate`, `HandballPitch.tsx`)** : chaque joueur sur le terrain a son nom en Barlow Condensed majuscules sur une pastille sombre bord teal, calée juste sous les pieds de la silhouette (ou sous la pastille initiales). Rendu 100 % SVG → suit le viewBox, même échelle du widget dashboard (`BestXIWidget`, `StarligueBestXICard`) au plein écran `/team`. Traitement standardisé sur tous les PitchView (demande explicite, aligné sur le visuel Instagram « équipe type »). Points de la journée et brassard capitaine restent sur leurs pastilles séparées (coins de la silhouette).
- **PlayerCard** : photo/initiales, poste (badge coloré par poste), club, valeur, forme (sparkline des 5 dernières notes), points de la journée avec +/− coloré.
- **DeadlineBanner** : compte à rebours persistant vers la prochaine deadline, passe en ambre < 24h, rouge < 2h.
- **Animations Framer Motion** : reveal des points journée par journée (compteur), swap de joueurs, montée/descente dans les classements.

#### 8.1 bis — Traitement "borne d'arcade" (pilote)

Habillage visuel superposé à la palette ci-dessus (mêmes couleurs teal/ambre/points,
aucun hex changé) pour rapprocher l'UI du logo (graffiti orange/rouge/ambre sur noir,
cf. landing). Décidé avec l'utilisateur : palette inchangée pour rester cohérent avec
le logo existant plutôt qu'un thème néon concurrent (cyan/magenta).

```
Police readouts   VT323 (--font-arcade) — réservée aux valeurs numériques courtes
                  (points, deadline, prix). Jamais pour du corps de texte ou des
                  tableaux denses (lisibilité).
Panneaux          .pixel-corners / .pixel-corners-sm (globals.css) — clip-path à
                  coins coupés façon écran de borne, remplace rounded-lg sur les
                  cartes/panels concernés.
Glow              shadow-glow-accent / shadow-glow-amber / shadow-glow-red
                  (tailwind.config.ts) — halo ponctuel sur états actifs/CTA,
                  jamais en continu sur du texte long (fatigue visuelle).
Scanlines         .scanlines (globals.css, overlay ::after) — réservé au cadre du
                  terrain (HandballPitch), pas généralisé.
Boutons           Button.tsx variants primary/secondary/danger : bezel bas en
                  relief, s'enfonce au clic (active:translate-y + shadow qui
                  remonte). Variant ghost reste plat (liens inline).
```

**Portée actuelle (pilote)** : chrome partagé (Button, NavBar, DeadlineBanner) +
`/team`, `/market` (+ BudgetGauge), `/leaderboard`. Pas encore étendu à
`/leagues`, `/matches`, `/players/[id]`, `/admin`, aux wizards de build ni au mode
simulation — à faire sur validation de la direction avant rollout complet.
`/team/identity` (éditeur de kit, §5.x) reste également hors pilote : il
réutilise `pixel-corners`/`pixel-corners-sm` (déjà présents avant le pilote)
mais n'a pas reçu scanlines/glow — pas d'extension silencieuse du pilote à
cette page.

### 8.2 Pages

Le site a deux modes, séparés visuellement (nav dédiée) et en termes de permissions
(`PROTECTED_PREFIXES`/`ADMIN_PREFIXES` dans `src/lib/auth.ts`) :

- **Mode Starligue** (`(public)/`, aucune connexion requise) : données du
  championnat + auth. Layout `src/app/[locale]/(public)/layout.tsx` (nav
  `PublicNavBar`/`PublicMobileMenu`, bouton coloré "Fantasy" vers le mode
  Fantasy). `/clubs`, `/matches`, `/players` sont regroupées sous
  `(public)/(browse)/` (layout dédié qui fournit leur `<main>`).
- **Mode Fantasy** (`(game)/`, connexion requise) : le jeu lui-même. Layout
  `src/app/[locale]/(game)/layout.tsx` (nav `NavBar`/`MobileMenu`, bouton coloré
  "Starligue" vers `/`).

`/admin` (rôle ADMIN) reste un troisième espace séparé, hors de cette bascule.

```
/                       (Starligue) Page d'accueil du site — actus/résultats/classement
                        Daikin StarLigue (§16), + porte d'entrée jeu (message de
                        bienvenue, CTA "Créer mon équipe"/"Accéder à Fantasy
                        Starligue"). Anciennement /starligue (redirige ici).
/login /register        (Starligue) Auth
/matches                (Starligue) Calendrier + résultats par journée
/clubs/[id]             (Starligue) Fiche club
/players/[id]           (Starligue) Fiche joueur : notes match par match, points générés
/starligue/[id]         (Starligue) Détail d'une actu (texte intégral, §16) —
                        /starligue seul redirige vers / (voir plus haut)
/leagues                (Fantasy) Mes ligues (+ créer / rejoindre par code) — sert aussi
                        de verrou obligatoire quand l'utilisateur n'a encore aucune ligue
/leagues/[id]           (Fantasy) Classement de ligue, évolution des rangs
/team                   (Fantasy) ★ Vue terrain : alignement, points live de la journée
                        (sélecteur de ligue si l'utilisateur en a plusieurs)
/team/identity          (Fantasy) Renommage d'équipe (voir §5.x) — accessible depuis
                        /team, plus imposé à l'onboarding
/team/build             (Fantasy) Constitution initiale de l'effectif (wizard 7 postes,
                        budget restant affiché en permanence, validation finale)
/market                 (Fantasy) Marché : table filtrable (poste, club, prix, forme),
                        utilisée pendant le build (et les transferts en v2)
/predictions            (Fantasy) Pronostics de journée (multiplicateur, §14)
/leaderboard            (Fantasy) Classement global paginé + classement de la journée
/admin                  Dashboard imports CSV, config scoring, logs ingestion, recompute
```

### 8.3 Parcours d'inscription (critique)

```
Register (crée le User, aucune équipe)
→ /leagues : verrou obligatoire — créer une ligue ou en rejoindre une (code) ;
  créer/rejoindre crée la FantasyTeam correspondante
→ onboarding en 3 écrans (par ligue) :
  1. Nom d'équipe + maillot (/team/identity)
  2. Build de l'effectif (wizard poste par poste, 2 joueurs/poste,
     jauge de budget qui se vide, suggestions "dans ton budget")
  3. Choix des 7 titulaires sur le terrain → Validation
→ redirection /team
```

Une 2e ligue créée/rejointe repasse par les mêmes 3 écrans (équipe indépendante),
mais sans forcer la redirection immédiate depuis `/leagues` — seule la toute
première ligue de l'utilisateur déclenche l'onboarding automatique.

Le build doit être **impossible à rater** : bouton Valider grisé tant que 14 joueurs + budget OK ne sont pas réunis, avec message explicite (« Il te manque 1 pivot », « Budget dépassé de 3.5 »).

---

## 9. Structure du repo

```
starligue-fantasy/
├── ARCHITECTURE.md              ← ce fichier
├── CLAUDE.md                    ← instructions Claude Code (voir §11)
├── prisma/
│   ├── schema.prisma
│   └── seed.ts                  ← 16 clubs 2026/27 + joueurs placeholder + J1..J30
├── src/
│   ├── app/
│   │   ├── (public)/            landing, login, register
│   │   ├── (game)/              team, market, leagues, leaderboard, matches, players
│   │   ├── (admin)/admin/
│   │   └── api/                 cf. §6
│   ├── components/
│   │   ├── ui/                  Button, Card, Badge, Table, Modal, Countdown...
│   │   ├── pitch/               HandballPitch.tsx, PlayerSlot.tsx, BenchRow.tsx
│   │   ├── market/              PlayerTable.tsx, PlayerFilters.tsx, BudgetGauge.tsx
│   │   └── leagues/
│   ├── lib/
│   │   ├── db.ts                singleton Prisma
│   │   ├── auth.ts              config Auth.js
│   │   ├── scoring/
│   │   │   ├── engine.ts        computePlayerPoints, computeLineupPoints (PURES)
│   │   │   └── engine.test.ts
│   │   ├── squad/
│   │   │   ├── validation.ts    validateSquad, validateLineup (PURES)
│   │   │   └── validation.test.ts
│   │   ├── data-providers/
│   │   │   ├── types.ts
│   │   │   ├── csv.provider.ts
│   │   │   ├── api-sports.provider.ts
│   │   │   └── lnh-scraper.provider.ts
│   │   └── config.ts            lecture GameConfig + env, validée Zod
│   └── types/
├── .env.example
└── railway.json / Dockerfile si besoin
```

Règle : **la logique métier (scoring, validation d'effectif) vit dans des fonctions pures testées**, jamais dans les route handlers ni les composants. C'est ce qui te permettra de changer les règles de points sans rien casser.

---

## 10. Environnement & déploiement

```env
# .env.example
DATABASE_URL=postgresql://...
AUTH_SECRET=
AUTH_GOOGLE_ID=            # optionnel
AUTH_GOOGLE_SECRET=
API_SPORTS_KEY=            # v1.handball.api-sports.io
CRON_SECRET=               # protège /api/cron/*
INITIAL_BUDGET=100.0
NEXT_PUBLIC_APP_URL=https://...
```

Railway :
- Service web Next.js (standalone output, `PORT` + `0.0.0.0` comme sur tes autres projets — pas besoin de server.js custom ici, pas de Socket.io en v1).
- Service Postgres managé.
- ~~Crons Railway (`cron-daily`/`cron-hourly`, image `curlimages/curl`)~~ — supprimés
  le 2026-07-30, jamais fonctionnels (voir §6.7 pour le diagnostic complet : ni
  schedule ni commande de démarrage configurés côté Railway). Remplacés par 2
  workflows GitHub Actions qui `curl -X POST -H "Authorization: Bearer $CRON_SECRET"`
  les routes `/api/cron/*` :
  - `cron-daily.yml` (`0 6 * * *`) : `sync-news` uniquement — seul besoin exprimé côté
    cron de synchro. Les autres routes de synchro (fixtures/résultats/notes/scores/
    classement/effectifs/pronostics) restent volontairement non planifiées, voir §6.7.
  - `post-stat-leaders.yml` (`0 7 * * *`) : voir §17.1

  Simplifications assumées par rapport au découpage plus fin envisagé à l'origine
  (`sync-ratings` 2×/jour à 9h/13h, `sync-results` seulement les soirs de match
  jeu→dim 20h-2h, `snapshot-lineups` toutes les 15 min) : toutes ces routes sont
  idempotentes, un appel hors fenêtre utile est un no-op sans effet de bord — juste
  moins précis (ex. `snapshot-lineups` peut geler un alignement jusqu'à ~59 min après
  la deadline exacte plutôt qu'au plus près). À resserrer si ça devient gênant en
  pratique.

---

## 11. CLAUDE.md suggéré (à créer à la racine)

```md
# Handball Fantasy
Jeu fantasy basé sur la Starligue (handball D1 FR). Lire ARCHITECTURE.md avant toute feature.

## Stack
Next.js 14 App Router, TypeScript strict, Tailwind, Framer Motion, Prisma + PostgreSQL,
Auth.js v5, Zod. Déploiement Railway.

## Règles non négociables
- Logique métier (scoring, validation squad/lineup) = fonctions pures dans src/lib/**, testées (vitest).
- Toute donnée externe passe par src/lib/data-providers (interface StarligueDataProvider).
- Ingestion idempotente : upsert par externalIds, jamais de create nu.
- Toutes les constantes de jeu viennent de GameConfig/env, jamais en dur.
- Tout input API validé par Zod. Réponses { data } | { error: { code, message } }.
- Mutations d'effectif/alignement en transaction Prisma, contrôle de deadline côté serveur.
- Mobile-first. Palette et composants : voir ARCHITECTURE.md §8.

## Commandes
pnpm dev | pnpm test | pnpm prisma migrate dev | pnpm prisma db seed
```

---

## 12. Roadmap de développement (ordre pour Claude Code)

**Phase 1 — Fondations (le jeu jouable en manuel)**
1. Init projet, Prisma schema, migrations, seed (16 clubs 2026/27, joueurs placeholder, 30 journées).
2. Auth (register/login) + création FantasyTeam au register.
3. Moteur de scoring + validations squad/lineup (fonctions pures + tests) — *à faire tôt : tout en dépend*.
4. Imports CSV admin (clubs, players, fixtures, results, ratings) + compute-scores.
5. Wizard de build d'effectif + vue terrain + choix titulaires.
6. Snapshot lineups + calcul points + page /team avec historique.

**Phase 2 — Social**
7. Ligues (création, code d'invitation, classement).
8. Classement global + classement de journée.
9. Fiches joueurs, calendrier/résultats, polish UI (animations, deadline banner).

**Phase 3 — Automatisation**
10. ApiSportsProvider (fixtures + résultats) + crons Railway.
11. LnhScraperProvider (notes) avec alerting en cas d'échec de parsing.
12. Admin : logs d'ingestion, recompute, édition de config.

**v2 (plus tard)** : notifications (deadline, points), classements de ligue par journée, PWA.

*(Livrés depuis, contrairement à ce que cette liste indiquait encore : transferts en
saison + fenêtres de transfert, valeurs marchandes dynamiques, capitaine ×2 — voir
§2.3 et §13.)*

---

## 13. Effectif en cours de saison : transferts, capitaine, bonus et joker médical

Fonctionnalités ajoutées après le v1 initial (le §12 les listait encore par erreur
comme roadmap "v2" — corrigé). Logique pure dans `src/lib/transfers/*`,
`src/lib/players/value-adjustment.ts` et `src/lib/scoring/engine.ts`
(`computePlayerPoints`/`computeLineupPoints`/`applySeasonBonus`), orchestration
partagée entre jeu en direct et Mode Simulation.

### 13.1 Fenêtres de transfert

- `TransferWindow` (`id`, `seasonId`, `label`, `opensAt`, `closesAt`) — saisi
  librement par l'admin (`/admin/transfer-windows`, `POST/PUT/DELETE
  /api/admin/transfer-windows`), aucune limite de nombre ni contrôle de
  chevauchement. Dans la pratique : 2 trêves internationales + la trêve
  hivernale par saison, mais rien ne l'impose au niveau du modèle.
- Hors fenêtre, l'effectif est **gelé** (sauf joker médical, §13.6). Pendant une
  fenêtre ouverte : **transferts illimités**, un par un, chacun un échange 1
  joueur vendu ↔ 1 joueur acheté au même poste (`POST /api/my-team/transfer`,
  `src/lib/transfers/validate.ts`).
- Prix : **valeur marchande courante des deux côtés** au moment du transfert —
  jamais un prix d'achat historique (`newBudget = budget + sellPlayer.marketValue
  - buyPlayer.marketValue`, doit rester ≥ 0).
- "Fenêtre ouverte" a deux définitions distinctes (`src/lib/transfers/window.ts`,
  asymétrie déjà présente ailleurs dans le projet entre live et simulation) :
  - **Live** (`isLiveTransferWindowOpen`) : `now` tombe dans `[opensAt, closesAt]`
    d'au moins une fenêtre de la saison.
  - **Simulation** (`isSimulationTransferWindowOpen`) : pas d'horloge réelle
    pertinente (la saison avance à la demande de l'admin, §5), donc la fenêtre
    est ouverte pour toute équipe dont la journée courante se situe entre la
    dernière journée programmée avant `opensAt` et la première après
    `closesAt`.
- Vendre le capitaine réinitialise `captainId` à `null` (§13.4).

### 13.2 Points → Budget

Pendant une fenêtre ouverte, possibilité de convertir une partie des points de
saison en budget de transfert (`POST /api/my-team/points-conversion`,
`src/lib/budget/points-conversion.ts`) au taux `POINTS_TO_BUDGET_RATE` (défaut
**0.1**, donc 10 points → 1.0 de budget). Les points convertis sortent
**définitivement** de `totalPoints` (`FantasyTeam.pointsConverted`,
`src/lib/scoring/compute.ts::recalcTotalPoints` les soustrait à chaque
recompute pour que la conversion ne soit jamais écrasée) — pas réversible.

### 13.3 Valorisation dynamique des joueurs

Après chaque journée notée, les valeurs marchandes bougent automatiquement
(`applyGameweekValueAdjustments`, appelé depuis `computeGameweekScores` en live
comme en simulation — aucun déclenchement manuel requis) :
- Classement par poste selon la note LNH du match du jour.
- Les `VALUE_ADJUSTMENT_TOP_N` meilleurs (défaut **5**) gagnent
  `VALUE_ADJUSTMENT_STEP` (défaut **+0.5**), les `VALUE_ADJUSTMENT_BOTTOM_N`
  derniers (défaut **5**) perdent la même valeur — plancher
  `VALUE_ADJUSTMENT_MIN` (défaut **1.0**).
- Idempotent par `gameweekId` (`PlayerValueHistory` sert de garde) : un
  recompute suite à une correction de note ne réapplique pas l'ajustement,
  limite acceptée (voir [[simulation_value_history_idempotency]]).
- Historisé dans `PlayerValueHistory` (une ligne par joueur par journée où sa
  valeur a bougé).

### 13.4 Capitaine

- Un capitaine par équipe (`FantasyTeam.captainId` / `SimulationTeam.captainId`,
  nullable) parmi les 14 joueurs de l'effectif — `PUT /api/my-team/captain`.
- **Choisi une fois pour la saison** : librement modifiable tant qu'aucun capitaine
  n'a jamais été désigné (`captainId === null`), puis **verrouillé** — modifiable
  uniquement pendant une fenêtre de transfert ouverte (`CAPTAIN_LOCKED` sinon,
  §13.1).
  Si le capitaine est vendu (transfert ou joker médical), `captainId` repasse à
  `null` et un nouveau choix libre redevient possible.
- Effet scoring : ×`CAPTAIN_MULTIPLIER` (défaut **2.0**) au lieu de ×1.0, **mais
  seulement s'il est titulaire ce jour-là** — `isCaptain` est calculé au snapshot
  de l'alignement (`src/app/api/cron/snapshot-lineups/route.ts`) comme
  `playerId === captainId && role === "STARTER"`. Capitaine sur le banc → aucun
  bonus, juste le ×0.5 remplaçant habituel.

### 13.5 Bonus de saison

4 bonus (`BonusType`), chacun activable **au maximum une fois par saison**, un
seul actif par journée à la fois (`FantasyTeam.pendingBonus`, choisi via
`PUT /api/my-team/bonus`, snapshoté sur `FantasyLineup.bonus` à la deadline comme
l'alignement). Quota global `SEASON_BONUS_QUOTA_PER_SEASON` (défaut **3 sur les
4 types** — un doit être sacrifié) ; historique dans `FantasyBonusUsage` /
`SimulationBonusUsage` (`@@unique([teamId, type])`, garantit le "1×/saison").

| Type | Effet | `GameConfig` |
|---|---|---|
| `TRIPLE_CAPTAIN` | Le capitaine passe de ×2.0 à ×3.0 (toujours sous réserve d'être titulaire, §13.4) | `TRIPLE_CAPTAIN_MULTIPLIER` (déf. 3.0) |
| `BENCH_BOOST` | Le banc compte ×1.0 au lieu de ×0.5 | `BENCH_BOOST_MULTIPLIER` (déf. 1.0) |
| `INSURANCE` | Chaque joueur individuel est plancherné à 0 avant sommation — aucun joueur ne peut faire perdre de points à l'équipe ce jour-là | — (logique dans `computeLineupPoints`) |
| `STATISTICIAN` | Double le bonus/malus "leader de journée" (§ stats boxscore) | `STATISTICIAN_MULTIPLIER` (déf. 2.0) |

### 13.6 Joker médical

Permet de remplacer un joueur blessé longue durée **sans attendre une fenêtre de
transfert** — même route que les transferts classiques (`POST /api/my-team/transfer`,
§13.1), juste un chemin d'autorisation alternatif quand aucune fenêtre n'est
ouverte.

- Un joueur devient éligible quand l'admin déclare la blessure via
  `PUT /api/admin/players/[id]` (champ `Player.injuredAt`, distinct de `isActive`
  qui sert plutôt à un départ de club). La déclaration/levée génère aussi une actu
  publique (`createInjuryNewsItem`, §16).
- Condition d'éligibilité au moment du transfert : `sellPlayer.injuredAt` non nul
  **ET** `team.jokersUsed < JOKER_QUOTA_PER_SEASON` (défaut **2** par saison,
  `FantasyTeam.jokersUsed` / `SimulationTeam.jokersUsed`, jamais remis à zéro en
  cours de saison). Sinon → `TRANSFER_WINDOW_CLOSED` (aucune fenêtre ouverte, et
  pas de joker disponible pour ce joueur).
- Mêmes règles qu'un transfert classique une fois l'éligibilité passée : même
  poste obligatoire, prix au marché courant des deux côtés (§13.4 s'applique
  aussi si le joueur vendu était le capitaine : `captainId` repasse à `null`).
- Consomme un joker (`jokersUsed` incrémenté) que le joueur remplaçant soit
  meilleur ou moins bon que le blessé — pas de remboursement si l'état du joueur
  s'améliore ensuite.

---

## 14. Pronostics de journée (multiplicateur de points)

Fonctionnalité ajoutée après le v1 initial : les utilisateurs pronostiquent l'issue
des matchs de chaque journée. Un bon pronostic n'ajoute pas de points isolés — il
alimente un **multiplicateur** appliqué aux points positifs générés par les 14
joueurs de l'équipe cette journée-là. **v1 : jeu en direct uniquement** (voir §14.6).

### 14.1 Marché : 1X2 classique

3 issues exhaustives et disjointes (`src/lib/predictions/outcome.ts`), pas de
handicap ni de bandes d'écart de buts (abandonnées : pas assez d'intérêt
supplémentaire pour la complexité ajoutée) :

```
homeScore > awayScore → HOME
homeScore = awayScore → DRAW
homeScore < awayScore → AWAY
```

**Optionnel** : pronostiquer n'est jamais obligatoire — une journée sans aucun
pronostic tenté reste neutre (×1, voir §14.3), aucune pénalité ni aucune fonctionnalité
bloquée pour qui n'y touche pas.

Gratuit et illimité : aucun coût, aucun wallet/budget dédié, aucune pénalité pour un
pronostic faux (0 point, cohérent avec §2.3 « joueur non noté = 0 »). Modifiable
jusqu'à **`PREDICTION_LOCK_MINUTES_BEFORE_KICKOFF` minutes avant le coup d'envoi du
match** (`Match.kickoffAt`, défaut 5 min, `src/lib/predictions/lock.ts`), pas la
deadline de journée — les matchs d'une même journée ne débutent pas tous en même
temps.

**Une seule journée ouverte à la fois** : impossible de pronostiquer une journée
future tant que la précédente n'est pas passée (deadline de la journée courante —
première dont `deadlineAt > now` — franchie). Vérifié à la fois côté API
(`GET`/`POST /api/predictions`, code erreur `GW_NOT_OPEN`) et côté UI (navigation
`←`/`→` de `/predictions` bornée à la journée courante). Les journées déjà passées
restent consultables (lecture seule, de toute façon verrouillées match par match
via `kickoffAt`).

### 14.2 Cotes calculées en interne — purement informatives

Pas de cotes de bookmaker externes (aucune source fiable). Calculées à partir de la
force des deux clubs = **valeur marchande moyenne de l'effectif actif** (proxy
simple, toujours disponible dès le seed, contrairement au classement LNH vide en
pré-saison) :

```
skew = tanh((forceDomicile - forceExtérieur) / STRENGTH_SCALE) × MAX_SKEW
probabilité Domicile/Extérieur = distribution de base (GameConfig) décalée par skew,
                                  le nul reste fixe, clampée et renormalisée à somme = 1
cote = (1 / probabilité) × (1 − marge bookmaker), arrondie à 2 décimales, plancher 1.01
```

Fonctions pures et testées : `src/lib/predictions/odds.ts`. Cotes calculées **une
seule fois** par match (cron idempotent `compute-prediction-odds`, upsert par
`matchId`) puis **figées** jusqu'au coup d'envoi — jamais recalculées après.

⚠️ **Non affichées à l'utilisateur** (retiré le 2026-08-05) — `PredictionMarket`
reste un prérequis structurel (`Prediction.marketId` est une FK obligatoire,
`POST /api/predictions` renvoie `MARKET_NOT_READY` si le marché n'existe pas
encore), mais les valeurs `oddsHome`/`oddsDraw`/`oddsAway` elles-mêmes ne
sortent jamais de l'API (`GET /api/predictions` renvoie `canPredict: boolean`,
pas les chiffres). Choix produit pour l'App Store : un affichage façon cote
décimale ("1.85 / 3.20 / 4.10") ressemble visuellement à une UI de paris et
risque de faire classer l'app en "Simulated Gambling" par la review Apple,
même si — comme avant ce retrait — les cotes n'entraient déjà dans aucun
calcul de score (seul le multiplicateur §14.3, basé sur juste/faux, compte).
L'utilisateur choisit une issue sans aide visuelle.

### 14.3 Multiplicateur de journée

```
multiplicateur = MULTIPLIER_MIN + (MULTIPLIER_MAX − MULTIPLIER_MIN) × (pronostics_justes / pronostics_tentés)
```

Défaut : `MULTIPLIER_MIN = 0`, `MULTIPLIER_MAX = 2.0` → par pas de 0.25 sur une
journée à 8 matchs (0/8 = ×0, 1/8 = ×0.25, 2/8 = ×0.5, 3/8 = ×0.75, 4/8 = ×1,
5/8 = ×1.25, 6/8 = ×1.5, 7/8 = ×1.75, 8/8 = ×2.0). Généralisé à `pronostics_tentés` (pas un nombre de matchs fixe) :
robuste aux reports/annulations, on attend simplement que tous les matchs de la
journée soient joués. **Aucun pronostic tenté → ×1 (neutre)** : ne jamais pénaliser
l'absence de pari, seul un pari tenté et raté coûte (`src/lib/predictions/multiplier.ts`).

Le multiplicateur ne s'applique **qu'aux points positifs** de la journée — jamais sur
du négatif ou du zéro, pour ne jamais doublement punir une mauvaise journée de
joueurs même chez un excellent pronostiqueur.

### 14.4 Intégration au scoring

Calculé et appliqué directement dans `computeGameweekScores`
(`src/lib/scoring/compute.ts`), juste après `computeLineupPoints` et avant
l'écriture de `FantasyLineup.points` — donc reflété à la fois dans `totalPoints`
(classement principal) et dans le classement de la journée. Pas de job de règlement
séparé : le calcul du multiplicateur réutilise les scores de match déjà chargés par
`computeGameweekScores`, rejouable comme le reste (`compute-scores` efface et
recalcule).

### 14.5 Modèle de données

```prisma
model PredictionMarket {  // 1:1 avec Match, partagé (pas de duplication Fantasy*/Simulation*)
  matchId, oddsHome, oddsDraw, oddsAway, computedAt
}
model Prediction {        // le choix d'une FantasyTeam sur un marché
  fantasyTeamId, marketId, outcome, createdAt, updatedAt
  @@unique([fantasyTeamId, marketId])
}
enum PredictionOutcome { HOME DRAW AWAY }
```

Nouvelles clés `GameConfig` : `PREDICTION_MULTIPLIER_MIN/MAX`,
`PREDICTION_LOCK_MINUTES_BEFORE_KICKOFF`,
`PREDICTION_BOOKMAKER_MARGIN`, `PREDICTION_STRENGTH_SCALE`, `PREDICTION_MAX_SKEW`,
`PREDICTION_BASE_PROB_{HOME,DRAW,AWAY}`.

### 14.6 Endpoints

```
GET  /api/predictions?gw=&leagueId=   → matchs de la journée : cotes + mon pronostic + verrouillage
                                         (+ currentGameweekNumber, la journée la plus avancée ouverte)
POST /api/predictions                 { matchId, outcome, leagueId? } → pose/modifie mon pronostic
                                         (400 GW_NOT_OPEN si la journée du match n'est pas encore ouverte)
POST /api/cron/compute-prediction-odds → crée les marchés des matchs programmés sans cotes (idempotent)
```

### 14.7 Hors scope v1 : Mode Simulation

Contrairement au reste du modèle (`FantasyTeam`/`SimulationTeam`,
`FantasyBonusUsage`/`SimulationBonusUsage`, etc.), il n'y a **pas** de
`SimulationPrediction` pour l'instant. Le Mode Simulation rejoue une saison déjà
terminée (résultats déjà en base, révélés progressivement par le curseur admin,
§"piège anti-spoiler" rencontré 4× — voir mémoire `club_pages_and_head_to_head`) :
étendre les pronostics à ce mode demande de vérifier explicitement qu'aucune donnée
(cote, verrouillage) ne fuite un résultat au-delà du curseur avant de câbler quoi que
ce soit. `GET/POST /api/predictions` renvoient `NOT_AVAILABLE_IN_SIMULATION` en mode
simulation plutôt que de risquer une fuite non vérifiée.

---

## 15. Risques identifiés

| Risque | Mitigation |
|---|---|
| Notes LNH indisponibles via scraping (changement de site, blocage) | CSV admin = chemin nominal de secours, prévu dès la Phase 1 |
| Notes publiées tardivement / corrigées | compute-scores rejouable par journée |
| Quota API-Sports gratuit dépassé | ~10 req/jour réel << 100 ; sinon upgrade ou bascule Highlightly |
| Effectifs 2026/27 pas encore connus (mercato) | Seed placeholder + import CSV final fin août 2026 |
| Litiges sur les règles de points | Constantes en GameConfig + affichage des règles dans l'app |

---

## 16. Page Starligue (actus) — page d'accueil du site

Page d'accueil `/` (`src/app/page.tsx`) — vue d'ensemble de la Daikin StarLigue
(résultats, prochains matchs, classement, flux d'actus, blessures déclarées, équipe
type et meilleures performances de la semaine, leaders stats), doublée d'une porte
d'entrée vers le jeu fantasy : bandeau de bienvenue (message personnalisé si
connecté), `AuthButton` (connexion/déconnexion), CTA "Créer mon équipe Fantasy" /
"Accéder à Fantasy Starligue →" selon l'état de session. Hors
`PROTECTED_PREFIXES`/`ADMIN_PREFIXES` (`src/lib/auth.ts`) : accessible sans compte,
sans redirection ni pour un visiteur déconnecté ni pour un joueur connecté.
Anciennement à `/starligue` (déplacée sur demande explicite pour devenir la home) —
cette route redirige désormais vers `/` ; `/starligue/[id]` (détail d'une actu) n'a
pas bougé.

**Saison live uniquement** — même logique que les pronostics (§14.6) : le Mode
Simulation rejoue une saison déjà terminée avec un curseur anti-spoiler, une actu
blessure/équipe-type/transfert n'aurait aucun sens et risquerait de fuiter des
résultats.

### 16.1 Sources et pipeline d'ingestion

Modèle `NewsItem` (catégories `TRANSFER|INJURY|TEAM_OF_WEEK|PERFORMANCE|GENERAL`,
`sourceType` `LNH_SITE|CLUB_SITE|MEDIA_SITE|GENERATED`). Deux origines :

- **Scrapé** : cron quotidien `POST /api/cron/sync-news` (`0 7 * * *`) itère un
  registre de providers (`src/lib/data-providers/news/registry.ts`) — un par site
  (lnh.fr + un fichier par club, `src/lib/data-providers/news/clubs/`), chacun isolé
  dans son propre try/catch (une source en panne n'affecte jamais les autres,
  cohérent avec la prudence scraping du §3.2/§15). lnh.fr utilise la même recette AJAX
  que le reste de `lnh-scraper.provider.ts` (`contents_controller=news` sur
  `/ajaxpost1`). Les sites de clubs sont ajoutés incrémentalement (16 structures HTML
  indépendantes, reconnaissance site par site) — le pipeline tourne de bout en bout
  avec lnh.fr seul, chaque club ajouté n'est qu'un fichier + une ligne de registre.
  `sourceType MEDIA_SITE` : média handball indépendant (ni lnh.fr ni un club) —
  handnews.fr, ajouté le 2026-08-07 (`src/lib/data-providers/news/handnews.provider.ts`),
  filtré à `/tag/starligue/` côté source pour rester strictement Starligue.
- **Généré en interne** : déclaration/levée de blessure par l'admin (hook dans
  `PUT /api/admin/players/[id]`, catégorie `INJURY`) ; équipe type + meilleures
  performances de la journée, générées juste après `computeGameweekScores` dans
  `POST /api/cron/compute-scores` (`src/lib/news/generate-weekly-news.ts`).

Classification `TRANSFER` par heuristique de mots-clés sur le texte scrapé
(`src/lib/news/classify.ts`) — best-effort, aucune source structurée n'existe pour
les transferts réels. `INJURY`/`TEAM_OF_WEEK`/`PERFORMANCE` ne sont jamais déduites
d'un texte scrapé, exclusivement posées par les générateurs internes.

### 16.2 Dédoublonnage

Deux niveaux (`src/lib/news/dedupe.ts`) :
- **Exact par source** : `NewsItem.dedupeKey` unique (upsert, jamais de create nu).
- **Quasi-doublon cross-source** : la même actu réelle peut sortir à la fois sur
  lnh.fr et sur le site d'un club avec un titre différent — détecté en logique
  applicative (similarité de Jaccard sur les tokens du titre, même club ou l'un des
  deux transverse, écart de date ≤ 2 jours), pas encodable en contrainte SQL.
  Publication automatique pour un item "aujourd'hui" — voir §16.3 pour la
  nuance apportée sur le run manuel.

### 16.3 Fenêtre élargie + validation admin (déclenchement manuel uniquement)

Demande explicite du 2026-08-07 : `runNewsSync` (`src/lib/news/sync.ts`) ne
retient par défaut que les articles publiés **aujourd'hui** (`todayStart`,
comportement historique, toujours celui du cron quotidien `sync-news`, sans
supervision humaine). `POST /api/admin/news/sync` (déclenchement manuel depuis
`/admin/news`) passe désormais `{ windowDays: 3 }` : un article publié
aujourd'hui ou hier ou avant-hier n'est plus rejeté "trop ancien" — mais un
article strictement antérieur à aujourd'hui n'est **pas non plus auto-publié**.
Il est renvoyé sous forme de `PendingNewsItem` (déjà classifié/clubId résolu/
contenu intégral pré-récupéré, exactement comme s'il allait être inséré), affiché
dans un nouveau bloc "Actus en attente de validation" sur `/admin/news` avec
un bouton Publier/Ignorer par item. Publier appelle `POST /api/admin/news/
sync/confirm`, qui rejoue à l'identique l'insertion `NewsItem` qu'aurait faite
`runNewsSync` (même `dedupeKey`, `sourceType`/`sourceKey` d'origine préservés —
pas requalifié en `GENERATED`/`admin` comme la création manuelle libre de
§16.1) après avoir revérifié les deux contrôles anti-doublon (au cas où l'item
aurait été publié entre-temps par une autre source ou un double clic — 409
`ALREADY_PUBLISHED`). Ignorer ne fait rien côté serveur (pas de table de
rejets persistée) : l'item n'est simplement pas publié, il pourra
réapparaître en pending au prochain run manuel tant qu'il reste dans la
fenêtre de 3 jours.

## 17. Publication Instagram (@starliguefantasy)

Compte Instagram Professionnel relié à une Page Facebook, publié uniquement via la
Graph API (pas d'API "grand public" pour poster) : `src/lib/instagram/client.ts`
(fetch pur, credentials injectées en paramètre, `getInstagramCredentialsFromEnv()` lit
`INSTAGRAM_ACCESS_TOKEN`/`INSTAGRAM_BUSINESS_ACCOUNT_ID`). Deux flows Content
Publishing API, tous deux en 2-3 étapes création-de-conteneur(s) puis publication,
jamais d'upload de fichier binaire direct (image déjà hébergée sur une URL HTTPS
publique) :
- **Image seule** : `createImageContainer` → `publishContainer` (`postImage`).
  Utilisé par `POST /api/admin/instagram/post` (admin manuel, image déjà hébergée) et
  par la campagne teaser lancée à la main (images `public/social/*.png`, générées en
  local via un artifact HTML/CSS rendu par Playwright, jamais par ce code).
- **Carrousel (2-10 images)** : un `createCarouselItemContainer` par image
  (`is_carousel_item=true`, pas de caption dessus) puis `createCarouselContainer`
  (`media_type=CAROUSEL&children=...`, caption ici) puis `publishContainer`
  (`postCarousel`).
- L'API ne permet PAS de supprimer un média déjà publié (`DELETE` → erreur de
  permission quel que soit le token) : toute idempotence doit être vérifiée AVANT
  l'appel Graph API, jamais après.

### 17.1 Posts automatiques "Leaders Starligue" (après chaque journée notée)

`POST /api/cron/post-stat-leaders` (§6.7) publie 3 carrousels par journée notée
(`Gameweek.isScored`) de la saison active, dès qu'ils n'ont pas encore été postés :

| Post | Thème | Stats (top 5, total + moyenne/match) |
|---|---|---|
| `attack` | Attaque | Buts (tirs), total buts, penaltys, dernière passe — 8 slides |
| `goalkeepers` | Gardiens | Arrêts — 2 slides |
| `defense` | Défense/hustle | Interceptions (`ballsRecovered`), contres, neutralisations — 6 slides |

(Un carrousel Instagram est plafonné à 10 images, d'où le découpage en 3 posts plutôt
qu'un seul de 16 slides.)

- **Idempotence** : modèle `SocialPost` (`dedupeKey` unique, ex.
  `stat-leaders:attack:{gameweekId}`), vérifié avant tout appel Graph API — un des 3
  posts peut échouer sans affecter les 2 autres, et sera retenté seul au tick suivant.
- **Génération d'image** : `GET /api/og/stat-leaders?statKey=&scope=&seasonId=&gameweekNumber=`
  (`ImageResponse` de `next/og`, runtime Node.js — pas edge, car il interroge Prisma
  via `getStatLeaders()`, `src/lib/stats/get-stat-leaders.ts`, la même logique de
  classement que `GET /api/stats/leaders`). Rendu à la demande à chaque appel
  Instagram (pas de fichier stocké). Design "hero" (décision explicite de
  l'utilisateur) : le n°1 en grand format (photo pleine largeur ~620px, ou repli
  initiales géantes sur dégradé teal si `Player.photoUrl` est absent — ~119/252
  joueurs couverts, cf. §2 photos) avec un masque dégradé sombre plaqué sur le bas de
  la photo (généré en JSX, pas un fichier PNG séparé) pour la lisibilité du nom/club/
  valeur en overlay, puis une mini-liste compacte des rangs 2 à 5 en dessous. Polices
  Barlow Condensed Bold + Inter embarquées en fichiers `.ttf` sous
  `src/lib/social/fonts/` (satori ne lit pas les `next/font`, il lui faut un buffer
  TTF/OTF — la version variable d'Inter fait planter le parseur de police de
  `@vercel/og`, une version statique est nécessaire).
- **Vérification avant publication réelle** : `?dryRun=true` (utilisable en session
  admin, `verifyCronAuth` accepte aussi bien le secret cron que l'admin) renvoie les
  URLs d'image + légendes en JSON sans rien publier ni marquer en base.
- **Légendes** : `buildStatLeadersCaption()` (`src/lib/instagram/stat-leaders-caption.ts`),
  ton identique aux posts manuels (emojis + hashtags `#StarligueFantasy #Handball
  #FantasyHandball #DaikinStarLigue #LNH`).
- Déclenché par un workflow GitHub Actions planifié (`.github/workflows/
  post-stat-leaders.yml`, `cron: "0 7 * * *"`) — voir §6.7 pour la raison (premier
  cron migré loin de Railway, avant que `cron-daily` ne le soit aussi le 2026-07-30
  pour le même type de problème). Secret `CRON_SECRET` dupliqué en
  secret de repo GitHub (Settings → Secrets and variables → Actions), même valeur que
  côté Railway. Le workflow expose aussi un déclenchement manuel (`workflow_dispatch`,
  avec option `dryRun`) pour tester sans attendre l'horaire planifié.

### 17.2 Gabarit "hero" comme format standard pour tout post classement

Le design "hero" (n°1 en grand format + mini-liste rangs 2-5, cf. §17.1) n'est pas
spécifique au pipeline `post-stat-leaders` : c'est **le format de référence pour tout
post Instagram de type classement**, y compris les posts ponctuels publiés à la main
hors cron. Premier réemploi : post 10 "Les plus sélectionnés" (2026-07-29, top 5 des
joueurs les plus présents dans les `FantasyTeam` sur les 24 premières heures du jeu,
Mathieu GREBILLE en tête avec 10/24 équipes) — mêmes tokens visuels que
`src/app/api/og/stat-leaders/route.tsx` recopiés à l'identique dans un fichier HTML/CSS
autonome (pipeline `public/social/*.png` des posts 2-9, pas la route `next/og`), pour
rester indiscernable des posts automatiques.

Tokens à reprendre tels quels pour tout futur post de ce type (y compris les stats
après chaque journée notée) :
- **Format** : 1080×1350, bloc hero 1080×620.
- **Polices** : `display` = `src/lib/social/fonts/BarlowCondensed-Bold.ttf` (titres,
  nom du n°1, valeurs chiffrées) ; `sans` = `src/lib/social/fonts/Inter-Regular.ttf`
  (texte courant). Versions statiques obligatoires (une police variable fait planter
  `@vercel/og`, cf. §17.1) ; en HTML/CSS autonome, chargées via `@font-face` en
  `file://` vers ces mêmes fichiers `.ttf`.
- **Couleurs** : fond `#0E1116` + dégradés radiaux `rgba(45,212,191,0.16)` (teal, haut)
  et `rgba(245,158,11,0.12)` (ambre, bas-droite) ; badge/valeurs en ambre `#F59E0B` ;
  sous-titre en teal `#2DD4BF` ; texte principal `#F1F5F9`, texte secondaire `#94A3B8`/
  `#CBD5E1`.
- **Hero** : photo pleine largeur (repli initiales géantes sur dégradé teal si absente)
  + masque dégradé sombre plaqué sur le bas (`linear-gradient` vers `#0E1116`) pour la
  lisibilité du nom/club/valeur en overlay ; nom 48px, valeur 84px.
- **Mini-liste** : lignes `rgba(255,255,255,0.04)` + bordure `rgba(255,255,255,0.08)`,
  cercle de rang, logo club (`public/clubs/*.png`), valeur 32px ambre.
- **Footer** : "STARLIGUE FANTASY / starliguefantasy.fr".
- **Légende** : même ton que les autres posts (emojis + hashtags `#StarligueFantasy
  #Handball #FantasyHandball #DaikinStarLigue #LNH`).

---

## 18. Mode Enchères (draft alternatif par ligue)

### 18.1 Principe

Nouveau mode de constitution d'effectif, alternatif au wizard classique à prix
fixe (§8.3), choisi **à la création de la ligue** et figé ensuite —
`League.mode` (`LeagueMode` : `CLASSIC` par défaut | `AUCTION`), pas de bascule
en v1.

Objectif : constituer l'effectif de tous les membres d'une ligue par enchères
successives plutôt que par achat direct à la `marketValue`, avec une contrainte
propre à ce mode — **aucun joueur ne peut appartenir à deux équipes de la même
ligue**. Budget de départ plus élevé qu'en classique (`AUCTION_INITIAL_BUDGET`,
`GameConfig` distinct d'`INITIAL_BUDGET`), qui reflète le fait qu'une enchère
perdue ne coûte jamais rien (§18.3).

### 18.2 Déroulement en tours

- Remplace l'écran 2 de l'onboarding (§8.3, "Build de l'effectif") pour les
  ligues `AUCTION` ; les écrans 1 (identité) et 3 (titulaires) restent
  inchangés et arrivent une fois les enchères terminées.
- Un tour (`AuctionRound`, `roundNumber` 1..N, `AUCTION_ROUND_COUNT` défaut
  **3**) est scoped à la ligue entière : tous les membres doivent avoir soumis
  pour qu'il se résolve.
- À chaque tour, un membre place au plus **une enchère par slot de poste qu'il
  lui reste à pourvoir** — pas systématiquement 14 enchères dès le 1er tour si
  l'effectif se remplit déjà via des tours précédents. Validation à la
  soumission : somme des enchères du tour ≤ budget restant, une enchère max
  par joueur, aucune enchère sur un poste déjà complet (2/2) ni sur un club
  déjà à `MAX_PLAYERS_PER_CLUB` en tenant compte des enchères en cours.
- Soumettre le tour est une action explicite, même avec 0 enchère si
  l'effectif du membre est déjà complet (`AuctionRoundSubmission`) — condition
  de la résolution automatique.
- Résolution automatique dès que tous les membres actifs ont soumis ;
  fallback admin (§18.6) pour débloquer un tour si un membre ne se manifeste
  jamais — même logique "aucune limite/contrôle imposé, l'admin tranche" que
  les fenêtres de transfert (§13.1).

### 18.3 Résolution d'un tour (règles d'arbitrage)

Fonction pure `resolveAuctionRound` (`src/lib/auction/resolve.ts`),
déterministe et testée, appelée depuis la route de résolution — même esprit
que `validateSquad`/`applyGameweekValueAdjustments`.

- Pour chaque joueur ayant reçu au moins une enchère dans le tour : le membre
  avec l'enchère la plus haute le remporte.
- **Égalité sur la plus haute enchère → personne ne le remporte ce tour**
  (règle produit explicite) : le joueur reste disponible aux tours suivants,
  tous les enchérisseurs peuvent re-enchérir dessus.
- Le joueur gagné est assigné **automatiquement** au bon slot de poste dans
  `FantasySquadPlayer` (`purchasePrice` = montant de l'enchère gagnante) —
  jamais une étape manuelle côté utilisateur.
- Budget : seule l'enchère **gagnante** est déduite (`FantasyTeam.budget -=
  amount`) ; une enchère perdue ou nulle (égalité) ne coûte rien, le budget
  correspondant reste disponible au tour suivant.
- Exclusivité au sein de la ligue : un joueur remporté devient indisponible
  pour toutes les autres équipes de la même ligue dès la résolution du tour
  (retiré du pool proposé aux tours suivants) — contrôlé **en application**
  (`validateAuctionBid`), pas par contrainte DB globale : le mode `CLASSIC`
  autorise explicitement le partage d'un joueur entre équipes d'une même
  ligue, donc pas de `@@unique` bloquant au niveau du schéma.

### 18.4 Fin des enchères, cas non résolus

`AUCTION_ROUND_COUNT` tours (défaut 3) suffisent dans l'immense majorité des
cas. À l'issue du dernier tour, si un membre a encore un ou plusieurs slots
vides (égalités répétées, budget épuisé) : **pas de tour de rattrapage
dédié** — le slot reste vide et se comble via le marché des transferts
classique une fois une fenêtre ouverte (§13.1), comme n'importe quel effectif
incomplet ailleurs dans le jeu. `FantasyTeam.isValidated` reste `false` tant
que les 14 slots ne sont pas remplis, comme en mode classique. Une fois le
dernier tour résolu : passage aux écrans 1/3 de l'onboarding (identité
possible en parallèle des enchères, titulaires seulement une fois l'effectif
connu).

### 18.5 Modèle de données (ajouts Prisma)

```prisma
enum LeagueMode {
  CLASSIC   // comportement actuel, inchangé
  AUCTION
}

model League {
  // ...
  mode LeagueMode @default(CLASSIC)   // figé à la création, pas de bascule en v1
}

enum AuctionRoundStatus {
  OPEN
  RESOLVED
}

model AuctionRound {
  id          String                    @id @default(cuid())
  leagueId    String
  league      League                    @relation(fields: [leagueId], references: [id])
  roundNumber Int
  status      AuctionRoundStatus        @default(OPEN)
  resolvedAt  DateTime?
  bids        AuctionBid[]
  submissions AuctionRoundSubmission[]

  @@unique([leagueId, roundNumber])
}

// Soumission explicite d'un tour par une équipe (même avec 0 enchère si son
// effectif est déjà complet) — condition de la résolution automatique du tour.
model AuctionRoundSubmission {
  id             String       @id @default(cuid())
  auctionRoundId String
  auctionRound   AuctionRound @relation(fields: [auctionRoundId], references: [id])
  fantasyTeamId  String
  fantasyTeam    FantasyTeam  @relation(fields: [fantasyTeamId], references: [id])
  submittedAt    DateTime     @default(now())

  @@unique([auctionRoundId, fantasyTeamId])
}

// won renseigné à la résolution, jamais relu pour la logique de jeu — sert de
// trace d'audit/affichage, même esprit que PlayerValueHistory (§13.3).
model AuctionBid {
  id             String       @id @default(cuid())
  auctionRoundId String
  auctionRound   AuctionRound @relation(fields: [auctionRoundId], references: [id])
  fantasyTeamId  String
  fantasyTeam    FantasyTeam  @relation(fields: [fantasyTeamId], references: [id])
  playerId       String
  player         Player       @relation(fields: [playerId], references: [id])
  amount         Decimal      @db.Decimal(6, 1)
  won            Boolean      @default(false)

  @@unique([auctionRoundId, fantasyTeamId, playerId])
}
```

### 18.6 Endpoints

```
GET    /api/leagues/:id/auction                      → état du tour courant (round, mes enchères, ai-je
                                                         soumis, joueurs déjà remportés dans la ligue = indispo)
POST   /api/leagues/:id/auction/bids                  { bids: [{ playerId, amount }] } → remplace mes
                                                         enchères du tour courant (validation : slots
                                                         restants, budget, MAX_PLAYERS_PER_CLUB, joueur
                                                         pas déjà remporté)
POST   /api/leagues/:id/auction/submit                → soumet mon tour (même vide) → déclenche la
                                                         résolution si je suis le dernier membre attendu
POST   /api/admin/leagues/:id/auction/force-resolve   → résout le tour courant même si tous les membres
                                                         n'ont pas soumis (fallback abandon/inactivité)
```

### 18.7 Hors scope v1

- Pas de bascule `CLASSIC` ↔ `AUCTION` après création de la ligue.
- Pas d'enchères en temps réel (pas de websocket, pas de contre-enchère
  visible pendant le tour) — sealed-bid uniquement, cohérent avec "une fois
  que tous ont placé leur enchère, le tour est fini".
- Pas de notification (email/push) quand un tour se résout.

### 18.8 Garde-fou bêta (test en prod, 4 comptes)

Avant ouverture à tous : `User.canUseAuctionMode` (`Boolean @default(false)`,
migration `20260729120000_add_user_auction_access_flag`) restreint qui peut
créer/rejoindre une ligue `mode: AUCTION` — vérifié côté `POST /api/leagues`
quand ce mode sera implémenté. Activé sur 4 comptes de test via
`scripts/grant-auction-access.ts` (même pattern que les autres scripts
ad hoc contre la prod, cf. `PROD_DATABASE_URL`). Flag temporaire, à retirer
(ou son contrôle à assouplir) une fois le mode validé en conditions réelles.

---

## 19. Matchs de préparation (mode "Warm Up")

Découvert le 2026-07-31 : lnh.fr expose un **calendrier global**
(`https://www.lnh.fr/matchs/calendrier`, `univers=matchs-6892`, distinct du
calendrier Daikin StarLigue déjà scrapé qui utilise `univers=d1-26623`) qui
couvre toutes les compétitions confondues — championnat, Coupe de France,
Trophée des Champions, **et une compétition officiellement labellisée "Warm
Up -"** par la LNH elle-même : les matchs de préparation d'avant-saison de
tous les clubs (Starligue et divisions inférieures), y compris face à des
clubs étrangers (ex: PSG vs Rhein-Neckar Löwen). Même structure HTML par item
(`calendars-listing-item`) que le calendrier officiel, donc même fiabilité de
scraping — contrairement à une simple annonce en texte libre dans les actus
club (ce qui aurait été le seul recours si cette compétition n'avait pas
existé côté LNH).

**Modèle** : `FriendlyMatch` (migration `20260731090000_add_friendly_match`)
— volontairement séparé de `Match` : pas de `Gameweek`/`deadlineAt`, pas de
classement (`ClubStanding`), pas d'impact sur le scoring fantasy. `homeClubId`/
`awayClubId` nullables (l'adversaire n'est pas toujours un club Daikin
StarLigue connu de notre DB — club de D2 ou club étranger), accompagnés de
`homeClubName`/`awayClubName` toujours renseignés (scrapés) pour l'affichage
même quand la résolution club échoue. `competitionLabel` garde "Warm Up" ou
"Trophée des Champions - WUP" (les deux gardés — "Trophée des Champions - TDC",
le vrai match d'ouverture officiel, et "Coupe de France" sont exclus, hors
périmètre demandé).

**Filtre "au moins une équipe Starligue"** : un match est gardé si `homeClubId`
OU `awayClubId` résout vers un club **jouant réellement la saison active**
(`getActiveClubIdBySlug`, `src/lib/clubs/get-active-club-slugs.ts` : club ayant
au moins un `Player` sur `seasonId`) — les deux slugs sont vérifiés
indépendamment, sans présumer lequel des deux est "le nôtre". Exemple vérifié :
Chartres (Starligue) vs Saran (marqué "proligue" côté href lnh.fr, mais bien
remonté Starligue en DB pour 2026/27) — les deux étant actifs, le match est
gardé quel que soit le libellé de division utilisé par lnh.fr lui-même (pas
fiable pour la classification, l'appartenance Starligue vient de notre propre
donnée d'effectif, pas du HTML scrapé).

**Piège trouvé et corrigé** : `Club` est une table **globale**, partagée avec le
Mode Simulation (`src/lib/simulation/setup.ts`) — elle contient donc aussi
d'anciens clubs relégués (Dijon/GDH, Istres/IPH, présents pour la saison 2025/26
simulée mais pas 2026/27, confirmé : 0 `Player` sur la saison active pour ces
deux clubs, et c'est aussi pourquoi ils n'ont pas de logo). Un premier filtre
basé sur "le club existe dans `Club`" les aurait comptés à tort comme
Starligue. `getActiveClubIdBySlug` règle ça une fois pour toutes (réutilisé par
`syncWarmupMatches` et `scripts/backfill-warmup-logos.ts`). Effet de bord :
lnh.fr tague encore Istres/Dijon sous `daikin-starligue/equipes/…` dans son
propre HTML (relégation pas répercutée côté LNH) — ce segment est ignoré
explicitement pour un club non actif (`resolveDivision`), pour ne pas afficher
une info-bulle "Daikin Starligue" trompeuse sur un adversaire qu'on vient de
traiter comme hors Starligue.

**Provider** : `LnhScraperProvider.fetchWarmupMatches(seasonsId, seasonStartYear)`
(`src/lib/data-providers/lnh-scraper.provider.ts`) — `parseWarmupFromHtml`
pour le parsing (testé, `lnh-scraper.warmup.test.ts`). `current_month=all` côté
lnh.fr renvoie toute la saison en une seule requête (vérifié : 579 items dont
67 "Warm Up -" pour 2026/27, tous en août) — pas besoin de boucler par mois.

**Ingestion** : `syncWarmupMatches` (`src/lib/ingestion/warmup.ts`), upsert
idempotent par `dedupeKey` (`"lnh:" + calendars_id`, même convention que
`NewsItem`) — calendrier ET résultats en une seule passe (le statut/score vient
de la même réponse que le calendrier, pas de fetch séparé).

**Cron** : `POST /api/cron/sync-warmup`, planifié dans `cron-daily.yml`
(06:00 UTC, job indépendant des deux autres).

**Logos et division des clubs hors DB** (migration
`20260731093000_add_warmup_logo_division`) : `FriendlyMatch.homeClubLogoUrl`/
`awayClubLogoUrl`/`homeClubDivision`/`awayClubDivision`, renseignés seulement
quand le club correspondant n'est pas actif en DB (sinon `Club.logoUrl` fait
autorité). `division` vient du 1er segment de l'URL équipe lnh.fr
(`proligue/equipes/…` → `"Proligue"`), ou d'une table connue à la main pour un
club étranger sans ce segment (`src/lib/clubs/warmup-foreign-divisions.ts` —
"1ère division allemande/hongroise/suisse/polonaise/japonaise" selon le club,
connaissance générale du handball, pas une donnée scrapée ; un club absent de
cette table reste simplement sans info plutôt que d'en deviner une). `logoUrl`
est un chemin statique **local** (`/clubs/warmup/{slug}.png`, jamais un hotlink
lnh.fr — même convention que les logos des clubs Starligue) :
`scripts/backfill-warmup-logos.ts` télécharge ces fichiers une fois (19 logos
backfillés le 2026-07-31), `syncWarmupMatches` ne fait que LIRE ces fichiers
déjà commités via `fs.existsSync` — jamais d'écriture dans `public/` à
l'exécution du cron (filesystem éphémère en prod, un build standalone Next.js
ne re-sert pas des fichiers ajoutés après coup dans `public/`). Un adversaire
pas encore backfillé retombe sur les initiales (`ClubLogo`) jusqu'au prochain
passage manuel du script.

**Affichage** : réutilise directement `MatchesStrip` (`src/components/
dashboard/MatchesStrip.tsx`, déjà utilisé pour le championnat) plutôt qu'un
composant séparé — demande explicite de l'utilisateur ("exactement le même
affichage"). Une seule liste chronologique (pas de séparation résultats/à
venir comme le championnat : hors saison, la notion de "dernière journée" n'a
pas de sens ici), sans limite d'affichage. Extensions ajoutées à `MatchesStrip`
pour ce cas d'usage, sans régression sur l'existant : `title` (remplace
"Résultats"/"Prochains matchs" par un libellé libre, ex: "Warm Up"),
`disableLink` (rend un encart sans lien — un club hors DB n'a pas de page
`/clubs/[id]` ; prop booléenne et non une fonction, `MatchesStrip` est un
Client Component et une fonction passée depuis une page serveur ne serait pas
sérialisable à travers la frontière RSC), `showDate` (affiche la date+heure du
match au-dessus des logos, sans changer leur taille — utile ici car les matchs
d'une même liste n'ont pas tous la même date, contrairement au championnat où
le range de dates de la journée est déjà dans l'en-tête), score affiché **par
match** selon qu'il est renseigné ou non (`homeScore !== null`) plutôt que
selon `variant` (rétrocompatible : côté championnat, "résultats" a toujours un
score et "prochains matchs" jamais). `ClubLogo` accepte aussi un `title`
optionnel (info-bulle au survol, ex: "Ivry (Proligue)", "Tatabanya (1ère
division hongroise)") — sans effet sur les autres usages du composant (absent
partout ailleurs). Bloc masqué entièrement si aucun match Warm Up — pas de
section vide à afficher le reste de l'année, cette compétition n'existe qu'en
pré-saison (~1 mois/an).

**Pas de stats joueurs pour les Warm Up (vérifié, pas juste supposé)** :
`sync-warmup` tourne chaque matin (`cron-daily.yml`, 06:00 UTC) et récupère
bien les scores dès qu'un match est joué (re-scrape complet + upsert à chaque
passage). En revanche, LNH ne publie **aucune statistique joueur** pour cette
compétition — testé en direct sur un match Warm Up déjà joué la saison passée
(Rhein-Neckar Löwen 26-28 Paris) : la page boxscore de lnh.fr
(`contents_action=view_tab_stats`) renvoie littéralement "Aucun joueur" /
"Aucune statistique". Contrairement au championnat, où cette même page est
alimentée normalement. Rien à développer ici — la donnée n'existe pas côté
LNH, pas une limite de notre pipeline.

**Piège layout mobile corrigé au passage** (remonté par l'utilisateur via
capture d'écran) : le conteneur `Résultats`/`Prochains matchs`
(`src/app/[locale]/page.tsx`) utilisait `grid grid-cols-2 gap-3 lg:grid-cols-1`
— comportement inversé de ce qu'on veut : côte à côte (2 colonnes, chacune à
moitié de la largeur) sur petit écran, empilé (1 colonne, pleine largeur)
seulement à partir de `lg`. Sur mobile, ça écrasait les logos des encarts
`MatchesStrip` dans une largeur deux fois trop étroite. Remplacé par
`flex flex-col gap-3` (toujours empilé, quelle que soit la taille d'écran) —
le bloc Warm Up, déjà positionné après ce conteneur, en profite aussi
(pleine largeur sur mobile comme sur desktop).

### 19.1 Page club : calendrier unifié résultats+à venir, code couleur, légende

Extension de `ClubMatchesPanel`/`ClubMatchesCalendar` (2026-08-02, demande
explicite) : les résultats utilisent désormais le même gabarit "grille de
logos" que les prochains matchs (`MatchesGrid`, remplace l'ancien rendu en
liste `MatchRow`), le calendrier mensuel affiche résultats ET matchs à venir
(plus seulement à venir), et chaque encart/case est teinté par résultat —
victoire (`points-pos`, vert), défaite (`points-neg`, rouge), nul
(`accent-secondary`, ambre), à venir (`accent`, teal neutre, comportement
historique). Chaque match porte aussi un badge court de nomenclature par
compétition (`J{n}` localisé pour Starligue via `list.gameweekShort`, `WU`
Warm Up, `CDF` Coupe de France, `CL` EHF Champions League — voir §19.2),
expliqué par une légende (`MatchesLegend`) affichée une fois au-dessus des
trois blocs. `UnifiedMatch` (`ClubMatchesPanel.tsx`) est exporté et réutilisé
tel quel par `ClubMatchesCalendar` — seule source de vérité pour la couleur/le
badge, pas de logique dupliquée entre grille et calendrier.

**Cases à cocher et légende filtrées par pertinence** (2026-08-02, demande
explicite) : un club ne joue jamais Champions League ET European League la
même saison (compétitions mutuellement exclusives) — les cases à cocher de
compétition ET les entrées de légende n'affichent désormais que les
compétitions où CE club a effectivement au moins un match (résultat ou à
venir), Starligue mise à part (toujours affichée). Générique sur les 5
`CompetitionKind` plutôt que spécifique à Champions/European League :
s'applique aussi à Warm Up/Coupe de France si un club n'y participe pas.
`kindsWithMatches` (calculé une fois dans `ClubMatchesPanel`, dérivé de
`allResults`/`allUpcoming` avant filtrage par cases cochées) est la source de
vérité partagée entre `competitionCheckboxes` et `MatchesLegend`.

### 19.2 Coupes d'Europe EHF (Champions League + European League)

EHF Champions League ajoutée le 2026-08-02, EHF European League ajoutée le
même jour en suivant (demande explicite : "comportement similaire à celui de
la Champion's League"), sur le même principe que Warm Up/Coupe de France
(même table `FriendlyMatch`, même pipeline `syncFriendlyMatches`). Une seule
implémentation générique (`fetchEhfCompetitionMatches`,
`src/lib/data-providers/ehf-scraper.provider.ts`) sert les deux coupes — même
site (`ehfcl.`/`ehfel.eurohandball.com`), même API, même gabarit de page.
Clubs Starligue engagés à ce jour : Champions League — HBC Nantes,
Montpellier Handball, Paris Saint-Germain (phase de groupes du 09/09 au
29/10/2026, 6 matchs chacun) ; European League — page saison 2026/27 pas
encore publiée par EHF au moment d'écrire ce code (voir plus bas), dernière
édition connue (2025/26) : Fenix Toulouse, Montpellier Handball, Saint-Raphaël
Var Handball.

**Source** : contrairement à lnh.fr (HTML scrapé), les deux sites EHF
exposent une vraie API JSON (endpoint Umbraco `competitionmatchesapi`,
découvert par inspection réseau) — pas de parsing HTML pour les matchs
eux-mêmes, validation Zod du payload comme `ApiSportsProvider`.

**`contentId`/`competitionId` découverts dynamiquement, pas codés en dur** :
ces identifiants Umbraco (opaques, propres à chaque édition annuelle) sont
extraits par regex depuis le HTML de la page saison
(`data-currentcontentid="…"`/`data-competition-id="…"`, présents dans le HTML
servi côté serveur, pas seulement après hydratation Vue — vérifié le
2026-08-02 sur les deux sites). Un premier jet les avait figés en constantes
pour la Champions League ; corrigé avant commit en généralisant à la
découverte dynamique, précisément à cause de l'European League : sa page
2026/27 (`https://ehfel.eurohandball.com/men/2026-27/matches/`) **n'existe pas
encore** (404, confirmé par l'utilisateur ET vérifié directement) — avec des
IDs codés en dur, il aurait fallu attendre la publication puis modifier le
code. Avec la découverte dynamique, le cron déployé aujourd'hui commencera à
fonctionner tout seul dès qu'EHF publiera la page, sans changement : en
attendant, `fetchText` lève une `IngestionError` récupérable sur 404, le cron
échoue proprement (job indépendant, ne bloque pas les autres) jusqu'à la
publication.

**Résolution du club Starligue par correspondance de nom, pas par table
figée** : l'API EHF n'expose aucun identifiant partagé avec lnh.fr. Un
premier jet utilisait une table figée par compétition (3 clubs Champions
League codés en dur) — remplacée avant commit par `resolveClubSlug`,
générique et réutilisable pour n'importe quelle compétition/club futur :
noms normalisés (accents retirés, mots de bruit "handball"/"hand"/"hb"/"hc"/
"hbc"/"club" retirés des deux côtés), comparaison stricte après
normalisation (pas de sous-chaîne floue, pour éviter tout faux positif — un
club non reconnu reste simplement traité comme hors DB). Vérifié
empiriquement le 2026-08-02 sur les vrais noms EHF malgré des écarts de forme
(ex: EHF dit "Paris Saint-Germain", notre DB "Paris Saint-Germain Handball" ;
EHF dit "Saint-Raphael Var Handball" sans accent, notre DB "Saint-Raphaël Var
Handball") : tous les clubs Starligue connus des deux compétitions matchent
correctement. `getActiveClubSlugsAndNames`
(`src/lib/clubs/get-active-club-slugs.ts`) fournit la liste slug+nom des
clubs actifs à `syncChampionsLeagueMatches`/`syncEuropeanLeagueMatches`.

**Pagination** : la sémantique du curseur (`matchId` + `futureMatches=true/
false`) n'est documentée nulle part côté EHF et ne suit ni l'ordre
chronologique ni l'ordre du tableau retourné (vérifié empiriquement). Plutôt
que de deviner un algorithme fragile, `fetchAllMatches` explore en largeur
(flood-fill) : chaque `matchId` découvert est à son tour essayé comme curseur,
dans les deux sens (`true` ET `false` — un match déjà joué peut sortir du pool
"à venir" et devenir injoignable en pagination purement future). ~2 requêtes
par match (~300 pour une saison complète de phase de groupes), acceptable
pour un cron quotidien. Vérifié le 2026-08-02 sur EHF CL 2026/27 : 144 matchs
découverts pour 144 matchs réellement publiés (convergence confirmée par
comptage exhaustif), 18 impliquant un club Starligue ; sur EHF EL 2025/26
(dernière édition publiée, utilisée pour valider le mécanisme avant que
2026/27 existe) : 172 matchs découverts, 9 impliquant un club Starligue (3
clubs × ~3 matchs déjà joués/à jouer à cette date de la saison passée).

**Logos backfillés localement, comme Warm Up (pas de hotlink)** : un premier
jet hotlinkait directement le CDN EHF (`res.ehf.eu`), stable en apparence —
revenu en arrière le 2026-08-02 à la demande de l'utilisateur, pour les mêmes
garanties de disponibilité que Warm Up plutôt que de dépendre d'un CDN tiers
(cohérent avec "aucun logo hotlinké" déjà appliqué partout ailleurs dans le
projet, y compris les clubs Starligue eux-mêmes). `scripts/backfill-ehf-logos.ts`
(nouveau, même principe que `scripts/backfill-warmup-logos.ts` : re-scrape
l'API EHF lui-même plutôt que de lire `FriendlyMatch`, dont les URLs de logo
ne sont plus conservées une fois résolues en chemin local) télécharge vers le
même dossier partagé `public/clubs/warmup/` — un club hors DB a le même logo
quelle que soit la compétition.

**Piège trouvé et corrigé : l'API matchs (`logoBig`/`logoSmall`) est
incomplète, la page "clubs" de la saison ne l'est pas** — signalé par
l'utilisateur ("je n'ai pas les logos des clubs de EHF CL"), vérifié : 5 des 9
adversaires EHF CL 2026/27 de nos clubs (Aalborg Håndbold, Barça, HC Vardar
1961, Orlen Wisla Plock, RK Celje Pivovarna Laško) n'ont AUCUN logo sur AUCUN
de leurs matchs côté API `competitionmatchesapi`, alors qu'EHF les affiche
bien sur `/men/{saison}/clubs/` (page distincte de `/men/{saison}/matches/`,
listant tous les clubs de la compétition avec logo). Cette page est elle
aussi servie en HTML brut sans JS (même famille de découverte que
`data-currentcontentid`) — `parseClubLogosFromHtml`
(`src/lib/data-providers/ehf-scraper.provider.ts`, testée) extrait chaque
`<a class="tg-item">` (nom dans `<span class="tg-name">`, logo dans
`data-src`, entités HTML hex/décimales/nommées à décoder). `scripts/
backfill-ehf-logos.ts` l'utilise en source primaire (par nom d'équipe,
`fetchChampionsLeagueClubLogos`/`fetchEuropeanLeagueClubLogos`), l'URL de
l'API matchs ne servant plus que de repli si un club apparaît en match mais
pas sur la page clubs. Les 9 adversaires ont désormais un logo (0 restant en
initiales) — un club sans AUCUNE des deux sources retomberait quand même sur
les initiales (`ClubLogo`), comme un adversaire Warm Up jamais backfillé,
comportement attendu si jamais rencontré, pas une erreur.
**Piège rencontré et abandonné en cours de route** : le hotlink direct avait
d'abord fait planter `ClubLogo` (`next/image` exige une liste blanche
statique de domaines dans `next.config.mjs`, `<img>` classique utilisé en
contournement le temps du premier jet, cf. même astuce que `PlayerAvatar`
pour les photos joueurs) — non pertinent une fois le hotlink abandonné, mais
le contournement `<img>` reste en place dans `ClubLogo` par prudence (défense
en profondeur si jamais un logo hotlinké venait à réapparaître).

**Piège trouvé et corrigé : même la page "clubs" EHF sert des logos à fond
blanc opaque pour plusieurs clubs** — signalé par l'utilisateur ("il y a du
blanc autour, ce n'est pas consistant"), vérifié visuellement sur les 9
logos : 6 avaient un fond blanc plein (Dinamo Bucuresti, HC Zagreb, MT
Melsungen, HC Vardar 1961, Orlen Wisla Plock, RK Celje Pivovarna Laško —
certains même servis en JPEG, format sans transparence possible), contre 3
correctement transparents (SAH-Aarhus, Aalborg Håndbold, Barça). Aucune
source EHF (ni API matchs, ni page clubs) n'a de version transparente pour
ces 6 clubs — remplacés à la main par de meilleures sources : Wikipedia/
Wikimedia Commons pour 5 (recherche par nom de club, vérification de la
transparence réelle des coins avant retenue — plusieurs résultats Wikipedia
avaient eux aussi un fond blanc opaque malgré un format PNG, ex: le premier
essai pour HC Zagreb), SVG du site officiel `rk-zagreb.hr` rastérisé en PNG
transparent pour HC Zagreb (aucune version transparente trouvée sur
Wikipedia). `scripts/backfill-ehf-logos.ts` ne re-télécharge jamais un
fichier déjà présent (`existsSync`) : ces 6 remplacements manuels sont donc
protégés indéfiniment contre un futur run automatique du script — voir le
commentaire du script pour la marche à suivre si l'un de ces clubs
disparaissait puis réapparaissait un jour (calendrier).

**Ingestion** : `syncChampionsLeagueMatches`/`syncEuropeanLeagueMatches`
(`src/lib/ingestion/warmup.ts`) — `syncFriendlyMatches` accepte désormais un
paramètre `source: "lnh" | "ehf"` qui ne bascule plus que la résolution de
DIVISION (locale+dérivée du HTML pour lnh, code nation direct pour ehf) et le
préfixe de `dedupeKey` (`"ehf:" + matchId`, au lieu de `"lnh:" +
calendars_id`) — la résolution de LOGO est désormais identique pour les deux
sources (`resolveLocalWarmupLogoUrl`, voir plus haut). `FriendlyMatch.source`
gagne la valeur `EHF_SCRAPER` (migration `20260802120000_add_ehf_scraper_source`).

**Cron** : `POST /api/cron/sync-champions-league` et `POST /api/cron/
sync-european-league`, planifiés dans `cron-daily.yml` (06:00 UTC, jobs
indépendants). `backfill-warmup-logos` en dépend désormais aussi (en plus de
`sync-warmup`/`sync-coupe-de-france`) avec `if: ${{ !cancelled() }}` : tourne
même si `sync-european-league` échoue (cas attendu tant qu'EHF n'a pas publié
la page), le comportement par défaut de GitHub Actions (skip si une
dépendance échoue) aurait sinon empêché tout backfill de tourner — y compris
Warm Up/Coupe de France, sans rapport avec l'échec EHF.

**Affichage** : `get{ChampionsLeague,EuropeanLeague}Matches`/
`getClub{ChampionsLeague,EuropeanLeague}Matches`
(`src/lib/matches/get-warmup-matches.ts`), même traitement que Warm Up/Coupe
de France sur la home (`MatchesStrip`, bloc masqué si aucun match) et sur la
page club (`ClubMatchesPanel`, §19.1) — nomenclature `CL`/`EL`.

### 19.3 Page club : changer de club depuis le logo

Ajouté le 2026-08-02 (demande explicite) : le logo du club en en-tête de
`/clubs/[id]` est cliquable et ouvre un menu déroulant listant les clubs
Starligue actifs (`getActiveClubs`, déjà utilisé pour la bande de logos de la
home) pour naviguer directement vers un autre club sans repasser par le
dashboard. `ClubSwitcher` (`src/components/clubs/ClubSwitcher.tsx`) reprend
telle quelle la mécanique clic-dehors/Échap de `LocaleSwitcher`
(`src/components/LocaleSwitcher.tsx`, seul autre menu déroulant du projet) —
`pointerdown` hors du conteneur ou touche Échap ferme le menu, `role="listbox"`/
`role="option"` pour l'accessibilité. Le club courant reste dans la liste
(mis en évidence, teinte accent) plutôt qu'exclu — repère visuel "où je suis"
dans la liste alphabétique plutôt que de la raccourcir.

### 19.4 Page groupe EHF Champions League/European League

Ajouté le 2026-08-02 (demande explicite) : cliquer sur un match Champions
League/European League (page club, §19.1) mène vers
`/matches/ehf/[competition]/[group]` (`competition` = `champions-league` ou
`european-league`, mapping dans
`src/lib/matches/ehf-competition-slugs.ts`) — page listant l'intégralité des
matchs du groupe (les 4 équipes, y compris les confrontations n'impliquant
aucun club Starligue) et son classement calculé.

**Pas d'API de classement EHF dédiée** : reconnaissance effectuée sur
`https://ehfcl.eurohandball.com/men/2026-27/standings/#group-phase` — seule
une liste de matchs bruts (déjà consommée par `fetchEhfCompetitionMatches`)
est exposée, avec `comp.group.name` (`"A".."F"`). Le classement est donc
calculé nous-mêmes, `computeGroupStandings`
(`src/lib/matches/group-standings.ts`, fonction pure testée) — mêmes règles
que `computeClubStandings` (§ classement Starligue) mais keyed par NOM
d'équipe plutôt que clubId, la plupart des équipes d'un groupe EHF n'étant
pas des clubs Starligue connus de notre DB.

**Stockage** : `FriendlyMatch.groupLabel` (nullable, toujours null pour Warm
Up/Coupe de France) — `filterToRelevantGroups`
(`src/lib/data-providers/ehf-scraper.provider.ts`) élargit désormais
l'ingestion à TOUT le groupe dès qu'un club Starligue y joue (et pas
seulement aux matchs touchant ce club), pour que la page groupe puisse
afficher les 4 équipes sans appel EHF live à la demande — cohérent avec
l'architecture "cron → DB → lectures rapides" déjà en place.
`syncFriendlyMatches` (`src/lib/ingestion/warmup.ts`) autorise donc, pour la
seule source `"ehf"`, des lignes `FriendlyMatch` avec `homeClubId`/
`awayClubId` NULS DES DEUX CÔTÉS (nouveau cas — un match entre deux clubs
hors DB) ; `getGroupMatches` (`src/lib/matches/get-group-matches.ts`)
retombe sur le nom/logo scrapés dans ce cas, comme le fait déjà
`get-warmup-matches.ts` par club.

**Affichage** : tableau de classement (rang/J/V/N/D/BP/BC/Diff/Pts, réutilise
les libellés courts `dashboard.clubStandingsWidget.col.*` déjà utilisés par
le widget "Classement Starligue" plutôt que de les dupliquer) + grille des 12
matchs du groupe (score si joué, date sinon), logo/nom cliquables vers
`/clubs/[id]` seulement pour un club Starligue connu.

### 19.5 Saisie manuelle du résultat (admin)

Demande explicite du 2026-08-07 : lnh.fr publie souvent le score d'un match
Warm Up/Coupe de France/EHF plusieurs jours après qu'il a été joué (constaté
en direct : Tatabanya-Nantes du 06/08 toujours `SCHEDULED`/sans score en base
le lendemain, alors que le résultat était déjà public — repris par la presse
handball). Contrairement au championnat (`Match`),
ces compétitions n'ont **aucune stat joueur** (§19 "Pas de stats joueurs pour
les Warm Up") donc rien d'autre à saisir qu'un score — pas de risque
d'impacter le scoring fantasy, qui ne dépend jamais de `FriendlyMatch`.

**Page** : `/admin/friendly-matches` — liste les `FriendlyMatch` de la saison
active dont le coup d'envoi est passé (`GET /api/admin/friendly-matches`,
100 derniers), avec le score déjà pré-ouvert en édition pour ceux qui n'en
ont pas encore (`needsResult`). `PATCH /api/admin/friendly-matches/[id]`
saisit `{ status: FINISHED, homeScore, awayScore }` (ou `POSTPONED`/
`CANCELLED` sans score, pour un match qui ne sera de toute façon jamais
rejoué/n'a jamais eu lieu) et marque `FriendlyMatch.source = MANUAL`.
`DELETE /api/admin/friendly-matches/[id]` annule la saisie (remet
`SCHEDULED`/scores nuls, `source` recalculé depuis le préfixe de
`dedupeKey`, `"lnh:"` ou `"ehf:"`).

**Protection contre l'écrasement par le cron `sync-warmup`** (chaque matin,
§19) : `syncFriendlyMatches` (`src/lib/ingestion/warmup.ts`) charge d'abord
la `source` déjà en base pour chaque `dedupeKey` du batch scrapé. Si elle
vaut `MANUAL` **et** que lnh.fr n'a lui-même toujours pas de résultat
définitif (`status !== FINISHED` ou un des deux scores encore `null`), le
`kickoffAt`/`status`/`homeScore`/`awayScore`/`source` scrapés sont omis de
l'`update` Prisma — tout le reste (logos, division, `groupLabel`) continue
d'être rafraîchi normalement. Dès que lnh.fr publie enfin son propre résultat
définitif, la condition `keepManualOverride` devient fausse et le scraper
reprend la main pour de bon (`source` repasse à `LNH_SCRAPER`/
`EHF_SCRAPER`) — l'admin n'a jamais besoin de penser à annuler sa saisie
manuelle une fois que la source officielle a rattrapé son retard.

### 19.6 Correction de date et suppression de doublon (admin)

Demande explicite du 2026-08-27 : certains matchs restaient visiblement
"figés" (toujours `SCHEDULED`, coup d'envoi passé, jamais de score) sans que
la saisie manuelle de résultat (§19.5) soit la bonne réponse. Deux causes
racines distinctes trouvées en creusant les données prod :

1. **Doublon orphelin** : lnh.fr republie parfois un match sous un nouveau
   `calendars_id` (donc un nouveau `dedupeKey`) sans retirer l'ancien —
   `syncFriendlyMatches` upserte alors deux lignes `FriendlyMatch` pour la
   même rencontre réelle. L'une reçoit le vrai résultat, l'autre reste
   `SCHEDULED` sans score pour toujours (constaté : Chambéry–Wetzlar,
   14/08, deux lignes à 16h/18h, une seule avec un score).
2. **Bug de date figée** : avant ce fix, `kickoffAt` était réécrit
   inconditionnellement à chaque sync, **y compris** quand `source ===
   MANUAL` — une correction de date faite à la main dans l'admin se faisait
   donc systématiquement écraser par le cron du lendemain, avec la date
   scrapée (erronée) qui "revenait toute seule" sans raison apparente.
   Corrigé en déplaçant `kickoffAt` dans le même groupe protégé par
   `keepManualOverride` que `status`/`homeScore`/`awayScore` (voir §19.5).

**`/admin/friendly-matches` étendu** (au-delà de la saisie de résultat) :

- `GET /api/admin/friendly-matches` liste désormais **tous** les
  `FriendlyMatch` de la saison active (plus seulement ceux au coup d'envoi
  passé), jusqu'à 300 — sinon impossible de retrouver un match mal daté
  dans le futur pour le corriger. Toggle client "À traiter"/"Tous les
  matchs" (+ recherche par nom de club) pour naviguer la liste complète
  sans perdre la vue "à traiter" par défaut.
- `PATCH /api/admin/friendly-matches/[id]` accepte maintenant `kickoffAt`
  seul (indépendamment d'un changement de statut/score) — marque quand
  même `source = MANUAL` pour bénéficier de la protection anti-écrasement
  ci-dessus.
- `DELETE /api/admin/friendly-matches/[id]?hard=1` supprime **définitivement**
  la ligne (`prisma.friendlyMatch.delete`, différent du `DELETE` sans
  paramètre qui annule seulement une saisie manuelle et remet `SCHEDULED`) —
  pour un doublon orphelin comme le cas ci-dessus. ⚠️ Si lnh.fr liste encore
  l'ancien `calendars_id` au prochain sync (rare mais possible), la ligne
  supprimée réapparaît via le chemin `create` de l'upsert — pas une garantie
  absolue de suppression permanente si la source elle-même n'a pas
  vraiment abandonné cet identifiant.

## 20. Application mobile (iOS/Android)

### 20.1 Principe — shell Capacitor "live URL"

Le site étant server-rendered (Auth.js, Prisma, pas d'export statique), l'app
mobile ne réimplémente rien côté UI : Capacitor charge directement
`https://starliguefantasy.fr/fr` dans une WebView native
(`capacitor.config.ts`, `server.url`). Le `/fr` explicite évite le hop de
redirection de `localePrefix: "always"` (`src/i18n/routing.ts`).

Comme la WebView charge la vraie origine HTTPS (pas le pseudo-scheme
`capacitor://localhost` utilisé en mode "bundle statique embarqué"), les
cookies de session Auth.js (`Secure; SameSite=Lax`, défaut de `src/lib/auth.ts`,
stratégie JWT) fonctionnent sans configuration supplémentaire.

`ios/` et `android/` sont les projets natifs générés par `npx cap add`
(committés, avec leurs propres `.gitignore` pour les artefacts de build —
Pods/DerivedData/Gradle ne sont pas versionnés). Icônes et splash screens
sont générés depuis `assets/logo.png` (script `scripts/generate-app-icon.ts`,
même esprit visuel que `src/app/icon.tsx`) via
`npx @capacitor/assets generate --ios|--android --iconBackgroundColor
'#0E1116' ...` — toujours avec `--ios` ou `--android` explicite, sinon l'outil
génère aussi une piste PWA non désirée (`icons/`, `public/manifest.webmanifest`)
qu'il faudrait nettoyer.

⚠️ **Capacitor pinné en 7.x** (`@capacitor/core`/`cli`/`ios`/`android` = `7.6.8`,
plugins `app`/`push-notifications`/`splash-screen` en `7.x` correspondants) —
délibéré, ne pas "corriger" vers le tag `latest` (8.5.0 au 2026-08-05). La
ligne 8.x publiée comme `latest` est en avance sur ses propres plugins
officiels : `@capacitor/push-notifications@8.1.2` et `@capacitor/status-bar@8.0.3`
référencent une API Swift (`CAPPluginCall.reject`, `CAPBridgeProtocol.webView`,
`PluginConfig.getString/getArray`) absente de **toutes** les versions
publiées de `@capacitor/core` 8.x testées (8.0.0/8.1.0/8.5.0) — bug amont, pas
un problème de version chez nous. `@capacitor/status-bar` a été abandonné
entièrement (cosmétique, pas de version 7.x ni 8.x qui compile) ; `SceneDelegate.swift`
et `AppDelegate.swift` (`ios/App/App/`) ont aussi été retouchés à la main pour
matcher le template natif de la ligne 7.x (`SceneDelegateProxy` n'existe pas
en 7.x ; le pont token push `didRegisterForRemoteNotificationsWithDeviceToken`
→ `NotificationCenter` a dû être ajouté manuellement, absent du template).
Revoir ce pin quand `@capacitor/push-notifications` publie une version dont
le peer dep matche vraiment `core@latest`.

Bundle ID / package name (identique iOS/Android, quasi impossible à changer
après publication) : `fr.starliguefantasy.app`.

Checklist des étapes manuelles (comptes développeur, Firebase, Xcode/Android
Studio, soumission stores) : `docs/mobile-app.md`.

### 20.2 Notifications push

Motivation principale de l'app mobile (avec la visibilité stores) : rappeler
les deadlines avant qu'elles ne verrouillent l'alignement ou les pronostics.

⚠️ **Backend d'envoi séparé par plateforme**, pas un seul FCM unifié comme
prévu initialement — `@capacitor/push-notifications` restitue côté iOS le
token **APNs brut** (pas un jeton FCM), donc ni l'outil de test de la console
Firebase ni `firebase-admin` (`sendEachForMulticast`) ne peuvent l'utiliser
tel quel : il aurait fallu ajouter le SDK Firebase natif (FirebaseMessaging)
au projet Xcode pour convertir ce token APNs en jeton FCM. Plus simple et
plus robuste, découvert en déboguant un premier test qui n'arrivait jamais
(2026-08-05) : envoyer **directement à APNs** depuis le serveur pour iOS,
`firebase-admin`/FCM reste utilisé pour Android (qui, lui, restitue bien un
vrai jeton FCM nativement).

- `PushToken` (Prisma) — un token par device (APNs brut sur iOS, FCM sur
  Android — `platform` distingue), upserté par valeur unique (`token`),
  jamais de `create()` nu (règle ingestion idempotente).
- `POST /api/push-tokens` — enregistre/rafraîchit le token du device courant
  (session requise) ; `DELETE` au logout.
- `src/lib/push/register-push.ts` — no-op si
  `!Capacitor.isNativePlatform()` (donc totalement invisible sur le web),
  monté depuis `src/components/Providers.tsx`.
- `src/lib/push/send-apns-client.ts` — client APNs "maison" (HTTP/2 natif de
  Node + JWT ES256 signé avec la clé `.p8`, aucune dépendance npm
  supplémentaire), lit `APNS_AUTH_KEY`/`APNS_KEY_ID`/`APNS_TEAM_ID`. JWT mis
  en cache (valide ~1h côté Apple).
- `src/lib/push/send-push-client.ts` — orchestre les deux : Android via
  `firebase-admin` (paresseux, pattern `src/lib/email/resend-client.ts`, lit
  `FIREBASE_SERVICE_ACCOUNT_JSON`), iOS via `send-apns-client.ts`.
  ⚠️ **`APNS_PRODUCTION` est une bascule globale, pas par token** — tant que
  l'app n'est distribuée que via Xcode debug (environnement APNs Sandbox),
  la laisser à `false` (ou absente). La passer à `true` une fois en
  TestFlight/App Store (Sandbox et Production utilisent des clés `.p8`
  différentes, générées séparément sur Apple Developer — voir
  `docs/mobile-app.md`). Si un jour testeurs Xcode et utilisateurs
  TestFlight/App Store coexistent, il faudra un champ `PushToken.environment`
  pour router par token plutôt que globalement — pas encore le cas.
- `src/lib/notifications/deadline-reminders.ts` — logique métier pure
  (règle CLAUDE.md), sélectionne les `userId` à relancer : alignement non
  validé/sans capitaine avant `Gameweek.deadlineAt`, pronostic manquant avant
  `Match.kickoffAt`. Testée en vitest, indépendante de Prisma/FCM.
- `GameConfig["NOTIFICATION_LEAD_MINUTES"]` — délai avant deadline auquel la
  relance part (pattern `parseOddsConfig`, `src/lib/predictions/odds.ts`).
- `GET /api/cron/notify-deadlines` — auth `verifyCronAuth`
  (`src/lib/cron-auth.ts`), appelé toutes les 15 min par
  `.github/workflows/cron-notifications.yml` (même pattern que
  `cron-daily.yml`/`cron-results.yml`). Idempotence via `NotificationLog`
  (`dedupeKey` unique, ex. `"lineup-deadline:{gameweekId}:{userId}"`) — sans
  ça un run de cron qui chevauche la fenêtre de rappel renotifierait tout le
  monde.

## 21. Modération du chat de ligue

Ajouté le 2026-08-05 en préparation de la soumission App Store : la
guideline de review 1.2 (apps avec communication entre utilisateurs) exige
au minimum un moyen de signaler un contenu abusif et de bloquer un
utilisateur, en plus d'un contact publié (déjà en place,
`contact@starliguefantasy.fr`, `/confidentialite`).

- `ChatMessageReport` (Prisma) — un signalement par `(messageId, reportedBy)`
  (contrainte unique, upsert idempotent). Pas de dashboard admin dédié en
  v1 : consultable directement en base par l'admin en attendant un volume
  qui le justifie.
- `BlockedUser` — bloque au niveau du **compte**, pas d'une ligue en
  particulier (`blockerId`/`blockedId`, unique) : un utilisateur bloqué
  voit ses messages masqués dans tous les chats de ligue partagés avec le
  bloqueur.
- `POST /api/leagues/[id]/chat/[messageId]/report` — signale un message.
- `POST /api/blocked-users` (`{ userId }`) / `DELETE /api/blocked-users/[userId]`
  — bloquer/débloquer (pas de garde-fou "impossible de bloquer soi-même"
  nécessaire côté UI : le bouton n'apparaît jamais sur ses propres messages
  dans `LeagueChat.tsx`, mais l'API le refuse quand même si appelée
  directement, `CANNOT_BLOCK_SELF`).
- `GET /api/leagues/[id]/chat` exclut désormais les messages des
  utilisateurs bloqués par le viewer (`userId: { notIn: blockedIds }`).
- `LeagueChat.tsx` — petit menu "⋯" sur les messages des autres (jamais sur
  les siens), avec confirmation à deux étapes pour bloquer (pattern déjà
  utilisé pour quitter/supprimer une ligue, `LeagueDetailActions.tsx`) mais
  signalement direct sans confirmation (action réversible en impact,
  n'affecte que soi).

---

> **Numérotation** — le §22 (« Reel Instagram programme de la journée ») vit
> pour l'instant sur la branche `reel-programme-journee` non encore fusionnée ;
> cette section est numérotée §23 pour ne pas entrer en collision à la fusion.

## 23. « D'où viennent les managers » (club d'origine)

Conçu le 2026-08-30 (recon de `monclub.ffhandball.fr` faite le même jour, voir
plus bas). Chaque membre peut renseigner **le club de handball d'où il vient /
où il joue** — un club amateur licencié, **pas** un club de Starligue qu'il
supporterait. Objectif : animer la communauté et **mettre en avant d'autres
clubs** que l'élite.

### 23.1 Principe & décisions

| Décision | Choix | Raison |
|---|---|---|
| Nature du champ | Un seul : `User.homeClubId` (+ pays porté par `HandballClub`) | L'utilisateur veut « d'où ils viennent », pas « qui ils supportent ». Indépendant de `favoritePlayerId`, qui reste inchangé. |
| Modifiable | **Oui, librement**, sur `/account` | Donnée factuelle : on change de club, on déménage. Pas un choix d'attachement verrouillé comme le joueur préféré (§6.4 / `FAVORITE_PLAYER_LOCKED`). |
| Périmètre données | France exhaustive via l'annuaire FFHandball ; **saisie libre** pour tout le reste du monde | Aucun jeu de données mondial propre n'existe. FFHandball couvre la quasi‑totalité des membres actuels. |
| Club hors annuaire | Crée quand même un `HandballClub` **non vérifié** (`verified=false`, `source=MANUAL`), rattaché à l'utilisateur | Ne bloque personne ; l'admin normalise / fusionne ensuite. |
| Visibilité | Clubs **vérifiés** → agrégats (widgets dashboard : carte + classement clubs). Clubs **non vérifiés** → visibles seulement sur le profil du membre et dans ses ligues, jamais dans un agrégat | Évite qu'une saisie fantaisiste apparaisse dans un agrégat. |
| Obligatoire | Non, jamais bloquant (comme `favoritePlayerId`, §8.3) | Cohérent avec le parcours d'inscription. |

**Découpage livraison :**
- **Lot 1 (v1) — FAIT** (branche `feat/home-club`, non déployé) : §23.2 → §23.6
  + §23.7 « v1 » + §23.8/9/10.
- **Lot 2 — FAIT** : carte + classement des clubs, deux widgets du dashboard
  `/dashboard` (§23.7). Historique : carte livrée d'abord en bande sur la page
  d'accueil ; déplacée dans le dashboard le 2026-08-30 (+ classement des clubs,
  + survol = noms de clubs) ; 2026-08-31 : géocodage d'une ville saisie librement
  (annuaire GeoNames embarqué, `/api/geo/cities`) + **vue monde auto-cadrée** dès
  qu'un club est hors métropole.
- **Lot 3** (option, à faire) : « club à l'honneur » hebdo (§23.7).

### 23.2 Modèle de données (Prisma)

```prisma
enum HandballClubSource {
  FFHANDBALL   // importé de monclub.ffhandball.fr
  MANUAL       // saisi par un membre (free text) ou par l'admin
  OSM          // réservé — enrichissement OpenStreetMap plus tard
}

/// Annuaire des clubs de handball, tous pays. DISTINCT du modèle `Club` (§5),
/// qui ne contient que les 16 clubs Daikin StarLigue et dont dépend tout le
/// pipeline lnh.fr — ne jamais mélanger les deux. Alimenté par
/// scripts/run-ffhandball-clubs-import.ts (§23.4).
model HandballClub {
  id          String             @id @default(cuid())
  /// { "ffhandball": "6249056", "ffhandball_hash": "f775..." }. Le nº d'affiliation
  /// FFHandball vient du champ `email_club` de la fiche (ex "6249056@ffhandball.net").
  externalIds Json               @default("{}")
  name        String
  slug        String             @unique          // slug monclub.ffhandball.fr, sinon slugifié
  country     String             @default("FR")   // ISO 3166-1 alpha-2
  city        String?
  zipcode     String?
  latitude    Float?
  longitude   Float?
  website     String?
  logoUrl     String?
  source      HandballClubSource @default(FFHANDBALL)
  verified    Boolean            @default(true)   // false = saisie membre pas encore validée
  createdAt   DateTime           @default(now())
  updatedAt   DateTime           @updatedAt
  members     User[]             @relation("HomeClub")

  @@index([country, verified])
  @@index([name])
}
```

```prisma
model User {
  // … existant …
  homeClubId String?
  homeClub   HandballClub? @relation("HomeClub", fields: [homeClubId], references: [id])
}
```

- Migration **additive**, colonne nullable → **aucun backfill**.
- Suppression de compte (`DELETE /api/account`, §6.4) : ajouter `homeClubId: null`
  au scrub final de la ligne `User`.
- Dédoublonnage : clubs FR sur `externalIds.ffhandball` ; clubs étrangers /
  manuels sur `(name, country, city)` normalisés (trim, espaces collapsés, casse
  et accents ignorés).
- On **ne supprime jamais** un `HandballClub` disparu de l'annuaire (un membre
  peut y être lié). `syncFfhandballClubs` ne fait qu'`upsert`.

### 23.3 Annuaire FFHandball : provider + ingestion

Règle §3.2 : toute donnée externe passe par `src/lib/data-providers`, parsing
Zod, upsert idempotent par `externalIds`.

**Recon `monclub.ffhandball.fr` (2026-08-30) — ce qui a été établi :**
- Pas d'API REST publique pour les clubs (`/wp-json/wp/v2/smartfire-clubs` → 404 ;
  namespace `smartfire-blocks/v1` sans sous-routes exposées). La carte d'accueil
  du site charge ses données depuis un bundle JS, pas d'XHR exploitable.
- **Liste complète** = sitemaps XML : `/sitemap.xml` (index) référence
  `smartfire-clubs-sitemap.xml`, `-sitemap2.xml`, `-sitemap3.xml` — **~2 305
  clubs** au total, URLs `https://monclub.ffhandball.fr/clubs/<slug>/`.
- **Données par club** : chaque fiche est rendue côté serveur (un simple `fetch`
  suffit, pas de headless) et embarque un blob JSON dans un attribut HTML
  `attributes="{…}"` du bloc smartfire, **encodé en entités HTML** (`&quot;`
  etc.). Après décodage + `JSON.parse` : `.post.post_title` = nom en clair,
  `.post.post_name` = slug, `.post.acf.{address_club, address_club_2,
  zipcode_club, city_club, latitude_club, longitude_club, url_club, email_club,
  facebook_club, instagram_club, club_hash, nb_licence_*, labels}`.
- **ID stable** : le nombre dans `email_club` (ex. `6249056@ffhandball.net`) =
  numéro d'affiliation FFHandball du club. Repli : `club_hash` (md5).

**`src/lib/data-providers/ffhandball-clubs.provider.ts`**

```ts
export interface ExternalHandballClub {
  ffhandballId: string | null;   // nº d'affiliation (depuis email_club), null si absent
  ffhandballHash: string;        // acf.club_hash
  name: string;                  // post.post_title
  slug: string;                  // post.post_name
  address: string | null;
  zipcode: string | null;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
  website: string | null;
  facebook: string | null;
  instagram: string | null;
}

export interface FfhandballClubsProvider {
  name: "ffhandball-monclub";
  fetchClubSlugs(): Promise<string[]>;                        // parse les 3 sitemaps
  fetchClub(slug: string): Promise<ExternalHandballClub | null>; // fiche → blob JSON
}
```

- `fetchClub` isole l'attribut `attributes="…"` qui contient
  `&quot;club_hash&quot;`, décode les entités HTML (réutiliser / étendre le
  helper `src/lib/news/html-to-text.ts`), `JSON.parse`, lit les champs ci-dessus.
- `User-Agent: "Mozilla/5.0 (compatible; StarligueFantasyBot/1.0)"`,
  `AbortSignal.timeout(15000)`, pool de concurrence maison (4 en parallèle, pas
  de dépendance `p-limit`) + petite pause. ~2 300 pages ≈ 8-12 min.
- Schéma **Zod** sur le blob décodé (donnée non fiable par nature). Échec
  réseau / HTTP → `IngestionError(msg, source, recoverable=true)` (classe
  existante, `lnh-scraper.provider.ts`).

**`src/lib/ingestion/handball-clubs.ts`**

```ts
export async function syncFfhandballClubs(opts?: { limit?: number }): Promise<{
  scanned: number; created: number; updated: number; failed: number;
  failures: { slug: string; reason: string }[];
}>
```

- Pour chaque slug : `fetchClub` → `prisma.handballClub.upsert` par
  `externalIds.ffhandball` (ou `slug` si nº absent). **Jamais de `create` nu.**
- Mappe `source: FFHANDBALL`, `verified: true`, `country: "FR"`.
- `Promise.allSettled` par lot : l'échec d'une fiche n'interrompt pas le run.
- Ne repasse pas `verified`/`source` d'un club déjà `MANUAL` que l'admin aurait
  promu et qui se retrouverait dans l'annuaire.

### 23.4 Script & cron

**Seed initial (manuel, one-shot) — `scripts/run-ffhandball-clubs-import.ts`.**
Tourne sur la base **prod Railway** (voir la procédure `railway variables` +
`sslmode=require`, cf. §10). Modèle : `scripts/run-lnh-roster-import.ts`. Affiche
le résumé `created / updated / failed`.

**Refresh récurrent — nouveau `.github/workflows/cron-monthly.yml`
(`0 4 1 * *`, + `workflow_dispatch`).**
- Un job `sync-handball-clubs` qui **exécute le script directement sur le runner
  CI** (`pnpm tsx scripts/run-ffhandball-clubs-import.ts`,
  `DATABASE_URL: secrets.PROD_DATABASE_URL`) — **pas** une route `/api/cron/*` :
  2 300 fetch séquencés dépasseraient le timeout serverless. Même précédent que
  le job `backfill-warmup-logos` de `cron-daily.yml`.
- **Pas** ajouté à `cron-daily.yml` : un annuaire de clubs bouge lentement, le
  quotidien serait du gâchis (cf. le principe déjà retenu : un cron générique
  n'est pas une spec, on ne le remplit pas avec tout ce que la doc mentionne).

### 23.5 API

**`GET /api/handball-clubs?q=<str>&country=<ISO2>&limit=10`** — public (comme
`/api/players`, §6.2), hors `PROTECTED_PREFIXES`, cache court.
Recherche **côté serveur** (~2 300+ lignes, trop pour un chargement client façon
`PlayerSearch`) : `country = ? AND verified = true AND name ILIKE ?` (accents
ignorés), tri `(city IS NULL), name`, `LIMIT`.
Réponse `{ data: { clubs: [{ id, name, city, zipcode, country }] } }`.

**`GET /api/geo/cities?q=<str>&country=<ISO2>&limit=8`** — public, même profil.
Autocomplétion de **ville** pour géolocaliser un club saisi librement : snapshot
GeoNames `cities15000` embarqué (`src/lib/geo/cities.ts` + `data/world-cities.tsv.gz`,
~34 k villes, régénérable via `scripts/build-world-cities.ts`). Recherche préfixe
puis sous-chaîne, accents ignorés, ordre = population décroissante.
Réponse `{ data: { cities: [{ name, admin1, country, latitude, longitude }] } }`.

**`PUT /api/account`** (§6.4) — étendre le schéma Zod existant :

```ts
homeClub: z.union([
  z.object({ clubId: z.string().min(1) }),
  z.object({ newClub: z.object({
    name: z.string().trim().min(2).max(120),
    country: z.enum(COUNTRY_CODES),          // src/lib/geo/countries.ts
    city: z.string().trim().max(120).optional(),
    latitude: z.number().min(-90).max(90).optional(),   // ville choisie dans
    longitude: z.number().min(-180).max(180).optional(),// l'autocomplétion
  }) }),
  z.null(),                                   // retire le club
]).optional()
```

- `clubId` → vérifié en base.
- `newClub` → `findFirst` insensible casse/accents sur `(name, country, city)` ;
  si absent, `create` `HandballClub { source: MANUAL, verified: false }`, puis
  lie. **Pas de verrou** : contrairement au joueur préféré, on autorise autant de
  changements que voulu.
- **Coordonnées** : celles de la ville choisie dans l'autocomplétion, sinon
  géocodage local (`geocodeCity`, `src/lib/geo/cities.ts`) depuis le nom de ville
  saisi. Un club sans coordonnées reste « non localisé » (compté, pas sur la
  carte). Un club existant sans coords est complété au passage.
- `GET /api/account` renvoie en plus `homeClub { id, name, city, country,
  verified }`.

**`POST /api/auth/register`** (§6.1) — même clé `homeClub?` (même union), résolue
après la création du `User`, **jamais bloquante** : un `newClub` invalide est
ignoré silencieusement (on ne renvoie pas 422, à la différence de
`favoritePlayerId` — le champ est facultatif par principe).

**Admin — `src/app/[locale]/(admin)/admin/handball-clubs/`**
- `GET /api/admin/handball-clubs?filter=unverified` : liste les clubs `MANUAL`
  `verified=false` + nombre de membres rattachés.
- `PATCH /api/admin/handball-clubs/[id]` : `{ action: "verify" }` ou
  `{ action: "merge", intoId }` (repointe les `User.homeClubId`, supprime le
  doublon, en **transaction**).

### 23.6 Parcours : inscription & `/account`

**Composant `HomeClubPicker`** (`src/components/clubs/HomeClubPicker.tsx`),
mobile-first, réutilisé aux deux endroits :
1. `<select>` **pays** (défaut `FR`), libellés localisés via
   `Intl.DisplayNames([locale], { type: "region" })` + drapeau emoji dérivé du
   code ISO (helper pur `regionalIndicator(code)`). **Zéro dépendance.**
2. Champ **club** avec autocomplétion : `fetch("/api/handball-clubs?q=…&country=…")`
   débouncé (~250 ms), même rendu visuel que `PlayerSearch` (chip sélectionné +
   bouton « changer »).
3. Lien discret « **Mon club n'est pas dans la liste** » → bascule en saisie
   libre : `name` + **autocomplétion de ville** (`/api/geo/cities`, débouncée,
   filtrée par pays ; sélectionner une ville fixe `latitude`/`longitude` et
   affiche « 📍 <ville> »). Envoyé comme `newClub`. Ville tapée à la main sans
   sélection → pas de coordonnées (club « non localisé »).

- **Inscription** (`register/page.tsx`) : nouveau bloc sous « joueur préféré »,
  marqué `(facultatif)`.
- **`/account`** : nouveau bloc, **toujours éditable**. Si
  `homeClub.verified === false`, afficher un petit tag « en cours de validation ».

### 23.7 Affichage

**v1 — dans les ligues.** Liste des membres d'une ligue : sous le pseudo,
`🤾 <Club> · <Ville> <drapeau>` (club non vérifié inclus ici — on est entre
membres d'une même ligue). Éventuellement un tooltip sur le pseudo dans le chat
de ligue (optionnel).

**Lot 2 — deux widgets du dashboard `/dashboard` (FAIT).** Initialement une bande
sur la page d'accueil ; **déplacé dans le dashboard personnalisable** (§ widgets)
le 2026-08-30 — c'est de la méta communautaire, pas du contenu Starligue, et sa
place est derrière le login parmi les autres cartes réarrangeables. Deux widgets
singletons distincts (`src/lib/dashboard/layout.ts`), tous deux dans
`DEFAULT_LAYOUT` :

1. **`home-clubs-map` → `HomeClubsMapWidget`** (client) : carte **France par
   défaut, monde dès qu'un point est hors métropole** (2026-08-31).
   - **En-tête chiffré** : `N managers localisés · M clubs · P départements`
     (pluriel ICU, 8 locales, namespace `community.homeMap.*`).
   - **SVG inline, aucune lib carto** (décision tranchée : pas de Mapbox/Leaflet).
     Projection partagée `src/lib/geo/map-projection.ts` (`makeEquirectProjector`,
     équirectangulaire corrigé par `cos(lat médiane)`, pur/testé) : **le contour ET
     les points sont projetés par la même fonction**.
     - **Mode France** : `src/lib/geo/france-map.ts` — contour métropole + Corse
       (~50 pts). Un point par **département** (2 chiffres du code postal),
       position = moyenne des clubs du département, rayon ∝ √count.
     - **Mode monde** : `src/lib/geo/world-map.ts` (`WORLD_LAND_RINGS`, contour
       Natural Earth 1:110m simplifié, ~48 anneaux, régénérable via
       `scripts/build-world-map.ts`). Cadrage auto sur tous les points ∪ fenêtre
       France (identité du jeu), marge 15 %, min ~20°×15°, clamp monde. Un point
       par **club** hors métropole (DROM + étranger).
   - **Survol / focus / tap d'un point** : tooltip HTML (positionné en % des
     coords projetées, bascule haut/bas + gauche/droite) listant les **noms de
     clubs** (+ ville, + `×n` si plusieurs managers). `DepartmentPoint.clubs` /
     `OverseasPoint` portés par `aggregateHomeClubs`.
   - **Légende « Aussi représentés »** : pays hors métropole (via
     `Intl.DisplayNames` + drapeau, « Outre-mer » pour la France d'outre-mer) +
     compteur « club non localisé » (aucune coordonnée, tout pays).
   - Agrégat = `src/lib/community/home-clubs-query.ts::getHomeClubsAggregate()`
     (Prisma, serveur), **appelé en SSR dans `dashboard/page.tsx`**, pas de route
     `/api/*`. Parties pures `aggregateHomeClubs` / `groupOverseasByCountry`
     (`home-clubs.ts`, sans Prisma car importé côté client) testées. **Clubs
     vérifiés uniquement**, **comptes seuls**.

2. **`club-fantasy-ranking` → `ClubFantasyRankingWidget`** (client) : classement
   des **clubs d'origine par points fantasy cumulés**. Chaque manager ayant
   déclaré un club vérifié apporte à ce club le **meilleur total de ses effectifs
   validés** (0 s'il n'en a pas encore), mode-aware (`FantasyTeam` filtrés par
   `league.seasonId` en live / `SimulationTeam` par `seasonId` en simulation).
   Tri : points desc, puis nb de managers desc, puis nom. En tout début de saison
   tous les clubs sont à 0 → badge « Saison à venir », tri sur nb de managers.
   `src/lib/community/club-fantasy-ranking.ts` : `getClubFantasyRanking()` (SSR
   dans `dashboard/page.tsx`) + `aggregateClubFantasyRanking(rows)` pur testé.

**Lot 3 (option) — « Club à l'honneur ».** Rotation hebdo déterministe
(seed = nº de semaine ISO) parmi les clubs vérifiés ayant ≥ 1 membre : nom,
ville, logo, site, « N manager(s) de Starligue Fantasy jouent ici ». Réutilise
potentiellement le pipeline Instagram §17 plus tard.

### 23.8 Confidentialité (`/confidentialite`)

- Ajouter à `sections.data.items` : « le club de handball que tu indiques
  (facultatif, modifiable à tout moment) ».
- Préciser : visible par les autres membres de tes ligues ; utilisé de façon
  **agrégée et anonyme** (comptes par club / département) dans les widgets du
  dashboard (carte des managers, classement des clubs).
  Aucune adresse personnelle stockée sur ton compte — l'adresse du club provient
  de l'annuaire public FFHandball.
- La ligne « aucun tracking / analytics / publicité » reste vraie, inchangée.

### 23.9 i18n

Nouveau namespace `messages/<locale>/community.json` pour les 8 locales (fr, en,
es, ca, de, pt, da, pl) : libellés du picker, étape d'inscription, section
`/account`, tag « non vérifié », widget d'accueil. Les noms de pays viennent de
`Intl.DisplayNames` — **pas** de table de traduction à maintenir.

### 23.10 Tests (vitest, `src/lib/**`)

- `ffhandball-clubs.provider.test.ts` : 2-3 fixtures HTML de fiches club réelles
  → `ExternalHandballClub` attendu ; fixture XML de sitemap → liste de slugs ;
  fiche malformée → `IngestionError`.
- `src/lib/geo/countries.test.ts` : `regionalIndicator("FR") === "🇫🇷"`, rejet
  d'un code invalide.
- `src/lib/geo/france-map.test.ts` : contour dans le cadre, cohérence relative
  des villes (Lille au N de Marseille, etc.), `isInMetropolitanFrance` (Corse
  oui, DROM/étranger non).
- `src/lib/geo/map-projection.test.ts` : `makeEquirectProjector` (coins dans le
  cadre, N en haut / O à gauche), `boundsOfPoints`, `padBounds` (taille mini +
  marge), `unionBounds`, `clampBounds` (jamais hors monde).
- `src/lib/geo/cities.test.ts` : `searchCities` / `geocodeCity` contre le snapshot
  GeoNames réel (New York City, Montréal accents, filtre pays, limite).
- `src/lib/community/home-clubs.test.ts` : `aggregateHomeClubs` (groupement par
  département + position moyenne, membres ≠ clubs, étranger/outre-mer,
  non-localisés), `departmentFromZipcode`.
- Normalisation de la saisie libre (dédoublonnage) : trim, espaces multiples,
  casse, accents.

### 23.11 Rollout

1. `pnpm prisma migrate dev` (`HandballClub` + `HandballClubSource` +
   `User.homeClubId`).
2. Merge + déploiement Railway (migration prod).
3. `pnpm tsx scripts/run-ffhandball-clubs-import.ts` sur la prod → ~2 300 clubs.
4. Déploiement UI (picker inscription + `/account` + affichage en ligue).
5. `cron-monthly.yml` activé.
6. Lot 2 (widgets carte + classement clubs sur le dashboard) puis lot 3 (club à l'honneur) livrés séparément.
7. Option non retenue en v1 : prompt doux « D'où viens-tu ? » sur le dashboard à
   la prochaine visite (même pattern que la modal de récap de journée).
