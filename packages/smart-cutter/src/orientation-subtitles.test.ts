import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm,stat,readdir,rename} from 'node:fs/promises';
import os from 'node:os';import path from 'node:path';
import {SmartAi} from './ai.ts';import {SmartMedia} from './media.ts';import {SmartCore} from './core.ts';
import {SubtitleCorrector,safeSubtitleCorrection} from './subtitle-correction.ts';
import {runProcess} from './process.ts';import {pendingDirectionReview, type Job} from './types.ts';
import type {SmartLibrary} from './library.ts';
import {createAcceptanceLibrary} from '../../../scripts/smart-cutter/fixture.ts';
const repo=process.cwd(),runtime=path.join(repo,'apps/smart-cutter-desktop/src-tauri/runtime');
const aiRuntime={python:path.join(runtime,'python',process.platform==='win32'?'python.exe':'bin/python'),script:path.join(repo,'scripts/smart-cutter/ai-worker.py'),models:path.join(runtime,'models')};
async function settled(core:SmartCore,id:string){for(let i=0;i<600;i++){const j=core.store.get<Job>('job',id)!;if(!['queued','running'].includes(j.status))return j;await new Promise(r=>setTimeout(r,100));}throw new Error('job did not settle');}

test('multi-frame orientation corrects all quarter turns and rejects blank, mixed-direction and ambiguous frames', {timeout:60000},async t=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'smart-directions-'));t.after(()=>rm(root,{recursive:true,force:true}));
 const ai=new SmartAi(aiRuntime);t.after(()=>ai.close());const media=new SmartMedia({} as SmartLibrary,ai);
 const expected=[0,270,180,90] as const,filters=['null','transpose=clock','hflip,vflip','transpose=cclock'];const files:string[]=[];
 for(const [index,filter] of filters.entries()){
  const file=path.join(root,`face-${index}.jpg`);files.push(file);
  await runProcess(media.ffmpeg.ffmpeg_path,['-v','error','-y','-i',path.join(repo,'packages/smart-cutter/fixtures/synthetic-speaker.jpg'),'-vf',filter,'-frames:v','1',file]);
  const result=await ai.orientation([0,1000,2000].map(at_ms=>({file_path:file,at_ms})));assert.equal(result.rotation,expected[index]);assert.ok(result.confidence>=0.9);
 }
 const mixed=await ai.orientation(files.slice(0,3).map((file_path,index)=>({file_path,at_ms:index*1000})));assert.equal(mixed.rotation,null);
 const blank=path.join(root,'blank.jpg');await runProcess(media.ffmpeg.ffmpeg_path,['-v','error','-y','-f','lavfi','-i','color=c=navy:s=640x360','-frames:v','1',blank]);
 assert.equal((await ai.orientation([0,1000,2000].map(at_ms=>({file_path:blank,at_ms})))).rotation,null);
 const pair=path.join(root,'two.jpg');await runProcess(media.ffmpeg.ffmpeg_path,['-v','error','-y','-i',files[0]!, '-i',files[0]!,'-filter_complex','hstack=inputs=2','-frames:v','1',pair]);
 assert.equal((await ai.orientation([0,1000,2000].map(at_ms=>({file_path:pair,at_ms})))).rotation,null);
 assert.equal((await ai.faces([pair,files[0]!,files[0]!].map((file_path,index)=>({file_path,at_ms:index*1000})),9/16)).multiple_faces,true,'a real second face in one frame still requires review');
});

