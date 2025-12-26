"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { fetchJson } from "@/lib/api/client";
import { useAuth } from "@/lib/auth";

type IntakeMsg = { role: "user" | "assistant"; text: string; localId: string };

function uid() {
  return globalThis.crypto?.randomUUID?.() ?? String(Date.now());
}

function VoicePanel(props: { projectId: string | null; ensureProject: () => Promise<string> }) {
  const { toast } = useToast();
  const [recording, setRecording] = useState(false);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [voiceArtifactId, setVoiceArtifactId] = useState<string | null>(null);
  const [transcriptArtifactId, setTranscriptArtifactId] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<string>("");
  const [obna, setObna] = useState<{ title: string; timeboxMinutes: number; steps: string[] } | null>(null);
  const [next5, setNext5] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const audioUrl = useMemo(() => (blob ? URL.createObjectURL(blob) : null), [blob]);

  useEffect(() => {
    return () => {
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
  }, [audioUrl]);

  async function start() {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mr = new MediaRecorder(stream);
    const chunks: BlobPart[] = [];
    mr.ondataavailable = (e) => chunks.push(e.data);
    mr.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      const b = new Blob(chunks, { type: mr.mimeType || "audio/webm" });
      setBlob(b);
    };

    (window as any).__copilot_mr = mr;
    mr.start();
    setRecording(true);
  }

  async function stop() {
    const mr: MediaRecorder | undefined = (window as any).__copilot_mr;
    mr?.stop();
    setRecording(false);
  }

  async function upload() {
    const projectId = await props.ensureProject();
    if (!blob) throw new Error("No audio recorded.");
    setBusy(true);
    try {
      const fd = new FormData();
      fd.set("file", new File([blob], "rage.webm", { type: blob.type || "audio/webm" }));
      const out = await fetchJson<{ ok: true; artifactId: string }>(`/api/projects/${projectId}/voice/upload`, {
        method: "POST",
        body: fd,
      });
      setVoiceArtifactId(out.artifactId);
      toast({ title: "Uploaded voice" });
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  async function transcribe() {
    const projectId = await props.ensureProject();
    if (!voiceArtifactId) throw new Error("Upload first.");
    setBusy(true);
    try {
      const out = await fetchJson<{ ok: true; transcriptArtifactId: string; text: string }>(
        `/api/projects/${projectId}/voice/transcribe`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ voiceArtifactId }),
        }
      );
      setTranscriptArtifactId(out.transcriptArtifactId);
      setTranscript(out.text);
      toast({ title: "Transcribed" });
    } catch (err: any) {
      toast({ title: "Transcription failed", description: err.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  async function convertToPlan() {
    const projectId = await props.ensureProject();
    if (!transcriptArtifactId) throw new Error("Transcribe first.");
    setBusy(true);
    try {
      const out = await fetchJson<{ ok: true; planId: string; plan: any }>(`/api/projects/${projectId}/voice/convert-to-plan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcriptArtifactId }),
      });

      const plan = out.plan;
      const one = plan?.oneBestNextAction;
      setObna(one ? { title: one.title, timeboxMinutes: one.timeboxMinutes, steps: one.steps } : null);

      const steps: string[] = [];
      for (const phase of plan?.roadmap?.phases ?? []) {
        for (const s of phase?.steps ?? []) steps.push(s);
      }
      setNext5(steps.slice(0, 5));
      toast({ title: "Converted to plan" });
    } catch (err: any) {
      toast({ title: "Convert failed", description: err.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Voice: rage → plan</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <Button variant={recording ? "destructive" : "secondary"} onClick={recording ? stop : start} disabled={busy}>
            {recording ? "Stop" : "Record"}
          </Button>
          <Button variant="outline" onClick={upload} disabled={!blob || busy}>
            Upload
          </Button>
          <Button variant="outline" onClick={transcribe} disabled={!voiceArtifactId || busy}>
            Transcribe
          </Button>
          <Button onClick={convertToPlan} disabled={!transcriptArtifactId || busy}>
            Convert-to-Plan
          </Button>
        </div>

        {audioUrl && (
          <audio controls className="w-full" src={audioUrl}>
            <track kind="captions" />
          </audio>
        )}

        {transcript && (
          <div className="space-y-2">
            <div className="text-xs text-muted-foreground">Transcript</div>
            <div className="rounded-md border p-2 text-sm whitespace-pre-wrap">{transcript}</div>
          </div>
        )}

        {(obna || next5.length > 0) && (
          <div className="space-y-3">
            {obna && (
              <div className="space-y-1">
                <div className="text-xs text-muted-foreground">OBNA (timeboxed)</div>
                <div className="font-medium">
                  {obna.title} ({obna.timeboxMinutes}m)
                </div>
                <ol className="list-decimal pl-5 text-sm space-y-1">
                  {obna.steps.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ol>
              </div>
            )}
            {next5.length > 0 && (
              <div className="space-y-1">
                <div className="text-xs text-muted-foreground">Next 5 actions</div>
                <ol className="list-decimal pl-5 text-sm space-y-1">
                  {next5.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ol>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function NewProjectPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { user, loading: authLoading } = useAuth();

  const [projectName, setProjectName] = useState("New project");
  const [projectGoal, setProjectGoal] = useState("");

  const [projectId, setProjectId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [draftMessages, setDraftMessages] = useState<IntakeMsg[]>([
    {
      role: "assistant",
      text: "Tell me what you’re trying to ship, what’s broken, and what success looks like. Drop context, links, or constraints.",
      localId: uid(),
    },
  ]);
  const [input, setInput] = useState("");

  async function ensureProject(): Promise<string> {
    if (projectId) return projectId;
    // Ensure org + default project exist (idempotent) so dashboard is usable.
    await fetchJson("/api/admin/bootstrap", { method: "POST" });
    const created = await fetchJson<{ ok: true; project: { id: string } }>("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: projectName || "New project", goal: projectGoal || null }),
    });
    setProjectId(created.project.id);
    return created.project.id;
  }

  async function flushDraftMessages(targetProjectId: string, msgs: IntakeMsg[]) {
    for (const m of msgs) {
      if (m.role === "assistant") continue; // store user messages only by default
      await fetchJson(`/api/projects/${targetProjectId}/intake/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: "user", text: m.text }),
      });
    }
  }

  async function send() {
    const text = input.trim();
    if (!text) return;
    setInput("");
    const msg: IntakeMsg = { role: "user", text, localId: uid() };
    setDraftMessages((prev) => [...prev, msg]);

    try {
      const pid = await ensureProject();
      await fetchJson(`/api/projects/${pid}/intake/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: "user", text }),
      });
    } catch (err: any) {
      toast({ title: "Failed to save message", description: err.message, variant: "destructive" });
    }
  }

  async function generatePlan() {
    setBusy(true);
    try {
      const pid = await ensureProject();
      const userMsgs = draftMessages.filter((m) => m.role === "user");
      // In case the project was created late (or some sends failed), flush all local user msgs best-effort.
      await flushDraftMessages(pid, userMsgs);

      const out = await fetchJson<{ ok: true; planId: string }>(`/api/projects/${pid}/plan/generate`, {
        method: "POST",
      });
      router.push(`/projects/${pid}/plan?planId=${encodeURIComponent(out.planId)}`);
    } catch (err: any) {
      toast({ title: "Plan generation failed", description: err.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    // If auth not ready, do nothing.
    if (authLoading) return;
    if (!user) return;
    // Don't auto-create a project; do it on first action, so user can set name/goal first.
  }, [authLoading, user]);

  return (
    <main className="min-h-screen bg-background p-4 md:p-6">
      <div className="mb-4 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">New Project</h1>
          <p className="text-sm text-muted-foreground">
            Intake chat + structured capture. Generate a strict plan (Blueprint/Roadmap/Prompts + OBNA).
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={generatePlan} disabled={busy}>
            Generate Plan
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="lg:col-span-7 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Intake chat</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="max-h-[420px] overflow-auto rounded-md border p-3 space-y-3">
                {draftMessages.map((m) => (
                  <div key={m.localId} className="text-sm">
                    <div className="text-xs text-muted-foreground">{m.role === "user" ? "You" : "Copilot"}</div>
                    <div className="whitespace-pre-wrap">{m.text}</div>
                  </div>
                ))}
              </div>
              <div className="space-y-2">
                <Textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Describe the project, constraints, and what you want Copilot to do…"
                />
                <div className="flex gap-2">
                  <Button onClick={send} disabled={!input.trim()}>
                    Send
                  </Button>
                  <Button variant="outline" onClick={() => setDraftMessages((p) => [...p, { role: "assistant", text: "What is the ONE outcome that would make this week a win?", localId: uid() }])}>
                    Nudge question
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-5 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Structured capture</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Project name</Label>
                <Input value={projectName} onChange={(e) => setProjectName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Goal</Label>
                <Textarea value={projectGoal} onChange={(e) => setProjectGoal(e.target.value)} placeholder="What does success look like?" />
              </div>
              <div className="text-xs text-muted-foreground">
                Project will be created on first Send / Generate / Voice action. No OpenAI calls happen client-side.
              </div>
            </CardContent>
          </Card>

          <VoicePanel projectId={projectId} ensureProject={ensureProject} />
        </div>
      </div>
    </main>
  );
}

