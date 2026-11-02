# 0010 · .NET SDK and workloads pinned in a version file

- **Status:** accepted
- **Context:** the WebAssembly runtime comes from the workload set (`wasm-tools`), not only from the SDK. With the `10.0.x` range in the workflow, the beta and production could ship with different runtimes.
- **Decision:** a `global.json` pins the SDK version and the workload set version, with no automatic roll-forward (`rollForward` disabled), and every CI job uses it, including the test job.
- **Alternatives considered:** the `10.0.x` range in the workflow, and pinning only the SDK. Both left the beta and production with different runtimes.
- **Evidence:** before the change, the beta shipped with runtime 10.0.14 and production, built on the PC, with 10.0.12. Pinning only the SDK was not enough: SDK 10.0.403 with the old workload still published runtime 10.0.12.
- **Consequences:** the same runtime in every environment and on the development machine. Upgrading becomes an explicit change in which the SDK and the workload move together.
