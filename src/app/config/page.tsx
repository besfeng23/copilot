"use client";

import { useEffect, useState } from "react";

import { listMissingPublicEnv } from "@/lib/env/public";

type ConfigResponse = {
  ok: boolean;
  missingServerEnv: string[];
};

export default function ConfigPage() {
  const [data, setData] = useState<ConfigResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const missingClientEnv = listMissingPublicEnv();

  useEffect(() => {
    let cancelled = false;
    fetch("/api/config", { cache: "no-store" })
      .then(async (r) => {
        const json = (await r.json().catch(() => null)) as ConfigResponse | null;
        if (!r.ok || !json) throw new Error("Failed to load config.");
        return json;
      })
      .then((json) => {
        if (!cancelled) setData(json);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load config.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="min-h-screen bg-background text-foreground p-6">
      <div className="mx-auto max-w-2xl space-y-6">
        <div>
          <h1 className="text-xl font-semibold">Config</h1>
          <p className="text-sm text-muted-foreground">This page shows missing environment variable names only.</p>
        </div>

        <section className="rounded-md border p-4 space-y-2">
          <div className="text-sm font-medium">
            Client env {missingClientEnv.length === 0 ? "OK" : "Missing"}
          </div>
          {missingClientEnv.length > 0 && (
            <ul className="list-disc pl-5 text-sm">
              {missingClientEnv.map((k) => (
                <li key={k}>
                  <code>{k}</code>
                </li>
              ))}
            </ul>
          )}
        </section>

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
                Server env {data.missingServerEnv.length === 0 ? "OK" : "Missing"}
              </div>
              {data.missingServerEnv.length > 0 && (
                <ul className="list-disc pl-5 text-sm">
                  {data.missingServerEnv.map((k) => (
                    <li key={k}>
                      <code>{k}</code>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <div className="rounded-md border p-4 text-sm text-muted-foreground space-y-2">
              <div className="font-medium text-foreground">Firebase Admin env formats (names only)</div>
              <ul className="list-disc pl-5">
                <li>
                  Preferred single var: <code>FIREBASE_SERVICE_ACCOUNT_JSON</code>
                </li>
                <li>
                  Split (FIREBASE_ADMIN_*): <code>FIREBASE_ADMIN_PROJECT_ID</code>,{" "}
                  <code>FIREBASE_ADMIN_CLIENT_EMAIL</code>, <code>FIREBASE_ADMIN_PRIVATE_KEY</code>
                </li>
                <li>
                  Split (FIREBASE_SERVICE_ACCOUNT_*): <code>FIREBASE_SERVICE_ACCOUNT_PROJECT_ID</code>,{" "}
                  <code>FIREBASE_SERVICE_ACCOUNT_CLIENT_EMAIL</code>, <code>FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY</code>
                </li>
              </ul>
              <div className="text-xs">
                Note: split private keys should be stored as a single line using literal <code>\n</code> escapes.
              </div>
            </div>

            <div className="rounded-md border p-4 text-sm text-muted-foreground space-y-2">
              <div className="font-medium text-foreground">Where to set env</div>
              <ul className="list-disc pl-5">
                <li>
                  Local dev: <code>.env.local</code>
                </li>
                <li>
                  Vercel: Project → Settings → Environment Variables
                </li>
                <li>
                  Cursor Agent Online: set environment variables in the runtime settings for the agent
                </li>
              </ul>
            </div>
          </>
        )}
      </div>
    </main>
  );
}


