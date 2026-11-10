"use client";

import { useEffect, useState } from "react";
import { Badge, ButtonLink, Callout, Card, PageHeader } from "@/components/ui";
import { api } from "@/lib/ui/client";
import type { HeldStep } from "@/lib/held/held";

// "My money is already held". Every step and its state come from the server (src/lib/held/held.ts);
// PayPal's words below are quoted with their sources. Standing never says a hold will be lifted.

const FUNDS = "https://www.paypal.com/us/brc/article/funds-availability";
const HELP848 =
  "https://www.paypal.com/us/cshelp/article/new-paypal-account-%E2%80%93-payments-on-hold-and-accessing-your-money-quicker-help848";
const STATE = {
  done: ["ok", "Done"],
  todo: ["warn", "To do"],
  unknown: ["info", "Unknown"],
} as const;

export default function HeldPage() {
  const [data, setData] = useState<{
    steps: HeldStep[];
    todo: number;
    dont: string[];
  } | null>(null);
  const [state, setState] = useState<
    "loading" | "ok" | "signed_out" | "failed"
  >("loading");

  useEffect(() => {
    void api<{ steps: HeldStep[]; todo: number; dont: string[] }>(
      "/api/held",
    ).then((res) => {
      if (res.status === 401) return setState("signed_out");
      if (res.status !== 200 || !res.data) return setState("failed");
      setData(res.data);
      setState("ok");
    });
  }, []);

  if (state === "signed_out") {
    return (
      <Card title="Log in to see what to do">
        <a className="button" href="/api/auth/paypal/start">
          Log in with PayPal
        </a>
      </Card>
    );
  }
  if (state === "failed")
    return (
      <Callout tone="bad">
        This page couldn&apos;t load your records. Please try again.
      </Callout>
    );

  return (
    <>
      <PageHeader
        eyebrow="Money on hold"
        title="PayPal is holding your money. Here's what you can do now."
        description={
          data
            ? data.todo
              ? `${data.todo} of ${data.steps.length} steps still to do, worked out from your own PayPal records.`
              : "Every step is done. Your records are in order and your case is ready."
            : "Checking your records…"
        }
      />
      <div className="stack">
        <Callout tone="info" title="Only PayPal can release a hold">
          Standing can&apos;t release your money or speed PayPal up. It helps
          you put right what PayPal can check, and have your case ready if
          PayPal asks.
        </Callout>

        <ol
          className="rows"
          style={{ listStyle: "none", padding: 0, margin: 0 }}
          aria-label="Steps"
        >
          {(data?.steps ?? []).map((s, i) => (
            <li
              key={s.id}
              className="card"
              style={{
                display: "flex",
                gap: "1rem",
                alignItems: "flex-start",
                justifyContent: "space-between",
                flexWrap: "wrap",
              }}
            >
              <div style={{ minWidth: 0, flex: "1 1 22rem" }}>
                <h2 style={{ marginBottom: "0.25rem" }}>
                  {i + 1}. {s.title}
                </h2>
                <p
                  className="muted"
                  style={{ marginBottom: s.action ? "0.6rem" : 0 }}
                >
                  {s.detail}
                </p>
                {s.action && (
                  <ButtonLink
                    href={s.action.href}
                    variant={s.state === "todo" ? "primary" : "secondary"}
                    size="sm"
                  >
                    {s.action.label}
                  </ButtonLink>
                )}
              </div>
              <Badge tone={STATE[s.state][0]}>{STATE[s.state][1]}</Badge>
            </li>
          ))}
        </ol>

        <Card title="What PayPal says">
          <ul
            className="rows"
            style={{ listStyle: "none", padding: 0, margin: 0 }}
          >
            <li>
              &ldquo;Your funds are usually held for up to 21 days.&rdquo;{" "}
              <a
                className="small"
                href={FUNDS}
                target="_blank"
                rel="noreferrer"
              >
                PayPal, Funds availability
              </a>
            </li>
            <li>
              &ldquo;Ship promptly and give customers valid tracking
              information.&rdquo;{" "}
              <a
                className="small"
                href={FUNDS}
                target="_blank"
                rel="noreferrer"
              >
                PayPal, Funds availability
              </a>
            </li>
            <li>
              For new accounts, PayPal says a positive selling history and
              confirmed identity bring faster access to your money.{" "}
              <a
                className="small"
                href={HELP848}
                target="_blank"
                rel="noreferrer"
              >
                PayPal Help, payments on hold
              </a>
            </li>
          </ul>
        </Card>

        <Card
          title="What not to do"
          description="These look like hiding activity, and can turn a hold into something worse. Ask Standing refuses to help with them."
        >
          <ul style={{ margin: 0, paddingLeft: "1.2rem" }}>
            {(data?.dont ?? []).map((d) => (
              <li key={d} style={{ marginBottom: "0.4rem" }}>
                {d}
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}
