//! Tank Server Library
//! 本文件是 Rust 库的入口模块（crate root），统一导出所有子模块。
//! 与前端 `src/index.tsx` 的角色类似：都是项目的入口文件，负责组织和暴露模块。
//!
//! 模块组织采用"按功能分层"的设计：
//! - protocol：网络协议定义（包结构、序列化、错误码）
//! - game：游戏逻辑（坦克、子弹、碰撞、地图、状态管理）
//! - networking：网络工具（广播、心跳）
//! - rooms：房间管理（创建、加入、游戏循环）
//! - utils：通用工具（数学、时间）

pub mod protocol;
pub mod game;
pub mod networking;
pub mod rooms;
pub mod utils;
