import { Player } from './Player';
import { WeaponManager } from './WeaponManager';
import { EnemyManager } from './EnemyManager';
import { GameState } from './GameState';

export class UIManager {
  private player: Player;
  private weaponManager: WeaponManager;
  private enemyManager: EnemyManager;
  private gameState: GameState;

  // DOM Elements
  private hudContainer = document.getElementById('game-hud')!;
  private mainMenu = document.getElementById('main-menu')!;
  private pauseMenu = document.getElementById('pause-menu')!;
  private gameOverScreen = document.getElementById('game-over-screen')!;
  
  private healthFill = document.getElementById('health-fill')!;
  private shieldFill = document.getElementById('shield-fill')!;
  private healthValue = document.getElementById('health-value')!;
  private shieldValue = document.getElementById('shield-value')!;
  private stanceIndicator = document.getElementById('stance-indicator')!;

  private ammoClip = document.getElementById('ammo-clip')!;
  private ammoReserve = document.getElementById('ammo-reserve')!;
  private ammoBarFill = document.getElementById('ammo-bar-fill')!;
  private weaponName = document.getElementById('weapon-display-name')!;
  private weaponMode = document.getElementById('weapon-display-mode')!;

  private scoreKills = document.getElementById('score-kills')!;
  private scoreDeaths = document.getElementById('score-deaths')!;
  private scoreBots = document.getElementById('score-bots')!;

  private hitmarker = document.getElementById('hitmarker')!;
  private radarDots = document.getElementById('radar-dots')!;
  private compassStrip = document.getElementById('compass-strip-ticks')!;
  private damageVignette = document.getElementById('damage-vignette')!;
  private lowHealthVignette = document.getElementById('low-health-vignette')!;
  
  private endKills = document.getElementById('end-kills')!;
  private endDeaths = document.getElementById('end-deaths')!;
  private gameOverTitle = document.getElementById('game-over-title')!;
  private gameOverReason = document.getElementById('game-over-reason')!;
  
  private notifications = document.getElementById('hud-notifications')!;

  // New HUD elements
  private waveCounter = document.getElementById('wave-counter')!;
  private xpBarFill = document.getElementById('xp-bar-fill')!;
  private xpValue = document.getElementById('xp-value')!;
  private rankBadge = document.getElementById('rank-badge')!;
  private intermissionOverlay = document.getElementById('intermission-overlay')!;
  private intermissionTimer = document.getElementById('intermission-timer')!;
  private endXP = document.getElementById('end-xp')!;
  private endWave = document.getElementById('end-wave')!;
  private endRank = document.getElementById('end-rank')!;
  private endBestWave = document.getElementById('end-best-wave')!;
  private menuRank = document.getElementById('menu-rank')!;
  private menuBestWave = document.getElementById('menu-best-wave')!;
  private grenadeCount = document.getElementById('grenade-count')!;

  // Internal states
  private hitmarkerTimeout: number | null = null;
  private damageFlashAlpha = 0;
  
  public onPresetChange?: (preset: 'low' | 'medium' | 'ultra') => void;

  constructor(player: Player, weaponManager: WeaponManager, enemyManager: EnemyManager, gameState: GameState) {
    this.player = player;
    this.weaponManager = weaponManager;
    this.enemyManager = enemyManager;
    this.gameState = gameState;

    this.setupMenuListeners();
    this.updateMenuStats();
  }