test('a weak isolated secondary face needs independent or temporal support while strong and persistent faces still stop cropping',async()=>{
 const script=`import sys,io,runpy,cv2,numpy as np
worker,models,picture=sys.argv[1:];sys.argv=[worker,models];sys.stdin=io.StringIO("");ns=runpy.run_path(worker)
image=cv2.imread(picture);h,w=image.shape[:2];detector=cv2.FaceDetectorYN.create(models+"/yunet.onnx","",(w,h),0.8,0.3,5000);_,raw=detector.detect(image);main=max(raw,key=lambda f:float(f[2]*f[3]));noise=main.copy();noise[:4]=[0,h-main[3]*0.8,main[2]*0.8,main[3]*0.8];noise[-1]=0.86
class Detector:
 def __init__(self,repeat,strong):self.index=0;self.repeat=repeat;self.strong=strong
 def setInputSize(self,size):pass
 def detect(self,image):
  self.index+=1;extra=noise.copy();extra[-1]=0.95 if self.strong else 0.86;return None,np.array([main,extra] if self.index<=self.repeat else [main])
class Cascade:
 def empty(self):return False
 def detectMultiScale(self,*args,**kwargs):return []
cv2.CascadeClassifier=lambda *args:Cascade()
for repeat,strong,expected in [(1,False,False),(2,False,True),(1,True,True)]:
 cv2.FaceDetectorYN.create=lambda *args:Detector(repeat,strong)
 result=ns['faces']({'frames':[{'file_path':picture,'at_ms':i*1000}for i in range(3)],'ratio':9/16})
 assert result['multiple_faces']==expected,(repeat,strong,result)
print('secondary evidence rules passed')`;
 const result=await runProcess(aiRuntime.python,['-c',script,aiRuntime.script,aiRuntime.models,path.join(repo,'packages/smart-cutter/fixtures/synthetic-speaker.jpg')]);assert.match(result,/secondary evidence rules passed/);
});

test('subtitle correction accepts bounded homophones while preserving numbers, negations, names and original timings; cached text avoids duplicate model calls',async t=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'smart-subtitles-'));t.after(()=>rm(root,{recursive:true,force:true}));
 assert.equal(safeSubtitleCorrection('看人之长，天下尽是无师。','看人之长，天下尽是吾师。'),true);
 for(const [a,b] of [['利润15%，今天不投资。','利润16%，今天不投资。'],['今天不投资。','今天补投资。'],['真心可以换取真心。','耐心可以换取真心。'],['陶矜老师讲人生。','陶今老师讲人生。'],['三个人。','仨个人。']])assert.equal(safeSubtitleCorrection(a!,b!,['陶矜']),false);
 let calls=0;
 const corrector=new SubtitleCorrector(()=> 'fixture-secret-never-persist',()=>root,(async()=>{calls++;return new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify({corrections:[{index:0,text:'看人之长，天下尽是吾师。',reason:'典故同音错字'}],uncertain:[]})}}]}));}) as typeof fetch);
 const input=[{begin_ms:0,end_ms:1700,text:'看人之长，天下尽是无师。'}];const result=await corrector.correct(input,['陶矜']);
 assert.equal(input[0]!.text,'看人之长，天下尽是无师。');assert.equal(result.captions[0]!.original_text,input[0]!.text);assert.equal(result.captions[0]!.end_ms,1700);
 const cached=await corrector.correct([{...input[0]!,begin_ms:1000,end_ms:2700}],['陶矜']);assert.equal(calls,1);assert.equal(cached.captions[0]!.end_ms,2700);
 const file=path.join(root,'cache/subtitle-corrections',(await readdir(path.join(root,'cache/subtitle-corrections')))[0]!);assert.ok(!(await readFile(file,'utf8')).includes('fixture-secret'));
 const unsafe=new SubtitleCorrector(()=> 'fixture',()=>path.join(root,'unsafe'),(async()=>new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify({corrections:[{index:0,text:'学会宽容，人生没有烦恼。',reason:'润色'}],uncertain:[]})}}]}))) as typeof fetch);
 await assert.rejects(unsafe.correct(input,[]),/未通过/);
 const incomplete=new SubtitleCorrector(()=> 'fixture',()=>path.join(root,'incomplete'),(async()=>new Response(JSON.stringify({choices:[{finish_reason:'length',message:{content:'{}'}}]}))) as typeof fetch);await assert.rejects(incomplete.correct(input,[]),/不完整/);
});

