export async function handleScheduler(req, res, pathname, service, {read, send}) {
  if (!pathname.startsWith('/scheduler/api/')) return false;
  let response;
  if (pathname === '/scheduler/api/tasks' && req.method === 'GET') response = {status: 200, body: service.tasks()};
  else if (pathname === '/scheduler/api/custom-tasks' && req.method === 'POST') response=await service.customize(await read(req));
  else if (pathname === '/scheduler/api/packing' && req.method === 'POST') response=await service.packing(await read(req));
  else if (pathname === '/scheduler/api/sessions' && req.method === 'POST') response = await service.create(await read(req));
  else {
    const match = pathname.match(/^\/scheduler\/api\/sessions\/([a-f0-9-]{36})\/(observation|decisions|advance|result|journal)$/);
    if (match && req.method === 'GET' && ['observation', 'result', 'journal'].includes(match[2])) response = await service.read(match[1], match[2]);
    else if (match && req.method === 'POST' && ['decisions', 'advance'].includes(match[2])) response = await service.operate(match[1], match[2], await read(req));
    else response = {status: 404, body: {error: 'unknown_scheduler_endpoint'}};
  }
  send(res, response.status, response.body); return true;
}
