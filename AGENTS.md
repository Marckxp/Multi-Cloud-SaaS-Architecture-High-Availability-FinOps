# AGENTS.md

Instruções para agentes de código (Jules, Gemini CLI, Claude Code e outros) que trabalham nesta vitrine.

## O que é este repositório

É a vitrine pública da arquitetura de um SaaS cujo código é privado. Aqui ficam só a topologia, as proteções de custo, as decisões e a estratégia de testes, sempre extraídas de fatos saneados. **Não é o produto e nunca pode revelar o produto.**

## Regra principal

**A única entrada são `fontes/estado.json` e `fontes/decisoes/`.** Nenhuma afirmação, número, serviço, estado ou nome entra na vitrine se não estiver nesses arquivos. Na dúvida, deixe de fora e cite a dúvida na descrição do PR.

## Tarefa padrão: atualizar a vitrine a partir das fontes

Ela é acionada por uma issue com a etiqueta `jules`, criada (em nome do dono do repositório) quando um PR `fatos-vitrine` é aceito.

1. Leia `fontes/estado.json`, `fontes/decisoes/*.md` e o que mudou nas fontes no último commit da `main` (`git log -1 -p -- fontes/`).
2. Valide as fontes: `node ferramentas/verificar-fontes.mjs`. Se falhar, **pare** e relate na issue; não conserte as fontes.
3. Regenere os blocos de dados do README: `node ferramentas/gerar-readme.mjs`. Nunca escreva à mão o conteúdo entre `<!-- gerado:X:inicio -->` e `<!-- gerado:X:fim -->`.
4. Atualize o texto livre do `README.md` (fora dos marcadores) só onde ele contradiz as fontes. Mantenha o título, a seção "Autor" e o tom: frases curtas, sem marketing, sem números que não estejam nas fontes.
5. Para cada arquivo de `fontes/decisoes/` novo ou alterado, crie ou atualize o ADR de mesmo nome em `docs/adr/`. O formato é: título com o número, **Estado**, **Contexto**, **Decisão**, **Consequências** e, se houver, **Evidência** e **Gatilhos**. Uma decisão removida das fontes vira ADR com "Estado: substituída", nunca é apagada.
6. Se uma proteção de `nuvens[].protecoes[]` apontar um `arquivo` em `finops/`, confira se o arquivo existe e se a descrição em `finops/README.md` bate com ele. Use `<MARCADOR>` para qualquer valor de conta.
7. Se o `roteiro` mudar, atualize `docs/roteiro.md` só nas condições; a topologia original continua lá, marcada como planejada.
8. Rode, nesta ordem, e só abra o PR se os três passarem:
   - `node ferramentas/verificar-fontes.mjs`
   - `node ferramentas/gerar-readme.mjs --verificar`
   - `node ferramentas/verificar-vazamento.mjs`
9. Abra **um** PR com o título `vitrine: atualização a partir das fontes de AAAA-MM-DD` (a data é `geradoEm`). Na descrição, liste o que mudou por seção e o que ficou de fora, com o motivo.

## Revisão automática e merge

Um PR de um branch `jules-*` não passa por revisão humana. Ele entra sozinho na `main` quando os checks `verificar` e `revisao` passam.

- O check `revisao` junta as regras determinísticas (`ferramentas/revisar-pr-jules.mjs`) com uma revisão semântica (`.github/revisor/instrucoes.md`). Leia os dois antes de começar: são os critérios do seu PR.
- **Se `revisao` falhar**, o motivo está no comentário "Revisor: reprovado" do PR. Corrija só o que está listado, no mesmo PR, e rode de novo os três verificadores do passo 8.
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
| `ferramentas/` | Validador das fontes, gerador do README, verificador de vazamento |
| `.github/workflows/` | CI de vazamento e o acionamento do Jules |
