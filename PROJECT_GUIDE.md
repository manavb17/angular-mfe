# Angular MFE — Project Guide

## Table of Contents

1. [Overview](#overview)
2. [Workspace Structure](#workspace-structure)
3. [Architecture: Native Federation](#architecture-native-federation)
4. [Projects In Detail](#projects-in-detail)
5. [Nx Concepts](#nx-concepts)
6. [Common Commands](#common-commands)

---

## Overview

This is an **Nx monorepo** containing three Angular 21 applications wired together using **Angular Native Federation** — a modern, ESM-native approach to micro-frontends (no Webpack required).

| App | Role | Dev Port |
|---|---|---|
| `shell` | Host — lazy loads remote MFEs on navigation | 4200 |
| `mfe1` | Remote micro-frontend — lazy loaded on demand | 4201 |
| `mfe2` | Remote micro-frontend — lazy loaded on demand | 4202 |

**Runtime flow:**
```
Browser → shell (port 4200)
            │
            ├── / (home)  →  renders HomeComponent — no remote fetched
            │
            ├── user clicks "MFE 1" nav link
            │     └── /mfe1  →  Angular lazy loads route → Native Federation
            │                   fetches mfe1 bundle → renders mfe1's App
            │
            └── user clicks "MFE 2" nav link
                  └── /mfe2  →  Angular lazy loads route → Native Federation
                                fetches mfe2 bundle → renders mfe2's App
```

`mfe1` and `mfe2` are **independently deployable** Angular apps. They are **not included in the shell's initial bundle** — their JavaScript is only fetched from the network the first time the user navigates to their route. All three apps share Angular/RxJS packages as singletons to avoid duplicate framework code.

---

## Workspace Structure

```
angular-mfe/
├── nx.json                  # Nx config: plugins, caching rules, generator defaults
├── package.json             # Single root package.json — one node_modules for all apps
├── tsconfig.base.json       # Shared TypeScript path aliases
├── tsconfig.json            # Root TS config
├── eslint.config.mjs        # Shared ESLint config
│
├── apps/
│   ├── shell/               # Host application
│   │   ├── project.json     # Nx targets for shell
│   │   ├── federation.config.js   # Native Federation: host config (no exposes)
│   │   └── src/
│   │       └── app/
│   │           ├── app.ts           # Root component
│   │           ├── app.routes.ts    # Routes — uses loadRemoteModule()
│   │           ├── app.config.ts    # Angular bootstrap config
│   │           ├── app.html/scss    # Template & styles
│   │           └── app.spec.ts      # Unit tests (Vitest)
│   │
│   ├── shell-e2e/           # Playwright E2E tests for shell
│   │
│   ├── mfe1/                # Micro-frontend 1
│   │   ├── project.json
│   │   ├── federation.config.js   # Exposes ./Component → app.ts
│   │   └── src/app/         # Same structure as shell
│   │
│   ├── mfe1-e2e/
│   ├── mfe2/                # Micro-frontend 2
│   ├── mfe2-e2e/
│   └── commands.txt
│
├── packages/                # Shared libraries (empty — for future shared code)
└── dist/                    # Build outputs (gitignored)
```

---

## Architecture: Native Federation

[Native Federation](https://github.com/angular-architects/native-federation) uses the browser's native **ES Module import maps** to share and load remote bundles — no Webpack Module Federation required.

### Shell (`federation.config.js`)

```js
// apps/shell/federation.config.js
module.exports = withNativeFederation({
  name: 'shell',
  // No "exposes" — shell only consumes remotes
  shared: {
    ...shareAll({ singleton: true, strictVersion: true, requiredVersion: 'auto' }),
  },
});
```

### MFE1 / MFE2 (`federation.config.js`)

```js
// apps/mfe1/federation.config.js
module.exports = withNativeFederation({
  name: 'mfe1',
  exposes: {
    './Component': './apps/mfe1/src/app/app.ts',  // What the shell can load
  },
  shared: {
    ...shareAll({ singleton: true, strictVersion: true, requiredVersion: 'auto' }),
  },
});
```

`shareAll` with `singleton: true` ensures Angular, RxJS, and other packages are loaded **once** and shared across the shell and all remotes — no duplicate framework code.

### Shell Routing & Lazy Loading

```typescript
// apps/shell/src/app/app.routes.ts
import { Component } from '@angular/core';
import { loadRemoteModule } from '@angular-architects/native-federation';

@Component({
  template: `<p>Select a micro-frontend from the nav above.</p>`,
})
class HomeComponent {}

export const appRoutes: Route[] = [
  { path: '', pathMatch: 'full', component: HomeComponent },  // no remote fetch on shell load
  {
    path: 'mfe1',
    loadComponent: () => loadRemoteModule('mfe1', './Component').then((m) => m.App),
  },
  {
    path: 'mfe2',
    loadComponent: () => loadRemoteModule('mfe2', './Component').then((m) => m.App),
  },
];
```

Two layers of lazy loading work together:

1. **Angular `loadComponent`** — the route callback is only invoked when the user navigates to `/mfe1` or `/mfe2`. Nothing is imported at shell startup.
2. **Native Federation `loadRemoteModule`** — at navigation time, fetches the remote app's bundle from its dev server (or CDN in production) and resolves the exposed `./Component` entry.

The `''` root route renders a lightweight inline `HomeComponent` so that **no remote bundle is fetched when the shell first loads**. mfe1 and mfe2 are fetched only on first navigation to their route, and cached by the browser on subsequent visits.

---

## Projects In Detail

### Targets (tasks) per project

Each app's `project.json` defines the following targets:

| Target | Executor | Description |
|---|---|---|
| `build` | `@angular-architects/native-federation:build` | Federation-aware build (wraps `esbuild` target) |
| `serve` | `@angular-architects/native-federation:build` | Federation-aware dev server (wraps `serve-original`) |
| `esbuild` | `@angular/build:application` | Raw Angular esbuild — called by `build` |
| `serve-original` | `@angular/build:dev-server` | Raw Angular dev server — called by `serve` |
| `serve-static` | `@nx/web:file-server` | Serve built `dist/` as static files |
| `lint` | `@nx/eslint:lint` | ESLint |
| `test` | `@angular/build:unit-test` | Unit tests via Vitest |

The `build` and `serve` targets are thin wrappers — they let Native Federation pre-process the import map and shared scope before delegating to Angular's own builder.

### Dev Ports

| App | `serve-original` port |
|---|---|
| `shell` | 4200 |
| `mfe1` | 4201 |
| `mfe2` | 4202 |

---

## Nx Concepts

### Monorepo
One Git repo, multiple projects sharing a single `node_modules`. Avoids dependency version drift across apps and enables shared tooling, linting, and TypeScript config.

### `project.json`
Each project declares its own **targets** (build, serve, test, lint, etc.) in `project.json`. This is Nx's way of describing what can be run for a project, independent of the underlying tool.

### Executors
An executor is the plugin that **runs a target**. It's specified as `"executor": "<package>:<name>"`. Executors abstract away tool-specific commands — you run `nx build mfe1` and Nx calls the right executor.

### Plugins (`nx.json` → `plugins`)
Nx plugins can **auto-infer targets** from existing config files so you don't have to declare them manually:

| Plugin | Infers |
|---|---|
| `@nx/js/typescript` | `typecheck`, `build` from `tsconfig` |
| `@nx/playwright/plugin` | `e2e` from Playwright config |
| `@nx/eslint/plugin` | `lint` from ESLint config |

### Caching (`targetDefaults`)
Nx caches task outputs and skips re-running tasks when inputs haven't changed:

```json
"@angular/build:application": {
  "cache": true,
  "dependsOn": ["^build"],
  "inputs": ["production", "^production"]
}
```

- `"cache": true` — output is cached between runs
- `"dependsOn": ["^build"]` — the `^` means: run `build` on all **dependencies** before this project's build
- `"inputs": ["production"]` — only files matching the `production` named input affect the cache (excludes lint/test config)

### Named Inputs (`nx.json` → `namedInputs`)
Reusable file glob sets used by `inputs` in target defaults:

| Name | Meaning |
|---|---|
| `default` | All files under the project root + shared globals |
| `production` | `default` minus ESLint config files (safe to exclude from build cache) |
| `sharedGlobals` | Root-level files that affect all projects (currently empty) |

### `affected`
Nx tracks the project dependency graph. `nx affected` runs a target only on projects that are **impacted by your uncommitted changes** — saves time in CI.

```bash
npx nx affected --target=build
npx nx affected --target=lint
```

### Generators
Nx generators scaffold new projects, libraries, and components. Generator defaults are set in `nx.json`:

```json
"generators": {
  "@nx/angular:application": {
    "e2eTestRunner": "playwright",
    "linter": "eslint",
    "style": "scss",
    "unitTestRunner": "vitest-angular"
  }
}
```

Any new Angular app generated with `nx g @nx/angular:application` will automatically use these defaults.

---

## Common Commands

### Development

```bash
# Start all three apps in parallel (shell + mfe1 + mfe2)
npm start
# or
npx nx run-many --target=serve --projects=shell,mfe1,mfe2 --parallel=3

# Start individual apps
npx nx serve shell
npx nx serve mfe1
npx nx serve mfe2
```

### Build

```bash
# Build all apps
npm run build
# or
npx nx run-many --target=build --projects=shell,mfe1,mfe2

# Build a single app
npx nx build shell
```

### Test & Lint

```bash
# Run all unit tests
npm test
# or
npx nx run-many --target=test --projects=shell,mfe1,mfe2

# Run E2E tests
npx nx e2e shell-e2e

# Lint all
npx nx run-many --target=lint --projects=shell,mfe1,mfe2
```

### Nx Utilities

```bash
# Visualize the project dependency graph
npx nx graph

# Run only affected projects (great for CI)
npx nx affected --target=build

# List all projects
npx nx show projects

# See all targets for a project
npx nx show project shell
```
