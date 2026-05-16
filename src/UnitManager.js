import * as THREE from 'three';
import { UNIT_CATEGORIES, CUSTOM_ITEM_DEFS } from './Constants.js';

export class UnitManager {
  constructor(sceneManager, dataStore, modelManager, tgaLoader) {
    this.sceneManager = sceneManager;
    this.dataStore = dataStore;
    this.modelManager = modelManager;
    this.tgaLoader = tgaLoader;
    this.meshes = [];
    this.labelSprites = [];
    this.customItemsRegistry = {};
    this.customItemsLoaded = false;
  }

  // ════════════════════════════════════════════════════════════
  //  CUSTOM ITEMS LOADING
  // ════════════════════════════════════════════════════════════
  async loadCustomItems() {
    if (this.customItemsLoaded) return;

    for (const item of CUSTOM_ITEM_DEFS) {
      try {
        const texture = await new Promise((resolve, reject) => {
          this.tgaLoader.load(`/src/icons/${item.filename}.tga`, resolve, undefined, reject);
        });
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.wrapS = THREE.ClampToEdgeWrapping;
        texture.wrapT = THREE.ClampToEdgeWrapping;
        texture.flipY = false;

        this.customItemsRegistry[item.filename] = {
          label: item.label,
          icon: '🎒',
          color: item.color,
          texture: texture
        };
      } catch (err) {
        console.warn(`加载 ${item.filename}.tga 失败:`, err);
      }
    }

    this.customItemsLoaded = true;
    console.log('自定义物品已加载:', Object.keys(this.customItemsRegistry));
  }

  // ════════════════════════════════════════════════════════════
  //  UNIT DEFINITION LOOKUP
  // ════════════════════════════════════════════════════════════
  getUnitDef(type) {
    for (const cat of Object.values(UNIT_CATEGORIES)) {
      if (cat.units && cat.units[type]) return cat.units[type];
    }
    if (this.customItemsRegistry[type]) {
      return {
        label: this.customItemsRegistry[type].label,
        icon: '🎒',
        color: this.customItemsRegistry[type].color,
        desc: '自定义物品'
      };
    }
    return { label: type, icon: '?', color: 0xaaaaaa, desc: '' };
  }

