# 0001 · Offline-first, sem servidor de aplicação

- **Estado:** aceita
- **Contexto:** o app é usado em lugares com rede instável. Um servidor próprio custa e precisa de manutenção antes de existir receita.
- **Decisão:** o aparelho é a fonte da verdade (SQLite por perfil). Toda gravação entra numa outbox na mesma transação. A nuvem fica com identidade, arquivos estáticos e, depois, com a sincronização. O backup em arquivo protege os dados até a sincronização existir.
- **Consequências:** o app funciona sem rede e sem custo de servidor. O preço é ter de resolver conflitos no recebimento entre aparelhos (etapa planejada) e ter de manter um único núcleo .NET compilado para o app nativo e para o WebAssembly.
