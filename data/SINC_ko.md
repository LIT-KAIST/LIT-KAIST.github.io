# 학습 기반 CSI feedback 경량화 기술 개발
*(Development of Learning-Based CSI Feedback Lightweighting Technology)*

## 연구원


## 지원기관 및 기간
삼성전자(Samsung Electronics) · 2026. 07 ~ 2027. 04

## Motivation
Massive MIMO에서 CSI feedback은 빔포밍·프리코딩 성능을 좌우하는 핵심 기능이지만, 시스템 규모가 커질수록 단말(UE)이 기지국(BS)으로 보내야 하는 피드백 데이터가 급격히 증가한다. 이를 줄이기 위해 딥러닝 기반 학습형 압축(autoencoder)이 연구돼 왔으나, 모든 채널 요소를 동일한 가중치로 압축하는 방식은 피드백 budget이 극도로 제한된 환경에서 지배적(dominant) 성분까지 손실되어 복원 성능이 무너진다. 한편 angular-delay 도메인의 CSI는 에너지가 소수 token에 집중된 **희소(sparse) 구조**(1024개 token 중 약 1.86~5.57%에 90% 이상의 에너지 집중)를 가진다. 본 연구는 이 특성을 활용하여, 에너지가 큰 **raw anchor token**은 압축 없이 원형 그대로 전송하고 나머지 잔여 영역만 BS 측 complement decoder가 복원하는 **raw–압축 혼합 비대칭 프레임워크**를 제안한다. 이를 통해 UE의 인코딩 연산 부담을 최소화하면서도 극저 피드백 budget에서 CSI를 정확히 복원한다.

## Keyword
- **중심 키워드:** CSI feedback, Massive MIMO, 학습 기반 경량화(저복잡도), Angular-delay sparsity, Raw anchor + Complement decoder, 극저 feedback budget, 비대칭 Autoencoder

## 핵심 목표
**최종 목표 —** 효율적인 CSI 획득을 위한 **학습 기반 CSI feedback 저복잡도화(경량화) 기술 개발** — 단말(UE)의 인코딩 연산 부담을 극소화하고, 극저 피드백 budget 제약에서도 CSI를 정확히 복원
- Angular-delay CSI의 희소성을 활용한 dominant raw anchor 우선 전송
- UE 경량 인코딩 + BS complement decoder 비대칭 구조 설계
- 극저 budget 동작점에서 학습형 압축 대비 우세 영역 규명 및 설계 가이드라인 도출
- **결과물:** 학습 기반 CSI feedback 경량화 시뮬레이터(S/W), 특허 제안 1건

## 핵심 기술 (단계별)
- **① Angular-delay CSI 통계 분석 및 기준 모델 구축 (계약~2026.08):** CsiNet/COST 2100 benchmark의 angular-delay 표현에 대한 에너지 분포·top-K 누적 에너지 분석, 대표 baseline(CsiNet·CRNet·CsiNet+·CLNet·TransNet) 재현, 학습형 latent 압축이 무너지는 budget 영역 규명
- **② Raw anchor 선택 메커니즘 및 packet 모델 설계 (2026.08~10):** energy 기반 importance score와 학습형 saliency score로 dominant token 선택, raw 좌표값+위치 index를 담는 packet 구조 설계, Top-K only baseline 구현 및 극저 budget 회복 범위 분석
- **③ Mixed raw-and-compressed 프레임워크 설계·학습 (2026.10~2027.01):** UE는 dominant token을 raw로, 잔여 영역은 BS의 cross-attention complement decoder가 복원하는 비대칭 구조, raw anchor 개수와 압축률 사이 trade-off를 budget별로 자동 조절하는 학습 전략
- **④ 다중 지표 성능 검증 및 일반화 평가 (2027.01~04):** NMSE 외 다중 지표 재평가, indoor/outdoor·안테나 수·downlink SNR sweep으로 채널 통계 변화에서의 일관된 이득 확인, raw 보존 우세 영역과 baseline 우세 영역 구분 및 실시스템 설계 가이드라인 정리
