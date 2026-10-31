"""Day-1 test 4: does Log in with PayPal return account-verification status?

    python3 lipp.py url  <redirect_uri>          # print the sandbox authorize URL to open in a browser
    python3 lipp.py code <redirect_uri> <code>   # exchange the code, print verification fields only

Never prints access/refresh tokens.
"""
import base64, json, sys, urllib.parse, urllib.request, urllib.error
import pp

SCOPES = "openid email https://uri.paypal.com/services/paypalattributes"


def authorize_url(redirect_uri):
    q = urllib.parse.urlencode({"flowEntry": "static", "client_id": pp.ENV["PAYPAL_CLIENT_ID"].strip(),
                                "response_type": "code", "scope": SCOPES, "redirect_uri": redirect_uri,
                                "state": "standing-d1-lipp"}, quote_via=urllib.parse.quote)
    return f"https://www.sandbox.paypal.com/connect?{q}"


def exchange(redirect_uri, code):
    creds = base64.b64encode(f"{pp.ENV['PAYPAL_CLIENT_ID'].strip()}:{pp.ENV['PAYPAL_CLIENT_SECRET'].strip()}".encode()).decode()
    data = urllib.parse.urlencode({"grant_type": "authorization_code", "code": code, "redirect_uri": redirect_uri}).encode()
    req = urllib.request.Request(f"{pp.BASE}/v1/oauth2/token", data=data,
                                 headers={"Authorization": f"Basic {creds}", "Content-Type": "application/x-www-form-urlencoded"})
    tok = json.load(urllib.request.urlopen(req, context=pp._ctx))
    print("granted scopes:", tok.get("scope"))
    # The docs disagree on the userinfo path, and one login code only gets one token, so try each here.
    for path in ("/v1/identity/openidconnect/userinfo?schema=openid",
                 "/v1/identity/oauth2/userinfo?schema=paypalv1.1"):
        req = urllib.request.Request(f"{pp.BASE}{path}", headers={"Authorization": f"Bearer {tok['access_token']}"})
        try:
            r = urllib.request.urlopen(req, context=pp._ctx)
        except urllib.error.HTTPError as e:
            print(path, "HTTP", e.code, "debug_id:", e.headers.get("Paypal-Debug-Id"),
                  "www-authenticate:", e.headers.get("WWW-Authenticate"), e.read().decode(errors="replace")[:300])
            continue
        info = json.load(r)
        print(path, "HTTP", r.status, "debug_id:", r.headers.get("Paypal-Debug-Id"))
        print("  fields returned:", sorted(info))
        print("  verified_account:", info.get("verified_account", "<absent>"))
        print("  email_verified:", info.get("email_verified", "<absent>"))


if __name__ == "__main__":
    if sys.argv[1] == "url":
        print(authorize_url(sys.argv[2]))
    else:
        try:
            exchange(sys.argv[2], sys.argv[3])
        except urllib.error.HTTPError as e:
            print("HTTP", e.code, "debug_id:", e.headers.get("Paypal-Debug-Id"), e.read().decode(errors="replace")[:500])
