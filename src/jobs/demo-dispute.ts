// npm run demo:dispute -- <transactionId> <amount> [--go]
// Adds one clearly SIMULATED dispute ("item didn't arrive") on a real sandbox payment, so the Disputes screen can be
// shown: the sandbox seller has no real dispute, and its test-card buyers can't open one. Its ID starts with "SIM-",
// the screen labels it Simulated, and it never counts toward the dispute rate.
import { getDb } from "@/db";
import { addSimulatedDispute } from "@/lib/disputes/respond";

const args = process.argv.slice(2);
const [txn, amount] = args.filter((a) => !a.startsWith("--"));
if (!txn || !/^[A-Z0-9]{6,30}$/.test(txn) || !/^\d+(\.\d{2})?$/.test(amount ?? "")) {
  console.error("Usage: npm run demo:dispute -- <transactionId> <amount, e.g. 18.00> [--go]");
  process.exit(1);
}
const sellerId = process.env.STANDING_SELLER_ID ?? "sandbox-seller";
if (!args.includes("--go")) {
  console.log(`Plan: a Simulated dispute "item didn't arrive" on payment ${txn} (USD ${amount}). Add --go to create it.`);
  process.exit(0);
}
addSimulatedDispute(getDb(), sellerId, txn, amount)
  .then((id) => {
    console.log(`Simulated dispute ${id} added on ${txn}.`);
    process.exit(0);
  })
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
