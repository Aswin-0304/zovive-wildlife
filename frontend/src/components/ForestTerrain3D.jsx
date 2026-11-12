import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';

const clamp = (value,min,max) => Math.max(min,Math.min(max,value));

function terrainHeight(x,z){
  const peak=(cx,cz,amp,wx,wz)=>amp*Math.exp(-((x-cx)**2*wx+(z-cz)**2*wz));
  const mountains=peak(-.48,-.26,.84,7,7)+peak(.05,-.5,.72,8,6)+peak(.42,-.05,.94,7,8)+peak(-.18,.48,.68,9,6)+peak(.55,.54,.61,8,8);
  const ridges=(1-Math.abs(Math.sin((x*.85+z*1.4)*10+Math.sin(z*7)*.8)))*.17;
  const erosion=Math.sin(x*9.4+z*3.8)*.035+Math.cos(z*11-x*4.2)*.028;
  return .1+mountains+ridges+erosion;
}

function terrainBoundary(nx,nz){const angle=Math.atan2(nz,nx);return 1+.055*Math.sin(angle*5+.5)+.035*Math.cos(angle*9-.7)+.02*Math.sin(angle*13)}
function terrainSurface(x,z){const nx=x/2.7,nz=z/2.25,r=Math.sqrt(nx*nx*.83+nz*nz*.94);return r<terrainBoundary(nx,nz)?terrainHeight(nx,nz):0}

