use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;

use async_trait::async_trait;
use chrono::{DateTime, Utc};
use futures::StreamExt;
use serde_json::{Value, json};
use tokio::sync::{Mutex, RwLock, watch};
use zeron_proto::{
    AccessMode, Chat, ChatConfig, Device, EngineInfo, HarnessId, SandboxLevel, Session,
    SessionStatus, Space, WorkspaceScope,
};
use zeron_rpc::{RpcError, RpcReply, RpcService, methods};

use crate::client::{L7Client, ShellSnapshot};

/// Polling EngineRpc service that mirrors an L7 orchestration shell.
pub struct L7BridgeService {
    client: L7Client,
    device_id: String,
    info: EngineInfo,
    spaces: watch::Sender<Vec<Space>>,
    chats: watch::Sender<Vec<Chat>>,
    sessions: watch::Sender<Vec<Session>>,
    devices: watch::Sender<Vec<Device>>,
    providers: RwLock<Vec<Value>>,
    chat_projects: Mutex<HashMap<String, String>>,
    project_cwds: Mutex<HashMap<String, String>>,
    base_dir: String,
}

impl L7BridgeService {
    pub fn new(client: L7Client, device_id: String, base_dir: String) -> Arc<Self> {
        let (spaces, _) = watch::channel(Vec::new());
        let (chats, _) = watch::channel(Vec::new());
        let (sessions, _) = watch::channel(Vec::new());
        let (devices, _) = watch::channel(vec![Device {
            id: device_id.clone(),
            name: "L7".into(),
            platform: "linux".into(),
            last_seen_at: Some(Utc::now()),
            created_at: Some(Utc::now()),
            version: Some(env!("CARGO_PKG_VERSION").into()),
            cursor_sdk_version: None,
            capabilities: vec!["l7-bridge".into()],
        }]);
        let this = Arc::new(Self {
            client,
            device_id: device_id.clone(),
            info: EngineInfo {
                device_id,
                workspace_scope: WorkspaceScope::Development,
                cursor_sdk_version: None,
                capabilities: vec!["l7-bridge".into()],
            },
            spaces,
            chats,
            sessions,
            devices,
            providers: RwLock::new(Vec::new()),
            chat_projects: Mutex::new(HashMap::new()),
            project_cwds: Mutex::new(HashMap::new()),
            base_dir,
        });
        let poller = this.clone();
        tokio::spawn(async move {
            loop {
                if let Err(err) = poller.refresh().await {
                    tracing::warn!(error = %err, "l7 bridge refresh failed");
                }
                tokio::time::sleep(Duration::from_secs(2)).await;
            }
        });
        this
    }

    async fn refresh(&self) -> anyhow::Result<()> {
        let snap = self.client.fetch_shell().await?;
        self.apply_snapshot(snap).await;
        Ok(())
    }

