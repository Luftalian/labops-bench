export function installTaskParameters({button,getBundle,onCreated,endpoint}) {
  button.onclick=()=>{
    const b=getBundle(),dialog=document.createElement('dialog');dialog.className='task-parameters';
    const fields=[['width_m','Room width (m)',b.task.room.width_m,.1],['depth_m','Room depth (m)',b.task.room.depth_m,.1],
      ...Object.entries(b.task.resource_limits.equipment).map(([k,n])=>[k,k.replace('flex_','')+' limit',n,1]),
      ['arms','Robot arm limit',b.task.resource_limits.arms,1],['amrs','AMR limit',b.task.resource_limits.amrs,1]];
    dialog.innerHTML='<form method="dialog"><h2>Room and resource parameters</h2><p>Create a separate task variant. Workload and source durations stay pinned. Limits below are experiment constraints; there is no product maximum.</p><div class="parameter-grid">'+fields.map(([k,label,n,step])=>`<label>${label}<input name="${k}" type="number" required min="${k.endsWith('_m')?'0.000001':'0'}" step="${k.endsWith('_m')?'any':step}" value="${n}"></label>`).join('')+'</div><p class="parameter-error" role="status"></p><button type="button" class="cancel">Cancel</button><button class="primary">Create task variant ↗</button></form>';
    dialog.querySelector('.cancel').onclick=()=>dialog.close();dialog.addEventListener('close',()=>dialog.remove());
    dialog.querySelector('form').onsubmit=async e=>{
      e.preventDefault();const values=Object.fromEntries([...new FormData(e.target)].map(([k,v])=>[k,Number(v)]));
      const body={task_id:b.task.task_id,task_version:b.task.version,room:{width_m:values.width_m,depth_m:values.depth_m},
        resource_limits:{equipment:Object.fromEntries(Object.keys(b.task.resource_limits.equipment).map(k=>[k,values[k]])),arms:values.arms,amrs:values.amrs}};
      try{const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}),data=await response.json();if(!response.ok)throw new Error(data.violations?.map(v=>v.message).join(' · ')??data.error);await onCreated(data);dialog.close();}
      catch(error){dialog.querySelector('.parameter-error').textContent=error.message;}
    };
    document.body.append(dialog);dialog.showModal();
  };
}
