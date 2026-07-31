import * as THREE from 'three';
import { Player } from './Player';
import { EnemyManager } from './EnemyManager';
import { FXManager } from './FXManager';
import { AudioSynth } from './AudioSynth';

export interface Barrel {
  mesh: THREE.Group;
  bodyMesh: THREE.Mesh;
  position: THREE.Vector3;
  health: number;
  maxHealth: number;
  isExploded: boolean;
  boundingBox: THREE.Box3;
}

export class BarrelManager {
  private scene: THREE.Scene;
  private player: Player;
  private enemyManager: EnemyManager;
  private fxManager: FXManager;
  private audioSynth: AudioSynth;

  public barrels: Barrel[] = [];
  public collisionBoxes: THREE.Box3[] = []; // for player/enemy movement collision

  private spawnPoints: THREE.Vector3[] = [];

  constructor(scene: THREE.Scene, player: Player, enemyManager: EnemyManager, fxManager: FXManager, audioSynth: AudioSynth) {
    this.scene = scene;
    this.player = player;
    this.enemyManager = enemyManager;
    this.fxManager = fxManager;
    this.audioSynth = audioSynth;

    this.spawnAll();
  }

  // Create cylinder mesh with scifi hazard stripes
  private createBarrelMesh(pos: THREE.Vector3): THREE.Group {
    const group = new THREE.Group();
    group.position.copy(pos);

    // Barrel height = 1.6, radius = 0.5
    const cylGeo = new THREE.CylinderGeometry(0.5, 0.5, 1.6, 12);
    
    // Create custom canvas texture for scifi industrial hazard look
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d')!;
    
    // Base red metal
    ctx.fillStyle = '#b33939';
    ctx.fillRect(0, 0, 128, 128);
    
    // Warning yellow/black hazard stripes in center
    ctx.fillStyle = '#f1c40f';
    ctx.fillRect(0, 48, 128, 32);
    
    ctx.fillStyle = '#2c3e50';
    ctx.strokeStyle = '#2c3e50';
    ctx.lineWidth = 6;
    for (let i = -10; i < 150; i += 20) {
      ctx.beginPath();
      ctx.moveTo(i, 48);
      ctx.lineTo(i + 15, 80);
      ctx.stroke();
    }
    
    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.MeshStandardMaterial({
      map: texture,
      roughness: 0.5,
      metalness: 0.8
    });

    const body = new THREE.Mesh(cylGeo, material);
    body.castShadow = false;
    body.receiveShadow = false;
    group.add(body);

    // Black metal rims top and bottom
    const rimMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.7, metalness: 0.9 });
    const rimGeo = new THREE.CylinderGeometry(0.53, 0.53, 0.12, 12);
    
    const topRim = new THREE.Mesh(rimGeo, rimMat);
    topRim.position.y = 0.8;
    group.add(topRim);

    const bottomRim = new THREE.Mesh(rimGeo, rimMat);
    bottomRim.position.y = -0.8;
    group.add(bottomRim);

    // Glowing scifi hazard dot
    const dotGeo = new THREE.SphereGeometry(0.08, 6, 6);
    const dotMat = new THREE.MeshBasicMaterial({ color: 0x00ffcc });
    const dot = new THREE.Mesh(dotGeo, dotMat);
    dot.position.set(0, 0.2, -0.51);
    group.add(dot);

    this.scene.add(group);
    return group;
  }

  // Spawns all barrels
  private spawnAll() {
    this.spawnPoints.forEach(pos => {
      const meshGroup = this.createBarrelMesh(pos);
      const bodyMesh = meshGroup.children[0] as THREE.Mesh;
      
      const bbox = new THREE.Box3().setFromObject(meshGroup);

      this.barrels.push({
        mesh: meshGroup,
        bodyMesh: bodyMesh,
        position: pos.clone(),
        health: 20,
        maxHealth: 20,
        isExploded: false,
        boundingBox: bbox
      });
    });

    this.updateCollisionBoxes();
  }

  // Update list of active collision boxes for player/enemies
  private updateCollisionBoxes() {
    this.collisionBoxes = this.barrels
      .filter(b => !b.isExploded)
      .map(b => b.boundingBox);
  }

  // Respawns exploded barrels (call on restart / intermission)
  public respawnAll() {
    // Clean up current meshes
    this.barrels.forEach(b => this.scene.remove(b.mesh));
    this.barrels = [];
    this.spawnAll();
  }

  // Check shooting raycast hit against barrels
  public checkRaycastHit(raycaster: THREE.Raycaster, damage: number): { hit: boolean; point?: THREE.Vector3 } {
    let closestHit: { barrel: Barrel; distance: number; point: THREE.Vector3 } | null = null;

    for (const b of this.barrels) {
      if (b.isExploded) continue;

      const intersects = raycaster.intersectObject(b.bodyMesh);
      if (intersects.length > 0) {
        const hit = intersects[0];
        if (!closestHit || hit.distance < closestHit.distance) {
          closestHit = {
            barrel: b,
            distance: hit.distance,
            point: hit.point
          };
        }
      }
    }

    if (closestHit) {
      const { barrel, point } = closestHit;
      this.damageBarrel(barrel, damage);
      return { hit: true, point };
    }

    return { hit: false };
  }

  // Damage a barrel and detonate it if health <= 0
  private damageBarrel(barrel: Barrel, damage: number) {
    barrel.health -= damage;
    
    // Flashing feedback when shot
    const mat = barrel.bodyMesh.material as THREE.MeshStandardMaterial;
    mat.emissive.setHex(0xff3300);
    mat.emissiveIntensity = 1.0;
    setTimeout(() => {
      if (!barrel.isExploded) {
        mat.emissive.setHex(0x000000);
        mat.emissiveIntensity = 0;
      }
    }, 80);

    if (barrel.health <= 0) {
      this.explode(barrel);
    }
  }

  // Explode the barrel and deal AoE blast damage/knockback
  private explode(barrel: Barrel) {
    if (barrel.isExploded) return;
    barrel.isExploded = true;
    barrel.health = 0;

    // Remove mesh from scene
    this.scene.remove(barrel.mesh);
    this.updateCollisionBoxes();

    // Trigger visual and audio effects
    this.fxManager.createExplosion(barrel.position);
    this.audioSynth.playExplosion();

    const blastRadius = 8.0;
    const maxDamage = 150.0;

    // 1. AoE Damage to enemies
    this.enemyManager.enemies.forEach(enemy => {
      if (enemy.isDead) return;
      const dist = barrel.position.distanceTo(enemy.position);
      if (dist < blastRadius) {
        // Falloff damage calculation
        const damage = Math.round(maxDamage * (1.0 - dist / blastRadius));
        enemy.health -= damage;

        // Flash enemy red when taking explosion damage
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

    // 2. AoE Damage & Knockback to player
    const distToPlayer = barrel.position.distanceTo(this.player.position);
    if (distToPlayer < blastRadius) {
      const damage = Math.round(maxDamage * (1.0 - distToPlayer / blastRadius));
      this.player.takeDamage(damage);

      // Physics knockback: force vector pointing from barrel to player
      const dir = new THREE.Vector3().subVectors(this.player.position, barrel.position);
      dir.y = 0; // horizontal push
      dir.normalize();
      
      // Scale impulse by proximity
      const impulseScale = 15.0 * (1.0 - distToPlayer / blastRadius);
      const knockbackForce = dir.multiplyScalar(impulseScale);
      knockbackForce.y = 4.0 * (1.0 - distToPlayer / blastRadius); // slight pop up in the air
      
      this.player.applyKnockback(knockbackForce);
    }

    // 3. Chain reactions: detonate nearby barrels
    this.barrels.forEach(other => {
      if (other === barrel || other.isExploded) return;
      const dist = barrel.position.distanceTo(other.position);
      if (dist < blastRadius) {
        // Delay chain reaction slightly for cinematic effect
        setTimeout(() => {
          this.damageBarrel(other, 999);
        }, 120 + Math.random() * 100);
      }
    });
  }
}
