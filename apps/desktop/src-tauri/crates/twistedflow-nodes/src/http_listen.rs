//! HTTP Listen node — starts a simple HTTP server.
//!
//! Binds to a port, accepts requests. For each request, stores request
//! data as outputs and runs the `exec-request` sub-chain. The Send Response
//! node in the chain writes the response back via a shared response slot.

use twistedflow_macros::node;
use twistedflow_engine::node::{Node, NodeCtx, NodeResult};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::future::Future;
use std::pin::Pin;
use std::sync::Arc;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpListener;
use tokio::sync::Mutex;

/// Global response channel: the Listen node stores a sender, SendResponse writes to it.
/// Keyed by node_id of the Listen node.
static RESPONSE_CHANNELS: std::sync::LazyLock<
    std::sync::Mutex<HashMap<String, Arc<Mutex<Option<HttpResponseData>>>>>,
> = std::sync::LazyLock::new(|| std::sync::Mutex::new(HashMap::new()));

#[derive(Clone)]
pub struct HttpResponseData {
    pub status: u16,
    pub headers: HashMap<String, String>,
    pub body: String,
}

/// Get or create a response slot for a listen node.
pub fn get_response_slot(listen_node_id: &str) -> Arc<Mutex<Option<HttpResponseData>>> {
    let mut map = RESPONSE_CHANNELS.lock().unwrap();
    map.entry(listen_node_id.to_string())
        .or_insert_with(|| Arc::new(Mutex::new(None)))
        .clone()
}

#[node(
    name = "HTTP Listen",
    type_id = "httpListen",
    category = "HTTP Server",
    description = "Start an HTTP server. Each request fires the request chain."
)]
pub struct HttpListenNode;

impl Node for HttpListenNode {
    fn execute<'a>(
        &'a self,
        ctx: NodeCtx<'a>,
    ) -> Pin<Box<dyn Future<Output = NodeResult> + Send + 'a>> {
        Box::pin(async move {
            let port = ctx.node_data.get("port")
                .and_then(|v| v.as_u64())
                .unwrap_or(3000) as u16;
            let max_requests = ctx.node_data.get("maxRequests")
                .and_then(|v| v.as_u64())
                .unwrap_or(0);

            let listener = match TcpListener::bind(format!("0.0.0.0:{}", port)).await {
                Ok(l) => l,
                Err(e) => {
                    return NodeResult::Error {
                        message: format!("Failed to bind port {}: {}", port, e),
                        raw_response: None,
                    };
                }
            };

            println!("[HTTP Listen] Serving on http://0.0.0.0:{}", port);

            let response_slot = get_response_slot(ctx.node_id);

            // Store the listen node ID in outputs so SendResponse can find the slot
            {
                let mut out = ctx.outputs.lock().await;
                out.entry(ctx.node_id.to_string())
                    .or_default()
                    .insert("_listenNodeId".into(), Value::String(ctx.node_id.to_string()));
            }

            let mut request_count: u64 = 0;

            loop {
                if ctx.opts.cancel.is_cancelled() {
                    break;
                }

                let mut stream = tokio::select! {
                    result = listener.accept() => {
                        match result {
                            Ok((stream, _)) => stream,
                            Err(e) => {
                                eprintln!("[HTTP Listen] Accept error: {}", e);
                                continue;
                            }
                        }
                    }
                    _ = ctx.opts.cancel.cancelled() => { break; }
                };

                // Read request
                let mut buf = vec![0u8; 65536];
                let n = match stream.read(&mut buf).await {
                    Ok(n) if n > 0 => n,
                    _ => continue,
                };
                let raw = String::from_utf8_lossy(&buf[..n]);

                let (head, body_str) = raw.split_once("\r\n\r\n").unwrap_or((&raw, ""));
                let mut lines = head.lines();
                let request_line = lines.next().unwrap_or("");
                let parts: Vec<&str> = request_line.split_whitespace().collect();
                let method = parts.first().unwrap_or(&"GET").to_string();
                let full_path = parts.get(1).unwrap_or(&"/").to_string();
                let (path, query) = full_path.split_once('?').unwrap_or((&full_path, ""));

                let mut headers = HashMap::new();
                for line in lines {
                    if let Some((k, v)) = line.split_once(':') {
                        headers.insert(k.trim().to_lowercase(), v.trim().to_string());
                    }
                }

                let body: Value = if body_str.is_empty() {
                    Value::Null
                } else {
                    serde_json::from_str(body_str).unwrap_or(Value::String(body_str.to_string()))
                };

                request_count += 1;

                // Store request data
                {
                    let mut out = ctx.outputs.lock().await;
                    let entry = out.entry(ctx.node_id.to_string()).or_default();
                    entry.insert("method".into(), Value::String(method.clone()));
                    entry.insert("path".into(), Value::String(path.to_string()));
                    entry.insert("query".into(), Value::String(query.to_string()));
                    entry.insert("headers".into(), json!(headers));
                    entry.insert("body".into(), body);
                    entry.insert("requestCount".into(), json!(request_count));
                    entry.insert("_listenNodeId".into(), Value::String(ctx.node_id.to_string()));
                }

                // Clear previous response
                *response_slot.lock().await = None;

                // Run the request handler chain
                if let Some(start_id) = ctx.index.next_exec(ctx.node_id, "exec-request") {
                    let _ = ctx.run_chain_sync(start_id.to_owned()).await;
                }

                // Read response from slot (SendResponse writes here)
                let resp = response_slot.lock().await.clone().unwrap_or(HttpResponseData {
                    status: 200,
                    headers: HashMap::new(),
                    body: r#"{"status":"ok"}"#.into(),
                });

                // Send HTTP response
                let mut resp_headers = String::new();
                for (k, v) in &resp.headers {
                    resp_headers.push_str(&format!("{}: {}\r\n", k, v));
                }
                if !resp.headers.contains_key("content-type") {
                    resp_headers.push_str("Content-Type: application/json\r\n");
                }
                resp_headers.push_str(&format!("Content-Length: {}\r\n", resp.body.len()));
                resp_headers.push_str("Connection: close\r\n");

                let response = format!(
                    "HTTP/1.1 {} {}\r\n{}\r\n{}",
                    resp.status,
                    status_text(resp.status),
                    resp_headers,
                    resp.body,
                );
                let _ = stream.write_all(response.as_bytes()).await;
                let _ = stream.flush().await;

                if max_requests > 0 && request_count >= max_requests {
                    break;
                }
            }

            // Cleanup
            {
                RESPONSE_CHANNELS.lock().unwrap().remove(ctx.node_id);
            }

            println!("[HTTP Listen] Server stopped after {} request(s)", request_count);

            NodeResult::Continue {
                output: Some(json!({
                    "port": port,
                    "requestsHandled": request_count,
                })),
            }
        })
    }
}

fn status_text(code: u16) -> &'static str {
    match code {
        200 => "OK",
        201 => "Created",
        204 => "No Content",
        301 => "Moved Permanently",
        302 => "Found",
        400 => "Bad Request",
        401 => "Unauthorized",
        403 => "Forbidden",
        404 => "Not Found",
        500 => "Internal Server Error",
        _ => "OK",
    }
}
