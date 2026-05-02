//! Map generator (mirrored from frontend)
//! 本模块与前端 `src/Games/mapGenerator.ts` 保持逻辑一致，
//! 确保服务器生成的地图与客户端本地生成的地图结构相同。
//! 使用确定性随机（seeded RNG）：相同的 seed 总是生成相同的地图，
//! 这是多人游戏地图同步的关键——服务器只需发送 seed，客户端即可独立生成一致地图。

use rand::{Rng, SeedableRng};

/**
 * 墙壁线段。
 * 与前端 `src/Games/mapGenerator.ts` 的 `WallSegment` 接口对应。
 * 与后端 `server/src/protocol/packets.rs` 的 `WallSegment` 结构体同名但字段略有不同
 * （此处 wall_type 类型为 `super::WallType`，协议层为 `WallType`）。
 */
#[derive(Clone, Debug)]
pub struct WallSegment {
    /// 线段起点 X 坐标。
    pub x1: f64,

    /// 线段起点 Y 坐标。
    pub y1: f64,

    /// 线段终点 X 坐标。
    pub x2: f64,

    /// 线段终点 Y 坐标。
    pub y2: f64,

    /// 墙壁类型。用于子弹反弹方向计算。
    pub wall_type: super::WallType,
}

/**
 * 墙壁类型枚举。
 * 与前端 `wall_type: 'h' | 'v'` 对应。
 * 使用 Rust 枚举而非字符：类型安全，编译期检查所有分支。
 */
#[derive(Clone, Debug, PartialEq)]
pub enum WallType {
    /// 水平墙壁。值为 0，便于未来可能的位掩码优化。
    Horizontal = 0,

    /// 垂直墙壁。值为 1。
    Vertical = 1,
}

impl Default for WallType {
    /// 默认水平墙壁。
    fn default() -> Self {
        Self::Horizontal
    }
}

/**
 * 迷宫格子内部结构。
 * 与前端 `src/Games/mapGenerator.ts` 的 `Cell` 类对应。
 */
struct Cell {
    /// 是否已被 DFS 访问过。
    visited: bool,

    /// 四面墙的状态。
    walls: CellWalls,
}

/**
 * 格子墙壁状态。
 * 使用独立结构体而非 HashMap：四个布尔字段占用内存少（4 字节），且访问更快。
 */
#[derive(Clone, Default)]
struct CellWalls {
    top: bool,
    right: bool,
    bottom: bool,
    left: bool,
}

/**
 * 地图。
 * 包含网格尺寸和生成的墙壁列表。
 * 与前端 `src/Games/mapGenerator.ts` 的 `MapGenerator` 类对应。
 */
#[derive(Clone)]
pub struct Map {
    /// 网格列数。
    pub cols: usize,

    /// 网格行数。
    pub rows: usize,

    /// 每个格子的大小（像素）。
    pub cell_size: usize,

    /// 所有墙壁线段列表。generate 方法填充此字段。
    pub walls: Vec<WallSegment>,
}

impl Map {
    /**
     * 创建新地图实例。
     *
     * @param cols - 网格列数
     * @param rows - 网格行数
     * @param cell_size - 每个格子的大小（像素）
     */
    pub fn new(cols: usize, rows: usize, cell_size: usize) -> Self {
        Self {
            cols,
            rows,
            cell_size,
            walls: Vec::new(),
        }
    }

