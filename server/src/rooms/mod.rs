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

//! Room management module
//! 本模块是房间管理层的入口，组织和导出房间相关子模块。
//! 与前端 `src/Lobby.tsx` 对应：都是多人游戏房间系统的实现。

pub mod manager;

// 重导出 manager 中的所有公共类型，简化使用者的导入路径。
pub use manager::*;
