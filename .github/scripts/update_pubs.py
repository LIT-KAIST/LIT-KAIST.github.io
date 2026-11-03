#!/usr/bin/env python3
"""
게재 예정(forthcoming) · Early Access 논문의 출판 정보를 Crossref 에서 찾아 자동으로 채운다.
(.github/workflows/update-pubs.yml 이 매일 실행 → 바뀐 게 있으면 main 에 커밋)

대상: data/{journal,conference}_{international,domestic}.csv 에서
      - status 가 forthcoming / early access 인 행
      - 최근(올해·작년) 논문인데 publish 로만 바꿔 두고 DOI·권·쪽수가 비어 있는 행 (상태는 그대로, 빈칸만 채움)
      한글 제목은 건너뜀(국내 학회·저널은 보통 Crossref 에 없음)

같은 논문인지 확인 — 전부 통과해야 반영. 하나라도 어긋나면 '확인 필요'로 보고만 하고 CSV 는 건드리지 않음
  1) 종류     : 저널 CSV ↔ 저널 논문, 학회 CSV ↔ 학회 논문 (같은 제목의 학회판/저널판 혼동 방지)
  2) 제목     : 단어 단위로 똑같아야 함 — 대소문자·하이픈·기호, a/the/of/via 같은 작은 단어 차이만 허용
                (Imperfect↔Perfect 처럼 한 단어라도 다르면 탈락)
                DOI 가 이미 적혀 있으면 그 DOI 로 바로 조회하고, 제목은 90% 이상 비슷하면 통과(DOI 오타 방지용)
  3) 저자     : 성(surname)이 같은 순서·같은 인원으로 전부 일치
  4) 게재처   : 저널/학회 이름의 단어가 60% 이상 겹치거나, CSV 의 학회 약칭(ICC, GLOBECOM …)이 일치
  5) 연도     : Crossref 출판 연도가 CSV 날짜 기준 -1 ~ +2년 이내
  6) 후보 유일 : 위 조건을 모두 통과하는 Crossref 기록이 하나뿐 (DOI 가 다른 후보가 둘 이상이면 보류)

상태 결정 — 올리기만 하고 내리지 않음 (forthcoming → early access → published)
  - 학회 논문 : Crossref 에 등록됨(= IEEE Xplore 등에 실림) → published
  - 저널 논문 : 권(volume) 배정됨 → published / DOI 만 있음(온라인 선공개) → early access

채우는 칸 — 비어 있을 때만 (손으로 넣은 값은 절대 덮어쓰지 않음)
  doi · abstract · (저널이 published 일 때) volume, number(호 또는 article number), pages
  date 는 건드리지 않음. 바뀐 행의 modified 는 지금 시각(KST).

결과: 표준출력 · GitHub Actions 요약($GITHUB_STEP_SUMMARY) · 커밋 메시지($COMMIT_MSG_FILE)
  --dry-run : CSV 를 바꾸지 않고 결과만 출력
"""
import csv, difflib, html, io, json, os, re, sys, time, unicodedata
import urllib.error, urllib.parse, urllib.request
from datetime import datetime, timedelta, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
FILES = [
    ("data/journal_international.csv", "journal"),
    ("data/journal_domestic.csv", "journal"),
    ("data/conference_international.csv", "conference"),
    ("data/conference_domestic.csv", "conference"),
]
CR_TYPE = {"journal": "journal-article", "conference": "proceedings-article"}
API = "https://api.crossref.org/works"
UA = "LIT-KAIST-site/1.0 (https://lit.kaist.ac.kr; publication auto-update)"
KST = timezone(timedelta(hours=9))
RANK = {"forthcoming": 0, "early access": 1, "published": 2}   # publish 등 그 밖의 값도 출판(2)
RECENT_YEARS = 1                                                # publish 인데 비어 있는 칸 보충: 올해·작년 논문만
TITLE_MIN_DOI, TITLE_NEAR, VENUE_MIN = 0.90, 0.85, 0.60
STOP = {"ieee", "the", "of", "on", "and", "for", "in", "a", "an", "proc", "proceedings"}
SMALL = {"a", "an", "the", "of", "for", "and", "in", "on", "with", "via", "to", "by", "at", "from", "using"}


