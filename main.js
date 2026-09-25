import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

class BoxConfigurator {
  constructor(container) {
    this.container = container;
    this.renderContainer = null;
    this.state = {
      length: 200,
      width: 150,
      baseHeight: 80,
      lidHeight: 40,
      wallThickness: 2,
      overlap: 15,
      color: '#ffffff',
      finish: 'matte',
      lidOpen: false
    };

    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.controls = null;
    this.clock = new THREE.Clock();
    this.boxGroup = null;
    this.baseGroup = null;
    this.lidGroup = null;
    this.baseMesh = null;
    this.lidMesh = null;
    this.material = null;
    this.directionalLight = null;
    this.pmremGenerator = null;
    this.resizeObserver = null;
    this.updateFrame = null;
    this.targetLidY = 0;
    this.listeners = [];

    this.elements = {};
    this.numberFormat = new Intl.NumberFormat('fa-IR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });

    try {
      this.init();
    } catch (error) {
      console.error('Hardbox configurator initialization failed:', error);
      this.showError('The 3D preview could not be initialized. Please check your browser WebGL support and reload the page.');
    }
  }

  init() {
    this.cacheElements();
    this.renderContainer = this.container.querySelector('.mockup-stage') || this.container;

    this.initScene();
    this.initLights();
    this.initEnvironment();
    this.createBox();
    this.updateCalculations();
    this.bindEvents();
    this.onWindowResize();
    this.animate();

    requestAnimationFrame(() => {
      const loading = document.getElementById('loading');
      loading?.classList.add('is-hidden');
    });
  }

  cacheElements() {
    const ids = [
      'length',
      'width',
      'baseHeight',
      'lidHeight',
      'wallThickness',
      'overlap',
      'color',
      'finish',
      'toggleLid',
      'resetCamera',
      'outerDimensions',
      'innerDimensions',
      'outerVolume',
      'innerVolume',
      'surfaceArea',
      'lengthValue',
      'widthValue',
      'baseHeightValue',
      'lidHeightValue',
      'wallThicknessValue',
      'overlapValue',
      'viewOpen',
      'viewClosed',
      'viewReset',
      'dimensionBadge'
    ];

    for (const id of ids) {
      this.elements[id] = document.getElementById(id);
    }
  }

  initScene() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xf5f5f5);

    const maxDim = this.getMaxDimension();
    const totalHeight = this.getTotalHeight();

    this.camera = new THREE.PerspectiveCamera(
      45,
      1,
      1,
      5000
    );

