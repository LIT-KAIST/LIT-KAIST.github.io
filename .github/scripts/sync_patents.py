#!/usr/bin/env python3
"""산학협력단 특허 목록(xlsx)으로 data/patent_*.csv 를 맞춥니다.

사용법 (저장소 맨 위 폴더에서):
    python3 .github/scripts/sync_patents.py 받은파일.xlsx            # 미리보기 — 아무것도 바꾸지 않음
    python3 .github/scripts/sync_patents.py 받은파일.xlsx --write    # 실제로 저장
    (--offline : Google Patents 확인 없이)

파일 이름을 생략하면 저장소 맨 위의 가장 최근 .xlsx 를 씁니다(.xlsx 는 .gitignore 로 커밋되지 않음).
표준 라이브러리만 사용 — 따로 설치할 것 없음.

규칙
  · 산단 목록 = 기준. 출원번호(없으면 등록번호)로 사이트 항목과 짝을 지음.
  · 짝이 있으면 출원번호·출원일·등록번호·등록일·산단 상태(소멸 등, 관리용 비고)를 산단 값으로 갱신.
    제목·발명자는 사이트 값을 유지(사이트에서 다듬은 표기 보존).
    산단 목록에 등록 정보가 없어도 사이트에 이미 있는 등록은 지우지 않음(보고만).
  · '산단외'(Y)였던 특허가 산단 목록에 새로 올라오면 → 표시를 자동으로 해제.
  · 산단 목록에만 있으면 새로 추가(제목·발명자는 산단 값).
  · 사이트에만 있으면: '산단외'=Y 면 유지, 아니면 삭제(번호 오기 등으로 봄).
    단, 목록이 잘린 파일로 보이면(사이트 항목의 85% 미만만 짝지어짐) 저장하지 않고 멈춤.
  · 등록번호가 있는데 링크가 없는 특허는 Google Patents 에서 확인해 페이지가 있고 제목이 맞으면 링크를 넣고
    (제목이 다르면 등록번호 오타일 수 있어 보고만),
    그 페이지의 패밀리(우선권·해외 출원) 정보로 '관련 출원'(family)을 연결.
  · 새 해외·PCT 출원은 관련 국내 출원 후보를 보고서에 제안(자동 연결은 하지 않음).
"""
import csv, datetime, difflib, glob, io, json, os, re, sys, time, unicodedata, urllib.error, urllib.request, zipfile
import xml.etree.ElementTree as ET

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
FILES = {"dom": os.path.join(ROOT, "data", "patent_domestic.csv"),
         "intl": os.path.join(ROOT, "data", "patent_international.csv")}
NEW_COLS = ["app_no", "app_date", "reg_no", "reg_date", "family", "산단외"]
CC = {"대한민국": "KR", "한국": "KR", "미국": "US", "유럽": "EP", "일본": "JP", "중국": "CN",
      "독일": "DE", "영국": "GB", "PCT": "PCT"}
UA = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36"}
report = []


def say(*a):
    report.append(" ".join(str(x) for x in a))


# ---------------------------------------------------------------- xlsx (stdlib)
def read_xlsx(path):
    ns = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
    z = zipfile.ZipFile(path)
    shared = []
    if "xl/sharedStrings.xml" in z.namelist():
        for si in ET.fromstring(z.read("xl/sharedStrings.xml")).findall("m:si", ns):
            shared.append("".join(t.text or "" for t in si.iter("{%s}t" % ns["m"])))
    sheet = sorted(n for n in z.namelist() if re.match(r"xl/worksheets/sheet\d+\.xml$", n))[0]
    rows = []
    for row in ET.fromstring(z.read(sheet)).iter("{%s}row" % ns["m"]):
        cells = {}
        for c in row.findall("m:c", ns):
            col = re.match(r"[A-Z]+", c.get("r")).group(0)
            idx = 0
            for ch in col:
                idx = idx * 26 + ord(ch) - 64
            t = c.get("t")
            if t == "inlineStr":
                v = "".join(x.text or "" for x in c.iter("{%s}t" % ns["m"]))
            else:
                ve = c.find("m:v", ns)
                v = ve.text if ve is not None else ""
                if t == "s" and v:
                    v = shared[int(v)]
                elif t in (None, "n") and v and re.fullmatch(r"-?\d+(\.\d+)?([eE][-+]?\d+)?", v):
                    f = float(v)            # 숫자 칸: 1.6209439E7 → 16209439
                    v = str(int(f)) if f.is_integer() else v
            cells[idx - 1] = (v or "").strip()
        rows.append([cells.get(i, "") for i in range(max(cells) + 1)] if cells else [])
    hi = next(i for i, r in enumerate(rows) if "Application No." in r)
    hdr = rows[hi]
    out = []
    for r in rows[hi + 1:]:
        if not any(r):
            continue
        out.append({h: (r[i] if i < len(r) else "") for i, h in enumerate(hdr)})
    return out


