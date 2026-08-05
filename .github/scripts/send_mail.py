#!/usr/bin/env python3
"""
data/mail_queue.csv 에 이번 푸시로 새로 추가된 행만 골라 구성원에게 메일 발송 (Brevo API).
- 설정: data/mail_config.csv (enabled / send_* / extra_to / exclude)
- 수신자: 항상받음(extra_to) + people_members.csv 이메일 − 제외(exclude)
- 발송: Brevo HTTP API (secret: BREVO_API_KEY), 발신주소 = SENDER_EMAIL(=MAIL_USERNAME)
큐는 append-only 이며, '직전 커밋(before)에 없던 stamp' 만 새 항목으로 간주해 발송한다.
"""
import os, csv, io, json, subprocess, urllib.request, urllib.error


def read_dicts(path):
    try:
        with open(path, encoding="utf-8-sig", newline="") as f:
            return list(csv.DictReader(f))
    except FileNotFoundError:
        return []


def split_list(s):
    return [x.strip() for x in (s or "").replace("，", ",").split(",") if x.strip()]


def flag_on(v):
    return str(v or "").strip().lower() in ("y", "yes", "1", "true", "on", "예", "✓")


# ---------- 설정 ----------
cfg_rows = read_dicts("data/mail_config.csv")
cfg = cfg_rows[0] if cfg_rows else {}
if not flag_on(cfg.get("enabled")):
    print("Mail disabled (mail_config.enabled). Skipping.")
    raise SystemExit(0)

TYPE_FLAG = {"journal": "send_journal", "conference": "send_conference",
             "news": "send_news", "album": "send_album"}

exclude = split_list(cfg.get("exclude"))
extra = split_list(cfg.get("extra_to"))
PROF_NAMES = ("박현철", "Hyuncheol Park")
prof_excluded = any(p in exclude for p in PROF_NAMES)
recipients = [] if prof_excluded else list(extra)

# ---------- 구성원 이메일 ----------
for m in read_dicts("data/people_members.csv"):
    ko = (m.get("name_korean") or "").strip()
    en = (m.get("name_english") or "").strip()
    em = (m.get("email") or "").strip()
    if not em:
        continue
    if ko in exclude or en in exclude:
        continue
    recipients.append(em)

seen, to_list = set(), []
for e in recipients:
    e = e.strip()
    if "@" in e and e.lower() not in seen:
        seen.add(e.lower())
        to_list.append(e)
if not to_list:
    print("No recipients. Skipping.")
    raise SystemExit(0)

# ---------- 새로 추가된 큐 항목 ----------
before = (os.environ.get("BEFORE_SHA") or "").strip()
before_stamps = set()
if before and set(before) != {"0"}:
    r = subprocess.run(["git", "show", f"{before}:data/mail_queue.csv"], capture_output=True, text=True)
    if r.returncode == 0:
        for row in csv.DictReader(io.StringIO(r.stdout)):
            s = (row.get("stamp") or "").strip()
            if s:
                before_stamps.add(s)

new_items = [row for row in read_dicts("data/mail_queue.csv")
             if (row.get("stamp") or "").strip() and (row.get("stamp").strip() not in before_stamps)]
if not new_items:
    print("No new queue items. Skipping.")
    raise SystemExit(0)

# ---------- 발송 (Brevo API) ----------
api_key = os.environ.get("BREVO_API_KEY", "").strip()
sender_email = os.environ.get("SENDER_EMAIL", "").strip()
if not api_key:
    print("BREVO_API_KEY secret is missing.")
    raise SystemExit(1)
if not sender_email:
    print("SENDER_EMAIL (=MAIL_USERNAME secret) is missing.")
    raise SystemExit(1)

sent = 0
for it in new_items:
    t = (it.get("type") or "").strip()
    col = TYPE_FLAG.get(t)
    if not col or not flag_on(cfg.get(col)):
        print(f"skip (type off or unknown): {t}")
        continue
    payload = {
        "sender": {"name": "LIT @ KAIST", "email": sender_email},
        "to": [{"email": e} for e in to_list],
        "subject": (it.get("subject") or "[LIT] 알림").strip(),
        "textContent": (it.get("body") or "").strip() or "(내용 없음)",
    }
    req = urllib.request.Request(
        "https://api.brevo.com/v3/smtp/email",
        data=json.dumps(payload).encode("utf-8"),
        headers={"api-key": api_key, "content-type": "application/json", "accept": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            print(f"sent: {payload['subject']} -> {len(to_list)} recipients (HTTP {resp.status})")
            sent += 1
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", "replace")
        print(f"Brevo API error (HTTP {e.code}): {detail}")
        raise SystemExit(1)
    except Exception as e:
        print(f"Send failed: {e}")
        raise SystemExit(1)

print(f"done. sent {sent} email(s).")
