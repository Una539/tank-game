// Tank Game — 坦克大战
// Copyright (C) 2026 Una
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published
// by the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program. If not, see <https://www.gnu.org/licenses/>.

use std::net::SocketAddr;
use std::sync::Arc;

use futures_util::{SinkExt, StreamExt};
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::{broadcast, mpsc};
use tokio_tungstenite::{accept_async, tungstenite::Message};
use tracing::{error, info, warn};

use tank_server::protocol::{ClientPacket, ServerPacket};
use tank_server::rooms::{run_game_loop, RoomManager};

/**
 * 应用全局状态。
 * 使用 Arc 包装：tokio 的每个连接处理任务（handle_connection）都可能需要访问 RoomManager，
 * Arc 允许多个任务共享同一所有权。
 */
pub struct AppState {
    /// 房间管理器。处理所有房间的创建、加入、离开、游戏启动逻辑。
    /// 使用 Arc 因为多个并发连接需要共享同一个 RoomManager 实例。
    pub room_manager: Arc<RoomManager>,

    /// 服务器关闭信号广播。用于优雅关闭时通知所有任务。
    pub shutdown_tx: broadcast::Sender<()>,
}

/**
 * 单个 WebSocket 连接的状态。
 * 每个连接独立维护此结构，包含玩家身份、所在房间和广播接收器。
 */
struct ConnectionState {
    /// 服务器为每个连接分配的唯一玩家 ID。使用 UUID v4，与前端 `client.playerId` 对应。
    player_id: uuid::Uuid,

    /// 当前所在的房间 ID。None 表示未加入任何房间（如刚连接时）。
    room_id: Option<String>,

    /// 房间广播接收器。加入房间后从 Room 的 broadcast_tx 订阅获得，
    /// 用于接收该房间的 State、RoomUpdate、GameStart 等广播消息。
    broadcast_rx: Option<broadcast::Receiver<Vec<u8>>>,
}

/**
 * 处理单个 WebSocket 连接。
 * 这是服务器的核心请求处理函数，采用"事件循环"模式：
 * 持续读取客户端消息，根据包类型分发到不同的处理逻辑。
 * 与前端 `src/network/client.ts` 的 `handleMessage` 对应，互为协议的两端。
 *
 * 为什么用 async fn + tokio：Rust 异步网络编程的标准做法，
 * 单个线程可并发处理数千连接（epoll/kqueue/io_uring），避免每连接一线程的内存开销。
 *
 * @param stream - TCP 连接流
 * @param addr - 客户端地址，用于日志记录
 * @param state - 共享的应用状态
 */
