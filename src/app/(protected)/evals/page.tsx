"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { fetchJSON } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";

type Dataset = { id: string; name?: string };

type EvalRunSummary = {
  id: string;
  datasetId?: string;
  model?: string;
  status?: string;
  createdAt?: string;
};

function normalizeDatasets(payload: unknown): Dataset[] {
  if (Array.isArray(payload)) return payload as Dataset[];
  if (payload && typeof payload === "object") {
    const p = payload as Record<string, unknown>;
    if (Array.isArray(p.datasets)) return p.datasets as Dataset[];
    if (Array.isArray(p.items)) return p.items as Dataset[];
  }
  return [];
}

function normalizeEvalRuns(payload: unknown): EvalRunSummary[] {
  if (Array.isArray(payload)) return payload as EvalRunSummary[];
  if (payload && typeof payload === "object") {
    const p = payload as Record<string, unknown>;
    if (Array.isArray(p.evals)) return p.evals as EvalRunSummary[];
    if (Array.isArray(p.runs)) return p.runs as EvalRunSummary[];
    if (Array.isArray(p.items)) return p.items as EvalRunSummary[];
  }
  return [];
}

function extractEvalRunId(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const p = payload as Record<string, unknown>;
  const direct =
    (typeof p.evalRunId === "string" && p.evalRunId) ||
    (typeof p.id === "string" && p.id);
  if (direct) return direct;
  if (p.run && typeof p.run === "object") {
    const r = p.run as Record<string, unknown>;
    const nested = (typeof r.id === "string" && r.id) || (typeof r.evalRunId === "string" && r.evalRunId);
    if (nested) return nested;
  }
  return null;
}

export default function EvalsPage() {
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [datasetsLoading, setDatasetsLoading] = useState(true);
  const [selectedDatasetId, setSelectedDatasetId] = useState<string>("");
  const [model, setModel] = useState<string>("");

  const [running, setRunning] = useState(false);
  const [lastRunId, setLastRunId] = useState<string | null>(null);

  const [recentRuns, setRecentRuns] = useState<EvalRunSummary[] | null>(null);

  const datasetsById = useMemo(() => {
    const m = new Map<string, Dataset>();
    for (const d of datasets) m.set(d.id, d);
    return m;
  }, [datasets]);

  const loadDatasets = async () => {
    setDatasetsLoading(true);
    try {
      const res = await fetchJSON<unknown>("/api/datasets", { method: "GET" });
      const list = normalizeDatasets(res);
      setDatasets(list);
      if (!selectedDatasetId && list.length > 0) {
        setSelectedDatasetId(list[0]!.id);
      }
    } catch (e) {
      toast({
        title: "Could not load datasets",
        description: e instanceof Error ? e.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setDatasetsLoading(false);
    }
  };

  const loadRecentRunsIfAvailable = async () => {
    try {
      const res = await fetchJSON<unknown>("/api/evals", { method: "GET" });
      setRecentRuns(normalizeEvalRuns(res));
    } catch {
      // If the backend doesn't implement GET /api/evals, we intentionally fall back
      // to local "last run" state only.
      setRecentRuns(null);
    }
  };

  useEffect(() => {
    void loadDatasets();
    void loadRecentRunsIfAvailable();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const runEval = async () => {
    if (!selectedDatasetId) {
      toast({
        title: "Select a dataset",
        description: "Choose a dataset before running an evaluation.",
        variant: "destructive",
      });
      return;
    }
    if (!model.trim()) {
      toast({
        title: "Enter a model",
        description: "Provide a model string (e.g. gpt-4.1-mini).",
        variant: "destructive",
      });
      return;
    }

    setRunning(true);
    try {
      const res = await fetchJSON<unknown>("/api/evals/run", {
        method: "POST",
        body: JSON.stringify({ datasetId: selectedDatasetId, model: model.trim() }),
      });
      const id = extractEvalRunId(res);
      if (!id) {
        toast({
          title: "Eval started",
          description: "Run created, but no evalRunId was returned.",
        });
        return;
      }
      setLastRunId(id);
      toast({ title: "Eval started" });
      await loadRecentRunsIfAvailable();
    } catch (e) {
      toast({
        title: "Could not run eval",
        description: e instanceof Error ? e.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Evaluations</h1>
        <p className="text-sm text-muted-foreground">
          Run evaluations against a dataset using backend APIs.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Run evaluation</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-2">
              <Label>Dataset</Label>
              <Select
                value={selectedDatasetId}
                onValueChange={setSelectedDatasetId}
                disabled={datasetsLoading || datasets.length === 0}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={
                      datasetsLoading ? "Loading…" : "Select a dataset"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {datasets.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.name?.trim() ? d.name : d.id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Model</Label>
              <Input
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder="e.g. gpt-4.1-mini"
              />
            </div>
            <div className="flex items-center justify-between gap-3">
              <Button variant="outline" onClick={loadDatasets} disabled={datasetsLoading}>
                Refresh datasets
              </Button>
              <Button onClick={runEval} disabled={running}>
                {running ? "Running…" : "Run eval"}
              </Button>
            </div>

            {lastRunId ? (
              <div className="rounded-md border p-3 text-sm">
                <div className="text-muted-foreground">Last run</div>
                <div className="mt-1 flex items-center justify-between gap-3">
                  <div className="truncate font-mono">{lastRunId}</div>
                  <Button asChild size="sm">
                    <Link href={`/evals/${encodeURIComponent(lastRunId)}`}>
                      View
                    </Link>
                  </Button>
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent runs</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            {recentRuns === null ? (
              <div className="text-sm text-muted-foreground">
                Backend does not expose recent runs (GET /api/evals). Start a run to
                get a link.
              </div>
            ) : recentRuns.length === 0 ? (
              <div className="text-sm text-muted-foreground">No recent runs.</div>
            ) : (
              <div className="grid gap-2">
                {recentRuns.slice(0, 10).map((r) => (
                  <Link
                    key={r.id}
                    href={`/evals/${encodeURIComponent(r.id)}`}
                    className="block rounded-md border p-3 transition-colors hover:bg-muted/30"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate font-mono text-sm">{r.id}</div>
                        <div className="mt-1 truncate text-xs text-muted-foreground">
                          {r.datasetId
                            ? `dataset: ${datasetsById.get(r.datasetId)?.name ?? r.datasetId}`
                            : "dataset: (unknown)"}
                          {r.model ? ` · model: ${r.model}` : null}
                          {r.status ? ` · ${r.status}` : null}
                        </div>
                      </div>
                      <div className="shrink-0 text-xs text-muted-foreground">
                        {r.createdAt ? new Date(r.createdAt).toLocaleString() : ""}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

