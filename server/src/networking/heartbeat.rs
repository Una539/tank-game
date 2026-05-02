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

//! Heartbeat management
//! 本模块提供玩家心跳管理，用于检测连接存活和测量网络延迟（RTT）。
//! 与前端 `src/network/client.ts` 的 `sendPing` 方法对应：
//! 前端发送 Ping，后端回复 Pong，前端计算往返时间。
//! 当前心跳机制较为简单，预留用于未来的断线检测和延迟补偿。

use std::time::Instant;

/**
 * 玩家心跳状态。
 * 每个 WebSocket 连接可持有一个 PlayerHeartbeat，追踪最后一次 Ping/Pong 时间。
 * 使用 std::time::Instant 而非 u64 时间戳：Instant 是单调时钟，不受系统时间调整影响，
 * 适合测量时间间隔。这是 Rust 中测量耗时的标准做法。
 */
pub struct PlayerHeartbeat {
    /// 上次发送 Ping 的时间。用于计算 RTT：RTT = last_pong - last_ping。
    pub last_ping: Instant,

    /// 上次收到 Pong 的时间。也用于断线检测：若长时间未收到 Pong，认为连接已死。
    pub last_pong: Instant,

    /// 最近一次测量的往返延迟（毫秒）。
    /// 使用 u16：最大 65535ms，足够覆盖极端延迟场景。
    pub ping_roundtrip_ms: u16,
}

impl PlayerHeartbeat {
    /**
     * 创建新心跳实例。
     * last_ping 和 last_pong 初始化为当前时间，避免刚创建就被判定为超时。
     */
    pub fn new() -> Self {
        let now = Instant::now();
        Self {
            last_ping: now,
            last_pong: now,
            ping_roundtrip_ms: 0,
        }
    }

    /**
     * 收到 Pong 时调用。
     * 更新 last_pong 并计算 RTT。
     * 与前端 `src/network/client.ts` 收到 Pong 包时的处理对应。
     */
    pub fn received_pong(&mut self) {
        self.last_pong = Instant::now();
        self.ping_roundtrip_ms = self.last_ping.elapsed().as_millis() as u16;
    }

    /**
     * 发送 Ping 前调用。
     * 更新 last_ping，开始新一轮 RTT 测量。
     * 与前端 `src/network/client.ts` 的 `sendPing` 方法对应。
     */
    pub fn update_ping(&mut self) {
        self.last_ping = Instant::now();
    }

    /**
     * 检查是否超时。
     * 若距离上次收到 Pong 已超过 timeout_secs 秒，认为连接已死。
     * 当前未在 main.rs 中使用，预留用于未来的自动踢出机制。
     *
     * @param timeout_secs - 超时阈值（秒）
     * @returns true 表示已超时
     */
    pub fn is_timeout(&self, timeout_secs: u64) -> bool {
        self.last_pong.elapsed().as_secs() >= timeout_secs
    }
}

impl Default for PlayerHeartbeat {
    fn default() -> Self {
        Self::new()
    }
}
