// Game variables
let scene, camera, renderer, world;
let car, arena;
let projectiles = [];
let keys = {};
let score = 0;
let lastTime = 0;
let carBody, carMesh;
let honkSound, shootSound, explosionSound;
let audioContext;

// Physics materials
let groundMaterial;
let carMaterial;
let wallMaterial;

// Initialize the game
function init() {
    // Create Three.js scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87CEEB); // Sky blue
    
    // Create camera
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 5, 10);
    
    // Create renderer
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    document.body.appendChild(renderer.domElement);
    
    // Add lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);
    
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(10, 20, 10);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 2048;
    directionalLight.shadow.mapSize.height = 2048;
    scene.add(directionalLight);
    
    // Initialize physics world
    world = new CANNON.World();
    world.gravity.set(0, -9.82, 0);
    world.broadphase = new CANNON.NaiveBroadphase();
    world.solver.iterations = 10;
    
    // Create materials
    groundMaterial = new CANNON.Material('ground');
    carMaterial = new CANNON.Material('car');
    wallMaterial = new CANNON.Material('wall');
    
    // Create contact behavior
    const carGroundContact = new CANNON.ContactMaterial(
        groundMaterial, 
        carMaterial, 
        { friction: 0.5, restitution: 0.3 }
    );
    
    const carWallContact = new CANNON.ContactMaterial(
        wallMaterial, 
        carMaterial, 
        { friction: 0.0, restitution: 0.3 }
    );
    
    world.addContactMaterial(carGroundContact);
    world.addContactMaterial(carWallContact);
    
    // Create the arena
    createArena();
    
    // Create the player's car
    createCar();
    
    // Setup event listeners
    setupEventListeners();
    
    // Initialize audio
    setupAudio();
    
    // Start the game loop
    animate(0);
}

// Create the arena (box with holes)
function createArena() {
    // Arena dimensions
    const arenaWidth = 50;
    const arenaLength = 50;
    const wallHeight = 5;
    const wallThickness = 1;
    
    // Create ground
    const groundGeometry = new THREE.PlaneGeometry(arenaWidth, arenaLength, 10, 10);
    const groundMaterial = new THREE.MeshStandardMaterial({ 
        color: 0x555555,
        roughness: 0.8,
        metalness: 0.2
    });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);
    
    // Physics for ground
    const groundShape = new CANNON.Plane();
    const groundBody = new CANNON.Body({
        mass: 0,
        material: groundMaterial
    });
    groundBody.addShape(groundShape);
    groundBody.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI / 2);
    world.addBody(groundBody);
    
    // Create holes in the ground
    createHoles(arenaWidth, arenaLength);
    
    // Create walls
    createWalls(arenaWidth, arenaLength, wallHeight, wallThickness);
}

// Create holes in the arena floor
function createHoles(width, length) {
    // Create a few random holes
    const holePositions = [
        { x: -15, z: -15, radius: 5 },
        { x: 15, z: 15, radius: 5 },
        { x: -15, z: 15, radius: 3 },
        { x: 15, z: -15, radius: 3 },
        { x: 0, z: 0, radius: 7 }
    ];
    
    holePositions.forEach(hole => {
        // Visual representation of hole
        const holeGeometry = new THREE.CircleGeometry(hole.radius, 32);
        const holeMaterial = new THREE.MeshBasicMaterial({ color: 0x000000 });
        const holeMesh = new THREE.Mesh(holeGeometry, holeMaterial);
        holeMesh.position.set(hole.x, 0.01, hole.z); // Slightly above ground to prevent z-fighting
        holeMesh.rotation.x = -Math.PI / 2;
        scene.add(holeMesh);
        
        // Physics for hole - using a cylinder with no mass and no collision response
        const holeShape = new CANNON.Cylinder(hole.radius, hole.radius, 0.1, 16);
        const holeBody = new CANNON.Body({ mass: 0 });
        holeBody.collisionResponse = false;
        holeBody.addShape(holeShape);
        holeBody.position.set(hole.x, -0.05, hole.z);
        
        // Make this a trigger
        holeBody.collisionResponse = false;
        
        // Add event listener for when something enters the hole
        holeBody.addEventListener('collide', function(e) {
            // Check if it's the car
            if (e.body === carBody) {
                // Reset car if it falls into a hole
                resetCar();
            }
            
            // Check if it's a projectile
            projectiles.forEach((proj, index) => {
                if (e.body === proj.body) {
                    // Remove projectile
                    scene.remove(proj.mesh);
                    world.remove(proj.body);
                    projectiles.splice(index, 1);
                }
            });
        });
        
        world.addBody(holeBody);
    });
}

