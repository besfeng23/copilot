"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { fetchJSON } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type EvalRun = {
  id: string;
  status?: string;
  summary?: any;
  createdAt?: string;
  datasetId?: string;
  model?: string;
};

type EvalResultRow = {
  exampleId?: string;
  exampleTitle: string;
  pass?: boolean;
  score?: number | null;
  reasons?: string[] | string | null;
  latency?: number | null;
  expected?: any;
  output?: any;
};

function unwrap<T>(payload: any, key: string): T {
  if (payload && typeof payload === "object" && key in payload) return payload[key] as T;
  return payload as T;
}

function formatReasons(reasons: EvalResultRow["reasons"]): string {
  if (!reasons) return "—";
  if (Array.isArray(reasons)) return reasons.filter(Boolean).join("; ") || "—";
  if (typeof reasons === "string") return reasons || "—";
  return "—";
}

function pretty(value: any): string {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value ?? null, null, 2);
  } catch {
    return String(value ?? "");
  }
}

export default function EvalRunPage() {
  const router = useRouter();
  const params = useParams<{ evalRunId: string }>();
  const evalRunId = params.evalRunId;
  const { user } = useAuth();

  const [run, setRun] = useState<EvalRun | null>(null);
  const [results, setResults] = useState<EvalResultRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [resultsLoading, setResultsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  const sortedResults = useMemo(() => {
    return [...results];
  }, [results]);

  async function loadRun() {
    setLoading(true);
    setError(null);
    try {
      const idToken = await user?.getIdToken();
      const res = await fetchJSON<any>(`/api/evals/${encodeURIComponent(evalRunId)}`, {
        idToken,
        cache: "no-store",
      });
      setRun(unwrap<EvalRun>(res, "eval"));
    } catch (err: any) {
      console.error("API error", err?.message, err?.status, err?.code);
      if (err?.status === 401) {
        router.replace("/login?next=" + encodeURIComponent(`/evals/${evalRunId}`));
        return;
      }
      setError(err?.message ?? "Failed to load evaluation run.");
    } finally {
      setLoading(false);
    }
  }

  async function loadResults() {
    setResultsLoading(true);
    setError(null);
    try {
      const idToken = await user?.getIdToken();
      const res = await fetchJSON<any>(`/api/evals/${encodeURIComponent(evalRunId)}/results`, {
        idToken,
        cache: "no-store",
      });
      const list = unwrap<EvalResultRow[]>(res, "results");
      setResults(Array.isArray(list) ? list : []);
    } catch (err: any) {
      console.error("API error", err?.message, err?.status, err?.code);
      if (err?.status === 401) {
        router.replace("/login?next=" + encodeURIComponent(`/evals/${evalRunId}`));
        return;
      }
      setError(err?.message ?? "Failed to load evaluation results.");
    } finally {
      setResultsLoading(false);
    }
  }

  useEffect(() => {
    void loadRun();
    void loadResults();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <div className="text-sm text-muted-foreground">
          <Link className="hover:underline" href="/evals">
            Evaluations
          </Link>{" "}
          / {evalRunId}
        </div>
        <div className="flex items-start justify-between gap-4">
          <h1 className="text-2xl font-semibold">Evaluation run</h1>
          <div className="flex gap-2">
            <Button variant="outline" onClick={loadRun} disabled={loading}>
              Refresh
            </Button>
            <Button variant="outline" onClick={loadResults} disabled={resultsLoading}>
              Refresh results
            </Button>
          </div>
        </div>
      </div>

      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Something went wrong</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Status</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div>
            <span className="text-muted-foreground">Run ID:</span>{" "}
            <span className="font-mono">{evalRunId}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Status:</span>{" "}
            <span className="font-medium">{run?.status ?? (loading ? "Loading..." : "—")}</span>
          </div>
          {run?.datasetId ? (
            <div>
              <span className="text-muted-foreground">Dataset:</span> {run.datasetId}
            </div>
          ) : null}
          {run?.model ? (
            <div>
              <span className="text-muted-foreground">Model:</span> {run.model}
            </div>
          ) : null}
          {typeof run?.summary !== "undefined" ? (
            <div className="mt-3 rounded-md border bg-muted/40 p-3">
              <div className="mb-1 text-xs font-medium text-muted-foreground">Summary</div>
              <pre className="overflow-x-auto whitespace-pre-wrap text-xs">{pretty(run.summary)}</pre>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Results</CardTitle>
        </CardHeader>
        <CardContent>
          {resultsLoading ? (
            <div className="text-sm text-muted-foreground">Loading results…</div>
          ) : sortedResults.length === 0 ? (
            <div className="text-sm text-muted-foreground">No results yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>exampleTitle</TableHead>
                    <TableHead>pass</TableHead>
                    <TableHead>score</TableHead>
                    <TableHead>reasons</TableHead>
                    <TableHead>latency</TableHead>
                    <TableHead className="text-right">Details</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedResults.map((r, idx) => {
                    const key = r.exampleId ?? `${r.exampleTitle}-${idx}`;
                    const expanded = expandedKey === key;
                    return (
                      <>
                        <TableRow key={key}>
                          <TableCell className="font-medium">{r.exampleTitle}</TableCell>
                          <TableCell>{typeof r.pass === "boolean" ? (r.pass ? "true" : "false") : "—"}</TableCell>
                          <TableCell>{typeof r.score === "number" ? r.score : "—"}</TableCell>
                          <TableCell className="max-w-[480px] truncate">{formatReasons(r.reasons)}</TableCell>
                          <TableCell>{typeof r.latency === "number" ? `${r.latency}ms` : "—"}</TableCell>
                          <TableCell className="text-right">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setExpandedKey(expanded ? null : key)}
                            >
                              {expanded ? "Hide" : "Show"}
                            </Button>
                          </TableCell>
                        </TableRow>
                        {expanded ? (
                          <TableRow key={`${key}-expanded`}>
                            <TableCell colSpan={6}>
                              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                                <div className="rounded-md border bg-muted/30 p-3">
                                  <div className="mb-1 text-xs font-medium text-muted-foreground">expected</div>
                                  <pre className="overflow-x-auto whitespace-pre-wrap text-xs">{pretty(r.expected)}</pre>
                                </div>
                                <div className="rounded-md border bg-muted/30 p-3">
                                  <div className="mb-1 text-xs font-medium text-muted-foreground">output</div>
                                  <pre className="overflow-x-auto whitespace-pre-wrap text-xs">{pretty(r.output)}</pre>
                                </div>
                              </div>
                            </TableCell>
                          </TableRow>
                        ) : null}
                      </>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

