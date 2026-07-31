// GameState.ts — Persistent game state with XP, rank, kill streaks, and wave tracking

export interface RankDef {
  name: string;
  xpRequired: number;
}

export const RANKS: RankDef[] = [
  { name: 'RECRUIT',     xpRequired: 0 },
  { name: 'PRIVATE',     xpRequired: 500 },
  { name: 'CORPORAL',    xpRequired: 1500 },
  { name: 'SERGEANT',    xpRequired: 3500 },
  { name: 'LIEUTENANT',  xpRequired: 7000 },
  { name: 'CAPTAIN',     xpRequired: 12000 },
  { name: 'COMMANDER',   xpRequired: 20000 },
  { name: 'GENERAL',     xpRequired: 35000 },
];

export type StreakType = 'uav' | 'armor' | 'airstrike';

export interface ActiveStreak {
  type: StreakType;
  activatedAt: number;  // timestamp
  duration: number;     // seconds (0 = instant)
}

const STORAGE_KEY = 'aether_warfare_save';

export class GameState {
  // Session state
  sessionXP = 0;
  currentStreak = 0;       // consecutive kills without dying
  activeStreaks: ActiveStreak[] = [];
  wavesCompleted = 0;
  currentWave = 0;
  waveActive = false;
  intermissionTimer = 0;
  intermissionDuration = 10; // seconds

  // Persistent state (loaded from localStorage)
  totalXP = 0;
  bestWave = 0;
  bestKills = 0;

  // Streak thresholds
  private streakThresholds: { kills: number; type: StreakType; label: string }[] = [
    { kills: 3, type: 'uav',       label: 'UAV ONLINE — Enemies revealed!' },
    { kills: 5, type: 'armor',     label: 'ARMOR DROP — Shield restored!' },
    { kills: 8, type: 'airstrike', label: 'AIRSTRIKE INBOUND — All hostiles eliminated!' },
  ];

  // Callbacks for UI notifications
  onStreakActivated: ((type: StreakType, label: string) => void) | null = null;
  onWaveStart: ((wave: number) => void) | null = null;
  onWaveComplete: ((wave: number) => void) | null = null;

  constructor() {
    this.loadPersistent();
  }

  // --- XP ---

  addKillXP(headshot: boolean) {
    const xp = headshot ? 250 : 100;
    this.sessionXP += xp;
    this.currentStreak++;
    this.checkStreaks();
  }

  addWaveCompletionXP() {
    this.sessionXP += 500;
    this.wavesCompleted++;
  }

  commitSession() {
    this.totalXP += this.sessionXP;
    this.savePersistent();
  }

  // --- Rank ---

  getRank(): RankDef {
    const xp = this.totalXP + this.sessionXP;
    let rank = RANKS[0];
    for (const r of RANKS) {
      if (xp >= r.xpRequired) rank = r;
      else break;
    }
    return rank;
  }

  getRankIndex(): number {
    const xp = this.totalXP + this.sessionXP;
    let idx = 0;
    for (let i = 0; i < RANKS.length; i++) {
      if (xp >= RANKS[i].xpRequired) idx = i;
      else break;
    }
    return idx;
  }

  getXPProgress(): { current: number; nextThreshold: number; percent: number } {
    const xp = this.totalXP + this.sessionXP;
    const idx = this.getRankIndex();
    const currentThreshold = RANKS[idx].xpRequired;
    const nextThreshold = idx < RANKS.length - 1 ? RANKS[idx + 1].xpRequired : RANKS[idx].xpRequired;
    const rangeXP = nextThreshold - currentThreshold;
    const progressXP = xp - currentThreshold;
    return {
      current: xp,
      nextThreshold,
      percent: rangeXP > 0 ? Math.min(100, (progressXP / rangeXP) * 100) : 100
    };
  }

  // --- Kill Streaks ---

  private checkStreaks() {
    for (const threshold of this.streakThresholds) {
      if (this.currentStreak === threshold.kills) {
        this.activeStreaks.push({
          type: threshold.type,
          activatedAt: Date.now(),
          duration: threshold.type === 'uav' ? 15 : 0 // UAV lasts 15s, others instant
        });
        this.onStreakActivated?.(threshold.type, threshold.label);
      }
    }
  }

  isStreakActive(type: StreakType): boolean {
    const now = Date.now();
    return this.activeStreaks.some(s =>
      s.type === type &&
      (s.duration === 0 || (now - s.activatedAt) < s.duration * 1000)
    );
  }

  clearExpiredStreaks() {
    const now = Date.now();
    this.activeStreaks = this.activeStreaks.filter(s =>
      s.duration === 0 || (now - s.activatedAt) < s.duration * 1000
    );
  }

  onPlayerDeath() {
    this.currentStreak = 0;
  }

  // --- Wave Management ---

  getWaveEnemyCount(): number {
    return 3 + this.currentWave * 2;
  }

  getWaveEnemySpeed(): number {
    return Math.min(7.0, 3.0 + this.currentWave * 0.3);
  }

  getWaveEnemyAccuracy(): number {
    return Math.min(0.85, 0.5 + this.currentWave * 0.03);
  }

  getWaveEnemyShootInterval(): number {
    return Math.max(600, 1400 - this.currentWave * 80);
  }

  // --- Persistence ---

  private loadPersistent() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const data = JSON.parse(raw);
        this.totalXP = data.totalXP || 0;
        this.bestWave = data.bestWave || 0;
        this.bestKills = data.bestKills || 0;
      }
    } catch { /* ignore parse errors */ }
  }

  savePersistent() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        totalXP: this.totalXP,
        bestWave: this.bestWave,
        bestKills: this.bestKills
      }));
    } catch { /* ignore storage errors */ }
  }

  updateBestScores(kills: number) {
    if (this.currentWave > this.bestWave) this.bestWave = this.currentWave;
    if (kills > this.bestKills) this.bestKills = kills;
  }

  resetSession() {
    this.sessionXP = 0;
    this.currentStreak = 0;
    this.activeStreaks = [];
    this.wavesCompleted = 0;
    this.currentWave = 0;
    this.waveActive = false;
    this.intermissionTimer = 0;
  }
}