# ---------------------------------------------------------------- number helpers
def nf(s):
    return unicodedata.normalize("NFKC", s or "").strip()


def digits(s):
    return re.sub(r"\D", "", s or "")


def x_country(x):
    if nf(x.get("Application No.")).upper().startswith("PCT"):
        return "PCT"
    return CC.get(nf(x.get("Country")), nf(x.get("Country")) or "KR")


def app_key(cc, n):
    n = nf(n).upper().replace(" ", "")
    if not n:
        return None
    if n.startswith("PCT"):
        return n
    d = digits(n)
    if cc == "KR":
        return "KR" + d
    if cc == "US":
        return "US" + d[-6:]
    if cc == "EP":
        return "EP" + d[:8]
    return cc + d


def reg_key(cc, n):
    n = nf(n).upper().replace(" ", "")
    if not n:
        return None
    n = re.sub(r"^(US|EP|KR|JP|CN)", "", n)
    if cc == "KR":
        return "KR" + digits(re.sub(r"-0000$", "", n))
    return cc + digits(n).lstrip("0")


def fmt_app(cc, n):
    n = nf(n).replace(" ", "")
    if cc == "US" and not n.upper().startswith("PCT") and len(digits(n)) == 8:
        d = digits(n)
        return "%s/%s,%s" % (d[:2], d[2:5], d[5:])
    return n


def fmt_reg(cc, n):
    n = re.sub(r"^(US|EP|KR|JP|CN)", "", nf(n).upper().replace(" ", ""))
    if not n:
        return ""
    if cc == "KR":
        return re.sub(r"-0000$", "", n)
    if cc == "US":
        return "{:,}".format(int(digits(n)))
    return digits(n).lstrip("0")


def date_x(s):
    s = nf(s).replace(".", "-").replace("/", "-")
    return s if re.fullmatch(r"\d{4}(-\d{2}-\d{2})?", s) else ""


def fam(s):
    return re.sub(r"[^0-9A-Z]", "", (s or "").upper())


def cc_of(r):
    return (r.get("country") or "KR") if r["_scope"] == "intl" else "KR"


def gp_id(cc, reg):
    if not reg or cc == "PCT":
        return None
    d = digits(re.sub(r"-0000$", "", reg))
    return cc + (d if cc == "KR" else d.lstrip("0"))


def gp_app_key(s):   # Google Patents 의 출원번호 표기 → app_key
    s = nf(s).upper().replace(" ", "")
    if s.startswith("PCT/"):
        return s
    m = re.match(r"^(KR|US|EP)(.*)$", s)
    if not m:
        return None
    cc, d = m.group(1), digits(m.group(2))
    if cc == "KR":
        if len(d) == 11:
            d = "10" + d
        return "KR" + d[:13] if len(d) >= 13 else None
    return "US" + d[-6:] if cc == "US" else "EP" + d[:8]


# ---------------------------------------------------------------- csv io
def load(path, scope):
    with open(path, encoding="utf-8-sig", newline="") as f:
        rd = list(csv.reader(f))
    hdr = rd[0]
    rows = []
    for row in rd[1:]:
        if any(c.strip() for c in row):
            r = dict(zip(hdr, row + [""] * (len(hdr) - len(row))))
            r["_scope"] = scope
            rows.append(r)
    return hdr, rows


def save(path, hdr, rows):
    buf = io.StringIO()
    w = csv.writer(buf, lineterminator="\n")
    w.writerow(hdr)
    for r in rows:
        w.writerow([r.get(h, "") for h in hdr])
    with open(path, "w", encoding="utf-8", newline="") as f:
        f.write("﻿" + buf.getvalue())


def with_cols(hdr, cols):
    hdr = list(hdr)
    at = hdr.index("date") + 1 if "date" in hdr else len(hdr)
    for c in cols:
        if c not in hdr:
            hdr.insert(at, c)
        at = hdr.index(c) + 1
    return hdr


