import Link from "next/link";

export default function Home() {
  return (
    <main className="hero">
      <p className="sandbox-tag" style={{ display: "inline-block", marginLeft: 0 }}>
        Sandbox demo: test money only
      </p>
      <h1>Standing</h1>
      <p className="lead">Stay in good standing with PayPal.</p>
      <p>
        New and fast-growing sellers can have PayPal funds held right when business takes off. The reasons are published: a first-time seller, a
        sudden spike in sales, a change in average selling price or in the type of item sold. Most sellers learn them only after their money is
        stuck.
      </p>
      <ul className="points">
        <li>
          <strong>Catches the signals early.</strong> Standing watches the patterns PayPal lists and shows them on your dashboard, in plain words, every 15 minutes.
        </li>
        <li>
          <strong>Fixes what it safely can.</strong> Marking digital orders Completed goes to PayPal through a queue you preview and can cancel.
        </li>
        <li>
          <strong>Builds your case before anyone asks.</strong> An explanation pack in which every figure comes from your PayPal records, ready to
          download.
        </li>
        <li>
          <strong>Won&apos;t help you hide.</strong> Standing refuses to help split payments, use extra accounts or mislabel products, and explains why.
        </li>
      </ul>
      <p style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
        <a className="button" href="/api/auth/paypal/start">
          Log in with PayPal
        </a>
        <Link className="button secondary" href="/dashboard">
          Go to your dashboard
        </Link>
      </p>
      <p className="muted small">
        Standing reads your PayPal sandbox account. Thresholds are Standing&apos;s own defaults, not PayPal rules, and Standing never claims what
        PayPal will decide.
      </p>
    </main>
  );
}
