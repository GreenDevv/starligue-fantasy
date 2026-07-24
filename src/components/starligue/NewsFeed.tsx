import Link from "next/link";
import { NewsCard } from "./NewsCard";
import type { NewsFeedResult } from "@/lib/news/get-feed";
import type { NewsCategory } from "@prisma/client";

const CATEGORIES: { value: NewsCategory | null; label: string }[] = [
  { value: null, label: "Tout" },
  { value: "TRANSFER", label: "Transferts" },
  { value: "INJURY", label: "Blessures" },
  { value: "TEAM_OF_WEEK", label: "Équipe type" },
  { value: "PERFORMANCE", label: "Performances" },
  { value: "GENERAL", label: "Actus" },
];

export function NewsFeed({
  feed,
  activeCategory,
}: {
  feed: NewsFeedResult;
  activeCategory: NewsCategory | null;
}) {
  return (
    <div className="pixel-corners border border-border bg-surface p-3">
      <p className="mb-2 text-[10px] uppercase tracking-widest text-text-muted">Actus Starligue</p>

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
        <p className="py-6 text-center text-xs text-text-muted">Aucune actu pour l&apos;instant.</p>
      ) : (
        <div className="flex flex-col">
          {feed.items.map((item) => (
            <NewsCard key={item.id} item={item} />
          ))}
        </div>
      )}

      {feed.hasMore && (
        <div className="mt-3 text-center">
          <Link
            href={`/?${activeCategory ? `category=${activeCategory}&` : ""}page=${feed.page + 1}`}
            className="text-xs uppercase tracking-widest text-accent hover:underline"
          >
            Voir plus
          </Link>
        </div>
      )}
    </div>
  );
}
