# 0008 · Every release is checked the way a client would see it

- **Status:** accepted
- **Context:** the first visit to the published web app does not reveal service worker cache defects, and each edge (Cloudflare and Azure) behaves slightly differently.
- **Decision:** after every release, a script opens the web app in a clean browser and checks the security headers, the wasm type, the environment (production or beta), sign-in, the first and second visits, the service worker cache, an internal route and offline open. If anything fails, the release is considered broken.
- **Alternatives considered:** checking only the first visit, which hides service worker cache defects.
- **Evidence:** the verification caught two defects that the first visit hid. On Cloudflare, a 307 redirect of `/index.html` broke the service worker. On Azure, a 404 on the manifest broke the install. After the fix (HTML handling turned off in the Worker, and a service worker that refuses a redirected response), the production verification passed all 20 items.
- **Consequences:** a release is only finished after the verification. The end-to-end suite gained cases for the service worker with a simulated edge redirect and for offline open.
