//! Utilities module
//! 本模块是通用工具层的入口，组织和导出工具子模块。
//! 这些工具不依赖游戏逻辑，可在任何上下文中使用。

pub mod math;
pub mod time;

// 重导出常用函数和类型。
pub use math::*;
pub use time::*;
