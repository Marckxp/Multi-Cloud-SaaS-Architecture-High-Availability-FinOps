# 0003 · Zero-cost guardrails as code, per cloud

- **Status:** accepted
- **Context:** the accounts are pay-as-you-go. Azure and Google do not accept a spending cap, and Oracle reduced the A1 Always Free allowance in 2026.
- **Decision:** each cloud has a guardrail that **blocks** anything paid, where the provider allows it: an Azure Policy that denies any SKU that is not Free; on OCI, a tenancy quota that zeroes everything except the free A1. On top of that, there is a budget with an alert from the first cent where available. Each cloud also has a free-tier quota file checked against the official source, with an operational limit of 80%.
- **Alternatives considered:** a spending cap, which Azure and Google do not accept on these accounts. Where nothing can block spend (Google), the guardrail is a budget alert.
- **Consequences:** a misconfiguration is denied instead of billed. The OCI quota needs the A1 regional count; without it, even the free shape fails with QuotaExceeded.
