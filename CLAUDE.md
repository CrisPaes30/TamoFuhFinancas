# TamoFuhFinancas

PWA de finanças compartilhadas para casais. Offline-first e instalável. Ver `README.md` para como rodar/buildar.

## Stack
- React 18 + Vite 7 + TypeScript + TailwindCSS 3
- Zustand (`src/store/index.tsx`) — única fonte de verdade do estado global, com `persist` (só `profile` vai pro localStorage)
- Firebase: Auth (Google popup) + Firestore (`src/lib/firebase.ts`) — não há backend/API próprio, Firebase É o backend
- vite-plugin-pwa (service worker + manifest)
- Testes: Vitest + Testing Library (`npm test`), Firestore sempre mockado nos testes (nunca toca dado real)

## Padrões importantes (não duplicar/reinventar)
- Moeda: `toCents`/`fromCents` sempre de `@/lib/currency` (implementação canônica). `@/utils` só reexporta.
- Datas a partir de string `"YYYY-MM-DD"`: sempre acrescentar horário explícito (`` `${str}T12:00:00` ``), nunca `new Date(str)` sozinho — quebra em fusos negativos (America/Sao_Paulo é UTC-3), já causou bug real (despesa do dia 1 ia pro mês anterior).
- Autoria de despesas: `Expense.createdBy` (uid de quem criou); `store.updateExpense`/`deleteExpense` checam `assertIsAuthor` — é trava **client-side** (best-effort); não existe `firestore.rules` neste repo pra reforçar no backend.

## Workflow obrigatório: dev + QA em todo pedido

Para **cada pedido** de mudança no código (feature, correção, melhoria), rodar **os dois agentes do projeto**, nunca só um:

1. **`dev`** (`.claude/agents/dev.md`) — implementa, roda `npm test`/`npm run build`, e reporta: o que foi feito, execuções realizadas, melhorias identificadas (mesmo fora do escopo) e limitações/riscos.
2. **`qa`** (`.claude/agents/qa.md`) — desenha cenários de teste a partir do pedido, executa (via `npm test` e, quando fizer sentido, verificação manual no app local), e reporta: cenários testados, resultado esperado vs. obtido, e bugs encontrados. QA não corrige — só aponta.

Os dois são **obrigatórios juntos**, não um substituto do outro. Se um bug for encontrado pelo QA, ele deve ser reportado ao usuário antes de o `dev` corrigi-lo (ou já junto, deixando claro que foi achado pelo QA).

Essas definições de agente (`.claude/agents/qa.md` e `.claude/agents/dev.md`) são **específicas deste projeto** e sobrepõem quaisquer agentes globais de mesmo nome (`~/.claude/agents/qa.md`, `~/.claude/agents/dev-frontend.md` etc. pertencem a outro projeto — "English Memory AI" — e não se aplicam aqui).
