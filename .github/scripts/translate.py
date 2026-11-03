"""한국어만 있는 글의 영어 칸을 Claude 로 채움 (.github/workflows/translate.yml 에서 실행).

  python translate.py collect    영어 칸이 빈 항목을 모아 $WORK/job.json 으로 (GITHUB_OUTPUT 에 count)
  python translate.py translate  job.json → Claude Code(구독 토큰) → $WORK/result.json (검증 포함)
  python translate.py apply      result.json 을 현재 CSV 의 빈 영어 칸에만 채움 (+ $WORK/commit_msg.txt)

규칙
- 이미 영어가 있는 칸은 절대 덮어쓰지 않음 (사람이 고친 번역 보존).
  한국어를 고친 뒤 다시 번역하려면 영어 칸을 비우고 저장.
- 바뀐 행만 다시 쓰고 나머지 줄은 한 글자도 건드리지 않음 (diff 최소화).
- 항목은 (파일, 날짜, 칸, 한국어 원문) 해시로 찾으므로, 번역하는 동안 admin 이 다른 글을
  저장해도 최신 파일에 그대로 적용됨. 원문이 바뀐 칸은 건너뜀(다음 실행에서 새로 번역).
"""
import csv, hashlib, io, json, os, re, shutil, subprocess, sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
WORK = os.environ.get("WORK") or os.path.join(ROOT, ".translate-work")
SINCE = "2025-01-01"          # 이 날짜 이후 글만 (옛 글엔 예전 홈페이지 HTML 이 섞여 있음)
MAX_ITEMS = 150               # 한 번에 번역할 최대 칸 수 (나머지는 다음 실행)

# 번역 대상: 파일 → 한국어 칸 → 영어 칸. 행은 date 칸으로 식별.
TARGETS = [
    {"file": "data/news.csv", "pairs": [("title", "title_en"), ("content", "content_en")]},
    {"file": "data/album.csv", "pairs": [("title", "title_en"), ("content", "content_en")]},
]

# 이름 외에 고정할 용어 (필요하면 여기에 추가)
TERMS = {
    "박현철 교수": "Prof. Hyuncheol Park",
    "정보전송연구실": "Laboratory for Information Transmission (LIT)",
    "박사과정": "Ph.D. student",
    "석사과정": "M.S. student",
    "석박통합과정": "integrated M.S.–Ph.D. student",
    "박사후연구원": "postdoctoral researcher",
    "전문연구요원": "technical research personnel (alternative military service)",
    "훈련소": "military basic training",
    "KAIST 전기및전자공학부": "KAIST School of Electrical Engineering",
    "한국통신학회": "Korean Institute of Communications and Information Sciences (KICS)",
    "추계종합학술발표회": "KICS Fall Conference",
    "하계종합학술발표회": "KICS Summer Conference",
    "동계종합학술발표회": "KICS Winter Conference",
    "지능통감융합연구센터": "Center for Integrated Intelligence, Sensing, and Communication (I²SAC)",
}

PROMPT = """You translate Korean text from the website of LIT (Laboratory for Information Transmission), a wireless communications lab at KAIST, into English for the site's English version.

The JSON on stdin has:
- "glossary": Korean names and terms with the English form to use. Always use these exact English forms.
- "examples": earlier posts with their English versions. Match their style and tone.
- "items": what to translate, each with an "id", a "kind" (title or content) and the Korean text "ko".

Rules:
- Translate every item and return each id exactly once with its English text.
- Be faithful and natural. Do not add or drop information, and do not add notes or explanations.
- Keep paper titles, venue names, URLs, numbers and anything already in English as they are.
- For a Korean person name not in the glossary, romanize it as given name then family name (e.g. 홍길동 → Gildong Hong).
- Write dates naturally in English (e.g. "10/15" → "October 15", "8월 26일 (수)" → "Wednesday, August 26").
- Keep the line breaks of the source.
- Titles are short headlines; contents are full sentences."""

SCHEMA = {
    "type": "object",
    "properties": {"translations": {"type": "array", "items": {
        "type": "object",
        "properties": {"id": {"type": "string"}, "en": {"type": "string"}},
        "required": ["id", "en"], "additionalProperties": False}}},
    "required": ["translations"], "additionalProperties": False,
}

HANGUL = re.compile(r"[가-힣]")


# ---------------------------------------------------------------- CSV (행 단위로 고쳐 쓰기)
def read_text(path):
    raw = open(path, "rb").read().decode("utf-8")
    bom = raw.startswith("﻿")
    return ("﻿" if bom else ""), (raw[1:] if bom else raw)

