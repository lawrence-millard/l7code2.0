//! Zeron EngineRpc service backed by an L7 Code orchestration server.
//!
//! The headed GPUI app speaks Zeron's typed NDJSON RPC. This crate implements
//! enough of that surface to present L7 projects as spaces and L7 threads as
//! chats/sessions, and to forward composer sends onto L7 `startTurn` over the
//! environment WebSocket when credentials allow.
//!
//! Coverage is intentionally incomplete versus a native Zeron engine: terminals,
//! voice, cloud, CRDT sync, and full harness install stay on native Zeron or
//! return `UnknownMethod` until bridged.

mod client;
mod service;

pub use client::{L7Client, L7ClientConfig};
pub use service::L7BridgeService;