// Create walls around the arena
function createWalls(width, length, height, thickness) {
    const wallMat = new THREE.MeshStandardMaterial({ 
        color: 0x0088ff,
        roughness: 0.5,
        metalness: 0.5 
    });
    
    // Create the four walls
    const walls = [
        // North wall
        { pos: { x: 0, y: height / 2, z: -length / 2 }, size: { x: width + thickness * 2, y: height, z: thickness } },
        // South wall
        { pos: { x: 0, y: height / 2, z: length / 2 }, size: { x: width + thickness * 2, y: height, z: thickness } },
        // East wall
        { pos: { x: width / 2, y: height / 2, z: 0 }, size: { x: thickness, y: height, z: length } },
        // West wall
        { pos: { x: -width / 2, y: height / 2, z: 0 }, size: { x: thickness, y: height, z: length } }
    ];
    
    walls.forEach(wall => {
        // Visual wall
        const wallGeometry = new THREE.BoxGeometry(wall.size.x, wall.size.y, wall.size.z);
        const wallMesh = new THREE.Mesh(wallGeometry, wallMat);
        wallMesh.position.set(wall.pos.x, wall.pos.y, wall.pos.z);
        wallMesh.castShadow = true;
        wallMesh.receiveShadow = true;
        scene.add(wallMesh);
        
        // Physics for wall
        const wallShape = new CANNON.Box(new CANNON.Vec3(wall.size.x / 2, wall.size.y / 2, wall.size.z / 2));
        const wallBody = new CANNON.Body({
            mass: 0,
            material: wallMaterial
        });
        wallBody.addShape(wallShape);
        wallBody.position.set(wall.pos.x, wall.pos.y, wall.pos.z);
        world.addBody(wallBody);
    });
}

// Create the player's car
function createCar() {
    // Create car body
    const carSize = { width: 1.5, height: 0.6, length: 3 };
    
    // Car chassis - main body
    const carGeometry = new THREE.BoxGeometry(carSize.width, carSize.height, carSize.length);
    const carMat = new THREE.MeshStandardMaterial({ color: 0xff0000, roughness: 0.5, metalness: 0.7 });
    carMesh = new THREE.Mesh(carGeometry, carMat);
    carMesh.castShadow = true;
    carMesh.receiveShadow = true;
    scene.add(carMesh);
    
    // Add car details (windshield, wheels)
    addCarDetails(carMesh, carSize);
    
    // Physics body for car
    const carShape = new CANNON.Box(new CANNON.Vec3(carSize.width / 2, carSize.height / 2, carSize.length / 2));
    carBody = new CANNON.Body({
        mass: 200,
        material: carMaterial
    });
    carBody.addShape(carShape);
    carBody.position.set(0, 1, 0);
    
    // Add damping to make the car movement more controllable
    carBody.linearDamping = 0.5;
    carBody.angularDamping = 0.5;
    
    world.addBody(carBody);
}

// Add visual details to the car
function addCarDetails(carMesh, carSize) {
    // Add windshield
    const windshieldGeometry = new THREE.BoxGeometry(carSize.width - 0.2, 0.5, 1);
    const windshieldMaterial = new THREE.MeshStandardMaterial({ 
        color: 0x88ccff, 
        transparent: true, 
        opacity: 0.7,
        roughness: 0.2,
        metalness: 0.5
    });
    const windshield = new THREE.Mesh(windshieldGeometry, windshieldMaterial);
    windshield.position.set(0, carSize.height/2 + 0.25, -0.2);
    carMesh.add(windshield);
    
    // Add wheels
    const wheelGeometry = new THREE.CylinderGeometry(0.4, 0.4, 0.3, 16);
    const wheelMaterial = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.8 });
    
    // Wheel positions
    const wheelPositions = [
        { x: -carSize.width/2 - 0.1, y: -carSize.height/2, z: carSize.length/3 },
        { x: carSize.width/2 + 0.1, y: -carSize.height/2, z: carSize.length/3 },
        { x: -carSize.width/2 - 0.1, y: -carSize.height/2, z: -carSize.length/3 },
        { x: carSize.width/2 + 0.1, y: -carSize.height/2, z: -carSize.length/3 }
    ];
    
    wheelPositions.forEach(pos => {
        const wheel = new THREE.Mesh(wheelGeometry, wheelMaterial);
        wheel.position.set(pos.x, pos.y, pos.z);
        wheel.rotation.z = Math.PI / 2;
        wheel.castShadow = true;
        carMesh.add(wheel);
    });
}