    async fn apply_snapshot(&self, snap: ShellSnapshot) {
        let mut spaces = Vec::new();
        let mut project_cwds = HashMap::new();
        for project in &snap.projects {
            let path = project
                .workspace_root
                .clone()
                .or_else(|| project.cwd.clone())
                .unwrap_or_else(|| format!("/tmp/l7-{}", project.id));
            project_cwds.insert(project.id.clone(), path.clone());
            spaces.push(Space {
                id: format!("{}:{}", project.environment_id, project.id),
                device_id: self.device_id.clone(),
                path,
                name: project.title.clone(),
                git_detected: true,
                git_checked_at: None,
                checkout_id: None,
                repository_id: None,
                github_repo: None,
                created_at: Utc::now(),
            });
        }
        *self.project_cwds.lock().await = project_cwds;

        let mut chats = Vec::new();
        let mut sessions = Vec::new();
        let mut chat_projects = HashMap::new();
        for thread in snap.threads.iter().filter(|t| t.deleted_at.is_none()) {
            let space_id = format!("{}:{}", thread.environment_id, thread.project_id);
            chat_projects.insert(thread.id.clone(), thread.project_id.clone());
            let updated = parse_time(thread.updated_at.as_deref())
                .or_else(|| parse_time(thread.created_at.as_deref()))
                .unwrap_or_else(Utc::now);
            let preview = thread
                .source
                .as_ref()
                .and_then(|s| s.latest_visible_message.as_ref())
                .and_then(|m| m.text.clone());
            chats.push(Chat {
                id: thread.id.clone(),
                device_id: self.device_id.clone(),
                title: thread.title.clone(),
                archived: thread.archived_at.is_some() || thread.settled_at.is_some(),
                cwd: snap
                    .projects
                    .iter()
                    .find(|p| p.id == thread.project_id)
                    .and_then(|p| p.workspace_root.clone().or_else(|| p.cwd.clone())),
                branch: None,
                checkout_id: None,
                source_context: None,
                config: Some(ChatConfig {
                    harness: HarnessId::Codex,
                    model: None,
                    reasoning: None,
                    model_options: Default::default(),
                    sandbox: SandboxLevel::WorkspaceWrite,
                    access: AccessMode::FullAccess,
                    plan: false,
                }),
                last_message_preview: preview,
                last_message_at: Some(updated),
                created_at: parse_time(thread.created_at.as_deref()).unwrap_or(updated),
                harness_session_id: None,
                harness_session_cwd: None,
                harness_session_harness: None,
                space_id: Some(space_id),
                last_seen_at: None,
                room_gen: None,
                parent_chat_id: None,
            });
            let status = match thread
                .runtime
                .as_ref()
                .and_then(|r| r.status.as_deref())
                .unwrap_or("idle")
            {
                "running" | "starting" | "queued" | "preparing" | "waiting" => {
                    SessionStatus::Working
                }
                "failed" => SessionStatus::Errored,
                _ => SessionStatus::Idle,
            };
            sessions.push(Session {
                last_turn_outcome: None,
                terminal_activity: None,
                last_completed_turn: None,
                chat_id: thread.id.clone(),
                device_id: self.device_id.clone(),
                status,
                started_at: None,
                updated_at: updated,
                running_subagents: 0,
                background_tasks: Vec::new(),
            });
        }
        *self.chat_projects.lock().await = chat_projects;

        let providers: Vec<Value> = snap
            .providers
            .iter()
            .map(|p| {
                json!({
                    "id": map_provider_harness(&p.instance_id),
                    "name": p.name.clone().unwrap_or_else(|| p.instance_id.clone()),
                    "supportsSteering": false,
                    "steeringMode": "turnBoundary",
                    "reasoningLevels": ["none", "low", "medium", "high"],
                    "installed": true,
                    "canInstall": false,
                    "enabled": p.enabled.unwrap_or(true),
                    "accessModes": ["fullAccess"],
                    "supportsPlan": false,
                })
            })
            .collect();
        *self.providers.write().await = if providers.is_empty() {
            vec![json!({
                "id": "codex",
                "name": "L7 / Codex",
                "supportsSteering": false,
                "steeringMode": "turnBoundary",
                "reasoningLevels": ["none", "low", "medium", "high"],
                "installed": true,
                "canInstall": false,
                "enabled": true,
                "accessModes": ["fullAccess"],
                "supportsPlan": false,
            })]
        } else {
            providers
        };

        let _ = self.spaces.send(spaces);
        let _ = self.chats.send(chats);
        let _ = self.sessions.send(sessions);
        let _ = self.devices.send(vec![Device {
            id: self.device_id.clone(),
            name: snap.environment_label,
            platform: "linux".into(),
            last_seen_at: Some(Utc::now()),
            created_at: Some(Utc::now()),
            version: Some(env!("CARGO_PKG_VERSION").into()),
            cursor_sdk_version: None,
            capabilities: vec!["l7-bridge".into()],
        }]);
    }

