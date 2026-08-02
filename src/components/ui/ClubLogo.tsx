import Image from "next/image";
import { cn } from "@/lib/utils";

type LogoSize = "xs" | "sm" | "md" | "lg" | "xl";

interface ClubLogoProps {
  club: { shortName: string; name?: string; logoUrl?: string | null };
  size?: LogoSize;
  className?: string;
  // Info-bulle au survol (ex: "Ivry (Proligue)") — utile pour un club hors DB dont
  // le nom seul ne suffit pas à situer le niveau (Warm Up, ARCHITECTURE.md §19).
  // Absent par défaut : n'affecte aucun usage existant.
  title?: string;
  // Agrandit le logo au-delà du breakpoint sm: (≥640px — "desktop" pour ce site
  // mobile-first). Opt-in (défaut false) : la taille reste fixe (comportement
  // actuel, via style inline) partout ailleurs dans l'app — seule la page club
  // (résultats/grille/calendrier/en-tête) l'active, suite à la demande explicite
  // de l'utilisateur ("logos plus gros, surtout sur desktop") sans vouloir changer
  // les strips dashboard/TeamView. Nécessite de remplacer le style inline (taille
  // fixe) par des classes Tailwind : un style inline a toujours priorité sur une
  // classe, même avec préfixe sm:, donc impossible de superposer les deux.
  largeOnDesktop?: boolean;
}

const SIZES: Record<LogoSize, number> = {
  xs: 16,
  sm: 24,
  md: 32,
  lg: 48,
  xl: 64,
};

// Classes Tailwind statiques (le JIT ne résout pas les classes construites par
// interpolation de chaîne) — mêmes valeurs que SIZES pour la base (w-4=16px,
// w-6=24px, w-8=32px, w-12=48px, w-16=64px), ~×1.3 pour la variante desktop.
const SIZE_CLASSES: Record<LogoSize, string> = {
  xs: "w-4 h-4 sm:w-5 sm:h-5",
  sm: "w-6 h-6 sm:w-8 sm:h-8",
  md: "w-8 h-8 sm:w-10 sm:h-10",
  lg: "w-12 h-12 sm:w-16 sm:h-16",
  xl: "w-16 h-16 sm:w-20 sm:h-20",
};

const DESKTOP_SIZES: Record<LogoSize, number> = {
  xs: 20,
  sm: 32,
  md: 40,
  lg: 64,
  xl: 80,
};

// Logos peu lisibles sur fond sombre (dominante foncée/transparente) — plaque
// blanche derrière pour rester visibles sur les fonds sombres du site.
export const WHITE_BG_CLUBS = new Set(["CRMHB", "USAM"]);

export function ClubLogo({ club, size = "sm", className = "", title, largeOnDesktop = false }: ClubLogoProps) {
  const px = SIZES[size];
  // width/height next/image : qualité du srcset seulement (le rendu réel vient de
  // la taille du <span> parent + object-contain) — donner la taille desktop (la
  // plus grande possible) évite le flou une fois agrandi au-delà de sm:.
  const imagePx = largeOnDesktop ? DESKTOP_SIZES[size] : px;
  const sizeClass = largeOnDesktop ? SIZE_CLASSES[size] : undefined;
  const sizeStyle = largeOnDesktop ? undefined : { width: px, height: px };

  if (!club.logoUrl) {
    return (
      <span
        className={cn(
          "inline-flex shrink-0 items-center justify-center rounded-full bg-surface text-[9px] font-bold text-text-muted ring-1 ring-border",
          sizeClass,
          className
        )}
        style={sizeStyle}
        aria-label={club.name ?? club.shortName}
        title={title}
      >
        {club.shortName.slice(0, 3)}
      </span>
    );
  }

  const needsWhiteBg = WHITE_BG_CLUBS.has(club.shortName);
  // Un logo hotlinké (URL absolue http(s), ex: adversaire EHF Champions League,
  // src/lib/data-providers/ehf-scraper.provider.ts) vient d'un domaine externe
  // imprévisible — incompatible avec next/image sans whitelist statique par domaine
  // dans next.config.mjs (même contrainte que PlayerAvatar pour les photos joueurs
  // hotlinkées). Nos propres logos (clubs Starligue, adversaires Warm Up/Coupe de
  // France backfillés) restent des chemins locaux (`/clubs/...`) et passent par
  // next/image comme avant.
  const isHotlinked = club.logoUrl.startsWith("http");

  return (
    <span
      className={cn("inline-flex shrink-0", sizeClass, needsWhiteBg && "rounded-full bg-white p-[2px]", className)}
      style={sizeStyle}
      title={title}
    >
      {isHotlinked ? (
        // eslint-disable-next-line @next/next/no-img-element -- logo hébergé sur un domaine externe imprévisible, incompatible avec next/image sans whitelist statique
        <img
          src={club.logoUrl}
          alt={club.name ?? club.shortName}
          className="h-full w-full object-contain"
          loading="lazy"
          referrerPolicy="no-referrer"
        />
      ) : (
        <Image
          src={club.logoUrl}
          alt={club.name ?? club.shortName}
          width={imagePx}
          height={imagePx}
          className="h-full w-full object-contain"
        />
      )}
    </span>
  );
}
