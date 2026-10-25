# 0007 · Ponta a ponta em três alvos: Web, Windows e Android

- **Estado:** aceita
- **Contexto:** as mesmas telas Razor rodam no navegador e em WebViews nativas, com diferenças de layout e de plataforma.
- **Decisão:** Playwright na Web em três larguras; no app Windows, pelo CDP do WebView2, com pasta de dados própria; no Android real pelo USB, uma auditoria de layout (rolagem, elementos fora da tela, alvos de toque abaixo de 40 px), sempre com backup dos dados antes.
- **Consequências:** um só conjunto de specs cobre três alvos. Rodar por largura e um alvo por vez cabe numa máquina com pouca memória.
