# AGENTS.md

Instruções para agentes de código (Gemini CLI, Claude Code e outros) que trabalham nesta vitrine.

## O que é este repositório

É a vitrine pública da arquitetura de um SaaS cujo código é privado. Aqui ficam só a topologia, as proteções de custo, as decisões e a estratégia de testes, sempre extraídas de fatos saneados. **Não é o produto e nunca pode revelar o produto.**

## Regra principal

**A única entrada são `fontes/estado.json` e `fontes/decisoes/`.** Nenhuma afirmação, número, serviço, estado ou nome entra na vitrine se não estiver nesses arquivos. Na dúvida, deixe de fora e cite a dúvida na descrição do PR.

## Como a vitrine é atualizada

O projeto privado abre um PR `fatos/*` com a etiqueta `fatos-vitrine`. Ele traz as fontes, os blocos de dados do README e os ADRs, gerados por `ferramentas/gerar-readme.mjs` e `ferramentas/gerar-adrs.mjs`. O ciclo automático termina no merge desse PR: nenhum workflow aciona agente nem abre issue.

## Tarefa sob pedido: atualizar o texto livre a partir das fontes

Roda só quando alguém pede, num branch `texto/<assunto>`. O `ferramentas/escrever-texto.mjs` escreve o texto com um modelo quando `ESCRITOR_URL`, `ESCRITOR_MODELO` e `ESCRITOR_CHAVE` estão definidos; sem eles, encerra sem alterar nada.

1. Leia `fontes/estado.json`, `fontes/decisoes/*.md` e o que mudou nas fontes no último commit da `main` (`git log -1 -p -- fontes/`).
2. Valide as fontes: `node ferramentas/verificar-fontes.mjs`. Se falhar, **pare** e avise quem pediu; não conserte as fontes.
3. Regenere os blocos de dados do README: `node ferramentas/gerar-readme.mjs`. Nunca escreva à mão o conteúdo entre `<!-- gerado:X:inicio -->` e `<!-- gerado:X:fim -->`.
4. Leia o `README.md` e o `docs/roteiro.md` **inteiros** e atualize o texto livre (fora dos marcadores) onde ele contradiz as fontes, inclusive em frases que você não ia mexer: o revisor reprova texto antigo desatualizado (critério 8). Mantenha o título, a seção "Autor" e o tom: frases curtas, sem marketing, sem números que não estejam nas fontes.
5. Regenere os ADRs: `node ferramentas/gerar-adrs.mjs`. Nunca escreva à mão em `docs/adr/`: o CI compara a pasta com `fontes/decisoes/`. Um ADR nunca é apagado; uma decisão retirada vira "Estado: substituída" nas fontes.
6. Se uma proteção de `nuvens[].protecoes[]` apontar um `arquivo` em `finops/`, confira se o arquivo existe e se a descrição em `finops/README.md` bate com ele. Use `<MARCADOR>` para qualquer valor de conta.
7. Se o `roteiro` mudar, atualize `docs/roteiro.md` só nas condições; a topologia original continua lá, marcada como planejada.
8. Rode, nesta ordem, e só abra o PR se os quatro passarem:
   - `node ferramentas/verificar-fontes.mjs`
   - `node ferramentas/gerar-readme.mjs --verificar`
   - `node ferramentas/gerar-adrs.mjs --verificar`
   - `node ferramentas/verificar-vazamento.mjs`
9. Abra **um** PR com o título `vitrine: atualização a partir das fontes de AAAA-MM-DD` (a data é `geradoEm`). Na descrição, liste o que mudou por seção e o que ficou de fora, com o motivo.

## Revisão automática e merge

Um PR de um branch `texto/*` passa pelo check `revisao`, além de `verificar` e do Sonar. Ele não tem merge automático: quem faz o merge é uma pessoa.

- O check `revisao` junta as regras determinísticas (`ferramentas/revisar-texto.mjs`), o quality gate do SonarQube Cloud e uma revisão semântica (`.github/revisor/instrucoes.md`). Leia as regras e as instruções antes de começar: são os critérios do seu PR. Um achado do Sonar se corrige no código, nunca desativando a regra.
- **Se `revisao` falhar**, o motivo está no comentário "Revisor: reprovado" do PR. Corrija só o que está listado, no mesmo PR, e rode de novo os verificadores do passo 8.
- Depois de 3 reprovações, ou se o próprio revisor falhar, o PR ganha a etiqueta `precisa-humano` e o merge automático é desligado. A partir daí, **não altere o PR**.

## Nunca

- Alterar `fontes/`, `ferramentas/`, `.github/` ou este arquivo numa tarefa de atualização. Esses arquivos mudam só por PR humano ou pelo pacote `fatos-vitrine`.
- Escrever identificadores de conta (GUID, OCID, conta de faturamento, ID de projeto), hostnames gerados por provedor (`*.workers.dev`, `*.azurestaticapps.net`, `*.run.app`, `*.web.app`…), IPs públicos, e-mails, caminhos de usuário ou chaves. O CI bloqueia, mas o branch já é público antes do CI.
- Inferir ou citar o domínio de negócio do produto: setor, público, funcionalidades, telas, preços ou planos. A vitrine fala de arquitetura, não do produto.
- Inventar capacidade (RPS, SLA, usuários simultâneos) ou trocar o estado de um componente (por exemplo, `planejado` para `publicado`).
- Copiar código de qualquer outro repositório. O conteúdo daqui é Apache 2.0.

## Ambiente

- Basta Node.js 24 ou superior; os scripts de `ferramentas/` não têm dependências. Não há `npm install`.
- Idioma: português do Brasil.
- Finais de linha: LF.

## Estrutura

| Caminho | Conteúdo |
|---|---|
| `fontes/` | Entrada saneada: `estado.json` (validado por `estado.schema.json`) e `decisoes/` |
| `docs/adr/` | ADRs, gerados a partir de `fontes/decisoes/` |
| `docs/roteiro.md` | Topologia de backend planejada e condições para entrar |
| `finops/` | Proteções de custo zero por nuvem, aplicáveis com os CLIs |
| `ferramentas/` | Validador das fontes, geradores do README e dos ADRs, verificador de vazamento, regras do texto livre e escritor por API |
| `.github/workflows/` | CI de vazamento, revisor e merge automático |
