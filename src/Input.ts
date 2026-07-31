export class Input {
  keys: { [key: string]: boolean } = {};
  mouse: { left: boolean; right: boolean } = { left: false, right: false };
  mouseMovement: { x: number; y: number } = { x: 0, y: 0 };
  isLocked: boolean = false;
  private targetElement: HTMLElement;

  constructor(targetElement: HTMLElement) {
    this.targetElement = targetElement;
    this.isMobile = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
    this.setupListeners();
    if (this.isMobile) {
      document.getElementById('mobile-controls')!.style.display = 'block';
      this.setupTouchListeners();
    }
  }

  private setupListeners() {
    // Keyboard listeners
    window.addEventListener('keydown', (e) => {
      const key = e.key.toLowerCase();
      this.keys[key] = true;
      
      // Prevent browser defaults for specific game keys
      if ([' ', 'tab', '1', '2', '3'].includes(e.key)) {
        e.preventDefault();
      }
    });

    window.addEventListener('keyup', (e) => {
      const key = e.key.toLowerCase();
      this.keys[key] = false;
    });

    // Mouse button listeners
    window.addEventListener('mousedown', (e) => {
      if (!this.isLocked) return;
      if (e.button === 0) this.mouse.left = true;
      if (e.button === 2) this.mouse.right = true;
    });

    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouse.left = false;
      if (e.button === 2) this.mouse.right = false;
    });

    // Prevent context menu on right click
    window.addEventListener('contextmenu', (e) => {
      e.preventDefault();
    });

    // Pointer Lock change listener
    document.addEventListener('pointerlockchange', () => {
      this.isLocked = document.pointerLockElement === this.targetElement;
      if (!this.isLocked) {
        // Clear inputs on release
        this.clearInputs();
      }
    });

    document.addEventListener('pointerlockerror', (e) => {
      console.error('Pointer lock error:', e);
    });

    // Mouse movement listener
    window.addEventListener('mousemove', (e) => {
      if (!this.isLocked) return;
      this.mouseMovement.x += e.movementX;
      this.mouseMovement.y += e.movementY;
    });
  }

  requestLock() {
    if (this.isMobile) {
      this.isLocked = true;
      return;
    }
    this.targetElement.requestPointerLock();
  }

  exitLock() {
    if (this.isMobile) {
      this.isLocked = false;
      return;
    }
    document.exitPointerLock();
  }

  // Retrieve mouse deltas and reset them for the frame
  getMouseDeltas() {
    const deltas = { ...this.mouseMovement };
    this.mouseMovement.x = 0;
    this.mouseMovement.y = 0;
    return deltas;
  }

  public isMobile = false;
  private joystickActive = false;
  private joystickStartPos = { x: 0, y: 0 };
  public joystickVal = { x: 0, y: 0 };

  private setupTouchListeners() {
    const joyBase = document.getElementById('mobile-joystick-base')!;
    const joyHandle = document.getElementById('mobile-joystick-handle')!;
    
    joyBase.addEventListener('touchstart', () => {
      if (document.body.classList.contains('hud-editing')) return;
      const rect = joyBase.getBoundingClientRect();
      this.joystickStartPos.x = rect.left + rect.width / 2;
      this.joystickStartPos.y = rect.top + rect.height / 2;
      this.joystickActive = true;
    }, { passive: true });

    joyBase.addEventListener('touchmove', (e: TouchEvent) => {
      if (!this.joystickActive) return;
      const touch = e.touches[0];
      const dx = touch.clientX - this.joystickStartPos.x;
      const dy = touch.clientY - this.joystickStartPos.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const maxRadius = 45;
      
      const angle = Math.atan2(dy, dx);
      const clampDist = Math.min(dist, maxRadius);
      
      const stickX = Math.cos(angle) * clampDist;
      const stickY = Math.sin(angle) * clampDist;
      
      joyHandle.style.left = `calc(50% + ${stickX}px)`;
      joyHandle.style.top = `calc(50% + ${stickY}px)`;
      
      this.joystickVal.x = stickX / maxRadius;
      this.joystickVal.y = -stickY / maxRadius;

      // Map to keys
      this.keys['w'] = this.joystickVal.y > 0.35;
      this.keys['s'] = this.joystickVal.y < -0.35;
      this.keys['a'] = this.joystickVal.x < -0.35;
      this.keys['d'] = this.joystickVal.x > 0.35;
    }, { passive: true });

    const resetJoy = () => {
      this.joystickActive = false;
      joyHandle.style.left = '50%';
      joyHandle.style.top = '50%';
      this.joystickVal.x = 0;
      this.joystickVal.y = 0;
      this.keys['w'] = false;
      this.keys['s'] = false;
      this.keys['a'] = false;
      this.keys['d'] = false;
    };
    joyBase.addEventListener('touchend', resetJoy, { passive: true });
    joyBase.addEventListener('touchcancel', resetJoy, { passive: true });

    // Swipe to Look (Right side of screen)
    let lookTouchId: number | null = null;
    const lastLookPos = { x: 0, y: 0 };

    window.addEventListener('touchstart', (e: TouchEvent) => {
      if (!this.isLocked) return;
      for (let i = 0; i < e.changedTouches.length; i++) {
        const touch = e.changedTouches[i];
        if (touch.clientX > window.innerWidth * 0.4) {
          lookTouchId = touch.identifier;
          lastLookPos.x = touch.clientX;
          lastLookPos.y = touch.clientY;
          break;
        }
      }
    }, { passive: true });

    window.addEventListener('touchmove', (e: TouchEvent) => {
      if (lookTouchId === null) return;
      for (let i = 0; i < e.touches.length; i++) {
        const touch = e.touches[i];
        if (touch.identifier === lookTouchId) {
          const dx = touch.clientX - lastLookPos.x;
          const dy = touch.clientY - lastLookPos.y;
          
          this.mouseMovement.x += dx * 1.6;
          this.mouseMovement.y += dy * 1.6;
          
          lastLookPos.x = touch.clientX;
          lastLookPos.y = touch.clientY;
          break;
        }
      }
    }, { passive: true });

    const endLook = (e: TouchEvent) => {
      for (let i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === lookTouchId) {
          lookTouchId = null;
          break;
        }
      }
    };
    window.addEventListener('touchend', endLook, { passive: true });
    window.addEventListener('touchcancel', endLook, { passive: true });

    // Map Action Buttons
    const mapButton = (id: string, action: () => void, endAction?: () => void) => {
      const btn = document.getElementById(id)!;
      btn.addEventListener('touchstart', (e) => {
        if (document.body.classList.contains('hud-editing')) return;
        e.preventDefault();
        action();
      }, { passive: false });
      if (endAction) {
        btn.addEventListener('touchend', (e) => {
          if (document.body.classList.contains('hud-editing')) return;
          e.preventDefault();
          endAction();
        }, { passive: false });
      }
    };

    mapButton('btn-mobile-nextweapon', () => this.keys['q'] = true, () => this.keys['q'] = false);
    mapButton('btn-mobile-jump', () => this.keys[' '] = true, () => this.keys[' '] = false);
    mapButton('btn-mobile-reload', () => this.keys['r'] = true, () => this.keys['r'] = false);
    mapButton('btn-mobile-grenade', () => this.keys['g'] = true, () => this.keys['g'] = false);
    
    // Map shoot button with dual Fire + Aim drag action
    const shootBtn = document.getElementById('btn-mobile-shoot')!;
    let shootTouchId: number | null = null;
    const lastShootPos = { x: 0, y: 0 };

    shootBtn.addEventListener('touchstart', (e) => {
      if (document.body.classList.contains('hud-editing')) return;
      e.preventDefault();
      this.mouse.left = true;
      
      const touch = e.changedTouches[0];
      shootTouchId = touch.identifier;
      lastShootPos.x = touch.clientX;
      lastShootPos.y = touch.clientY;
    }, { passive: false });

    shootBtn.addEventListener('touchmove', (e) => {
      if (shootTouchId === null) return;
      e.preventDefault();
      for (let i = 0; i < e.touches.length; i++) {
        const touch = e.touches[i];
        if (touch.identifier === shootTouchId) {
          const dx = touch.clientX - lastShootPos.x;
          const dy = touch.clientY - lastShootPos.y;
          
          this.mouseMovement.x += dx * 1.6;
          this.mouseMovement.y += dy * 1.6;
          
          lastLookPos.x = touch.clientX; // sync with global looking pos to avoid visual jumps
          lastLookPos.y = touch.clientY;
          
          lastShootPos.x = touch.clientX;
          lastShootPos.y = touch.clientY;
          break;
        }
      }
    }, { passive: false });

    const endShoot = (e: TouchEvent) => {
      if (shootTouchId === null) return;
      for (let i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === shootTouchId) {
          this.mouse.left = false;
          shootTouchId = null;
          break;
        }
      }
    };
    shootBtn.addEventListener('touchend', endShoot, { passive: false });
    shootBtn.addEventListener('touchcancel', endShoot, { passive: false });
    
    // Toggle ADS
    const adsBtn = document.getElementById('btn-mobile-ads')!;
    adsBtn.addEventListener('touchstart', (e) => {
      if (document.body.classList.contains('hud-editing')) return;
      e.preventDefault();
      this.mouse.right = !this.mouse.right;
      if (this.mouse.right) {
        adsBtn.classList.add('active');
      } else {
        adsBtn.classList.remove('active');
      }
    }, { passive: false });
  }

  private clearInputs() {
    this.keys = {};
    this.mouse.left = false;
    this.mouse.right = false;
    this.mouseMovement.x = 0;
    this.mouseMovement.y = 0;
    
    const adsBtn = document.getElementById('btn-mobile-ads');
    if (adsBtn) adsBtn.classList.remove('active');
  }
}