def record_spans(text):
    """각 레코드의 (시작, 끝) — 끝은 줄바꿈 제외. 따옴표 안 줄바꿈은 레코드에 포함."""
    spans, start, inq, i, n = [], 0, False, 0, len(text)
    while i < n:
        c = text[i]
        if inq:
            if c == '"':
                if i + 1 < n and text[i + 1] == '"':
                    i += 2
                    continue
                inq = False
        elif c == '"':
            inq = True
        elif c == "\n":
            spans.append((start, i - 1 if i > 0 and text[i - 1] == "\r" else i))
            start = i + 1
        i += 1
    if start < n:
        spans.append((start, n))
    return spans

def parse_record(s):
    return next(csv.reader(io.StringIO(s, newline="")), [])

def format_record(fields):
    buf = io.StringIO()
    # lineterminator 에 \r\n 을 둬야 줄바꿈이 든 칸이 확실히 따옴표로 감싸짐 (끝의 \r\n 은 잘라냄)
    csv.writer(buf, quoting=csv.QUOTE_MINIMAL, lineterminator="\r\n").writerow(fields)
    return buf.getvalue()[:-2]

class Table:
    def __init__(self, path):
        self.path = path
        self.bom, self.text = read_text(path)
        self.spans = record_spans(self.text)
        self.header = parse_record(self.text[slice(*self.spans[0])])
        self.edits = {}            # 레코드 번호 → 새 필드 목록

    def ensure_columns(self, names):
        missing = [c for c in names if c not in self.header]
        if missing:
            self.header = self.header + missing
            self.edits[0] = self.header

    def rows(self):
        for k, (a, b) in enumerate(self.spans[1:], start=1):
            s = self.text[a:b]
            if not s.strip():
                continue
            f = parse_record(s)
            yield k, f, {h: (f[i] if i < len(f) else "") for i, h in enumerate(self.header)}

    def set(self, k, fields, col, value):
        idx = self.header.index(col)
        fields = list(self.edits.get(k, fields))
        while len(fields) <= idx:
            fields.append("")
        fields[idx] = value
        self.edits[k] = fields

    def save(self):
        if not self.edits:
            return False
        out, pos = [], 0
        for k, (a, b) in enumerate(self.spans):
            if k in self.edits:
                out.append(self.text[pos:a]); out.append(format_record(self.edits[k])); pos = b
        out.append(self.text[pos:])
        open(self.path, "wb").write((self.bom + "".join(out)).encode("utf-8"))
        return True


# ---------------------------------------------------------------- 공통
def item_id(file, row, ko_col):
    h = hashlib.sha1("\x1f".join([file, row.get("date", ""), ko_col, row.get(ko_col, "")]).encode("utf-8"))
    return h.hexdigest()[:16]

def wanted(row):
    return (row.get("date", "") >= SINCE) and (row.get("status", "publish").strip() in ("", "publish"))

def pending():
    """(파일, 레코드번호, 필드목록, 행, 한국어칸, 영어칸) — 한국어는 있고 영어는 빈 칸."""
    for t in TARGETS:
        tbl = Table(os.path.join(ROOT, t["file"]))
        tbl.ensure_columns([en for _, en in t["pairs"]])
        for k, fields, row in tbl.rows():
            if not wanted(row):
                continue
            for ko, en in t["pairs"]:
                if row.get(ko, "").strip() and not row.get(en, "").strip():
                    yield t["file"], k, fields, row, ko, en

def load_csv(rel):
    p = os.path.join(ROOT, rel)
    if not os.path.exists(p):
        return []
    return list(csv.DictReader(io.StringIO(read_text(p)[1], newline="")))

def glossary():
    g = {}
    for rel in ("data/people_members.csv", "data/people_alumni.csv", "data/author_favorites.csv", "data/i2sac_members.csv"):
        for r in load_csv(rel):
            ko, en = (r.get("name_korean") or "").strip(), (r.get("name_english") or "").strip()
            if ko and en and HANGUL.search(ko) and not HANGUL.search(en):
                g.setdefault(ko, en)
    g.update(TERMS)
    return g

def examples(n=8):
    rows = [r for r in load_csv("data/news.csv")
            if all((r.get(c) or "").strip() for c in ("title", "title_en", "content", "content_en"))
            and HANGUL.search(r["title"]) and len(r["content"]) < 400]
    rows.sort(key=lambda r: r.get("date", ""), reverse=True)
    return [{"title": r["title"], "title_en": r["title_en"], "content": r["content"], "content_en": r["content_en"]}
            for r in rows[:n]]

