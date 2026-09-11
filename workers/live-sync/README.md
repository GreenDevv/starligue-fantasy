# live-sync-worker

Service Railway séparé, always-on : boucle en continu sur `POST /api/cron/sync-live`
de l'app principale, pour remplacer le cron GitHub Actions
(`.github/workflows/cron-live.yml`) qui s'est avéré ne pas se déclencher de façon
fiable à une fréquence sub-5-min (0 déclenchement naturel observé sur 17h le
2026-09-11, malgré un match Starligue en cours dans la fenêtre programmée).

Intervalle **adaptatif** plutôt que fixe : le calendrier des matchs est connu à
l'avance (`Match.kickoffAt` en base), donc le worker ne tape l'endpoint toutes les
20s que lorsque la route répond avec de vraies données (un match est dans la fenêtre
programmée côté serveur, kickoff ± 3h/30min) ; le reste du temps il repasse en veille
(toutes les 10 min par défaut). Le passage rapide/veille est journalisé.

Ne touche pas la base de données directement — appelle juste l'endpoint HTTP public
(authentifié par `CRON_SECRET`, la même route que le cron GitHub Actions appelait).

## Variables d'environnement (service Railway)

- `CRON_SECRET` — même secret que le service `web` (référence partagée Railway
  recommandée plutôt qu'une copie : `${{web.CRON_SECRET}}`)
- `SYNC_TARGET_URL` — optionnel, défaut `https://www.starliguefantasy.fr`
- `LIVE_SYNC_INTERVAL_MS` — optionnel, défaut `20000` (20s), mode rapide (match proche/en cours)
- `LIVE_SYNC_SLOW_INTERVAL_MS` — optionnel, défaut `600000` (10min), mode veille

## Déploiement

Service Railway `live-sync-worker`, connecté au repo GitHub (branche `main`,
auto-déploie au push comme le service `web`) avec **Root Directory =
`workers/live-sync`** et **Start Command = `node worker.mjs`** (réglés via l'API
GraphQL Railway — `serviceInstanceUpdate` sur `ServiceInstanceUpdateInput`, pas de
flag CLI pour ça). `CRON_SECRET` référencé depuis le service `web`
(`${{web.CRON_SECRET}}`).
