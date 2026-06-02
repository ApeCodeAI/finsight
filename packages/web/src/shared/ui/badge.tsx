/**
 * [INPUT]: class-variance-authority, cn
 * [OUTPUT]: <Badge variant /> — 小型标签
 * [POS]: shared/ui
 * [RUNTIME]: client
 * [PROTOCOL]: 新增 variant 需对照 DESIGN.md
 */
import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/shared/lib/cn";

const badgeVariants = cva(
  "inline-flex items-center rounded-[var(--radius-pill)] px-2.5 py-0.5 text-[11px] font-medium font-mono uppercase tracking-wider",
  {
    variants: {
      variant: {
        default: "bg-secondary text-foreground",
        primary: "bg-primary/15 text-primary",
        success: "bg-[color-mix(in_oklab,var(--success),white_88%)] text-success",
        warn: "bg-[color-mix(in_oklab,var(--warn),white_88%)] text-warn",
        danger: "bg-[color-mix(in_oklab,var(--danger),white_88%)] text-danger",
        muted: "bg-secondary text-muted",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
