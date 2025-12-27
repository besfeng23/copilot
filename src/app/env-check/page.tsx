"use client";

import { useEffect, useState } from "react";

type EnvHealth = {
  client: { ok: boolean; missing: string[] };
  server: { ok: boolean; missing: string[] };
};

export default function EnvCheckPage() {
  const [data, setData] = useState<EnvHealth | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/health/env", { cache: "no-store" })
      .then(async (r) => {
        const json = (await r.json().catch(() => null)) as EnvHealth | null;
        if (!r.ok || !json) throw new Error("Failed to load env health.");
        return json;
      })
      .then((json) => {
        if (!cancelled) setData(json);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load env health.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="min-h-screen bg-background text-foreground p-6">
      <div className="mx-auto max-w-2xl space-y-6">
        <div>
          <h1 className="text-xl font-semibold">Environment Check</h1>
          <p className="text-sm text-muted-foreground">
            This page lists missing environment variable names only (no values).
          </p>
        </div>

        {error ? (
          <div className="rounded-md border p-4 text-sm">
            <div className="font-medium">Application Error</div>
            <div className="text-muted-foreground">{error}</div>
          </div>
        ) : !data ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : (
          <>
            <section className="rounded-md border p-4 space-y-2">
              <div className="text-sm font-medium">
                Client env {data.client.ok ? "OK" : "Missing"}
              </div>
              {!data.client.ok && (
                <ul className="list-disc pl-5 text-sm">
                  {data.client.missing.map((k) => (
                    <li key={k}>
                      <code>{k}</code>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="rounded-md border p-4 space-y-2">
              <div className="text-sm font-medium">
                Server env {data.server.ok ? "OK" : "Missing"}
              </div>
              {!data.server.ok && (
                <ul className="list-disc pl-5 text-sm">
                  {data.server.missing.map((k) => (
                    <li key={k}>
                      <code>{k}</code>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {(!data.client.ok || !data.server.ok) && (
              <p className="text-sm text-muted-foreground">
                Set these exact keys in Vercel Project → Settings → Environment Variables, redeploy.
              </p>
            )}
          </>
        )}
      </div>
    </main>
  );
}

