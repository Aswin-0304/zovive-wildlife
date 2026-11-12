import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

// The ZOVIVE forest ranger: the rigged GLB character with her own animation clips.
// The intro drives her deterministically: each frame it names the clips to sample (with times, weights and optional
// body-part masks), a few procedural bone adjustments on top (legs during a swing, head turned towards the pointer),
// and where one of her joints must be on screen (hands on a root, feet on the card, hips on the seat). No mixer state
// accumulates, so the timeline can be sought to any moment.
//
// Character: ZOVIVE_Ranger_Phase6.glb (41-bone Mixamo skeleton "mixamorig:*", 11 PBR materials sharing one skin, 5 clips
// Ranger_Idle / Ranger_Jump / Ranger_Run / Ranger_Landing / Ranger_Sitting, 7 corrective shape keys keyed in Jump and
// Landing). The intro timeline still names the clips of the previous ranger (zovive-ranger.glb, kept as a fallback);
// for the Phase 6 model those names are mapped onto time ranges of its five clips (ALIASES below).

export const RANGER_URL = '/models/zovive-ranger-phase6.glb';
/** The previous ranger (69 bones, 15 clips): still loadable, e.g. loadRangerModel(LEGACY_RANGER_URL). */
export const LEGACY_RANGER_URL = '/models/zovive-ranger.glb';
/** Standing height used for scale (boots to cap), metres. */
export const RANGER_HEIGHT = 1.76;
/** The composition was laid out with the previous ranger, 1.71 m from soles to cap; Phase 6 (1.99 m to the top of the
 *  hat) is scaled to the same full height so she fills the same space on screen. */
const DESIGN_HEIGHT = 1.71;
/** Ankle bone height above the sole when the foot is flat, metres (previous ranger; Phase 6 measures its own). */
const LEGACY_ANKLE = 0.085;

const norm = (name) => name.replace(/^mixamorig[:_]?/, '');
const ARMS = /^(Left|Right)(Shoulder|Arm|ForeArm|Hand)/;
const LEGS = /^(Left|Right)(UpLeg|Leg|Foot|ToeBase|Toe_End)$/;
const HEAD = /^(Neck|Head|HeadTop_End|Jaw|LeftEye|RightEye)$/;
const SPINE = /^(Spine|Spine1|Spine2)$/;
const MASKS = {
  arms: (n) => ARMS.test(n),
  legs: (n) => LEGS.test(n),
  upper: (n) => ARMS.test(n) || HEAD.test(n) || SPINE.test(n),
  lower: (n) => LEGS.test(n) || n === 'Hips',
  head: (n) => HEAD.test(n),
  rightArm: (n) => /^Right(Shoulder|Arm|ForeArm|Hand)/.test(n),
  leftArm: (n) => /^Left(Shoulder|Arm|ForeArm|Hand)/.test(n),
};

// Intro clip names -> Phase 6 clip time ranges. knots: [[intro time, Phase 6 time], ...] (linear between, clamped);
// loop: the intro time wraps (scale: Phase 6 seconds per intro second). Phase 6 frame numbers at 30 fps in comments.
// Ranger_Jump: crouch f4-14, push-off f14-24 (arms overhead at f24), airborne f26-40 (apex f32-34), landing f42-60.
// Ranger_Landing: on a 0.95 m ledge until f24, push-off f26-34, drop f36-46, touchdown crouch f46-54, stands by f70.
// Ranger_Sitting: seated on a high edge, legs swinging (a loop).
// LedgeHang / ClimbUpLedge / Wave have no Phase 6 counterpart: until the banyan-root animation is made for this
// character, the root phases use the nearest poses (arms overhead from the take-off; the landing crouch and rise).
const ALIASES = {
  Idle: { clip: 'Ranger_Idle', loop: true, scale: 1 },
  Walk: { clip: 'Ranger_Run', loop: true, scale: 0.6 },
  Run: { clip: 'Ranger_Run', loop: true, scale: 1 },
  JumpStart: { clip: 'Ranger_Jump', knots: [[0, 0.133], [0.45, 0.8]] },
  JumpAir: { clip: 'Ranger_Jump', knots: [[0, 0.98], [0.8, 1.13]] },
  JumpLand: { clip: 'Ranger_Jump', knots: [[0, 1.333], [0.6, 1.933]] },
  RunningJump: { clip: 'Ranger_Jump', knots: [[0, 0.5], [0.9, 1.4]] },
  Fall: { clip: 'Ranger_Landing', knots: [[0, 1.2], [1.9, 1.533]] },
  LedgeHang: { clip: 'Ranger_Jump', knots: [[0, 0.8]] },
  ClimbUpLedge: { clip: 'Ranger_Landing', knots: [[0, 1.467], [1.5, 1.8], [2.8, 2.333]] },
  SitDown: { clip: 'Ranger_Sitting', knots: [[0, 0]] },
  SitIdle: { clip: 'Ranger_Sitting', loop: true, scale: 2.1 / 1.625 },
};
// Clips whose forward root motion is removed (the intro moves her itself).
const IN_PLACE = new Set(['Ranger_Run']);

