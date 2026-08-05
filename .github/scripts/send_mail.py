#!/usr/bin/env python3
"""
data/mail_queue.csv 의 '아직 안 보낸(sent 빈칸)' 항목만 발송 (Brevo API).
- 발송 성공 → 그 행의 sent 칸에 발송시각 기록 (재발송 방지)
- 유형(send_*)이 꺼져 있으면 sent=skipped 로 표시(다시 안 보냄)
- 워크플로가 실행 후 mail_queue.csv 변경분을 커밋 → 다음 실행 때 중복 발송 없음
설정: data/mail_config.csv / 수신자: extra_to + people_members.csv − exclude
발신주소 = SENDER_EMAIL(=MAIL_USERNAME), 인증 = BREVO_API_KEY
"""
import os, csv, json, urllib.request, urllib.error
from datetime import datetime, timezone


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


TYPE_FLAG = {"journal": "send_journal", "conference": "send_conference",
             "news": "send_news", "album": "send_album"}

# ---------- 설정 ----------
cfg_rows = read_dicts("data/mail_config.csv")
cfg = cfg_rows[0] if cfg_rows else {}

# ---------- 수신자 ----------
exclude = split_list(cfg.get("exclude"))
extra = split_list(cfg.get("extra_to"))
prof_excluded = any(p in exclude for p in ("박현철", "Hyuncheol Park"))
recipients = [] if prof_excluded else list(extra)
for m in read_dicts("data/people_members.csv"):
    ko = (m.get("name_korean") or "").strip()
    en = (m.get("name_english") or "").strip()
    em = (m.get("email") or "").strip()
    if em and ko not in exclude and en not in exclude:
        recipients.append(em)
seen, to_list = set(), []
for e in recipients:
    e = e.strip()
    if "@" in e and e.lower() not in seen:
        seen.add(e.lower()); to_list.append(e)

# ---------- 큐 로드(헤더/순서 보존) ----------
QUEUE = "data/mail_queue.csv"
try:
    with open(QUEUE, encoding="utf-8-sig", newline="") as f:
        rows = list(csv.reader(f))
except FileNotFoundError:
    rows = []
if not rows:
    print("Empty queue."); raise SystemExit(0)
header = [h.lstrip("﻿").strip() for h in rows[0]]
if "sent" not in header:
    header.append("sent")
ix = {n: i for i, n in enumerate(header)}
data = [r + [""] * (len(header) - len(r)) for r in rows[1:]]

api_key = os.environ.get("BREVO_API_KEY", "").strip()
sender_email = os.environ.get("SENDER_EMAIL", "").strip()
master = flag_on(cfg.get("enabled"))


def brevo_send(subject, body):
    payload = {
        "sender": {"name": "LIT @ KAIST", "email": sender_email},
        "to": [{"email": e} for e in to_list],
        "subject": subject or "[LIT] 알림",
        "textContent": body or "(내용 없음)",
    }
    req = urllib.request.Request(
        "https://api.brevo.com/v3/smtp/email",
        data=json.dumps(payload).encode("utf-8"),
        headers={"api-key": api_key, "content-type": "application/json", "accept": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        return resp.status


now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%SZ")
changed = False
had_error = False
sent_count = 0

for r in data:
    if r[ix["sent"]].strip():
        continue  # 이미 처리됨
    t = (r[ix["type"]] if "type" in ix else "").strip()
    col = TYPE_FLAG.get(t)
    # 전체 사용 꺼짐 → 지금은 건너뜀(표시 안 함: 다시 켜면 발송되도록 큐에 남김)
    if not master:
        continue
    # 유형 꺼짐/미지원 → 영구 skip 표시(나중에 그 유형을 켜도 옛 항목은 안 감)
    if not col or not flag_on(cfg.get(col)):
        r[ix["sent"]] = "skipped(type off)"; changed = True
        print(f"skip (type off): {t}"); continue
    if not to_list:
        r[ix["sent"]] = "skipped(no recipients)"; changed = True; continue
    if not api_key or not sender_email:
        print("BREVO_API_KEY / SENDER_EMAIL missing."); had_error = True; break
    try:
        code = brevo_send(r[ix["subject"]], r[ix["body"]])
        r[ix["sent"]] = now; changed = True; sent_count += 1
        print(f"sent: {r[ix['subject']]} -> {len(to_list)} recipients (HTTP {code})")
    except urllib.error.HTTPError as e:
        print(f"Brevo API error (HTTP {e.code}): {e.read().decode('utf-8', 'replace')}")
        had_error = True; break
    except Exception as e:
        print(f"Send failed: {e}"); had_error = True; break

if changed:
    with open(QUEUE, "w", encoding="utf-8-sig", newline="") as f:
        w = csv.writer(f); w.writerow(header); w.writerows(data)
    print("queue updated (sent flags).")
print(f"done. sent {sent_count} email(s).")
if had_error:
    raise SystemExit(1)
