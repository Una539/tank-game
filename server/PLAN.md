# Tank Multiplayer Server - Technical Plan (Enhanced)

## 1. Game Analysis Summary

### Game Mechanics (Frontend Reference)
- **Canvas Size**: 800x800
- **Grid**: 16x16 cells, 50px each
- **Tank**:
  - Speed: 3 px/tick
  - Rotation: 0.05 rad/tick
  - Radius: 15 px
  - Fire interval: 200ms
  - Bullet limit: 10 per magazine
- **Bullet**:
  - Speed: 2 px/tick
  - Spawn offset: 30px from tank center
  - Lifetime: 10 seconds (time mode)
  - Max bounces: 5 (bounces mode)
- **Map Generation**: DFS-based maze with 15% loop probability

## 2. Architecture

### Project Structure
```
server/
├── src/
│   ├── main.rs           # Entry point, server setup
│   ├── lib.rs           # Library root
│   ├── protocol/        # Packet definitions & serialization
│   │   ├── mod.rs
│   │   ├── packets.rs   # Postcard packet types with version
│   │   ├── codec.rs    # Length-delimited Postcard codec
│   │   └── error.rs    # Protocol errors
│   ├── game/           # Game logic (authoritative)
│   │   ├── mod.rs
│   │   ├── state.rs    # Double-buffered GameState
│   │   ├── tank.rs     # Tank logic (fixed-point)
│   │   ├── bullet.rs  # Bullet logic (fixed-point)
│   │   ├── map.rs     # Map generator + compression
│   │   ├── collision.rs # Spatial partitioning interface
│   │   └── explosion.rs
│   ├── networking/     # Networking layer
│   │   ├── mod.rs
│   │   ├── ws_handler.rs  # WebSocket + heartbeat
│   │   └── broadcast.rs # mpsc-based broadcast
│   ├── rooms/          # Lobby/Room system
│   │   ├── mod.rs
│   │   └── manager.rs
│   └── utils/
│       ├── mod.rs
│       ├── math.rs     # Fixed-point geometry
│       └── time.rs    # Tick timer & sync
├── Cargo.toml
└── .env               # Server config
```

## 3. Networking Protocol

### Protocol Selection: WebSocket + Postcard Binary
- **Rationale**: 
  - Tank game is not real-time FPS - turn/rotate commands are low frequency
  - Postcard: binary serialization, ~40-60% smaller than JSON
  - No reflection, zero-copy deserialization possible
  - Works in no_std environments

### Packet Format (Postcard with Version)
```rust
// Protocol version for compatibility
const PROTOCOL_VERSION: u16 = 1;

#[derive(Postcard)]
#[postcard(ser = "serialize", de = "deserialize")]
#[postcard(ty = "enum", tag = "type", enum_delims = "u8")]
enum ClientPacket {
    // Handshake
    #[postcard(value = 0)]
    Join { room_id: String, player_name: String },
    
    // Game input
    #[postcard(value = 1)]
    Input { tick: u32, keys: KeyState, timestamp: u64 },
    
    #[postcard(value = 2)]
    Fire { timestamp: u64 },
    
    // Keepalive
    #[postcard(value = 3)]
    Ping { client_tick: u32 },
    
    #[postcard(value = 4)]
    Leave,
}

#[derive(Postcard, Clone)]
struct KeyState {
    up: bool,
    down: bool,
    left: bool,
    right: bool,
    fire: bool,
}

#[derive(Postcard, Clone)]
#[postcard(ty = "enum", tag = "type", enum_delims = "u8")]
enum ServerPacket {
    // Handshake
    #[postcard(value = 0)]
    Welcome { player_id: Uuid, server_tick: u32 },
    
    #[postcard(value = 1)]
    RoomUpdate { players: Vec<RoomPlayer> },
    
    #[postcard(value = 2)]
    GameStart { 
        seed: u64,
        map: CompressedMap,  // Compressed wall segments
        server_tick: u32,
    },
    
    // State broadcast (main packet)
    #[postcard(value = 3)]
    State { 
        tick: u32, 
        players: Vec<PlayerDelta>,   // Only changed
        bullets: Vec<BulletData>,    // Full sync on fire
        explosions: Vec<ExplosionData>, // New explosions only
    },
    
    // Keepalive
    #[postcard(value = 4)]
    Pong { server_tick: u32, latency_ms: u16 },
    
    #[postcard(value = 5)]
    GameOver { winner: Option<Uuid> },
    
    #[postcard(value = 6)]
    Error { code: ErrorCode, message: String },
}
```

### Error Codes
```rust
#[derive(Postcard)]
#[postcard(u8)]
enum ErrorCode {
    InvalidPacket = 1,
    VersionMismatch = 2,
    RoomNotFound = 3,
    RoomFull = 4,
    NotInRoom = 5,
    GameNotStarted = 6,
    TickOutOfSync = 7,
    TooManyRequests = 8,
}
```