// Bone orientations of the previous ranger in its bind pose (world, facing +z). The intro's procedural tweaks were
// written for its bone axes ("UpLeg +x thigh forward", "Arm z arms in" ...); for the Phase 6 skeleton, whose arm and
// shoulder bones are oriented differently, each tweak axis is carried over through the bind pose so it means the
// same movement.
const LEGACY_BIND = {
  Hips: [-0.28379, 0, 0, 0.95889], LeftUpLeg: [-0.00234, 0.04192, 0.99757, -0.05559], RightUpLeg: [0.00234, 0.04192, 0.99757, 0.05559],
  LeftLeg: [0.00097, -0.02961, 0.99902, -0.03283], RightLeg: [-0.00097, -0.02961, 0.99902, 0.03283],
  LeftArm: [-0.00413, 0.01057, 0.93122, -0.36428], RightArm: [0.00413, 0.01057, 0.93122, 0.36428],
  LeftShoulder: [-0.00333, 0.00376, -0.74833, 0.66331], RightShoulder: [-0.00333, -0.00376, 0.74833, 0.66331],
  LeftFoot: [0.02418, 0.51511, 0.85666, -0.01454], RightFoot: [-0.02418, 0.51511, 0.85666, 0.01454],
  Neck: [0.1735, 0, 0, 0.98483], Head: [-0.02335, 0, 0, 0.99973], Spine: [0.16017, 0, 0, 0.98709], Spine1: [0.07664, 0, 0, 0.99706],
  Spine2: [-0.01338, 0, 0, 0.99991], LeftForeArm: [-0.12376, 0.32072, 0.87609, -0.33807], RightForeArm: [0.12376, 0.32072, 0.87609, 0.33807],
};
/** Where the rope leaves her, in the Hips bone's frame: previous ranger = harness front; Phase 6 = the carabiner on
 *  her left hip, where the green rope coil hangs. */
const HARNESS = { legacy: [0, -0.02, 0.14], phase6: [0.1446, 0.0205, 0.1398] };

// One download per page session: the scene mounts again when the login route is revisited and reuses the same
// parsed model and the same character instance.
const modelCache = new Map();
export function loadRangerModel(url = RANGER_URL) {
  if (!modelCache.has(url)) {
    const promise = new Promise((resolve, reject) => { new GLTFLoader().load(url, resolve, undefined, reject); });
    promise.catch(() => modelCache.delete(url));
    modelCache.set(url, promise);
  }
  return modelCache.get(url);
}
const actorCache = new WeakMap();
/** The character instance for a loaded model (created once, reused on every later mount). */
export function getRangerActor(gltf, options) {
  if (!actorCache.has(gltf)) actorCache.set(gltf, createRangerActor(gltf, options));
  return actorCache.get(gltf);
}

const tmpQ = new THREE.Quaternion(), tmpQ2 = new THREE.Quaternion(), tmpV = new THREE.Vector3(), tmpV2 = new THREE.Vector3();
const AXES = { x: new THREE.Vector3(1, 0, 0), y: new THREE.Vector3(0, 1, 0), z: new THREE.Vector3(0, 0, 1) };
const Y_AXIS = AXES.y, Z_AXIS = AXES.z;

