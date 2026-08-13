<template>
  <div class="game-container coc-theme">
    <!-- Web3 Transaction Simulation Overlay -->
    <div v-if="isTransacting" class="transaction-overlay">
        <div class="spinner"></div>
        <div class="tx-text">Confirming Transaction...</div>
    </div>
    <!-- Main Game Board -->
    <div class="game-board" ref="boardContainer">
      <!-- Top HUD area -->
      <div class="hud top-hud">
        
        <!-- Top Left: Player Level / Trophy & Leaderboard -->
        <div class="hud-left">
            <div class="player-badge" v-if="myKingdom">
                <div class="level-star">
                    <span class="lvl-num">1</span>
                </div>
                <div class="name-score">
                    <div class="player-name">{{ myKingdom.ownerName }}</div>
                    <div class="trophy-bar">
                        <i class="icon">🏆</i> 
                        <span class="score-text">1250</span>
                    </div>
                </div>
            </div>
            
            <!-- Leaderboard -->
            <div class="leaderboard-panel" v-if="leaderboard.length > 0">
                <div class="lb-header">🏆 Top Kingdoms</div>
                <div class="lb-row clickable-row" v-for="(lb, index) in leaderboard.slice(0, 5)" :key="lb.pubkey" @click="focusOnPlayer(lb.pubkey)" title="Click to view kingdom">
                    <span class="lb-rank">#{{ index + 1 }}</span>
                    <span class="lb-name">{{ lb.name }}</span>
                    <span class="lb-score">{{ lb.score }}</span>
                </div>
                <div style="font-size: 0.75rem; color: #bdc3c7; text-align: center; margin-top: 8px;">(Click a name to view their base)</div>
            </div>
        </div>

        <!-- Top Right: Resources -->
        <div class="top-resource-bar" v-if="myKingdom">
          <div class="res-bar elixir-bar">
            <span class="res-val">{{ Math.floor(myKingdom.resources.food) }}</span>
            <div class="res-icon elixir-icon"></div>
          </div>
          <div class="res-bar gold-bar">
            <span class="res-val">{{ Math.floor(myKingdom.resources.gold) }}</span>
            <div class="res-icon gold-icon"></div>
          </div>
          <div class="res-bar gem-bar">
            <span class="res-val">{{ Math.floor(myKingdom.resources.stone) }}</span>
            <div class="res-icon gem-icon"></div>
          </div>
        </div>
      </div>
      
      <!-- Bottom Right Tools -->
      <div class="hud bottom-right-hud">
        <button class="coc-btn spawn-btn" @click="spawnArmyAtCenter" v-if="!myKingdom">
          Find Match
        </button>
        <button class="coc-btn blue-btn" @click="recenter" v-if="myKingdom">
          Return Home
        </button>
      </div>

      <canvas 
        ref="gameCanvas" 
        @mousedown="onMouseDown"
        @mousemove="onMouseMove"
        @mouseup="onMouseUp"
        @mouseleave="onMouseUp"
        @contextmenu.prevent="onContextMenu"
        @wheel="onWheel"
      ></canvas>
    </div>

    <!-- Bottom Drawer for Selection -->
    <div class="bottom-drawer" :class="{ 'drawer-open': selectedEntity || selectedTile }">
        <button class="close-drawer" @click="selectedEntity = null; selectedTile = null">X</button>
        
        <!-- Empty Tile Selected -->
        <div v-if="selectedTile && !selectedEntity" class="drawer-content center-content">
            <h3 class="drawer-title" style="text-transform: capitalize;">{{ selectedTileTerrain || 'Wilderness' }}</h3>
            
            <button v-if="myKingdom && !isSelectedTileMine && !claimedTiles[`${selectedTile.x},${selectedTile.y}`]" class="coc-btn green-btn" @click="claimTile">
                Claim Territory (50 Gold)
            </button>
            <div v-else-if="isSelectedTileMine && (selectedTileTerrain === 'forest' || selectedTileTerrain === 'mountain')">
                <p style="color: #fff; margin-bottom: 10px;">This {{ selectedTileTerrain }} is in your territory. Clear it for resources?</p>
                <button class="coc-btn purple-btn" @click="clearObstacleBtn">
                    Clear Obstacle (10 Gold)
                </button>
            </div>
            <div v-else-if="isSelectedTileMine && selectedTileBuilding">
                <div class="drawer-header"><h3 class="drawer-title" style="text-transform: capitalize;">{{ selectedTileBuilding.type }} (Level {{ selectedTileBuilding.level }})</h3></div>
                <button class="coc-btn green-btn" @click="upgradePlacedBuilding">Upgrade (100W, 50S)</button>
            </div>
            <div v-else-if="isSelectedTileMine && selectedTileTerrain === 'grass'">
                <p style="color: #fff; margin-bottom: 10px;">Build on this tile:</p>
                <div class="upgrade-grid">
                    <button class="coc-btn green-btn small-btn" @click="buildBuilding('farm')">Farm</button>
                    <button class="coc-btn green-btn small-btn" @click="buildBuilding('lumberMill')">Lumber Mill</button>
                    <button class="coc-btn green-btn small-btn" @click="buildBuilding('quarry')">Quarry</button>
                    <button class="coc-btn green-btn small-btn" @click="buildBuilding('barracks')">Barracks</button>
                    <button class="coc-btn green-btn small-btn" @click="buildBuilding('archeryTower')">Arch Tower</button>
                    <button class="coc-btn green-btn small-btn" @click="buildBuilding('cannon')">Cannon</button>
                    <button class="coc-btn green-btn small-btn" @click="buildBuilding('wall')">Wall</button>
                </div>
            </div>
            <div v-else-if="claimedTiles[`${selectedTile.x},${selectedTile.y}`]">
                <p style="color: #ccc;">Territory claimed by {{ claimedTiles[`${selectedTile.x},${selectedTile.y}`] === myKingdom?.pubkey ? 'You' : 'Enemy' }}</p>
            </div>
        </div>

        <!-- Entity Selected -->
        <div v-else-if="selectedEntity" class="drawer-content">
            <div class="drawer-header">
                <div class="entity-title-area">
                    <h2 class="drawer-title">
                        <span v-if="selectedEntity.allianceId" style="color: #e5b326; margin-right: 5px;">[{{ selectedEntity.allianceId }}]</span>
                        {{ selectedEntity.ownerName }}
                    </h2>
                    <span class="entity-subtitle">Level {{ selectedEntity.buildings.townHall }} Town Hall</span>
                </div>
            </div>

            <!-- Tabs for My Kingdom -->
            <div class="coc-tabs" v-if="isMyEntity">
                <button :class="{ active: activeTab === 'army' }" @click="activeTab = 'army'">Train Troops</button>
                <button :class="{ active: activeTab === 'hero' }" @click="activeTab = 'hero'">Hero</button>
            </div>

            <!-- Army Tab -->
            <div v-if="activeTab === 'army'" class="tab-body">
                <div class="army-status">
                    <div class="troop">
                        <span class="troop-icon">🦅</span>
                        <span class="troop-count">x{{ selectedEntity.army.scout }}</span>
                    </div>
                    <div class="troop">
                        <span class="troop-icon">⚔️</span>
                        <span class="troop-count">x{{ selectedEntity.army.soldier }}</span>
                    </div>
                    <div class="troop">
                        <span class="troop-icon">🛡️</span>
                        <span class="troop-count">x{{ selectedEntity.army.guardian }}</span>
                    </div>
                </div>
                
                <div class="recruit-grid" v-if="isMyEntity">
                    <button class="coc-btn purple-btn" @click="recruit('scout')">Train Scout</button>
                    <button class="coc-btn purple-btn" @click="recruit('soldier')">Train Soldier</button>
                    <button class="coc-btn purple-btn" @click="recruit('guardian')">Train Guardian</button>
                </div>
            </div>

            <!-- Hero Tab -->
            <div v-if="activeTab === 'hero' && isMyEntity" class="tab-body">
                <div v-if="selectedEntity.heroLevel === 0" class="empty-state">
                    <h3>Summon Champion</h3>
                    <p>Unlock a powerful Hero to lead your armies.</p>
                    <button class="coc-btn gold-btn" @click="summonHeroBtn" style="margin-top: 10px;">Summon Hero (5000F, 1000G)</button>
                </div>
                <div v-else class="center-content">
                    <div style="font-size: 3rem; margin-bottom: 10px;">👑</div>
                    <h3>Champion (Level {{ selectedEntity.heroLevel }})</h3>
                    <p style="color: #ccc; margin-bottom: 15px;">Power Bonus: +{{ 100 + (selectedEntity.heroLevel * 50) }}</p>
                    <button class="coc-btn green-btn" @click="upgradeHeroBtn">Upgrade ({{ 2000 * selectedEntity.heroLevel }}F, {{ 1000 * selectedEntity.heroLevel }}G)</button>
                </div>
            </div>

            <!-- Enemy Actions -->
            <div v-if="!isMyEntity" class="tab-body text-center enemy-actions">
                <button class="coc-btn red-btn" @click="attackTarget">Attack!</button>
                <p class="hint">Or right click the village on the map.</p>
            </div>
        </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, reactive } from 'vue'
