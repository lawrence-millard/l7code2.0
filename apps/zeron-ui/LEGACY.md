# Legacy React structural clone

`apps/zeron-ui` is a **demoted** React structural clone of Zeron used during the
L7 adapter spike. The product UI is the **GPUI** binary vendored at
`apps/zeron-gpui` with `zeron-l7-bridge`.

Do not treat this package as the default client. Prefer:

```bash
cd apps/zeron-gpui && cargo run -p zeron --release
```

with `zeron-l7-bridge` pointed at a running L7 server (see
`apps/zeron-gpui/README.L7.md`).
