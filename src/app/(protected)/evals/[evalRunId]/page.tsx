"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import Link from "next/link";

import { fetchJSON } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

type EvalRun = {
  id: string;
  status?: string;
  datasetId?: string;
  model?: string;
  createdAt?: string;
  startedAt?: string;
  finishedAt?: string;
  summary?: unknown;
};

type EvalResult = {
  id?: string;
  exampleId?: string;
  exampleTitle?: string;
  title?: string;
  pass?: boolean;
  score?: number;
  reasons?: string | string[] | unknown;
  latencyMs?: number;
  latency?: number;
  expected?: unknown;
  output?: unknown;
};

function normalizeEvalRun(payload: unknown, evalRunId: string): EvalRun {
  if (payload && typeof payload === "object") {
    const p = payload as Record<string, unknown>;
    if (p.run && typeof p.run === "object") return p.run as EvalRun;
    if (p.eval && typeof p.eval === "object") return p.eval as EvalRun;
    if (typeof p.id === "string") return p as EvalRun;
  }
  return { id: evalRunId };
}

function normalizeResults(payload: unknown): EvalResult[] {
  if (Array.isArray(payload)) return payload as EvalResult[];
  if (payload && typeof payload === "object") {
    const p = payload as Record<string, unknown>;
    if (Array.isArray(p.results)) return p.results as EvalResult[];
    if (Array.isArray(p.items)) return p.items as EvalResult[];
  }
  return [];
}

