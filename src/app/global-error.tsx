"use client";

import { useEffect, useState } from "react";

type EnvDiag = {
  ok: boolean;
  client: { ok: boolean; missing: string[] };
  server: { ok: boolean; missing: string[] };
};

export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [diag, setDiag] = useState<EnvDiag | null>(null);
  useEffect(() => {
    // Intentionally do not log env values / secrets.
    // Keep this minimal to avoid noisy production logs.
    // eslint-disable-next-line no-console
    console.error("Application Error (global)", { message: error?.message, digest: error?.digest });
  }, [error]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/diag/env", { cache: "no-store" })
      .then(async (r) => {
        const json = (await r.json().catch(() => null)) as EnvDiag | null;
        if (!r.ok || !json) return null;
        return json;
      })
      .then((json) => {
        if (!cancelled) setDiag(json);
      })
      .catch(() => {
        // Ignore; this UI must never crash even if diagnostics are unavailable.
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <html>
      <body className="min-h-screen bg-background text-foreground p-6">
        <div className="mx-auto max-w-2xl space-y-4">
          <h1 className="text-xl font-semibold">Application Error</h1>
          <p className="text-sm text-muted-foreground">
            Something went wrong while rendering the application. If this persists, check environment variables and redeploy.
          </p>

          <div className="rounded-md border p-4 text-sm space-y-3">
            <div className="font-medium">Diagnostics (names only)</div>
            <div className="text-muted-foreground">
              Open <a className="underline" href="/config">/config</a> for the full preflight UI.
            </div>
            {diag ? (
              <>
                <div>
                  <div className="font-medium">Client env {diag.client.ok ? "OK" : "Missing"}</div>
                  {!diag.client.ok && (
                    <ul className="list-disc pl-5 text-muted-foreground">
                      {diag.client.missing.map((k) => (
                        <li key={k}>
                          <code>{k}</code>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div>
                  <div className="font-medium">Server env {diag.server.ok ? "OK" : "Missing"}</div>
                  {!diag.server.ok && (
                    <ul className="list-disc pl-5 text-muted-foreground">
                      {diag.server.missing.map((k) => (
                        <li key={k}>
                          <code>{k}</code>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </>
            ) : (
              <div className="text-muted-foreground">Diagnostics unavailable.</div>
            )}
          </div>

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

