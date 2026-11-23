# 0011 · On-demand autonomous agent on the VM, blocked from production

- **Status:** accepted, acceptance tests still to be recorded
- **Context:** with publishing on the ARM runner, a long task no longer needs the developer PC to be on. The risk is an unattended agent reaching production or the cloud accounts.
- **Decision:** the agent is a manual-dispatch workflow on the same runner. It works on its own branch and opens a pull request to the staging branch; the workflow grants it only repository write and pull-request write, one run at a time and with a time limit. Production publishing stays behind the typed confirmation, outside its permissions and instructions, and it receives no cloud secrets. A usage guard refuses to start a run above 90% of the plan's usage window, and a daily run limit is a second brake.
- **Alternatives considered:** running the agent on the developer PC only, which depends on the PC being on.
- **Evidence:** the workflow is merged on the main branch. The acceptance checks (read-only request, pull request, refused production dispatch, daily limit, guard blocking on stale or high usage) are not recorded yet.
- **Consequences:** the VM now holds a long-lived credential for the agent, whose usage limits on a server token were not verified. Without a valid, recent usage reading the agent does not start (fail closed).
