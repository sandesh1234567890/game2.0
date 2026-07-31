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

  // State Management
  private isPlaying = false;
  private isGameOver = false;
  private visionMode: VisionMode = 'normal';
  private nKeyReleased = true;

  // Screen shake
  private shakeIntensity = 0;
  private shakeDecay = 8.0;

  // Original scene colors (for vision mode toggling)
  private originalBgColor = new THREE.Color(0xd2b48c);
  private originalFogColor = new THREE.Color(0xd2b48c);
  private cinematicPass!: ShaderPass;

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
    // Cap pixel ratio to 0.75. This provides a MASSIVE 30-40% FPS boost on almost all screens by slightly reducing internal render resolution while scaling it up to fit the window.
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 0.75));
    
    // Disable expensive shadow maps
    this.renderer.shadowMap.enabled = false;

    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.2;
    this.container.appendChild(this.renderer.domElement);

    // Post-processing: Bloom for emissive elements
    this.composer = new EffectComposer(this.renderer);
    const renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(renderPass);

    // Render bloom at half resolution for a massive performance boost with almost zero visual loss
    const bloomPass = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth / 2, window.innerHeight / 2),
      0.4,   // strength
      0.2,   // radius
      0.85   // threshold
    );
    this.composer.addPass(bloomPass);

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
        uniform float time;
        varying vec2 vUv;

        // Simple random generator for grain
        float random(vec2 p) {
          vec2 k1 = vec2(23.14069263277926, 2.665144142690225);
          return fract(cos(dot(p, k1)) * 12345.6789);
        }

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

          // Film Grain
          vec2 noiseUv = uv * time;
          float noise = random(noiseUv) * 0.04;
          c.rgb += noise - 0.02;

          gl_FragColor = c;
        }
      `
    };

    this.cinematicPass = new ShaderPass(CinematicShader);
    this.composer.addPass(this.cinematicPass);

    // Add FXAA for buttery smooth edges (fixes jagged edges from lower pixel ratio)
    const fxaaPass = new ShaderPass(FXAAShader);
    fxaaPass.material.uniforms['resolution'].value.x = 1 / (window.innerWidth * this.renderer.getPixelRatio());
    fxaaPass.material.uniforms['resolution'].value.y = 1 / (window.innerHeight * this.renderer.getPixelRatio());
    this.composer.addPass(fxaaPass);

    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
      this.composer.setSize(window.innerWidth, window.innerHeight);
      
      fxaaPass.material.uniforms['resolution'].value.x = 1 / (window.innerWidth * this.renderer.getPixelRatio());
      fxaaPass.material.uniforms['resolution'].value.y = 1 / (window.innerHeight * this.renderer.getPixelRatio());
    });
  }

  private initSystems() {
    this.gameState = new GameState();
    this.audioSynth = new AudioSynth();
    this.input = new Input(this.renderer.domElement);
    this.player = new Player(this.camera, this.input, this.audioSynth);
    this.levelManager = new LevelManager(this.scene);
    this.weaponManager = new WeaponManager(this.scene, this.camera, this.input, this.audioSynth);
    this.enemyManager = new EnemyManager(this.scene, this.player, this.levelManager.collisionBoxes, this.gameState);
    this.fxManager = new FXManager(this.scene);
    this.uiManager = new UIManager(this.player, this.weaponManager, this.enemyManager, this.gameState);

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
    this.player.reset();
    this.weaponManager.selectWeapon(this.weaponManager.currentWeaponKey);
    const curWep = this.weaponManager.getCurrentWeapon();
    curWep.ammoInMag = curWep.magSize;
    curWep.ammoInReserve = curWep.reserveMax;

    this.enemyManager.reset();
    this.fxManager.reset();

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

          // Damage check
          const hitResult = this.enemyManager.checkRaycastHit(raycaster, weapon.damage);
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

        // Shotgun screen shake
        if (weapon.type === 'shotgun') {
          this.triggerScreenShake(0.15);
        }
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
      if (this.input.isLocked) {
        this.uiManager.hidePauseMenu();
        
        this.player.update(dt, (pos, radius) => this.levelManager.collisionCheck(pos, radius));
        
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
          }
        });
        this.fxManager.update(dt);
        this.uiManager.update(dt);

        this.handleShooting();

        // Weapon switcher (5 weapons)
        if (this.input.keys['1']) this.weaponManager.selectWeapon('rifle');
        if (this.input.keys['2']) this.weaponManager.selectWeapon('smg');
        if (this.input.keys['3']) this.weaponManager.selectWeapon('sniper');
        if (this.input.keys['4']) this.weaponManager.selectWeapon('shotgun');
        if (this.input.keys['5']) this.weaponManager.selectWeapon('pistol');

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
          this.gameState.onPlayerDeath();
          this.gameState.updateBestScores(this.enemyManager.kills);
          this.gameState.commitSession();
          this.isPlaying = false;
          this.isGameOver = true;
          this.input.exitLock();
          this.uiManager.showGameOver(false);
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
}

// Start game instance
new Game();
