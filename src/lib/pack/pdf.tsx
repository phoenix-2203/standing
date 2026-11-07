import { Document, G, Page, Path, Rect, renderToBuffer, StyleSheet, Svg, Text, View } from "@react-pdf/renderer";
import { LOGO_FIGURE, LOGO_SMALL } from "@/components/Logo";
import type { Pack } from "./build";

// PDF export of an explanation pack. Only a `ready` pack (one the validator passed) can be exported.
// Everything printed comes from the pack row: code-rendered fact sentences, the model's connecting
// sentences that passed validation, the code-computed curve, and the evidence snapshot.
// Look: "The Record" — serif for what you read, mono for figures and IDs (they are evidence), pine accents.

const PINE = "#1f4d3f";
const TILE = "#0d4336";
const INK = "#1b1f1d";
const MUTED = "#5c6661";
const LINE = "#d9dfdb";
const PAPER = "#f6f5f0";
const AMBER = "#8a5a00";
const AMBER_BG = "#fdf3dc";

const s = StyleSheet.create({
  page: { paddingTop: 36, paddingBottom: 56, paddingHorizontal: 44, fontSize: 10, fontFamily: "Times-Roman", lineHeight: 1.5, color: INK },

  masthead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingBottom: 10, borderBottomWidth: 1.5, borderBottomColor: PINE, marginBottom: 14 },
  brand: { flexDirection: "row", alignItems: "center" },
  brandName: { fontFamily: "Times-Bold", fontSize: 15, color: INK, marginLeft: 7 },
  mastRight: { fontFamily: "Courier", fontSize: 7.5, color: MUTED, textAlign: "right", lineHeight: 1.35 },

  banner: { flexDirection: "row", backgroundColor: AMBER_BG, borderLeftWidth: 3, borderLeftColor: AMBER, paddingVertical: 5, paddingHorizontal: 8, marginBottom: 14 },
  bannerTag: { fontFamily: "Helvetica-Bold", fontSize: 7.5, color: AMBER, letterSpacing: 0.8, marginRight: 8, paddingTop: 1 },
  bannerText: { fontFamily: "Helvetica", fontSize: 8, color: INK, flex: 1, lineHeight: 1.4 },

  kicker: { fontFamily: "Helvetica-Bold", fontSize: 7.5, color: PINE, letterSpacing: 1.2, marginBottom: 3 },
  h1: { fontFamily: "Times-Bold", fontSize: 24, lineHeight: 1.15, marginBottom: 4 },
  meta: { fontFamily: "Helvetica", fontSize: 8.5, color: MUTED, marginBottom: 14 },

  figures: { flexDirection: "row", borderTopWidth: 0.75, borderBottomWidth: 0.75, borderColor: LINE, marginBottom: 18 },
  figure: { flex: 1, paddingVertical: 8, paddingRight: 8 },
  figureDivider: { borderLeftWidth: 0.75, borderLeftColor: LINE, paddingLeft: 10 },
  figureLabel: { fontFamily: "Helvetica", fontSize: 7.5, color: MUTED, marginBottom: 2 },
  figureValue: { fontFamily: "Courier-Bold", fontSize: 12, color: INK },

  section: { flexDirection: "row", alignItems: "baseline", marginTop: 6, marginBottom: 8 },
  sectionNum: { fontFamily: "Courier", fontSize: 9, color: PINE, width: 20 },
  h2: { fontFamily: "Times-Bold", fontSize: 14, color: INK },

  letter: { backgroundColor: PAPER, paddingVertical: 14, paddingHorizontal: 16, marginBottom: 6 },
  salutation: { marginBottom: 8, fontSize: 11 },
  para: { marginBottom: 8, fontSize: 11, lineHeight: 1.55 },
  ref: { fontFamily: "Courier", fontSize: 7.5, color: PINE },
  note: { fontFamily: "Helvetica", fontSize: 7.5, color: MUTED, marginBottom: 16, lineHeight: 1.4 },

  chartLabel: { fontFamily: "Helvetica", fontSize: 7.5, color: MUTED },

  thead: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: PINE, paddingBottom: 3, marginBottom: 1 },
  th: { fontFamily: "Helvetica-Bold", fontSize: 7, color: MUTED, letterSpacing: 0.6 },
  row: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: LINE, paddingVertical: 5 },
  num: { width: 26, fontFamily: "Courier-Bold", fontSize: 8.5, color: PINE },
  kind: { width: 82, fontFamily: "Helvetica", fontSize: 8, color: INK },
  summaryCol: { flex: 1, paddingRight: 6 },
  summary: { fontSize: 9, lineHeight: 1.4 },
  id: { fontFamily: "Courier", fontSize: 7, color: MUTED, marginTop: 1 },
  sim: { fontFamily: "Helvetica-Bold", fontSize: 6.5, color: AMBER, letterSpacing: 0.5, marginTop: 2 },

  footer: { position: "absolute", bottom: 22, left: 44, right: 44, flexDirection: "row", justifyContent: "space-between", borderTopWidth: 0.5, borderTopColor: LINE, paddingTop: 6, fontFamily: "Helvetica", fontSize: 7, color: MUTED },
});

