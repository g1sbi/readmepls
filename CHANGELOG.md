# Changelog

## [0.4.3](https://github.com/g1sbi/readmepls/compare/v0.4.2...v0.4.3) (2026-07-23)


### Bug Fixes

* **worker:** refresh PocketBase auth token and stop masking claim errors ([84838e7](https://github.com/g1sbi/readmepls/commit/84838e77b7cec53890d44f0dca4889b71fb6cbab))

## [0.4.2](https://github.com/g1sbi/readmepls/compare/v0.4.1...v0.4.2) (2026-07-23)


### Features

* add "get the extension!" CTA with install detection ([41e29b6](https://github.com/g1sbi/readmepls/commit/41e29b6b9159f140e89e327977c2077a45fb39de))
* **web:** restyle get-extension pill and dialog ([1661722](https://github.com/g1sbi/readmepls/commit/1661722af7f43496f8859e75fac4eb163c014ab0))

## [0.4.1](https://github.com/g1sbi/readmepls/compare/v0.4.0...v0.4.1) (2026-07-20)


### Features

* **auth:** SaaS email verification (hard block) ([9833bd2](https://github.com/g1sbi/readmepls/commit/9833bd2ac7ef1393d15a430e8318f262ff73a8db))
* **deploy:** build develop images and add manual staging deploy job ([5f9d9dc](https://github.com/g1sbi/readmepls/commit/5f9d9dc51312e700aa43e73a998317a358ec1dc6))
* **deploy:** parametrize compose image tag for staging ([d757c6b](https://github.com/g1sbi/readmepls/commit/d757c6b0a39237cc83c4e631535124370f766c41))
* **extension:** add chrome one-click capture extension ([c93bc6e](https://github.com/g1sbi/readmepls/commit/c93bc6ed836973273f22bd91fdaec64c4cc14c6f))
* **pocketbase:** add SINGLE_ACCOUNT self-host signup lock ([5e4ea44](https://github.com/g1sbi/readmepls/commit/5e4ea440a8a9bd8a1d5c946cdc84371adf54f09a))
* **site:** add privacy policy page ([5fc9209](https://github.com/g1sbi/readmepls/commit/5fc92098bc1406d34e5073b73c7eecb500032a35))
* **web:** accept bearer auth and CORS for extension on /api ([23c51d7](https://github.com/g1sbi/readmepls/commit/23c51d7d3da6407b8352517ff3fdcb138e2f56d0))
* **web:** add public GET /api/config exposing pbUrl ([f837812](https://github.com/g1sbi/readmepls/commit/f837812f11e47fd5a8f1b2d448cc07767492fefb))
* **web:** fetch single-account lock status on the login page ([2fc5f53](https://github.com/g1sbi/readmepls/commit/2fc5f539c362d888ddea4aedf131d32970bf7d79))
* **web:** hide sign-up on the login page when single-account is locked ([a442c8d](https://github.com/g1sbi/readmepls/commit/a442c8da716a73060acb380b96789dbadb266a3c))
* **worker:** auto-provision youtube PO tokens via bgutil sidecar ([6241d6c](https://github.com/g1sbi/readmepls/commit/6241d6cff1e497b1bdec35610f629253498f9252))


### Bug Fixes

* **deploy:** add manual dispatch to release-please, correct stale comment ([e21ae32](https://github.com/g1sbi/readmepls/commit/e21ae3204298382bb3cb86c6da7233a4083930ac))
* **deploy:** declare IMAGE_TAG in .env.example for compose parity ([14a0ff5](https://github.com/g1sbi/readmepls/commit/14a0ff505eb896a55a85a10ca08292df6576c78b))
* **deploy:** harden staging deploy against prod-image and prod-directory writes ([ae0ab4f](https://github.com/g1sbi/readmepls/commit/ae0ab4f3e4f24fa2bcfb7cb933434945d57b1d8c))
* **deploy:** skip docker-publish on doc-only changes ([daabca5](https://github.com/g1sbi/readmepls/commit/daabca5622791fc359be974c5da84604ff468af9))
* **deploy:** switch site image to glibc base to fix arm64 build hang ([336c596](https://github.com/g1sbi/readmepls/commit/336c596060f0d6991c3050f24f577a57a6462878))
* **deploy:** switch web image to glibc base to fix arm64 build hang ([ed419b9](https://github.com/g1sbi/readmepls/commit/ed419b9279393f6dba5b781e8b82ee35e92fb75c))
* **site:** build docs page from repo-root files via ?raw ([b958e31](https://github.com/g1sbi/readmepls/commit/b958e3190abbb7fe6c02aa844bcaa60f315fc5a7))
* **site:** build docs page from repo-root files via ?raw ([4d8562e](https://github.com/g1sbi/readmepls/commit/4d8562e9b4270601a057225024c31dbf348c5ee7))
* **site:** resolve extensionless routes to prerendered .html in nginx ([167a297](https://github.com/g1sbi/readmepls/commit/167a297bebfc847f92877f85d08733bd463209a4))
* **web:** fail open on single-account status fetch errors ([3bb1335](https://github.com/g1sbi/readmepls/commit/3bb1335801a3733483f9e7a6c640701c3762e10c))
* **worker:** get youtube extraction past datacenter-IP bot-block ([26900d4](https://github.com/g1sbi/readmepls/commit/26900d47b1549498c93359222c718863bd93736d))

## [0.4.0](https://github.com/g1sbi/readmepls/compare/v0.3.0...v0.4.0) (2026-07-16)


### Features

* **deploy:** trigger image builds on push to main and deploy to the VPS ([0aa6c0c](https://github.com/g1sbi/readmepls/commit/0aa6c0c89b725e1a88214bdd3065c8bddb2e1dcc))

## [0.3.0](https://github.com/g1sbi/readmepls/compare/v0.2.0...v0.3.0) (2026-07-16)


### Features

* **web:** add CyclingGreeting component ([b159ef1](https://github.com/g1sbi/readmepls/commit/b159ef1e0ed0f6cb2d34edd420d685194454ee4b))
* **web:** add shared prefersReducedMotion helper ([dc58925](https://github.com/g1sbi/readmepls/commit/dc58925edd27d847d6013fba7ffb1ba752ecc82f))
* **web:** add typewriter reducer and runes wrapper ([e63f230](https://github.com/g1sbi/readmepls/commit/e63f23050da657b6dc8af6f53c8fcbe06ec0238e))
* **web:** center-stage capture hero with greeting and quick actions ([69211ab](https://github.com/g1sbi/readmepls/commit/69211abadbeaa55ab33ea7223060a88c2e5ae3fb))
* **web:** rework CaptureBar into pill with typewriter placeholder ([70362f3](https://github.com/g1sbi/readmepls/commit/70362f3b7fe58dcdd1bbca1b32574232f29ca5d1))


### Bug Fixes

* **web:** dedupe sr-only, keep input 16px on desktop, cover generic capture error ([9406506](https://github.com/g1sbi/readmepls/commit/94065069c26f3341a8cfad6e1b8e9bc6566ca412))
* **web:** resume typewriter cleanly instead of stuttering after pause ([fce9483](https://github.com/g1sbi/readmepls/commit/fce948312b1860f149b6c15f2cca214e2317be53))
* **web:** silence state_referenced_locally on one-time placeholders prop ([46ca267](https://github.com/g1sbi/readmepls/commit/46ca267436017a60bfd9433a387fa8714618a06c))
* **web:** style home quick-action pills as on-brand paper chips ([dd9f91c](https://github.com/g1sbi/readmepls/commit/dd9f91c642acee45e9336711a77c059a1c577d98))

## [0.2.0](https://github.com/g1sbi/readmepls/compare/v0.1.0...v0.2.0) (2026-07-15)


### Features

* **site:** add coming-soon Pro strip for AI features ([f117730](https://github.com/g1sbi/readmepls/commit/f117730e37417b92df43109f77d5a431a3824a57))
* **site:** add compose service and env for the landing site ([d8525ab](https://github.com/g1sbi/readmepls/commit/d8525abdc9dab3060cdbb1241a04ee25a55a418c))
* **site:** add entrypoint sentinel rewrite for APP_URL ([4353830](https://github.com/g1sbi/readmepls/commit/43538302831b744ad94ffd041ccd771e79283951))
* **site:** animate hero tagline as a slot-machine reel ([d9a0cfe](https://github.com/g1sbi/readmepls/commit/d9a0cfea7f0bca5f3c93c3dd576ceeeb2ed59831))
* **site:** resolve APP_URL from PUBLIC_APP_URL env ([da18488](https://github.com/g1sbi/readmepls/commit/da184884854d127c2f7252623fdbac435e032cea))
* **site:** rework landing copy — de-AI core flow, add reel words + Pro strip data ([fe39afd](https://github.com/g1sbi/readmepls/commit/fe39afdb219b77ef97b930d77cfcc0f8e388bb36))


### Bug Fixes

* **site:** healthcheck probes 127.0.0.1 not localhost ([cd9437e](https://github.com/g1sbi/readmepls/commit/cd9437e4a646705e5ef4ce573c57b0afe79af87e))
* **site:** let prerender pass the __APP_URL__ sentinel link ([57b06a1](https://github.com/g1sbi/readmepls/commit/57b06a17a3e08a33bfdbebe2ba683e5112f2ab29))
