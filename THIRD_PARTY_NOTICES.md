# Third-party provenance and notices

No GitHub application source was copied into this release. The roster domain and engine extend the supplied handover; this note does not assert ownership of that original handover or grant a new project license.

External software is used through maintained packages, with its own licenses:

- Next.js and React — MIT; rendering/application framework.
- node-postgres (`pg`) — MIT; actual PostgreSQL driver. Its package license is retained by npm installation.
- Zod — MIT; data validation.
- Lucide — ISC; interface icons.
- Tailwind CSS — MIT; styling tooling.
- Playwright — Apache-2.0; browser acceptance tests.
- Vitest and Vite — MIT; test/build tooling.
- PostgreSQL — PostgreSQL License; database installed separately on the VM.
- cloudflared — Apache-2.0, with upstream notices and dependencies; separately installed official release binary, not copied into this source archive. `docs/licenses/cloudflared-LICENSE.txt` preserves the upstream top-level license. Official repository: https://github.com/cloudflare/cloudflared.

`docs/licenses/lockfile-license-inventory.json` records the declared licenses of all lockfile entries, including optional/transitive/development packages. Some entries have alternative or non-MIT terms (for example MPL/LGPL/CC-BY); do not describe the entire dependency tree as MIT or treat this inventory as legal clearance. Preserve upstream package notices and re-review actual redistributed production artifacts when changing distribution. `npm ci` installs upstream license files; this source ZIP excludes node_modules and third-party binaries.

The HTTPS demo setup follows official Cloudflare Quick Tunnel documentation. Quick Tunnels are temporary development/testing endpoints without uptime guarantees; a named tunnel/domain is required for stable production hosting. Reference: https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/.

## Optional offline narration

The narrated demonstration uses Kokoro-82M v1.0 weights (Apache-2.0, https://huggingface.co/hexgrad/Kokoro-82M), the third-party `kokoro-onnx` runner (MIT, https://github.com/thewh1teagle/kokoro-onnx), ONNX Runtime and SoundFile. `docs/licenses/kokoro-onnx-LICENSE.txt` retains the runner license. Model weights, voices binaries and Python dependency binaries are downloaded separately, not distributed in this source archive. Their recorded SHA-256 values identify the downloaded assets, not an independent authenticity certification.

`docs/licenses/narration-python-license-inventory.json` records installed Python package declarations. This stack includes GPL-licensed phonemizer/eSpeak-related components and other distinct licenses; the model's Apache license does not relicense the entire toolchain. Consult upstream distributions and bundled native-library notices before redistribution. FFmpeg is an external mixing/validation tool with build-dependent licensing. No hosted speech API or cloned applicant voice was used.
