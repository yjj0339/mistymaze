'use strict';

const assert = require('node:assert/strict');
const nodePath = require('node:path');

const Core = require(nodePath.join(__dirname, '..', 'src', 'core.js'));

const CS = 1;
const R = 0.3;
const EPS = 1e-7;

const cases = [];

function test(name, fn) {
  try {
    fn();
    cases.push({ name: name, ok: true });
  } catch (err) {
    cases.push({ name: name, ok: false, err: err });
  }
}

function mazeFromRows(rows) {
  const height = rows.length;
  const width = rows[0].length;
  const cells = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      cells[y * width + x] = rows[y][x] === '#' ? 1 : 0;
    }
  }
  return {
    width: width,
    height: height,
    cells: cells,
    entry: { x: 1, y: 1 },
    exit: { x: width - 2, y: height - 2 },
    startCell: { x: 1, y: 1 }
  };
}

function countDeadEnds(maze) {
  let total = 0;
  for (let y = 0; y < maze.height; y++) {
    for (let x = 0; x < maze.width; x++) {
      if (!Core.isWalkable(maze, x, y)) continue;
      let open = 0;
      if (Core.isWalkable(maze, x + 1, y)) open++;
      if (Core.isWalkable(maze, x - 1, y)) open++;
      if (Core.isWalkable(maze, x, y + 1)) open++;
      if (Core.isWalkable(maze, x, y - 1)) open++;
      if (open === 1) total++;
    }
  }
  return total;
}

function countPathCells(maze) {
  let total = 0;
  for (let i = 0; i < maze.cells.length; i++) {
    if (maze.cells[i] === 0) total++;
  }
  return total;
}

function countSet(arr) {
  let total = 0;
  for (let i = 0; i < arr.length; i++) {
    if (arr[i]) total++;
  }
  return total;
}

function firstWallHit(maze, x, z, r, cs) {
  const x0 = x - r;
  const x1 = x + r;
  const z0 = z - r;
  const z1 = z + r;
  for (let cy = 0; cy < maze.height; cy++) {
    for (let cx = 0; cx < maze.width; cx++) {
      if (maze.cells[cy * maze.width + cx] === 0) continue;
      const wx0 = cx * cs;
      const wx1 = (cx + 1) * cs;
      const wz0 = cy * cs;
      const wz1 = (cy + 1) * cs;
      const ox = Math.min(x1, wx1) - Math.max(x0, wx0);
      const oz = Math.min(z1, wz1) - Math.max(z0, wz0);
      if (ox > EPS && oz > EPS) {
        return { cx: cx, cy: cy, ox: ox, oz: oz };
      }
    }
  }
  return null;
}

function referenceBfsDistance(maze, start, goal) {
  const w = maze.width;
  const key = function (x, y) { return y * w + x; };
  const dist = new Map();
  const queue = [[start.x, start.y]];
  dist.set(key(start.x, start.y), 0);
  for (let head = 0; head < queue.length; head++) {
    const x = queue[head][0];
    const y = queue[head][1];
    const d = dist.get(key(x, y));
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (let i = 0; i < dirs.length; i++) {
      const nx = x + dirs[i][0];
      const ny = y + dirs[i][1];
      if (!Core.isWalkable(maze, nx, ny)) continue;
      if (dist.has(key(nx, ny))) continue;
      dist.set(key(nx, ny), d + 1);
      queue.push([nx, ny]);
    }
  }
  return dist.get(key(goal.x, goal.y));
}

function allFinite(pos) {
  return Number.isFinite(pos.x) && Number.isFinite(pos.z);
}

console.log('core.test.js — 雾光迷宫逻辑层测试');

test('A1 三档尺寸生成成功且宽高与请求一致', () => {
  const sizes = [11, 15, 21];
  for (let i = 0; i < sizes.length; i++) {
    const maze = Core.generateMaze(sizes[i], sizes[i], { seed: 100 + i });
    assert.equal(maze.width, sizes[i]);
    assert.equal(maze.height, sizes[i]);
    assert.equal(maze.cells.length, sizes[i] * sizes[i]);
  }
});

test('A2 迷宫四周一圈全为墙', () => {
  const maze = Core.generateMaze(15, 15, { seed: 11, braid: 0.3 });
  const w = maze.width;
  const h = maze.height;
  for (let x = 0; x < w; x++) {
    assert.equal(maze.cells[0 * w + x], 1, '上边界 x=' + x);
    assert.equal(maze.cells[(h - 1) * w + x], 1, '下边界 x=' + x);
  }
  for (let y = 0; y < h; y++) {
    assert.equal(maze.cells[y * w + 0], 1, '左边界 y=' + y);
    assert.equal(maze.cells[y * w + (w - 1)], 1, '右边界 y=' + y);
  }
});

