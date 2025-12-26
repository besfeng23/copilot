"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { fetchJson } from "@/lib/api/client";

function VoicePanel(props: { projectId: string }) {
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
      setBlob(new Blob(chunks, { type: mr.mimeType || "audio/webm" }));
    };
    (window as any).__copilot_mr_run = mr;
    mr.start();
    setRecording(true);
  }

  async function stop() {
    const mr: MediaRecorder | undefined = (window as any).__copilot_mr_run;
    mr?.stop();
    setRecording(false);
  }

  async function upload() {
    if (!blob) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.set("file", new File([blob], "rage.webm", { type: blob.type || "audio/webm" }));
      const out = await fetchJson<{ ok: true; artifactId: string }>(`/api/projects/${props.projectId}/voice/upload`, {
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
    if (!voiceArtifactId) return;
    setBusy(true);
    try {
      const out = await fetchJson<{ ok: true; transcriptArtifactId: string; text: string }>(
        `/api/projects/${props.projectId}/voice/transcribe`,
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
    if (!transcriptArtifactId) return;
    setBusy(true);
    try {
      const out = await fetchJson<{ ok: true; planId: string; plan: any }>(`/api/projects/${props.projectId}/voice/convert-to-plan`, {
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

      toast({ title: "Converted to plan", description: `planId=${out.planId}` });
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

export default function RunPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const { toast } = useToast();
  const projectId = params.id;

  const [approvedPlanId, setApprovedPlanId] = useState<string | null>(null);
  const [obna, setObna] = useState<{ title: string; timeboxMinutes: number; steps: string[] } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const out = await fetchJson<{ ok: true; project: any; plan: any | null }>(`/api/projects/${projectId}/plan`, {
          cache: "no-store",
        });
        setApprovedPlanId(out.project?.approvedPlanId ?? null);
        const plan = out.plan?.plan ?? null;
        const one = plan?.oneBestNextAction ?? null;
        setObna(one ? { title: one.title, timeboxMinutes: one.timeboxMinutes, steps: one.steps } : null);
      } catch (err: any) {
        toast({ title: "Failed to load", description: err.message, variant: "destructive" });
        setApprovedPlanId(null);
        setObna(null);
      } finally {
        setLoading(false);
      }
    })();
  }, [projectId, toast]);

  return (
    <main className="min-h-screen bg-background p-4 md:p-6">
      <div className="mb-4 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Run</h1>
          <p className="text-sm text-muted-foreground">Execute the OBNA, keep moving.</p>
          {approvedPlanId && <p className="text-xs text-muted-foreground">Approved planId: {approvedPlanId}</p>}
        </div>
        <Button variant="outline" onClick={() => router.push(`/projects/${projectId}/plan`)}>
          Back to Plan
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="lg:col-span-7 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">OBNA</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {loading ? (
                <div className="text-sm text-muted-foreground">Loading…</div>
              ) : obna ? (
                <>
                  <div className="font-medium">
                    {obna.title} ({obna.timeboxMinutes}m)
                  </div>
                  <ol className="list-decimal pl-5 text-sm space-y-1">
                    {obna.steps.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ol>
                </>
              ) : (
                <div className="text-sm text-muted-foreground">No OBNA yet. Generate or approve a plan first.</div>
              )}
            </CardContent>
          </Card>
        </div>
        <div className="lg:col-span-5 space-y-4">
          <VoicePanel projectId={projectId} />
        </div>
      </div>
    </main>
  );
}

