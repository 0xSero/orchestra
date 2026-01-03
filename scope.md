**Scope**

Big Picture
- This fixture provides a deterministic Boomerang-like build site used to validate the planner’s output and the orchestrator’s task sequencing. It includes a tiny web build that outputs three files under dist/ and a verification script that asserts the outputs are stable and match expected hashes.

Code Map (target entries discovered in fixture)
- /packages/orchestrator/.tmp/test-fixture-lNbOB4/package.json
- /packages/orchestrator/.tmp/test-fixture-lNbOB4/scripts/build.js
- /packages/orchestrator/.tmp/test-fixture-lNbOB4/scripts/verify.js
- /packages/orchestrator/.tmp/test-fixture-lNbOB4/dist/index.html (generated)
- /packages/orchestrator/.tmp/test-fixture-lNbOB4/dist/styles.css (generated)
- /packages/orchestrator/.tmp/test-fixture-lNbOB4/dist/app.js (generated)

Key Components
- Build Script (scripts/build.js): Creates dist/; writes index.html, styles.css, app.js; exposes a deterministic output.
- Verification Script (scripts/verify.js): Computes sha256 hashes of dist/*.html/css/js and compares to expected values; validates content for critical strings.
- Dist Assets (dist/): The three static assets produced by the build script used by verification.
- Package Metadata (package.json): Declares build and test scripts using Bun.

Risks
- Environment variance (Node/Bun versions) could cause non-deterministic builds or whitespace changes.
- Hash mismatches if the build script changes even trivially (order of writes, minification, or encoding).
- The fixture assumes a deterministic runtime; any changes to the fixture or build pipeline may invalidate hashes.

Notes
- This scope is scoped to the provided fixture and does not modify the global repository settings.
