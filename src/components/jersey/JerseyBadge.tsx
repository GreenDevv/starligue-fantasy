// Mini badge maillot — affiché partout où l'identité d'une équipe apparaît
// (en-tête /team, listes de ligues, classements). Même convention de taille que
// src/components/ui/ClubLogo.tsx.
import { cn } from "@/lib/utils";
import { Jersey } from "./Jersey";

interface JerseyBadgeProps {
  jerseyConfig: unknown;
  size?: "xs" | "sm" | "md" | "lg";
  className?: string;
}

const SIZES: Record<NonNullable<JerseyBadgeProps["size"]>, number> = {
  xs: 18,
  sm: 26,
  md: 36,
  lg: 56,
};

export function JerseyBadge({ jerseyConfig, size = "sm", className = "" }: JerseyBadgeProps) {
  const px = SIZES[size];
  return (
    <span
      className={cn("inline-flex shrink-0 items-center justify-center", className)}
      style={{ width: px, height: px }}
    >
      <Jersey config={jerseyConfig} view="front" className="h-full w-full" />
    </span>
  );
}
