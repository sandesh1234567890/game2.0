import * as THREE from 'three';
import { TextureGenerator } from './TextureGenerator';
import { Input } from './Input';
import { AudioSynth } from './AudioSynth';

export interface WeaponData {
  name: string;
  type: string;
  magSize: number;
  reserveMax: number;
  ammoInMag: number;
  ammoInReserve: number;
  fireRate: number; // shots per minute
  fireMode: 'auto' | 'semi';
  damage: number;
  recoilVertical: number;
  recoilHorizontal: number;
  adsFov: number;
  reloadTime: number;
  pellets?: number;       // shotgun pellet count
  pelletSpread?: number;  // shotgun cone spread
  // Positioning offsets relative to camera
  hipPosition: THREE.Vector3;
  adsPosition: THREE.Vector3;
  scale: THREE.Vector3;
}

export class WeaponManager {
  weapons: { [key: string]: WeaponData } = {
    rifle: {
      name: 'M4-VORTEX',
      type: 'rifle',
      magSize: 30,
      reserveMax: 120,
      ammoInMag: 30,
      ammoInReserve: 120,
      fireRate: 650,
      fireMode: 'auto',
      damage: 34,
      recoilVertical: 0.05,
      recoilHorizontal: 0.02,
      adsFov: 42,
      reloadTime: 2.2,
      hipPosition: new THREE.Vector3(0.24, -0.28, -0.45),
      adsPosition: new THREE.Vector3(0.0, -0.19, -0.32),
      scale: new THREE.Vector3(0.06, 0.06, 0.28)
    },
    smg: {
      name: 'PHANTOM-K',
      type: 'smg',
      magSize: 35,
      reserveMax: 140,
      ammoInMag: 35,
      ammoInReserve: 140,
      fireRate: 900,
      fireMode: 'auto',
      damage: 22,
      recoilVertical: 0.035,
      recoilHorizontal: 0.03,
      adsFov: 48,
      reloadTime: 1.8,
      hipPosition: new THREE.Vector3(0.22, -0.26, -0.40),
      adsPosition: new THREE.Vector3(0.0, -0.18, -0.28),
      scale: new THREE.Vector3(0.055, 0.055, 0.22)
    },
    sniper: {
      name: 'APEX-50',
      type: 'sniper',
      magSize: 5,
      reserveMax: 15,
      ammoInMag: 5,
      ammoInReserve: 15,
      fireRate: 48,
      fireMode: 'semi',
      damage: 100,
      recoilVertical: 0.22,
      recoilHorizontal: 0.05,
      adsFov: 18,
      reloadTime: 3.5,
      hipPosition: new THREE.Vector3(0.28, -0.32, -0.55),
      adsPosition: new THREE.Vector3(0.0, -0.21, -0.45),
      scale: new THREE.Vector3(0.05, 0.06, 0.45)
    },
    shotgun: {
      name: 'HAVOC-12',
      type: 'shotgun',
      magSize: 8,
      reserveMax: 24,
      ammoInMag: 8,
      ammoInReserve: 24,
      fireRate: 80,
      fireMode: 'semi',
      damage: 18,
      pellets: 6,
      pelletSpread: 0.08,
      recoilVertical: 0.18,
      recoilHorizontal: 0.08,
      adsFov: 55,
      reloadTime: 2.8,
      hipPosition: new THREE.Vector3(0.26, -0.30, -0.50),
      adsPosition: new THREE.Vector3(0.0, -0.20, -0.38),
      scale: new THREE.Vector3(0.06, 0.06, 0.35)
    },
    pistol: {
      name: 'ION-9',
      type: 'pistol',
      magSize: 15,
      reserveMax: 60,
      ammoInMag: 15,
      ammoInReserve: 60,
      fireRate: 450,
      fireMode: 'semi',
      damage: 25,
      recoilVertical: 0.03,
      recoilHorizontal: 0.015,
      adsFov: 50,
      reloadTime: 1.5,
      hipPosition: new THREE.Vector3(0.18, -0.25, -0.35),
      adsPosition: new THREE.Vector3(0.0, -0.17, -0.25),
      scale: new THREE.Vector3(0.045, 0.045, 0.15)
    }
  };

