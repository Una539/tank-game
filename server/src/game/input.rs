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

//! Pending input for state rewinding
//! 本模块定义了客户端输入的缓冲格式。
//! 与前端 `src/network/types.ts` 的 `KeyState` 接口和 `ClientPacket::Input` 对应：
//! 前端发送 Input 包，后端解析为 PendingInput 并存入 PlayerState.inputs 队列。
//!
//! "PendingInput" 的命名含义：输入被接收后不会立即处理，而是"挂起"到下一次 tick 统一处理。
//! 这是游戏服务器的常见设计（Input Buffering），允许：
//! 1. 客户端提前发送多帧输入，减少网络延迟影响
//! 2. 服务器按固定 tick 率批量处理，保证确定性

use crate::protocol::KeyState;

/**
 * 待处理的玩家输入。
 * 存储单个 Input 包的内容，等待下一次 process_tick 处理。
 * 与前端 `src/network/client.ts` 的 `sendInput` 方法发送的数据对应。
 */
#[derive(Clone, Debug)]
pub struct PendingInput {
    /// 客户端声称的 tick 号。当前未严格校验，预留用于反作弊或输入对齐。
    pub tick: u32,

    /// 按键状态。与前端 `KeyState` 接口对应。
    pub keys: KeyState,

    /// 客户端发送时间戳（毫秒，Unix epoch）。当前未使用，预留用于延迟补偿计算。
    pub timestamp: u64,
}
