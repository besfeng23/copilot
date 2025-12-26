"use client";

import Link from "next/link";
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { useParams, usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { fetchJSON } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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
  status?: string | null;
  datasetId?: string | null;
  model?: string | null;
  createdAt?: string | null;
  finishedAt?: string | null;
  summary?: Record<string, unknown> | null;
};

type EvalResultRow = {
  id?: string;
  exampleId?: string;
  exampleTitle?: string | null;
  pass?: boolean | null;
  score?: number | null;
  reasons?: string | string[] | null;
  latency?: number | null;
  expected?: unknown;
  output?: unknown;
};

function getErrParts(err: unknown) {
  const e = err as any;
  return { message: e?.message, status: e?.status, code: e?.code };
}

function stringifyMaybeJSON(value: unknown) {
  if (value == null) return "";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export default function EvalRunDetailPage() {
  const params = useParams<{ evalRunId: string }>();
  const evalRunId = params?.evalRunId;
  const { user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  const [run, setRun] = useState<EvalRun | null>(null);
  const [results, setResults] = useState<EvalResultRow[]>([]);

  const [loading, setLoading] = useState(true);
  const [loadingResults, setLoadingResults] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [notMember, setNotMember] = useState(false);

  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  const getIdToken = useCallback(async () => {
    if (!user) throw new Error("Not authenticated");
    return await user.getIdToken();
  }, [user]);

  const loadRun = useCallback(async () => {
    if (!evalRunId) return;
    setLoading(true);
    setErrorMessage(null);
    setNotMember(false);
    try {
      const idToken = await getIdToken();
      const data = await fetchJSON<EvalRun>(`/api/evals/${encodeURIComponent(evalRunId)}`, {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      setRun(data);
    } catch (err) {
      const { message, status, code } = getErrParts(err);
      console.error("API error", "message=", message, "status=", status, "code=", code);
      if (status === 401) {
        router.replace(`/login?next=${encodeURIComponent(pathname)}`);
        return;
      }
      if (status === 403 && code === "NOT_A_MEMBER") {
        setNotMember(true);
        return;
      }
      setErrorMessage(message || "Failed to load evaluation run.");
    } finally {
      setLoading(false);
    }
  }, [evalRunId, getIdToken, pathname, router]);

  const loadResults = useCallback(async () => {
    if (!evalRunId) return;
    setLoadingResults(true);
    setErrorMessage(null);
    setNotMember(false);
    try {
      const idToken = await getIdToken();
      const data = await fetchJSON<{ results?: EvalResultRow[] } | EvalResultRow[]>(
        `/api/evals/${encodeURIComponent(evalRunId)}/results`,
        { headers: { Authorization: `Bearer ${idToken}` } }
      );
      const list = Array.isArray(data) ? data : data.results || [];
      setResults(list);
    } catch (err) {
      const { message, status, code } = getErrParts(err);
      console.error("API error", "message=", message, "status=", status, "code=", code);
      if (status === 401) {
        router.replace(`/login?next=${encodeURIComponent(pathname)}`);
        return;
      }
      if (status === 403 && code === "NOT_A_MEMBER") {
        setNotMember(true);
        return;
      }
      setErrorMessage(message || "Failed to load evaluation results.");
    } finally {
      setLoadingResults(false);
    }
  }, [evalRunId, getIdToken, pathname, router]);

  useEffect(() => {
    void loadRun();
    void loadResults();
  }, [loadRun, loadResults]);

  const rowsWithKeys = useMemo(() => {
    return results.map((r, idx) => ({
      ...r,
      _key: r.id || r.exampleId || `${idx}`,
    }));
  }, [results]);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-sm text-muted-foreground">
            <Link href="/evals" className="hover:underline">
              Evaluations
            </Link>{" "}
            / <span className="font-mono">{evalRunId}</span>
          </div>
          <h1 className="truncate text-2xl font-semibold">Evaluation run</h1>
        </div>
        <Button
          variant="outline"
          onClick={() => {
            void loadRun();
            void loadResults();
          }}
          disabled={loading || loadingResults}
        >
          Refresh
        </Button>
      </div>

      {notMember ? (
        <Card className="p-4">
          <div className="space-y-2">
            <div className="text-sm font-medium">Access not initialized</div>
            <div className="text-sm text-muted-foreground">
              You don’t have access to evaluations yet. Ask an admin to add you to the
              project.
            </div>
          </div>
        </Card>
      ) : null}

      {errorMessage ? (
        <Card className="p-4">
          <div className="text-sm text-destructive">{errorMessage}</div>
        </Card>
      ) : null}

      {loading ? (
        <div className="text-sm text-muted-foreground">Loading run…</div>
      ) : run ? (
        <Card className="p-4">
          <div className="grid gap-2 sm:grid-cols-2">
            <div>
              <div className="text-xs uppercase text-muted-foreground">Run ID</div>
              <div className="font-mono text-sm">{run.id}</div>
            </div>
            {run.status ? (
              <div>
                <div className="text-xs uppercase text-muted-foreground">Status</div>
                <div className="text-sm">{run.status}</div>
              </div>
            ) : null}
            {run.datasetId ? (
              <div>
                <div className="text-xs uppercase text-muted-foreground">Dataset</div>
                <div className="text-sm">
                  <Link href={`/datasets/${encodeURIComponent(run.datasetId)}`} className="underline">
                    {run.datasetId}
                  </Link>
                </div>
              </div>
            ) : null}
            {run.model ? (
              <div>
                <div className="text-xs uppercase text-muted-foreground">Model</div>
                <div className="text-sm">{run.model}</div>
              </div>
            ) : null}
            {run.createdAt ? (
              <div>
                <div className="text-xs uppercase text-muted-foreground">Created</div>
                <div className="text-sm">{run.createdAt}</div>
              </div>
            ) : null}
            {run.finishedAt ? (
              <div>
                <div className="text-xs uppercase text-muted-foreground">Finished</div>
                <div className="text-sm">{run.finishedAt}</div>
              </div>
            ) : null}
          </div>

          {run.summary ? (
            <div className="mt-4">
              <div className="text-xs uppercase text-muted-foreground">Summary</div>
              <pre className="mt-1 whitespace-pre-wrap rounded-md bg-muted p-3 text-xs">
                {stringifyMaybeJSON(run.summary)}
              </pre>
            </div>
          ) : null}
        </Card>
      ) : null}

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-sm font-medium">Results</div>
          {loadingResults ? (
            <div className="text-sm text-muted-foreground">Loading…</div>
          ) : (
            <div className="text-sm text-muted-foreground">{results.length} rows</div>
          )}
        </div>

        <Card className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Example</TableHead>
                <TableHead>Pass</TableHead>
                <TableHead>Score</TableHead>
                <TableHead>Reasons</TableHead>
                <TableHead className="text-right">Latency</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rowsWithKeys.map((r) => {
                const key = r._key;
                const expanded = expandedKey === key;
                const reasonsText = Array.isArray(r.reasons) ? r.reasons.join("; ") : r.reasons;
                const passText =
                  r.pass == null ? "" : r.pass ? "pass" : "fail";
                const scoreText =
                  typeof r.score === "number" ? String(r.score) : "";
                const latencyText =
                  typeof r.latency === "number" ? `${r.latency}ms` : "";

                return (
                  <Fragment key={key}>
                    <TableRow
                      className="cursor-pointer"
                      onClick={() => setExpandedKey(expanded ? null : key)}
                    >
                      <TableCell className="max-w-[420px]">
                        <div className="truncate font-medium">
                          {r.exampleTitle || <span className="text-muted-foreground">(untitled)</span>}
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {r.exampleId ? `exampleId: ${r.exampleId}` : null}
                        </div>
                      </TableCell>
                      <TableCell>{passText}</TableCell>
                      <TableCell>{scoreText}</TableCell>
                      <TableCell className="max-w-[520px]">
                        <div className="truncate">{reasonsText || ""}</div>
                      </TableCell>
                      <TableCell className="text-right">{latencyText}</TableCell>
                    </TableRow>

                    {expanded ? (
                      <TableRow>
                        <TableCell colSpan={5}>
                          <div className="grid gap-3 sm:grid-cols-2">
                            <div>
                              <div className="text-xs uppercase text-muted-foreground">Expected</div>
                              <pre className="mt-1 whitespace-pre-wrap rounded-md bg-muted p-3 text-xs">
                                {stringifyMaybeJSON(r.expected) || "(empty)"}
                              </pre>
                            </div>
                            <div>
                              <div className="text-xs uppercase text-muted-foreground">Output</div>
                              <pre className="mt-1 whitespace-pre-wrap rounded-md bg-muted p-3 text-xs">
                                {stringifyMaybeJSON(r.output) || "(empty)"}
                              </pre>
                            </div>
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </Fragment>
                );
              })}

              {!loadingResults && rowsWithKeys.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-muted-foreground">
                    No results yet.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </Card>
      </div>
    </div>
  );
}

