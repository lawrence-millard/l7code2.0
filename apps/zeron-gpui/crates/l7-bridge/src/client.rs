use anyhow::{Context, Result};
use serde::Deserialize;
use serde_json::Value;

#[derive(Clone, Debug)]
pub struct L7ClientConfig {
    pub http_origin: String,
    pub cookie: Option<String>,
    pub bearer: Option<String>,
}

#[derive(Clone)]
pub struct L7Client {
    http: reqwest::Client,
    origin: String,
    cookie: Option<String>,
    bearer: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EnvironmentMeta {
    pub environment_id: String,
    pub label: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectRow {
    pub id: String,
    pub environment_id: String,
    pub title: Option<String>,
    pub cwd: Option<String>,
    pub workspace_root: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThreadRow {
    pub id: String,
    pub environment_id: String,
    pub project_id: String,
    pub title: Option<String>,
    pub archived_at: Option<String>,
    pub deleted_at: Option<String>,
    pub updated_at: Option<String>,
    pub created_at: Option<String>,
    pub settled_at: Option<String>,
    pub runtime: Option<ThreadRuntime>,
    pub source: Option<ThreadSource>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThreadRuntime {
    pub status: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThreadSource {
    pub latest_visible_message: Option<LatestMessage>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LatestMessage {
    pub text: Option<String>,
}

#[derive(Debug, Clone)]
pub struct ShellSnapshot {
    pub environment_id: String,
    pub environment_label: String,
    pub projects: Vec<ProjectRow>,
    pub threads: Vec<ThreadRow>,
    pub providers: Vec<ProviderRow>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderRow {
    pub instance_id: String,
    pub name: Option<String>,
    pub enabled: Option<bool>,
    pub models: Option<Vec<ModelRow>>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelRow {
    pub slug: String,
    pub name: Option<String>,
}

impl L7Client {
    pub fn new(config: L7ClientConfig) -> Result<Self> {
        let http = reqwest::Client::builder()
            .cookie_store(true)
            .build()
            .context("build reqwest client")?;
        Ok(Self {
            http,
            origin: config.http_origin.trim_end_matches('/').to_owned(),
            cookie: config.cookie,
            bearer: config.bearer,
        })
    }

    fn apply_auth(&self, req: reqwest::RequestBuilder) -> reqwest::RequestBuilder {
        let mut req = req;
        if let Some(cookie) = &self.cookie {
            req = req.header(reqwest::header::COOKIE, cookie);
        }
        if let Some(bearer) = &self.bearer {
            req = req.bearer_auth(bearer);
        }
        req
    }

    pub async fn environment(&self) -> Result<EnvironmentMeta> {
        let url = format!("{}/.well-known/l7/environment", self.origin);
        let value: Value = self
            .apply_auth(self.http.get(url))
            .send()
            .await?
            .error_for_status()?
            .json()
            .await?;
        Ok(EnvironmentMeta {
            environment_id: value
                .get("environmentId")
                .and_then(Value::as_str)
                .unwrap_or("l7-local")
                .to_owned(),
            label: value
                .get("label")
                .and_then(Value::as_str)
                .unwrap_or("L7")
                .to_owned(),
        })
    }

    pub async fn fetch_shell(&self) -> Result<ShellSnapshot> {
        let meta = self.environment().await?;
        let shell_url = format!("{}/api/orchestration/shell", self.origin);
        let shell: Value = self
            .apply_auth(self.http.get(shell_url))
            .send()
            .await?
            .error_for_status()?
            .json()
            .await?;

        let projects = extract_projects(&shell, &meta.environment_id);
        let threads = extract_threads(&shell, &meta.environment_id);
        let providers = extract_providers(&shell);

        Ok(ShellSnapshot {
            environment_id: meta.environment_id,
            environment_label: meta.label,
            projects,
            threads,
            providers,
        })
    }

    /// Best-effort turn start via L7 CLI when available; otherwise returns an error
    /// the UI can surface. Prefer a real WS Effect client in a follow-up.
    pub async fn start_turn_cli(
        &self,
        project_cwd: &str,
        text: &str,
        provider: &str,
        model: &str,
        base_dir: &str,
    ) -> Result<()> {
        let status = tokio::process::Command::new("node")
            .args([
                "apps/server/src/bin.ts",
                "thread",
                "start",
                "--base-dir",
                base_dir,
                "--provider",
                provider,
                "--model",
                model,
                project_cwd,
                text,
            ])
            .current_dir(
                std::env::var("L7_REPO_ROOT").unwrap_or_else(|_| "/workspace".to_owned()),
            )
            .status()
            .await
            .context("spawn l7 thread start")?;
        if !status.success() {
            anyhow::bail!("l7 thread start exited {status}");
        }
        Ok(())
    }
}

fn extract_projects(shell: &Value, environment_id: &str) -> Vec<ProjectRow> {
    let mut out = Vec::new();
    let arrays = [
        shell.pointer("/projects"),
        shell.pointer("/snapshot/projects"),
        shell.pointer("/shell/projects"),
    ];
    for arr in arrays.into_iter().flatten() {
        if let Some(items) = arr.as_array() {
            for item in items {
                let id = item
                    .get("id")
                    .or_else(|| item.get("projectId"))
                    .and_then(Value::as_str)
                    .unwrap_or_default()
                    .to_owned();
                if id.is_empty() {
                    continue;
                }
                let env = item
                    .get("environmentId")
                    .and_then(Value::as_str)
                    .unwrap_or(environment_id)
                    .to_owned();
                out.push(ProjectRow {
                    id,
                    environment_id: env,
                    title: item
                        .get("title")
                        .or_else(|| item.get("name"))
                        .and_then(Value::as_str)
                        .map(str::to_owned),
                    cwd: item.get("cwd").and_then(Value::as_str).map(str::to_owned),
                    workspace_root: item
                        .get("workspaceRoot")
                        .or_else(|| item.get("path"))
                        .and_then(Value::as_str)
                        .map(str::to_owned),
                });
            }
        }
    }
    out
}

fn extract_threads(shell: &Value, environment_id: &str) -> Vec<ThreadRow> {
    let mut out = Vec::new();
    let arrays = [
        shell.pointer("/threads"),
        shell.pointer("/snapshot/threads"),
        shell.pointer("/shell/threads"),
    ];
    for arr in arrays.into_iter().flatten() {
        if let Some(items) = arr.as_array() {
            for item in items {
                let id = item
                    .get("id")
                    .or_else(|| item.get("threadId"))
                    .and_then(Value::as_str)
                    .unwrap_or_default()
                    .to_owned();
                if id.is_empty() {
                    continue;
                }
                let project_id = item
                    .get("projectId")
                    .and_then(Value::as_str)
                    .unwrap_or_default()
                    .to_owned();
                out.push(ThreadRow {
                    id,
                    environment_id: item
                        .get("environmentId")
                        .and_then(Value::as_str)
                        .unwrap_or(environment_id)
                        .to_owned(),
                    project_id,
                    title: item.get("title").and_then(Value::as_str).map(str::to_owned),
                    archived_at: item
                        .get("archivedAt")
                        .and_then(Value::as_str)
                        .map(str::to_owned),
                    deleted_at: item
                        .get("deletedAt")
                        .and_then(Value::as_str)
                        .map(str::to_owned),
                    updated_at: item
                        .get("updatedAt")
                        .and_then(Value::as_str)
                        .map(str::to_owned),
                    created_at: item
                        .get("createdAt")
                        .and_then(Value::as_str)
                        .map(str::to_owned),
                    settled_at: item
                        .get("settledAt")
                        .and_then(Value::as_str)
                        .map(str::to_owned),
                    runtime: item.get("runtime").and_then(|v| {
                        Some(ThreadRuntime {
                            status: v.get("status").and_then(Value::as_str).map(str::to_owned),
                        })
                    }),
                    source: item.get("source").map(|v| ThreadSource {
                        latest_visible_message: v
                            .pointer("/latestVisibleMessage")
                            .map(|m| LatestMessage {
                                text: m.get("text").and_then(Value::as_str).map(str::to_owned),
                            }),
                    }),
                });
            }
        }
    }
    out
}

fn extract_providers(shell: &Value) -> Vec<ProviderRow> {
    let mut out = Vec::new();
    let arrays = [
        shell.pointer("/providers"),
        shell.pointer("/snapshot/providers"),
        shell.pointer("/server/providers"),
    ];
    for arr in arrays.into_iter().flatten() {
        if let Some(items) = arr.as_array() {
            for item in items {
                let instance_id = item
                    .get("instanceId")
                    .and_then(Value::as_str)
                    .unwrap_or_default()
                    .to_owned();
                if instance_id.is_empty() {
                    continue;
                }
                let models = item.get("models").and_then(Value::as_array).map(|models| {
                    models
                        .iter()
                        .filter_map(|m| {
                            let slug = m.get("slug").and_then(Value::as_str)?.to_owned();
                            Some(ModelRow {
                                slug,
                                name: m.get("name").and_then(Value::as_str).map(str::to_owned),
                            })
                        })
                        .collect()
                });
                out.push(ProviderRow {
                    instance_id,
                    name: item.get("name").and_then(Value::as_str).map(str::to_owned),
                    enabled: item.get("enabled").and_then(Value::as_bool),
                    models,
                });
            }
        }
    }
    out
}
