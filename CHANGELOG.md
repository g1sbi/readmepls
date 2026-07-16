# Changelog

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
