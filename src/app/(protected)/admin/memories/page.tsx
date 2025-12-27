"use client";

import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { fetchJson } from "@/lib/api/client";
import type { Memory, Person, Tag } from "@/lib/memories/schema";

type OrgProject = { id: string; name: string; goal: string | null };
type Org = { id: string; name: string; role: string; projects: OrgProject[] };

type MemoryListResponse = { ok: true; items: Memory[]; nextCursor: string | null };

function isoDateOnly(d: Date): string {
  // YYYY-MM-DD for <input type="date">
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export default function MemoriesAdminPage() {
  const { toast } = useToast();

  const [orgs, setOrgs] = useState<Org[] | null>(null);
  const [orgId, setOrgId] = useState<string>("");

  const [people, setPeople] = useState<Person[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);

  const [q, setQ] = useState("");
  const [filterPersonId, setFilterPersonId] = useState<string>("__all__");
  const [filterTagId, setFilterTagId] = useState<string>("__all__");
  const [includeDeleted, setIncludeDeleted] = useState(false);
  const [fromDate, setFromDate] = useState<string>("");
  const [toDate, setToDate] = useState<string>("");

  const [items, setItems] = useState<Memory[]>([]);
  const [loading, setLoading] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [cursorStack, setCursorStack] = useState<string[]>([]);

  const isAdminForSelectedOrg = useMemo(() => {
    const role = (orgs ?? []).find((o) => o.id === orgId)?.role ?? "";
    return role === "admin" || role === "owner";
  }, [orgs, orgId]);

  // Editor modal state
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [source, setSource] = useState("");
  const [selectedPeople, setSelectedPeople] = useState<Record<string, boolean>>({});
  const [selectedTags, setSelectedTags] = useState<Record<string, boolean>>({});
  const [newPersonName, setNewPersonName] = useState("");
  const [newTagName, setNewTagName] = useState("");

  function resetEditor() {
    setEditingId(null);
    setText("");
    setSource("");
    setSelectedPeople({});
    setSelectedTags({});
    setNewPersonName("");
    setNewTagName("");
  }

  function openCreate() {
    resetEditor();
    setEditorOpen(true);
  }

  function openEdit(m: Memory) {
    setEditingId(m.id);
    setText(m.text);
    setSource(m.source ?? "");
    setSelectedPeople(Object.fromEntries((m.participants ?? []).map((id) => [id, true])));
    setSelectedTags(Object.fromEntries((m.tags ?? []).map((id) => [id, true])));
    setEditorOpen(true);
  }

  async function loadOrgs() {
    try {
      const data = await fetchJson<{ ok: true; orgs: Org[] }>("/api/projects", { cache: "no-store" });
      setOrgs(data.orgs);
      const firstAdminOrg = data.orgs.find((o) => o.role === "owner" || o.role === "admin")?.id ?? "";
      setOrgId((prev) => prev || firstAdminOrg);
    } catch (err: any) {
      toast({ title: "Failed to load orgs", description: err.message, variant: "destructive" });
      setOrgs([]);
    }
  }

  async function loadPeopleAndTags(targetOrgId: string) {
    const [p, t] = await Promise.all([
      fetchJson<{ ok: true; people: Person[] }>(`/api/orgs/${encodeURIComponent(targetOrgId)}/people`, {
        cache: "no-store",
      }),
      fetchJson<{ ok: true; tags: Tag[] }>(`/api/orgs/${encodeURIComponent(targetOrgId)}/tags`, {
        cache: "no-store",
      }),
    ]);
    setPeople(p.people);
    setTags(t.tags);
  }

  async function loadMemories(params: { orgId: string; cursor?: string | null; pushCursor?: boolean }) {
    setLoading(true);
    try {
      const sp = new URLSearchParams();
      sp.set("limit", "25");
      if (params.cursor) sp.set("cursor", params.cursor);
      if (q.trim()) sp.set("q", q.trim());
      if (filterPersonId !== "__all__") sp.set("personId", filterPersonId);
      if (filterTagId !== "__all__") sp.set("tagId", filterTagId);
      if (includeDeleted) sp.set("includeDeleted", "true");
      if (fromDate) sp.set("from", new Date(fromDate).toISOString());
      if (toDate) {
        // inclusive end-of-day
        const d = new Date(toDate);
        d.setHours(23, 59, 59, 999);
        sp.set("to", d.toISOString());
      }

      const out = await fetchJson<MemoryListResponse>(
        `/api/orgs/${encodeURIComponent(params.orgId)}/memories?${sp.toString()}`,
        { cache: "no-store" }
      );
      setItems(out.items);
      setNextCursor(out.nextCursor);
      if (params.pushCursor && params.cursor) setCursorStack((prev) => [...prev, params.cursor!]);
    } catch (err: any) {
      toast({ title: "Failed to load memories", description: err.message, variant: "destructive" });
      setItems([]);
      setNextCursor(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadOrgs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!orgId) return;
    setCursorStack([]);
    setNextCursor(null);
    (async () => {
      try {
        await loadPeopleAndTags(orgId);
        await loadMemories({ orgId, cursor: null });
      } catch (err: any) {
        toast({ title: "Failed to load console data", description: err.message, variant: "destructive" });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId]);

  async function refresh() {
    if (!orgId) return;
    await loadPeopleAndTags(orgId);
    await loadMemories({ orgId, cursor: null });
  }

  async function createOrUpdate() {
    if (!orgId) return;
    const participants = Object.entries(selectedPeople)
      .filter(([, v]) => v)
      .map(([k]) => k);
    const tagIds = Object.entries(selectedTags)
      .filter(([, v]) => v)
      .map(([k]) => k);

    const payload = {
      text: text.trim(),
      source: source.trim() ? source.trim() : null,
      participants,
      tags: tagIds,
    };

    if (!payload.text) {
      toast({ title: "Missing text", description: "Memory text is required.", variant: "destructive" });
      return;
    }

    try {
      if (editingId) {
        await fetchJson(`/api/orgs/${encodeURIComponent(orgId)}/memories/${encodeURIComponent(editingId)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } else {
        await fetchJson(`/api/orgs/${encodeURIComponent(orgId)}/memories`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }

      setEditorOpen(false);
      resetEditor();
      await refresh();
    } catch (err: any) {
      toast({ title: "Save failed", description: err.message, variant: "destructive" });
    }
  }

  async function addPerson() {
    if (!orgId || !newPersonName.trim()) return;
    try {
      await fetchJson(`/api/orgs/${encodeURIComponent(orgId)}/people`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newPersonName.trim(), aliases: [] }),
      });
      setNewPersonName("");
      await loadPeopleAndTags(orgId);
    } catch (err: any) {
      toast({ title: "Create person failed", description: err.message, variant: "destructive" });
    }
  }

  async function addTag() {
    if (!orgId || !newTagName.trim()) return;
    try {
      await fetchJson(`/api/orgs/${encodeURIComponent(orgId)}/tags`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newTagName.trim() }),
      });
      setNewTagName("");
      await loadPeopleAndTags(orgId);
    } catch (err: any) {
      toast({ title: "Create tag failed", description: err.message, variant: "destructive" });
    }
  }

  async function softDelete(id: string) {
    if (!orgId) return;
    try {
      await fetchJson(`/api/orgs/${encodeURIComponent(orgId)}/memories/${encodeURIComponent(id)}`, { method: "DELETE" });
      await refresh();
    } catch (err: any) {
      toast({ title: "Delete failed", description: err.message, variant: "destructive" });
    }
  }

  async function restore(id: string) {
    if (!orgId) return;
    try {
      await fetchJson(`/api/orgs/${encodeURIComponent(orgId)}/memories/${encodeURIComponent(id)}/restore`, {
        method: "POST",
      });
      await refresh();
    } catch (err: any) {
      toast({ title: "Restore failed", description: err.message, variant: "destructive" });
    }
  }

  async function embed(id: string) {
    if (!orgId) return;
    try {
      const out = await fetchJson<{ ok: true; model: string; dimensions: number } | { ok: false; message: string }>(
        `/api/orgs/${encodeURIComponent(orgId)}/memories/${encodeURIComponent(id)}/embed`,
        { method: "POST" }
      );
      if ("ok" in out && out.ok) {
        toast({ title: "Embedded", description: `${out.model} (${out.dimensions} dims)` });
      } else {
        toast({ title: "Embedding disabled", description: (out as any).message ?? "Not configured.", variant: "destructive" });
      }
      await refresh();
    } catch (err: any) {
      toast({ title: "Embed failed", description: err.message, variant: "destructive" });
    }
  }

  if (orgs === null) {
    return (
      <main className="min-h-screen bg-background p-6">
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">Loading…</CardContent>
        </Card>
      </main>
    );
  }

  if (!orgId || !isAdminForSelectedOrg) {
    return (
      <main className="min-h-screen bg-background p-6">
        <Card>
          <CardHeader>
            <CardTitle>Memories Console</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="text-muted-foreground">
              Admin access required. Ensure your user is an org <code>admin</code> or <code>owner</code>.
            </div>
            <div className="text-xs text-muted-foreground">
              Current org role is not admin/owner, or no org is selected.
            </div>
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background p-4 md:p-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Memories Console</h1>
          <p className="text-sm text-muted-foreground">Admin-only CRUD + filters + soft delete.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Dialog open={editorOpen} onOpenChange={(v) => (setEditorOpen(v), v ? null : resetEditor())}>
            <DialogTrigger asChild>
              <Button onClick={openCreate}>New Memory</Button>
            </DialogTrigger>
            <DialogContent className="max-w-3xl">
              <DialogHeader>
                <DialogTitle>{editingId ? `Edit memory ${editingId}` : "New memory"}</DialogTitle>
              </DialogHeader>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Text</Label>
                  <Textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Write the memory…" />
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Source</Label>
                    <Input value={source} onChange={(e) => setSource(e.target.value)} placeholder="e.g. call notes, email…" />
                  </div>

                  <div className="space-y-2">
                    <Label>People</Label>
                    <div className="flex gap-2">
                      <Input
                        value={newPersonName}
                        onChange={(e) => setNewPersonName(e.target.value)}
                        placeholder="Add person name…"
                      />
                      <Button variant="secondary" onClick={addPerson} disabled={!newPersonName.trim()}>
                        Add
                      </Button>
                    </div>
                    <div className="max-h-40 overflow-auto rounded-md border p-2 space-y-2">
                      {people.length === 0 ? (
                        <div className="text-sm text-muted-foreground">No people yet.</div>
                      ) : (
                        people.map((p) => (
                          <label key={p.id} className="flex items-center gap-2 text-sm">
                            <Checkbox
                              checked={Boolean(selectedPeople[p.id])}
                              onCheckedChange={(v) =>
                                setSelectedPeople((prev) => ({ ...prev, [p.id]: Boolean(v) }))
                              }
                            />
                            <span>{p.name}</span>
                          </label>
                        ))
                      )}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Tags</Label>
                    <div className="flex gap-2">
                      <Input value={newTagName} onChange={(e) => setNewTagName(e.target.value)} placeholder="Add tag…" />
                      <Button variant="secondary" onClick={addTag} disabled={!newTagName.trim()}>
                        Add
                      </Button>
                    </div>
                    <div className="max-h-40 overflow-auto rounded-md border p-2 space-y-2">
                      {tags.length === 0 ? (
                        <div className="text-sm text-muted-foreground">No tags yet.</div>
                      ) : (
                        tags.map((t) => (
                          <label key={t.id} className="flex items-center gap-2 text-sm">
                            <Checkbox
                              checked={Boolean(selectedTags[t.id])}
                              onCheckedChange={(v) => setSelectedTags((prev) => ({ ...prev, [t.id]: Boolean(v) }))}
                            />
                            <span>{t.name}</span>
                          </label>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <DialogFooter className="gap-2">
                {editingId && (
                  <Button variant="outline" onClick={() => embed(editingId)}>
                    Embed (optional)
                  </Button>
                )}
                <Button variant="secondary" onClick={() => (setEditorOpen(false), resetEditor())}>
                  Cancel
                </Button>
                <Button onClick={createOrUpdate} disabled={!text.trim()}>
                  Save
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Button variant="outline" onClick={refresh} disabled={loading}>
            Refresh
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Filters</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 md:grid-cols-12">
          <div className="md:col-span-4 space-y-2">
            <Label>Org</Label>
            <Select value={orgId} onValueChange={(v) => setOrgId(v)}>
              <SelectTrigger>
                <SelectValue placeholder="Select org" />
              </SelectTrigger>
              <SelectContent>
                {(orgs ?? []).map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    {o.name} ({o.role})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="md:col-span-4 space-y-2">
            <Label>Search</Label>
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Text contains…" />
          </div>

          <div className="md:col-span-2 space-y-2">
            <Label>Person</Label>
            <Select value={filterPersonId} onValueChange={(v) => setFilterPersonId(v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All</SelectItem>
                {people.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="md:col-span-2 space-y-2">
            <Label>Tag</Label>
            <Select value={filterTagId} onValueChange={(v) => setFilterTagId(v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All</SelectItem>
                {tags.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="md:col-span-3 space-y-2">
            <Label>Date from</Label>
            <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
          </div>
          <div className="md:col-span-3 space-y-2">
            <Label>Date to</Label>
            <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
          </div>

          <div className="md:col-span-3 flex items-end gap-2">
            <div className="flex items-center gap-2">
              <Switch checked={includeDeleted} onCheckedChange={setIncludeDeleted} />
              <span className="text-sm">Include deleted</span>
            </div>
          </div>

          <div className="md:col-span-12 flex flex-wrap gap-2">
            <Button
              variant="secondary"
              disabled={loading}
              onClick={() => {
                setCursorStack([]);
                loadMemories({ orgId, cursor: null });
              }}
            >
              Apply
            </Button>
            <Button
              variant="outline"
              disabled={loading}
              onClick={() => {
                setQ("");
                setFilterPersonId("__all__");
                setFilterTagId("__all__");
                setIncludeDeleted(false);
                setFromDate("");
                setToDate("");
                setCursorStack([]);
                setNextCursor(null);
                loadMemories({ orgId, cursor: null });
              }}
            >
              Clear
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Memories</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading ? (
            <div className="text-sm text-muted-foreground">Loading…</div>
          ) : items.length === 0 ? (
            <div className="text-sm text-muted-foreground">No memories found.</div>
          ) : (
            <div className="space-y-2">
              {items.map((m) => (
                <div key={m.id} className="rounded-md border p-3 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-xs text-muted-foreground">
                      {new Date(m.createdAt).toLocaleString()} • id={m.id}
                      {m.deleted ? " • deleted" : ""}
                      {m.embeddingRef ? " • embedded" : ""}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button variant="outline" size="sm" onClick={() => openEdit(m)}>
                        Edit
                      </Button>
                      {!m.deleted ? (
                        <Button variant="destructive" size="sm" onClick={() => softDelete(m.id)}>
                          Delete
                        </Button>
                      ) : (
                        <Button variant="secondary" size="sm" onClick={() => restore(m.id)}>
                          Restore
                        </Button>
                      )}
                      <Button variant="secondary" size="sm" onClick={() => embed(m.id)}>
                        Embed
                      </Button>
                    </div>
                  </div>
                  <div className="text-sm whitespace-pre-wrap">{m.text.length > 500 ? `${m.text.slice(0, 500)}…` : m.text}</div>
                  <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                    <span>people: {m.participants.length}</span>
                    <span>tags: {m.tags.length}</span>
                    {m.source ? <span>source: {m.source}</span> : null}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              disabled={loading || cursorStack.length === 0}
              onClick={async () => {
                const prevStack = [...cursorStack];
                prevStack.pop();
                const prevCursor = prevStack[prevStack.length - 1] ?? null;
                setCursorStack(prevStack);
                await loadMemories({ orgId, cursor: prevCursor });
              }}
            >
              Prev
            </Button>
            <Button
              variant="outline"
              disabled={loading || !nextCursor}
              onClick={async () => {
                if (!nextCursor) return;
                await loadMemories({ orgId, cursor: nextCursor, pushCursor: true });
              }}
            >
              Next
            </Button>
            <div className="text-xs text-muted-foreground">
              Showing {items.length} item(s){nextCursor ? "" : " • end"}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Notes</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <div>
            This console is <strong>admin-only</strong> and stores data under:
            <ul className="list-disc pl-5">
              <li>
                <code>orgs/&lt;orgId&gt;/memories</code>
              </li>
              <li>
                <code>orgs/&lt;orgId&gt;/people</code>
              </li>
              <li>
                <code>orgs/&lt;orgId&gt;/tags</code>
              </li>
              <li>
                <code>orgs/&lt;orgId&gt;/memoryEmbeddings</code> (optional)
              </li>
            </ul>
          </div>
          <div>
            Firestore limitation: filtering by <code>person</code> AND <code>tag</code> uses one server-side filter and one
            in-memory filter for correctness (good for small datasets).
          </div>
          <div>
            Tip: set date filters to quickly narrow down results (e.g. from{" "}
            <code>{isoDateOnly(new Date())}</code>).
          </div>
        </CardContent>
      </Card>
    </main>
  );
}


