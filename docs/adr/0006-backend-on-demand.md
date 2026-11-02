# 0006 · Backend only with measured demand

- **Status:** accepted
- **Context:** the original topology of this showcase called for containerized APIs on OCI, behind a Cloudflare Tunnel and with access over Tailscale.
- **Decision:** that topology stays on the roadmap as planned. The first server will be minimal (sign out of all devices and delete an account), as cloud functions or as .NET on the ARM VM. It enters only if the estimated client count justifies it and if performance is equal or better.
- **Alternatives considered:** building the original topology now, before there is measured demand for it.
- **Consequences:** no capacity claim (RPS, SLA) appears in the showcase before there is a measurement.
