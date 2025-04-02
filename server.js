// Simple WebSocket server for VibeCars multiplayer
const WebSocket = require('ws');

// Create WebSocket server on port 8080
const wss = new WebSocket.Server({ 
  port: 8080,
  // Add ping interval to keep connections alive
  clientTracking: true
});

// Store all connected players
const players = {};
let nextPlayerId = 1;

// Available car colors
const carColors = [
  0xff0000, // Red (default)
  0x00ff00, // Green
  0x0000ff, // Blue
  0xffff00, // Yellow
  0xff00ff, // Magenta
  0x00ffff, // Cyan
  0xff8800, // Orange
  0x8800ff, // Purple
  0x88ff00, // Lime
  0x00ff88  // Teal
];

// WebSocket connection handler
wss.on('connection', function connection(ws) {
  // Assign a unique ID and random color to this player
  const playerId = nextPlayerId++;
  const colorIndex = Math.floor(Math.random() * carColors.length);
  const playerColor = carColors[colorIndex];
  
  // Store player data
  players[playerId] = {
    id: playerId,
    color: playerColor,
    position: { x: 100 + Math.random() * 100, y: 3, z: 100 + Math.random() * 100 },
    quaternion: { x: 0, y: 0, z: 0, w: 1 },
    lastUpdate: Date.now(),
    hitCount: 0,
    isAlive: true,
    visible: true, // Explicitly set initial visibility
    visibilityConfirmed: false
  };
  
  console.log(`Player ${playerId} connected with color: ${playerColor}`);
  
  // Set up ping-pong for connection health check
  ws.isAlive = true;
  ws.on('pong', () => {
    ws.isAlive = true;
  });
  
  // Send player their ID and color first
  ws.send(JSON.stringify({
    type: 'init',
    id: playerId,
    color: playerColor,
    players: {} // Send empty initially
  }));
  
  // Then send a follow-up sync message to ensure state consistency
  setTimeout(() => {
    // Send all existing player states to new player with explicit visibility
    try {
      // Create a copy of players with visibility explicitly set
      const syncPlayers = {};
      for (const id in players) {
        syncPlayers[id] = {
          id: players[id].id,
          color: players[id].color,
          position: players[id].position,
          quaternion: players[id].quaternion,
          hitCount: players[id].hitCount || 0,
          visible: players[id].visible !== undefined ? players[id].visible : true
        };
      }
      
      // Send a full sync with all player data
      ws.send(JSON.stringify({
        type: 'fullSync',
        players: syncPlayers
      }));
    } catch (e) {
      console.error('Error sending initial player data:', e);
    }
    
    // Broadcast to existing players that a new player joined
    broadcastToAll({
      type: 'playerJoined',
      id: playerId,
      color: playerColor,
      position: players[playerId].position,
      quaternion: players[playerId].quaternion,
      hitCount: 0,
      visible: true
    });
  }, 100);
  
  // Handle messages from clients
  ws.on('message', function incoming(message) {
    try {
      const data = JSON.parse(message);
      
      // Handle different message types
      if (data.type === 'position') {
        // Update player position and orientation
        if (players[data.id]) {
          players[data.id].position = data.position;
          players[data.id].quaternion = data.quaternion;
          players[data.id].lastUpdate = Date.now();
          
          // Also update hit count and visibility state when included
          if (data.hitCount !== undefined) {
            players[data.id].hitCount = data.hitCount;
          }
          
          if (data.visible !== undefined) {
            players[data.id].visible = data.visible;
          }
          
          // Broadcast position update to all other players
          broadcastToAll({
            type: 'playerMoved',
            id: data.id,
            position: data.position,
            quaternion: data.quaternion,
            hitCount: data.hitCount,
            visible: data.visible
          }, data.id); // Don't send to self
        }
      } 
      else if (data.type === 'projectileCreated') {
        // Broadcast projectile creation to all players (including the sender)
        broadcastToAll({
          type: 'projectileCreated',
          playerId: data.playerId,
          projectileId: data.projectileId,
          position: data.position,
          velocity: data.velocity,
          radius: data.radius
        });
      }
      else if (data.type === 'carHit') {
        // Update player hit count
        if (players[data.id]) {
          players[data.id].hitCount = data.hitCount;
          
          // Broadcast car hit to all players
          broadcastToAll({
            type: 'carHit',
            id: data.id,
            hitCount: data.hitCount,
            hitBy: data.hitBy // Include who hit the player
          });
        }
      }
      else if (data.type === 'playerRespawn') {
        // Update player state after respawn
        if (players[data.id]) {
          players[data.id].position = data.position;
          players[data.id].quaternion = data.quaternion;
          players[data.id].hitCount = data.hitCount;
          players[data.id].lastUpdate = Date.now();
          players[data.id].visible = true; // Explicitly set visible
          
          console.log(`Player ${data.id} respawned at position:`, data.position);
          
          // IMMEDIATELY force broadcast a reset visibility command to ALL clients
          // This is a direct "force visibility" message that bypasses normal sync
          wss.clients.forEach(function each(client) {
            if (client.readyState === WebSocket.OPEN) {
              try {
                // Send force visibility command
                client.send(JSON.stringify({
                  type: 'forceVisibility',
                  id: data.id,
                  visible: true
                }));
              } catch (e) {
                console.error('Error sending force visibility command:', e);
              }
            }
          });
          
          // Schedule multiple reconciliations with increasing delays
          // This ensures visibility gets properly synchronized even with network issues
          setTimeout(() => reconcilePlayerVisibility(data.id), 500);
          setTimeout(() => reconcilePlayerVisibility(data.id), 1500);
          setTimeout(() => reconcilePlayerVisibility(data.id), 3000);
          
          // First, send a direct confirmation back to the respawning player
          try {
            // Find the client with this player ID
            wss.clients.forEach(function each(client) {
              if (client.readyState === WebSocket.OPEN && client.playerId === data.id) {
                client.send(JSON.stringify({
                  type: 'playerRespawn',
                  id: data.id,
                  position: data.position,
                  quaternion: data.quaternion,
                  hitCount: data.hitCount,
                  visible: true
                }));
              }
            });
          } catch (e) {
            console.error('Error sending respawn confirmation:', e);
          }
          
          // Then broadcast to ALL other players
          broadcastToAll({
            type: 'playerRespawn',
            id: data.id,
            position: data.position,
            quaternion: data.quaternion,
            hitCount: data.hitCount,
            visible: true
          }, data.id); // Don't send to respawning player again
          
          // Send immediate sync to all clients to ensure consistency
          setTimeout(() => {
            wss.clients.forEach(function each(client) {
              if (client.readyState === WebSocket.OPEN) {
                try {
                  // Create a copy of players with visibility explicitly set
                  const syncPlayers = {};
                  for (const id in players) {
                    syncPlayers[id] = {
                      id: players[id].id,
                      color: players[id].color,
                      position: players[id].position,
                      quaternion: players[id].quaternion,
                      hitCount: players[id].hitCount || 0,
                      visible: players[id].visible !== undefined ? players[id].visible : true
                    };
                  }
                  
                  client.send(JSON.stringify({
                    type: 'fullSync',
                    players: syncPlayers
                  }));
                } catch (e) {
                  console.error('Error sending full sync after respawn:', e);
                }
              }
            });
          }, 200);
        }
      }
      else if (data.type === 'requestSync') {
        // Client is requesting a full state sync
        if (ws.readyState === WebSocket.OPEN) {
          // Create a copy of players with visibility explicitly set
          const syncPlayers = {};
          for (const id in players) {
            syncPlayers[id] = {
              id: players[id].id,
              color: players[id].color,
              position: players[id].position,
              quaternion: players[id].quaternion,
              hitCount: players[id].hitCount || 0,
              visible: players[id].visible !== undefined ? players[id].visible : true
            };
          }
          
          ws.send(JSON.stringify({
            type: 'fullSync',
            players: syncPlayers
          }));
        }
      }
      else if (data.type === 'visibilityUpdate') {
        // Update player visibility state
        if (players[data.id]) {
          players[data.id].visible = data.visible;
          players[data.id].lastUpdate = Date.now();
          
          console.log(`Player ${data.id} visibility set to: ${data.visible}`);
          
          // Broadcast to all other players
          broadcastToAll({
            type: 'visibilityUpdate',
            id: data.id,
            visible: data.visible
          });
        }
      }
      else if (data.type === 'visibilityConfirm') {
        // Update player visibility state based on confirmation
        if (players[data.id]) {
          players[data.id].visible = data.visible;
          players[data.id].visibilityConfirmed = true;
          players[data.id].lastUpdate = Date.now();
          console.log(`Player ${data.id} confirmed visibility: ${data.visible}`);
        }
      }
      else if (data.type === 'requestForceVisibility') {
        // Client is requesting a force visibility broadcast
        if (players[data.id]) {
          players[data.id].visible = data.visible;
          players[data.id].lastUpdate = Date.now();
          
          console.log(`Player ${data.id} requests force visibility: ${data.visible}`);
          
          // Broadcast force visibility to ALL clients (including sender)
          wss.clients.forEach(function each(client) {
            if (client.readyState === WebSocket.OPEN) {
              try {
                client.send(JSON.stringify({
                  type: 'forceVisibility',
                  id: data.id,
                  visible: data.visible
                }));
              } catch (e) {
                console.error('Error sending force visibility command:', e);
              }
            }
          });
        }
      }
    } catch (e) {
      console.error('Invalid message format:', e);
    }
  });
  
  // Handle disconnects
  ws.on('close', function() {
    console.log(`Player ${playerId} disconnected`);
    
    // Remove player from list
    delete players[playerId];
    
    // Broadcast player left
    broadcastToAll({
      type: 'playerLeft',
      id: playerId
    });
  });
  
  // Attach player ID to websocket for reference
  ws.playerId = playerId;
});

