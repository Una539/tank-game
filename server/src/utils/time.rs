//! Time utilities
//! 本模块提供时间相关的工具函数和结构体。
//! 与前端使用 `performance.now()` 和 `Date.now()` 对应：
//! 后端使用 Rust 的标准时间库实现类似功能。

use std::time::{Duration, Instant};

/**
 * Tick 计时器。
 * 用于固定频率的游戏循环，确保每帧间隔稳定。
 * 与前端 `app.ticker.add` 的自动 60fps 循环对应：
 * 后端使用 TickTimer 手动控制 tick 率（当前 62.5 TPS = 16ms/tick）。
 */
pub struct TickTimer {
    /// 每 tick 的目标持续时间。
    tick_duration: Duration,

    /// 上次 tick 的时间点。
    last_tick: Instant,

    /// 已执行的 tick 计数。
    tick_count: u64,
}

impl TickTimer {
    /**
     * 创建新计时器。
     *
     * @param ticks_per_second - 目标 TPS（ticks per second）
     *
     * 为什么用 1000 / tps 计算间隔：简单直接，整数除法足够精确。
     * 对于 60 TPS，间隔为 16ms；对于 62.5 TPS（本项目使用），间隔也是 16ms。
     */
    pub fn new(ticks_per_second: u32) -> Self {
        Self {
            tick_duration: Duration::from_millis(1000 / ticks_per_second as u64),
            last_tick: Instant::now(),
            tick_count: 0,
        }
    }

    /**
     * 检查是否应该执行下一 tick。
     * 使用 `elapsed() >= tick_duration` 判断：简单且足够精确。
     * 与游戏循环中的 `interval(tick_duration).tick().await` 对应。
     *
     * @returns true 表示距上次 tick 已超过目标间隔
     */
    pub fn should_tick(&self) -> bool {
        self.last_tick.elapsed() >= self.tick_duration
    }

    /**
     * 记录一次 tick。
     * 更新 last_tick 和 tick_count。
     */
    pub fn tick(&mut self) {
        self.tick_count += 1;
        self.last_tick = Instant::now();
    }

    /// 获取已执行的 tick 计数。
    pub fn tick_count(&self) -> u64 {
        self.tick_count
    }
}

/**
 * 获取当前时间戳（毫秒，Unix epoch）。
 * 与前端 `Date.now()` 对应。
 * 使用 SystemTime::duration_since(UNIX_EPOCH)：Rust 中获取 Unix 时间戳的标准做法。
 *
 * @returns 当前 Unix 时间戳（毫秒）
 */
pub fn current_time_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_millis() as u64
}

/**
 * 获取当前时间戳（微秒，Unix epoch）。
 * 与 `current_time_ms` 的区别：更高精度，用于需要微秒级计时的场景。
 * 当前未使用，预留用于未来更精细的延迟测量。
 *
 * @returns 当前 Unix 时间戳（微秒）
 */
pub fn current_time_us() -> u128 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_micros()
}
