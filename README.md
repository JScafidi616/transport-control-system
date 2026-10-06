# Transport Control System

Monorepo for a small private taxi management service. It combines Flutter client apps (mobile and web), a Cloudflare Workers backend, and a shared package used across the codebase.

![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)
![Flutter](https://img.shields.io/badge/Flutter-mobile%20%26%20web-02569B?logo=flutter)
![Cloudflare Workers](https://img.shields.io/badge/backend-Cloudflare%20Workers-F38020?logo=cloudflare)

---

## Table of Contents

- [Overview](#overview)
- [Tech Stack](#tech-stack)
- [Repository Structure](#repository-structure)
- [Prerequisites](#prerequisites)
- [Getting Started](#getting-started)
- [Backend](#backend)
- [Flutter Apps](#flutter-apps)
- [Available Scripts](#available-scripts)
- [Testing and Quality](#testing-and-quality)
- [Deployment](#deployment)
- [Contributing](#contributing)
- [License](#license)

---

## Overview

Transport Control System is a monorepo for managing the operations of a small private taxi service. A single repository holds:

- **Client apps** built with Flutter, targeting Android (mobile) and the web.
- **A serverless backend** running on Cloudflare Workers, deployed with Wrangler.
- **Shared code** in `packages/shared`, reused between workspaces.

JavaScript/TypeScript tooling is managed with **pnpm** workspaces, and Dart/Flutter packages are managed with **Melos**.

## Tech Stack

| Area | Technology |
| --- | --- |
| Mobile and web clients | Flutter / Dart (SDK `>=3.0.0 <4.0.0`) |
| Dart monorepo tooling | [Melos](https://melos.invert.dev) `^8.0.0` |
| Backend runtime | Cloudflare Workers (`workerd`) |
| Backend tooling | Wrangler, esbuild |
| JS package manager | pnpm workspaces |
| Database | Managed through migration scripts (`db:migrate:local`, `db:migrate:remote`, `db:list`) |
| License | Apache-2.0 |

## Repository Structure

```
transport-control-system/
├── apps/                  # Flutter applications (mobile, web)
├── backend/               # Cloudflare Workers backend (transport-control-backend)
├── packages/
│   └── shared/            # Shared package used across workspaces
├── melos.yaml             # Melos config for Dart/Flutter packages
├── pubspec.yaml           # Root Dart workspace (name: transport_control)
├── package.json           # Root scripts that proxy to the backend
├── pnpm-workspace.yaml    # pnpm workspace definition (backend)
├── LICENSE                # Apache License 2.0
└── ...
```

Melos discovers Dart packages under `apps/**` and `packages/**`. The pnpm workspace currently includes the `backend` package.

## Prerequisites

Install the following before you begin:

- [Flutter SDK](https://docs.flutter.dev/get-started/install) (with Dart `>=3.0.0 <4.0.0`)
- [Node.js](https://nodejs.org/) (a current LTS release)
- [pnpm](https://pnpm.io/installation)
- [Melos](https://melos.invert.dev) (installed as a dev dependency, or globally via `dart pub global activate melos`)
- A [Cloudflare account](https://dash.cloudflare.com/sign-up) for deploying the backend
- Android SDK / Android Studio if you plan to build the mobile APK

## Getting Started

### 1. Clone the repository

```bash
git clone https://github.com/JScafidi616/transport-control-system.git
cd transport-control-system
```

### 2. Install backend dependencies

```bash
pnpm install
```

### 3. Bootstrap the Flutter workspace

```bash
dart pub get
melos bootstrap
```

`melos bootstrap` runs `pub get` in parallel for every package under `apps/` and `packages/`.

## Backend

The backend lives in `backend/` and is published as the `transport-control-backend` workspace package. It runs on Cloudflare Workers, and the root `package.json` provides shortcuts so you can run everything from the repository root.

### Run locally

```bash
pnpm backend:dev
```

### Database migrations

```bash
pnpm db:migrate:local    # apply migrations to the local database
pnpm db:migrate:remote   # apply migrations to the remote (production) database
pnpm db:list             # list database information
```

### Type checking and tests

```bash
pnpm typecheck
pnpm test
```

### Deploy

```bash
pnpm backend:deploy
```

> Make sure you are authenticated with Cloudflare (`wrangler login`) and that your Worker configuration and bindings are set up before deploying.

## Flutter Apps

The Flutter apps live under `apps/`. Melos provides common tasks across all packages.

### Build the Android APK

```bash
melos run build:mobile
```

This runs `flutter build apk` inside `apps/mobile`.

### Build the web app

```bash
melos run build:web
```

This runs `flutter build web` inside `apps/web`.

## Available Scripts

### Root `package.json` (pnpm)

| Script | Description |
| --- | --- |
| `pnpm backend:dev` | Start the backend dev server |
| `pnpm backend:deploy` | Deploy the backend |
| `pnpm test` | Run backend tests |
| `pnpm typecheck` | Type-check the backend |
| `pnpm db:migrate:local` | Run migrations locally |
| `pnpm db:migrate:remote` | Run migrations on the remote database |
| `pnpm db:list` | List database information |

### Melos scripts (`melos.yaml`)

| Script | Description |
| --- | --- |
| `melos run analyze` | Run `flutter analyze` in all packages |
| `melos run test` | Run `flutter test` in all packages that have a `test` directory |
| `melos run format` | Format all Dart files with `dart format` |
| `melos run build:mobile` | Build the Android APK |
| `melos run build:web` | Build the Flutter web app |
| `melos run clean` | Run `flutter clean` in all packages |

## Testing and Quality

```bash
# Backend
pnpm typecheck
pnpm test

# Flutter / Dart
melos run analyze
melos run test
melos run format
```

## Deployment

- **Backend:** deployed to Cloudflare Workers with `pnpm backend:deploy`. Apply database changes first with `pnpm db:migrate:remote`.
- **Web app:** build with `melos run build:web` and host the contents of `apps/web/build/web` on any static hosting provider (for example Cloudflare Pages).
- **Android app:** build with `melos run build:mobile` and distribute the generated APK from `apps/mobile/build/app/outputs/flutter-apk/`.

## Contributing

Contributions are welcome.

1. Fork the repository.
2. Create a feature branch: `git checkout -b feature/my-feature`.
3. Make your changes and run the checks in [Testing and Quality](#testing-and-quality).
4. Commit with a clear message and push your branch.
5. Open a pull request against `master`.

## License

This project is licensed under the [Apache License 2.0](LICENSE).
