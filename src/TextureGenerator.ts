import * as THREE from 'three';

export class TextureGenerator {
  // Simple pseudo-random number generator for consistent noise
  private static hash(n: number): number {
    return (Math.sin(n) * 43758.5453123) % 1;
  }

  private static noise2D(x: number, y: number): number {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const fx = x - ix;
    const fy = y - iy;

    const a = this.hash(ix + iy * 57);
    const b = this.hash(ix + 1 + iy * 57);
    const c = this.hash(ix + (iy + 1) * 57);
    const d = this.hash(ix + 1 + (iy + 1) * 57);

    const ux = fx * fx * (3.0 - 2.0 * fx);
    const uy = fy * fy * (3.0 - 2.0 * fy);

    return (a * (1 - ux) + b * ux) * (1 - uy) + (c * (1 - ux) + d * ux) * uy;
  }

  private static fbm(x: number, y: number, octaves = 4): number {
    let value = 0;
    let amplitude = 0.5;
    let frequency = 1;
    for (let i = 0; i < octaves; i++) {
      value += amplitude * this.noise2D(x * frequency, y * frequency);
      frequency *= 2;
      amplitude *= 0.5;
    }
    return value;
  }

  public static generateDirtTexture(size = 512): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    const imgData = ctx.createImageData(size, size);
    const data = imgData.data;

    // Base dirt colors
    const rBase = 160, gBase = 130, bBase = 90;

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        // High frequency grit
        const n1 = this.fbm(x * 0.05, y * 0.05, 4);
        // Low frequency color variation
        const n2 = this.fbm(x * 0.01, y * 0.01, 2);
        
        const grit = (n1 - 0.5) * 60;
        const colorVar = (n2 - 0.5) * 40;
        
        const r = Math.min(255, Math.max(0, rBase + grit + colorVar));
        const g = Math.min(255, Math.max(0, gBase + grit + colorVar * 0.9));
        const b = Math.min(255, Math.max(0, bBase + grit + colorVar * 0.7));

        const idx = (y * size + x) * 4;
        data[idx] = r;
        data[idx + 1] = g;
        data[idx + 2] = b;
        data[idx + 3] = 255;
      }
    }
    ctx.putImageData(imgData, 0, 0);

    // Add some small pebbles
    ctx.fillStyle = 'rgba(100, 80, 70, 0.6)';
    for (let i = 0; i < 200; i++) {
      ctx.beginPath();
      ctx.arc(Math.random() * size, Math.random() * size, Math.random() * 2 + 1, 0, Math.PI * 2);
      ctx.fill();
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    return texture;
  }

  public static generateCorrugatedMetalTexture(size = 512): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    
    // Base faded blue paint
    ctx.fillStyle = '#4c738c';
    ctx.fillRect(0, 0, size, size);

    // Vertical ridges
    const ridgeCount = 16;
    const ridgeWidth = size / ridgeCount;
    
    for (let i = 0; i < ridgeCount; i++) {
      const x = i * ridgeWidth;
      
      // Ridge highlight (left side)
      const grad = ctx.createLinearGradient(x, 0, x + ridgeWidth, 0);
      grad.addColorStop(0, 'rgba(255,255,255,0.1)');
      grad.addColorStop(0.2, 'rgba(255,255,255,0.4)');
      grad.addColorStop(0.5, 'rgba(0,0,0,0)');
      grad.addColorStop(0.8, 'rgba(0,0,0,0.3)');
      grad.addColorStop(1, 'rgba(0,0,0,0.6)');
      
      ctx.fillStyle = grad;
      ctx.fillRect(x, 0, ridgeWidth, size);
    }

    // Rust and dirt patches using noise
    const imgData = ctx.getImageData(0, 0, size, size);
    const data = imgData.data;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const rustNoise = this.fbm(x * 0.02, y * 0.02, 3);
        if (rustNoise > 0.65) {
          const rustIntensity = (rustNoise - 0.65) * 3;
          const idx = (y * size + x) * 4;
          data[idx] = Math.max(0, data[idx] * (1 - rustIntensity) + 120 * rustIntensity);
          data[idx + 1] = Math.max(0, data[idx + 1] * (1 - rustIntensity) + 60 * rustIntensity);
          data[idx + 2] = Math.max(0, data[idx + 2] * (1 - rustIntensity) + 30 * rustIntensity);
        }
      }
    }
    ctx.putImageData(imgData, 0, 0);

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    return texture;
  }

  public static generateCamoTexture(size = 256): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    const imgData = ctx.createImageData(size, size);
    const data = imgData.data;

    const c1 = { r: 60, g: 70, b: 50 };   // Olive drab
    const c2 = { r: 120, g: 110, b: 80 }; // Khaki/Tan
    const c3 = { r: 40, g: 45, b: 35 };   // Dark green
    const c4 = { r: 30, g: 30, b: 25 };   // Near black

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        // Multi-scale noise for splotches
        const n = this.fbm(x * 0.03, y * 0.03, 3);
        const detail = this.fbm(x * 0.1, y * 0.1, 2);
        
        const val = (n * 0.8 + detail * 0.2);
        
        let color = c1;
        if (val < 0.3) color = c4;
        else if (val < 0.45) color = c3;
        else if (val > 0.65) color = c2;

        const idx = (y * size + x) * 4;
        data[idx] = color.r;
        data[idx + 1] = color.g;
        data[idx + 2] = color.b;
        data[idx + 3] = 255;
      }
    }
    ctx.putImageData(imgData, 0, 0);

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    return texture;
  }

  public static generateScratchedMetalTexture(size = 256): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    
    // Base gunmetal
    ctx.fillStyle = '#22252a';
    ctx.fillRect(0, 0, size, size);

    // Noise base
    const imgData = ctx.getImageData(0, 0, size, size);
    const data = imgData.data;
    for (let i = 0; i < data.length; i += 4) {
      const noise = (Math.random() - 0.5) * 15;
      data[i] = Math.max(0, Math.min(255, data[i] + noise));
      data[i+1] = Math.max(0, Math.min(255, data[i+1] + noise));
      data[i+2] = Math.max(0, Math.min(255, data[i+2] + noise));
      data[i+3] = 255;
    }
    ctx.putImageData(imgData, 0, 0);

    // Deep scratches
    ctx.strokeStyle = 'rgba(150, 160, 170, 0.4)';
    for (let i = 0; i < 60; i++) {
      ctx.lineWidth = Math.random() * 1.5 + 0.5;
      ctx.beginPath();
      const x = Math.random() * size;
      const y = Math.random() * size;
      const len = Math.random() * 30 + 10;
      const angle = Math.random() * Math.PI * 2;
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(angle) * len, y + Math.sin(angle) * len);
      ctx.stroke();
    }
    
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    return texture;
  }

  public static generateEnvMap(size = 256): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    // Create a basic sky gradient for the environment map
    const grad = ctx.createLinearGradient(0, 0, 0, size);
    grad.addColorStop(0, '#3ba3e3'); // Sky Blue
    grad.addColorStop(0.5, '#d2b48c'); // Dusty Horizon
    grad.addColorStop(1, '#8b7355'); // Ground Brown
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);

    // Add a bright "sun" spot for shiny highlights
    ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.beginPath();
    ctx.arc(size * 0.5, size * 0.3, size * 0.15, 0, Math.PI * 2);
    ctx.fill();

    // Use a CanvasTexture with Equirectangular mapping which PMREM handles safely
    const texture = new THREE.CanvasTexture(canvas);
    texture.mapping = THREE.EquirectangularReflectionMapping;
    return texture;
  }
}
