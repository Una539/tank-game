//! Protocol definitions and serialization
//! 本模块是协议层的入口，统一导出所有协议相关类型和工具。
//! 与前端 `src/network/types.ts` + `src/network/client.ts` 共同构成完整的协议实现。

pub mod packets;
pub mod codec;
pub mod error;

// 重导出常用类型，简化使用者的导入路径。
// 这是 Rust 模块设计中的常见做法：在 mod.rs 中集中导出，上层只需 `use protocol::*`。
pub use packets::*;
pub use codec::*;
pub use error::ErrorCode;
