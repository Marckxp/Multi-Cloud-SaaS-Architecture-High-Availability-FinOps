# 0004 · Self-hosted ARM64 CI runner (OCI A1)

- **Status:** accepted, in use for beta and production publishing
- **Context:** the Blazor WebAssembly build and the test suite consume CI minutes, and publishing depended on a developer PC or on hosted runners. An Always Free A1 VM has CPU and memory to spare.
- **Decision:** use a self-hosted GitHub Actions runner on the A1 VM (Ubuntu 24.04 aarch64) to publish the beta and production. A repository variable chooses the runner, so a return to hosted runners takes seconds. The runner serves only push and manual-dispatch runs of the staging and main branches, never pull requests, so code from a PR cannot read the deploy secrets. Android, which does not build on ARM Linux, stays on hosted runners.
- **Alternatives considered:** GitHub-hosted runners, which consume CI minutes on every build and test run.
- **Evidence:** on the VM, .NET 10 with wasm-tools worked (it requires libatomic1), the web publish took 45 s and 977 .NET tests passed. Four consecutive beta runs on the runner were green, with the publish job at 1 min 55 s to 3 min 12 s against 3 min 15 s hosted. Production was then published by the runner with the post-publish verification at 21 of 21 items, after a rollback to the previous Worker version was rehearsed in both directions.
- **Consequences:** CI comes at no cost. The VM needs real usage so it is not reclaimed as idle, and SSH access is restricted to a single /32; the runner only opens outbound connections. The VM is a single point of failure, mitigated by the runner switch and by the rollback.
