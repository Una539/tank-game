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

//! Utilities module
//! 本模块是通用工具层的入口，组织和导出工具子模块。
//! 这些工具不依赖游戏逻辑，可在任何上下文中使用。

pub mod math;
pub mod time;

// 重导出常用函数和类型。
pub use math::*;
pub use time::*;
