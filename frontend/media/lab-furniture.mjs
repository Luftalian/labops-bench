import * as THREE from 'three';
// Scenic room fixtures, not processing resources or extra animated robots.
export function furnish(view,replay){
 // The original workshop's 3D fixture meshes assume yaw=0. Align the visible
 // buffer/dock with the recorded yaw for the rotated cinematic work islands.
 for(const arm of replay.layout.robots){if(!(arm.yaw??0))continue;const angle=arm.yaw*Math.PI/180;
  for(const object of view.world.children){const p=object.geometry?.parameters;if(!object.isMesh||!p)continue;const dx=object.position.x-arm.x,dy=object.position.y-arm.y;if(Math.abs(dx)>.3||dy<.4||dy>1.1)continue;
   const fixture=p.width===.42&&p.height===.28&&p.depth===.05||p.width===.035&&p.height===.035&&p.depth===.80||p.width===.34&&p.height===.24&&p.depth===.008||p.radiusTop===.023&&p.height===.035;
   if(!fixture)continue;object.position.x=arm.x+dx*Math.cos(angle)-dy*Math.sin(angle);object.position.y=arm.y+dx*Math.sin(angle)+dy*Math.cos(angle);object.rotation.z+=angle;
  }
 }
 const room=replay.configuration.room,w=room.width_m,d=room.depth_m,g=new THREE.Group();view.world.add(g);
 const mats={wall:new THREE.MeshStandardMaterial({color:'#aabfc1',roughness:.9}),white:new THREE.MeshStandardMaterial({color:'#dce3df',roughness:.7}),steel:new THREE.MeshStandardMaterial({color:'#60777c',metalness:.65,roughness:.35}),dark:new THREE.MeshStandardMaterial({color:'#2d454b',roughness:.8}),glass:new THREE.MeshStandardMaterial({color:'#91b4bd',metalness:.25,roughness:.2}),blue:new THREE.MeshStandardMaterial({color:'#4c8d9e',roughness:.5}),amber:new THREE.MeshStandardMaterial({color:'#bc8d52',roughness:.5})};
 const box=(x,y,z,a,b,h,m)=>{const mesh=new THREE.Mesh(new THREE.BoxGeometry(a,b,h),mats[m]);mesh.position.set(x,y,z);mesh.castShadow=true;mesh.receiveShadow=true;g.add(mesh);return mesh;};
 box(w/2,-.12,1.4,w+.25,.16,2.8,'wall');box(-.12,d/2,.8,.16,d,1.6,'wall');
 for(let x=.75;x<w-.6;x+=1.7){
  // Wall-mounted bench: keep the recorded perimeter AMR bays clear below it.
  box(x,.28,.96,1.55,.62,.055,'steel');
  box(x,.02,2,1.3,.05,.94,'glass');box(x,.06,2.5,1.4,.09,.16,'dark');
  for(const dx of [-.35,.35])box(x+dx,.05,1.8,.48,.03,.025,'steel');
  for(let k=0;k<5;k++){const bottle=new THREE.Mesh(new THREE.CylinderGeometry(.027,.033,.13,10),k%2?mats.blue:mats.amber);bottle.position.set(x-.5+k*.2,.3,.998);bottle.rotation.x=Math.PI/2;g.add(bottle);}
 }
 for(let y=1.3;y<d-1;y+=2.2){box(.25,y,1.65,.5,1.6,1.3,'white');box(.515,y,1.75,.018,1.35,.7,'glass');for(let j=0;j<3;j++)box(.53,y,1.2+j*.32,.03,1.37,.025,'steel');}
 if(w<10){
  // Fume hood and utility cart occupy the scenic perimeter only.
  box(w-1.1,.38,2.1,1.6,.7,1.1,'white');box(w-1.1,.75,1.85,1.33,.018,1.05,'glass');box(w-1.1,.65,.99,1.4,.6,.06,'steel');box(w-1.1,.76,1.34,1.33,.04,.04,'dark');
  box(.65,d-1.5,.62,.6,.65,.06,'steel');for(const x of [.4,.9])for(const y of [d-1.75,d-1.25])box(x,y,.32,.025,.025,.58,'dark');
 }
 for(const device of replay.layout.devices){
  const model=view.catalog.equipment[device.model];if(!(model.mount_height_m>.3))continue;
  const base=new THREE.Group();base.position.set(device.x,device.y,0);base.rotation.z=device.rotation*Math.PI/180;g.add(base);
  const [width,depth]=model.size_m,body=new THREE.Mesh(new THREE.BoxGeometry(width*.93,depth*.93,.65),mats.white);body.position.z=.36;body.castShadow=true;body.receiveShadow=true;base.add(body);
  for(const x of [-width*.21,width*.21]){const handle=new THREE.Mesh(new THREE.BoxGeometry(width*.23,.018,.02),mats.steel);handle.position.set(x,depth*.48,.58);base.add(handle);}
 }
 for(const carrier of view.carriers){
  const led=new THREE.Mesh(new THREE.CylinderGeometry(.018,.018,.045,10),new THREE.MeshBasicMaterial({color:'#65d2ea'}));led.rotation.x=Math.PI/2;led.position.set(.105,.08,.66);carrier.group.add(led);
 }
 for(const a of replay.layout.robots){
  const models=replay.layout.devices.filter(d=>d.input_robot_id===a.id).map(d=>d.model),solid=models.some(m=>['furnace','flex_press','flex_grinder'].includes(m));
  const pad=new THREE.Mesh(new THREE.PlaneGeometry(w<10?2.9:2.5,w<10?2.4:2.65),new THREE.MeshStandardMaterial({color:solid?'#c5bfab':'#b7cbca',roughness:1,transparent:true,opacity:.32,depthWrite:false}));pad.position.set(a.x,a.y,.007);pad.receiveShadow=true;g.add(pad);
 }
 // A few ceiling service spines at the rear add depth without covering work.
 for(let x=2;x<w-1;x+=7){box(x,.5,3,.055,.12,.6,'steel');box(x,1.2,3.1,.075,2.4,.075,'white');}
 view.renderer.toneMapping=THREE.ACESFilmicToneMapping;view.renderer.toneMappingExposure=1.06;
 view.scene.children.filter(o=>o.isHemisphereLight).forEach(l=>l.intensity=1.8);
 const sun=view.scene.children.find(o=>o.isDirectionalLight);sun.intensity=3.1;sun.position.set(w*.65,d*.45,Math.max(12,w*.9));sun.target.position.set(w/2,d/2,0);view.scene.add(sun.target);sun.shadow.mapSize.set(2048,2048);sun.shadow.bias=-.0001;sun.shadow.normalBias=.025;
 return {group:g,sun};
}
