// --- 1. 전역 변수 및 Three.js 초기화 ---
let COLS = 5, ROWS = 7, DEPTH = 5;
let initialDropInterval = 1000;
let dropInterval = 1000;

const container = document.getElementById('game-container');
const scene = new THREE.Scene();
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(container.clientWidth, container.clientHeight);
container.appendChild(renderer.domElement);

const camera = new THREE.PerspectiveCamera(60, container.clientWidth / container.clientHeight, 0.1, 1000);
const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
scene.add(ambientLight);
const dirLight = new THREE.DirectionalLight(0xffffff, 0.5);
dirLight.position.set(10, 15, 10);
scene.add(dirLight);
// --- 마우스 궤도 컨트롤(OrbitControls) 추가 ---
const controls = new THREE.OrbitControls(camera, renderer.domElement);
controls.enableDamping = true; // 마우스 놓았을 때 스르륵 멈추는 관성 효과
controls.dampingFactor = 0.05; // 관성 저항값
controls.enablePan = false;    // 게임판이 화면 밖으로 벗어나지 않게 우클릭 이동 방지 (선택사항)
controls.target.set(0, ROWS / 2 - 1, 0); // 항상 게임판 중앙을 바라보도록 축 설정
// ----------------------------------------------
// 게임 상태 변수
let gameField = [];
let meshField = [];
let isPlaying = false;
let score = 0;
let minoBag = [];
let nextMinos = [];
let currentMino = null;
let ghostMino = null;
let gridHelperGroup = null; 

let keyCount = 0;
let spawnTime = 0;

// 홀드 변수
let heldMinoType = null;
let canHold = true;

// 조작감(DAS/ARR) 변수
const DAS_DELAY = 160; 
const ARR_INTERVAL = 40; 
let initialDelays = { left: null, right: null, up: null, down: null };
let moveTimers = { left: null, right: null, up: null, down: null };

// 고정 지연(Lock Delay) 변수
const LOCK_DELAY = 500; 
const MAX_LOCK_RESETS = 15; 
let lockTimer = null;
let lockResetCount = 0;

// --- 2. 설정 UI 이벤트 ---
['x', 'z', 'y', 'speed'].forEach(id => {
    const input = document.getElementById(`set-${id}`);
    const valSpan = document.getElementById(`val-${id}`);
    input.addEventListener('input', () => { valSpan.innerText = input.value; });
});

// --- 3. 고정 지연 (Lock Delay) 타이머 관리 ---
function startLockTimer() {
    if (lockTimer !== null) return; 
    lockTimer = setTimeout(() => {
        if (!isValidMove(0, -1, 0)) {
            lockMino();
        } else {
            cancelLockTimer();
        }
    }, LOCK_DELAY);
}

function cancelLockTimer() {
    if (lockTimer !== null) {
        clearTimeout(lockTimer);
        lockTimer = null;
    }
}

function resetLockTimer() {
    if (!isValidMove(0, -1, 0) && lockResetCount < MAX_LOCK_RESETS) {
        cancelLockTimer();
        lockResetCount++;
        startLockTimer();
    }
}

