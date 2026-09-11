# live-sync-worker

Service Railway séparé, always-on : boucle en continu (toutes les 20s par défaut)
sur `POST /api/cron/sync-live` de l'app principale, pour remplacer le cron GitHub
Actions (`.github/workflows/cron-live.yml`) qui s'est avéré ne pas se déclencher de
façon fiable à une fréquence sub-5-min (0 déclenchement naturel observé sur 17h le
2026-09-11, malgré un match Starligue en cours dans la fenêtre programmée).

Ne touche pas la base de données directement — appelle juste l'endpoint HTTP public
(authentifié par `CRON_SECRET`, la même route que le cron GitHub Actions appelait).
`/api/cron/sync-live` est un no-op quasi gratuit hors créneau de match, donc pas de
souci à tourner 24/7 plutôt que seulement les soirs de match.

## Variables d'environnement (service Railway)

- `CRON_SECRET` — même secret que le service `web` (référence partagée Railway
  recommandée plutôt qu'une copie : `${{web.CRON_SECRET}}`)
- `SYNC_TARGET_URL` — optionnel, défaut `https://www.starliguefantasy.fr`
- `LIVE_SYNC_INTERVAL_MS` — optionnel, défaut `20000` (20s)

## Déploiement

⚠️ Déployé le 2026-09-11 via `railway up workers/live-sync -s live-sync-worker`
(upload direct depuis le poste local), **pas encore connecté au repo GitHub** — un
changement de `worker.mjs` ne se redéploie pas tout seul au push, il faut relancer
`railway up` manuellement (ou finir de connecter le service au repo avec Root
Directory = `workers/live-sync` depuis le dashboard Railway).
