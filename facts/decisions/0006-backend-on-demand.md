# 0006 · Backend only with measured demand

- **Status:** accepted
- **Context:** the original topology of this showcase called for containerized APIs on OCI, behind a Cloudflare Tunnel and with access over Tailscale.
- **Decision:** that topology stays on the roadmap as planned. The first server is minimal (sign out of all devices and delete an account) and runs as cloud functions inside the no-cost quota, which is what shipped; a .NET service on the ARM VM stays an option. Anything larger enters only if the estimated client count justifies it and if performance is equal or better.
- **Alternatives considered:** building the original topology now, before there is measured demand for it.
- **Consequences:** no capacity claim (RPS, SLA) appears in the showcase before there is a measurement. The functions are republished from the main branch and checked against the running source, because the deploy date alone does not say whether a function is behind the code.
