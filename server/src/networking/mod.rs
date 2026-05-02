//! Networking module
//! 本模块是网络工具层的入口，组织和导出网络相关子模块。
//! 与前端 `src/network/` 目录对应：都是网络通信的实现。
//!
//! 当前包含：
//! - heartbeat：心跳管理（延迟测量、超时检测）
//! - broadcast：广播通道管理（房间消息群发）

pub mod heartbeat;
pub mod broadcast;

// 重导出常用类型。
pub use heartbeat::*;
pub use broadcast::*;
