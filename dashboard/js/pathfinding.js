// pathfinding.js - Shortest Path (BFS) and Communication-Aware Path (Dijkstra) with Obstacle Avoidance
import { CONFIG } from './config.js';

export class PathFinder {
  constructor(cols = CONFIG.ARENA.COLS, rows = CONFIG.ARENA.ROWS) {
    this.cols = cols;
    this.rows = rows;
  }

  /**
   * 1. SHORTEST ROUTE (BFS):
   * Finds the path with the fewest grid steps from start to target.
   * Movement: Up, Down, Left, Right only (strictly no diagonal movement).
   * Avoids all obstacle cells.
   * 
   * @param {{col: number, row: number}} start
   * @param {{col: number, row: number}} target
   * @param {Set<string>} obstacles Set of "col,row" keys
   * @returns {Array<{col: number, row: number}> | null} Array of steps from start to target, or null
   */
  findShortestPath(start, target, obstacles) {
    if (!start || !target) return null;
    if (start.col === target.col && start.row === target.row) {
      return [start];
    }

    const startKey = `${start.col},${start.row}`;
    const targetKey = `${target.col},${target.row}`;

    if (obstacles.has(targetKey) || obstacles.has(startKey)) {
      return null;
    }

    const queue = [[start]];
    const visited = new Set([startKey]);

    // Strictly 4-directional cardinal neighbors (Up, Down, Left, Right)
    const deltas = [
      { dCol: 0, dRow: -1 }, // Up (North)
      { dCol: 1, dRow: 0 },  // Right (East)
      { dCol: 0, dRow: 1 },  // Down (South)
      { dCol: -1, dRow: 0 }  // Left (West)
    ];

    while (queue.length > 0) {
      const currentPath = queue.shift();
      const current = currentPath[currentPath.length - 1];

      if (current.col === target.col && current.row === target.row) {
        return currentPath;
      }

      for (const { dCol, dRow } of deltas) {
        const nextCol = current.col + dCol;
        const nextRow = current.row + dRow;
        const nextKey = `${nextCol},${nextRow}`;

        if (
          nextCol >= 0 && nextCol < this.cols &&
          nextRow >= 0 && nextRow < this.rows &&
          !obstacles.has(nextKey) &&
          !visited.has(nextKey)
        ) {
          visited.add(nextKey);
          queue.push([...currentPath, { col: nextCol, row: nextRow }]);
        }
      }
    }

    return null; // Target unreachable
  }

  // Alias for backward compatibility with auto-nav runner
  findPath(start, target, obstacles) {
    return this.findShortestPath(start, target, obstacles);
  }

  /**
   * 2. COMMUNICATION-AWARE ROUTE (Dijkstra):
   * Weighted pathfinding that balances travel distance with simulated RF link quality.
   * Prefers cells with better simulated RSSI, accepting a slightly longer route
   * if it significantly reduces wireless degradation or weak-signal exposure.
   * 
   * Cost Model for entering neighbor cell (nextCol, nextRow):
   *   EdgeCost = BaseStepCost (10) + CommPenalty(RSSI)
   *   Where:
   *     - RSSI > -70 dBm (Strong Green)    => Penalty = 0
   *     - -70 to -80 dBm (Good Yellow)     => Penalty = 4
   *     - -80 to -90 dBm (Fair Orange)     => Penalty = 14
   *     - Below -90 dBm (Weak Red)         => Penalty = 35
   * 
   * @param {{col: number, row: number}} start
   * @param {{col: number, row: number}} target
   * @param {Set<string>} obstacles Set of "col,row" keys
   * @param {Function} getCellRssi Function (col, row) => number
   * @returns {Array<{col: number, row: number}> | null} Array of steps from start to target, or null
   */
  findCommAwarePath(start, target, obstacles, getCellRssi) {
    if (!start || !target) return null;
    if (start.col === target.col && start.row === target.row) {
      return [start];
    }

    const startKey = `${start.col},${start.row}`;
    const targetKey = `${target.col},${target.row}`;

    if (obstacles.has(targetKey) || obstacles.has(startKey)) {
      return null;
    }

    const dist = new Map();
    const prev = new Map();
    const pq = [{ node: start, cost: 0 }];
    dist.set(startKey, 0);

    const deltas = [
      { dCol: 0, dRow: -1 }, // Up (North)
      { dCol: 1, dRow: 0 },  // Right (East)
      { dCol: 0, dRow: 1 },  // Down (South)
      { dCol: -1, dRow: 0 }  // Left (West)
    ];

    while (pq.length > 0) {
      // Priority queue extraction (lowest cost node first)
      pq.sort((a, b) => a.cost - b.cost);
      const { node: current, cost: currentCost } = pq.shift();
      const currentKey = `${current.col},${current.row}`;

      if (current.col === target.col && current.row === target.row) {
        break; // Destination reached
      }

      if (currentCost > (dist.get(currentKey) ?? Infinity)) {
        continue;
      }

      for (const { dCol, dRow } of deltas) {
        const nextCol = current.col + dCol;
        const nextRow = current.row + dRow;
        const nextKey = `${nextCol},${nextRow}`;

        if (
          nextCol >= 0 && nextCol < this.cols &&
          nextRow >= 0 && nextRow < this.rows &&
          !obstacles.has(nextKey)
        ) {
          // 1. Distance step cost
          const baseStepCost = 10;

          // 2. Communication Penalty based on simulated signal strength
          const rawRssi = typeof getCellRssi === 'function' ? getCellRssi(nextCol, nextRow) : null;
          const commPenalty = this.getCommunicationPenalty(rawRssi);

          const edgeCost = baseStepCost + commPenalty;
          const newCost = currentCost + edgeCost;

          if (!dist.has(nextKey) || newCost < dist.get(nextKey)) {
            dist.set(nextKey, newCost);
            prev.set(nextKey, current);
            pq.push({ node: { col: nextCol, row: nextRow }, cost: newCost });
          }
        }
      }
    }

    if (!dist.has(targetKey)) {
      return null; // Target unreachable
    }

    // Reconstruct path from target back to start
    const path = [];
    let curr = target;
    while (curr) {
      path.unshift(curr);
      const k = `${curr.col},${curr.row}`;
      curr = prev.get(k);
    }

    return path;
  }

