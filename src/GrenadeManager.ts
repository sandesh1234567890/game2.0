import * as THREE from 'three';
import { Player } from './Player';
import { EnemyManager } from './EnemyManager';
import { FXManager } from './FXManager';
import { AudioSynth } from './AudioSynth';
import { BarrelManager } from './BarrelManager';

export interface GrenadeProjectile {
  mesh: THREE.Group;
  indicatorMesh: THREE.Mesh;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  timer: number;       // Counts up to 2.5s
  rotationSpeed: THREE.Vector3;
}

export class GrenadeManager {
  private scene: THREE.Scene;
  private player: Player;
  private enemyManager: EnemyManager;
  private fxManager: FXManager;
  private audioSynth: AudioSynth;
  private barrelManager: BarrelManager;
  private allCollisionBoxes: THREE.Box3[];

  private grenades: GrenadeProjectile[] = [];
  private trailTimer = 0;
  public onExplosion?: (intensity: number) => void;
  
  // Reusable bounding box for collision detection
  private _grenadeBox = new THREE.Box3();
  private _nextPos = new THREE.Vector3();

  constructor(
    scene: THREE.Scene,
    player: Player,
    enemyManager: EnemyManager,
    fxManager: FXManager,
    audioSynth: AudioSynth,
    barrelManager: BarrelManager,
    allCollisionBoxes: THREE.Box3[]
  ) {
    this.scene = scene;
    this.player = player;
    this.enemyManager = enemyManager;
    this.fxManager = fxManager;
    this.audioSynth = audioSynth;
    this.barrelManager = barrelManager;
    this.allCollisionBoxes = allCollisionBoxes;
  }

