# 🚀 Multi-Cloud SaaS Architecture: High-Availability & FinOps Boilerplate

![Status](https://img.shields.io/badge/Status-Active_&_Maintained-success?style=for-the-badge)
![Architecture](https://img.shields.io/badge/Architecture-Microservices-blue?style=for-the-badge)
![Cloud](https://img.shields.io/badge/Cloud-Multi--Cloud_(OCI_+_Azure)-orange?style=for-the-badge)
![Security](https://img.shields.io/badge/Security-Zero--Trust-red?style=for-the-badge)

Este repositório contém a arquitetura base (Proof of Concept / Boilerplate) de um ecossistema SaaS distribuído. O projeto foi desenhado com foco em **Engenharia de Plataforma, Alta Resiliência, Segurança Zero-Trust e Otimização Drástica de Custos (FinOps)**.

⚠️ **Nota Técnica:** Por razões de propriedade intelectual, a lógica de negócio comercial (*core domain*) e as regras de precificação estão mantidas em repositórios privados. Este repositório público demonstra a estruturação da infraestrutura, padrões de código, esteiras de CI/CD e a topologia de microsserviços com dados simulados (*mocks*).

---

## 🏗️ Topologia da Arquitetura (Mermaid)

A arquitetura isola completamente a camada de entrega visual (Edge Computing) da camada de processamento de dados (Heavy Compute).

```mermaid
flowchart TB
 subgraph Edge["Edge Computing & WAF"]
        CF["Cloudflare CDN"]
        CFTunnel["Cloudflare Tunnel"]
  end
 subgraph Azure["Microsoft Azure - Frontend"]
        SWA["Azure Static Web Apps\nBlazor / Astro"]
  end
 subgraph OCI["Oracle Cloud Infrastructure - OCI ARM64"]
        NPM["Nginx Proxy Manager\nReverse Proxy"]
        API1["Microsserviço API 1\n.NET / Node.js"]
        API2["Microsserviço API 2\nGo / PHP"]
        DB[("PostgreSQL")]
        Cache[("Redis Cache")]
  end
    Client(["Usuários / Clientes"]) -- Tráfego Estático & UI --> SWA
    Client -- Tráfego Dinâmico HTTPS --> CF
    CF -- Conexão Reversa Segura --> CFTunnel
    CFTunnel --> NPM
    NPM --> API1 & API2
    API1 --> DB & Cache
    API2 --> DB
    Admin(["Equipe de Engenharia"]) -- Túnel VPN Criptografado --> Tailscale["Tailscale Node"]
    Tailscale -- SSH / Manutenção --> OCI

     CF:::cloudflare
     CFTunnel:::cloudflare
     SWA:::azure
     NPM:::oracle
     API1:::oracle
     API2:::oracle
     DB:::oracle
     Cache:::oracle
     OCI:::oracle
    classDef azure fill:#0072C6,stroke:#fff,stroke-width:2px,color:#fff
    classDef oracle fill:#F80000,stroke:#fff,stroke-width:2px,color:#fff
    classDef cloudflare fill:#F38020,stroke:#fff,stroke-width:2px,color:#fff
    style OCI fill:#75c1ff
    style Azure fill:#75c1ff
    style Edge stroke:#000000,fill:#75c1ff
