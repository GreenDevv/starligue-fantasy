// Icônes ligne (24x24, stroke), pas d'emoji — cohérent avec le reste de l'UI.
import type { SVGProps } from "react";

function base(props: SVGProps<SVGSVGElement>) {
  return {
    xmlns: "http://www.w3.org/2000/svg",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    ...props,
  };
}

export function PitchIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(props)}>
      <rect x="3" y="4" width="18" height="16" rx="1.5" />
      <path d="M3 12h18" />
      <path d="M9 4v4a3 3 0 0 0 6 0V4" />
      <path d="M9 20v-4a3 3 0 0 1 6 0v4" />
    </svg>
  );
}

export function MarketIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(props)}>
      <path d="M3 7h18l-1.5 11a2 2 0 0 1-2 1.7H6.5a2 2 0 0 1-2-1.7L3 7Z" />
      <path d="M8 7V5.5a4 4 0 0 1 8 0V7" />
    </svg>
  );
}

export function LeaguesIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(props)}>
      <circle cx="8" cy="8" r="3.2" />
      <circle cx="17" cy="9" r="2.6" />
      <path d="M2.5 19.5c0-3 2.5-5 5.5-5s5.5 2 5.5 5" />
      <path d="M14.2 15c2.4.2 4.3 2 4.3 4.5" />
    </svg>
  );
}

export function LeaderboardIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(props)}>
      <path d="M8 21V10" />
      <path d="M14 21V3" />
      <path d="M20 21v-7" />
      <path d="M2 21h20" />
    </svg>
  );
}

export function CalendarIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(props)}>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18" />
      <path d="M8 3v4" />
      <path d="M16 3v4" />
    </svg>
  );
}

export function TargetIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(props)}>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="4.5" />
      <circle cx="12" cy="12" r="0.6" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function ChevronLeftIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(props)}>
      <path d="M15 6l-6 6 6 6" />
    </svg>
  );
}

// Horloge à rebours — Mode Simulation (rejouer une saison passée)
export function RewindClockIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(props)}>
      <path d="M3 11a9 9 0 1 0 2.6-6.3" />
      <path d="M3 4v4h4" />
      <path d="M12 8v4l3 2" />
    </svg>
  );
}

// Porte + flèche sortante — déconnexion
export function LogoutIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(props)}>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="M16 17l5-5-5-5" />
      <path d="M21 12H9" />
    </svg>
  );
}

// Grille 2x2 — nav dashboard
export function DashboardIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(props)}>
      <rect x="3" y="3" width="8" height="8" rx="1.5" />
      <rect x="13" y="3" width="8" height="8" rx="1.5" />
      <rect x="3" y="13" width="8" height="8" rx="1.5" />
      <rect x="13" y="13" width="8" height="8" rx="1.5" />
    </svg>
  );
}

// Poignée de drag (6 points) — réorganisation des widgets du dashboard
export function DragHandleIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" {...props}>
      <circle cx="9" cy="6" r="1.6" />
      <circle cx="15" cy="6" r="1.6" />
      <circle cx="9" cy="12" r="1.6" />
      <circle cx="15" cy="12" r="1.6" />
      <circle cx="9" cy="18" r="1.6" />
      <circle cx="15" cy="18" r="1.6" />
    </svg>
  );
}

// Écusson de club — pages Clubs (fallback quand pas de logo image)
export function ClubIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(props)}>
      <path d="M12 3l7 3v5c0 4.4-3 8.2-7 10-4-1.8-7-5.6-7-10V6l7-3Z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  );
}

// Silhouette joueur — fallback header fiche joueur
export function PlayerIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(props)}>
      <circle cx="12" cy="7.5" r="3.3" />
      <path d="M5 20c0-4 3.1-6.5 7-6.5s7 2.5 7 6.5" />
    </svg>
  );
}

// Trophée — mise en avant (meilleur poste, forme, classement)
export function TrophyIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(props)}>
      <path d="M7 4h10v4a5 5 0 0 1-10 0V4Z" />
      <path d="M7 5H4v1a4 4 0 0 0 4 4" />
      <path d="M17 5h3v1a4 4 0 0 1-4 4" />
      <path d="M12 13v3" />
      <path d="M9 20h6" />
      <path d="M9.5 20c0-2 1-3 2.5-3s2.5 1 2.5 3" />
    </svg>
  );
}

// Tendance — évolution de valeur/forme (haut/bas)
export function TrendUpIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(props)}>
      <path d="M3 17l6-6 4 4 8-9" />
      <path d="M15 6h6v6" />
    </svg>
  );
}

export function TrendDownIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(props)}>
      <path d="M3 7l6 6 4-4 8 9" />
      <path d="M15 18h6v-6" />
    </svg>
  );
}

// Étoile du capitaine (voir CaptainPicker) + 3 éclats — bonus Triple Capitaine
export function TripleCaptainIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(props)}>
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 21 12 17.77 5.82 21 7 14.14 2 9.27l6.91-1.01L12 2Z" />
      <path d="M3 3l1.6 1.6" />
      <path d="M21 3l-1.6 1.6" />
      <path d="M12 22.5v-2" />
    </svg>
  );
}

// Banc de touche + flèche vers le haut — bonus Bench Boost
export function BenchBoostIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(props)}>
      <path d="M4 9h16" />
      <path d="M3 13h18" />
      <path d="M4 9v4" />
      <path d="M20 9v4" />
      <path d="M5 13v7" />
      <path d="M19 13v7" />
      <path d="M9.5 4.5L12 2l2.5 2.5" />
      <path d="M12 2v5" />
    </svg>
  );
}

// Écusson de protection + ligne plancher — bonus Assurance (score plancher à 0/joueur)
export function InsuranceIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(props)}>
      <path d="M12 3l7 3v5c0 4.4-3 8.2-7 10-4-1.8-7-5.6-7-10V6l7-3Z" />
      <path d="M9 14h6" />
      <path d="M12 14v3" />
    </svg>
  );
}

// Histogramme + étoile de leader — bonus Statisticien (double le bonus/malus "leader de journée")
export function StatisticianIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(props)}>
      <path d="M4 21v-3" />
      <path d="M10 21v-7" />
      <path d="M16 21v-11" />
      <path d="M20 3.2l.85 1.72 1.9.28-1.38 1.34.33 1.9-1.7-.9-1.7.9.33-1.9-1.38-1.34 1.9-.28L20 3.2Z" />
    </svg>
  );
}

// Info (i cerclé) — déclencheur du récap stats saison précédente au survol/tap
export function InfoIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(props)}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5.5" />
      <circle cx="12" cy="7.8" r="0.6" fill="currentColor" stroke="none" />
    </svg>
  );
}