function buildTerrain(){
  const segments=104, positions=[],colors=[],indices=[];
  for(let iz=0;iz<=segments;iz++)for(let ix=0;ix<=segments;ix++){
    const x=(ix/segments-.5)*5.4,z=(iz/segments-.5)*4.5,nx=x/2.7,nz=z/2.25;
    const y=terrainHeight(nx,nz);
    positions.push(x,y,z);
    const color=new THREE.Color(y>.92?'#a39b78':y>.68?'#6f8750':y>.34?'#518444':'#4c7d48');
    color.lerp(new THREE.Color('#a39b78'),clamp((y-.78)*1.25,0,.55));
    color.multiplyScalar(.91+((Math.sin(x*14+z*9)*.5+.5)*.14));
    colors.push(color.r,color.g,color.b);
    if(ix<segments&&iz<segments){const cx=nx+1/segments,cz=nz+1/segments;if(Math.sqrt(cx*cx*.83+cz*cz*.94)<terrainBoundary(cx,cz)){const a=iz*(segments+1)+ix,b=a+segments+1;indices.push(a,b,a+1,b,b+1,a+1)}}
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geometry.setIndex(indices);geometry.computeVertexNormals();
  return geometry;
}

function seeded(i){const n=Math.sin(i*127.1+311.7)*43758.5453;return n-Math.floor(n)}

function makeCanopyTexture(){
  const canvas=document.createElement('canvas');canvas.width=512;canvas.height=512;const ctx=canvas.getContext('2d');
  const gradient=ctx.createLinearGradient(0,0,512,512);gradient.addColorStop(0,'#467746');gradient.addColorStop(.48,'#285c3d');gradient.addColorStop(1,'#174635');ctx.fillStyle=gradient;ctx.fillRect(0,0,512,512);
  const palette=['#173e31','#24553a','#3e6d3e','#6c8744','#81934b','#1d4a3b'];
  for(let i=0;i<6200;i++){const x=seeded(i+101)*512,y=seeded(i+991)*512,r=1+seeded(i+2021)*4.5;ctx.globalAlpha=.08+seeded(i+4141)*.3;ctx.fillStyle=palette[i%palette.length];ctx.beginPath();ctx.ellipse(x,y,r*1.4,r*.72,seeded(i+778)*Math.PI,0,Math.PI*2);ctx.fill()}
  ctx.globalAlpha=1;const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=4;return texture;
}

function makeTerrainTexture(){
  const canvas=document.createElement('canvas');canvas.width=512;canvas.height=512;const ctx=canvas.getContext('2d');
  const ground=ctx.createLinearGradient(40,30,450,500);ground.addColorStop(0,'#82905c');ground.addColorStop(.36,'#58784b');ground.addColorStop(.72,'#466c45');ground.addColorStop(1,'#8d8865');ctx.fillStyle=ground;ctx.fillRect(0,0,512,512);
  const palette=['#a39b73','#5e784e','#71875a','#45694a','#8a815f','#526c47','#a6a078'];
  for(let i=0;i<12500;i++){const x=seeded(i+4001)*512,y=seeded(i+5101)*512,r=.35+seeded(i+6201)*2.7;ctx.globalAlpha=.08+seeded(i+7301)*.2;ctx.fillStyle=palette[Math.floor(seeded(i+8401)*palette.length)];ctx.beginPath();ctx.ellipse(x,y,r*1.5,r,seeded(i+9501)*Math.PI,0,Math.PI*2);ctx.fill()}
  for(let i=0;i<14;i++){const x=seeded(i+10001)*512,y=seeded(i+11001)*512,r=18+seeded(i+12001)*68,g=ctx.createRadialGradient(x,y,2,x,y,r);g.addColorStop(0,'rgba(165,166,126,.14)');g.addColorStop(1,'rgba(165,166,126,0)');ctx.fillStyle=g;ctx.fillRect(x-r,y-r,r*2,r*2)}
  ctx.globalAlpha=1;const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=4;return texture;
}

export default function ForestTerrain3D({markers=[],zoom=1,onMarkerSelect}){
  const canvasRef=useRef(null),engineRef=useRef(null),compassNeedleRef=useRef(null),resetOrientationRef=useRef(null),[unavailable,setUnavailable]=useState(false),[hover,setHover]=useState(null);
  useEffect(()=>{
    const canvas=canvasRef.current;if(!canvas)return;
    let renderer,frame=0,raf=0,disposed=false,dragging=false,lastX=0,lastY=0,hovered=null;
    const scene=new THREE.Scene();scene.background=null;scene.fog=new THREE.Fog('#1d3327',11,23);
    const camera=new THREE.PerspectiveCamera(38,1,.1,100);camera.position.set(0,4.3,8.1);camera.lookAt(0,.16,0);
    const root=new THREE.Group();root.rotation.x=-.34;root.rotation.y=-.15;root.scale.set(1.12,1.48,1.12);scene.add(root);
    const canopyTexture=makeCanopyTexture(),terrainTexture=makeTerrainTexture();
    const terrain=new THREE.Mesh(buildTerrain(),new THREE.MeshStandardMaterial({vertexColors:true,map:terrainTexture,bumpMap:terrainTexture,bumpScale:.075,roughness:1,metalness:0,side:THREE.DoubleSide}));terrain.receiveShadow=true;root.add(terrain);
    const cliffPositions=[],cliffColors=[],cliffIndices=[],perimeter=[];const cliffSteps=176,cliffTopColor=new THREE.Color('#66734b'),cliffBottomColor=new THREE.Color('#333d36');
    for(let i=0;i<=cliffSteps;i++){const angle=i/cliffSteps*Math.PI*2,metric=Math.sqrt(Math.cos(angle)**2*.83+Math.sin(angle)**2*.94),radius=terrainBoundary(Math.cos(angle),Math.sin(angle))/metric,nx=Math.cos(angle)*radius,nz=Math.sin(angle)*radius,x=nx*2.7,z=nz*2.25,top=terrainHeight(nx,nz);perimeter.push(new THREE.Vector3(x,top+.012,z));cliffPositions.push(x,top,z,x,-.48,z);const shade=.88+seeded(i+1460)*.22;for(const tone of [cliffTopColor,cliffBottomColor])cliffColors.push(tone.r*shade,tone.g*shade,tone.b*shade);if(i<cliffSteps){const a=i*2;cliffIndices.push(a,a+1,a+2,a+1,a+3,a+2)}}
    const bottomCenter=cliffPositions.length/3;cliffPositions.push(0,-.48,0);cliffColors.push(.13,.17,.14);for(let i=0;i<cliffSteps;i++)cliffIndices.push(i*2+1,(i+1)*2+1,bottomCenter);
    const cliffGeometry=new THREE.BufferGeometry();cliffGeometry.setAttribute('position',new THREE.Float32BufferAttribute(cliffPositions,3));cliffGeometry.setAttribute('color',new THREE.Float32BufferAttribute(cliffColors,3));cliffGeometry.setIndex(cliffIndices);cliffGeometry.computeVertexNormals();const cliff=new THREE.Mesh(cliffGeometry,new THREE.MeshStandardMaterial({vertexColors:true,roughness:.98,metalness:0,side:THREE.DoubleSide}));cliff.receiveShadow=true;root.add(cliff);
    scene.add(new THREE.HemisphereLight('#e7f2d8','#243d2c',2.35));
    const key=new THREE.DirectionalLight('#ffe9c8',4.1);key.position.set(-3,8,5);key.castShadow=true;key.shadow.mapSize.set(1024,1024);key.shadow.camera.left=-5;key.shadow.camera.right=5;key.shadow.camera.top=5;key.shadow.camera.bottom=-5;key.shadow.bias=-.0003;key.shadow.intensity=.28;scene.add(key);
    const fill=new THREE.DirectionalLight('#b4dbbd',1.55);fill.position.set(-5,3,-3);scene.add(fill);
    const rim=new THREE.DirectionalLight('#93dba4',1.35);rim.position.set(4,3,-6);scene.add(rim);

    const treeCount=8,dummy=new THREE.Object3D();
    const trunks=new THREE.InstancedMesh(new THREE.CylinderGeometry(.016,.035,.52,9),new THREE.MeshStandardMaterial({color:'#766044',roughness:.96}),treeCount);
    const wind={value:0},crownGeometry=new THREE.SphereGeometry(1,14,10),crownMaterial=new THREE.MeshStandardMaterial({color:'#fffaf0',map:canopyTexture,roughness:.94});
    crownMaterial.onBeforeCompile=shader=>{shader.uniforms.uWindTime=wind;shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nuniform float uWindTime;').replace('#include <begin_vertex>','#include <begin_vertex>\ntransformed.x += sin(uWindTime + position.y * 2.3 + instanceMatrix[3].x) * max(position.y, 0.0) * 0.012;\ntransformed.z += cos(uWindTime * 0.8 + position.y * 2.1 + instanceMatrix[3].z) * max(position.y, 0.0) * 0.009;');crownMaterial.userData.shader=shader};
    const crowns=new THREE.InstancedMesh(crownGeometry,crownMaterial,treeCount*2);let count=0,crownCount=0;
    const leafTones=['#789957','#89a95e','#64874e','#a0b96b','#557c4d'];
    for(let i=0;i<120&&count<treeCount;i++){
      const x=(seeded(i+2)-.5)*4.7,z=(seeded(i+9)-.5)*3.8,nx=x/2.7,nz=z/2.25;
      if(nx*nx*.83+nz*nz*.94>.88)continue;
      const h=terrainSurface(x,z);if(h<=0)continue;
      const s=.22+seeded(i+21)*.17,tall=.52+seeded(i+31)*.24;dummy.position.set(x,h+.2*tall,z);dummy.scale.set(s*.42,tall,s*.42);dummy.rotation.y=seeded(i+41)*Math.PI;dummy.updateMatrix();trunks.setMatrixAt(count,dummy.matrix);
      for(let layer=0;layer<2;layer++){
        const spread=layer===0?.84:.66,vertical=layer===0?.56:.83;
        dummy.position.set(x+(seeded(i*7+layer+12)-.5)*.11*s,h+vertical*tall,z+(seeded(i*9+layer+44)-.5)*.11*s);dummy.scale.set(s*spread,s*(layer===0?.49:.44),s*spread);dummy.rotation.set(seeded(i+layer+61)*.12,seeded(i+layer+81)*Math.PI,seeded(i+layer+101)*.12);dummy.updateMatrix();crowns.setMatrixAt(crownCount,dummy.matrix);crowns.setColorAt(crownCount,new THREE.Color(leafTones[Math.floor(seeded(i+layer+201)*leafTones.length)]));crownCount++;
      }
      count++;
    }
    trunks.count=count;crowns.count=crownCount;trunks.instanceMatrix.needsUpdate=true;crowns.instanceMatrix.needsUpdate=true;if(crowns.instanceColor)crowns.instanceColor.needsUpdate=true;trunks.castShadow=true;crowns.castShadow=true;root.add(trunks,crowns);

    const rocks=new THREE.InstancedMesh(new THREE.DodecahedronGeometry(.13,0),new THREE.MeshStandardMaterial({color:'#736c59',roughness:1,flatShading:true}),72);let rockCount=0;
    for(let i=0;i<480&&rockCount<72;i++){
      const x=(seeded(i+330)-.5)*5,z=(seeded(i+770)-.5)*4.1,h=terrainSurface(x,z);if(h<=0)continue;
      const s=.35+seeded(i+880)*1.1;dummy.position.set(x,h+.025,z);dummy.scale.set(s, s*(.4+seeded(i+920)*.35),s*.72);dummy.rotation.set(seeded(i+930),seeded(i+940)*Math.PI,seeded(i+950));dummy.updateMatrix();rocks.setMatrixAt(rockCount,dummy.matrix);rocks.setColorAt(rockCount,new THREE.Color(['#605c4c','#77705a','#48594b'][Math.floor(seeded(i+960)*3)]));rockCount++;
    }
    rocks.count=rockCount;rocks.instanceMatrix.needsUpdate=true;if(rocks.instanceColor)rocks.instanceColor.needsUpdate=true;rocks.castShadow=true;rocks.receiveShadow=true;root.add(rocks);

    const streamPoints=[[-2.0,-.62],[-1.55,-.4],[-1.1,-.5],[-.65,-.24],[-.1,-.14],[.4,.04],[.9,.25],[1.52,.15],[1.94,.38]].map(([x,z])=>new THREE.Vector3(x,terrainSurface(x,z)+.025,z));
    const streamCurve=new THREE.CatmullRomCurve3(streamPoints);const bank=new THREE.Mesh(new THREE.TubeGeometry(streamCurve,72,.065,8,false),new THREE.MeshStandardMaterial({color:'#31533f',roughness:1}));root.add(bank);const stream=new THREE.Mesh(new THREE.TubeGeometry(streamCurve,72,.038,8,false),new THREE.MeshPhysicalMaterial({color:'#55a9a4',roughness:.13,metalness:.1,clearcoat:.95,clearcoatRoughness:.08,transparent:true,opacity:.92}));root.add(stream);
    const boundary=new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(perimeter),cliffSteps,.008,5,true),new THREE.MeshBasicMaterial({color:'#65d99a',transparent:true,opacity:.2}));root.add(boundary);
    const mistCanvas=document.createElement('canvas');mistCanvas.width=256;mistCanvas.height=128;const mistCtx=mistCanvas.getContext('2d');
    for(let i=0;i<18;i++){const x=seeded(i+1700)*256,y=seeded(i+1800)*128,r=12+seeded(i+1900)*34,gradient=mistCtx.createRadialGradient(x,y,1,x,y,r);gradient.addColorStop(0,'rgba(230,246,238,.36)');gradient.addColorStop(1,'rgba(206,230,219,0)');mistCtx.fillStyle=gradient;mistCtx.fillRect(x-r,y-r,r*2,r*2)}
    const mistTexture=new THREE.CanvasTexture(mistCanvas),mistMaterial=new THREE.SpriteMaterial({map:mistTexture,color:'#dcece4',transparent:true,opacity:.22,depthWrite:false,blending:THREE.AdditiveBlending});
    const mistSprites=[];for(let i=0;i<4;i++){const sprite=new THREE.Sprite(mistMaterial.clone());sprite.position.set(-2.1+i*1.38,.48+(i%2)*.08,-1.35+(i%3)*.82);sprite.scale.set(1.55,.42,1);root.add(sprite);mistSprites.push(sprite)}
    const beaconGroups=[];
    const visibleMarkers=markers.slice(0,36);
    visibleMarkers.forEach((marker,index)=>{
      const angle=index*2.39996,rad=.42+(index%5)*.31;
      const x=Math.cos(angle)*rad,z=Math.sin(angle)*rad*.68,y=terrainSurface(x,z);
      const color=marker.type==='alert'?'#ff746b':marker.type==='detection'?'#f0b763':marker.status==='ACTIVE'?'#9aff89':'#98a39b';
      const group=new THREE.Group();group.position.set(x,y+.04,z);group.userData.marker=marker;
      const pin=new THREE.Mesh(new THREE.CylinderGeometry(.012,.018,.28,7),new THREE.MeshStandardMaterial({color,emissive:color,emissiveIntensity:.35}));pin.position.y=.14;group.add(pin);
      const orb=new THREE.Mesh(new THREE.SphereGeometry(.075,12,10),new THREE.MeshStandardMaterial({color,emissive:color,emissiveIntensity:.8,roughness:.28}));orb.position.y=.31;group.add(orb);
      const ring=new THREE.Mesh(new THREE.RingGeometry(.11,.135,24),new THREE.MeshBasicMaterial({color,transparent:true,opacity:.75,side:THREE.DoubleSide}));ring.rotation.x=-Math.PI/2;ring.position.y=.035;group.add(ring);
      group.traverse(node=>{if(node.isMesh)node.userData.marker=marker});root.add(group);beaconGroups.push(group);
    });

    const reduce=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    try{
      renderer=new THREE.WebGLRenderer({canvas,alpha:true,antialias:window.devicePixelRatio<2,powerPreference:'low-power'});
      renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.5));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.35;renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;key.shadow.radius=5;
    }catch{setUnavailable(true);return()=>{}}
    const raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2();
    const resize=()=>{const rect=canvas.getBoundingClientRect();if(!rect.width||!rect.height)return;renderer.setSize(rect.width,rect.height,false);camera.aspect=rect.width/rect.height;camera.updateProjectionMatrix()};
    const observer=new ResizeObserver(resize);observer.observe(canvas);resize();
    const pointerDown=(event)=>{dragging=true;lastX=event.clientX;lastY=event.clientY;canvas.classList.add('is-dragging');canvas.setPointerCapture?.(event.pointerId)};
    const pointerMove=(event)=>{
      if(dragging){const dx=event.clientX-lastX,dy=event.clientY-lastY;root.rotation.y+=dx*.006;root.rotation.x=clamp(root.rotation.x+dy*.004,-.75,.08);lastX=event.clientX;lastY=event.clientY;return}
      const rect=canvas.getBoundingClientRect();pointer.x=((event.clientX-rect.left)/rect.width)*2-1;pointer.y=-((event.clientY-rect.top)/rect.height)*2+1;raycaster.setFromCamera(pointer,camera);const hits=raycaster.intersectObjects(root.children,true);const markerHit=hits.find(hit=>hit.object.userData.marker);
      const next=markerHit?.object.userData.marker||null;if(next!==hovered){hovered=next;setHover(next?{label:next.label,type:next.type,x:event.clientX-rect.left,y:event.clientY-rect.top}:null)}
    };
    const pointerUp=(event)=>{dragging=false;canvas.classList.remove('is-dragging');if(event.pointerId!==undefined&&canvas.hasPointerCapture?.(event.pointerId))canvas.releasePointerCapture(event.pointerId)};
    const click=(event)=>{if(hovered)onMarkerSelect?.(hovered)};
    resetOrientationRef.current=()=>{root.rotation.x=-.34;root.rotation.y=-.15};
    const wheel=(event)=>{event.preventDefault();camera.position.z=clamp(camera.position.z+Math.sign(event.deltaY)*.45,5.8,11);camera.updateProjectionMatrix()};
    canvas.addEventListener('pointerdown',pointerDown);canvas.addEventListener('pointermove',pointerMove);canvas.addEventListener('pointerup',pointerUp);canvas.addEventListener('pointerleave',pointerUp);canvas.addEventListener('click',click);canvas.addEventListener('wheel',wheel,{passive:false});
    const animate=()=>{if(disposed)return;raf=requestAnimationFrame(animate);frame+=.01;if(!reduce&&!dragging)root.rotation.y+=.0008;if(!reduce){wind.value=frame;if(crownMaterial.userData.shader)crownMaterial.userData.shader.uniforms.uWindTime.value=frame}beaconGroups.forEach((group,index)=>{const ring=group.children[2];ring.material.opacity=.42+Math.sin(frame*2.1+index)*.22;ring.scale.setScalar(1+((Math.sin(frame*2.1+index)+1)*.12))});if(!reduce){boundary.material.opacity=.52+Math.sin(frame*.8)*.2;mistSprites.forEach((sprite,index)=>{sprite.position.x+=.0012+(index%2)*.0005;if(sprite.position.x>2.5)sprite.position.x=-2.5;sprite.material.opacity=.13+((Math.sin(frame*.38+index*1.7)+1)*.07)})}if(compassNeedleRef.current)compassNeedleRef.current.style.transform=`rotate(${-root.rotation.y}rad)`;renderer.render(scene,camera)};animate();engineRef.current={camera,renderer};
    return()=>{disposed=true;resetOrientationRef.current=null;cancelAnimationFrame(raf);observer.disconnect();canvas.removeEventListener('pointerdown',pointerDown);canvas.removeEventListener('pointermove',pointerMove);canvas.removeEventListener('pointerup',pointerUp);canvas.removeEventListener('pointerleave',pointerUp);canvas.removeEventListener('click',click);canvas.removeEventListener('wheel',wheel);scene.traverse(object=>{object.geometry?.dispose?.();if(Array.isArray(object.material))object.material.forEach(m=>m.dispose());else object.material?.dispose?.()});canopyTexture.dispose();terrainTexture.dispose();mistTexture.dispose();mistMaterial.dispose();renderer.dispose();engineRef.current=null};
  },[markers,onMarkerSelect]);

  useEffect(()=>{const engine=engineRef.current;if(!engine)return;engine.camera.position.z=clamp(8.1/zoom,5.8,11);engine.camera.updateProjectionMatrix()},[zoom]);
  return <div className="terrain3d-shell" aria-label="Interactive illustrative 3D forest terrain. Drag to rotate, scroll to zoom. Marker locations are illustrative and not geographic data.">
    <canvas ref={canvasRef} className="terrain3d-canvas" onContextMenu={e=>e.preventDefault()} aria-label="3D forest terrain. Drag to rotate; scroll to zoom. Select a marker for record details."/>
    {unavailable&&<div className="webgl-fallback"><span>3D terrain unavailable</span><small>Your browser can still use the monitoring dashboard.</small></div>}
    <button className="terrain-compass" onClick={()=>resetOrientationRef.current?.()} aria-label="Reset terrain orientation to north"><span>N</span><i ref={compassNeedleRef}><b/></i></button>
    {hover&&<div className="terrain-marker-tooltip" style={{left:clamp(hover.x,90,440),top:clamp(hover.y,34,195)}}><b>{hover.label}</b><small>{hover.type} · marker position illustrative</small></div>}
    <div className="terrain3d-hint">DRAG TO ROTATE <span>·</span> SCROLL TO ZOOM</div>
  </div>;
}
