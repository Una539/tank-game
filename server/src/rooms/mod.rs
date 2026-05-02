//! Room management module
//! 本模块是房间管理层的入口，组织和导出房间相关子模块。
//! 与前端 `src/Lobby.tsx` 对应：都是多人游戏房间系统的实现。

pub mod manager;

// 重导出 manager 中的所有公共类型，简化使用者的导入路径。
pub use manager::*;
