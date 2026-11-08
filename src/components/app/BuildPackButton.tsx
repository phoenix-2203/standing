"use client";

import { Hammer } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui";
import { api } from "@/lib/ui/client";

/** Starts a pack build (the same call as before) and opens the pack. */
export function BuildPackButton({ variant = "primary", label = "Build pack" }: { variant?: "primary" | "secondary"; label?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function build() {
    setBusy(true);
    setError(null);
    const res = await api<{ id?: string; error?: string }>("/api/packs", { method: "POST" });
    setBusy(false);
    if (res.status === 201 && res.data?.id) router.push(`/packs/${res.data.id}`);
    else setError(res.data?.error ?? "The pack couldn't be built.");
  }
  return (
    <span className="build-pack">
      <Button variant={variant} onClick={build} loading={busy} icon={<Hammer size={16} strokeWidth={1.75} aria-hidden="true" />}>
        {busy ? "Building… (up to a minute)" : label}
      </Button>
      {error && (
        <span className="ui-error" role="alert">
          {error}
        </span>
      )}
    </span>
  );
}
