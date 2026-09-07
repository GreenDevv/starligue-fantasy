"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

// Lot 1 du « Centre live » : quand une rencontre est en cours (ou vient de finir),
// rafraîchit la page côté serveur toutes les `intervalMs` pour que les scores et le
// classement Starligue se mettent à jour sans rechargement manuel. Le back
// (cron /api/cron/sync-live) fait le vrai boulot ; ici on se contente de
// re-`fetch` la page.
//
// - Ne tourne que si `active` (calculé côté serveur : au moins un match aujourd'hui
//   dans la fenêtre live).
// - Se met en pause quand l'onglet est masqué.
// - S'arrête au bout de `maxMs` (garde-fou : ~4 h après le montage).
export function LiveRefresher({
  active,
  intervalMs = 45_000,
  maxMs = 4 * 60 * 60 * 1000,
}: {
  active: boolean;
  intervalMs?: number;
  maxMs?: number;
}) {
  const router = useRouter();
  const [startedAt] = useState(() => Date.now());

  useEffect(() => {
    if (!active) return;
    const tick = () => {
      if (document.hidden) return;
      if (Date.now() - startedAt > maxMs) return;
      router.refresh();
    };
    const id = window.setInterval(tick, intervalMs);
    const onVisible = () => {
      if (!document.hidden) router.refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [active, intervalMs, maxMs, router, startedAt]);

  return null;
}
