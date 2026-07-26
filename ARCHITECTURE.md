# Starligue Fantasy — Architecture système v1.0

> Jeu de fantasy handball basé sur la Liqui Moly Starligue (D1 française), saison 2026/2027.
> Document de référence pour le développement avec Claude Code. À placer à la racine du repo.

---

## 1. Vue d'ensemble

Starligue Fantasy reprend le modèle Premier League Fantasy appliqué au handball français :

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
| Rendu 3D (éditeur de kit) | three.js + @react-three/fiber v8 (React 18) + drei, chargés en `next/dynamic({ ssr:false })` sur `/team/identity` uniquement | Vrai aperçu 3D avec rotation demandé (voir §5.x) — seule dépendance lourde du projet, isolée par code-splitting pour ne pas peser sur les autres pages |

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

### 2.2 Budget et valeurs marchandes

- Budget initial : `INITIAL_BUDGET` (env / table `game_config`), défaut proposé **100.0** (unité arbitraire, 1 décimale).
- Chaque joueur a une `marketValue` (défaut proposé : entre 3.0 et 15.0 selon le niveau).
- Contrainte à la validation de l'effectif : `SUM(marketValue des 14 joueurs) <= budget`.
- Les valeurs seront importées plus tard (CSV admin) ou seedées avec des valeurs par défaut par poste/club. Une table `player_value_history` trace les évolutions (permet plus tard un marché dynamique, hors scope v1).

### 2.3 Scoring (basé sur la note LNH)

La note LNH est sur 10. Principe : **5 = neutre**. En dessous → points négatifs, au-dessus → points positifs. Le statut titulaire amplifie dans les deux sens.

```
pointsBruts = (noteLNH - 5) × 4        // note 8 → +12 ; note 3 → −8
multiplicateur:
  TITULAIRE   → ×1.0
  REMPLACANT  → ×0.5
pointsJoueur = round(pointsBruts × multiplicateur, 1)
```

Cas particuliers (tous configurables dans `game_config`) :
- Joueur non noté / n'a pas joué → **0 point** (pas de pénalité en v1).
- Bonus victoire d'équipe : +2 si le club du joueur gagne et que le joueur a joué (optionnel, flag `WIN_BONUS_ENABLED`, défaut off en v1).
- Toutes les constantes (`×4`, `5`, `×0.5`) vivent dans `game_config`, jamais en dur : tu pourras les régler après quelques journées de test.

`pointsGameweek(user) = Σ pointsJoueur des 14 joueurs sur la journée`
`pointsSaison(user) = Σ pointsGameweek`

### 2.4 Deadlines et verrouillage

