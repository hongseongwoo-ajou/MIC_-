// 1. 초기화 및 상수 설정
const COLS = 5, ROWS = 7, DEPTH = 5;
const container = document.getElementById('game-container');
const scene = new THREE.Scene();
const renderer = new THREE.WebGLRenderer({ antialias: true });

renderer.setSize(container.clientWidth, container.clientHeight);
container.appendChild(renderer.domElement);

// 카메라 설정
const camera = new THREE.PerspectiveCamera(60, container.clientWidth / container.clientHeight, 0.1, 1000);
camera.position.set(7, 9, 11);
camera.lookAt(0, ROWS / 2 - 1, 0);

// 조명 설정
const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
scene.add(ambientLight);
const dirLight = new THREE.DirectionalLight(0xffffff, 0.5);
dirLight.position.set(10, 15, 10);
scene.add(dirLight);

// 2. 게임 데이터 및 3D 모델 배열
let gameField = Array.from({ length: ROWS }, () => 
    Array.from({ length: COLS }, () => Array(DEPTH).fill(0))
);

let meshField = Array.from({ length: ROWS }, () => 
    Array.from({ length: COLS }, () => Array(DEPTH).fill(null))
);

// 3. 3D 격자 가이드 생성
function createGridGuide() {
    const thickMaterial = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8 });
    const thinMaterial = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.4 });

    const xHalf = COLS / 2;
    const zHalf = DEPTH / 2;
    const yMax = ROWS - 0.5;
    const yMin = -0.5;

    const thickPoints = [];
    // 바닥
    for (let i = 0; i <= COLS; i++) thickPoints.push(new THREE.Vector3(i - xHalf, yMin, -zHalf), new THREE.Vector3(i - xHalf, yMin, zHalf));
    for (let i = 0; i <= DEPTH; i++) thickPoints.push(new THREE.Vector3(-xHalf, yMin, i - zHalf), new THREE.Vector3(xHalf, yMin, i - zHalf));
    // 왼쪽 뒤
    for (let i = 0; i <= DEPTH; i++) thickPoints.push(new THREE.Vector3(-xHalf, yMin, i - zHalf), new THREE.Vector3(-xHalf, yMax, i - zHalf));
    for (let i = 0; i <= ROWS; i++) thickPoints.push(new THREE.Vector3(-xHalf, i - 0.5, -zHalf), new THREE.Vector3(-xHalf, i - 0.5, zHalf));
    // 오른쪽 뒤
    for (let i = 0; i <= COLS; i++) thickPoints.push(new THREE.Vector3(i - xHalf, yMin, -zHalf), new THREE.Vector3(i - xHalf, yMax, -zHalf));
    for (let i = 0; i <= ROWS; i++) thickPoints.push(new THREE.Vector3(-xHalf, i - 0.5, -zHalf), new THREE.Vector3(xHalf, i - 0.5, -zHalf));

    const thickGeom = new THREE.BufferGeometry().setFromPoints(thickPoints);
    scene.add(new THREE.LineSegments(thickGeom, thickMaterial));

    const thinPoints = [];
    thinPoints.push(new THREE.Vector3(xHalf, yMin, -zHalf), new THREE.Vector3(xHalf, yMax, -zHalf));
    thinPoints.push(new THREE.Vector3(-xHalf, yMin, zHalf), new THREE.Vector3(-xHalf, yMax, zHalf));
    thinPoints.push(new THREE.Vector3(xHalf, yMin, zHalf), new THREE.Vector3(xHalf, yMax, zHalf));
    thinPoints.push(new THREE.Vector3(-xHalf, yMax, zHalf), new THREE.Vector3(xHalf, yMax, zHalf));
    thinPoints.push(new THREE.Vector3(xHalf, yMax, -zHalf), new THREE.Vector3(xHalf, yMax, zHalf));

    const thinGeom = new THREE.BufferGeometry().setFromPoints(thinPoints);
    scene.add(new THREE.LineSegments(thinGeom, thinMaterial));
}

// 4. 사이드바 초기화 및 업데이트 (단면도 전치 행렬 반영)
function initSliceView() {
    const wrapper = document.getElementById('layers-wrapper');
    wrapper.innerHTML = '';
    for (let y = ROWS - 1; y >= 0; y--) {
        const layerDiv = document.createElement('div');
        layerDiv.className = 'layer-view';
        layerDiv.innerHTML = `<div class="layer-label">L-${y}</div>`;
        const grid = document.createElement('div');
        grid.className = 'grid-2d';
        grid.id = `layer-${y}`;
        for (let i = 0; i < COLS * DEPTH; i++) {
            const cell = document.createElement('div');
            cell.className = 'cell';
            grid.appendChild(cell);
        }
        layerDiv.appendChild(grid);
        wrapper.appendChild(layerDiv);
    }
}

