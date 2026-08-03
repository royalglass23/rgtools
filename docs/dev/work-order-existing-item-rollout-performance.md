# Existing-item rollout performance evidence

Recorded 2026-07-21 on `feature/workorder` at base commit
`94ab32b1e685b2886d6445d2568bbc9693380299` with the reviewed changes present in the working tree.

Runner: Windows (`win32`), Node `v24.15.0`, Vitest `v4.1.7`. Database: sentinel-verified
E2E database `royal-glass`, Neon branch `br-odd-truth-a7s2173a`.

## Fixture and results

- Fixture seed: refresh inputs use `item-1` through `item-100`, `GLASS-001` through `GLASS-100`,
  and `Realistic glass item 1` through `Realistic glass item 100`. The query fixture uses Work Order
  UUID `20800000-0000-4000-8000-000000000100`, rollout UUID
  `20800000-0000-4000-8000-000000000101`, and the same numbered item-code/description pattern.
- Refresh/enqueue: 100 realistic ServiceM8 items, one explicit warm-up per path followed by five
  measured runs. Baseline samples: `11.8219`, `13.1816`, `11.9964`, `13.2745`, `14.6574 ms`;
  production-enqueuer samples: `19.4777`, `21.4666`, `35.1273`, `24.2480`, `14.0233 ms`.
  Medians: `13.1816 ms` baseline and `21.4666 ms` rollout; overhead `8.2850 ms`; real worker/provider
  boundary calls `0`. Gate: overhead
  below `1,000 ms` and no provider work on the refresh critical path. Result: PASS.
- Dashboard queries: one current Work Order with 100 active realistic items, five warmed runs against
  the isolated database. Baseline samples: `147.9506`, `171.5089`, `174.6614`, `184.1675`,
  `150.9124 ms`; rollout samples: `151.5219`, `170.6445`, `149.4053`, `144.7062`,
  `161.5845 ms`. Medians: `171.5089 ms` baseline and `151.5219 ms` rollout, a `-11.6536%`
  regression. Gate: at most `10%`. Result: PASS.
- Dashboard render: 100 realistic items, five warmed server-render samples. Baseline samples:
  `782.4403`, `651.6253`, `597.2309`, `568.9322`, `678.6398 ms`; rollout samples: `846.5239`,
  `720.0076`, `588.9256`, `649.1270`, `572.8711 ms`. Medians: `651.6253 ms` baseline and
  `649.1270 ms` rollout, a `-0.3834%` regression. Gate: rollout median no more than `10%` above
  baseline. Result: PASS.
- Real-browser journey: five controlled refreshes completed in `6,361`, `3,857`, `5,705`, `2,735`,
  and `3,114 ms`; CSV export completed in `1,745 ms`; Axe reported `0` violations. The complete
  Manage/Configure journey and separate View-only journey passed in `4.7 minutes` total.

## Reproduction

- Refresh/enqueue and render:
  `node ../../node_modules/vitest/vitest.mjs run modules/work-orders/__tests__/refresh-work-orders.test.ts modules/work-orders/__tests__/work-orders-dashboard-performance.test.tsx --reporter=verbose`
- Query benchmark: set `DATABASE_URL` and `E2E_DATABASE_URL` to the dedicated E2E URL, set the
  matching `E2E_DATABASE_SENTINEL`, then run
  `node ../../node_modules/vitest/vitest.mjs run --config vitest.integration.config.ts tests/integration/work-order-rollout-dashboard-performance.test.ts --pool=forks --maxWorkers=1 --reporter=verbose`.
- Browser journey: set the same E2E safety variables, then run
  `node --env-file=../../.env.local node_modules/@playwright/test/cli.js test tests/e2e/work-orders.spec.ts --reporter=list --workers=1`.
