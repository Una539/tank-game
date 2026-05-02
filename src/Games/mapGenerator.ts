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

/**
 * @module Games/mapGenerator
 * @description 迷宫地图生成器。
 * 使用深度优先搜索（DFS）算法生成完美迷宫，再通过 loopProbability 参数添加环路，
 * 使地图更有趣且避免死胡同过多。
 * 与后端 `server/src/game/map.rs` 的 `Map` 结构体保持逻辑一致，
 * 确保本地模式和服务器生成相同结构的地图。
 */

/**
 * 墙壁线段接口。
 * 与后端 `server/src/protocol/packets.rs` 的 `WallSegment` 结构体对应。
 * 每条墙由四个坐标定义，构成一条线段，用于碰撞检测和渲染。
 */
export interface WallSegment {
  /** 线段起点 X 坐标。 */
  x1: number;

  /** 线段终点 X 坐标。 */
  x2: number;

  /** 线段起点 Y 坐标。 */
  y1: number;

  /** 线段终点 Y 坐标。 */
  y2: number;

  /** 墙壁类型：'h' 表示水平墙，'v' 表示垂直墙。用于子弹反弹方向计算。 */
  type: 'h' | 'v';
}

/**
 * 迷宫格子。
 * 内部类，不对外暴露。每个格子记录是否被访问过以及四面墙的存在状态。
 */
class Cell {
  /** 是否已被 DFS 访问过。用于生成算法避免重复访问。 */
  visited = false;

  /** 四面墙的状态。true 表示墙存在，false 表示已拆除。 */
  walls = { top: true, right: true, bottom: true, left: true };

  /**
   * 创建格子实例。
   *
   * @param x - 格子在网格中的列索引
   * @param y - 格子在网格中的行索引
   */
  constructor(
    public x: number,
    public y: number
  ) {}
}

/**
 * 地图生成器。
 * 使用 DFS 回溯算法生成迷宫，支持通过 loopProbability 控制环路密度。
 * 与后端 `server/src/game/map.rs` 的 `Map` 结构体对应。
 */
export class MapGenerator {
  /** 网格列数。当前固定为 16，对应地图宽度 16×50=800px。 */
  cols: number;

  /** 网格行数。当前固定为 16，对应地图高度 16×50=800px。 */
  rows: number;

  /** 每个格子的大小（像素）。当前固定为 50，与后端 `cell_size: 50` 一致。 */
  cellSize: number;

  /** 网格二维数组。grid[x][y] 访问第 x 列第 y 行的格子。 */
  grid: Cell[][] = [];

  /**
   * 创建地图生成器。
   *
   * @param cols - 网格列数
   * @param rows - 网格行数
   * @param cellSize - 每个格子的大小（像素）
   */
  constructor(cols: number, rows: number, cellSize: number) {
    this.cols = cols;
    this.rows = rows;
    this.cellSize = cellSize;
  }

  /**
   * 生成迷宫地图。
   *
   * @param loopProbability - 环路生成概率 [0, 1]。0 表示完美迷宫（无环路），
   *   值越大环路越多。当前使用 0.15，即约 15% 的可能墙壁会被拆除形成环路。
   *   为什么需要环路：完美迷宫只有一条通路，对战游戏需要多条路线增加策略深度。
   * @returns 所有墙壁线段列表
   */
  generate(loopProbability: number = 0.15): WallSegment[] {
    // 初始化网格
    for (let i = 0; i < this.cols; i++) {
      this.grid[i] = [];
      for (let j = 0; j < this.rows; j++) {
        this.grid[i][j] = new Cell(i, j);
      }
    }

    const stack: Cell[] = [];
    let current = this.grid[0][0];
    current.visited = true;

    // DFS 回溯生成完美迷宫
    while (true) {
      const next = this.getUnvisitedNeighbor(current);
      if (next) {
        next.visited = true;
        stack.push(current);
        this.removeWalls(current, next);
        current = next;
      } else if (stack.length > 0) {
        current = stack.pop()!;
      } else {
        break;
      }
    }

    // 添加环路：随机拆除一些内部墙壁
    // 为什么只在 right 和 bottom 方向检查：避免重复处理同一面墙（top/left 由相邻格子的 bottom/right 覆盖）。
    for (let i = 0; i < this.cols; i++) {
      for (let j = 0; j < this.rows; j++) {
        const cell = this.grid[i][j];
        if (
          i < this.cols - 1 &&
          cell.walls.right &&
          Math.random() < loopProbability
        ) {
          cell.walls.right = false;
          this.grid[i + 1][j].walls.left = false;
        }
        if (
          j < this.rows - 1 &&
          cell.walls.bottom &&
          Math.random() < loopProbability
        ) {
          cell.walls.bottom = false;
          this.grid[i][j + 1].walls.top = false;
        }
      }
    }

    return this.exportWallSegments();
  }

