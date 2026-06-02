/**
 * [INPUT]: cn
 * [OUTPUT]: <Table>, <THead>, <TBody>, <TR>, <TH>, <TD>, <TFoot>, <TCaption>
 * [POS]: shared/ui
 * [RUNTIME]: client
 * [PROTOCOL]: 数字列默认走 .num 类
 */
import * as React from "react";
import { cn } from "@/shared/lib/cn";

const Table = React.forwardRef<HTMLTableElement, React.HTMLAttributes<HTMLTableElement>>(
  ({ className, ...props }, ref) => (
    <div className="relative w-full overflow-auto">
      <table
        ref={ref}
        className={cn("w-full caption-bottom text-sm", className)}
        {...props}
      />
    </div>
  ),
);
Table.displayName = "Table";

const THead = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => (
    <thead
      ref={ref}
      className={cn("[&_tr]:border-b [&_tr]:border-border", className)}
      {...props}
    />
  ),
);
THead.displayName = "THead";

const TBody = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => (
    <tbody
      ref={ref}
      className={cn("[&_tr:last-child]:border-0", className)}
      {...props}
    />
  ),
);
TBody.displayName = "TBody";

const TFoot = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => (
    <tfoot
      ref={ref}
      className={cn("border-t border-border bg-[var(--surface-warm)] font-medium", className)}
      {...props}
    />
  ),
);
TFoot.displayName = "TFoot";

const TR = React.forwardRef<HTMLTableRowElement, React.HTMLAttributes<HTMLTableRowElement>>(
  ({ className, ...props }, ref) => (
    <tr
      ref={ref}
      className={cn(
        "border-b border-border transition-colors hover:bg-[var(--surface-warm)]/60",
        className,
      )}
      {...props}
    />
  ),
);
TR.displayName = "TR";

const TH = React.forwardRef<
  HTMLTableCellElement,
  React.ThHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => (
  <th
    ref={ref}
    className={cn(
      "h-10 px-3 text-left align-middle text-[11px] font-medium uppercase tracking-wider text-muted-foreground",
      className,
    )}
    {...props}
  />
));
TH.displayName = "TH";

const TD = React.forwardRef<
  HTMLTableCellElement,
  React.TdHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => (
  <td
    ref={ref}
    className={cn("p-3 align-middle text-sm", className)}
    {...props}
  />
));
TD.displayName = "TD";

const TCaption = React.forwardRef<
  HTMLTableCaptionElement,
  React.HTMLAttributes<HTMLTableCaptionElement>
>(({ className, ...props }, ref) => (
  <caption ref={ref} className={cn("mt-4 text-sm text-muted-foreground", className)} {...props} />
));
TCaption.displayName = "TCaption";

export { Table, THead, TBody, TFoot, TR, TH, TD, TCaption };
