"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { NewsCardClient } from "./NewsCardClient";
import type { NewsFeedItem } from "@/lib/news/get-feed";
import type { NewsCategory } from "@prisma/client";

// Charge les actus suivantes en place (sous les 10 déjà rendues côté serveur par
// NewsFeed.tsx), sans navigation/rechargement de page — demande explicite de
// l'utilisateur ("agrandir la div pour en ajouter des nouvelles"), remplace
// l'ancien lien "Voir plus" basé sur ?page=N. GET /api/news réutilise
// getNewsFeed() (src/lib/news/get-feed.ts, PAGE_SIZE=10) par lots successifs.
export function NewsFeedLoadMore({
  category,
  initialPage,
  initialHasMore,
}: {
  category: NewsCategory | null;
  initialPage: number;
  initialHasMore: boolean;
}) {
  const t = useTranslations("dashboard");
  const tCommon = useTranslations("common");
  const [items, setItems] = useState<NewsFeedItem[]>([]);
  const [page, setPage] = useState(initialPage);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loading, setLoading] = useState(false);

  async function loadMore() {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page + 1) });
      if (category) params.set("category", category);
      const res = await fetch(`/api/news?${params.toString()}`);
      if (!res.ok) return; // échec récupérable — le bouton reste cliquable, l'utilisateur peut réessayer
      const json = (await res.json()) as { data: { items: NewsFeedItem[]; page: number; hasMore: boolean } };
      setItems((prev) => [...prev, ...json.data.items]);
      setPage(json.data.page);
      setHasMore(json.data.hasMore);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      {items.length > 0 && (
        <div className="flex flex-col">
          {items.map((item) => (
            <NewsCardClient key={item.id} item={item} />
          ))}
        </div>
      )}

      {hasMore && (
        <div className="mt-3 text-center">
          <button
            type="button"
            onClick={loadMore}
            disabled={loading}
            className="text-xs uppercase tracking-widest text-accent hover:underline disabled:opacity-50"
          >
            {loading ? tCommon("loading") : t("newsFeed.seeMore")}
          </button>
        </div>
      )}
    </>
  );
}
