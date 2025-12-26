"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { fetchJSON } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type Dataset = { id: string; name: string };
type EvalRun = { id: string; status?: string; createdAt?: string; datasetId?: string; model?: string };

function extractDatasets(payload: any): Dataset[] {
  if (Array.isArray(payload)) return payload as Dataset[];
  if (Array.isArray(payload?.datasets)) return payload.datasets as Dataset[];
  if (Array.isArray(payload?.data)) return payload.data as Dataset[];
  return [];
}

function extractRuns(payload: any): EvalRun[] {
  if (Array.isArray(payload)) return payload as EvalRun[];
  if (Array.isArray(payload?.runs)) return payload.runs as EvalRun[];
  if (Array.isArray(payload?.evals)) return payload.evals as EvalRun[];
  if (Array.isArray(payload?.data)) return payload.data as EvalRun[];
  return [];
}

export default function EvalsPage() {
  const router = useRouter();
  const { user } = useAuth();

  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [datasetId, setDatasetId] = useState<string>("");
  const [model, setModel] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [recentRuns, setRecentRuns] = useState<EvalRun[] | null>(null);

  const datasetOptions = useMemo(() => {
    return [...datasets].sort((a, b) => a.name.localeCompare(b.name));
  }, [datasets]);

  async function loadDatasets() {
    setLoading(true);
    setError(null);
    try {
      const idToken = await user?.getIdToken();
      const res = await fetchJSON<any>("/api/datasets", { idToken, cache: "no-store" });
      const list = extractDatasets(res);
      setDatasets(list);
      if (!datasetId && list.length) setDatasetId(list[0].id);
    } catch (err: any) {
      console.error("API error", err?.message, err?.status, err?.code);
      if (err?.status === 401) {
        router.replace("/login?next=" + encodeURIComponent("/evals"));
        return;
      }
      setError(err?.message ?? "Failed to load datasets.");
    } finally {
      setLoading(false);
    }
  }

  async function maybeLoadRecentRuns() {
    try {
      const idToken = await user?.getIdToken();
      const res = await fetchJSON<any>("/api/evals", { idToken, cache: "no-store" });
      const runs = extractRuns(res);
      setRecentRuns(runs);
    } catch (err: any) {
      console.error("API error", err?.message, err?.status, err?.code);
      // Optional endpoint: ignore 404/405 and don't invent UI.
      if (err?.status === 404 || err?.status === 405) return;
      if (err?.status === 401) {
        router.replace("/login?next=" + encodeURIComponent("/evals"));
        return;
      }
      // Other errors: still ignore listing UI; keep run form usable.
      setRecentRuns(null);
    }
  }

  async function runEval() {
    if (!datasetId.trim() || !model.trim()) return;
    setRunning(true);
    setError(null);
    try {
      const idToken = await user?.getIdToken();
      const res = await fetchJSON<any>("/api/evals/run", {
        method: "POST",
        idToken,
        body: { datasetId, model: model.trim() },
      });
      const evalRunId =
        res?.evalRunId ?? res?.evalRun?.id ?? res?.run?.id ?? res?.id ?? null;
      if (!evalRunId || typeof evalRunId !== "string") {
        setError("Evaluation started, but no run id was returned.");
        return;
      }
      router.push(`/evals/${encodeURIComponent(evalRunId)}`);
    } catch (err: any) {
      console.error("API error", err?.message, err?.status, err?.code);
      if (err?.status === 401) {
        router.replace("/login?next=" + encodeURIComponent("/evals"));
        return;
      }
      setError(err?.message ?? "Failed to run evaluation.");
    } finally {
      setRunning(false);
    }
  }

  useEffect(() => {
    void loadDatasets();
    void maybeLoadRecentRuns();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">Evaluations</h1>
        <p className="text-sm text-muted-foreground">
          Run an evaluation against a dataset.
        </p>
      </div>

      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Something went wrong</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Run evaluation</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <div className="text-sm font-medium">Dataset</div>
              <Select value={datasetId} onValueChange={setDatasetId} disabled={loading || datasetOptions.length === 0}>
                <SelectTrigger>
                  <SelectValue placeholder={loading ? "Loading..." : "Select dataset"} />
                </SelectTrigger>
                <SelectContent>
                  {datasetOptions.map((ds) => (
                    <SelectItem key={ds.id} value={ds.id}>
                      {ds.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {datasetOptions.length === 0 && !loading ? (
                <div className="text-xs text-muted-foreground">
                  No datasets found. Create one on{" "}
                  <Link href="/datasets" className="underline">
                    Datasets
                  </Link>
                  .
                </div>
              ) : null}
            </div>
            <div className="space-y-2">
              <div className="text-sm font-medium">Model</div>
              <Input value={model} onChange={(e) => setModel(e.target.value)} placeholder="e.g. gpt-4.1-mini" />
            </div>
          </div>

          <Button onClick={runEval} disabled={running || loading || !datasetId.trim() || !model.trim()}>
            {running ? "Starting..." : "Run evaluation"}
          </Button>
        </CardContent>
      </Card>

      {Array.isArray(recentRuns) ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Recent runs</CardTitle>
          </CardHeader>
          <CardContent>
            {recentRuns.length === 0 ? (
              <div className="text-sm text-muted-foreground">No recent runs.</div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Run</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="hidden md:table-cell">Model</TableHead>
                      <TableHead className="text-right">Open</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recentRuns.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="font-medium">{r.id}</TableCell>
                        <TableCell>{r.status ?? "—"}</TableCell>
                        <TableCell className="hidden md:table-cell">{r.model ?? "—"}</TableCell>
                        <TableCell className="text-right">
                          <Link className="underline" href={`/evals/${encodeURIComponent(r.id)}`}>
                            View
                          </Link>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

