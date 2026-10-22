// Media-only acceleration of the unchanged grid reachability predicate.
// Memoizes pass/fail by complete floor/obstacle/grid signature. BFS order,
// returned route, traffic reservations and engine semantics stay unchanged.
export async function load(url,context,nextLoad){
 const result=await nextLoad(url,context);
 if(!url.endsWith('/backend/poc/sim/v2/geometry.mjs'))return result;
 let source=String(result.source);
 const original="const pass=i=>{const p=point(i);return inFloor(p,room,r)&&!boxes.some(b=>p[0]>b.x-r&&p[0]<b.x+b.w+r&&p[1]>b.y-r&&p[1]<b.y+b.h+r);};";
 if(!source.includes(original))throw new Error('Geometry predicate changed; revalidate the media cache adapter');
 source='const mediaMasks=new Map();const mediaRoutes=new Map();\n'+source.replace(original,`const signature=JSON.stringify([g,r,nx,ny,room.width_m,room.depth_m,room.cutouts??[],boxes]);let mask=mediaMasks.get(signature);if(!mask){if(mediaMasks.size>=64)mediaMasks.delete(mediaMasks.keys().next().value);mask=new Uint8Array(nx*ny);mediaMasks.set(signature,mask);}const pass=i=>{const p=point(i);if(i<0||i>=mask.length)return inFloor(p,room,r)&&!boxes.some(b=>p[0]>b.x-r&&p[0]<b.x+b.w+r&&p[1]>b.y-r&&p[1]<b.y+b.h+r);if(!mask[i])mask[i]=inFloor(p,room,r)&&!boxes.some(b=>p[0]>b.x-r&&p[0]<b.x+b.w+r&&p[1]>b.y-r&&p[1]<b.y+b.h+r)?1:2;return mask[i]===1;};`);
 source=source.replace('export function routePath(from,to,layout,room,catalog){',`export function routePath(from,to,layout,room,catalog){const key=JSON.stringify([from,to,room,catalog.route_grid_m,catalog.carrier.radius_m,layout.devices.map(d=>[d.model,d.x,d.y,d.rotation,catalog.equipment[d.model].size_m]),layout.robots.map(r=>[r.x,r.y])]);if(mediaRoutes.has(key))return structuredClone(mediaRoutes.get(key));const result=mediaUncachedRoute(from,to,layout,room,catalog);if(mediaRoutes.size>=4096)mediaRoutes.delete(mediaRoutes.keys().next().value);mediaRoutes.set(key,structuredClone(result));return result;}function mediaUncachedRoute(from,to,layout,room,catalog){`);
 return {...result,source};
}