# ---------------------------------------------------------------- Google Patents
def google_patents(gid):
    url = "https://patents.google.com/patent/" + gid
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30) as resp:
            body = resp.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        return {"status": e.code, "url": url}
    except Exception as e:
        return {"status": "ERR " + str(e)[:60], "url": url}
    apps = [n for blk in re.findall(r'<li itemprop="application" itemscope repeat>(.*?)</li>', body, re.S)
            for n in re.findall(r'itemprop="applicationNumber">([^<]+)<', blk)]
    prio = [n for blk in re.findall(r'<tr itemprop="(?:appsClaimingPriority|parentApps)"(.*?)</tr>', body, re.S)
            for n in re.findall(r'itemprop="applicationNumber">([^<]+)<', blk)]
    t = re.search(r"<title>([^<]*)", body)
    title = re.sub(r"\s*-\s*Google Patents\s*$", "", (t.group(1) if t else "").strip())
    title = re.sub(r"^[A-Z]{2}[0-9A-Z]+\s*-\s*", "", title)   # "KR101859821B1 - 제목" → "제목"
    return {"status": 200, "url": url, "apps": apps + prio, "title": title}


def title_sim(a, b):   # 등록번호 오타로 남의 특허에 링크되는 것을 막기 위한 제목 비교
    n = lambda s: re.sub(r"[^0-9a-z가-힣]", "", unicodedata.normalize("NFKC", s or "").lower())
    return difflib.SequenceMatcher(None, n(a), n(b)).ratio()


