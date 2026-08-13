import { PublicKey } from '@solana/web3.js';

export const PROGRAM_ID = new PublicKey('Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS');
export const RPC_URL = 'https://api.devnet.solana.com';

// ---------------------------------------------------------
// Core Game Models
// ---------------------------------------------------------
export interface Resources {
    food: number;
    wood: number;
    stone: number;
    gold: number;
}

export interface Buildings {
    townHall: number;
    farm: number;
    lumberMill: number;
    quarry: number;
    barracks: number;
    archeryTower: number;
    cannon: number;
    wall: number;
}

export interface ArmyUnits {
    scout: number;
    soldier: number;
    guardian: number;
}

export interface ECSComponent {
    pubkey: string;
    isPlayer: boolean;
    ownerName: string;
    
    // Fixed City Coordinates
    cityX: number;
    cityY: number;

    // Moving Army Coordinates
    x: number;
    y: number;
    
    // Kingdom Stats
    resources: Resources;
    buildings: Buildings; // Total level for quick stat lookups
    placedBuildings: Record<string, { type: keyof Buildings, level: number }>; // "x,y" -> building
    army: ArmyUnits;
    allianceId?: string;
    heroLevel: number;
    
    // Map / Interaction states
    targetX?: number;
    targetY?: number;
    isMarching: boolean;
    inCombatTicks?: number; // 0 = no, >0 = currently animating combat
    combatTargetTile?: { x: number, y: number, owner: string };
    hasReceivedBonus?: boolean;
    exploredTiles?: string[]; // Array of "x,y" coordinates
    targetPath?: {x: number, y: number}[]; // A* path to follow
    activeQueues?: { type: 'building' | 'troop', finishTime: number, x?: number, y?: number, unitType?: string, buildingType?: string }[];
}

export interface BattleReport {
    attackerId: string;
    defenderId: string;
    winnerId: string;
    attackerLost: ArmyUnits;
    defenderLost: ArmyUnits;
    territoryCaptured: boolean;
    timestamp: number;
    x: number;
    y: number;
}

export interface TradeOffer {
    id: string;
    fromId: string;
    toId: string;
    offerRes: keyof Resources;
    offerAmount: number;
    requestRes: keyof Resources;
    requestAmount: number;
    status: 'pending' | 'accepted' | 'rejected';
}

export interface Alliance {
    id: string;
    name: string;
    members: string[]; // pubkeys
}

// ---------------------------------------------------------
// Mock Game State Manager
// ---------------------------------------------------------
class SolanaService {
    private localEntities: ECSComponent[] = [];
    private gameTickInterval: number | null = null;
    public activePlayerPubkey: string = '';
    public battleReports: BattleReport[] = [];
    public trades: TradeOffer[] = [];
    public alliances: Alliance[] = [];
    public claimedTiles: Record<string, string> = {}; // "x,y" -> pubkey

    // Phase 5: Season & AI
    public seasonEndTime: number = 0;
    public seasonDurationMs = 30 * 60 * 1000; // 30 minutes for testing mode

    constructor() {
        if (!this.loadState()) {
            this.initializeMockData();
        }
        this.startGameLoop();
    }

    private saveState() {
        const state = {
            localEntities: this.localEntities,
            activePlayerPubkey: this.activePlayerPubkey,
            battleReports: this.battleReports,
            trades: this.trades,
            alliances: this.alliances,
            claimedTiles: this.claimedTiles,
            seasonEndTime: this.seasonEndTime
        };
        localStorage.setItem('solar_kingdom_state', JSON.stringify(state));
    }

    private loadState(): boolean {
        const saved = localStorage.getItem('solar_kingdom_state');
        if (saved) {
            try {
                const state = JSON.parse(saved);
                this.localEntities = state.localEntities || [];
                this.activePlayerPubkey = state.activePlayerPubkey || '';
                this.battleReports = state.battleReports || [];
                this.trades = state.trades || [];
                this.alliances = state.alliances || [];
                this.claimedTiles = state.claimedTiles || {};
                this.seasonEndTime = state.seasonEndTime || (Date.now() + this.seasonDurationMs);
                
                // FORCE ADD BARRACKS FOR EXISTING USERS & REVIVE DEAD PLAYERS
                for (const entity of this.localEntities) {
                    if (entity.isPlayer) {
                        // Revive if dead or town hall is missing
                        if (entity.cityX === -100 || !entity.placedBuildings[`${entity.cityX},${entity.cityY}`]) {
                            // Find a safe spot
                            entity.cityX = 12;
                            entity.cityY = 12;
                            entity.x = 12;
                            entity.y = 12;
                            entity.buildings.townHall = 1;
                            entity.army = { scout: 5, soldier: 20, guardian: 5 };
                            entity.resources = { food: 5000, wood: 5000, stone: 5000, gold: 5000 };
                            entity.placedBuildings[`12,12`] = { type: 'townHall', level: 1 };
                            
                            // Re-claim tiles
                            this.claimedTiles[`12,12`] = entity.pubkey;
                            this.claimedTiles[`11,12`] = entity.pubkey;
                            this.claimedTiles[`13,12`] = entity.pubkey;
                            this.claimedTiles[`12,11`] = entity.pubkey;
                            this.claimedTiles[`12,13`] = entity.pubkey;
                        }

                        if (entity.buildings.barracks === 0) {
                            entity.buildings.barracks = 1;
                            entity.placedBuildings[`${entity.cityX + 1},${entity.cityY}`] = { type: 'barracks', level: 1 };
                            this.claimedTiles[`${entity.cityX + 1},${entity.cityY}`] = entity.pubkey;
                        }
                    }
                }

                return true;
            } catch (e) {
                console.error("Failed to load saved state", e);
                return false;
            }
        }
        return false;
    }

