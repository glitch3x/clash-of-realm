<template>
  <main class="app-layout">
    <header class="app-header">
      <div class="logo">Clash of <span>Realms</span></div>
      
      <div class="header-center">
        <div class="nav-links">
          <button :class="{ active: currentView === 'map' }" @click="currentView = 'map'">
            <i class="icon">🗺️</i> World Map
          </button>
          <button :class="{ active: currentView === 'alliance' }" @click="currentView = 'alliance'">
            <i class="icon">🤝</i> Alliance
          </button>
          <button :class="{ active: currentView === 'army' }" @click="currentView = 'army'">
            <i class="icon">⚔️</i> Army
          </button>
        </div>
      </div>

      <div class="header-actions">
        <div class="session-status">
          <div class="pulse-dot"></div>
          Auto-Signer: <strong>Active</strong>
        </div>
        <button class="btn-primary" v-if="!connected" @click="connect">Connect Wallet</button>
        <button class="btn-primary" v-else @click="disconnect">{{ publicKey?.toBase58().slice(0, 4) }}...{{ publicKey?.toBase58().slice(-4) }}</button>
      </div>
    </header>
    
    <section class="game-wrapper">
      <GameMap v-if="currentView === 'map'" />
      
      <!-- Alliance View -->
      <div v-else-if="currentView === 'alliance'" class="full-page-view">
          <div class="coc-panel">
              <h1 class="panel-title">🤝 Alliances</h1>
              
              <div v-if="myAlliance">
                  <h2>Your Alliance: {{ myAlliance.name }}</h2>
                  <p class="alliance-stats">Members: {{ myAlliance.members.length }} / 50</p>
                  <button class="btn-primary" style="background: #e74c3c" @click="leaveAlliance(myAlliance.id)">Leave Alliance</button>
              </div>
              
              <div v-else>
                  <p>Join forces with other kingdoms to conquer the realm!</p>
                  
                  <div class="alliance-list" v-if="alliances.length > 0">
                      <div class="alliance-card" v-for="ally in alliances" :key="ally.id">
                          <div class="ally-info">
                              <h3>{{ ally.name }}</h3>
                              <p>{{ ally.members.length }} / 50 Members</p>
                          </div>
                          <button class="btn-primary small" @click="joinAlliance(ally.id)">Join</button>
                      </div>
                  </div>
                  <div class="empty-state">
                      <p v-if="alliances.length === 0">No alliances have been formed yet.</p>
                      
                      <div class="create-alliance-form" style="margin-top: 20px; text-align: left; background: rgba(0,0,0,0.2); padding: 15px; border-radius: 8px;">
                          <h3 style="margin-bottom: 10px;">Form New Alliance (1000 Gold)</h3>
                          <input type="text" v-model="newAllianceName" placeholder="Alliance Name (e.g. The Vanguard)" style="width: 100%; padding: 8px; margin-bottom: 10px; border-radius: 4px; border: none;">
                          <input type="text" v-model="newAllianceTag" placeholder="Alliance Tag (e.g. VAN)" maxlength="4" style="width: 100%; padding: 8px; margin-bottom: 10px; border-radius: 4px; border: none; text-transform: uppercase;">
                          <button class="btn-primary" @click="createAlliance" :disabled="!newAllianceName || !newAllianceTag">Form Alliance</button>
                      </div>
                  </div>
              </div>
          </div>
      </div>

      <!-- Army View -->
      <div v-else-if="currentView === 'army'" class="full-page-view">
          <div class="coc-panel">
              <h1 class="panel-title">⚔️ Global Army Overview</h1>
              <p v-if="myKingdom">Total Combat Power: <strong>{{ (myKingdom.army.scout*1) + (myKingdom.army.soldier*5) + (myKingdom.army.guardian*10) }}</strong></p>
              
              <div v-if="myKingdom" class="army-grid">
                  <div class="army-card">
                      <div class="icon-lg">🏹</div>
                      <h3>Scouts</h3>
                      <div class="count">x{{ myKingdom.army.scout }}</div>
                  </div>
                  <div class="army-card">
                      <div class="icon-lg">🤺</div>
                      <h3>Soldiers</h3>
                      <div class="count">x{{ myKingdom.army.soldier }}</div>
                  </div>
                  <div class="army-card">
                      <div class="icon-lg">💂</div>
                      <h3>Guardians</h3>
                      <div class="count">x{{ myKingdom.army.guardian }}</div>
                  </div>
              </div>
              <div v-else class="empty-state">
                  <p>You haven't founded a settlement yet! Go to the World Map to start.</p>
              </div>
          </div>
      </div>

    </section>
  </main>
