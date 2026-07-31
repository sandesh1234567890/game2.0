import * as THREE from 'three';
import { TextureGenerator } from './TextureGenerator';
import { Player } from './Player';
import { GameState } from './GameState';

export type EnemyType = 'grunt' | 'scout' | 'tank';

export interface Enemy {
  mesh: THREE.Group;
  bodyMesh: THREE.Mesh;
  headMesh: THREE.Mesh;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  health: number;
  maxHealth: number;
  isDead: boolean;
  deathTimer: number;
  lastShotTime: number;
  shootInterval: number;
  color: THREE.Color;
  speed: number;
  accuracy: number;
  enemyType: EnemyType;

  // AI behavior state
  strafeDir: number;      // -1 or 1
  strafeTimer: number;
  isRetreating: boolean;
  originalMaterials: THREE.Material[];
  thermalMaterials: THREE.Material[];
}

export class EnemyManager {
  scene: THREE.Scene;
  enemies: Enemy[] = [];
  objectsGroup: THREE.Group;
  
  // Stats
  kills = 0;
  deaths = 0;
  spawnedCount = 0;
  maxEnemies = 5;

  // Wave state
  waveEnemiesRemaining = 0;
  waveEnemiesSpawned = 0;

  private player: Player;
  private collisionBoxes: THREE.Box3[];
  private gameState: GameState;

  // Vision mode support
  thermalActive = false;

  // Cached Geometries
  private geoTorso = new THREE.BoxGeometry(0.55, 0.75, 0.35);
  private geoVest = new THREE.BoxGeometry(0.6, 0.55, 0.4);
  private geoPlate = new THREE.BoxGeometry(0.4, 0.35, 0.43);
  private geoExtraArmor = new THREE.BoxGeometry(0.65, 0.45, 0.48);
  private geoLeg = new THREE.BoxGeometry(0.18, 0.65, 0.2);
  private geoBoot = new THREE.BoxGeometry(0.2, 0.12, 0.28);
  private geoHead = new THREE.SphereGeometry(0.2, 10, 10);
  private geoHelmet = new THREE.CylinderGeometry(0.22, 0.22, 0.18, 10);
  private geoVisor = new THREE.BoxGeometry(0.26, 0.07, 0.08);
  private geoShoulder = new THREE.BoxGeometry(0.18, 0.18, 0.18);
  private geoGun = new THREE.BoxGeometry(0.1, 0.1, 0.65);

  // Cached Materials
  private matNormal!: THREE.MeshStandardMaterial;
  private matFast!: THREE.MeshStandardMaterial;
  private matTank!: THREE.MeshStandardMaterial;
  private matArmor!: THREE.MeshStandardMaterial;
  private matVisor!: THREE.MeshStandardMaterial;
  private matThermalHot!: THREE.MeshBasicMaterial;
  private matThermalWarm!: THREE.MeshBasicMaterial;
  
  // Reusable objects for update loop to prevent massive GC lag
  private _toPlayer = new THREE.Vector3();
  private _dir = new THREE.Vector3();
  private _moveDir = new THREE.Vector3();
  private _strafeVec = new THREE.Vector3();
  private _nextPos = new THREE.Vector3();
  private _enemyBox = new THREE.Box3();
  private _slideDir = new THREE.Vector3();
  private _slideVel = new THREE.Vector3();
  private _slidePos = new THREE.Vector3();

  constructor(scene: THREE.Scene, player: Player, collisionBoxes: THREE.Box3[], gameState: GameState) {
    this.scene = scene;
    this.player = player;
    this.collisionBoxes = collisionBoxes;
    this.gameState = gameState;
    this.initCachedMaterials();

    this.objectsGroup = new THREE.Group();
    this.scene.add(this.objectsGroup);
  }