  currentWeaponKey = 'rifle';
  isReloading = false;
  reloadProgress = 0;
  isADS = false;
  isThrowing = false;
  throwProgress = 0;
  throwDuration = 0.5;

  // Visual offsets for animation
  weaponGroup: THREE.Group;
  private camera: THREE.Camera;
  private input: Input;
  private scene: THREE.Scene;
  private audioSynth: AudioSynth;

  // Continuous Laser Sight Beam
  private laserLine!: THREE.Line;
  private laserTarget = new THREE.Vector3();

  // Lerped state variables
  private currentWeaponPosition = new THREE.Vector3();
  
  // Recoil physics
  private recoilPitch = 0;
  private recoilYaw = 0;
  private recoilOffset = new THREE.Vector3();

  // Sway physics
  private swayOffset = new THREE.Vector2();

  // Timers
  private lastFireTime = 0;
  
  // Reusable vectors to prevent GC lag
  private _tempVec1 = new THREE.Vector3();
  private _tempVec2 = new THREE.Vector3();
  private _zeroVec = new THREE.Vector3();

  // Muzzle Flash
  private muzzleFlashLight: THREE.PointLight;

  constructor(scene: THREE.Scene, camera: THREE.Camera, input: Input, audioSynth: AudioSynth) {
    this.scene = scene;
    this.camera = camera;
    this.input = input;
    this.audioSynth = audioSynth;

    this.weaponGroup = new THREE.Group();
    this.camera.add(this.weaponGroup); // Mount to camera

    this.muzzleFlashLight = new THREE.PointLight(0xff7700, 0, 15);
    this.muzzleFlashLight.position.set(0.15, -0.2, -0.6); // Mount directly on the barrel
    this.camera.add(this.muzzleFlashLight);

    this.initLaserSight();
    this.selectWeapon(this.currentWeaponKey);
  }

  getCurrentWeapon(): WeaponData {
    return this.weapons[this.currentWeaponKey];
  }

  selectWeapon(key: string) {
    if (this.isReloading && this.weapons[key]) return;
    if (!this.weapons[key]) return;

    this.currentWeaponKey = key;
    this.buildWeaponModel();
  }

  private initLaserSight() {
    const geom = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
    const mat = new THREE.LineBasicMaterial({
      color: 0x00ffcc,
      transparent: true,
      opacity: 0.65,
      blending: THREE.AdditiveBlending
    });
    this.laserLine = new THREE.Line(geom, mat);
    this.scene.add(this.laserLine);
  }

  setLaserTarget(point: THREE.Vector3) {
    this.laserTarget.copy(point);
  }