  /**
   * 获取指定格子的未访问邻居。
   * 随机选择一个邻居：这是 DFS 迷宫生成中"随机深度优先"的关键，
   * 确保每次生成的迷宫都不同。
   *
   * @param cell - 当前格子
   * @returns 随机选择的未访问邻居，若无则返回 undefined
   */
  private getUnvisitedNeighbor(cell: Cell): Cell | undefined {
    const neighbors: Cell[] = [];
    const { x, y } = cell;
    if (y > 0 && !this.grid[x][y - 1].visited)
      neighbors.push(this.grid[x][y - 1]);
    if (x < this.cols - 1 && !this.grid[x + 1][y].visited)
      neighbors.push(this.grid[x + 1][y]);
    if (y < this.rows - 1 && !this.grid[x][y + 1].visited)
      neighbors.push(this.grid[x][y + 1]);
    if (x > 0 && !this.grid[x - 1][y].visited)
      neighbors.push(this.grid[x - 1][y]);
    return neighbors.length > 0
      ? neighbors[Math.floor(Math.random() * neighbors.length)]
      : undefined;
  }

  /**
   * 拆除两个相邻格子之间的墙壁。
   * 根据相对位置确定拆除哪两面墙（对称拆除，确保通路双向可达）。
   *
   * @param a - 当前格子
   * @param b - 相邻格子
   */
  private removeWalls(a: Cell, b: Cell) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    if (dx === 1) {
      a.walls.left = false;
      b.walls.right = false;
    } else if (dx === -1) {
      a.walls.right = false;
      b.walls.left = false;
    }
    if (dy === 1) {
      a.walls.top = false;
      b.walls.bottom = false;
    } else if (dy === -1) {
      a.walls.bottom = false;
      b.walls.top = false;
    }
  }

  /**
   * 将网格转换为墙壁线段列表。
   * 每条墙由四个坐标定义，便于直接用于 PIXI.Graphics 绘制和碰撞检测。
   * 为什么返回线段而非格子：碰撞检测需要精确的线段几何信息，格子信息不足以计算点-线段距离。
   *
   * @returns 所有墙壁线段列表
   */
  private exportWallSegments(): WallSegment[] {
    const segments: WallSegment[] = [];
    const cs = this.cellSize;

    for (let i = 0; i < this.cols; i++) {
      for (let j = 0; j < this.rows; j++) {
        const cell = this.grid[i][j];
        const x = i * cs;
        const y = j * cs;

        // 核心：每一条墙都是独立的四个坐标
        if (cell.walls.top) {
          segments.push({ x1: x, y1: y, x2: x + cs, y2: y, type: 'h' });
        }
        if (cell.walls.left) {
          segments.push({ x1: x, y1: y, x2: x, y2: y + cs, type: 'v' });
        }
        // 为了防止重复绘制内部墙壁，右墙和底墙只在最后一列/行或特定逻辑下绘制
        if (i === this.cols - 1 && cell.walls.right) {
          segments.push({
            x1: x + cs,
            y1: y,
            x2: x + cs,
            y2: y + cs,
            type: 'v',
          });
        }
        if (j === this.rows - 1 && cell.walls.bottom) {
          segments.push({
            x1: x,
            y1: y + cs,
            x2: x + cs,
            y2: y + cs,
            type: 'h',
          });
        }
        // 内部的右墙和底墙逻辑（如果 cell.walls.right 为真则画）
        if (i < this.cols - 1 && cell.walls.right) {
          segments.push({
            x1: x + cs,
            y1: y,
            x2: x + cs,
            y2: y + cs,
            type: 'v',
          });
        }
        if (j < this.rows - 1 && cell.walls.bottom) {
          segments.push({
            x1: x,
            y1: y + cs,
            x2: x + cs,
            y2: y + cs,
            type: 'h',
          });
        }
      }
    }
    return segments;
  }
}
