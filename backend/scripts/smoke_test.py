"""End-to-end smoke test against a running API (default http://localhost:8000).

Walks the main user journey: phone and guest login → browse → favorite → view →
request a viewing → notifications → account deletion. Exits non-zero on the first
failure.

    python scripts/smoke_test.py [BASE_URL]
"""

import json
import random
import sys
import urllib.error
import urllib.request
from datetime import date, timedelta

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8000"


def call(method: str, path: str, token: str | None = None, body: dict | None = None):
    req = urllib.request.Request(BASE + path, method=method)
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    data = None
    if body is not None:
        data = json.dumps(body).encode()
        req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, data) as resp:
            raw = resp.read()
            return resp.status, json.loads(raw) if raw else None
    except urllib.error.HTTPError as err:
        return err.code, json.loads(err.read() or b"null")


def check(label: str, condition: bool, detail: object = "") -> None:
    print(f"  {'✓' if condition else '✗'} {label}" + (f" — {detail}" if detail else ""))
    if not condition:
        sys.exit(1)


def main() -> None:
    print(f"Smoke testing {BASE}")
    status, health = call("GET", "/health")
    check("health", status == 200 and health == {"status": "ok"})

    # A random valid Egyptian mobile number, so repeated runs create fresh accounts.
    phone = f"010{random.randint(0, 99_999_999):08d}"
    login = {"name": "Smoke Test", "phone": phone, "country": "EG"}
    status, auth = call("POST", "/auth/phone", body=login)
    check(
        "phone login",
        status == 200 and auth["user"]["phone"] == f"+2{phone}",
        auth["user"]["phone"],
    )
    status, again = call("POST", "/auth/phone", body={**login, "name": "Impostor"})
    check("same number reuses the account", again["user"]["id"] == auth["user"]["id"])
    status, _ = call("POST", "/auth/phone", body={**login, "phone": "0223456789"})
    check("landline rejected for sign-in", status == 422)
    status, guest = call("POST", "/auth/demo")
    check("guest login", status == 201, guest["user"]["name"])
    token = auth["access_token"]

    status, featured = call("GET", "/properties/featured", token)
    check("featured properties", status == 200 and len(featured) == 5)
    for p in featured:
        print(f"      {p['name']:<20} {p['type']:<11} EGP {p['price']:>12,}  {p['address']}")

    status, villas = call("GET", "/properties?type=Villas&limit=50", token)
    check(
        "filter by type",
        status == 200 and all(p["type"] == "Villas" for p in villas["items"]),
        f"{villas['total']} villas",
    )

    prop = featured[0]
    status, detail = call("GET", f"/properties/{prop['id']}", token)
    check(
        "property detail",
        status == 200 and detail["agent"] is not None,
        f"{detail['review_count']} reviews, {len(detail['gallery'])} photos",
    )

    check("favorite", call("PUT", f"/favorites/{prop['id']}", token)[0] == 204)
    check("favorite ids", call("GET", "/favorites/ids", token)[1] == [prop["id"]])
    check("record view", call("POST", f"/properties/{prop['id']}/views", token)[0] == 204)

    request_body = {
        "property_id": prop["id"],
        "preferred_date": (date.today() + timedelta(days=3)).isoformat(),
        "time_slot": "afternoon",
        "phone": "+20 100 123 4567",
    }
    status, viewing = call("POST", "/viewing-requests", token, request_body)
    check("request a viewing", status == 201 and viewing["status"] == "requested")
    status, _ = call("POST", "/viewing-requests", token, request_body)
    check("duplicate request rejected", status == 409)

    status, result = call("POST", "/notifications/check-new-properties", token)
    check(
        "welcome notification",
        status == 200 and result["reason"] == "welcome",
        result["notification"]["message"] if result["notification"] else "",
    )

    check("delete account", call("DELETE", "/users/me", token)[0] == 204)
    check("token rejected after deletion", call("GET", "/users/me", token)[0] == 401)
    print("All smoke checks passed.")


if __name__ == "__main__":
    main()