def out(name, value):
    if os.environ.get("GITHUB_OUTPUT"):
        with open(os.environ["GITHUB_OUTPUT"], "a") as f:
            f.write(f"{name}={value}\n")

def summary(md):
    print(md)
    if os.environ.get("GITHUB_STEP_SUMMARY"):
        with open(os.environ["GITHUB_STEP_SUMMARY"], "a") as f:
            f.write(md + "\n")


# ---------------------------------------------------------------- 단계
def collect():
    os.makedirs(WORK, exist_ok=True)
    items, seen = [], set()
    for file, k, fields, row, ko, en in pending():
        i = item_id(file, row, ko)
        if i in seen:
            continue
        seen.add(i)
        items.append({"id": i, "kind": "title" if ko == "title" else "content", "ko": row[ko],
                      "_where": f"{file} · {row.get('date', '')[:10]} · {ko}"})
    items = items[:MAX_ITEMS]
    job = {"glossary": glossary(), "examples": examples(),
           "items": [{k: v for k, v in it.items() if not k.startswith("_")} for it in items]}
    json.dump(job, open(os.path.join(WORK, "job.json"), "w"), ensure_ascii=False, indent=1)
    summary(f"### 번역할 칸: {len(items)}개\n" + "".join(f"- {it['_where']}\n" for it in items))
    out("count", len(items))

def translate():
    job_path = os.path.join(WORK, "job.json")
    job = json.load(open(job_path))
    want = {it["id"]: it for it in job["items"]}
    exe = shutil.which("claude") or os.path.expanduser("~/.local/bin/claude")
    # 도구 없이(--tools "") 번역문만, JSON 스키마로 검증된 결과를 받음. 작업 폴더 밖(WORK)에서 실행.
    cmd = [exe, "-p", PROMPT, "--output-format", "json", "--json-schema", json.dumps(SCHEMA), "--tools", ""]
    r = subprocess.run(cmd, input=open(job_path).read(), capture_output=True, text=True, cwd=WORK, timeout=1200)
    try:
        resp = json.loads(r.stdout)
    except ValueError:
        sys.exit(f"Claude 응답을 읽지 못함 (exit {r.returncode}):\n{r.stdout[-2000:]}\n{r.stderr[-2000:]}")
    so = resp.get("structured_output")
    if not isinstance(so, dict):
        sys.exit(f"번역 결과가 없음: {str(resp.get('result'))[:2000]}")
    res, problems = {}, []
    for t in so.get("translations", []):
        i, en = t.get("id"), (t.get("en") or "").strip()
        if i not in want:
            problems.append(f"모르는 id {i}")
        elif not en:
            problems.append(f"빈 번역 {i}")
        else:
            if HANGUL.search(en):
                problems.append(f"한글이 남음 {i}: {en[:60]}")
            res[i] = en
    missing = [i for i in want if i not in res]
    json.dump(res, open(os.path.join(WORK, "result.json"), "w"), ensure_ascii=False, indent=1)
    cost = resp.get("total_cost_usd")
    summary(f"### 번역 완료: {len(res)}/{len(want)}개" + (f" (참고 추정치 ${cost:.4f})" if isinstance(cost, (int, float)) else "")
            + ("".join(f"\n- ⚠ {p}" for p in problems + [f'누락 {i}' for i in missing])))
    if not res:
        sys.exit("채울 번역이 없음")

def apply():
    res = json.load(open(os.path.join(WORK, "result.json")))
    tables, done = {}, []
    for file, k, fields, row, ko, en in pending():
        i = item_id(file, row, ko)
        if i not in res:
            continue
        if file not in tables:
            tables[file] = Table(os.path.join(ROOT, file))
            t = next(t for t in TARGETS if t["file"] == file)
            tables[file].ensure_columns([e for _, e in t["pairs"]])
        tables[file].set(k, fields, en, res[i])
        done.append((file, row.get("title", "")))
    for t in tables.values():
        t.save()
    by = {}
    for file, title in done:
        by.setdefault(file, []).append(title)
    head = f"Auto-translate to English: {len(done)} field(s)"
    body = "\n".join(f"- {os.path.basename(f)}: " + ", ".join(sorted(set(ts)))[:300] for f, ts in by.items())
    open(os.path.join(WORK, "commit_msg.txt"), "w").write(head + "\n\n" + body + "\n")
    print(head); print(body)

if __name__ == "__main__":
    {"collect": collect, "translate": translate, "apply": apply}[sys.argv[1]]()