// --- 4. 3D 렌더링 및 격자 뷰어 ---
function createGridGuide() {
    if (gridHelperGroup) scene.remove(gridHelperGroup);
    gridHelperGroup = new THREE.Group();

    const thickMaterial = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8 });
    const thinMaterial = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.4 });
    const xHalf = COLS / 2, zHalf = DEPTH / 2, yMax = ROWS - 0.5, yMin = -0.5;
    const thickPoints = [], thinPoints = [];

    for (let i = 0; i <= COLS; i++) thickPoints.push(new THREE.Vector3(i - xHalf, yMin, -zHalf), new THREE.Vector3(i - xHalf, yMin, zHalf), new THREE.Vector3(i - xHalf, yMin, -zHalf), new THREE.Vector3(i - xHalf, yMax, -zHalf));
    for (let i = 0; i <= DEPTH; i++) thickPoints.push(new THREE.Vector3(-xHalf, yMin, i - zHalf), new THREE.Vector3(xHalf, yMin, i - zHalf), new THREE.Vector3(-xHalf, yMin, i - zHalf), new THREE.Vector3(-xHalf, yMax, i - zHalf));
    for (let i = 0; i <= ROWS; i++) thickPoints.push(new THREE.Vector3(-xHalf, i - 0.5, -zHalf), new THREE.Vector3(-xHalf, i - 0.5, zHalf), new THREE.Vector3(-xHalf, i - 0.5, -zHalf), new THREE.Vector3(xHalf, i - 0.5, -zHalf));

    thinPoints.push(new THREE.Vector3(xHalf, yMin, -zHalf), new THREE.Vector3(xHalf, yMax, -zHalf), new THREE.Vector3(-xHalf, yMin, zHalf), new THREE.Vector3(-xHalf, yMax, zHalf), new THREE.Vector3(xHalf, yMin, zHalf), new THREE.Vector3(xHalf, yMax, zHalf), new THREE.Vector3(-xHalf, yMax, zHalf), new THREE.Vector3(xHalf, yMax, zHalf), new THREE.Vector3(xHalf, yMax, -zHalf), new THREE.Vector3(xHalf, yMax, zHalf));

    gridHelperGroup.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(thickPoints), thickMaterial));
    gridHelperGroup.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(thinPoints), thinMaterial));
    scene.add(gridHelperGroup);
}

function initSliceView() {
    const wrapper = document.getElementById('layers-wrapper');
    if (!wrapper) return;
    wrapper.innerHTML = '';
    wrapper.style.gridTemplateColumns = '1fr 1fr';
    
    const hLeft = Math.floor(ROWS / 2), hRight = Math.ceil(ROWS / 2);
    const offsetLeft = hRight - hLeft; 

    for (let i = hRight - 1; i >= 0; i--) {
        const yLeft = i - offsetLeft, yRight = i + hLeft;
        if (yLeft >= 0) wrapper.appendChild(createLayerBlock(yLeft));
        else wrapper.appendChild(document.createElement('div')); 
        if (yRight < ROWS) wrapper.appendChild(createLayerBlock(yRight));
        else wrapper.appendChild(document.createElement('div')); 
    }
}

function createLayerBlock(y) {
    const layerDiv = document.createElement('div');
    layerDiv.className = 'layer-view';
    layerDiv.innerHTML = `<div class="layer-label">L-${y + 1}</div>`; 
    
    const grid = document.createElement('div');
    grid.className = 'grid-2d';
    grid.id = `layer-${y}`;
    
    const cellSize = Math.max(8, 20 - Math.max(COLS, DEPTH)); 
    grid.style.gridTemplateColumns = `repeat(${COLS}, ${cellSize}px)`;
    grid.style.gridTemplateRows = `repeat(${DEPTH}, ${cellSize}px)`;
    
    for (let i = 0; i < COLS * DEPTH; i++) {
        const cell = document.createElement('div');
        cell.className = 'cell';
        cell.style.width = `${cellSize}px`; cell.style.height = `${cellSize}px`;
        grid.appendChild(cell);
    }
    layerDiv.appendChild(grid);
    return layerDiv;
}

