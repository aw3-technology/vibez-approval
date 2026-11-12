#!/usr/bin/env python3
"""A Claude Code PreToolUse hook: every Bash command waits for your approval on Vibez.now.

Put this file at .claude/hooks/approve-bash.py, make it executable, set
VIBEZ_API_KEY in the environment Claude Code runs in, and add to
.claude/settings.json:

    {
      "hooks": {
        "PreToolUse": [
          {
            "matcher": "Bash",
            "hooks": [
              {
                "type": "command",
                "command": "${CLAUDE_PROJECT_DIR}/.claude/hooks/approve-bash.py",
                "timeout": 600
              }
            ]
          }
        ]
      }
    }

Claude Code lets a call through when a PreToolUse hook times out, so this
script gives up and denies at WAIT_SECONDS, well inside the 600-second
timeout above, rather than relying on the timeout to stop anything. Every
failure path denies too. Python 3.9+, standard library only.
"""

import json
import os
import sys
import time
import urllib.request

API = os.environ.get("VIBEZ_API_URL", "https://vibez.now/api")
WAIT_SECONDS = 540


def call(path, body=None):
    request = urllib.request.Request(
        API + path,
        data=json.dumps(body).encode() if body is not None else None,
        headers={"Content-Type": "application/json", "x-api-key": os.environ["VIBEZ_API_KEY"]},
    )
    with urllib.request.urlopen(request, timeout=20) as response:
        return json.load(response)


def decide(allowed, reason):
    print(json.dumps({
        "hookSpecificOutput": {
            "hookEventName": "PreToolUse",
            "permissionDecision": "allow" if allowed else "deny",
            "permissionDecisionReason": reason,
        }
    }))
    sys.exit(0)


def main():
    event = json.load(sys.stdin)
    command = event.get("tool_input", {}).get("command", "")
    try:
        created = call("/submit-request", {
            "title": f"Claude Code: {command[:80]}",
            "description": event.get("tool_input", {}).get("description") or None,
            "code_snippet": command,
            "source": "claude-code",
            "metadata": {"cwd": event.get("cwd")},
            "expires_in_minutes": WAIT_SECONDS // 60,
        })
        status = created.get("status")
        deadline = time.monotonic() + WAIT_SECONDS
        delay = 3.0
        while status == "pending" and time.monotonic() + delay < deadline:
            time.sleep(delay)
            delay = min(delay * 1.5, 20.0)
            status = call(f"/check-status?request_id={created['request_id']}").get("status")
    except Exception as error:
        decide(False, f"Vibez.now approval failed ({error}); the command was not run.")
    if status == "approved":
        decide(True, "Approved on Vibez.now.")
    decide(False, "Not approved on Vibez.now; the command was not run.")


if __name__ == "__main__":
    main()
