import * as THREE from 'three';

interface Particle {
  mesh: THREE.Points;
  geometry: THREE.BufferGeometry;
  positions: Float32Array;
  velocities: number[];
  colors: Float32Array;
  life: number;
  maxLife: number;
}

interface BulletHole {
  mesh: THREE.Mesh;
  createdAt: number;
}

export class FXManager {
  scene: THREE.Scene;
  particles: Particle[] = [];
  tracers: { mesh: THREE.Mesh; progress: number; speed: number; start: THREE.Vector3; end: THREE.Vector3 }[] = [];
  bulletHoles: BulletHole[] = [];
  maxBulletHoles = 12;
  
  // Reusable vectors to prevent Garbage Collection lag during update loops
  private _tempVec = new THREE.Vector3();

  // Object pooling for Muzzle Flash to prevent shader recompilation lag!
  private muzzleFlashLight: THREE.PointLight;
  private muzzleFlashMesh: THREE.Mesh;
  private muzzleFlashTimer: number = 0;

  // Shared materials to prevent GC pauses
  private playerTracerMat: THREE.Material;
  private enemyTracerMat: THREE.Material;

  constructor(scene: THREE.Scene) {
    this.scene = scene;

    // Pre-allocate muzzle flash
    this.muzzleFlashLight = new THREE.PointLight(0xffaa44, 0, 5);
    this.scene.add(this.muzzleFlashLight);

    const flashGeo = new THREE.SphereGeometry(0.08, 8, 8);
    const flashMat = new THREE.MeshBasicMaterial({ color: 0xffdd44, transparent: true, opacity: 0.95 });
    this.muzzleFlashMesh = new THREE.Mesh(flashGeo, flashMat);
    this.muzzleFlashMesh.visible = false;
    this.scene.add(this.muzzleFlashMesh);

    // Pre-allocate tracer materials
    this.playerTracerMat = new THREE.MeshBasicMaterial({ color: 0xffdd44, transparent: true, opacity: 1.0, blending: THREE.AdditiveBlending, depthWrite: false });
    this.enemyTracerMat = new THREE.MeshBasicMaterial({ color: 0xff3300, transparent: true, opacity: 1.0, blending: THREE.AdditiveBlending, depthWrite: false });
  }

  update(dt: number) {
    // 1. Update active particle systems
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life += dt;

      // Update positions
      const count = p.positions.length / 3;
      for (let j = 0; j < count; j++) {
        const idx = j * 3;
        
        // Apply velocity
        p.positions[idx] += p.velocities[idx] * dt;
        p.positions[idx + 1] += p.velocities[idx + 1] * dt;
        p.positions[idx + 2] += p.velocities[idx + 2] * dt;

        // Apply gravity to debris
        p.velocities[idx + 1] -= 9.8 * dt;

        // Shrink particle size by changing color alpha or simply letting life handle it
      }

      p.geometry.attributes.position.needsUpdate = true;

      // Scale points helper over time
      const mat = p.mesh.material as THREE.PointsMaterial;
      mat.size = THREE.MathUtils.lerp(mat.size, 0.0, dt * 1.5);

      if (p.life >= p.maxLife) {
        this.scene.remove(p.mesh);
        p.geometry.dispose();
        mat.dispose();
        this.particles.splice(i, 1);
      }
    }

    // Update muzzle flash
    if (this.muzzleFlashTimer > 0) {
      this.muzzleFlashTimer -= dt;
      if (this.muzzleFlashTimer <= 0) {
        this.muzzleFlashLight.intensity = 0;
        this.muzzleFlashMesh.visible = false;
      }
    }