import { solanaService, type ECSComponent, type Buildings, type ArmyUnits } from '../services/SolanaService'

const boardContainer = ref<HTMLElement | null>(null)
const gameCanvas = ref<HTMLCanvasElement | null>(null)

// Load troop sprites
const scoutImg = new Image(); scoutImg.src = '/assets/troops/scout.png';
const soldierImg = new Image(); soldierImg.src = '/assets/troops/soldier.png';
const guardianImg = new Image(); guardianImg.src = '/assets/troops/guardian.png';

// Camera state for pan/zoom
const camera = reactive({ x: 500, y: 500, zoom: 1 })
const isDragging = ref(false)
const dragStart = reactive({ x: 0, y: 0 })
const mapSize = 2000;
const tileSize = 100;

const onChainEntities = ref<ECSComponent[]>([])
const selectedEntity = ref<ECSComponent | null>(null)
const selectedTile = ref<{x: number, y: number} | null>(null)
const claimedTiles = ref<Record<string, string>>({})
const isTransacting = ref(false)
const activeTab = ref('army')
const animatedEntities = ref<Record<string, {x: number, y: number}>>({})

// NEW STATE
const leaderboard = ref<{ pubkey: string, name: string, score: number }[]>([])
const floatingTexts = ref<{id: number, x: number, y: number, text: string, color: string, life: number, maxLife: number}[]>([])
let textIdCounter = 0
let lastBattleTimestamp = Date.now()
let tickCounter = 0

let ctx: CanvasRenderingContext2D | null = null
let animationFrame: number
let tickInterval: number

const myKingdom = computed(() => {
    return onChainEntities.value.find(e => e.pubkey === solanaService.activePlayerPubkey) || null;
})

const selectedTileTerrain = computed(() => {
    if (!selectedTile.value) return null;
    return getTerrainType(selectedTile.value.x, selectedTile.value.y);
});

const isSelectedTileMine = computed(() => {
    if (!selectedTile.value || !myKingdom.value) return false;
    return claimedTiles.value[`${selectedTile.value.x},${selectedTile.value.y}`] === myKingdom.value.pubkey;
});

const selectedTileBuilding = computed(() => {
    if (!selectedTile.value || !myKingdom.value) return null;
    return myKingdom.value.placedBuildings[`${selectedTile.value.x},${selectedTile.value.y}`] || null;
});

const isMyEntity = computed(() => {
    return selectedEntity.value?.pubkey === solanaService.activePlayerPubkey;
})