test('subtitle service failure pauses after verified clips; resume preserves clips and exports an auditable correction result', {timeout:60000},async t=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'smart-subtitle-resume-'));const library=await createAcceptanceLibrary(path.join(root,'library'),path.join(repo,'packages/smart-cutter/fixtures/synthetic-speaker.jpg'));let calls=0;
 const core=new SmartCore({state_root:path.join(root,'state'),workspace_root:path.join(root,'workspace'),auth_mode:'local_trusted',ai:aiRuntime,subtitle_fetch:(async()=>{calls++;return calls===1?new Response('{}',{status:503}):new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify({corrections:[],uncertain:[]})}}]}));}) as typeof fetch});
 await core.initialize();t.after(async()=>{await core.close();core.store.close();await rm(root,{recursive:true,force:true});});await core.updateSettings({library_root:library});await core.vault.set('dashscope','fixture-no-external-call');
 const work=await core.generatePlan(core.createWork('现金流是企业的血液。把事情做对，再把规模做大。',undefined,'验收讲师').id);core.updateWork(work.id,{settings:{crop_mode:'portrait',auto_rotate:true,subtitle_correction:true}});
 const queued=core.enqueue(work.id),held=await settled(core,queued.id);assert.equal(held.status,'needs_review');assert.equal(held.completed_clips.length,2);
 const files=held.completed_clips.map(name=>path.join(held.workspace_root,'cache/jobs',held.id,name));const mtimes=await Promise.all(files.map(async file=>(await stat(file)).mtimeMs));
 await rename(work.segments[0]!.selected!.source_file_path,work.segments[0]!.selected!.source_file_path+'.offline');
 for(const segment of work.segments)await rm(path.join(core.settings.workspace_root,'cache/source-videos',segment.selected!.id+'.media'));
 core.controlJob(held.id,'resume');const done=await settled(core,held.id);assert.equal(done.status,'done',done.error);assert.deepEqual(await Promise.all(files.map(async file=>(await stat(file)).mtimeMs)),mtimes);
 const manifest=JSON.parse(await readFile(done.manifest_path,'utf8'));assert.equal(manifest.subtitle_correction.enabled,true);assert.equal(manifest.subtitle_correction.model,'qwen-plus');assert.equal(manifest.actual_script,'现金流是企业的血液。\n把事情做对，再把规模做大。');
});

test('automatic export freezes upright direction in its job without rewriting the work; display metadata and manual zero prevent double rotation', {timeout:60000},async t=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'smart-auto-direction-'));const library=await createAcceptanceLibrary(path.join(root,'library'),path.join(repo,'packages/smart-cutter/fixtures/synthetic-speaker.jpg'));
 const core=new SmartCore({state_root:path.join(root,'state'),workspace_root:path.join(root,'workspace'),auth_mode:'local_trusted',ai:aiRuntime});await core.initialize();t.after(async()=>{await core.close();core.store.close();await rm(root,{recursive:true,force:true});});await core.updateSettings({library_root:library});
 const work=await core.generatePlan(core.createWork('现金流是企业的血液。',undefined,'验收讲师').id);const raw=work.segments[0]!.selected!;
 const turned=path.join(root,'turned.mp4');await runProcess(core.media.ffmpeg.ffmpeg_path,['-v','error','-y','-i',raw.source_file_path,'-vf','transpose=clock','-c:v','libx264','-preset','ultrafast','-c:a','copy',turned]);
 const info=await stat(turned);raw.source_file_path=turned;raw.fingerprint={size:info.size,mtime_ms:info.mtimeMs};delete raw.content_hash;work.settings={...work.settings,crop_mode:'fit',subtitles:false,auto_rotate:true};core.store.set('work',work);
 const done=await settled(core,core.enqueue(work.id).id);assert.equal(done.status,'done',done.error);assert.equal(done.work.segments[0]!.selected!.rotation,270);assert.equal(done.work.segments[0]!.selected!.direction_source,'automatic');assert.equal(core.work(work.id).segments[0]!.selected!.rotation,0,'export decisions cannot silently rewrite the editing work');
 const manifest=JSON.parse(await readFile(done.manifest_path,'utf8'));assert.equal(manifest.sources[0].rotation,270);assert.equal(manifest.sources[0].direction_evidence.detector,'yunet-landmarks+haar-v1');
 const tagged=path.join(root,'metadata-upright.mp4');await runProcess(core.media.ffmpeg.ffmpeg_path,['-v','error','-y','-i',turned,'-c','copy','-metadata:s:v:0','rotate=90',tagged]);const taggedInfo=await stat(tagged);
 const metadata={...raw,id:'tagged',fingerprint:{size:taggedInfo.size,mtime_ms:taggedInfo.mtimeMs},source_file_path:tagged,rotation:0 as const};await core.media.correctDirection(metadata,tagged,core.settings.workspace_root,true);assert.equal(metadata.rotation,0,'ffmpeg display rotation is already applied before direction analysis');
 t.mock.method(core.ai,'orientation',async()=>{assert.fail('manual direction must take precedence');});const manual={...raw,direction_source:'manual' as const,rotation:0 as const};await core.media.correctDirection(manual,turned,core.settings.workspace_root,true);assert.equal(manual.rotation,0);
});

