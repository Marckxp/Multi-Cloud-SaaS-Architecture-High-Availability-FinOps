# FinOps: zero-cost guardrails

Each file here is applied with the provider's own CLI. Values between `< >` belong to your account and are never versioned.

## Azure: deny anything that is not Free

Static Web Apps and App Service plans outside the Free tier are denied at subscription scope. A pay-as-you-go subscription does not accept a spending cap, so denying is the only guardrail that actually prevents billing.

```bash
az policy definition create --name free-sku-only-web \
  --rules "$(jq -c .properties.policyRule azure/free-sku-only-policy.json)" \
  --display-name "Free SKU only for Static Web Apps and App Service plans" --mode All
az policy assignment create --name free-sku-only-web --policy free-sku-only-web \
  --scope /subscriptions/<SUBSCRIPTION_ID>
```

To verify, validate a deployment with the Standard SKU: it must be denied. `checkPolicyRestrictions` came back empty in the tests and is not proof.

## Oracle Cloud: tenancy quota and budget

The quota zeroes the compute, compute-core, compute-memory and block-storage families and allows only the Always Free Ampere A1. The **regional** A1 count (`standard-a1-core-regional-count` and `standard-a1-memory-regional-count`) is mandatory: without it, even the free shape fails with `QuotaExceeded`.

```bash
oci limits quota create --compartment-id <TENANCY_OCID> --name free-tier-only \
  --description "Zero spend: Always Free only" \
  --statements "$(jq -R . oci/free-tier-only-quota.txt | jq -sc .)"
```

**Test in progress.** The versioned quota file is the baseline of 2 OCPUs and 12 GB. A test is under way with a larger A1 allocation (4 OCPUs and 24 GB), to find out whether it stays free; the quota applied during the test is larger than the file. The rule may change when the test ends, and then this file and the main README are updated from the facts.

The budget (`oci/budget.json`) is 1 unit of the tenancy currency per month, with an alert from 0.01 of **actual** spend: any charge sends a notice.

```bash
oci budgets budget budget create --compartment-id <TENANCY_OCID> --amount 1 --reset-period MONTHLY \
  --target-type COMPARTMENT --targets '["<TENANCY_OCID>"]' --display-name zero-spend
oci budgets budget alert-rule create --budget-id <BUDGET_OCID> --type ACTUAL \
  --threshold 0.01 --threshold-type ABSOLUTE --recipients <RESPONSIBLE_EMAIL>
```

## Google Cloud / Firebase

The Blaze plan has no spend block, only a budget alert on the billing account. Precautions to stay inside the free quota:

- do not enable phone sign-in (SMS is billed from the first message);
- use only the `(default)` Firestore database (a second database is billed from first use);
- new Cloud Storage buckets only get a free quota in US regions.

## Operational limit

Each free quota has an alert at 80%. The provider reevaluation triggers are in the main README.
