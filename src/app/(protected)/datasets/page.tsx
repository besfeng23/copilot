"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { fetchJSON } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";

type DatasetListItem = {
  id: string;
  name: string;
  description?: string | null;
  exampleCount?: number | null;
};

function getErrParts(err: unknown) {
  const e = err as any;
  return { message: e?.message, status: e?.status, code: e?.code };
}

export default function DatasetsPage() {
  const { user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  const [datasets, setDatasets] = useState<DatasetListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [notMember, setNotMember] = useState(false);
  const [bootstrapping, setBootstrapping] = useState(false);

  const canCreate = useMemo(() => name.trim().length > 0 && !creating, [name, creating]);

  const getIdToken = useCallback(async () => {
    if (!user) throw new Error("Not authenticated");
    return await user.getIdToken();
  }, [user]);

  const loadDatasets = useCallback(
    async (opts?: { allowNotMember?: boolean }) => {
      setLoading(true);
      setErrorMessage(null);
      if (opts?.allowNotMember !== false) setNotMember(false);

      try {
        const idToken = await getIdToken();
        const data = await fetchJSON<{ datasets?: DatasetListItem[] } | DatasetListItem[]>(
          "/api/datasets",
          {
            headers: { Authorization: `Bearer ${idToken}` },
          }
        );

        const list = Array.isArray(data) ? data : data.datasets || [];
        setDatasets(list);
      } catch (err) {
        const { message, status, code } = getErrParts(err);
        console.error("API error", "message=", message, "status=", status, "code=", code);

        if (status === 401) {
          router.replace(`/login?next=${encodeURIComponent(pathname)}`);
          return;
        }

        if (status === 403 && code === "NOT_A_MEMBER") {
          setNotMember(true);
          setErrorMessage(null);
          return;
        }

        setErrorMessage(message || "Failed to load datasets.");
      } finally {
        setLoading(false);
      }
    },
    [getIdToken, pathname, router]
  );

  useEffect(() => {
    void loadDatasets();
  }, [loadDatasets]);

  const handleBootstrap = async () => {
    setBootstrapping(true);
    setErrorMessage(null);
    try {
      const idToken = await getIdToken();
      await fetchJSON("/api/admin/bootstrap", {
        method: "POST",
        headers: { Authorization: `Bearer ${idToken}` },
      });
      await loadDatasets({ allowNotMember: false });
    } catch (err) {
      const { message, status, code } = getErrParts(err);
      console.error("API error", "message=", message, "status=", status, "code=", code);
      if (status === 401) {
        router.replace(`/login?next=${encodeURIComponent(pathname)}`);
        return;
      }
      setErrorMessage(message || "Could not initialize access. Please try again.");
    } finally {
      setBootstrapping(false);
    }
  };

  const handleCreate = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setErrorMessage("Please enter a dataset name.");
      return;
    }

    setCreating(true);
    setErrorMessage(null);

    try {
      const idToken = await getIdToken();
      await fetchJSON("/api/datasets", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${idToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: trimmed }),
      });
      setName("");
      await loadDatasets();
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
      setErrorMessage(message || "Failed to create dataset.");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Datasets</h1>
          <p className="text-sm text-muted-foreground">
            Manage datasets used for evaluations.
          </p>
        </div>
        <div className="flex w-full gap-2 sm:w-auto">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Dataset name"
            className="sm:w-64"
          />
          <Button onClick={handleCreate} disabled={!canCreate}>
            {creating ? "Creating..." : "New dataset"}
          </Button>
        </div>
      </div>

      {notMember ? (
        <Card className="p-4">
          <div className="space-y-2">
            <div className="text-sm font-medium">Access not initialized</div>
            <div className="text-sm text-muted-foreground">
              It looks like your account isn’t a member yet. Initialize your access to
              continue.
            </div>
            <div className="pt-2">
              <Button onClick={handleBootstrap} disabled={bootstrapping}>
                {bootstrapping ? "Initializing..." : "Initialize my access"}
              </Button>
            </div>
          </div>
        </Card>
      ) : null}

      {errorMessage ? (
        <Card className="p-4">
          <div className="text-sm text-destructive">{errorMessage}</div>
        </Card>
      ) : null}

      <div className="space-y-3">
        {loading ? (
          <div className="text-sm text-muted-foreground">Loading datasets…</div>
        ) : datasets.length === 0 ? (
          <Card className="p-6">
            <div className="text-sm text-muted-foreground">No datasets yet.</div>
          </Card>
        ) : (
          datasets.map((d) => (
            <Card key={d.id} className="p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="truncate font-medium">
                    <Link
                      href={`/datasets/${encodeURIComponent(d.id)}`}
                      className="hover:underline"
                    >
                      {d.name}
                    </Link>
                  </div>
                  {d.description ? (
                    <div className="mt-1 text-sm text-muted-foreground">
                      {d.description}
                    </div>
                  ) : null}
                </div>
                {typeof d.exampleCount === "number" ? (
                  <div className="shrink-0 text-sm text-muted-foreground">
                    {d.exampleCount} examples
                  </div>
                ) : null}
              </div>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}

