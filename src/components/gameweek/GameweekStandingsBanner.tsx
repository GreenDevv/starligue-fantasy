"use client";

import { useEffect, useState } from "react";
import { GameweekStateBanner, type GameweekStateBannerData } from "@/components/gameweek/GameweekStateBanner";
import { withBasePath } from "@/lib/base-path";

// Bandeau de fiabilité du classement — se fetch lui-même (/api/gameweek-status),
// rendu sur /leaderboard et /leagues/[id]. Rien en pré-saison.
export function GameweekStandingsBanner({ className }: { className?: string }) {
  const [data, setData] = useState<GameweekStateBannerData | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(withBasePath("/api/gameweek-status"))
      .then((r) => r.json())
      .then((json: { data?: GameweekStateBannerData | null }) => {
        if (!cancelled && json.data) setData(json.data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  if (!data) return null;
  return <GameweekStateBanner data={data} context="standings" className={className} />;
}