test('A3 全连通：可达格覆盖所有通路格，无孤岛', () => {
  const seeds = [1, 7, 42, 99, 2026];
  for (let i = 0; i < seeds.length; i++) {
    const maze = Core.generateMaze(15, 15, { seed: seeds[i], braid: 0.28 });
    const reach = Core.collectReachables(maze, maze.entry);
    assert.equal(reach.length, countPathCells(maze), '种子 ' + seeds[i] + ' 存在不可达通路格');
  }
});

test('A4 entry 与 exit 均可走且不相同', () => {
  for (let seed = 1; seed <= 5; seed++) {
    const maze = Core.generateMaze(21, 21, { seed: seed });
    assert.equal(Core.isWalkable(maze, maze.entry.x, maze.entry.y), true, 'seed ' + seed + ' entry 不可走');
    assert.equal(Core.isWalkable(maze, maze.exit.x, maze.exit.y), true, 'seed ' + seed + ' exit 不可走');
    assert.notEqual(maze.exit.x + ',' + maze.exit.y, maze.entry.x + ',' + maze.entry.y);
  }
});

test('A5 偶数宽高被修正为奇数', () => {
  const a = Core.generateMaze(12, 16, { seed: 3 });
  assert.equal(a.width % 2, 1, 'width 未被修正为奇数，实际 ' + a.width);
  assert.equal(a.height % 2, 1, 'height 未被修正为奇数，实际 ' + a.height);
  assert.equal(a.width, 13);
  assert.equal(a.height, 17);
  const b = Core.generateMaze(20, 20, { seed: 3 });
  assert.equal(b.width, 21);
  assert.equal(b.height, 21);
});

test('A6 braid 生效：高 braid 的死胡同数不高于无 braid（多种子平均）', () => {
  let plain = 0;
  let braided = 0;
  for (let seed = 1; seed <= 6; seed++) {
    plain += countDeadEnds(Core.generateMaze(15, 15, { seed: seed, braid: 0 }));
    braided += countDeadEnds(Core.generateMaze(15, 15, { seed: seed, braid: 0.6 }));
  }
  assert.ok(braided <= plain, 'braid=0.6 死胡同累计 ' + braided + ' 应 <= braid=0 的 ' + plain);
  assert.ok(plain > 0, 'braid=0 的完美迷宫死胡同数应为正，实际 ' + plain);
});

test('A7 opts.braidChance 按契约生效（与 braid 等价）', () => {
  const seed = 8;
  const withAlias = Core.generateMaze(15, 15, { seed: seed, braidChance: 0 });
  const plain = Core.generateMaze(15, 15, { seed: seed, braid: 0 });
  assert.equal(
    Buffer.compare(Buffer.from(withAlias.cells), Buffer.from(plain.cells)),
    0,
    'braidChance=0 应与 braid=0 生成相同布局（死胡同应为 ' + countDeadEnds(plain) +
    '，实际 ' + countDeadEnds(withAlias) + '，braidChance 被忽略并回落到默认 braid）'
  );
});

test('B7 createRng(42) 序列可复现且落在 [0,1)', () => {
  const a = Core.createRng(42);
  const b = Core.createRng(42);
  for (let i = 0; i < 200; i++) {
    const va = a();
    const vb = b();
    assert.equal(va, vb, '第 ' + i + ' 个随机数不一致');
    assert.ok(va >= 0 && va < 1, '第 ' + i + ' 个随机数越界：' + va);
  }
});

test('B8 同种子同参数生成结果逐字节相同', () => {
  const a = Core.generateMaze(15, 15, { seed: 4242, braid: 0.35 });
  const b = Core.generateMaze(15, 15, { seed: 4242, braid: 0.35 });
  assert.equal(a.seed, 4242);
  assert.equal(Buffer.compare(Buffer.from(a.cells), Buffer.from(b.cells)), 0, 'cells 不一致');
  assert.deepEqual(a.entry, b.entry);
  assert.deepEqual(a.exit, b.exit);
});