  update(dt: number) {
    const weapon = this.getCurrentWeapon();

    // 1. Handle ADS input
    this.isADS = this.input.mouse.right && !this.isReloading;
    
    const targetFov = this.isADS ? weapon.adsFov : 70;
    const cam = this.camera as THREE.PerspectiveCamera;
    if (cam.fov) {
      // SMG has faster ADS transition
      const adsSpeed = weapon.type === 'smg' ? 20 : 14;
      cam.fov = THREE.MathUtils.lerp(cam.fov, targetFov, adsSpeed * dt);
      cam.updateProjectionMatrix();
    }

    // 2. Handle reload state
    if (this.isReloading) {
      this.reloadProgress += dt;
      if (this.reloadProgress >= weapon.reloadTime) {
        this.finishReload();
      }
    } else if (this.input.keys['r'] && weapon.ammoInMag < weapon.magSize && weapon.ammoInReserve > 0) {
      this.startReload();
    }

    // Handle throw state
    if (this.isThrowing) {
      this.throwProgress += dt;
      if (this.throwProgress >= this.throwDuration) {
        this.isThrowing = false;
      }
    }

    // 3. Sway
    const deltas = this.input.mouseMovement;
    const swayAmount = this.isADS ? 0.0004 : 0.0016;
    this.swayOffset.x = THREE.MathUtils.lerp(this.swayOffset.x, -deltas.x * swayAmount, 10 * dt);
    this.swayOffset.y = THREE.MathUtils.lerp(this.swayOffset.y, deltas.y * swayAmount, 10 * dt);

    // 4. Recoil decay
    const recoverRate = 12 * dt;
    this.recoilPitch = THREE.MathUtils.lerp(this.recoilPitch, 0, recoverRate);
    this.recoilYaw = THREE.MathUtils.lerp(this.recoilYaw, 0, recoverRate);
    this.recoilOffset.lerp(this._zeroVec, recoverRate);

    // 5. Weapon translation
    let targetPos = this.isADS ? weapon.adsPosition : weapon.hipPosition;

    if (this.isThrowing) {
      const p = this.throwProgress / this.throwDuration;
      const verticalOffset = Math.sin(p * Math.PI) * -0.7;
      this._tempVec1.set(0.0, verticalOffset, 0.0);
      this._tempVec2.copy(targetPos).add(this._tempVec1);
      targetPos = this._tempVec2;
    } else if (this.isReloading) {
      const p = this.reloadProgress / weapon.reloadTime;
      const verticalOffset = Math.sin(p * Math.PI) * -0.28;
      this._tempVec1.set(0.04, verticalOffset, -0.05);
      // We can't assign to targetPos directly if we want to mutate it, but targetPos is a reference. 
      // We'll copy to tempVec2 first.
      this._tempVec2.copy(weapon.hipPosition).add(this._tempVec1);
      targetPos = this._tempVec2;
    }

    this.currentWeaponPosition.lerp(targetPos, 14 * dt);
    
    this._tempVec1.set(this.swayOffset.x, this.swayOffset.y, 0);
    this.weaponGroup.position.copy(this.currentWeaponPosition)
      .add(this._tempVec1)
      .add(this.recoilOffset);

    // Rotations and AAA Movement Bobbing
    const idleTime = Date.now() * 0.002;
    const isMoving = this.input.keys['w'] || this.input.keys['a'] || this.input.keys['s'] || this.input.keys['d'];
    const bobSpeed = isMoving ? 4.0 : 1.0;
    const bobAmp = isMoving ? 0.012 : 0.002;
    
    // Figure-8 movement pattern
    const breatheX = Math.cos(idleTime * bobSpeed) * (this.isADS ? bobAmp * 0.1 : bobAmp);
    const breatheY = Math.abs(Math.sin(idleTime * bobSpeed)) * (this.isADS ? bobAmp * 0.1 : bobAmp * 1.5);

    // Apply translation bobbing
    this.weaponGroup.position.x += breatheX;
    this.weaponGroup.position.y += breatheY;

    // AAA sway rotation (tilting the gun when turning)
    const swayRotY = this.swayOffset.x * 2.0;
    const swayRotZ = this.swayOffset.x * 1.2;

    this.weaponGroup.rotation.set(
      this.recoilPitch - breatheY * 0.5,
      this.recoilYaw + swayRotY,
      swayRotZ - breatheX * 0.5
    );

    // 6. Update Laser Guide Beam
    this.updateLaserBeam();

    // 7. Decay Muzzle Flash
    if (this.muzzleFlashLight.intensity > 0) {
      this.muzzleFlashLight.intensity = Math.max(0, this.muzzleFlashLight.intensity - 80 * dt);
    }
  }

