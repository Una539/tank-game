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

//! Protocol error definitions
//! 本模块定义了服务器可能返回的所有错误码。
//! 与前端 `src/network/client.ts` 的 `onError` 处理器对应，
//! 前端收到 Error 包后可根据 code 显示对应的用户友好提示。

/**
 * 错误码枚举。
 * 使用枚举而非字符串常量：Rust 中枚举类型安全，编译期即可检查所有错误分支。
 * 当前未实现序列化的完整映射（deserialize 总是返回 InvalidPacket），
 * 这是因为前端目前只读取 code 字段的字符串值，不需要反序列化 ErrorCode。
 */
#[derive(Debug, Clone, Copy)]
pub enum ErrorCode {
    /// 包格式无效。MessagePack 解析失败或缺少必要字段时返回。
    InvalidPacket,

    /// 协议版本不匹配。预留用于未来协议升级。
    VersionMismatch,

    /// 房间不存在。尝试加入不存在的房间时返回（但当前逻辑会自动创建房间，所以很少触发）。
    RoomNotFound,

    /// 房间已满。当前房间玩家数 >= 4 时返回。
    RoomFull,

    /// 玩家不在房间中。尝试在房间外发送 Ready/Input 时返回。
    NotInRoom,

    /// 游戏未开始。预留，当前未使用。
    GameNotStarted,

    /// Tick 不同步。预留用于未来反作弊或输入对齐。
    TickOutOfSync,

    /// 请求过于频繁。预留用于速率限制。
    TooManyRequests,
}

impl ErrorCode {
    /**
     * 获取错误码的人类可读描述。
     * 返回 &'static str：字符串字面量存储在静态区，无需分配。
     * 这些描述会作为 Error 包的 message 字段发送给客户端。
     */
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::InvalidPacket => "Invalid packet format",
            Self::VersionMismatch => "Protocol version mismatch",
            Self::RoomNotFound => "Room not found",
            Self::RoomFull => "Room is full",
            Self::NotInRoom => "Player not in room",
            Self::GameNotStarted => "Game not started",
            Self::TickOutOfSync => "Tick out of sync",
            Self::TooManyRequests => "Too many requests",
        }
    }
}

/**
 * 自定义序列化实现。
 * 将 ErrorCode 序列化为人类可读的字符串（如 "Room is full"），
 * 而非枚举的内存表示。这样前端 JavaScript 可以直接读取和显示。
 * 与前端 `src/network/client.ts` 中 `packet.code` 的字符串值对应。
 */
impl serde::Serialize for ErrorCode {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(self.as_str())
    }
}

/**
 * 自定义反序列化实现。
 * 当前为简化实现：无论收到什么字符串都返回 InvalidPacket。
 * 这是因为前端目前不需要反序列化 ErrorCode（只从服务器接收），
 * 但为了满足 serde::Deserialize trait 约束而保留。
 */
impl<'de> serde::Deserialize<'de> for ErrorCode {
    fn deserialize<D>(_deserializer: D) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        Ok(Self::InvalidPacket)
    }
}