test('B9 不同种子产生不同布局（≥5 组）', () => {
  const seen = new Set();
  const seeds = [1, 2, 3, 4, 5];
  for (let i = 0; i < seeds.length; i++) {
    const maze = Core.generateMaze(15, 15, { seed: seeds[i] });
    seen.add(Array.from(maze.cells).join(''));
  }
  assert.equal(seen.size, seeds.length, '不同种子却产生相同布局，去重后仅 ' + seen.size + ' 种');
});

test('C10 bfsPath 首格为 start、末格为 goal、相邻格曼哈顿距离恒为 1', () => {
  const maze = Core.generateMaze(21, 21, { seed: 77 });
  const path = Core.bfsPath(maze, maze.entry, maze.exit);
  assert.ok(path.length >= 2, '路径长度应 >= 2，实际 ' + path.length);
  assert.deepEqual({ x: path[0].x, y: path[0].y }, { x: maze.entry.x, y: maze.entry.y });
  const last = path[path.length - 1];
  assert.deepEqual({ x: last.x, y: last.y }, { x: maze.exit.x, y: maze.exit.y });
  for (let i = 1; i < path.length; i++) {
    const d = Math.abs(path[i].x - path[i - 1].x) + Math.abs(path[i].y - path[i - 1].y);
    assert.equal(d, 1, '第 ' + i + ' 段曼哈顿距离为 ' + d);
  }
});

test('C11 路径中每一格均可走', () => {
  for (let seed = 1; seed <= 4; seed++) {
    const maze = Core.generateMaze(15, 15, { seed: seed });
    const path = Core.bfsPath(maze, maze.entry, maze.exit);
    assert.ok(path.length > 0, 'seed ' + seed + ' 路径为空');
    for (let i = 0; i < path.length; i++) {
      assert.equal(Core.isWalkable(maze, path[i].x, path[i].y), true, 'seed ' + seed + ' 第 ' + i + ' 格不可走');
    }
  }
});

test('C12 不可达输入返回空数组', () => {
  const maze = mazeFromRows([
    '#######',
    '#.....#',
    '#.###.#',
    '#.#.#.#',
    '#.###.#',
    '#.....#',
    '#######'
  ]);
  assert.equal(Core.isWalkable(maze, 3, 3), true, '构造的孤立格应为通路');
  assert.deepEqual(Core.bfsPath(maze, { x: 1, y: 1 }, { x: 3, y: 3 }), []);
  const reach = Core.collectReachables(maze, { x: 1, y: 1 });
  for (let i = 0; i < reach.length; i++) {
    assert.notEqual(reach[i].x + ',' + reach[i].y, '3,3', '孤立格不应被洪水填充覆盖');
  }
});

test('C13 bfsPath 长度等于独立 BFS 求得的最短距离 + 1', () => {
  const sizes = [11, 15, 21];
  for (let i = 0; i < sizes.length; i++) {
    for (let seed = 1; seed <= 4; seed++) {
      const maze = Core.generateMaze(sizes[i], sizes[i], { seed: seed });
      const path = Core.bfsPath(maze, maze.entry, maze.exit);
      const ref = referenceBfsDistance(maze, maze.entry, maze.exit);
      assert.ok(ref > 0, 'seed ' + seed + ' 参考 BFS 未找到路径');
      assert.equal(path.length, ref + 1, 'size=' + sizes[i] + ' seed=' + seed + ' 路径长 ' + path.length + ' 应为 ' + (ref + 1));
      const pathSet = new Set(path.map(function (p) { return p.x + ',' + p.y; }));
      assert.equal(pathSet.size, path.length, '最短路中不应出现重复格');
    }
  }
});

test('D14 正面撞墙 200 步：不穿墙，中心到墙格距离 >= radius', () => {
  const maze = mazeFromRows([
    '#########',
    '#.......#',
    '#########'
  ]);
  let pos = { x: 1.5, z: 1.5 };
  for (let i = 0; i < 200; i++) {
    pos = Core.resolveMove(maze, pos, R, 0.3, 0, CS);
  }
  assert.ok(allFinite(pos));
  const wallMinX = 8 * CS;
  const dist = wallMinX - pos.x;
  assert.ok(dist >= R - EPS, '玩家中心到墙格 (8,1) 距离 ' + dist + ' 应 >= radius ' + R);
  assert.ok(pos.x + R <= wallMinX + EPS, '玩家 AABB 右边缘 ' + (pos.x + R) + ' 穿入墙格');
  assert.equal(pos.z, 1.5, '正面推墙不应改变 z');
});

