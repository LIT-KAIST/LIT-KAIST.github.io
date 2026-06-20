"""
사람 사진 모으기 스크립트
- people CSV의 photo_original(원본 파일명)을 연도별 uploads 폴더에서 찾아,
  CSV의 photo_path 위치로 복사(이름 정리)합니다.
- 원본을 못 찾으면 페이지에 쓰인 크기 버전(photo_filename)으로 한 번 더 시도합니다.
- 안전장치: DRY_RUN=True 면 복사하지 않고 '복사 예정' 목록만 출력.
"""

import csv, os, shutil

# =============== 설정 (이 4개만 본인 환경에 맞게) ===============

# 연도별 사진이 들어있는 uploads 폴더 (드라이브에서 받은 그 폴더)
UPLOADS_DIR = os.path.expanduser("~/Desktop/LIT_image")
REPO_DIR    = os.path.expanduser("~/Desktop/LIT_page")
CSV_FILES   = ["data/people_faculty.csv", "data/people_members.csv", "data/people_alumni.csv"]
DRY_RUN     = False
# ============================================================

# uploads 안의 모든 파일명 -> 실제 경로 인덱스 (한 번만 훑음)
index = {}
for root, _, files in os.walk(UPLOADS_DIR):
    for fn in files:
        index.setdefault(fn, []).append(os.path.join(root, fn))

copied = missing = 0
for csvf in CSV_FILES:
    with open(csvf, encoding="utf-8-sig") as f:
        for r in csv.DictReader(f):
            dest_rel = r.get("photo_path", "").strip()
            if not dest_rel:
                continue
            who = r.get("name_english") or r.get("name_korean") or "?"

            # 원본 파일명 우선, 없으면 페이지에 쓰인 크기버전으로 폴백
            src = None
            for cand in (r.get("photo_original", "").strip(),
                         r.get("photo_filename", "").strip()):
                if cand and cand in index:
                    if len(index[cand]) > 1:
                        print(f"[중복주의] {cand} 가 {len(index[cand])}곳에 있음 -> 첫 번째 사용")
                    src = index[cand][0]
                    break

            if not src:
                print(f"[없음] {who}: {r.get('photo_original','')}")
                missing += 1
                continue

            dest = os.path.join(REPO_DIR, dest_rel)
            if DRY_RUN:
                print(f"[복사예정] {os.path.basename(src)}  ->  {dest_rel}")
            else:
                os.makedirs(os.path.dirname(dest), exist_ok=True)
                shutil.copy2(src, dest)
            copied += 1

state = "미리보기" if DRY_RUN else "완료"
print(f"\n[{state}] 복사 {copied}건, 못 찾음 {missing}건")
if DRY_RUN:
    print("목록이 맞으면 DRY_RUN 을 False 로 바꿔 다시 실행하세요.")