const day = (d: Date) => d.toISOString().slice(0, 10);
const usd = (cents: number) => `USD ${(cents / 100).toFixed(2)}`;

const KIND: Record<string, string> = {
  sales_summary: "Sales summary",
  txn: "PayPal payment",
  delivery: "Delivery record",
  digital_delivery: "Digital delivery",
  invoice: "Supplier invoice",
  traffic_source: "Traffic source",
};
const kindLabel = (k: string) => KIND[k] ?? k.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());

function Mark({ size }: { size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 1130 1130">
      <Rect x={0} y={0} width={1130} height={1130} rx={200} ry={200} fill={TILE} />
      <G transform={LOGO_SMALL}>
        <Path d={LOGO_FIGURE} fill="#ffffff" />
      </G>
    </Svg>
  );
}

function Section({ n, title, breakBefore }: { n: number; title: string; breakBefore?: boolean }) {
  return (
    <View style={s.section} break={breakBefore} minPresenceAhead={60}>
      <Text style={s.sectionNum}>{String(n).padStart(2, "0")}</Text>
      <Text style={s.h2}>{title}</Text>
    </View>
  );
}

export async function renderPackPdf(pack: Pack, opts: { sandbox?: boolean; generatedAt?: Date } = {}): Promise<Buffer> {
  if (pack.status !== "ready" || !pack.letter) throw new Error(`Pack ${pack.id} is ${pack.status}; only a validated (ready) pack can be exported`);

  // Number each cited evidence item in order of first citation.
  const order: string[] = [];
  for (const p of pack.letter.paragraphs) for (const sentence of p.sentences) for (const c of sentence.citations) if (!order.includes(c)) order.push(c);
  const byId = new Map(pack.evidence.map((e) => [e.id, e]));
  const refOf = (id: string) => order.indexOf(id) + 1;
  const anySimulated = order.some((id) => byId.get(id)?.simulated);
  const sandbox = opts.sandbox ?? true;
  const generated = day(opts.generatedAt ?? pack.createdAt);

  // Headline figures: plain sums over the code-computed curve, the same numbers the chart shows.
  const total = pack.salesCurve.reduce((a, d) => a + d.cents, 0);
  const payments = pack.salesCurve.reduce((a, d) => a + d.orders, 0);
  const best = pack.salesCurve.reduce<Pack["salesCurve"][number] | null>((a, d) => (!a || d.cents > a.cents ? d : a), null);

  const doc = (
    <Document title={`Standing explanation pack ${day(pack.periodTo)}`} author="Standing" creator="Standing" subject="Explanation pack for PayPal account review">
      <Page size="A4" style={s.page}>
        <View style={s.masthead} fixed>
          <View style={s.brand}>
            <Mark size={20} />
            <Text style={s.brandName}>Standing</Text>
          </View>
          <Text style={s.mastRight}>
            Explanation pack · {day(pack.periodFrom)} to {day(pack.periodTo)}
            {"\n"}pack {pack.id}
          </Text>
        </View>

        {sandbox || anySimulated ? (
          <View style={s.banner}>
            <Text style={s.bannerTag}>{sandbox ? "SANDBOX" : "SIMULATED"}</Text>
            <Text style={s.bannerText}>
              {sandbox ? "Built from a PayPal sandbox account, not a live one. " : ""}
              {anySimulated ? "Evidence marked Simulated is test input, not a real record." : ""}
            </Text>
          </View>
        ) : null}

        <Text style={s.kicker}>FOR PAYPAL ACCOUNT REVIEW</Text>
        <Text style={s.h1}>Explanation pack</Text>
        <Text style={s.meta}>
          Covers {day(pack.periodFrom)} to {day(pack.periodTo)} · generated {generated} by Standing from the seller&apos;s PayPal records
        </Text>

        <View style={s.figures}>
          <View style={s.figure}>
            <Text style={s.figureLabel}>Payments received</Text>
            <Text style={s.figureValue}>{payments}</Text>
          </View>
          <View style={[s.figure, s.figureDivider]}>
            <Text style={s.figureLabel}>Total received</Text>
            <Text style={s.figureValue}>{usd(total)}</Text>
          </View>
          <View style={[s.figure, s.figureDivider]}>
            <Text style={s.figureLabel}>Highest day</Text>
            <Text style={s.figureValue}>{best && best.cents > 0 ? usd(best.cents) : "None"}</Text>
          </View>
          <View style={[s.figure, s.figureDivider]}>
            <Text style={s.figureLabel}>Evidence cited</Text>
            <Text style={s.figureValue}>{order.length}</Text>
          </View>
        </View>

        <Section n={1} title="Cover letter" />
        <View style={s.letter}>
          <Text style={s.salutation}>To PayPal&apos;s account review team,</Text>
          {pack.letter.paragraphs.map((p, i) => (
            <Text key={i} style={s.para}>
              {p.sentences.map((sentence, j) => (
                <Text key={j}>
                  {sentence.text}
                  {sentence.citations.length ? <Text style={s.ref}> [{sentence.citations.map(refOf).join(", ")}]</Text> : null}{" "}
                </Text>
              ))}
            </Text>
          ))}
        </View>
        <Text style={s.note}>
          Every bracketed number points to an item in the evidence index (section 3). Statements with figures are generated by Standing&apos;s code from
          that evidence; connecting sentences contain no figures. This pack is prepared by the seller with Standing; it is not a PayPal document.
        </Text>

        <Section n={2} title="Sales curve" />
        <SalesCurve curve={pack.salesCurve} max={best?.cents ?? 0} payments={payments} total={total} />

        <Section n={3} title="Evidence index" breakBefore />
        <View style={s.thead}>
          <Text style={[s.th, { width: 26 }]}>REF</Text>
          <Text style={[s.th, { width: 82 }]}>TYPE</Text>
          <Text style={[s.th, { flex: 1 }]}>WHAT IT SHOWS · EVIDENCE ID</Text>
        </View>
        {order.map((id) => {
          const e = byId.get(id);
          return (
            <View key={id} style={s.row} wrap={false}>
              <Text style={s.num}>[{refOf(id)}]</Text>
              <Text style={s.kind}>{e ? kindLabel(e.kind) : "Unknown"}</Text>
              <View style={s.summaryCol}>
                <Text style={s.summary}>{e ? e.summary : "Missing from the pack's evidence snapshot"}</Text>
                <Text style={s.id}>{id}</Text>
                {e?.simulated ? <Text style={s.sim}>SIMULATED</Text> : null}
              </View>
            </View>
          );
        })}

        <View style={s.footer} fixed>
          {/* No page numbers: a render-prop Text made react-pdf (in this setup) drop the whole footer. */}
          <Text>Standing · prepared {generated}{sandbox ? " · Sandbox" : ""}</Text>
          <Text>pack {pack.id.slice(0, 8)}</Text>
        </View>
      </Page>
    </Document>
  );
  return renderToBuffer(doc);
}