test('D15 斜向 45° 贴墙滑行仍有沿墙位移', () => {
  const maze = mazeFromRows([
    '###',
    '#.#',
    '#.#',
    '#.#',
    '###'
  ]);
  let pos = { x: 1.5, z: 1.5 };
  for (let i = 0; i < 3; i++) {
    const hit = Core.resolveMove(maze, pos, R, 0.5, 0.5, CS);
    assert.equal(hit.hitX, true, '第 ' + i + ' 步应撞到右侧墙');
    pos = { x: hit.x, z: hit.z };
  }
  assert.ok(pos.x + R <= 2 * CS + EPS, '贴墙后 x 仍穿墙：' + pos.x);
  assert.ok(pos.z - 1.5 > 0.5, '沿墙 z 方向位移 ' + (pos.z - 1.5) + ' 应 > 0.5');
  assert.ok(pos.x - 1.5 > 0.05, '撞墙前应先向墙靠近，x 位移 ' + (pos.x - 1.5));
});

test('D16 墙角：同时朝两面墙推进不穿透任意一格', () => {
  const maze = mazeFromRows([
    '#####',
    '#.###',
    '#####'
  ]);
  let pos = { x: 1.5, z: 1.5 };
  for (let i = 0; i < 50; i++) {
    const hit = Core.resolveMove(maze, pos, R, 0.5, 0.5, CS);
    assert.equal(hit.hitX, true, '第 ' + i + ' 步 hitX 应为 true');
    assert.equal(hit.hitZ, true, '第 ' + i + ' 步 hitZ 应为 true');
    pos = { x: hit.x, z: hit.z };
  }
  assert.ok(pos.x + R <= 2 * CS + EPS, '墙角 x 穿透：' + pos.x);
  assert.ok(pos.z + R <= 2 * CS + EPS, '墙角 z 穿透：' + pos.z);
  assert.equal(firstWallHit(maze, pos.x, pos.z, R, CS), null, '墙角位置与墙格 AABB 重叠');
});

test('D17 Fuzz：500 步随机移动后 AABB 与所有墙格无重叠', () => {
  const maze = Core.generateMaze(15, 15, { seed: 20261020, braid: 0.28 });
  const rng = Core.createRng(999);
  let pos = { x: maze.entry.x + 0.5, z: maze.entry.y + 0.5 };
  assert.equal(firstWallHit(maze, pos.x, pos.z, R, CS), null, '初始位置已与墙重叠');
  for (let i = 0; i < 500; i++) {
    const scale = i % 13 === 0 ? 1.4 : 0.5;
    const dx = (rng() * 2 - 1) * scale;
    const dz = (rng() * 2 - 1) * scale;
    const next = Core.resolveMove(maze, pos, R, dx, dz, CS);
    assert.ok(allFinite(next), '第 ' + i + ' 步坐标非有限值');
    const hit = firstWallHit(maze, next.x, next.z, R, CS);
    assert.equal(
      hit,
      null,
      '第 ' + i + ' 步后重叠 dx=' + dx.toFixed(4) + ' dz=' + dz.toFixed(4) +
      ' pos=(' + next.x.toFixed(4) + ',' + next.z.toFixed(4) + ') 撞入墙格 (' +
      (hit ? hit.cx : '?') + ',' + (hit ? hit.cy : '?') + ')'
    );
    pos = { x: next.x, z: next.z };
  }
});

test('D18 hitX/hitZ 标记与实际夹紧一致', () => {
  const maze = mazeFromRows([
    '#########',
    '#.......#',
    '#.......#',
    '#########'
  ]);
  const open = Core.resolveMove(maze, { x: 2.5, z: 1.5 }, R, 0.1, 0, CS);
  assert.equal(open.hitX, false, '通路内移动不应标记 hitX');
  assert.equal(open.hitZ, false, 'dz=0 不应标记 hitZ');
  assert.equal(open.x, 2.6);
  const wall = Core.resolveMove(maze, { x: 7.0, z: 1.5 }, R, 1.0, 0, CS);
  assert.equal(wall.hitX, true, '撞右墙应标记 hitX');
  assert.equal(wall.hitZ, false);
  assert.ok(wall.x + R <= 8 * CS + EPS, 'hitX 但未夹紧，x=' + wall.x);
  assert.equal(wall.x, 8 * CS - R, '应夹紧到接触面 8-r，实际 ' + wall.x);
  const leftWall = Core.resolveMove(maze, { x: 1.5, z: 1.5 }, R, -0.5, 0, CS);
  assert.equal(leftWall.hitX, true, '撞左墙应标记 hitX');
  assert.ok(leftWall.x - R >= 1 * CS - EPS, 'hitX 但未夹紧左边界，x=' + leftWall.x);
  const zWall = Core.resolveMove(maze, { x: 2.5, z: 1.5 }, R, 0, -0.5, CS);
  assert.equal(zWall.hitZ, true, '撞上墙应标记 hitZ');
  assert.ok(zWall.z - R >= 1 * CS - EPS, 'hitZ 但未夹紧 z 边界，z=' + zWall.z);
});