# ---------------------------------------------------------------- 문자열 정규화
def plain(s):
    """태그(<i>, <mml:math> …)·HTML 엔티티·악센트 제거."""
    s = html.unescape(re.sub(r"<[^>]+>", " ", s or ""))
    s = unicodedata.normalize("NFKD", s)
    return "".join(c for c in s if not unicodedata.combining(c))

def norm(s):
    return re.sub(r"[^a-z0-9]+", " ", plain(s).lower()).strip()

def key(s):
    return re.sub(r"[^a-z]", "", plain(s).lower())

def title_sim(a, b):
    return difflib.SequenceMatcher(None, norm(a), norm(b)).ratio()

def same_title(a, b):
    """붙여 쓴 글자가 같거나(Low-Complexity = Low Complexity), 다른 단어가 전부 작은 단어일 때만 True."""
    if re.sub(r"[^a-z0-9]", "", plain(a).lower()) == re.sub(r"[^a-z0-9]", "", plain(b).lower()):
        return True
    wa, wb = norm(a).split(), norm(b).split()
    for op, i1, i2, j1, j2 in difflib.SequenceMatcher(None, wa, wb, autojunk=False).get_opcodes():
        if op != "equal" and not all(w in SMALL for w in wa[i1:i2] + wb[j1:j2]):
            return False
    return True

def rank(s):
    return RANK.get(s, 2)

def status_of(s):
    s = re.sub(r"[\s_-]+", " ", (s or "").strip().lower())
    return {"forthcoming": "forthcoming", "early access": "early access", "earlyaccess": "early access"}.get(s, s)


# ---------------------------------------------------------------- 저자
def csv_surnames(author):
    """'H. Park, H. Kim, and J.-H. Lee' / 'N.Hong, S.Lee' / 'N. González Prelcic' → 성 목록."""
    out = []
    for p in re.split(r"\s*,\s*|\s+and\s+", (author or "").strip()):
        p = re.sub(r"^and\s+", "", p.strip())
        if not p:
            continue
        rest = re.sub(r"^(?:[A-Z][a-z]?\.\s*-?\s*)+", "", p)   # 이니셜 제거
        if rest == p:                                           # 이니셜 없이 'Moe Win' 처럼 쓴 경우
            rest = p.split()[-1]
        out.append(key(rest))
    return out

def cr_surnames(item):
    out = []
    for a in item.get("author") or []:
        fam = a.get("family") or a.get("name") or ""
        full = ((a.get("given") or "") + " " + fam).split()
        out.append({key(fam), key(full[-1]) if full else ""})
    return out

def authors_ok(csv_list, cr_list):
    return bool(csv_list) and len(csv_list) == len(cr_list) and all(c in s for c, s in zip(csv_list, cr_list))


# ---------------------------------------------------------------- 게재처
def vtokens(s):
    return {t for t in norm(s).split() if t not in STOP and not t.isdigit()}

def acronyms(s):
    """'IEEE International Conference on Communications (ICC) 2026' → {'icc'} (괄호 속 약칭 · 대문자 단어)"""
    found = re.findall(r"\(([A-Za-z][A-Za-z\-]{1,15})\)", s or "") + re.findall(r"\b[A-Z]{3,}\b", s or "")
    return {key(a) for a in found} - {"ieee", ""}

def venue_score(csv_venue, item):
    names = (item.get("container-title") or []) + [(item.get("event") or {}).get("name", "")]
    a, acr, best = vtokens(csv_venue), acronyms(csv_venue), 0.0
    for n in filter(None, names):
        b = vtokens(n)
        if acr & b:
            return 1.0
        if a and b:
            best = max(best, len(a & b) / len(a | b))
    return best


# ---------------------------------------------------------------- Crossref
def get_json(url, tries=3):
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=40) as r:
                return json.load(r)
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return None
            if i == tries - 1:
                raise
        except Exception:
            if i == tries - 1:
                raise
        time.sleep(3 * (i + 1))

def by_doi(doi):
    d = get_json(API + "/" + urllib.parse.quote(doi, safe=""))
    return [d["message"]] if d else []

