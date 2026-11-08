"use client";

import { RotateCcw } from "lucide-react";
import { Button, Callout } from "@/components/ui";

// Shown when a page fails to render. Says what happened without guessing at the cause; nothing was sent to PayPal.
export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="status-page">
      <Callout
        tone="bad"
        title="Something went wrong on our side"
        action={
          <Button variant="secondary" size="sm" onClick={reset} icon={<RotateCcw size={14} strokeWidth={1.75} aria-hidden="true" />}>
            Try again
          </Button>
        }
      >
        This page couldn&apos;t load. Nothing was sent to PayPal. If it keeps happening, the rest of the app may still work.
      </Callout>
    </main>
  );
}
