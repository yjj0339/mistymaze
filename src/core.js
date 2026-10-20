(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  if (root) root.MazeCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var WALL = 1;
  var PATH = 0;
  var EPS = 1e-6;

  function createRng(seed) {
    var s = (seed === undefined || seed === null) ? ((Date.now() ^ (Math.random() * 4294967296)) >>> 0) : (seed >>> 0);
    return function () {
      s = (s + 0x6D2B79F5) >>> 0;
      var t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function point(x, y) {
    return { x: x, y: y };
  }

  function normalize(p) {
    if (!p) return { x: 0, y: 0 };
    if (typeof p.length === 'number' && p.length >= 2) return { x: p[0] | 0, y: p[1] | 0 };
    if (typeof p.x === 'number' && typeof p.y === 'number') return { x: p.x | 0, y: p.y | 0 };
    if (typeof p.col === 'number' && typeof p.row === 'number') return { x: p.col | 0, y: p.row | 0 };
    return { x: 0, y: 0 };
  }

  function cellAt(maze, x, y) {
    if (!maze || !maze.cells) return WALL;
    if (x < 0 || y < 0 || x >= maze.width || y >= maze.height) return WALL;
    return maze.cells[y * maze.width + x] === PATH ? PATH : WALL;
  }

  function isWalkable(maze, x, y) {
    return cellAt(maze, x, y) === PATH;
  }

  function shuffle(list, rng) {
    for (var i = list.length - 1; i > 0; i--) {
      var j = Math.floor(rng() * (i + 1));
      var tmp = list[i];
      list[i] = list[j];
      list[j] = tmp;
    }
    return list;
  }

  function generateMaze(width, height, opts) {
    opts = opts || {};
    var w = Math.max(5, Math.abs(width | 0) || 15);
    var h = Math.max(5, Math.abs(height | 0) || 15);
    if (w % 2 === 0) w += 1;
    if (h % 2 === 0) h += 1;
    var seed = (opts.seed === undefined || opts.seed === null) ? ((Math.random() * 4294967296) >>> 0) : (opts.seed >>> 0);
    var rng = createRng(seed);
    var braidOption = opts.braid !== undefined ? opts.braid : opts.braidChance;
    var braid = braidOption === undefined ? 0.28 : Math.max(0, Math.min(1, Number(braidOption) || 0));
    var cells = new Uint8Array(w * h);
    var i;
    for (i = 0; i < cells.length; i++) cells[i] = WALL;

    var entry = point(1, 1);
    var exitCell = point(w - 2, h - 2);
    var stack = [[1, 1]];
    cells[1 * w + 1] = PATH;

    var steps = [[2, 0], [-2, 0], [0, 2], [0, -2]];
    while (stack.length) {
      var cur = stack[stack.length - 1];
      var cx = cur[0];
      var cy = cur[1];
      var order = shuffle([[2, 0], [-2, 0], [0, 2], [0, -2]], rng);
      var moved = false;
      for (var k = 0; k < order.length; k++) {
        var nx = cx + order[k][0];
        var ny = cy + order[k][1];
        if (nx > 0 && ny > 0 && nx < w - 1 && ny < h - 1 && cells[ny * w + nx] === WALL) {
          cells[(cy + order[k][1] / 2) * w + (cx + order[k][0] / 2)] = PATH;
          cells[ny * w + nx] = PATH;
          stack.push([nx, ny]);
          moved = true;
          break;
        }
      }
      if (!moved) stack.pop();
    }

    cells[exitCell.y * w + exitCell.x] = PATH;
    cells[(1) * w + 1] = PATH;

    if (braid > 0) {
      for (var by = 1; by < h - 1; by += 2) {
        for (var bx = 1; bx < w - 1; bx += 2) {
          if (cells[by * w + bx] !== PATH) continue;
          var open = 0;
          if (cells[by * w + (bx + 1)] === PATH) open++;
          if (cells[by * w + (bx - 1)] === PATH) open++;
          if (cells[(by + 1) * w + bx] === PATH) open++;
          if (cells[(by - 1) * w + bx] === PATH) open++;
          if (open !== 1) continue;
          if (rng() >= braid) continue;
          var dirs = shuffle([[2, 0], [-2, 0], [0, 2], [0, -2]], rng);
          for (var d = 0; d < dirs.length; d++) {
            var tx = bx + dirs[d][0];
            var ty = by + dirs[d][1];
            if (tx <= 0 || ty <= 0 || tx >= w - 1 || ty >= h - 1) continue;
            if (cells[(by + dirs[d][1] / 2) * w + (bx + dirs[d][0] / 2)] !== WALL) continue;
            if (cells[ty * w + tx] !== PATH) continue;
            cells[(by + dirs[d][1] / 2) * w + (bx + dirs[d][0] / 2)] = PATH;
            break;
          }
        }
      }
    }

    return {
      width: w,
      height: h,
      cells: cells,
      entry: entry,
      exit: exitCell,
      seed: seed,
      startCell: point(entry.x, entry.y)
    };
  }

  function collectReachables(maze, start) {
    var s = normalize(start);
    var out = [];
    if (!isWalkable(maze, s.x, s.y)) return out;
    var seen = new Uint8Array(maze.width * maze.height);
    var queue = [s];
    seen[s.y * maze.width + s.x] = 1;
    var head = 0;
    while (head < queue.length) {
      var cur = queue[head++];
      out.push(point(cur.x, cur.y));
      var dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      for (var d = 0; d < 4; d++) {
        var nx = cur.x + dirs[d][0];
        var ny = cur.y + dirs[d][1];
        if (!isWalkable(maze, nx, ny)) continue;
        var idx = ny * maze.width + nx;
        if (seen[idx]) continue;
        seen[idx] = 1;
        queue.push(point(nx, ny));
      }
    }
    return out;
  }

  function bfsPath(maze, start, goal) {
    var s = normalize(start);
    var g = normalize(goal);
    if (!isWalkable(maze, s.x, s.y) || !isWalkable(maze, g.x, g.y)) return [];
    var w = maze.width;
    var total = w * maze.height;
    var prev = new Int32Array(total);
    for (var i = 0; i < total; i++) prev[i] = -1;
    var seen = new Uint8Array(total);
    var queue = [s];
    var startIdx = s.y * w + s.x;
    var goalIdx = g.y * w + g.x;
    seen[startIdx] = 1;
    var head = 0;
    var found = startIdx === goalIdx;
    while (head < queue.length && !found) {
      var cur = queue[head++];
      var dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      for (var d = 0; d < 4; d++) {
        var nx = cur.x + dirs[d][0];
        var ny = cur.y + dirs[d][1];
        if (!isWalkable(maze, nx, ny)) continue;
        var idx = ny * w + nx;
        if (seen[idx]) continue;
        seen[idx] = 1;
        prev[idx] = cur.y * w + cur.x;
        if (idx === goalIdx) {
          found = true;
          break;
        }
        queue.push(point(nx, ny));
      }
    }
    if (!found) return [];
    var path = [];
    var walk = goalIdx;
    var guard = 0;
    while (walk !== -1 && guard++ < total + 4) {
      path.push(point(walk % w, Math.floor(walk / w)));
      if (walk === startIdx) break;
      walk = prev[walk];
    }
    path.reverse();
    if (path.length === 0) return [];
    if (path[0].x !== s.x || path[0].y !== s.y) return [];
    return path;
  }

  function manhattan(a, b) {
    return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
  }

  function pickItemCells(maze, count, rng, opts) {
    opts = opts || {};
    var rand = typeof rng === 'function' ? rng : createRng(1);
    var target = Math.max(0, count | 0);
    var minFromStart = opts.minDistFromStart === undefined ? 3 : Math.max(0, opts.minDistFromStart | 0);
    var allowExit = opts.allowExit === true;
    var start = normalize(opts.start || maze.startCell || maze.entry);
    var exitCell = normalize(maze.exit);
    var candidates = [];
    for (var y = 0; y < maze.height; y++) {
      for (var x = 0; x < maze.width; x++) {
        if (!isWalkable(maze, x, y)) continue;
        if (maze.entry && x === maze.entry.x && y === maze.entry.y) continue;
        if (!allowExit && x === exitCell.x && y === exitCell.y) continue;
        if (manhattan(point(x, y), start) < minFromStart) continue;
        candidates.push(point(x, y));
      }
    }
    var picked = [];
    if (!candidates.length || target <= 0) return picked;
    var firstIdx = Math.floor(rand() * candidates.length);
    if (firstIdx >= candidates.length) firstIdx = candidates.length - 1;
    picked.push(candidates[firstIdx]);
    var nearest = new Array(candidates.length);
    for (var i = 0; i < candidates.length; i++) {
      var dx = candidates[i].x - picked[0].x;
      var dy = candidates[i].y - picked[0].y;
      nearest[i] = dx * dx + dy * dy;
    }
    while (picked.length < target) {
      var bestVal = -1;
      var bestPool = [];
      for (var j = 0; j < candidates.length; j++) {
        if (nearest[j] <= 0) continue;
        if (nearest[j] > bestVal) {
          bestVal = nearest[j];
          bestPool = [j];
        } else if (nearest[j] === bestVal) {
          bestPool.push(j);
        }
      }
      if (!bestPool.length) break;
      var chosen = bestPool[Math.floor(rand() * bestPool.length)];
      if (chosen === undefined) chosen = bestPool[0];
      var pick = candidates[chosen];
      picked.push(pick);
      for (var m = 0; m < candidates.length; m++) {
        var ddx = candidates[m].x - pick.x;
        var ddy = candidates[m].y - pick.y;
        var dist = ddx * ddx + ddy * ddy;
        if (dist < nearest[m]) nearest[m] = dist;
      }
    }
    return picked;
  }

  function isWallCell(maze, cx, cy) {
    if (cx < 0 || cy < 0 || cx >= maze.width || cy >= maze.height) return true;
    return maze.cells[cy * maze.width + cx] !== PATH;
  }

  function spanBlocked(maze, cx, cz0, cz1) {
    for (var cz = cz0; cz <= cz1; cz++) {
      if (isWallCell(maze, cx, cz)) return true;
    }
    return false;
  }

  function rowBlocked(maze, cz, cx0, cx1) {
    for (var cx = cx0; cx <= cx1; cx++) {
      if (isWallCell(maze, cx, cz)) return true;
    }
    return false;
  }

  function resolveMove(maze, pos, radius, deltaX, deltaZ, cellSize) {
    var cs = cellSize > 0 ? cellSize : 1;
    var r = radius === undefined || radius === null ? cs * 0.25 : Math.max(0, radius);
    var dx = Number(deltaX) || 0;
    var dz = Number(deltaZ) || 0;
    var x = Number(pos && pos.x) || 0;
    var z = Number(pos && pos.z) || 0;
    var hitX = false;
    var hitZ = false;

    if (dx !== 0) {
      var nx = x + dx;
      var cz0 = Math.floor((z - r + EPS) / cs);
      var cz1 = Math.floor((z + r - EPS) / cs);
      if (dx > 0) {
        var cFrom = Math.floor((x + r - EPS) / cs);
        var cTo = Math.floor((nx + r - EPS) / cs);
        for (var cx = cFrom; cx <= cTo; cx++) {
          if (spanBlocked(maze, cx, cz0, cz1)) {
            var limit = cx * cs - r;
            if (nx > limit) nx = limit;
            hitX = true;
            break;
          }
        }
      } else {
        var cFromB = Math.floor((x - r + EPS) / cs);
        var cToB = Math.floor((nx - r + EPS) / cs);
        for (var cx2 = cFromB; cx2 >= cToB; cx2--) {
          if (spanBlocked(maze, cx2, cz0, cz1)) {
            var limitB = (cx2 + 1) * cs + r;
            if (nx < limitB) nx = limitB;
            hitX = true;
            break;
          }
        }
      }
      x = nx;
    }

    if (dz !== 0) {
      var nz = z + dz;
      var cx0 = Math.floor((x - r + EPS) / cs);
      var cx1 = Math.floor((x + r - EPS) / cs);
      if (dz > 0) {
        var rFrom = Math.floor((z + r - EPS) / cs);
        var rTo = Math.floor((nz + r - EPS) / cs);
        for (var cz = rFrom; cz <= rTo; cz++) {
          if (rowBlocked(maze, cz, cx0, cx1)) {
            var limitZ = cz * cs - r;
            if (nz > limitZ) nz = limitZ;
            hitZ = true;
            break;
          }
        }
      } else {
        var rFromB = Math.floor((z - r + EPS) / cs);
        var rToB = Math.floor((nz - r + EPS) / cs);
        for (var cz2 = rFromB; cz2 >= rToB; cz2--) {
          if (rowBlocked(maze, cz2, cx0, cx1)) {
            var limitZB = (cz2 + 1) * cs + r;
            if (nz < limitZB) nz = limitZB;
            hitZ = true;
            break;
          }
        }
      }
      z = nz;
    }

    return { x: x, z: z, hitX: hitX, hitZ: hitZ };
  }

  function createExploration(maze) {
    var total = maze.width * maze.height;
    return {
      width: maze.width,
      height: maze.height,
      visited: new Uint8Array(total),
      visible: new Uint8Array(total)
    };
  }

  function castVision(exploration, maze, wx, wz, cellSize, opts) {
    opts = opts || {};
    var cs = cellSize > 0 ? cellSize : 1;
    var rayCount = Math.max(8, (opts.rays | 0) || 72);
    var radiusCells = (opts.radius === undefined ? 12 : opts.radius) * 1;
    var w = maze.width;
    var h = maze.height;
    var visited = exploration.visited;
    var visible = exploration.visible;
    var px = wx / cs;
    var pz = wz / cs;
    var originX = Math.floor(px);
    var originY = Math.floor(pz);

    if (opts.resetVisibility !== false) {
      visible.fill(0);
    }

    function mark(cx, cy) {
      if (cx < 0 || cy < 0 || cx >= w || cy >= h) return false;
      var idx = cy * w + cx;
      visible[idx] = 1;
      visited[idx] = 1;
      return true;
    }

    mark(originX, originY);

    for (var i = 0; i < rayCount; i++) {
      var angle = (i / rayCount) * Math.PI * 2;
      var dx = Math.cos(angle);
      var dz = Math.sin(angle);
      var cx = originX;
      var cy = originY;
      var stepX = dx > 0 ? 1 : (dx < 0 ? -1 : 0);
      var stepY = dz > 0 ? 1 : (dz < 0 ? -1 : 0);
      var tDeltaX = dx !== 0 ? Math.abs(1 / dx) : Infinity;
      var tDeltaY = dz !== 0 ? Math.abs(1 / dz) : Infinity;
      var tMaxX = dx > 0 ? ((cx + 1 - px) / dx) : (dx < 0 ? ((cx - px) / dx) : Infinity);
      var tMaxY = dz > 0 ? ((cy + 1 - pz) / dz) : (dz < 0 ? ((cy - pz) / dz) : Infinity);
      var guard = 0;
      var distance = 0;
      while (guard++ < 512) {
        if (tMaxX < tMaxY) {
          distance = tMaxX;
          cx += stepX;
          tMaxX += tDeltaX;
        } else {
          distance = tMaxY;
          cy += stepY;
          tMaxY += tDeltaY;
        }
        if (distance > radiusCells) break;
        if (cx < 0 || cy < 0 || cx >= w || cy >= h) break;
        mark(cx, cy);
        if (isWallCell(maze, cx, cy)) break;
      }
    }
    return exploration;
  }

  function computeGrade(input) {
    input = input || {};
    var timeSec = Math.max(0, Number(input.timeSec) || 0);
    var total = Math.max(0, Number(input.totalItems) | 0);
    var collected = Math.max(0, Number(input.collected) | 0);
    if (total > 0 && collected > total) collected = total;
    var par = Number(input.parTime) > 0 ? Number(input.parTime) : 60;
    var rate = total > 0 ? collected / total : 1;
    var timeFactor = timeSec <= 0.001 ? 1 : Math.min(1, par / timeSec);
    var score = Math.round(60 * rate + 40 * timeFactor);
    if (score < 0) score = 0;
    if (score > 100) score = 100;
    var grade = score >= 85 ? 'S' : (score >= 70 ? 'A' : (score >= 50 ? 'B' : 'C'));
    return { grade: grade, score: score };
  }

  function formatTime(sec) {
    var total = Math.max(0, Math.floor(Number(sec) || 0));
    var m = Math.floor(total / 60);
    var s = total % 60;
    return (m < 10 ? '0' + m : '' + m) + ':' + (s < 10 ? '0' + s : '' + s);
  }

  function createTimer(now) {
    var clock = typeof now === 'function' ? now : function () { return Date.now(); };
    var accumulated = 0;
    var startedAt = 0;
    var running = false;
    var api = {
      start: function () {
        accumulated = 0;
        startedAt = clock();
        running = true;
        return api;
      },
      pause: function () {
        if (running) {
          accumulated += (clock() - startedAt) / 1000;
          running = false;
        }
        return api;
      },
      resume: function () {
        if (!running) {
          startedAt = clock();
          running = true;
        }
        return api;
      },
      reset: function () {
        accumulated = 0;
        startedAt = clock();
        running = false;
        return api;
      },
      elapsed: function () {
        if (!running) return accumulated;
        return accumulated + (clock() - startedAt) / 1000;
      }
    };
    Object.defineProperty(api, 'running', {
      enumerable: true,
      get: function () { return running; }
    });
    return api;
  }

  return {
    WALL: WALL,
    PATH: PATH,
    createRng: createRng,
    generateMaze: generateMaze,
    cellAt: cellAt,
    isWalkable: isWalkable,
    collectReachables: collectReachables,
    bfsPath: bfsPath,
    pickItemCells: pickItemCells,
    resolveMove: resolveMove,
    createExploration: createExploration,
    castVision: castVision,
    computeGrade: computeGrade,
    formatTime: formatTime,
    createTimer: createTimer
  };
});
