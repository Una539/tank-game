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

//! Protocol definitions and serialization
//! 本模块是协议层的入口，统一导出所有协议相关类型和工具。
//! 与前端 `src/network/types.ts` + `src/network/client.ts` 共同构成完整的协议实现。

pub mod codec;
pub mod error;
pub mod packets;

// 重导出常用类型，简化使用者的导入路径。
// 这是 Rust 模块设计中的常见做法：在 mod.rs 中集中导出，上层只需 `use protocol::*`。
pub use codec::*;
pub use error::ErrorCode;
pub use packets::*;
