# Development of Learning-Based CSI Feedback Lightweighting Technology

## Researchers


## Funding Agency & Period
Samsung Electronics · Jul 2026 ~ Apr 2027

## Motivation
In massive MIMO, CSI feedback is a core function that determines beamforming and precoding performance, but the amount of feedback data a user equipment (UE) must send to the base station (BS) grows rapidly as the system scales. Deep-learning-based learned compression (autoencoders) has been studied to reduce this; however, compressing all channel components with equal weight causes even dominant components to be lost under severely limited feedback budgets, collapsing reconstruction quality. Meanwhile, CSI in the angular-delay domain has a **sparse structure** in which energy concentrates on a few tokens (over 90% of the energy lies within roughly 1.86–5.57% of the 1024 tokens). This project exploits that property by transmitting high-energy **raw anchor tokens** as-is, without compression, while only the remaining residual region is reconstructed by a complement decoder at the BS—a **mixed raw-and-compressed asymmetric framework**. This minimizes the UE's encoding burden while accurately recovering CSI even under ultra-low feedback budgets.

## Keyword
- **Core keywords:** CSI feedback, massive MIMO, learning-based lightweighting (low complexity), angular-delay sparsity, raw anchor + complement decoder, ultra-low feedback budget, asymmetric autoencoder

## Core Objectives
**Final goal —** Develop **learning-based low-complexity (lightweight) CSI feedback technology** for efficient CSI acquisition—minimizing the UE's encoding computation while accurately reconstructing CSI even under ultra-low feedback-budget constraints
- Priority transmission of dominant raw anchors exploiting angular-delay CSI sparsity
- Design of an asymmetric structure: lightweight UE encoding + BS complement decoder
- Identification of the regime where raw preservation outperforms learned compression, and derivation of design guidelines
- **Deliverables:** a learning-based lightweight CSI feedback simulator (S/W) and one patent proposal

## Core Technologies (by phase)
- **① Angular-delay CSI statistical analysis & baseline modeling (contract–Aug 2026):** energy-distribution and top-K cumulative-energy analysis of the angular-delay representation in the CsiNet/COST 2100 benchmark, reproduction of representative baselines (CsiNet, CRNet, CsiNet+, CLNet, TransNet), and identification of the budget regime where learned latent compression collapses
- **② Raw anchor selection mechanism & packet model design (Aug–Oct 2026):** dominant-token selection via an energy-based importance score combined with a learnable saliency score, design of a packet structure carrying raw coordinate values and position indices, and a Top-K-only baseline to analyze the recovery range under ultra-low budgets
- **③ Mixed raw-and-compressed framework design & training (Oct 2026–Jan 2027):** an asymmetric structure in which the UE sends dominant tokens as raw values while a BS-side cross-attention complement decoder fills in the residual region, with a training strategy that automatically adjusts the trade-off between the number of raw anchors and the compression ratio per budget
- **④ Multi-metric performance validation & generalization (Jan–Apr 2027):** re-evaluation beyond NMSE using multiple metrics, sweeping indoor/outdoor scenarios, antenna counts, and downlink SNR to confirm consistent gains under channel-statistic variation, and delineating the regimes where raw preservation versus baselines prevail, with practical design guidelines
