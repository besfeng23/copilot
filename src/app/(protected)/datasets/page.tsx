"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { fetchJSON } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/hooks/use-toast";

type Dataset = {
  id: string;
  name?: string;
  createdAt?: string;
  updatedAt?: string;
  exampleCount?: number;
};

function normalizeDatasets(payload: unknown): Dataset[] {
  if (Array.isArray(payload)) return payload as Dataset[];
  if (payload && typeof payload === "object") {
    const maybe = payload as Record<string, unknown>;
    if (Array.isArray(maybe.datasets)) return maybe.datasets as Dataset[];
    if (Array.isArray(maybe.items)) return maybe.items as Dataset[];
  }
  return [];
}

function extractNewDatasetId(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const p = payload as Record<string, unknown>;
  const direct =
    (typeof p.datasetId === "string" && p.datasetId) ||
    (typeof p.id === "string" && p.id);
  if (direct) return direct;
  if (p.dataset && typeof p.dataset === "object") {
    const d = p.dataset as Record<string, unknown>;
    const nested = (typeof d.id === "string" && d.id) || (typeof d.datasetId === "string" && d.datasetId);
    if (nested) return nested;
  }
  return null;
}

export default function DatasetsPage() {
  const router = useRouter();
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sorted = useMemo(() => {
    return [...datasets].sort((a, b) => {
      const ax = a.updatedAt ?? a.createdAt ?? "";
      const bx = b.updatedAt ?? b.createdAt ?? "";
      return bx.localeCompare(ax);
    });
  }, [datasets]);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchJSON<unknown>("/api/datasets", { method: "GET" });
      setDatasets(normalizeDatasets(res));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load datasets.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const createDataset = async () => {
    setCreating(true);
    try {
      const res = await fetchJSON<unknown>("/api/datasets", {
        method: "POST",
        body: JSON.stringify({}),
      });
      const id = extractNewDatasetId(res);
      toast({ title: "Dataset created" });
      if (id) {
        router.push(`/datasets/${encodeURIComponent(id)}`);
        return;
      }
      await load();
    } catch (e) {
      toast({
        title: "Could not create dataset",
        description: e instanceof Error ? e.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Datasets</h1>
          <p className="text-sm text-muted-foreground">
            Manage evaluation datasets via backend APIs.
          </p>
        </div>
        <Button onClick={createDataset} disabled={creating}>
          {creating ? "Creating…" : "New dataset"}
        </Button>
      </div>

      {error ? (
        <Card className="border-destructive/40">
          <CardHeader>
            <CardTitle className="text-base">Could not load datasets</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-between gap-4">
            <div className="text-sm text-muted-foreground">{error}</div>
            <Button variant="outline" onClick={load}>
              Retry
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-5 w-2/3" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-4 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : sorted.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">No datasets yet</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Click <span className="font-medium text-foreground">New dataset</span> to
            create your first dataset.
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {sorted.map((d) => (
            <Link
              key={d.id}
              href={`/datasets/${encodeURIComponent(d.id)}`}
              className="block"
            >
              <Card className="transition-colors hover:bg-muted/40">
                <CardHeader>
                  <CardTitle className="text-base">
                    {d.name?.trim() ? d.name : d.id}
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  <div className="flex items-center justify-between gap-3">
                    <div className="truncate">
                      ID: <span className="font-mono">{d.id}</span>
                    </div>
                    {typeof d.exampleCount === "number" ? (
                      <div className="shrink-0">{d.exampleCount} examples</div>
                    ) : null}
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