// Reset car position after falling into a hole
function resetCar() {
    carBody.position.set(0, 3, 0);
    carBody.velocity.set(0, 0, 0);
    carBody.angularVelocity.set(0, 0, 0);
    carBody.quaternion.set(0, 0, 0, 1);
}

// Handle car movement based on keyboard input
function controlCar() {
    const maxForce = 800;
    const turnForce = 500;
    
    // Apply forces based on key presses
    if (keys['w'] || keys['ArrowUp']) {
        carBody.applyForce(new CANNON.Vec3(0, 0, -maxForce), carBody.position);
    }
    if (keys['s'] || keys['ArrowDown']) {
        carBody.applyForce(new CANNON.Vec3(0, 0, maxForce), carBody.position);
    }
    if (keys['a'] || keys['ArrowLeft']) {
        carBody.torque.y = turnForce;
    }
    if (keys['d'] || keys['ArrowRight']) {
        carBody.torque.y = -turnForce;
    }
}

// Make the car hop
function carHop() {
    // Check if the car is roughly on the ground
    // Instead of using rayTest (which might be undefined or working differently in this version)
    // we'll use a simpler check based on the y-position and velocity
    const isNearGround = carBody.position.y < 1.5;
    
    // Only allow hopping if car is near the ground
    if (isNearGround) {
        carBody.velocity.y = 10; // Simple upward velocity
        playHopSound();
    } else {
        // If the car is flipped, attempt to right it
        const carQuat = new THREE.Quaternion().copy(carMesh.quaternion);
        const upVectorWorld = new THREE.Vector3(0, 1, 0).applyQuaternion(carQuat);
        
        if (upVectorWorld.y < 0) {
            // Car is upside down, flip it over
            carBody.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 0, 1), 0);
            carBody.angularVelocity.set(0, 0, 0);
            carBody.position.y += 1;
            playHopSound();
        }
    }
}

