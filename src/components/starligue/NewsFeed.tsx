import { Link } from "@/i18n/navigation";
import { getTranslations } from "next-intl/server";
import { NewsCard } from "./NewsCard";
import { NewsFeedLoadMore } from "./NewsFeedLoadMore";
import type { NewsFeedResult } from "@/lib/news/get-feed";
import type { NewsCategory } from "@prisma/client";

export async function NewsFeed({
  feed,
  activeCategory,
}: {
  feed: NewsFeedResult;
  activeCategory: NewsCategory | null;
}) {
  const t = await getTranslations("dashboard");

  const CATEGORIES: { value: NewsCategory | null; label: string }[] = [
    { value: null, label: t("newsFeed.filterAll") },
    { value: "TRANSFER", label: t("newsFeed.filterTransfers") },
    { value: "INJURY", label: t("newsFeed.filterInjuries") },
    { value: "TEAM_OF_WEEK", label: t("newsFeed.filterTeamOfWeek") },
    { value: "PERFORMANCE", label: t("newsFeed.filterPerformances") },
    { value: "GENERAL", label: t("newsFeed.filterGeneral") },
  ];

  return (
    <div className="pixel-corners border border-border bg-surface p-3">
      <p className="mb-2 text-[10px] uppercase tracking-widest text-text-muted">{t("newsFeed.title")}</p>

      <div className="mb-2 flex flex-wrap gap-1.5">
        {CATEGORIES.map((c) => {
          const isActive = c.value === activeCategory;
          const href = c.value ? `/?category=${c.value}` : "/";
          return (
            <Link
              key={c.label}
              href={href}
              className={`rounded-full border px-2.5 py-1 text-[10px] uppercase tracking-widest transition-colors ${
                isActive
                  ? "border-accent bg-accent/10 text-accent"
                  : "border-border text-text-muted hover:border-accent/50"
              }`}
            >
              {c.label}
            </Link>
          );
        })}
      </div>

      {feed.items.length === 0 ? (
        <p className="py-6 text-center text-xs text-text-muted">{t("newsFeed.noNews")}</p>
      ) : (
        <div className="flex flex-col">
          {feed.items.map((item) => (
            <NewsCard key={item.id} item={item} />
          ))}
        </div>
      )}

      <NewsFeedLoadMore category={activeCategory} initialPage={feed.page} initialHasMore={feed.hasMore} />
    </div>
  );
}
