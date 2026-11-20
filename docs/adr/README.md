# Architecture decision records

Generated from `facts/decisions/`; never edited by hand. Each record has the context, the decision, the alternatives considered where the source has them, the evidence and the consequences.

| ADR | Decision | Status |
|---|---|---|
| [0001](0001-offline-first-no-server.md) | Offline-first, no application server | accepted |
| [0002](0002-static-hosting-on-cloudflare.md) | Web app on Cloudflare static assets, Azure as beta and fallback | accepted |
| [0003](0003-zero-cost-guardrails.md) | Zero-cost guardrails as code, per cloud | accepted |
| [0004](0004-arm-runner-for-ci.md) | Self-hosted ARM64 CI runner (OCI A1) | evaluated, rollout planned |
| [0005](0005-aws-and-alibaba-rejected.md) | AWS and Alibaba Cloud rejected for now | accepted, with a reevaluation trigger |
| [0006](0006-backend-on-demand.md) | Backend only with measured demand | accepted |
| [0007](0007-end-to-end-tests-on-three-targets.md) | End-to-end on three targets: Web, Windows and Android | accepted |
| [0008](0008-post-publish-verification.md) | Every release is checked the way a client would see it | accepted |
| [0009](0009-production-by-manual-dispatch-only.md) | Production ships only by manual dispatch, after a green beta | accepted |
| [0010](0010-pinned-sdk-and-workloads.md) | .NET SDK and workloads pinned in a version file | accepted |