  private updateLaserBeam() {
    if (this.isADS || this.isReloading || this.isThrowing || this.getCurrentWeapon().type === 'sniper') {
      // Hide laser during ADS, reload, throwing, or sniper (scope preferred)
      this.laserLine.visible = false;
      return;
    }

    this.laserLine.visible = true;

    // Approximate muzzle position relative to weaponGroup local space
    const muzzleOffset = new THREE.Vector3(0.18, -0.2, -0.85);
    if (this.currentWeaponKey === 'pistol') {
      muzzleOffset.set(0.12, -0.2, -0.45);
    } else if (this.currentWeaponKey === 'smg') {
      muzzleOffset.set(0.16, -0.2, -0.65);
    } else if (this.currentWeaponKey === 'shotgun') {
      muzzleOffset.set(0.18, -0.2, -0.95);
    }
    
    // Transform local offset to world coordinate
    const muzzleWorld = muzzleOffset.clone();
    this.camera.localToWorld(muzzleWorld);

    // Update laser line vertices
    const positions = this.laserLine.geometry.attributes.position.array as Float32Array;
    positions[0] = muzzleWorld.x;
    positions[1] = muzzleWorld.y;
    positions[2] = muzzleWorld.z;
    positions[3] = this.laserTarget.x;
    positions[4] = this.laserTarget.y;
    positions[5] = this.laserTarget.z;

    this.laserLine.geometry.attributes.position.needsUpdate = true;
  }

  canFire(): boolean {
    if (this.isReloading || this.isThrowing) return false;
    const weapon = this.getCurrentWeapon();
    if (weapon.ammoInMag <= 0) return false;

    const fireInterval = 60000 / weapon.fireRate;
    return Date.now() - this.lastFireTime >= fireInterval;
  }

  fire(): boolean {
    if (!this.canFire()) return false;

    const weapon = this.getCurrentWeapon();
    // Keep magazine ammo full for unlimited bullets cheat!
    weapon.ammoInMag = weapon.magSize;
    weapon.ammoInReserve = weapon.reserveMax;
    
    this.lastFireTime = Date.now();

    const kickMultiplier = this.isADS ? 0.6 : 1.0;
    this.recoilPitch += weapon.recoilVertical * kickMultiplier;
    this.recoilYaw += (Math.random() - 0.5) * weapon.recoilHorizontal * kickMultiplier;
    
    this.recoilOffset.z += 0.08 * kickMultiplier;

    // Trigger Muzzle Flash
    this.muzzleFlashLight.intensity = weapon.type === 'sniper' ? 15 : (weapon.type === 'shotgun' ? 12 : 8);
    // Tint based on weapon
    if (weapon.type === 'sniper') this.muzzleFlashLight.color.setHex(0x00ffcc);
    else this.muzzleFlashLight.color.setHex(0xff7700);

    return true;
  }

  startReload() {
    this.isReloading = true;
    this.reloadProgress = 0;
    this.audioSynth.playReload();
  }

  private finishReload() {
    this.isReloading = false;
    const weapon = this.getCurrentWeapon();
    const needed = weapon.magSize - weapon.ammoInMag;
    const available = Math.min(needed, weapon.ammoInReserve);
    
    weapon.ammoInMag += available;
    weapon.ammoInReserve -= available;
  }

  playThrowAnimation(duration: number = 0.5) {
    this.isThrowing = true;
    this.throwProgress = 0;
    this.throwDuration = duration;
    
    // Stop ADS when throwing
    this.isADS = false;
  }