</template>

<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue'
import GameMap from './components/GameMap.vue'
import { solanaService, type Alliance, type ECSComponent } from './services/SolanaService'
import { useWallet } from './composables/useWallet'

const { publicKey, connected, connect, disconnect } = useWallet()

watch(publicKey, (newKey) => {
  if (newKey) {
    solanaService.activePlayerPubkey = newKey.toBase58();
  } else {
    solanaService.activePlayerPubkey = '';
  }
});

const currentView = ref('map')
const alliances = ref<Alliance[]>([])
const allEntities = ref<ECSComponent[]>([])

const myKingdom = computed(() => {
    return allEntities.value.find(e => e.pubkey === solanaService.activePlayerPubkey) || null;
})

const myAlliance = computed(() => {
    return alliances.value.find(a => a.members.includes(solanaService.activePlayerPubkey)) || null;
})

const fetchData = async () => {
    alliances.value = await solanaService.getAlliances();
    allEntities.value = await solanaService.fetchAllEntities();
}

const newAllianceName = ref('')
const newAllianceTag = ref('')

const createAlliance = async () => {
    if (myKingdom.value) {
        if (!newAllianceName.value || !newAllianceTag.value) return;
        
        if (myKingdom.value.resources.gold >= 1000) {
            const success = await solanaService.createAlliance(myKingdom.value.pubkey, newAllianceName.value, newAllianceTag.value.toUpperCase());
            if (success) {
                myKingdom.value.resources.gold -= 1000;
                newAllianceName.value = '';
                newAllianceTag.value = '';
                await fetchData();
            } else {
                alert("You are already in an alliance or tag is taken!");
            }
        } else {
            alert("Not enough Gold (1000) to form an alliance!");
        }
    } else {
        alert("Found a settlement first!");
    }
}

const joinAlliance = async (id: string) => {
    if (myKingdom.value) {
        const success = await solanaService.joinAlliance(myKingdom.value.pubkey, id);
        if (success) {
            await fetchData();
        } else {
            alert("Failed to join alliance.");
        }
    } else {
        alert("Found a settlement first!");
    }
}

const leaveAlliance = async (id: string) => {
    if (myKingdom.value) {
        const success = await solanaService.leaveAlliance(myKingdom.value.pubkey);
        if (success) {
            await fetchData();
        }
    }
}

onMounted(() => {
    setInterval(fetchData, 1000);
})
</script>

<style>
/* Global Clash Styles */
:root {
  --primary-color: #55c830; /* Grass Green */
  --secondary-color: #e5b326; /* Gold */
  --elixir-color: #d11e8e; /* Purple Elixir */
  --text-dark: #3e281b; /* Brown text */
  --text-light: #ffffff;
  
  --panel-bg: rgba(62, 40, 27, 0.85); /* Brown translucent panels */
  --glass-border: #ffd700;
  
  --font-title: 'Lilita One', cursive;
  --font-body: 'Roboto', sans-serif;
}

html, body {
  margin: 0;
  padding: 0;
  height: 100%;
  width: 100%;
  background-color: var(--primary-color);
  color: var(--text-dark);
  font-family: var(--font-body);
  overflow: hidden;
  user-select: none;
}

#app {
  height: 100%;
  width: 100%;
}

* {
  box-sizing: border-box;
}

/* Custom Scrollbar for CoC look */
::-webkit-scrollbar { width: 10px; }
::-webkit-scrollbar-track { background: rgba(0,0,0,0.2); }
::-webkit-scrollbar-thumb { background: var(--secondary-color); border-radius: 5px; }

.app-layout {
  height: 100vh;
  display: flex;
  flex-direction: column;
  position: relative;
}

/* Header CoC Style */
.app-header {
  height: 80px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 40px;
  background: #3e281b; /* Dark wood header */
  border-bottom: 4px solid #1c110b;
  box-shadow: 0 5px 15px rgba(0, 0, 0, 0.5);
  z-index: 100;
}

.logo {
  font-family: 'Lilita One', cursive;
  font-size: 2.2rem;
  color: #fff;
  text-shadow: 2px 4px 0 #000;
}

