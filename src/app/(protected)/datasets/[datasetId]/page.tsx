"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

import { fetchJSON } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";

type Dataset = {
  id: string;
  name?: string;
  description?: string;
  createdAt?: string;
  updatedAt?: string;
};

type Example = {
  id: string;
  title?: string;
  mode?: string;
  tags?: string[];
  input?: {
    userGoal?: string;
    constraintsSnapshot?: string;
    memorySnapshot?: string;
  };
  expected?: {
    type?: "text" | "json" | string;
    value?: unknown;
  };
  createdAt?: string;
  updatedAt?: string;
};

type ExampleDraft = {
  title: string;
  mode: string;
  tagsCsv: string;
  userGoal: string;
  constraintsSnapshot: string;
  memorySnapshot: string;
  expectedType: "text" | "json";
  expectedValue: string;
};

function isNotFoundError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return msg.includes("(404") || msg.toLowerCase().includes("not found");
}

function normalizeExamples(payload: unknown): Example[] {
  if (Array.isArray(payload)) return payload as Example[];
  if (payload && typeof payload === "object") {
    const p = payload as Record<string, unknown>;
    if (Array.isArray(p.examples)) return p.examples as Example[];
    if (Array.isArray(p.items)) return p.items as Example[];
  }
  return [];
}

function normalizeDataset(payload: unknown, datasetId: string): Dataset | null {
  if (!payload || typeof payload !== "object") return null;
  const p = payload as Record<string, unknown>;
  if (p.dataset && typeof p.dataset === "object") return p.dataset as Dataset;
  if (typeof p.id === "string") return p as Dataset;
  return { id: datasetId };
}

function tagsFromCsv(csv: string): string[] {
  return csv
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}

function prettyExpectedValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function buildExampleRequestBody(d: ExampleDraft): Record<string, unknown> {
  let expectedValue: unknown = d.expectedValue;
  if (d.expectedType === "json") {
    expectedValue = JSON.parse(d.expectedValue);
  }

  return {
    title: d.title,
    mode: d.mode,
    tags: tagsFromCsv(d.tagsCsv),
    input: {
      userGoal: d.userGoal,
      constraintsSnapshot: d.constraintsSnapshot,
      memorySnapshot: d.memorySnapshot,
    },
    expected: {
      type: d.expectedType,
      value: expectedValue,
    },
  };
}