const fetchData = async () => {
  const freshEntities = await solanaService.fetchAllEntities()
  claimedTiles.value = await solanaService.getClaimedTiles()
  leaderboard.value = await solanaService.getLeaderboard()
  
  // Battle Animations
  const battles = await solanaService.getBattleReports()
  for (const b of battles) {
      if (b.timestamp > lastBattleTimestamp) {
          const totalLost = b.attackerLost.scout + b.attackerLost.soldier + b.attackerLost.guardian + b.defenderLost.scout + b.defenderLost.soldier + b.defenderLost.guardian;
          floatingTexts.value.push({
              id: textIdCounter++,
              x: b.x * tileSize + tileSize/2,
              y: b.y * tileSize + 20,
              text: `💥 -${totalLost} Troops!`,
              color: '#e74c3c',
              life: 60,
              maxLife: 60
          })
      }
  }
  if (battles.length > 0) {
      lastBattleTimestamp = battles[battles.length - 1].timestamp;
  }

  // Resource Popups (every 1 second = 2 ticks of 500ms)
  tickCounter++;
  if (tickCounter % 2 === 0) {
      for (const ent of freshEntities) {
          const resGain = 1 + ent.buildings.farm * 2;
          floatingTexts.value.push({
              id: textIdCounter++,
              x: ent.cityX * tileSize + Math.random() * tileSize,
              y: ent.cityY * tileSize + Math.random() * 20,
              text: `+${resGain} 🍎`,
              color: '#2ecc71',
              life: 40,
              maxLife: 40
          })
      }
  }
  
  for (const ent of freshEntities) {
    if (!animatedEntities.value[ent.pubkey]) {
      animatedEntities.value[ent.pubkey] = { x: ent.x, y: ent.y }
    }
  }
  onChainEntities.value = freshEntities
  if (selectedEntity.value) {
    selectedEntity.value = onChainEntities.value.find(e => e.pubkey === selectedEntity.value?.pubkey) || null
  }
}

const spawnArmyAtCenter = async () => {
  if (!gameCanvas.value) return;
  
  // Find the AI kingdom so we can spawn near them
  const ai = onChainEntities.value.find(e => !e.isPlayer);
  const baseX = ai ? ai.cityX : 50;
  const baseY = ai ? ai.cityY : 50;
  
  // Pick a random location near the AI (between 2 and 4 tiles away)
  let mapX, mapY;
  do {
      const offsetX = Math.floor(Math.random() * 3); 
      const offsetY = Math.floor(Math.random() * 3);
      
      // Add a minimum distance of 2 tiles, randomly positive or negative
      const dirX = Math.random() > 0.5 ? 1 : -1;
      const dirY = Math.random() > 0.5 ? 1 : -1;
      
      mapX = baseX + (dirX * (offsetX + 2)); 
      mapY = baseY + (dirY * (offsetY + 2));
      
      // Keep within bounds
      mapX = Math.max(2, Math.min(98, mapX));
      mapY = Math.max(2, Math.min(98, mapY));
  } while (claimedTiles.value[`${mapX},${mapY}`]);
  
  isTransacting.value = true;
  await solanaService.spawnArmy(mapX, mapY);
  await solanaService.claimTerritory(solanaService.activePlayerPubkey, mapX, mapY);
  isTransacting.value = false;
  
  await fetchData();
  recenter();
}

const claimTile = async () => {
    if (selectedTile.value && myKingdom.value) {
        const owner = claimedTiles.value[`${selectedTile.value.x},${selectedTile.value.y}`];
        if (owner) {
            alert("This territory is already claimed!");
            return;
        }
        
        isTransacting.value = true;
        const success = await solanaService.claimTerritory(solanaService.activePlayerPubkey, selectedTile.value.x, selectedTile.value.y);
        isTransacting.value = false;
        
        if (success) {
            await fetchData();
        } else {
            alert("Not enough Gold (50) to claim this territory!");
        }
    }
}

const clearObstacleBtn = async () => {
    if (selectedTile.value && myKingdom.value && selectedTileTerrain.value) {
        isTransacting.value = true;
        const success = await solanaService.clearObstacle(myKingdom.value.pubkey, selectedTile.value.x, selectedTile.value.y, selectedTileTerrain.value);
        isTransacting.value = false;
        
        if (success) {
            clearedTilesUI.value.add(`${selectedTile.value.x},${selectedTile.value.y}`);
            alert(`Cleared ${selectedTileTerrain.value}! You gained massive resources.`);
            await fetchData();
            selectedTile.value = null;
        } else {
            alert("Not enough Gold to clear this obstacle! You need 10 Gold.");
        }
    }
}

const clearedTilesUI = ref<Set<string>>(new Set());

// Pseudo-random terrain generator
const getTerrainType = (x: number, y: number) => {
    if (clearedTilesUI.value.has(`${x},${y}`)) return 'grass';
    
    let avgHash = 0;
    let count = 0;
    for(let dx = -1; dx <= 1; dx++) {
        for(let dy = -1; dy <= 1; dy++) {
            let h = Math.sin((x+dx) * 12.9898 + (y+dy) * 78.233) * 43758.5453;
            avgHash += h - Math.floor(h);
            count++;
        }
    }
    avgHash /= count;
    
    if (avgHash < 0.25) return 'water';
    if (avgHash > 0.80) return 'mountain';
    if (avgHash > 0.65) return 'forest';
    return 'grass';
}

const buildBuilding = async (buildingType: keyof Buildings) => {
    if (selectedTile.value && myKingdom.value) {
        isTransacting.value = true;
        const success = await solanaService.placeBuilding(myKingdom.value.pubkey, selectedTile.value.x, selectedTile.value.y, buildingType);
        isTransacting.value = false;
        if (success) {
            await fetchData();
        } else {
            alert("Not enough Wood (100) or Stone (50)!");
        }
    }
}

const upgradePlacedBuilding = async () => {
    if (selectedTile.value && myKingdom.value) {
        isTransacting.value = true;
        const success = await solanaService.upgradeBuildingAt(myKingdom.value.pubkey, selectedTile.value.x, selectedTile.value.y);
        isTransacting.value = false;
        if (success) {
            await fetchData();
        } else {
            alert("Not enough Wood/Stone to upgrade this building!");
        }
    }
}

const recruit = async (unit: keyof ArmyUnits) => {
    if (selectedEntity.value) {
        if (selectedEntity.value.buildings.barracks < 1) {
            alert("You need to upgrade your Barracks first!");
            return;
        }
        isTransacting.value = true;
        const success = await solanaService.recruitUnit(selectedEntity.value.pubkey, unit);
        isTransacting.value = false;
        if (success) {
            await fetchData();
        } else {
            alert("Not enough Food/Gold to recruit this unit!");
        }
    }
}