export function createRangerActor(gltf, { anisotropy = 4 } = {}) {
  const root = new THREE.Group();
  root.name = 'ranger';
  const model = gltf.scene;
  root.add(model);
  const meshes = [];
  const bones = {};
  model.traverse((object) => { if (object.isBone) bones[norm(object.name)] = object; });
  const legacy = !gltf.animations.some((clip) => clip.name.startsWith('Ranger_'));

  // ---- scale to the design height and measure the ankle (bind pose, before any clip is applied)
  let ankle = LEGACY_ANKLE;
  if (!legacy) {
    model.updateMatrixWorld(true);
    const box = new THREE.Box3(), mb = new THREE.Box3();
    model.traverse((object) => { if (object.isSkinnedMesh) { object.computeBoundingBox(); box.union(mb.copy(object.boundingBox).applyMatrix4(object.matrixWorld)); } });
    const s = DESIGN_HEIGHT / Math.max(1e-6, box.max.y - box.min.y);
    model.scale.multiplyScalar(s);
    model.updateMatrixWorld(true);
    ankle = (bones.LeftFoot.getWorldPosition(tmpV).y - box.min.y * s);
  }

  model.traverse((object) => {
    if (!object.isMesh) return;
    object.frustumCulled = false;
    meshes.push(object);
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    materials.forEach((material) => {
      ['map', 'normalMap', 'roughnessMap', 'metalnessMap'].forEach((key) => { if (material[key]) material[key].anisotropy = anisotropy; });
      // Previous ranger, built for a scene without an environment map: keep metals from going black. (Phase 6's
      // silver carabiner keeps its full metalness; the scene has a RoomEnvironment.)
      if (legacy && material.metalness > 0.5) material.metalness = 0.5;
    });
    // Corrective shape keys only move the hip gear: parts whose morph targets are all zero drop them (three.js keeps
    // every vertex of every target on the GPU, and skips the morph shader path for them).
    const geo = object.geometry;
    if (geo.morphAttributes?.position?.length) {
      const empty = [...geo.morphAttributes.position, ...(geo.morphAttributes.normal || [])].every((attr) => attr.array.every((v) => v === 0));
      if (empty) { geo.morphAttributes = {}; object.morphTargetInfluences = undefined; object.morphTargetDictionary = undefined; }
    }
  });

  const boneList = Object.values(bones);
  const bind = new Map(boneList.map((b) => [b, { q: b.quaternion.clone(), p: b.position.clone() }]));

  // Tweak axes for the Phase 6 skeleton (see LEGACY_BIND).
  const tweakAxes = {};
  if (!legacy) {
    model.updateMatrixWorld(true);
    const inv = new THREE.Quaternion();
    for (const [name, q] of Object.entries(LEGACY_BIND)) {
      if (!bones[name]) continue;
      bones[name].getWorldQuaternion(inv).invert();
      const old = new THREE.Quaternion(q[0], q[1], q[2], q[3]);
      tweakAxes[name] = Object.fromEntries(Object.entries(AXES).map(([k, e]) => [k, e.clone().applyQuaternion(old).applyQuaternion(inv).normalize()]));
    }
  }

  // Limb lengths (metres, as scaled), for the inverse-kinematics contacts: shoulder to wrist, wrist to fingertip, hip
  // to ankle.
  model.updateMatrixWorld(true);
  const dist = (a, b) => (bones[a] && bones[b] ? bones[a].getWorldPosition(tmpV).distanceTo(bones[b].getWorldPosition(tmpV2)) : 0);
  const metrics = {
    armReach: dist('LeftArm', 'LeftForeArm') + dist('LeftForeArm', 'LeftHand'),
    hand: dist('LeftHand', 'LeftHandIndex4') || 0.1,
    legReach: dist('LeftUpLeg', 'LeftLeg') + dist('LeftLeg', 'LeftFoot'),
  };

  // A closing grip: the fingers (the Phase 6 rig has index and thumb chains; the other fingers follow the index bones)
  // curl towards the palm about an axis measured from each hand's own bind pose, so a hand closes around a root or an
  // edge instead of staying flat.
  const curl = { left: [], right: [] };
  if (!legacy) {
    const W = new THREE.Vector3(), I = new THREE.Vector3(), Tb = new THREE.Vector3(), q = new THREE.Quaternion();
    for (const side of ['Left', 'Right']) {
      const hand = bones[`${side}Hand`], tipI = bones[`${side}HandIndex4`], tipT = bones[`${side}HandThumb4`];
      if (!hand || !tipI || !tipT) continue;
      hand.getWorldPosition(W); tipI.getWorldPosition(I); tipT.getWorldPosition(Tb);
      const f = I.clone().sub(W).normalize();                                  // along the fingers
      const lat = Tb.clone().sub(I); lat.addScaledVector(f, -lat.dot(f)).normalize();   // across the palm, towards the thumb
      let n = new THREE.Vector3().crossVectors(f, lat).normalize();            // palm normal: towards the body's midline
      if (Math.sign(n.x) === Math.sign(W.x)) n.negate();
      const axisW = new THREE.Vector3().crossVectors(f, n).normalize();        // rotating f about f×n moves the tip onto n
      const chain = [[`${side}HandIndex1`, 0.95], [`${side}HandIndex2`, 1.15], [`${side}HandIndex3`, 0.85], [`${side}HandThumb1`, 0.35], [`${side}HandThumb2`, 0.5], [`${side}HandThumb3`, 0.4]];
      for (const [name, k] of chain) {
        const b = bones[name];
        if (!b) continue;
        b.getWorldQuaternion(q).invert();
        curl[side.toLowerCase()].push({ bone: b, axis: axisW.clone().applyQuaternion(q).normalize(), k });
      }
    }
  }
  /** Close the hands: 0 open (as posed) .. 1 a firm grip (about 1.1 rad at the middle finger joint). */
  function grip(left = 0, right = 0) {
    for (const [list, amount] of [[curl.left, left], [curl.right, right]]) {
      if (!amount) continue;
      for (const c of list) c.bone.quaternion.multiply(tmpQ2.setFromAxisAngle(c.axis, c.k * amount));
    }
  }

  // Clip tracks as interpolants (sampled directly; no AnimationMixer). Bones: quaternion / position. Morph weights:
  // the corrective shape keys, on every part that kept its morph targets.
  const clips = {};
  gltf.animations.forEach((clip) => {
    const tracks = [], morphs = [];
    clip.tracks.forEach((track) => {
      const dot = track.name.lastIndexOf('.');
      const target = track.name.slice(0, dot), path = track.name.slice(dot + 1);
      if (path === 'morphTargetInfluences') {
        const mesh = model.getObjectByName(target) || model.getObjectByProperty('uuid', target);
        if (mesh?.morphTargetInfluences) morphs.push({ mesh, interp: track.createInterpolant() });
        return;
      }
      const bone = bones[norm(target)];
      if (!bone || (path !== 'quaternion' && path !== 'position')) return;
      if (path === 'position' && IN_PLACE.has(clip.name) && norm(target) === 'Hips') {
        // Remove the forward travel (keep the bounce and sway): subtract the mean horizontal velocity. The track is in
        // the hips' parent space (the armature node may be rotated), so "horizontal" is measured against the model's
        // up direction expressed in that space.
        const up = Y_AXIS.clone().applyQuaternion(bone.parent.getWorldQuaternion(new THREE.Quaternion()).invert()).normalize();
        const v = track.values, n = track.times.length, T = track.times[n - 1] - track.times[0] || 1;
        const vel = new THREE.Vector3(v[(n - 1) * 3] - v[0], v[(n - 1) * 3 + 1] - v[1], v[(n - 1) * 3 + 2] - v[2]).divideScalar(T);
        vel.addScaledVector(up, -vel.dot(up));
        for (let i = 0; i < n; i += 1) {
          const dt = track.times[i] - track.times[0];
          v[i * 3] -= vel.x * dt; v[i * 3 + 1] -= vel.y * dt; v[i * 3 + 2] -= vel.z * dt;
        }
      }
      tracks.push({ bone, name: norm(bone.name), path, interp: track.createInterpolant() });
    });
    clips[clip.name] = { name: clip.name, duration: clip.duration, tracks, morphs };
  });

  /** An intro clip name and time -> the clip to sample and the time in it. */
  function resolve(name, t, loop) {
    const direct = clips[name];
    if (direct) {
      const d = direct.duration;
      return { clip: direct, t: loop ? ((t % d) + d) % d : Math.max(0, Math.min(d, t)) };
    }
    const alias = legacy ? null : ALIASES[name];
    const clip = alias && clips[alias.clip];
    if (!clip) return null;
    const d = clip.duration;
    if (alias.loop) { const u = t * alias.scale; return { clip, t: ((u % d) + d) % d }; }
    const k = alias.knots;
    if (k.length === 1 || t <= k[0][0]) return { clip, t: k[0][1] };
    for (let i = 1; i < k.length; i += 1) {
      if (t <= k[i][0]) { const a = k[i - 1], b = k[i]; return { clip, t: a[1] + ((t - a[0]) / (b[0] - a[0])) * (b[1] - a[1]) }; }
    }
    return { clip, t: k[k.length - 1][1] };
  }

  const state = new Map(boneList.map((b) => [b, { q: new THREE.Quaternion(), p: new THREE.Vector3(), set: false, pset: false }]));
  const morphMeshes = meshes.filter((m) => m.morphTargetInfluences);
  const morphState = new Map(morphMeshes.map((m) => [m, { w: new Float32Array(m.morphTargetInfluences.length), set: false }]));

  /**
   * Sample clips onto the skeleton. layers: [{ clip, t, w = 1, loop = false, mask }] applied in order; the first layer
   * should cover the whole body; later ones blend over it by w on their masked bones. Shape-key weights follow the
   * unmasked layers.
   */
  function pose(layers) {
    state.forEach((s) => { s.set = false; s.pset = false; });
    morphState.forEach((s) => { s.set = false; });
    for (const layer of layers) {
      const w = layer.w ?? 1;
      if (w <= 0) continue;
      const r = resolve(layer.clip, layer.t, layer.loop);
      if (!r) continue;
      const { clip, t } = r;
      const mask = layer.mask ? MASKS[layer.mask] : null;
      for (const track of clip.tracks) {
        if (mask && !mask(track.name)) continue;
        const v = track.interp.evaluate(t);
        const s = state.get(track.bone);
        if (track.path === 'quaternion') {
          tmpQ.set(v[0], v[1], v[2], v[3]).normalize();
          if (!s.set) { s.q.copy(tmpQ); s.set = true; } else s.q.slerp(tmpQ, w);
        } else {
          tmpV.set(v[0], v[1], v[2]);
          if (!s.pset) { s.p.copy(tmpV); s.pset = true; } else s.p.lerp(tmpV, w);
        }
      }
      if (!mask) {
        for (const m of clip.morphs) {
          const v = m.interp.evaluate(t), s = morphState.get(m.mesh);
          if (!s) continue;
          for (let i = 0; i < s.w.length; i += 1) s.w[i] = s.set ? s.w[i] + (v[i] - s.w[i]) * w : v[i];
          s.set = true;
        }
        // A layer without shape keys blends them out over its weight.
        if (!clip.morphs.length) morphState.forEach((s) => { if (s.set) for (let i = 0; i < s.w.length; i += 1) s.w[i] *= 1 - w; });
      }
    }
    state.forEach((s, bone) => {
      const rest = bind.get(bone);
      bone.quaternion.copy(s.set ? s.q : rest.q);
      bone.position.copy(s.pset ? s.p : rest.p);
    });
    morphState.forEach((s, mesh) => { const out = mesh.morphTargetInfluences; for (let i = 0; i < out.length; i += 1) out[i] = s.set ? s.w[i] : 0; });
  }

  /** Extra rotation of a bone about one of its own local axes (applied after the clips; axes as on the previous ranger). */
  function turn(name, axis, angle) {
    const bone = bones[name];
    if (!bone || !angle) return;
    bone.quaternion.multiply(tmpQ2.setFromAxisAngle(tweakAxes[name]?.[axis] || AXES[axis], angle));
  }

  // ---- two-bone inverse kinematics: puts a hand or foot exactly on a contact point (a root, the card's edge, a
  // foothold) by rotating the upper and lower limb bones; the bend follows a pole direction (elbows down and back,
  // knees forward). Applied after place(), in world space.
  const LIMBS = {
    leftArm: ['LeftArm', 'LeftForeArm', 'LeftHand'], rightArm: ['RightArm', 'RightForeArm', 'RightHand'],
    leftLeg: ['LeftUpLeg', 'LeftLeg', 'LeftFoot'], rightLeg: ['RightUpLeg', 'RightLeg', 'RightFoot'],
  };
  const ikA = new THREE.Vector3(), ikB = new THREE.Vector3(), ikC = new THREE.Vector3(), ikT = new THREE.Vector3();
  const ikDir = new THREE.Vector3(), ikPole = new THREE.Vector3(), ikElbow = new THREE.Vector3(), ikV1 = new THREE.Vector3(), ikV2 = new THREE.Vector3();
  const ikQ = new THREE.Quaternion(), ikQw = new THREE.Quaternion(), ikQp = new THREE.Quaternion();
  function aimBone(bone, from, to) {
    if (from.lengthSq() < 1e-12 || to.lengthSq() < 1e-12) return;
    ikQ.setFromUnitVectors(from.normalize(), to.normalize());
    bone.getWorldQuaternion(ikQw);
    bone.parent.getWorldQuaternion(ikQp);
    bone.quaternion.copy(ikQp.invert().multiply(ikQ.multiply(ikQw)));
    bone.updateMatrixWorld(true);
  }
  /** target: world Vector3 (its z is kept from the current limb end when keepDepth); pole: world direction; w: 0..1. */
  function reach(limb, target, pole, w = 1, keepDepth = true) {
    const names = LIMBS[limb];
    if (!names || w <= 0) return;
    const [U, M, E] = names.map((n) => bones[n]);
    root.updateMatrixWorld(true);
    U.getWorldPosition(ikA); M.getWorldPosition(ikB); E.getWorldPosition(ikC);
    const l1 = ikA.distanceTo(ikB), l2 = ikB.distanceTo(ikC);
    ikT.copy(target);
    if (keepDepth) ikT.z = ikC.z;
    ikT.lerpVectors(ikC, ikT, Math.min(1, w));
    const d = Math.max(1e-5, Math.min(ikA.distanceTo(ikT), (l1 + l2) * 0.999));
    ikDir.copy(ikT).sub(ikA).normalize();
    ikPole.copy(pole).addScaledVector(ikDir, -pole.dot(ikDir));
    if (ikPole.lengthSq() < 1e-8) ikPole.set(0, -1, 0).addScaledVector(ikDir, ikDir.y);
    ikPole.normalize();
    const cosA = Math.max(-1, Math.min(1, (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d)));
    const sinA = Math.sqrt(1 - cosA * cosA);
    ikElbow.copy(ikA).addScaledVector(ikDir, l1 * cosA).addScaledVector(ikPole, l1 * sinA);
    aimBone(U, ikV1.copy(ikB).sub(ikA), ikV2.copy(ikElbow).sub(ikA));
    M.getWorldPosition(ikB); E.getWorldPosition(ikC);
    aimBone(M, ikV1.copy(ikC).sub(ikB), ikV2.copy(ikA.set(ikT.x, ikT.y, ikT.z)).sub(ikB));
  }

  // Joint positions in the root's frame (metres), after pose().
  const inv = new THREE.Matrix4();
  function local(name, out = new THREE.Vector3()) {
    root.updateMatrixWorld(true);
    inv.copy(root.matrixWorld).invert();
    return bones[name].getWorldPosition(out).applyMatrix4(inv);
  }
  function joint(which, out = new THREE.Vector3()) {
    if (which === 'origin') return out.set(0, 0, 0);
    if (which === 'hands') return local('LeftHand', out).add(local('RightHand', tmpV2)).multiplyScalar(0.5);
    if (which === 'feet') {
      const l = local('LeftFoot', out), r = local('RightFoot', tmpV2);
      return l.set((l.x + r.x) / 2, Math.min(l.y, r.y) - ankle, (l.z + r.z) / 2);
    }
    return local(which, out);
  }

  const qYaw = new THREE.Quaternion(), qRoll = new THREE.Quaternion(), placeQ = new THREE.Quaternion();
  const aLocal = new THREE.Vector3(), bLocal = new THREE.Vector3();
  /**
   * Place her: yaw (facing; 0 = towards the viewer, +π/2 = screen right), roll (lean in the screen plane), scale k
   * (world units per metre). anchor: { joint, at: Vector3 (world) } — that joint lands exactly there. A second
   * anchor { joint, at, w } blends the placement towards it (used where one contact hands over to another).
   */
  function place({ yaw = 0, roll = 0, k, anchor, anchor2, z = 0 }) {
    qYaw.setFromAxisAngle(Y_AXIS, yaw);
    qRoll.setFromAxisAngle(Z_AXIS, roll);
    placeQ.copy(qRoll).multiply(qYaw);
    root.position.set(0, 0, 0); root.quaternion.identity(); root.scale.setScalar(1);
    root.updateMatrixWorld(true);
    joint(anchor.joint, aLocal).applyQuaternion(placeQ);
    const px = anchor.at.x - k * aLocal.x, py = anchor.at.y - k * aLocal.y;
    let x = px, y = py;
    if (anchor2 && anchor2.w > 0) {
      joint(anchor2.joint, bLocal).applyQuaternion(placeQ);
      x += (anchor2.at.x - k * bLocal.x - px) * anchor2.w;
      y += (anchor2.at.y - k * bLocal.y - py) * anchor2.w;
    }
    root.quaternion.copy(placeQ);
    root.scale.setScalar(k);
    root.position.set(x, y, z);
    root.updateMatrixWorld(true);
  }

  /** World position of a joint after place(). */
  function world(which, out = new THREE.Vector3()) {
    if (which === 'hands') {
      bones.LeftHand.getWorldPosition(out); bones.RightHand.getWorldPosition(tmpV2); return out.add(tmpV2).multiplyScalar(0.5);
    }
    if (which === 'origin') return out.setFromMatrixPosition(root.matrixWorld);
    return bones[which].getWorldPosition(out);
  }

  /**
   * Sample a clip's contacts over time (in the clip's own frame, root at identity): used to pin her hands to the card's
   * edge while she pulls herself up, then her feet on top.
   */
  function track(clipName, joints, step = 1 / 60) {
    const clip = resolve(clipName, 0, false)?.clip;
    const out = [];
    if (!clip) return out;
    const saveQ = root.quaternion.clone(), saveP = root.position.clone(), saveS = root.scale.clone();
    root.quaternion.identity(); root.position.set(0, 0, 0); root.scale.setScalar(1);
    for (let t = 0; t <= clip.duration + 1e-6; t += step) {
      pose([{ clip: clip.name, t }]);
      const row = { t };
      joints.forEach((j) => { row[j] = joint(j).clone(); });
      out.push(row);
    }
    root.quaternion.copy(saveQ); root.position.copy(saveP); root.scale.copy(saveS);
    return out;
  }

  function setVisible(v) { root.visible = v; }
  /** GPU resources only (geometry buffers, programs, textures): the instance stays usable for the next mount, where a
   *  new renderer uploads them again. */
  function release() {
    root.parent?.remove(root);
    meshes.forEach((mesh) => {
      mesh.geometry.dispose();
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      materials.forEach((material) => {
        Object.values(material).forEach((value) => { if (value && value.isTexture) value.dispose(); });
        material.dispose();
      });
    });
  }
  const dispose = release;

  const harness = HARNESS[legacy ? 'legacy' : 'phase6'];
  return { root, bones, clips, meshes, morphMeshes, legacy, ankle, metrics, harnessLocal: new THREE.Vector3(...harness),
    pose, turn, grip, reach, place, world, joint, track, resolve, setVisible, release, dispose,
    duration: (name) => resolve(name, 0, false)?.clip.duration ?? 0 };
}
