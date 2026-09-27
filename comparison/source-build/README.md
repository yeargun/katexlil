# Source-build measurements

Measured 2026-09-27T10:25:02Z using LilScript `a430d5dfd970f321091c642814906269460b11c0` (binary SHA-256 `6d307b5fcbdce7e673aa0d48e9465b6e038c38c0cf517fa88f62d436b1fa2d4f`) and the upstream Git revision recorded in `job.json`. The port source is commit `07d90d6925ee119a6cf965ed20501e0f5347f7b0`.

`result.json` records the commands, wall time, CPU time, machine and exit codes. `esm.json` records the production ESM assembly and exact input graph. The lockfiles record dependency resolution. The public page uses `source-build.json` for the final consolidated record.

Run the installation and setup commands from `job.json` in the corresponding pinned upstream checkout; they are excluded from build time. Run the recorded build command with Node v24.11.1. Clear the listed generated output directories between repetitions. Install the port dependencies and set `LILSCRIPT_COMPILER`, `LILSCRIPT_ROOT` and `LILSCRIPT_CODEC` to the recorded compiler and codec.

The original repository build and comparison ESM assembly are measured separately. Build output scope can differ between repositories; no build speedup is inferred. Both lanes ran three times, in alternating order, on the same machine: the single LilScript development host, a burstable Azure Standard_B8als_v2 that also ran other compiler sessions. Other sessions were compiling and testing on it throughout this run (one-minute load average 9.0 at the start and 6.9 at the end, on 8 vCPUs), so these wall times are slower than an idle host would give.
