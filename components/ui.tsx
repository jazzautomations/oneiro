// @/components/ui.tsx
// Shared UI primitives for the "Oniric Lacquer" system. Presentational and
// server-safe (no "use client") — they only compose tokens + component classes
// from globals.css, so screens stop hand-rolling class strings. Any client
// handlers (onClick, …) are supplied by the consuming client component.
//
// House rules baked in: one accent per surface (gold = the single chrome
// light), hairlines before shadows, flat compact panels, small radii.

import Link from "next/link";
import type {
  AnchorHTMLAttributes,
  ButtonHTMLAttributes,
  HTMLAttributes,
  ReactNode,
} from "react";

/* ------------------------------------------------------------------ *
 * cn — tiny class joiner (no dependency).
 * ------------------------------------------------------------------ */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

type ButtonVariant = "primary" | "ghost";
type ButtonSize = "sm" | "md" | "lg";

function btnClass(
  variant: ButtonVariant,
  size: ButtonSize,
  className?: string,
): string {
  return cn(
    "btn",
    variant === "primary" ? "btn-primary" : "btn-ghost",
    size === "sm" && "btn-sm",
    size === "lg" && "btn-lg",
    className,
  );
}

/* ------------------------------------------------------------------ *
 * Button — renders a <button>, or a next/link <a> when `href` is set.
 *
 * Props:
 *   variant?  "primary" | "ghost"            (default "primary")
 *   size?     "sm" | "md" | "lg"             (default "md")
 *   href?     string  -> renders a Next <Link> styled as the button
 *   className?, children, + native <button>/<a> attrs (onClick, type, …)
 * ------------------------------------------------------------------ */

type ButtonAsButton = {
  href?: undefined;
  variant?: ButtonVariant;
  size?: ButtonSize;
} & ButtonHTMLAttributes<HTMLButtonElement>;

type ButtonAsLink = {
  href: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
} & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href">;

export type ButtonProps = ButtonAsButton | ButtonAsLink;

export function Button(props: ButtonProps) {
  const { variant = "primary", size = "md", className, children } = props;
  const cls = btnClass(variant, size, className);

  if (props.href !== undefined) {
    const { href, variant: _v, size: _s, className: _c, children: _ch, ...rest } =
      props;
    void _v; void _s; void _c; void _ch;
    return (
      <Link href={href} className={cls} {...rest}>
        {children}
      </Link>
    );
  }

  const { variant: _v, size: _s, className: _c, children: _ch, type, ...rest } =
    props;
  void _v; void _s; void _c; void _ch;
  return (
    <button type={type ?? "button"} className={cls} {...rest}>
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------ *
 * IconButton — square hairline control for a single drawn icon.
 *
 * Props:
 *   label    string (required)  -> aria-label; icons carry no text
 *   children ReactNode          -> the drawn SVG icon
 *   className?, + native <button> attrs (onClick, disabled, …)
 * ------------------------------------------------------------------ */

export type IconButtonProps = {
  label: string;
  children: ReactNode;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-label">;

export function IconButton({
  label,
  children,
  className,
  type,
  ...rest
}: IconButtonProps) {
  return (
    <button
      type={type ?? "button"}
      aria-label={label}
      className={cn("icon-btn", className)}
      {...rest}
    >
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------ *
 * Panel — flat lacquer surface (hairline + soft deep drop). No blur.
 *
 * Props:
 *   as?       "div" | "section" | "article" | "aside"  (default "div")
 *   inset?    boolean  -> quieter nested surface (avoids card-in-card weight)
 *   className?, children, + native div attrs
 * ------------------------------------------------------------------ */

export type PanelProps = {
  as?: "div" | "section" | "article" | "aside";
  inset?: boolean;
} & HTMLAttributes<HTMLElement>;

export function Panel({
  as = "div",
  inset = false,
  className,
  children,
  ...rest
}: PanelProps) {
  const Tag = as;
  return (
    <Tag className={cn(inset ? "panel-inset" : "panel", className)} {...rest}>
      {children}
    </Tag>
  );
}

/* ------------------------------------------------------------------ *
 * Chip — compact hairline tag (mood, count, status). `gold` for emphasis.
 *
 * Props: gold?: boolean, className?, children, + native <span> attrs
 * ------------------------------------------------------------------ */

export type ChipProps = {
  gold?: boolean;
} & HTMLAttributes<HTMLSpanElement>;

export function Chip({ gold = false, className, children, ...rest }: ChipProps) {
  return (
    <span className={cn("chip", gold && "chip-gold", className)} {...rest}>
      {children}
    </span>
  );
}
