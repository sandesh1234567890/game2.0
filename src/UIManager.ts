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
 
  // Multiplayer elements
  public btnOpenMultiplayer = document.getElementById('btn-open-multiplayer')!;
  public multiplayerLobbyMenu = document.getElementById('multiplayer-lobby-menu')!;
  public btnCreateLobby = document.getElementById('btn-create-lobby')!;
  public btnJoinLobby = document.getElementById('btn-join-lobby')!;
  public btnSubmitJoinCode = document.getElementById('btn-submit-join-code')!;
  public joinRoomCodeInput = document.getElementById('join-room-code-input') as HTMLInputElement;
  public multiplayerNameInput = document.getElementById('multiplayer-name-input') as HTMLInputElement;
  public btnCancelLobby = document.getElementById('btn-cancel-lobby')!;
  public btnStartMultiplayer = document.getElementById('btn-start-multiplayer')!;
  public lobbyCodeValue = document.getElementById('lobby-code-value')!;
  public lobbyAlphaPlayers = document.getElementById('lobby-alpha-players')!;
  public lobbyBravoPlayers = document.getElementById('lobby-bravo-players')!;
  public lobbyJoinInputs = document.getElementById('lobby-join-inputs')!;
  public hudMultiplayerScores = document.getElementById('hud-multiplayer-scores')!;
  public scoreAlphaValue = document.getElementById('score-alpha-value')!;
  public scoreBravoValue = document.getElementById('score-bravo-value')!;
  public hudWaveContainer = document.getElementById('hud-wave')!;
  
  public onCreateRoomClick?: (name: string, team: 'alpha' | 'bravo') => void;
  public onJoinRoomClick?: (name: string, team: 'alpha' | 'bravo', code: string) => void;
  public onCancelLobbyClick?: () => void;
  public onStartMatchClick?: () => void;
  public onReadyLobbyClick?: () => void;
 
  public btnCopyCode = document.getElementById('btn-copy-code')!;
  public btnReadyLobby = document.getElementById('btn-ready-lobby')!;

  // Custom HUD elements
  public btnOpenHudEditor = document.getElementById('btn-open-hud-editor')!;
  public hudEditPanel = document.getElementById('hud-edit-panel')!;
  public btnHudSave = document.getElementById('btn-hud-save')!;
  public btnHudReset = document.getElementById('btn-hud-reset')!;
  public btnHudCancel = document.getElementById('btn-hud-cancel')!;
  public btnOpenHudEditorHud = document.getElementById('btn-open-hud-editor-hud')!;
  private draggableIds = [
    'mobile-joystick-container',
    'btn-mobile-jump',
    'btn-mobile-reload',
    'btn-mobile-grenade',
    'btn-mobile-ads',
    'btn-mobile-shoot',
    'btn-mobile-nextweapon',
    'btn-open-hud-editor-hud',
    'btn-mobile-pause'
  ];
  private touchListeners: { [id: string]: { start: any; move: any } } = {};

  // Internal states
  private hitmarkerTimeout: number | null = null;
  private damageFlashAlpha = 0;
  private killBanner = document.getElementById('hud-kill-banner')!;
  private killTargetName = document.getElementById('kill-target-name')!;
  private killBannerTimeout: number | null = null;
  
  public onPresetChange?: (preset: 'low' | 'medium' | 'ultra') => void;

  constructor(player: Player, weaponManager: WeaponManager, enemyManager: EnemyManager, gameState: GameState) {
    this.player = player;
    this.weaponManager = weaponManager;
    this.enemyManager = enemyManager;
    this.gameState = gameState;

    this.setupMenuListeners();
    this.updateMenuStats();
    this.loadCustomHUDLayout();
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
        const preset = btn.getAttribute('data-preset')! as 'low' | 'medium' | 'ultra';
        
        // Sync active state across all buttons of the same preset
        presetButtons.forEach(b => {
          if (b.getAttribute('data-preset') === preset) {
            b.classList.add('active');
          } else {
            b.classList.remove('active');
          }
        });
        
        if (this.onPresetChange) {
          this.onPresetChange(preset);
        }
        this.addNotification(`Graphics: ${preset.toUpperCase()} preset applied.`);
      });
    });

    // Multiplayer listeners
    this.btnOpenMultiplayer.addEventListener('click', (e) => {
      e.stopPropagation();
      this.multiplayerLobbyMenu.classList.add('active');
    });

    this.btnCancelLobby.addEventListener('click', (e) => {
      e.stopPropagation();
      this.multiplayerLobbyMenu.classList.remove('active');
      this.lobbyCodeValue.textContent = 'NOT CONNECTED';
      this.lobbyAlphaPlayers.innerHTML = '';
      this.lobbyBravoPlayers.innerHTML = '';
      this.lobbyJoinInputs.style.display = 'none';
      this.btnCopyCode.style.display = 'none';
      this.btnReadyLobby.style.display = 'none';
      this.btnReadyLobby.textContent = 'READY';
      this.btnReadyLobby.classList.remove('active');
      this.setLobbyConnectedState(false);
      if (this.onCancelLobbyClick) this.onCancelLobbyClick();
    });

    this.btnCopyCode.addEventListener('click', (e) => {
      e.stopPropagation();
      const code = this.lobbyCodeValue.textContent;
      if (code && code !== 'NOT CONNECTED') {
        navigator.clipboard.writeText(code).then(() => {
          this.addNotification("📋 Room Code copied to clipboard!");
        });
      }
    });

    this.btnReadyLobby.addEventListener('click', (e) => {
      e.stopPropagation();
      if (this.onReadyLobbyClick) this.onReadyLobbyClick();
    });

    const teamButtons = document.querySelectorAll('.team-btn');
    teamButtons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        teamButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });

    this.btnJoinLobby.addEventListener('click', (e) => {
      e.stopPropagation();
      this.lobbyJoinInputs.style.display = 'block';
    });

    this.btnCreateLobby.addEventListener('click', (e) => {
      e.stopPropagation();
      const name = this.multiplayerNameInput.value.trim() || 'OPERATOR';
      const activeTeamBtn = document.querySelector('.team-btn.active')!;
      const team = activeTeamBtn.getAttribute('data-team')! as 'alpha' | 'bravo';
      if (this.onCreateRoomClick) this.onCreateRoomClick(name, team);
    });

    this.btnSubmitJoinCode.addEventListener('click', (e) => {
      e.stopPropagation();
      const name = this.multiplayerNameInput.value.trim() || 'OPERATOR';
      const activeTeamBtn = document.querySelector('.team-btn.active')!;
      const team = activeTeamBtn.getAttribute('data-team')! as 'alpha' | 'bravo';
      const code = this.joinRoomCodeInput.value.trim().toUpperCase();
      if (this.onJoinRoomClick) this.onJoinRoomClick(name, team, code);
    });

    this.btnStartMultiplayer.addEventListener('click', (e) => {
      e.stopPropagation();
      if (this.onStartMatchClick) this.onStartMatchClick();
    });

    // HUD Customization Editor listeners
    this.btnOpenHudEditor.addEventListener('click', (e) => {
      e.stopPropagation();
      this.pauseMenu.classList.remove('active');
      this.hudEditPanel.style.display = 'flex';
      this.startHUDEditMode();
    });

    this.btnHudSave.addEventListener('click', (e) => {
      e.stopPropagation();
      this.saveHUDLayout();
    });

    this.btnHudReset.addEventListener('click', (e) => {
      e.stopPropagation();
      this.resetHUDLayout();
    });

    this.btnHudCancel.addEventListener('click', (e) => {
      e.stopPropagation();
      this.cancelHUDLayout();
    });

    // In-game HUD customization listener
    this.btnOpenHudEditorHud.addEventListener('click', (e) => {
      e.stopPropagation();
      this.hudEditPanel.style.display = 'flex';
      this.startHUDEditMode();
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
    this.btnOpenHudEditorHud.style.display = 'none';
    const mobilePauseBtn = document.getElementById('btn-mobile-pause');
    if (mobilePauseBtn) mobilePauseBtn.style.display = 'none';
  }

  showHUD() {
    this.mainMenu.classList.remove('active');
    this.hudContainer.style.display = 'block';
    this.pauseMenu.classList.remove('active');
    this.gameOverScreen.classList.remove('active');
    
    const isMobile = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
    this.btnOpenHudEditorHud.style.display = isMobile ? 'block' : 'none';
    const mobilePauseBtn = document.getElementById('btn-mobile-pause');
    if (mobilePauseBtn) mobilePauseBtn.style.display = isMobile ? 'block' : 'none';
    this.loadCustomHUDLayout();
  }

  showPauseMenu() {
    this.pauseMenu.classList.add('active');
    // Show Customize HUD button for everyone (desktop & mobile) to allow layout configuration
    this.btnOpenHudEditor.style.display = 'block';
  }

  hidePauseMenu() {
    this.pauseMenu.classList.remove('active');
  }

  showGameOver(victory = false) {
    this.hudContainer.style.display = 'none';
    this.pauseMenu.classList.remove('active');
    this.gameOverScreen.classList.add('active');
    this.btnOpenHudEditorHud.style.display = 'none';

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

  showKillBanner(targetName: string) {
    if (this.killBannerTimeout) {
      clearTimeout(this.killBannerTimeout);
    }
    this.killTargetName.textContent = targetName.toUpperCase();
    this.killBanner.classList.add('active');
    
    this.killBannerTimeout = setTimeout(() => {
      this.killBanner.classList.remove('active');
    }, 1200) as unknown as number;
  }

  triggerKillMarker() {
    if (this.hitmarkerTimeout) {
      clearTimeout(this.hitmarkerTimeout);
    }

    this.hitmarker.className = 'active kill-confirmed';

    this.hitmarkerTimeout = setTimeout(() => {
      this.hitmarker.className = '';
    }, 250) as unknown as number;
  }

  showCenterKillIndicator(text: string) {
    const el = document.createElement('div');
    el.className = 'center-kill-indicator';
    el.textContent = text;

    document.getElementById('ui-container')!.appendChild(el);

    setTimeout(() => {
      el.remove();
    }, 1000);
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

  public setLobbyConnectedState(connected: boolean) {
    const lobbyInputs = document.querySelector('.lobby-inputs') as HTMLElement;
    const lobbySetupBody = document.querySelector('.lobby-setup-body') as HTMLElement;
    if (connected) {
      if (lobbyInputs) lobbyInputs.style.display = 'none';
      if (lobbySetupBody) lobbySetupBody.style.gridTemplateColumns = '1fr';
    } else {
      if (lobbyInputs) lobbyInputs.style.display = 'flex';
      if (lobbySetupBody) lobbySetupBody.style.gridTemplateColumns = '1.2fr 1.5fr';
    }
  }

  public updateConnectionStatusUI(status: string, code: string, isHost: boolean) {
    const valSpan = document.getElementById('lobby-code-value')!;
    if (status === 'idle') {
      valSpan.textContent = 'NOT CONNECTED';
      valSpan.style.color = '#ff5500';
      this.btnReadyLobby.style.display = 'none';
    } else if (status === 'connecting') {
      valSpan.textContent = `${code} (CONNECTING...)`;
      valSpan.style.color = '#ffcc00';
      this.btnReadyLobby.style.display = 'none';
    } else if (status === 'connected') {
      valSpan.textContent = `${code} (CONNECTED)`;
      valSpan.style.color = '#00ffcc';
      if (!isHost) {
        this.btnReadyLobby.style.display = 'block';
      }
    } else if (status === 'failed') {
      valSpan.textContent = `${code} (FAILED)`;
      valSpan.style.color = '#ff3333';
      this.btnReadyLobby.style.display = 'none';
    }
  }

  public updateLobbyUI(players: { name: string; team: string; isLocal: boolean; isReady: boolean }[], isHost: boolean) {
    this.lobbyAlphaPlayers.innerHTML = '';
    this.lobbyBravoPlayers.innerHTML = '';
    
    // If there is a connection error/timeout, revert the UI state
    const hasError = players.some(p => p.name.includes('⚠️'));
    if (hasError) {
      this.setLobbyConnectedState(false);
    }

    players.forEach(p => {
      const li = document.createElement('li');
      li.textContent = `${p.name} ${p.isReady ? ' — [READY]' : ' — [WAITING]'}`;
      if (p.isLocal) {
        li.className = 'local-player';
      }
      
      if (p.team === 'alpha') {
        this.lobbyAlphaPlayers.appendChild(li);
      } else {
        this.lobbyBravoPlayers.appendChild(li);
      }
    });

    // Update ready button local text state if client
    if (!isHost) {
      const localP = players.find(p => p.isLocal);
      if (localP && localP.isReady) {
        this.btnReadyLobby.textContent = 'CANCEL READY';
        this.btnReadyLobby.classList.add('active');
      } else {
        this.btnReadyLobby.textContent = 'READY';
        this.btnReadyLobby.classList.remove('active');
      }
    } else {
      this.btnReadyLobby.style.display = 'none';
    }

    // Host can start match only when all players are ready, and at least 2 players are present
    const allReady = players.every(p => p.isReady);
    if (isHost && players.length >= 2 && allReady) {
      this.btnStartMultiplayer.style.display = 'block';
    } else {
      this.btnStartMultiplayer.style.display = 'none';
    }
  }

  public updateScoresUI(alphaScore: number, bravoScore: number) {
    this.scoreAlphaValue.textContent = alphaScore.toString();
    this.scoreBravoValue.textContent = bravoScore.toString();
  }

  // HUD Customization Editor logic
  private startHUDEditMode() {
    document.body.classList.add('hud-editing');
    
    // Ensure mobile controls are visible so they can be positioned/dragged
    const mobControls = document.getElementById('mobile-controls');
    if (mobControls) {
      mobControls.style.display = 'block';
    }

    // Ensure in-game edit button is visible so it can be customized/dragged
    this.btnOpenHudEditorHud.style.display = 'block';
    const mobilePauseBtn = document.getElementById('btn-mobile-pause');
    if (mobilePauseBtn) mobilePauseBtn.style.display = 'block';

    this.draggableIds.forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;

      el.classList.add('hud-editing-active');

      let dragOffset = { x: 0, y: 0 };

      const onTouchStart = (e: TouchEvent) => {
        e.preventDefault();
        e.stopPropagation();
        const touch = e.touches[0];
        const rect = el.getBoundingClientRect();
        dragOffset.x = touch.clientX - rect.left;
        dragOffset.y = touch.clientY - rect.top;
      };

      const onTouchMove = (e: TouchEvent) => {
        e.preventDefault();
        e.stopPropagation();
        const touch = e.touches[0];

        const posX = touch.clientX - dragOffset.x;
        const posY = touch.clientY - dragOffset.y;

        // Clamp boundaries to prevent buttons from moving off-screen
        const clampX = Math.max(0, Math.min(window.innerWidth - el.offsetWidth, posX));
        const clampY = Math.max(0, Math.min(window.innerHeight - el.offsetHeight, posY));

        // Save as responsive viewport percentage coordinates
        const pctX = (clampX / window.innerWidth) * 100;
        const pctY = (clampY / window.innerHeight) * 100;

        el.style.left = `${pctX}%`;
        el.style.top = `${pctY}%`;
        el.style.bottom = 'auto';
        el.style.right = 'auto';
        el.dataset.dragged = "true";
      };

      el.addEventListener('touchstart', onTouchStart, { passive: false });
      el.addEventListener('touchmove', onTouchMove, { passive: false });

      this.touchListeners[id] = { start: onTouchStart, move: onTouchMove };
    });
  }

  private exitHUDEditMode() {
    document.body.classList.remove('hud-editing');
    this.hudEditPanel.style.display = 'none';
    
    // Show EDIT button shortcut only when actively playing in match
    const inMatch = this.hudContainer.style.display === 'block';
    this.btnOpenHudEditorHud.style.display = inMatch ? 'block' : 'none';
    const mobilePauseBtn = document.getElementById('btn-mobile-pause');
    if (mobilePauseBtn) mobilePauseBtn.style.display = inMatch ? 'block' : 'none';

    // If not in match, return to main menu and hide mobile controls overlay
    if (!inMatch) {
      this.mainMenu.classList.add('active');
      document.getElementById('mobile-controls')!.style.display = 'none';
    } else {
      // Keep mobile controls visible but show pause menu overlay
      document.getElementById('mobile-controls')!.style.display = 'block';
      this.pauseMenu.classList.add('active');
    }

    this.draggableIds.forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;

      el.classList.remove('hud-editing-active');

      const listeners = this.touchListeners[id];
      if (listeners) {
        el.removeEventListener('touchstart', listeners.start);
        el.removeEventListener('touchmove', listeners.move);
      }
    });
    this.touchListeners = {};
  }

  private saveHUDLayout() {
    const layout: { [id: string]: { left: string; top: string } } = {};
    this.draggableIds.forEach(id => {
      const el = document.getElementById(id);
      if (el && el.dataset.dragged === "true") {
        layout[id] = {
          left: el.style.left,
          top: el.style.top
        };
      }
    });

    localStorage.setItem('aether-hud-layout', JSON.stringify(layout));
    this.exitHUDEditMode();
    this.addNotification("💾 Custom HUD layout saved!");
  }

  private resetHUDLayout() {
    localStorage.removeItem('aether-hud-layout');
    
    this.draggableIds.forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.style.left = '';
        el.style.top = '';
        el.style.bottom = '';
        el.style.right = '';
        delete el.dataset.dragged;
      }
    });

    this.exitHUDEditMode();
    this.addNotification("🔄 HUD layout reset to default.");
  }

  public loadCustomHUDLayout() {
    const data = localStorage.getItem('aether-hud-layout');
    if (data) {
      const positions = JSON.parse(data);
      Object.keys(positions).forEach(id => {
        const el = document.getElementById(id);
        if (el && positions[id] && positions[id].left && positions[id].top) {
          el.style.left = positions[id].left;
          el.style.top = positions[id].top;
          el.style.bottom = 'auto';
          el.style.right = 'auto';
          el.dataset.dragged = "true";
        }
      });
    }
  }

  private cancelHUDLayout() {
    // Revert styling changes by clearing inline coordinates and reloading saved coordinates
    this.draggableIds.forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.style.left = '';
        el.style.top = '';
        el.style.bottom = '';
        el.style.right = '';
        delete el.dataset.dragged;
      }
    });
    this.loadCustomHUDLayout();
    this.exitHUDEditMode();
    this.addNotification("❌ Edits discarded.");
  }
}