- Chaque journée (`gameweek`) a une `deadlineAt` = horaire du premier match − 1h.
- Après la deadline : l'alignement (titulaires/remplaçants) et l'effectif sont **gelés** pour cette journée (snapshot en base, voir `fantasy_lineup`).
- Les changements faits après deadline s'appliquent à la journée suivante.
- Transferts en cours de saison : **hors scope v1** (l'effectif est fixe après la première validation). Prévu v2 : N transferts gratuits/journée, malus au-delà — le schéma de données le permet déjà via les snapshots.

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

### 5.x Le système de maillot (kit : maillot + short + chaussettes)

`FantasyTeam.jerseyConfig` (Json, jamais de `@default` DB — toujours fourni à la
création, même convention que `FantasyLineup.entries`) stocke un `JerseyConfig`
(`src/lib/team/jersey.ts`, validé par Zod). Le nom de champ `jerseyConfig` est
conservé tel quel (DB, API, tous ses consommateurs) même si le modèle couvre
désormais tout le kit — seule sa forme interne a changé, pour éviter de
renommer dans les ~15 fichiers qui l'importent :

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

**Registre de motifs (`src/lib/team/kitPatterns.ts`)** : ~25 `PatternDefinition`
partagées par les 3 zones, chacune une liste de régions polygonales en
coordonnées `0-100` (mêmes conventions que le SVG) référençant un index de
`colors`. Quelques générateurs paramétrés (`stripes`, `hoops`, `sash`,
`halves`/`diagonalSplit`, `chevron`, `yoke`, `cross`…) peuplent la galerie sans
dessiner chaque motif à la main. C'est la **seule source de vérité** du rendu,
utilisée à la fois par le SVG (`Jersey.tsx`) et par la texture Canvas du viewer
3D (`KitViewer3D.tsx`) — jamais de logique de motif dupliquée entre les deux.

**Silhouettes (`src/lib/team/kitSilhouettes.ts`)** : les contours 2D de chaque
zone (maillot/short/chaussettes), en polygones `0-100`, également partagés
entre le clip SVG et l'extrusion 3D.

`DEFAULT_JERSEY_CONFIG` (teal/noir/ambre, reprend la palette §8.1) est appliqué
à la création d'une équipe. `CURATED_JERSEY_SWATCHES` fournit une palette de
pastilles pour l'éditeur (`JerseyEditor`), en plus d'un sélecteur hex libre.
`safeJerseyConfig` migre défensivement l'ancien format plat (avant
l'introduction des zones et du registre élargi) — un `jerseyConfig` legacy en
base continue de se charger sans erreur.

Le rendu 2D (`Jersey.tsx`) reste un SVG à viewBox fixe, même convention que
`HandballPitch.tsx` (couleurs en hex bruts, `<defs>`/`<clipPath>` pour les
motifs) — il n'affiche que le maillot (pas le short/chaussettes), utilisé par
`JerseyBadge.tsx` partout où l'identité d'une équipe apparaît en petit format
(en-tête `/team`, listes de ligues, classements) : un corps complet n'y
apporterait rien et coûterait en perf sur les listes.

**Aperçu 3D (`KitViewer3D.tsx`, éditeur uniquement)** : ⚠️ rupture avec la
décision initiale « pas de dépendance npm ajoutée » — `three`,
`@react-three/fiber` (v8, compatible React 18) et `@react-three/drei` ont été
ajoutés pour un vrai rendu 3D avec rotation, à la demande explicite du produit
(inspiration fmkitcreator.com). Chaque zone est une « carte rigide » extrudée
depuis sa silhouette 2D (`THREE.ExtrudeGeometry`, pas de mannequin sculpté —
choix délibéré pour rester faisable sans asset 3D dédié), texturée par un
`<canvas>` offscreen qui rejoue les mêmes régions du registre de motifs.
`KitViewer3D` est chargé exclusivement via `next/dynamic({ ssr: false })` depuis
`JerseyEditor` : les pages qui n'affichent que des `JerseyBadge` (classements,
listes de ligues…) ne doivent jamais charger three.js.

`/team/identity` n'est pas (encore) dans le pilote "borne d'arcade" (§8.1 bis) —
l'éditeur réutilise les classes `pixel-corners`/`pixel-corners-sm` déjà en
place avant ce pilote, mais n'adopte pas scanlines/glow, réservés au terrain.

---

## 6. API — Endpoints (Next.js Route Handlers)

Convention : réponses `{ data } | { error: { code, message } }`, validation Zod sur tous les inputs, auth via session Auth.js. Préfixe `/api`.

### 6.1 Auth
```
POST   /api/auth/register            { email, password, name, favoritePlayerId? } → crée User (aucune
                                        équipe : voir §6.4, chaque équipe est liée à une ligue créée/
                                        rejointe ensuite) — favoritePlayerId facultatif, jamais bloquant,
                                        vérifié référencer un Player existant si fourni
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
PUT    /api/my-team/identity              { name, jerseyConfig: JerseyConfig }
         → nom + maillot (voir §5.x) — étape "nom + maillot" de l'onboarding, et
           réutilisable pour personnaliser après coup (lien depuis /team)
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
POST   /api/cron/sync-fixtures            → provider.fetchFixtures (1×/jour)
POST   /api/cron/sync-results             → résultats des matchs du jour (soirs de journée)
POST   /api/cron/sync-ratings             → scraper notes LNH (matin J+1)
POST   /api/cron/snapshot-lineups         → gèle les alignements (à chaque deadline)
POST   /api/cron/compute-scores           → calcule points des journées complètes
POST   /api/cron/compute-prediction-odds  → crée les marchés de pronostic des matchs sans cotes (§14)
POST   /api/cron/sync-news                → scrape lnh.fr + sites de clubs, alimente la page /starligue (§16)
```

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
- **Le terrain** : demi-terrain de handball stylisé en SVG (arc des 6m/9m), les 7 titulaires positionnés dessus, les 7 remplaçants en banc horizontal en dessous. Drag & drop (ou tap-swap mobile) entre titulaire/remplaçant du même poste. C'est LA vue centrale de l'app.
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

