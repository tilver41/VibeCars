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
let carCreated = false; // Add flag to track if car has been created
let particleSystem; // For explosion effects

// Portal variables
let startPortalBox;
let exitPortalBox;
let selfUsername = 'player'; // Default username for portal usage
let currentSpeed = 1; // Default speed for portal usage

// Multiplayer variables
let socket;
let playerId;
let otherPlayers = {}; // Stores other players' data and meshes

// Physics materials and groups
let groundMaterial;
let carMaterial;
let wallMaterial;
let projectileMaterial;

// Collision groups
const COLLISION_GROUPS = {
    GROUND: 1,
    WALL: 2,
    CAR: 4,
    PROJECTILE: 8
};

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
    projectileMaterial = new CANNON.Material('projectile');
    
    // Define contact behavior with a single unified contact material
    const defaultContactMaterial = new CANNON.ContactMaterial(
        projectileMaterial,
        carMaterial,
        { friction: 0.1, restitution: 0.7 }
    );
    
    world.defaultContactMaterial = defaultContactMaterial;
    
    // Create the arena
    createArena();
    
    // Setup event listeners
    setupEventListeners();
    
    // Initialize audio
    setupAudio();
    
    // Setup WebSocket connection for multiplayer
    initMultiplayer();
    
    // Create portals if needed
    if (new URLSearchParams(window.location.search).get('portal')) {
        // Create start portal
        const startPortalGroup = new THREE.Group();
        startPortalGroup.position.set(0, 0, 0); // Use SPAWN_POINT coordinates in your actual code
        startPortalGroup.rotation.x = 0.35;
        startPortalGroup.rotation.y = 0;

        // Create portal effect
        const startPortalGeometry = new THREE.TorusGeometry(15, 2, 16, 100);
        const startPortalMaterial = new THREE.MeshPhongMaterial({
            color: 0xff0000,
            emissive: 0xff0000,
            transparent: true,
            opacity: 0.8
        });
        const startPortal = new THREE.Mesh(startPortalGeometry, startPortalMaterial);
        startPortalGroup.add(startPortal);
                            
        // Create portal inner surface
        const startPortalInnerGeometry = new THREE.CircleGeometry(13, 32);
        const startPortalInnerMaterial = new THREE.MeshBasicMaterial({
            color: 0xff0000,
            transparent: true,
            opacity: 0.5,
            side: THREE.DoubleSide
        });
        const startPortalInner = new THREE.Mesh(startPortalInnerGeometry, startPortalInnerMaterial);
        startPortalGroup.add(startPortalInner);

        // Create particle system for portal effect
        const startPortalParticleCount = 1000;
        const startPortalParticles = new THREE.BufferGeometry();
        const startPortalPositions = new Float32Array(startPortalParticleCount * 3);
        const startPortalColors = new Float32Array(startPortalParticleCount * 3);

        for (let i = 0; i < startPortalParticleCount * 3; i += 3) {
            // Create particles in a ring around the portal
            const angle = Math.random() * Math.PI * 2;
            const radius = 15 + (Math.random() - 0.5) * 4;
            startPortalPositions[i] = Math.cos(angle) * radius;
            startPortalPositions[i + 1] = Math.sin(angle) * radius;
            startPortalPositions[i + 2] = (Math.random() - 0.5) * 4;

            // Red color with slight variation
            startPortalColors[i] = 0.8 + Math.random() * 0.2;
            startPortalColors[i + 1] = 0;
            startPortalColors[i + 2] = 0;
        }

        startPortalParticles.setAttribute('position', new THREE.BufferAttribute(startPortalPositions, 3));
        startPortalParticles.setAttribute('color', new THREE.BufferAttribute(startPortalColors, 3));

        const startPortalParticleMaterial = new THREE.PointsMaterial({
            size: 0.2,
            vertexColors: true,
            transparent: true,
            opacity: 0.6
        });

        const startPortalParticleSystem = new THREE.Points(startPortalParticles, startPortalParticleMaterial);
        startPortalGroup.add(startPortalParticleSystem);

        // Add portal group to scene
        scene.add(startPortalGroup);

        // Create portal collision box
        startPortalBox = new THREE.Box3().setFromObject(startPortalGroup);

        // Animate particles and portal and check for collision
        function animateStartPortal() {
            const positions = startPortalParticles.attributes.position.array;
            for (let i = 0; i < positions.length; i += 3) {
                positions[i + 1] += 0.05 * Math.sin(Date.now() * 0.001 + i);
            }
            startPortalParticles.attributes.position.needsUpdate = true;
            // Update portal shader time
            if (startPortalInnerMaterial.uniforms && startPortalInnerMaterial.uniforms.time) {
                startPortalInnerMaterial.uniforms.time.value = Date.now() * 0.001;
            }

            requestAnimationFrame(animateStartPortal);
        }
        animateStartPortal();
    }
    
    // Create exit portal
    const exitPortalGroup = new THREE.Group();
    exitPortalGroup.position.set(-200, 200, -300);
    exitPortalGroup.rotation.x = 0.35;
    exitPortalGroup.rotation.y = 0;

    // Create portal effect
    const exitPortalGeometry = new THREE.TorusGeometry(15, 2, 16, 100);
    const exitPortalMaterial = new THREE.MeshPhongMaterial({
        color: 0x00ff00,
        emissive: 0x00ff00,
        transparent: true,
        opacity: 0.8
    });
    const exitPortal = new THREE.Mesh(exitPortalGeometry, exitPortalMaterial);
    exitPortalGroup.add(exitPortal);

    // Create portal inner surface
    const exitPortalInnerGeometry = new THREE.CircleGeometry(13, 32);
    const exitPortalInnerMaterial = new THREE.MeshBasicMaterial({
        color: 0x00ff00,
        transparent: true,
        opacity: 0.5,
        side: THREE.DoubleSide
    });
    const exitPortalInner = new THREE.Mesh(exitPortalInnerGeometry, exitPortalInnerMaterial);
    exitPortalGroup.add(exitPortalInner);
    
    // Add portal label
    const loader = new THREE.TextureLoader();
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    canvas.width = 512; // Increased width
    canvas.height = 64;
    context.fillStyle = '#00ff00';
    context.font = 'bold 32px Arial';
    context.textAlign = 'center';
    context.fillText('VIBEVERSE PORTAL', canvas.width/2, canvas.height/2);
    const texture = new THREE.CanvasTexture(canvas);
    const labelGeometry = new THREE.PlaneGeometry(30, 5); // Increased width
    const labelMaterial = new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        side: THREE.DoubleSide
    });
    const label = new THREE.Mesh(labelGeometry, labelMaterial);
    label.position.y = 20;
    exitPortalGroup.add(label);

    // Create particle system for portal effect
    const exitPortalParticleCount = 1000;
    const exitPortalParticles = new THREE.BufferGeometry();
    const exitPortalPositions = new Float32Array(exitPortalParticleCount * 3);
    const exitPortalColors = new Float32Array(exitPortalParticleCount * 3);

    for (let i = 0; i < exitPortalParticleCount * 3; i += 3) {
        // Create particles in a ring around the portal
        const angle = Math.random() * Math.PI * 2;
        const radius = 15 + (Math.random() - 0.5) * 4;
        exitPortalPositions[i] = Math.cos(angle) * radius;
        exitPortalPositions[i + 1] = Math.sin(angle) * radius;
        exitPortalPositions[i + 2] = (Math.random() - 0.5) * 4;

        // Green color with slight variation
        exitPortalColors[i] = 0;
        exitPortalColors[i + 1] = 0.8 + Math.random() * 0.2;
        exitPortalColors[i + 2] = 0;
    }

    exitPortalParticles.setAttribute('position', new THREE.BufferAttribute(exitPortalPositions, 3));
    exitPortalParticles.setAttribute('color', new THREE.BufferAttribute(exitPortalColors, 3));

    const exitPortalParticleMaterial = new THREE.PointsMaterial({
        size: 0.2,
        vertexColors: true,
        transparent: true,
        opacity: 0.6
    });

    const exitPortalParticleSystem = new THREE.Points(exitPortalParticles, exitPortalParticleMaterial);
    exitPortalGroup.add(exitPortalParticleSystem);

    // Add full portal group to scene
    scene.add(exitPortalGroup);

    // Create portal collision box
    exitPortalBox = new THREE.Box3().setFromObject(exitPortalGroup);

    // Animate particles and portal and check for collision
    function animateExitPortal() {
        const positions = exitPortalParticles.attributes.position.array;
        for (let i = 0; i < positions.length; i += 3) {
            positions[i + 1] += 0.05 * Math.sin(Date.now() * 0.001 + i);
        }
        exitPortalParticles.attributes.position.needsUpdate = true;
        // Update portal shader time
        if (exitPortalInnerMaterial.uniforms && exitPortalInnerMaterial.uniforms.time) {
            exitPortalInnerMaterial.uniforms.time.value = Date.now() * 0.001;
        }

        requestAnimationFrame(animateExitPortal);
    }
    animateExitPortal();
    
    // Set initial lastTime value to prevent large delta on first frame
    lastTime = performance.now();
}

