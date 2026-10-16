import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { SmartCore } from './core.ts';
import { SmartStore } from './store.ts';
import { createSmartServer } from './http.ts';
import { workReady, includedSegments, type Work, type Job } from './types.ts';
import { createAcceptanceLibrary } from '../../../scripts/smart-cutter/fixture.ts';
import { resolveFfmpegRuntime } from '../../ffmpeg-core/src/index.ts';
import { sourceRotationFilter } from './media.ts';
const ai = { python: 'missing-test-runtime', script: 'missing-test-runtime', models: 'missing-test-runtime' };
async function fixture(t: TestContext, colored = false) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'smart-skip-direction-'));
  const image = path.join(root, 'colors.png');
  if (colored) execFileSync(resolveFfmpegRuntime().ffmpeg_path, ['-v','error','-f','lavfi','-i','color=blue:size=640x360,drawbox=x=0:y=0:w=320:h=360:color=red:t=fill','-frames:v','1','-y',image]);
  const library = await createAcceptanceLibrary(path.join(root, 'library'), colored ? image : undefined);
  const options = { state_root: path.join(root,'state'), workspace_root: path.join(root,'workspace'), auth_mode: 'local_trusted' as const, ai };
  const core = new SmartCore(options); await core.initialize(); await core.updateSettings({library_root:library});
  t.mock.method(core.ai, 'search', async () => ({hits:[],mode:'candidate',complete:false,examined:0,encoded:0,reused:0,query_ms:0}));
  const server = createSmartServer(core, 'test-access'); await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${(server.address() as {port:number}).port}`;
  const api=(route:string, method='POST',payload?:unknown)=>fetch(base+route,{method,headers:{'X-Smart-Token':'test-access','Content-Type':'application/json'},...(payload===undefined?{}:{body:JSON.stringify(payload)})});
  t.after(async()=>{await core.close();await new Promise<void>(resolve=>server.close(()=>resolve()));core.store.close();await rm(root,{recursive:true,force:true});});
  return {core,root,options,api};
}
async function completed(core:SmartCore,id:string) {
  for(let i=0;i<600;i++){const job=core.store.get<Job>('job',id)!;if(!['queued','running'].includes(job.status))return job;await new Promise(resolve=>setTimeout(resolve,50));}
  throw new Error('render did not finish');
}
function colors(core:SmartCore,file:string) {
  return execFileSync(core.media.ffmpeg.ffmpeg_path,['-v','error','-ss','0.2','-i',file,'-frames:v','1','-vf','scale=1:2','-f','rawvideo','-pix_fmt','rgb24','pipe:1']);
}

test('explicitly skipped missing sentences export contiguous real media and captions; restore and all-skipped gates remain enforced', {timeout:60000}, async t=>{
  const {core,api,options}=await fixture(t);
  const script='现金流是企业的血液。不存在的甲句。把事情做对，再把规模做大。不存在的乙句。';
  const work=await core.generatePlan(core.createWork(script,undefined,'验收讲师').id);
  assert.deepEqual(work.segments.map(s=>s.status),['exact','pending','exact','pending']);
  core.updateWork(work.id,{settings:{crop_mode:'fit',auto_rotate:false,subtitles:true}});
  let current=core.work(work.id); current.segments[2]!.status='near';core.store.set('work',current);
  const route=`/smart/works/${work.id}`;
  assert.equal((await api(route+'/skip-missing','POST',{revision:current.revision-1})).status,409);
  core.options.test_account_tier='ordinary';assert.equal((await api(route+'/skip-missing','POST',{revision:current.revision})).status,403);core.options.test_account_tier='pro';
  assert.equal((await api(route+'/skip-missing','POST',{revision:current.revision})).status,200);
  current=core.work(work.id);assert.deepEqual(current.segments.map(s=>!!s.skipped),[false,true,false,true]);
  assert.equal(current.segments[2]!.accepted,false);assert.equal(workReady(current),false);
  assert.throws(()=>core.enqueue(work.id),/审核/);
  current=core.acceptAllSegments(work.id,{revision:current.revision});assert.equal(workReady(current),true);
  const summary=(await core.state()).works.find(w=>w.id===work.id)!;
  assert.equal(summary.pending_count,0);assert.equal(summary.skipped_count,2);assert.equal(summary.duration_ms,3400);
  const persisted=new SmartStore(options.state_root);assert.equal(persisted.get<Work>('work',work.id)!.segments[1]!.skipped,true);persisted.close();
  const job=core.enqueue(work.id);
  assert.throws(()=>core.selectSegment(work.id,1,{revision:current.revision,skipped:true}),/等待/);
  const result=await completed(core,job.id);assert.equal(result.status,'done',result.error);
  const media=await core.media.probe(result.output_path);assert.ok(media.duration_ms>3300&&media.duration_ms<4000);
  const srt=await readFile(path.join(path.dirname(result.output_path),'subtitles.srt'),'utf8');
  assert.ok(srt.includes('现金流是企业的血液。')&&srt.includes('把事情做对，再把规模做大。'));assert.ok(!srt.includes('不存在'));
  const manifest=JSON.parse(await readFile(result.manifest_path,'utf8'));
  assert.equal(manifest.original_input_script,script);assert.deepEqual(manifest.skipped_segments.map((s:{id:number})=>s.id),[2,4]);
  assert.deepEqual(manifest.sources.map((s:{work_segment_id:number})=>s.work_segment_id),[1,3]);
  assert.equal(manifest.sources[0].output_end_ms,manifest.sources[1].output_begin_ms);assert.ok(!manifest.actual_script.includes('不存在'));
  current=core.work(work.id);core.selectSegment(work.id,2,{revision:current.revision,skipped:false});assert.equal(workReady(core.work(work.id)),false);
  for(const segment of core.work(work.id).segments) core.selectSegment(work.id,segment.id,{revision:core.work(work.id).revision,skipped:true});
  assert.equal(includedSegments(core.work(work.id)).length,0);assert.equal(workReady(core.work(work.id)),false);assert.throws(()=>core.enqueue(work.id),/至少保留/);
  await core.generatePlan(work.id);assert.ok(core.work(work.id).segments.every(s=>!s.skipped),'rematching creates a fresh review decision');
});

test('skipping a selected sentence excludes its original sound and subtitle while explicit restore keeps review state', {timeout:60000}, async t=>{
  const {core}=await fixture(t);const work=await core.generatePlan(core.createWork('现金流是企业的血液。把事情做对，再把规模做大。',undefined,'验收讲师').id);
  core.updateWork(work.id,{settings:{crop_mode:'fit',auto_rotate:false,subtitles:false}});
  let current=core.selectSegment(work.id,1,{revision:core.work(work.id).revision,skipped:true});assert.equal(workReady(current),true);
  const result=await completed(core,core.enqueue(work.id).id);assert.equal(result.status,'done',result.error);
  const manifest=JSON.parse(await readFile(result.manifest_path,'utf8'));assert.equal(manifest.sources.length,1);assert.equal(manifest.sources[0].work_segment_id,2);
  assert.equal(manifest.actual_script,'把事情做对，再把规模做大。');assert.equal(manifest.skipped_segments[0].target,'现金流是企业的血液。');
  const srt=await readFile(path.join(path.dirname(result.output_path),'subtitles.srt'),'utf8');assert.ok(!srt.includes('现金流'));
  current=core.selectSegment(work.id,1,{revision:core.work(work.id).revision,skipped:false});assert.equal(workReady(current),true);
  assert.equal(current.segments[0]!.status,'exact');
});

test('source direction is remembered by fingerprint, refreshes previews, precedes face analysis and produces upright exported pixels', {timeout:60000}, async t=>{
  const {core,root,api}=await fixture(t,true);
  const work=await core.generatePlan(core.createWork('现金流是企业的血液。',undefined,'验收讲师').id);
  const other=await core.generatePlan(core.createWork('现金流是企业的血液。',undefined,'验收讲师').id);
  core.updateWork(work.id,{settings:{crop_mode:'fit',auto_rotate:false,subtitles:false}});
  const candidate=core.work(work.id).segments[0]!.selected!;
  const before=await core.media.preview(candidate,core.settings.workspace_root);assert.ok((await core.media.probe(before)).width>(await core.media.probe(before)).height);
  const route=`/smart/works/${work.id}/segments/1/rotation`;const revision=core.work(work.id).revision;
  assert.equal((await api(route,'POST',{revision,rotation:45})).status,400);assert.equal((await api(route,'POST',{revision:revision-1,rotation:90})).status,409);
  core.options.test_account_tier='ordinary';assert.equal((await api(route,'POST',{revision,rotation:90})).status,403);core.options.test_account_tier='pro';
  assert.equal((await api(route,'POST',{revision,rotation:90})).status,200);
  const corrected=core.work(work.id).segments[0]!.selected!;
  assert.equal(corrected.rotation,90);assert.equal(core.work(other.id).segments[0]!.selected!.rotation,90);assert.equal(core.work(other.id).revision,other.revision+1);
  assert.equal(core.library.sourceRotation({...corrected,fingerprint:{...corrected.fingerprint,mtime_ms:corrected.fingerprint.mtime_ms+1}}),0);
  assert.equal(core.library.sourceRotation({...corrected,source_file_path:path.join(root,'another/C0169.mp4')}),0);
  const preview=await core.media.preview(corrected,core.settings.workspace_root);assert.notEqual(preview,before);
  const upright=await core.media.probe(preview);assert.ok(upright.height>upright.width);
  const pixels=colors(core,preview);assert.ok(pixels[0]!>200&&pixels[2]!<60&&pixels[3]!<60&&pixels[5]!>200);
  t.mock.method(core.ai,'faces',async (frames: Array<{file_path:string;at_ms:number}>)=>{const frame=await core.media.probe(frames[0]!.file_path);assert.ok(frame.height>frame.width);return {usable:true,reason:'fixture',multiple_faces:false,points:[]};});
  await core.media.analyze(corrected,corrected.source_file_path,root,9/16);
  await core.generatePlan(work.id);assert.equal(core.work(work.id).segments[0]!.selected!.rotation,90,'future matching reuses the saved source correction');
  const result=await completed(core,core.enqueue(work.id).id);assert.equal(result.status,'done',result.error);
  const exported=colors(core,result.output_path);assert.ok(exported[0]!>200&&exported[2]!<60&&exported[3]!<60&&exported[5]!>200);
  const manifest=JSON.parse(await readFile(result.manifest_path,'utf8'));assert.equal(manifest.sources[0].rotation,90);
  assert.equal(sourceRotationFilter(180),'hflip,vflip,');assert.equal(sourceRotationFilter(270),'transpose=cclock,');
});
