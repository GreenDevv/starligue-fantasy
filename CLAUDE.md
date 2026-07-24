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