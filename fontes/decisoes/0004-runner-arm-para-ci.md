# 0004 · Runner de CI próprio em ARM64 (OCI A1)

- **Estado:** avaliada, implantação planejada
- **Contexto:** o build de Blazor WebAssembly e a suíte de testes consomem minutos de CI. Uma VM A1 Always Free tem CPU e memória de sobra.
- **Decisão:** usar um runner próprio do GitHub Actions na VM A1 (Ubuntu 24.04 aarch64) para build, testes e deploy. O Android, que não compila em ARM Linux, fica no PC ou no Cloud Build x64.
- **Evidência:** na VM, o .NET 10 com wasm-tools funcionou (exige a libatomic1), o publish da Web levou 45 s e 977 testes .NET passaram.
- **Consequências:** o CI sai sem custo. A VM precisa de uso real para não ser recolhida como ociosa, e o acesso por SSH fica restrito a um /32.