function SalesCurve({ curve, max, payments, total }: { curve: Pack["salesCurve"]; max: number; payments: number; total: number }) {
  const W = 507;
  const H = 130;
  const top = Math.max(1, max);
  const bw = W / Math.max(1, curve.length);
  // One path of bars: simpler for the PDF than hundreds of shapes.
  const bars = curve
    .map((d, i) => {
      const h = (d.cents / top) * (H - 6);
      return h > 0 ? `M${(i * bw + bw * 0.15).toFixed(2)} ${(H - h).toFixed(2)} h${(bw * 0.7).toFixed(2)} v${h.toFixed(2)} h${(-bw * 0.7).toFixed(2)} Z` : "";
    })
    .join(" ");
  return (
    <View wrap={false}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 3 }}>
        <Text style={s.chartLabel}>Daily PayPal payments received (USD)</Text>
        <Text style={[s.chartLabel, { fontFamily: "Courier" }]}>top {usd(max)}</Text>
      </View>
      <Svg width={W} height={H + 1}>
        <Path d={`M0 6 H${W}`} stroke={LINE} strokeWidth={0.5} strokeDasharray="2 2" />
        <Path d={`M0 ${H / 2 + 3} H${W}`} stroke={LINE} strokeWidth={0.5} strokeDasharray="2 2" />
        <Path d={`M0 ${H} H${W}`} stroke={MUTED} strokeWidth={0.75} />
        {bars ? <Path d={bars} fill={PINE} /> : null}
      </Svg>
      <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 3 }}>
        <Text style={[s.chartLabel, { fontFamily: "Courier" }]}>{curve[0]?.day}</Text>
        <Text style={s.chartLabel}>
          {payments} payments, {usd(total)} in all
        </Text>
        <Text style={[s.chartLabel, { fontFamily: "Courier" }]}>{curve.at(-1)?.day}</Text>
      </View>
    </View>
  );
}
