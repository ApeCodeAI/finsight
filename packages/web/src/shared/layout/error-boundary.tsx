/**
 * [INPUT]: react-router-dom useRouteError / isRouteErrorResponse
 * [OUTPUT]: <RouteErrorBoundary /> — catches route-level errors and renders a
 *           friendly card instead of the React Router default screen
 * [POS]: shared/layout — mounted by routes.tsx as `errorElement`
 * [RUNTIME]: client
 * [PROTOCOL]: Don't swallow stack traces in dev; log to console too.
 */
import {
  isRouteErrorResponse,
  Link,
  useRouteError,
} from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";

export function RouteErrorBoundary() {
  const error = useRouteError();
  // Always surface to dev tools — devs may have closed the React DevTools panel.
  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.error("RouteErrorBoundary caught:", error);
  }

  const summary = errorSummary(error);

  return (
    <div className="mx-auto max-w-2xl py-16">
      <Card className="card-raised">
        <CardHeader>
          <CardTitle>Something blew up rendering this page</CardTitle>
          <p className="mt-2 text-sm text-muted-foreground">
            FinSight kept your data safe — this is a frontend rendering crash,
            not a backend failure. Try the actions below; if the same page keeps
            crashing, please file an issue with the message and stack trace.
          </p>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <pre className="overflow-x-auto rounded-md border border-border bg-[var(--surface-warm)] p-4 text-xs text-foreground">
            {summary}
          </pre>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
              onClick={() => window.location.reload()}
            >
              Reload page
            </button>
            <Link
              to="/"
              className="rounded-md border border-border bg-card px-4 py-2 text-sm font-medium text-foreground hover:bg-secondary"
            >
              Back to overview
            </Link>
            <a
              href="https://github.com/ApeCodeAI/finsight/issues/new?template=bug_report.md"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-meta hover:underline"
            >
              File an issue ↗
            </a>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function errorSummary(error: unknown): string {
  if (isRouteErrorResponse(error)) {
    return `${error.status} ${error.statusText}\n\n${
      typeof error.data === "string" ? error.data : JSON.stringify(error.data, null, 2)
    }`;
  }
  if (error instanceof Error) {
    return `${error.name}: ${error.message}\n\n${error.stack ?? ""}`;
  }
  return JSON.stringify(error, null, 2);
}
