# 0008 · Cada publicação é conferida como um cliente a veria

- **Estado:** aceita
- **Contexto:** a primeira visita à Web publicada não revela defeitos de cache do service worker, e cada borda (Cloudflare e Azure) se comporta um pouco diferente.
- **Decisão:** depois de cada publicação, um script abre a Web num navegador limpo e confere os cabeçalhos de segurança, o tipo do wasm, o ambiente (produção ou beta), o login, a primeira e a segunda visita, o cache do service worker, uma rota interna e a abertura sem rede. Se algo falhar, a publicação é dada como quebrada.
- **Evidência:** a verificação pegou dois defeitos que a primeira visita escondia. Na Cloudflare, o redirecionamento 307 de `/index.html` quebrava o service worker. No Azure, um 404 no manifesto derrubava a instalação. Depois da correção (tratamento de HTML desligado no Worker e service worker que recusa resposta redirecionada), a verificação da produção passou nos 20 itens.
- **Consequências:** a publicação só termina depois da verificação. O ponta a ponta ganhou os casos de service worker com redirecionamento simulado da borda e de abertura sem rede.