def split_ti(ti):
    t = nf(ti)
    if " / " in t:
        a, b = t.rsplit(" / ", 1)
    else:
        a, b = t, ""
    return a.strip(), ", ".join(s.strip() for s in b.split(",") if s.strip())


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    write, offline = "--write" in sys.argv, "--offline" in sys.argv
    if args:
        xlsx = args[0]
    else:
        cand = sorted(glob.glob(os.path.join(ROOT, "*.xlsx")), key=os.path.getmtime)
        if not cand:
            sys.exit("xlsx 파일을 지정하세요.")
        xlsx = cand[-1]
    X = read_xlsx(xlsx)
    print("산단 목록:", os.path.basename(xlsx), len(X), "건")

    hdr_d, dom = load(FILES["dom"], "dom")
    hdr_i, intl = load(FILES["intl"], "intl")
    site = dom + intl
    s_app = {}
    s_reg = {}
    for r in site:
        if r.get("app_no"):
            s_app[app_key(cc_of(r), r["app_no"])] = r
        if r.get("reg_no"):
            s_reg[reg_key(cc_of(r), r["reg_no"])] = r

    matched, new = [], []
    for x in X:
        cc = x_country(x)
        r = s_app.get(app_key(cc, x.get("Application No.", "")))
        if r is None and nf(x.get("Patent No.")):
            r = s_reg.get(reg_key(cc, x["Patent No."]))
        (matched.append((x, r)) if r is not None else new.append(x))
    used = set(id(r) for _, r in matched)
    unmatched = [r for r in site if id(r) not in used]
    keep = [r for r in unmatched if (r.get("산단외") or "").strip().upper() == "Y"]
    drop = [r for r in unmatched if r not in keep]
    base_n = len([r for r in site if (r.get("산단외") or "").strip().upper() != "Y"])
    if base_n and len(matched) / float(base_n) < 0.85:
        sys.exit("멈춤: 사이트 항목 %d건 중 %d건만 산단 목록과 짝지어졌습니다. 목록이 잘린 파일인지 확인하세요." % (base_n, len(matched)))

    # ---- 1) 짝지어진 항목 갱신
    def apply_x(r, x, cc):
        xa, xr = nf(x.get("Application No.")), nf(x.get("Patent No."))
        before = (r.get("app_no", ""), r.get("app_date", ""), r.get("reg_no", ""), r.get("reg_date", ""))
        if xa and (not r.get("app_no") or app_key(cc, r["app_no"]) != app_key(cc, xa)):
            r["app_no"] = fmt_app(cc, xa)
        if date_x(x.get("Application Date")):
            r["app_date"] = date_x(x["Application Date"])
        if xr:
            r["reg_no"], r["reg_date"] = fmt_reg(cc, xr), date_x(x.get("Registration Date"))
        elif r.get("reg_no"):
            say("  등록 유지 (산단 목록엔 등록 정보 없음):", r["pub_id"], r["reg_no"], r["title"][:40])
        r["date"] = r["reg_date"] if r.get("reg_no") else r["app_date"]
        r["status"] = "published"   # 특허는 논문용 상태(forthcoming 등)를 쓰지 않음
        after = (r["app_no"], r["app_date"], r.get("reg_no", ""), r.get("reg_date", ""))
        if before != after and r.get("pub_id"):
            say("  갱신", r["pub_id"], before, "→", after, r["title"][:30])
        memo = [m for m in re.split(r"\s*\|\s*", r.get("note", "")) if m and not m.startswith("[산학협력단]")]
        if nf(x.get("Division")):
            memo.append("[산학협력단] " + nf(x["Division"]))
        r["note"] = " | ".join(memo)

    say("■ 갱신")
    for x, r in matched:
        apply_x(r, x, cc_of(r))
        if (r.get("산단외") or "").strip():
            r["산단외"] = ""
            r["note"] = " | ".join(m for m in re.split(r"\s*\|\s*", r.get("note", "")) if m and not m.startswith("산학협력단 목록("))
            say("  산단외 해제 (산단 목록에 새로 올라옴):", r["pub_id"], r["app_no"], r["title"][:40])

    # ---- 2) 새 항목
    say("■ 추가")
    next_id = max([int(r["pub_id"]) for r in site if (r.get("pub_id") or "").isdigit()] or [0]) + 1
    for x in new:
        cc = x_country(x)
        title, inv = split_ti(x.get("Title/Inventor", ""))
        r = {"pub_id": str(next_id), "type": "patent", "status": "published", "title": title, "author": inv,
             "_scope": "dom" if cc == "KR" else "intl"}
        next_id += 1
        if r["_scope"] == "intl":
            r["country"] = cc
        apply_x(r, x, cc)
        (dom if cc == "KR" else intl).append(r)
        site.append(r)
        say("  추가", r["pub_id"], cc, r["app_no"], r.get("reg_no") or "-", title[:50])
        if re.search(r"[A-Za-z]", title) and title == title.upper():
            say("    ↳ 영문 대문자 제목 — 필요하면 관리자 페이지에서 표기를 다듬으세요")
        if re.search(r"[A-Za-z]+, [A-Za-z]", inv):
            say("    ↳ 발명자가 'Last, First' 영문 표기 — 관리자 페이지에서 정리하세요:", inv[:60])

    # ---- 3) 삭제 / 유지
    say("■ 산단 목록에 없는 사이트 항목")
    for r in keep:
        say("  유지 (산단외):", r["pub_id"], r.get("app_no") or r.get("reg_no"), r["title"][:40])
    for r in drop:
        say("  삭제:", r["pub_id"], r.get("app_no") or r.get("reg_no"), r["title"][:40])
    gone = set(id(r) for r in drop)
    dom = [r for r in dom if id(r) not in gone]
    intl = [r for r in intl if id(r) not in gone]
    site = dom + intl
    # 지워진 특허가 관련 출원 묶음의 기준이었다면: 남은 것이 2건 이상이면 가장 이른 국내 출원을 새 기준으로, 1건이면 해제
    for k in set(fam(r.get("app_no")) for r in drop):
        orphans = [r for r in site if r.get("family") and fam(r["family"]) == k]
        if not orphans:
            continue
        if len(orphans) == 1:
            orphans[0]["family"] = ""
            say("  관련 출원 기준이 삭제되어 해제:", orphans[0]["pub_id"])
            continue
        nb = sorted(orphans, key=lambda r: (cc_of(r) != "KR", r.get("app_date") or "9999"))[0]
        for r in orphans:
            r["family"] = "" if r is nb else nb["app_no"]
        say("  관련 출원 기준이 삭제되어 새 기준으로:", nb["app_no"], "(%d건)" % len(orphans))

    # ---- 4) Google Patents: 링크 + 관련 출원
    say("■ Google Patents")
    by_key = dict((app_key(cc_of(r), r["app_no"]), r) for r in site if r.get("app_no"))

    def is_base(r):
        k = fam(r.get("app_no"))
        return any(fam(o.get("family")) == k for o in site if o is not r)

    def group_key(r):
        return fam(r.get("family") or r.get("app_no"))

    def link(a, b):
        if group_key(a) == group_key(b):
            return
        a_free = not a.get("family") and not is_base(a)
        b_free = not b.get("family") and not is_base(b)
        if a_free and b_free:
            pair = sorted([a, b], key=lambda r: (cc_of(r) != "KR", r.get("app_date") or "9999"))
            pair[1]["family"] = pair[0]["app_no"]
        elif a_free:
            a["family"] = b.get("family") or b["app_no"]
        elif b_free:
            b["family"] = a.get("family") or a["app_no"]
        else:
            say("  ⚠ 서로 다른 관련 출원 묶음이 이어짐 — 직접 확인:", a["pub_id"], b["pub_id"])
            return
        say("  관련 출원 연결:", cc_of(a), a["app_no"], "↔", cc_of(b), b["app_no"])

    # 확인 대상: 링크가 없는 등록 특허 + 최근 3년 안에 등록된 특허의 Google Patents 링크(관리자 페이지가 등록번호로 자동으로 넣은 것 재확인)
    recent = (datetime.date.today() - datetime.timedelta(days=3 * 366)).isoformat()
    def needs_check(r):
        if not r.get("reg_no") or not gp_id(cc_of(r), r["reg_no"]):
            return False
        url = r.get("url") or ""
        return not url or ("patents.google.com/" in url and (r.get("reg_date") or "") >= recent)
    todo = [r for r in site if needs_check(r)]
    if offline:
        say("  (--offline: 건너뜀,", len(todo), "건)")
    for i, r in enumerate([] if offline else todo):
        had = r.get("url") or ""
        g = google_patents(gp_id(cc_of(r), r["reg_no"]))
        if g["status"] == 200 and title_sim(r.get("title"), g.get("title")) < 0.6:
            r["url"] = "" if "patents.google.com/" in had else had
            say("  ⚠ 링크 %s — 등록번호 확인 필요:" % ("제거" if had else "보류"), r["pub_id"], r["reg_no"],
                "| 사이트:", r["title"][:30], "| Google Patents:", g.get("title", "")[:30])
        elif g["status"] == 200:
            r["url"] = g["url"]
            if not had:
                say("  링크:", r["pub_id"], g["url"])
            for s in g["apps"]:
                o = by_key.get(gp_app_key(s))
                if o is not None and o is not r:
                    link(r, o)
        else:
            if "patents.google.com/" in had:
                r["url"] = ""
                say("  링크 제거 (아직 Google Patents 에 없음 %s — 다음 동기화 때 다시 확인):" % g["status"], r["pub_id"], r["reg_no"])
            else:
                say("  링크 없음 (Google Patents %s):" % g["status"], r["pub_id"], r["reg_no"])
        if i + 1 < len(todo):
            time.sleep(1.2)

    # ---- 5) 새 해외·PCT 출원: 관련 국내 출원 후보 제안
    newset = set(id(r) for r in site if (r.get("pub_id") or "").isdigit() and int(r["pub_id"]) >= next_id - len(new))
    for r in site:
        if id(r) not in newset or cc_of(r) == "KR" or r.get("family") or is_base(r):
            continue
        inv = set(s.strip() for s in (r.get("author") or "").split(",") if s.strip())
        try:
            d0 = datetime.date.fromisoformat(r["app_date"])
        except Exception:
            continue
        cands = []
        for o in site:
            if cc_of(o) != "KR" or not inv:
                continue
            oinv = set(s.strip() for s in (o.get("author") or "").split(",") if s.strip())
            try:
                gap = (d0 - datetime.date.fromisoformat(o["app_date"])).days
            except Exception:
                continue
            ov = len(inv & oinv) / float(len(inv | oinv) or 1)
            if 0 <= gap <= 400 and ov >= 0.6:
                cands.append((ov, -gap, o))
        if cands:
            cands.sort(key=lambda c: (-c[0], c[1]))
            say("  후보 — 새 해외 출원", r["pub_id"], r["app_no"], "의 관련 국내 출원? →",
                "; ".join("%s %s" % (o["app_no"], o["title"][:25]) for _, _, o in cands[:3]),
                "(관리자 페이지 '관련 기준 출원번호'에서 지정)")

    # ---- 저장
    key = lambda r: (r.get("date") or "", r.get("app_no") or "")
    dom.sort(key=key, reverse=True)
    intl.sort(key=key, reverse=True)
    print("\n".join(report))
    print("\n결과: 국내 %d (등록 %d) · 국제 %d (등록 %d)" % (
        len(dom), sum(1 for r in dom if r.get("reg_no")), len(intl), sum(1 for r in intl if r.get("reg_no"))))
    if write:
        save(FILES["dom"], with_cols(hdr_d, [c for c in NEW_COLS]), dom)
        save(FILES["intl"], with_cols(hdr_i, [c for c in NEW_COLS[:4]] + ["country"] + NEW_COLS[4:]), intl)
        print("저장했습니다:", FILES["dom"], FILES["intl"])
    else:
        print("(미리보기 — 저장하려면 --write)")


if __name__ == "__main__":
    main()
