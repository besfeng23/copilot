"use client";

export default function GlobalError(props: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-background text-foreground flex items-center justify-center p-6">
        <div className="w-full max-w-2xl rounded-lg border p-6">
          <h1 className="text-xl font-semibold">Application Error</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Something went wrong while rendering the application.
          </p>
          {props.error?.digest ? (
            <p className="mt-2 text-xs text-muted-foreground">
              Error ID: <code>{props.error.digest}</code>
            </p>
          ) : null}
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
              onClick={() => window.location.reload()}
            >
              Reload
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}

