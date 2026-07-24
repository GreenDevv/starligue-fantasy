import type { ButtonHTMLAttributes, AnchorHTMLAttributes } from "react";
import Link from "next/link";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

// Effet "bouton d'arcade" : bezel bas en relief, s'enfonce au clic (translate + ombre
// qui remonte). ARCHITECTURE.md §8.1. Le variant ghost reste plat (usage inline, pas
// un CTA physique).
const BASE =
  "inline-flex items-center justify-center rounded-lg font-display uppercase tracking-wide disabled:opacity-40 disabled:cursor-not-allowed";

// Variantes "physiques" (primary/secondary/danger) : bezel bas en relief qui
// s'enfonce au clic. ghost reste plat (usage inline, pas un CTA physique).
const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    "bg-accent text-bg shadow-[0_4px_0_0_theme(colors.accent.DEFAULT/0.4),0_0_16px_rgba(45,212,191,0.35)] transition-[transform,box-shadow,background-color] duration-100 hover:bg-accent/90 active:translate-y-[3px] active:shadow-[0_1px_0_0_theme(colors.accent.DEFAULT/0.4)]",
  secondary:
    "border border-border bg-surface text-text shadow-[0_4px_0_0_theme(colors.border)] transition-[transform,box-shadow,background-color] duration-100 hover:bg-border/40 active:translate-y-[3px] active:shadow-[0_1px_0_0_theme(colors.border)]",
  ghost: "font-sans normal-case tracking-normal text-text-muted transition-colors hover:text-text hover:bg-surface",
  danger:
    "bg-points-neg text-white shadow-[0_4px_0_0_rgba(185,28,28,0.6)] transition-[transform,box-shadow,background-color] duration-100 hover:bg-points-neg/90 active:translate-y-[3px] active:shadow-[0_1px_0_0_rgba(185,28,28,0.6)]",
};

const SIZES: Record<ButtonSize, string> = {
  sm: "px-3 py-1.5 text-sm",
  md: "px-4 py-2 text-sm",
  lg: "px-6 py-3 text-base",
};

export function buttonClasses(
  variant: ButtonVariant = "primary",
  size: ButtonSize = "md",
  className = ""
): string {
  return `${BASE} ${VARIANTS[variant]} ${SIZES[size]} ${className}`;
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export function Button({
  variant = "primary",
  size = "md",
  className = "",
  ...props
}: ButtonProps) {
  return <button className={buttonClasses(variant, size, className)} {...props} />;
}

interface LinkButtonProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  href: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
}

// Même look que Button, mais rend un <a> (via next/link) — évite un <button> imbriqué dans un <a>.
export function LinkButton({
  href,
  variant = "primary",
  size = "md",
  className = "",
  ...props
}: LinkButtonProps) {
  return <Link href={href} className={buttonClasses(variant, size, className)} {...props} />;
}
