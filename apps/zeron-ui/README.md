# `@l7code/zeron-ui`

Structural **Zeron/Comet** client for L7 Code. This package **replaces** the former
T3 React web shell (`apps/web`).

## Architecture

- **UI** (`src/zeron/`): Zeron information architecture — searchable Spaces rail,
  attention-sorted Sessions, new-session canvas, frost/glass chrome.
- **Adapter** (`src/adapter/`): maps Zeron spaces/sessions ↔ L7 projects/threads
  and composer sends ↔ orchestration `startTurn` (including create-thread bootstrap).
- **Backend**: unchanged L7 server (WS/RPC, providers, projects, Boat).
- **Vendor** (`vendor/comet/`): selective checkout of [zeronsh/comet](https://github.com/zeronsh/comet)
  (architecture, proto/theme, frost/glass/sidebar/composer sources) for reference.
  GPUI does not ship as the web client; desktop/headless Comet can later attach via
  the same adapter contract.

## Run

```bash
vp run --filter @l7code/zeron-ui dev
# or from repo root
npm run dev
```
