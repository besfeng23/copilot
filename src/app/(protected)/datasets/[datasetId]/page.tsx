"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { fetchJSON } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Dataset = {
  id: string;
  name: string;
  description?: string | null;
  createdAt?: string;
};

type Example = {
  id: string;
  title: string;
  mode?: string | null;
  tags?: string[] | null;
  input?: {
    userGoal?: string | null;
    constraintsSnapshot?: string | null;
    memorySnapshot?: string | null;
  };
  expected?: {
    type: "text" | "json";
    value: any;
  };
  updatedAt?: string;
};

function unwrap<T>(payload: any, key: string): T {
  if (payload && typeof payload === "object" && key in payload) return payload[key] as T;
  return payload as T;
}

function toTags(csv: string): string[] {
  return csv
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}

function stringifyExpectedValue(expected: Example["expected"]): string {
  if (!expected) return "";
  if (expected.type === "json") {
    try {
      return JSON.stringify(expected.value ?? null, null, 2);
    } catch {
      return "";
    }
  }
  return typeof expected.value === "string" ? expected.value : String(expected.value ?? "");
}

export default function DatasetDetailPage() {
  const router = useRouter();
  const params = useParams<{ datasetId: string }>();
  const datasetId = params.datasetId;

  const { user } = useAuth();

  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [examples, setExamples] = useState<Example[]>([]);
  const [loading, setLoading] = useState(true);
  const [examplesLoading, setExamplesLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [mode, setMode] = useState("");
  const [tagsCsv, setTagsCsv] = useState("");
  const [userGoal, setUserGoal] = useState("");
  const [constraintsSnapshot, setConstraintsSnapshot] = useState("");
  const [memorySnapshot, setMemorySnapshot] = useState("");
  const [expectedType, setExpectedType] = useState<"text" | "json">("text");
  const [expectedValue, setExpectedValue] = useState("");

  const sortedExamples = useMemo(() => {
    return [...examples].sort((a, b) => (a.title ?? "").localeCompare(b.title ?? ""));
  }, [examples]);

  async function loadDataset() {
    setLoading(true);
    setError(null);
    try {
      const idToken = await user?.getIdToken();
      const res = await fetchJSON<any>(`/api/datasets/${encodeURIComponent(datasetId)}`, {
        idToken,
        cache: "no-store",
      });
      setDataset(unwrap<Dataset>(res, "dataset"));
    } catch (err: any) {
      console.error("API error", err?.message, err?.status, err?.code);
      if (err?.status === 401) {
        router.replace("/login?next=" + encodeURIComponent(`/datasets/${datasetId}`));
        return;
      }
      setError(err?.message ?? "Failed to load dataset.");
    } finally {
      setLoading(false);
    }
  }

  async function loadExamples() {
    setExamplesLoading(true);
    setError(null);
    try {
      const idToken = await user?.getIdToken();
      const res = await fetchJSON<any>(`/api/datasets/${encodeURIComponent(datasetId)}/examples`, {
        idToken,
        cache: "no-store",
      });
      const list = unwrap<Example[]>(res, "examples");
      setExamples(Array.isArray(list) ? list : []);
    } catch (err: any) {
      console.error("API error", err?.message, err?.status, err?.code);
      if (err?.status === 401) {
        router.replace("/login?next=" + encodeURIComponent(`/datasets/${datasetId}`));
        return;
      }
      setError(err?.message ?? "Failed to load examples.");
    } finally {
      setExamplesLoading(false);
    }
  }

  function resetForm() {
    setEditingId(null);
    setTitle("");
    setMode("");
    setTagsCsv("");
    setUserGoal("");
    setConstraintsSnapshot("");
    setMemorySnapshot("");
    setExpectedType("text");
    setExpectedValue("");
    setFormError(null);
  }

  function startEdit(ex: Example) {
    setEditingId(ex.id);
    setTitle(ex.title ?? "");
    setMode(ex.mode ?? "");
    setTagsCsv((ex.tags ?? []).join(", "));
    setUserGoal(ex.input?.userGoal ?? "");
    setConstraintsSnapshot(ex.input?.constraintsSnapshot ?? "");
    setMemorySnapshot(ex.input?.memorySnapshot ?? "");
    setExpectedType(ex.expected?.type ?? "text");
    setExpectedValue(stringifyExpectedValue(ex.expected));
    setFormError(null);
  }

  async function submit() {
    setSaving(true);
    setFormError(null);

    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setSaving(false);
      setFormError("Title is required.");
      return;
    }

    let expectedParsed: any = expectedValue;
    if (expectedType === "json") {
      try {
        expectedParsed = expectedValue.trim() ? JSON.parse(expectedValue) : null;
      } catch {
        setSaving(false);
        setFormError("Expected value must be valid JSON.");
        return;
      }
    }

    const body = {
      title: trimmedTitle,
      mode: mode.trim() || undefined,
      tags: toTags(tagsCsv),
      input: {
        userGoal: userGoal.trim() || undefined,
        constraintsSnapshot: constraintsSnapshot.trim() || undefined,
        memorySnapshot: memorySnapshot.trim() || undefined,
      },
      expected: {
        type: expectedType,
        value: expectedType === "json" ? expectedParsed : (expectedValue ?? ""),
      },
    };

    try {
      const idToken = await user?.getIdToken();
      if (editingId) {
        await fetchJSON<any>(
          `/api/datasets/${encodeURIComponent(datasetId)}/examples/${encodeURIComponent(editingId)}`,
          { method: "PATCH", idToken, body }
        );
      } else {
        await fetchJSON<any>(`/api/datasets/${encodeURIComponent(datasetId)}/examples`, {
          method: "POST",
          idToken,
          body,
        });
      }

      resetForm();
      await loadExamples();
    } catch (err: any) {
      console.error("API error", err?.message, err?.status, err?.code);
      if (err?.status === 401) {
        router.replace("/login?next=" + encodeURIComponent(`/datasets/${datasetId}`));
        return;
      }
      setFormError(err?.message ?? "Failed to save example.");
    } finally {
      setSaving(false);
    }
  }

  async function removeExample(exampleId: string) {
    const ok = window.confirm("Delete this example? This cannot be undone.");
    if (!ok) return;

    setError(null);
    try {
      const idToken = await user?.getIdToken();
      await fetchJSON<any>(
        `/api/datasets/${encodeURIComponent(datasetId)}/examples/${encodeURIComponent(exampleId)}`,
        { method: "DELETE", idToken }
      );
      if (editingId === exampleId) resetForm();
      await loadExamples();
    } catch (err: any) {
      console.error("API error", err?.message, err?.status, err?.code);
      if (err?.status === 401) {
        router.replace("/login?next=" + encodeURIComponent(`/datasets/${datasetId}`));
        return;
      }
      setError(err?.message ?? "Failed to delete example.");
    }
  }

  useEffect(() => {
    void loadDataset();
    void loadExamples();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="text-sm text-muted-foreground">
            <Link className="hover:underline" href="/datasets">
              Datasets
            </Link>{" "}
            / {datasetId}
          </div>
          <h1 className="text-2xl font-semibold">{dataset?.name ?? "Dataset"}</h1>
          {dataset?.description ? (
            <p className="text-sm text-muted-foreground">{dataset.description}</p>
          ) : null}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={loadDataset} disabled={loading}>
            Refresh
          </Button>
        </div>
      </div>

      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Something went wrong</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <Tabs defaultValue="examples">
        <TabsList>
          <TabsTrigger value="examples">Examples</TabsTrigger>
        </TabsList>

        <TabsContent value="examples" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">{editingId ? "Edit example" : "Add example"}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {formError ? (
                <Alert variant="destructive">
                  <AlertTitle>Can’t save</AlertTitle>
                  <AlertDescription>{formError}</AlertDescription>
                </Alert>
              ) : null}

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <div className="text-sm font-medium">Title</div>
                  <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Example title" />
                </div>
                <div className="space-y-2">
                  <div className="text-sm font-medium">Mode</div>
                  <Input value={mode} onChange={(e) => setMode(e.target.value)} placeholder="e.g. chat" />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <div className="text-sm font-medium">Tags (CSV)</div>
                  <Input value={tagsCsv} onChange={(e) => setTagsCsv(e.target.value)} placeholder="tag1, tag2" />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <div className="text-sm font-medium">input.userGoal</div>
                  <Textarea
                    value={userGoal}
                    onChange={(e) => setUserGoal(e.target.value)}
                    placeholder="User goal"
                    className="min-h-[90px]"
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <div className="text-sm font-medium">input.constraintsSnapshot</div>
                  <Textarea
                    value={constraintsSnapshot}
                    onChange={(e) => setConstraintsSnapshot(e.target.value)}
                    placeholder="Constraints snapshot"
                    className="min-h-[90px]"
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <div className="text-sm font-medium">input.memorySnapshot</div>
                  <Textarea
                    value={memorySnapshot}
                    onChange={(e) => setMemorySnapshot(e.target.value)}
                    placeholder="Memory snapshot"
                    className="min-h-[90px]"
                  />
                </div>
                <div className="space-y-2">
                  <div className="text-sm font-medium">expected.type</div>
                  <Select value={expectedType} onValueChange={(v) => setExpectedType(v as "text" | "json")}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="text">text</SelectItem>
                      <SelectItem value="json">json</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2 md:col-span-2">
                  <div className="text-sm font-medium">expected.value</div>
                  <Textarea
                    value={expectedValue}
                    onChange={(e) => setExpectedValue(e.target.value)}
                    placeholder={expectedType === "json" ? "{\n  \"key\": \"value\"\n}" : "Expected text"}
                    className="min-h-[120px] font-mono"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <Button onClick={submit} disabled={saving}>
                  {saving ? "Saving..." : editingId ? "Save changes" : "Create example"}
                </Button>
                {editingId ? (
                  <Button variant="outline" onClick={resetForm} disabled={saving}>
                    Cancel edit
                  </Button>
                ) : null}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Examples</CardTitle>
            </CardHeader>
            <CardContent>
              {examplesLoading ? (
                <div className="text-sm text-muted-foreground">Loading examples…</div>
              ) : sortedExamples.length === 0 ? (
                <div className="text-sm text-muted-foreground">No examples yet.</div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Title</TableHead>
                        <TableHead className="hidden md:table-cell">Mode</TableHead>
                        <TableHead className="hidden md:table-cell">Tags</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sortedExamples.map((ex) => (
                        <TableRow key={ex.id}>
                          <TableCell className="font-medium">{ex.title}</TableCell>
                          <TableCell className="hidden md:table-cell">{ex.mode ?? "—"}</TableCell>
                          <TableCell className="hidden md:table-cell">
                            {(ex.tags ?? []).length ? (ex.tags ?? []).join(", ") : "—"}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              <Button size="sm" variant="outline" onClick={() => startEdit(ex)}>
                                Edit
                              </Button>
                              <Button size="sm" variant="destructive" onClick={() => void removeExample(ex.id)}>
                                Delete
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