async fn handle_connection(stream: TcpStream, addr: SocketAddr, state: Arc<AppState>) {
    info!("New connection from: {}", addr);

    // WebSocket 握手。accept_async 将 TCP 流升级为 WebSocket 流。
    let ws_stream = match accept_async(stream).await {
        Ok(ws) => ws,
        Err(e) => {
            error!("WebSocket handshake error: {}", e);
            return;
        }
    };

    // 拆分 WebSocket 流为发送端（sink）和接收端（stream），
    // 这是 futures-util 的标准做法，允许独立处理读写。
    let (sender, mut read) = ws_stream.split();

    // mpsc 通道：用于将协议包从"业务逻辑线程"传给"发送任务"。
    // 为什么用 mpsc 而非直接 ws.send：避免在业务逻辑中阻塞等待网络发送。
    let (tx, rx) = mpsc::channel::<Vec<u8>>(32);

    let player_id = uuid::Uuid::new_v4();
    let mut conn_state = ConnectionState {
        player_id,
        room_id: None,
        broadcast_rx: None,
    };

    // 克隆 tx 给广播任务使用。tokio::sync::mpsc::Sender 是廉价的 Arc 包装。
    let tx_for_broadcast = tx.clone();

    /*
     * 发送任务：独立运行，从 mpsc 通道接收数据并通过 WebSocket 发送。
     * 为什么独立任务：解耦业务逻辑和网络发送，业务逻辑无需等待发送完成。
     */
    let _sender_task = tokio::spawn(async move {
        let mut rx = rx;
        let mut sink = sender;
        while let Some(msg) = rx.recv().await {
            info!("[Server] Sender task sending {} bytes", msg.len());
            if sink.send(Message::Binary(msg)).await.is_err() {
                info!("[Server] Sender task send failed, breaking");
                break;
            }
        }
        info!("[Server] Sender task ended");
    });

    // 广播任务句柄。用于在连接断开时中止广播接收。
    let mut broadcast_handle: Option<tokio::task::JoinHandle<()>> = None;

    // ===== 主事件循环：读取客户端消息 =====
    while let Some(msg) = read.next().await {
        match msg {
            Ok(Message::Binary(data)) => {
                info!("[Server] Received Binary data, {} bytes", data.len());
                let text = String::from_utf8_lossy(&data);
                info!("[Server] Raw text: {}", text);

                // 解析客户端包。当前使用 JSON，与前端 `client.ts` 的 `JSON.stringify` + `TextEncoder` 对应。
                let packet: Result<ClientPacket, _> = serde_json::from_slice(&data);
                match packet {
                    // ----- Join：加入/创建房间 -----
                    Ok(ClientPacket::Join {
                        room_id,
                        player_name,
                    }) => {
                        info!(
                            "[Server] Join request: room_id={}, player_name={}",
                            room_id, player_name
                        );
                        match state
                            .room_manager
                            .join_room(&conn_state.player_id, &room_id, &player_name)
                            .await
                        {
                            Ok(players) => {
                                info!(
                                    "[Server] Join successful, {} players in room",
                                    players.len()
                                );
                                conn_state.room_id = Some(room_id.clone());
                                conn_state.broadcast_rx =
                                    state.room_manager.get_room_broadcast_rx(&room_id).await;

                                // 发送 Welcome 包，告知客户端其 player_id
                                let welcome_data = serde_json::to_vec(&ServerPacket::Welcome {
                                    player_id: conn_state.player_id,
                                    server_tick: 0,
                                })
                                .unwrap();
                                let _ = tx.send(welcome_data).await;

                                // 广播 RoomUpdate 给房间里的所有玩家
                                if let Some(room) = state.room_manager.get_room_arc(&room_id).await
                                {
                                    let room_guard = room.lock().await;
                                    let all_players = room_guard.get_room_players();
                                    let data = serde_json::to_vec(&ServerPacket::RoomUpdate {
                                        players: all_players,
                                    })
                                    .unwrap();
                                    let _ = room_guard.broadcast_tx.send(data);
                                }

                                // 启动广播接收任务：将房间的广播消息转发给该连接的 mpsc 通道
                                if let Some(rx) = conn_state.broadcast_rx.take() {
                                    let tx_clone = tx_for_broadcast.clone();
                                    broadcast_handle = Some(tokio::spawn(async move {
                                        let mut receiver = rx;
                                        loop {
                                            match receiver.recv().await {
                                                Ok(data) => {
                                                    if tx_clone.send(data).await.is_err() {
                                                        break;
                                                    }
                                                }
                                                Err(broadcast::error::RecvError::Closed) => break,
                                                Err(_) => continue,
                                            }
                                        }
                                    }));
                                }
                            }
                            Err(e) => {
                                let data = serde_json::to_vec(&ServerPacket::Error {
                                    code: e,
                                    message: "Room error".to_string(),
                                })
                                .unwrap();
                                let _ = tx.send(data).await;
                            }
                        }
                    }

                    // ----- Input：玩家移动/旋转输入 -----
                    Ok(ClientPacket::Input {
                        tick,
                        keys,
                        timestamp,
                    }) => {
                        if let Some(ref rid) = conn_state.room_id {
                            state
                                .room_manager
                                .submit_input(&conn_state.player_id, rid, tick, keys, timestamp)
                                .await;
                        }
                    }

                    // ----- Fire：玩家开火请求 -----
                    Ok(ClientPacket::Fire { timestamp }) => {
                        if let Some(ref rid) = conn_state.room_id {
                            state
                                .room_manager
                                .submit_fire(&conn_state.player_id, rid, timestamp)
                                .await;
                        }
                    }

                    // ----- Ping：心跳/延迟测量 -----
                    Ok(ClientPacket::Ping { client_tick }) => {
                        let data = serde_json::to_vec(&ServerPacket::Pong {
                            server_tick: client_tick,
                            latency_ms: 0,
                        })
                        .unwrap();
                        let _ = tx.send(data).await;
                    }

                    // ----- Ready：切换准备状态 -----
                    Ok(ClientPacket::Ready) => {
                        info!(
                            "[Server] Received Ready from player_id: {}",
                            conn_state.player_id
                        );
                        if let Some(ref rid) = conn_state.room_id {
                            info!("[Server] Ready in room: {}", rid);

                            // 游戏开始后忽略 Ready 包（防止中途切换）
                            if let Some(room) = state.room_manager.get_room_arc(rid).await {
                                if room.lock().await.game_started {
                                    info!("[Server] Game already started, ignoring Ready");
                                    continue;
                                }
                            }

                            match state
                                .room_manager
                                .toggle_ready(&conn_state.player_id, rid)
                                .await
                            {
                                Ok(ready_state) => {
                                    info!("[Server] Toggle ready result: {}", ready_state);
                                    if let Some(room) = state.room_manager.get_room_arc(rid).await {
                                        let mut room_guard = room.lock().await;
                                        let players = room_guard.get_room_players();
                                        info!(
                                            "[Server] Broadcasting RoomUpdate with {} players",
                                            players.len()
                                        );
                                        for p in &players {
                                            info!(
                                                "[Server]   Player: {} ready={} is_owner={}",
                                                p.name, p.ready, p.is_owner
                                            );
                                        }
                                        let data = serde_json::to_vec(&ServerPacket::RoomUpdate {
                                            players,
                                        })
                                        .unwrap();
                                        let _ = room_guard.broadcast_tx.send(data);

                                        // 所有玩家准备就绪且游戏未开始：自动启动游戏
                                        if room_guard.all_ready() && !room_guard.game_started {
                                            info!("[Server] All players ready! Starting game...");
                                            let seed = room_guard.seed;
                                            room_guard.start_game();
                                            let map_data = room_guard.get_map_data();
                                            info!(
                                                "[Server] Map data walls: {}",
                                                map_data.walls.len()
                                            );

                                            let game_start_data =
                                                serde_json::to_vec(&ServerPacket::GameStart {
                                                    seed,
                                                    map: map_data,
                                                    server_tick: 0,
                                                })
                                                .unwrap();
                                            drop(room_guard);

                                            let _ = room
                                                .lock()
                                                .await
                                                .broadcast_tx
                                                .send(game_start_data);

                                            // 启动游戏循环。spawn 新任务避免阻塞当前连接处理。
                                            tokio::spawn(run_game_loop(room));
                                        }
                                    }
                                }
                                Err(e) => {
                                    error!("[Server] Toggle ready error: {:?}", e);
                                    let data = serde_json::to_vec(&ServerPacket::Error {
                                        code: e,
                                        message: "Failed to toggle ready".to_string(),
                                    })
                                    .unwrap();
                                    let _ = tx.send(data).await;
                                }
                            }
                        } else {
                            warn!("[Server] Ready received but player not in room");
                        }
                    }

                    // ----- Leave：离开房间 -----
                    Ok(ClientPacket::Leave) => {
                        if let Some(ref rid) = conn_state.room_id {
                            let _ = state
                                .room_manager
                                .leave_room(&conn_state.player_id, rid)
                                .await;
                            // 广播 RoomUpdate 给剩余玩家
                            if let Some(room) = state.room_manager.get_room_arc(rid).await {
                                let room_guard = room.lock().await;
                                let players = room_guard.get_room_players();
                                let data =
                                    serde_json::to_vec(&ServerPacket::RoomUpdate { players })
                                        .unwrap();
                                let _ = room_guard.broadcast_tx.send(data);
                            }
                            conn_state.room_id = None;
                            conn_state.broadcast_rx = None;
                            if let Some(handle) = broadcast_handle.take() {
                                handle.abort();
                            }
                        }
                    }

                    Err(e) => {
                        error!("Failed to decode packet: {:?}", e);
                    }
                }
            }
            Ok(Message::Close(_)) | Err(_) => {
                break;
            }
            _ => {}
        }
    }

    // ===== 连接断开清理 =====
    if let Some(rid) = conn_state.room_id.take() {
        let _ = state
            .room_manager
            .leave_room(&conn_state.player_id, &rid)
            .await;
        // 广播 RoomUpdate 给剩余玩家
        if let Some(room) = state.room_manager.get_room_arc(&rid).await {
            let room_guard = room.lock().await;
            let players = room_guard.get_room_players();
            let data = serde_json::to_vec(&ServerPacket::RoomUpdate { players }).unwrap();
            let _ = room_guard.broadcast_tx.send(data);
        }
    }

    if let Some(handle) = broadcast_handle.take() {
        handle.abort();
    }

    info!("Connection closed: {}", addr);
}

/**
 * 服务器入口函数。
 * 监听 TCP 8080 端口，为每个连接 spawn 一个异步任务处理。
 * 与前端 `src/network/client.ts` 的 `connect()` 方法对应，互为连接的两端。
 */
#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // 初始化 tracing 日志。RUST_LOG 环境变量控制日志级别，如 RUST_LOG=info。
    tracing_subscriber::fmt::init();

    let addr = "0.0.0.0:8080";
    let listener = TcpListener::bind(addr).await?;
    info!("Server listening on {}", addr);

    // RoomManager 用 Arc 包装，所有连接任务共享。
    let room_manager = Arc::new(RoomManager::new());
    let (shutdown_tx, _) = broadcast::channel(1);

    let state = Arc::new(AppState {
        room_manager,
        shutdown_tx,
    });

    // 主循环：接受新连接并为每个连接 spawn 独立任务。
    // tokio::spawn 的任务在后台运行，不会阻塞 accept 循环。
    loop {
        let (stream, addr) = listener.accept().await?;
        let state = state.clone();

        tokio::spawn(handle_connection(stream, addr, state));
    }
}