test('D19 近半格半径 0.45 在三种迷宫上 fuzz 800 步不重叠', () => {
  const bigR = 0.45;
  const sizes = [11, 15, 21];
  for (let s = 0; s < sizes.length; s++) {
    const maze = Core.generateMaze(sizes[s], sizes[s], { seed: 4 + s, braid: 0.3 });
    const rng = Core.createRng(8800 + s);
    let pos = { x: maze.entry.x + 0.5, z: maze.entry.y + 0.5 };
    for (let i = 0; i < 800; i++) {
      const scale = i % 11 === 0 ? 1.6 : 0.55;
      const dx = (rng() * 2 - 1) * scale;
      const dz = (rng() * 2 - 1) * scale;
      const next = Core.resolveMove(maze, pos, bigR, dx, dz, CS);
      assert.ok(allFinite(next), 'size=' + sizes[s] + ' 第 ' + i + ' 步坐标非有限值');
      const hit = firstWallHit(maze, next.x, next.z, bigR, CS);
      assert.equal(hit, null, 'size=' + sizes[s] + ' 第 ' + i + ' 步撞入墙格：' + JSON.stringify(hit));
      pos = { x: next.x, z: next.z };
    }
  }
});

test('E19 createExploration 初始 visited/visible 全为 0', () => {
  const maze = Core.generateMaze(11, 11, { seed: 5 });
  const exp = Core.createExploration(maze);
  assert.equal(exp.width, maze.width);
  assert.equal(exp.height, maze.height);
  assert.equal(exp.visited.length, maze.width * maze.height);
  assert.equal(exp.visible.length, maze.width * maze.height);
  assert.equal(countSet(exp.visited), 0, '初始 visited 应全 0');
  assert.equal(countSet(exp.visible), 0, '初始 visible 应全 0');
});

test('E20 castVision 在起点执行后 visited > 0 且仅含视野范围内格', () => {
  const maze = Core.generateMaze(11, 11, { seed: 6 });
  const exp = Core.createExploration(maze);
  const radius = 4;
  Core.castVision(exp, maze, maze.entry.x + 0.5, maze.entry.y + 0.5, CS, { radius: radius });
  const visitedCount = countSet(exp.visited);
  assert.ok(visitedCount > 0, 'visited 计数应 > 0，实际 ' + visitedCount);
  assert.equal(exp.visited[maze.entry.y * maze.width + maze.entry.x], 1, '起点应被标记 visited');
  for (let y = 0; y < maze.height; y++) {
    for (let x = 0; x < maze.width; x++) {
      if (!exp.visited[y * maze.width + x]) continue;
      const cheb = Math.max(Math.abs(x - maze.entry.x), Math.abs(y - maze.entry.y));
      assert.ok(cheb <= radius + 2, 'visited 格 (' + x + ',' + y + ') 超出视野半径 ' + radius);
    }
  }
  assert.equal(exp.visited[exp.visited.length - 1], 0, '远端角落不应被标记');
});

test('E21 视线遮挡：整列直墙后方的格子在 visible 中为 0', () => {
  const rows = [];
  for (let y = 0; y < 11; y++) {
    let row = '';
    for (let x = 0; x < 11; x++) row += x === 5 ? '#' : '.';
    rows.push(row);
  }
  const maze = mazeFromRows(rows);
  const exp = Core.createExploration(maze);
  Core.castVision(exp, maze, 1.5, 5.5, CS, { radius: 12 });
  assert.equal(exp.visible[5 * 11 + 4], 1, '墙前格 (4,5) 应可见');
  assert.equal(exp.visible[5 * 11 + 5], 1, '遮挡墙本身应可见');
  for (let x = 6; x < 11; x++) {
    assert.equal(exp.visible[5 * 11 + x], 0, '墙后格 (' + x + ',5) 不应可见');
  }
  for (let y = 0; y < 11; y++) {
    for (let x = 6; x < 11; x++) {
      assert.equal(exp.visible[y * 11 + x], 0, '整墙右侧 (' + x + ',' + y + ') 不应可见');
    }
  }
});

