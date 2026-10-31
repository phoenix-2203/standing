"""Day-1 tests 2, 3, 5 against the PayPal sandbox.

    python3 day1.py --source card            # server-side card orders (needs card processing on the sandbox app)
    python3 day1.py --source vault --setup-token <id>   # vaulted PayPal buyer (needs one buyer approval)

Every write uses a stable PayPal-Request-Id derived from the run name, so re-running the same
run name retries the same actions instead of creating new money movements. Results (IDs, debug IDs,
statuses) go to scripts/out/<run>.json. A timeout is recorded as UNKNOWN, never FAILED.
"""
import argparse, json, pathlib, socket, urllib.error
import pp

OUT = pathlib.Path(__file__).resolve().parent / "out"
TEST_CARD = {"number": "4111111111111111", "expiry": "2030-12", "security_code": "123", "name": "Test Buyer",
             "billing_address": {"address_line_1": "1 Main St", "admin_area_2": "San Jose", "admin_area_1": "CA",
                                 "postal_code": "95131", "country_code": "US"}}


def step(log, name, method, path, body, request_id, headers=None):
    try:
        st, r, dbg = pp.call(method, path, body, headers, request_id=request_id)
    except (TimeoutError, socket.timeout, urllib.error.URLError) as e:
        log.append({"step": name, "request_id": request_id, "result": "UNKNOWN", "error": str(e)})
        return None, None
    log.append({"step": name, "request_id": request_id, "http": st, "debug_id": dbg,
                "status": r.get("status") if isinstance(r, dict) else None,
                "issues": [d.get("issue") for d in r.get("details", [])] if isinstance(r, dict) else None})
    return st, r


def capture_id(order):
    try:
        return order["purchase_units"][0]["payments"]["captures"][0]["id"]
    except (KeyError, IndexError, TypeError):
        return None


def make_order(log, run, n, source, vault_id, digital=False):
    ref = f"{run}-{'dig' if digital else 'phy'}-{n:02d}"
    money = {"currency_code": "USD", "value": f"{18 + n % 7}.00"}
    unit = {"reference_id": ref, "amount": dict(money)}
    if digital:
        unit["amount"]["breakdown"] = {"item_total": money}
        unit["items"] = [{"name": "Digital pattern PDF", "quantity": "1", "category": "DIGITAL_GOODS", "unit_amount": money}]
    ps = {"card": TEST_CARD} if source == "card" else {"paypal": {"vault_id": vault_id}}
    body = {"intent": "CAPTURE", "purchase_units": [unit], "payment_source": ps}
    st, order = step(log, f"create {ref}", "POST", "/v2/checkout/orders", body, f"standing-{ref}-create",
                     {"Prefer": "return=representation"})
    if not order or st >= 300:
        return ref, None, None
    if order.get("status") != "COMPLETED":  # card/vault orders normally complete on create; capture if not
        st, order = step(log, f"capture {ref}", "POST", f"/v2/checkout/orders/{order['id']}/capture", {},
                         f"standing-{ref}-capture", {"Prefer": "return=representation"})
        if not order or st >= 300:
            return ref, None, None
    return ref, order["id"], capture_id(order)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--source", choices=["card", "vault"], required=True)
    ap.add_argument("--setup-token")
    ap.add_argument("--count", type=int, default=30)
    ap.add_argument("--run", default="d1")
    a = ap.parse_args()
    log = []
    res = {"run": a.run, "source": a.source, "orders": [], "log": log}

    vault_id = None
    if a.source == "vault":
        st, tok = step(log, "payment token", "POST", "/v3/vault/payment-tokens",
                       {"payment_source": {"token": {"id": a.setup_token, "type": "SETUP_TOKEN"}}},
                       f"standing-{a.run}-payment-token")
        vault_id = tok.get("id") if tok and st < 300 else None
        if not vault_id:
            return save(res)

    # Test 2: physical orders, plus one digital order kept for test 5.
    for n in range(1, a.count + 1):
        ref, oid, cid = make_order(log, a.run, n, a.source, vault_id)
        res["orders"].append({"ref": ref, "order_id": oid, "capture_id": cid})
    ref, oid, cid = make_order(log, a.run, 1, a.source, vault_id, digital=True)
    res["digital"] = {"ref": ref, "order_id": oid, "capture_id": cid}

    # Test 3: one tracking number on the first physical capture (Orders v2 track).
    first = next((o for o in res["orders"] if o["capture_id"]), None)
    if first:
        st, r = step(log, f"track {first['ref']}", "POST", f"/v2/checkout/orders/{first['order_id']}/track",
                     {"capture_id": first["capture_id"], "tracking_number": f"STANDING{first['ref'].upper().replace('-', '')}",
                      "carrier": "USPS", "notify_payer": False}, f"standing-{first['ref']}-track")
        res["tracking"] = {"ref": first["ref"], "http": st}
        if r and st < 300:
            st, view = step(log, f"read order {first['ref']}", "GET", f"/v2/checkout/orders/{first['order_id']}", None, None)
            res["tracking"]["trackers_on_order"] = (view or {}).get("purchase_units", [{}])[0].get("shipping", {}).get("trackers")

    # Test 5: tracker with status COMPLETED and no tracking number on the digital capture (Tracking v1).
    if res["digital"]["capture_id"]:
        st, r = step(log, f"complete {ref}", "POST", "/v1/shipping/trackers",
                     {"trackers": [{"transaction_id": res["digital"]["capture_id"], "status": "COMPLETED"}]},
                     f"standing-{ref}-complete-v2")  # v1 sent an unwrapped tracker; PayPal rejected it (400) with no effect
        res["digital"]["complete_http"] = st
        res["digital"]["complete_response"] = r
    save(res)


def save(res):
    OUT.mkdir(exist_ok=True)
    path = OUT / f"{res['run']}.json"
    path.write_text(json.dumps(res, indent=1))
    ok = sum(1 for o in res["orders"] if o["capture_id"])
    print(f"captures {ok}/{len(res['orders'])}; tracking={res.get('tracking', {}).get('http')}; "
          f"digital-complete={res.get('digital', {}).get('complete_http')}; wrote {path}")


if __name__ == "__main__":
    main()
