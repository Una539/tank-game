//! Broadcast channel management
//! 本模块提供广播通道的封装，用于房间消息的群发。
//! 与前端 `src/network/client.ts` 的 `onState`/`onRoomUpdate` 等回调对应：
//! 后端通过 Broadcaster 发送，前端通过 WebSocket 接收。

use tokio::sync::{broadcast, mpsc};

/**
 * 广播发送器。
 * 封装 tokio::sync::broadcast::Sender，提供类型安全的广播接口。
 * 使用 broadcast 而非 mpsc：broadcast 支持一对多，新订阅者可随时加入接收后续消息。
 * 这是游戏房间状态同步的标准做法：服务器每 tick 广播 State 包给所有在线玩家。
 */
pub struct Broadcaster {
    /// 内部广播发送端。capacity 为 256，可缓存 256 条未消费的消息。
    /// 为什么 256：以 62.5 TPS 计算，可缓存约 4 秒的消息，足够应对短暂卡顿。
    tx: broadcast::Sender<Vec<u8>>,
}

impl Broadcaster {
    /**
     * 创建新广播器。
     *
     * @param capacity - 广播通道缓存容量
     */
    pub fn new(capacity: usize) -> Self {
        let (tx, _) = broadcast::channel(capacity);
        Self { tx }
    }

    /**
     * 订阅广播。
     * 返回 BroadcastReceiver，可异步接收广播消息。
     * 与前端 WebSocket 的 `onmessage` 对应：都是"订阅后接收推送"的模式。
     *
     * @returns 新的广播接收器
     */
    pub fn subscribe(&self) -> BroadcastReceiver {
        BroadcastReceiver {
            rx: self.tx.subscribe(),
        }
    }

    /**
     * 广播消息。
     * 使用 `let _ =` 忽略发送失败：当没有活跃订阅者时，send 返回 Err，这是正常现象。
     *
     * @param data - 要广播的字节数据
     */
    pub fn broadcast(&self, data: Vec<u8>) {
        let _ = self.tx.send(data);
    }

    /**
     * 尝试广播消息，返回是否成功。
     * 与 `broadcast` 的区别：允许调用者知道是否有活跃接收者。
     *
     * @param data - 要广播的字节数据
     * @returns true 表示至少有一个接收者成功接收
     */
    pub fn try_broadcast(&self, data: Vec<u8>) -> bool {
        self.tx.send(data).is_ok()
    }
}

/**
 * 广播接收器。
 * 封装 tokio::sync::broadcast::Receiver，提供简化的接收接口。
 */
pub struct BroadcastReceiver {
    /// 内部广播接收端。
    rx: broadcast::Receiver<Vec<u8>>,
}

impl BroadcastReceiver {
    /**
     * 异步接收下一条广播消息。
     * 与前端 WebSocket 的 `onmessage` 对应。
     *
     * @returns Some(Vec<u8>) 收到消息，None 通道已关闭
     */
    pub async fn recv(&mut self) -> Option<Vec<u8>> {
        self.rx.recv().await.ok()
    }

    /**
     * 非阻塞尝试接收消息。
     * 用于游戏循环中"有消息就处理，没有就不等"的场景。
     *
     * @returns Some(Vec<u8>) 有消息，None 无消息或通道已关闭
     */
    pub fn try_recv(&mut self) -> Option<Vec<u8>> {
        self.rx.try_recv().ok()
    }
}

/**
 * 游戏通道。
 * 封装了两组 mpsc 通道：输入通道（客户端→服务器）和输出通道（服务器→客户端）。
 * 当前未在 main.rs 中直接使用（ Room 中创建但未实际接入输入/输出），
 * 预留用于未来将网络层和游戏逻辑层完全解耦：
 * 输入通过 input_tx/input_rx 传递，输出通过 output_tx/output_rx 传递。
 */
pub struct GameChannel {
    /// 输入发送端。客户端输入（按键、开火）通过此端发送。
    pub input_tx: mpsc::Sender<InputEvent>,

    /// 输入接收端。游戏逻辑任务从此端接收输入。
    pub input_rx: mpsc::Receiver<InputEvent>,

    /// 输出发送端。游戏逻辑任务通过此端发送状态更新。
    pub output_tx: mpsc::Sender<OutputEvent>,

    /// 输出接收端。网络层从此端接收状态并广播给客户端。
    pub output_rx: mpsc::Receiver<OutputEvent>,
}

impl GameChannel {
    /**
     * 创建新游戏通道。
     *
     * @param capacity - 通道缓存容量
     */
    pub fn new(capacity: usize) -> Self {
        let (input_tx, input_rx) = mpsc::channel(capacity);
        let (output_tx, output_rx) = mpsc::channel(capacity);
        Self {
            input_tx,
            input_rx,
            output_tx,
            output_rx,
        }
    }
}

/**
 * 输入事件枚举。
 * 封装客户端发送的所有输入类型。
 * 与前端 `src/network/types.ts` 的 `ClientPacket` 中的 Input/Fire 对应。
 */
#[derive(Debug, Clone)]
pub enum InputEvent {
    /// 玩家按键输入。
    Input { player_id: uuid::Uuid, keys: crate::protocol::KeyState, timestamp: u64 },

    /// 玩家开火请求。
    Fire { player_id: uuid::Uuid, timestamp: u64 },
}

/**
 * 输出事件枚举。
 * 封装服务器发送给客户端的所有输出类型。
 * 与前端 `src/network/types.ts` 的 `ServerPacket` 对应。
 */
#[derive(Debug, Clone)]
pub enum OutputEvent {
    /// 游戏状态同步。data 为序列化后的 ServerPacket::State。
    State { tick: u32, data: Vec<u8> },
}
