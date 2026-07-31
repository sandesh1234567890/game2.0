import './style.css';
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { FXAAShader } from 'three/examples/jsm/shaders/FXAAShader.js';
import Stats from 'stats.js';

import { Input } from './Input';
import { Player } from './Player';
import { LevelManager } from './LevelManager';
import { WeaponManager } from './WeaponManager';
import { EnemyManager } from './EnemyManager';
import { FXManager } from './FXManager';
import { UIManager } from './UIManager';
import { AudioSynth } from './AudioSynth';
import { GameState } from './GameState';
import { BarrelManager } from './BarrelManager';
import { GrenadeManager } from './GrenadeManager';
import { MultiplayerManager } from './MultiplayerManager';

type VisionMode = 'normal' | 'nightvision' | 'thermal';

class Game {
  private container: HTMLElement;
  private renderer!: THREE.WebGLRenderer;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private lastTime = performance.now();

  // Post-processing
  private composer!: EffectComposer;

  // Game Systems
  private input!: Input;
  private player!: Player;
  private levelManager!: LevelManager;
  private weaponManager!: WeaponManager;
  private enemyManager!: EnemyManager;
  private fxManager!: FXManager;
  private uiManager!: UIManager;
  private audioSynth!: AudioSynth;
  private gameState!: GameState;
  private barrelManager!: BarrelManager;
  private grenadeManager!: GrenadeManager;
  private multiplayerManager!: MultiplayerManager;
  private allCollisionBoxes: THREE.Box3[] = [];

  // State Management
  private isPlaying = false;
  private isGameOver = false;
  private waitingForFirstLock = false;
  private visionMode: VisionMode = 'normal';
  private nKeyReleased = true;
  private gKeyReleased = true;
  private qKeyReleased = true;

  // Screen shake
  private shakeIntensity = 0;
  private shakeDecay = 8.0;

  // Original scene colors (for vision mode toggling)
  private originalBgColor = new THREE.Color(0xd2b48c);
  private originalFogColor = new THREE.Color(0xd2b48c);
  private cinematicPass!: ShaderPass;
  private bloomPass!: UnrealBloomPass;
  private fxaaPass!: ShaderPass;

  // Profiling
  private stats: Stats;

  constructor() {
    this.container = document.getElementById('canvas-container')!;
    
    // Initialize Stats.js
    this.stats = new Stats();
    this.stats.showPanel(0); // 0: fps, 1: ms, 2: mb, 3+: custom
    document.body.appendChild(this.stats.dom);

    this.initEngine();
    this.initSystems();
    this.setupControlBindings();
    this.animate();

    this.uiManager.addNotification("Combat training initialized. Survive the waves!");
  }

  private initEngine() {
    this.scene = new THREE.Scene();
    this.scene.background = this.originalBgColor.clone();
    this.scene.fog = new THREE.FogExp2(0xd2b48c, 0.015);

    this.camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.05, 1000);
    this.scene.add(this.camera);