// Broadcast message to all connected clients
function broadcastToAll(data, exceptId = null) {
  wss.clients.forEach(function each(client) {
    if (client.readyState === WebSocket.OPEN) {
      if (exceptId === null || client.playerId !== exceptId) {
        try {
          client.send(JSON.stringify(data));
        } catch (e) {
          console.error('Error sending message to client:', e);
        }
      }
    }
  });
}

// Clean up inactive players (periodic check)
setInterval(function() {
  const now = Date.now();
  for (const id in players) {
    if (now - players[id].lastUpdate > 10000) { // 10 seconds timeout
      console.log(`Player ${id} timed out`);
      delete players[id];
      
      // Broadcast player left
      broadcastToAll({
        type: 'playerLeft',
        id: parseInt(id)
      });
    }
  }
}, 5000);

// Send state sync every 2 seconds instead of 5
setInterval(function() {
  // Send current state of all players to everyone
  wss.clients.forEach(function each(client) {
    if (client.readyState === WebSocket.OPEN && client.playerId) {
      const currentPlayers = {};
      for (const id in players) {
        if (id != client.playerId) { // Don't include the receiving player
          // Include hit count in sync data
          currentPlayers[id] = {
            id: players[id].id,
            color: players[id].color,
            position: players[id].position,
            quaternion: players[id].quaternion,
            hitCount: players[id].hitCount || 0,
            visible: players[id].visible !== undefined ? players[id].visible : true
          };
        }
      }
      
      try {
        client.send(JSON.stringify({
          type: 'playerSync',
          players: currentPlayers
        }));
      } catch (e) {
        console.error('Error sending sync to client:', e);
      }
    }
  });
}, 2000); // Sync more frequently