// Initialize multiplayer connection
function initMultiplayer() {
    // Select WebSocket URL based on current hostname
    let wsUrl;
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        // Local development - use ws:// protocol
        wsUrl = 'ws://localhost:8080';
    } else {
        // Production - use wss:// protocol with Render domain
        wsUrl = 'wss://vibecars.onrender.com';
    }
    
    // Connect to WebSocket server
    socket = new WebSocket(wsUrl);
    
    // Handle connection open
    socket.onopen = function() {
        console.log('Connected to server');
    };
    
    // Handle messages
    socket.onmessage = function(event) {
        const data = JSON.parse(event.data);
        
        // Handle different message types
        switch(data.type) {
            case 'init':
                // Store our player ID
                playerId = data.id;
                
                // Create our car with the assigned color
                createCar(data.color);
                
                // Create other existing players if there are any in the initial data
                for (const id in data.players) {
                    // Only create cars for OTHER players, not ourselves
                    if (id != playerId) {
                        const player = data.players[id];
                        createOtherPlayer(player.id, player.color, player.position, player.quaternion);
                        
                        // Apply hit count if the player is already damaged
                        if (player.hitCount && player.hitCount > 0) {
                            if (player.hitCount === 1) {
                                changeCarColor(otherPlayers[id].mesh, 0x888888);
                            } else if (player.hitCount >= 2) {
                                otherPlayers[id].mesh.visible = false;
                            }
                            otherPlayers[id].body.hitCount = player.hitCount;
                        }
                        
                        // Apply visibility if specified
                        if (player.visible !== undefined && otherPlayers[id].mesh) {
                            console.log(`Setting initial visibility for player ${id} to ${player.visible}`);
                            otherPlayers[id].mesh.visible = player.visible;
                        }
                    }
                }
                
                // Update player count in UI
                updatePlayerCount();
                
                // Start the game loop only after we've initialized multiplayer
                animate(0);

                // Send an initial position update immediately after connecting
                // This will help ensure all players see each other
                setTimeout(function() {
                    if (carBody) {
                        // Send multiple position updates to ensure visibility
                        for (let i = 0; i < 3; i++) {
                            setTimeout(() => sendPositionUpdate(), i * 200);
                        }
                    }
                }, 300);
                break;
                
            case 'fullSync':
                // Handle full server state sync
                handleFullSync(data.players);
                break;
                
            case 'playerJoined':
                // Only create a car for a different player, not ourselves
                if (data.id != playerId) {
                    createOtherPlayer(data.id, data.color, data.position, data.quaternion);
                    
                    // Initialize hit count if provided
                    if (data.hitCount !== undefined && otherPlayers[data.id]) {
                        otherPlayers[data.id].body.hitCount = data.hitCount;
                    }
                    
                    // Send our position to ensure the new player sees us
                    if (carBody) {
                        setTimeout(function() {
                            sendPositionUpdate();
                        }, 200);
                    }
                }
                
                // Update player count in UI
                updatePlayerCount();
                break;
                
            case 'playerMoved':
                // Update other player position
                if (otherPlayers[data.id]) {
                    // Use lerping for smooth movement
                    otherPlayers[data.id].targetPosition = new THREE.Vector3(
                        data.position.x,
                        data.position.y,
                        data.position.z
                    );
                    
                    otherPlayers[data.id].targetQuaternion = new THREE.Quaternion(
                        data.quaternion.x,
                        data.quaternion.y,
                        data.quaternion.z,
                        data.quaternion.w
                    );
                    
                    // Update visibility state if provided
                    if (data.visible !== undefined && otherPlayers[data.id].mesh) {
                        otherPlayers[data.id].mesh.visible = data.visible;
                    }
                    
                    // Update hit count if provided
                    if (data.hitCount !== undefined) {
                        const currentHitCount = otherPlayers[data.id].body.hitCount || 0;
                        
                        // Only apply if changed
                        if (currentHitCount !== data.hitCount) {
                            otherPlayers[data.id].body.hitCount = data.hitCount;
                            applyHitCountEffects(otherPlayers[data.id], data.hitCount);
                        }
                    }
                }
                break;
                
            case 'playerLeft':
                // Remove player car
                removeOtherPlayer(data.id);
                
                // Update player count in UI
                updatePlayerCount();
                break;
                
            case 'projectileCreated':
                // Only add projectiles from other players, not our own
                if (data.playerId != playerId) {
                    createRemoteProjectile(data);
                }
                break;
                
            case 'carHit':
                // Handle car hit notifications
                handleRemoteCarHit(data);
                break;
                
            case 'playerRespawn':
                // Handle player respawn
                handlePlayerRespawn(data);
                break;
                
            case 'playerSync':
                // Handle incremental player state sync
                handlePlayerSync(data.players);
                break;
            
            case 'visibilityUpdate':
                // Update player visibility
                if (data.id != playerId && otherPlayers[data.id]) {
                    console.log(`Setting player ${data.id} visibility to ${data.visible}`);
                    otherPlayers[data.id].mesh.visible = data.visible;
                }
                break;
            
            case 'forceVisibility':
                // This is a direct visibility override command from server
                console.log(`FORCE VISIBILITY for player ${data.id} = ${data.visible}`);
                
                // For our own car
                if (data.id == playerId && carMesh) {
                    carMesh.visible = data.visible;
                    // Also send confirmation back to server
                    if (socket && socket.readyState === WebSocket.OPEN) {
                        socket.send(JSON.stringify({
                            type: 'visibilityConfirm',
                            id: playerId,
                            visible: data.visible
                        }));
                    }
                }
                // For other players
                else if (otherPlayers[data.id]) {
                    console.log(`Forcing other player ${data.id} visibility to ${data.visible}`);
                    // Force visibility regardless of other state
                    otherPlayers[data.id].mesh.visible = data.visible;
                    
                    // Also need to ensure physics body has correct values
                    otherPlayers[data.id].body.hitCount = 0;
                }
                break;
        }
    };
    
    // Handle errors
    socket.onerror = function(error) {
        console.error('WebSocket Error:', error);
    };
    
    // Handle disconnection
    socket.onclose = function() {
        console.log('Disconnected from server');
        // Try to reconnect after a short delay
        setTimeout(reconnectToServer, 3000);
    };
    
    // Set up periodic sync request
    setInterval(function() {
        if (socket && socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({
                type: 'requestSync'
            }));
        }
    }, 10000); // Request full sync every 10 seconds
}