test('E22 visited 永久累积：换位置扫描后先前 visited 不清零', () => {
  const rows = [];
  for (let y = 0; y < 21; y++) rows.push('.'.repeat(21));
  const maze = mazeFromRows(rows);
  const exp = Core.createExploration(maze);
  Core.castVision(exp, maze, 1.5, 1.5, CS, { radius: 2 });
  const firstCount = countSet(exp.visited);
  assert.ok(firstCount > 0);
  Core.castVision(exp, maze, 18.5, 18.5, CS, { radius: 2 });
  const secondCount = countSet(exp.visited);
  assert.ok(secondCount > firstCount, 'visited 应累积：' + firstCount + ' -> ' + secondCount);
  assert.equal(exp.visited[1 * 21 + 1], 1, '先前 visited 的起点被清零');
  assert.equal(exp.visited[18 * 21 + 18], 1, '新位置应被标记 visited');
});

test('E23 visible 每次重置：与全新探索对象同位扫描结果一致', () => {
  const rows = [];
  for (let y = 0; y < 21; y++) rows.push('.'.repeat(21));
  const maze = mazeFromRows(rows);
  const exp = Core.createExploration(maze);
  Core.castVision(exp, maze, 1.5, 1.5, CS, { radius: 2 });
  assert.equal(exp.visible[1 * 21 + 1], 1, '首次扫描应可见起点');
  Core.castVision(exp, maze, 18.5, 18.5, CS, { radius: 2 });
  assert.equal(exp.visible[1 * 21 + 1], 0, '旧视野 (1,1) 未随 visible 重置清零');
  assert.equal(exp.visible[18 * 21 + 18], 1, '新位置应写入 visible');
  const fresh = Core.createExploration(maze);
  Core.castVision(fresh, maze, 18.5, 18.5, CS, { radius: 2 });
  assert.deepEqual(Array.from(exp.visible), Array.from(fresh.visible), 'visible 未重置为本次扫描结果');
  assert.ok(countSet(exp.visited) > countSet(exp.visible), 'visited 应累积多于当前 visible');
  assert.equal(exp.visited[1 * 21 + 1], 1, '重置 visible 不应影响 visited');
});

test('E24 castVision radius 限制生效：小半径看到的格更少', () => {
  const rows = [];
  for (let y = 0; y < 21; y++) rows.push('.'.repeat(21));
  const maze = mazeFromRows(rows);
  const small = Core.createExploration(maze);
  Core.castVision(small, maze, 10.5, 10.5, CS, { radius: 1 });
  const big = Core.createExploration(maze);
  Core.castVision(big, maze, 10.5, 10.5, CS, { radius: 6 });
  assert.ok(countSet(big.visible) > countSet(small.visible), '大半径可见格应更多');
  assert.ok(countSet(small.visible) >= 1);
});

test('F25 formatTime 覆盖 0 / 9.9 / 65 / 3599 / 3600', () => {
  assert.equal(Core.formatTime(0), '00:00');
  assert.equal(Core.formatTime(9.9), '00:09');
  assert.equal(Core.formatTime(65), '01:05');
  assert.equal(Core.formatTime(3599), '59:59');
  assert.equal(Core.formatTime(3600), '60:00');
});

test('F26 formatTime 负数与非法输入回落到 00:00', () => {
  assert.equal(Core.formatTime(-5), '00:00');
  assert.equal(Core.formatTime(NaN), '00:00');
  assert.equal(Core.formatTime(undefined), '00:00');
  assert.equal(Core.formatTime(59.999), '00:59');
  assert.equal(Core.formatTime(60), '01:00');
});

test('F27 computeGrade 单调性：收集率固定时时间越短 score 越高', () => {
  const parTime = 120;
  const times = [600, 400, 240, 160, 130];
  let prev = -1;
  for (let i = 0; i < times.length; i++) {
    const r = Core.computeGrade({ timeSec: times[i], collected: 4, totalItems: 4, parTime: parTime });
    assert.ok(r.score > prev, 'timeSec=' + times[i] + ' score=' + r.score + ' 未高于前一档 ' + prev);
    prev = r.score;
  }
});

test('F28 computeGrade 单调性：时间固定时收集越多 score 越高', () => {
  const parTime = 120;
  const collected = [0, 1, 2, 3, 4];
  let prev = -1;
  for (let i = 0; i < collected.length; i++) {
    const r = Core.computeGrade({ timeSec: 240, collected: collected[i], totalItems: 4, parTime: parTime });
    assert.ok(r.score > prev, 'collected=' + collected[i] + ' score=' + r.score + ' 未高于前一档 ' + prev);
    prev = r.score;
  }
});