function updateSliceView() {
    for (let y = 0; y < ROWS; y++) {
        const grid = document.getElementById(`layer-${y}`);
        if (!grid) continue;
        const cells = grid.getElementsByClassName('cell');
        for (let x = 0; x < COLS; x++) {
            for (let z = 0; z < DEPTH; z++) {
                const index = z * COLS + x; // x와 z의 전치(Transpose) 변환
                if (gameField[y][x][z] !== 0) {
                    cells[index].classList.add('filled');
                    cells[index].style.backgroundColor = gameField[y][x][z]; 
                } else {
                    cells[index].classList.remove('filled');
                    cells[index].style.backgroundColor = '#111'; 
                    cells[index].style.boxShadow = 'none';
                }
            }
        }
    }

    if (currentMino) {
        const xHalf = Math.floor(COLS / 2);
        const zHalf = Math.floor(DEPTH / 2);
        currentMino.children.forEach(mesh => {
            const worldX = Math.round(currentMino.position.x + mesh.position.x);
            const worldY = Math.round(currentMino.position.y + mesh.position.y);
            const worldZ = Math.round(currentMino.position.z + mesh.position.z);
            if (worldY >= 0 && worldY < ROWS) {
                const gridX = worldX + xHalf;
                const gridZ = worldZ + zHalf;
                const grid = document.getElementById(`layer-${worldY}`);
                if (grid) {
                    const cells = grid.getElementsByClassName('cell');
                    const index = gridZ * COLS + gridX; // 전치 변환
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

// 5. 미노(Mino) 데이터 및 생성 함수
const MINO_TYPES = {
    I: { color: "#00ffff", blocks: [[-1, 0, 0], [0, 0, 0], [1, 0, 0], [2, 0, 0]] },
    O: { color: "#ffff00", blocks: [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0]] },
    T: { color: "#800080", blocks: [[-1, 0, 0], [0, 0, 0], [1, 0, 0], [0, 1, 0]] },
    S: { color: "#00ff00", blocks: [[-1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]] },
    Z: { color: "#ff0000", blocks: [[-1, 1, 0], [0, 1, 0], [0, 0, 0], [1, 0, 0]] },
    J: { color: "#0000ff", blocks: [[-1, 1, 0], [-1, 0, 0], [0, 0, 0], [1, 0, 0]] },
    L: { color: "#ffa500", blocks: [[1, 1, 0], [-1, 0, 0], [0, 0, 0], [1, 0, 0]] }
};

let currentMino = null;

function spawnMino(typeKey) {
    const type = MINO_TYPES[typeKey];
    const group = new THREE.Group();
    const geometry = new THREE.BoxGeometry(0.95, 0.95, 0.95); 
    const material = new THREE.MeshStandardMaterial({ color: type.color, roughness: 0.2, metalness: 0.1 });

    type.blocks.forEach(offset => {
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(offset[0], offset[1], offset[2]);
        const edges = new THREE.EdgesGeometry(geometry);
        const line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0x000000 }));
        mesh.add(line);
        group.add(mesh);
    });

    group.position.set(0, ROWS - 1, 0);
    scene.add(group);
    return group;
}

// 6. 충돌 검사 및 회전 로직
function isValidMove(dx, dy, dz) {
    let valid = true;
    const xHalf = Math.floor(COLS / 2);
    const zHalf = Math.floor(DEPTH / 2);

    currentMino.children.forEach(mesh => {
        const targetX = Math.round(currentMino.position.x + mesh.position.x + dx);
        const targetY = Math.round(currentMino.position.y + mesh.position.y + dy);
        const targetZ = Math.round(currentMino.position.z + mesh.position.z + dz);

        if (targetX < -xHalf || targetX > xHalf || targetZ < -zHalf || targetZ > zHalf || targetY < 0) {
            valid = false;
        }
        if (valid && targetY < ROWS) {
            const gridX = targetX + xHalf;
            const gridZ = targetZ + zHalf;
            if (gameField[targetY][gridX] && gameField[targetY][gridX][gridZ] !== 0) {
                valid = false;
            }
        }
    });
    return valid;
}

function rotateMino(axis, direction) {
    if (!currentMino) return;
    const originalPositions = [];
    currentMino.children.forEach(mesh => originalPositions.push(new THREE.Vector3().copy(mesh.position)));

    currentMino.children.forEach(mesh => {
        const x = Math.round(mesh.position.x);
        const y = Math.round(mesh.position.y);
        const z = Math.round(mesh.position.z);

        if (axis === 'x') {
            mesh.position.y = direction > 0 ? -z : z;
            mesh.position.z = direction > 0 ? y : -y;
        } else if (axis === 'y') {
            mesh.position.x = direction > 0 ? z : -z;
            mesh.position.z = direction > 0 ? -x : x;
        } else if (axis === 'z') {
            mesh.position.x = direction > 0 ? -y : y;
            mesh.position.y = direction > 0 ? x : -x;
        }
    });

    if (!isValidMove(0, 0, 0)) {
        currentMino.children.forEach((mesh, index) => mesh.position.copy(originalPositions[index]));
    } else {
        updateSliceView();
    }
}

// 7. 게임 진행 로직 (중력, 굳히기, 줄 지우기)
function moveMinoDown() {
    if (!currentMino) return;
    if (isValidMove(0, -1, 0)) {
        currentMino.position.y -= 1;
        updateSliceView();
    } else {
        lockMino();
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

function lockMino() {
    const xHalf = Math.floor(COLS / 2);
    const zHalf = Math.floor(DEPTH / 2);
    const minoColor = currentMino.children[0].material.color.getStyle();

    currentMino.children.forEach(mesh => {
        const worldX = Math.round(currentMino.position.x + mesh.position.x);
        const worldY = Math.round(currentMino.position.y + mesh.position.y);
        const worldZ = Math.round(currentMino.position.z + mesh.position.z);

        if (worldY >= 0 && worldY < ROWS) {
            const gridX = worldX + xHalf;
            const gridZ = worldZ + zHalf;
            gameField[worldY][gridX][gridZ] = minoColor;
            
            const lockedMesh = mesh.clone();
            lockedMesh.position.set(worldX, worldY, worldZ);
            scene.add(lockedMesh);
            meshField[worldY][gridX][gridZ] = lockedMesh;
        }
    });

    scene.remove(currentMino);
    currentMino = null;

    clearLines();

    const keys = Object.keys(MINO_TYPES);
    const randomKey = keys[Math.floor(Math.random() * keys.length)];
    currentMino = spawnMino(randomKey);

    if (!isValidMove(0, 0, 0)) {
        alert("Game Over!");
    }
    updateSliceView();
}

function clearLines() {
    for (let y = 0; y < ROWS; y++) {
        let isLayerFull = true;
        for (let x = 0; x < COLS; x++) {
            for (let z = 0; z < DEPTH; z++) {
                if (gameField[y][x][z] === 0) {
                    isLayerFull = false;
                    break;
                }
            }
            if (!isLayerFull) break;
        }

        if (isLayerFull) {
            for (let x = 0; x < COLS; x++) {
                for (let z = 0; z < DEPTH; z++) {
                    scene.remove(meshField[y][x][z]);
                    meshField[y][x][z] = null;
                    gameField[y][x][z] = 0;
                }
            }

            for (let shiftY = y; shiftY < ROWS - 1; shiftY++) {
                for (let x = 0; x < COLS; x++) {
                    for (let z = 0; z < DEPTH; z++) {
                        gameField[shiftY][x][z] = gameField[shiftY + 1][x][z];
                        meshField[shiftY][x][z] = meshField[shiftY + 1][x][z];
                        if (meshField[shiftY][x][z]) {
                            meshField[shiftY][x][z].position.y -= 1;
                        }
                    }
                }
            }

            for (let x = 0; x < COLS; x++) {
                for (let z = 0; z < DEPTH; z++) {
                    gameField[ROWS - 1][x][z] = 0;
                    meshField[ROWS - 1][x][z] = null;
                }
            }
            y--; 
        }
    }
}

// 8. 키보드 이벤트
window.addEventListener('keydown', (e) => {
    if (!currentMino) return;

    let dx = 0, dy = 0, dz = 0;

    switch(e.key) {
        case 'ArrowUp':    dz = -1; break;
        case 'ArrowDown':  dz = 1;  break;
        case 'ArrowLeft':  dx = -1; break;
        case 'ArrowRight': dx = 1;  break;
        
        case 'w': case 'W': rotateMino('x', 1);  break;
        case 's': case 'S': rotateMino('x', -1); break;
        case 'a': case 'A': rotateMino('y', 1);  break;
        case 'd': case 'D': rotateMino('y', -1); break;
        case 'q': case 'Q': rotateMino('z', 1);  break;
        case 'e': case 'E': rotateMino('z', -1); break;
        
        case ' ': 
            hardDrop();
            return; 
    }

    if ((dx !== 0 || dz !== 0) && isValidMove(dx, 0, dz)) {
        currentMino.position.x += dx;
        currentMino.position.z += dz;
        updateSliceView(); 
    }
});

// 9. 애니메이션 루프 및 초기 실행
let lastDropTime = 0;
const dropInterval = 2000;

function animate(time) {
    requestAnimationFrame(animate);

    if (time - lastDropTime > dropInterval) {
        moveMinoDown();
        lastDropTime = time;
    }

    renderer.render(scene, camera);
}

// 최초 실행 세팅
createGridGuide();
initSliceView();
const keys = Object.keys(MINO_TYPES);
currentMino = spawnMino(keys[Math.floor(Math.random() * keys.length)]); // 첫 미노 스폰
updateSliceView();
animate(0);

// 창 크기 변경 대응
window.addEventListener('resize', () => {
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
});