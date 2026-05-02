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

//! Networking module
//! 本模块是网络工具层的入口，组织和导出网络相关子模块。
//! 与前端 `src/network/` 目录对应：都是网络通信的实现。
//!
//! 当前包含：
//! - heartbeat：心跳管理（延迟测量、超时检测）
//! - broadcast：广播通道管理（房间消息群发）

pub mod broadcast;
pub mod heartbeat;

// 重导出常用类型。
pub use broadcast::*;
pub use heartbeat::*;