  // Build high fidelity procedural weapon models
  private buildWeaponModel() {
    while (this.weaponGroup.children.length > 0) {
      this.weaponGroup.remove(this.weaponGroup.children[0]);
    }

    const weapon = this.getCurrentWeapon();
    const modelGroup = new THREE.Group();

    // 3. Materials
    const metalTex = TextureGenerator.generateScratchedMetalTexture(256);
    const envMap = TextureGenerator.generateEnvMap(128);
    
    const weaponMat = new THREE.MeshStandardMaterial({
      map: metalTex,
      envMap: envMap,
      envMapIntensity: 0.8,
      roughness: 0.5,
      metalness: 0.95
    });

    const trimMat = new THREE.MeshStandardMaterial({
      color: 0x0a0b0d,
      envMap: envMap,
      envMapIntensity: 0.5,
      roughness: 0.6,
      metalness: 0.8
    });

    const accentMat = new THREE.MeshStandardMaterial({
      color: 0xff5500,
      envMap: envMap,
      envMapIntensity: 1.0,
      roughness: 0.3,
      metalness: 0.9,
      emissive: 0xff3300,
      emissiveIntensity: 0.3
    });

    const laserMat = new THREE.MeshStandardMaterial({
      color: 0x00ffcc,
      emissive: 0x00ffcc,
      emissiveIntensity: 6.0
    });

    if (weapon.type === 'rifle') {
      // Barrel
      const barrelGeo = new THREE.BoxGeometry(0.04, 0.04, 0.8);
      const barrel = new THREE.Mesh(barrelGeo, weaponMat);
      barrel.position.set(0, 0, -0.4);
      modelGroup.add(barrel);

      // Picatinny rails on top of barrel for detail
      for (let i = 0; i < 8; i++) {
        const railGeo = new THREE.BoxGeometry(0.045, 0.01, 0.03);
        const rail = new THREE.Mesh(railGeo, trimMat);
        rail.position.set(0, 0.025, -0.15 - i * 0.07);
        modelGroup.add(rail);
      }

      // Receiver body
      const bodyGeo = new THREE.BoxGeometry(0.08, 0.12, 0.45);
      const body = new THREE.Mesh(bodyGeo, weaponMat);
      body.position.set(0, -0.02, -0.1);
      modelGroup.add(body);

      // Handguard vents
      const guardGeo = new THREE.BoxGeometry(0.065, 0.075, 0.38);
      const guard = new THREE.Mesh(guardGeo, trimMat);
      guard.position.set(0, -0.015, -0.32);
      modelGroup.add(guard);

      // Vent details on guard
      for (let i = 0; i < 4; i++) {
        const ventGeo = new THREE.BoxGeometry(0.07, 0.01, 0.04);
        const vent = new THREE.Mesh(ventGeo, weaponMat);
        vent.position.set(0, 0.015, -0.22 - i * 0.06);
        modelGroup.add(vent);
      }

      // Stock
      const stockGeo = new THREE.BoxGeometry(0.05, 0.09, 0.25);
      const stock = new THREE.Mesh(stockGeo, weaponMat);
      stock.position.set(0, -0.01, 0.2);
      modelGroup.add(stock);

      // Grip
      const gripGeo = new THREE.BoxGeometry(0.04, 0.14, 0.05);
      const grip = new THREE.Mesh(gripGeo, trimMat);
      grip.position.set(0, -0.12, -0.05);
      grip.rotation.x = 0.25;
      modelGroup.add(grip);

      // Mag
      const magGeo = new THREE.BoxGeometry(0.038, 0.18, 0.065);
      const mag = new THREE.Mesh(magGeo, trimMat);
      mag.position.set(0, -0.15, -0.15);
      mag.rotation.x = -0.1;
      modelGroup.add(mag);

      // Sights and lens
      const sightGeo = new THREE.BoxGeometry(0.02, 0.035, 0.12);
      const sight = new THREE.Mesh(sightGeo, trimMat);
      sight.position.set(0, 0.06, -0.15);
      modelGroup.add(sight);

      const lensGeo = new THREE.BoxGeometry(0.012, 0.012, 0.005);
      const lens = new THREE.Mesh(lensGeo, laserMat);
      lens.position.set(0, 0.062, -0.09);
      modelGroup.add(lens);

    } else if (weapon.type === 'smg') {
      // Compact barrel
      const barrelGeo = new THREE.BoxGeometry(0.032, 0.032, 0.5);
      const barrel = new THREE.Mesh(barrelGeo, weaponMat);
      barrel.position.set(0, 0, -0.3);
      modelGroup.add(barrel);

      // Suppressor-style muzzle
      const suppressorGeo = new THREE.CylinderGeometry(0.025, 0.025, 0.15, 8);
      suppressorGeo.rotateX(Math.PI / 2);
      const suppressor = new THREE.Mesh(suppressorGeo, trimMat);
      suppressor.position.set(0, 0, -0.58);
      modelGroup.add(suppressor);

      // Compact receiver
      const bodyGeo = new THREE.BoxGeometry(0.065, 0.095, 0.32);
      const body = new THREE.Mesh(bodyGeo, weaponMat);
      body.position.set(0, -0.01, -0.08);
      modelGroup.add(body);

      // Orange accent strip on receiver
      const stripGeo = new THREE.BoxGeometry(0.066, 0.012, 0.2);
      const strip = new THREE.Mesh(stripGeo, accentMat);
      strip.position.set(0, 0.035, -0.08);
      modelGroup.add(strip);

      // Foregrip
      const fgGeo = new THREE.BoxGeometry(0.03, 0.08, 0.04);
      const fg = new THREE.Mesh(fgGeo, trimMat);
      fg.position.set(0, -0.075, -0.22);
      modelGroup.add(fg);

      // Folding stock (compact)
      const stockGeo = new THREE.BoxGeometry(0.04, 0.065, 0.18);
      const stock = new THREE.Mesh(stockGeo, weaponMat);
      stock.position.set(0, 0.0, 0.16);
      modelGroup.add(stock);

      // Grip
      const gripGeo = new THREE.BoxGeometry(0.035, 0.12, 0.04);
      const grip = new THREE.Mesh(gripGeo, trimMat);
      grip.position.set(0, -0.1, -0.02);
      grip.rotation.x = 0.2;
      modelGroup.add(grip);

      // Extended mag
      const magGeo = new THREE.BoxGeometry(0.03, 0.16, 0.05);
      const mag = new THREE.Mesh(magGeo, trimMat);
      mag.position.set(0, -0.14, -0.1);
      mag.rotation.x = -0.05;
      modelGroup.add(mag);

      // Compact red dot sight
      const sightGeo = new THREE.BoxGeometry(0.025, 0.025, 0.06);
      const sight = new THREE.Mesh(sightGeo, trimMat);
      sight.position.set(0, 0.045, -0.08);
      modelGroup.add(sight);

      const dotGeo = new THREE.BoxGeometry(0.008, 0.008, 0.005);
      const dot = new THREE.Mesh(dotGeo, laserMat);
      dot.position.set(0, 0.047, -0.05);
      modelGroup.add(dot);

    } else if (weapon.type === 'sniper') {
      // Long heavy barrel
      const barrelGeo = new THREE.BoxGeometry(0.035, 0.035, 1.25);
      const barrel = new THREE.Mesh(barrelGeo, weaponMat);
      barrel.position.set(0, 0, -0.6);
      modelGroup.add(barrel);

      // Muzzle brake fixture
      const brakeGeo = new THREE.BoxGeometry(0.055, 0.055, 0.12);
      const brake = new THREE.Mesh(brakeGeo, trimMat);
      brake.position.set(0, 0, -1.25);
      modelGroup.add(brake);

      // Body
      const bodyGeo = new THREE.BoxGeometry(0.09, 0.14, 0.65);
      const body = new THREE.Mesh(bodyGeo, weaponMat);
      body.position.set(0, -0.02, -0.1);
      modelGroup.add(body);

      // Stock
      const stockGeo = new THREE.BoxGeometry(0.06, 0.11, 0.35);
      const stock = new THREE.Mesh(stockGeo, trimMat);
      stock.position.set(0, -0.02, 0.22);
      modelGroup.add(stock);

      // Large Scope
      const scopeGeo = new THREE.CylinderGeometry(0.032, 0.032, 0.32, 8);
      const scope = new THREE.Mesh(scopeGeo, trimMat);
      scope.rotation.x = Math.PI / 2;
      scope.position.set(0, 0.09, -0.12);
      modelGroup.add(scope);

      // Large Scope lens reflection
      const lensGeo = new THREE.CircleGeometry(0.027, 8);
      const lens = new THREE.Mesh(lensGeo, laserMat);
      lens.position.set(0, 0.09, -0.28);
      lens.rotation.y = Math.PI;
      modelGroup.add(lens);

    } else if (weapon.type === 'shotgun') {
      // Heavy barrel + tube magazine underneath
      const barrelGeo = new THREE.BoxGeometry(0.04, 0.04, 0.9);
      const barrel = new THREE.Mesh(barrelGeo, weaponMat);
      barrel.position.set(0, 0, -0.45);
      modelGroup.add(barrel);

      // Tube magazine below barrel
      const tubeGeo = new THREE.CylinderGeometry(0.022, 0.022, 0.65, 8);
      tubeGeo.rotateX(Math.PI / 2);
      const tube = new THREE.Mesh(tubeGeo, trimMat);
      tube.position.set(0, -0.04, -0.38);
      modelGroup.add(tube);

      // Wide muzzle
      const muzzleGeo = new THREE.BoxGeometry(0.06, 0.06, 0.08);
      const muzzle = new THREE.Mesh(muzzleGeo, trimMat);
      muzzle.position.set(0, 0, -0.92);
      modelGroup.add(muzzle);

      // Receiver body (chunkier)
      const bodyGeo = new THREE.BoxGeometry(0.085, 0.12, 0.5);
      const body = new THREE.Mesh(bodyGeo, weaponMat);
      body.position.set(0, -0.02, -0.05);
      modelGroup.add(body);

      // Orange pump grip
      const pumpGeo = new THREE.BoxGeometry(0.06, 0.065, 0.15);
      const pump = new THREE.Mesh(pumpGeo, accentMat);
      pump.position.set(0, -0.035, -0.35);
      modelGroup.add(pump);

      // Stock (wooden-style)
      const stockGeo = new THREE.BoxGeometry(0.055, 0.1, 0.3);
      const stockMat = new THREE.MeshStandardMaterial({
        color: 0x8B5E3C,
        roughness: 0.85,
        metalness: 0.05
      });
      const stock = new THREE.Mesh(stockGeo, stockMat);
      stock.position.set(0, -0.01, 0.2);
      modelGroup.add(stock);

      // Grip
      const gripGeo = new THREE.BoxGeometry(0.04, 0.13, 0.045);
      const grip = new THREE.Mesh(gripGeo, trimMat);
      grip.position.set(0, -0.12, -0.03);
      grip.rotation.x = 0.25;
      modelGroup.add(grip);

      // Shell loading port (side detail)
      const portGeo = new THREE.BoxGeometry(0.09, 0.04, 0.06);
      const port = new THREE.Mesh(portGeo, new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.8, roughness: 0.3 }));
      port.position.set(0, -0.02, -0.12);
      modelGroup.add(port);

    } else if (weapon.type === 'pistol') {
      // Slide
      const slideGeo = new THREE.BoxGeometry(0.035, 0.05, 0.3);
      const slide = new THREE.Mesh(slideGeo, weaponMat);
      slide.position.set(0, 0, -0.05);
      modelGroup.add(slide);

      // Frame
      const frameGeo = new THREE.BoxGeometry(0.032, 0.04, 0.28);
      const frame = new THREE.Mesh(frameGeo, trimMat);
      frame.position.set(0, -0.04, -0.04);
      modelGroup.add(frame);

      // Grip
      const gripGeo = new THREE.BoxGeometry(0.034, 0.13, 0.048);
      const grip = new THREE.Mesh(gripGeo, trimMat);
      grip.position.set(0, -0.1, 0.02);
      grip.rotation.x = 0.2;
      modelGroup.add(grip);

      // Underbarrel Laser Module
      const attachmentGeo = new THREE.BoxGeometry(0.022, 0.022, 0.11);
      const attachment = new THREE.Mesh(attachmentGeo, trimMat);
      attachment.position.set(0, -0.05, -0.12);
      modelGroup.add(attachment);

      const laserDotGeo = new THREE.BoxGeometry(0.008, 0.008, 0.005);
      const laserDot = new THREE.Mesh(laserDotGeo, laserMat);
      laserDot.position.set(0, -0.05, -0.176);
      modelGroup.add(laserDot);
    }

    // Default position (adjusted for realistic FPS perspective: lower and to the right)
    modelGroup.position.set(0.35, -0.4, -0.6);
    this.weaponGroup.add(modelGroup);
  }
}
