# Token-Based Near-Field and Distributed ISAC Technologies for AI-Native 6G Networks


![token](assets/img/projects/token.png)

## Researchers


## Funding Agency & Period
National Research Foundation of Korea (NRF) · 2026 ~ 2030

## Motivation
6G, expected to be commercialized around 2030, goes beyond Tbps data rates and microsecond-level latency toward a **Network-as-Sensor** paradigm—where network nodes perceive their surroundings in real time—and an **AI-Native RAN** in which large AI models, robots, and autonomous vehicles interact. Conventional far-field and monostatic ISAC is limited by planar-wave-based spatial/range resolution, Non-LoS shadowing, and self-interference, making **XL-MIMO-based near-field and distributed ISAC** essential. However, the explosive complexity arising from the growing number of nodes and the integration of communication and sensing makes real-time control infeasible with conventional model-based methods; this is addressed through **AI-based joint channel estimation and beamforming and distributed reinforcement learning**. Furthermore, to overcome the bottleneck of transmitting massive multimodal sensing data as raw bits, the project proposes a **token-communication-based multimodal ISAC framework** that converts and exchanges radar, LiDAR, camera, and communication data as a common representation unit—the **token**. This enables interoperability among heterogeneous AI models and unifies token-level resource scheduling, beamforming, and retransmission within a single coherent layer.

## Keyword
- **Core keywords:** Token communication, Near-field ISAC, Distributed ISAC, AI-Native 6G RAN, Multimodal ISAC, XL-MIMO, Token-based KPIs (TTFT, token throughput)

## Core Objectives
**Final goal —** Realize an **AI-Native 6G RAN** achieving **high reliability, low latency, and high token-based KPI performance** through the design of a multimodal token-communication and AI-based near-field/distributed ISAC PHY system

**Target performance metrics**
- Communication & sensing: 1.5× data rate vs. 5G, cm-level range and 0.1°-level angle estimation accuracy
- Multimodal token communication: 95% inference accuracy for channel estimation and beamforming, TTFT reduced by 50% vs. 5G, 2× token throughput
- Establishment of an energy-efficiency KPI for the integrated multimodal token-based ISAC system

**Target outcomes —** 5 SCI papers, 10 international conference papers, 10 patent applications and 3 registrations, 15 software registrations

## Core Technologies (by year)
- **Year 1 (2026) — System modeling & tokenization:** modeling of the AI-Native 6G RAN and definition of integrated-efficiency metrics (data rate / sensing accuracy / computational-efficiency trade-off), exploration of AI-based PHY candidate technologies and construction of a near-field/distributed ISAC channel dataset, and definition of Radar/LiDAR/Comm-to-token multimodal tokenization and token-based KPIs (TTFT, inter-token delay, token throughput)
- **Year 2 (2027) — Near-field ISAC elements + P2P token communication:** model-based deep learning for low-complexity near-field channel estimation, AI-based depth-domain multiplexing beamformer design and single-target sensing, and design of a P2P token-communication structure for single-modality tokens with E2E latency analysis and verification
- **Year 3 (2028) — Distributed cooperative ISAC + topology scaling:** virtual large-aperture array via distributed-node cooperation, multistatic sensing fusion and multi-target estimation (with transfer/meta-learning adaptation), and definition of a multi-node ISAC token-communication network with a scalable token-exchange structure
- **Year 4 (2029) — Multimodal token–ISAC integration:** design of a multimodal token-communication layer for AI models within the near-field/distributed ISAC PHY, and derivation of cross-layer design guidelines between the token layer and the ISAC PHY (jointly improving token KPIs and ISAC metrics)
- **Year 5 (2030) — Context-aware service application & autonomous operation:** E2E system simulation and performance evaluation for context-aware services such as intelligent transportation and autonomous driving, and proposal of network-design and resource-operation guidelines jointly considering token QoS and RAN/ISAC KPIs
