# 0002 · Web app on Cloudflare static assets, Azure as beta and fallback

- **Status:** accepted
- **Context:** the first visit to the web app downloads about 4 MB, and every release invalidates all files. That comes to about 12.8 MB per user per month. Azure Static Web Apps Free has 100 GB/month and stops serving when exceeded, which fits about 7,800 monthly active users. Standard is billed per app and per GB.
- **Decision:** publish the web app on Cloudflare Workers with static assets only (no script), where requests to static assets have no cost and no limit. Security headers are generated at deploy time from the same configuration used on Azure. The production web app is on Cloudflare. Azure Static Web Apps stays as the beta environment, until there is a custom domain, and as the fallback for production.
- **Alternatives considered:** Azure Static Web Apps Free as the only host, which stops serving at 100 GB/month; and Azure Static Web Apps Standard, billed per app and per GB.
- **Consequences:** cost does not grow with the number of users. Two edge configurations remain to be kept consistent, which the header generator takes care of.