def search(title, kind, year):
    q = {"query.bibliographic": title, "rows": 10,
         "filter": "type:%s,from-pub-date:%d-01-01" % (CR_TYPE[kind], year - 1)}
    d = get_json(API + "?" + urllib.parse.urlencode(q))
    return (d or {}).get("message", {}).get("items", [])

def cr_year(item):
    for k in ("issued", "published-online", "published-print"):
        parts = (item.get(k) or {}).get("date-parts") or [[None]]
        if parts[0] and parts[0][0]:
            return int(parts[0][0])
    return None


# ---------------------------------------------------------------- 값 다듬기
def bare_doi(d):
    return re.sub(r"^(https?://(dx\.)?doi\.org/|doi:\s*)", "", (d or "").strip(), flags=re.I)

def doi_fmt(d):
    d = bare_doi(d)
    return "10.1109/" + d[8:].upper() if d.lower().startswith("10.1109/") else d   # 기존 IEEE 표기(대문자)에 맞춤

def pages_fmt(p):
    m = re.fullmatch(r"\s*(\w+)\s*[-–]\s*(\w+)\s*", p or "")
    return m.group(1) if m and m.group(1) == m.group(2) else (p or "").strip()

def abstract_fmt(a):
    a = re.sub(r"<jats:title>\s*Abstract\s*</jats:title>", " ", a or "", flags=re.I)
    a = re.sub(r"\s+", " ", plain(a)).strip()
    return re.sub(r"^Abstract[:.\s]+", "", a)


# ---------------------------------------------------------------- 한 행 판정
def venue_of(row, kind):
    if kind == "journal":
        return row.get("journal") or ""
    return row.get("booktitle") or row.get("note") or row.get("organization") or ""   # pubs.js 와 같은 순서

def check(row, kind, item, by_doi_given):
    """통과한 검사 점수(dict)와 실패 사유 목록. by_doi_given: CSV 에 적힌 DOI 로 찾은 기록인지."""
    venue = venue_of(row, kind)
    ys = (row.get("date") or "")[:4]
    cy = cr_year(item)
    c = {
        "type": item.get("type") == CR_TYPE[kind],
        "title": title_sim(row["title"], (item.get("title") or [""])[0]),
        "authors": authors_ok(csv_surnames(row.get("author")), cr_surnames(item)),
        "venue": venue_score(venue or "", item),
        "year": cy,
    }
    why = []
    if not c["type"]:
        why.append("종류 다름(Crossref: %s)" % item.get("type"))
    cr_title = (item.get("title") or [""])[0]
    if not (c["title"] >= TITLE_MIN_DOI if by_doi_given else same_title(row["title"], cr_title)):
        why.append("제목 다름(Crossref: %s)" % plain(cr_title).strip())
    if not c["authors"]:
        why.append("저자 불일치(CSV %d명: %s / Crossref %d명: %s)" % (
            len(csv_surnames(row.get("author"))), row.get("author", ""),
            len(item.get("author") or []), ", ".join(a.get("family", "") for a in item.get("author") or [])))
    if not venue:
        why.append("CSV 게재처가 비어 있음")
    elif c["venue"] < VENUE_MIN:
        why.append("게재처 불일치(CSV: %s / Crossref: %s)" % (venue, (item.get("container-title") or ["?"])[0]))
    if ys.isdigit() and not (cy and int(ys) - 1 <= cy <= int(ys) + 2):
        why.append("연도 차이(CSV %s / Crossref %s)" % (ys, cy))
    return c, why

def decide(row, kind):
    """→ ("match", item, checks) | ("review", item, reasons) | ("none", None, None)"""
    doi = bare_doi(row.get("doi"))
    if doi:
        items = by_doi(doi)
        if not items:
            return "review", None, ["CSV 의 DOI(%s)가 Crossref 에 아직 없음" % doi]
        c, why = check(row, kind, items[0], True)
        return ("match", items[0], c) if not why else ("review", items[0], why)
    year = int(row["date"][:4]) if (row.get("date") or "")[:4].isdigit() else datetime.now(KST).year
    passed, near = {}, None
    for it in search(row["title"], kind, year):
        c, why = check(row, kind, it, False)
        if not why:
            passed.setdefault(bare_doi(it["DOI"]).lower(), (it, c))
        elif c["title"] >= TITLE_NEAR and near is None:   # 거의 같은 논문 → 반영 안 하고 '확인 필요'로 알림
            near = (it, why)
    if len(passed) == 1:
        it, c = next(iter(passed.values()))
        return "match", it, c
    if len(passed) > 1:
        return "review", None, ["조건을 통과한 후보가 %d개: %s" % (len(passed), ", ".join(passed))]
    if near:
        return "review", near[0], near[1]
    return "none", None, None

