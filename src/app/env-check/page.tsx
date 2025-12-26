"use client";

import { useEffect, useState } from "react";

type EnvStatus = { ok: boolean; missing: string[] };
type EnvHealth = { client: EnvStatus; server: EnvStatus };

export default function EnvCheckPage() {
  const [data, setData] = useState<EnvHealth | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/health/env", { cache: "no-store" });
        const json = (await res.json()) as EnvHealth;
        setData(json);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    })();
  }, []);

  return (
    <main className="min-h-screen bg-background text-foreground p-6">
      <div className="mx-auto w-full max-w-2xl space-y-6">
        <h1 className="text-2xl font-semibold">Environment Check</h1>

        {error ? (
          <div className="rounded-lg border p-4">
            <div className="font-medium">Application Error</div>
            <div className="mt-1 text-sm text-muted-foreground">{error}</div>
          </div>
        ) : null}

        {!data ? (
          <div className="rounded-lg border p-4 text-sm text-muted-foreground">
            Loading…
          </div>
        ) : (
          <>
            <section className="rounded-lg border p-4">
              <div className="font-medium">
                Client env {data.client.ok ? "OK" : "Missing"}
              </div>
              {!data.client.ok ? (
                <ul className="mt-2 list-disc pl-6 text-sm">
                  {data.client.missing.map((k) => (
                    <li key={k}>
                      <code>{k}</code>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="mt-2 text-sm text-muted-foreground">All required client keys are set.</div>
              )}
            </section>

            <section className="rounded-lg border p-4">
              <div className="font-medium">
                Server env {data.server.ok ? "OK" : "Missing"}
              </div>
              {!data.server.ok ? (
                <ul className="mt-2 list-disc pl-6 text-sm">
                  {data.server.missing.map((k) => (
                    <li key={k}>
                      <code>{k}</code>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="mt-2 text-sm text-muted-foreground">Firebase Admin credentials look configured.</div>
              )}
            </section>

            {(!data.client.ok || !data.server.ok) ? (
              <p className="text-sm text-muted-foreground">
                Set these exact keys in Vercel Project → Settings → Environment Variables, redeploy.
              </p>
            ) : null}
          </>
        )}
      </div>
    </main>
  );
}