function updateSliceView() {
    for (let y = 0; y < ROWS; y++) {
        const grid = document.getElementById(`layer-${y}`);
        if (!grid) continue;
        const cells = grid.getElementsByClassName('cell');
        for (let x = 0; x < COLS; x++) {
            for (let z = 0; z < DEPTH; z++) {
                const index = z * COLS + x; 
                cells[index].style.backgroundColor = '#111'; cells[index].style.boxShadow = 'none';
                if (gameField[y][x][z] !== 0) cells[index].style.backgroundColor = gameField[y][x][z]; 
            }
        }
    }

    if (currentMino) {
        const xHalf = Math.floor(COLS / 2), zHalf = Math.floor(DEPTH / 2);
        currentMino.children.forEach(mesh => {
            const worldX = Math.round(currentMino.position.x + mesh.position.x), worldY = Math.round(currentMino.position.y + mesh.position.y), worldZ = Math.round(currentMino.position.z + mesh.position.z);
            if (worldY >= 0 && worldY < ROWS && worldX + xHalf >= 0 && worldX + xHalf < COLS && worldZ + zHalf >= 0 && worldZ + zHalf < DEPTH) {
                const grid = document.getElementById(`layer-${worldY}`);
                if (grid) {
                    const cells = grid.getElementsByClassName('cell');
                    const index = (worldZ + zHalf) * COLS + (worldX + xHalf); 
                    if (cells[index]) {
                        const minoColor = currentMino.children[0].material.color.getStyle();
                        cells[index].style.backgroundColor = minoColor;
                        cells[index].style.boxShadow = `inset 0 0 10px ${minoColor}`;
                    }
                }
            }
        });
    }
}

function updateGhostMino() {
    if (!isPlaying || !currentMino) return;
    if (ghostMino) { scene.remove(ghostMino); ghostMino = null; }

    ghostMino = new THREE.Group();
    const ghostMaterial = new THREE.MeshStandardMaterial({ color: 0x888888, transparent: true, opacity: 0.3, roughness: 0.5 });
    const edgeMaterial = new THREE.LineBasicMaterial({ color: 0x555555, transparent: true, opacity: 0.4 });

    currentMino.children.forEach(mesh => {
        const gMesh = new THREE.Mesh(mesh.geometry, ghostMaterial);
        gMesh.position.copy(mesh.position);
        gMesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry), edgeMaterial));
        ghostMino.add(gMesh);
    });

    let dropDist = 0;
    while (isValidMove(0, -(dropDist + 1), 0)) dropDist++;

    ghostMino.position.copy(currentMino.position);
    ghostMino.position.y -= dropDist;
    scene.add(ghostMino);
}

// --- 5. 미노 데이터 및 렌더링 로직 ---
const MINO_TYPES = {
    I: { color: "#00ffff", blocks: [[-1, 0, 0], [0, 0, 0], [1, 0, 0], [2, 0, 0]] },
    O: { color: "#ffff00", blocks: [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0]] },
    T: { color: "#800080", blocks: [[-1, 0, 0], [0, 0, 0], [1, 0, 0], [0, 1, 0]] },
    S: { color: "#00ff00", blocks: [[-1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]] },
    Z: { color: "#ff0000", blocks: [[-1, 1, 0], [0, 1, 0], [0, 0, 0], [1, 0, 0]] },
    J: { color: "#0000ff", blocks: [[-1, 1, 0], [-1, 0, 0], [0, 0, 0], [1, 0, 0]] },
    L: { color: "#ffa500", blocks: [[1, 1, 0], [-1, 0, 0], [0, 0, 0], [1, 0, 0]] }
};

const MINO_LAYOUTS = {
    I: [[1,1,1,1], [0,0,0,0]], O: [[0,1,1,0], [0,1,1,0]], T: [[0,1,0,0], [1,1,1,0]],
    S: [[0,1,1,0], [1,1,0,0]], Z: [[1,1,0,0], [0,1,1,0]], J: [[1,0,0,0], [1,1,1,0]], L: [[0,0,1,0], [1,1,1,0]]
};

function refillBag() {
    let bag = Object.keys(MINO_TYPES);
    for (let i = bag.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [bag[i], bag[j]] = [bag[j], bag[i]];
    }
    minoBag.push(...bag);
}

function getNextFromBag() {
    if (minoBag.length < 10) refillBag();
    return minoBag.shift();
}