// Try to reconnect to the server
function reconnectToServer() {
    console.log('Attempting to reconnect...');
    // Clear existing players
    for (const id in otherPlayers) {
        removeOtherPlayer(id);
    }
    // Reinitialize multiplayer
    initMultiplayer();
}

// Create a car for another player
function createOtherPlayer(id, color, position, quaternion) {
    // Create car body
    const carSize = { width: 1.5, height: 0.6, length: 3 };
    
    // Car chassis - main body
    const carGeometry = new THREE.BoxGeometry(carSize.width, carSize.height, carSize.length);
    const carMat = new THREE.MeshStandardMaterial({ color: color, roughness: 0.5, metalness: 0.7 });
    const otherCarMesh = new THREE.Mesh(carGeometry, carMat);
    otherCarMesh.castShadow = true;
    otherCarMesh.receiveShadow = true;
    scene.add(otherCarMesh);
    
    // Add car details (windshield, wheels)
    addCarDetails(otherCarMesh, carSize);
    
    // Set initial position
    otherCarMesh.position.set(position.x, position.y, position.z);
    otherCarMesh.quaternion.set(
        quaternion.x,
        quaternion.y,
        quaternion.z,
        quaternion.w
    );
    
    // Add physics body for the other player's car
    const otherCarShape = new CANNON.Box(new CANNON.Vec3(carSize.width / 2, carSize.height / 2, carSize.length / 2));
    const otherCarBody = new CANNON.Body({
        mass: 200,
        material: carMaterial
    });
    otherCarBody.addShape(otherCarShape);
    otherCarBody.position.set(position.x, position.y, position.z);
    otherCarBody.quaternion.set(
        quaternion.x,
        quaternion.y,
        quaternion.z,
        quaternion.w
    );
    
    // Set collision groups
    otherCarBody.collisionFilterGroup = COLLISION_GROUPS.CAR;
    otherCarBody.collisionFilterMask = COLLISION_GROUPS.GROUND | COLLISION_GROUPS.WALL | COLLISION_GROUPS.PROJECTILE;
    
    // Tag the body for identification in collision events
    otherCarBody.name = 'otherPlayerCar';
    otherCarBody.playerId = id;
    otherCarBody.mesh = otherCarMesh;
    otherCarBody.hitCount = 0; // Track hits
    otherCarBody.originalColor = color; // Store original color
    
    world.addBody(otherCarBody);
    
    // Store target position for smooth interpolation
    otherPlayers[id] = {
        mesh: otherCarMesh,
        body: otherCarBody,
        targetPosition: new THREE.Vector3(position.x, position.y, position.z),
        targetQuaternion: new THREE.Quaternion(quaternion.x, quaternion.y, quaternion.z, quaternion.w)
    };
    
    console.log(`Player ${id} joined with color ${color}`);
}

// Remove another player's car
function removeOtherPlayer(id) {
    if (otherPlayers[id]) {
        scene.remove(otherPlayers[id].mesh);
        if (otherPlayers[id].body) {
            world.remove(otherPlayers[id].body);
        }
        delete otherPlayers[id];
        console.log(`Player ${id} left`);
    }
}

// Send position update to server
function sendPositionUpdate() {
    if (socket && socket.readyState === WebSocket.OPEN && carBody) {
        socket.send(JSON.stringify({
            type: 'position',
            id: playerId,
            position: {
                x: carBody.position.x,
                y: carBody.position.y,
                z: carBody.position.z
            },
            quaternion: {
                x: carBody.quaternion.x,
                y: carBody.quaternion.y,
                z: carBody.quaternion.z,
                w: carBody.quaternion.w
            },
            hitCount: carBody.hitCount || 0,
            visible: carMesh.visible
        }));
    }
}

// Create the arena (box with holes)
function createArena() {
    // Arena dimensions
    const arenaWidth = 500; // 10x larger
    const arenaLength = 500; // 10x larger
    const wallHeight = 15; // Taller walls for larger arena
    const wallThickness = 5; // Thicker walls
    
    // Create ground - We'll create it differently to support actual holes
    createGroundWithHoles(arenaWidth, arenaLength);
    
    // Create walls
    createWalls(arenaWidth, arenaLength, wallHeight, wallThickness);
}