.logo span {
  color: #f1c40f;
}

.header-center {
  flex: 1;
  display: flex;
  justify-content: center;
}

.nav-links {
  display: flex;
  gap: 10px;
}

.nav-links button {
  background: #5b3e2b;
  border: 3px solid #1c110b;
  color: #d4c4a1;
  font-family: 'Lilita One', cursive;
  font-size: 1.2rem;
  padding: 10px 25px;
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.1s;
  box-shadow: inset 0 -4px 0 rgba(0,0,0,0.3);
}

.nav-links button:hover {
  background: #6b4c2a;
}

.nav-links button.active {
  background: #e5b326; /* Gold active tab */
  color: #3e281b;
  box-shadow: inset 0 -4px 0 rgba(255,255,255,0.4);
  border-color: #8b6814;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 20px;
}

.session-status {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.9rem;
  font-family: 'Lilita One', cursive;
  color: #d4c4a1;
  background: rgba(0, 0, 0, 0.4);
  padding: 8px 16px;
  border-radius: 20px;
  border: 2px solid #1c110b;
}

.session-status strong {
  color: #2ecc71;
  text-shadow: 1px 1px 0 #000;
}

.pulse-dot {
  width: 10px;
  height: 10px;
  background-color: #2ecc71;
  border-radius: 50%;
  box-shadow: 0 0 8px #2ecc71;
  animation: pulse-green 2s infinite;
}

.btn-primary {
  background: #3498db;
  color: #fff;
  border: 3px solid #1f618d;
  padding: 12px 24px;
  border-radius: 12px;
  font-family: 'Lilita One', cursive;
  font-size: 1.2rem;
  cursor: pointer;
  box-shadow: inset 0 -4px 0 rgba(0,0,0,0.3), 0 4px 6px rgba(0,0,0,0.4);
  text-transform: uppercase;
}

.btn-primary:active {
  transform: translateY(4px);
  box-shadow: none;
}

.btn-primary.small {
    padding: 8px 16px;
    font-size: 1rem;
}

.game-wrapper {
  flex: 1;
  display: flex;
  position: relative;
}

/* Full Page Views (Alliance, Army) */
.full-page-view {
    width: 100%;
    height: 100%;
    display: flex;
    justify-content: center;
    align-items: center;
    background: radial-gradient(circle, #5fb522 0%, #448716 100%);
}

.coc-panel {
    background: #e4d5b7; /* Paper/Wood background */
    border: 6px solid #8b5a2b;
    border-radius: 20px;
    padding: 40px;
    width: 80%;
    max-width: 900px;
    text-align: center;
    box-shadow: 0 15px 30px rgba(0,0,0,0.5);
}

.panel-title {
    font-family: 'Lilita One', cursive;
    font-size: 3rem;
    margin-top: 0;
    color: #3e281b;
    text-shadow: 2px 2px 0 rgba(255,255,255,0.6);
}

.empty-state {
    padding: 40px;
    color: #6b4c2a;
    font-size: 1.2rem;
}

.alliance-list {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 20px;
    margin-top: 30px;
}

.alliance-card {
    background: rgba(255,255,255,0.5);
    border: 3px solid #8b5a2b;
    border-radius: 15px;
    padding: 20px;
    display: flex;
    justify-content: space-between;
    align-items: center;
}

.alliance-card h3 {
    margin: 0;
    font-family: 'Lilita One', cursive;
    font-size: 1.5rem;
}

.army-grid {
    display: flex;
    justify-content: center;
    gap: 40px;
    margin-top: 40px;
}

.army-card {
    background: rgba(255,255,255,0.6);
    border: 4px solid #8b5a2b;
    border-radius: 20px;
    padding: 30px;
    width: 200px;
    box-shadow: inset 0 -5px 0 rgba(0,0,0,0.1);
}

.army-card .icon-lg {
    font-size: 4rem;
    margin-bottom: 10px;
}

.army-card h3 {
    font-family: 'Lilita One', cursive;
    font-size: 1.8rem;
    margin: 0 0 10px 0;
}

.army-card .count {
    font-size: 2rem;
    font-weight: bold;
    color: #e74c3c;
}

@keyframes pulse-green {
  0% { transform: scale(0.95); opacity: 1; }
  50% { transform: scale(1.3); opacity: 0.5; }
  100% { transform: scale(0.95); opacity: 1; }
}
</style>

