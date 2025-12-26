"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Intentionally do not log env values / secrets.
    // Keep this minimal to avoid noisy production logs.
    // eslint-disable-next-line no-console
    console.error("Application Error (global)", { message: error?.message, digest: error?.digest });
  }, [error]);

  return (
    <html>
      <body className="min-h-screen bg-background text-foreground p-6">
        <div className="mx-auto max-w-2xl space-y-4">
          <h1 className="text-xl font-semibold">Application Error</h1>
          <p className="text-sm text-muted-foreground">
            Something went wrong while rendering the application. If this persists, check environment variables and redeploy.
          </p>
          <button
            type="button"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-primary-foreground text-sm"
            onClick={() => window.location.reload()}
          >
            Reload
          </button>
        </div>
      </body>
    </html>
  );
}