// Create the ground with actual holes
function createGroundWithHoles(width, length) {
    // Define the hole positions - scaled up for larger arena
    const holePositions = [
        { x: -150, z: -150, radius: 50 },
        { x: 150, z: 150, radius: 50 },
        { x: -150, z: 150, radius: 30 },
        { x: 150, z: -150, radius: 30 },
        { x: 0, z: 0, radius: 70 },
        // Additional holes for larger map
        { x: -300, z: 0, radius: 40 },
        { x: 300, z: 0, radius: 40 },
        { x: 0, z: -300, radius: 40 },
        { x: 0, z: 300, radius: 40 },
        { x: 200, z: -200, radius: 35 },
        { x: -200, z: 200, radius: 35 }
    ];
    
    // Create a visual ground plane first
    const groundGeometry = new THREE.PlaneGeometry(width, length, 32, 32);
    const groundMaterial = new THREE.MeshStandardMaterial({ 
        color: 0x555555,
        roughness: 0.8,
        metalness: 0.2,
        side: THREE.DoubleSide
    });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);
    
    // Create visual representations of holes
    holePositions.forEach(hole => {
        const holeGeometry = new THREE.CircleGeometry(hole.radius, 32);
        const holeMaterial = new THREE.MeshBasicMaterial({ color: 0x000000 });
        const holeMesh = new THREE.Mesh(holeGeometry, holeMaterial);
        holeMesh.position.set(hole.x, 0.01, hole.z); // Slightly above ground to prevent z-fighting
        holeMesh.rotation.x = -Math.PI / 2;
        scene.add(holeMesh);
    });
    
    // Create physics for ground using multiple bodies to create actual holes
    
    // We'll create individual ground segments around the holes
    // First, create smaller ground panels to form a grid
    const panelSize = 25; // Larger panel size for performance with bigger map
    const halfWidth = width / 2;
    const halfLength = length / 2;
    
    // Calculate how many panels we need in each direction
    const panelsX = Math.ceil(width / panelSize);
    const panelsZ = Math.ceil(length / panelSize);
    
    // Create ground panels
    for (let x = 0; x < panelsX; x++) {
        for (let z = 0; z < panelsZ; z++) {
            // Calculate the position of this panel
            const posX = -halfWidth + (x * panelSize) + (panelSize / 2);
            const posZ = -halfLength + (z * panelSize) + (panelSize / 2);
            
            // Check if this panel intersects with any holes
            let createPanel = true;
            
            for (const hole of holePositions) {
                // Calculate distance from panel center to hole center
                const dx = posX - hole.x;
                const dz = posZ - hole.z;
                const distance = Math.sqrt(dx * dx + dz * dz);
                
                // If panel center is inside a hole, don't create this panel
                if (distance < hole.radius) {
                    createPanel = false;
                    break;
                }
            }
            
            if (createPanel) {
                // Create a panel
                const panelShape = new CANNON.Box(new CANNON.Vec3(panelSize / 2, 0.1, panelSize / 2));
                const panelBody = new CANNON.Body({
                    mass: 0, // Static body
                    material: groundMaterial
                });
                
                // Set collision groups for ground panels
                panelBody.collisionFilterGroup = COLLISION_GROUPS.GROUND;
                panelBody.collisionFilterMask = COLLISION_GROUPS.CAR | COLLISION_GROUPS.PROJECTILE;
                
                panelBody.addShape(panelShape);
                panelBody.position.set(posX, 0, posZ);
                world.addBody(panelBody);
            }
        }
    }
    
    // Create invisible walls at the bottom of the holes to detect when car has fallen through
    holePositions.forEach(hole => {
        const triggerShape = new CANNON.Cylinder(hole.radius, hole.radius, 0.01, 16);
        const triggerBody = new CANNON.Body({ mass: 0 });
        // Make it a trigger
        triggerBody.collisionResponse = false;
        triggerBody.isTrigger = true;
        
        // Set collision groups for hole triggers
        triggerBody.collisionFilterGroup = COLLISION_GROUPS.GROUND;
        triggerBody.collisionFilterMask = COLLISION_GROUPS.CAR | COLLISION_GROUPS.PROJECTILE;
        
        triggerBody.addShape(triggerShape);
        triggerBody.position.set(hole.x, -15, hole.z); // Position it much lower below the ground
        
        // Add event listener for when car falls through
        triggerBody.addEventListener('collide', function(e) {
            // Check if it's the player's car
            if (e.body === carBody) {
                // Make car explode when it falls into a hole
                console.log("Car fell into a hole, exploding!");
                explodeCar(carBody);
            }
            
            // Check if it's another player's car
            for (const id in otherPlayers) {
                if (e.body === otherPlayers[id].body) {
                    console.log(`Other player ${id} fell into a hole, exploding!`);
                    explodeCar(otherPlayers[id].body);
                    break;
                }
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
        
        world.addBody(triggerBody);
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
        
        // Set collision groups for walls
        wallBody.collisionFilterGroup = COLLISION_GROUPS.WALL;
        wallBody.collisionFilterMask = COLLISION_GROUPS.CAR | COLLISION_GROUPS.PROJECTILE;
        
        world.addBody(wallBody);
    });
}

// Create the player's car with specified color
function createCar(carColor = 0xff0000) {
    // Check if car already exists to prevent duplicates
    if (carCreated) {
        console.log('Car already exists, not creating another one');
        return;
    }
    
    // Create car body
    const carSize = { width: 1.5, height: 0.6, length: 3 };
    
    // Car chassis - main body
    const carGeometry = new THREE.BoxGeometry(carSize.width, carSize.height, carSize.length);
    const carMat = new THREE.MeshStandardMaterial({ color: carColor, roughness: 0.5, metalness: 0.7 });
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
    carBody.position.set(100, 3, 100); // Start at a position away from holes
    
    // Add damping to make the car movement more controllable
    carBody.linearDamping = 0.5;
    carBody.angularDamping = 0.5;
    
    // Set collision groups
    carBody.collisionFilterGroup = COLLISION_GROUPS.CAR;
    carBody.collisionFilterMask = COLLISION_GROUPS.GROUND | COLLISION_GROUPS.WALL | COLLISION_GROUPS.PROJECTILE;
    
    // Tag the body for identification in collision events
    carBody.name = 'playerCar';
    carBody.playerId = playerId;
    carBody.mesh = carMesh;
    carBody.hitCount = 0; // Track hits
    carBody.originalColor = carColor; // Store original color
    
    world.addBody(carBody);
    
    // Set flag to indicate car has been created
    carCreated = true;
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
    // Random starting position on the larger map
    const positions = [
        { x: -200, y: 3, z: -200 },
        { x: 200, y: 3, z: 200 },
        { x: -200, y: 3, z: 200 },
        { x: 200, y: 3, z: -200 },
        { x: 0, y: 3, z: -200 },
        { x: 0, y: 3, z: 200 },
        { x: -200, y: 3, z: 0 },
        { x: 200, y: 3, z: 0 }
    ];
    
    const randomPos = positions[Math.floor(Math.random() * positions.length)];
    
    carBody.position.set(randomPos.x, randomPos.y, randomPos.z);
    carBody.velocity.set(0, 0, 0);
    carBody.angularVelocity.set(0, 0, 0);
    carBody.quaternion.set(0, 0, 0, 1);
    
    // Play a sound when the car is reset
    if (audioContext) {
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(400, audioContext.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(100, audioContext.currentTime + 0.5);
        
        gainNode.gain.setValueAtTime(0.7, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        oscillator.start();
        oscillator.stop(audioContext.currentTime + 0.5);
    }
}

// Handle car movement based on keyboard input
function controlCar(deltaTime) {
    const speed = 20; // Base speed
    const turnSpeed = 3.0; // Direct turn speed (radians per second)
    const turnForce = 800; // Keep existing turn force for air control
    
    // Get car's current orientation
    const carRotation = new THREE.Quaternion().copy(carBody.quaternion);
    
    // Check if the car is on the ground
    const isOnGround = carBody.position.y < 1.5;
    
    // Calculate movement directions based on key presses
    let moveX = 0;
    let moveZ = 0;
    
    if (keys['w'] || keys['ArrowUp']) {
        // Forward direction
        const forwardDir = new THREE.Vector3(0, 0, -1).applyQuaternion(carRotation);
        moveX += forwardDir.x;
        moveZ += forwardDir.z;
    }
    if (keys['s'] || keys['ArrowDown']) {
        // Backward direction
        const backwardDir = new THREE.Vector3(0, 0, 1).applyQuaternion(carRotation);
        moveX += backwardDir.x;
        moveZ += backwardDir.z;
    }
    
    // Apply direct position updates with deltaTime
    if (moveX !== 0 || moveZ !== 0) {
        // Normalize movement vector for consistent speed in all directions
        const length = Math.sqrt(moveX * moveX + moveZ * moveZ);
        if (length > 0) {
            moveX /= length;
            moveZ /= length;
        }
        
        // Update position directly
        carBody.position.x += speed * moveX * deltaTime;
        carBody.position.z += speed * moveZ * deltaTime;
    }
    
    // Handle turning differently based on whether car is on ground or in air
    if (isOnGround) {
        // Direct rotation updates when on ground
        if (keys['a'] || keys['ArrowLeft']) {
            // Create a rotation around Y axis
            const rotationY = new CANNON.Quaternion();
            rotationY.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), turnSpeed * deltaTime);
            
            // Apply rotation to the car body
            carBody.quaternion = rotationY.mult(carBody.quaternion);
            
            // Reset angular velocity to prevent physics from affecting the rotation
            carBody.angularVelocity.set(0, 0, 0);
        }
        if (keys['d'] || keys['ArrowRight']) {
            // Create a rotation around Y axis (negative for right turn)
            const rotationY = new CANNON.Quaternion();
            rotationY.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), -turnSpeed * deltaTime);
            
            // Apply rotation to the car body
            carBody.quaternion = rotationY.mult(carBody.quaternion);
            
            // Reset angular velocity to prevent physics from affecting the rotation
            carBody.angularVelocity.set(0, 0, 0);
        }
    } else {
        // Use physics-based turning when in the air
        if (keys['a'] || keys['ArrowLeft']) {
            carBody.torque.y = turnForce;
        }
        if (keys['d'] || keys['ArrowRight']) {
            carBody.torque.y = -turnForce;
        }
    }
    
    // Apply a small downforce to keep the car grounded better
    carBody.applyForce(new CANNON.Vec3(0, -500, 0), carBody.position);
}

