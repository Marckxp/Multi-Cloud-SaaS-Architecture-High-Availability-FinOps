# 0004 · Self-hosted ARM64 CI runner (OCI A1)

- **Status:** evaluated, rollout planned
- **Context:** the Blazor WebAssembly build and the test suite consume CI minutes. An Always Free A1 VM has CPU and memory to spare.
- **Decision:** use a self-hosted GitHub Actions runner on the A1 VM (Ubuntu 24.04 aarch64) for build, tests and deploy. Android, which does not build on ARM Linux, stays on the developer PC or on Cloud Build x64.
- **Alternatives considered:** GitHub-hosted runners, which consume CI minutes on every build and test run.
- **Evidence:** on the VM, .NET 10 with wasm-tools worked (it requires libatomic1), the web publish took 45 s and 977 .NET tests passed.
- **Consequences:** CI comes at no cost. The VM needs real usage so it is not reclaimed as idle, and SSH access is restricted to a single /32.