function playHopSound() {
    if (audioContext) {
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.type = 'square';
        oscillator.frequency.setValueAtTime(150, audioContext.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(80, audioContext.currentTime + 0.2);
        
        gainNode.gain.setValueAtTime(0.5, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        oscillator.start();
        oscillator.stop(audioContext.currentTime + 0.3);
    }
}

function playShootSound() {
    if (audioContext) {
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(200, audioContext.currentTime + 0.2);
        
        gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.2);
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        oscillator.start();
        oscillator.stop(audioContext.currentTime + 0.2);
    }
}

function playHonkSound() {
    if (audioContext) {
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.type = 'square';
        oscillator.frequency.setValueAtTime(300, audioContext.currentTime);
        
        gainNode.gain.setValueAtTime(0.4, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        oscillator.start();
        oscillator.stop(audioContext.currentTime + 0.3);
    }
}

// Shoot a projectile from the car
function shootProjectile() {
    const projectileRadius = 0.3;
    const projectileSpeed = 30;
    
    // Create visual projectile
    const projectileGeometry = new THREE.SphereGeometry(projectileRadius, 16, 16);
    const projectileMaterial = new THREE.MeshStandardMaterial({ 
        color: 0xff8800,
        emissive: 0xff4400,
        emissiveIntensity: 0.5
    });
    const projectileMesh = new THREE.Mesh(projectileGeometry, projectileMaterial);
    
    // Get position in front of the car
    const threeDirection = new THREE.Vector3(0, 0, -1);
    threeDirection.applyQuaternion(carMesh.quaternion);
    
    const startPos = new THREE.Vector3();
    startPos.copy(carMesh.position);
    startPos.y += 0.5; // Start slightly above car
    startPos.addScaledVector(threeDirection, 2); // Start in front of car
    
    projectileMesh.position.copy(startPos);
    scene.add(projectileMesh);
    
    // Physics body for projectile
    const projectileShape = new CANNON.Sphere(projectileRadius);
    const projectileBody = new CANNON.Body({
        mass: 5,
        shape: projectileShape
    });
    projectileBody.position.set(startPos.x, startPos.y, startPos.z);
    
    // Apply velocity in the direction the car is facing
    const vel = new CANNON.Vec3(threeDirection.x, threeDirection.y, threeDirection.z);
    vel.scale(projectileSpeed, vel);
    projectileBody.velocity.copy(vel);
    
    // Add to world
    world.addBody(projectileBody);
    
    // Store projectile data
    projectiles.push({
        mesh: projectileMesh,
        body: projectileBody,
        timeCreated: Date.now()
    });
    
    // Play shoot sound
    playShootSound();
}

// Setup sounds
function setupAudio() {
    try {
        // Initialize Web Audio API context
        window.AudioContext = window.AudioContext || window.webkitAudioContext;
        audioContext = new AudioContext();
    } catch (e) {
        console.warn("Web Audio API not supported:", e);
    }
}

// Setup event listeners
function setupEventListeners() {
    // Keyboard events
    window.addEventListener('keydown', function(event) {
        keys[event.key] = true;
        
        // Special actions
        if (event.key === ' ' || event.key === 'Space') {
            shootProjectile();
        }
        
        if (event.key === 'q' || event.key === 'Q') {
            // Honk the horn
            playHonkSound();
        }
        
        if (event.key === 'e' || event.key === 'E') {
            // Make the car hop or flip right-side up
            carHop();
        }
    });
    
    window.addEventListener('keyup', function(event) {
        keys[event.key] = false;
    });
    
    // Window resize
    window.addEventListener('resize', function() {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });
    
    // Add click event to initialize audio (browsers require user interaction)
    document.addEventListener('click', function() {
        if (audioContext && audioContext.state === 'suspended') {
            audioContext.resume();
        }
    });
}

// Update projectiles, remove old ones
function updateProjectiles() {
    const now = Date.now();
    const maxProjectileAge = 5000; // 5 seconds
    
    // Remove old projectiles
    for (let i = projectiles.length - 1; i >= 0; i--) {
        const projectile = projectiles[i];
        
        // Update visual position from physics
        projectile.mesh.position.copy(projectile.body.position);
        projectile.mesh.quaternion.copy(projectile.body.quaternion);
        
        // Check if projectile is old or below the arena
        if (now - projectile.timeCreated > maxProjectileAge || projectile.body.position.y < -10) {
            scene.remove(projectile.mesh);
            world.remove(projectile.body);
            projectiles.splice(i, 1);
        }
    }
}

// Animation loop
function animate(time) {
    requestAnimationFrame(animate);
    
    const deltaTime = (time - lastTime) / 1000;
    lastTime = time;
    
    // Cap the delta time to prevent large jumps
    const fixedDeltaTime = Math.min(deltaTime, 0.1);
    
    // Update physics
    world.step(fixedDeltaTime);
    
    // Update car control
    controlCar();
    
    // Update car visual position from physics
    carMesh.position.copy(carBody.position);
    carMesh.quaternion.copy(carBody.quaternion);
    
    // Update camera to follow car
    updateCamera();
    
    // Update projectiles
    updateProjectiles();
    
    // Render scene
    renderer.render(scene, camera);
}

// Update camera position to follow the car
function updateCamera() {
    // Get car direction and position
    const carDir = new THREE.Vector3(0, 0, 1);
    carDir.applyQuaternion(carMesh.quaternion);
    
    // Position camera behind and slightly above the car
    const cameraOffset = new THREE.Vector3();
    cameraOffset.copy(carDir);
    cameraOffset.multiplyScalar(7); // Distance behind car
    cameraOffset.y += 3; // Height above car
    
    const targetCameraPos = new THREE.Vector3();
    targetCameraPos.copy(carMesh.position);
    targetCameraPos.add(cameraOffset);
    
    // Smoothly move camera to target position
    camera.position.lerp(targetCameraPos, 0.1);
    
    // Look at car
    camera.lookAt(carMesh.position);
}

// Start the game
init(); 