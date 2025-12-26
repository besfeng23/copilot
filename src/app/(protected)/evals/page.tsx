"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { fetchJSON } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type DatasetListItem = { id: string; name: string };
type EvalRunListItem = {
  id: string;
  status?: string | null;
  datasetId?: string | null;
  model?: string | null;
  createdAt?: string | null;
};

function getErrParts(err: unknown) {
  const e = err as any;
  return { message: e?.message, status: e?.status, code: e?.code };
}

export default function EvalsPage() {
  const { user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  const [datasets, setDatasets] = useState<DatasetListItem[]>([]);
  const [datasetId, setDatasetId] = useState("");
  const [model, setModel] = useState("");

  const [loadingDatasets, setLoadingDatasets] = useState(true);
  const [running, setRunning] = useState(false);

  const [recentEvals, setRecentEvals] = useState<EvalRunListItem[] | null>(null);
  const [loadingRecent, setLoadingRecent] = useState(false);

  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const canRun = useMemo(() => datasetId && model.trim() && !running, [datasetId, model, running]);

  const getIdToken = useCallback(async () => {
    if (!user) throw new Error("Not authenticated");
    return await user.getIdToken();
  }, [user]);

  const loadDatasets = useCallback(async () => {
    setLoadingDatasets(true);
    setErrorMessage(null);
    try {
      const idToken = await getIdToken();
      const data = await fetchJSON<{ datasets?: DatasetListItem[] } | DatasetListItem[]>(
        "/api/datasets",
        { headers: { Authorization: `Bearer ${idToken}` } }
      );
      const list = Array.isArray(data) ? data : data.datasets || [];
      setDatasets(list);
      if (!datasetId && list.length > 0) setDatasetId(list[0].id);
    } catch (err) {
      const { message, status, code } = getErrParts(err);
      console.error("API error", "message=", message, "status=", status, "code=", code);
      if (status === 401) {
        router.replace(`/login?next=${encodeURIComponent(pathname)}`);
        return;
      }
      setErrorMessage(message || "Failed to load datasets.");
    } finally {
      setLoadingDatasets(false);
    }
  }, [datasetId, getIdToken, pathname, router]);

  const loadRecentEvalsIfAvailable = useCallback(async () => {
    setLoadingRecent(true);
    try {
      const idToken = await getIdToken();
      const data = await fetchJSON<{ evals?: EvalRunListItem[] } | EvalRunListItem[]>(
        "/api/evals",
        { headers: { Authorization: `Bearer ${idToken}` } }
      );
      const list = Array.isArray(data) ? data : data.evals || [];
      setRecentEvals(list);
    } catch (err) {
      const { status } = getErrParts(err);
      if (status === 404) {
        setRecentEvals(null);
        return;
      }
      const { message, code } = getErrParts(err);
      console.error("API error", "message=", message, "status=", status, "code=", code);
      if (status === 401) {
        router.replace(`/login?next=${encodeURIComponent(pathname)}`);
        return;
      }
      // Optional list; don't block the page if it fails.
      setRecentEvals(null);
    } finally {
      setLoadingRecent(false);
    }
  }, [getIdToken, pathname, router]);

  useEffect(() => {
    void loadDatasets();
    void loadRecentEvalsIfAvailable();
  }, [loadDatasets, loadRecentEvalsIfAvailable]);

  const handleRun = async () => {
    setErrorMessage(null);
    if (!datasetId) {
      setErrorMessage("Please select a dataset.");
      return;
    }
    if (!model.trim()) {
      setErrorMessage("Please enter a model.");
      return;
    }

    setRunning(true);
    try {
      const idToken = await getIdToken();
      const res = await fetchJSON<any>("/api/evals/run", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${idToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ datasetId, model: model.trim() }),
      });

      const evalRunId = res?.evalRunId || res?.id;
      if (!evalRunId) {
        setErrorMessage("Evaluation started, but no run ID was returned.");
        return;
      }
      router.push(`/evals/${encodeURIComponent(String(evalRunId))}`);
    } catch (err) {
      const { message, status, code } = getErrParts(err);
      console.error("API error", "message=", message, "status=", status, "code=", code);
      if (status === 401) {
        router.replace(`/login?next=${encodeURIComponent(pathname)}`);
        return;
      }
      setErrorMessage(message || "Failed to start evaluation.");
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Evaluations</h1>
        <p className="text-sm text-muted-foreground">Run evaluations against a dataset.</p>
      </div>

      {errorMessage ? (
        <Card className="p-4">
          <div className="text-sm text-destructive">{errorMessage}</div>
        </Card>
      ) : null}

      <Card className="p-4">
        <div className="space-y-3">
          <div className="text-sm font-medium">Run evaluation</div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <div className="text-sm">Dataset</div>
              {loadingDatasets ? (
                <div className="text-sm text-muted-foreground">Loading datasets…</div>
              ) : datasets.length === 0 ? (
                <div className="text-sm text-muted-foreground">
                  No datasets available. Create one in{" "}
                  <Link href="/datasets" className="underline">
                    Datasets
                  </Link>
                  .
                </div>
              ) : (
                <select
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={datasetId}
                  onChange={(e) => setDatasetId(e.target.value)}
                >
                  {datasets.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div className="space-y-2">
              <div className="text-sm">Model</div>
              <Input
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder="e.g. gpt-4.1-mini"
              />
            </div>
          </div>

          <div className="pt-1">
            <Button onClick={handleRun} disabled={!canRun}>
              {running ? "Starting..." : "Run evaluation"}
            </Button>
          </div>
        </div>
      </Card>

      {loadingRecent ? (
        <div className="text-sm text-muted-foreground">Loading recent evaluations…</div>
      ) : recentEvals && recentEvals.length > 0 ? (
        <div className="space-y-3">
          <div className="text-sm font-medium">Recent evaluations</div>
          {recentEvals.map((ev) => (
            <Card key={ev.id} className="p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="font-medium">
                    <Link href={`/evals/${encodeURIComponent(ev.id)}`} className="hover:underline">
                      {ev.id}
                    </Link>
                  </div>
                  <div className="mt-1 text-sm text-muted-foreground">
                    {ev.status ? `status: ${ev.status}` : null}
                    {ev.status && ev.model ? " · " : null}
                    {ev.model ? `model: ${ev.model}` : null}
                  </div>
                </div>
                {ev.createdAt ? (
                  <div className="shrink-0 text-sm text-muted-foreground">{ev.createdAt}</div>
                ) : null}
              </div>
            </Card>
          ))}
        </div>
      ) : null}
    </div>
  );
}

