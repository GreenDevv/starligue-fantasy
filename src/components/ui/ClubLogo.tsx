import Image from "next/image";
import { cn } from "@/lib/utils";

interface ClubLogoProps {
  club: { shortName: string; name?: string; logoUrl?: string | null };
  size?: "xs" | "sm" | "md" | "lg";
  className?: string;
}

const SIZES: Record<NonNullable<ClubLogoProps["size"]>, number> = {
  xs: 16,
  sm: 24,
  md: 32,
  lg: 48,
};

// Logos peu lisibles sur fond sombre (dominante foncée/transparente) — plaque
// blanche derrière pour rester visibles sur les fonds sombres du site.
export const WHITE_BG_CLUBS = new Set(["CRMHB", "USAM"]);

export function ClubLogo({ club, size = "sm", className = "" }: ClubLogoProps) {
  const px = SIZES[size];

  if (!club.logoUrl) {
    return (
      <span
        className={cn(
          "inline-flex shrink-0 items-center justify-center rounded-full bg-surface text-[9px] font-bold text-text-muted ring-1 ring-border",
          className
        )}
        style={{ width: px, height: px }}
        aria-label={club.name ?? club.shortName}
      >
        {club.shortName.slice(0, 3)}
      </span>
    );
  }

  const needsWhiteBg = WHITE_BG_CLUBS.has(club.shortName);

  return (
    <span
      className={cn("inline-flex shrink-0", needsWhiteBg && "rounded-full bg-white p-[2px]", className)}
      style={{ width: px, height: px }}
    >
      <Image
        src={club.logoUrl}
        alt={club.name ?? club.shortName}
        width={px}
        height={px}
        className="h-full w-full object-contain"
      />
    </span>
  );
}
