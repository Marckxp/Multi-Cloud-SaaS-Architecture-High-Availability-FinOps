# 0005 · AWS e Alibaba Cloud descartadas por enquanto

- **Estado:** aceita, com gatilho de reavaliação
- **Contexto:** foram comparadas com a pilha atual nas camadas gratuitas permanentes.
- **Decisão:** não adotar agora. A Alibaba tem região em São Paulo, mas as ofertas gratuitas são temporárias. A AWS só é mais generosa em banda de CDN e em NoSQL, e adotá-la exigiria trocar o Firestore.
- **Gatilhos:** Web acima de 80 GB/mês ou Firestore perto de 40 mil leituras/dia.
