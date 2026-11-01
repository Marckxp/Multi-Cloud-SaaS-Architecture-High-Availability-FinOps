# 0010 · SDK e workloads do .NET fixos em um arquivo de versão

- **Estado:** aceita
- **Contexto:** o runtime do WebAssembly vem do conjunto de workloads (`wasm-tools`), e não só do SDK. Com a faixa `10.0.x` no workflow, o beta e a produção podiam sair com runtimes diferentes.
- **Decisão:** um `global.json` fixa a versão do SDK e a do conjunto de workloads, sem avanço automático (`rollForward` desligado), e todos os jobs do CI o usam, inclusive o de testes.
- **Evidência:** antes da mudança, o beta saiu com o runtime 10.0.14 e a produção, compilada no PC, com o 10.0.12. Fixar só o SDK não bastou: o SDK 10.0.403 com o workload antigo ainda publicou o runtime 10.0.12.
- **Consequências:** o mesmo runtime em todos os ambientes e na máquina de desenvolvimento. Atualizar passa a ser uma mudança explícita, em que SDK e workload sobem juntos.