    // Explicitly ask for dedicated GPU and fail if falling back to software CPU rendering (which causes massive lag)
    try {
      this.renderer = new THREE.WebGLRenderer({ 
        antialias: false, 
        powerPreference: "high-performance",
        failIfMajorPerformanceCaveat: true 
      });
    } catch (e) {
      console.warn("Hardware GPU acceleration is disabled in your browser! Game may lag.");
      this.renderer = new THREE.WebGLRenderer({ antialias: false });
    }
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    // Cap pixel ratio to 0.70. This provides a MASSIVE 40-50% FPS boost on almost all screens by slightly reducing internal render resolution while scaling it up to fit the window.
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 0.70));
    
    // Enable shadow maps on the renderer so shadow shader variants are pre-compiled and cached
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.2;
    this.container.appendChild(this.renderer.domElement);

    // Post-processing: Bloom for emissive elements
    this.composer = new EffectComposer(this.renderer);
    const renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(renderPass);

    // Render bloom at quarter resolution for a massive performance boost (saving 4x GPU fill rate) with almost zero visual loss
    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth / 4, window.innerHeight / 4),
      0.4,   // strength
      0.2,   // radius
      0.85   // threshold
    );
    this.composer.addPass(this.bloomPass);

    // Custom Cinematic Shader: Film Grain, Vignette, Chromatic Aberration
    const CinematicShader = {
      uniforms: {
        'tDiffuse': { value: null },
        'time': { value: 0.0 }
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D tDiffuse;
        varying vec2 vUv;

        void main() {
          vec2 uv = vUv;
          
          // Single texture lookup for massive performance boost (removed Chromatic Aberration)
          vec4 c = texture2D(tDiffuse, uv);
          c.a = 1.0;

          // Vignette
          vec2 distFromCenter = uv - 0.5;
          float vignette = length(distFromCenter);
          vignette = smoothstep(0.8, 0.3, vignette);
          c.rgb *= vignette;

          gl_FragColor = c;
        }
      `
    };

    this.cinematicPass = new ShaderPass(CinematicShader);
    this.composer.addPass(this.cinematicPass);

    // Add FXAA for buttery smooth edges (fixes jagged edges from lower pixel ratio)
    this.fxaaPass = new ShaderPass(FXAAShader);
    this.fxaaPass.material.uniforms['resolution'].value.x = 1 / (window.innerWidth * this.renderer.getPixelRatio());
    this.fxaaPass.material.uniforms['resolution'].value.y = 1 / (window.innerHeight * this.renderer.getPixelRatio());
    this.composer.addPass(this.fxaaPass);

    // Disable FXAA by default on MEDIUM (the initial starting preset)
    this.fxaaPass.enabled = false;

    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
      this.composer.setSize(window.innerWidth, window.innerHeight);
      
      if (this.fxaaPass.enabled) {
        this.fxaaPass.material.uniforms['resolution'].value.x = 1 / (window.innerWidth * this.renderer.getPixelRatio());
        this.fxaaPass.material.uniforms['resolution'].value.y = 1 / (window.innerHeight * this.renderer.getPixelRatio());
      }
    });
  }

  private initSystems() {
    this.gameState = new GameState();
    this.audioSynth = new AudioSynth();
    this.input = new Input(this.renderer.domElement);
    this.player = new Player(this.camera, this.input, this.audioSynth);
    this.levelManager = new LevelManager(this.scene);
    
    // Set up shared dynamic collision box array
    this.allCollisionBoxes.push(...this.levelManager.collisionBoxes);
    
    this.weaponManager = new WeaponManager(this.scene, this.camera, this.input, this.audioSynth);
    this.enemyManager = new EnemyManager(this.scene, this.player, this.allCollisionBoxes, this.gameState);
    this.fxManager = new FXManager(this.scene);
    this.barrelManager = new BarrelManager(this.scene, this.player, this.enemyManager, this.fxManager, this.audioSynth);
    this.grenadeManager = new GrenadeManager(this.scene, this.player, this.enemyManager, this.fxManager, this.audioSynth, this.barrelManager, this.allCollisionBoxes);
    this.multiplayerManager = new MultiplayerManager(this.scene);
    this.uiManager = new UIManager(this.player, this.weaponManager, this.enemyManager, this.gameState);

    this.barrelManager.onExplosion = (intensity) => {
      this.triggerScreenShake(intensity);
    };
    this.grenadeManager.onExplosion = (intensity) => {
      this.triggerScreenShake(intensity);
    };

    this.uiManager = new UIManager(this.player, this.weaponManager, this.enemyManager, this.gameState);

    this.uiManager.onPresetChange = (preset) => {
      this.setGraphicsPreset(preset);
    };

    // Multiplayer UI Event Wiring
    this.uiManager.onCreateRoomClick = (name, team) => {
      this.multiplayerManager.createRoom(name, team);
    };

    this.uiManager.onJoinRoomClick = (name, team, code) => {
      this.multiplayerManager.joinRoom(name, team, code);
    };

    this.uiManager.onCancelLobbyClick = () => {
      this.multiplayerManager.reset();
    };

    this.uiManager.onStartMatchClick = () => {
      this.multiplayerManager.startMatch();
    };

    this.uiManager.onReadyLobbyClick = () => {
      this.multiplayerManager.toggleReady();
    };

    // Multiplayer WebRTC Callback Wiring
    this.multiplayerManager.onRoomCreated = (code) => {
      this.uiManager.lobbyCodeValue.textContent = code;
      this.uiManager.btnCopyCode.style.display = 'block';
    };

    this.multiplayerManager.onPlayerJoined = (players) => {
      this.uiManager.updateLobbyUI(players, this.multiplayerManager.isHost);
    };

    this.multiplayerManager.onMatchStartSignal = () => {
      this.uiManager.multiplayerLobbyMenu.classList.remove('active');
      this.startMultiplayerMatch();
    };

    this.multiplayerManager.onRemoteShot = (origin, direction, isEnemy) => {
      this.fxManager.createTracer(origin, origin.clone().addScaledVector(direction, 60), isEnemy);
    };

    this.multiplayerManager.onRemoteGrenade = (origin, dir) => {
      this.grenadeManager.throwGrenadeFromRemote(origin, dir);
    };

    this.multiplayerManager.onLocalDamage = (damage) => {
      this.player.takeDamage(damage);
      this.audioSynth.playDamage();
      this.uiManager.triggerDamageFlash();
      this.triggerScreenShake(0.18);
    };

    this.multiplayerManager.onScoreUpdate = (alpha, bravo) => {
      this.uiManager.updateScoresUI(alpha, bravo);
      this.uiManager.addNotification(`SCORE: Alpha [${alpha}] - Bravo [${bravo}]`);
      
      // Win check (25 Kills wins)
      if (alpha >= 25 || bravo >= 25) {
        const winningTeam = alpha >= 25 ? 'Team Alpha' : 'Team Bravo';
        this.uiManager.addNotification(`🏆 MATCH OVER — ${winningTeam.toUpperCase()} WINS!`);
        setTimeout(() => {
          this.multiplayerManager.reset();
          window.location.reload();
        }, 5000);
      }
    };

    // Wire up streak callbacks
    this.gameState.onStreakActivated = (type, label) => {
      this.audioSynth.playStreakNotification();
      this.uiManager.addNotification(`🔥 KILLSTREAK: ${label}`);

      if (type === 'armor') {
        this.player.shield = this.player.maxShield;
        this.uiManager.addNotification("Shield fully restored!");
      } else if (type === 'airstrike') {
        this.enemyManager.killAllEnemies();
        this.triggerScreenShake(0.5);
        this.uiManager.addNotification("All hostiles eliminated by airstrike!");
      }
    };
  }

  private setupControlBindings() {
    // Show Customize HUD button if mobile
    this.uiManager.btnOpenHudEditor.style.display = this.input.isMobile ? 'block' : 'none';

    document.getElementById('btn-start')!.addEventListener('click', () => {
      this.startGame();
    });

    document.getElementById('btn-resume')!.addEventListener('click', () => {
      this.input.requestLock();
    });

    document.getElementById('btn-restart')!.addEventListener('click', () => {
      this.restartGame();
    });

    document.getElementById('btn-restart-pause')!.addEventListener('click', () => {
      this.uiManager.hidePauseMenu();
      this.restartGame();
    });
  }

  private startGame() {
    this.isPlaying = true;
    this.isGameOver = false;
    this.waitingForFirstLock = true;
    this.gameState.resetSession();
    this.gameState.currentWave = 1;
    this.gameState.waveActive = true;
    this.enemyManager.startWave(1);
    this.audioSynth.playWaveStart();
    this.uiManager.showHUD();
    this.uiManager.addNotification("⚡ WAVE 1 — Incoming hostiles!");
    this.input.requestLock();
  }

  private restartGame() {
    this.isGameOver = false;
    this.waitingForFirstLock = true;
    this.player.reset();
    this.weaponManager.selectWeapon(this.weaponManager.currentWeaponKey);
    const curWep = this.weaponManager.getCurrentWeapon();
    curWep.ammoInMag = curWep.magSize;
    curWep.ammoInReserve = curWep.reserveMax;

    this.enemyManager.reset();
    this.fxManager.reset();
    this.barrelManager.respawnAll();
    this.grenadeManager.reset();
    this.multiplayerManager.reset();

    // Reset HUD
    this.uiManager.hudMultiplayerScores.style.display = 'none';
    this.uiManager.hudWaveContainer.style.display = 'block';

    this.gameState.resetSession();
    this.gameState.currentWave = 1;
    this.gameState.waveActive = true;
    this.enemyManager.startWave(1);
    this.audioSynth.playWaveStart();

    this.isPlaying = true;
    this.setVisionMode('normal');
    this.uiManager.showHUD();
    this.uiManager.addNotification("⚡ WAVE 1 — Combat training redeployed.");
    this.input.requestLock();
  }

  private triggerScreenShake(intensity: number) {
    this.shakeIntensity = Math.max(this.shakeIntensity, intensity);
  }

  private setVisionMode(mode: VisionMode) {
    this.visionMode = mode;
    const canvasContainer = document.getElementById('canvas-container')!;
    
    // Remove all vision classes
    canvasContainer.classList.remove('nightvision-active', 'thermal-active');

    if (mode === 'normal') {
      this.scene.background = this.originalBgColor.clone();
      (this.scene.fog as THREE.FogExp2).color.copy(this.originalFogColor);
      this.enemyManager.setThermalVision(false);
    } else if (mode === 'nightvision') {
      canvasContainer.classList.add('nightvision-active');
      this.scene.background = new THREE.Color(0x001a00);
      (this.scene.fog as THREE.FogExp2).color.setHex(0x001a00);
      this.enemyManager.setThermalVision(false);
    } else if (mode === 'thermal') {
      canvasContainer.classList.add('thermal-active');
      this.scene.background = new THREE.Color(0x0a0a18);
      (this.scene.fog as THREE.FogExp2).color.setHex(0x0a0a18);
      this.enemyManager.setThermalVision(true);
    }
  }

  private handleShooting() {
    const weapon = this.weaponManager.getCurrentWeapon();
    
    const wantsToFire = this.input.mouse.left;
    if (wantsToFire && this.weaponManager.canFire()) {
      const fired = this.weaponManager.fire();
      if (fired) {
        this.audioSynth.playShoot(weapon.type);

        const gunTipOffset = new THREE.Vector3(0.18, -0.2, -0.85);
        if (this.weaponManager.isADS) {
          gunTipOffset.set(0, -0.15, -0.8);
        }
        gunTipOffset.applyEuler(this.player.rotation);
        const flashPos = this.player.position.clone().add(gunTipOffset);
        const viewDir = new THREE.Vector3();
        this.camera.getWorldDirection(viewDir);
        this.fxManager.createMuzzleFlash(flashPos, viewDir);

        // Shotgun fires multiple pellets
        const pelletCount = weapon.pellets || 1;
        const pelletSpread = weapon.pelletSpread || 0;

        for (let p = 0; p < pelletCount; p++) {
          const raycaster = new THREE.Raycaster();
          raycaster.setFromCamera(new THREE.Vector2(0, 0), this.camera);

          // Add visual dispersion
          let spread = pelletSpread;
          if (spread === 0) {
            // Non-shotgun spread
            if (!this.weaponManager.isADS) {
              spread = 0.02;
              if (this.player.stance === 'sprinting' || this.player.stance === 'sliding') spread = 0.07;
              else if (this.player.stance === 'crouching') spread = 0.012;
            }
          }
          
          if (spread > 0) {
            raycaster.ray.direction.x += (Math.random() - 0.5) * spread;
            raycaster.ray.direction.y += (Math.random() - 0.5) * spread;
            raycaster.ray.direction.z += (Math.random() - 0.5) * spread;
            raycaster.ray.direction.normalize();
          }

          const worldTargets = this.levelManager.objectsGroup.children;
          const intersects = raycaster.intersectObjects(worldTargets, true);

          let hitPoint = this.player.position.clone().addScaledVector(raycaster.ray.direction, 60.0);
          let hitNormal = new THREE.Vector3(0, 1, 0);

          if (intersects.length > 0) {
            const hit = intersects[0];
            hitPoint.copy(hit.point);
            if (hit.face) {
              hitNormal.copy(hit.face.normal);
            }
          }

          // Draw thick tracer for all shots and pellets
          this.fxManager.createTracer(flashPos, hitPoint, false);

          // Broadcast shot trace in multiplayer
          if (this.multiplayerManager.peer && this.multiplayerManager.matchActive) {
            this.multiplayerManager.broadcastShot(flashPos, raycaster.ray.direction);
          }

          // Check multiplayer remote player hit first
          let remoteHit: { id: string; headshot: boolean; point: THREE.Vector3 } | null = null;
          let closestRemoteDist = Infinity;

          for (const id of Object.keys(this.multiplayerManager.remotePlayers)) {
            const rp = this.multiplayerManager.remotePlayers[id];
            if (rp.isDead || rp.team === this.multiplayerManager.localTeam) continue;

            if (rp.mesh) {
              const intersects = raycaster.intersectObjects(rp.mesh.children, true);
              if (intersects.length > 0 && intersects[0].distance < closestRemoteDist) {
                closestRemoteDist = intersects[0].distance;
                const relativeY = intersects[0].point.y - rp.position.y;
                remoteHit = {
                  id,
                  headshot: relativeY > 0.95,
                  point: intersects[0].point
                };
              }
            }
          }

          if (remoteHit && closestRemoteDist < hitPoint.distanceTo(this.camera.position)) {
            // We hit a remote enemy player!
            hitPoint.copy(remoteHit.point);
            this.fxManager.createImpactSparks(hitPoint, new THREE.Vector3(0, 1, 0), true);
            this.uiManager.triggerHitmarker(remoteHit.headshot);
            
            const damage = remoteHit.headshot ? weapon.damage * 1.8 : weapon.damage;
            this.multiplayerManager.sendHit(remoteHit.id, damage);
            
            if (remoteHit.headshot) {
              this.audioSynth.playHeadshot();
            } else {
              this.audioSynth.playHitmarker();
            }
          } else {
            // Check barrel hit first (barrels block bullets and explode)
            const barrelHit = this.barrelManager.checkRaycastHit(raycaster, weapon.damage);
            let hitResult: { hit: boolean; headshot: boolean; point?: THREE.Vector3 } = { hit: false, headshot: false };
            
            if (barrelHit.hit && barrelHit.point) {
              this.fxManager.createImpactSparks(barrelHit.point, new THREE.Vector3(0, 1, 0), false);
              hitPoint.copy(barrelHit.point);
            } else {
              // Damage check for enemies (local bots)
              hitResult = this.enemyManager.checkRaycastHit(raycaster, weapon.damage);
              if (hitResult.hit && hitResult.point) {
                this.fxManager.createImpactSparks(hitResult.point, new THREE.Vector3(0, 1, 0), true);
                this.uiManager.triggerHitmarker(hitResult.headshot);
                
                if (hitResult.headshot) {
                  this.audioSynth.playHeadshot();
                  this.gameState.addKillXP(true);
                  this.uiManager.addNotification("HEADSHOT +250 XP");
                } else {
                  this.audioSynth.playHitmarker();
                }

                // Check if this kill completed the hit
                const killedEnemy = this.enemyManager.enemies.find(e => e.isDead && e.health <= 0 && e.deathTimer < 0.05);
                if (killedEnemy) {
                  if (!hitResult.headshot) {
                    this.gameState.addKillXP(false);
                    this.uiManager.addNotification("+100 XP");
                  }
                }
              } else if (intersects.length > 0 && p === 0) {
                this.fxManager.createImpactSparks(hitPoint, hitNormal, false);
                this.fxManager.createBulletHole(hitPoint, hitNormal);
              }
            }
          }
        }

        // Trigger weapon-specific screen shake (including when in scope/ADS)
        let intensity = 0.035; // base for pistol/SMG
        if (weapon.type === 'rifle') intensity = 0.055;
        else if (weapon.type === 'sniper') intensity = 0.16;
        else if (weapon.type === 'shotgun') intensity = 0.22;

        if (this.weaponManager.isADS) {
          intensity *= 1.45; // scale up in ADS/scope to make zoom recoil feel extremely punchy and realistic!
        }
        this.triggerScreenShake(intensity);
      }
    }
  }

  private animate = () => {
    requestAnimationFrame(this.animate);
    this.stats.begin();

    const now = performance.now();
    const dt = Math.min((now - this.lastTime) / 1000, 0.1);
    this.lastTime = now;

    if (this.isPlaying) {
      const canUpdate = this.input.isLocked || this.waitingForFirstLock;
      
      if (this.input.isLocked) {
        this.waitingForFirstLock = false;
      }
      
      if (canUpdate) {
        this.uiManager.hidePauseMenu();
        
        // Update the shared collision list with latest barrel states
        this.updateAllCollisionBoxes();

        this.player.update(dt, (pos, radius) => {
          const playerBox = new THREE.Box3(
            new THREE.Vector3(pos.x - radius, pos.y - 1.0, pos.z - radius),
            new THREE.Vector3(pos.x + radius, pos.y + 0.2, pos.z + radius)
          );
          for (let i = 0; i < this.allCollisionBoxes.length; i++) {
            if (playerBox.intersectsBox(this.allCollisionBoxes[i])) {
              return true;
            }
          }
          return false;
        });
        
        // Laser guidance
        const laserRay = new THREE.Raycaster();
        laserRay.setFromCamera(new THREE.Vector2(0, 0), this.camera);
        const levelIntersects = laserRay.intersectObjects(this.levelManager.objectsGroup.children, true);
        let laserEndPoint = this.player.position.clone().addScaledVector(laserRay.ray.direction, 50.0);
        if (levelIntersects.length > 0) {
          laserEndPoint.copy(levelIntersects[0].point);
        }
        for (const enemy of this.enemyManager.enemies) {
          if (enemy.isDead) continue;
          const enemyIntersects = laserRay.intersectObjects([enemy.bodyMesh, enemy.headMesh]);
          if (enemyIntersects.length > 0 && enemyIntersects[0].distance < laserEndPoint.distanceTo(this.camera.position)) {
            laserEndPoint.copy(enemyIntersects[0].point);
          }
        }
        this.weaponManager.setLaserTarget(laserEndPoint);

        this.weaponManager.update(dt);
        this.levelManager.updateDust(dt);
        
        this.enemyManager.update(dt, (start, end, isEnemy) => {
          this.fxManager.createTracer(start, end, isEnemy);
          if (isEnemy) {
            this.audioSynth.playDamage();
            this.uiManager.triggerDamageFlash();
            this.triggerScreenShake(0.18); // Screen shake on hit
          }
        });
        this.fxManager.update(dt);
        this.grenadeManager.update(dt);
        this.uiManager.update(dt);

        // Sync multiplayer movements
        if (this.multiplayerManager.peer && this.multiplayerManager.matchActive) {
          this.multiplayerManager.broadcastLocalState(
            this.player.position,
            this.player.rotation.y,
            this.player.stance,
            this.weaponManager.currentWeaponKey,
            this.player.health,
            this.player.isDead
          );
          this.multiplayerManager.updateRemoteMovement(dt);
        }

        this.handleShooting();

        // Weapon switcher (5 weapons)
        if (this.input.keys['1']) this.weaponManager.selectWeapon('rifle');
        if (this.input.keys['2']) this.weaponManager.selectWeapon('smg');
        if (this.input.keys['3']) this.weaponManager.selectWeapon('sniper');
        if (this.input.keys['4']) this.weaponManager.selectWeapon('shotgun');
        if (this.input.keys['5']) this.weaponManager.selectWeapon('pistol');

        // Cycle weapon (Q key or mobile cycle button)
        if (this.input.keys['q']) {
          if (this.qKeyReleased) {
            this.qKeyReleased = false;
            const weapons: ('rifle' | 'smg' | 'sniper' | 'shotgun' | 'pistol')[] = ['rifle', 'smg', 'sniper', 'shotgun', 'pistol'];
            const currentIdx = weapons.indexOf(this.weaponManager.currentWeaponKey as any);
            const nextIdx = (currentIdx + 1) % weapons.length;
            this.weaponManager.selectWeapon(weapons[nextIdx]);
            this.uiManager.addNotification(`Equipped: ${this.weaponManager.getCurrentWeapon().name}`);
          }
        } else {
          this.qKeyReleased = true;
        }

        // Vision mode toggle (N key)
        if (this.input.keys['n']) {
          if (this.nKeyReleased) {
            this.nKeyReleased = false;
            if (this.visionMode === 'normal') this.setVisionMode('nightvision');
            else if (this.visionMode === 'nightvision') this.setVisionMode('thermal');
            else this.setVisionMode('normal');
            this.uiManager.addNotification(`Vision: ${this.visionMode.toUpperCase()}`);
          }
        } else {
          this.nKeyReleased = true;
        }

        // Grenade throw (G key)
        if (this.input.keys['g']) {
          if (this.gKeyReleased && this.player.grenades > 0 && !this.weaponManager.isReloading && !this.weaponManager.isThrowing) {
            this.gKeyReleased = false;
            this.weaponManager.playThrowAnimation(0.5);
            this.triggerScreenShake(0.08); // Slight jolt on throw
            
            // Throw grenade projectile after weapon starts lowering (e.g. 0.15s delay)
            setTimeout(() => {
              if (this.isPlaying && !this.player.isDead) {
                this.grenadeManager.throwGrenade(this.camera);
                
                // Broadcast grenade throw in multiplayer
                if (this.multiplayerManager.peer && this.multiplayerManager.matchActive) {
                  const throwDir = new THREE.Vector3();
                  this.camera.getWorldDirection(throwDir);
                  this.multiplayerManager.broadcastGrenade(this.camera.position, throwDir);
                }
              }
            }, 150);
          }
        } else {
          this.gKeyReleased = true;
        }

        // Wave management
        this.gameState.clearExpiredStreaks();

        if (this.gameState.waveActive && this.enemyManager.isWaveCleared()) {
          // Wave complete!
          this.gameState.addWaveCompletionXP();
          this.gameState.waveActive = false;
          this.gameState.intermissionTimer = this.gameState.intermissionDuration;
          this.uiManager.addNotification(`✅ WAVE ${this.gameState.currentWave} COMPLETE! +500 XP`);
          // Refill shield during intermission
          this.player.shield = this.player.maxShield;
          // Refill grenades
          this.player.grenades = this.player.maxGrenades;
          // Respawn barrels for next wave
          this.barrelManager.respawnAll();
        }

        if (!this.gameState.waveActive && this.gameState.intermissionTimer > 0) {
          this.gameState.intermissionTimer -= dt;
          if (this.gameState.intermissionTimer <= 0) {
            // Start next wave
            this.gameState.currentWave++;
            this.gameState.waveActive = true;
            this.enemyManager.startWave(this.gameState.currentWave);
            this.audioSynth.playWaveStart();
            this.uiManager.addNotification(`⚡ WAVE ${this.gameState.currentWave} — Hostiles incoming!`);
          }
        }

        // Screen shake
        if (this.shakeIntensity > 0) {
          this.camera.position.x += (Math.random() - 0.5) * this.shakeIntensity;
          this.camera.position.y += (Math.random() - 0.5) * this.shakeIntensity;
          this.shakeIntensity = Math.max(0, this.shakeIntensity - this.shakeDecay * dt);
        }

        // Check match conditions
        if (this.player.isDead) {
          if (this.multiplayerManager.peer && this.multiplayerManager.matchActive) {
            // Broadcast death and team score increment
            const killerTeam = this.multiplayerManager.localTeam === 'alpha' ? 'bravo' : 'alpha';
            this.multiplayerManager.broadcastKill(killerTeam);
            
            // Revive and respawn instantly at random point in arena
            this.player.isDead = false;
            this.player.health = this.player.maxHealth;
            this.player.shield = this.player.maxShield;
            
            const rx = (Math.random() - 0.5) * 60;
            const rz = (Math.random() - 0.5) * 60;
            this.player.position.set(rx, 1.8, rz);
            this.uiManager.addNotification("🔴 YOU DIED — Respawned in the arena.");
          } else {
            this.enemyManager.deaths++;
            this.gameState.onPlayerDeath();
            this.gameState.updateBestScores(this.enemyManager.kills);
            this.gameState.commitSession();
            this.isPlaying = false;
            this.isGameOver = true;
            this.input.exitLock();
            this.uiManager.showGameOver(false);
          }
        }

      } else {
        this.uiManager.showPauseMenu();
      }
    } else if (!this.isGameOver) {
      this.uiManager.showMainMenu();
    }

    if (this.cinematicPass) {
      this.cinematicPass.uniforms['time'].value = dt * 1000.0;
    }
    this.composer.render();
    this.stats.end();
  };

  public setGraphicsPreset(preset: 'low' | 'medium' | 'ultra') {
    if (preset === 'low') {
      this.renderer.setPixelRatio(0.55);
      this.bloomPass.enabled = false;
      this.cinematicPass.enabled = false;
      this.fxaaPass.enabled = false;
      this.levelManager.setShadowsEnabled(false);
      this.levelManager.setTextureQuality(false, 1);
    } else if (preset === 'medium') {
      this.renderer.setPixelRatio(0.75);
      this.bloomPass.enabled = true;
      this.bloomPass.resolution.set(window.innerWidth / 4, window.innerHeight / 4);
      this.cinematicPass.enabled = true;
      this.fxaaPass.enabled = false;
      this.levelManager.setShadowsEnabled(false);
      this.levelManager.setTextureQuality(false, 1);
    } else if (preset === 'ultra') {
      this.renderer.setPixelRatio(1.0);
      this.bloomPass.enabled = true;
      this.bloomPass.resolution.set(window.innerWidth / 2, window.innerHeight / 2);
      this.cinematicPass.enabled = true;
      this.fxaaPass.enabled = true;
      this.levelManager.setShadowsEnabled(true);
      const maxAniso = this.renderer.capabilities.getMaxAnisotropy();
      this.levelManager.setTextureQuality(true, maxAniso);
    }

    // Force postprocessing size refresh
    this.composer.setSize(window.innerWidth, window.innerHeight);

    // Update FXAA uniforms if enabled
    if (this.fxaaPass.enabled) {
      this.fxaaPass.material.uniforms['resolution'].value.x = 1 / (window.innerWidth * this.renderer.getPixelRatio());
      this.fxaaPass.material.uniforms['resolution'].value.y = 1 / (window.innerHeight * this.renderer.getPixelRatio());
    }
  }

  private startMultiplayerMatch() {
    this.isPlaying = true;
    this.isGameOver = false;
    this.waitingForFirstLock = true;
    this.gameState.resetSession();
    this.player.reset();
    
    // Clear standard bots for multiplayer
    this.enemyManager.reset();
    this.enemyManager.enemies = [];
    
    this.setVisionMode('normal');
    this.uiManager.showHUD();
    
    // Display score panel
    this.uiManager.hudMultiplayerScores.style.display = 'flex';
    this.uiManager.hudWaveContainer.style.display = 'none';

    this.uiManager.addNotification("⚡ MULTIPLAYER MATCH COMMENCED! Team Alpha vs Team Bravo.");
    this.input.requestLock();
  }

  private updateAllCollisionBoxes() {
    this.allCollisionBoxes.length = 0;
    this.allCollisionBoxes.push(...this.levelManager.collisionBoxes);
    this.allCollisionBoxes.push(...this.barrelManager.collisionBoxes);
  }
}

// Start game instance
new Game();