  /**
   * 3. ROUTE EVALUATION HELPER:
   * Calculates total steps, metric distance, average simulated RSSI,
   * and count of weak-signal cells along the path.
   * 
   * @param {Array<{col: number, row: number}> | null} path
   * @param {Function} getCellRssi Function (col, row) => number
   * @returns {{ steps: number, distanceCm: number, avgRssi: number | null, weakCount: number, criticalCount: number } | null}
   */
  evaluateRoute(path, getCellRssi) {
    if (!path || path.length === 0) return null;

    const steps = path.length - 1;
    const distanceCm = steps * CONFIG.ARENA.CELL_SIZE_CM;

    let rssiSum = 0;
    let weakCount = 0;
    let criticalCount = 0;

    for (const cell of path) {
      const rawRssi = typeof getCellRssi === 'function' ? getCellRssi(cell.col, cell.row) : null;
      const rssi = (rawRssi !== null && rawRssi !== undefined && !isNaN(rawRssi)) ? rawRssi : -80;
      rssiSum += rssi;
      // Weak signal defined as below -85 dBm (poor/critical)
      if (rssi < -85) {
        weakCount++;
      }
      if (rssi < -90) {
        criticalCount++;
      }
    }

    const avgRssi = parseFloat((rssiSum / path.length).toFixed(1));

    return {
      steps,
      distanceCm,
      avgRssi,
      weakCount,
      criticalCount,
      weightedCost: this.calculateWeightedRouteCost(path, getCellRssi)
    };
  }

  getCommunicationPenalty(rssi) {
    if (rssi === null || rssi === undefined || isNaN(rssi)) return 14;
    if (rssi > -70) return 0;
    if (rssi >= -80) return 4;
    if (rssi >= -90) return 14;
    return 35;
  }

  calculateWeightedRouteCost(path, getCellRssi) {
    if (!path || path.length === 0) return null;
    let cost = 0;
    // Every traversed edge costs 10 movement units plus the signal penalty of the cell entered.
    for (let i = 1; i < path.length; i++) {
      const p = path[i];
      const rawRssi = typeof getCellRssi === 'function' ? getCellRssi(p.col, p.row) : null;
      cost += 10 + this.getCommunicationPenalty(rawRssi);
    }
    return cost;
  }


  /**
   * Cardinal heading between two adjacent cells.
   */
  getHeadingBetween(from, to) {
    if (to.row < from.row) return CONFIG.DIRECTIONS.NORTH;
    if (to.col > from.col) return CONFIG.DIRECTIONS.EAST;
    if (to.row > from.row) return CONFIG.DIRECTIONS.SOUTH;
    if (to.col < from.col) return CONFIG.DIRECTIONS.WEST;
    return 0;
  }
}