function initNextMinos() {
    nextMinos = [];
    for (let i = 0; i < 5; i++) nextMinos.push(getNextFromBag());
    updateNextUI();
}

function draw2DGrid(container, typeKey) {
    container.innerHTML = '';
    const grid = document.createElement('div');
    grid.className = 'next-preview-grid';
    const layout = MINO_LAYOUTS[typeKey];
    const color = MINO_TYPES[typeKey].color;

    for (let r = 0; r < 2; r++) {
        for (let c = 0; c < 4; c++) {
            const cell = document.createElement('div');
            cell.className = 'preview-cell';
            if (layout[r][c] === 1) {
                cell.style.backgroundColor = color;
                cell.classList.add('preview-filled');
            }
            grid.appendChild(cell);
        }
    }
    container.appendChild(grid);
}

function updateNextUI() {
    const nextList = document.getElementById('next-list');
    if (!nextList) return;
    nextList.innerHTML = '';
    nextMinos.forEach(typeKey => {
        const wrapper = document.createElement('div');
        wrapper.style.marginBottom = "8px";
        draw2DGrid(wrapper, typeKey);
        nextList.appendChild(wrapper);
    });
}

function updateHoldUI() {
    const holdList = document.getElementById('hold-list');
    if (!holdList) return;
    if (heldMinoType) draw2DGrid(holdList, heldMinoType);
    else holdList.innerHTML = '';
    
    holdList.style.opacity = canHold ? "1" : "0.3";
}

function createMinoGroup(typeKey) {
    const type = MINO_TYPES[typeKey];
    const group = new THREE.Group();
    const geometry = new THREE.BoxGeometry(0.95, 0.95, 0.95); 
    const material = new THREE.MeshStandardMaterial({ color: type.color, roughness: 0.2, metalness: 0.1 });

    type.blocks.forEach(offset => {
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(offset[0], offset[1], offset[2]);
        mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(geometry), new THREE.LineBasicMaterial({ color: 0x000000 })));
        group.add(mesh);
    });
    return group;
}

function spawnMino() {
    const typeKey = nextMinos.shift();
    nextMinos.push(getNextFromBag());
    updateNextUI();

    const group = createMinoGroup(typeKey);
    group.position.set(0, ROWS - 1, 0);
    scene.add(group);
    
    keyCount = 0;
    spawnTime = performance.now(); 
    return group;
}

function holdMino() {
    if (!canHold || !currentMino) return;

    const currentMinoStyle = currentMino.children[0].material.color.getStyle();
    const currentType = Object.keys(MINO_TYPES).find(key => new THREE.Color(MINO_TYPES[key].color).getStyle() === currentMinoStyle);

    scene.remove(currentMino);
    if (ghostMino) scene.remove(ghostMino);
    cancelLockTimer(); // 홀드 시 타이머 캔슬

    if (heldMinoType === null) {
        heldMinoType = currentType;
        currentMino = spawnMino();
    } else {
        const toSpawn = heldMinoType;
        heldMinoType = currentType;
        currentMino = createMinoGroup(toSpawn);
        currentMino.position.set(0, ROWS - 1, 0);
        scene.add(currentMino);
    }

    canHold = false; 
    updateHoldUI();
    updateSliceView();
    updateGhostMino();
}

// --- 6. 충돌, 회전(SRS), 이동 ---
function isValidMove(dx, dy, dz) {
    let valid = true;
    const xHalf = Math.floor(COLS / 2), zHalf = Math.floor(DEPTH / 2);
    currentMino.children.forEach(mesh => {
        const targetX = Math.round(currentMino.position.x + mesh.position.x + dx);
        const targetY = Math.round(currentMino.position.y + mesh.position.y + dy);
        const targetZ = Math.round(currentMino.position.z + mesh.position.z + dz);
        if (targetX < -xHalf || targetX > xHalf || targetZ < -zHalf || targetZ > zHalf || targetY < 0) valid = false;
        if (valid && targetY < ROWS && gameField[targetY][targetX + xHalf] && gameField[targetY][targetX + xHalf][targetZ + zHalf] !== 0) valid = false;
    });
    return valid;
}

