# FinOps: proteções de custo zero

Cada arquivo aqui é aplicado com o CLI do próprio provedor. Os valores entre `< >` são da sua conta e nunca são versionados.

## Azure: negar o que não for Free

Static Web Apps e planos do App Service fora do Free são negados no escopo da assinatura. Uma assinatura paga por uso não aceita teto de gasto, então negar é a única proteção que de fato impede a cobrança.

```bash
az policy definition create --name somente-sku-free-web \
  --rules "$(jq -c .properties.policyRule azure/politica-somente-free.json)" \
  --display-name "Somente SKU Free para Static Web Apps e planos do App Service" --mode All
az policy assignment create --name somente-sku-free-web --policy somente-sku-free-web \
  --scope /subscriptions/<ID_DA_ASSINATURA>
```

Para conferir, valide uma implantação com SKU Standard: ela tem de ser negada. O `checkPolicyRestrictions` voltou vazio nos testes e não serve como prova.

## Oracle Cloud: cota de tenancy e orçamento

A cota zera as famílias compute, compute-core, compute-memory e block-storage e libera só o Ampere A1 do Always Free. A contagem **regional** do A1 (`standard-a1-core-regional-count` e `standard-a1-memory-regional-count`) é obrigatória: sem ela, até a forma gratuita falha com `QuotaExceeded`.

```bash
oci limits quota create --compartment-id <OCID_DA_TENANCY> --name somente-gratuito \
  --description "Gasto zero: só o Always Free" \
  --statements "$(jq -R . oci/cota-somente-gratuito.txt | jq -sc .)"
```

O orçamento (`oci/orcamento.json`) é de 1 por mês, com alerta a partir de 0,01 de gasto **real**: qualquer cobrança avisa.

```bash
oci budgets budget budget create --compartment-id <OCID_DA_TENANCY> --amount 1 --reset-period MONTHLY \
  --target-type COMPARTMENT --targets '["<OCID_DA_TENANCY>"]' --display-name gasto-zero
oci budgets budget alert-rule create --budget-id <OCID_DO_ORCAMENTO> --type ACTUAL \
  --threshold 0.01 --threshold-type ABSOLUTE --recipients <E-MAIL_DO_RESPONSAVEL>
```

## Google Cloud / Firebase

No plano Blaze não existe bloqueio de gasto, só alerta de orçamento na conta de faturamento. Cuidados para ficar na cota sem custo:

- não habilitar o login por telefone (o SMS é cobrado desde o primeiro);
- usar só o banco `(default)` do Firestore (um segundo banco é cobrado desde o primeiro uso);
- buckets novos do Cloud Storage só têm cota gratuita nas regiões dos EUA.

## Limite operacional

Cada cota gratuita tem alerta em 80%. Os gatilhos de reavaliação de provedor estão no README principal.
