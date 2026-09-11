// Worker always-on (service Railway séparé, "live-sync-worker") qui appelle
// /api/cron/sync-live en boucle, avec un intervalle ADAPTATIF :
//   - FAST_INTERVAL_MS (défaut 20s) dès qu'un match est dans la fenêtre programmée
//     côté serveur (kickoff dans [now-3h, now+30min]) — la route répond alors avec
//     de vraies données au lieu de { skipped: true }.
//   - SLOW_INTERVAL_MS (défaut 10min) le reste du temps — le calendrier des matchs
//     est connu à l'avance (Match.kickoffAt en base), donc pas besoin de taper
//     l'endpoint toutes les 20s quand on sait qu'aucun match n'est proche. 10 min
//     laisse une marge confortable pour rattraper l'ouverture de la fenêtre
//     (kickoff-30min) avant qu'un match ne commence réellement.
//
// Remplace le cron GitHub Actions (.github/workflows/cron-live.yml, */2 min) qui
// s'est avéré ne pas se déclencher de façon fiable à cette fréquence : 0
// déclenchement naturel observé en 17h le 2026-09-11 malgré la fenêtre programmée
// (mer.-dim. 16h-23h UTC), alors qu'un match Starligue était en cours. Voir mémoire
// lnh_live_match_feed_endpoint / live_match_center_vision.
const BASE_URL = process.env.SYNC_TARGET_URL ?? "https://www.starliguefantasy.fr";
const CRON_SECRET = process.env.CRON_SECRET;
const FAST_INTERVAL_MS = Number(process.env.LIVE_SYNC_INTERVAL_MS ?? 20_000);
const SLOW_INTERVAL_MS = Number(process.env.LIVE_SYNC_SLOW_INTERVAL_MS ?? 10 * 60_000);

if (!CRON_SECRET) {
  console.error("[live-sync-worker] CRON_SECRET manquant, arrêt.");
  process.exit(1);
}

let fastMode = false;

// Renvoie le délai avant le prochain tick, et journalise les transitions entre les
// deux modes (utile pour vérifier en prod que le passage rapide/lent suit bien le
// calendrier des matchs).
function nextDelay(skipped) {
  const wasFast = fastMode;
  fastMode = !skipped;
  if (fastMode !== wasFast) {
    console.log(`[live-sync-worker] ${new Date().toISOString()} passage en mode ${fastMode ? "rapide (match proche/en cours)" : "veille (aucun match dans la fenêtre)"}`);
  }
  return fastMode ? FAST_INTERVAL_MS : SLOW_INTERVAL_MS;
}

async function tick() {
  let skipped = true; // en cas d'erreur, on repart en mode veille par défaut (prudent)
  try {
    const res = await fetch(`${BASE_URL}/api/cron/sync-live`, {
      method: "POST",
      headers: { Authorization: `Bearer ${CRON_SECRET}` },
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      console.warn(`[live-sync-worker] HTTP ${res.status}`, JSON.stringify(body));
    } else {
      skipped = Boolean(body?.data?.skipped);
      const liveFeed = body?.data?.liveFeed;
      if (liveFeed?.matches?.length) {
        console.log(`[live-sync-worker] ${new Date().toISOString()} ${JSON.stringify(liveFeed.matches)}`);
      }
    }
  } catch (err) {
    console.warn("[live-sync-worker] erreur:", String(err));
  }

  setTimeout(tick, nextDelay(skipped));
}

console.log(`[live-sync-worker] démarré — rapide=${FAST_INTERVAL_MS}ms / veille=${SLOW_INTERVAL_MS}ms, cible ${BASE_URL}`);
tick();