const summonHeroBtn = async () => {
    if (selectedEntity.value) {
        isTransacting.value = true;
        const success = await solanaService.summonHero(selectedEntity.value.pubkey);
        isTransacting.value = false;
        if (success) {
            await fetchData();
        } else {
            alert("Not enough Food (5000) or Gold (1000)!");
        }
    }
}

const upgradeHeroBtn = async () => {
    if (selectedEntity.value) {
        isTransacting.value = true;
        const success = await solanaService.upgradeHero(selectedEntity.value.pubkey);
        isTransacting.value = false;
        if (success) {
            await fetchData();
        } else {
            alert("Not enough Food or Gold to upgrade Hero!");
        }
    }
}

const attackTarget = async () => {
    if (!myKingdom.value) {
        alert("You need to click 'Find Match' to spawn your kingdom before you can attack!");
        return;
    }
    if (selectedEntity.value) {
        isTransacting.value = true;
        await solanaService.marchEntity(myKingdom.value.pubkey, selectedEntity.value.x, selectedEntity.value.y);
        isTransacting.value = false;
        await fetchData();
        selectedEntity.value = null; // Close drawer after attack
    }
}

const resize = () => {
  if (!gameCanvas.value || !boardContainer.value) return
  gameCanvas.value.width = boardContainer.value.clientWidth
  gameCanvas.value.height = boardContainer.value.clientHeight
}

const getTileFromScreen = (clientX: number, clientY: number) => {
  if (!gameCanvas.value) return { x: 0, y: 0 };
  const rect = gameCanvas.value.getBoundingClientRect();
  const px = clientX - rect.left - camera.x;
  const py = clientY - rect.top - camera.y;
  return {
    x: Math.floor(px / (tileSize * camera.zoom)),
    y: Math.floor(py / (tileSize * camera.zoom))
  };
}

const onMouseDown = (e: MouseEvent) => {
  if (e.button !== 0) return;
  const tile = getTileFromScreen(e.clientX, e.clientY);
  selectedTile.value = tile;
  
  const clickedEntity = onChainEntities.value.find(ent => 
      (Math.floor(ent.x) === tile.x && Math.floor(ent.y) === tile.y) || 
      (ent.cityX === tile.x && ent.cityY === tile.y)
  );
  
  if (clickedEntity) {
    selectedEntity.value = clickedEntity;
    activeTab.value = 'army';
  } else {
    selectedEntity.value = null;
    isDragging.value = true;
    dragStart.x = e.clientX - camera.x;
    dragStart.y = e.clientY - camera.y;
  }
}

const onContextMenu = async (e: MouseEvent) => {
  e.preventDefault();
  const tile = getTileFromScreen(e.clientX, e.clientY);

  if (!myKingdom.value) {
    alert("You need to click 'Find Match' to spawn your kingdom before you can march!");
    return;
  }

  // March army to ANY tile clicked
  await solanaService.marchEntity(myKingdom.value.pubkey, tile.x, tile.y);
  await fetchData();
}

const onMouseMove = (e: MouseEvent) => {
  if (!isDragging.value) return
  camera.x = e.clientX - dragStart.x
  camera.y = e.clientY - dragStart.y
}

const onMouseUp = (e: MouseEvent) => {
  if (e.button === 0) isDragging.value = false
}

const onWheel = (e: WheelEvent) => {
  e.preventDefault()
  const zoomFactor = 1 - e.deltaY * 0.001
  camera.zoom = Math.max(0.3, Math.min(camera.zoom * zoomFactor, 3))
}

const recenter = () => {
  if (!gameCanvas.value) return;
  
  let target = onChainEntities.value.find(e => e.pubkey === solanaService.activePlayerPubkey);
  if (!target) {
    target = onChainEntities.value.find(e => !e.isPlayer);
  }
  
  if (target) {
    const screenCenterX = gameCanvas.value.width / 2;
    const screenCenterY = gameCanvas.value.height / 2;
    
    camera.x = screenCenterX - (target.cityX * tileSize * camera.zoom);
    camera.y = screenCenterY - (target.cityY * tileSize * camera.zoom);
  }
}

const focusOnPlayer = (pubkey: string) => {
    const entity = onChainEntities.value.find(e => e.pubkey === pubkey);
    if (entity && gameCanvas.value) {
        const screenCenterX = gameCanvas.value.width / 2;
        const screenCenterY = gameCanvas.value.height / 2;
        camera.x = screenCenterX - (entity.cityX * tileSize * camera.zoom);
        camera.y = screenCenterY - (entity.cityY * tileSize * camera.zoom);
    }
}

