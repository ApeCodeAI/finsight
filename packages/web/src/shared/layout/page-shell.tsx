/**
 * [INPUT]: cn
 * [OUTPUT]: <PageShell title subtitle eyebrow children /> — 单页内容容器
 * [POS]: shared/layout，被每个 view module 的 page.tsx 包裹
 * [RUNTIME]: client
 * [PROTOCOL]: 改默认 spacing 时更新本头部
 */
import * as React from "react";
import { cn } from "@/shared/lib/cn";

interface Props {
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  eyebrow?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}

export function PageShell({ title, subtitle, eyebrow, actions, className, children }: Props) {
  return (
    <section className={cn("flex flex-col gap-8", className)}>
      {(title || eyebrow || subtitle || actions) && (
        <header className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            {eyebrow && (
              <span className="block font-mono text-[11px] uppercase tracking-widest text-meta">
                {eyebrow}
              </span>
            )}
            {title && (
              <h2 className="font-display text-2xl font-semibold tracking-tight md:text-3xl">
                {title}
              </h2>
            )}
            {subtitle && (
              <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
            )}
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

export function PageError({ message }: { message: string }) {
  return (
    <div className="rounded-md border border-danger/40 bg-[color-mix(in_oklab,var(--danger),white_90%)] p-4 text-sm text-danger">
      {message}
    </div>
  );
}

export function PageEmpty({ message }: { message: string }) {
  return (
    <div className="rounded-md border border-dashed border-border bg-card p-10 text-center text-sm text-muted-foreground">
      {message}
    </div>
  );
}