// Implement WebSocket ping/pong for connection health checks
const pingInterval = setInterval(function ping() {
  wss.clients.forEach(function each(ws) {
    if (ws.isAlive === false) {
      // Connection is dead
      console.log(`Terminating inactive connection for player ${ws.playerId}`);
      return ws.terminate();
    }

    // Mark as inactive for next ping cycle
    ws.isAlive = false;
    // Send ping
    try {
      ws.ping();
    } catch (e) {
      console.error('Error sending ping to client:', e);
    }
  });
}, 5000);

// Clean up ping interval on server close
wss.on('close', function close() {
  clearInterval(pingInterval);
});

// Add a periodic visibility reconciliation check
setInterval(function() {
  // This ensures all clients have same visibility state
  // Check each player's visibility
  for (const id in players) {
    // If this player should be visible, force visibility
    if (players[id].visible) {
      const playerId = parseInt(id);
      console.log(`Visibility reconciliation for player ${playerId}: forcing visible=true`);
      
      // For players that should be visible, broadcast a force visibility
      wss.clients.forEach(function each(client) {
        if (client.readyState === WebSocket.OPEN) {
          try {
            // Force visibility status
            client.send(JSON.stringify({
              type: 'forceVisibility',
              id: playerId,
              visible: true
            }));
            
            // Also send a one-time position update for this player to all clients
            const player = players[id];
            client.send(JSON.stringify({
              type: 'playerMoved',
              id: playerId,
              position: player.position,
              quaternion: player.quaternion,
              hitCount: player.hitCount || 0,
              visible: true
            }));
          } catch (e) {
            console.error('Error in visibility reconciliation:', e);
          }
        }
      });
    }
  }
}, 3000); // Check every 3 seconds

// DIRECT RECONCILIATION function that can be called for aggressive sync
function reconcilePlayerVisibility(playerId) {
  if (!players[playerId]) return; // Safety check
  
  console.log(`DIRECT RECONCILIATION for player ${playerId}`);
  
  // Set player to visible and mark as confirmed
  players[playerId].visible = true;
  
  // Create aggressive reconciliation for this player
  const player = players[playerId];
  
  // Broadcast to ALL clients
  wss.clients.forEach(function each(client) {
    if (client.readyState === WebSocket.OPEN) {
      try {
        // Step 1: Send force visibility
        client.send(JSON.stringify({
          type: 'forceVisibility',
          id: playerId,
          visible: true
        }));
        
        // Step 2: Send position update
        client.send(JSON.stringify({
          type: 'playerMoved',
          id: playerId,
          position: player.position,
          quaternion: player.quaternion,
          hitCount: player.hitCount || 0,
          visible: true
        }));
      } catch (e) {
        console.error('Error in direct reconciliation:', e);
      }
    }
  });
}

console.log('VibeCars multiplayer server running on ws://localhost:8080'); 