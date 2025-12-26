"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { APIError, fetchJSON } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

type Dataset = {
  id: string;
  name: string;
  description?: string | null;
  exampleCount?: number;
};

function extractDatasets(payload: any): Dataset[] {
  if (Array.isArray(payload)) return payload as Dataset[];
  if (Array.isArray(payload?.datasets)) return payload.datasets as Dataset[];
  if (Array.isArray(payload?.data)) return payload.data as Dataset[];
  return [];
}

export default function DatasetsPage() {
  const router = useRouter();
  const { user } = useAuth();

  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [needsBootstrap, setNeedsBootstrap] = useState(false);
  const [bootstrapLoading, setBootstrapLoading] = useState(false);

  const sorted = useMemo(() => {
    return [...datasets].sort((a, b) => a.name.localeCompare(b.name));
  }, [datasets]);

  async function load() {
    setLoading(true);
    setError(null);
    setNeedsBootstrap(false);

    try {
      const idToken = await user?.getIdToken();
      const res = await fetchJSON<any>("/api/datasets", { idToken, cache: "no-store" });
      setDatasets(extractDatasets(res));
    } catch (err: any) {
      console.error("API error", err?.message, err?.status, err?.code);

      const status = err?.status;
      const code = err?.code;
      if (status === 401) {
        router.replace("/login?next=" + encodeURIComponent("/datasets"));
        return;
      }
      if (status === 403 || code === "NOT_A_MEMBER") {
        setNeedsBootstrap(true);
        return;
      }
      setError(err?.message ?? "Failed to load datasets.");
    } finally {
      setLoading(false);
    }
  }

  async function initializeAccess() {
    setBootstrapLoading(true);
    setError(null);
    try {
      const idToken = await user?.getIdToken();
      await fetchJSON<any>("/api/admin/bootstrap", { method: "POST", idToken });

      // Retry once
      const res = await fetchJSON<any>("/api/datasets", { idToken, cache: "no-store" });
      setDatasets(extractDatasets(res));
      setNeedsBootstrap(false);
    } catch (err: any) {
      console.error("API error", err?.message, err?.status, err?.code);
      if (err?.status === 401) {
        router.replace("/login?next=" + encodeURIComponent("/datasets"));
        return;
      }
      setError(err?.message ?? "Failed to initialize access.");
    } finally {
      setBootstrapLoading(false);
    }
  }

  async function createDataset() {
    const name = newName.trim();
    if (!name) return;
    setCreating(true);
    setError(null);

    try {
      const idToken = await user?.getIdToken();
      await fetchJSON<any>("/api/datasets", {
        method: "POST",
        idToken,
        body: { name },
      });
      setNewName("");
      await load();
    } catch (err: any) {
      console.error("API error", err?.message, err?.status, err?.code);
      if (err?.status === 401) {
        router.replace("/login?next=" + encodeURIComponent("/datasets"));
        return;
      }
      setError(err?.message ?? "Failed to create dataset.");
    } finally {
      setCreating(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Datasets</h1>
          <p className="text-sm text-muted-foreground">
            Manage datasets and examples for evaluations.
          </p>
        </div>

        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
          <Input
            placeholder="New dataset name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="sm:w-[260px]"
          />
          <Button onClick={createDataset} disabled={creating || !newName.trim()}>
            {creating ? "Creating..." : "New dataset"}
          </Button>
        </div>
      </div>

      {needsBootstrap ? (
        <Alert>
          <AlertTitle>Access not initialized</AlertTitle>
          <AlertDescription className="mt-2">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-sm text-muted-foreground">
                You don’t have access to datasets yet.
              </div>
              <Button onClick={initializeAccess} disabled={bootstrapLoading}>
                {bootstrapLoading ? "Initializing..." : "Initialize my access"}
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      ) : null}

      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Something went wrong</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid grid-cols-1 gap-4">
        {loading ? (
          <Card>
            <CardHeader>
              <CardTitle>Loading…</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Fetching your datasets.
            </CardContent>
          </Card>
        ) : sorted.length === 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>No datasets</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Create your first dataset to start adding examples.
            </CardContent>
          </Card>
        ) : (
          sorted.map((ds) => (
            <Card key={ds.id}>
              <CardHeader className="space-y-1">
                <CardTitle className="text-lg">
                  <Link className="hover:underline" href={`/datasets/${encodeURIComponent(ds.id)}`}>
                    {ds.name}
                  </Link>
                </CardTitle>
                {ds.description ? (
                  <div className="text-sm text-muted-foreground">{ds.description}</div>
                ) : null}
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                Examples: <span className="text-foreground">{ds.exampleCount ?? 0}</span>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}

