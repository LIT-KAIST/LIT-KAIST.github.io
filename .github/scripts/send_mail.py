#!/usr/bin/env python3
"""
data/mail_queue.csv 에 이번 푸시로 새로 추가된 행만 골라 구성원에게 메일 발송.
- 설정: data/mail_config.csv (enabled / extra_to / exclude)
- 수신자: 항상받음(extra_to) + people_members.csv 이메일 − 제외(exclude)
- 발송: Gmail SMTP (secrets: MAIL_USERNAME / MAIL_PASSWORD)
큐는 append-only 이며, '직전 커밋(before)에 없던 stamp' 만 새 항목으로 간주해 발송한다.
"""
import os, csv, io, ssl, subprocess, smtplib
from email.message import EmailMessage


def read_dicts(path):
    try:
        with open(path, encoding="utf-8-sig", newline="") as f:
            return list(csv.DictReader(f))
    except FileNotFoundError:
        return []


def split_list(s):
    return [x.strip() for x in (s or "").replace("，", ",").split(",") if x.strip()]


# ---------- 설정 ----------
cfg_rows = read_dicts("data/mail_config.csv")
cfg = cfg_rows[0] if cfg_rows else {}
enabled = str(cfg.get("enabled", "")).strip().lower() in ("y", "yes", "1", "true", "on", "예", "✓")
if not enabled:
    print("Mail disabled (mail_config.enabled). Skipping.")
    raise SystemExit(0)

def flag_on(v):
    return str(v or "").strip().lower() in ("y", "yes", "1", "true", "on", "예", "✓")

# 유형별 발송 스위치: 큐 항목 type → mail_config 컬럼
TYPE_FLAG = {"journal": "send_journal", "conference": "send_conference",
             "news": "send_news", "album": "send_album"}

exclude = split_list(cfg.get("exclude"))
# 항상 받는 사람(교수님 등). 단, 교수님 이름이 exclude 에 있으면 제외(체크박스 off)
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

# 정리(중복 제거, 유효 이메일만)
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

# ---------- 발송 ----------
user = os.environ["MAIL_USERNAME"]
pw = os.environ["MAIL_PASSWORD"]
ctx = ssl.create_default_context()
with smtplib.SMTP_SSL("smtp.gmail.com", 465, context=ctx) as smtp:
    smtp.login(user, pw)
    for it in new_items:
        t = (it.get("type") or "").strip()
        col = TYPE_FLAG.get(t)
        if not col or not flag_on(cfg.get(col)):
            print(f"skip (type off or unknown): {t}")
            continue
        subject = (it.get("subject") or "[LIT] 알림").strip()
        body = (it.get("body") or "").strip() or "(내용 없음)"
        msg = EmailMessage()
        msg["Subject"] = subject
        msg["From"] = f"LIT @ KAIST <{user}>"
        msg["To"] = ", ".join(to_list)
        msg.set_content(body)
        smtp.send_message(msg)
        print(f"sent: {subject} -> {len(to_list)} recipients")
print("done.")
