import * as THREE from 'three';
import { Input } from './Input';
import { AudioSynth } from './AudioSynth';

export class Player {
  position = new THREE.Vector3(0, 1.8, 0);
  velocity = new THREE.Vector3();
  rotation = new THREE.Euler(0, 0, 0, 'YXZ'); // Pitch/yaw order
  targetRotation = new THREE.Euler(0, 0, 0, 'YXZ'); // For smooth mouse interpolation

  // Player state stats
  health = 100;
  maxHealth = 100;
  shield = 100;
  maxShield = 100;
  isDead = false;

  // Timers for regen
  lastDamageTime = 0;
  regenDelay = 4000; // 4 seconds
  healthRegenRate = 15; // per second
  shieldRegenRate = 25; // per second

  // Movement parameters
  walkSpeed = 5.5;
  sprintSpeed = 9.5;
  crouchSpeed = 2.8;
  jumpForce = 7.0;
  gravity = 22.0;

  // Stances
  stance: 'standing' | 'crouching' | 'sprinting' | 'sliding' = 'standing';
  currentHeight = 1.8;
  targetHeight = 1.8;
  eyeLevelOffset = 0.15; // camera position relative to physical height

  // Sliding state
  slideTime = 0;
  slideDuration = 0.8; // seconds
  slideDirection = new THREE.Vector3();
  slideSpeed = 0;

  // Jumping/Falling state
  isGrounded = false;

  // View Bobbing variables
  bobTime = 0;
  bobOffset = new THREE.Vector3();

  // Collision dimensions
  radius = 0.6;

  private input: Input;
  private camera: THREE.Camera;
  private audioSynth: AudioSynth;
  public kills = 0;
  
  // Reusable vectors to prevent GC lag
  private _moveDir = new THREE.Vector3();
  private _heading = new THREE.Vector3();
  private _yAxis = new THREE.Vector3(0, 1, 0);

  constructor(camera: THREE.Camera, input: Input, audioSynth: AudioSynth) {
    this.camera = camera;
    this.input = input;
    this.audioSynth = audioSynth;
    
    // Position player slightly above ground initially
    this.position.set(0, 1.8, 5);
  }

  update(dt: number, collisionCheck: (pos: THREE.Vector3, radius: number) => boolean) {
    if (this.isDead) return;

    this.handleRegen(dt);
    this.handleRotation();
    this.handleMovement(dt, collisionCheck);
    this.handleHeight(dt);
    this.updateCameraPosition(dt);
  }

  takeDamage(amount: number) {
    if (this.isDead) return;

    this.lastDamageTime = Date.now();

    // Damage shields first
    if (this.shield > 0) {
      this.shield -= amount;
      if (this.shield < 0) {
        this.health += this.shield; // Overflow to health
        this.shield = 0;
      }
    } else {
      this.health -= amount;
    }

    if (this.health <= 0) {
      this.health = 0;
      this.isDead = true;
    }
  }

  heal(amount: number) {
    if (this.isDead) return;
    this.health = Math.min(this.maxHealth, this.health + amount);
  }

  reset() {
    this.health = this.maxHealth;
    this.shield = this.maxShield;
    this.isDead = false;
    this.position.set(0, 1.8, 5);
    this.velocity.set(0, 0, 0);
    this.rotation.set(0, 0, 0);
    this.targetRotation.set(0, 0, 0);
    this.stance = 'standing';
    this.currentHeight = 1.8;
  }

  private handleRegen(dt: number) {
    const elapsedSinceDamage = Date.now() - this.lastDamageTime;
    if (elapsedSinceDamage > this.regenDelay) {
      if (this.health < this.maxHealth) {
        this.health = Math.min(this.maxHealth, this.health + this.healthRegenRate * dt);
      }
      if (this.shield < this.maxShield && this.health === this.maxHealth) {
        this.shield = Math.min(this.maxShield, this.shield + this.shieldRegenRate * dt);
      }
    }
  }

  private handleRotation() {
    const { x, y } = this.input.getMouseDeltas();
    const sensitivity = 0.0022;

    // Apply raw input directly for instant 1:1 aiming (No Smoothing/Input Lag)
    this.rotation.y -= x * sensitivity; // Yaw (left/right)
    this.rotation.x -= y * sensitivity; // Pitch (up/down)

    // Constrain pitch between -85 and +85 degrees
    const maxPitch = Math.PI / 2 - 0.05;
    this.rotation.x = Math.max(-maxPitch, Math.min(maxPitch, this.rotation.x));
    
    this.camera.quaternion.setFromEuler(this.rotation);
  }