```
/                       Page d'accueil du site — actus/résultats/classement Daikin
                        StarLigue (§16), + porte d'entrée jeu (connexion/déconnexion,
                        message de bienvenue, CTA "Créer mon équipe"/"Accéder à
                        Fantasy Starligue"). Anciennement /starligue (redirige ici).
/login /register        Auth
/leagues                Mes ligues (+ créer / rejoindre par code) — sert aussi de
                        verrou obligatoire quand l'utilisateur n'a encore aucune ligue
/leagues/[id]           Classement de ligue, évolution des rangs
/team                   ★ Vue terrain : alignement, points live de la journée
                        (sélecteur de ligue si l'utilisateur en a plusieurs)
/team/identity          Nom d'équipe + maillot (JerseyEditor) — 1ère étape de
                        l'onboarding par ligue, réutilisable pour personnaliser après coup
/team/build             Constitution initiale de l'effectif (wizard 7 postes,
                        budget restant affiché en permanence, validation finale)
/market                 Marché : table filtrable (poste, club, prix, forme),
                        utilisée pendant le build (et les transferts en v2)
/players/[id]           Fiche joueur : notes match par match, points générés
/matches                Calendrier + résultats par journée
/leaderboard            Classement global paginé + classement de la journée
/admin                  Dashboard imports CSV, config scoring, logs ingestion, recompute
/starligue/[id]         Détail d'une actu (texte intégral, §16) — /starligue seul
                        redirige vers / (voir plus haut)
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
- Crons Railway (ou service worker minimal) qui `curl -X POST -H "Authorization: Bearer $CRON_SECRET"` les routes `/api/cron/*` :
  - `sync-fixtures` : `0 6 * * *`
  - `sync-results` : `0 20-23,0-2 * * 4,5,6,0` (soirs de matchs, jeu→dim)
  - `sync-ratings` + `compute-scores` : `0 9,13 * * *`
  - `snapshot-lineups` : `*/15 * * * *` (le job vérifie lui-même si une deadline vient de passer — idempotent)
  - `sync-news` : `0 7 * * *` (quotidien, avant sync-ratings/compute-scores — §16)

---

## 11. CLAUDE.md suggéré (à créer à la racine)

```md
# Starligue Fantasy
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

**v2 (plus tard)** : transferts en saison, valeurs marchandes dynamiques, capitaine (×2), notifications (deadline, points), classements de ligue par journée, PWA.

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
`matchId`) puis **figées** jusqu'au coup d'envoi — jamais recalculées après. Affichées
à titre indicatif uniquement : elles n'entrent dans aucun calcul de points (seul le
multiplicateur §14.3, basé sur juste/faux, compte).

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
`sourceType` `LNH_SITE|CLUB_SITE|GENERATED`). Deux origines :

- **Scrapé** : cron quotidien `POST /api/cron/sync-news` (`0 7 * * *`) itère un
  registre de providers (`src/lib/data-providers/news/registry.ts`) — un par site
  (lnh.fr + un fichier par club, `src/lib/data-providers/news/clubs/`), chacun isolé
  dans son propre try/catch (une source en panne n'affecte jamais les autres,
  cohérent avec la prudence scraping du §3.2/§15). lnh.fr utilise la même recette AJAX
  que le reste de `lnh-scraper.provider.ts` (`contents_controller=news` sur
  `/ajaxpost1`). Les sites de clubs sont ajoutés incrémentalement (16 structures HTML
  indépendantes, reconnaissance site par site) — le pipeline tourne de bout en bout
  avec lnh.fr seul, chaque club ajouté n'est qu'un fichier + une ligne de registre.
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
  Publication automatique, pas de file de modération admin.
