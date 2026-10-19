# Avancement

## Feuille de route

- [x] **Tâche 0 — Socle : git + tests**
  Dépôt git + `.gitignore`. Serveur : vitest + supertest (`npm test`, base `:memory:`), 13 tests couvrant auth,
  refus sans token, CRUD opérations, isolation entre utilisateurs, soldes, stats, budgets, export CSV.
  Client : Playwright (`npm run test:e2e`) lance son propre serveur sur une base `e2e.db` réinitialisée, scénario dépense en 1366×900 et 390×844.
- [ ] Tâche 1 — Virements entre comptes
- [ ] Tâche 2 — Opérations récurrentes
- [ ] Tâche 3 — Import CSV bancaire
- [ ] Tâche 4 — PWA installable
- [ ] Tâche 5 — Objectifs d'épargne
- [ ] Tâche 6 — Prêt pour la production
