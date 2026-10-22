import fs from 'node:fs';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {decisionInstructions} from './benchmark-actions.mjs';
import {decisionProblem,priorityLevels as levels,compilePolicyAnswer} from './policy-runtime.mjs';

export const priorityLevels=levels;
export function publicInput(o) {
  return decisionProblem(o);
}
function atomic(file,value){fs.writeFileSync(file+'.tmp',JSON.stringify(value));fs.renameSync(file+'.tmp',file);}
export function readKey(envFile,name='JEV_API_KEY') {
  if(process.env[name])return process.env[name];
  const line=fs.readFileSync(envFile,'utf8').split(/\r?\n/).find(line=>new RegExp('^\\s*(?:export\\s+)?'+name+'\\s*=').test(line));
  if(!line)throw new Error('Missing '+name+' (value never logged)');
  return line.slice(line.indexOf('=')+1).trim().replace(/^(['"])(.*)\1$/,'$2');
}
export function createJevController({apiKey,ledgerFile,maxUSD=3,fetchImpl=fetch}) {
  const model='jev-1.14.0',usdPerToken=.042/1e6;
  const ledger=fs.existsSync(ledgerFile)?JSON.parse(fs.readFileSync(ledgerFile)): {model,max_usd:maxUSD,charged_or_reserved_usd:0,requests:[],price_source:'https://docs.typesafe.ai/models',input_usd_per_million:.042,output_usd_per_million:0};
  const save=()=>atomic(ledgerFile,ledger);save();
  return async(o,{signal,folder})=>{
    const input=publicInput(o),menu=input.candidates,questions={layout:{type:'choice',instructions:decisionInstructions+' Select the offered layout action with smallest expected completion time.',criteria:Object.fromEntries(menu.map(c=>[c.id,c.description+' Exact candidate geometry/counts are in state.candidates.']))}};
    o.jobs.forEach((j,i)=>questions['job_'+i]={type:'score',instructions:'How strongly should job '+j.job_id+' be prioritized NOW to minimize the final completion time, considering all remaining processes and resources?',criteria:priorityLevels});
    const body=JSON.stringify({model,state:input,questions});
    // Conservative preflight bound: at most one token per UTF-8 byte in the
    // complete request, plus 4096 framing tokens. State is billed once per request. Failed/unknown
    // responses retain the reservation; there are no hidden automatic retries.
    const bound=(Buffer.byteLength(body)+4096)*usdPerToken;
    if(ledger.charged_or_reserved_usd+bound>Math.min(3,maxUSD))throw Object.assign(new Error('jev_spending_cap'),{fatal:true});
    const id=randomUUID(),entry={id,task_id:o.context.task_id,epoch_id:o.epoch_id,request_sha256:createHash('sha256').update(body).digest('hex'),reserved_usd:bound,status:'reserved'};
    ledger.requests.push(entry);ledger.charged_or_reserved_usd+=bound;save();
    atomic(path.join(folder,'jev-request-'+o.epoch_id+'-'+id+'.json'),{endpoint:'https://api.typesafe.ai/v1/systemone',body:JSON.parse(body)});
    let response;
    try{response=await fetchImpl('https://api.typesafe.ai/v1/systemone',{method:'POST',headers:{'Authorization':'Bearer '+apiKey,'Content-Type':'application/json','TypeSafe-Danger-Zone-Long-Context':'true'},body,signal});}
    catch(error){entry.status='transport_error';save();throw new Error('Jev transport failed; reserved spend retained.');}
    const raw=await response.text();fs.writeFileSync(path.join(folder,'jev-response-'+o.epoch_id+'-'+id+'.json'),raw);
    entry.http_status=response.status;entry.status=response.ok?'response_received':'http_error';save();
    if(!response.ok)throw Object.assign(new Error('jev_http_'+response.status),{fatal:true});
    const data=JSON.parse(raw),usage=data.usage;
    if(Number.isFinite(usage?.input_tokens)&&usage.input_tokens>=0){entry.usage=usage;entry.estimated_billed_usd=usage.input_tokens*usdPerToken;ledger.charged_or_reserved_usd+=entry.estimated_billed_usd-bound;}
    entry.resolved_model=data.model;save();
    const answer={layout_choice:data.answers?.layout?.choice,reason:'Jev typed choice and per-job scores; priorities = round(score/4*1000).',
      priorities:o.jobs.map((j,i)=>{const score=data.answers?.['job_'+i]?.score;if(!Number.isFinite(score)||score<0||score>4)throw new Error('Invalid Jev priority score');return {job_id:j.job_id,priority:Math.round(score/4*1000)};})};
    return compilePolicyAnswer(input,answer);
  };
}

export function createLunaInboxController({directory}) {
  fs.mkdirSync(directory,{recursive:true});
  // Previous answers remain as evidence, but cannot satisfy a fresh session.
  // Clear only the transient completion marker before publishing new requests.
  const done=path.join(directory,'done.json');if(fs.existsSync(done))fs.unlinkSync(done);
  return async(o,{signal,folder})=>{
    const id=o.session_id+'-'+o.context.task_id+'-epoch-'+o.epoch_id,requestFile=path.join(directory,id+'.request.json'),answerFile=path.join(directory,id+'.answer.json');
    const input=publicInput(o);
    atomic(requestFile,input);atomic(path.join(directory,'pending.json'),{id,request_file:requestFile,answer_file:answerFile});
    while(!fs.existsSync(answerFile)){
      if(signal.aborted)throw new Error('Luna response timeout');
      await new Promise(resolve=>setTimeout(resolve,250));
    }
    const answer=JSON.parse(fs.readFileSync(answerFile));
    atomic(path.join(folder,'luna-input-'+o.epoch_id+'.json'),input);atomic(path.join(folder,'luna-answer-'+o.epoch_id+'.json'),answer);
    fs.unlinkSync(requestFile);fs.unlinkSync(path.join(directory,'pending.json'));
    return compilePolicyAnswer(input,answer);
  };
}