// Make the car hop
function carHop() {
    // Check if the car is roughly on the ground
    const isNearGround = carBody.position.y < 1.5;
    
    // Only allow hopping if car is near the ground
    if (isNearGround) {
        carBody.velocity.y = 15; // Higher hop for larger world
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
    // Don't allow shooting if car is exploded
    if (!carMesh.visible || (carBody.hitCount && carBody.hitCount >= 2)) {
        return;
    }
    
    const projectileRadius = 0.6; // Larger projectile
    const projectileSpeed = 50; // Faster for larger map
    
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
        shape: projectileShape,
        material: projectileMaterial
    });
    projectileBody.position.set(startPos.x, startPos.y, startPos.z);
    
    // Apply velocity in the direction the car is facing
    const vel = new CANNON.Vec3(threeDirection.x, threeDirection.y, threeDirection.z);
    vel.scale(projectileSpeed, vel);
    projectileBody.velocity.copy(vel);
    
    // Set collision groups
    projectileBody.collisionFilterGroup = COLLISION_GROUPS.PROJECTILE;
    projectileBody.collisionFilterMask = COLLISION_GROUPS.GROUND | COLLISION_GROUPS.WALL | COLLISION_GROUPS.CAR;
    
    // Tag the projectile body for identification in collision events
    projectileBody.name = 'projectile';
    projectileBody.projectileId = Date.now() + Math.random();
    projectileBody.mesh = projectileMesh;
    projectileBody.createdBy = playerId;
    
    // Add to world
    world.addBody(projectileBody);
    
    // Store projectile data
    projectiles.push({
        id: projectileBody.projectileId,
        mesh: projectileMesh,
        body: projectileBody,
        timeCreated: Date.now()
    });
    
    // Play shoot sound
    playShootSound();
    
    // Send projectile data to server
    if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({
            type: 'projectileCreated',
            playerId: playerId,
            projectileId: projectileBody.projectileId,
            position: {
                x: startPos.x,
                y: startPos.y,
                z: startPos.z
            },
            velocity: {
                x: vel.x,
                y: vel.y,
                z: vel.z
            },
            radius: projectileRadius
        }));
    }
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

// Update projectiles, remove old ones, and check for collisions
function updateProjectiles() {
    const now = Date.now();
    const maxProjectileAge = 10000; // 10 seconds (increased for larger map)
    
    // Remove old projectiles
    for (let i = projectiles.length - 1; i >= 0; i--) {
        const projectile = projectiles[i];
        
        // Update visual position from physics
        projectile.mesh.position.copy(projectile.body.position);
        projectile.mesh.quaternion.copy(projectile.body.quaternion);
        
        // Check if projectile is old or below the arena
        if (now - projectile.timeCreated > maxProjectileAge || projectile.body.position.y < -50) {
            scene.remove(projectile.mesh);
            world.remove(projectile.body);
            projectiles.splice(i, 1);
            continue;
        }
        
        // Check for collisions with player car
        if (carBody && projectile.body.createdBy !== playerId) {
            const distance = projectile.body.position.distanceTo(carBody.position);
            if (distance < 2.0) { // Approximate collision distance
                handleCarHit(carBody, projectile.body);
                
                // Remove the projectile after hit
                scene.remove(projectile.mesh);
                world.remove(projectile.body);
                projectiles.splice(i, 1);
                continue;
            }
        }
        
        // Check for collisions with other player cars
        for (const id in otherPlayers) {
            const otherCar = otherPlayers[id].body;
            if (otherCar && projectile.body.createdBy !== parseInt(id)) {
                const distance = projectile.body.position.distanceTo(otherCar.position);
                if (distance < 2.0) { // Approximate collision distance
                    handleCarHit(otherCar, projectile.body);
                    
                    // Remove the projectile after hit
                    scene.remove(projectile.mesh);
                    world.remove(projectile.body);
                    projectiles.splice(i, 1);
                    break;
                }
            }
        }
    }
}

// Handle a car being hit by a projectile
function handleCarHit(car, projectile) {
    console.log("Car hit! Current hit count:", car.hitCount);
    
    // Increment hit count
    car.hitCount = (car.hitCount || 0) + 1;
    
    // Apply force from the projectile hit
    if (car === carBody) {
        const hitDirection = new CANNON.Vec3().copy(projectile.velocity);
        hitDirection.normalize();
        hitDirection.scale(1000, hitDirection); // Scale hit force
        car.applyImpulse(hitDirection, projectile.position);
    }
    
    // Handle different hit states
    if (car.hitCount === 1) {
        // First hit: Change to grey
        changeCarColor(car.mesh, 0x888888);
        playImpactSound();
    } else if (car.hitCount >= 2) {
        // Second hit: Explode car
        explodeCar(car);
        
        // Award score to the player who eliminated another player
        if (projectile.createdBy === playerId) {
            // Only increment score if we're the one who got the elimination
            score += 1;
            document.getElementById('score').textContent = score;
        }
    }
    
    // If this is our car, send hit info to server
    if (car === carBody && socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({
            type: 'carHit',
            id: playerId,
            hitCount: car.hitCount,
            hitBy: projectile.createdBy // Send ID of player who hit us
        }));
    }
    // If this is another player's car and we're the one who hit them
    else if (car !== carBody && projectile.createdBy === playerId && socket && socket.readyState === WebSocket.OPEN) {
        // Send hit information to server
        socket.send(JSON.stringify({
            type: 'carHit',
            id: car.playerId,
            hitCount: car.hitCount,
            hitBy: playerId // We hit them
        }));
    }
}

// Change a car's color
function changeCarColor(carMesh, newColor) {
    // Apply color to main body and all children (wheels, windshield)
    carMesh.traverse(function(child) {
        if (child.isMesh && child.material && child.material.color) {
            // Skip windshield which should stay blue
            if (child !== carMesh && child.material.transparent) {
                return;
            }
            // Apply new color
            child.material.color.set(newColor);
        }
    });
}

// Function to explicitly set player visibility and notify the server
function setPlayerVisibility(isVisible) {
    if (carMesh && socket && socket.readyState === WebSocket.OPEN) {
        // Set local visibility immediately
        carMesh.visible = isVisible;
        console.log(`Setting local player visibility to ${isVisible}`);
        
        // Send both visibility update methods to ensure it's received
        // Method 1: Standard visibility update
        socket.send(JSON.stringify({
            type: 'visibilityUpdate',
            id: playerId,
            visible: isVisible
        }));
        
        // Method 2: Direct force visibility command (requests server to broadcast)
        socket.send(JSON.stringify({
            type: 'requestForceVisibility',
            id: playerId,
            visible: isVisible
        }));
        
        // Method 3: Also send a regular position update with the new visibility
        sendPositionUpdate();
    }
}