## 4. Fixed-Point Physics (Cross-Platform Determinism)

### Why Fixed-Point?
- JavaScript `f64` can have precision variance across browsers
- UDP-like replication requires deterministic simulation
- Bullet bounce calculations must match exactly

### Implementation with `pround`
```rust
use pround::prelude::*;

// Use 16.16 fixed-point (Q16.16)
type Fixed = i32;
const FP_SCALE: i32 = 65536; // 2^16

#[derive(Copy, Clone)]
struct Vec2 {
    x: Fixed,
    y: Fixed,
}

impl Vec2 {
    fn new(x: f64, y: f64) -> Self {
        Self {
            x: (x * FP_SCALE as f64) as Fixed,
            y: (y * FP_SCALE as f64) as Fixed,
        }
    }
    
    fn to_f64(self) -> (f64, f64) {
        (self.x as f64 / FP_SCALE as f64, self.y as f64 / FP_SCALE as f64)
    }
    
    fn length_sq(self) -> Fixed {
        ((self.x >> 8) * (self.x >> 8) + (self.y >> 8) * (self.y >> 8)) * FP_SCALE
    }
    
    fn length(self) -> Fixed {
        // Square root approximation
        isqrt(self.length_sq()) << 8
    }
}

// Or use `fixed` crate for more options
```

### Tank Constants (Converted)
```rust
const TANK_SPEED: Fixed = 196608;      // 3.0 * 65536
const TANK_ROTATION_SPEED: Fixed = 3276; // 0.05 * 65536
const TANK_RADIUS: Fixed = 983040;      // 15.0 * 65536
const BULLET_SPEED: Fixed = 131072;     // 2.0 * 65536
const BULLET_SPAWN_OFFSET: Fixed = 1966080; // 30.0 * 65536
const FIRE_INTERVAL: u64 = 200;
const BULLET_LIFETIME: u64 = 10000;
```

## 5. Spatial Partitioning Interface

### Grid-Based Partitioning (Interface Ready)
```rust
pub trait SpatialPartition<T> {
    fn insert(&mut self, id: T, x: Fixed, y: Fixed);
    fn remove(&mut self, id: &T);
    fn query_radius(&self, x: Fixed, y: Fixed, radius: Fixed) -> Vec<T>;
    fn query_rect(&self, min: Vec2, max: Vec2) -> Vec<T>;
}

// Future implementation for larger maps
pub struct GridPartition<T: Copy + Eq> {
    cell_size: Fixed,
    cols: usize,
    rows: usize,
    cells: VecHashMap<usize, Vec<T>>,
}

impl<T: Copy + Eq> SpatialPartition<T> for GridPartition<T> {
    // ...
}
```

## 6. Concurrency Model

### Double Buffering Architecture
```rust
pub struct Room {
    id: String,
    
    // Double-buffered state
    current: RwLock<GameSnapshot>,
    pending: RwLock<GameSnapshot>,
    
    // Frame generation counter
    tick: AtomicU32,
    
    // Player connections
    players: RwLock<HashMap<Uuid, PlayerHandle>>,
    
    // Input receiver (mpsc channel)
    input_tx: mpsc::Sender<InputEvent>,
}

// Game state uses copy-on-write snapshots
#[derive(Clone)]
struct GameSnapshot {
    tick: u32,
    players: Vec<PlayerSnapshot>,
    bullets: Vec<BulletSnapshot>,
    explosions: Vec<ExplosionData>,
    walls: Arc<Vec<WallSegment>>,
}

// Read path: Broadcast reads from `current`
// Write path: Physics writes to `pending`, then swap
fn process_tick(room: &Room) {
    let mut pending = room.pending.write();
    update_physics(&mut pending);
    
    let mut current = room.current.write();
    std::mem::swap(&mut *current, &mut *pending);
    
    room.tick.fetch_add(1, Ordering::Relaxed);
}
```

### Lock-Free Message Passing
```rust
// Network layer -> Game layer
pub struct GameChannel {
    // Bounded channel for backpressure
    input_tx: mpsc::Sender<InputEvent>,
    input_rx: mpsc::Receiver<InputEvent>,
    output_tx: mpsc::Sender<BroadcastEvent>,
    output_rx: mpsc::Receiver<BroadcastEvent>,
}

impl GameChannel {
    pub fn new(capacity: usize) -> Self {
        let (input_tx, input_rx) = mpsc::channel(capacity);
        let (output_tx, output_rx) = mpsc::channel(capacity);
        Self { input_tx, input_rx, output_tx, output_rx }
    }
}

// Single-threaded game loop
async fn game_loop(room: &Arc<Room>) {
    let mut input_rx = room.channel.input_rx;
    let mut ticker = interval(TICK_DURATION);
    
    loop {
        tokio::select! {
            _ = ticker.tick() => {
                process_tick(room).await;
            }
            Some(input) = input_rx.recv() => {
                handle_input(room, input);
            }
        }
    }
}
```

