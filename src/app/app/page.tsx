"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "firebase/auth";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { getFirebaseAuth } from "@/lib/firebase";
import { fetchJson } from "@/lib/api/client";
import type { ApiError } from "@/lib/api/errors";

type OrgProject = { id: string; name: string; goal: string | null };
type Org = { id: string; name: string; role: string; projects: OrgProject[] };

type ProjectsIndexResponse =
  | { ok: true; orgs: Org[]; projects: Array<OrgProject & { orgId: string }>; reason?: "NO_ORG" }
  | { ok: false; code: string; message: string };

type TruthPack = {
  orgId: string;
  projectId: string;
  latestSummary: { id: string; createdAt: string; payload: { text: string } } | null;
  openTasks: Array<{ id: string; createdAt: string; payload: { title: string; status: "open" | "done" } }>;
  recentDecisionsAndConstraints: Array<{
    id: string;
    kind: "decision" | "constraint";
    createdAt: string;
    payload: { text: string };
  }>;
  recentSummaries: Array<{ id: string; createdAt: string; payload: { text: string } }>;
};

type NextAction = {
  title: string;
  rationale: string;
  requiredWrites: Array<{ kind: string; payload: unknown }>;
};

export default function CopilotDashboardPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { user, loading: authLoading } = useAuth();

  const [orgs, setOrgs] = useState<Org[] | null>(null);
  const [orgId, setOrgId] = useState<string>("");
  const [projectId, setProjectId] = useState<string>("");
  const [projectsReason, setProjectsReason] = useState<"NO_ORG" | null>(null);
  const [bootstrapping, setBootstrapping] = useState(false);

  const [truthPack, setTruthPack] = useState<TruthPack | null>(null);
  const [nextAction, setNextAction] = useState<NextAction | null>(null);
  const [loading, setLoading] = useState(false);

  const [decisionText, setDecisionText] = useState("");
  const [constraintText, setConstraintText] = useState("");
  const [taskTitle, setTaskTitle] = useState("");

  const selectedOrg = useMemo(
    () => (orgs ?? []).find((o) => o.id === orgId) ?? null,
    [orgs, orgId]
  );
  const selectedProject = useMemo(
    () => selectedOrg?.projects.find((p) => p.id === projectId) ?? null,
    [selectedOrg, projectId]
  );

  async function loadProjectsIndex() {
    const data = await fetchJson<ProjectsIndexResponse>("/api/projects", { cache: "no-store" });
    if (!data.ok) {
      // Note: fetchJson only returns non-2xx here, but keep this defensive.
      throw new Error(data.message);
    }
    setOrgs(data.orgs);
    setProjectsReason(data.reason ?? null);

    const fallbackOrg = data.orgs[0]?.id ?? "";
    const fallbackProject = data.orgs[0]?.projects[0]?.id ?? "";
    setOrgId((prev) => prev || fallbackOrg);
    setProjectId((prev) => prev || fallbackProject);
  }

  useEffect(() => {
    if (authLoading) return;
    if (!user) return;

    (async () => {
      try {
        await loadProjectsIndex();
      } catch (err: any) {
        const code = (err as ApiError | undefined)?.code;
        const message = err?.message ?? "Failed to load projects.";
        toast({
          title: "Failed to load projects",
          description: code ? `${message} (${code})` : message,
          variant: "destructive",
        });
        setOrgs([]);
      }
    })();
  }, [authLoading, user, toast]);

  async function bootstrapWorkspace() {
    setBootstrapping(true);
    try {
      await fetchJson("/api/admin/bootstrap", { method: "POST" });
      // Refetch orgs/projects and auto-select fallbacks.
      await loadProjectsIndex();
    } catch (err: any) {
      const code = (err as ApiError | undefined)?.code;
      const message = err?.message ?? "Bootstrap failed.";
      toast({
        title: "Bootstrap failed",
        description: code ? `${message} (${code})` : message,
        variant: "destructive",
      });
    } finally {
      setBootstrapping(false);
    }
  }

  async function refreshAll(targetOrgId?: string, targetProjectId?: string) {
    const o = targetOrgId ?? orgId;
    const p = targetProjectId ?? projectId;
    if (!o || !p) return;

    setLoading(true);
    try {
      const read = await fetchJson<{ ok: true; truthPack: TruthPack }>(
        `/app/api/memory/read?orgId=${encodeURIComponent(o)}&projectId=${encodeURIComponent(p)}`,
        { cache: "no-store" }
      );
      setTruthPack(read.truthPack);

      const next = await fetchJson<{ ok: true; nextAction: NextAction }>(
        "/app/api/copilot/next",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orgId: o, projectId: p }),
        }
      );
      setNextAction(next.nextAction);
    } catch (err: any) {
      toast({ title: "Failed to refresh", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!orgId || !projectId) return;
    refreshAll(orgId, projectId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, projectId]);

  async function write(kind: "decision" | "constraint" | "task", payload: unknown) {
    if (!orgId || !projectId) return;
    await fetchJson("/app/api/memory/write", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orgId, projectId, kind, payload }),
    });
    await refreshAll();
  }

  async function handleLogout() {
    await signOut(getFirebaseAuth()).catch(() => {});
    await fetch("/app/api/auth/logout", { method: "POST" }).catch(() => {});
    router.replace("/login");
  }

  if (authLoading || !user) {
    return (
      <div className="p-6">
        <Skeleton className="h-8 w-64" />
      </div>
    );
  }

  if (orgs !== null && orgs.length === 0 && projectsReason === "NO_ORG") {
    return (
      <main className="min-h-screen bg-background p-4 md:p-6">
        <div className="mx-auto max-w-xl">
          <h1 className="mb-2 text-2xl font-semibold">Copilot Dashboard</h1>
          <p className="mb-6 text-sm text-muted-foreground">
            You don’t have a workspace yet. Create one to start using projects.
          </p>
          <Button className="w-full" disabled={bootstrapping} onClick={bootstrapWorkspace}>
            Create workspace
          </Button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background p-4 md:p-6">
      <div className="mb-4 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Copilot Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            One best next action, backed by append-only memory.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={() => router.push("/projects/new")}>
            New Project
          </Button>
          <Button variant="outline" onClick={handleLogout}>
            Logout
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        {/* Left */}
        <div className="lg:col-span-3 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Project</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {orgs === null ? (
                <Skeleton className="h-10 w-full" />
              ) : (
                <>
                  <div className="space-y-2">
                    <Label>Org</Label>
                    <Select
                      value={orgId}
                      onValueChange={(v) => {
                        setOrgId(v);
                        const firstProject = orgs.find((o) => o.id === v)?.projects[0]?.id ?? "";
                        setProjectId(firstProject);
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select org" />
                      </SelectTrigger>
                      <SelectContent>
                        {orgs.map((o) => (
                          <SelectItem key={o.id} value={o.id}>
                            {o.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Project</Label>
                    <Select value={projectId} onValueChange={(v) => setProjectId(v)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select project" />
                      </SelectTrigger>
                      <SelectContent>
                        {(selectedOrg?.projects ?? []).map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Current goal</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground whitespace-pre-wrap">
              {selectedProject?.goal ??
                truthPack?.latestSummary?.payload.text?.split("\n")[0] ??
                "No goal yet."}
            </CardContent>
          </Card>
        </div>

        {/* Center */}
        <div className="lg:col-span-6 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">ONE BEST NEXT ACTION</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {loading && !nextAction ? (
                <Skeleton className="h-24 w-full" />
              ) : nextAction ? (
                <>
                  <div className="text-lg font-medium">{nextAction.title}</div>
                  <div className="text-sm text-muted-foreground whitespace-pre-wrap">
                    {nextAction.rationale}
                  </div>
                  {nextAction.requiredWrites.length > 0 && (
                    <div className="text-xs text-muted-foreground">
                      Requires writes:{" "}
                      {nextAction.requiredWrites.map((w) => w.kind).join(", ")}
                    </div>
                  )}
                  <Button
                    variant="secondary"
                    disabled={loading}
                    onClick={() => refreshAll()}
                  >
                    Refresh
                  </Button>
                </>
              ) : (
                <div className="text-sm text-muted-foreground">No action yet.</div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Quick add</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label>Decision</Label>
                <Textarea
                  value={decisionText}
                  onChange={(e) => setDecisionText(e.target.value)}
                  placeholder="Add a decision…"
                />
                <Button
                  className="w-full"
                  disabled={!decisionText.trim() || loading}
                  onClick={async () => {
                    await write("decision", { text: decisionText.trim() });
                    setDecisionText("");
                  }}
                >
                  Append
                </Button>
              </div>

              <div className="space-y-2">
                <Label>Constraint</Label>
                <Textarea
                  value={constraintText}
                  onChange={(e) => setConstraintText(e.target.value)}
                  placeholder="Add a constraint…"
                />
                <Button
                  className="w-full"
                  disabled={!constraintText.trim() || loading}
                  onClick={async () => {
                    await write("constraint", { text: constraintText.trim() });
                    setConstraintText("");
                  }}
                >
                  Append
                </Button>
              </div>

              <div className="space-y-2">
                <Label>Task</Label>
                <Input
                  value={taskTitle}
                  onChange={(e) => setTaskTitle(e.target.value)}
                  placeholder="Add an open task…"
                />
                <Button
                  className="w-full"
                  disabled={!taskTitle.trim() || loading}
                  onClick={async () => {
                    await write("task", { title: taskTitle.trim(), status: "open" });
                    setTaskTitle("");
                  }}
                >
                  Append
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right */}
        <div className="lg:col-span-3 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Latest summary</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground whitespace-pre-wrap">
              {truthPack?.latestSummary?.payload.text ?? "No summary yet."}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Recent Decisions + Constraints</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {(truthPack?.recentDecisionsAndConstraints ?? []).length === 0 ? (
                <div className="text-sm text-muted-foreground">None yet.</div>
              ) : (
                truthPack?.recentDecisionsAndConstraints.map((m) => (
                  <div key={m.id} className="text-sm">
                    <div className="text-xs text-muted-foreground">
                      {m.kind} • {new Date(m.createdAt).toLocaleString()}
                    </div>
                    <div className="whitespace-pre-wrap">{m.payload.text}</div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Recent summaries</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {(truthPack?.recentSummaries ?? []).length === 0 ? (
                <div className="text-sm text-muted-foreground">None yet.</div>
              ) : (
                truthPack?.recentSummaries.map((m) => (
                  <div key={m.id} className="text-sm">
                    <div className="text-xs text-muted-foreground">
                      {new Date(m.createdAt).toLocaleString()}
                    </div>
                    <div className="whitespace-pre-wrap">
                      {m.payload.text.length > 200 ? `${m.payload.text.slice(0, 200)}…` : m.payload.text}
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  );
}

