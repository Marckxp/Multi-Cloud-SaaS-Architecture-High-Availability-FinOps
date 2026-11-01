# 0009 · A produção só sai por disparo manual, depois de um beta verde

- **Estado:** aceita
- **Contexto:** com publicação automática a cada push na branch principal, um commit que nunca passou pelo ambiente beta podia chegar à produção, e repetir ou voltar uma execução bastava um clique.
- **Decisão:** o beta continua sendo publicado a cada push na branch de homologação. A produção só sai por disparo manual do workflow, com a confirmação digitada, e um portão no job de testes recusa o disparo se não houver um beta verde ou se houver commits (fora os merges de PR) que não passaram por ele. Publicar, repetir uma execução e voltar uma versão pedem confirmação.
- **Evidência:** o portão foi exercitado em 8 casos sobre um histórico real, com o `gh` simulado, e depois no Actions, numa publicação real de produção.
- **Consequências:** a produção deixa de ser efeito colateral de um merge. O custo é um passo manual a cada publicação, e o portão depende de o último beta verde ser o commit certo.