function pretty(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export default function EvalRunPage({
  params,
}: {
  params: { evalRunId: string };
}) {
  const evalRunId = params.evalRunId;

  const [run, setRun] = useState<EvalRun | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [runLoading, setRunLoading] = useState(true);

  const [results, setResults] = useState<EvalResult[]>([]);
  const [resultsError, setResultsError] = useState<string | null>(null);
  const [resultsLoading, setResultsLoading] = useState(true);

  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const sorted = useMemo(() => {
    return [...results];
  }, [results]);

  const toggleRow = (idx: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const loadRun = async () => {
    setRunLoading(true);
    setRunError(null);
    try {
      const res = await fetchJSON<unknown>(`/api/evals/${evalRunId}`, {
        method: "GET",
      });
      setRun(normalizeEvalRun(res, evalRunId));
    } catch (e) {
      setRunError(e instanceof Error ? e.message : "Failed to load eval run.");
      setRun({ id: evalRunId });
    } finally {
      setRunLoading(false);
    }
  };

  const loadResults = async () => {
    setResultsLoading(true);
    setResultsError(null);
    try {
      const res = await fetchJSON<unknown>(`/api/evals/${evalRunId}/results`, {
        method: "GET",
      });
      setResults(normalizeResults(res));
    } catch (e) {
      setResultsError(
        e instanceof Error ? e.message : "Failed to load results."
      );
      setResults([]);
    } finally {
      setResultsLoading(false);
    }
  };

  useEffect(() => {
    void loadRun();
    void loadResults();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [evalRunId]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/evals">← Back</Link>
          </Button>
          <h1 className="mt-2 truncate text-2xl font-semibold">
            Eval run{" "}
            <span className="font-mono text-xl text-muted-foreground">
              {evalRunId}
            </span>
          </h1>
          <div className="mt-2 flex flex-wrap gap-2 text-sm text-muted-foreground">
            {run?.status ? (
              <Badge variant={run.status === "completed" ? "default" : "secondary"}>
                {run.status}
              </Badge>
            ) : null}
            {run?.datasetId ? (
              <span>
                dataset: <span className="font-mono">{run.datasetId}</span>
              </span>
            ) : null}
            {run?.model ? <span>model: {run.model}</span> : null}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => void loadRun()} disabled={runLoading}>
            Refresh status
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void loadResults()}
            disabled={resultsLoading}
          >
            Refresh results
          </Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-base">Status</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {runError ? (
              <div className="rounded-md border border-destructive/40 p-3">
                {runError}
              </div>
            ) : null}
            {runLoading ? (
              <div>Loading…</div>
            ) : (
              <div className="grid gap-2">
                <div>
                  <span className="font-medium text-foreground">Status:</span>{" "}
                  {run?.status ?? "unknown"}
                </div>
                {run?.createdAt ? (
                  <div>
                    <span className="font-medium text-foreground">Created:</span>{" "}
                    {new Date(run.createdAt).toLocaleString()}
                  </div>
                ) : null}
                {run?.startedAt ? (
                  <div>
                    <span className="font-medium text-foreground">Started:</span>{" "}
                    {new Date(run.startedAt).toLocaleString()}
                  </div>
                ) : null}
                {run?.finishedAt ? (
                  <div>
                    <span className="font-medium text-foreground">Finished:</span>{" "}
                    {new Date(run.finishedAt).toLocaleString()}
                  </div>
                ) : null}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Summary</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            <pre className="max-h-64 overflow-auto rounded-md bg-muted p-3 text-xs">
              {pretty(run?.summary ?? {})}
            </pre>
          </CardContent>
        </Card>
      </div>

      <div className="mt-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Results</CardTitle>
          </CardHeader>
          <CardContent>
            {resultsError ? (
              <div className="mb-3 rounded-md border border-destructive/40 p-3 text-sm text-muted-foreground">
                {resultsError}
              </div>
            ) : null}

            {resultsLoading ? (
              <div className="text-sm text-muted-foreground">Loading…</div>
            ) : sorted.length === 0 ? (
              <div className="text-sm text-muted-foreground">No results yet.</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[44px]" />
                    <TableHead>Example title</TableHead>
                    <TableHead className="w-[90px]">Pass</TableHead>
                    <TableHead className="w-[90px]">Score</TableHead>
                    <TableHead>Reasons</TableHead>
                    <TableHead className="w-[120px]">Latency</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sorted.map((r, idx) => {
                    const title = r.exampleTitle ?? r.title ?? r.exampleId ?? r.id ?? `#${idx + 1}`;
                    const latency = r.latencyMs ?? r.latency;
                    const isOpen = expanded.has(idx);
                    return (
                      <Fragment key={`${r.id ?? r.exampleId ?? idx}`}>
                        <TableRow>
                          <TableCell className="p-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => toggleRow(idx)}
                            >
                              {isOpen ? "–" : "+"}
                            </Button>
                          </TableCell>
                          <TableCell className="max-w-[360px] truncate">
                            {String(title)}
                          </TableCell>
                          <TableCell>
                            {typeof r.pass === "boolean" ? (
                              <Badge variant={r.pass ? "default" : "destructive"}>
                                {r.pass ? "pass" : "fail"}
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {typeof r.score === "number" ? r.score : "—"}
                          </TableCell>
                          <TableCell className="max-w-[420px] truncate text-muted-foreground">
                            {r.reasons
                              ? typeof r.reasons === "string"
                                ? r.reasons
                                : pretty(r.reasons)
                              : "—"}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {typeof latency === "number" ? `${latency} ms` : "—"}
                          </TableCell>
                        </TableRow>
                        {isOpen ? (
                          <TableRow>
                            <TableCell colSpan={6} className="bg-muted/30">
                              <div className="grid gap-4 p-2 lg:grid-cols-2">
                                <div>
                                  <div className="mb-1 text-xs font-medium text-foreground">
                                    Expected
                                  </div>
                                  <pre className="max-h-64 overflow-auto rounded-md bg-background p-3 text-xs">
                                    {pretty(r.expected)}
                                  </pre>
                                </div>
                                <div>
                                  <div className="mb-1 text-xs font-medium text-foreground">
                                    Output
                                  </div>
                                  <pre className="max-h-64 overflow-auto rounded-md bg-background p-3 text-xs">
                                    {pretty(r.output)}
                                  </pre>
                                </div>
                              </div>
                            </TableCell>
                          </TableRow>
                        ) : null}
                      </Fragment>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