const draw = () => {
  if (!gameCanvas.value || !ctx) return
  const width = gameCanvas.value.width
  const height = gameCanvas.value.height
  
  // CoC Grass background
  ctx.fillStyle = '#65c225';
  ctx.fillRect(0, 0, width, height)
  
  ctx.save()
  ctx.translate(camera.x, camera.y)
  ctx.scale(camera.zoom, camera.zoom)
  
  // Camera Culling
  const startX = Math.max(0, Math.floor(-camera.x / (tileSize * camera.zoom)));
  const startY = Math.max(0, Math.floor(-camera.y / (tileSize * camera.zoom)));
  const endX = Math.min(mapSize, startX + Math.ceil(width / (tileSize * camera.zoom)) + 1);
  const endY = Math.min(mapSize, startY + Math.ceil(height / (tileSize * camera.zoom)) + 1);
  
  for (let x = startX; x < endX; x++) {
    for (let y = startY; y < endY; y++) {
      const px = x * tileSize;
      const py = y * tileSize;

      const terrain = getTerrainType(x, y);
      // Base terrain color
      if (terrain === 'water') {
          ctx.fillStyle = '#2980b9'; // Deep water blue
      } else if (terrain === 'mountain') {
          ctx.fillStyle = '#7f8c8d'; // Grey rocks
      } else if (terrain === 'forest') {
          ctx.fillStyle = '#27ae60'; // Dark green forest
      } else {
          const isEven = (x + y) % 2 === 0;
          ctx.fillStyle = isEven ? '#6cd328' : '#5fb522'; // Default Grass
      }
      ctx.fillRect(px, py, tileSize, tileSize);

      // Terrain decorations
      if (terrain === 'water') {
          ctx.fillStyle = 'rgba(255,255,255,0.2)';
          ctx.fillRect(px + tileSize * 0.2, py + tileSize * 0.4, tileSize * 0.5, 4);
          ctx.fillRect(px + tileSize * 0.4, py + tileSize * 0.7, tileSize * 0.4, 4);
      } else if (terrain === 'mountain') {
          ctx.font = `${tileSize * 0.4}px Arial`;
          ctx.fillText('⛰️', px + tileSize * 0.2, py + tileSize * 0.6);
      } else if (terrain === 'forest') {
          ctx.font = `${tileSize * 0.5}px Arial`;
          ctx.fillText('🌲', px + tileSize * 0.1, py + tileSize * 0.6);
          ctx.fillText('🌳', px + tileSize * 0.4, py + tileSize * 0.8);
      }
      
      // Draw claimed territories (Visual Fortification)
      const tileOwner = claimedTiles.value[`${x},${y}`];
      if (tileOwner) {
          const isMine = tileOwner === solanaService.activePlayerPubkey;
          
          // Base foundation (cultivated grass/dirt)
          ctx.fillStyle = isMine ? 'rgba(143, 217, 78, 0.4)' : 'rgba(231, 76, 60, 0.3)';
          ctx.fillRect(px, py, tileSize, tileSize);

          // Draw a wooden fence around the edge
          ctx.strokeStyle = '#8B4513'; // SaddleBrown
          ctx.lineWidth = 6;
          ctx.strokeRect(px + 3, py + 3, tileSize - 6, tileSize - 6);

          // Draw corner posts for the fence
          ctx.fillStyle = '#5C4033'; // Darker brown
          const postSize = 12;
          ctx.fillRect(px, py, postSize, postSize);
          ctx.fillRect(px + tileSize - postSize, py, postSize, postSize);
          ctx.fillRect(px, py + tileSize - postSize, postSize, postSize);
          ctx.fillRect(px + tileSize - postSize, py + tileSize - postSize, postSize, postSize);
          
          // Draw a small flag in the corner
          ctx.font = `${tileSize * 0.25}px Arial`;
          ctx.fillStyle = '#fff';
          ctx.fillText(isMine ? '🟦' : '🟥', px + 20, py + 20);

          // Draw Placed Building if it exists on this tile
          const ownerEntity = onChainEntities.value.find(e => e.pubkey === tileOwner);
          if (ownerEntity && ownerEntity.placedBuildings[`${x},${y}`]) {
              const building = ownerEntity.placedBuildings[`${x},${y}`];
              
              if (building.type === 'archeryTower') {
                  ctx.font = `${tileSize * 0.6}px Arial`;
                  ctx.fillText('🗼', px + 15, py + 50);
              } else if (building.type === 'cannon') {
                  ctx.font = `${tileSize * 0.6}px Arial`;
                  ctx.fillText('💣', px + 15, py + 50);
              } else if (building.type === 'farm') {
                  ctx.font = `${tileSize * 0.6}px Arial`;
                  ctx.fillText('🌾', px + 15, py + 50);
              } else if (building.type === 'lumberMill') {
                  ctx.font = `${tileSize * 0.6}px Arial`;
                  ctx.fillText('🪓', px + 15, py + 50);
              } else if (building.type === 'quarry') {
                  ctx.font = `${tileSize * 0.6}px Arial`;
                  ctx.fillText('⛏️', px + 15, py + 50);
              } else if (building.type === 'barracks') {
                  ctx.font = `${tileSize * 0.6}px Arial`;
                  ctx.fillText('🎪', px + 15, py + 50);
              } else if (building.type === 'wall') {
                  ctx.strokeStyle = '#95a5a6'; // Stone grey for upgraded walls
                  ctx.lineWidth = 10;
                  ctx.strokeRect(px + 10, py + 10, tileSize - 20, tileSize - 20);
              }
              // TownHall is drawn separately below in the main entity loop
          }
      }

      // Selected Tile Highlight
      if (selectedTile.value?.x === x && selectedTile.value?.y === y) {
          ctx.strokeStyle = '#fff';
          ctx.lineWidth = 3;
          ctx.strokeRect(px, py, tileSize, tileSize);
          ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
          ctx.fillRect(px, py, tileSize, tileSize);
      }
    }
  }

  for (const entity of onChainEntities.value) {
    try {
        // --- DRAW CITY (Static) ---
        const cityPx = entity.cityX * tileSize;
        const cityPy = entity.cityY * tileSize;

        // Selection Glow around city
        if (selectedEntity.value?.pubkey === entity.pubkey) {
            ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
            ctx.beginPath();
            ctx.ellipse(cityPx + tileSize/2, cityPy + tileSize - 20, tileSize/2, tileSize/4, 0, 0, Math.PI*2);
            ctx.fill();
        }

        // City Shadow
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.beginPath();
        if (ctx.ellipse) {
            ctx.ellipse(cityPx + tileSize/2, cityPy + tileSize - 10, tileSize/3, tileSize/6, 0, 0, Math.PI*2);
        } else {
            ctx.arc(cityPx + tileSize/2, cityPy + tileSize - 10, tileSize/3, 0, Math.PI*2);
        }
        ctx.fill();

        // City Base (Fallback / Background)
        ctx.fillStyle = entity.isPlayer ? '#3498db' : '#e74c3c';
        ctx.fillRect(cityPx + 20, cityPy + 20, tileSize - 40, tileSize - 40);

        // City Icon
        ctx.font = `${tileSize * 0.4}px Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#fff';
        const icon = entity.isPlayer ? '🏡' : '🛖';
        ctx.fillText(icon, cityPx + tileSize/2, cityPy + tileSize/2);
        
        // City Health / Level
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(cityPx + 10, cityPy + 5, tileSize - 20, 16);
        ctx.fillStyle = entity.isPlayer ? '#2ecc71' : '#e74c3c';
        ctx.fillRect(cityPx + 12, cityPy + 7, tileSize - 24, 12);
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 12px Arial';
        const level = entity.buildings ? entity.buildings.townHall : 1;
        ctx.fillText(`Lvl ${level}`, cityPx + tileSize/2, cityPy + 13);

        // Player Name over city
        ctx.font = 'bold 16px "Lilita One", cursive, Arial';
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 3;
        let displayName = entity.allianceId ? `[${entity.allianceId}] ${entity.ownerName}` : entity.ownerName;
        if (entity.heroLevel > 0) displayName = `👑 ` + displayName;
        
        ctx.strokeText(displayName, cityPx + tileSize/2, cityPy - 10);
        ctx.fillStyle = '#fff';
        ctx.fillText(displayName, cityPx + tileSize/2, cityPy - 10);
        
        // --- DRAW ARMY (Moving) ---
        const animState = animatedEntities.value[entity.pubkey];
        if (animState) {
            animState.x += (entity.x - animState.x) * 0.1;
            animState.y += (entity.y - animState.y) * 0.1;
        }
        const currX = animState ? animState.x : entity.x;
        const currY = animState ? animState.y : entity.y;
        
        if (isNaN(currX) || isNaN(currY)) continue;

        const isAtHome = !entity.isMarching && Math.abs(currX - entity.cityX) < 0.1 && Math.abs(currY - entity.cityY) < 0.1;

        let armyPx = currX * tileSize;
        let armyPy = currY * tileSize;

        const troopSprites: { img: HTMLImageElement, fallback: string }[] = [];
        
        if (isAtHome) {
            // Dedicated Army Camp (placed 1 tile to the right of the city)
            const campX = entity.cityX + 1;
            const campY = entity.cityY;
            const campCenterPx = campX * tileSize + tileSize/2;
            const campCenterPy = campY * tileSize + tileSize/2;

            // Draw a dirt patch for the army camp
            ctx.fillStyle = 'rgba(139, 69, 19, 0.3)';
            ctx.beginPath();
            if (ctx.roundRect) {
                ctx.roundRect(campX * tileSize + 5, campY * tileSize + 5, tileSize - 10, tileSize - 10, 10);
            } else {
                ctx.rect(campX * tileSize + 5, campY * tileSize + 5, tileSize - 10, tileSize - 10);
            }
            ctx.fill();
            
            // Draw a campfire in the center
            ctx.font = `${tileSize * 0.4}px Arial`;
            ctx.fillText('🏕️', campCenterPx - tileSize * 0.2, campCenterPy + tileSize * 0.1);

            // Cap visual limit to avoid clutter
            for (let i = 0; i < Math.min(10, entity.army.scout); i++) troopSprites.push({img: scoutImg, fallback: '🏹'});
            for (let i = 0; i < Math.min(10, entity.army.soldier); i++) troopSprites.push({img: soldierImg, fallback: '🤺'});
            for (let i = 0; i < Math.min(5, entity.army.guardian); i++) troopSprites.push({img: guardianImg, fallback: '💂'});
            
            troopSprites.forEach((troop, index) => {
                if (!ctx) return;
                // Scatter them inside the army camp tile
                const angle = index * 137.5; 
                const radius = 15 + (index % 5) * 8; // Tighter radius to fit in the camp
                const iconX = campCenterPx + Math.cos(angle * Math.PI / 180) * radius - 15;
                const iconY = campCenterPy + Math.sin(angle * Math.PI / 180) * radius - 15;
                
                // Shadow
                ctx.fillStyle = 'rgba(0,0,0,0.5)';
                ctx.beginPath();
                ctx.ellipse ? ctx.ellipse(iconX + 15, iconY + 30, 10, 5, 0, 0, Math.PI*2) : ctx.arc(iconX + 15, iconY + 30, 10, 0, Math.PI*2);
                ctx.fill();

                // Draw Sprite
                if (troop.img.complete && troop.img.naturalWidth > 0) {
                    ctx.drawImage(troop.img, iconX, iconY, 30, 30);
                } else {
                    ctx.font = `${tileSize * 0.2}px Arial`;
                    ctx.fillStyle = '#fff';
                    ctx.fillText(troop.fallback, iconX + 10, iconY + 15);
                }
            });
            
        } else {
            // Marching tightly packed
            if (entity.army.scout > 0) troopSprites.push({img: scoutImg, fallback: '🏹'});
            if (entity.army.soldier > 0) troopSprites.push({img: soldierImg, fallback: '🤺'});
            if (entity.army.guardian > 0) troopSprites.push({img: guardianImg, fallback: '💂'});
            
            if (troopSprites.length > 0) {
                const spacing = 35;
                const startX = armyPx + tileSize/2 - ((troopSprites.length - 1) * spacing) / 2;
                
                troopSprites.forEach((troop, index) => {
                    if (!ctx) return;
                    const iconX = startX + index * spacing - 20;
                    
                    ctx.fillStyle = 'rgba(0,0,0,0.4)';
                    ctx.beginPath();
                    ctx.ellipse ? ctx.ellipse(iconX + 20, armyPy + tileSize/2 + 25, 15, 7, 0, 0, Math.PI*2) : ctx.arc(iconX + 20, armyPy + tileSize/2 + 25, 15, 0, Math.PI*2);
                    ctx.fill();

                    if (troop.img.complete && troop.img.naturalWidth > 0) {
                        ctx.drawImage(troop.img, iconX, armyPy + tileSize/2 - 10, 40, 40);
                    } else {
                        ctx.font = `${tileSize * 0.25}px Arial`;
                        ctx.fillStyle = '#fff';
                        ctx.fillText(troop.fallback, iconX + 15, armyPy + tileSize/2 + 10);
                    }
                });
            }
        }

        // Render Combat Effects
        if (entity.inCombatTicks && entity.inCombatTicks > 0) {
            const time = Date.now() / 150; // Speed of animation
            const cx = armyPx + tileSize/2;
            const cy = armyPy + tileSize/2;
            
            if (entity.combatTargetTile) {
                // SIEGE: Smashing a building
                ctx.fillStyle = 'rgba(231, 76, 60, 0.4)'; // Reddish sparks
                ctx.beginPath();
                ctx.arc(cx, cy, tileSize * 0.7, 0, Math.PI*2);
                ctx.fill();

                // Flying debris
                const weapons = ['💥', '🧱', '🔥', '🪓', '✨'];
                for(let w = 0; w < 5; w++) {
                    const angle = (time + w) * (Math.PI * 2 / 5);
                    const radius = 15 + Math.abs(Math.sin(time * 3 + w)) * 40;
                    
                    const wx = cx + Math.cos(angle) * radius;
                    const wy = cy + Math.sin(angle) * radius;
                    
                    ctx.font = `${tileSize * 0.3}px Arial`;
                    ctx.fillText(weapons[w], wx, wy);
                }
            } else {
                // NORMAL: Town Hall clash
                // Draw a dust cloud
                ctx.fillStyle = 'rgba(236, 240, 241, 0.7)';
                ctx.beginPath();
                ctx.arc(cx, cy, tileSize * 0.6, 0, Math.PI*2);
                ctx.fill();

                // Render flying weapons (Swords, Arrows, Stones, Shields)
                const weapons = ['🏹', '🤺', '🛡️', '🪨', '💥'];
                for(let w = 0; w < 5; w++) {
                    const angle = (time + w) * (Math.PI * 2 / 5);
                    const radius = 10 + Math.abs(Math.sin(time * 2 + w)) * 30; // Dynamic pulsing radius
                    
                    const wx = cx + Math.cos(angle) * radius;
                const wy = cy + Math.sin(angle) * radius;
                
                ctx.font = `${tileSize * 0.4}px Arial`;
                ctx.fillText(weapons[w], wx - 10, wy + 10);
                }
            }
        }

            // Draw target line if marching
            if (entity.isMarching && entity.targetX !== undefined && entity.targetY !== undefined) {
                ctx.strokeStyle = entity.isPlayer ? 'rgba(52, 152, 219, 0.5)' : 'rgba(231, 76, 60, 0.5)';
                ctx.lineWidth = 4;
                ctx.setLineDash([10, 10]);
                ctx.beginPath();
                ctx.moveTo(armyPx + tileSize/2, armyPy + tileSize/2);
                ctx.lineTo(entity.targetX * tileSize + tileSize/2, entity.targetY * tileSize + tileSize/2);
                ctx.stroke();
                ctx.setLineDash([]);
            }
    } catch (e) {
        console.error("Error drawing entity:", e);
    }
  }
  
  // --- DRAW FLOATING TEXTS ---
  for (let i = floatingTexts.value.length - 1; i >= 0; i--) {
      const ft = floatingTexts.value[i];
      ft.life--;
      ft.y -= 1; // Move up
      
      const alpha = ft.life / ft.maxLife;
      ctx.globalAlpha = alpha;
      ctx.font = 'bold 20px "Lilita One", cursive, Arial';
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 3;
      ctx.strokeText(ft.text, ft.x, ft.y);
      ctx.fillStyle = ft.color;
      ctx.fillText(ft.text, ft.x, ft.y);
      ctx.globalAlpha = 1.0;
      
      if (ft.life <= 0) {
          floatingTexts.value.splice(i, 1);
      }
  }
  
  ctx.restore()
  animationFrame = requestAnimationFrame(draw)
}

onMounted(async () => {
  await fetchData() 
  tickInterval = window.setInterval(fetchData, 500);

  if (gameCanvas.value) {
    ctx = gameCanvas.value.getContext('2d')
    window.addEventListener('resize', resize)
    resize()
    recenter()
    draw()
  }
})

onUnmounted(() => {
  window.removeEventListener('resize', resize)
  cancelAnimationFrame(animationFrame)
  window.clearInterval(tickInterval)
})
</script>

<style scoped>
.game-container {
  display: flex;
  width: 100%;
  height: 100%;
  overflow: hidden;
  position: relative;
  font-family: 'Lilita One', cursive;
}

.game-board {
  position: relative;
  width: 100%;
  height: 100%;
  background: #65c225; 
}

canvas {
  display: block;
  width: 100%;
  height: 100%;
  cursor: grab;
}
canvas:active { cursor: grabbing; }

/* HUD Overlays */
.hud {
  position: absolute;
  pointer-events: none;
  z-index: 10;
  display: flex;
}

.top-hud {
  top: 15px;
  left: 15px;
  right: 15px;
  justify-content: space-between;
  align-items: flex-start;
}

/* Player Level Badge (CoC Style) */
.player-badge {
    pointer-events: auto;
    display: flex;
    align-items: center;
    background: rgba(0, 0, 0, 0.4);
    border-radius: 30px;
    padding-right: 20px;
}
.level-star {
    width: 60px;
    height: 60px;
    background: #3498db; /* Blue star bg */
    border: 3px solid #f1c40f;
    border-radius: 50%;
    display: flex;
    justify-content: center;
    align-items: center;
    margin-right: -10px;
    position: relative;
    z-index: 2;
    box-shadow: 0 4px 8px rgba(0,0,0,0.3);
}
.lvl-num {
    color: white;
    font-size: 1.8rem;
    text-shadow: 2px 2px 0 #000;
}
.name-score {
    padding-left: 15px;
}
.player-name {
    color: white;
    font-size: 1.2rem;
    text-shadow: 1px 1px 0 #000;
}
.trophy-bar {
    display: flex;
    align-items: center;
    color: #f1c40f;
    font-size: 1.1rem;
    text-shadow: 1px 1px 0 #000;
}

/* Leaderboard */
.leaderboard-panel {
    pointer-events: auto;
    margin-top: 15px;
    background: rgba(0, 0, 0, 0.6);
    border: 2px solid rgba(255,255,255,0.2);
    border-radius: 12px;
    padding: 10px;
    color: white;
    font-family: 'Lilita One', cursive;
    width: 220px;
}
.lb-header {
    font-size: 1.1rem;
    color: #f1c40f;
    border-bottom: 1px solid rgba(255,255,255,0.2);
    padding-bottom: 5px;
    margin-bottom: 8px;
    text-align: center;
}
.lb-row {
    display: flex;
    justify-content: space-between;
    font-size: 0.95rem;
    margin-bottom: 5px;
    padding: 3px 5px;
    border-radius: 4px;
}
.clickable-row:hover {
    background: rgba(255, 255, 255, 0.1);
    cursor: pointer;
}
.lb-rank { color: #bdc3c7; width: 25px; }
.lb-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-right: 10px; }
.lb-score { color: #2ecc71; font-weight: bold; }

/* Top Resource Bar (CoC Style) */
.top-resource-bar {
  display: flex;
  flex-direction: column;
  gap: 8px;
  pointer-events: auto;
}

.res-bar {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    background: rgba(0, 0, 0, 0.6);
    border: 2px solid rgba(255,255,255,0.2);
    border-radius: 20px;
    padding: 2px 10px 2px 20px;
    min-width: 140px;
    position: relative;
}
.res-val {
    color: white;
    font-size: 1.2rem;
    text-shadow: 1px 1px 0 #000;
    margin-right: 15px;
}
.res-icon {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    position: absolute;
    right: -5px;
    border: 2px solid #fff;
    box-shadow: 0 2px 5px rgba(0,0,0,0.5);
}
.elixir-icon { background: #d11e8e; } /* Purple */
.gold-icon { background: #f1c40f; } /* Yellow */
.gem-icon { background: #2ecc71; border-color: #27ae60;} /* Green Gem */

/* Bottom Right Actions */
.bottom-right-hud {
  bottom: 20px;
  right: 20px;
  flex-direction: column;
  gap: 10px;
}

/* CoC Buttons */
.coc-btn {
  pointer-events: auto;
  border: none;
  color: white;
  padding: 12px 24px;
  border-radius: 12px;
  cursor: pointer;
  font-family: 'Lilita One', cursive;
  font-size: 1.2rem;
  text-shadow: 1px 2px 0 rgba(0,0,0,0.4);
  box-shadow: inset 0 -4px 0 rgba(0,0,0,0.2), 0 4px 6px rgba(0,0,0,0.3);
  transition: transform 0.1s, box-shadow 0.1s;
}
.coc-btn:active {
    transform: translateY(4px);
    box-shadow: inset 0 0 0 rgba(0,0,0,0.2), 0 0 0 rgba(0,0,0,0.3);
}

.green-btn { background: #2ecc71; border: 2px solid #27ae60; }
.blue-btn { background: #3498db; border: 2px solid #2980b9; }
.purple-btn { background: #9b59b6; border: 2px solid #8e44ad; }
.red-btn { background: #e74c3c; border: 2px solid #c0392b; }
.small-btn { padding: 6px 12px; font-size: 1rem; box-shadow: inset 0 -3px 0 rgba(0,0,0,0.2); }

/* Bottom Drawer */
.bottom-drawer {
    position: absolute;
    bottom: -100%;
    left: 50%;
    transform: translateX(-50%);
    width: 90%;
    max-width: 800px;
    background: #e4d5b7; /* Paper/Wood background */
    border: 4px solid #8b5a2b;
    border-radius: 20px 20px 0 0;
    transition: bottom 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
    z-index: 100;
    box-shadow: 0 -10px 30px rgba(0,0,0,0.3);
    padding: 15px;
    pointer-events: auto;
    font-family: 'Roboto', sans-serif;
    color: #3e281b;
}

.drawer-open {
    bottom: 0;
}

.close-drawer {
    position: absolute;
    top: -20px;
    right: 10px;
    background: #e74c3c;
    border: 3px solid #c0392b;
    color: white;
    font-family: 'Lilita One', cursive;
    font-size: 1.5rem;
    width: 40px;
    height: 40px;
    border-radius: 50%;
    cursor: pointer;
    box-shadow: 0 4px 0 #a93226;
}
.close-drawer:active {
    transform: translateY(4px);
    box-shadow: none;
}

.drawer-title {
    font-family: 'Lilita One', cursive;
    margin: 0;
    font-size: 1.8rem;
    color: #4a2e15;
    text-shadow: 1px 1px 0 rgba(255,255,255,0.5);
}

.center-content {
    text-align: center;
    padding: 20px;
}

/* Tabs */
.coc-tabs {
    display: flex;
    border-bottom: 3px solid #8b5a2b;
    margin-bottom: 15px;
    margin-top: 10px;
}
.coc-tabs button {
    flex: 1;
    background: #d4c4a1;
    border: none;
    padding: 10px;
    font-family: 'Lilita One', cursive;
    font-size: 1.2rem;
    color: #6b4c2a;
    cursor: pointer;
    border-radius: 10px 10px 0 0;
}
.coc-tabs button.active {
    background: #8b5a2b;
    color: white;
}

/* Tab Bodies */
.tab-body {
    padding: 10px;
}

.army-status {
    display: flex;
    justify-content: center;
    gap: 20px;
    margin-bottom: 20px;
}
.troop {
    background: rgba(0,0,0,0.1);
    padding: 10px 20px;
    border-radius: 10px;
    font-weight: bold;
    font-size: 1.2rem;
}

.recruit-grid {
    display: flex;
    justify-content: space-around;
}

.upgrade-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 15px;
}

.transaction-overlay {
    position: absolute;
    top: 0; left: 0; right: 0; bottom: 0;
    background: rgba(0,0,0,0.6);
    z-index: 1000;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
}

.spinner {
    width: 50px;
    height: 50px;
    border: 5px solid rgba(255,255,255,0.3);
    border-radius: 50%;
    border-top-color: #3498db;
    animation: spin 1s ease-in-out infinite;
}

@keyframes spin {
    to { transform: rotate(360deg); }
}

.tx-text {
    margin-top: 15px;
    color: white;
    font-size: 1.2rem;
    font-weight: bold;
    text-shadow: 1px 1px 2px black;
}

.upg-card {
    background: rgba(255,255,255,0.4);
    border: 2px solid rgba(0,0,0,0.1);
    padding: 10px;
    border-radius: 10px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-weight: bold;
}
</style>