  private initCachedMaterials() {
    const camoTex = TextureGenerator.generateCamoTexture(128); // Lower res for perf
    this.matNormal = new THREE.MeshStandardMaterial({ map: camoTex, roughness: 0.9, metalness: 0.1 });
    this.matFast = new THREE.MeshStandardMaterial({ map: camoTex, roughness: 0.9, metalness: 0.1, color: 0xdddddd });
    this.matTank = new THREE.MeshStandardMaterial({ map: camoTex, roughness: 0.9, metalness: 0.1, color: 0x999999 });

    this.matArmor = new THREE.MeshStandardMaterial({ color: 0x4a5320, roughness: 0.8, metalness: 0.2 });
    this.matVisor = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.2, metalness: 0.8 });

    this.matThermalHot = new THREE.MeshBasicMaterial({ color: 0xff3300 });
    this.matThermalWarm = new THREE.MeshBasicMaterial({ color: 0xffaa00 });
  }

  startWave(waveNumber: number) {
    const count = this.gameState.getWaveEnemyCount();
    this.waveEnemiesRemaining = count;
    this.waveEnemiesSpawned = 0;
    this.maxEnemies = Math.min(8, 3 + waveNumber);

    // Spawn initial batch
    const initialSpawn = Math.min(this.maxEnemies, count);
    for (let i = 0; i < initialSpawn; i++) {
      this.spawnEnemy();
    }
  }

  getAliveCount(): number {
    return this.enemies.filter(e => !e.isDead).length;
  }

  isWaveCleared(): boolean {
    return this.waveEnemiesRemaining <= 0 && this.getAliveCount() === 0;
  }

  update(dt: number, createTracer: (start: THREE.Vector3, end: THREE.Vector3, isEnemy: boolean) => void) {
    // 1. Spawn replacements if wave has more enemies to send
    if (this.waveEnemiesRemaining > 0 && this.getAliveCount() < this.maxEnemies && Math.random() < 0.02) {
      this.spawnEnemy();
    }

    const playerPos = this.player.position;

    this.enemies.forEach((enemy) => {
      if (enemy.isDead) {
        // Dissolve transition
        enemy.deathTimer += dt;
        const progress = enemy.deathTimer / 1.5;
        
        enemy.mesh.position.y += 1.0 * dt;
        enemy.mesh.scale.setScalar(1 - progress);

        const mat = enemy.bodyMesh.material as THREE.MeshStandardMaterial;
        mat.emissive.setHex(0xff3300);
        mat.emissiveIntensity = THREE.MathUtils.lerp(1.0, 10.0, progress);
        mat.opacity = 1 - progress;

        if (progress >= 1.0) {
          this.scene.remove(enemy.mesh);
        }
        return;
      }

      // 2. AI Behavior
      this._toPlayer.subVectors(playerPos, enemy.position);
      this._toPlayer.y = 0;
      const distance = this._toPlayer.length();

      // Rotate enemy toward player
      const angle = Math.atan2(this._toPlayer.x, this._toPlayer.z);
      enemy.mesh.rotation.y = angle;

      // Direct movement vector
      this._dir.copy(this._toPlayer).normalize();

      // --- Retreat behavior: if health low, move away ---
      if (enemy.health < enemy.maxHealth * 0.4 && distance < 15) {
        enemy.isRetreating = true;
      }
      if (enemy.isRetreating && (distance > 20 || enemy.health >= enemy.maxHealth * 0.6)) {
        enemy.isRetreating = false;
      }

      if (enemy.isRetreating) {
        this._moveDir.copy(this._dir).negate(); // run away
      } else {
        this._moveDir.copy(this._dir);
      }

      // --- Strafing behavior while in combat range ---
      enemy.strafeTimer -= dt;
      if (enemy.strafeTimer <= 0) {
        enemy.strafeDir = Math.random() > 0.5 ? 1 : -1;
        enemy.strafeTimer = 1.5 + Math.random() * 2.0;
      }

      if (distance < 25 && distance > 5 && !enemy.isRetreating) {
        // Strafe perpendicular to player direction
        this._strafeVec.set(-this._dir.z, 0, this._dir.x).multiplyScalar(enemy.strafeDir);
        this._moveDir.add(this._strafeVec.multiplyScalar(0.6));
        this._moveDir.normalize();
      }

      enemy.velocity.copy(this._moveDir).multiplyScalar(enemy.speed);

      this._nextPos.copy(enemy.position).addScaledVector(enemy.velocity, dt);

      // Box collision checks
      this._enemyBox.min.set(this._nextPos.x - 0.5, this._nextPos.y - 0.9, this._nextPos.z - 0.5);
      this._enemyBox.max.set(this._nextPos.x + 0.5, this._nextPos.y + 0.9, this._nextPos.z + 0.5);

      let colliding = false;
      for (let i = 0; i < this.collisionBoxes.length; i++) {
        if (this._enemyBox.intersectsBox(this.collisionBoxes[i])) {
          colliding = true;
          break;
        }
      }

      const shouldMove = enemy.isRetreating ? true : distance > 4.0;

      if (!colliding && shouldMove) {
        enemy.position.copy(this._nextPos);
        enemy.mesh.position.copy(enemy.position);
      } else if (colliding) {
        this._slideDir.set(-this._dir.z, 0, this._dir.x);
        this._slideVel.copy(this._slideDir).multiplyScalar(enemy.speed);
        this._slidePos.copy(enemy.position).addScaledVector(this._slideVel, dt);

        this._enemyBox.min.set(this._slidePos.x - 0.5, this._slidePos.y - 0.9, this._slidePos.z - 0.5);
        this._enemyBox.max.set(this._slidePos.x + 0.5, this._slidePos.y + 0.9, this._slidePos.z + 0.5);

        let slideColliding = false;
        for (let i = 0; i < this.collisionBoxes.length; i++) {
          if (this._enemyBox.intersectsBox(this.collisionBoxes[i])) {
            slideColliding = true;
            break;
          }
        }
        if (!slideColliding) {
          enemy.position.copy(this._slidePos);
          enemy.mesh.position.copy(enemy.position);
        }
      }

      // 3. Fire at player logic
      const now = Date.now();
      const withinShootingRange = distance < 30.0;
      if (withinShootingRange && now - enemy.lastShotTime > enemy.shootInterval && !enemy.isRetreating) {
        enemy.lastShotTime = now;
        
        const origin = enemy.position.clone().add(new THREE.Vector3(0, 0.5, 0));
        const target = playerPos.clone().add(new THREE.Vector3(0, -0.3, 0));
        const shootDir = new THREE.Vector3().subVectors(target, origin).normalize();
        
        const ray = new THREE.Raycaster(origin, shootDir);
        const intersects = ray.intersectObjects(this.scene.children, true);
        
        let hasLineOfSight = true;
        for (let i = 0; i < intersects.length; i++) {
          if (enemy.mesh.getObjectById(intersects[i].object.id) || intersects[i].object === enemy.bodyMesh || intersects[i].object === enemy.headMesh) {
            continue;
          }
          if (intersects[i].distance < distance - 1.0) {
            hasLineOfSight = false;
            break;
          }
        }

        if (hasLineOfSight && !this.player.isDead) {
          const gunTip = origin.clone().addScaledVector(shootDir, 0.8);
          createTracer(gunTip, playerPos, true);

          // Accuracy-based hit chance (scales with wave)
          if (Math.random() < enemy.accuracy) {
            const dmg = Math.floor(Math.random() * 8) + 8;
            this.player.takeDamage(dmg);
          }
        }
      }
    });

    // Filter out fully dissolved enemies
    this.enemies = this.enemies.filter(e => !(e.isDead && e.deathTimer >= 1.5));
  }

  spawnEnemy() {
    if (this.waveEnemiesRemaining <= 0) return;
    
    this.waveEnemiesRemaining--;
    this.waveEnemiesSpawned++;
    this.spawnedCount++;

    const wave = this.gameState.currentWave;

    // Determine enemy type based on wave
    let enemyType: EnemyType = 'grunt';
    if (wave >= 2) {
      const roll = Math.random();
      if (roll < 0.25) enemyType = 'scout';
      else if (roll < 0.4 && wave >= 3) enemyType = 'tank';
    }

    const group = new THREE.Group();

    // Spawning coordinates
    let sx = 0, sz = 0;
    do {
      sx = (Math.random() - 0.5) * 80;
      sz = (Math.random() - 0.5) * 80;
    } while (this.player.position.distanceTo(new THREE.Vector3(sx, 1.8, sz)) < 15.0);

    const pos = new THREE.Vector3(sx, 1.1, sz);
    group.position.copy(pos);

    // Type-based stats
    let hp = 100;
    let speed = this.gameState.getWaveEnemySpeed();
    let accuracy = this.gameState.getWaveEnemyAccuracy();
    let shootInterval = this.gameState.getWaveEnemyShootInterval();
    if (enemyType === 'scout') {
      hp = 60;
      speed *= 1.5;
      accuracy *= 0.8;
      shootInterval *= 0.7;
    } else if (enemyType === 'tank') {
      hp = 200;
      speed *= 0.6;
      accuracy *= 1.1;
      shootInterval *= 1.3;
    }

    const suitMat = enemyType === 'scout' ? this.matFast : (enemyType === 'tank' ? this.matTank : this.matNormal);

    const originalMats = [suitMat, this.matArmor, this.matArmor, this.matArmor, this.matVisor];
    const thermalMats = [this.matThermalHot, this.matThermalWarm, this.matThermalHot, this.matThermalWarm, this.matThermalHot];

    // 1. Torso & Vest
    const bodyGroup = new THREE.Group();
    bodyGroup.position.y = 0.9;
    group.add(bodyGroup);

    const torso = new THREE.Mesh(this.geoTorso, suitMat);
    bodyGroup.add(torso);

    const vest = new THREE.Mesh(this.geoVest, this.matArmor);
    vest.position.set(0, 0.05, 0);
    bodyGroup.add(vest);

    const plate = new THREE.Mesh(this.geoPlate, this.matArmor);
    plate.position.set(0, 0.08, 0);
    bodyGroup.add(plate);

    // Tank gets extra bulk
    if (enemyType === 'tank') {
      const extraArmor = new THREE.Mesh(this.geoExtraArmor, this.matArmor);
      extraArmor.position.set(0, 0.1, 0);
      bodyGroup.add(extraArmor);
    }

    // 2. Legs
    const leftLeg = new THREE.Mesh(this.geoLeg, suitMat);
    leftLeg.position.set(-0.18, 0.3, 0);
    group.add(leftLeg);
    const rightLeg = new THREE.Mesh(this.geoLeg, suitMat);
    rightLeg.position.x = 0.18;
    rightLeg.position.y = 0.3;
    group.add(rightLeg);

    const leftBoot = new THREE.Mesh(this.geoBoot, this.matVisor);
    leftBoot.position.set(-0.18, 0.06, 0.03);
    group.add(leftBoot);
    const rightBoot = new THREE.Mesh(this.geoBoot, this.matVisor);
    rightBoot.position.set(0.18, 0.06, 0.03);
    group.add(rightBoot);

    // 3. Head & Helmet
    const head = new THREE.Mesh(this.geoHead, suitMat);
    head.position.y = 1.48;
    group.add(head);

    const helmet = new THREE.Mesh(this.geoHelmet, this.matArmor);
    helmet.position.set(0, 1.56, 0);
    group.add(helmet);

    const visor = new THREE.Mesh(this.geoVisor, this.matVisor);
    visor.position.set(0, 1.5, -0.18);
    group.add(visor);

    // 4. Arms & Shoulders
    const leftShoulder = new THREE.Mesh(this.geoShoulder, this.matArmor);
    leftShoulder.position.set(-0.38, 1.15, 0);
    group.add(leftShoulder);
    const rightShoulder = new THREE.Mesh(this.geoShoulder, this.matArmor);
    rightShoulder.position.set(0.38, 1.15, 0);
    group.add(rightShoulder);

    // Gun
    const gun = new THREE.Mesh(this.geoGun, this.matVisor);
    gun.position.set(0.42, 0.9, -0.28);
    group.add(gun);
    // Enable shadows for all body parts
    group.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });

    this.scene.add(group);

    const enemy: Enemy = {
      mesh: group,
      bodyMesh: vest,
      headMesh: helmet,
      position: pos,
      velocity: new THREE.Vector3(),
      health: hp,
      maxHealth: hp,
      isDead: false,
      deathTimer: 0,
      lastShotTime: Date.now() + Math.random() * 2000,
      shootInterval: shootInterval + Math.random() * 400,
      color: new THREE.Color(0xff3300),
      speed: speed,
      accuracy: accuracy,
      enemyType: enemyType,
      strafeDir: Math.random() > 0.5 ? 1 : -1,
      strafeTimer: 1.0 + Math.random() * 2.0,
      isRetreating: false,
      originalMaterials: originalMats,
      thermalMaterials: thermalMats
    };

    this.enemies.push(enemy);
  }

  // Toggle thermal vision materials on all enemies
  setThermalVision(active: boolean) {
    this.thermalActive = active;
    this.enemies.forEach(enemy => {
      if (enemy.isDead) return;
      // Swap body and head materials
      if (active) {
        (enemy.bodyMesh.material as THREE.MeshStandardMaterial).color.setHex(0xff6600);
        (enemy.bodyMesh.material as THREE.MeshStandardMaterial).emissive.setHex(0xff4400);
        (enemy.bodyMesh.material as THREE.MeshStandardMaterial).emissiveIntensity = 2.0;
      } else {
        (enemy.bodyMesh.material as THREE.MeshStandardMaterial).color.setHex(0x2f3640);
        (enemy.bodyMesh.material as THREE.MeshStandardMaterial).emissive.setHex(0x000000);
        (enemy.bodyMesh.material as THREE.MeshStandardMaterial).emissiveIntensity = 0;
      }
    });
  }

  checkRaycastHit(raycaster: THREE.Raycaster, damage: number): { hit: boolean; headshot: boolean; point?: THREE.Vector3 } {
    let bestHit: { enemy: Enemy; distance: number; headshot: boolean; point: THREE.Vector3 } | null = null;

    for (const enemy of this.enemies) {
      if (enemy.isDead) continue;

      const intersects = raycaster.intersectObjects([enemy.bodyMesh, enemy.headMesh]);
      if (intersects.length > 0) {
        const hit = intersects[0];
        if (!bestHit || hit.distance < bestHit.distance) {
          const isHeadshot = hit.object === enemy.headMesh;
          bestHit = {
            enemy,
            distance: hit.distance,
            headshot: isHeadshot,
            point: hit.point
          };
        }
      }
    }

    if (bestHit) {
      const hitResult = bestHit as { enemy: Enemy; distance: number; headshot: boolean; point: THREE.Vector3 };
      const { enemy, headshot, point } = hitResult;
      const finalDmg = headshot ? damage * 2.5 : damage;
      
      enemy.health -= finalDmg;
      
      const bodyMat = enemy.bodyMesh.material as THREE.MeshStandardMaterial;
      const originalColor = bodyMat.color.clone();
      bodyMat.color.setHex(0xffffff);
      setTimeout(() => {
        if (!enemy.isDead) {
          bodyMat.color.copy(originalColor);
        }
      }, 80);

      if (enemy.health <= 0) {
        enemy.health = 0;
        enemy.isDead = true;
        this.kills++;
      }

      return { hit: true, headshot, point };
    }

    return { hit: false, headshot: false };
  }

  // Kill all enemies (airstrike streak)
  killAllEnemies() {
    this.enemies.forEach(enemy => {
      if (!enemy.isDead) {
        enemy.isDead = true;
        enemy.health = 0;
        this.kills++;
      }
    });
  }

  reset() {
    this.enemies.forEach(e => this.scene.remove(e.mesh));
    this.enemies = [];
    this.kills = 0;
    this.deaths = 0;
    this.spawnedCount = 0;
    this.waveEnemiesRemaining = 0;
    this.waveEnemiesSpawned = 0;
  }
}
