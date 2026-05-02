//! Math utilities
//! 本模块提供二维向量相关的数学工具。
//! 与前端使用原始 number 进行向量运算不同：
//! 后端使用结构体封装向量，提供类型安全和便捷的方法。
//! 当前未在游戏核心逻辑中大量使用，预留用于未来更复杂的物理计算。

/**
 * 二维向量 trait。
 * 定义了所有二维向量类型应实现的接口。
 * 使用 trait 而非具体类型：允许不同类型（f64、i32）共享相同的操作接口。
 * 这是 Rust 中"泛型抽象"的标准做法。
 */
pub trait Vec2 {
    /// 获取 X 坐标。
    fn x(&self) -> f64;

    /// 获取 Y 坐标。
    fn y(&self) -> f64;
}

/**
 * 浮点二维向量。
 * 用于游戏物理计算（位置、速度等）。
 * 与前端 `(x: number, y: number)` 的元组概念对应，但封装为结构体以提供方法。
 */
#[derive(Clone, Copy, Debug, Default)]
pub struct Vec2F {
    /// X 坐标。
    pub x: f64,

    /// Y 坐标。
    pub y: f64,
}

impl Vec2F {
    /**
     * 创建新向量。
     *
     * @param x - X 坐标
     * @param y - Y 坐标
     */
    pub fn new(x: f64, y: f64) -> Self {
        Self { x, y }
    }

    /// 获取向量长度的平方。
    /// 为什么不直接提供 length：length 需要开方计算（expensive），
    /// 很多时候只需要比较长度大小（如碰撞检测），此时 length_sq 更高效。
    pub fn length_sq(&self) -> f64 {
        self.x * self.x + self.y * self.y
    }

    /// 获取向量长度（模）。
    /// 使用 .sqrt()：标准欧氏距离计算。
    pub fn length(&self) -> f64 {
        self.length_sq().sqrt()
    }

    /**
     * 获取归一化向量（单位向量）。
     * 将向量缩放至长度 1，保持方向不变。
     * 为什么检查 len == 0.0：零向量无法归一化，返回自身避免除零错误。
     *
     * @returns 归一化后的向量
     */
    pub fn normalize(&self) -> Self {
        let len = self.length();
        if len == 0.0 {
            *self
        } else {
            Self {
                x: self.x / len,
                y: self.y / len,
            }
        }
    }
}

impl Vec2 for Vec2F {
    fn x(&self) -> f64 {
        self.x
    }

    fn y(&self) -> f64 {
        self.y
    }
}

/**
 * 整数二维向量。
 * 用于网格坐标、像素坐标等离散场景。
 * 与前端 `{ x: number, y: number }` 对应，但使用整数避免浮点精度问题。
 */
#[derive(Clone, Copy, Debug, Default)]
pub struct Vec2I {
    /// X 坐标。
    pub x: i32,

    /// Y 坐标。
    pub y: i32,
}

impl Vec2I {
    /**
     * 创建新向量。
     *
     * @param x - X 坐标
     * @param y - Y 坐标
     */
    pub fn new(x: i32, y: i32) -> Self {
        Self { x, y }
    }
}

impl Vec2 for Vec2I {
    /// 将整数 X 转为 f64，满足 Vec2 trait 的返回类型要求。
    fn x(&self) -> f64 {
        self.x as f64
    }

    /// 将整数 Y 转为 f64。
    fn y(&self) -> f64 {
        self.y as f64
    }
}
