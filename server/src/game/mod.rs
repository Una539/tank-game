//! Game logic module
//! 本模块是游戏逻辑层的入口，组织和导出所有游戏相关子模块。
//! 与前端 `src/Games/` 目录对应：都是游戏核心逻辑的实现。
//!
//! 设计原则：
//! - state.rs 是核心：管理所有游戏对象的状态和 tick 推进
//! - tank.rs / bullet.rs / explosion.rs 是实体：各自管理自己的物理行为
//! - map.rs / collision.rs 是环境：提供地图数据和碰撞检测
//! - input.rs 是输入：封装客户端输入的缓冲格式

pub mod state;
pub mod tank;
pub mod bullet;
pub mod map;
pub mod collision;
pub mod explosion;
pub mod input;

// 重导出常用类型，简化使用者的导入路径。
// 这是 Rust mod.rs 中的常见做法，上层只需 `use game::*` 即可访问核心类型。
pub use state::{GameState, PlayerState};
pub use tank::Tank;
pub use bullet::{Bullet, BulletMode};
pub use map::{Map, WallSegment, WallType};
pub use collision::check_collision;
pub use explosion::Explosion;
pub use input::PendingInput;