function rotateMino(axis, direction) {
    if (!currentMino) return;
    const originalPositions = [];
    currentMino.children.forEach(mesh => originalPositions.push(new THREE.Vector3().copy(mesh.position)));

    currentMino.children.forEach(mesh => {
        const x = Math.round(mesh.position.x), y = Math.round(mesh.position.y), z = Math.round(mesh.position.z);
        if (axis === 'x') { mesh.position.y = direction > 0 ? -z : z; mesh.position.z = direction > 0 ? y : -y; } 
        else if (axis === 'y') { mesh.position.x = direction > 0 ? z : -z; mesh.position.z = direction > 0 ? -x : x; } 
        else if (axis === 'z') { mesh.position.x = direction > 0 ? -y : y; mesh.position.y = direction > 0 ? x : -x; }
    });

    const kickOffsets = [
        {dx: 0, dy: 0, dz: 0}, {dx: 1, dy: 0, dz: 0}, {dx: -1, dy: 0, dz: 0}, 
        {dx: 0, dy: 0, dz: 1}, {dx: 0, dy: 0, dz: -1}, {dx: 0, dy: 1, dz: 0}, 
        {dx: 1, dy: 1, dz: 0}, {dx: -1, dy: 1, dz: 0}, {dx: 0, dy: 1, dz: 1}, {dx: 0, dy: 1, dz: -1}
    ];

    let rotated = false;
    for (let offset of kickOffsets) {
        if (isValidMove(offset.dx, offset.dy, offset.dz)) {
            currentMino.position.x += offset.dx; currentMino.position.y += offset.dy; currentMino.position.z += offset.dz;
            rotated = true; break;
        }
    }

    if (!rotated) {
        currentMino.children.forEach((mesh, index) => mesh.position.copy(originalPositions[index]));
    } else { 
        updateSliceView(); 
        updateGhostMino(); 
        resetLockTimer(); 
    }
}

function handleMove(dir) {
    let dx = 0, dz = 0;
    if (dir === 'left') dx = -1; else if (dir === 'right') dx = 1; else if (dir === 'up') dz = -1; else if (dir === 'down') dz = 1;
    
    if (isValidMove(dx, 0, dz)) {
        currentMino.position.x += dx; currentMino.position.z += dz;
        updateSliceView(); 
        updateGhostMino();
        resetLockTimer();
    }
}

function moveMinoDown() {
    if (!currentMino) return;
    if (isValidMove(0, -1, 0)) {
        currentMino.position.y -= 1; 
        cancelLockTimer();
        updateSliceView(); 
        updateGhostMino(); 
    } else { 
        startLockTimer(); 
    }
}

function hardDrop() {
    if (!currentMino) return;
    let dropDist = 0;
    while (isValidMove(0, -(dropDist + 1), 0)) dropDist++;
    currentMino.position.y -= dropDist;
    updateSliceView(); 
    lockMino();
}

// --- 7. 블록 잠금 및 게임 로직 ---
function clearLines() {
    let linesCleared = 0;
    for (let y = 0; y < ROWS; y++) {
        let isLayerFull = true;
        for (let x = 0; x < COLS; x++) {
            for (let z = 0; z < DEPTH; z++) { if (gameField[y][x][z] === 0) { isLayerFull = false; break; } }
            if (!isLayerFull) break;
        }
        if (isLayerFull) {
            linesCleared++;
            for (let x = 0; x < COLS; x++) {
                for (let z = 0; z < DEPTH; z++) { scene.remove(meshField[y][x][z]); meshField[y][x][z] = null; gameField[y][x][z] = 0; }
            }
            for (let shiftY = y; shiftY < ROWS - 1; shiftY++) {
                for (let x = 0; x < COLS; x++) {
                    for (let z = 0; z < DEPTH; z++) {
                        gameField[shiftY][x][z] = gameField[shiftY + 1][x][z]; meshField[shiftY][x][z] = meshField[shiftY + 1][x][z];
                        if (meshField[shiftY][x][z]) meshField[shiftY][x][z].position.y -= 1;
                    }
                }
            }
            for (let x = 0; x < COLS; x++) { for (let z = 0; z < DEPTH; z++) { gameField[ROWS - 1][x][z] = 0; meshField[ROWS - 1][x][z] = null; } }
            y--; 
        }
    }
    return linesCleared;
}

