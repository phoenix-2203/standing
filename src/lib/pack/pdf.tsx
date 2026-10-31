import { Document, Page, Path, renderToBuffer, StyleSheet, Svg, Text, View } from "@react-pdf/renderer";
import type { Pack } from "./build";

// PDF export of an explanation pack. Only a `ready` pack (one the validator passed) can be exported.
// Everything printed comes from the pack row: code-rendered fact sentences, the model's connecting
// sentences that passed validation, the code-computed curve, and the evidence snapshot.

const s = StyleSheet.create({
  page: { padding: 40, fontSize: 10, fontFamily: "Helvetica", lineHeight: 1.45, color: "#1a1a1a" },
  banner: { backgroundColor: "#fff4d6", padding: 6, marginBottom: 12, fontSize: 9 },
  h1: { fontSize: 18, fontFamily: "Helvetica-Bold", marginBottom: 2 },
  meta: { fontSize: 9, color: "#555", marginBottom: 14 },
  h2: { fontSize: 12, fontFamily: "Helvetica-Bold", marginTop: 14, marginBottom: 6 },
  para: { marginBottom: 8 },
  ref: { fontSize: 7, color: "#555" },
  chartLabel: { fontSize: 8, color: "#555" },
  row: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: "#ddd", paddingVertical: 3 },
  num: { width: 22, fontSize: 8, color: "#555" },
  id: { width: 170, fontSize: 7.5, fontFamily: "Courier" },
  summary: { flex: 1, fontSize: 8.5 },
  footer: { position: "absolute", bottom: 20, left: 40, right: 40, fontSize: 8, color: "#777", flexDirection: "row", justifyContent: "space-between" },
});

const day = (d: Date) => d.toISOString().slice(0, 10);

export async function renderPackPdf(pack: Pack, opts: { sandbox?: boolean; generatedAt?: Date } = {}): Promise<Buffer> {
  if (pack.status !== "ready" || !pack.letter) throw new Error(`Pack ${pack.id} is ${pack.status}; only a validated (ready) pack can be exported`);

  // Number each cited evidence item in order of first citation.
  const order: string[] = [];
  for (const p of pack.letter.paragraphs) for (const sentence of p.sentences) for (const c of sentence.citations) if (!order.includes(c)) order.push(c);
  const byId = new Map(pack.evidence.map((e) => [e.id, e]));
  const refOf = (id: string) => order.indexOf(id) + 1;
  const anySimulated = order.some((id) => byId.get(id)?.simulated);

  const doc = (
    <Document title={`Standing explanation pack ${day(pack.periodTo)}`} author="Standing" creator="Standing">
      <Page size="A4" style={s.page}>
        {(opts.sandbox ?? true) || anySimulated ? (
          <Text style={s.banner}>
            {opts.sandbox ?? true ? "Sandbox data: built from a PayPal sandbox account, not a live one. " : ""}
            {anySimulated ? "Items marked Simulated are test inputs, not real records." : ""}
          </Text>
        ) : null}
        <Text style={s.h1}>Explanation pack</Text>
        <Text style={s.meta}>
          Period {day(pack.periodFrom)} to {day(pack.periodTo)} · generated {day(opts.generatedAt ?? pack.createdAt)} by Standing · pack {pack.id}
        </Text>

        <Text style={s.h2}>Cover letter</Text>
        <Text style={s.para}>To PayPal&apos;s account review team,</Text>
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
        <Text style={[s.para, s.chartLabel]}>
          Every numbered statement is generated from the evidence listed at the end of this pack. Connecting sentences contain no figures.
        </Text>

        <Text style={s.h2}>Sales curve</Text>
        <SalesCurve curve={pack.salesCurve} />

        <Text style={s.h2} break>
          Evidence
        </Text>
        {order.map((id) => {
          const e = byId.get(id);
          return (
            <View key={id} style={s.row} wrap={false}>
              <Text style={s.num}>[{refOf(id)}]</Text>
              <Text style={s.id}>{id}</Text>
              <Text style={s.summary}>{e ? e.summary : "missing from the pack's evidence snapshot"}</Text>
            </View>
          );
        })}

        <View style={s.footer} fixed>
          <Text>Standing: stay in good standing with PayPal</Text>
          <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
  return renderToBuffer(doc);
}

function SalesCurve({ curve }: { curve: Pack["salesCurve"] }) {
  const W = 515;
  const H = 120;
  const max = Math.max(1, ...curve.map((d) => d.cents));
  const bw = W / Math.max(1, curve.length);
  // One path of bars: simpler for the PDF than hundreds of shapes.
  const bars = curve
    .map((d, i) => {
      const h = (d.cents / max) * (H - 4);
      return h > 0 ? `M${(i * bw + bw * 0.15).toFixed(2)} ${(H - h).toFixed(2)} h${(bw * 0.7).toFixed(2)} v${h.toFixed(2)} h${(-bw * 0.7).toFixed(2)} Z` : "";
    })
    .join(" ");
  const total = curve.reduce((a, d) => a + d.cents, 0);
  const orders = curve.reduce((a, d) => a + d.orders, 0);
  return (
    <View>
      <Svg width={W} height={H + 1}>
        <Path d={`M0 ${H} H${W}`} stroke="#999" strokeWidth={0.5} />
        {bars ? <Path d={bars} fill="#2f6fb0" /> : null}
      </Svg>
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <Text style={s.chartLabel}>{curve[0]?.day}</Text>
        <Text style={s.chartLabel}>
          Daily PayPal payments received · highest day USD {(max / 100).toFixed(2)} · {orders} payments, USD {(total / 100).toFixed(2)} in all
        </Text>
        <Text style={s.chartLabel}>{curve.at(-1)?.day}</Text>
      </View>
    </View>
  );
}
