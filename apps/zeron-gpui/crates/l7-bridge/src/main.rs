//! `zeron-l7-bridge` — serve Zeron EngineRpc over localhost IPC, backed by L7.
//!
//! ```text
//! L7_HTTP_ORIGIN=http://127.0.0.1:13773 \
//! L7_SESSION_COOKIE='l7_session_…=…' \
//! zeron-l7-bridge --port 9475 --data-dir ~/.zeron-l7
//!
//! ZERON_IPC_PORT=9475 ZERON_DATA_DIR=~/.zeron-l7 zeron
//! ```

use std::path::PathBuf;
use std::sync::Arc;

use clap::Parser;
use tracing_subscriber::EnvFilter;
use zeron_l7_bridge::{L7BridgeService, L7Client, L7ClientConfig};
use zeron_rpc::RpcService;

#[derive(Parser, Debug)]
#[command(name = "zeron-l7-bridge", about = "Zeron EngineRpc ↔ L7 orchestration bridge")]
struct Args {
    /// Localhost IPC port the GPUI app dials (`ZERON_IPC_PORT`).
    #[arg(long, default_value_t = 9475)]
    port: u16,
    /// Data dir for the IPC bearer token file.
    #[arg(long)]
    data_dir: Option<PathBuf>,
    /// L7 HTTP origin (server or Vite single-origin).
    #[arg(long, env = "L7_HTTP_ORIGIN")]
    l7_origin: Option<String>,
    /// Optional `name=value` session cookie for L7 auth.
    #[arg(long, env = "L7_SESSION_COOKIE")]
    cookie: Option<String>,
    /// Optional bearer token for L7 auth.
    #[arg(long, env = "L7_BEARER")]
    bearer: Option<String>,
    /// L7 `--base-dir` for CLI turn starts.
    #[arg(long, env = "L7_BASE_DIR")]
    base_dir: Option<PathBuf>,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(EnvFilter::from_default_env().add_directive("info".parse()?))
        .init();

    let args = Args::parse();
    let origin = args
        .l7_origin
        .or_else(|| std::env::var("L7_HTTP_ORIGIN").ok())
        .unwrap_or_else(|| "http://127.0.0.1:13773".into());
    let data_dir = args.data_dir.unwrap_or_else(|| {
        dirs_fallback()
            .join("zeron-l7")
    });
    std::fs::create_dir_all(&data_dir)?;
    let base_dir = args
        .base_dir
        .unwrap_or_else(|| PathBuf::from("/home/ubuntu/.l7/dev"))
        .display()
        .to_string();

    let client = L7Client::new(L7ClientConfig {
        http_origin: origin.clone(),
        cookie: args.cookie.or_else(|| std::env::var("L7_SESSION_COOKIE").ok()),
        bearer: args.bearer.or_else(|| std::env::var("L7_BEARER").ok()),
    })?;

    let device_id = format!("l7-{}", uuid::Uuid::new_v4());
    let service: Arc<dyn RpcService> = L7BridgeService::new(client, device_id, base_dir);
    // Warm once before accepting clients.
    let _ = service
        .handle(zeron_rpc::methods::ENGINE_READY, serde_json::json!({}))
        .await;

    tracing::info!(%origin, port = args.port, data_dir = %data_dir.display(), "starting L7 bridge IPC");
    let server = serve_ipc(args.port, &data_dir, service).await?;
    tokio::signal::ctrl_c().await?;
    tracing::info!("shutting down L7 bridge");
    server.abort();
    Ok(())
}

async fn serve_ipc(
    port: u16,
    data_dir: &std::path::Path,
    service: Arc<dyn RpcService>,
) -> std::io::Result<tokio::task::JoinHandle<()>> {
    let token = zeron_rpc::ipc_auth::issue_token(data_dir)?;
    let listener = tokio::net::TcpListener::bind(("127.0.0.1", port)).await?;
    Ok(tokio::spawn(zeron_rpc::serve_ws_listener(
        listener, service, token,
    )))
}

fn dirs_fallback() -> PathBuf {
    std::env::var_os("HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("/tmp"))
        .join(".local/share")
}