def apply(row, kind, item):
    """row 를 고치고 (새 상태, 채운 칸 목록) 반환. 바뀐 게 없으면 (None, [])."""
    cur = status_of(row.get("status"))
    final = kind == "conference" or bool((item.get("volume") or "").strip())   # Crossref 기준 최종 출판인지
    new = "published" if final else "early access"
    if rank(new) <= rank(cur):      # 상태는 올리기만 (직접 publish 로 둔 것도 그대로 둠)
        new = cur
    fill = {"doi": doi_fmt(item["DOI"]), "abstract": abstract_fmt(item.get("abstract"))}
    if kind == "journal" and final:
        art = (item.get("article-number") or "").strip()
        fill["volume"] = (item.get("volume") or "").strip()
        fill["number"] = (item.get("issue") or "").strip() or art
        pages = pages_fmt(item.get("page"))
        fill["pages"] = "" if pages and pages == fill["number"] else pages
    filled = []
    for k, v in fill.items():
        if v and k in row and not (row[k] or "").strip():
            row[k] = v
            filled.append(k)
    if new == cur and not filled:
        return None, []
    if new != cur:
        row["status"] = new
    if "modified" in row:
        row["modified"] = datetime.now(KST).strftime("%Y-%m-%d %H:%M:%S")
    return new, filled


# ---------------------------------------------------------------- CSV 읽기/쓰기 (원래 형식 유지)
def serialize(header, rows, bom, eol):
    buf = io.StringIO(newline="")
    w = csv.writer(buf, lineterminator=eol)
    w.writerow(header)
    for r in rows:
        w.writerow([r.get(h, "") for h in header])
    return (b"\xef\xbb\xbf" if bom else b"") + buf.getvalue().encode("utf-8")

def read_csv(path):
    """→ (header, rows, bom, eol, 다시 저장해도 원본과 같은지). 같지 않으면 그 파일은 쓰지 않음."""
    raw = open(path, "rb").read()
    bom = raw.startswith(b"\xef\xbb\xbf")
    text = raw.decode("utf-8-sig")
    eol = "\r\n" if "\r\n" in text else "\n"
    rows = list(csv.reader(io.StringIO(text, newline="")))
    header = rows[0]
    recs = [dict(zip(header, r + [""] * (len(header) - len(r)))) for r in rows[1:]]
    return header, recs, bom, eol, serialize(header, recs, bom, eol) == raw


# ---------------------------------------------------------------- main
def wanted(row, kind, this_year):
    st = status_of(row.get("status"))
    if st in ("forthcoming", "early access"):
        return True
    if st not in ("publish", "published"):          # draft 등은 손대지 않음
        return False
    y = (row.get("date") or "")[:4]
    if not (y.isdigit() and int(y) >= this_year - RECENT_YEARS):
        return False
    if not (row.get("doi") or "").strip():
        return True
    return kind == "journal" and not ((row.get("volume") or "").strip() and
                                      ((row.get("pages") or "").strip() or (row.get("number") or "").strip()))

