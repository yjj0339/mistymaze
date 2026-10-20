(function () {
  'use strict';

  var C = window.MazeCore;
  var T = window.THREE;

  var errors = [];

  window.addEventListener('error', function (event) {
    var message = event && event.message ? event.message : 'unknown error';
    errors.push(String(message));
  });

  window.addEventListener('unhandledrejection', function (event) {
    errors.push('unhandledrejection: ' + String(event && event.reason));
  });

  var CELL = 4;
  var WALL_H = 3.2;
  var PLAYER_R = 0.62;
  var EYE = 1.68;
  var SPEED = 6.2;
  var SPRINT_SPEED = 9.8;
  var BASE_FOV = 72;
  var PICK_DIST = 1.3;
  var WIN_DIST = 1.6;
  var PORTRAIT_EYE = 1.5;
  var UP_AXIS = new T.Vector3(0, 1, 0);
  var X_AXIS = new T.Vector3(1, 0, 0);
  var IDENTITY_Q = new T.Quaternion();
  var SKY = 0xCFE7F0;
  var JOY_R = 56;
  var JOY_DEAD = 0.14;
  var PITCH_LIMIT = 1.5408;

  var DIFFS = {
    easy: { key: 'easy', label: '轻松', size: 11, items: 6, hint: true, braid: 0.34 },
    normal: { key: 'normal', label: '标准', size: 15, items: 10, hint: false, braid: 0.28 },
    hard: { key: 'hard', label: '挑战', size: 21, items: 16, hint: false, braid: 0.2 }
  };

  var PALETTES = [
    { sky: 0xCFE7F0, wall: 0xEFE9DE, wallTop: 0xD9C9B0, floorA: '#F9F5EC', floorB: '#E8DFCC' },
    { sky: 0xD3E8E1, wall: 0xE9EFE7, wallTop: 0xB7CFC1, floorA: '#F2F8F1', floorB: '#DDEADF' },
    { sky: 0xF3E3D8, wall: 0xF4E7DB, wallTop: 0xD9BFA9, floorA: '#FBF1E8', floorB: '#EEDCCE' },
    { sky: 0xE1E0EE, wall: 0xEAE6F1, wallTop: 0xC0B9D2, floorA: '#F5F3FA', floorB: '#E1DDEC' },
    { sky: 0xD7E7F1, wall: 0xE5ECF1, wallTop: 0xB6C7D3, floorA: '#F3F8FB', floorB: '#DEE8F0' }
  ];

  var palette = PALETTES[0];
  var playMode = 'campaign';
  var campaignLevel = 1;
  var campaignBest = 1;

  function levelConfig(n) {
    var lv = Math.max(1, Math.round(n) || 1);
    var size = 11 + Math.floor((lv - 1) * 1.1) * 2;
    if (size > 25) size = 25;
    var items = Math.min(20, 6 + Math.floor((lv - 1) * 1.15));
    var braid = Math.max(0.12, 0.34 - (lv - 1) * 0.02);
    return { key: 'campaign', label: '第 ' + lv + ' 关', size: size, items: items, hint: lv <= 2, braid: braid, level: lv };
  }

  function currentConfig() {
    if (playMode === 'campaign') return levelConfig(campaignLevel);
    return DIFFS[difficulty] || DIFFS.normal;
  }

  function paletteFor(conf, isPreview) {
    if (isPreview) return PALETTES[0];
    var idx = playMode === 'campaign' ? (conf.level - 1) : 0;
    return PALETTES[((idx % PALETTES.length) + PALETTES.length) % PALETTES.length];
  }

  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

  function angleDiff(from, to) {
    var d = (to - from + Math.PI) % (Math.PI * 2);
    if (d < 0) d += Math.PI * 2;
    return d - Math.PI;
  }

  function baseFov() {
    return camera && camera.aspect < 0.95 ? BASE_FOV - 2 : BASE_FOV;
  }

  function byId(id) { return document.getElementById(id); }

  function load(key, fallback) {
    try {
      var value = window.localStorage.getItem(key);
      return value === null || value === undefined ? fallback : value;
    } catch (err) {
      return fallback;
    }
  }

  function save(key, value) {
    try { window.localStorage.setItem(key, String(value)); } catch (err) {}
  }

  function angleLerp(from, to, t) {
    var delta = to - from;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    return from + delta * t;
  }

  var coarseMatch = window.matchMedia ? window.matchMedia('(pointer: coarse)') : null;
  var isMobile = (coarseMatch && coarseMatch.matches) || /Android|iPhone|iPad|iPod|Mobile|HarmonyOS/i.test(navigator.userAgent || '');
  var touchMode = isMobile;

  var els = {
    stage: byId('scene-canvas'),
    timerText: byId('timer-text'),
    collectText: byId('collect-text'),
    collectPill: byId('collect-pill'),
    btnMap: byId('btn-map'),
    btnSound: byId('btn-sound'),
    btnPause: byId('btn-pause'),
    btnFullscreen: byId('btn-fullscreen'),
    minimap: byId('minimap'),
    minimapCard: byId('minimap-card'),
    staminaFill: byId('stamina-fill'),
    exitHint: byId('exit-hint'),
    joyLayer: byId('joystick-layer'),
    joyBase: byId('joystick-base'),
    joyKnob: byId('joystick-knob'),
    lookLayer: byId('touch-look-layer'),
    screenStart: byId('screen-start'),
    screenWin: byId('screen-win'),
    screenPause: byId('screen-pause'),
    btnStart: byId('btn-start'),
    winGrade: byId('win-grade'),
    winTime: byId('win-time'),
    winCollect: byId('win-collect'),
    winBest: byId('win-best'),
    winRecord: byId('win-record'),
    btnNext: byId('btn-next'),
    btnAgain: byId('btn-again'),
    btnNewmaze: byId('btn-newmaze'),
    btnMenu: byId('btn-menu'),
    btnResume: byId('btn-resume'),
    btnRestart: byId('btn-restart'),
    btnQuit: byId('btn-quit'),
    sensRange: byId('sens-range'),
    sensValue: byId('sens-value'),
    soundToggle: byId('sound-toggle'),
    smoothRange: byId('smooth-range'),
    smoothValue: byId('smooth-value'),
    leftyToggle: byId('lefty-toggle'),
    levelPill: byId('level-pill'),
    levelText: byId('level-text'),
    winTitle: document.querySelector('#screen-win .win-title'),
    winSub: byId('win-sub'),
    campLevel: byId('camp-level'),
    campBest: byId('camp-best'),
    levelBanner: byId('level-banner'),
    levelBannerText: byId('level-banner-text'),
    toast: byId('toast'),
    noWebgl: byId('no-webgl')
  };

  var renderer = null;

  try {
    renderer = new T.WebGLRenderer({ antialias: !isMobile, powerPreference: 'high-performance', alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isMobile ? 1.75 : 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    if (T.SRGBColorSpace) renderer.outputColorSpace = T.SRGBColorSpace;
    if (!isMobile) {
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = T.PCFSoftShadowMap;
    }
    els.stage.appendChild(renderer.domElement);
  } catch (err) {
    errors.push('webgl: ' + (err && err.message ? err.message : String(err)));
    renderer = null;
    if (els.noWebgl) els.noWebgl.style.display = 'block';
  }

  var scene = new T.Scene();
  scene.background = new T.Color(SKY);
  scene.fog = new T.Fog(SKY, isMobile ? 12 : 18, isMobile ? 44 : 62);

  var camera = new T.PerspectiveCamera(BASE_FOV, window.innerWidth / Math.max(1, window.innerHeight), 0.1, 200);
  camera.rotation.order = 'YXZ';
  camera.position.set(20, 24, 20);

  var hemi = new T.HemisphereLight(0xffffff, 0xd8cfc0, 1.72);
  scene.add(hemi);

  var sun = new T.DirectionalLight(0xfff6e6, 1.32);
  sun.position.set(30, 46, 18);
  scene.add(sun);
  scene.add(sun.target);

  if (renderer && !isMobile) {
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 200;
    sun.shadow.bias = -0.0008;
    sun.shadow.normalBias = 0.02;
  }

  var difficulty = String(load('mistymaze.difficulty', 'normal'));
  if (!DIFFS[difficulty]) difficulty = 'normal';
  var sens = clamp(parseFloat(load('mistymaze.sens', '1')) || 1, 0.4, 2);
  var soundOn = load('mistymaze.sound', '1') !== '0';

  var state = 'menu';
  var maze = null;
  var exploration = null;
  var level = null;
  var seed = 0;
  var itemTotal = 0;
  var collected = 0;
  var items = [];
  var itemGroup = null;
  var exitCore = null;
  var exitPillar = null;
  var exitGlow = null;
  var exitPos = { x: 0, z: 0 };
  var glideCubes = [];
  var particles = [];
  var pointLights = [];
  var haloTexture = null;
  var previewAngle = 0;
  var cloudMesh = null;
  var cloudData = [];
  var exitRing = null;
  var tmpMatrix = new T.Matrix4();
  var tmpQuat = new T.Quaternion();
  var tmpQuatB = new T.Quaternion();
  var tmpPos = new T.Vector3();
  var tmpScale = new T.Vector3();
  var tmpColor = new T.Color();

  var player = { x: 0, z: 0, yaw: 0, pitch: 0 };
  var vel = { x: 0, z: 0 };
  var bobPhase = 0;
  var fovNow = BASE_FOV;
  var stamina = 1;
  var sprinting = false;
  var exhausted = false;
  var generating = false;
  var bumpShake = 0;
  var stepAcc = 0;
  var winLook = null;
  var winClock = 0;
  var winShown = false;

  var frameCount = 0;
  var clock = new T.Clock();
  var lastVision = -1;
  var lastMap = -1;
  var lastLight = -1;
  var lastHud = -1;
  var lastTimerText = '';
  var lastCollectText = '';

  var timer = C.createTimer(function () {
    return (window.performance && window.performance.now) ? window.performance.now() : Date.now();
  });

  var keys = { up: false, down: false, left: false, right: false, shift: false };
  var joy = { id: null, active: false, ox: 0, oy: 0 };
  var look = { id: null, lx: 0, ly: 0 };
  var joyX = 0;
  var joyY = 0;
  var lookAccumX = 0;
  var lookAccumY = 0;
  var camYaw = 0;
  var camPitch = 0;
  var lookSmoothing = 0;
  var leftyMode = false;

  function syncView() {
    camYaw = player.yaw;
    camPitch = player.pitch;
  }

  var actx = null;
  var noiseBuffer = null;
  var lastBumpAt = -1;
  var lastStepAt = -1;
  var toastHandle = 0;

  var minimapCtx = els.minimap && els.minimap.getContext ? els.minimap.getContext('2d') : null;

  function makeCheckerTexture(a, b) {
    var size = 256;
    var canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    var ctx = canvas.getContext('2d');
    ctx.fillStyle = a || '#F9F5EC';
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = b || '#E8DFCC';
    ctx.fillRect(0, 0, size / 2, size / 2);
    ctx.fillRect(size / 2, size / 2, size / 2, size / 2);
    for (var i = 0; i < 700; i++) {
      var alpha = Math.random() * 0.022;
      ctx.fillStyle = 'rgba(46,51,56,' + alpha.toFixed(3) + ')';
      ctx.fillRect(Math.random() * size, Math.random() * size, 2, 2);
    }
    var texture = new T.CanvasTexture(canvas);
    texture.wrapS = T.RepeatWrapping;
    texture.wrapT = T.RepeatWrapping;
    if (T.SRGBColorSpace) texture.colorSpace = T.SRGBColorSpace;
    if (renderer) texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    return texture;
  }

  function makeGlowTexture() {
    var size = 128;
    var canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    var ctx = canvas.getContext('2d');
    var gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    gradient.addColorStop(0, 'rgba(255,232,170,0.95)');
    gradient.addColorStop(0.3, 'rgba(255,201,77,0.42)');
    gradient.addColorStop(0.68, 'rgba(255,201,77,0.12)');
    gradient.addColorStop(1, 'rgba(255,201,77,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
    var texture = new T.CanvasTexture(canvas);
    if (T.SRGBColorSpace) texture.colorSpace = T.SRGBColorSpace;
    return texture;
  }

  haloTexture = makeGlowTexture();

  function clearLevel() {
    if (level) {
      var geometries = [];
      var materials = [];
      level.traverse(function (obj) {
        if (obj.isInstancedMesh) obj.dispose();
        if (obj.geometry && geometries.indexOf(obj.geometry) < 0) geometries.push(obj.geometry);
        if (obj.material) {
          var mats = Array.isArray(obj.material) ? obj.material : [obj.material];
          for (var i = 0; i < mats.length; i++) {
            if (materials.indexOf(mats[i]) < 0) materials.push(mats[i]);
          }
        }
      });
      for (var g = 0; g < geometries.length; g++) geometries[g].dispose();
      for (var m = 0; m < materials.length; m++) {
        if (materials[m].map && materials[m].map !== haloTexture) materials[m].map.dispose();
        materials[m].dispose();
      }
      scene.remove(level);
    }
    level = null;
    items = [];
    itemGroup = null;
    exitCore = null;
    exitPillar = null;
    exitGlow = null;
    exitRing = null;
    glideCubes = [];
    particles = [];
    pointLights = [];
    cloudMesh = null;
    cloudData = [];
  }

  function fitSun(width, height) {
    var cx = width * CELL / 2;
    var cz = height * CELL / 2;
    var half = Math.max(width, height) * CELL * 0.6 + 8;
    sun.target.position.set(cx, 0, cz);
    sun.target.updateMatrixWorld();
    sun.position.set(cx + half * 0.55, half * 1.25, cz + half * 0.45);
    if (sun.shadow) {
      var cam = sun.shadow.camera;
      cam.left = -half;
      cam.right = half;
      cam.top = half;
      cam.bottom = -half;
      cam.near = 1;
      cam.far = half * 4;
      cam.updateProjectionMatrix();
    }
  }

  function buildFloor() {
    var texture = makeCheckerTexture(palette.floorA, palette.floorB);
    texture.repeat.set(maze.width, maze.height);
    var geometry = new T.PlaneGeometry(maze.width * CELL, maze.height * CELL);
    var material = new T.MeshLambertMaterial({ map: texture });
    var mesh = new T.Mesh(geometry, material);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(maze.width * CELL / 2, 0, maze.height * CELL / 2);
    mesh.receiveShadow = !isMobile;
    level.add(mesh);
  }

  function buildWalls() {
    var list = [];
    for (var y = 0; y < maze.height; y++) {
      for (var x = 0; x < maze.width; x++) {
        if (C.cellAt(maze, x, y) !== 0) list.push([x, y]);
      }
    }
    var count = list.length;
    if (!count) return;

    var wallGeometry = new T.BoxGeometry(CELL, WALL_H, CELL);
    var wallMaterial = new T.MeshLambertMaterial({ color: palette.wall, flatShading: true });
    var walls = new T.InstancedMesh(wallGeometry, wallMaterial, count);

    var capGeometry = new T.BoxGeometry(CELL * 1.015, 0.16, CELL * 1.015);
    var capMaterial = new T.MeshLambertMaterial({ color: palette.wallTop, flatShading: true });
    var caps = new T.InstancedMesh(capGeometry, capMaterial, count);

    var matrix = new T.Matrix4();
    var color = new T.Color();

    for (var i = 0; i < count; i++) {
      var wx = (list[i][0] + 0.5) * CELL;
      var wz = (list[i][1] + 0.5) * CELL;
      matrix.makeTranslation(wx, WALL_H / 2, wz);
      walls.setMatrixAt(i, matrix);
      matrix.makeTranslation(wx, WALL_H - 0.04, wz);
      caps.setMatrixAt(i, matrix);
      var jitter = 1 + (Math.random() * 0.12 - 0.06);
      color.setRGB(jitter, jitter, jitter);
      walls.setColorAt(i, color);
    }

    walls.instanceMatrix.needsUpdate = true;
    caps.instanceMatrix.needsUpdate = true;
    if (walls.instanceColor) walls.instanceColor.needsUpdate = true;

    walls.castShadow = !isMobile;
    walls.receiveShadow = !isMobile;
    caps.castShadow = !isMobile;
    caps.receiveShadow = false;

    level.add(caps);
    level.add(walls);
  }

  function buildRidge() {
    var cells = [];
    var index = 0;
    for (var y = 0; y < maze.height; y++) {
      for (var x = 0; x < maze.width; x++) {
        if (C.cellAt(maze, x, y) === 0) continue;
        index += 1;
        if (isMobile && index % 2 !== 0) continue;
        cells.push([x, y]);
      }
    }
    var count = cells.length;
    if (!count) return;

    var geometry = new T.ConeGeometry(1, 1, 4);
    var material = new T.MeshLambertMaterial({ color: 0xFFFFFF, flatShading: true });
    var mesh = new T.InstancedMesh(geometry, material, count);
    var baseColor = new T.Color(0xD9C9B0);
    var mintColor = new T.Color(0xB3E6D6);
    var peachColor = new T.Color(0xF6D3BC);

    for (var i = 0; i < count; i++) {
      var wx = (cells[i][0] + 0.5) * CELL;
      var wz = (cells[i][1] + 0.5) * CELL;
      var ridgeHeight = 0.16 + Math.random() * 0.26;
      var ridgeRadius = 1.2 + Math.random() * 0.5;
      tmpQuat.setFromAxisAngle(UP_AXIS, Math.random() * Math.PI * 2);
      tmpPos.set(wx, WALL_H - 0.02 + ridgeHeight * 0.5, wz);
      tmpScale.set(ridgeRadius, ridgeHeight, ridgeRadius);
      tmpMatrix.compose(tmpPos, tmpQuat, tmpScale);
      mesh.setMatrixAt(i, tmpMatrix);

      var roll = Math.random();
      if (roll < 0.035) tmpColor.copy(mintColor);
      else if (roll < 0.06) tmpColor.copy(peachColor);
      else tmpColor.copy(baseColor);
      var tint = 1 + (Math.random() * 0.08 - 0.04);
      tmpColor.multiplyScalar(tint);
      mesh.setColorAt(i, tmpColor);
    }

    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    level.add(mesh);
  }

  function buildClouds() {
    var groups = isMobile ? 3 : 6;
    var width = maze.width * CELL;
    var depth = maze.height * CELL;
    cloudData = [];

    var columns = isMobile ? 3 : 3;
    var rows = isMobile ? 1 : 2;
    for (var g = 0; g < groups; g++) {
      var col = g % columns;
      var row = Math.floor(g / columns) % rows;
      var centerX = width * 0.1 + ((col + 0.5) / columns) * width * 0.8 + (Math.random() - 0.5) * 8;
      var centerZ = depth * 0.1 + ((row + 0.5) / rows) * depth * 0.8 + (Math.random() - 0.5) * 8;
      var centerY = 10 + Math.random() * 2.4;
      var puffs = 2 + (Math.random() < 0.65 ? 1 : 0);
      for (var p = 0; p < puffs; p++) {
        var spread = (p - (puffs - 1) / 2) * 1.6;
        cloudData.push({
          x: centerX + spread + (Math.random() - 0.5) * 1.4,
          y: centerY + (Math.random() - 0.5) * 0.7,
          z: centerZ + (Math.random() - 0.5) * 2.4,
          sx: (1.3 + Math.random() * 0.6) * 1.6,
          sy: (0.9 + Math.random() * 0.5) * 0.55,
          sz: (1.3 + Math.random() * 0.6) * 1.1
        });
      }
    }

    if (!cloudData.length) return;

    var geometry = new T.IcosahedronGeometry(1, 0);
    var material = new T.MeshLambertMaterial({ color: 0xFFFFFF, emissive: 0xE9F3F8, emissiveIntensity: 0.62, transparent: true, opacity: 0.9, flatShading: true });
    cloudMesh = new T.InstancedMesh(geometry, material, cloudData.length);
    cloudMesh.frustumCulled = false;
    cloudMesh.castShadow = false;
    cloudMesh.receiveShadow = false;
    level.add(cloudMesh);
    updateClouds(0);
  }

  function updateClouds(dt) {
    if (!cloudMesh) return;
    var width = maze.width * CELL;
    for (var i = 0; i < cloudData.length; i++) {
      var cloud = cloudData[i];
      cloud.x += 0.25 * dt;
      if (cloud.x > width + 22) cloud.x -= width + 44;
      tmpPos.set(cloud.x, cloud.y, cloud.z);
      tmpScale.set(cloud.sx, cloud.sy, cloud.sz);
      tmpMatrix.compose(tmpPos, IDENTITY_Q, tmpScale);
      cloudMesh.setMatrixAt(i, tmpMatrix);
    }
    cloudMesh.instanceMatrix.needsUpdate = true;
  }

  function buildDecor() {
    var chance = isMobile ? 0.06 : 0.12;
    var rockGeometry = new T.IcosahedronGeometry(0.16, 0);
    var boxGeometry = new T.BoxGeometry(1, 1, 1);
    var rockData = [];
    var boxData = [];
    var sides = [[1, 0], [-1, 0], [0, 1], [0, -1]];

    for (var y = 1; y < maze.height - 1; y++) {
      for (var x = 1; x < maze.width - 1; x++) {
        if (C.cellAt(maze, x, y) !== 0) continue;
        if (Math.random() > chance) continue;

        var walls = [];
        for (var d = 0; d < sides.length; d++) {
          if (C.cellAt(maze, x + sides[d][0], y + sides[d][1]) !== 0) walls.push(sides[d]);
        }
        if (!walls.length) continue;

        var side = walls[Math.floor(Math.random() * walls.length)];
        var offset = 1.45 + Math.random() * 0.25;
        var baseX = (x + 0.5) * CELL + side[0] * offset;
        var baseZ = (y + 0.5) * CELL + side[1] * offset;
        var kind = Math.floor(Math.random() * 3);

        if (kind === 0) {
          var rockScale = 0.75 + Math.random() * 0.55;
          rockData.push({
            x: baseX,
            y: 0.06 + 0.05 * rockScale,
            z: baseZ,
            rx: Math.random() * 0.4,
            ry: Math.random() * Math.PI * 2,
            s: rockScale,
            color: 0xC9C2B4
          });
        } else if (kind === 1) {
          for (var b = 0; b < 3; b++) {
            var bladeHeight = 0.26 + Math.random() * 0.22;
            boxData.push({
              x: baseX + (Math.random() - 0.5) * 0.2,
              y: bladeHeight * 0.5,
              z: baseZ + (Math.random() - 0.5) * 0.2,
              rx: (Math.random() - 0.5) * 0.3,
              ry: Math.random() * Math.PI * 2,
              sx: 0.045 + Math.random() * 0.02,
              sy: bladeHeight,
              sz: 0.045 + Math.random() * 0.02,
              color: 0x8FCFA8
            });
          }
        } else {
          var stemHeight = 0.32 + Math.random() * 0.1;
          boxData.push({
            x: baseX,
            y: stemHeight * 0.5,
            z: baseZ,
            rx: 0,
            ry: Math.random() * Math.PI * 2,
            sx: 0.032,
            sy: stemHeight,
            sz: 0.032,
            color: 0x7FB894
          });
          rockData.push({
            x: baseX,
            y: stemHeight + 0.02,
            z: baseZ,
            rx: 0,
            ry: Math.random() * Math.PI * 2,
            s: 0.55,
            color: 0xF3A6B8
          });
        }
      }
    }

    addInstances(rockGeometry, rockData);
    addInstances(boxGeometry, boxData);
  }

  function addInstances(geometry, data) {
    if (!data.length) {
      geometry.dispose();
      return;
    }
    var material = new T.MeshLambertMaterial({ color: 0xFFFFFF, flatShading: true });
    var mesh = new T.InstancedMesh(geometry, material, data.length);
    for (var i = 0; i < data.length; i++) {
      var entry = data[i];
      tmpQuat.setFromAxisAngle(UP_AXIS, entry.ry || 0);
      if (entry.rx) {
        tmpQuatB.setFromAxisAngle(X_AXIS, entry.rx);
        tmpQuat.multiply(tmpQuatB);
      }
      tmpPos.set(entry.x, entry.y, entry.z);
      if (entry.s !== undefined) {
        tmpScale.set(entry.s, entry.s, entry.s);
      } else {
        tmpScale.set(entry.sx, entry.sy, entry.sz);
      }
      tmpMatrix.compose(tmpPos, tmpQuat, tmpScale);
      mesh.setMatrixAt(i, tmpMatrix);
      tmpColor.setHex(entry.color);
      mesh.setColorAt(i, tmpColor);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    level.add(mesh);
  }

  function buildExit() {
    var ex = (maze.exit.x + 0.5) * CELL;
    var ez = (maze.exit.y + 0.5) * CELL;
    exitPos = { x: ex, z: ez };

    var group = new T.Group();
    group.position.set(ex, 0, ez);

    var ring = new T.Mesh(
      new T.RingGeometry(1.05, 1.55, 40),
      new T.MeshBasicMaterial({ color: 0x6FD3B8, transparent: true, opacity: 0.9, side: T.DoubleSide, depthWrite: false })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.045;
    group.add(ring);
    exitRing = ring;

    var disc = new T.Mesh(
      new T.CircleGeometry(1.02, 32),
      new T.MeshBasicMaterial({ color: 0x6FD3B8, transparent: true, opacity: 0.2, side: T.DoubleSide, depthWrite: false })
    );
    disc.rotation.x = -Math.PI / 2;
    disc.position.y = 0.035;
    group.add(disc);

    var pillarHeight = 3;
    var pillarGeometry = new T.CylinderGeometry(0.86, 0.95, pillarHeight, 8, 1, true);
    var pillarPositions = pillarGeometry.attributes.position;
    var pillarColors = new Float32Array(pillarPositions.count * 4);
    for (var v = 0; v < pillarPositions.count; v++) {
      var along = (pillarPositions.getY(v) + pillarHeight / 2) / pillarHeight;
      var fade = Math.max(0, 1 - along * along * 1.1);
      pillarColors[v * 4] = 1;
      pillarColors[v * 4 + 1] = 1;
      pillarColors[v * 4 + 2] = 1;
      pillarColors[v * 4 + 3] = fade;
    }
    pillarGeometry.setAttribute('color', new T.BufferAttribute(pillarColors, 4));

    var pillar = new T.Mesh(
      pillarGeometry,
      new T.MeshBasicMaterial({ color: 0x6FD3B8, transparent: true, opacity: 0.34, side: T.DoubleSide, depthWrite: false, vertexColors: true })
    );
    pillar.position.y = pillarHeight / 2;
    group.add(pillar);
    exitPillar = pillar;

    var glow = new T.Sprite(new T.SpriteMaterial({
      map: haloTexture,
      color: 0xA8F0DE,
      transparent: true,
      opacity: 0.44,
      blending: T.AdditiveBlending,
      depthWrite: false
    }));
    glow.scale.set(3.2, 3.2, 1);
    glow.position.y = 1.5;
    group.add(glow);
    exitGlow = glow;

    exitCore = new T.Mesh(
      new T.OctahedronGeometry(0.62, 0),
      new T.MeshStandardMaterial({ color: 0x9BE8D4, emissive: 0x6FD3B8, emissiveIntensity: 0.9, flatShading: true })
    );
    exitCore.position.y = 1.7;
    group.add(exitCore);

    glideCubes = [];
    for (var i = 0; i < 6; i++) {
      var cube = new T.Mesh(
        new T.BoxGeometry(0.16, 0.16, 0.16),
        new T.MeshStandardMaterial({ color: 0x6FD3B8, emissive: 0x6FD3B8, emissiveIntensity: 0.45, flatShading: true })
      );
      cube.position.set(0, 1.2, 0);
      group.add(cube);
      glideCubes.push({ mesh: cube, phase: (i / 6) * Math.PI * 2, radius: 1.02 + (i % 3) * 0.14, speed: 0.45 + (i % 2) * 0.16, baseY: 0.8 + i * 0.24 });
    }

    level.add(group);
  }

  function buildItems() {
    itemGroup = new T.Group();
    level.add(itemGroup);

    var rng = C.createRng((seed >>> 0) ^ 0x9E3779B9);
    var cells = C.pickItemCells(maze, currentConfig().items, rng, { start: maze.startCell, minDistFromStart: 3 });
    itemTotal = cells.length;
    items = [];

    var geometry = new T.OctahedronGeometry(0.44, 0);

    for (var i = 0; i < cells.length; i++) {
      var wx = (cells[i].x + 0.5) * CELL;
      var wz = (cells[i].y + 0.5) * CELL;
      var mesh = new T.Mesh(geometry, new T.MeshStandardMaterial({
        color: 0xFFC94D,
        emissive: 0xFFB01F,
        emissiveIntensity: 0.7,
        flatShading: true
      }));
      mesh.position.set(wx, 1.25, wz);
      itemGroup.add(mesh);

      var sprite = new T.Sprite(new T.SpriteMaterial({
        map: haloTexture,
        color: 0xFFD98A,
        transparent: true,
        opacity: 0.55,
        blending: T.AdditiveBlending,
        depthWrite: false
      }));
      sprite.scale.set(3.4, 3.4, 1);
      sprite.position.set(wx, 1.25, wz);
      itemGroup.add(sprite);

      items.push({
        x: wx,
        z: wz,
        cell: cells[i],
        mesh: mesh,
        halo: sprite,
        phase: i * 0.9,
        taken: false
      });
    }

    for (var p = 0; p < 4; p++) {
      var light = new T.PointLight(0xFFC94D, 0, 10, 2);
      light.position.set(0, 1.9, 0);
      level.add(light);
      pointLights.push(light);
    }
  }

  function openingYaw() {
    if (C.isWalkable(maze, maze.entry.x + 1, maze.entry.y)) return -Math.PI / 2;
    if (C.isWalkable(maze, maze.entry.x, maze.entry.y + 1)) return Math.PI;
    if (C.isWalkable(maze, maze.entry.x - 1, maze.entry.y)) return Math.PI / 2;
    return 0;
  }

  function buildLevel(levelSeed, isPreview) {
    clearLevel();
    var conf = currentConfig();
    palette = paletteFor(conf, isPreview);
    scene.background.setHex(palette.sky);
    scene.fog.color.setHex(palette.sky);
    maze = C.generateMaze(conf.size, conf.size, { seed: levelSeed, braid: conf.braid });
    seed = maze.seed;
    exploration = C.createExploration(maze);
    level = new T.Group();
    scene.add(level);
    fitSun(maze.width, maze.height);
    buildFloor();
    buildWalls();
    buildRidge();
    buildClouds();
    buildDecor();
    buildExit();
    buildItems();

    player.x = (maze.entry.x + 0.5) * CELL;
    player.z = (maze.entry.y + 0.5) * CELL;
    player.yaw = openingYaw();
    player.pitch = 0;
    lookAccumX = 0;
    lookAccumY = 0;
    syncView();
    vel.x = 0;
    vel.z = 0;
    bobPhase = 0;
    stamina = 1;
    exhausted = false;
    bumpShake = 0;
    collected = 0;
    winLook = null;
    winShown = false;
    lastVision = -1;
    lastMap = -1;
    lastLight = -1;
    lastHud = -1;
    lastTimerText = '';
    lastCollectText = '';
    timer.reset();

    if (!isPreview) {
      scene.fog.near = isMobile ? 12 : 18;
      scene.fog.far = isMobile ? 44 : 62;
      fovNow = baseFov();
      camera.fov = fovNow;
      camera.updateProjectionMatrix();
      C.castVision(exploration, maze, player.x, player.z, CELL, { radius: 12, rays: 72 });
      camera.position.set(player.x, camera.aspect < 0.95 ? PORTRAIT_EYE : EYE, player.z);
      camera.rotation.set(camPitch, camYaw, 0);
    } else {
      scene.fog.near = 90;
      scene.fog.far = 260;
    }
  }

  function startGame(modeKey, opts, forced) {
    if (!renderer || generating) return;
    if (state === 'playing' && !forced) return;
    generating = true;
    try {
      opts = opts || {};
      if (modeKey === 'campaign') playMode = 'campaign';
      else if (modeKey && DIFFS[modeKey]) { playMode = 'free'; difficulty = modeKey; }
      if (opts.mode === 'campaign' || opts.mode === 'free') playMode = opts.mode;
      if (playMode === 'campaign') campaignLevel = Math.max(1, Math.round(opts.level !== undefined ? opts.level : campaignLevel) || 1);
      save('mistymaze.mode', playMode);
      save('mistymaze.difficulty', difficulty);
      applyModeUI();
      syncDifficultyUI();
      var useSeed = opts.seed !== undefined && opts.seed !== null ? (opts.seed >>> 0) : ((Math.random() * 4294967296) >>> 0);
      buildLevel(useSeed, false);
      state = 'playing';
      document.body.classList.add('ingame');
      hideScreens();
      timer.start();
      updateCollectHud();
      updateHud(true);
      updateStamina();
      drawMinimap(true);
      applyHint();
      if (playMode === 'campaign') showLevelBanner('第 ' + campaignLevel + ' 关');
      if (!touchMode) toast('点击画面锁定鼠标视角', 2400);
    } catch (err) {
      errors.push('start: ' + (err && err.message ? err.message : String(err)));
    }
    generating = false;
  }

  function toMenu() {
    state = 'menu';
    document.body.classList.remove('ingame', 'sprinting', 'stamina-low', 'hint-on');
    if (document.pointerLockElement && document.exitPointerLock) document.exitPointerLock();
    showScreen('start');
    clearToast();
    buildLevel((Math.random() * 4294967296) >>> 0, true);
    previewAngle = 0.6;
    camera.fov = 56;
    camera.updateProjectionMatrix();
    timer.pause();
    resetKeys();
  }

  function pauseGame() {
    if (state !== 'playing') return;
    state = 'paused';
    timer.pause();
    vel.x = 0;
    vel.z = 0;
    sprinting = false;
    bumpShake = 0;
    document.body.classList.remove('sprinting', 'stamina-low');
    resetKeys();
    if (document.pointerLockElement && document.exitPointerLock) document.exitPointerLock();
    showScreen('pause');
    syncSoundUI();
    clearToast();
  }

  function resumeGame() {
    if (state !== 'paused') return;
    state = 'playing';
    hideScreens();
    timer.resume();
    if (!touchMode) toast('点击画面锁定鼠标视角', 1800);
  }

  function triggerWin() {
    if (state !== 'playing') return;
    state = 'won';
    timer.pause();
    vel.x = 0;
    vel.z = 0;
    sprinting = false;
    stepAcc = 0;
    document.body.classList.remove('sprinting', 'stamina-low');
    resetKeys();
    var dx = exitPos.x - player.x;
    var dz = exitPos.z - player.z;
    var winDist = Math.sqrt(dx * dx + dz * dz);
    winLook = { yaw: winDist > 0.3 ? Math.atan2(-dx, -dz) : player.yaw, pitch: -0.12 };
    winClock = (window.performance && window.performance.now) ? window.performance.now() : Date.now();
    winShown = false;
    if (document.pointerLockElement && document.exitPointerLock) document.exitPointerLock();
    if (exitPillar) exitPillar.material.opacity = 0.05;
    if (exitGlow) exitGlow.material.opacity = 0.2;
    if (exitCore) exitCore.visible = false;
    for (var c = 0; c < glideCubes.length; c++) glideCubes[c].mesh.visible = false;
    clearToast();
    playWin();
  }

  function showWinPanel() {
    winShown = true;
    var seconds = timer.elapsed();
    var steps = C.bfsPath(maze, maze.entry, maze.exit).length || 20;
    var par = steps * 0.6 + 14;
    var result = C.computeGrade({ timeSec: seconds, collected: collected, totalItems: itemTotal, parTime: par });
    var key = 'mistymaze.best.' + difficulty;
    var best = loadBest(key);
    var record = !best || result.score > best.score || (result.score === best.score && seconds < best.time);
    if (record) {
      save(key, JSON.stringify({ time: seconds, score: result.score, collected: collected, grade: result.grade }));
    }
    els.winGrade.textContent = result.grade;
    var starPath = document.querySelector('.grade-badge svg path');
    if (starPath) {
      var fills = { S: 'rgba(255,201,77,.55)', A: 'rgba(111,211,184,.45)', B: 'rgba(180,196,208,.42)', C: 'rgba(214,208,198,.42)' };
      starPath.setAttribute('fill', fills[result.grade] || fills.C);
    }
    els.winTime.textContent = C.formatTime(seconds);
    els.winCollect.textContent = collected + ' / ' + itemTotal;
    els.winBest.textContent = C.formatTime(record ? seconds : best.time);
    els.winRecord.classList.toggle('on', !!record);
    if (playMode === 'campaign') {
      if (campaignLevel + 1 > campaignBest) campaignBest = campaignLevel + 1;
      save('mistymaze.campaign', JSON.stringify({ level: campaignLevel + 1, best: campaignBest }));
      if (els.winTitle) els.winTitle.textContent = '第 ' + campaignLevel + ' 关完成';
      if (els.winSub) els.winSub.textContent = '下一张迷宫已经准备好';
      if (els.btnNext) els.btnNext.textContent = '进入第 ' + (campaignLevel + 1) + ' 关';
    } else {
      if (els.winTitle) els.winTitle.textContent = '你走出了雾';
      if (els.winSub) els.winSub.textContent = '出口的薄荷色光在身后慢慢合拢';
    }
    showScreen('win');
  }

  function loadBest(key) {
    var raw = load(key, null);
    if (!raw) return null;
    try {
      var parsed = JSON.parse(raw);
      if (parsed && typeof parsed.time === 'number' && isFinite(parsed.time)) {
        return {
          time: parsed.time,
          score: typeof parsed.score === 'number' ? parsed.score : 0,
          collected: typeof parsed.collected === 'number' ? parsed.collected : 0,
          grade: typeof parsed.grade === 'string' ? parsed.grade : 'C'
        };
      }
    } catch (err) {
      var numeric = Number(raw);
      if (!isNaN(numeric)) return { time: numeric, score: 0, collected: 0, grade: 'C' };
    }
    return null;
  }

  function showScreen(name) {
    var map = { start: els.screenStart, win: els.screenWin, pause: els.screenPause };
    for (var key in map) {
      if (!map.hasOwnProperty(key)) continue;
      map[key].classList.toggle('active', key === name);
    }
  }

  function hideScreens() {
    showScreen('');
  }

  function clearToast() {
    if (!els.toast) return;
    els.toast.classList.remove('on');
    if (toastHandle) {
      window.clearTimeout(toastHandle);
      toastHandle = 0;
    }
  }

  function toast(text, ms) {
    if (!els.toast) return;
    els.toast.textContent = text;
    els.toast.classList.add('on');
    if (toastHandle) window.clearTimeout(toastHandle);
    toastHandle = window.setTimeout(function () {
      els.toast.classList.remove('on');
      toastHandle = 0;
    }, ms || 2200);
  }

  var levelBannerTimer = 0;

  function showLevelBanner(text) {
    if (!els.levelBanner || !els.levelBannerText) return;
    els.levelBannerText.textContent = text;
    els.levelBanner.classList.add('on');
    if (levelBannerTimer) clearTimeout(levelBannerTimer);
    levelBannerTimer = setTimeout(function () {
      els.levelBanner.classList.remove('on');
    }, 1500);
  }

  function applyModeUI() {
    document.body.classList.toggle('campaign', playMode === 'campaign');
    if (els.campLevel) els.campLevel.textContent = campaignLevel;
    if (els.campBest) els.campBest.textContent = campaignBest;
    if (els.levelText) els.levelText.textContent = playMode === 'campaign' ? ('第 ' + campaignLevel + ' 关') : '自由';
    var modeBtns = document.querySelectorAll('[data-mode]');
    for (var i = 0; i < modeBtns.length; i++) {
      modeBtns[i].setAttribute('aria-selected', modeBtns[i].getAttribute('data-mode') === playMode ? 'true' : 'false');
    }
    if (els.btnStart) els.btnStart.textContent = playMode === 'campaign' ? '开始闯关' : '开始探索';
  }

  function syncDifficultyUI() {
    var cards = document.querySelectorAll('[data-difficulty]');
    for (var i = 0; i < cards.length; i++) {
      var key = cards[i].getAttribute('data-difficulty');
      cards[i].setAttribute('aria-pressed', key === difficulty ? 'true' : 'false');
    }
  }

  function syncSensUI() {
    if (els.sensRange) els.sensRange.value = String(sens);
    if (els.sensValue) els.sensValue.textContent = sens.toFixed(1);
  }

  function syncSoundUI() {
    if (els.btnSound) {
      els.btnSound.classList.toggle('off', !soundOn);
      els.btnSound.setAttribute('aria-pressed', soundOn ? 'true' : 'false');
    }
    if (els.soundToggle) els.soundToggle.setAttribute('aria-pressed', soundOn ? 'true' : 'false');
  }

  function applySens(value) {
    sens = clamp(Number(value) || 1, 0.4, 2);
    syncSensUI();
    save('mistymaze.sens', sens);
  }

  function applyHint() {
    var on = !!(currentConfig().hint && state === 'playing');
    document.body.classList.toggle('hint-on', on);
  }

  function toggleSound() {
    soundOn = !soundOn;
    save('mistymaze.sound', soundOn ? '1' : '0');
    syncSoundUI();
    if (soundOn) {
      unlockAudio();
      tone(660, 0.1, 'sine', 0.07, 0, 990);
    }
  }

  function toggleMap() {
    var collapsed = els.minimapCard.classList.toggle('collapsed');
    els.btnMap.setAttribute('aria-pressed', collapsed ? 'true' : 'false');
    if (!collapsed) drawMinimap(true);
  }

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      var el = document.documentElement;
      if (el.requestFullscreen) {
        var p = el.requestFullscreen();
        if (p && p.catch) p.catch(function () {});
      }
    } else if (document.exitFullscreen) {
      document.exitFullscreen();
    }
  }

  function lockPointer() {
    if (!renderer || touchMode) return;
    var el = renderer.domElement;
    if (document.pointerLockElement === el) return;
    if (!el.requestPointerLock) return;
    try {
      var p = el.requestPointerLock({ unadjustedMovement: true });
      if (p && typeof p.catch === 'function') p.catch(function () {
        try { el.requestPointerLock(); } catch (e2) {}
      });
    } catch (err) {
      try { el.requestPointerLock(); } catch (e3) {}
    }
  }

  function resetKeys() {
    keys.up = false;
    keys.down = false;
    keys.left = false;
    keys.right = false;
    keys.shift = false;
    joyX = 0;
    joyY = 0;
    joy.id = null;
    joy.active = false;
    look.id = null;
    if (els.joyBase) els.joyBase.classList.remove('on');
    if (els.joyKnob) els.joyKnob.style.transform = 'translate3d(0,0,0)';
  }

  function readInput() {
    var x = 0;
    var z = 0;
    if (keys.up) z += 1;
    if (keys.down) z -= 1;
    if (keys.right) x += 1;
    if (keys.left) x -= 1;
    x += joyX;
    z -= joyY;
    return { x: x, z: z };
  }

  function updatePlayer(dt) {
    var input = readInput();
    var mag = Math.sqrt(input.x * input.x + input.z * input.z);
    if (mag > 1) {
      input.x /= mag;
      input.z /= mag;
      mag = 1;
    }

    var sprintInput = (keys.shift || (touchMode && Math.sqrt(joyX * joyX + joyY * joyY) > 0.92)) && mag > 0.15;
    var wantSprint = sprintInput && !exhausted && stamina > (sprinting ? 0.03 : 0.25);
    sprinting = wantSprint;
    if (wantSprint) stamina = Math.max(0, stamina - dt / 3.4);
    else stamina = Math.min(1, stamina + dt / 4.6);
    if (stamina <= 0.031) exhausted = true;
    else if (stamina >= 0.55) exhausted = false;

    var speed = wantSprint ? SPRINT_SPEED : SPEED;
    var sy = Math.sin(player.yaw);
    var cy = Math.cos(player.yaw);
    var targetX = (input.x * cy - input.z * sy) * speed;
    var targetZ = (-input.x * sy - input.z * cy) * speed;

    var blend = 1 - Math.exp(-(mag > 0.06 ? 11 : 8) * dt);
    vel.x += (targetX - vel.x) * blend;
    vel.z += (targetZ - vel.z) * blend;

    if (Math.abs(vel.x) < 0.002) vel.x = 0;
    if (Math.abs(vel.z) < 0.002) vel.z = 0;

    var dx = vel.x * dt;
    var dz = vel.z * dt;

    if (dx !== 0 || dz !== 0) {
      var res = C.resolveMove(maze, { x: player.x, z: player.z }, PLAYER_R, dx, dz, CELL);
      var bumped = (res.hitX && Math.abs(vel.x) > 2.4) || (res.hitZ && Math.abs(vel.z) > 2.4);
      player.x = res.x;
      player.z = res.z;
      if (res.hitX) vel.x = 0;
      if (res.hitZ) vel.z = 0;
      if (bumped) {
        playBump();
        bumpShake = Math.min(0.15, bumpShake + 0.095);
      }
    }

    var speedNow = Math.sqrt(vel.x * vel.x + vel.z * vel.z);
    stepAcc += speedNow * dt;
    var stride = wantSprint ? 2.5 : 2.0;
    if (stepAcc > stride) {
      stepAcc = 0;
      playStep(speedNow);
    }

    var exitDx = exitPos.x - player.x;
    var exitDz = exitPos.z - player.z;
    if (exitDx * exitDx + exitDz * exitDz < WIN_DIST * WIN_DIST) triggerWin();

    checkPickups();
  }

  function consumeLook() {
    if (!lookAccumX && !lookAccumY) return;
    var radPerPx = sens * 0.002;
    player.yaw -= lookAccumX * radPerPx;
    player.pitch = clamp(player.pitch - lookAccumY * radPerPx, -PITCH_LIMIT, PITCH_LIMIT);
    lookAccumX = 0;
    lookAccumY = 0;
  }

  function updateCameraView(dt) {
    consumeLook();
    if (lookSmoothing <= 0.001) {
      camYaw = player.yaw;
      camPitch = player.pitch;
    } else {
      var sk = 1 - Math.exp(-(34 - lookSmoothing * 26) * dt);
      camYaw += angleDiff(camYaw, player.yaw) * sk;
      camPitch += (player.pitch - camPitch) * sk;
    }
    var speedNow = Math.sqrt(vel.x * vel.x + vel.z * vel.z);
    var bobAmp = Math.min(1, speedNow / SPEED);
    bobPhase += dt * (5.6 + speedNow * 1.15);
    var bob = Math.sin(bobPhase * 2) * 0.036 * bobAmp;
    var portrait = camera.aspect < 0.95;
    var eye = portrait ? PORTRAIT_EYE : EYE;

    camera.position.set(player.x, eye + bob, player.z);
    camera.rotation.set(camPitch + Math.sin(bobPhase) * 0.005 * bobAmp, camYaw, 0);

    if (bumpShake > 0.001) {
      var wobble = Math.sin(clock.elapsedTime * 48) * bumpShake;
      camera.rotation.x = camPitch + wobble * 0.5;
      camera.rotation.z = wobble * 0.38;
      bumpShake = Math.max(0, bumpShake - dt * 1.15);
    }

    var targetFov = sprinting ? baseFov() + 6 : baseFov();
    fovNow += (targetFov - fovNow) * (1 - Math.exp(-6 * dt));
    if (Math.abs(camera.fov - fovNow) > 0.01) {
      camera.fov = fovNow;
      camera.updateProjectionMatrix();
    }

    document.body.classList.toggle('sprinting', sprinting);
    document.body.classList.toggle('stamina-low', stamina < 0.24);

    updateStamina();
  }

  function updateStamina() {
    if (els.staminaFill) els.staminaFill.style.transform = 'scaleX(' + stamina.toFixed(3) + ')';
  }

  function updateWinCamera(dt) {
    var elapsed = ((window.performance && window.performance.now) ? window.performance.now() : Date.now()) - winClock;
    if (winLook) {
      var k = 1 - Math.exp(-3.2 * dt);
      player.yaw = angleLerp(player.yaw, winLook.yaw, k);
      player.pitch += (winLook.pitch - player.pitch) * k;
    }
    camYaw = player.yaw;
    camPitch = player.pitch;
    camera.position.set(player.x, (camera.aspect < 0.95 ? PORTRAIT_EYE : EYE) - 0.1, player.z);
    camera.rotation.set(camPitch, camYaw, 0);
    if (!winShown && elapsed > 780) showWinPanel();
  }

  function updatePreview(dt) {
    if (!maze) return;
    previewAngle += dt * 0.12;
    var cx = maze.width * CELL / 2;
    var cz = maze.height * CELL / 2;
    var radius = Math.max(maze.width, maze.height) * CELL * 0.3;
    var height = Math.max(maze.width, maze.height) * CELL * 0.3;
    camera.position.set(cx + Math.cos(previewAngle) * radius, height, cz + Math.sin(previewAngle) * radius);
    camera.lookAt(cx, 0.5, cz);
  }

  function updateVision(now) {
    if (now - lastVision < 0.08) return;
    lastVision = now;
    C.castVision(exploration, maze, player.x, player.z, CELL, { radius: 12, rays: 72 });
  }

  function updateLights(now) {
    if (now - lastLight < 0.3) return;
    lastLight = now;
    var near = [];
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      if (it.taken) continue;
      var dx = it.x - player.x;
      var dz = it.z - player.z;
      var dist = dx * dx + dz * dz;
      if (dist < 420) near.push({ d: dist, it: it });
    }
    near.sort(function (a, b) { return a.d - b.d; });
    for (var k = 0; k < pointLights.length; k++) {
      var light = pointLights[k];
      if (k < near.length) {
        light.position.set(near[k].it.x, 1.95, near[k].it.z);
        light.intensity = 7;
      } else {
        light.intensity = 0;
      }
    }
  }

  function updateItems(now, dt) {
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      if (it.taken) continue;
      it.mesh.rotation.y += dt * 1.35;
      it.mesh.rotation.z = Math.sin(now * 0.8 + it.phase) * 0.16;
      var y = 1.25 + Math.sin(now * 1.8 + it.phase) * 0.13;
      it.mesh.position.y = y;
      it.halo.position.y = y;
      var dx = it.x - player.x;
      var dz = it.z - player.z;
      var dist = Math.sqrt(dx * dx + dz * dz);
      var farBoost = dist > 6 ? 1 + Math.min(0.6, (dist - 6) * 0.05) : 1;
      var pulse = (3.3 + Math.sin(now * 2.1 + it.phase) * 0.24) * farBoost;
      it.halo.scale.set(pulse, pulse, 1);
    }
    if (exitRing) {
      var beat = 1 + Math.sin(now * (Math.PI * 2 / 2.4)) * 0.1;
      exitRing.scale.set(beat, beat, 1);
    }
    if (exitCore) {
      exitCore.rotation.y += dt * 0.78;
      exitCore.rotation.x = Math.sin(now * 0.7) * 0.2;
      exitCore.position.y = 1.7 + Math.sin(now * 1.2) * 0.12;
    }
    for (var g = 0; g < glideCubes.length; g++) {
      var cube = glideCubes[g];
      var angle = cube.phase + now * cube.speed;
      cube.mesh.position.set(Math.cos(angle) * cube.radius, cube.baseY + Math.sin(now * 1.4 + cube.phase) * 0.2, Math.sin(angle) * cube.radius);
      cube.mesh.rotation.y = angle * 1.6;
      cube.mesh.rotation.x = angle * 1.1;
    }
  }

  function checkPickups() {
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      if (it.taken) continue;
      var dx = it.x - player.x;
      var dz = it.z - player.z;
      if (dx * dx + dz * dz < PICK_DIST * PICK_DIST) collectItem(it);
    }
  }

  function collectItem(it) {
    it.taken = true;
    var py = it.mesh.position.y;
    if (it.mesh.parent) it.mesh.parent.remove(it.mesh);
    if (it.halo.parent) it.halo.parent.remove(it.halo);
    it.mesh.material.dispose();
    it.halo.material.dispose();
    collected += 1;
    playPickup();
    spawnBurst(it.x, py, it.z);
    updateCollectHud();
    if (els.collectPill) {
      els.collectPill.classList.remove('bump');
      void els.collectPill.offsetWidth;
      els.collectPill.classList.add('bump');
    }
    if (collected === itemTotal && itemTotal > 0) toast('雾光碎片已全部收集', 2000);
  }

  function spawnBurst(x, y, z) {
    if (!level) return;
    for (var i = 0; i < 12; i++) {
      var mesh = new T.Mesh(
        new T.BoxGeometry(0.14, 0.14, 0.14),
        new T.MeshBasicMaterial({ color: i % 3 === 0 ? 0xFFF1C6 : 0xFFC94D, transparent: true, opacity: 1 })
      );
      mesh.position.set(x, y, z);
      var angle = (i / 12) * Math.PI * 2 + Math.random() * 0.5;
      var spread = 1.7 + Math.random() * 2.1;
      level.add(mesh);
      particles.push({
        mesh: mesh,
        vx: Math.cos(angle) * spread,
        vy: 1.5 + Math.random() * 2.6,
        vz: Math.sin(angle) * spread,
        life: 0,
        max: 0.55
      });
    }
  }

  function updateParticles(dt) {
    for (var i = particles.length - 1; i >= 0; i--) {
      var p = particles[i];
      p.life += dt;
      p.vy -= 9.6 * dt;
      p.mesh.position.x += p.vx * dt;
      p.mesh.position.z += p.vz * dt;
      p.mesh.position.y = Math.max(0.07, p.mesh.position.y + p.vy * dt);
      p.mesh.rotation.x += dt * 5.5;
      p.mesh.rotation.y += dt * 4.2;
      var t = p.life / p.max;
      p.mesh.material.opacity = Math.max(0, 1 - t);
      p.mesh.scale.setScalar(Math.max(0.02, 1 - t * 0.65));
      if (p.life >= p.max) {
        if (p.mesh.parent) p.mesh.parent.remove(p.mesh);
        p.mesh.geometry.dispose();
        p.mesh.material.dispose();
        particles.splice(i, 1);
      }
    }
  }

  function updateHud(force) {
    var now = clock.elapsedTime;
    if (!force && now - lastHud < 0.12) return;
    lastHud = now;
    var timeText = C.formatTime(timer.elapsed());
    if (timeText !== lastTimerText) {
      lastTimerText = timeText;
      if (els.timerText) els.timerText.textContent = timeText;
    }
    updateCollectHud();
  }

  function updateCollectHud() {
    var text = collected + ' / ' + itemTotal;
    if (text === lastCollectText) return;
    lastCollectText = text;
    if (els.collectText) els.collectText.innerHTML = '<b>' + collected + '</b> / ' + itemTotal;
  }

  function drawMinimap(force) {
    if (!minimapCtx) return;
    if (!maze || state === 'menu') {
      minimapCtx.setTransform(1, 0, 0, 1, 0, 0);
      minimapCtx.clearRect(0, 0, els.minimap.width, els.minimap.height);
      return;
    }
    if (els.minimapCard.classList.contains('collapsed')) return;

    var cssW = els.minimap.clientWidth || 150;
    var cssH = els.minimap.clientHeight || 150;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var pw = Math.round(cssW * dpr);
    var ph = Math.round(cssH * dpr);
    if (els.minimap.width !== pw || els.minimap.height !== ph) {
      els.minimap.width = pw;
      els.minimap.height = ph;
    }

    var ctx = minimapCtx;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);

    var pad = 7;
    var span = Math.max(maze.width, maze.height);
    var cs = (Math.min(cssW, cssH) - pad * 2) / span;
    var ox = (cssW - maze.width * cs) / 2;
    var oy = (cssH - maze.height * cs) / 2;

    for (var y = 0; y < maze.height; y++) {
      for (var x = 0; x < maze.width; x++) {
        var idx = y * maze.width + x;
        if (!exploration.visited[idx]) continue;
        var px = ox + x * cs;
        var py = oy + y * cs;
        if (C.cellAt(maze, x, y) !== 0) {
          ctx.fillStyle = 'rgba(46,51,56,.13)';
          ctx.fillRect(px - 0.25, py - 0.25, cs + 0.5, cs + 0.5);
        } else if (exploration.visible[idx]) {
          ctx.fillStyle = 'rgba(90,104,112,.62)';
          ctx.fillRect(px, py, cs + 0.35, cs + 0.35);
        } else {
          ctx.fillStyle = 'rgba(120,132,140,.28)';
          ctx.fillRect(px, py, cs + 0.35, cs + 0.35);
        }
      }
    }

    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      if (it.taken) continue;
      var cellIndex = it.cell.y * maze.width + it.cell.x;
      if (!exploration.visited[cellIndex]) continue;
      ctx.beginPath();
      ctx.arc(ox + (it.cell.x + 0.5) * cs, oy + (it.cell.y + 0.5) * cs, Math.max(1.7, cs * 0.2), 0, Math.PI * 2);
      ctx.fillStyle = '#FFC94D';
      ctx.fill();
    }

    if (exploration.visited[maze.exit.y * maze.width + maze.exit.x]) {
      var ex = ox + (maze.exit.x + 0.5) * cs;
      var ey = oy + (maze.exit.y + 0.5) * cs;
      ctx.beginPath();
      ctx.arc(ex, ey, Math.max(3.2, cs * 0.42), 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(111,211,184,.95)';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(ex, ey, Math.max(1.2, cs * 0.15), 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(111,211,184,.9)';
      ctx.fill();
    }

    var pxPlayer = ox + (player.x / CELL) * cs;
    var pyPlayer = oy + (player.z / CELL) * cs;
    var facing = Math.atan2(-Math.sin(player.yaw), Math.cos(player.yaw));

    ctx.save();
    ctx.translate(pxPlayer, pyPlayer);
    ctx.rotate(facing);
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.lineTo(5.4, 5.4);
    ctx.lineTo(0, 2.6);
    ctx.lineTo(-5.4, 5.4);
    ctx.closePath();
    ctx.fillStyle = '#2E3338';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.92)';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.restore();
  }

  function updateExitHint() {
    if (!els.exitHint) return;
    if (!currentConfig().hint || state !== 'playing') return;
    var dx = exitPos.x - player.x;
    var dz = exitPos.z - player.z;
    var worldAngle = Math.atan2(dx, -dz);
    var rel = worldAngle - player.yaw;
    while (rel > Math.PI) rel -= Math.PI * 2;
    while (rel < -Math.PI) rel += Math.PI * 2;
    var w = window.innerWidth;
    var h = window.innerHeight;
    var radius = Math.min(w, h) * 0.31;
    var sx = Math.sin(rel) * radius;
    var sy = -Math.cos(rel) * radius;
    els.exitHint.style.transform = 'translate3d(' + sx.toFixed(1) + 'px,' + sy.toFixed(1) + 'px,0) rotate(' + (rel * 180 / Math.PI).toFixed(1) + 'deg)';
  }

  function unlockAudio() {
    var ctx = audioCtx();
    if (ctx && ctx.state === 'suspended') {
      var p = ctx.resume();
      if (p && p.catch) p.catch(function () {});
    }
  }

  function audioCtx() {
    if (!soundOn) return null;
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    if (!actx) {
      try { actx = new AC(); } catch (err) { return null; }
    }
    if (actx.state === 'suspended') {
      var p = actx.resume();
      if (p && p.catch) p.catch(function () {});
    }
    return actx;
  }

  function tone(freq, dur, type, gain, delay, slideTo) {
    var ctx = audioCtx();
    if (!ctx) return;
    var t0 = ctx.currentTime + (delay || 0);
    var osc = ctx.createOscillator();
    var amp = ctx.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    amp.gain.setValueAtTime(0.0001, t0);
    amp.gain.linearRampToValueAtTime(gain || 0.09, t0 + 0.012);
    amp.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(amp);
    amp.connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.03);
  }

  function noiseBurst(duration, gain, cutoff) {
    var ctx = audioCtx();
    if (!ctx) return;
    if (!noiseBuffer) {
      var len = Math.floor(ctx.sampleRate * 0.25);
      noiseBuffer = ctx.createBuffer(1, len, ctx.sampleRate);
      var data = noiseBuffer.getChannelData(0);
      for (var i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2);
    }
    var src = ctx.createBufferSource();
    src.buffer = noiseBuffer;
    var filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = cutoff || 900;
    var amp = ctx.createGain();
    amp.gain.value = gain || 0.05;
    src.connect(filter);
    filter.connect(amp);
    amp.connect(ctx.destination);
    src.start();
    src.stop(ctx.currentTime + duration);
  }

  function playPickup() {
    tone(880, 0.12, 'sine', 0.1, 0, 1320);
    tone(1320, 0.1, 'sine', 0.055, 0.07, 1600);
  }

  function playWin() {
    var notes = [523, 659, 784, 1046];
    for (var i = 0; i < notes.length; i++) tone(notes[i], 0.26, 'sine', 0.085, i * 0.12);
  }

  function playBump() {
    var now = clock.elapsedTime;
    if (now - lastBumpAt < 0.15) return;
    lastBumpAt = now;
    tone(96, 0.13, 'triangle', 0.11, 0, 62);
  }

  function playStep(speed) {
    var now = clock.elapsedTime;
    if (now - lastStepAt < 0.19) return;
    lastStepAt = now;
    noiseBurst(0.07, 0.032 + Math.min(0.02, speed * 0.002), 620 + speed * 40);
  }

  function enableTouch() {
    if (touchMode) return;
    touchMode = true;
    document.body.classList.add('touch');
  }

  document.addEventListener('keydown', function (event) {
    var key = event.key;
    if (key === 'Escape') {
      if (state === 'playing') {
        pauseGame();
        event.preventDefault();
      } else if (state === 'paused') {
        resumeGame();
        event.preventDefault();
      }
      return;
    }
    if (key === 'Shift') keys.shift = true;
    if (key === 'w' || key === 'W' || key === 'ArrowUp') keys.up = true;
    if (key === 's' || key === 'S' || key === 'ArrowDown') keys.down = true;
    if (key === 'a' || key === 'A' || key === 'ArrowLeft') keys.left = true;
    if (key === 'd' || key === 'D' || key === 'ArrowRight') keys.right = true;
    if (key === 'm' || key === 'M') toggleMap();
    if (key === 'Enter' && state === 'menu') startGame(difficulty);
    if (key.indexOf('Arrow') === 0 || key === ' ') event.preventDefault();
    unlockAudio();
  });

  document.addEventListener('keyup', function (event) {
    var key = event.key;
    if (key === 'Shift') keys.shift = false;
    if (key === 'w' || key === 'W' || key === 'ArrowUp') keys.up = false;
    if (key === 's' || key === 'S' || key === 'ArrowDown') keys.down = false;
    if (key === 'a' || key === 'A' || key === 'ArrowLeft') keys.left = false;
    if (key === 'd' || key === 'D' || key === 'ArrowRight') keys.right = false;
  });

  window.addEventListener('blur', function () { resetKeys(); });

  if (renderer) {
    renderer.domElement.addEventListener('click', function () {
      if (state !== 'playing' || touchMode) return;
      lockPointer();
    });

    renderer.domElement.addEventListener('pointerdown', function () { unlockAudio(); });
  }

  document.addEventListener('mousemove', function (event) {
    if (state !== 'playing') return;
    if (!renderer || document.pointerLockElement !== renderer.domElement) return;
    lookAccumX += (event.movementX || 0);
    lookAccumY += (event.movementY || 0);
  });

  document.addEventListener('visibilitychange', function () {
    if (document.hidden && state === 'playing') pauseGame();
  });

  document.addEventListener('pointerlockchange', function () {
    if (state === 'playing' && !touchMode && !document.pointerLockElement) pauseGame();
  });

  els.joyLayer.addEventListener('touchstart', function (event) {
    event.preventDefault();
    enableTouch();
    unlockAudio();
    var touch = event.changedTouches[0];
    if (!touch || joy.active) return;
    joy.id = touch.identifier;
    joy.active = true;
    joy.ox = touch.clientX;
    joy.oy = touch.clientY;
    joyX = 0;
    joyY = 0;
    els.joyBase.style.left = joy.ox + 'px';
    els.joyBase.style.top = joy.oy + 'px';
    els.joyBase.classList.add('on');
    els.joyKnob.style.transform = 'translate3d(0,0,0)';
  }, { passive: false });

  els.joyLayer.addEventListener('touchmove', function (event) {
    event.preventDefault();
    for (var i = 0; i < event.changedTouches.length; i++) {
      var touch = event.changedTouches[i];
      if (touch.identifier !== joy.id) continue;
      var dx = touch.clientX - joy.ox;
      var dy = touch.clientY - joy.oy;
      var len = Math.sqrt(dx * dx + dy * dy);
      if (len > JOY_R) {
        dx = dx / len * JOY_R;
        dy = dy / len * JOY_R;
      }
      var nx = dx / JOY_R;
      var ny = dy / JOY_R;
      var nlen = Math.sqrt(nx * nx + ny * ny);
      if (nlen < JOY_DEAD) {
        nx = 0;
        ny = 0;
      } else {
        var scaled = ((nlen - JOY_DEAD) / (1 - JOY_DEAD)) / nlen;
        nx *= scaled;
        ny *= scaled;
      }
      joyX = nx;
      joyY = ny;
      els.joyKnob.style.transform = 'translate3d(' + dx.toFixed(1) + 'px,' + dy.toFixed(1) + 'px,0)';
    }
  }, { passive: false });

  function endJoystick(event) {
    for (var i = 0; i < event.changedTouches.length; i++) {
      if (event.changedTouches[i].identifier !== joy.id) continue;
      joy.id = null;
      joy.active = false;
      joyX = 0;
      joyY = 0;
      els.joyBase.classList.remove('on');
      els.joyKnob.style.transform = 'translate3d(0,0,0)';
    }
  }

  els.joyLayer.addEventListener('touchend', endJoystick);
  els.joyLayer.addEventListener('touchcancel', endJoystick);

  els.lookLayer.addEventListener('touchstart', function (event) {
    event.preventDefault();
    enableTouch();
    unlockAudio();
    var touch = event.changedTouches[0];
    if (!touch || look.id !== null) return;
    look.id = touch.identifier;
    look.lx = touch.clientX;
    look.ly = touch.clientY;
  }, { passive: false });

  els.lookLayer.addEventListener('touchmove', function (event) {
    event.preventDefault();
    for (var i = 0; i < event.changedTouches.length; i++) {
      var touch = event.changedTouches[i];
      if (touch.identifier !== look.id) continue;
      var dx = touch.clientX - look.lx;
      var dy = touch.clientY - look.ly;
      look.lx = touch.clientX;
      look.ly = touch.clientY;
      if (state === 'playing') {
        var tRad = sens * 0.0042;
        player.yaw -= dx * tRad;
        player.pitch = clamp(player.pitch - dy * tRad, -PITCH_LIMIT, PITCH_LIMIT);
      }
    }
  }, { passive: false });

  function endLook(event) {
    for (var i = 0; i < event.changedTouches.length; i++) {
      if (event.changedTouches[i].identifier === look.id) look.id = null;
    }
  }

  els.lookLayer.addEventListener('touchend', endLook);
  els.lookLayer.addEventListener('touchcancel', endLook);

  document.addEventListener('touchstart', function () { enableTouch(); unlockAudio(); }, { passive: true });

  var difficultyCards = document.querySelectorAll('[data-difficulty]');
  for (var dc = 0; dc < difficultyCards.length; dc++) {
    difficultyCards[dc].addEventListener('click', function () {
      var key = this.getAttribute('data-difficulty');
      if (!DIFFS[key]) return;
      difficulty = key;
      save('mistymaze.difficulty', difficulty);
      syncDifficultyUI();
      applyHint();
    });
  }

  var modeCards = document.querySelectorAll('[data-mode]');
  for (var mc = 0; mc < modeCards.length; mc++) {
    modeCards[mc].addEventListener('click', function () {
      playMode = this.getAttribute('data-mode') === 'free' ? 'free' : 'campaign';
      save('mistymaze.mode', playMode);
      applyModeUI();
      applyHint();
      buildLevel((Math.random() * 4294967296) >>> 0, true);
      previewAngle = 0.6;
    });
  }

  els.btnStart.addEventListener('click', function () {
    unlockAudio();
    if (playMode === 'campaign') startGame('campaign', { level: campaignLevel });
    else startGame('free', { mode: 'free' });
  });

  els.btnNext.addEventListener('click', function () {
    startGame('campaign', { level: campaignLevel + 1 });
  });
  els.btnAgain.addEventListener('click', function () {
    startGame(playMode === 'campaign' ? 'campaign' : 'free', { seed: seed, level: campaignLevel });
  });
  els.btnNewmaze.addEventListener('click', function () {
    startGame(playMode === 'campaign' ? 'campaign' : 'free', { level: campaignLevel });
  });
  els.btnMenu.addEventListener('click', function () { toMenu(); });

  els.btnResume.addEventListener('click', function () { resumeGame(); });
  els.btnRestart.addEventListener('click', function () { startGame(playMode === 'campaign' ? 'campaign' : 'free', { seed: seed, level: campaignLevel }); });
  els.btnQuit.addEventListener('click', function () { toMenu(); });

  els.btnPause.addEventListener('click', function () {
    if (state === 'playing') pauseGame();
  });

  els.btnSound.addEventListener('click', function () { toggleSound(); });
  els.soundToggle.addEventListener('click', function () { toggleSound(); });
  els.btnMap.addEventListener('click', function () { toggleMap(); });
  els.minimapCard.addEventListener('click', function () {
    if (els.minimapCard.classList.contains('collapsed')) toggleMap();
  });
  els.btnFullscreen.addEventListener('click', function () { toggleFullscreen(); });

  els.sensRange.addEventListener('input', function () { applySens(this.value); });

  els.smoothRange.addEventListener('input', function () {
    lookSmoothing = clamp(parseFloat(this.value) || 0, 0, 0.8);
    if (els.smoothValue) els.smoothValue.textContent = lookSmoothing < 0.01 ? '关' : lookSmoothing.toFixed(2);
    save('mistymaze.smooth', String(lookSmoothing));
  });

  els.leftyToggle.addEventListener('click', function () {
    leftyMode = !leftyMode;
    document.body.classList.toggle('lefty', leftyMode);
    this.setAttribute('aria-pressed', leftyMode ? 'true' : 'false');
    save('mistymaze.lefty', leftyMode ? '1' : '0');
  });

  (function initPrefs() {
    var modeSaved = load('mistymaze.mode', '');
    if (modeSaved === 'free' || modeSaved === 'campaign') playMode = modeSaved;
    var camp = null;
    try { camp = JSON.parse(load('mistymaze.campaign', '')); } catch (e) { camp = null; }
    if (camp && camp.level) campaignLevel = Math.max(1, camp.level | 0);
    if (camp && camp.best) campaignBest = Math.max(campaignLevel, camp.best | 0);
    var smoothSaved = parseFloat(load('mistymaze.smooth', '0'));
    lookSmoothing = isFinite(smoothSaved) ? clamp(smoothSaved, 0, 0.8) : 0;
    if (els.smoothRange) els.smoothRange.value = String(lookSmoothing);
    if (els.smoothValue) els.smoothValue.textContent = lookSmoothing < 0.01 ? '关' : lookSmoothing.toFixed(2);
    leftyMode = load('mistymaze.lefty', '0') === '1';
    document.body.classList.toggle('lefty', leftyMode);
    if (els.leftyToggle) els.leftyToggle.setAttribute('aria-pressed', leftyMode ? 'true' : 'false');
    applyModeUI();
  })();

  window.addEventListener('resize', function () {
    if (renderer) {
      var w = window.innerWidth;
      var h = window.innerHeight;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isMobile ? 1.75 : 2));
      renderer.setSize(w, h);
      camera.aspect = w / Math.max(1, h);
      camera.updateProjectionMatrix();
    }
    drawMinimap(true);
  });

  window.addEventListener('orientationchange', function () {
    window.setTimeout(function () {
      if (renderer) {
        renderer.setSize(window.innerWidth, window.innerHeight);
        camera.aspect = window.innerWidth / Math.max(1, window.innerHeight);
        camera.updateProjectionMatrix();
      }
      drawMinimap(true);
    }, 220);
  });

  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', function () {
      if (renderer) {
        renderer.setSize(window.innerWidth, window.innerHeight);
        camera.aspect = window.innerWidth / Math.max(1, window.innerHeight);
        camera.updateProjectionMatrix();
      }
      drawMinimap(true);
    });
  }

  function update(rawDt) {
    var now = clock.elapsedTime;

    if (state === 'menu') {
      updatePreview(rawDt);
    } else if (state === 'playing') {
      var subSteps = Math.min(8, Math.max(1, Math.ceil(rawDt / 0.033)));
      var stepDt = rawDt / subSteps;
      for (var s = 0; s < subSteps; s++) {
        if (state !== 'playing') break;
        updatePlayer(stepDt);
      }
      updateCameraView(rawDt);
      updateVision(now);
      updateLights(now);
      updateHud(false);
      updateExitHint();
      if (now - lastMap > 0.1) {
        lastMap = now;
        drawMinimap(false);
      }
    } else if (state === 'won') {
      updateWinCamera(rawDt);
    }

    updateClouds(rawDt);
    updateItems(now, rawDt);
    updateParticles(rawDt);
  }

  function tick() {
    requestAnimationFrame(tick);
    var rawDt = Math.min(clock.getDelta(), 0.25);
    frameCount += 1;
    update(rawDt);
    if (renderer) renderer.render(scene, camera);
  }

  window.__MAZE_DEBUG__ = {
    state: function () { return state; },
    player: function () { return { x: player.x, z: player.z, yaw: player.yaw, pitch: player.pitch }; },
    maze: function () {
      if (!maze) return null;
      return {
        width: maze.width,
        height: maze.height,
        seed: maze.seed,
        entry: { x: maze.entry.x, y: maze.entry.y },
        exit: { x: maze.exit.x, y: maze.exit.y },
        itemCount: itemTotal
      };
    },
    collected: function () { return collected; },
    explored: function () {
      if (!exploration) return 0;
      var total = 0;
      for (var i = 0; i < exploration.visited.length; i++) {
        if (exploration.visited[i]) total += 1;
      }
      return total;
    },
    start: function (key, level) {
      if (key === 'campaign') startGame('campaign', { level: level || campaignLevel }, true);
      else if (DIFFS[key]) startGame(key, { mode: 'free' }, true);
      else startGame(playMode === 'campaign' ? 'campaign' : 'free', { level: campaignLevel }, true);
    },
    level: function () { return campaignLevel; },
    mode: function () { return playMode; },
    cam: function () { return { yaw: camYaw, pitch: camPitch }; },
    palette: function () { return { sky: palette.sky, wall: palette.wall, wallTop: palette.wallTop, floorA: palette.floorA }; },
    teleport: function (x, z) {
      player.x = Number(x) || 0;
      player.z = Number(z) || 0;
      vel.x = 0;
      vel.z = 0;
      if (state === 'playing' && maze) {
        C.castVision(exploration, maze, player.x, player.z, CELL, { radius: 12, rays: 72 });
        drawMinimap(true);
      }
    },
    setYaw: function (rad) { player.yaw = Number(rad) || 0; syncView(); },
    frame: function () { return frameCount; },
    errors: function () { return errors.slice(); }
  };

  function boot() {
    if (isMobile) document.body.classList.add('touch');
    syncDifficultyUI();
    syncSensUI();
    syncSoundUI();
    applyHint();
    if (!renderer) {
      if (els.noWebgl) els.noWebgl.style.display = 'block';
      return;
    }
    toMenu();
    clock.start();
    requestAnimationFrame(tick);
  }

  boot();
})();
