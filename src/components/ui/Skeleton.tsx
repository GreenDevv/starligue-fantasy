import { cn } from "@/lib/utils";

// Bloc de chargement — remplace le texte "Chargement…" par une forme qui
// préfigure le contenu réel (ARCHITECTURE.md §8.1 : coquille pixel-corners
// partagée par tout l'écrin arcade). `.shimmer` défini dans globals.css.
export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={cn("shimmer pixel-corners-sm", className)} />;
}

// Ligne de texte factice (hauteur/largeur ajustables via className).
export function SkeletonText({ className = "" }: { className?: string }) {
  return <Skeleton className={cn("h-3.5 w-full", className)} />;
}

// Gabarit de carte type PlayerCard/liste — avatar rond + deux lignes de texte.
export function SkeletonRow({ className = "" }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-3 p-3", className)}>
      <div className="shimmer h-10 w-10 shrink-0 rounded-full" />
      <div className="flex flex-1 flex-col gap-1.5">
        <Skeleton className="h-3.5 w-2/3" />
        <Skeleton className="h-3 w-1/3" />
      </div>
    </div>
  );
}
