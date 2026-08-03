import { Link } from "@/i18n/navigation";

// Bouton coloré de bascule entre le mode Starligue (public, données du
// championnat) et le mode Fantasy (connecté, le jeu) — présent dans les deux
// nav (PublicNavBar/PublicMobileMenu et GameLayout/MobileMenu). Style repris
// du CTA "Accéder à Fantasy Starligue" déjà existant sur la home
// (bg-accent-secondary + shadow "bouton pressable"). "fantasy" (ambre) va vers
// le jeu, "starligue" (teal) ramène à "/" — deux tons de la palette existante,
// aucune nouvelle couleur introduite.
const TONE_CLASSES = {
  fantasy:
    "bg-accent-secondary text-bg shadow-[0_4px_0_0_theme(colors.accent.secondary/0.4)] hover:bg-accent-secondary/90 active:shadow-[0_1px_0_0_theme(colors.accent.secondary/0.4)]",
  starligue:
    "bg-accent text-bg shadow-[0_4px_0_0_theme(colors.accent.DEFAULT/0.4)] hover:bg-accent/90 active:shadow-[0_1px_0_0_theme(colors.accent.DEFAULT/0.4)]",
} as const;

export function ModeSwitchLink({
  href,
  tone,
  children,
}: {
  href: string;
  tone: keyof typeof TONE_CLASSES;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`shrink-0 whitespace-nowrap rounded-lg px-3 py-1.5 text-center font-display text-xs uppercase tracking-wide transition-[transform,box-shadow,background-color] duration-100 active:translate-y-[3px] sm:text-sm ${TONE_CLASSES[tone]}`}
    >
      {children}
    </Link>
  );
}
