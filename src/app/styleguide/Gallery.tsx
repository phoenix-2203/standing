"use client";

import { FileText, Inbox, Plus, Send } from "lucide-react";
import { useState } from "react";
import {
  Badge,
  Button,
  ButtonLink,
  Callout,
  Card,
  Checkbox,
  ConfirmDialog,
  CopyId,
  EmptyState,
  Field,
  Input,
  KeyValue,
  PageHeader,
  SandboxTag,
  Select,
  SimulatedBadge,
  Skeleton,
  SkeletonText,
  StatTile,
  Tabs,
  Textarea,
  Timeline,
  ToastProvider,
  useToast,
} from "@/components/ui";
import { dateTime, money, ratio } from "@/lib/ui/format";

export function Gallery() {
  return (
    <ToastProvider>
      <main className="page sg">
        <PageHeader eyebrow="Design system" title="Components" description="Every piece Standing's screens are built from. Example content only." action={<SandboxTag />} />
        <Sections />
      </main>
    </ToastProvider>
  );
}

function Sections() {
  const toast = useToast();
  const [dialog, setDialog] = useState(false);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<"all" | "tracking" | "unprotected">("all");
  return (
    <div className="sg-grid">
      <Card title="Buttons" description="Primary, secondary, ghost, danger; two sizes; loading.">
        <div className="sg-row">
          <Button icon={<Plus size={16} strokeWidth={1.75} aria-hidden="true" />}>Build pack</Button>
          <Button variant="secondary">Add evidence</Button>
          <Button variant="ghost">See why</Button>
          <Button variant="danger" onClick={() => setDialog(true)}>
            Cancel fix
          </Button>
        </div>
        <div className="sg-row">
          <Button size="sm">Add tracking</Button>
          <Button size="sm" variant="secondary">
            Download CSV
          </Button>
          <Button size="sm" loading>
            Sending
          </Button>
          <ButtonLink size="sm" variant="secondary" href="#tabs">
            A link
          </ButtonLink>
        </div>
      </Card>

      <Card title="Badges" description="Status, Simulated and Sandbox, the same everywhere.">
        <div className="sg-row">
          <Badge tone="ok">ready</Badge>
          <Badge tone="warn">needs you</Badge>
          <Badge tone="bad">blocked</Badge>
          <Badge tone="info">for context</Badge>
          <Badge>not built</Badge>
          <Badge tone="accent">allowed</Badge>
        </div>
        <div className="sg-row">
          <SimulatedBadge />
          <SandboxTag />
          <SandboxTag compact />
        </div>
      </Card>

      <Card title="Stat tiles" description="One figure, what it means, and the threshold." className="sg-wide">
        <div className="sg-stats">
          <StatTile label="Sales in the last 24 h" figure={ratio(0.42)} sub="of an average day" note="Warns at 3.0×" />
          <StatTile label="Largest recent order" figure={ratio(5.14)} sub="your 28-day average order" note="Warns at 5.0×" tone="warn" badge={<Badge tone="warn">needs you</Badge>} />
          <StatTile label="Tracking on shipped orders" figure="90%" sub="9 of 10 tracked" note="Warns below 90%" />
          <StatTile label="Disputes, 90 days" figure="0.0%" sub="0 of 41 orders" note="Shown for context" />
        </div>
      </Card>

      <Card title="Callouts">
        <div className="sg-stack">
          <Callout title="PayPal reports this account as verified.">Nothing to do here.</Callout>
          <Callout tone="warn" title="Couldn't reach PayPal just now">
            Showing data from {dateTime(new Date("2026-11-08T14:05:00Z"), "UTC")}. Standing will try again in 15 minutes.
          </Callout>
          <Callout tone="bad" title="Standing won't help with that">
            Splitting one payment into several to stay under a limit is a way of getting around PayPal&apos;s checks.
          </Callout>
        </div>
      </Card>

      <Card title="Fix queue timeline" description="Preview → waiting → sent → PayPal's answer.">
        <Timeline
          label="Tracking fix"
          steps={[
            { title: "Previewed", detail: "Tracking 1Z999AA10123456784 · UPS", state: "done", time: "14:02" },
            { title: "Waiting", detail: "Sends in 1:42 unless you cancel", state: "current" },
            { title: "Sent to PayPal", state: "upcoming" },
            { title: "PayPal's answer", state: "upcoming" },
          ]}
        />
      </Card>

      <Card title="Tabs" id="tabs" description="Arrow keys move between tabs.">
        <Tabs
          label="Order views"
          value={tab}
          onChange={setTab}
          items={[
            { value: "all", label: "All orders", count: 41 },
            { value: "tracking", label: "Missing tracking", count: 3 },
            { value: "unprotected", label: "Not eligible for Seller Protection", count: 12 },
          ]}
          panel={<p className="muted">Showing: {tab}</p>}
        />
      </Card>

      <Card title="Form fields">
        <form className="sg-stack" onSubmit={(e) => e.preventDefault()}>
          <Field label="Supplier" hint="As it appears on the invoice.">
            {(p) => <Input {...p} placeholder="Wax & Wick Supplies" />}
          </Field>
          <Field label="Kind" error="Choose whether this product is physical or digital.">
            {(p) => (
              <Select {...p} defaultValue="">
                <option value="" disabled>
                  Choose…
                </option>
                <option>Physical</option>
                <option>Digital</option>
              </Select>
            )}
          </Field>
          <Field label="Your question">{(p) => <Textarea {...p} placeholder="What is my spike ratio?" />}</Field>
          <Checkbox toggle defaultChecked label="Simulated" hint="Test data: labelled Simulated everywhere it appears." />
          <Checkbox label="Remember this choice" />
        </form>
      </Card>

      <Card title="Key / value, IDs">
        <KeyValue
          items={[
            { label: "Status", value: <Badge tone="ok">ready</Badge> },
            { label: "Covers", value: "8 Sep 2026 – 8 Nov 2026" },
            { label: "Total received", value: <span className="mono">{money(1234.5)}</span> },
            { label: "Capture", value: <CopyId value="2R095039YH1597740" label="capture ID" /> },
            { label: "Pack", value: <CopyId value="3187be6d-dd48-41f5-b187-8957d3510b18" label="pack ID" /> },
          ]}
        />
      </Card>

      <Card title="Empty state">
        <EmptyState
          icon={Inbox}
          title="No packs yet"
          action={
            <Button size="sm" icon={<FileText size={16} strokeWidth={1.75} aria-hidden="true" />}>
              Build pack
            </Button>
          }
        >
          A pack is your case, built from your PayPal records before anyone asks. Build one any time; it takes about a minute.
        </EmptyState>
      </Card>

      <Card title="Loading">
        <div className="sg-stack">
          <Skeleton height={28} width="40%" />
          <SkeletonText lines={3} />
        </div>
      </Card>

      <Card title="Toast and dialog" description="Results of actions; confirmation before destructive ones.">
        <div className="sg-row">
          <Button
            variant="secondary"
            icon={<Send size={16} strokeWidth={1.75} aria-hidden="true" />}
            onClick={() => toast({ tone: "ok", title: "Tracking sent to PayPal", paypalId: { label: "Debug ID", value: "f177910bcc292" } })}
          >
            Show success
          </Button>
          <Button variant="secondary" onClick={() => toast({ tone: "bad", title: "PayPal didn't answer in time", detail: "Marked unknown, not failed. Standing will check before trying again." })}>
            Show problem
          </Button>
          <Button variant="danger" onClick={() => setDialog(true)}>
            Open dialog
          </Button>
        </div>
      </Card>

      <ConfirmDialog
        open={dialog}
        title="Cancel this tracking fix?"
        confirmLabel="Cancel fix"
        cancelLabel="Keep it"
        busy={busy}
        onCancel={() => setDialog(false)}
        onConfirm={() => {
          setBusy(true);
          setTimeout(() => {
            setBusy(false);
            setDialog(false);
            toast({ tone: "info", title: "Fix cancelled", detail: "Nothing was sent to PayPal." });
          }, 600);
        }}
      >
        Nothing has been sent yet. You can queue it again from the order.
      </ConfirmDialog>
    </div>
  );
}