  // Create grenade visual mesh (cylindrical scifi core with LED indicator)
  private createGrenadeMesh(): { group: THREE.Group; indicator: THREE.Mesh } {
    const group = new THREE.Group();

    // Body: metallic scifi cylinder
    const bodyGeo = new THREE.CylinderGeometry(0.12, 0.12, 0.35, 8);
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0x444d44,
      roughness: 0.6,
      metalness: 0.8
    });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    group.add(body);

    // End caps: black metal
    const capGeo = new THREE.CylinderGeometry(0.13, 0.13, 0.05, 8);
    const capMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.8 });
    
    const topCap = new THREE.Mesh(capGeo, capMat);
    topCap.position.y = 0.18;
    group.add(topCap);

    const bottomCap = new THREE.Mesh(capGeo, capMat);
    bottomCap.position.y = -0.18;
    group.add(bottomCap);

    // Pulsing LED Indicator band around center
    const ledGeo = new THREE.CylinderGeometry(0.125, 0.125, 0.08, 8);
    const ledMat = new THREE.MeshBasicMaterial({ color: 0x00ff00 }); // starts green
    const led = new THREE.Mesh(ledGeo, ledMat);
    group.add(led);

    this.scene.add(group);
    return { group, indicator: led };
  }

  // Launches a grenade from player position
  public throwGrenade(camera: THREE.Camera) {
    if (this.player.grenades <= 0 || this.player.isDead) return;
    this.player.grenades--;

    const { group, indicator } = this.createGrenadeMesh();
    
    // Spawn grenade slightly forward and lower from camera
    const spawnPos = camera.position.clone();
    const throwDir = new THREE.Vector3();
    camera.getWorldDirection(throwDir);

    spawnPos.addScaledVector(throwDir, 0.5);
    spawnPos.y -= 0.2;
    group.position.copy(spawnPos);

    // Initial velocity vector (throw speed ~16 m/s forward + slight upward arc)
    const velocity = throwDir.clone().multiplyScalar(16.0);
    velocity.y += 4.5; // Upward lob

    this.grenades.push({
      mesh: group,
      indicatorMesh: indicator,
      position: spawnPos,
      velocity: velocity,
      timer: 0.0,
      rotationSpeed: new THREE.Vector3(
        (Math.random() - 0.5) * 8.0,
        (Math.random() - 0.5) * 8.0,
        (Math.random() - 0.5) * 8.0
      )
    });
  }

  public update(dt: number) {
    this.trailTimer -= dt;
    const shouldSpawnTrail = this.trailTimer <= 0;
    if (shouldSpawnTrail) {
      this.trailTimer = 0.04; // 25 particles/sec
    }

    const gravity = 18.0;

    for (let i = this.grenades.length - 1; i >= 0; i--) {
      const g = this.grenades[i];
      g.timer += dt;

      // 1. LED indicator pulsing (flashes green, speeds up and turns red near detonation)
      const fuseTime = 2.5;
      const progress = g.timer / fuseTime;
      const pulseSpeed = progress < 0.5 ? 5.0 : (progress < 0.8 ? 12.0 : 25.0);
      const isLit = Math.sin(g.timer * pulseSpeed * Math.PI) > 0.0;
      
      const ledMat = g.indicatorMesh.material as THREE.MeshBasicMaterial;
      if (isLit) {
        // Linearly interpolate color from green to red
        const color = new THREE.Color().lerpColors(new THREE.Color(0x00ff00), new THREE.Color(0xff0000), progress);
        ledMat.color.copy(color);
      } else {
        ledMat.color.setHex(0x111111); // Off/Dim state
      }

      // 2. Physics & Kinematics
      g.velocity.y -= gravity * dt; // Gravity pull

      // Calculate next position
      this._nextPos.copy(g.position).addScaledVector(g.velocity, dt);

      // Bounding box check for grenade (radius ~0.15)
      const r = 0.15;
      this._grenadeBox.min.set(this._nextPos.x - r, this._nextPos.y - r, this._nextPos.z - r);
      this._grenadeBox.max.set(this._nextPos.x + r, this._nextPos.y + r, this._nextPos.z + r);

      let colliding = false;
      let collBox: THREE.Box3 | null = null;
      for (let j = 0; j < this.allCollisionBoxes.length; j++) {
        if (this._grenadeBox.intersectsBox(this.allCollisionBoxes[j])) {
          colliding = true;
          collBox = this.allCollisionBoxes[j];
          break;
        }
      }

      // Hard floor fallback
      if (this._nextPos.y < 0.15) {
        g.position.y = 0.15;
        g.velocity.y = -g.velocity.y * 0.45; // Bounce off floor with energy loss
        g.velocity.x *= 0.75; // Friction
        g.velocity.z *= 0.75;
        
        // Spin drag on ground
        g.rotationSpeed.multiplyScalar(0.7);
      } else if (colliding && collBox) {
        // Simple bounce response
        // Determine normal of bounce by checking closest side of bounding box
        const center = g.position;
        const min = collBox.min;
        const max = collBox.max;
        
        const dx1 = Math.abs(center.x - min.x);
        const dx2 = Math.abs(center.x - max.x);
        const dy1 = Math.abs(center.y - min.y);
        const dy2 = Math.abs(center.y - max.y);
        const dz1 = Math.abs(center.z - min.z);
        const dz2 = Math.abs(center.z - max.z);
        
        const minDist = Math.min(dx1, dx2, dy1, dy2, dz1, dz2);
        
        if (minDist === dx1) { g.velocity.x = -Math.abs(g.velocity.x) * 0.45; }
        else if (minDist === dx2) { g.velocity.x = Math.abs(g.velocity.x) * 0.45; }
        else if (minDist === dy1) { g.velocity.y = -Math.abs(g.velocity.y) * 0.45; }
        else if (minDist === dy2) { g.velocity.y = Math.abs(g.velocity.y) * 0.45; }
        else if (minDist === dz1) { g.velocity.z = -Math.abs(g.velocity.z) * 0.45; }
        else if (minDist === dz2) { g.velocity.z = Math.abs(g.velocity.z) * 0.45; }
        
        // Friction on bounce
        g.velocity.multiplyScalar(0.8);
      } else {
        // Free air travel
        g.position.copy(this._nextPos);
      }

      g.mesh.position.copy(g.position);

      // Spin rotation animations
      g.mesh.rotation.x += g.rotationSpeed.x * dt;
      g.mesh.rotation.y += g.rotationSpeed.y * dt;
      g.mesh.rotation.z += g.rotationSpeed.z * dt;

      // 3. Spawn scifi green spark trails
      if (shouldSpawnTrail && g.velocity.lengthSq() > 1.0) {
        this.spawnTrailSpark(g.position);
      }

      // 4. Detonation
      if (g.timer >= fuseTime) {
        this.detonate(g);
        this.grenades.splice(i, 1);
      }
    }
  }

  // Detonates the grenade, triggering AoE damage and particles
  private detonate(g: GrenadeProjectile) {
    // Remove mesh
    this.scene.remove(g.mesh);

    // Call explosion visual and audio
    this.fxManager.createExplosion(g.position);
    this.audioSynth.playExplosion();

    const blastRadius = 8.0;
    const maxDamage = 120.0;

    // 1. Deal damage to enemies
    this.enemyManager.enemies.forEach(enemy => {
      if (enemy.isDead) return;
      const dist = g.position.distanceTo(enemy.position);
      if (dist < blastRadius) {
        const damage = Math.round(maxDamage * (1.0 - dist / blastRadius));
        enemy.health -= damage;

        // Flash enemy red when hit by grenade
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
          this.enemyManager.kills++;
        }
      }
    });

    // 2. Deal damage to red barrels (chain trigger!)
    this.barrelManager.barrels.forEach(barrel => {
      if (barrel.isExploded) return;
      const dist = g.position.distanceTo(barrel.position);
      if (dist < blastRadius) {
        const damage = Math.round(maxDamage * (1.0 - dist / blastRadius));
        barrel.health -= damage;
        if (barrel.health <= 0) {
          // Explode the barrel via barrelManager checkRaycastHit dummy shot
          const dummyRay = new THREE.Raycaster(g.position, new THREE.Vector3(0, -1, 0));
          this.barrelManager.checkRaycastHit(dummyRay, 999);
        }
      }
    });

    // 3. Deal damage and knockback to player
    const distToPlayer = g.position.distanceTo(this.player.position);
    if (distToPlayer < blastRadius) {
      const damage = Math.round(maxDamage * (1.0 - distToPlayer / blastRadius));
      this.player.takeDamage(damage);

      // Directional push
      const dir = new THREE.Vector3().subVectors(this.player.position, g.position);
      dir.y = 0;
      dir.normalize();

      const impulseScale = 12.0 * (1.0 - distToPlayer / blastRadius);
      const knockbackForce = dir.multiplyScalar(impulseScale);
      knockbackForce.y = 3.5 * (1.0 - distToPlayer / blastRadius);

      this.player.applyKnockback(knockbackForce);
    }

    // Trigger screen shake callback based on distance to player
    const maxShakeRadius = 16.0;
    if (distToPlayer < maxShakeRadius && this.onExplosion) {
      const shakeAmount = 0.75 * (1.0 - distToPlayer / maxShakeRadius);
      this.onExplosion(shakeAmount);
    }
  }

  // Helper to spawn a scifi green spark trail particle
  private spawnTrailSpark(point: THREE.Vector3) {
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(3);
    positions[0] = point.x;
    positions[1] = point.y;
    positions[2] = point.z;

    const colors = new Float32Array([0.0, 1.0, 0.5]); // green/cyan

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const material = new THREE.PointsMaterial({
      size: 0.18,
      vertexColors: true,
      transparent: true,
      blending: THREE.AdditiveBlending,
      opacity: 0.8
    });

    const mesh = new THREE.Points(geometry, material);
    this.scene.add(mesh);

    this.fxManager.particles.push({
      mesh,
      geometry,
      positions,
      velocities: [(Math.random() - 0.5) * 1.5, Math.random() * 1.0, (Math.random() - 0.5) * 1.5],
      colors,
      life: 0,
      maxLife: 0.4
    });
  }

  public reset() {
    this.grenades.forEach(g => this.scene.remove(g.mesh));
    this.grenades = [];
  }
}