    async fn handle_mutate(&self, params: Value) -> Result<RpcReply, RpcError> {
        let op = params
            .get("op")
            .and_then(Value::as_str)
            .unwrap_or_default();
        match op {
            "createChat" => {
                let chat_id = params
                    .get("chatId")
                    .and_then(Value::as_str)
                    .unwrap_or_default()
                    .to_owned();
                if let Some(space_id) = params.get("spaceId").and_then(Value::as_str) {
                    if let Some((_, project_id)) = space_id.split_once(':') {
                        self.chat_projects
                            .lock()
                            .await
                            .insert(chat_id.clone(), project_id.to_owned());
                    }
                }
                let mut chats = self.chats.borrow().clone();
                if !chats.iter().any(|c| c.id == chat_id) {
                    chats.insert(
                        0,
                        Chat {
                            id: chat_id,
                            device_id: self.device_id.clone(),
                            title: Some("New session".into()),
                            archived: false,
                            cwd: None,
                            branch: None,
                            checkout_id: None,
                            source_context: None,
                            config: None,
                            last_message_preview: None,
                            last_message_at: Some(Utc::now()),
                            created_at: Utc::now(),
                            harness_session_id: None,
                            harness_session_cwd: None,
                            harness_session_harness: None,
                            space_id: params
                                .get("spaceId")
                                .and_then(Value::as_str)
                                .map(str::to_owned),
                            last_seen_at: None,
                            room_gen: None,
                            parent_chat_id: None,
                        },
                    );
                    let _ = self.chats.send(chats);
                }
                Ok(RpcReply::Value(json!({ "ok": true })))
            }
            "renameChat" | "setChatArchived" | "deleteChat" | "markChatSeen" | "renameSpace"
            | "deleteSpace" | "createSpace" => Ok(RpcReply::Value(json!({ "ok": true }))),
            other => Err(RpcError::Failed(format!(
                "l7 bridge does not implement mutate op {other}"
            ))),
        }
    }

    async fn handle_queue_message(&self, params: Value) -> Result<RpcReply, RpcError> {
        let chat_id = params
            .get("chatId")
            .and_then(Value::as_str)
            .ok_or_else(|| RpcError::BadParams("chatId required".into()))?
            .to_owned();
        let text = params
            .get("text")
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_owned();
        if text.trim().is_empty() {
            return Err(RpcError::BadParams("empty text".into()));
        }
        let project_id = self
            .chat_projects
            .lock()
            .await
            .get(&chat_id)
            .cloned()
            .ok_or_else(|| RpcError::Failed("chat has no L7 project mapping".into()))?;
        let cwd = self
            .project_cwds
            .lock()
            .await
            .get(&project_id)
            .cloned()
            .unwrap_or_else(|| "/workspace".into());
        let provider = std::env::var("L7_BRIDGE_PROVIDER").unwrap_or_else(|_| "devReplay".into());
        let model = std::env::var("L7_BRIDGE_MODEL").unwrap_or_else(|_| "showcase".into());
        self.client
            .start_turn_cli(&cwd, &text, &provider, &model, &self.base_dir)
            .await
            .map_err(|e| RpcError::Failed(e.to_string()))?;
        Ok(RpcReply::Value(
            json!({ "id": uuid::Uuid::new_v4().to_string(), "sent": true }),
        ))
    }
}

fn parse_time(raw: Option<&str>) -> Option<DateTime<Utc>> {
    raw.and_then(|s| DateTime::parse_from_rfc3339(s).ok())
        .map(|dt| dt.with_timezone(&Utc))
}

fn map_provider_harness(instance_id: &str) -> &'static str {
    let lower = instance_id.to_ascii_lowercase();
    if lower.contains("claude") {
        "claude-code"
    } else if lower.contains("cursor") {
        "cursor"
    } else if lower.contains("opencode") {
        "opencode"
    } else if lower.contains("grok") {
        "grok"
    } else {
        "codex"
    }
}