test('F29 档位边界：S>=85 / A>=70 / B>=50 / 其余 C', () => {
  const parTime = 120;
  const exact = [
    { collected: 4, totalItems: 4, timeSec: parTime / 0.625, grade: 'S', score: 85 },
    { collected: 4, totalItems: 4, timeSec: parTime / 0.6, grade: 'A', score: 84 },
    { collected: 1, totalItems: 2, timeSec: 10, grade: 'A', score: 70 },
    { collected: 1, totalItems: 2, timeSec: parTime / 0.975, grade: 'B', score: 69 },
    { collected: 1, totalItems: 2, timeSec: parTime / 0.5, grade: 'B', score: 50 },
    { collected: 1, totalItems: 2, timeSec: parTime / 0.475, grade: 'C', score: 49 }
  ];
  for (let i = 0; i < exact.length; i++) {
    const c = exact[i];
    const r = Core.computeGrade({ timeSec: c.timeSec, collected: c.collected, totalItems: c.totalItems, parTime: parTime });
    assert.equal(r.score, c.score, '期望 score ' + c.score + '，实际 ' + r.score);
    assert.equal(r.grade, c.grade, 'score=' + r.score + ' 期望档位 ' + c.grade + '，实际 ' + r.grade);
  }
});

test('F30 档位与 score 判定函数在全域一致', () => {
  const expected = function (score) {
    if (score >= 85) return 'S';
    if (score >= 70) return 'A';
    if (score >= 50) return 'B';
    return 'C';
  };
  for (let collected = 0; collected <= 8; collected++) {
    for (let t = 5; t <= 900; t += 37) {
      const r = Core.computeGrade({ timeSec: t, collected: collected, totalItems: 8, parTime: 150 });
      assert.equal(r.grade, expected(r.score), 'collected=' + collected + ' timeSec=' + t + ' score=' + r.score);
      assert.ok(r.score >= 0 && r.score <= 100, 'score 越界：' + r.score);
    }
  }
});

test('F31 computeGrade 收集数超过总数时被夹紧', () => {
  const over = Core.computeGrade({ timeSec: 10, collected: 99, totalItems: 4, parTime: 120 });
  const full = Core.computeGrade({ timeSec: 10, collected: 4, totalItems: 4, parTime: 120 });
  assert.equal(over.score, full.score);
  assert.equal(over.grade, full.grade);
});

test('G32 createTimer 基于注入 now，start 后 elapsed 随时间增长', () => {
  let now = 1000;
  const timer = Core.createTimer(function () { return now; });
  timer.start();
  assert.equal(timer.running, true);
  assert.equal(timer.elapsed(), 0);
  now = 3500;
  assert.equal(timer.elapsed(), 2.5);
  now = 6000;
  assert.equal(timer.elapsed(), 5);
});

test('G33 pause 冻结 elapsed，resume 后继续累计且不计暂停时长', () => {
  let now = 1000;
  const timer = Core.createTimer(function () { return now; });
  timer.start();
  now = 6000;
  assert.equal(timer.elapsed(), 5);
  timer.pause();
  assert.equal(timer.running, false);
  now = 20000;
  assert.equal(timer.elapsed(), 5, '暂停期间 elapsed 未冻结');
  timer.resume();
  assert.equal(timer.running, true);
  now = 23000;
  assert.equal(timer.elapsed(), 8, 'resume 后应继续累计且扣除暂停时长');
});

test('G34 running 标志与 reset 行为', () => {
  let now = 0;
  const timer = Core.createTimer(function () { return now; });
  assert.equal(timer.running, false);
  now = 100;
  timer.start();
  now = 1100;
  assert.equal(timer.elapsed(), 1);
  timer.reset();
  assert.equal(timer.running, false);
  assert.equal(timer.elapsed(), 0);
  timer.start();
  now = 2100;
  assert.equal(timer.elapsed(), 1, 'reset 后 start 应从 0 重新计时');
});

test('X35 cellAt / isWalkable 越界视为墙', () => {
  const maze = Core.generateMaze(11, 11, { seed: 9 });
  assert.equal(Core.cellAt(maze, -1, 1), 1);
  assert.equal(Core.cellAt(maze, 1, -1), 1);
  assert.equal(Core.cellAt(maze, 11, 1), 1);
  assert.equal(Core.cellAt(maze, 1, 11), 1);
  assert.equal(Core.isWalkable(maze, -1, -1), false);
  assert.equal(Core.cellAt(maze, 0, 0), 1);
  assert.equal(Core.cellAt(maze, maze.entry.x, maze.entry.y), 0);
});

