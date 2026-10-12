# Rails query and payload follow-up (2026-10-12)

This is a follow-up to the API profiling record in [PERFORMANCE_INVESTIGATION.md](PERFORMANCE_INVESTIGATION.md). It distinguishes stored measurements from work reproduced in this session. It is an internal development-HEAD note, not a claim about released v0.18.0.

## Measurement status

No Rails measurements were run in this session. The plugin checkout has no Redmine Rails runtime or `bundle` executable available. `docker compose ps` initially could not access the Docker socket; an approved read-only retry returned `0 services`. The recorded environment also documents that starting Rails against the available production container/database was rejected because an isolated test database could not be confirmed. I did not start Rails or access a database.

The numeric values below are **historical stored evidence**, read from `api-profile-decomposition-coarse-20261012.json`, `api-profile-optimized-coarse-20261012.json`, and `api-profile-optimized-detail-20261012.json`. Each has five samples; medians are from those files. The coarse before/after comparison is the same 5,011-task development dataset, admin user 1, project 1, with warmup. It is not a fresh reproduction or a production guarantee.

| Coarse request metric | Stored before optimization | Stored after optimization |
| --- | ---: | ---: |
| Integration request wall time | 3,307.14 ms | 1,882.91 ms |
| `QueryStateResolver#resolve` | 2,069.39 ms | 909.81 ms |
| `DataPayloadBuilder#build` | 1,038.55 ms | 868.59 ms |
| SQL notifications, count / summed time | 48 / 128.97 ms | 56 / 49.82 ms |
| Process GC time delta | 859 ms | 134 ms |
| Process allocated object delta | 2,660,274 | 1,327,744 |
| Response body | 3,933,755 bytes | 3,933,755 bytes |

These are overlapping timers: `load_records` is inside query resolution and includes more than SQL execution; query resolution includes issue selection/sorting, and builder sub-stages are nested. Do not add stage medians or infer an exclusive per-operation cost from them. The SQL notification aggregate excludes cached, schema, and transaction statements and is not the same boundary as query-resolution time.

The stored optimized **detailed** profile is diagnostic instrumentation and should not be compared numerically with the coarse profile. In its five samples, median request time was 1,686.07 ms, query resolution 778.68 ms, record loading 740.40 ms, payload building 850.98 ms, and SQL 44.95 ms over 56 statements. The reported issue relation used `eager_loading=false`. Eleven preloader calls took a median 826.81 ms in aggregate. The task custom-field extraction timer took 538.86 ms across 5,011 tasks; 25,045 `CustomValue` records were instantiated, accounting for 250.09 ms of instantiation notifications. The `available_custom_fields` method ran 5,011 times. These diagnostic methods and instantiation notifications overlap, and their time must not be summed. The result shows substantial per-task custom-field work after the prior optimization; it does not by itself establish which operation dominates CPU versus object construction or association loading.

## Query resolution findings

- The request profile makes query resolution the largest coarse stage in both saved snapshots. The main internal timer is `DataPayloadBudget#load_records`, with nested issue sort much smaller (about 53.0 ms before and 49.9 ms after). This points to bounded issue retrieval, association preloading, and object creation as the main measured area, rather than in-memory sorting alone.
- A saved `query_id` adds `IssueQuery.find_by`, visibility validation, a duplicated working query with URL-overridden filters removed, and a `base_scope.select(:id)` subquery. The no-query-ID path returns an empty `QueryResolution` immediately. The stored request comparison covered two saved queries, but did not provide per-query-resolution timings, so there is no evidence here that saved-query construction itself is costly.
- The earlier API investigation records a query/load optimization: replace the inherited `includes` expansion on `Issue.visible` with `preload` for the requested relation set, preserving the issue visibility scope, filters, ordering, and limit. The stored coarse result after that change has 56 SQL statements rather than 48, but lower summed SQL time, lower load-stage time, and fewer allocations. More statements are not a regression by themselves when the previous eager join inflated rows or object construction.
- The current profile captures request-wide query resolution and load time, but not per-SQL fingerprints or time by association. That prevents isolating whether project/custom-value joins, custom-value preloads, or the selected issue scope is the remaining cost.

## Payload builder findings

- `DataPayloadBuilder#build_tasks` does one grouped `SpentHoursBatch` query for the issue set and passes the result into each `build_task_state`; the list path therefore avoids a per-issue time-entry query. Keep that batch boundary when changing task serialization.
- Each task state reads several issue associations and calls `CustomFieldExtractor#build_task_custom_field_values`. The stored detailed profile shows this method is called once per task; with 5,011 tasks and 25,045 values, it is a visible linear payload cost. The previous extractor change uses Redmine's returned custom-field values to derive applicable field IDs on the standard method path, avoiding a second `available_custom_fields` pass. The stored count fell from 10,022 to 5,011; the current detailed snapshot confirms 5,011 calls. This behavior is already present in the measured HEAD and is not a new recommendation to duplicate.
- The response is about 3.93 MB uncompressed, with the task array alone about 3.92 MB. `json_encode` was about 29.6 ms before and 42.3 ms after by stored coarse medians, so serialization is a smaller measured stage than resolving/loading issues and building task hashes. The unchanged body size also confirms the measured speedup came from server work rather than reducing response payload.
- The detailed request had 11 preloader calls. Their aggregate elapsed time overlaps record loading and includes association fetch/processing; the number is a useful signal, not a standalone cost or reason to remove preloads. Association completeness and `Issue.visible` semantics must remain intact.
- `build_versions` constructs shared-version relations for the selected projects and combines them before loading versions. This has not been isolated by the available measurements. Treat it as a measurement target only if profiling with a many-project scope shows it materially contributes.
- The edit dialog uses `EditMetaPayloadBuilder` (`statuses_for`, `assignables_for`, `project_options_for`, `trackers_for`, and `versions_for`), but the data endpoint profiler does not time that endpoint. No evidence here supports an edit-meta optimization. If dialog latency is in scope, profile the edit-meta request separately with a selected issue and realistic project scope.

## Safe next measurement

Use an isolated Redmine test runtime with a disposable database and deterministic fixtures. First run the existing coarse profiler for the same task count, role, project, and saved-query/filter variants; then run detailed mode separately. Preserve the profiler's outer rollback and write-SQL assertion, and do not point it at production data. For deeper attribution, collect SQL fingerprints/association names and per-preloader groups in the profiler without logging bind values or issue payloads. Keep edit-meta as a separate endpoint experiment. Compare exact response equality and permissions before accepting any behavior change.

Existing tools and evidence: [profile-data-request.rb](../../scripts/profile-data-request.rb), [compare-data-payload.rb](../../scripts/compare-data-payload.rb), [stored coarse baseline](api-profile-decomposition-coarse-20261012.json), [stored optimized coarse profile](api-profile-optimized-coarse-20261012.json), [stored optimized detail profile](api-profile-optimized-detail-20261012.json), [stored payload equality results](api-payload-comparison-20261012.json).