    /**
     * 生成迷宫地图。
     *
     * @param seed - 随机种子。相同的 seed 总是生成相同的地图，这是确定性随机的关键。
     *   服务器将 seed 通过 GameStart 包发送给客户端，客户端用相同 seed 生成一致地图。
     * @param loop_probability - 环路生成概率 [0, 1]。0.15 表示约 15% 的内部墙壁会被拆除。
     *
     * 为什么用确定性随机：多人游戏中所有客户端需要看到相同的地图，
     * 发送完整墙壁数据（~300条线段）比发送一个 u64 种子（8字节）昂贵得多。
     * 这是游戏开发中"seed-based generation"的标准优化。
     */
    pub fn generate(&mut self, seed: u64, loop_probability: f64) {
        // 使用 StdRng + seed_from_u64：Rust 中的确定性随机数生成器。
        let mut rng = rand::rngs::StdRng::seed_from_u64(seed);

        // 初始化网格
        let mut grid: Vec<Vec<Cell>> = (0..self.cols)
            .map(|_i| (0..self.rows).map(|_j| Cell {
                visited: false,
                walls: CellWalls {
                    top: true,
                    right: true,
                    bottom: true,
                    left: true,
                },
            }).collect())
            .collect();

        let mut stack: Vec<(usize, usize)> = Vec::new();
        let (mut cx, mut cy) = (0usize, 0usize);
        grid[cx][cy].visited = true;

        // DFS 回溯生成完美迷宫
        loop {
            if let Some(next) = Self::get_unvisited_neighbor(&grid, cx, cy) {
                let (nx, ny) = next;
                grid[nx][ny].visited = true;
                stack.push((cx, cy));
                Self::remove_walls(&mut grid, cx, cy, nx, ny);
                cx = nx;
                cy = ny;
            } else if let Some((px, py)) = stack.pop() {
                cx = px;
                cy = py;
            } else {
                break;
            }
        }

        // 添加环路：随机拆除一些内部墙壁
        for i in 0..self.cols {
            for j in 0..self.rows {
                let has_right = grid[i][j].walls.right;
                let has_bottom = grid[i][j].walls.bottom;

                if i < self.cols - 1 && has_right && rng.gen::<f64>() < loop_probability {
                    grid[i][j].walls.right = false;
                    grid[i + 1][j].walls.left = false;
                }
                if j < self.rows - 1 && has_bottom && rng.gen::<f64>() < loop_probability {
                    grid[i][j].walls.bottom = false;
                    grid[i][j + 1].walls.top = false;
                }
            }
        }

        // 将网格转换为墙壁线段列表
        self.walls.clear();

        for (i, col) in grid.iter().enumerate().take(self.cols) {
            for (j, cell) in col.iter().enumerate().take(self.rows) {
                let x = (i * self.cell_size) as f64;
                let y = (j * self.cell_size) as f64;
                let cs = self.cell_size as f64;

                if cell.walls.top {
                    self.walls.push(WallSegment {
                        x1: x, y1: y,
                        x2: x + cs, y2: y,
                        wall_type: WallType::Horizontal,
                    });
                }
                if cell.walls.left {
                    self.walls.push(WallSegment {
                        x1: x, y1: y,
                        x2: x, y2: y + cs,
                        wall_type: WallType::Vertical,
                    });
                }
                if i == self.cols - 1 && cell.walls.right {
                    self.walls.push(WallSegment {
                        x1: x + cs, y1: y,
                        x2: x + cs, y2: y + cs,
                        wall_type: WallType::Vertical,
                    });
                }
                if j == self.rows - 1 && cell.walls.bottom {
                    self.walls.push(WallSegment {
                        x1: x, y1: y + cs,
                        x2: x + cs, y2: y + cs,
                        wall_type: WallType::Horizontal,
                    });
                }
                if i < self.cols - 1 && cell.walls.right {
                    self.walls.push(WallSegment {
                        x1: x + cs, y1: y,
                        x2: x + cs, y2: y + cs,
                        wall_type: WallType::Vertical,
                    });
                }
                if j < self.rows - 1 && cell.walls.bottom {
                    self.walls.push(WallSegment {
                        x1: x, y1: y + cs,
                        x2: x + cs, y2: y + cs,
                        wall_type: WallType::Horizontal,
                    });
                }
            }
        }
    }

    /**
     * 获取指定格子的未访问邻居。
     * 随机选择一个邻居：DFS 迷宫生成中"随机深度优先"的关键。
     *
     * @param grid - 网格引用
     * @param x - 当前列索引
     * @param y - 当前行索引
     * @returns 随机选择的未访问邻居坐标
     */
    fn get_unvisited_neighbor(grid: &[Vec<Cell>], x: usize, y: usize) -> Option<(usize, usize)> {
        let mut neighbors = Vec::new();

        if y > 0 && !grid[x][y - 1].visited {
            neighbors.push((x, y - 1));
        }
        if x < grid.len() - 1 && !grid[x + 1][y].visited {
            neighbors.push((x + 1, y));
        }
        if y < grid[0].len() - 1 && !grid[x][y + 1].visited {
            neighbors.push((x, y + 1));
        }
        if x > 0 && !grid[x - 1][y].visited {
            neighbors.push((x - 1, y));
        }

        if neighbors.is_empty() {
            None
        } else {
            let mut rng = rand::rngs::StdRng::from_entropy();
            Some(neighbors[rng.gen_range(0..neighbors.len())])
        }
    }

    /**
     * 拆除两个相邻格子之间的墙壁。
     *
     * @param grid - 网格可变引用
     * @param x1 - 格子1列索引
     * @param y1 - 格子1行索引
     * @param x2 - 格子2列索引
     * @param y2 - 格子2行索引
     */
    fn remove_walls(grid: &mut [Vec<Cell>], x1: usize, y1: usize, x2: usize, y2: usize) {
        let dx = x1 as i32 - x2 as i32;
        let dy = y1 as i32 - y2 as i32;

        if dx == 1 {
            grid[x1][y1].walls.left = false;
            grid[x2][y2].walls.right = false;
        } else if dx == -1 {
            grid[x1][y1].walls.right = false;
            grid[x2][y2].walls.left = false;
        }
        if dy == 1 {
            grid[x1][y1].walls.top = false;
            grid[x2][y2].walls.bottom = false;
        } else if dy == -1 {
            grid[x1][y1].walls.bottom = false;
            grid[x2][y2].walls.top = false;
        }
    }
}
