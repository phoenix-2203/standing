import { clauseById, POLICY_SOURCE } from "./clauses";

// Drafted pre-approval request (README roadmap). Written entirely by code from a template: the clause is
// quoted word for word from PayPal's policy file, the product is the seller's own text, and everything only
// the seller knows is a [BRACKETED] blank they fill in. No AI writes any of it, and it never says what
// PayPal will decide (CLAUDE.md rule 3).

export class InvalidDraftRequest extends Error {}

export interface ApprovalDraft {
  clauseId: string;
  subject: string;
  body: string;
  /** Every blank the seller must fill before sending, in order of first appearance. */
  blanks: string[];
}

// Standing's suggestions for details a reviewer is likely to want. Not PayPal's list, and the draft says so.
const DETAILS: Record<string, string[]> = {
  "PRE-02": ["Registration: [CHARITY OR NON-PROFIT REGISTRATION NUMBER AND COUNTRY]", "What donations fund: [ONE LINE]"],
  "PRE-06": ["How entry and prizes work: [ENTRY FEE, PRIZE, HOW A WINNER IS CHOSEN]", "Where it runs: [COUNTRIES OR STATES]", "Any licence or permit: [NUMBER AND ISSUER, OR NONE]"],
  "PRE-07": ["What is sold or transferred: [ONE LINE]", "Any registration or licence: [NUMBER AND REGULATOR, OR NONE]"],
  "PRE-08": ["Pharmacy licence: [NUMBER AND ISSUER]", "How prescriptions are checked: [ONE LINE]"],
  "PRE-09": ["Practitioner licence: [NUMBER AND ISSUER]", "Where patients are: [COUNTRIES OR STATES]"],
  "PRE-14": ["Licence: [ALCOHOL LICENCE NUMBER AND ISSUER]", "Age checks: [HOW YOU CONFIRM BUYERS ARE OF LEGAL AGE]", "Where you ship: [COUNTRIES OR STATES]"],
  "PRE-15": ["Licence: [TOBACCO LICENCE NUMBER AND ISSUER, OR NONE]", "Age checks: [HOW YOU CONFIRM BUYERS ARE OF LEGAL AGE]", "Where you ship: [COUNTRIES OR STATES]"],
  "PRE-16": ["Registration or licence: [NUMBER AND ISSUER]", "Who provides it: [QUALIFICATION OF THE PERSON OR MAKER]"],
};
const GENERIC_DETAILS = ["Any licence or registration that applies: [NUMBER AND ISSUER, OR NONE]"];

const oneLine = (s: string) => s.replace(/\s+/g, " ").trim();

export function approvalDraft(input: { name: unknown; description?: unknown; clauseId: unknown }): ApprovalDraft {
  if (typeof input.name !== "string" || !oneLine(input.name) || input.name.length > 200) throw new InvalidDraftRequest("Product name must be 1 to 200 characters");
  if (input.description != null && (typeof input.description !== "string" || input.description.length > 500)) throw new InvalidDraftRequest("Description must be text, up to 500 characters");
  const clause = typeof input.clauseId === "string" ? clauseById(input.clauseId) : undefined;
  if (!clause || clause.kind !== "preapproval") throw new InvalidDraftRequest("Choose one of PayPal's pre-approval clauses (PRE-01 to PRE-18)");

  const name = oneLine(input.name);
  const description = typeof input.description === "string" && oneLine(input.description) ? oneLine(input.description) : "[ONE-LINE DESCRIPTION]";
  const details = DETAILS[clause.id] ?? GENERIC_DETAILS;

  const subject = `Pre-approval request: ${name} (${clause.name})`;
  const body = [
    "Hello,",
    "",
    `I sell through my PayPal business account ([YOUR PAYPAL ACCOUNT EMAIL]) and would like to start accepting payments for ${name}.`,
    `PayPal's Acceptable Use Policy lists this under "${clause.name}" as needing pre-approval: "${clause.text}" (Acceptable Use Policy, last updated ${POLICY_SOURCE.lastUpdated}.)`,
    "",
    "About the product:",
    `- Product: ${name}`,
    `- Description: ${description}`,
    "- Where I sell: [YOUR WEBSITE OR SHOP LINK]",
    "- Expected volume: [ORDERS PER MONTH] orders a month, about [AVERAGE ORDER VALUE] each",
    ...details.map((d) => `- ${d}`),
    "",
    "Please tell me what you need from me to review this. I won't accept payments for this product through PayPal until I hear back.",
    "",
    "Thank you,",
    "[YOUR NAME]",
    "[BUSINESS NAME]",
  ].join("\n");

  const blanks = [...new Set([...`${subject}\n${body}`.matchAll(/\[[A-Z0-9 ,.'-]+\]/g)].map((m) => m[0]))];
  return { clauseId: clause.id, subject, body, blanks };
}
