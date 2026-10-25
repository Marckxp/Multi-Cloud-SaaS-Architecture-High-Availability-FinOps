# 0002 · Web nos arquivos estáticos da Cloudflare, Azure como beta e reserva

- **Estado:** aceita
- **Contexto:** a primeira visita à Web baixa cerca de 4 MB, e cada publicação invalida todos os arquivos. Isso dá uns 12,8 MB por usuário por mês. O Azure Static Web Apps Free tem 100 GB/mês e para de servir ao passar, o que comporta uns 7.800 usuários ativos por mês. O Standard custa por app e por GB.
- **Decisão:** publicar a Web em Cloudflare Workers só com arquivos estáticos (sem script), onde requisições a estáticos não têm custo nem limite. Os cabeçalhos de segurança são gerados no deploy a partir da mesma configuração usada no Azure. A Web de produção está na Cloudflare. O Azure Static Web Apps fica como ambiente beta, até haver domínio próprio, e como reserva da produção.
- **Consequências:** o custo não cresce com o número de usuários. Restam duas configurações de borda para manter coerentes, o que o gerador de cabeçalhos resolve.
