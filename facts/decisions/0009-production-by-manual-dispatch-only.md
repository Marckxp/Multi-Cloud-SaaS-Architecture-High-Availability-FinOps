# 0009 · Production ships only by manual dispatch, after a green beta

- **Status:** accepted
- **Context:** with automatic publishing on every push to the main branch, a commit that never went through the beta environment could reach production, and re-running or rolling back an execution took a single click.
- **Decision:** the beta is still published on every push to the staging branch. Production ships only by manual dispatch of the workflow, with a typed confirmation, and a gate in the test job refuses the dispatch if there is no green beta or if there are commits (other than PR merges) that did not go through it. Publishing, re-running an execution and rolling back all require confirmation.
- **Alternatives considered:** automatic publishing on every push to the main branch, which lets a commit that skipped the beta reach production.
- **Evidence:** the gate was exercised in 8 cases against a real history, with a simulated `gh`, and then on Actions, in a real production release.
- **Consequences:** production stops being a side effect of a merge. The cost is one manual step per release, and the gate depends on the latest green beta being the right commit.