  private handleMovement(dt: number, collisionCheck: (pos: THREE.Vector3, radius: number) => boolean) {
    // 1. Gather directional input
    this._moveDir.set(0, 0, 0);
    if (this.input.keys['w']) this._moveDir.z -= 1;
    if (this.input.keys['s']) this._moveDir.z += 1;
    if (this.input.keys['a']) this._moveDir.x -= 1;
    if (this.input.keys['d']) this._moveDir.x += 1;
    this._moveDir.normalize();

    // Rotate move direction relative to player's heading
    this._heading.set(this._moveDir.x, 0, this._moveDir.z);
    this._heading.applyAxisAngle(this._yAxis, this.rotation.y);

    // 2. Manage stance switches (Sprint / Crouch / Slide)
    const isMoving = this._moveDir.lengthSq() > 0;
    const wantsSprint = this.input.keys['shift'] && isMoving && this.isGrounded && this.stance !== 'crouching' && !this.input.mouse.right;
    const wantsCrouch = this.input.keys['c'];

    if (this.stance === 'sliding') {
      this.slideTime += dt;
      // Decay slide velocity
      const progress = this.slideTime / this.slideDuration;
      this.slideSpeed = THREE.MathUtils.lerp(15.0, this.crouchSpeed, progress);

      // Slide ending
      if (progress >= 1.0) {
        this.stance = 'crouching';
      }
    } else {
      if (wantsCrouch) {
        if (this.stance === 'sprinting' && isMoving) {
          // Trigger tactical slide
          this.stance = 'sliding';
          this.slideTime = 0;
          this.slideSpeed = 15.0;
          this.audioSynth.playSlide();
          // Slide in the direction we were running
          this.slideDirection.copy(this._heading).normalize();
          if (this.slideDirection.lengthSq() === 0) {
            // Default forward if heading is somehow empty
            this.slideDirection.set(0, 0, -1).applyAxisAngle(this._yAxis, this.rotation.y);
          }
        } else {
          this.stance = 'crouching';
        }
      } else if (wantsSprint) {
        this.stance = 'sprinting';
      } else {
        this.stance = 'standing';
      }
    }

    // Determine target movement speed
    let targetSpeed = this.walkSpeed;
    if (this.stance === 'sprinting') targetSpeed = this.sprintSpeed;
    if (this.stance === 'crouching') targetSpeed = this.crouchSpeed;

    // Apply ADS penalty: speed drops to crouch speed during ADS
    if (this.input.mouse.right) {
      targetSpeed = this.crouchSpeed;
      if (this.stance === 'sprinting') this.stance = 'standing';
    }

    // 3. Apply physics and velocity
    if (this.stance === 'sliding') {
      // Retain sliding movement direction
      this.velocity.x = this.slideDirection.x * this.slideSpeed;
      this.velocity.z = this.slideDirection.z * this.slideSpeed;
    } else {
      // Normal movement interpolation
      const accel = this.isGrounded ? 15.0 : 4.0; // Less control in air
      this.velocity.x = THREE.MathUtils.lerp(this.velocity.x, this._heading.x * targetSpeed, accel * dt);
      this.velocity.z = THREE.MathUtils.lerp(this.velocity.z, this._heading.z * targetSpeed, accel * dt);
    }

    // Apply gravity
    this.velocity.y -= this.gravity * dt;

    // Jump trigger
    if (this.input.keys[' '] && this.isGrounded && this.stance !== 'crouching' && this.stance !== 'sliding') {
      this.velocity.y = this.jumpForce;
      this.isGrounded = false;
      this.audioSynth.playJump();
    }

    // 4. Collision Detection and Resolution (Axis by Axis for slide-along walls)
    const originalPos = this.position.clone();
    
    // Y-axis resolution (floor/ceilings)
    this.position.y += this.velocity.y * dt;
    // Hard floor collision (fallback)
    if (this.position.y < this.currentHeight) {
      this.position.y = this.currentHeight;
      this.velocity.y = 0;
      this.isGrounded = true;
    } else {
      // Dynamic floor map collisions checked in LevelManager
      if (collisionCheck(this.position, this.radius)) {
        this.position.y = originalPos.y;
        if (this.velocity.y < 0) {
          this.isGrounded = true;
        }
        this.velocity.y = 0;
      } else {
        // Simple grounded check: is there floor directly below us?
        const testPos = this.position.clone();
        testPos.y -= 0.1;
        this.isGrounded = collisionCheck(testPos, this.radius) || this.position.y <= this.currentHeight + 0.05;
      }
    }

    // X-axis movement
    this.position.x += this.velocity.x * dt;
    if (collisionCheck(this.position, this.radius)) {
      this.position.x = originalPos.x;
      this.velocity.x = 0;
    }

    // Z-axis movement
    this.position.z += this.velocity.z * dt;
    if (collisionCheck(this.position, this.radius)) {
      this.position.z = originalPos.z;
      this.velocity.z = 0;
    }
  }

  private handleHeight(dt: number) {
    if (this.stance === 'crouching' || this.stance === 'sliding') {
      this.targetHeight = 1.0;
    } else {
      this.targetHeight = 1.8;
    }

    // Smoothly interpolate physical height (camera height)
    this.currentHeight = THREE.MathUtils.lerp(this.currentHeight, this.targetHeight, 12.0 * dt);
  }

  private updateCameraPosition(dt: number) {
    // Determine view bobbing offset
    const horizontalVelocity = new THREE.Vector3(this.velocity.x, 0, this.velocity.z);
    const speed = horizontalVelocity.length();

    if (speed > 0.1 && this.isGrounded && this.stance !== 'sliding' && !this.input.mouse.right) {
      // Scale frequency and amplitude with player speed
      const bobFreq = this.stance === 'sprinting' ? 14 : 9;
      const bobAmpX = this.stance === 'sprinting' ? 0.07 : 0.035;
      const bobAmpY = this.stance === 'sprinting' ? 0.09 : 0.05;

      this.bobTime += dt * bobFreq;

      this.bobOffset.x = Math.sin(this.bobTime * 0.5) * bobAmpX;
      this.bobOffset.y = Math.sin(this.bobTime) * bobAmpY;
    } else {
      // Decelerate bobbing to zero
      this.bobTime = 0;
      this.bobOffset.lerp(new THREE.Vector3(), 8.0 * dt);
    }

    // Apply eye level and bobbing directly to camera
    const eyeHeight = this.position.y - (this.targetHeight - this.currentHeight) - this.eyeLevelOffset;
    
    this.camera.position.set(
      this.position.x + this.bobOffset.x,
      eyeHeight + this.bobOffset.y,
      this.position.z
    );
  }
}