fn watch_stream_json<T: Clone + serde::Serialize + Send + Sync + 'static>(
    mut rx: watch::Receiver<T>,
) -> RpcReply {
    let initial = serde_json::to_value(rx.borrow_and_update().clone()).unwrap_or(Value::Null);
    RpcReply::Stream(
        futures::stream::once(async move { initial })
            .chain(futures::stream::unfold(rx, |mut rx| async move {
                if rx.changed().await.is_err() {
                    return None;
                }
                let value = rx.borrow().clone();
                let item = serde_json::to_value(value).ok()?;
                Some((item, rx))
            }))
            .boxed(),
    )
}

#[async_trait]
impl RpcService for L7BridgeService {
    async fn handle(&self, method: &str, params: Value) -> Result<RpcReply, RpcError> {
        match method {
            methods::ENGINE_INFO => RpcReply::value(&self.info),
            methods::ENGINE_READY => RpcReply::value(&json!({ "ready": true })),
            methods::LOCAL_DEVICE => RpcReply::value(&json!({ "deviceId": self.device_id })),
            methods::LIST_HARNESSES => {
                let providers = self.providers.read().await.clone();
                Ok(RpcReply::Value(Value::Array(providers)))
            }
            methods::LIST_MODELS => {
                let harness = params
                    .get("harness")
                    .and_then(Value::as_str)
                    .unwrap_or("codex");
                Ok(RpcReply::Value(json!([{
                    "id": format!("{harness}/default"),
                    "name": "L7 default",
                    "harness": harness,
                }])))
            }
            methods::WATCH_SPACES => Ok(watch_stream_json(self.spaces.subscribe())),
            methods::WATCH_CHATS => Ok(watch_stream_json(self.chats.subscribe())),
            methods::WATCH_SESSIONS => Ok(watch_stream_json(self.sessions.subscribe())),
            methods::WATCH_DEVICES => Ok(watch_stream_json(self.devices.subscribe())),
            methods::WATCH_CONNECTIVITY => Ok(RpcReply::Stream(
                futures::stream::once(async {
                    json!({ "state": "local", "detail": "l7-bridge" })
                })
                .chain(futures::stream::pending())
                .boxed(),
            )),
            methods::WATCH_SIDEBAR_PREFERENCES => Ok(RpcReply::Stream(
                futures::stream::once(async { json!({ "pins": [] }) })
                    .chain(futures::stream::pending())
                    .boxed(),
            )),
            methods::WATCH_QUEUE => Ok(RpcReply::Stream(
                futures::stream::once(async { json!({ "items": [] }) })
                    .chain(futures::stream::pending())
                    .boxed(),
            )),
            methods::WATCH_DOC_MESSAGES => Ok(RpcReply::Stream(
                futures::stream::once(async { json!({ "reset": [] }) })
                    .chain(futures::stream::pending())
                    .boxed(),
            )),
            methods::FOCUS_CHAT => Ok(RpcReply::Value(json!({}))),
            methods::SET_VIEWPORT_FOCUS => Ok(RpcReply::Value(json!({}))),
            methods::PROBE_SYNC => Ok(RpcReply::Value(json!({}))),
            methods::SYNC_STATUS => Ok(RpcReply::Value(json!({ "rooms": [] }))),
            methods::GET_TITLE_SETTINGS => Ok(RpcReply::Value(json!({}))),
            methods::LIST_SKILLS => Ok(RpcReply::Value(json!([]))),
            methods::LIST_COMMANDS => Ok(RpcReply::Value(json!([]))),
            methods::MUTATE => self.handle_mutate(params).await,
            methods::QUEUE_MESSAGE | methods::SEND_QUEUED_MESSAGE_NOW => {
                self.handle_queue_message(params).await
            }
            other => Err(RpcError::UnknownMethod(other.into())),
        }
    }
}