function ExampleEditorDialog({
  open,
  onOpenChange,
  initial,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial: ExampleDraft;
  onSave: (draft: ExampleDraft) => Promise<void>;
}) {
  const [draft, setDraft] = useState<ExampleDraft>(initial);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setDraft(initial);
  }, [open, initial]);

  const save = async () => {
    setSaving(true);
    try {
      await onSave(draft);
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit example</DialogTitle>
          <DialogDescription>
            Update fields and save. This writes via backend APIs only.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label>Title</Label>
            <Input
              value={draft.title}
              onChange={(e) => setDraft((p) => ({ ...p, title: e.target.value }))}
            />
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>Mode</Label>
              <Input
                value={draft.mode}
                onChange={(e) => setDraft((p) => ({ ...p, mode: e.target.value }))}
                placeholder="e.g. chat/completions"
              />
            </div>
            <div className="grid gap-2">
              <Label>Tags (CSV)</Label>
              <Input
                value={draft.tagsCsv}
                onChange={(e) =>
                  setDraft((p) => ({ ...p, tagsCsv: e.target.value }))
                }
                placeholder="tag1, tag2"
              />
            </div>
          </div>

          <div className="grid gap-2">
            <Label>Input.userGoal</Label>
            <Textarea
              value={draft.userGoal}
              onChange={(e) =>
                setDraft((p) => ({ ...p, userGoal: e.target.value }))
              }
              rows={3}
            />
          </div>
          <div className="grid gap-2">
            <Label>Input.constraintsSnapshot</Label>
            <Textarea
              value={draft.constraintsSnapshot}
              onChange={(e) =>
                setDraft((p) => ({ ...p, constraintsSnapshot: e.target.value }))
              }
              rows={3}
            />
          </div>
          <div className="grid gap-2">
            <Label>Input.memorySnapshot</Label>
            <Textarea
              value={draft.memorySnapshot}
              onChange={(e) =>
                setDraft((p) => ({ ...p, memorySnapshot: e.target.value }))
              }
              rows={3}
            />
          </div>

          <div className="grid gap-2 sm:grid-cols-3">
            <div className="grid gap-2 sm:col-span-1">
              <Label>Expected.type</Label>
              <Select
                value={draft.expectedType}
                onValueChange={(v) =>
                  setDraft((p) => ({ ...p, expectedType: v as "text" | "json" }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="text">text</SelectItem>
                  <SelectItem value="json">json</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2 sm:col-span-2">
              <Label>Expected.value</Label>
              <Textarea
                value={draft.expectedValue}
                onChange={(e) =>
                  setDraft((p) => ({ ...p, expectedValue: e.target.value }))
                }
                rows={6}
                className="font-mono"
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function DatasetDetailPage({
  params,
}: {
  params: { datasetId: string };
}) {
  const datasetId = params.datasetId;

  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [examples, setExamples] = useState<Example[]>([]);
  const [loadingExamples, setLoadingExamples] = useState(true);
  const [loadingDataset, setLoadingDataset] = useState(true);
  const [examplesError, setExamplesError] = useState<string | null>(null);

  const [creating, setCreating] = useState(false);
  const [newDraft, setNewDraft] = useState<ExampleDraft>({
    title: "",
    mode: "",
    tagsCsv: "",
    userGoal: "",
    constraintsSnapshot: "",
    memorySnapshot: "",
    expectedType: "text",
    expectedValue: "",
  });

  const [editOpen, setEditOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editInitial, setEditInitial] = useState<ExampleDraft | null>(null);

  const sortedExamples = useMemo(() => {
    return [...examples].sort((a, b) => {
      const ax = a.updatedAt ?? a.createdAt ?? "";
      const bx = b.updatedAt ?? b.createdAt ?? "";
      return bx.localeCompare(ax);
    });
  }, [examples]);

  const loadDataset = async () => {
    setLoadingDataset(true);
    try {
      const res = await fetchJSON<unknown>(`/api/datasets/${datasetId}`, {
        method: "GET",
      });
      setDataset(normalizeDataset(res, datasetId));
    } catch (e) {
      // If the endpoint doesn't exist (or the dataset detail route isn't implemented),
      // fall back to an id-only view.
      if (isNotFoundError(e)) {
        setDataset({ id: datasetId });
      } else {
        setDataset({ id: datasetId });
      }
    } finally {
      setLoadingDataset(false);
    }
  };

  const loadExamples = async () => {
    setLoadingExamples(true);
    setExamplesError(null);
    try {
      const res = await fetchJSON<unknown>(
        `/api/datasets/${datasetId}/examples`,
        { method: "GET" }
      );
      setExamples(normalizeExamples(res));
    } catch (e) {
      setExamplesError(e instanceof Error ? e.message : "Failed to load examples.");
    } finally {
      setLoadingExamples(false);
    }
  };

  useEffect(() => {
    void loadDataset();
    void loadExamples();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datasetId]);

  const createExample = async () => {
    setCreating(true);
    try {
      let body: Record<string, unknown>;
      try {
        body = buildExampleRequestBody(newDraft);
      } catch {
        toast({
          title: "Invalid expected JSON",
          description: "Expected.value must be valid JSON when type is json.",
          variant: "destructive",
        });
        return;
      }

      await fetchJSON(`/api/datasets/${datasetId}/examples`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      toast({ title: "Example created" });
      setNewDraft((p) => ({
        ...p,
        title: "",
        mode: "",
        tagsCsv: "",
        userGoal: "",
        constraintsSnapshot: "",
        memorySnapshot: "",
        expectedType: "text",
        expectedValue: "",
      }));
      await loadExamples();
    } catch (e) {
      toast({
        title: "Could not create example",
        description: e instanceof Error ? e.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setCreating(false);
    }
  };

  const openEdit = (ex: Example) => {
    setEditId(ex.id);
    setEditInitial({
      title: ex.title ?? "",
      mode: ex.mode ?? "",
      tagsCsv: (ex.tags ?? []).join(", "),
      userGoal: ex.input?.userGoal ?? "",
      constraintsSnapshot: ex.input?.constraintsSnapshot ?? "",
      memorySnapshot: ex.input?.memorySnapshot ?? "",
      expectedType: (ex.expected?.type === "json" ? "json" : "text") as
        | "text"
        | "json",
      expectedValue: prettyExpectedValue(ex.expected?.value),
    });
    setEditOpen(true);
  };

  const saveEdit = async (draft: ExampleDraft) => {
    if (!editId) return;
    let body: Record<string, unknown>;
    try {
      body = buildExampleRequestBody(draft);
    } catch {
      toast({
        title: "Invalid expected JSON",
        description: "Expected.value must be valid JSON when type is json.",
        variant: "destructive",
      });
      return;
    }

    try {
      await fetchJSON(`/api/datasets/${datasetId}/examples/${editId}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      toast({ title: "Example updated" });
      await loadExamples();
    } catch (e) {
      toast({
        title: "Could not update example",
        description: e instanceof Error ? e.message : "Please try again.",
        variant: "destructive",
      });
    }
  };

  const deleteExample = async (exampleId: string) => {
    try {
      await fetchJSON(`/api/datasets/${datasetId}/examples/${exampleId}`, {
        method: "DELETE",
      });
      toast({ title: "Example deleted" });
      await loadExamples();
    } catch (e) {
      toast({
        title: "Could not delete example",
        description: e instanceof Error ? e.message : "Please try again.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" asChild>
              <Link href="/datasets">← Back</Link>
            </Button>
          </div>
          <h1 className="mt-2 truncate text-2xl font-semibold">
            {dataset?.name?.trim() ? dataset.name : "Dataset"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            ID: <span className="font-mono">{datasetId}</span>
          </p>
        </div>
        <div className="text-right text-sm text-muted-foreground">
          {loadingDataset ? "Loading…" : null}
        </div>
      </div>

      <Tabs defaultValue="examples">
        <TabsList>
          <TabsTrigger value="examples">Examples</TabsTrigger>
          <TabsTrigger value="details">Details</TabsTrigger>
        </TabsList>

        <TabsContent value="examples">
          <div className="grid gap-4 lg:grid-cols-5">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-base">Add example</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4">
                <div className="grid gap-2">
                  <Label>Title</Label>
                  <Input
                    value={newDraft.title}
                    onChange={(e) =>
                      setNewDraft((p) => ({ ...p, title: e.target.value }))
                    }
                  />
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="grid gap-2">
                    <Label>Mode</Label>
                    <Input
                      value={newDraft.mode}
                      onChange={(e) =>
                        setNewDraft((p) => ({ ...p, mode: e.target.value }))
                      }
                      placeholder="e.g. chat"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label>Tags (CSV)</Label>
                    <Input
                      value={newDraft.tagsCsv}
                      onChange={(e) =>
                        setNewDraft((p) => ({ ...p, tagsCsv: e.target.value }))
                      }
                      placeholder="tag1, tag2"
                    />
                  </div>
                </div>

                <div className="grid gap-2">
                  <Label>Input.userGoal</Label>
                  <Textarea
                    value={newDraft.userGoal}
                    onChange={(e) =>
                      setNewDraft((p) => ({ ...p, userGoal: e.target.value }))
                    }
                    rows={3}
                  />
                </div>
                <div className="grid gap-2">
                  <Label>Input.constraintsSnapshot</Label>
                  <Textarea
                    value={newDraft.constraintsSnapshot}
                    onChange={(e) =>
                      setNewDraft((p) => ({
                        ...p,
                        constraintsSnapshot: e.target.value,
                      }))
                    }
                    rows={3}
                  />
                </div>
                <div className="grid gap-2">
                  <Label>Input.memorySnapshot</Label>
                  <Textarea
                    value={newDraft.memorySnapshot}
                    onChange={(e) =>
                      setNewDraft((p) => ({
                        ...p,
                        memorySnapshot: e.target.value,
                      }))
                    }
                    rows={3}
                  />
                </div>

                <div className="grid gap-2 sm:grid-cols-3">
                  <div className="grid gap-2 sm:col-span-1">
                    <Label>Expected.type</Label>
                    <Select
                      value={newDraft.expectedType}
                      onValueChange={(v) =>
                        setNewDraft((p) => ({
                          ...p,
                          expectedType: v as "text" | "json",
                        }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="text">text</SelectItem>
                        <SelectItem value="json">json</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2 sm:col-span-2">
                    <Label>Expected.value</Label>
                    <Textarea
                      value={newDraft.expectedValue}
                      onChange={(e) =>
                        setNewDraft((p) => ({
                          ...p,
                          expectedValue: e.target.value,
                        }))
                      }
                      rows={6}
                      className="font-mono"
                      placeholder={
                        newDraft.expectedType === "json"
                          ? '{ "key": "value" }'
                          : "Expected text"
                      }
                    />
                  </div>
                </div>

                <Button onClick={createExample} disabled={creating}>
                  {creating ? "Creating…" : "Create example"}
                </Button>
              </CardContent>
            </Card>

            <Card className="lg:col-span-3">
              <CardHeader>
                <CardTitle className="text-base">Examples</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3">
                {examplesError ? (
                  <div className="flex items-center justify-between gap-4 rounded-md border border-destructive/40 p-3">
                    <div className="text-sm text-muted-foreground">
                      {examplesError}
                    </div>
                    <Button variant="outline" size="sm" onClick={loadExamples}>
                      Retry
                    </Button>
                  </div>
                ) : null}

                {loadingExamples ? (
                  <div className="text-sm text-muted-foreground">Loading…</div>
                ) : sortedExamples.length === 0 ? (
                  <div className="text-sm text-muted-foreground">
                    No examples yet.
                  </div>
                ) : (
                  <div className="grid gap-3">
                    {sortedExamples.map((ex) => (
                      <div
                        key={ex.id}
                        className="rounded-md border p-3 transition-colors hover:bg-muted/30"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="truncate font-medium">
                              {ex.title?.trim() ? ex.title : "(untitled)"}
                            </div>
                            <div className="mt-1 text-xs text-muted-foreground">
                              <span className="font-mono">{ex.id}</span>
                              {ex.mode ? ` · mode: ${ex.mode}` : null}
                            </div>
                            {ex.tags && ex.tags.length > 0 ? (
                              <div className="mt-2 flex flex-wrap gap-1">
                                {ex.tags.slice(0, 10).map((t) => (
                                  <Badge key={t} variant="secondary">
                                    {t}
                                  </Badge>
                                ))}
                              </div>
                            ) : null}
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => openEdit(ex)}
                            >
                              Edit
                            </Button>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button
                                  variant="destructive"
                                  size="sm"
                                >
                                  Delete
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>
                                    Delete example?
                                  </AlertDialogTitle>
                                  <AlertDialogDescription>
                                    This cannot be undone.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => void deleteExample(ex.id)}
                                  >
                                    Delete
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {editInitial && editId ? (
            <ExampleEditorDialog
              open={editOpen}
              onOpenChange={setEditOpen}
              initial={editInitial}
              onSave={saveEdit}
            />
          ) : null}
        </TabsContent>

        <TabsContent value="details">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Dataset details</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              {dataset?.description ? (
                <div className="whitespace-pre-wrap">{dataset.description}</div>
              ) : (
                <div>
                  {loadingDataset
                    ? "Loading…"
                    : "No dataset details available (or the details endpoint is not implemented)."}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

