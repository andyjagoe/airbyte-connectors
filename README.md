# Airbyte Connectors (ESM)

This repository is an ESM version of [https://github.com/faros-ai/airbyte-connectors](https://github.com/faros-ai/airbyte-connectors), which is written in CommonJS. If you want to build a source connector that needs to import [pure ESM packages](https://gist.github.com/sindresorhus/a39789f98801d908bbc7ff3ecc99d99c), you need something like this. [Learn more](https://blog.sindresorhus.com/get-ready-for-esm-aa53530b3f77). 

See the READMEs inside `destinations/` and `sources/` subfolders for more information on each connector.

Component | Code | Installation | Version
----------|-----------|------|--------
Airbyte CDK | [faros-airbyte-cdk](faros-airbyte-cdk) | `npm i faros-airbyte-cdk` |[![npm package](https://img.shields.io/npm/v/faros-airbyte-cdk?color=blue&label=npm)](https://www.npmjs.com/package/faros-airbyte-cdk)
Faros Destination | [destinations/airbyte-faros-destination](destinations/airbyte-faros-destination) | `npm i airbyte-faros-destination` or `docker pull farosai/airbyte-faros-destination` | [![npm package](https://img.shields.io/npm/v/airbyte-faros-destination?color=blue&label=npm)](https://www.npmjs.com/package/airbyte-faros-destination) [![](https://img.shields.io/docker/v/farosai/airbyte-faros-destination?color=blue&label=docker)](https://hub.docker.com/r/farosai/airbyte-faros-destination/tags)
Web3 Analytics Source | [sources/airbyte-web3analytics-source](sources/web3analytics-source) | `docker pull web3analytics/airbyte-web3analytics-source` | [![](https://img.shields.io/docker/v/web3analytics/airbyte-web3analytics-source?color=blue&label=docker)](https://hub.docker.com/r/web3analytics/airbyte-web3analytics-source/tags)


# Development

1. Install [`nvm`](https://github.com/nvm-sh/nvm#installing-and-updating)
2. Install Node.js `nvm install 16 && nvm use 16`
3. Install `lerna` by running `npm install -g lerna`
4. Run `npm i` to install dependencies for all projects (`npm run clean` to clean all)
5. Run `npm run build` to build all projects (for a single project add scope, e.g `npm run build -- --scope airbyte-faros-destination`)
6. Run `npm run test` to test all projects (for a single project add scope, e.g `npm run test -- --scope airbyte-faros-destination`)
7. Run `npm run lint` to apply linter on all projects (for a single project add scope, e.g `npm run lint -- --scope airbyte-faros-destination`)

👉 Follow our guide on how to develop a new source [here](https://github.com/faros-ai/airbyte-connectors/tree/main/sources#developing-an-airbyte-source).

## Other Useful Commands

1. Audit fix `npm audit fix`
2. Clean your project `npm run clean`

Read more about `lerna` [here](https://github.com/lerna/lerna).

# Build Docker Images

In order to build a Docker image for a connector run the `docker build` command and set `path` and `version` arguments.
For example for Faros Destination connector run:

```sh
docker build . --build-arg path=destinations/airbyte-faros-destination --build-arg version=0.0.1 -t airbyte-faros-destination
```

And then run it:

```sh
docker run airbyte-faros-destination
```