function lockMino() {
    cancelLockTimer();
    lockResetCount = 0;

    const xHalf = Math.floor(COLS / 2), zHalf = Math.floor(DEPTH / 2);
    const minoColor = currentMino.children[0].material.color.getStyle();

    currentMino.children.forEach(mesh => {
        const worldX = Math.round(currentMino.position.x + mesh.position.x), worldY = Math.round(currentMino.position.y + mesh.position.y), worldZ = Math.round(currentMino.position.z + mesh.position.z);
        if (worldY >= 0 && worldY < ROWS) {
            gameField[worldY][worldX + xHalf][worldZ + zHalf] = minoColor;
            const lockedMesh = mesh.clone(); lockedMesh.position.set(worldX, worldY, worldZ);
            scene.add(lockedMesh); meshField[worldY][worldX + xHalf][worldZ + zHalf] = lockedMesh;
        }
    });

    scene.remove(currentMino); currentMino = null;

    const elapsedSeconds = (performance.now() - spawnTime) / 1000;
    const linesCleared = clearLines(); 

    let baseScore = linesCleared * 100 * linesCleared;
    if (linesCleared === 0) baseScore = 10; 
    score += Math.round(baseScore * (1 + (50 / (keyCount + 1)) + (20 / (elapsedSeconds + 0.5))));
    document.getElementById('score').innerText = score;

    const level = Math.floor(score / 10000);
    dropInterval = Math.max(100, initialDropInterval - (level * 500));

    canHold = true; 
    updateHoldUI();

    currentMino = spawnMino();
    if (!isValidMove(0, 0, 0)) triggerGameOver();
    else { updateSliceView(); updateGhostMino(); }
}

// --- 8. 메인 흐름 및 UI 이벤트 리스너 ---
function clearBoard() {
    cancelLockTimer();
    if (meshField.length > 0) {
        for (let y = 0; y < meshField.length; y++) {
            for (let x = 0; x < meshField[0].length; x++) {
                for (let z = 0; z < meshField[0][0].length; z++) { if (meshField[y][x][z]) scene.remove(meshField[y][x][z]); }
            }
        }
    }
    if (currentMino) scene.remove(currentMino); currentMino = null;
    if (ghostMino) { scene.remove(ghostMino); ghostMino = null; }
}

function startGame() {
    document.getElementById('main-menu').style.display = 'none';
    document.getElementById('game-over-screen').style.display = 'none';
    
    clearBoard();
    
    COLS = parseInt(document.getElementById('set-x').value);
    DEPTH = parseInt(document.getElementById('set-z').value);
    ROWS = parseInt(document.getElementById('set-y').value);
    dropInterval = parseInt(document.getElementById('set-speed').value);
    initialDropInterval = dropInterval;
    
    gameField = Array.from({ length: ROWS }, () => Array.from({ length: COLS }, () => Array(DEPTH).fill(0)));
    meshField = Array.from({ length: ROWS }, () => Array.from({ length: COLS }, () => Array(DEPTH).fill(null)));
    
    camera.position.set(COLS * 1.5, ROWS * 1.2, DEPTH * 2.2);
    camera.lookAt(0, ROWS / 2 - 1, 0);

    createGridGuide(); initSliceView(); initNextMinos();
    
    score = 0; keyCount = 0;
    document.getElementById('score').innerText = score;
    minoBag = []; heldMinoType = null; canHold = true; updateHoldUI();
    
    currentMino = spawnMino();
    updateSliceView(); updateGhostMino(); 
    isPlaying = true; lastDropTime = performance.now();
}