  // ════════════════════════════════════════════════════════════
  //  TEXT SPRITE UTILITY
  // ════════════════════════════════════════════════════════════
  createTextSprite(text, color) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = 1024; canvas.height = 256;
    ctx.clearRect(0, 0, 1024, 256);
    ctx.font = 'bold 72px "Inter", Arial, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0,0,0,0.9)'; ctx.shadowBlur = 4;
    ctx.shadowOffsetX = 1; ctx.shadowOffsetY = 1;
    const hex = typeof color === 'number' ? '#' + color.toString(16).padStart(6, '0') : color;
    ctx.fillStyle = hex;
    ctx.fillText(text, 512, 128);
    const tex = new THREE.CanvasTexture(canvas); tex.needsUpdate = true;
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(0.5, 0.125, 1);
    sprite.renderOrder = 999;
    return sprite;
  }

  // ════════════════════════════════════════════════════════════
  //  UNIT LABEL MANAGEMENT
  // ════════════════════════════════════════════════════════════
  createUnitLabel(mesh, text, color) {
    const sprite = this.createTextSprite(text, color);
    const spriteOffsetY = 0.5;
    sprite.position.set(mesh.position.x, mesh.position.y + spriteOffsetY, mesh.position.z);
    sprite.userData.parentUnit = mesh;
    sprite.userData.offsetY = spriteOffsetY;
    this.sceneManager.getScene().add(sprite);
    this.labelSprites.push(sprite);
    return sprite;
  }

  updateUnitSprite(mesh) {
    const sprite = this.labelSprites.find(s => s.userData.parentUnit === mesh);
    if (sprite) {
      sprite.position.set(mesh.position.x, mesh.position.y + sprite.userData.offsetY, mesh.position.z);
    }
  }

  // ════════════════════════════════════════════════════════════
  //  UNIT MESH FACTORY
  // ════════════════════════════════════════════════════════════
  createUnitMesh(type, x, z, label, unitScale) {
    const def = this.getUnitDef(type);
    const isMonster = !!UNIT_CATEGORIES.monsters.units[type];
    const group = this.createChibiMesh(type, def.color, isMonster);
    group.name = `unit_${type}_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;

    group.position.set(x, 0, z);
    const s = unitScale !== undefined ? unitScale : 0.1;
    group.scale.set(s, s, s);
    group.userData = { type, label: label || def.label, role: type, isUnit: true, unitScale: s, isMonster };
    this.sceneManager.getScene().add(group);
    this.meshes.push(group);

    // Label sprite
    const labelText = label || (def.icon + ' ' + def.label);
    this.createUnitLabel(group, labelText, def.color);

    return group;
  }

  // ════════════════════════════════════════════════════════════
  //  CUSTOM MESH CREATION (TGA icon boxes)
  // ════════════════════════════════════════════════════════════
  createCustomMesh(type, x, z, label, unitScale) {
    const item = this.customItemsRegistry[type];
    if (!item) {
      console.error(`自定义物品未找到: ${type}`);
      return null;
    }

    // 正方体尺寸
    const sizeX = 2;
    const sizeY = 0.5;
    const sizeZ = 2;

    const geometry = new THREE.BoxGeometry(sizeX, sizeY, sizeZ);

    // 纹理工料 - 顶面应用TGA纹理，其他面使用纯色
    const textureMaterial = new THREE.MeshStandardMaterial({
      map: item.texture,
      transparent: true,
      roughness: 0.7,
      metalness: 0.1
    });
    const sideColor = new THREE.Color(item.color).multiplyScalar(0.6);
    const sideMaterial = new THREE.MeshStandardMaterial({
      color: sideColor,
      roughness: 0.8,
      metalness: 0.1
    });

    // 材质数组: 左右上下前后 - 纹理朝上
    // BoxGeometry顺序: +x, -x, +y, -y, +z, -z
    // +y (index 2) 是顶面，应用纹理
    const materials = [
      sideMaterial,           // 右
      sideMaterial,           // 左
      textureMaterial,        // 上 (应用TGA纹理，朝上)
      sideMaterial,           // 下
      sideMaterial,           // 前
      sideMaterial            // 后
    ];

    const mesh = new THREE.Mesh(geometry, materials);
    mesh.name = `unit_${type}_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    mesh.position.set(x, sizeY / 2, z);  // 底部接地

    const s = unitScale !== undefined ? unitScale : 0.1;
    mesh.scale.set(s, s, s);

    const labelText = label || item.label;
    mesh.userData = {
      type: type,
      label: labelText,
      role: type,
      isUnit: true,
      isCustom: true,
      unitScale: s,
      isMonster: false
    };

    this.sceneManager.getScene().add(mesh);
    this.meshes.push(mesh);

    // Label sprite
    this.createUnitLabel(mesh, labelText, item.color);

    return mesh;
  }

  // ════════════════════════════════════════════════════════════
  //  Q版 CHIBI UNIT CREATION — CUTE ROUNDED STYLE
  // ════════════════════════════════════════════════════════════
  createChibiMesh(type, color, isMonster) {
    const group = new THREE.Group();
    const c = new THREE.Color(color);
    const bodyMat = new THREE.MeshStandardMaterial({ color, roughness: 0.45, metalness: 0.15, emissive: color, emissiveIntensity: 0.15 });
    const skinMat = new THREE.MeshStandardMaterial({ color: 0xfce4c8, roughness: 0.5, metalness: 0.05 });
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.4, metalness: 0.1 });
    const whiteMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 });
    const cheekMat = new THREE.MeshStandardMaterial({ color: 0xffaaaa, roughness: 0.6, transparent: true, opacity: 0.5 });

    if (isMonster) {
      // ─── MONSTER CHIBI ───
      const isBoss = type === 'boss';
      const isElite = type === 'elite';
      const isSummoned = type === 'summoned';
      const bodyScale = isBoss ? 1.3 : 1.0;

      // Round body
      const bodyGeo = new THREE.SphereGeometry(1.1 * bodyScale, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.85);
      const monsterBodyMat = new THREE.MeshStandardMaterial({
        color, roughness: 0.35, metalness: 0.2, emissive: color,
        emissiveIntensity: isBoss ? 0.4 : isSummoned ? 0.5 : 0.2
      });
      const body = new THREE.Mesh(bodyGeo, monsterBodyMat);
      body.position.y = 1.2 * bodyScale; body.castShadow = true; group.add(body);

      // Big head
      const headGeo = new THREE.SphereGeometry(0.85 * bodyScale, 16, 14);
      const head = new THREE.Mesh(headGeo, monsterBodyMat);
      head.position.y = 2.5 * bodyScale; head.castShadow = true; group.add(head);

      // Eyes — angry slant
      [-0.3, 0.3].forEach(xo => {
        const eyeWhite = new THREE.Mesh(new THREE.SphereGeometry(0.2 * bodyScale, 10, 10), whiteMat);
        eyeWhite.position.set(xo * bodyScale, 2.6 * bodyScale, 0.65 * bodyScale);
        eyeWhite.scale.set(1, 0.8, 0.5); group.add(eyeWhite);
        const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.12 * bodyScale, 8, 8),
          new THREE.MeshStandardMaterial({ color: isSummoned ? 0xaa00ff : 0xff2200, emissive: isSummoned ? 0xaa00ff : 0xff2200, emissiveIntensity: 0.8 }));
        pupil.position.set(xo * bodyScale, 2.58 * bodyScale, 0.78 * bodyScale);
        pupil.scale.set(1, 0.8, 0.5); group.add(pupil);
      });

      // Horns for boss
      if (isBoss) {
        const hornMat = new THREE.MeshStandardMaterial({ color: 0x440044, roughness: 0.3, metalness: 0.5 });
        [-0.55, 0.55].forEach(xo => {
          const horn = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.8, 6), hornMat);
          horn.position.set(xo, 3.4, -0.1); horn.rotation.z = -xo * 0.5; horn.rotation.x = -0.2;
          horn.castShadow = true; group.add(horn);
        });
      }

      // Spikes for elite
      if (isElite) {
        const spikeMat = new THREE.MeshStandardMaterial({ color: 0xcc3333, emissive: 0xcc3333, emissiveIntensity: 0.3 });
        for (let i = 0; i < 5; i++) {
          const spike = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.4, 5), spikeMat);
          const angle = (i / 5) * Math.PI * 2;
          spike.position.set(Math.cos(angle) * 0.7, 3.1, Math.sin(angle) * 0.7);
          spike.lookAt(new THREE.Vector3(Math.cos(angle) * 2, 3.5, Math.sin(angle) * 2));
          group.add(spike);
        }
      }

      // Summoned glow ring
      if (isSummoned) {
        const glowGeo = new THREE.TorusGeometry(1.0, 0.06, 8, 32);
        const glowMat = new THREE.MeshBasicMaterial({ color: 0xaa44ff, transparent: true, opacity: 0.5 });
        const ring = new THREE.Mesh(glowGeo, glowMat);
        ring.rotation.x = -Math.PI / 2; ring.position.y = 0.5; group.add(ring);
      }

      // Monster Group (mobGroup) - 2 elite + 2 normal mini chibis
      if (type === 'mobGroup') {
        const miniScale = 1.05;
        const eliteColor = 0xef4444;
        const normalColor = 0xf97316;
        const positions = [
          { x: -1.4, z: -1.4, color: eliteColor, isElite: true },
          { x: 1.4, z: -1.4, color: normalColor, isElite: false },
          { x: -1.4, z: 1.4, color: normalColor, isElite: false },
          { x: 1.4, z: 1.4, color: eliteColor, isElite: true },
        ];
        positions.forEach(({ x, z, color: mc, isElite: isMiniElite }) => {
          const miniGroup = new THREE.Group();
          const miniBodyMat = new THREE.MeshStandardMaterial({ color: mc, roughness: 0.35, metalness: 0.2, emissive: mc, emissiveIntensity: 0.2 });
          // Mini body
          const mBody = new THREE.Mesh(new THREE.SphereGeometry(0.5, 12, 8), miniBodyMat);
          mBody.position.y = 0.5; miniGroup.add(mBody);
          // Mini head
          const mHead = new THREE.Mesh(new THREE.SphereGeometry(0.38, 12, 10), miniBodyMat);
          mHead.position.y = 1.1; miniGroup.add(mHead);
          // Mini eyes
          [-0.15, 0.15].forEach(xo => {
            const mEye = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 8), whiteMat);
            mEye.position.set(xo, 1.12, 0.3); miniGroup.add(mEye);
            const mPupil = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 6),
              new THREE.MeshStandardMaterial({ color: 0xff2200, emissive: 0xff2200, emissiveIntensity: 0.8 }));
            mPupil.position.set(xo, 1.1, 0.35); miniGroup.add(mPupil);
          });
          // Mini legs
          [-0.18, 0.18].forEach(xo => {
            const mLeg = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.2, 4, 6), miniBodyMat);
            mLeg.position.set(xo, 0.12, 0); miniGroup.add(mLeg);
          });
          // Elite spikes
          if (isMiniElite) {
            const spikeMat = new THREE.MeshStandardMaterial({ color: 0xcc3333, emissive: 0xcc3333, emissiveIntensity: 0.3 });
            for (let i = 0; i < 5; i++) {
              const spike = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.2, 5), spikeMat);
              const angle = (i / 5) * Math.PI * 2;
              spike.position.set(Math.cos(angle) * 0.35, 1.35, Math.sin(angle) * 0.35);
              spike.lookAt(new THREE.Vector3(Math.cos(angle) * 2, 1.6, Math.sin(angle) * 2));
              miniGroup.add(spike);
            }
          }
          miniGroup.scale.set(miniScale, miniScale, miniScale);
          miniGroup.position.set(x, 0, z);
          group.add(miniGroup);
        });
        return group;
      }

      // Tiny arms
      [-0.9, 0.9].forEach(xo => {
        const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.12 * bodyScale, 0.4 * bodyScale, 4, 8), monsterBodyMat);
        arm.position.set(xo * bodyScale, 1.3 * bodyScale, 0);
        arm.rotation.z = -xo * 0.4; arm.castShadow = true; group.add(arm);
      });

      // Tiny legs
      [-0.35, 0.35].forEach(xo => {
        const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.14 * bodyScale, 0.3 * bodyScale, 4, 8), monsterBodyMat);
        leg.position.set(xo * bodyScale, 0.25 * bodyScale, 0); leg.castShadow = true; group.add(leg);
      });

      // Boss glow
      if (isBoss) {
        const glow = new THREE.PointLight(color, 1.2, 10); glow.position.y = 2; group.add(glow);
        const baseRing = new THREE.Mesh(
          new THREE.RingGeometry(1.4, 1.6, 32),
          new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.4, side: THREE.DoubleSide })
        );
        baseRing.rotation.x = -Math.PI / 2; baseRing.position.y = 0.05; group.add(baseRing);
      }

      // Mouth — angry frown
      const mouthGeo = new THREE.TorusGeometry(0.18 * bodyScale, 0.03, 8, 12, Math.PI);
      const mouth = new THREE.Mesh(mouthGeo, darkMat);
      mouth.position.set(0, 2.25 * bodyScale, 0.72 * bodyScale);
      mouth.rotation.x = Math.PI; group.add(mouth);

    } else {
      // ─── PLAYER CHIBI ───
      // Round body (tunic)
      const bodyGeo = new THREE.SphereGeometry(0.85, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.85);
      const body = new THREE.Mesh(bodyGeo, bodyMat);
      body.position.y = 1.0; body.scale.y = 1.1; body.castShadow = true; group.add(body);

      // Head (skin)
      const headGeo = new THREE.SphereGeometry(0.65, 16, 14);
      const head = new THREE.Mesh(headGeo, skinMat);
      head.position.y = 2.15; head.castShadow = true; group.add(head);

      // Hair
      const hairColor = [0x3b2507, 0x8b6914, 0xc9510c, 0x1a1a2e, 0xd4a574, 0x6b3a2a][Math.floor(Math.random() * 6)];
      const hairMat = new THREE.MeshStandardMaterial({ color: hairColor, roughness: 0.7 });
      const hairGeo = new THREE.SphereGeometry(0.68, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55);
      const hair = new THREE.Mesh(hairGeo, hairMat);
      hair.position.y = 2.3; group.add(hair);

      // Eyes — big cute
      [-0.22, 0.22].forEach(xo => {
        const eyeWhite = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 10), whiteMat);
        eyeWhite.position.set(xo, 2.22, 0.52); eyeWhite.scale.set(1, 1.2, 0.5); group.add(eyeWhite);
        const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 8), darkMat);
        pupil.position.set(xo, 2.2, 0.6); pupil.scale.set(1, 1.2, 0.5); group.add(pupil);
        // Highlight
        const hl = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 6), whiteMat);
        hl.position.set(xo + 0.05, 2.27, 0.62); group.add(hl);
      });

      // Blush cheeks
      [-0.35, 0.35].forEach(xo => {
        const cheek = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 8), cheekMat);
        cheek.position.set(xo, 2.05, 0.55); cheek.scale.set(1.2, 0.8, 0.5); group.add(cheek);
      });

      // Smile
      const smileGeo = new THREE.TorusGeometry(0.1, 0.02, 8, 12, Math.PI);
      const smile = new THREE.Mesh(smileGeo, darkMat);
      smile.position.set(0, 2.0, 0.58); smile.rotation.z = Math.PI; group.add(smile);

      // Arms (tiny)
      [-0.72, 0.72].forEach(xo => {
        const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.1, 0.35, 4, 8), skinMat);
        arm.position.set(xo, 1.1, 0); arm.rotation.z = -xo * 0.35; arm.castShadow = true; group.add(arm);
      });

      // Legs
      [-0.25, 0.25].forEach(xo => {
        const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.11, 0.3, 4, 8), bodyMat);
        leg.position.set(xo, 0.22, 0); leg.castShadow = true; group.add(leg);
        const shoe = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), darkMat);
        shoe.position.set(xo, 0.05, 0.04); shoe.scale.set(1, 0.7, 1.3); group.add(shoe);
      });

      // Class-specific accessories
      this.addClassAccessories(group, type, c, bodyMat);

      // Base ring (class color)
      const baseRing = new THREE.Mesh(
        new THREE.RingGeometry(0.65, 0.75, 24),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.5, side: THREE.DoubleSide })
      );
      baseRing.rotation.x = -Math.PI / 2; baseRing.position.y = 0.05; group.add(baseRing);
    }

    return group;
  }

  // ════════════════════════════════════════════════════════════
  //  CLASS ACCESSORIES
  // ════════════════════════════════════════════════════════════
  addClassAccessories(group, type, color, bodyMat) {
    const accentMat = new THREE.MeshStandardMaterial({ color: color.clone().multiplyScalar(0.8), roughness: 0.35, metalness: 0.4 });

    switch (type) {
      case 'tank': case 'warrior': case 'deathknight': {
        // Shield on back
        const shieldGeo = new THREE.CylinderGeometry(0.35, 0.35, 0.06, 6);
        const shieldMat = new THREE.MeshStandardMaterial({ color: 0x6688bb, roughness: 0.2, metalness: 0.7 });
        const shield = new THREE.Mesh(shieldGeo, shieldMat);
        shield.position.set(-0.55, 1.3, -0.2); shield.rotation.z = Math.PI / 2; group.add(shield);
        // Sword
        const sword = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.8, 0.03),
          new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 0.8, roughness: 0.1 }));
        sword.position.set(0.6, 1.4, -0.15); sword.rotation.z = 0.3; group.add(sword);
        break;
      }
      case 'healer': case 'priest': {
        // Halo
        const haloGeo = new THREE.TorusGeometry(0.35, 0.04, 8, 24);
        const haloMat = new THREE.MeshStandardMaterial({ color: 0xffdd44, emissive: 0xffdd44, emissiveIntensity: 0.6 });
        const halo = new THREE.Mesh(haloGeo, haloMat);
        halo.position.y = 3.0; halo.rotation.x = -Math.PI / 2; group.add(halo);
        // Glow
        const gl = new THREE.PointLight(0x44ff88, 0.5, 6); gl.position.y = 2.5; group.add(gl);
        break;
      }
      case 'dps': case 'rogue': {
        // Dual daggers
        [-0.5, 0.5].forEach(xo => {
          const dagger = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.5, 4),
            new THREE.MeshStandardMaterial({ color: 0xaaaacc, metalness: 0.8, roughness: 0.1 }));
          dagger.position.set(xo * 1.1, 0.8, 0.1); dagger.rotation.z = xo * 0.6; group.add(dagger);
        });
        break;
      }
      case 'paladin': {
        // Glowing hammer
        const hamHead = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.15, 0.3),
          new THREE.MeshStandardMaterial({ color: 0xf0c060, metalness: 0.6, roughness: 0.2 }));
        hamHead.position.set(0.65, 1.8, -0.1); group.add(hamHead);
        const hamHandle = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.6, 6),
          new THREE.MeshStandardMaterial({ color: 0x8b6914, roughness: 0.6 }));
        hamHandle.position.set(0.65, 1.4, -0.1); group.add(hamHandle);
        const gl = new THREE.PointLight(0xffcc44, 0.4, 5); gl.position.set(0.65, 1.8, 0); group.add(gl);
        break;
      }
      case 'hunter': {
        // Bow
        const bowGeo = new THREE.TorusGeometry(0.35, 0.03, 6, 12, Math.PI);
        const bow = new THREE.Mesh(bowGeo, new THREE.MeshStandardMaterial({ color: 0x8b6914, roughness: 0.5 }));
        bow.position.set(-0.55, 1.5, 0); bow.rotation.y = Math.PI / 2; group.add(bow);
        // Pet paw mark
        const pawMat = new THREE.MeshBasicMaterial({ color: 0xabd473, transparent: true, opacity: 0.4, side: THREE.DoubleSide });
        const paw = new THREE.Mesh(new THREE.CircleGeometry(0.2, 8), pawMat);
        paw.rotation.x = -Math.PI / 2; paw.position.set(0.6, 0.06, 0.4); group.add(paw);
        break;
      }
      case 'shaman': {
        // Totems
        const totemMat = new THREE.MeshStandardMaterial({ color: 0x0070de, emissive: 0x0070de, emissiveIntensity: 0.3 });
        for (let i = 0; i < 3; i++) {
          const t = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.3, 6), totemMat);
          t.position.set(-0.5 + i * 0.4, 0.15, 0.65); group.add(t);
        }
        break;
      }
      case 'druid': {
        // Leaf crown
        const leafMat = new THREE.MeshStandardMaterial({ color: 0x44aa22, emissive: 0x228800, emissiveIntensity: 0.2 });
        for (let i = 0; i < 6; i++) {
          const angle = (i / 6) * Math.PI * 2;
          const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 4), leafMat);
          leaf.position.set(Math.cos(angle) * 0.45, 2.7, Math.sin(angle) * 0.45);
          leaf.scale.set(1.5, 0.6, 1); group.add(leaf);
        }
        break;
      }
      case 'mage': {
        // Staff with orb
        const staff = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.2, 6),
          new THREE.MeshStandardMaterial({ color: 0x6644aa, roughness: 0.4 }));
        staff.position.set(0.65, 1.2, -0.1); group.add(staff);
        const orb = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 10),
          new THREE.MeshStandardMaterial({ color: 0x69ccf0, emissive: 0x69ccf0, emissiveIntensity: 0.7, transparent: true, opacity: 0.8 }));
        orb.position.set(0.65, 1.9, -0.1); group.add(orb);
        const gl = new THREE.PointLight(0x69ccf0, 0.6, 5); gl.position.set(0.65, 1.9, 0); group.add(gl);
        break;
      }
      case 'warlock': {
        // Demonic flame
        const flameMat = new THREE.MeshStandardMaterial({ color: 0x9482c9, emissive: 0x6633aa, emissiveIntensity: 0.5, transparent: true, opacity: 0.7 });
        const flame = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.4, 6), flameMat);
        flame.position.set(0, 3.1, 0); group.add(flame);
        // Dark circle
        const darkCircle = new THREE.Mesh(
          new THREE.RingGeometry(0.55, 0.65, 16),
          new THREE.MeshBasicMaterial({ color: 0x6633aa, transparent: true, opacity: 0.3, side: THREE.DoubleSide })
        );
        darkCircle.rotation.x = -Math.PI / 2; darkCircle.position.y = 0.06; group.add(darkCircle);
        break;
      }
    }
  }

  // ════════════════════════════════════════════════════════════
  //  SELECTION VISUALS
  // ════════════════════════════════════════════════════════════
  addSelectionVisual(unit) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.8, 1.0, 32),
      new THREE.MeshBasicMaterial({ color: 0xfbbf24, transparent: true, opacity: 0.7, side: THREE.DoubleSide })
    );
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.1; ring.name = 'selectionRing'; unit.add(ring);
  }

  clearSelectionVisuals() {
    this.meshes.forEach(u => { const ring = u.getObjectByName('selectionRing'); if (ring) u.remove(ring); });
  }

  // ════════════════════════════════════════════════════════════
  //  DELETE UNIT
  // ════════════════════════════════════════════════════════════
  deleteUnit(mesh) {
    // Remove mesh from scene
    this.sceneManager.getScene().remove(mesh);
    const idx = this.meshes.indexOf(mesh);
    if (idx > -1) this.meshes.splice(idx, 1);

    // Remove associated label sprite
    const spriteIdx = this.labelSprites.findIndex(s => s.userData.parentUnit === mesh);
    if (spriteIdx > -1) {
      this.sceneManager.getScene().remove(this.labelSprites[spriteIdx]);
      this.labelSprites.splice(spriteIdx, 1);
    }

    // Deselect if this was the selected unit
    if (this.dataStore.selectedUnit === mesh) {
      this.dataStore.selectedUnit = null;
    }
  }
}
