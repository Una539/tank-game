// Tank Game — 坦克大战
// Copyright (C) 2026
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