test('X36 collectReachables 起点不可走时返回空数组', () => {
  const maze = Core.generateMaze(11, 11, { seed: 10 });
  assert.deepEqual(Core.collectReachables(maze, { x: 0, y: 0 }), []);
  const reach = Core.collectReachables(maze, maze.entry);
  assert.ok(reach.length > 0);
  assert.equal(reach[0].x, maze.entry.x);
  assert.equal(reach[0].y, maze.entry.y);
});

test('X37 pickItemCells 排除起点与出口、格不重复、满足最小起点距离', () => {
  const maze = Core.generateMaze(21, 21, { seed: 2026 });
  const picked = Core.pickItemCells(maze, 10, Core.createRng(31));
  assert.equal(picked.length, 10);
  const seen = new Set();
  for (let i = 0; i < picked.length; i++) {
    const p = picked[i];
    const key = p.x + ',' + p.y;
    assert.equal(seen.has(key), false, '收集点重复：' + key);
    seen.add(key);
    assert.equal(Core.isWalkable(maze, p.x, p.y), true, '收集点不在通路上：' + key);
    assert.notEqual(key, maze.entry.x + ',' + maze.entry.y, '收集点不应落在起点');
    assert.notEqual(key, maze.exit.x + ',' + maze.exit.y, '收集点不应落在出口');
    const man = Math.abs(p.x - maze.entry.x) + Math.abs(p.y - maze.entry.y);
    assert.ok(man >= 3, '收集点 ' + key + ' 距起点曼哈顿距离 ' + man + ' < 3');
  }
});

test('X38 pickItemCells 数量不足时返回实际可选数量', () => {
  const maze = mazeFromRows([
    '#######',
    '#.....#',
    '#######'
  ]);
  const picked = Core.pickItemCells(maze, 99, Core.createRng(5));
  assert.ok(picked.length < 99, '数量不足时应返回实际数量，实际 ' + picked.length);
  assert.equal(picked.length, 1, '该迷宫仅 (4,1) 满足「非起点/出口且距起点曼哈顿 >= 3」，实际 ' + picked.length);
  assert.deepEqual({ x: picked[0].x, y: picked[0].y }, { x: 4, y: 1 });
  const none = Core.pickItemCells(maze, 0, Core.createRng(5));
  assert.deepEqual(none, []);
});

test('X39 pickItemCells 分散性：贪心最远点采样使收集点两两间距足够大', () => {
  const maze = Core.generateMaze(21, 21, { seed: 2026 });
  const picked = Core.pickItemCells(maze, 10, Core.createRng(31));
  assert.equal(picked.length, 10);
  let minGap = Infinity;
  for (let i = 0; i < picked.length; i++) {
    for (let j = i + 1; j < picked.length; j++) {
      const d = Math.abs(picked[i].x - picked[j].x) + Math.abs(picked[i].y - picked[j].y);
      if (d < minGap) minGap = d;
    }
  }
  assert.ok(minGap >= 4, '收集点最近两两曼哈顿距离 ' + minGap + ' 过小，未体现最远点采样');
});

test('X40 startCell 与 entry 一致且为通路', () => {
  for (let seed = 1; seed <= 4; seed++) {
    const maze = Core.generateMaze(15, 15, { seed: seed });
    assert.deepEqual(maze.startCell, { x: maze.entry.x, y: maze.entry.y });
    assert.equal(Core.isWalkable(maze, maze.startCell.x, maze.startCell.y), true);
    assert.equal(maze.seed, seed);
  }
});

let pass = 0;
let fail = 0;
const failures = [];

for (let i = 0; i < cases.length; i++) {
  const c = cases[i];
  if (c.ok) {
    pass++;
    console.log('  ok   ' + c.name);
  } else {
    fail++;
    failures.push(c);
    console.log('  FAIL ' + c.name);
  }
}

console.log('');
if (failures.length) {
  console.log('失败详情：');
  for (let i = 0; i < failures.length; i++) {
    const c = failures[i];
    console.log('  [' + (i + 1) + '] ' + c.name);
    console.log('      ' + String(c.err && c.err.message).split('\n').join('\n      '));
  }
  console.log('');
}

console.log('PASS ' + pass + ' / FAIL ' + fail);
process.exitCode = fail ? 1 : 0;
