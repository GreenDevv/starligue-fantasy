// Worker always-on (service Railway séparé, "live-sync-worker") qui appelle
// /api/cron/sync-live en continu, toutes les LIVE_SYNC_INTERVAL_MS (défaut 20s).
//
// Remplace le cron GitHub Actions (.github/workflows/cron-live.yml, */2 min) qui
// s'est avéré ne pas se déclencher de façon fiable à cette fréquence : 0
// déclenchement naturel observé en 17h le 2026-09-11 malgré la fenêtre programmée
// (mer.-dim. 16h-23h UTC), alors qu'un match Starligue était en cours. Voir mémoire
// lnh_live_match_feed_endpoint / live_match_center_vision.
//
// La route /api/cron/sync-live est un no-op quasi gratuit hors créneau de match
// (retourne { skipped: true } dès qu'aucun match n'est dans la fenêtre programmée),
// donc pas de souci à l'appeler en continu 24/7 plutôt que seulement pendant les
// soirs de match.
const BASE_URL = process.env.SYNC_TARGET_URL ?? "https://www.starliguefantasy.fr";
const CRON_SECRET = process.env.CRON_SECRET;
const INTERVAL_MS = Number(process.env.LIVE_SYNC_INTERVAL_MS ?? 20_000);

if (!CRON_SECRET) {
  console.error("[live-sync-worker] CRON_SECRET manquant, arrêt.");
  process.exit(1);
}

async function tick() {
  try {
    const res = await fetch(`${BASE_URL}/api/cron/sync-live`, {
      method: "POST",
      headers: { Authorization: `Bearer ${CRON_SECRET}` },
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      console.warn(`[live-sync-worker] HTTP ${res.status}`, JSON.stringify(body));
      return;
    }
    if (body?.data?.skipped) return; // hors créneau de match, rien à logger
    const liveFeed = body?.data?.liveFeed;
    if (liveFeed?.matches?.length) {
      console.log(`[live-sync-worker] ${new Date().toISOString()} ${JSON.stringify(liveFeed.matches)}`);
    }
  } catch (err) {
    console.warn("[live-sync-worker] erreur:", String(err));
  }
}

console.log(`[live-sync-worker] démarré — intervalle ${INTERVAL_MS}ms, cible ${BASE_URL}`);
tick();
setInterval(tick, INTERVAL_MS);