    // 2. Update tracer rounds (mesh translation)
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i];
      t.progress += t.speed * dt;

      if (t.progress >= 1.0) {
        this.scene.remove(t.mesh);
        t.mesh.geometry.dispose();
        // Do not dispose material, it is shared
        this.tracers.splice(i, 1);
      } else {
        // Move tracer along path using pre-allocated vector to prevent GC lag
        this._tempVec.lerpVectors(t.start, t.end, t.progress);
        t.mesh.position.copy(this._tempVec);
      }
    }
  }

  // Create spark explosion on bullet impact
  createImpactSparks(point: THREE.Vector3, normal: THREE.Vector3, isEnemy: boolean = false) {
    const particleCount = isEnemy ? 18 : 10;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    const velocities: number[] = [];
    const colors = new Float32Array(particleCount * 3);

    const baseColor = isEnemy ? new THREE.Color(0xff0000) : new THREE.Color(0xffbb33);

    for (let i = 0; i < particleCount; i++) {
      const idx = i * 3;
      // Start slightly offset from surface along normal
      positions[idx] = point.x + normal.x * 0.05;
      positions[idx + 1] = point.y + normal.y * 0.05;
      positions[idx + 2] = point.z + normal.z * 0.05;

      // Random velocities bouncing off surface
      const spread = 4.0;
      velocities.push(
        normal.x * 5.0 + (Math.random() - 0.5) * spread,
        normal.y * 5.0 + Math.random() * spread + 2.0,
        normal.z * 5.0 + (Math.random() - 0.5) * spread
      );

      // Color variation
      colors[idx] = baseColor.r;
      colors[idx + 1] = baseColor.g;
      colors[idx + 2] = baseColor.b;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const material = new THREE.PointsMaterial({
      size: isEnemy ? 0.12 : 0.08,
      vertexColors: true,
      transparent: true,
      blending: THREE.AdditiveBlending,
      opacity: 0.9
    });

    const mesh = new THREE.Points(geometry, material);
    this.scene.add(mesh);

    this.particles.push({
      mesh,
      geometry,
      positions,
      velocities,
      colors,
      life: 0,
      maxLife: 0.6 + Math.random() * 0.4
    });
  }

  // Create muzzle flash light and smoke sparks
  createMuzzleFlash(position: THREE.Vector3, direction: THREE.Vector3) {
    // 1. Spawning flash light point using pre-allocated object to avoid shader recompiles
    this.muzzleFlashLight.position.copy(position).addScaledVector(direction, 0.2);
    this.muzzleFlashLight.intensity = 4.0;
    
    // 2. Muzzle flash glowing mesh
    this.muzzleFlashMesh.position.copy(position).addScaledVector(direction, 0.1);
    this.muzzleFlashMesh.visible = true;

    // Set duration
    this.muzzleFlashTimer = 0.05;
  }

  // Spawns thick glowing bullet tracer meshes (cylinder lasers)
  createTracer(start: THREE.Vector3, end: THREE.Vector3, isEnemy: boolean = false) {
    const distance = start.distanceTo(end);
    const length = Math.min(15.0, distance); // Longer tracers
    // Thicker geometry for better visibility
    const geometry = new THREE.CylinderGeometry(0.06, 0.06, length, 4);
    geometry.rotateX(Math.PI / 2); // Align cylinder along Z axis

    const material = isEnemy ? this.enemyTracerMat : this.playerTracerMat;

    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.copy(start);
    mesh.lookAt(end);
    // Shift mesh forward so it doesn't clip into the camera near plane
    mesh.translateZ(length * 0.5);
    
    this.scene.add(mesh);

    this.tracers.push({
      mesh: mesh,
      progress: 0,
      // Calculate progress speed based on distance (simulate ~250m/s bullet velocity)
      speed: 250.0 / Math.max(distance, 1.0),
      start: start.clone(),
      end: end.clone()
    });
  }

  // Draw permanent bullet holes on obstacles
  createBulletHole(point: THREE.Vector3, normal: THREE.Vector3) {
    // Small black circle/decal oriented parallel to wall
    const holeGeo = new THREE.CircleGeometry(0.06, 8);
    const holeMat = new THREE.MeshBasicMaterial({
      color: 0x111111,
      side: THREE.DoubleSide,
      depthWrite: false, // Prevents z-fighting
      transparent: true,
      opacity: 0.85
    });

    const hole = new THREE.Mesh(holeGeo, holeMat);
    hole.position.copy(point).addScaledVector(normal, 0.005); // push slightly away from surface to prevent z-fighting
    
    // Rotate to align with normal
    hole.lookAt(point.clone().add(normal));

    this.scene.add(hole);
    this.bulletHoles.push({ mesh: hole, createdAt: Date.now() });

    // Enforce size limits
    if (this.bulletHoles.length > this.maxBulletHoles) {
      const oldest = this.bulletHoles.shift();
      if (oldest) {
        this.scene.remove(oldest.mesh);
        oldest.mesh.geometry.dispose();
        (oldest.mesh.material as THREE.Material).dispose();
      }
    }
  }

  reset() {
    this.particles.forEach(p => this.scene.remove(p.mesh));
    this.particles = [];
    this.tracers.forEach(t => this.scene.remove(t.mesh));
    this.tracers = [];
    this.bulletHoles.forEach(h => this.scene.remove(h.mesh));
    this.bulletHoles = [];
  }
}
