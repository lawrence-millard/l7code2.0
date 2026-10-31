# L7 Code (GPUI) on L7 orchestration

This tree vendors [zeronsh/zeron](https://github.com/zeronsh/zeron) (MIT) as the
upstream GPUI engine/UI. **User-facing product branding is L7 Code** (window
titles, welcome, menus). Upstream crate/binary names stay `zeron*` for the
vendor. The React client under `apps/zeron-ui` is demoted.

## L7 bridge

`crates/l7-bridge` (`zeron-l7-bridge`) implements Zeron `EngineRpc` against an
L7 Code orchestration server:

| Zeron RPC | L7 source |
| --- | --- |
| `WatchSpaces` | `/api/orchestration/shell` projects |
| `WatchChats` / `WatchSessions` | shell threads |
| `ListHarnesses` / `ListModels` | shell providers (mapped) |
| `Mutate(createChat)` | local optimistic + project mapping |
| `QueueMessage` | `node apps/server/src/bin.ts thread start` (dev) |

```bash
# Terminal A — L7 server (repo root)
vp run dev

# Terminal B — bridge
L7_HTTP_ORIGIN=http://127.0.0.1:13773 \
L7_SESSION_COOKIE='l7_session_…=…' \
cargo run -p zeron-l7-bridge -- --port 9475 --data-dir ~/.local/share/zeron-l7

# Terminal C — real GPUI app
ZERON_IPC_PORT=9475 ZERON_DATA_DIR=~/.local/share/zeron-l7 \
  ./target/release/zeron
```

Native engine mode (no L7) still works: run `zeron` without the bridge.

## Build

```bash
cd apps/zeron-gpui
rustup override set stable   # edition 2024
cargo build -p zeron --release
cargo build -p zeron-l7-bridge --release
```

Linux needs X11/Wayland + xkbcommon (+ optional WebKitGTK for the in-app browser).
See upstream `docs/reference/linux-browser.md`.