def main():
    dry = "--dry-run" in sys.argv
    changed, review, waiting = [], [], []
    for rel, kind in FILES:
        path = os.path.join(ROOT, rel)
        if not os.path.exists(path):
            continue
        header, rows, bom, eol, safe = read_csv(path)
        if not safe:
            review.append((rel, "(파일 전체)", "", None, ["CSV 형식을 그대로 다시 저장할 수 없어 이 파일은 건너뜀"]))
            continue
        dirty = False
        for row in rows:
            if not wanted(row, kind, datetime.now(KST).year):
                continue
            if not row.get("title", "").strip() or re.search(r"[가-힣]", row["title"]):
                continue
            venue = venue_of(row, kind)
            try:
                verdict, item, info = decide(row, kind)
            except Exception as e:   # Crossref 장애 등 — 이번엔 건너뛰고 다음 실행에서 다시
                review.append((rel, row["title"], venue, None, ["Crossref 조회 실패: %s" % e]))
                continue
            finally:
                time.sleep(0.5)
            if verdict == "match":
                before = status_of(row.get("status"))
                new, filled = apply(row, kind, item)
                if new:
                    dirty = True
                    changed.append((rel, row["title"], venue, before, new, bare_doi(row.get("doi")), filled, info))
                else:
                    waiting.append((rel, row["title"], "이미 최신(%s)" % before))
            elif verdict == "review":
                review.append((rel, row["title"], venue, item, info))
            else:
                waiting.append((rel, row["title"], "Crossref 에 아직 없음"))
        if dirty and not dry:
            open(path, "wb").write(serialize(header, rows, bom, eol))

    report(changed, review, waiting, dry)

def report(changed, review, waiting, dry):
    def move(b, n, arrow="→"):
        return "%s %s %s" % (b, arrow, n) if b != n else "%s · 빈칸 보충" % b

    def chk(c):
        return "제목 일치(%.0f%%) · 저자 일치 · 게재처 %.0f%% · %s년" % (c["title"] * 100, c["venue"] * 100, c["year"])

    lines = ["%s논문 %d편 업데이트 · 확인 필요 %d편 · 대기 %d편" % ("[dry-run] " if dry else "", len(changed), len(review), len(waiting))]
    for rel, t, v, b, n, doi, filled, c in changed:
        lines += ["  ✔ [%s] %s (%s)" % (move(b, n), t, v), "      https://doi.org/%s · 채움: %s · %s" % (doi, ", ".join(filled) or "-", chk(c))]
    for rel, t, v, it, why in review:
        lines += ["  ? %s (%s)" % (t, v), "      " + " / ".join(why) + (" · 후보 https://doi.org/%s" % it["DOI"] if it else "")]
    for rel, t, why in waiting:
        lines.append("  · %s — %s" % (t, why))
    print("\n".join(lines))

    md = ["## 논문 자동 업데이트 (Crossref)", ""]
    if changed:
        md += ["### ✔ 반영됨", "", "| 상태 | 논문 | DOI | 채운 칸 | 확인 |", "|---|---|---|---|---|"]
        md += ["| %s | %s<br><sub>%s</sub> | [%s](https://doi.org/%s) | %s | %s |" % (
                   move(b, n), t.replace("|", "\\|"), v.replace("|", "\\|"), doi, doi, ", ".join(filled) or "-", chk(c))
               for rel, t, v, b, n, doi, filled, c in changed]
    if review:
        md += ["", "### ? 확인 필요 (반영 안 함)", ""]
        md += ["- **%s** (%s) — %s%s" % (t, v, " / ".join(why), " · 후보 [%s](https://doi.org/%s)" % (it["DOI"], it["DOI"]) if it else "")
               for rel, t, v, it, why in review]
    if waiting:
        md += ["", "### · 대기", ""] + ["- %s — %s" % (t, why) for rel, t, why in waiting]
    if os.environ.get("GITHUB_STEP_SUMMARY"):
        open(os.environ["GITHUB_STEP_SUMMARY"], "a", encoding="utf-8").write("\n".join(md) + "\n")

    if changed and os.environ.get("COMMIT_MSG_FILE"):
        msg = ["Publications: auto-update %d paper(s) from Crossref" % len(changed), ""]
        for rel, t, v, b, n, doi, filled, c in changed:
            msg += ["- [%s] %s (%s)" % (move(b, n, "->").replace("빈칸 보충", "filled in"), t, v),
                    "  https://doi.org/%s | filled: %s" % (doi, ", ".join(filled) or "-"),
                    "  checks: title match (%.0f%%), authors match, venue %.0f%%, year %s" % (c["title"] * 100, c["venue"] * 100, c["year"])]
        if review:
            msg += ["", "Needs manual check (not changed):"] + ["- %s — %s" % (t, " / ".join(why)) for rel, t, v, it, why in review]
        open(os.environ["COMMIT_MSG_FILE"], "w", encoding="utf-8").write("\n".join(msg) + "\n")


if __name__ == "__main__":
    main()
