"""Minimal PayPal sandbox client. Reads credentials from .env; never prints them."""
import base64, json, os, pathlib, ssl, urllib.request, urllib.error

ROOT = pathlib.Path(__file__).resolve().parent.parent
ENV = dict(l.split("=", 1) for l in (ROOT / ".env").read_text().splitlines() if "=" in l and not l.startswith("#"))
BASE = ENV["PAYPAL_API_BASE"].strip().rstrip("/")
assert "sandbox" in BASE, "refusing to run against non-sandbox API"
_token = None
# python.org builds on macOS ship without a CA bundle; use the system one.
_ctx = ssl.create_default_context(cafile="/etc/ssl/cert.pem" if os.path.exists("/etc/ssl/cert.pem") else None)


def token():
    global _token
    if _token is None:
        creds = base64.b64encode(f"{ENV['PAYPAL_CLIENT_ID'].strip()}:{ENV['PAYPAL_CLIENT_SECRET'].strip()}".encode()).decode()
        req = urllib.request.Request(f"{BASE}/v1/oauth2/token", data=b"grant_type=client_credentials",
                                     headers={"Authorization": f"Basic {creds}", "Content-Type": "application/x-www-form-urlencoded"})
        _token = json.load(urllib.request.urlopen(req, context=_ctx))
    return _token


def call(method, path, body=None, headers=None, request_id=None):
    """request_id must be stable per action (e.g. f"capture-{ref}") so a retry is idempotent
    instead of moving money or pushing tracking twice. Required for any write."""
    if method != "GET" and not request_id:
        raise ValueError(f"{method} {path} needs a stable request_id")
    h = {"Authorization": f"Bearer {token()['access_token']}", "Content-Type": "application/json"}
    if request_id:
        h["PayPal-Request-Id"] = request_id
    h.update(headers or {})
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(BASE + path, data=data, method=method, headers=h)
    try:
        r = urllib.request.urlopen(req, context=_ctx)
        raw = r.read()
        return r.status, (json.loads(raw) if raw else None), r.headers.get("Paypal-Debug-Id")
    except urllib.error.HTTPError as e:
        raw = e.read()
        try:
            return e.code, json.loads(raw), e.headers.get("Paypal-Debug-Id")
        except ValueError:
            return e.code, raw.decode(errors="replace"), e.headers.get("Paypal-Debug-Id")