    this.camera.position.set(
      maxDim * 1.5,
      maxDim * 1.2,
      maxDim * 1.5
    );

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance'
    });

    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setClearColor(0xf5f5f5, 1);

    this.renderContainer.appendChild(this.renderer.domElement);
    this.renderer.domElement.setAttribute('aria-label', 'Interactive 3D hardbox model');

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.minDistance = maxDim * 0.5;
    this.controls.maxDistance = maxDim * 5;
    this.controls.maxPolarAngle = Math.PI / 2 - 0.1;
    this.controls.target.set(0, totalHeight / 2, 0);
    this.camera.lookAt(this.controls.target);

    this.createGround(maxDim);
  }

  initLights() {
    const maxDim = this.getMaxDimension();

    this.directionalLight = new THREE.DirectionalLight(0xffffff, 3);
    this.directionalLight.position.set(100, 200, 100);
    this.directionalLight.castShadow = true;

    this.directionalLight.shadow.mapSize.set(2048, 2048);
    this.directionalLight.shadow.camera.left = -maxDim * 1.5;
    this.directionalLight.shadow.camera.right = maxDim * 1.5;
    this.directionalLight.shadow.camera.top = maxDim * 1.5;
    this.directionalLight.shadow.camera.bottom = -maxDim * 1.5;
    this.directionalLight.shadow.camera.near = 0.5;
    this.directionalLight.shadow.camera.far = 1000;
    this.directionalLight.shadow.bias = -0.0001;
    this.directionalLight.shadow.normalBias = 0.05;

    this.scene.add(this.directionalLight);

    const hemisphere = new THREE.HemisphereLight(0xffffff, 0x444444, 1);
    this.scene.add(hemisphere);
  }

  initEnvironment() {
    this.pmremGenerator = new THREE.PMREMGenerator(this.renderer);
    const environment = new RoomEnvironment(this.renderer);
    this.scene.environment = this.pmremGenerator.fromScene(environment, 0.04).texture;

    environment.dispose();
    this.pmremGenerator.dispose();
    this.pmremGenerator = null;
  }

  createGround(maxDim) {
    const radius = Math.max(1000, maxDim * 5);
    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(radius, 96),
      new THREE.ShadowMaterial({ opacity: 0.2 })
    );

    ground.rotation.x = -Math.PI / 2;
    ground.position.y = 0.01;
    ground.receiveShadow = true;
    ground.name = 'Ground';
    this.scene.add(ground);

    const grid = new THREE.GridHelper(1000, 20, 0xcccccc, 0xeeeeee);
    grid.position.y = 0.02;
    this.scene.add(grid);
  }

  createBox() {
    this.boxGroup = new THREE.Group();
    this.boxGroup.name = 'Hardbox';

    this.baseGroup = new THREE.Group();
    this.baseGroup.name = 'Base';

    this.lidGroup = new THREE.Group();
    this.lidGroup.name = 'Lid';

    this.material = new THREE.MeshStandardMaterial({
      color: this.state.color,
      roughness: 0.9,
      metalness: 0.0,
      side: THREE.DoubleSide,
      envMapIntensity: 1.0
    });

    this.baseMesh = new THREE.Mesh(new THREE.BufferGeometry(), this.material);
    this.baseMesh.castShadow = true;
    this.baseMesh.receiveShadow = true;
    this.baseMesh.name = 'BaseShell';

    this.lidMesh = new THREE.Mesh(new THREE.BufferGeometry(), this.material);
    this.lidMesh.castShadow = true;
    this.lidMesh.receiveShadow = true;
    this.lidMesh.name = 'LidShell';

    this.baseGroup.add(this.baseMesh);
    this.lidGroup.add(this.lidMesh);
    this.boxGroup.add(this.baseGroup, this.lidGroup);
    this.scene.add(this.boxGroup);

    this.updateBox();
  }

  createRoundedPart(width, height, depth, x, y, z) {
    const safeWidth = Math.max(width, 0.2);
    const safeHeight = Math.max(height, 0.2);
    const safeDepth = Math.max(depth, 0.2);

    const radius = Math.min(
      0.5,
      safeWidth / 2 - 0.01,
      safeHeight / 2 - 0.01,
      safeDepth / 2 - 0.01
    );

    const geometry = new RoundedBoxGeometry(
      safeWidth,
      safeHeight,
      safeDepth,
      2,
      Math.max(0.01, radius)
    );

    geometry.translate(x, y, z);
    return geometry;
  }

  buildBaseGeometry() {
    const { length: L, width: W, baseHeight: Hb, wallThickness: t } = this.state;

    const parts = [];

    parts.push(
      this.createRoundedPart(L, t, W, 0, t / 2, 0)
    );

    const wallHeight = Math.max(Hb - t, 0.2);
    const wallCenterY = t + wallHeight / 2;

    parts.push(
      this.createRoundedPart(t, wallHeight, W, -(L - t) / 2, wallCenterY, 0),
      this.createRoundedPart(t, wallHeight, W, (L - t) / 2, wallCenterY, 0),
      this.createRoundedPart(L - 2 * t, wallHeight, t, 0, wallCenterY, -(W - t) / 2),
      this.createRoundedPart(L - 2 * t, wallHeight, t, 0, wallCenterY, (W - t) / 2)
    );

    return this.mergeParts(parts);
  }

  buildLidGeometry() {
    const {
      length: L,
      width: W,
      baseHeight: Hb,
      lidHeight: Hl,
      wallThickness: t,
      overlap: O
    } = this.state;

    const parts = [];
    const lidBottom = Hb - O;

    parts.push(
      this.createRoundedPart(L, t, W, 0, lidBottom + t / 2, 0)
    );

    const wallHeight = Math.max(Hl - t, 0.2);
    const wallCenterY = lidBottom + t + wallHeight / 2;

    parts.push(
      this.createRoundedPart(t, wallHeight, W, -(L - t) / 2, wallCenterY, 0),
      this.createRoundedPart(t, wallHeight, W, (L - t) / 2, wallCenterY, 0),
      this.createRoundedPart(L - 2 * t, wallHeight, t, 0, wallCenterY, -(W - t) / 2),
      this.createRoundedPart(L - 2 * t, wallHeight, t, 0, wallCenterY, (W - t) / 2)
    );

    return this.mergeParts(parts);
  }

  mergeParts(parts) {
    const merged = mergeGeometries(parts, true);

    for (const geometry of parts) {
      geometry.dispose();
    }

    if (!merged) {
      throw new Error('Unable to merge hardbox geometry.');
    }

    merged.computeBoundingBox();
    merged.computeBoundingSphere();
    return merged;
  }

  updateBox() {
    if (!this.baseMesh || !this.lidMesh) {
      return;
    }

    const newBaseGeometry = this.buildBaseGeometry();
    const newLidGeometry = this.buildLidGeometry();

    const oldBaseGeometry = this.baseMesh.geometry;
    const oldLidGeometry = this.lidMesh.geometry;

    this.baseMesh.geometry = newBaseGeometry;
    this.lidMesh.geometry = newLidGeometry;

    if (oldBaseGeometry) {
      oldBaseGeometry.dispose();
    }

    if (oldLidGeometry) {
      oldLidGeometry.dispose();
    }

    this.targetLidY = this.state.lidOpen ? 100 : 0;
    this.updateCameraBounds();
    this.updateCalculations();
  }

  updateCameraBounds() {
    const maxDim = this.getMaxDimension();
    const totalHeight = this.getTotalHeight();

    this.controls.minDistance = maxDim * 0.5;
    this.controls.maxDistance = maxDim * 5;
    this.controls.target.set(0, totalHeight / 2, 0);

    const shadowCamera = this.directionalLight?.shadow.camera;
    if (shadowCamera) {
      shadowCamera.left = -maxDim * 1.5;
      shadowCamera.right = maxDim * 1.5;
      shadowCamera.top = maxDim * 1.5;
      shadowCamera.bottom = -maxDim * 1.5;
      shadowCamera.updateProjectionMatrix();
    }
  }

  setLidView(open) {
    this.state.lidOpen = open;
    this.targetLidY = open ? 100 : 0;
    this.updateViewButtons();
  }

  updateViewButtons() {
    const open = this.state.lidOpen;
    this.elements.toggleLid.textContent = open ? 'نمای بسته' : 'نمای باز';
    this.elements.toggleLid.setAttribute('aria-pressed', String(open));
    this.elements.viewOpen.classList.toggle('is-active', open);
    this.elements.viewClosed.classList.toggle('is-active', !open);
  }

  resetCamera() {
    const maxDim = this.getMaxDimension();
    const totalHeight = this.getTotalHeight();

    this.camera.position.set(
      maxDim * 1.5,
      maxDim * 1.2,
      maxDim * 1.5
    );

    this.controls.target.set(0, totalHeight / 2, 0);
    this.controls.update();
  }

  updateCalculations() {
    const {
      length: L,
      width: W,
      baseHeight: Hb,
      lidHeight: Hl,
      wallThickness: t,
      overlap: O
    } = this.state;

    const outerHeight = Hb + Hl - O;
    const innerLength = Math.max(0, L - 2 * t);
    const innerWidth = Math.max(0, W - 2 * t);
    const innerHeight = Math.max(0, Hb - t + Hl - t - O);

    const outerVolume = (L * W * outerHeight) / 1000;
    const innerVolume = (innerLength * innerWidth * innerHeight) / 1000;
    const surfaceArea = 2 * (
      L * W +
      L * outerHeight +
      W * outerHeight
    ) / 100;

    this.elements.outerDimensions.textContent =
      this.formatDimensions(L, W, outerHeight);

    this.elements.innerDimensions.textContent =
      this.formatDimensions(innerLength, innerWidth, innerHeight);

    this.elements.outerVolume.textContent =
      this.formatNumber(outerVolume) + ' cm³';

    this.elements.innerVolume.textContent =
      this.formatNumber(innerVolume) + ' cm³';

    this.elements.surfaceArea.textContent =
      this.formatNumber(surfaceArea) + ' cm²';

    if (this.elements.dimensionBadge) {
      this.elements.dimensionBadge.textContent =
        `${this.formatNumber(L / 10)} × ${this.formatNumber(W / 10)} × ${this.formatNumber(outerHeight / 10)} cm`;
    }
  }

  formatDimensions(a, b, c) {
    return `${this.formatNumber(a)} × ${this.formatNumber(b)} × ${this.formatNumber(c)} mm`;
  }

  formatNumber(value) {
    return this.numberFormat.format(value);
  }

  getMaxDimension() {
    const { length: L, width: W } = this.state;
    return Math.max(L, W, this.getTotalHeight());
  }

  getTotalHeight() {
    return this.state.baseHeight + this.state.lidHeight - this.state.overlap;
  }

  updateStateFromControls() {
    const dimensionKeys = [
      'length',
      'width',
      'baseHeight',
      'lidHeight',
      'wallThickness',
      'overlap'
    ];

    for (const key of dimensionKeys) {
      const value = Number.parseFloat(this.elements[key].value);
      if (Number.isFinite(value)) {
        this.state[key] = value;
        this.elements[key + 'Value'].textContent = `${value} mm`;
      }
    }
  }

  scheduleBoxUpdate() {
    if (this.updateFrame !== null) {
      return;
    }

    this.updateFrame = requestAnimationFrame(() => {
      this.updateFrame = null;
      this.updateStateFromControls();
      this.updateBox();
    });
  }

  updateMaterial() {
    if (!this.material) {
      return;
    }

    this.material.color.set(this.state.color);

    const finishSettings = {
      matte: { roughness: 0.9, metalness: 0.0 },
      satin: { roughness: 0.5, metalness: 0.0 },
      glossy: { roughness: 0.1, metalness: 0.0 }
    };

    const settings = finishSettings[this.state.finish] ?? finishSettings.matte;
    this.material.roughness = settings.roughness;
    this.material.metalness = settings.metalness;
    this.material.needsUpdate = true;
  }

  bindEvents() {
    const dimensions = [
      'length',
      'width',
      'baseHeight',
      'lidHeight',
      'wallThickness',
      'overlap'
    ];

    for (const id of dimensions) {
      const handler = () => this.scheduleBoxUpdate();
      this.elements[id].addEventListener('input', handler);
      this.listeners.push(() => this.elements[id].removeEventListener('input', handler));
    }

    const colorHandler = (event) => {
      this.state.color = event.target.value;
      this.updateMaterial();
    };

    this.elements.color.addEventListener('input', colorHandler);
    this.listeners.push(() => this.elements.color.removeEventListener('input', colorHandler));

    const finishHandler = (event) => {
      this.state.finish = event.target.value;
      this.updateMaterial();
    };

    this.elements.finish.addEventListener('change', finishHandler);
    this.listeners.push(() => this.elements.finish.removeEventListener('change', finishHandler));

    const toggleHandler = () => {
      this.state.lidOpen = !this.state.lidOpen;
      this.targetLidY = this.state.lidOpen ? 100 : 0;
      this.updateViewButtons();
      this.elements.toggleLid.setAttribute('aria-pressed', String(this.state.lidOpen));
    };

    this.elements.toggleLid.addEventListener('click', toggleHandler);
    this.listeners.push(() => this.elements.toggleLid.removeEventListener('click', toggleHandler));

    const resetHandler = () => this.resetCamera();

    this.elements.resetCamera.addEventListener('click', resetHandler);
    this.listeners.push(() => this.elements.resetCamera.removeEventListener('click', resetHandler));

    const openViewHandler = () => this.setLidView(true);
    const closedViewHandler = () => this.setLidView(false);
    const resetViewHandler = () => this.resetCamera();

    this.elements.viewOpen.addEventListener('click', openViewHandler);
    this.elements.viewClosed.addEventListener('click', closedViewHandler);
    this.elements.viewReset.addEventListener('click', resetViewHandler);
    this.listeners.push(() => this.elements.viewOpen.removeEventListener('click', openViewHandler));
    this.listeners.push(() => this.elements.viewClosed.removeEventListener('click', closedViewHandler));
    this.listeners.push(() => this.elements.viewReset.removeEventListener('click', resetViewHandler));

    const resizeHandler = () => this.onWindowResize();
    window.addEventListener('resize', resizeHandler);
    this.listeners.push(() => window.removeEventListener('resize', resizeHandler));

    this.resizeObserver = new ResizeObserver(() => this.onWindowResize());
    this.resizeObserver.observe(this.renderContainer);

    const canvas = this.renderer?.domElement;
    if (canvas) {
      const contextLostHandler = (event) => {
        event.preventDefault();
        console.warn('WebGL context lost.');
      };

      const contextRestoredHandler = () => {
        console.info('WebGL context restored.');
        this.onWindowResize();
      };

      canvas.addEventListener('webglcontextlost', contextLostHandler, false);
      canvas.addEventListener('webglcontextrestored', contextRestoredHandler, false);

      this.listeners.push(() => {
        canvas.removeEventListener('webglcontextlost', contextLostHandler);
        canvas.removeEventListener('webglcontextrestored', contextRestoredHandler);
      });
    }
  }

  onWindowResize() {
    if (!this.renderer || !this.camera) {
      return;
    }

    const width = Math.max(1, this.renderContainer?.clientWidth || this.container.clientWidth);
    const height = Math.max(1, this.renderContainer?.clientHeight || this.container.clientHeight);

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }

  animate() {
    if (!this.renderer) {
      return;
    }

    this.renderer.setAnimationLoop(() => {
      const delta = this.clock.getDelta();

      if (this.lidGroup) {
        const smoothing = 1 - Math.pow(0.0001, delta);
        this.lidGroup.position.y = THREE.MathUtils.lerp(
          this.lidGroup.position.y,
          this.targetLidY,
          Math.min(smoothing, 0.25)
        );
      }

      this.controls.update();
      this.renderer.render(this.scene, this.camera);
    });
  }

  showError(message) {
    const loading = document.getElementById('loading');
    if (loading) {
      loading.remove();
    }

    const error = document.createElement('div');
    error.className = 'webgl-error';
    error.innerHTML = `<div><strong>3D preview unavailable</strong><span>${this.escapeHtml(message)}</span></div>`;
    this.container.replaceChildren(error);
  }

  escapeHtml(value) {
    return String(value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  dispose() {
    if (this.updateFrame !== null) {
      cancelAnimationFrame(this.updateFrame);
      this.updateFrame = null;
    }

    for (const removeListener of this.listeners) {
      removeListener();
    }
    this.listeners = [];

    this.resizeObserver?.disconnect();
    this.resizeObserver = null;

    this.renderer?.setAnimationLoop(null);
    this.controls?.dispose();

    this.baseMesh?.geometry?.dispose();
    this.lidMesh?.geometry?.dispose();
    this.material?.dispose();

    this.scene?.traverse((object) => {
      if (object.isMesh) {
        object.geometry?.dispose();
        if (Array.isArray(object.material)) {
          object.material.forEach((material) => material.dispose());
        } else {
          object.material?.dispose();
        }
      }
    });

    this.renderer?.dispose();
    this.pmremGenerator?.dispose();

    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.controls = null;
  }
}

window.boxConfigurator = new BoxConfigurator(document.getElementById('viewport'));

window.addEventListener('beforeunload', () => {
  window.boxConfigurator?.dispose();
}, { once: true });