test('uncertain direction identifies its sentence and confirmation of zero resumes the same job with completed clips intact', {timeout:60000},async t=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'smart-confirm-direction-'));const library=await createAcceptanceLibrary(path.join(root,'library'));
 const core=new SmartCore({state_root:path.join(root,'state'),workspace_root:path.join(root,'workspace'),auth_mode:'local_trusted',ai:aiRuntime});await core.initialize();t.after(async()=>{await core.close();core.store.close();await rm(root,{recursive:true,force:true});});await core.updateSettings({library_root:library});
 let work=await core.generatePlan(core.createWork('现金流是企业的血液。把事情做对，再把规模做大。',undefined,'验收讲师').id);
 work.settings={...work.settings,crop_mode:'center',auto_rotate:true};work.segments[0]!.selected!.direction_source='automatic';core.store.set('work',work);
 const other=await core.generatePlan(core.createWork('现金流是企业的血液。',undefined,'验收讲师').id),otherBefore=JSON.stringify(core.work(other.id));
 t.mock.method(core.ai,'orientation',async()=>({rotation:null,confidence:0.6,scores:[],reason:'uncertain'}));
 const held=await settled(core,core.enqueue(work.id).id);assert.equal(held.status,'needs_review');assert.equal(held.direction_review?.segment_id,2);assert.match(held.error,/第 2 句.*原声拼接验收/u);assert.match(held.error,/方向待确认/u);assert.equal(held.completed_clips.length,1);
 const summary=(await core.state()).jobs.find(job=>job.id===held.id)!;assert.equal(summary.direction_review?.candidate_id,work.segments[1]!.selected!.id);
 const legacy=structuredClone(held);delete legacy.direction_review;legacy.error='原片方向缺少唯一可靠的人脸证据，请确认方向';assert.equal(pendingDirectionReview(legacy)?.segment_id,2);
 const clip=path.join(held.workspace_root,'cache/jobs',held.id,held.completed_clips[0]!),stamp=(await stat(clip)).mtimeMs;
 assert.throws(()=>core.rotateSource(work.id,2,{revision:work.revision-1,rotation:0,confirm_current:true,job_id:held.id}),/方案已更新/);
 work=core.rotateSource(work.id,2,{revision:work.revision,rotation:0,confirm_current:true,job_id:held.id});
 const confirmed=core.store.get<Job>('job',held.id)!;assert.equal(confirmed.status,'paused');assert.equal(confirmed.direction_review,undefined);assert.deepEqual(confirmed.completed_clips,held.completed_clips);assert.equal(confirmed.revision,work.revision);assert.equal(JSON.stringify(core.work(other.id)),otherBefore);
 t.mock.method(core.ai,'orientation',async()=>{assert.fail('confirmed normal direction must not be analyzed again');});
 await rename(work.segments[0]!.selected!.source_file_path,work.segments[0]!.selected!.source_file_path+'.offline');await rm(path.join(core.settings.workspace_root,'cache/source-videos',work.segments[0]!.selected!.id+'.media'));
 core.controlJob(held.id,'resume');const done=await settled(core,held.id);assert.equal(done.status,'done',done.error);assert.equal((await stat(clip)).mtimeMs,stamp);assert.equal(done.work.segments[1]!.selected!.direction_source,'manual');assert.equal(done.work.segments[1]!.selected!.rotation,0);
});
