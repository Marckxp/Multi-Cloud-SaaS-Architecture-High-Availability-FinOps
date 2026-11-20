# 0001 · Offline-first, no application server

- **Status:** accepted
- **Context:** the app is used on unreliable networks. A server of our own costs money and needs maintenance before there is any revenue.
- **Decision:** the device is the source of truth (SQLite per profile). Every write goes into an outbox in the same transaction. The cloud handles identity, static files and, later, sync. A file backup protects the data until sync exists.
- **Alternatives considered:** an application server of our own from the start, which costs money and needs maintenance before there is any revenue.
- **Consequences:** the app works without a network and without server cost. The price is having to resolve conflicts when downloading between devices (a planned stage) and maintaining a single .NET core compiled for both the native app and WebAssembly.
