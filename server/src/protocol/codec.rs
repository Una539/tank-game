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

//! Protocol codec utilities using MessagePack
//! 本模块提供协议包的编码/解码辅助函数。
//! 使用 MessagePack 二进制序列化（`rmp-serde` crate），
//! 与前端 `src/network/client.ts` 中的 `msgpack.encode`/`msgpack.decode` 对应。

/**
 * 编解码器结构体。
 * 使用无状态结构体而非纯函数模块：便于未来扩展为支持多种序列化格式（此处使用MessagePack）。
 * 这是 Rust 中"零大小类型"（ZST）的常见用法：结构体本身不占内存，仅作为方法命名空间。
 */
pub struct Codec;
use rmp_serde::{decode::Error as DecodeError, encode::Error as EncodeError};

impl Codec {
    /**
     * 将协议包编码为字节向量。
     * 返回 Option：编码失败时返回 None 而非 panic，便于上层优雅处理。
     * 与前端 `src/network/client.ts` 的 `msgpack.encode(packet)` 对应。
     *
     * @param packet - 任意实现了 serde::Serialize 的类型
     * @returns Some(Vec<u8>) 编码成功，None 编码失败
     */
    pub fn encode<T: serde::Serialize>(packet: &T) -> Option<Vec<u8>> {
        rmp_serde::to_vec_named(packet).ok()
    }

    /**
     * 将字节向量解码为协议包。
     * 返回 Option：解码失败时返回 None，便于上层忽略格式错误的包。
     * 与前端 `src/network/client.ts` 的 `msgpack.decode(data)` 对应。
     *
     * @param data - 字节切片
     * @returns Some(T) 解码成功，None 解码失败
     */
    pub fn decode<'de, T: serde::Deserialize<'de>>(data: &'de [u8]) -> Option<T> {
        rmp_serde::from_slice(data).ok()
    }
}

/**
 * 编码协议包，返回 Result。
 * 与 `Codec::encode` 的区别：返回完整 Result，便于上层根据错误类型采取不同措施。
 * 当前 main.rs 中使用 `Codec::encode` 进行编码，本函数保留供需要 Result 的场景使用。
 *
 * @param packet - 任意实现了 serde::Serialize 的类型
 * @returns Ok(Vec<u8>) 编码成功，Err 编码失败
 */
pub fn encode_packet<T: serde::Serialize>(packet: &T) -> Result<Vec<u8>, EncodeError> {
    rmp_serde::to_vec_named(packet)
}

/**
 * 解码协议包，返回 Result。
 * 与 `Codec::decode` 的区别：返回完整 Result，便于记录日志或返回具体错误。
 *
 * @param data - 字节切片
 * @returns Ok(T) 解码成功，Err 解码失败
 */
pub fn decode_packet<T: serde::de::DeserializeOwned>(data: &[u8]) -> Result<T, DecodeError> {
    rmp_serde::from_slice(data)
}
