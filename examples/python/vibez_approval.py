"""Ask a person through Vibez.now before an agent does something risky.

    from vibez_approval import ask_human, ask_human_sync
    if await ask_human("Run: rm -rf build", "rm -rf build", source="my-agent"):
        ...

Submits a request (it appears on your Requests page and phone), then polls
until it is approved or rejected. An expired request comes back rejected.
Anything unexpected - no key, a network error, running out of time - counts
as "not approved", so a failure never lets the action through.
Python 3.9+, standard library only. Set VIBEZ_API_KEY; VIBEZ_SANDBOX=1 exercises
the API without creating anything (sandbox requests stay pending).
"""

import asyncio
import json
import os
import time
import urllib.error
import urllib.request

API = os.environ.get("VIBEZ_API_URL", "https://vibez.now/api")


def _call(path, body=None, idempotency_key=None):
    headers = {"Content-Type": "application/json", "x-api-key": os.environ["VIBEZ_API_KEY"]}
    if os.environ.get("VIBEZ_SANDBOX") == "1":
        headers["x-sandbox"] = "true"
    if idempotency_key:
        headers["x-idempotency-key"] = idempotency_key
    data = json.dumps(body).encode() if body is not None else None
    request = urllib.request.Request(API + path, data=data, headers=headers)
    for _ in range(5):
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                return json.load(response)
        except urllib.error.HTTPError as error:
            if error.code != 429:
                raise
            # Over 60 calls a minute: wait as long as the server says.
            time.sleep(int(error.headers.get("retry-after") or 10))
    raise RuntimeError(f"{path}: still rate limited")


def ask_human_sync(title, detail, source="python-agent", timeout_minutes=30):
    """True only if a person approved. Blocks for up to timeout_minutes."""
    try:
        created = _call(
            "/submit-request",
            {
                "title": title[:255],
                "code_snippet": detail,
                "source": source,
                "expires_in_minutes": timeout_minutes,
            },
            # The same action retried within a minute gets the same request back.
            idempotency_key=f"{source}:{detail}:{int(time.time() // 60)}",
        )
        # An auto-approve rule can approve the request as it is created.
        status = created.get("status")
        deadline = time.monotonic() + timeout_minutes * 60
        delay = 3.0
        while status == "pending" and time.monotonic() < deadline:
            if os.environ.get("VIBEZ_SANDBOX") == "1":
                return False
            time.sleep(delay)
            delay = min(delay * 1.5, 30.0)
            status = _call(f"/check-status?request_id={created['request_id']}").get("status")
        return status == "approved"
    except Exception:
        return False


async def ask_human(title, detail, source="python-agent", timeout_minutes=30):
    """The same, without blocking the event loop."""
    return await asyncio.to_thread(ask_human_sync, title, detail, source, timeout_minutes)
