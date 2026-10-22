import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url));
const read=f=>JSON.parse(fs.readFileSync(path.join(root,f),'utf8'));
const hash=f=>createHash('sha256').update(fs.readFileSync(path.join(root,f))).digest('hex');
const references=read('data/source-references.json');
const imported=read('backend/poc/sim/v2/data/procedures.json');
const upstream=read('backend/poc/sim/v2/data/source-manifest.json');
const curated=read('benchmark/lemat-sdl/workflows.json');
for(const workflow of curated.workflows){
  const source=upstream.sources.find(s=>s.paper_id===workflow.source.paper_id);
  if(!source||source.sha256!==workflow.source.sha256||source.url!==workflow.source.url)throw new Error('Curated source mismatch '+workflow.id);
  const reference=references.references.find(r=>r.source_record_id===source.paper_id);
  if(!reference?.workflows.includes(workflow.id))throw new Error('Missing workflow attribution '+workflow.id);
}
const records=upstream.sources.map(s=>{
  const procedures=imported.procedures.filter(p=>p.source.paper_id===s.paper_id);
  const workflows=curated.workflows.filter(w=>w.source.paper_id===s.paper_id);
  const reference=references.references.find(r=>r.source_record_id===s.paper_id);
  for(const p of procedures)if(p.source.sha256!==s.sha256||p.source.url!==s.url)throw new Error('Source mismatch '+s.paper_id);
  return {...s,imported_procedure_ids:procedures.map(p=>p.id),imported_step_count:procedures.reduce((n,p)=>n+p.steps.length,0),
    scheduler_workflow_ids:workflows.map(w=>w.id),reference_id:reference?.id??null,
    bibliographic_identification:reference?.record_match??'Upstream record ID and URL only; title/DOI not independently established.',
    original_paper_rights:reference?.paper_license??'Not independently reviewed; do not infer from the repository Apache-2.0 license.',
    rights_evidence:reference?.verification_urls??[]};
});
const licenses=[['lemat','licenses/LeMat-Synth-APACHE-2.0.txt','43070e2d4e532684de521b885f385d0841030efa2b1a20bafb76133a5e1379c1'],['xarm','backend/poc/sim/physics/assets/xarm6/LICENSE','39bd98193b256fc11eb2a923afb9a5c5ce5187dc69733b08e4b6916f4dcfda50'],['three','backend/poc/demo/vendor/LICENSE-three.txt','8b378ebe60e2fe500158cb0ac71cb5e8b7d92953c2abcc63a0eb90499653b5bc']].map(([id,file,sha256])=>{
  if(hash(file)!==sha256)throw new Error('License changed '+id);return {id,file,sha256};
});
const provenanceFiles=['backend/poc/sim/v2/data/source-manifest.json','backend/poc/sim/v2/data/procedures.json','backend/poc/demo/workshop/data/procedures.json','benchmark/lemat-sdl/workflows.json','data/source-references.json'];
const inventory={version:'labops.source-inventory.v1',reviewed_on:references.reviewed_on,upstream_revision:upstream.commit,
  upstream_repository_license:'Apache-2.0; not a blanket original-paper or gated-dataset license',
  counts:{manifest_records:records.length,records_retained_in_import:records.filter(r=>r.imported_procedure_ids.length).length,imported_procedures:imported.procedures.length,imported_steps:imported.procedures.reduce((n,p)=>n+p.steps.length,0),scheduler_records:curated.records.length,scheduler_workflows:curated.workflows.length},
  input_hashes:Object.fromEntries(provenanceFiles.map(f=>[f,hash(f)])),licenses,records};
fs.writeFileSync(path.join(root,'data/lemat-source-inventory.json'),JSON.stringify(inventory,null,2)+'\n');
const link=s=>`[${s.paper_id}](https://github.com/LeMaterial/lematerial-llm-synthesis/blob/${upstream.commit}/annotations/${s.paper_id}/result.json)`;
const rows=records.map(r=>`| ${link(r)} | ${r.imported_procedure_ids.length} | ${r.imported_step_count} | ${r.scheduler_workflow_ids.join(', ')||'—'} | ${r.reference_id?`[${r.reference_id}](SOURCES.md#主要ベンチマークの元論文)`:'書誌・原論文の再配布条件は未確認'} |`).join('\n');
fs.writeFileSync(path.join(root,'docs/LEMAT_SOURCE_RECORDS.md'),`# LeMat注釈の出典一覧\n\n[出典と利用条件](SOURCES.md)、[第三者表示](../THIRD_PARTY_NOTICES.md)、[機械可読inventory](../data/lemat-source-inventory.json)を併せて参照。\n\n固定revision: \`${upstream.commit}\`。これは公開GitHub注釈の一覧で、ゲート付きHugging Face corpusの一覧ではない。\n\n元manifestは${inventory.counts.manifest_records}レコード。実際の同梱データは${inventory.counts.records_retained_in_import}レコードから${inventory.counts.imported_procedures}手順・${inventory.counts.imported_steps}工程。古いstatisticsのpapers件数と、保持されたsource ID件数を混同しない。14課題はそのうち${inventory.counts.scheduler_records}レコードの${inventory.counts.scheduler_workflows}workflowを使用する。手順数は実験成功件数ではない。\n\n本表は\`node scripts/build-source-inventory.mjs\`で生成する。元論文の権利確認が未完了のレコードを、リンクの存在だけで再配布許諾済みと扱わない。実行入力・保存結果・原本の文章はこの処理で書き換えない。\n\n| 公開annotation ID / source | 同梱手順数 | 同梱工程数 | 14課題への採用workflow | 書誌・権利確認 |\n|---|---:|---:|---|---|\n${rows}\n\n各原本のSHA-256、保持procedure ID、論文対応の根拠、ライセンス証拠URLはJSON inventoryに収録。元manifestにあるが同梱手順に残らないレコードは件数0で表示する。原論文の本文・図・PDFは本表に転載しない。\n`);
console.log(JSON.stringify(inventory.counts));
