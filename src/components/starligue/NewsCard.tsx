import Image from "next/image";
import { Link } from "@/i18n/navigation";
import { getTranslations, getFormatter } from "next-intl/server";
import { ClubLogo } from "@/components/ui/ClubLogo";
import type { NewsFeedItem } from "@/lib/news/get-feed";

const CATEGORY_COLOR: Record<NewsFeedItem["category"], string> = {
  TRANSFER: "text-accent-secondary",
  INJURY: "text-points-neg",
  TEAM_OF_WEEK: "text-accent",
  PERFORMANCE: "text-accent",
  GENERAL: "text-text-muted",
};

export async function NewsCard({ item }: { item: NewsFeedItem }) {
  const t = await getTranslations("labels");
  const format = await getFormatter();
  const formattedDate = format.dateTime(new Date(item.publishedAt), { day: "2-digit", month: "short" });

  const content = (
    <div className="flex gap-3 border-t border-border/60 py-3 first:border-t-0 first:pt-0">
      <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-md bg-bg">
        {item.imageUrl ? (
          <Image src={item.imageUrl} alt="" fill className="object-cover" unoptimized />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            {item.club ? <ClubLogo club={item.club} size="md" /> : null}
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest">
          <span className={CATEGORY_COLOR[item.category]}>{t(`newsCategory.${item.category}`)}</span>
          <span className="text-text-muted/70">{formattedDate}</span>
          {item.club && <span className="truncate text-text-muted/70">· {item.club.shortName}</span>}
        </div>
        <p className="mt-1 line-clamp-2 text-sm text-text">{item.title}</p>
        {item.excerpt && <p className="mt-0.5 line-clamp-1 text-xs text-text-muted">{item.excerpt}</p>}
      </div>
    </div>
  );

  return (
    <Link href={`/starligue/${item.id}`} className="block hover:opacity-80">
      {content}
    </Link>
  );
}