function triggerGameOver() {
    isPlaying = false;
    cancelLockTimer();
    if (ghostMino) { scene.remove(ghostMino); ghostMino = null; }
    document.getElementById('final-score').innerText = score;
    document.getElementById('game-over-screen').style.display = 'flex';
}

// 메뉴 이동 버튼
document.getElementById('start-btn').addEventListener('click', startGame);
document.getElementById('restart-btn').addEventListener('click', startGame);

document.getElementById('settings-btn').addEventListener('click', () => { 
    document.getElementById('main-menu').style.display = 'none'; 
    document.getElementById('settings-menu').style.display = 'flex'; 
});
document.getElementById('back-btn').addEventListener('click', () => { 
    document.getElementById('settings-menu').style.display = 'none'; 
    document.getElementById('main-menu').style.display = 'flex'; 
});

document.getElementById('controls-btn').addEventListener('click', () => { 
    document.getElementById('main-menu').style.display = 'none'; 
    document.getElementById('controls-menu').style.display = 'flex'; 
});
document.getElementById('back-controls-btn').addEventListener('click', () => { 
    document.getElementById('controls-menu').style.display = 'none'; 
    document.getElementById('main-menu').style.display = 'flex'; 
});

document.getElementById('menu-btn').addEventListener('click', () => { 
    document.getElementById('game-over-screen').style.display = 'none'; 
    document.getElementById('main-menu').style.display = 'flex'; 
});

// 키보드 조작 이벤트
window.addEventListener('keydown', (e) => {
    if (!isPlaying || !currentMino) return; 
    const key = e.key.toLowerCase();
    
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(key)) e.preventDefault();
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'w', 'a', 's', 'd', 'q', 'e', ' '].includes(key)) keyCount++;

    if (key === 'c') { holdMino(); return; }
    if (key === ' ') { hardDrop(); return; }

    const dirMap = { 'arrowleft': 'left', 'arrowright': 'right', 'arrowup': 'up', 'arrowdown': 'down' };
    const dir = dirMap[key];

    if (dir && !initialDelays[dir]) {
        handleMove(dir); 
        initialDelays[dir] = setTimeout(() => {
            moveTimers[dir] = setInterval(() => { handleMove(dir); keyCount++; }, ARR_INTERVAL);
        }, DAS_DELAY);
        return;
    }

    switch(key) {
        case 'w': rotateMino('x', 1); break;
        case 's': rotateMino('x', -1); break;
        case 'a': rotateMino('y', 1); break;
        case 'd': rotateMino('y', -1); break;
        case 'q': rotateMino('z', 1); break;
        case 'e': rotateMino('z', -1); break;
    }
});

window.addEventListener('keyup', (e) => {
    const key = e.key.toLowerCase();
    const dirMap = { 'arrowleft': 'left', 'arrowright': 'right', 'arrowup': 'up', 'arrowdown': 'down' };
    const dir = dirMap[key];

    if (dir) {
        clearTimeout(initialDelays[dir]);
        clearInterval(moveTimers[dir]);
        initialDelays[dir] = null; moveTimers[dir] = null;
    }
});

// 창 크기 조절
window.addEventListener('resize', () => {
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix(); renderer.setSize(container.clientWidth, container.clientHeight);
});

// 메인 렌더링 루프
let lastDropTime = 0;
function animate(time) {
    requestAnimationFrame(animate);
    if (isPlaying && time - lastDropTime > dropInterval) {
        moveMinoDown(); 
        lastDropTime = time;
    }
    renderer.render(scene, camera);
}
animate(0);