## 7. Heartbeat & State Rewind

### Application-Level Heartbeat
```rust
// Every 5 seconds
const PING_INTERVAL: Duration = Duration::from_secs(5);
const PING_TIMEOUT: Duration = Duration::from_secs(15);

#[derive(Postcard)]
struct HeartbeatState {
    last_ping: Instant,
    last_pong: Instant,
    client_tick: u32,
    latency_ms: u16,
}

impl Room {
    fn check_heartbeats(&self) {
        for (player_id, state) in &self.players {
            if state.last_pong.elapsed() > PING_TIMEOUT {
                self.remove_player(player_id);
            }
        }
    }
}
```

### State Rewind (Tick History)
```rust
const MAX_HISTORY: usize = 20;

pub struct Room {
    history: RwLock<VecDeque<GameSnapshot>>,
    #[allow(dead_code)]
    pending_inputs: RwLock<HashMap<Uuid, Vec<PendingInput>>>,
}

#[derive(Clone)]
struct PendingInput {
    tick: u32,
    keys: KeyState,
    timestamp: u64,
}

impl Room {
    fn record_input(&self, player_id: Uuid, input: PendingInput) {
        let mut pending = self.pending_inputs.write();
        pending.entry(player_id).or_default().push(input);
        
        // Trim old inputs
        if let Some(inputs) = pending.get_mut(&player_id) {
            while inputs.first().map(|i| i.tick + MAX_HISTORY as u32 < self.tick.load(Ordering::Relaxed)).unwrap_or(false) {
                inputs.pop_front();
            }
        }
    }
}
```

## 8. Room/Lobby System

### Features
- Create room (generates unique 6-char alphanumeric ID)
- Join room by ID
- Player slots (min 2, max 4 for tank game)
- Ready system
- Auto-start when all ready / timeout
- Spectator support (optional)

### Room States
```
Lobby -> Countdown (3s) -> Playing -> GameOver -> Lobby
```

## 9. Map Compression

### DFS Maze Compression
```rust
#[derive(Postcard, Clone)]
struct CompressedMap {
    seed: u64,
    // 16x16 grid stored as bitmask: 256 bits = 32 bytes
    // Use 4 bytes for bottom walls, 4 bytes for right walls
    horizontal_walls: u32,   // bit i = wall at row i
    vertical_walls: u32,     // bit i = wall at col i
    loop_probability: f32,  // default 0.15
}

impl From<&MapGenerator> for CompressedMap {
    fn from(gen: &MapGenerator) -> Self {
        let mut h = 0u32;
        let mut v = 0u32;
        
        for (i, row) in gen.horizontal_walls.iter().enumerate() {
            if *row { h |= 1 << i; }
        }
        for (i, col) in gen.vertical_walls.iter().enumerate() {
            if *col { v |= 1 << i; }
        }
        
        Self {
            seed: gen.seed,
            horizontal_walls: h,
            vertical_walls: v,
            loop_probability: gen.loop_probability,
        }
    }
}
```

## 10. Configuration

### Server Settings (.env)
```
HOST=0.0.0.0
PORT=8080
TICK_RATE=30
MAX_PLAYERS_PER_ROOM=4
HEARTBEAT_INTERVAL=5
```

## 11. Dependencies (Optimized)

```toml
[package]
name = "tank-server"
version = "0.1.0"
edition = "2021"

[dependencies]
# Async runtime (minimal features)
tokio = { version = "1", default-features = false, features = ["rt", "macros", "sync", "time", "net"] }
tokio-tungstenite = "0.21"

# Serialization
postcard = { version = "1", features = ["alloc"] }
serde = { version = "1", features = ["derive"] }

# Fixed-point math
pround = "0.2"

# Utilities
uuid = { version = "1", features = ["v4", "serde"] }
rand = "0.8"
async-trait = "0.1"
futures-util = "0.3"

# Logging
tracing = "0.1"
tracing-subscriber = { version = "0.3", features = ["env-filter"] }

[dev-dependencies]
tokio-test = "0.4"
```

## Key Improvements Summary

| Category | Enhancement | Benefit |
|-----------|------------|---------|
| Serialization | Postcard + Version Tag | ~50% bandwidth reduction, protocol safety |
| Physics | Fixed-point (pround) | Cross-platform determinism |
| Spatial | Grid partitioning interface | O(1) collision queries (future) |
| Concurrency | Double buffering + mpsc | No lock contention, clean IO/Logic separation |
| Robustness | Heartbeat + State Rewind | Zombie cleanup, lag compensation |
| Map Storage | Bitmask compression | 32 bytes vs KB of JSON |
| Dependencies | Minimal tokio features | Smaller binary |