    private getTerrainType(x: number, y: number): string {
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

    private findPath(startX: number, startY: number, targetX: number, targetY: number): {x: number, y: number}[] {
        // A* Pathfinding (Simplified)
        startX = Math.round(startX); startY = Math.round(startY);
        targetX = Math.round(targetX); targetY = Math.round(targetY);
        
        class Node {
            constructor(public x: number, public y: number, public g: number, public h: number, public parent: Node | null) {}
            get f() { return this.g + this.h; }
        }
        
        const openList: Node[] = [new Node(startX, startY, 0, Math.abs(startX - targetX) + Math.abs(startY - targetY), null)];
        const closedSet = new Set<string>();
        
        let iters = 0;
        while (openList.length > 0 && iters < 500) {
            iters++;
            openList.sort((a, b) => a.f - b.f);
            const current = openList.shift()!;
            
            if (current.x === targetX && current.y === targetY) {
                const path: {x: number, y: number}[] = [];
                let curr: Node | null = current;
                while (curr !== null) {
                    path.unshift({x: curr.x, y: curr.y});
                    curr = curr.parent;
                }
                return path;
            }
            
            closedSet.add(`${current.x},${current.y}`);
            
            const neighbors = [
                {x: current.x, y: current.y - 1},
                {x: current.x, y: current.y + 1},
                {x: current.x - 1, y: current.y},
                {x: current.x + 1, y: current.y},
            ];
            
            for (const n of neighbors) {
                if (closedSet.has(`${n.x},${n.y}`)) continue;
                
                // Allow walking onto the exact target tile regardless of terrain
                if (n.x !== targetX || n.y !== targetY) {
                    const terrain = this.getTerrainType(n.x, n.y);
                    if (terrain === 'water' || terrain === 'mountain') continue; // Unwalkable
                }
                
                const g = current.g + 1;
                const h = Math.abs(n.x - targetX) + Math.abs(n.y - targetY);
                const existingNode = openList.find(node => node.x === n.x && node.y === n.y);
                
                if (!existingNode || g < existingNode.g) {
                    if (existingNode) {
                        existingNode.g = g;
                        existingNode.parent = current;
                    } else {
                        openList.push(new Node(n.x, n.y, g, h, current));
                    }
                }
            }
        }
        // Fallback: straight line
        return [{x: targetX, y: targetY}];
    }

    private initializeMockData() {
        this.seasonEndTime = Date.now() + this.seasonDurationMs;
        // Mock initial state: The Enemy AI Kingdom
        const aiCityX = 15;
        const aiCityY = 12;
        this.claimedTiles[`${aiCityX},${aiCityY}`] = 'AI_Kingdom_777';
        this.claimedTiles[`${aiCityX-1},${aiCityY}`] = 'AI_Kingdom_777';
        this.claimedTiles[`${aiCityX+1},${aiCityY}`] = 'AI_Kingdom_777';
        this.claimedTiles[`${aiCityX},${aiCityY-1}`] = 'AI_Kingdom_777';
        this.claimedTiles[`${aiCityX},${aiCityY+1}`] = 'AI_Kingdom_777';

        this.localEntities.push({
            pubkey: 'AI_Kingdom_777',
            isPlayer: false,
            ownerName: 'Rival Kingdom (AI)',
            cityX: aiCityX,
            cityY: aiCityY,
            x: aiCityX,
            y: aiCityY,
            resources: { food: 10000, wood: 10000, stone: 10000, gold: 10000 },
            buildings: { townHall: 2, farm: 2, lumberMill: 1, quarry: 1, barracks: 1, archeryTower: 1, cannon: 0, wall: 4 },
            placedBuildings: { 
                [`${aiCityX},${aiCityY}`]: { type: 'townHall', level: 2 },
                [`${aiCityX-1},${aiCityY}`]: { type: 'wall', level: 1 },
                [`${aiCityX+1},${aiCityY}`]: { type: 'wall', level: 1 },
                [`${aiCityX},${aiCityY-1}`]: { type: 'wall', level: 1 },
                [`${aiCityX},${aiCityY+1}`]: { type: 'wall', level: 1 }
            },
            army: { scout: 0, soldier: 150, guardian: 20 },
            isMarching: false,
            allianceId: 'RIV',
            heroLevel: 5,
            exploredTiles: []
        });

        this.alliances.push({
            id: 'RIV',
            name: 'Rival Kingdom (AI)',
            members: ['AI_Kingdom_777']
        });
    }

    private startGameLoop() {
        if (this.gameTickInterval) return;
        this.gameTickInterval = window.setInterval(() => {
            this.processGameTick();
        }, 1000); // Ticks every 1 second
    }

    private processGameTick() {
        // AI Teleport Logic (Ensure AI is always close for fighting)
        const player = this.localEntities.find(e => e.isPlayer);
        const ai = this.localEntities.find(e => !e.isPlayer);
        if (player && ai) {
            const dx = player.cityX - ai.cityX;
            const dy = player.cityY - ai.cityY;
            const distToPlayer = Math.sqrt(dx*dx + dy*dy);
            if (distToPlayer > 10) {
                // Teleport AI to 3 tiles right of the player
                ai.cityX = Math.min(95, player.cityX + 3);
                ai.cityY = player.cityY;
                if (!ai.isMarching) {
                    ai.x = ai.cityX;
                    ai.y = ai.cityY;
                }
                
                // Re-claim the tile for the AI
                this.claimedTiles[`${ai.cityX},${ai.cityY}`] = ai.pubkey;
            }
        }

        for (const entity of this.localEntities) {
            // Resource generation
            entity.resources.food += 1 + (entity.buildings.farm * 2);
            entity.resources.wood += 1 + (entity.buildings.lumberMill * 2);
            entity.resources.stone += (entity.buildings.quarry * 1);
            if (entity.buildings.townHall > 1) {
                entity.resources.gold += 0.5;
            }

            // Combat State
            if (entity.inCombatTicks && entity.inCombatTicks > 0) {
                entity.inCombatTicks--;
                if (entity.inCombatTicks <= 0) {
                    entity.inCombatTicks = 0;
                    
                    if (entity.combatTargetTile) {
                        const enemy = this.localEntities.find(e => e.pubkey === entity.combatTargetTile!.owner);
                        if (enemy) {
                            // Destroy the building block!
                            delete enemy.placedBuildings[`${entity.combatTargetTile.x},${entity.combatTargetTile.y}`];
                            console.log(`Destroyed building at ${entity.combatTargetTile.x},${entity.combatTargetTile.y}`);
                            
                            // Check if they also reached the Town Hall
                            if (enemy.cityX === entity.combatTargetTile.x && enemy.cityY === entity.combatTargetTile.y) {
                                this.resolveCombat(entity, enemy);
                            } else {
                                // Resume marching towards original target!
                                entity.isMarching = true;
                            }
                        }
                        entity.combatTargetTile = undefined;
                    } else {
                        // Original resolve combat for Town Hall
                        const enemy = this.localEntities.find(e => 
                            e.pubkey !== entity.pubkey && 
                            e.cityX === entity.x && 
                            e.cityY === entity.y
                        );
                        if (enemy) {
                            this.resolveCombat(entity, enemy);
                        }
                    }
                }
                continue; // Pause marching while in combat
            }

            // March Logic
            if (entity.isMarching && entity.targetX !== undefined && entity.targetY !== undefined) {
                // Check if current tile (or next tile) has an enemy building block
                const currentTileX = Math.round(entity.x);
                const currentTileY = Math.round(entity.y);
                
                // Is there a hostile building on this tile?
                const owner = this.claimedTiles[`${currentTileX},${currentTileY}`];
                let hostileBuilding = false;
                let enemyOwner: ECSComponent | undefined;
                
                if (owner && owner !== entity.pubkey) {
                    enemyOwner = this.localEntities.find(e => e.pubkey === owner);
                    if (enemyOwner && enemyOwner.allianceId !== entity.allianceId && enemyOwner.placedBuildings[`${currentTileX},${currentTileY}`]) {
                        hostileBuilding = true;
                    }
                }

                if (hostileBuilding && enemyOwner) {
                    // STOP and fight the building!
                    entity.isMarching = false;
                    entity.inCombatTicks = 3; // 3 ticks to break a building
                    entity.combatTargetTile = { x: currentTileX, y: currentTileY, owner: enemyOwner.pubkey };
                } else if (entity.targetPath && entity.targetPath.length > 0) {
                    // Follow A* Path
                    const nextNode = entity.targetPath[0];
                    const dx = nextNode.x - entity.x;
                    const dy = nextNode.y - entity.y;
                    const dist = Math.sqrt(dx*dx + dy*dy);
                    
                    if (dist < 0.2) {
                        // Reached node
                        entity.x = nextNode.x;
                        entity.y = nextNode.y;
                        entity.targetPath.shift(); // Remove reached node
                        
                        // Check if we arrived at final destination
                        if (entity.targetPath.length === 0) {
                            entity.x = entity.targetX;
                            entity.y = entity.targetY;
                            entity.isMarching = false;
                            
                            // Check for combat at destination
                            const enemy = this.localEntities.find(e => 
                                e.pubkey !== entity.pubkey && 
                                e.cityX === entity.x && 
                                e.cityY === entity.y
                            );
                            if (enemy && enemy.army.scout + enemy.army.soldier + enemy.army.guardian > 0) {
                                entity.inCombatTicks = 5;
                                enemy.inCombatTicks = 5;
                            } else if (enemy) {
                                this.resolveCombat(entity, enemy);
                            }
                        }
                    } else {
                        // Move towards next node (Speed: 1 tile per tick)
                        const speed = 1.0;
                        entity.x += (dx / dist) * speed;
                        entity.y += (dy / dist) * speed;
                    }
                } else {
                    // Re-calculate path if lost
                    entity.targetPath = this.findPath(entity.x, entity.y, entity.targetX, entity.targetY);
                    if (!entity.targetPath || entity.targetPath.length === 0) {
                         entity.isMarching = false;
                    }
                }
            }
        }

        // Aggressive AI logic (fires ~20% of ticks)
        if (Math.random() < 0.20) {
            this.runAIBot();
        }
    }

    private runAIBot() {
        const ai = this.localEntities.find(e => !e.isPlayer);
        if (!ai) return;

        // AI Cheats: Instantly generate troops for a challenge!
        if (Math.random() < 0.5) { // 50% chance on AI tick to spawn free soldiers
            ai.army.soldier += 1;
        }

        // Active Counter-Attack Logic
        const totalAIArmy = ai.army.scout + ai.army.soldier + ai.army.guardian;
        if (totalAIArmy > 10 && !ai.isMarching && (!ai.inCombatTicks || ai.inCombatTicks === 0)) {
            // Find a player to attack
            const player = this.localEntities.find(e => e.isPlayer);
            if (player) {
                // 50% chance per bot tick to launch an attack if they have enough troops
                if (Math.random() < 0.5) {
                    console.log(`[AI] Rival Kingdom is launching a counter-attack on the player!`);
                    this.marchEntity(ai.pubkey, player.cityX, player.cityY);
                }
            }
        }

        // Fog of War: Reveal tiles around entity
        for (const entity of this.localEntities) {
            if (entity.isPlayer) {
                if (!entity.exploredTiles) entity.exploredTiles = [];
                const sightRadius = 4;
                const revealAround = (cx: number, cy: number) => {
                    for(let dx = -sightRadius; dx <= sightRadius; dx++) {
                        for(let dy = -sightRadius; dy <= sightRadius; dy++) {
                            if (dx*dx + dy*dy <= sightRadius*sightRadius) {
                                const key = `${Math.round(cx+dx)},${Math.round(cy+dy)}`;
                                if (!entity.exploredTiles!.includes(key)) {
                                    entity.exploredTiles!.push(key);
                                }
                            }
                        }
                    }
                };
                revealAround(entity.cityX, entity.cityY); // Base vision
                revealAround(entity.x, entity.y); // Army vision
            }
            
            // Passive Resource Generation
            if (entity.buildings.farm > 0) {
                entity.resources.food += entity.buildings.farm * 5; // 5 Food per tick per level
            }
            if (entity.buildings.lumberMill > 0) {
                entity.resources.wood += entity.buildings.lumberMill * 2;
            }
            if (entity.buildings.quarry > 0) {
                entity.resources.stone += entity.buildings.quarry * 2;
            }
            
            // Process Time-Based Queues
            if (entity.activeQueues) {
                const now = Date.now();
                entity.activeQueues = entity.activeQueues.filter(q => {
                    if (now >= q.finishTime) {
                        if (q.type === 'building' && q.buildingType && q.x !== undefined && q.y !== undefined) {
                            if (entity.placedBuildings[`${q.x},${q.y}`]) {
                                entity.placedBuildings[`${q.x},${q.y}`].level++;
                            } else {
                                entity.placedBuildings[`${q.x},${q.y}`] = { type: q.buildingType as any, level: 1 };
                            }
                            entity.buildings[q.buildingType as keyof Buildings]++;
                            console.log(`[Queue] Building finished for ${entity.ownerName}: ${q.buildingType}`);
                        } else if (q.type === 'troop' && q.unitType) {
                            entity.army[q.unitType as keyof ArmyUnits]++;
                            console.log(`[Queue] Troop finished for ${entity.ownerName}: ${q.unitType}`);
                        }
                        return false; // Remove from queue
                    }
                    return true; // Keep in queue
                });
            }
        }

        // Save state at the end of every tick to ensure persistence
        this.saveState();
    }

    // Leaderboard Calculation
    async getLeaderboard(): Promise<{ pubkey: string, name: string, score: number }[]> {
        const scores = this.localEntities.map(entity => {
            // Calculate territory
            const territoryCount = Object.values(this.claimedTiles).filter(owner => owner === entity.pubkey).length + 1; // +1 for spawn
            const totalArmy = entity.army.scout + entity.army.soldier + entity.army.guardian;
            const bLvl = Object.values(entity.buildings).reduce((a, b) => a + b, 0);
            
            // Score formula
            const score = Math.floor(entity.resources.gold * 2) 
                        + (totalArmy * 10) 
                        + (bLvl * 50) 
                        + (territoryCount * 100);
                        
            return {
                pubkey: entity.pubkey,
                name: entity.ownerName,
                score
            };
        });

        return scores.sort((a, b) => b.score - a.score);
    }

    // Season time left
    async getSeasonTimeLeft(): Promise<number> {
        const left = this.seasonEndTime - Date.now();
        return left > 0 ? left : 0;
    }

    // ---------------------------------------------------------
    // API Methods
    // ---------------------------------------------------------

    async fetchAllEntities(): Promise<ECSComponent[]> {
        for (const e of this.localEntities) {
            if (!e.hasReceivedBonus) {
                e.resources.food += 10000;
                e.resources.wood += 10000;
                e.resources.stone += 10000;
                e.resources.gold += 10000;
                e.hasReceivedBonus = true;
            }
        }
        return [...this.localEntities];
    }

    async getBattleReports(): Promise<BattleReport[]> {
        return [...this.battleReports];
    }

    async spawnArmy(x: number, y: number): Promise<void> {
        await new Promise(r => setTimeout(r, 800)); // Simulate Web3 transaction delay
        const pubkey = `Player_${Date.now()}`;
        this.activePlayerPubkey = pubkey;

        const newSettlement: ECSComponent = {
            pubkey,
            isPlayer: true,
            ownerName: 'Your Kingdom',
            cityX: x,
            cityY: y,
            x,
            y,
            resources: { food: 10000, wood: 10000, stone: 10000, gold: 10000 },
            buildings: { townHall: 1, barracks: 1, archeryTower: 0, cannon: 0, wall: 0, farm: 0, lumberMill: 0, quarry: 0 },
            placedBuildings: { 
                [`${x},${y}`]: { type: 'townHall', level: 1 },
                [`${x+1},${y}`]: { type: 'barracks', level: 1 }
            },
            army: { scout: 5, soldier: 10, guardian: 0 },
            isMarching: false,
            heroLevel: 0,
            exploredTiles: [],
            activeQueues: []
        };
        this.localEntities.push(newSettlement);
    }

    async marchEntity(pubkey: string, targetX: number, targetY: number): Promise<void> {
        await new Promise(r => setTimeout(r, 600)); // Simulate Web3 transaction delay
        const entity = this.localEntities.find(e => e.pubkey === pubkey);
        if (entity) {
            // Friendly fire check
            const targetTileOwner = this.claimedTiles[`${targetX},${targetY}`];
            if (targetTileOwner) {
                const enemy = this.localEntities.find(e => e.pubkey === targetTileOwner);
                if (enemy && enemy.allianceId && enemy.allianceId === entity.allianceId) {
                    console.log("Friendly Fire Prevented");
                    return;
                }
            }

            entity.targetX = targetX;
            entity.targetY = targetY;
            entity.targetPath = this.findPath(entity.x, entity.y, targetX, targetY);
            entity.isMarching = true;
            console.log(`[March] ${entity.ownerName} marching to ${targetX}, ${targetY} via path length ${entity.targetPath.length}`);
        }
    }

    async upgradeBuildingAt(pubkey: string, x: number, y: number): Promise<boolean> {
        await new Promise(r => setTimeout(r, 1200)); // Simulate Web3 transaction delay
        const entity = this.localEntities.find(e => e.pubkey === pubkey);
        if (!entity || !entity.placedBuildings[`${x},${y}`]) return false;

        const placed = entity.placedBuildings[`${x},${y}`];
        const buildingType = placed.type;
        const currentLevel = placed.level;
        const woodCost = 100 * (currentLevel + 1);
        const stoneCost = 50 * (currentLevel + 1);

        if (entity.resources.wood >= woodCost && entity.resources.stone >= stoneCost) {
            entity.resources.wood -= woodCost;
            entity.resources.stone -= stoneCost;
            
            if (!entity.activeQueues) entity.activeQueues = [];
            entity.activeQueues.push({
                type: 'building',
                finishTime: Date.now() + 5000, // 5 seconds to upgrade
                x, y, buildingType
            });
            return true;
        }
        return false;
    }

    async placeBuilding(pubkey: string, x: number, y: number, buildingType: keyof Buildings): Promise<boolean> {
        await new Promise(r => setTimeout(r, 1000));
        const entity = this.localEntities.find(e => e.pubkey === pubkey);
        if (!entity || this.claimedTiles[`${x},${y}`] !== pubkey || entity.placedBuildings[`${x},${y}`]) return false;

        const woodCost = 100;
        const stoneCost = 50;

        if (entity.resources.wood >= woodCost && entity.resources.stone >= stoneCost) {
            entity.resources.wood -= woodCost;
            entity.resources.stone -= stoneCost;
            
            if (!entity.activeQueues) entity.activeQueues = [];
            entity.activeQueues.push({
                type: 'building',
                finishTime: Date.now() + 5000, // 5 seconds to place
                x, y, buildingType
            });
            return true;
        }
        return false;
    }

    async recruitUnit(pubkey: string, unitType: keyof ArmyUnits): Promise<boolean> {
        await new Promise(r => setTimeout(r, 800)); // Simulate Web3 transaction delay
        const entity = this.localEntities.find(e => e.pubkey === pubkey);
        if (!entity || entity.buildings.barracks < 1) return false;

        let foodCost = 0, goldCost = 0;
        
        if (unitType === 'scout') { foodCost = 10; goldCost = 0; }
        else if (unitType === 'soldier') { foodCost = 50; goldCost = 5; }
        else if (unitType === 'guardian') { foodCost = 100; goldCost = 20; }

        if (entity.resources.food >= foodCost && entity.resources.gold >= goldCost) {
            entity.resources.food -= foodCost;
            entity.resources.gold -= goldCost;
            
            if (!entity.activeQueues) entity.activeQueues = [];
            entity.activeQueues.push({
                type: 'troop',
                finishTime: Date.now() + 3000, // 3 seconds to train
                unitType
            });
            return true;
        }
        return false;
    }

    private async resolveCombat(attacker: ECSComponent, defender: ECSComponent) {
        // Prevent attacking same alliance
        if (attacker.allianceId && attacker.allianceId === defender.allianceId) {
            console.log("Friendly Fire Prevented in Combat");
            return;
        }

        // Simple async combat logic
        let attPower = (attacker.army.soldier * 5) + (attacker.army.guardian * 10);
        let attRangedPower = (attacker.army.scout * 1); // Scouts act as archers

        if (attacker.heroLevel > 0) {
            attPower += 100 + (attacker.heroLevel * 50); // Massive boost
        }

        let defPower = (defender.army.soldier * 5) + (defender.army.guardian * 10);
        let defRangedPower = (defender.army.scout * 1) + (defender.buildings.archeryTower * 15) + (defender.buildings.cannon * 30);
        
        if (defender.buildings.wall > 0) {
            defPower *= (1 + (defender.buildings.wall * 0.1)); // Walls protect melee
            // Ranged troops shoot over walls, so they ignore the wall defense multiplier
            attRangedPower *= 1.2; // Ranged attacker bonus against walls
        }
        
        let totalDefPower = defPower + defRangedPower;
        if (defender.heroLevel > 0) {
            totalDefPower += 100 + (defender.heroLevel * 50);
        }// Random modifier +/- 10%
        
        const randMod = 0.9 + (Math.random() * 0.2);
        const finalAttPower = (attPower + attRangedPower) * randMod;

        const attackerLost = { scout: 0, soldier: 0, guardian: 0 };
        const defenderLost = { scout: 0, soldier: 0, guardian: 0 };
        let winnerId = '';
        let territoryCaptured = false;

        if (finalAttPower > totalDefPower) {
            winnerId = attacker.pubkey;
            territoryCaptured = true;
            // Defender loses all troops
            defenderLost.scout = defender.army.scout;
            defenderLost.soldier = defender.army.soldier;
            defenderLost.guardian = defender.army.guardian;
            defender.army = { scout: 0, soldier: 0, guardian: 0 };
            
            // Attacker loses 30% troops
            attackerLost.scout = Math.floor(attacker.army.scout * 0.3);
            attackerLost.soldier = Math.floor(attacker.army.soldier * 0.3);
            attackerLost.guardian = Math.floor(attacker.army.guardian * 0.3);
            
            attacker.army.scout -= attackerLost.scout;
            attacker.army.soldier -= attackerLost.soldier;
            attacker.army.guardian -= attackerLost.guardian;
        } else {
            winnerId = defender.pubkey;
            // Attacker loses all troops
            attackerLost.scout = attacker.army.scout;
            attackerLost.soldier = attacker.army.soldier;
            attackerLost.guardian = attacker.army.guardian;
            attacker.army = { scout: 0, soldier: 0, guardian: 0 };
            
            // Defender loses 30% troops
            defenderLost.scout = Math.floor(defender.army.scout * 0.3);
            defenderLost.soldier = Math.floor(defender.army.soldier * 0.3);
            defenderLost.guardian = Math.floor(defender.army.guardian * 0.3);
            
            defender.army.scout -= defenderLost.scout;
            defender.army.soldier -= defenderLost.soldier;
            defender.army.guardian -= defenderLost.guardian;
        }

        const report: BattleReport = {
            attackerId: attacker.pubkey,
            defenderId: defender.pubkey,
            winnerId,
            attackerLost,
            defenderLost,
            territoryCaptured,
            timestamp: Date.now(),
            x: attacker.x,
            y: attacker.y
        };

        this.battleReports.push(report);
        console.log(`[Combat] Battle resolved! Winner: ${winnerId === attacker.pubkey ? 'Attacker' : 'Defender'}`);

        // Handle Plunder & Conquest
        if (winnerId === attacker.pubkey) {
            // Calculate surviving troops to determine carry capacity
            const survivingTroops = attacker.army.scout + attacker.army.soldier + attacker.army.guardian;
            const carryCapacity = survivingTroops * 50; // Each troop can carry 50 resources

            console.log(`[Plunder] ${attacker.ownerName} plunders ${defender.ownerName} with capacity ${carryCapacity}!`);
            
            const steal = (resourceType: keyof typeof defender.resources) => {
                const amount = Math.min(defender.resources[resourceType], carryCapacity);
                defender.resources[resourceType] -= amount;
                attacker.resources[resourceType] += amount;
            };

            steal('food');
            steal('wood');
            steal('stone');
            steal('gold');
            
            // Full Conquest only happens if defender is totally destroyed (no buildings, no troops)
            const defTotal = defender.army.scout + defender.army.soldier + defender.army.guardian + defender.buildings.archeryTower + defender.buildings.cannon;
            if (defTotal === 0 && territoryCaptured) {
                console.log(`[Conquest] ${attacker.ownerName} has fully conquered ${defender.ownerName}!`);
                
                // Transfer all claimed tiles
                for (const tile in this.claimedTiles) {
                    if (this.claimedTiles[tile] === defender.pubkey) {
                        this.claimedTiles[tile] = attacker.pubkey;
                    }
                }
                
                // Defeated entity is wiped off the map
                defender.cityX = -100;
                defender.cityY = -100;
                defender.x = -100;
                defender.y = -100;
            }
        }
    }

    // ---------------------------------------------------------
    // Phase 4: Expansion & Diplomacy API
    // ---------------------------------------------------------
    
    async getClaimedTiles(): Promise<Record<string, string>> {
        return { ...this.claimedTiles };
    }

    async claimTerritory(pubkey: string, x: number, y: number): Promise<boolean> {
        await new Promise(r => setTimeout(r, 1000)); // Simulate Web3 transaction delay
        const entity = this.localEntities.find(e => e.pubkey === pubkey);
        if (!entity || this.claimedTiles[`${x},${y}`]) return false;
        
        // Cost to claim a tile
        if (entity.resources.gold >= 50) {
            entity.resources.gold -= 50;
            this.claimedTiles[`${x},${y}`] = pubkey;
            return true;
        }
        return false;
    }

    async clearObstacle(pubkey: string, x: number, y: number, terrainType: string): Promise<boolean> {
        await new Promise(r => setTimeout(r, 900)); // Simulate Web3 transaction delay
        const entity = this.localEntities.find(e => e.pubkey === pubkey);
        if (!entity || this.claimedTiles[`${x},${y}`] !== pubkey) return false;

        const cost = 10;
        if (entity.resources.gold >= cost) {
            entity.resources.gold -= cost;
            if (terrainType === 'forest') entity.resources.wood += 500;
            if (terrainType === 'mountain') entity.resources.stone += 250;
            return true;
        }
        return false;
    }

    async summonHero(pubkey: string): Promise<boolean> {
        await new Promise(r => setTimeout(r, 1500));
        const entity = this.localEntities.find(e => e.pubkey === pubkey);
        if (!entity || entity.heroLevel > 0) return false;

        const foodCost = 5000;
        const goldCost = 1000;
        if (entity.resources.food >= foodCost && entity.resources.gold >= goldCost) {
            entity.resources.food -= foodCost;
            entity.resources.gold -= goldCost;
            entity.heroLevel = 1;
            return true;
        }
        return false;
    }

    async upgradeHero(pubkey: string): Promise<boolean> {
        await new Promise(r => setTimeout(r, 1500));
        const entity = this.localEntities.find(e => e.pubkey === pubkey);
        if (!entity || entity.heroLevel === 0) return false;

        const cost = 2000 * entity.heroLevel;
        if (entity.resources.food >= cost && entity.resources.gold >= cost / 2) {
            entity.resources.food -= cost;
            entity.resources.gold -= cost / 2;
            entity.heroLevel++;
            return true;
        }
        return false;
    }

    async getAlliances(): Promise<Alliance[]> {
        return this.alliances;
    }

    async createAlliance(pubkey: string, name: string, tag: string): Promise<boolean> {
        await new Promise(r => setTimeout(r, 1000));
        const entity = this.localEntities.find(e => e.pubkey === pubkey);
        if (!entity || entity.allianceId) return false;
        
        if (this.alliances.find(a => a.id === tag)) return false; // Tag taken

        this.alliances.push({
            id: tag,
            name: name,
            members: [pubkey]
        });
        entity.allianceId = tag;
        return true;
    }

    async joinAlliance(pubkey: string, tag: string): Promise<boolean> {
        await new Promise(r => setTimeout(r, 800));
        const entity = this.localEntities.find(e => e.pubkey === pubkey);
        if (!entity || entity.allianceId) return false;

        const alliance = this.alliances.find(a => a.id === tag);
        if (alliance) {
            alliance.members.push(pubkey);
            entity.allianceId = tag;
            return true;
        }
        return false;
    }

    async leaveAlliance(pubkey: string): Promise<boolean> {
        await new Promise(r => setTimeout(r, 500));
        const entity = this.localEntities.find(e => e.pubkey === pubkey);
        if (!entity || !entity.allianceId) return false;

        const alliance = this.alliances.find(a => a.id === entity.allianceId);
        if (alliance) {
            alliance.members = alliance.members.filter(m => m !== pubkey);
            if (alliance.members.length === 0) {
                this.alliances = this.alliances.filter(a => a.id !== alliance.id);
            }
        }
        entity.allianceId = undefined;
        return true;
    }

    async getTradeOffers(pubkey: string): Promise<TradeOffer[]> {
        return this.trades.filter(t => t.toId === pubkey || t.fromId === pubkey);
    }

    async sendTradeOffer(fromId: string, toId: string, offerRes: keyof Resources, offerAmount: number, requestRes: keyof Resources, requestAmount: number): Promise<boolean> {
        const from = this.localEntities.find(e => e.pubkey === fromId);
        if (!from || from.resources[offerRes] < offerAmount) return false;

        // Escrow the resources
        from.resources[offerRes] -= offerAmount;

        const offer: TradeOffer = {
            id: `Trade_${Date.now()}`,
            fromId,
            toId,
            offerRes,
            offerAmount,
            requestRes,
            requestAmount,
            status: 'pending'
        };
        this.trades.push(offer);
        return true;
    }

    async resolveTrade(tradeId: string, accept: boolean): Promise<boolean> {
        const trade = this.trades.find(t => t.id === tradeId && t.status === 'pending');
        if (!trade) return false;

        const from = this.localEntities.find(e => e.pubkey === trade.fromId);
        const to = this.localEntities.find(e => e.pubkey === trade.toId);
        if (!from || !to) return false;

        if (accept) {
            if (to.resources[trade.requestRes] >= trade.requestAmount) {
                to.resources[trade.requestRes] -= trade.requestAmount;
                to.resources[trade.offerRes] += trade.offerAmount;
                from.resources[trade.requestRes] += trade.requestAmount;
                trade.status = 'accepted';
                return true;
            }
            return false; // To doesn't have enough to accept
        } else {
            // Reject, refund escrow
            from.resources[trade.offerRes] += trade.offerAmount;
            trade.status = 'rejected';
            return true;
        }
    }

    async getAlliances(): Promise<Alliance[]> {
        return [...this.alliances];
    }

    async createAlliance(pubkey: string, name: string): Promise<boolean> {
        // Simple logic: one alliance per player
        const existing = this.alliances.find(a => a.members.includes(pubkey));
        if (existing) return false;

        this.alliances.push({
            id: `Ally_${Date.now()}`,
            name,
            members: [pubkey]
        });
        return true;
    }

    async joinAlliance(pubkey: string, allianceId: string): Promise<boolean> {
        const existing = this.alliances.find(a => a.members.includes(pubkey));
        if (existing) return false;

        const alliance = this.alliances.find(a => a.id === allianceId);
        if (alliance) {
            alliance.members.push(pubkey);
            return true;
        }
        return false;
    }
}

export const solanaService = new SolanaService();

