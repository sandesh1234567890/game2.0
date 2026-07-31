export class Input {
  keys: { [key: string]: boolean } = {};
  mouse: { left: boolean; right: boolean } = { left: false, right: false };
  mouseMovement: { x: number; y: number } = { x: 0, y: 0 };
  isLocked: boolean = false;
  private targetElement: HTMLElement;

  constructor(targetElement: HTMLElement) {
    this.targetElement = targetElement;
    this.setupListeners();
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
    this.targetElement.requestPointerLock();
  }

  exitLock() {
    document.exitPointerLock();
  }

  // Retrieve mouse deltas and reset them for the frame
  getMouseDeltas() {
    const deltas = { ...this.mouseMovement };
    this.mouseMovement.x = 0;
    this.mouseMovement.y = 0;
    return deltas;
  }

  private clearInputs() {
    this.keys = {};
    this.mouse.left = false;
    this.mouse.right = false;
    this.mouseMovement.x = 0;
    this.mouseMovement.y = 0;
  }
}
