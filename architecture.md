# VibeCars - Architecture Documentation

## Project Overview

VibeCars is a browser-based vehicular combat game built with Three.js for 3D rendering and Cannon.js for physics simulation. The game features a car that can drive around an arena, shoot projectiles, honk, and perform jumps.

## File Structure

```
VibeCars/
├── index.html          # Main HTML entry point
├── js/
│   └── game.js         # Core game logic and rendering
├── server.js           # Simple Node.js server for local development
├── README.md           # Project overview and instructions
├── progress.md         # Development progress documentation
└── architecture.md     # This file - architecture documentation
```

## Component Architecture

### 1. Entry Point (index.html)

- **Purpose**: Serves as the main entry point for the application
- **Dependencies**: Three.js, Cannon.js, and custom game script
- **Functionality**:
  - Imports required libraries from CDN
  - Sets up basic HTML structure and CSS styling
  - Contains UI elements for score and instructions
  - Loads the main game.js script

### 2. Game Engine (game.js)

This is the core of the application, containing all game logic, rendering, and physics.

#### Core Components:

##### Scene Setup
- Initializes Three.js scene, camera, and renderer
- Sets up lighting (ambient and directional)
- Configures renderer settings and shadow mapping

##### Physics World
- Initializes Cannon.js physics engine
- Sets up gravity and collision materials
- Configures contact materials for different object interactions

##### Arena Creation
- Builds a large-scale arena (500x500 units) with walls
- Creates a modular ground system using a grid of physical panels
- Implements physical holes by selectively not creating ground panels where holes should be
- Uses trigger bodies positioned below holes to detect when objects fall through
- Provides visual representation of holes separate from their physics implementation

##### Car Implementation
- Constructs a 3D model of the car with chassis and wheels
- Creates physics body for the car with proper mass and constraints
- Implements direction-based car controls that factor in the car's current orientation
- Applies forces in the car's local coordinate system rather than world coordinates
- Adds special actions: jump/flip (E key), horn (Q key), and shooting (Space)
- Includes a downforce component to improve ground traction

##### Projectile System
- Implements projectile creation and physics
- Handles projectile lifecycle (creation, movement, collision, deletion)

##### Audio System
- Uses Web Audio API for sound generation
- Creates procedural sound effects for game actions
- Implements required browser interaction for audio initialization

##### Game Loop
- Manages the animation loop for continuous rendering
- Updates physics simulation with proper time steps
- Synchronizes visual objects with physics bodies
- Controls camera movement to follow the car

### 3. Development Server (server.js)

- **Purpose**: Provides a local development environment
- **Functionality**:
  - Creates an HTTP server using Node.js
  - Serves static files with proper MIME types
  - Handles basic error scenarios
  - Provides fallback to index.html for non-existent routes

## Key Technical Insights

### Physics-Visual Synchronization
The game maintains two separate representations of objects:
1. **Visual Representation**: Three.js meshes for rendering
2. **Physical Representation**: Cannon.js bodies for physics

These are synchronized in each animation frame by copying positions and rotations from physics bodies to visual meshes.

### Camera System
The camera follows the car with a third-person perspective:
- Uses the car's orientation to position itself behind the car
- Implements smooth transitions using linear interpolation
- Adjusts height and distance based on gameplay needs
- Configured with increased distance and height for the larger arena scale

### Sound Generation
Instead of relying on external audio files, the game uses Web Audio API to generate sounds procedurally:
- Creates oscillators with specific waveforms (sine, square)
- Controls frequency and gain over time for different sound effects
- Requires user interaction to initialize (browser security requirement)

### Collision System
The game uses different strategies for collision detection:
- Solid walls use regular physics collision
- Floor system implemented using a grid of physical panels rather than a single plane
- Holes created by selectively omitting ground panels in specific areas
- Fallthrough detection uses thin trigger cylinders positioned well below the holes
- Car reset mechanism uses random respawn positions throughout the arena

### Terrain Construction System
The terrain is built using a modular approach:
- Ground is constructed using a grid of panels instead of a single piece
- Each panel is checked against hole positions before creation
- Panels that would intersect with holes are not created, creating actual physical gaps
- Visual representation of the ground uses a single mesh for efficiency
- Visual representation of holes are rendered as black circles
- The separation of visual and physical representation allows for flexible design

## Performance Considerations

- **Physics Step Size**: Fixed time step for physics to ensure consistent behavior
- **Ground Panel Size**: Larger ground panels (25x25) used for the expanded arena to maintain performance
- **Terrain Construction**: Only creates necessary ground panels, avoiding areas where holes exist
- **Object Pooling**: (Future implementation) Reuse projectiles instead of creating/destroying
- **Renderer Optimization**: Shadows only enabled for important objects
- **Memory Management**: Removes old projectiles to prevent memory leaks

## Extension Points

The architecture is designed to be extensible in several ways:

1. **Additional Vehicles**: The car creation system can be extended to support different vehicle types
2. **Power-ups**: New special abilities can be added with minimal changes to core logic
3. **Enemy AI**: The control system can be adapted for AI-controlled vehicles
4. **Multiplayer**: The physics system could be extended to support networked gameplay

## Browser Compatibility

- Requires modern browsers with WebGL support
- Uses ES6 JavaScript features
- Requires Web Audio API support for sound effects
- Tested on Chrome, Firefox, and Edge 