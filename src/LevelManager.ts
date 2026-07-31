import * as THREE from 'three';
import { TextureGenerator } from './TextureGenerator';

export class LevelManager {
  scene: THREE.Scene;
  collisionBoxes: THREE.Box3[] = [];
  objectsGroup: THREE.Group;

  private floorMat = new THREE.MeshStandardMaterial({
    roughness: 0.8,
    metalness: 0.1
  });
  
  private wallMat = new THREE.MeshStandardMaterial({
    roughness: 0.9,
    metalness: 0.05
  });

  // Dust particles variables
  private dustPoints!: THREE.Points;
  private dustGeometry!: THREE.BufferGeometry;
  private dustPositions!: Float32Array;
  private dustVelocities: number[] = [];
  private dustCount = 80;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.objectsGroup = new THREE.Group();
    this.scene.add(this.objectsGroup);
    
    this.loadTextures();
    this.buildLevel();
    this.setupLighting();
    this.createAtmosphericDust();
  }

  // Sobel Operator height-to-normal map generator for real PBR bumps (Valorant style)
  private createNormalMap(texture: THREE.Texture, strength = 1.5): THREE.CanvasTexture {
    const img = texture.image as HTMLImageElement;
    const canvas = document.createElement('canvas');
    canvas.width = img.width || 256;
    canvas.height = img.height || 256;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0);
    
    const width = canvas.width;
    const height = canvas.height;
    
    const imgData = ctx.getImageData(0, 0, width, height);
    const src = imgData.data;
    
    const destImgData = ctx.createImageData(width, height);
    const dest = destImgData.data;
    
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const getGray = (px: number, py: number) => {
          const idx = (py * width + px) * 4;
          return (src[idx] + src[idx+1] + src[idx+2]) / 3;
        };
        
        const tl = getGray(x - 1, y - 1);
        const tc = getGray(x, y - 1);
        const tr = getGray(x + 1, y - 1);
        const ml = getGray(x - 1, y);
        const mr = getGray(x + 1, y);
        const bl = getGray(x - 1, y + 1);
        const bc = getGray(x, y + 1);
        const br = getGray(x + 1, y + 1);
        
        const dx = (tr + 2.0 * mr + br) - (tl + 2.0 * ml + bl);
        const dy = (bl + 2.0 * bc + br) - (tl + 2.0 * tc + tr);
        
        const nx = -dx * strength / 255.0;
        const ny = -dy * strength / 255.0;
        const nz = 1.0;
        
        const len = Math.sqrt(nx*nx + ny*ny + nz*nz);
        const r = (nx / len + 1.0) * 0.5;
        const g = (ny / len + 1.0) * 0.5;
        const b = (nz / len + 1.0) * 0.5;
        
        const destIdx = (y * width + x) * 4;
        dest[destIdx] = Math.round(r * 255);
        dest[destIdx+1] = Math.round(g * 255);
        dest[destIdx+2] = Math.round(b * 255);
        dest[destIdx+3] = 255;
      }
    }
    ctx.putImageData(destImgData, 0, 0);
    
    const normTexture = new THREE.CanvasTexture(canvas);
    normTexture.wrapS = THREE.RepeatWrapping;
    normTexture.wrapT = THREE.RepeatWrapping;
    return normTexture;
  }

  private loadTextures() {
    // Dirt Floor
    const dirtTex = TextureGenerator.generateDirtTexture(512);
    dirtTex.repeat.set(16, 16);
    this.floorMat.map = dirtTex;
    
    const dirtNorm = this.createNormalMap(dirtTex, 2.5);
    dirtNorm.repeat.set(16, 16);
    this.floorMat.normalMap = dirtNorm;
    this.floorMat.needsUpdate = true;

    // Blue Corrugated Wall
    const wallTex = TextureGenerator.generateCorrugatedMetalTexture(512);
    wallTex.repeat.set(12, 3);
    this.wallMat.map = wallTex;
    this.wallMat.roughness = 0.7;
    
    // Deep normal map to simulate 3D ridges
    const wallNorm = this.createNormalMap(wallTex, 4.0);
    wallNorm.repeat.set(12, 3);
    this.wallMat.normalMap = wallNorm;
    this.wallMat.needsUpdate = true;
  }

  private createContactShadowTexture(): THREE.Texture {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d')!;
    
    const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    gradient.addColorStop(0, 'rgba(3, 6, 8, 0.9)');
    gradient.addColorStop(0.3, 'rgba(3, 6, 8, 0.65)');
    gradient.addColorStop(0.85, 'rgba(3, 6, 8, 0.15)');
    gradient.addColorStop(1, 'rgba(3, 6, 8, 0.0)');
    
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 64, 64);
    
    const texture = new THREE.CanvasTexture(canvas);
    return texture;
  }

  private buildLevel() {
    const shadowTexture = this.createContactShadowTexture();
    const shadowMat = new THREE.MeshBasicMaterial({
      map: shadowTexture,
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
      opacity: 0.8
    });

    // 1. FLOOR - Arena Plane
    const floorGeo = new THREE.PlaneGeometry(100, 100);
    const floor = new THREE.Mesh(floorGeo, this.floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = false; // Disable to fix lag
    this.objectsGroup.add(floor);

    // 2. BOUNDARY WALLS - Arena bounds
    const wallHeight = 12;
    const wallThickness = 1.2;

    const boundaryWalls = [
      { size: [100, wallHeight, wallThickness], pos: [0, wallHeight / 2, -50] },
      { size: [100, wallHeight, wallThickness], pos: [0, wallHeight / 2, 50] },
      { size: [wallThickness, wallHeight, 100], pos: [-50, wallHeight / 2, 0] },
      { size: [wallThickness, wallHeight, 100], pos: [50, wallHeight / 2, 0] }
    ];

    boundaryWalls.forEach(w => {
      const geo = new THREE.BoxGeometry(w.size[0], w.size[1], w.size[2]);
      const wallMesh = new THREE.Mesh(geo, this.wallMat);
      wallMesh.position.set(w.pos[0], w.pos[1], w.pos[2]);
      wallMesh.receiveShadow = false;
      wallMesh.castShadow = false;
      this.objectsGroup.add(wallMesh);
      this.collisionBoxes.push(new THREE.Box3().setFromObject(wallMesh));
    });

    // 3. PILARS AND COLUMNS WITH CONTACT SHADOWS
    const pillars = [
      [-15, -15], [-15, 15], [15, -15], [15, 15],
      [-30, -30], [-30, 30], [30, -30], [30, 30]
    ];

    pillars.forEach(([px, pz]) => {
      const colGeo = new THREE.BoxGeometry(3.2, wallHeight, 3.2);
      const colMat = new THREE.MeshStandardMaterial({
        color: 0xeae6e0,
        roughness: 0.75,
        metalness: 0.1
      });
      const col = new THREE.Mesh(colGeo, colMat);
      col.position.set(px, wallHeight / 2, pz);
      this.objectsGroup.add(col);
      this.collisionBoxes.push(new THREE.Box3().setFromObject(col));

      // Emissive visual stripes
      const stripGeo = new THREE.BoxGeometry(0.25, wallHeight - 1, 0.25);
      const stripMat = new THREE.MeshStandardMaterial({
        color: 0xff4400,
        emissive: 0xff4400,
        emissiveIntensity: 3.5
      });

      const strip1 = new THREE.Mesh(stripGeo, stripMat);
      strip1.position.set(px, wallHeight / 2, pz + 1.61);
      this.objectsGroup.add(strip1);

      // Contact shadow plane
      const shadowPlaneGeo = new THREE.PlaneGeometry(7.0, 7.0);
      const shPlane = new THREE.Mesh(shadowPlaneGeo, shadowMat);
      shPlane.rotation.x = -Math.PI / 2;
      shPlane.position.set(px, 0.02, pz);
      this.objectsGroup.add(shPlane);
    });

    // 4. COVER CRATES
    const crates = [
      { size: [3.2, 2.2, 3.2], pos: [0, 1.1, 10], rot: 0.35 },
      { size: [2.2, 2.2, 2.2], pos: [-2.8, 1.1, 12.5], rot: -0.15 },
      { size: [2.2, 4.4, 2.2], pos: [6.5, 2.2, -5], rot: 0.1 },
      { size: [3.2, 2.2, 3.2], pos: [-8, 1.1, -8], rot: 0.6 },
      { size: [4.4, 3.2, 2.2], pos: [13, 1.6, 9.5], rot: -0.45 },
      { size: [3.2, 3.2, 3.2], pos: [-12, 1.6, 21.5], rot: 0 },
      { size: [2.2, 2.2, 2.2], pos: [20, 1.1, -20], rot: 0.25 },
      { size: [3.2, 2.2, 3.2], pos: [-26, 1.1, 0], rot: -0.5 },
      { size: [4.4, 4.4, 4.4], pos: [24, 2.2, 24], rot: 0.1 }
    ];

    crates.forEach(c => {
      const crateGeo = new THREE.BoxGeometry(c.size[0], c.size[1], c.size[2]);
      const crateMat = new THREE.MeshStandardMaterial({
        color: 0x8b7355, // Wood/Dirt color
        roughness: 0.8,
        metalness: 0.05
      });
      const crate = new THREE.Mesh(crateGeo, crateMat);
      crate.position.set(c.pos[0], c.pos[1], c.pos[2]);
      crate.rotation.y = c.rot;
      crate.castShadow = true;
      crate.receiveShadow = true;
      this.objectsGroup.add(crate);
      this.collisionBoxes.push(new THREE.Box3().setFromObject(crate));

      // Contact shadow
      const shWidth = Math.max(c.size[0], c.size[2]) * 2.2;
      const shGeo = new THREE.PlaneGeometry(shWidth, shWidth);
      const shPlane = new THREE.Mesh(shGeo, shadowMat);
      shPlane.rotation.x = -Math.PI / 2;
      shPlane.position.set(c.pos[0], 0.02, c.pos[2]);
      this.objectsGroup.add(shPlane);
    });

    // 4b. SANDBAG BARRICADES
    const createSandbagBarricade = (x: number, z: number, rotation: number) => {
      const bagMat = new THREE.MeshStandardMaterial({ color: 0xbaa78c, roughness: 0.9, metalness: 0 });
      const barricadeGroup = new THREE.Group();
      
      // Simple stacked spheres stretched to look like sandbags
      const bagGeo = new THREE.SphereGeometry(0.7, 8, 8);
      
      for(let layer = 0; layer < 3; layer++) {
        for(let i = 0; i < 4; i++) {
          const bag = new THREE.Mesh(bagGeo, bagMat);
          bag.scale.set(1.5, 0.6, 1.0);
          // Offset each layer to interlock
          const offsetX = (i * 1.8) - 2.7 + (layer % 2 === 0 ? 0 : 0.9);
          if (offsetX > 2.8) continue; // Don't overflow the stack
          bag.position.set(offsetX, 0.4 + layer * 0.7, (Math.random() - 0.5) * 0.3);
          bag.rotation.y = (Math.random() - 0.5) * 0.2;
          bag.rotation.z = (Math.random() - 0.5) * 0.1;
          barricadeGroup.add(bag);
        }
      }

      barricadeGroup.position.set(x, 0, z);
      barricadeGroup.rotation.y = rotation;
      this.objectsGroup.add(barricadeGroup);
      
      // Collision block for barricade
      const colMesh = new THREE.Mesh(new THREE.BoxGeometry(6, 2.2, 1.8));
      colMesh.position.set(x, 1.1, z);
      colMesh.rotation.y = rotation;
      // We don't add colMesh to scene, just use it for Box3 computation
      colMesh.updateMatrixWorld();
      this.collisionBoxes.push(new THREE.Box3().setFromObject(colMesh));

      // Shadow
      const shGeo = new THREE.PlaneGeometry(8, 5);
      const shPlane = new THREE.Mesh(shGeo, shadowMat);
      shPlane.rotation.x = -Math.PI / 2;
      shPlane.position.set(x, 0.02, z);
      this.objectsGroup.add(shPlane);
    };

    createSandbagBarricade(8, -12, 0.4);
    createSandbagBarricade(-15, 8, -0.2);
    createSandbagBarricade(12, 18, 1.1);

    // 5. PLATFORM
    const platGeo = new THREE.BoxGeometry(18, 2, 18);
    const platMat = new THREE.MeshStandardMaterial({
      color: 0xcdbeb5,
      roughness: 0.7,
      metalness: 0.1
    });
    const platform = new THREE.Mesh(platGeo, platMat);
    platform.position.set(0, 1, -26);
    this.objectsGroup.add(platform);
    this.collisionBoxes.push(new THREE.Box3().setFromObject(platform));

    const platShGeo = new THREE.PlaneGeometry(28, 28);
    const platSh = new THREE.Mesh(platShGeo, shadowMat);
    platSh.rotation.x = -Math.PI / 2;
    platSh.position.set(0, 0.02, -26);
    this.objectsGroup.add(platSh);

    const rampCrates = [
      { size: [4, 0.6, 4], pos: [0, 0.3, -15.5], rot: 0 },
      { size: [4, 1.2, 4], pos: [0, 0.9, -19.5], rot: 0 }
    ];
    rampCrates.forEach(rc => {
      const geo = new THREE.BoxGeometry(rc.size[0], rc.size[1], rc.size[2]);
      const mesh = new THREE.Mesh(geo, platMat);
      mesh.position.set(rc.pos[0], rc.pos[1], rc.pos[2]);
      this.objectsGroup.add(mesh);
      this.collisionBoxes.push(new THREE.Box3().setFromObject(mesh));
      
      const sh = new THREE.Mesh(new THREE.PlaneGeometry(8, 8), shadowMat);
      sh.rotation.x = -Math.PI / 2;
      sh.position.set(rc.pos[0], 0.02, rc.pos[2]);
      this.objectsGroup.add(sh);
    });

    this.buildOverheadAwnings();
    this.buildSkyDome();
  }

  private buildSkyDome() {
    const skyGeo = new THREE.SphereGeometry(450, 32, 15);
    const skyMat = new THREE.ShaderMaterial({
      uniforms: {
        topColor: { value: new THREE.Color(0x3ba3e3) },
        bottomColor: { value: new THREE.Color(0xd2b48c) },
        offset: { value: 33 },
        exponent: { value: 0.6 }
      },
      vertexShader: `
        varying vec3 vWorldPosition;
        void main() {
          vec4 worldPosition = modelMatrix * vec4(position, 1.0);
          vWorldPosition = worldPosition.xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 topColor;
        uniform vec3 bottomColor;
        uniform float offset;
        uniform float exponent;
        varying vec3 vWorldPosition;
        void main() {
          float h = normalize(vWorldPosition + offset).y;
          gl_FragColor = vec4(mix(bottomColor, topColor, max(pow(max(h, 0.0), exponent), 0.0)), 1.0);
        }
      `,
      side: THREE.BackSide,
      fog: false
    });
    const sky = new THREE.Mesh(skyGeo, skyMat);
    this.scene.add(sky);
  }

  private buildOverheadAwnings() {
    const awningMat = new THREE.MeshStandardMaterial({
      color: 0xd84545,
      roughness: 0.9,
      metalness: 0.05,
      side: THREE.DoubleSide
    });

    const structureMat = new THREE.MeshStandardMaterial({
      color: 0x44484b,
      roughness: 0.5,
      metalness: 0.75
    });

    const awningWidth = 14;
    const awningLength = 22;

    const awningsData = [
      { pos: [-15, 11, -10], rot: [0.15, 0.2, -0.05] },
      { pos: [15, 11, -12], rot: [0.1, -0.15, 0.05] }
    ];

    awningsData.forEach((ad) => {
      const clothGeo = new THREE.PlaneGeometry(awningWidth, awningLength);
      const cloth = new THREE.Mesh(clothGeo, awningMat);
      cloth.rotation.set(-Math.PI / 2 + ad.rot[0], ad.rot[1], ad.rot[2]);
      cloth.position.set(ad.pos[0], ad.pos[1], ad.pos[2]);
      cloth.castShadow = true;
      cloth.receiveShadow = true;
      this.objectsGroup.add(cloth);

      const beamGeo = new THREE.CylinderGeometry(0.08, 0.08, 12, 6);
      
      const pole1 = new THREE.Mesh(beamGeo, structureMat);
      pole1.position.set(ad.pos[0] - awningWidth / 2, 6, ad.pos[2]);
      pole1.castShadow = true;
      this.objectsGroup.add(pole1);

      const pole2 = new THREE.Mesh(beamGeo, structureMat);
      pole2.position.set(ad.pos[0] + awningWidth / 2, 6, ad.pos[2]);
      pole2.castShadow = true;
      this.objectsGroup.add(pole2);
    });
  }

  private setupLighting() {
    // Warm daylight sky + dirt ground bounce
    const hemiLight = new THREE.HemisphereLight(0x87ceeb, 0xd2b48c, 1.0);
    this.scene.add(hemiLight);

    // Strong, warm directional sunlight
    const dirLight = new THREE.DirectionalLight(0xffeedd, 2.5);
    dirLight.position.set(30, 50, -20);
    dirLight.castShadow = false; // Disable to fix lag
    this.scene.add(dirLight);
  }

  private createAtmosphericDust() {
    this.dustGeometry = new THREE.BufferGeometry();
    this.dustPositions = new Float32Array(this.dustCount * 3);
    this.dustVelocities = [];

    for (let i = 0; i < this.dustCount; i++) {
      const idx = i * 3;
      this.dustPositions[idx] = (Math.random() - 0.5) * 90;
      this.dustPositions[idx + 1] = Math.random() * 12;
      this.dustPositions[idx + 2] = (Math.random() - 0.5) * 90;

      this.dustVelocities.push(
        (Math.random() - 0.5) * 0.25,
        (Math.random() * 0.12 + 0.04),
        (Math.random() - 0.5) * 0.25
      );
    }

    this.dustGeometry.setAttribute('position', new THREE.BufferAttribute(this.dustPositions, 3));

    const dustMat = new THREE.PointsMaterial({
      size: 0.12,
      color: 0xff7700,
      transparent: true,
      opacity: 0.55,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });

    this.dustPoints = new THREE.Points(this.dustGeometry, dustMat);
    this.scene.add(this.dustPoints);
  }

  updateDust(dt: number) {
    const positions = this.dustGeometry.attributes.position.array as Float32Array;
    const count = this.dustCount;

    for (let i = 0; i < count; i++) {
      const idx = i * 3;
      positions[idx] += this.dustVelocities[idx] * dt;
      positions[idx + 1] += this.dustVelocities[idx + 1] * dt;
      positions[idx + 2] += this.dustVelocities[idx + 2] * dt;

      if (positions[idx + 1] > 12) {
        positions[idx + 1] = 0;
        positions[idx] = (Math.random() - 0.5) * 90;
        positions[idx + 2] = (Math.random() - 0.5) * 90;
      }
    }

    this.dustGeometry.attributes.position.needsUpdate = true;
  }

  collisionCheck(pos: THREE.Vector3, radius: number): boolean {
    const playerBox = new THREE.Box3(
      new THREE.Vector3(pos.x - radius, pos.y - 1.0, pos.z - radius),
      new THREE.Vector3(pos.x + radius, pos.y + 0.2, pos.z + radius)
    );

    for (let i = 0; i < this.collisionBoxes.length; i++) {
      if (playerBox.intersectsBox(this.collisionBoxes[i])) {
        return true;
      }
    }
    return false;
  }
}
