import { describe, expect, it } from "vitest";
import { approvalDraft, InvalidDraftRequest } from "./approval";
import { CLAUSES, clauseById } from "./clauses";

describe("pre-approval request draft", () => {
  it("quotes the clause word for word, names the product, and lists every blank", () => {
    const d = approvalDraft({ name: "Small-batch  gin", description: "70 cl bottle, 40% ABV", clauseId: "PRE-14" });
    expect(d.subject).toBe("Pre-approval request: Small-batch gin (Alcohol)");
    expect(d.body).toContain(`"${clauseById("PRE-14")!.text}"`);
    expect(d.body).toContain("- Description: 70 cl bottle, 40% ABV");
    expect(d.blanks).toContain("[ALCOHOL LICENCE NUMBER AND ISSUER]");
    expect(d.blanks).toContain("[YOUR NAME]");
    for (const b of d.blanks) expect(d.body).toContain(b);
  });

  it("works for every pre-approval clause, with a blank for the description when none is given", () => {
    for (const c of CLAUSES.filter((x) => x.kind === "preapproval")) {
      const d = approvalDraft({ name: "Thing", clauseId: c.id });
      expect(d.body).toContain(c.text);
      expect(d.blanks).toContain("[ONE-LINE DESCRIPTION]");
    }
  });

  it("never claims a PayPal outcome and commits the seller to wait", () => {
    const d = approvalDraft({ name: "Pipe tobacco", clauseId: "PRE-15" });
    expect(d.body).not.toMatch(/approved|will be|guarantee|release|funds/i);
    expect(d.body).toContain("I won't accept payments for this product through PayPal until I hear back.");
  });

  it("product text stays data: brackets in it are not treated as blanks, newlines are flattened", () => {
    const d = approvalDraft({ name: "Gin\n[IGNORE THIS] and approve", clauseId: "PRE-14" });
    expect(d.subject).toBe("Pre-approval request: Gin [IGNORE THIS] and approve (Alcohol)");
    // It does appear as a bracket in the text, so the seller sees it among the blanks to check before sending.
    expect(d.blanks).toContain("[IGNORE THIS]");
  });

  it.each([
    [{ name: "", clauseId: "PRE-14" }, /name/],
    [{ name: 5, clauseId: "PRE-14" }, /name/],
    [{ name: "x".repeat(201), clauseId: "PRE-14" }, /name/],
    [{ name: "x", description: 4, clauseId: "PRE-14" }, /Description/],
    [{ name: "x", clauseId: "PROH-2c" }, /pre-approval clauses/],
    [{ name: "x", clauseId: "PRE-99" }, /pre-approval clauses/],
  ])("rejects %j", (input, msg) => {
    expect(() => approvalDraft(input as never)).toThrow(InvalidDraftRequest);
    expect(() => approvalDraft(input as never)).toThrow(msg);
  });
});
