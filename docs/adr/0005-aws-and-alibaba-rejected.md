# 0005 · AWS and Alibaba Cloud rejected for now

- **Status:** accepted, with a reevaluation trigger
- **Context:** they were compared with the current stack on the permanent free tiers.
- **Decision:** do not adopt them now. Alibaba has a São Paulo region, but its free offers are temporary. AWS is more generous only on CDN bandwidth and NoSQL, and adopting it would mean replacing Firestore.
- **Triggers:** web traffic above 80 GB/month or Firestore near 40 thousand reads/day.
