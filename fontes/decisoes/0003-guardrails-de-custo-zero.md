# 0003 · Proteções de custo zero como código, por nuvem

- **Estado:** aceita
- **Contexto:** as contas são pagas por uso. Azure e Google não aceitam teto de gasto, e a Oracle reduziu o Always Free do A1 em 2026.
- **Decisão:** cada nuvem tem uma proteção que **bloqueia** o que for pago, onde o provedor permite: Azure Policy que nega SKU que não seja Free; na OCI, cota de tenancy que zera tudo menos o A1 gratuito. Além disso, há orçamento com alerta a partir do primeiro centavo onde houver. Cada nuvem também tem um arquivo de cotas gratuitas conferido com a fonte oficial, com limite operacional de 80%.
- **Consequências:** um erro de configuração é negado em vez de cobrado. A cota da OCI precisa da contagem regional do A1; sem ela, até a forma gratuita falha com QuotaExceeded.
