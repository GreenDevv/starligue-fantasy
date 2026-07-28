import type { AppLocale } from "@/i18n/routing";

// Drapeaux en SVG plutôt qu'en emoji : pas de code pays ISO pour la Catalogne
// (ce n'est pas un État) donc pas d'emoji drapeau catalan fiable multi-plateforme
// (rendu incohérent selon OS/police, souvent juste le drapeau noir générique) —
// un vrai SVG de la Senyera est le seul moyen d'avoir un drapeau catalan distinct
// du drapeau espagnol partout. Formes simplifiées (aplats, sans blason) pour
// rester lisibles à petite taille.
export function FlagIcon({ locale, className = "h-3.5 w-5" }: { locale: AppLocale; className?: string }) {
  switch (locale) {
    case "fr":
      return (
        <svg viewBox="0 0 30 20" className={className} aria-hidden="true">
          <rect width="30" height="20" fill="#ED2939" />
          <rect width="20" height="20" fill="#FFFFFF" />
          <rect width="10" height="20" fill="#0055A4" />
        </svg>
      );
    case "en":
      return (
        <svg viewBox="0 0 30 20" className={className} aria-hidden="true">
          <rect width="30" height="20" fill="#012169" />
          <path d="M0,0 L30,20 M30,0 L0,20" stroke="#FFFFFF" strokeWidth="4" />
          <path d="M0,0 L30,20 M30,0 L0,20" stroke="#C8102E" strokeWidth="1.3" />
          <path d="M15,0 V20 M0,10 H30" stroke="#FFFFFF" strokeWidth="6" />
          <path d="M15,0 V20 M0,10 H30" stroke="#C8102E" strokeWidth="3.6" />
        </svg>
      );
    case "es":
      return (
        <svg viewBox="0 0 30 20" className={className} aria-hidden="true">
          <rect width="30" height="20" fill="#AA151B" />
          <rect y="5" width="30" height="10" fill="#F1BF00" />
        </svg>
      );
    case "ca":
      return (
        <svg viewBox="0 0 30 20" className={className} aria-hidden="true">
          <rect width="30" height="20" fill="#FCDD09" />
          {[0, 1, 2, 3].map((i) => (
            <rect key={i} y={2.22 * (2 * i + 1)} width="30" height="2.22" fill="#DA121A" />
          ))}
        </svg>
      );
    case "de":
      return (
        <svg viewBox="0 0 30 20" className={className} aria-hidden="true">
          <rect width="30" height="20" fill="#FFCE00" />
          <rect width="30" height="13.33" fill="#000000" />
          <rect width="30" height="6.67" fill="#DD0000" />
        </svg>
      );
    case "pt":
      return (
        <svg viewBox="0 0 30 20" className={className} aria-hidden="true">
          <rect width="30" height="20" fill="#FF0000" />
          <rect width="12" height="20" fill="#006600" />
        </svg>
      );
    case "da":
      return (
        <svg viewBox="0 0 30 20" className={className} aria-hidden="true">
          <rect width="30" height="20" fill="#C60C30" />
          <rect x="11" width="4" height="20" fill="#FFFFFF" />
          <rect y="8" width="30" height="4" fill="#FFFFFF" />
        </svg>
      );
    case "pl":
      return (
        <svg viewBox="0 0 30 20" className={className} aria-hidden="true">
          <rect width="30" height="10" fill="#FFFFFF" />
          <rect y="10" width="30" height="10" fill="#DC143C" />
        </svg>
      );
    default:
      return null;
  }
}
