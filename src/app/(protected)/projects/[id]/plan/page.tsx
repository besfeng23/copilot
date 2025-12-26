"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";

async function fetchJson<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const res = await fetch(input, init);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (json?.message as string | undefined) ?? `Request failed (${res.status})`;
    throw new Error(msg);
  }
  return json as T;
}

function SectionList(props: { sections: Array<{ title: string; bullets: string[] }> }) {
  return (
    <div className="space-y-4">
      {props.sections.map((s, idx) => (
        <Card key={idx}>
          <CardHeader>
            <CardTitle className="text-base">{s.title}</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="list-disc pl-5 space-y-1 text-sm">
              {s.bullets.map((b, i) => (
                <li key={i}>{b}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export default function ProjectPlanPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const search = useSearchParams();
  const { toast } = useToast();

  const projectId = params.id;
  const requestedPlanId = search.get("planId");

  const [loading, setLoading] = useState(true);
  const [project, setProject] = useState<any>(null);
  const [planRecord, setPlanRecord] = useState<any>(null);
  const approved = useMemo(() => Boolean(project?.approvedPlanId), [project?.approvedPlanId]);
  const approvedPlanId = project?.approvedPlanId ?? null;

  async function load() {
    setLoading(true);
    try {
      const url = requestedPlanId
        ? `/api/projects/${encodeURIComponent(projectId)}/plan?planId=${encodeURIComponent(requestedPlanId)}`
        : `/api/projects/${encodeURIComponent(projectId)}/plan`;
      const out = await fetchJson<{ ok: true; project: any; plan: any | null }>(url, { cache: "no-store" });
      setProject(out.project);
      setPlanRecord(out.plan);
    } catch (err: any) {
      toast({ title: "Failed to load plan", description: err.message, variant: "destructive" });
      setProject(null);
      setPlanRecord(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, requestedPlanId]);

  async function approvePlan() {
    if (!planRecord?.id) return;
    try {
      const out = await fetchJson<{ ok: true; approvedPlanId: string }>(`/api/projects/${projectId}/plan/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId: planRecord.id }),
      });
      toast({ title: "Plan approved", description: `Locked planId=${out.approvedPlanId}` });
      await load();
    } catch (err: any) {
      toast({ title: "Approve failed", description: err.message, variant: "destructive" });
    }
  }

  const plan = planRecord?.plan ?? null;

  return (
    <main className="min-h-screen bg-background p-4 md:p-6">
      <div className="mb-4 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Plan</h1>
          <p className="text-sm text-muted-foreground">
            {project?.name ?? "Project"} • {planRecord?.id ? `planId=${planRecord.id}` : "no plan yet"}
          </p>
          {approvedPlanId && (
            <p className="text-xs text-muted-foreground">Approved planId: {approvedPlanId}</p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={approvePlan} disabled={loading || !planRecord?.id || approved}>
            Approve Plan
          </Button>
          <Button variant="secondary" onClick={() => router.push(`/projects/${projectId}/run`)}>
            Go to Run
          </Button>
        </div>
      </div>

      {loading ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">Loading…</CardContent>
        </Card>
      ) : !plan ? (
        <Card>
          <CardContent className="p-6 space-y-2">
            <div className="text-sm text-muted-foreground">No plan found.</div>
            <Button variant="outline" onClick={() => router.push("/projects/new")}>
              Back to /projects/new
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Tabs defaultValue="blueprint" className="w-full">
          <TabsList>
            <TabsTrigger value="blueprint">Blueprint</TabsTrigger>
            <TabsTrigger value="roadmap">Roadmap</TabsTrigger>
            <TabsTrigger value="prompts">Prompts</TabsTrigger>
          </TabsList>

          <TabsContent value="blueprint" className="mt-4">
            <SectionList sections={plan.blueprint.sections} />
          </TabsContent>

          <TabsContent value="roadmap" className="mt-4">
            <div className="space-y-4">
              {plan.roadmap.phases.map((p: any, idx: number) => (
                <Card key={idx}>
                  <CardHeader>
                    <CardTitle className="text-base">{p.name}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    <div>
                      <div className="text-xs text-muted-foreground">Outcomes</div>
                      <ul className="list-disc pl-5 space-y-1">
                        {p.outcomes.map((x: string, i: number) => (
                          <li key={i}>{x}</li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Acceptance criteria</div>
                      <ul className="list-disc pl-5 space-y-1">
                        {p.acceptanceCriteria.map((x: string, i: number) => (
                          <li key={i}>{x}</li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Steps</div>
                      <ol className="list-decimal pl-5 space-y-1">
                        {p.steps.map((x: string, i: number) => (
                          <li key={i}>{x}</li>
                        ))}
                      </ol>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="prompts" className="mt-4">
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {(
                [
                  ["Cursor", "cursor"],
                  ["Firebase Studio", "firebaseStudio"],
                  ["GitHub", "github"],
                  ["Vercel", "vercel"],
                  ["Slack", "slack"],
                ] as const
              ).map(([label, key]) => (
                <Card key={key}>
                  <CardHeader>
                    <CardTitle className="text-base">{label}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {(plan.prompts[key] ?? []).length === 0 ? (
                      <div className="text-sm text-muted-foreground">No prompts.</div>
                    ) : (
                      <ol className="list-decimal pl-5 text-sm space-y-2">
                        {plan.prompts[key].map((p: string, i: number) => (
                          <li key={i} className="whitespace-pre-wrap">
                            {p}
                          </li>
                        ))}
                      </ol>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      )}
    </main>
  );
}

