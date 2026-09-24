# Source-build measurements

Measured 2026-09-24T04:08:55Z using LilScript `aa2052f081ca8184666ca280ee9b91d476e46cfc` (binary SHA-256 `13cb49a93fb3e376a5978484835322c84adea692b69ae4720775291377cf18f9`) and the upstream Git revision recorded in `job.json`. The port source is commit `5eec4fa191c04a63a5cf6aff11dc5a6e23726940`.

`result.json` records the commands, wall time, CPU time, machine and exit codes. `esm.json` records the production ESM assembly and exact input graph. The lockfiles record dependency resolution. The public page uses `source-build.json` for the final consolidated record.

Run the installation and setup commands from `job.json` in the corresponding pinned upstream checkout; they are excluded from build time. Run the recorded build command with Node v24.11.1. Clear the listed generated output directories between repetitions. Install the port dependencies and set `LILSCRIPT_COMPILER`, `LILSCRIPT_ROOT` and `LILSCRIPT_CODEC` to the recorded compiler and codec.

The original repository build and comparison ESM assembly are measured separately. Build output scope can differ between repositories; no build speedup is inferred. Both lanes ran three times, in alternating order, on the same machine: the single LilScript development host, a burstable Azure Standard_B8als_v2 that also ran other compiler sessions.

The first run of the repository test command failed one test only because `scripts/build-site.mjs` refused the comparison records this run was producing (its source-fingerprint guard); the command was re-run in the same checkout after the records were written, and `result.json` records both (`testsRerun`).
