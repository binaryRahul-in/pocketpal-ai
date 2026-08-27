# CI baseline and integration rules

This repository uses **`main`** as the integration target. The current lightweight distribution is also mirrored by `pocketpal-lite`; changes must be based on the current integration tip, not on another worker's feature branch.

## Branches and required checks

Use `feature/t<N>-<short-name>` for worker branches, for example `feature/t7-rvc-ci-baseline`. Pull requests must target `main` and must pass the checks below before merge. Repository administrators should mark the named jobs as required branch-protection checks.

| Check | Scope | Purpose |
| --- | --- | --- |
| `JS lint, typecheck, and unit tests` | JavaScript/TypeScript and package changes | Existing lint, compiler, and Jest coverage gates. |
| `Android compile` | Android or shared application changes | Production-debug Gradle compilation with reports retained. |
| `iOS compile (licensed runner)` | iOS or shared application changes | Simulator compilation on GitHub's macOS runner; no signing secrets are needed. |
| `Native C++ fixture tests` | Native or RVC changes | Deterministic C++17 fixture test with no external weights. |
| `Model manifest and fixture ONNX smoke test` | Model, config, native, or RVC changes | Schema and graph validation using checked-in fixtures only. |
| `License and dependency audit` | Package or lockfile changes | License inventory and high-severity dependency audit. |
| `Artifact size report` | All baseline runs | Retains size measurements and upstream failure context. |

The workflow path filters intentionally include `ci/**`, native directories, model/config locations, and workflow files. Consequently, a later RVC pull request that changes RVC code, native code, model manifests, or configuration receives the fixture and compliance gates automatically. The fixture smoke test never accesses Hugging Face, private registries, proprietary weights, or repository secrets.

## Merge order

Merge the CI baseline first. Then merge foundational native interfaces, model-manifest/schema changes, the runtime implementation, and finally UI or product integration. Each worker rebases onto the latest `main` before opening or updating a pull request. If two pull requests touch the same integration surface, merge the lower-level contract first and resolve conflicts in the consuming branch rather than editing another worker's branch.

## Seven-worker artifact ownership

Workers may attach logs, benchmark data, screenshots, and reports to their own pull request, but generated files are not shared write targets. Store temporary output under a worker-specific path such as `artifacts/t<N>/` or in the CI run's artifact upload. Do not modify another worker's generated directory, committed benchmark baseline, lockfile, or source files merely to make a report fit. The baseline workflow uploads reports with unique artifact names (`js-test-reports`, `model-validation-reports`, and so on), while `artifact-size-report` records tracked source and fixture sizes for review.

A worker adding a persistent fixture must use a uniquely named file and include its validator in the same pull request. A worker updating a shared manifest must explain the schema change and preserve backward-compatible validation where possible. CI failures should be fixed at the source; do not hide them with `continue-on-error` or by deleting the report artifact.

## Local verification

Run `yarn lint`, `yarn typecheck`, and `yarn test --runInBand --coverage` after installing with `yarn install --frozen-lockfile`. The weight-free gates can be run independently:

```bash
node ci/validate-model-manifest.js ci/fixtures/rvc-model-manifest.json
node ci/onnx-fixture-smoke.js ci/fixtures/rvc-fixture.onnx.json
g++ -std=c++17 -Wall -Wextra -Werror ci/native/rvc_fixture_test.cpp -o /tmp/rvc_fixture_test
/tmp/rvc_fixture_test
```

The Android and iOS jobs require their respective licensed SDKs and are therefore validated on their GitHub-hosted runners.
