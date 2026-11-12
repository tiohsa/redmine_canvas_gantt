# Selected task drag store benchmark (2026-11-12)

A local jsdom benchmark measures a single `TaskStore.updateTasks` call with no dependency edges. One warm-up and three measured samples were run against an archive of `HEAD` and the working tree, on Node 26.13.0 / Linux, AMD Ryzen 9 8945H. The test is reproducible with `cd spa && npm run test -- --run --config ./scripts/benchmark-selected-drag.config.ts scripts/benchmark-selected-drag.bench.ts -t 'measures selected task drag store updates'`. CPU time is the mean process user + system time, and heap delta is the mean difference in Node heap used before and after each call. Garbage collection makes heap deltas noisy, including negative values. Runs shared a machine with other tests.

| Tasks | Selected | HEAD median ms | Working median ms | HEAD CPU ms | Working CPU ms | HEAD heap delta bytes | Working heap delta bytes |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 100 | 10 | 1.15 | 1.35 | 2.40 | 1.87 | 1,471,808 | 1,500,096 |
| 1,000 | 50 | 13.09 | 8.88 | 16.55 | 13.27 | -4,686,251 | 4,784,421 |
| 5,000 | 100 | 129.16 | 61.65 | 152.10 | 81.26 | -546,299 | -2,191,397 |
| 5,000 | 500 | 610.07 | 204.85 | 631.53 | 223.19 | 226,784 | 11,441,443 |

This measures the store only, without relations, pointer events, rendering, or network access. It does not measure browser frame time or browser CPU and memory, and does not establish production responsiveness. The 5,000/500 case remains over 200 ms per measured store update in this environment; interactive high-load performance needs browser profiling and further improvement before claiming the performance acceptance criterion is met.