// Create explosion effect for car
function explodeCar(car) {
    // Don't create duplicate explosions
    if (!car.mesh.visible) {
        return;
    }
    
    // Play explosion sound
    playExplosionSound();
    
    // Create particle system for explosion
    const particleCount = 200;
    const particleGeometry = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    const colors = new Float32Array(particleCount * 3);
    const sizes = new Float32Array(particleCount);
    
    const carPosition = car.position.clone();
    const color = new THREE.Color();
    
    for (let i = 0; i < particleCount; i++) {
        // Random position around car
        const x = carPosition.x + (Math.random() - 0.5) * 5;
        const y = carPosition.y + (Math.random() - 0.5) * 5;
        const z = carPosition.z + (Math.random() - 0.5) * 5;
        
        positions[i * 3] = x;
        positions[i * 3 + 1] = y;
        positions[i * 3 + 2] = z;
        
        // Color gradient from yellow to red
        color.setHSL(0.1 * Math.random(), 1.0, 0.5);
        colors[i * 3] = color.r;
        colors[i * 3 + 1] = color.g;
        colors[i * 3 + 2] = color.b;
        
        // Random sizes
        sizes[i] = Math.random() * 2 + 0.5;
    }
    
    particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    particleGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    particleGeometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
    
    const particleMaterial = new THREE.PointsMaterial({
        size: 1,
        vertexColors: true,
        blending: THREE.AdditiveBlending,
        transparent: true,
        sizeAttenuation: true
    });
    
    // Create particle system
    const particles = new THREE.Points(particleGeometry, particleMaterial);
    scene.add(particles);
    
    // Store explosion data
    if (!window.explosions) window.explosions = [];
    window.explosions.push({
        particles: particles,
        velocities: Array(particleCount).fill().map(() => new THREE.Vector3(
            (Math.random() - 0.5) * 20,
            (Math.random() - 0.5) * 20,
            (Math.random() - 0.5) * 20
        )),
        timeCreated: Date.now()
    });
    
    // Hide the car mesh immediately to prevent render artifacts
    car.mesh.visible = false;
    
    // Use the correct method if it's the player's car
    if (car === carBody) {
        // Use the dedicated visibility function for player car
        // This sends visibility update to the server
        setPlayerVisibility(false);
    }
    
    // Respawn car after 3 seconds if it's the player's car
    if (car.name === 'playerCar') {
        setTimeout(() => {
            // Generate respawn position
            const positions = [
                { x: -200, y: 3, z: -200 },
                { x: 200, y: 3, z: 200 },
                { x: -200, y: 3, z: 200 },
                { x: 200, y: 3, z: -200 },
                { x: 0, y: 3, z: -200 },
                { x: 0, y: 3, z: 200 },
                { x: -200, y: 3, z: 0 },
                { x: 200, y: 3, z: 0 }
            ];
            
            const randomPos = positions[Math.floor(Math.random() * positions.length)];
            
            // Reset car
            carBody.position.set(randomPos.x, randomPos.y, randomPos.z);
            carBody.velocity.set(0, 0, 0);
            carBody.angularVelocity.set(0, 0, 0);
            carBody.quaternion.set(0, 0, 0, 1);
            carBody.hitCount = 0;
            carBody.respawnTime = Date.now(); // Track respawn time
            
            // Make car visible again - THIS IS CRITICAL
            // We immediately make the car visible in the client
            carMesh.visible = true;
            changeCarColor(car.mesh, car.originalColor);
            
            // Explicitly show the car by using the visibility function
            setPlayerVisibility(true);
            
            // Send respawn event to server
            if (socket && socket.readyState === WebSocket.OPEN) {
                socket.send(JSON.stringify({
                    type: 'playerRespawn',
                    id: playerId,
                    position: {
                        x: randomPos.x,
                        y: randomPos.y,
                        z: randomPos.z
                    },
                    quaternion: {
                        x: 0,
                        y: 0,
                        z: 0,
                        w: 1
                    },
                    hitCount: 0
                }));
                
                // Also send a direct visibility update
                socket.send(JSON.stringify({
                    type: 'visibilityUpdate',
                    id: playerId,
                    visible: true
                }));
                
                // Send multiple position updates in the next few seconds
                const sendMultipleUpdates = () => {
                    // Send position update
                    sendPositionUpdate();
                    
                    // Count how many updates we've sent
                    sendMultipleUpdates.count = (sendMultipleUpdates.count || 0) + 1;
                    
                    // Stop after 10 updates (5 seconds)
                    if (sendMultipleUpdates.count < 10) {
                        setTimeout(sendMultipleUpdates, 500);
                    }
                };
                
                // Start sending updates after a delay to avoid race conditions
                setTimeout(sendMultipleUpdates, 1000);
            }
        }, 3000);
    }
}

// Play explosion sound
function playExplosionSound() {
    if (audioContext) {
        // Create oscillator for base explosion sound
        const oscillator1 = audioContext.createOscillator();
        const gainNode1 = audioContext.createGain();
        
        oscillator1.type = 'sine';
        oscillator1.frequency.setValueAtTime(100, audioContext.currentTime);
        oscillator1.frequency.exponentialRampToValueAtTime(30, audioContext.currentTime + 1.0);
        
        gainNode1.gain.setValueAtTime(0.8, audioContext.currentTime);
        gainNode1.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 1.5);
        
        oscillator1.connect(gainNode1);
        gainNode1.connect(audioContext.destination);
        
        // Create noise for explosion crackle
        const bufferSize = 4096;
        const whiteNoise = audioContext.createScriptProcessor(bufferSize, 1, 1);
        const noiseGain = audioContext.createGain();
        
        whiteNoise.onaudioprocess = function(e) {
            const output = e.outputBuffer.getChannelData(0);
            for (let i = 0; i < bufferSize; i++) {
                output[i] = Math.random() * 2 - 1;
            }
        };
        
        noiseGain.gain.setValueAtTime(0.5, audioContext.currentTime);
        noiseGain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
        
        whiteNoise.connect(noiseGain);
        noiseGain.connect(audioContext.destination);
        
        // Start and stop sounds
        oscillator1.start();
        oscillator1.stop(audioContext.currentTime + 1.5);
        
        // Stop the noise processor after a short time
        setTimeout(() => {
            whiteNoise.disconnect();
        }, 500);
    }
}

// Update explosions in animation loop
function updateExplosions(deltaTime) {
    if (!window.explosions) return;
    
    const now = Date.now();
    const maxAge = 2000; // 2 seconds
    
    // Update each explosion's particles
    for (let i = window.explosions.length - 1; i >= 0; i--) {
        const explosion = window.explosions[i];
        
        // Remove old explosions
        if (now - explosion.timeCreated > maxAge) {
            scene.remove(explosion.particles);
            window.explosions.splice(i, 1);
            continue;
        }
        
        // Update particle positions
        const positions = explosion.particles.geometry.attributes.position.array;
        
        for (let j = 0; j < positions.length / 3; j++) {
            const velocity = explosion.velocities[j];
            
            // Apply gravity
            velocity.y -= 9.8 * deltaTime;
            
            // Update position
            positions[j * 3] += velocity.x * deltaTime;
            positions[j * 3 + 1] += velocity.y * deltaTime;
            positions[j * 3 + 2] += velocity.z * deltaTime;
        }
        
        explosion.particles.geometry.attributes.position.needsUpdate = true;
        
        // Fade out particles
        const age = (now - explosion.timeCreated) / maxAge;
        explosion.particles.material.opacity = 1 - age;
    }
}

