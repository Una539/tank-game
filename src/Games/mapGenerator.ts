export interface WallSegment {
  x1: number;
  x2: number;
  y1: number;
  y2: number;
  type: 'h' | 'v';
}

class Cell {
  visited = false;
  walls = { top: true, right: true, bottom: true, left: true };
  constructor(
    public x: number,
    public y: number
  ) {}
}

export class MapGenerator {
  cols: number;
  rows: number;
  cellSize: number;
  grid: Cell[][] = [];

  constructor(cols: number, rows: number, cellSize: number) {
    this.cols = cols;
    this.rows = rows;
    this.cellSize = cellSize;
  }

  generate(loopProbability: number = 0.15): WallSegment[] {
    for (let i = 0; i < this.cols; i++) {
      this.grid[i] = [];
      for (let j = 0; j < this.rows; j++) {
        this.grid[i][j] = new Cell(i, j);
      }
    }

    const stack: Cell[] = [];
    let current = this.grid[0][0];
    current.visited = true;

    //DFS
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
