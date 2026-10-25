# 0006 · Backend só com demanda medida

- **Estado:** aceita
- **Contexto:** a topologia original desta vitrine previa APIs em contêineres na OCI, atrás de Cloudflare Tunnel e com acesso por Tailscale.
- **Decisão:** essa topologia fica no roteiro como planejada. O primeiro servidor será mínimo (encerrar sessões e excluir conta), em funções de nuvem ou em .NET na VM ARM. Entra só se a estimativa de clientes justificar e se o desempenho for igual ou melhor.
- **Consequências:** nenhuma afirmação de capacidade (RPS, SLA) aparece na vitrine antes de haver medição.
