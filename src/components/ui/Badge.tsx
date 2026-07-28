import { useTranslations } from "next-intl";
import type { Position } from "@/lib/squad/validation";
import { POSITION_THEME } from "./positionTheme";

export function PositionBadge({ position, className = "" }: { position: Position; className?: string }) {
  const t = useTranslations("labels");
  const theme = POSITION_THEME[position];
  return (
    <span
      className={`pixel-corners-sm inline-flex items-center px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${theme.bg} ${theme.text} ${className}`}
    >
      {t(`positionShort.${position}`)}
    </span>
  );
}
