"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { fetchJSON } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type Dataset = {
  id: string;
  name: string;
  description?: string | null;
  exampleCount?: number | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

type Expected = { type: "json" | "text"; value: unknown };
type Example = {
  id: string;
  title?: string | null;
  mode?: string | null;
  tags?: string[] | null;
  input?: {
    userGoal?: string | null;
    constraintsSnapshot?: string | null;
    memorySnapshot?: string | null;
  } | null;
  expected?: Expected | null;
};

type ExampleDraft = {
  title: string;
  mode: string;
  tagsCsv: string;
  userGoal: string;
  constraintsSnapshot: string;
  memorySnapshot: string;
  expectedType: "json" | "text";
  expectedValue: string;
};

function parseTags(csv: string): string[] {
  return csv
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

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

function emptyDraft(): ExampleDraft {
  return {
    title: "",
    mode: "",
    tagsCsv: "",
    userGoal: "",
    constraintsSnapshot: "",
    memorySnapshot: "",
    expectedType: "text",
    expectedValue: "",
  };
}

function draftFromExample(ex: Example): ExampleDraft {
  return {
    title: ex.title || "",
    mode: ex.mode || "",
    tagsCsv: (ex.tags || []).join(", "),
    userGoal: ex.input?.userGoal || "",
    constraintsSnapshot: ex.input?.constraintsSnapshot || "",
    memorySnapshot: ex.input?.memorySnapshot || "",
    expectedType: ex.expected?.type || "text",
    expectedValue: stringifyMaybeJSON(ex.expected?.value),
  };
}

export default function DatasetDetailPage() {
  const params = useParams<{ datasetId: string }>();
  const datasetId = params?.datasetId;
  const { user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [examples, setExamples] = useState<Example[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingExamples, setLoadingExamples] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [createDraft, setCreateDraft] = useState<ExampleDraft>(() => emptyDraft());
  const [createError, setCreateError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<ExampleDraft>(() => emptyDraft());
  const [editError, setEditError] = useState<string | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const getIdToken = useCallback(async () => {
    if (!user) throw new Error("Not authenticated");
    return await user.getIdToken();
  }, [user]);

  const loadDataset = useCallback(async () => {
    if (!datasetId) return;
    setLoading(true);
    setErrorMessage(null);
    try {
      const idToken = await getIdToken();
      const data = await fetchJSON<Dataset>(`/api/datasets/${encodeURIComponent(datasetId)}`, {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      setDataset(data);
    } catch (err) {
      const { message, status, code } = getErrParts(err);
      console.error("API error", "message=", message, "status=", status, "code=", code);
      if (status === 401) {
        router.replace(`/login?next=${encodeURIComponent(pathname)}`);
        return;
      }
      setErrorMessage(message || "Failed to load dataset.");
    } finally {
      setLoading(false);
    }
  }, [datasetId, getIdToken, pathname, router]);

  const loadExamples = useCallback(async () => {
    if (!datasetId) return;
    setLoadingExamples(true);
    setErrorMessage(null);
    try {
      const idToken = await getIdToken();
      const data = await fetchJSON<{ examples?: Example[] } | Example[]>(
        `/api/datasets/${encodeURIComponent(datasetId)}/examples`,
        { headers: { Authorization: `Bearer ${idToken}` } }
      );
      const list = Array.isArray(data) ? data : data.examples || [];
      setExamples(list);
    } catch (err) {
      const { message, status, code } = getErrParts(err);
      console.error("API error", "message=", message, "status=", status, "code=", code);
      if (status === 401) {
        router.replace(`/login?next=${encodeURIComponent(pathname)}`);
        return;
      }
      setErrorMessage(message || "Failed to load examples.");
    } finally {
      setLoadingExamples(false);
    }
  }, [datasetId, getIdToken, pathname, router]);

  useEffect(() => {
    void loadDataset();
    void loadExamples();
  }, [loadDataset, loadExamples]);

  const validateDraft = (draft: ExampleDraft) => {
    if (draft.expectedType === "json") {
      try {
        if (!draft.expectedValue.trim()) return "Expected JSON cannot be empty.";
        JSON.parse(draft.expectedValue);
      } catch {
        return "Expected value must be valid JSON.";
      }
    }
    return null;
  };

  const handleCreate = async () => {
    setCreateError(null);
    const validation = validateDraft(createDraft);
    if (validation) {
      setCreateError(validation);
      return;
    }

    setCreating(true);
    try {
      const idToken = await getIdToken();
      const payload = {
        title: createDraft.title.trim() || undefined,
        mode: createDraft.mode.trim() || undefined,
        tags: parseTags(createDraft.tagsCsv),
        input: {
          userGoal: createDraft.userGoal,
          constraintsSnapshot: createDraft.constraintsSnapshot,
          memorySnapshot: createDraft.memorySnapshot,
        },
        expected: {
          type: createDraft.expectedType,
          value:
            createDraft.expectedType === "json"
              ? (JSON.parse(createDraft.expectedValue) as unknown)
              : createDraft.expectedValue,
        },
      };
      await fetchJSON(`/api/datasets/${encodeURIComponent(datasetId)}/examples`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${idToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      setCreateDraft(emptyDraft());
      await loadExamples();
      await loadDataset();
    } catch (err) {
      const { message, status, code } = getErrParts(err);
      console.error("API error", "message=", message, "status=", status, "code=", code);
      if (status === 401) {
        router.replace(`/login?next=${encodeURIComponent(pathname)}`);
        return;
      }
      setCreateError(message || "Failed to create example.");
    } finally {
      setCreating(false);
    }
  };

  const startEdit = (ex: Example) => {
    setEditError(null);
    setEditingId(ex.id);
    setEditDraft(draftFromExample(ex));
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditError(null);
  };

  const handleSaveEdit = async () => {
    if (!editingId) return;
    setEditError(null);
    const validation = validateDraft(editDraft);
    if (validation) {
      setEditError(validation);
      return;
    }

    const payload = {
      title: editDraft.title.trim() || undefined,
      mode: editDraft.mode.trim() || undefined,
      tags: parseTags(editDraft.tagsCsv),
      input: {
        userGoal: editDraft.userGoal,
        constraintsSnapshot: editDraft.constraintsSnapshot,
        memorySnapshot: editDraft.memorySnapshot,
      },
      expected: {
        type: editDraft.expectedType,
        value:
          editDraft.expectedType === "json"
            ? (JSON.parse(editDraft.expectedValue) as unknown)
            : editDraft.expectedValue,
      },
    };

    setSavingEdit(true);
    try {
      const idToken = await getIdToken();
      await fetchJSON(
        `/api/datasets/${encodeURIComponent(datasetId)}/examples/${encodeURIComponent(editingId)}`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${idToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        }
      );
      setEditingId(null);
      await loadExamples();
    } catch (err) {
      const { message, status, code } = getErrParts(err);
      console.error("API error", "message=", message, "status=", status, "code=", code);
      if (status === 401) {
        router.replace(`/login?next=${encodeURIComponent(pathname)}`);
        return;
      }
      setEditError(message || "Failed to update example.");
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDelete = async (exampleId: string) => {
    const ok = window.confirm("Delete this example? This cannot be undone.");
    if (!ok) return;

    setDeletingId(exampleId);
    setErrorMessage(null);
    try {
      const idToken = await getIdToken();
      await fetchJSON(
        `/api/datasets/${encodeURIComponent(datasetId)}/examples/${encodeURIComponent(exampleId)}`,
        { method: "DELETE", headers: { Authorization: `Bearer ${idToken}` } }
      );
      if (editingId === exampleId) cancelEdit();
      await loadExamples();
      await loadDataset();
    } catch (err) {
      const { message, status, code } = getErrParts(err);
      console.error("API error", "message=", message, "status=", status, "code=", code);
      if (status === 401) {
        router.replace(`/login?next=${encodeURIComponent(pathname)}`);
        return;
      }
      setErrorMessage(message || "Failed to delete example.");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="text-sm text-muted-foreground">
            <Link href="/datasets" className="hover:underline">
              Datasets
            </Link>{" "}
            / <span className="font-mono">{datasetId}</span>
          </div>
          <h1 className="truncate text-2xl font-semibold">
            {dataset?.name || "Dataset"}
          </h1>
          {dataset?.description ? (
            <p className="mt-1 text-sm text-muted-foreground">{dataset.description}</p>
          ) : null}
        </div>
        <Button variant="outline" onClick={() => void loadExamples()} disabled={loadingExamples}>
          Refresh
        </Button>
      </div>

      {errorMessage ? (
        <Card className="p-4">
          <div className="text-sm text-destructive">{errorMessage}</div>
        </Card>
      ) : null}

      {loading ? (
        <div className="text-sm text-muted-foreground">Loading dataset…</div>
      ) : dataset ? (
        <Card className="p-4">
          <div className="grid gap-2 sm:grid-cols-2">
            <div>
              <div className="text-xs uppercase text-muted-foreground">Dataset ID</div>
              <div className="font-mono text-sm">{dataset.id}</div>
            </div>
            {typeof dataset.exampleCount === "number" ? (
              <div>
                <div className="text-xs uppercase text-muted-foreground">Examples</div>
                <div className="text-sm">{dataset.exampleCount}</div>
              </div>
            ) : null}
            {dataset.createdAt ? (
              <div>
                <div className="text-xs uppercase text-muted-foreground">Created</div>
                <div className="text-sm">{dataset.createdAt}</div>
              </div>
            ) : null}
            {dataset.updatedAt ? (
              <div>
                <div className="text-xs uppercase text-muted-foreground">Updated</div>
                <div className="text-sm">{dataset.updatedAt}</div>
              </div>
            ) : null}
          </div>
        </Card>
      ) : null}

      <Tabs defaultValue="examples">
        <TabsList>
          <TabsTrigger value="examples">Examples</TabsTrigger>
        </TabsList>

        <TabsContent value="examples" className="space-y-6">
          <Card className="p-4">
            <div className="space-y-3">
              <div className="text-sm font-medium">Add example</div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <div className="text-sm">Title</div>
                  <Input
                    value={createDraft.title}
                    onChange={(e) =>
                      setCreateDraft((d) => ({ ...d, title: e.target.value }))
                    }
                    placeholder="Example title"
                  />
                </div>
                <div className="space-y-2">
                  <div className="text-sm">Mode</div>
                  <Input
                    value={createDraft.mode}
                    onChange={(e) =>
                      setCreateDraft((d) => ({ ...d, mode: e.target.value }))
                    }
                    placeholder="e.g. chat, agent, tool"
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <div className="text-sm">Tags (CSV)</div>
                  <Input
                    value={createDraft.tagsCsv}
                    onChange={(e) =>
                      setCreateDraft((d) => ({ ...d, tagsCsv: e.target.value }))
                    }
                    placeholder="tag1, tag2"
                  />
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-2 sm:col-span-1">
                  <div className="text-sm">input.userGoal</div>
                  <Textarea
                    value={createDraft.userGoal}
                    onChange={(e) =>
                      setCreateDraft((d) => ({ ...d, userGoal: e.target.value }))
                    }
                    rows={6}
                  />
                </div>
                <div className="space-y-2 sm:col-span-1">
                  <div className="text-sm">input.constraintsSnapshot</div>
                  <Textarea
                    value={createDraft.constraintsSnapshot}
                    onChange={(e) =>
                      setCreateDraft((d) => ({
                        ...d,
                        constraintsSnapshot: e.target.value,
                      }))
                    }
                    rows={6}
                  />
                </div>
                <div className="space-y-2 sm:col-span-1">
                  <div className="text-sm">input.memorySnapshot</div>
                  <Textarea
                    value={createDraft.memorySnapshot}
                    onChange={(e) =>
                      setCreateDraft((d) => ({ ...d, memorySnapshot: e.target.value }))
                    }
                    rows={6}
                  />
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-2 sm:col-span-1">
                  <div className="text-sm">expected.type</div>
                  <select
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    value={createDraft.expectedType}
                    onChange={(e) =>
                      setCreateDraft((d) => ({
                        ...d,
                        expectedType: e.target.value as "json" | "text",
                      }))
                    }
                  >
                    <option value="text">text</option>
                    <option value="json">json</option>
                  </select>
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <div className="text-sm">expected.value</div>
                  <Textarea
                    value={createDraft.expectedValue}
                    onChange={(e) =>
                      setCreateDraft((d) => ({ ...d, expectedValue: e.target.value }))
                    }
                    rows={6}
                    placeholder={
                      createDraft.expectedType === "json"
                        ? '{ "key": "value" }'
                        : "Expected output"
                    }
                  />
                </div>
              </div>

              {createError ? (
                <div className="text-sm text-destructive">{createError}</div>
              ) : null}

              <div className="pt-1">
                <Button onClick={handleCreate} disabled={creating}>
                  {creating ? "Creating..." : "Create example"}
                </Button>
              </div>
            </div>
          </Card>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium">Examples</div>
              {loadingExamples ? (
                <div className="text-sm text-muted-foreground">Loading…</div>
              ) : (
                <div className="text-sm text-muted-foreground">{examples.length} total</div>
              )}
            </div>

            {loadingExamples ? null : examples.length === 0 ? (
              <Card className="p-6">
                <div className="text-sm text-muted-foreground">No examples yet.</div>
              </Card>
            ) : (
              examples.map((ex) => {
                const isEditing = editingId === ex.id;
                const expectedText = stringifyMaybeJSON(ex.expected?.value);
                return (
                  <Card key={ex.id} className="p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="font-medium">
                          {ex.title || <span className="text-muted-foreground">(untitled)</span>}
                        </div>
                        <div className="mt-1 flex flex-wrap gap-2 text-sm text-muted-foreground">
                          {ex.mode ? <span>mode: {ex.mode}</span> : null}
                          {ex.tags && ex.tags.length > 0 ? (
                            <span>tags: {ex.tags.join(", ")}</span>
                          ) : null}
                        </div>
                      </div>
                      <div className="flex shrink-0 gap-2">
                        <Button variant="outline" onClick={() => startEdit(ex)} disabled={isEditing}>
                          Edit
                        </Button>
                        <Button
                          variant="destructive"
                          onClick={() => void handleDelete(ex.id)}
                          disabled={deletingId === ex.id}
                        >
                          {deletingId === ex.id ? "Deleting..." : "Delete"}
                        </Button>
                      </div>
                    </div>

                    <details className="mt-3">
                      <summary className="cursor-pointer text-sm text-muted-foreground">
                        View expected vs input
                      </summary>
                      <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        <div>
                          <div className="text-xs uppercase text-muted-foreground">Expected</div>
                          <pre className="mt-1 whitespace-pre-wrap rounded-md bg-muted p-3 text-xs">
                            {expectedText || "(empty)"}
                          </pre>
                        </div>
                        <div>
                          <div className="text-xs uppercase text-muted-foreground">Input</div>
                          <pre className="mt-1 whitespace-pre-wrap rounded-md bg-muted p-3 text-xs">
                            {stringifyMaybeJSON(ex.input) || "(empty)"}
                          </pre>
                        </div>
                      </div>
                    </details>

                    {isEditing ? (
                      <div className="mt-4 space-y-3 border-t border-border pt-4">
                        <div className="text-sm font-medium">Edit example</div>

                        <div className="grid gap-3 sm:grid-cols-2">
                          <div className="space-y-2">
                            <div className="text-sm">Title</div>
                            <Input
                              value={editDraft.title}
                              onChange={(e) =>
                                setEditDraft((d) => ({ ...d, title: e.target.value }))
                              }
                            />
                          </div>
                          <div className="space-y-2">
                            <div className="text-sm">Mode</div>
                            <Input
                              value={editDraft.mode}
                              onChange={(e) =>
                                setEditDraft((d) => ({ ...d, mode: e.target.value }))
                              }
                            />
                          </div>
                          <div className="space-y-2 sm:col-span-2">
                            <div className="text-sm">Tags (CSV)</div>
                            <Input
                              value={editDraft.tagsCsv}
                              onChange={(e) =>
                                setEditDraft((d) => ({ ...d, tagsCsv: e.target.value }))
                              }
                            />
                          </div>
                        </div>

                        <div className="grid gap-3 sm:grid-cols-3">
                          <div className="space-y-2 sm:col-span-1">
                            <div className="text-sm">input.userGoal</div>
                            <Textarea
                              value={editDraft.userGoal}
                              onChange={(e) =>
                                setEditDraft((d) => ({ ...d, userGoal: e.target.value }))
                              }
                              rows={6}
                            />
                          </div>
                          <div className="space-y-2 sm:col-span-1">
                            <div className="text-sm">input.constraintsSnapshot</div>
                            <Textarea
                              value={editDraft.constraintsSnapshot}
                              onChange={(e) =>
                                setEditDraft((d) => ({
                                  ...d,
                                  constraintsSnapshot: e.target.value,
                                }))
                              }
                              rows={6}
                            />
                          </div>
                          <div className="space-y-2 sm:col-span-1">
                            <div className="text-sm">input.memorySnapshot</div>
                            <Textarea
                              value={editDraft.memorySnapshot}
                              onChange={(e) =>
                                setEditDraft((d) => ({
                                  ...d,
                                  memorySnapshot: e.target.value,
                                }))
                              }
                              rows={6}
                            />
                          </div>
                        </div>

                        <div className="grid gap-3 sm:grid-cols-3">
                          <div className="space-y-2 sm:col-span-1">
                            <div className="text-sm">expected.type</div>
                            <select
                              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                              value={editDraft.expectedType}
                              onChange={(e) =>
                                setEditDraft((d) => ({
                                  ...d,
                                  expectedType: e.target.value as "json" | "text",
                                }))
                              }
                            >
                              <option value="text">text</option>
                              <option value="json">json</option>
                            </select>
                          </div>
                          <div className="space-y-2 sm:col-span-2">
                            <div className="text-sm">expected.value</div>
                            <Textarea
                              value={editDraft.expectedValue}
                              onChange={(e) =>
                                setEditDraft((d) => ({
                                  ...d,
                                  expectedValue: e.target.value,
                                }))
                              }
                              rows={6}
                            />
                          </div>
                        </div>

                        {editError ? (
                          <div className="text-sm text-destructive">{editError}</div>
                        ) : null}

                        <div className="flex gap-2">
                          <Button onClick={handleSaveEdit} disabled={savingEdit}>
                            {savingEdit ? "Saving..." : "Save"}
                          </Button>
                          <Button variant="outline" onClick={cancelEdit} disabled={savingEdit}>
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : null}
                  </Card>
                );
              })
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

