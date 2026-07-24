import Link from "next/link";
import { notFound } from "next/navigation";
import Image from "next/image";
import { ClubLogo } from "@/components/ui/ClubLogo";
import { getNewsItemById } from "@/lib/news/get-feed";

const CATEGORY_LABEL: Record<string, string> = {
  TRANSFER: "Transfert",
  INJURY: "Blessure",
  TEAM_OF_WEEK: "Équipe type",
  PERFORMANCE: "Performance",
  GENERAL: "Actu",
};

function formatDate(date: Date): string {
  return new Date(date).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
}

// Article lu sur notre propre site — texte intégral extrait côté serveur au scraping
// (src/lib/news/html-to-text.ts, jamais de HTML stocké/rendu : uniquement du texte,
// donc aucun risque d'injection depuis une source tierce). Lien "Voir l'article
// original" en bas, respect de la source sans forcer à quitter le site pour lire.
export default async function NewsItemPage({ params }: { params: { id: string } }) {
  const item = await getNewsItemById(params.id);
  if (!item) notFound();

  const paragraphs = item.content ? item.content.split("\n\n") : [];

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-4 px-4 pb-16 pt-8 sm:px-6">
      <Link href="/" className="text-xs uppercase tracking-widest text-accent hover:underline">
        ← Retour aux actus
      </Link>

      {item.imageUrl && (
        <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-surface">
          <Image src={item.imageUrl} alt="" fill className="object-cover" unoptimized />
        </div>
      )}

      <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-text-muted">
        <span className="text-accent-secondary">{CATEGORY_LABEL[item.category] ?? item.category}</span>
        <span>· {formatDate(item.publishedAt)}</span>
        {item.club && (
          <span className="flex items-center gap-1">
            · <ClubLogo club={item.club} size="xs" /> {item.club.shortName}
          </span>
        )}
      </div>

      <h1 className="font-display text-2xl uppercase tracking-wide text-text">{item.title}</h1>

      {paragraphs.length > 0 ? (
        <div className="flex flex-col gap-3 text-sm leading-relaxed text-text">
          {paragraphs.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </div>
      ) : item.excerpt ? (
        <p className="text-sm leading-relaxed text-text-muted">{item.excerpt}</p>
      ) : (
        <p className="text-sm text-text-muted">Article généré automatiquement, pas de texte associé.</p>
      )}

      {item.sourceUrl && (
        <a
          href={item.sourceUrl}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className="mt-2 text-xs text-text-muted underline hover:text-text"
        >
          Voir l&apos;article original →
        </a>
      )}
    </main>
  );
}