  private setupMenuListeners() {
    const cards = document.querySelectorAll('.loadout-card');
    cards.forEach(card => {
      card.addEventListener('click', (e) => {
        e.stopPropagation();
        cards.forEach(c => c.classList.remove('active'));
        card.classList.add('active');
        
        const weaponKey = card.getAttribute('data-weapon')!;
        this.weaponManager.selectWeapon(weaponKey);
        this.addNotification(`Loadout: ${this.weaponManager.getCurrentWeapon().name} selected.`);
      });
    });

    const presetButtons = document.querySelectorAll('.preset-btn');
    presetButtons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        presetButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        
        const preset = btn.getAttribute('data-preset')! as 'low' | 'medium' | 'ultra';
        if (this.onPresetChange) {
          this.onPresetChange(preset);
        }
        this.addNotification(`Graphics: ${preset.toUpperCase()} preset applied.`);
      });
    });
  }

  private updateMenuStats() {
    const rank = this.gameState.getRank();
    if (this.menuRank) this.menuRank.textContent = rank.name;
    if (this.menuBestWave) this.menuBestWave.textContent = this.gameState.bestWave > 0 ? `Best: Wave ${this.gameState.bestWave}` : 'No record';
  }

  update(dt: number) {
    // 1. Core stats
    const healthPercent = (this.player.health / this.player.maxHealth) * 100;
    const shieldPercent = (this.player.shield / this.player.maxShield) * 100;

    this.healthFill.style.width = `${healthPercent}%`;
    this.shieldFill.style.width = `${shieldPercent}%`;
    this.healthValue.textContent = Math.ceil(this.player.health).toString();
    this.shieldValue.textContent = Math.ceil(this.player.shield).toString();
    this.stanceIndicator.textContent = this.player.stance.toUpperCase();

    // 2. Weapon and ammo
    const weapon = this.weaponManager.getCurrentWeapon();
    this.weaponName.textContent = weapon.name;
    this.weaponMode.textContent = weapon.fireMode.toUpperCase();
    this.ammoClip.textContent = weapon.ammoInMag.toString();
    this.ammoReserve.textContent = weapon.ammoInReserve.toString();
    const ammoPercent = (weapon.ammoInMag / weapon.magSize) * 100;
    this.ammoBarFill.style.width = `${ammoPercent}%`;

    // 2.5 Grenades
    this.grenadeCount.textContent = this.player.grenades.toString();

    if (this.weaponManager.isReloading) {
      this.weaponMode.textContent = 'RELOADING...';
    }

    // 3. Match stats
    this.scoreKills.textContent = this.enemyManager.kills.toString();
    this.scoreDeaths.textContent = this.enemyManager.deaths.toString();
    this.scoreBots.textContent = this.enemyManager.enemies.filter(e => !e.isDead).length.toString();

    // 4. Wave counter
    if (this.waveCounter) {
      this.waveCounter.textContent = `WAVE ${this.gameState.currentWave}`;
    }

    // 5. XP and Rank
    if (this.xpBarFill && this.xpValue && this.rankBadge) {
      const xpProgress = this.gameState.getXPProgress();
      this.xpBarFill.style.width = `${xpProgress.percent}%`;
      this.xpValue.textContent = `${xpProgress.current} XP`;
      this.rankBadge.textContent = this.gameState.getRank().name;
    }

    // 6. Intermission overlay
    if (this.intermissionOverlay && this.intermissionTimer) {
      if (!this.gameState.waveActive && this.gameState.intermissionTimer > 0) {
        this.intermissionOverlay.style.display = 'flex';
        this.intermissionTimer.textContent = Math.ceil(this.gameState.intermissionTimer).toString();
      } else {
        this.intermissionOverlay.style.display = 'none';
      }
    }

    // 7. Compass and radar
    this.updateRadarAndCompass();

    // 8. Damage vignette
    if (this.damageFlashAlpha > 0) {
      this.damageFlashAlpha = Math.max(0, this.damageFlashAlpha - dt * 2.0);
      this.damageVignette.style.opacity = this.damageFlashAlpha.toString();
    }

    if (this.player.health < 35 && !this.player.isDead) {
      this.lowHealthVignette.style.display = 'block';
    } else {
      this.lowHealthVignette.style.display = 'none';
    }
  }

  showMainMenu() {
    this.updateMenuStats();
    this.mainMenu.classList.add('active');
    this.hudContainer.style.display = 'none';
    this.pauseMenu.classList.remove('active');
    this.gameOverScreen.classList.remove('active');
  }

  showHUD() {
    this.mainMenu.classList.remove('active');
    this.hudContainer.style.display = 'block';
    this.pauseMenu.classList.remove('active');
    this.gameOverScreen.classList.remove('active');
  }

  showPauseMenu() {
    this.pauseMenu.classList.add('active');
  }

  hidePauseMenu() {
    this.pauseMenu.classList.remove('active');
  }

  showGameOver(victory = false) {
    this.hudContainer.style.display = 'none';
    this.pauseMenu.classList.remove('active');
    this.gameOverScreen.classList.add('active');

    this.endKills.textContent = this.enemyManager.kills.toString();
    this.endDeaths.textContent = this.enemyManager.deaths.toString();
    if (this.endXP) this.endXP.textContent = `+${this.gameState.sessionXP} XP`;
    if (this.endWave) this.endWave.textContent = `Wave ${this.gameState.currentWave}`;
    if (this.endRank) this.endRank.textContent = this.gameState.getRank().name;
    if (this.endBestWave) this.endBestWave.textContent = `Best: Wave ${this.gameState.bestWave}`;

    if (victory) {
      this.gameOverTitle.textContent = 'VICTORY ACHIEVED';
      this.gameOverTitle.style.color = 'var(--color-primary)';
      this.gameOverTitle.style.textShadow = '0 0 15px var(--color-primary-glow)';
      this.gameOverReason.textContent = 'You survived all combat waves.';
    } else {
      this.gameOverTitle.textContent = 'MISSION FAILURE';
      this.gameOverTitle.style.color = 'var(--color-danger)';
      this.gameOverTitle.style.textShadow = '0 0 15px var(--color-danger-glow)';
      this.gameOverReason.textContent = `You flatlined during Wave ${this.gameState.currentWave}.`;
    }
  }

  triggerHitmarker(headshot = false) {
    if (this.hitmarkerTimeout) {
      clearTimeout(this.hitmarkerTimeout);
    }

    this.hitmarker.className = 'active';
    if (headshot) {
      this.hitmarker.classList.add('headshot');
    }

    this.hitmarkerTimeout = setTimeout(() => {
      this.hitmarker.className = '';
    }, 180) as unknown as number;
  }

  triggerDamageFlash() {
    this.damageFlashAlpha = 1.0;
    this.damageVignette.style.opacity = '1.0';
  }

  addNotification(text: string) {
    const notif = document.createElement('div');
    notif.className = 'hud-notif';
    notif.textContent = text;
    
    this.notifications.appendChild(notif);
    
    setTimeout(() => {
      notif.style.animation = 'slide-in-notif 0.3s ease-out reverse forwards';
      setTimeout(() => notif.remove(), 300);
    }, 3000);
  }

  private updateRadarAndCompass() {
    let headingDegrees = Math.round((this.player.rotation.y * 180) / Math.PI) % 360;
    if (headingDegrees < 0) headingDegrees += 360;

    const cardinalIndex = Math.floor(((headingDegrees + 11.25) % 360) / 22.5);
    const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
    const currentHeadingStr = directions[cardinalIndex];
    
    this.compassStrip.textContent = `| ${headingDegrees}° ${currentHeadingStr} |`;

    // Rotating Minimap Radar Dots
    while (this.radarDots.firstChild) {
      this.radarDots.removeChild(this.radarDots.firstChild);
    }

    const radarMaxDistance = 45.0;
    const radarHalfWidth = 70;

    const cosYaw = Math.cos(this.player.rotation.y);
    const sinYaw = Math.sin(this.player.rotation.y);

    // UAV streak: show all enemies regardless of range
    const uavActive = this.gameState.isStreakActive('uav');

    this.enemyManager.enemies.forEach(enemy => {
      if (enemy.isDead) return;

      const relX = enemy.position.x - this.player.position.x;
      const relZ = enemy.position.z - this.player.position.z;

      const rotX = relX * cosYaw + relZ * sinYaw;
      const rotY = -relX * sinYaw + relZ * cosYaw;

      const dist = Math.sqrt(rotX * rotX + rotY * rotY);
      const effectiveRange = uavActive ? 200 : radarMaxDistance;

      if (dist < effectiveRange) {
        const clampedDist = Math.min(dist, radarMaxDistance);
        const pxX = radarHalfWidth + (rotX / clampedDist * (clampedDist / radarMaxDistance)) * radarHalfWidth;
        const pxY = radarHalfWidth + (rotY / clampedDist * (clampedDist / radarMaxDistance)) * radarHalfWidth;

        const dot = document.createElement('div');
        dot.className = uavActive ? 'radar-dot-enemy uav-pulse' : 'radar-dot-enemy';
        dot.style.left = `${Math.max(4, Math.min(136, pxX))}px`;
        dot.style.top = `${Math.max(4, Math.min(136, pxY))}px`;

        this.radarDots.appendChild(dot);
      }
    });
  }
}