// Play impact sound when hit by a projectile
function playImpactSound() {
    if (audioContext) {
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(150, audioContext.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(50, audioContext.currentTime + 0.3);
        
        gainNode.gain.setValueAtTime(0.5, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        oscillator.start();
        oscillator.stop(audioContext.currentTime + 0.3);
    }
}

// Animation loop
function animate(time) {
    requestAnimationFrame(animate);
    
    // Skip animation if car not created yet
    if (!carBody || !carMesh) return;
    
    const deltaTime = (time - lastTime) / 1000;
    lastTime = time;
    
    // Cap the delta time to prevent large jumps
    const fixedDeltaTime = Math.min(deltaTime, 0.1);
    
    // Update physics
    world.step(fixedDeltaTime);
    
    // Update car control
    controlCar(fixedDeltaTime);
    
    // Update car visual position from physics
    carMesh.position.copy(carBody.position);
    carMesh.quaternion.copy(carBody.quaternion);
    
    // Check if player has fallen below ground
    if (carBody.position.y < -20 && carMesh.visible) {
        // Car has fallen below the ground, make it explode
        console.log("Car fell below ground, exploding!");
        explodeCar(carBody);
    }
    
    // Define a higher frequency for position updates
    const isMoving = carBody.velocity.lengthSquared() > 1;
    const wasRecentlyRespawned = carBody.respawnTime && (Date.now() - carBody.respawnTime) < 5000;
    
    // Send position update to server with adaptive frequency 
    if (time % 50 < 16                  // base rate: ~20 updates/second
        || isMoving                      // when moving
        || wasRecentlyRespawned          // high frequency after respawn
        || carBody.hitCount > 0) {       // high frequency when damaged
        sendPositionUpdate();
    }
    
    // Visibility check: if we were respawned recently, ensure visible
    if (wasRecentlyRespawned && !carMesh.visible && carBody.hitCount === 0) {
        console.log("Animation loop detected incorrect visibility state - correcting!");
        carMesh.visible = true;
        setPlayerVisibility(true);
    }
    
    // Update other players with interpolation
    for (const id in otherPlayers) {
        const player = otherPlayers[id];
        
        // Smoothly move towards target position and rotation
        player.mesh.position.lerp(player.targetPosition, 0.2);
        player.mesh.quaternion.slerp(player.targetQuaternion, 0.2);
        
        // Update physics body position for collision detection
        player.body.position.copy(player.mesh.position);
        player.body.quaternion.copy(player.mesh.quaternion);
        
        // Check if other player's car has fallen below ground
        if (player.body.position.y < -20 && player.mesh.visible) {
            // Car has fallen below the ground, make it explode
            console.log(`Other player ${id} fell below ground, exploding!`);
            explodeCar(player.body);
        }
    }
    
    // Update camera to follow car
    updateCamera();
    
    // Update projectiles
    updateProjectiles();
    
    // Update explosions
    updateExplosions(fixedDeltaTime);
    
    // Portal collision checks
    if (new URLSearchParams(window.location.search).get('portal')) {
        // Check if player has entered start portal
        setTimeout(function() {
            if (typeof carMesh !== 'undefined' && carMesh) {
                const playerBox = new THREE.Box3().setFromObject(carMesh);
                const portalDistance = playerBox.getCenter(new THREE.Vector3()).distanceTo(startPortalBox.getCenter(new THREE.Vector3()));
                if (portalDistance < 50) {
                    // Get ref from URL params
                    const urlParams = new URLSearchParams(window.location.search);
                    const refUrl = urlParams.get('ref');
                    if (refUrl) {
                        // Add https if not present and include query params
                        let url = refUrl;
                        if (!url.startsWith('http://') && !url.startsWith('https://')) {
                            url = 'https://' + url;
                        }
                        const currentParams = new URLSearchParams(window.location.search);
                        const newParams = new URLSearchParams();
                        for (const [key, value] of currentParams) {
                            if (key !== 'ref') { // Skip ref param since it's in the base URL
                                newParams.append(key, value);
                            }
                        }
                        const paramString = newParams.toString();
                        window.location.href = url + (paramString ? '?' + paramString : '');
                    }
                }
            }
        }, 5000);
    }

    // Check if player has entered exit portal
    if (typeof carMesh !== 'undefined' && carMesh) {
        const playerBox = new THREE.Box3().setFromObject(carMesh);
        // Check if player is within 50 units of the portal
        const portalDistance = playerBox.getCenter(new THREE.Vector3()).distanceTo(exitPortalBox.getCenter(new THREE.Vector3()));
        if (portalDistance < 50) {
            // Start loading the next page in the background
            const currentParams = new URLSearchParams(window.location.search);
            const newParams = new URLSearchParams();
            newParams.append('portal', true);
            newParams.append('username', selfUsername);
            newParams.append('color', 'white');
            newParams.append('speed', currentSpeed);

            for (const [key, value] of currentParams) {
                newParams.append(key, value);
            }
            const paramString = newParams.toString();
            const nextPage = 'https://portal.pieter.com' + (paramString ? '?' + paramString : '');

            // Create hidden iframe to preload next page
            if (!document.getElementById('preloadFrame')) {
                const iframe = document.createElement('iframe');
                iframe.id = 'preloadFrame';
                iframe.style.display = 'none';
                iframe.src = nextPage;
                document.body.appendChild(iframe);
            }

            // Only redirect once actually in the portal
            if (playerBox.intersectsBox(exitPortalBox)) {
                window.location.href = nextPage;
            }
        }
    }
    
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
    cameraOffset.multiplyScalar(15); // Increased distance behind car for better view of larger arena
    cameraOffset.y += 8; // More height for larger view
    
    const targetCameraPos = new THREE.Vector3();
    targetCameraPos.copy(carMesh.position);
    targetCameraPos.add(cameraOffset);
    
    // Smoothly move camera to target position
    camera.position.lerp(targetCameraPos, 0.1);
    
    // Look at car
    camera.lookAt(carMesh.position);
}

// Update the player count in the UI
function updatePlayerCount() {
    const count = 1 + Object.keys(otherPlayers).length; // Self + other players
    const playerCountElement = document.getElementById('playerCount');
    if (playerCountElement) {
        playerCountElement.textContent = count;
    }
}

// Create a projectile fired by another player
function createRemoteProjectile(data) {
    // Create visual projectile
    const projectileGeometry = new THREE.SphereGeometry(data.radius, 16, 16);
    const projectileMaterial = new THREE.MeshStandardMaterial({ 
        color: 0xff8800,
        emissive: 0xff4400,
        emissiveIntensity: 0.5
    });
    const projectileMesh = new THREE.Mesh(projectileGeometry, projectileMaterial);
    
    // Set position
    const startPos = new THREE.Vector3(data.position.x, data.position.y, data.position.z);
    projectileMesh.position.copy(startPos);
    scene.add(projectileMesh);
    
    // Physics body
    const projectileShape = new CANNON.Sphere(data.radius);
    const projectileBody = new CANNON.Body({
        mass: 5,
        shape: projectileShape,
        material: projectileMaterial
    });
    projectileBody.position.set(startPos.x, startPos.y, startPos.z);
    
    // Apply velocity
    const vel = new CANNON.Vec3(data.velocity.x, data.velocity.y, data.velocity.z);
    projectileBody.velocity.copy(vel);
    
    // Set collision groups
    projectileBody.collisionFilterGroup = COLLISION_GROUPS.PROJECTILE;
    projectileBody.collisionFilterMask = COLLISION_GROUPS.GROUND | COLLISION_GROUPS.WALL | COLLISION_GROUPS.CAR;
    
    // Tag the projectile body for identification in collision events
    projectileBody.name = 'projectile';
    projectileBody.projectileId = data.projectileId;
    projectileBody.mesh = projectileMesh;
    projectileBody.createdBy = data.playerId;
    
    // Add to world
    world.addBody(projectileBody);
    
    // Store projectile data
    projectiles.push({
        id: data.projectileId,
        mesh: projectileMesh,
        body: projectileBody,
        timeCreated: Date.now()
    });
}

// Handle a car hit message from another player
function handleRemoteCarHit(data) {
    console.log("Remote car hit notification:", data);
    
    // If it's our car but detected by another player, sync our hit count
    if (data.id == playerId && carBody) {
        carBody.hitCount = data.hitCount;
        
        // Apply effects if needed
        if (data.hitCount === 1) {
            changeCarColor(carMesh, 0x888888);
        } else if (data.hitCount >= 2) {
            // Don't call explodeCar here to avoid duplicate explosions
            if (carMesh.visible) {
                explodeCar(carBody);
            }
        }
    }
    // If it's another player's car
    else if (otherPlayers[data.id]) {
        const otherCar = otherPlayers[data.id].body;
        const previousHitCount = otherCar.hitCount || 0;
        otherCar.hitCount = data.hitCount;
        
        // Apply effects
        if (data.hitCount === 1) {
            changeCarColor(otherPlayers[data.id].mesh, 0x888888);
        } else if (data.hitCount >= 2) {
            // Only explode if not already exploded
            if (otherPlayers[data.id].mesh.visible) {
                explodeCar(otherCar);
                
                // If we're the one who hit the player and this is a new elimination
                // (checking against previousHitCount to avoid duplicate scoring)
                if (data.hitBy === playerId && previousHitCount < 2) {
                    // Increment score
                    score += 1;
                    document.getElementById('score').textContent = score;
                }
            }
        }
    }
}

// Handle a full sync message from server (complete state refresh)
function handleFullSync(players) {
    console.log("Received full sync from server");
    
    // Update or create other players
    for (const id in players) {
        // Skip our own player
        if (id == playerId) continue;
        
        const player = players[id];
        
        if (!otherPlayers[id]) {
            // Create new player if we don't have them
            createOtherPlayer(player.id, player.color, player.position, player.quaternion);
            console.log(`Added missing player ${id} from full sync`);
            
            // Set hit count
            if (player.hitCount !== undefined) {
                otherPlayers[id].body.hitCount = player.hitCount;
                
                // Apply visual effects based on hit count
                applyHitCountEffects(otherPlayers[id], player.hitCount);
            }
            
            // Set visibility state if provided (override hit count effects if needed)
            if (player.visible !== undefined && otherPlayers[id].mesh) {
                console.log(`Setting initial visibility for player ${id} to ${player.visible} from full sync`);
                otherPlayers[id].mesh.visible = player.visible;
            }
        } else {
            // Update existing player state
            const otherCar = otherPlayers[id];
            
            // Update position and rotation targets
            otherCar.targetPosition = new THREE.Vector3(
                player.position.x,
                player.position.y,
                player.position.z
            );
            
            otherCar.targetQuaternion = new THREE.Quaternion(
                player.quaternion.x,
                player.quaternion.y,
                player.quaternion.z,
                player.quaternion.w
            );
            
            // Update hit count if different and apply effects
            if (player.hitCount !== undefined && otherCar.body.hitCount !== player.hitCount) {
                otherCar.body.hitCount = player.hitCount;
                applyHitCountEffects(otherCar, player.hitCount);
            }
            
            // Always apply visibility state from full sync (this is crucial - it overrides other effects)
            if (player.visible !== undefined && otherCar.mesh) {
                const currentVisible = otherCar.mesh.visible;
                const newVisible = player.visible;
                
                // Log when visibility changes
                if (currentVisible !== newVisible) {
                    console.log(`Updating visibility for player ${id}: ${currentVisible} -> ${newVisible} from full sync`);
                    otherCar.mesh.visible = newVisible;
                }
            }
        }
    }
    
    // Remove any players we have that aren't in the sync
    for (const id in otherPlayers) {
        if (!players[id]) {
            console.log(`Removing stale player ${id} from full sync`);
            removeOtherPlayer(id);
        }
    }
    
    // Update player count
    updatePlayerCount();
}

// Apply visual effects based on hit count
function applyHitCountEffects(car, hitCount) {
    if (hitCount === 0) {
        // Reset to original color
        car.mesh.visible = true;
        changeCarColor(car.mesh, car.body.originalColor);
    } else if (hitCount === 1) {
        // First hit: grey color
        car.mesh.visible = true;
        changeCarColor(car.mesh, 0x888888);
    } else if (hitCount >= 2) {
        // Second hit: invisible (exploded)
        car.mesh.visible = false;
    }
}

// Handle player respawn message
function handlePlayerRespawn(data) {
    console.log(`Received respawn for player ${data.id}`);
    
    // Handle our own respawn confirmation from server
    if (data.id == playerId && carBody) {
        carBody.hitCount = data.hitCount;
        
        // Only update our position if it's significantly different 
        // (avoid overriding local movement)
        const distance = carBody.position.distanceTo(new CANNON.Vec3(
            data.position.x, data.position.y, data.position.z
        ));
        
        if (distance > 10 || !carMesh.visible) {
            // Sync with server position if we're far off or invisible
            carBody.position.set(data.position.x, data.position.y, data.position.z);
            carBody.quaternion.set(
                data.quaternion.x,
                data.quaternion.y,
                data.quaternion.z,
                data.quaternion.w
            );
            carMesh.visible = true;
            changeCarColor(carMesh, carBody.originalColor);
            
            // Request a full sync after respawn to ensure everyone is on the same page
            if (socket && socket.readyState === WebSocket.OPEN) {
                setTimeout(() => {
                    socket.send(JSON.stringify({
                        type: 'requestSync'
                    }));
                }, 500);
            }
        }
    }
    // Handle other player respawns
    else if (data.id != playerId && otherPlayers[data.id]) {
        console.log(`Player ${data.id} respawned`);
        
        const otherCar = otherPlayers[data.id];
        
        // Update position and rotation
        otherCar.targetPosition = new THREE.Vector3(
            data.position.x,
            data.position.y,
            data.position.z
        );
        
        otherCar.targetQuaternion = new THREE.Quaternion(
            data.quaternion.x,
            data.quaternion.y,
            data.quaternion.z,
            data.quaternion.w
        );
        
        // Reset hit count
        otherCar.body.hitCount = data.hitCount;
        
        // Make car visible again and restore color
        otherCar.mesh.visible = true;
        changeCarColor(otherCar.mesh, otherCar.body.originalColor);
        
        // Request a full sync to ensure we have the correct state
        if (socket && socket.readyState === WebSocket.OPEN) {
            setTimeout(() => {
                socket.send(JSON.stringify({
                    type: 'requestSync'
                }));
            }, 500);
        }
    }
}

// Handle player sync message from server (incremental updates)
function handlePlayerSync(players) {
    // Check for any players we don't have locally
    for (const id in players) {
        if (!otherPlayers[id]) {
            console.log(`Adding missing player ${id} from sync`);
            const player = players[id];
            createOtherPlayer(player.id, player.color, player.position, player.quaternion);
            
            // Apply hit count and visibility state if present
            if (player.hitCount !== undefined) {
                otherPlayers[id].body.hitCount = player.hitCount;
                applyHitCountEffects(otherPlayers[id], player.hitCount);
            }
            
            // Apply visibility state if present
            if (player.visible !== undefined && otherPlayers[id].mesh) {
                console.log(`Setting initial visibility for player ${id} to ${player.visible}`);
                otherPlayers[id].mesh.visible = player.visible;
            }
        } else {
            // Update target positions for existing players
            otherPlayers[id].targetPosition = new THREE.Vector3(
                players[id].position.x,
                players[id].position.y,
                players[id].position.z
            );
            
            otherPlayers[id].targetQuaternion = new THREE.Quaternion(
                players[id].quaternion.x,
                players[id].quaternion.y,
                players[id].quaternion.z,
                players[id].quaternion.w
            );
            
            // Sync hit count and visibility state
            if (players[id].hitCount !== undefined) {
                const currentHitCount = otherPlayers[id].body.hitCount || 0;
                const newHitCount = players[id].hitCount;
                
                // Only update if different
                if (currentHitCount !== newHitCount) {
                    otherPlayers[id].body.hitCount = newHitCount;
                    applyHitCountEffects(otherPlayers[id], newHitCount);
                }
            }
            
            // Always apply visibility state from sync (this is crucial)
            if (players[id].visible !== undefined && otherPlayers[id].mesh) {
                const currentVisible = otherPlayers[id].mesh.visible;
                const newVisible = players[id].visible;
                
                // Log when visibility changes
                if (currentVisible !== newVisible) {
                    console.log(`Updating visibility for player ${id}: ${currentVisible} -> ${newVisible}`);
                    otherPlayers[id].mesh.visible = newVisible;
                }
            }
        }
    }
    
    // Check for any local players that don't exist on server
    for (const id in otherPlayers) {
        if (!players[id]) {
            console.log(`Removing stale player ${id} from sync`);
            removeOtherPlayer(id);
        }
    }
    
    // Update player count
    updatePlayerCount();
}

// Start the game
init(); 