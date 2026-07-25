# Starligue Fantasy

Jeu fantasy basé sur la Daikin Starligue (handball D1 France). Compose ton équipe avec de vrais joueurs, marque des points sur leurs performances réelles chaque journée, défie tes amis.

Projet indépendant, sans rapport officiel avec la LNH ou la Daikin Starligue.

## Stack

Next.js 14 (App Router), TypeScript, Tailwind, Framer Motion, Prisma + PostgreSQL, Auth.js v5, Zod. Déployé sur Railway.

Voir `CLAUDE.md` et `ARCHITECTURE.md` pour les conventions et la spec complète.

## Commandes

```
pnpm dev             # serveur de dev
pnpm test            # tests unitaires (vitest)
pnpm prisma migrate dev
pnpm prisma db seed
```
