"""
앨범 사진 모으기 스크립트
- album.csv 의 image_files / thumbnail_file 경로(예: 2026/05/ICC-scaled.jpg)를
  LIT_image 폴더에서 찾아 LIT_page/assets/img/album/ 같은 구조로 복사합니다.
- 핵심: 정확한 파일(-scaled, -rotated 등)이 없으면 원본 이름으로 자동 폴백해서 찾습니다.
  (예: ICC-scaled.jpg 가 없으면 ICC.jpg 로 시도)
- 안전장치: DRY_RUN=True 면 복사하지 않고 목록만 출력.
"""

import csv, os, re, shutil

# =============== 설정 ===============
UPLOADS_DIR = os.path.expanduser("~/Desktop/LIT_image")   # 사진 폴더
REPO_DIR    = os.path.expanduser("~/Desktop/LIT_page")     # 프로젝트(저장소)
ALBUM_CSV   = "data/album.csv"                             # 저장소 기준 album.csv 위치
DEST_SUBDIR = "assets/img/album"                           # 복사될 폴더(저장소 안)
DRY_RUN     = False  # True: 미리보기만. 확인 후 False 로 바꿔 실제 복사.
# ===================================

# 1) uploads 안 모든 파일명 -> 실제 경로 인덱스
index = {}
for root, _, files in os.walk(UPLOADS_DIR):
    for fn in files:
        index.setdefault(fn, []).append(os.path.join(root, fn))

def candidates(fname):
    """정확한 이름 우선, 없으면 -scaled / -rotated / -숫자x숫자 / -e숫자 를 뗀 원본 이름들."""
    stem, ext = os.path.splitext(fname)
    cands, s = [fname], stem
    for _ in range(4):
        new = re.sub(r'-(scaled|rotated|e\d+|\d+x\d+)$', '', s)
        if new == s:
            break
        s = new
        cands.append(s + ext)
    return cands

def find_source(rel_path):
    """rel_path 예: 2026/05/ICC-scaled.jpg -> uploads 안 실제 파일 경로(또는 None)."""
    fname = os.path.basename(rel_path)
    for cand in candidates(fname):
        if cand in index:
            if len(index[cand]) > 1:
                print(f"[중복주의] {cand} 가 {len(index[cand])}곳에 있음 -> 첫 번째 사용")
            return index[cand][0]
    return None

# 2) album.csv 읽어서 필요한 모든 이미지 경로 수집
csv_path = os.path.join(REPO_DIR, ALBUM_CSV) if not os.path.isabs(ALBUM_CSV) else ALBUM_CSV
wanted = set()
with open(csv_path, encoding="utf-8-sig") as f:
    for r in csv.DictReader(f):
        if r.get("thumbnail_file", "").strip():
            wanted.add(r["thumbnail_file"].strip())
        for p in r.get("image_files", "").split("|"):
            if p.strip():
                wanted.add(p.strip())

copied = missing = 0
for rel in sorted(wanted):
    src = find_source(rel)
    dest = os.path.join(REPO_DIR, DEST_SUBDIR, rel)
    if not src:
        print(f"[없음] {rel}")
        missing += 1
        continue
    used_fallback = "" if os.path.basename(src) == os.path.basename(rel) else f"  (원본 폴백: {os.path.basename(src)})"
    if DRY_RUN:
        print(f"[복사예정] {rel}{used_fallback}")
    else:
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        shutil.copy2(src, dest)
    copied += 1

state = "미리보기" if DRY_RUN else "완료"
print(f"\n[{state}] 대상 이미지 {len(wanted)}장 | 찾음 {copied} | 못 찾음 {missing}")
if DRY_RUN:
    print("목록이 괜찮으면 DRY_RUN 을 False 로 바꿔 다시 실행하세요.")
