/**
 * [INPUT]: cn
 * [OUTPUT]: <Separator orientation /> — 分隔线
 * [POS]: shared/ui
 * [RUNTIME]: client
 * [PROTOCOL]: 颜色来自 --border
 */
import * as React from "react";
import { cn } from "@/shared/lib/cn";

interface Props extends React.HTMLAttributes<HTMLDivElement> {
  orientation?: "horizontal" | "vertical";
}

export function Separator({ orientation = "horizontal", className, ...props }: Props) {
  return (
    <div
      role="separator"
      className={cn(
        "shrink-0 bg-border",
        orientation === "horizontal" ? "h-px w-full" : "h-full w-px",
        className,
      )}
      {...props}
    />
  );
}
