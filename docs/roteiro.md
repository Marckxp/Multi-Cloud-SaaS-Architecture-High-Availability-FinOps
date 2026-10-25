# Roteiro: topologia de backend planejada

Esta foi a topologia original desta vitrine. Ela fica **planejada** e só entra quando houver um backend com carga medida ([ADR 0006](adr/0006-backend-sob-demanda.md)). Até lá, nenhuma afirmação de capacidade (RPS, SLA) é feita.

```mermaid
flowchart TB
  subgraph Edge["Borda (Cloudflare)"]
    CF["CDN e WAF"]
    CFTunnel["Cloudflare Tunnel"]
  end
  subgraph OCI["Oracle Cloud: Ampere A1 ARM64"]
    NPM["Proxy reverso"]
    API1["API .NET"]
    API2["API secundária"]
    DB[("PostgreSQL")]
    Cache[("Redis")]
  end
  Client(["Clientes"]) -- HTTPS --> CF
  CF -- conexão reversa, sem IP público --> CFTunnel --> NPM
  NPM --> API1 & API2
  API1 --> DB & Cache
  API2 --> DB
  Admin(["Engenharia"]) -- VPN mesh --> Tailscale["Tailscale"] -- SSH --> OCI
  classDef planejado fill:#f6f8fa,color:#24292f,stroke:#8c959f,stroke-dasharray:4 3
  class CF,CFTunnel,NPM,API1,API2,DB,Cache,Tailscale planejado
```

## Condições para entrar

- **Capacidade:** o A1 gratuito caiu para 2 OCPU e 12 GB em 2026 (há um teste em andamento para saber se contas pagas mantêm 4 e 24). A carga suportada será medida com teste de carga antes de qualquer número ir para o README.
- **Acesso:** hoje o acesso à VM é por SSH com chave dedicada, liberado só para um /32. O Tailscale substitui essa regra quando houver mais de um operador.
- **Sem IP público:** o Cloudflare Tunnel entra junto com a primeira API exposta.
- **Dados:** PostgreSQL e Redis só se o servidor mínimo (funções de nuvem ou .NET na VM) não bastar.
