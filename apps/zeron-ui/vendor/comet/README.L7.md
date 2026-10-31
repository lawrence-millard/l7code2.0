# Vendored Zeron/Comet (selective)

Source: https://github.com/zeronsh/comet (MIT)

This tree is a **selective vendor** of Comet for L7 Code:
- Architecture + feature inventory (UI IA reference)
- `crates/proto` and `crates/theme` (wire/theme vocabulary)
- Frost/glass/surface chrome + sidebar/composer UI sources (GPUI reference)

L7 does **not** ship the GPUI binary as the web client. The React client in
`apps/zeron-ui` is a structural Zeron clone that drives the L7 orchestration
backend through the adapter in `src/adapter`.

Full Comet clone for desktop/headless adapter work:
`git clone https://github.com/zeronsh/comet.git`
