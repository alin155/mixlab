import {spawn} from 'node:child_process';
import {mkdtemp,readFile,writeFile,stat} from 'node:fs/promises';
import {createServer} from 'node:net';
import {once} from 'node:events';
import path from 'node:path';
import {createAcceptanceLibrary} from '../../../scripts/smart-cutter/fixture.ts';
import {approveCutterUser,setCutterAccountTier} from '../../../packages/library-fs/src/index.ts';
import {runProcess} from '../../../packages/smart-cutter/src/process.ts';
const app='/Users/huaqihang/Documents/Codex/deliveries/mixlab-macos/0.2.0/MixLab Unified Cutter Candidate.app',r=app+'/Contents/Resources';
const root=await mkdtemp(path.resolve('.local-dev/macos/packaged-media-'));
const library=await createAcceptanceLibrary(root+'/library');
const socket=createServer();await new Promise<void>(ok=>socket.listen(0,'127.0.0.1',ok));const port=(socket.address() as {port:number}).port;await new Promise<void>(ok=>socket.close(()=>ok()));
const token='owned-packaged-media-test'; const base='http://127.0.0.1:'+port;
const child=spawn(r+'/binaries/node',[r+'/binaries/smart-cutter-api.bundle.mjs'],{detached:true,stdio:'ignore',env:{...process.env,PATH:'/usr/bin:/bin',MIXLAB_SMART_PORT:String(port),MIXLAB_SMART_STATE_ROOT:root+'/state',MIXLAB_SMART_WORKSPACE_ROOT:root+'/workspace',MIXLAB_SMART_API_TOKEN:token,MIXLAB_SMART_AUTH_MODE:'reviewed',MIXLAB_SMART_AI_ROOT:r+'/runtime',MIXLAB_SMART_AI_SCRIPT:r+'/runtime/ai-worker.py',MIXLAB_SMART_PYTHON:r+'/runtime/python/bin/python3',MIXLAB_SMART_FONTS:r+'/runtime/fonts',MIXLAB_FFMPEG_PATH:r+'/binaries/ffmpeg',MIXLAB_FFPROBE_PATH:r+'/binaries/ffprobe'}});
const report:any={scope:'relocated packaged engine with restricted PATH and isolated generated media; no NAS account or provider calls',app,started_at:new Date().toISOString(),root};
async function api(route:string,method='GET',body?:unknown,status=200):Promise<any>{const res=await fetch(base+route,{method,headers:{'X-Smart-Token':token,'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(15000)});const data=await res.json();if(res.status!==status)throw new Error(route+': '+JSON.stringify(data));return route.startsWith('/cutter/')?data.data:data;}
async function until(run:()=>Promise<any>){const end=Date.now()+60000;while(Date.now()<end){const x=await run();if(x)return x;await new Promise(ok=>setTimeout(ok,150))}throw new Error('pipeline timeout')}
try{
 report.health=await until(async()=>fetch(base+'/health').then(x=>x.ok?x.json():null).catch(()=>null));
 if(!report.health.runtime.ai_ready||!report.health.runtime.ffmpeg_ready)throw new Error('bundled runtime missing');
 await api('/smart/settings','PUT',{library_root:library});
 const account=await api('/smart/auth/register','POST',{username:'packaged-mac',password:'MixLabPackaged12345'},201);
 await approveCutterUser(library,{user_id:account.user_id,now:new Date().toISOString()});await setCutterAccountTier(library,account.user_id,'pro');
 await api('/smart/auth/login','POST',{username:'packaged-mac',password:'MixLabPackaged12345'});
 const detail=await api('/cutter/source-videos/V000001');
 const item={source_video_id:'V000001',source_title:detail.title,source_relative_path:detail.relative_path,start_segment_id:detail.transcript.segments[0].segment_id,end_segment_id:detail.transcript.segments[0].segment_id,begin_ms:0,end_ms:1700,selected_text:'现金流是企业的血液。',cut_mode:'precise',source_kind:'public'};
 const project=await api('/smart/projects','POST',{title:'包内真实媒体验收',items:[item]},201);
 const list=await api('/cutter/clip-lists','POST',{library_id:'smart-acceptance-only',project_id:project.id,title:project.title,items:[item]},201);
 const submitted=await api('/cutter/cut-jobs','POST',{clip_list_id:list.clip_list_id},201);
 const cut=await until(async()=>{const catalog=await api('/cutter/cut-jobs');const job=catalog.jobs.find((x:any)=>x.cut_job_id===submitted.jobs[0].cut_job_id);if(job.status==='failed')throw new Error(job.error_message);return job.status==='done'?job:null});
 const assembly=await api('/smart/assemblies','POST',{project_id:project.id,cut_job_ids:[cut.cut_job_id,cut.cut_job_id]},202);
 const merged=await until(async()=>{const state=await api('/smart/state');const a=state.assemblies.find((x:any)=>x.id===assembly.id);if(a.status==='failed')throw new Error(a.error);return a.status==='done'?a:null});
 const work=await api('/smart/works','POST',{script:'现金流是企业的血液。把事情做对，再把规模做大。'},201);
 await api('/smart/works/'+work.id+'/plan','POST',{},202);
 await until(async()=>{const x=await api('/smart/works/'+work.id);if(x.status==='failed')throw new Error(x.error);return x.status==='ready'?x:null});
 await api('/smart/works/'+work.id,'PATCH',{settings:{crop_mode:'fit'}});
 const render=await api('/smart/works/'+work.id+'/render','POST',{},202);
 const finished=await until(async()=>{const x=await api('/smart/jobs/'+render.id);if(['failed','needs_review'].includes(x.status))throw new Error(x.error);return x.status==='done'?x:null});
 const outputDir=path.dirname(finished.output_path);
 report.cut_job=cut.cut_job_id;report.local_clips=(await api('/cutter/local-clips')).local_clip_count;
 report.assembly={id:merged.id,duration_ms:merged.duration_ms,size:(await stat(merged.output_path)).size};
 report.smart={id:finished.id,size:(await stat(finished.output_path)).size,subtitles:await readFile(outputDir+'/subtitles.srt','utf8'),source_record:JSON.parse(await readFile(outputDir+'/sources.json','utf8'))};
 report.output_probe=JSON.parse(await runProcess(r+'/binaries/ffprobe',['-v','error','-show_format','-show_streams','-of','json',finished.output_path]));
 report.final_runtime=(await api('/smart/state')).settings.runtime; await api('/smart/runtime/shutdown','POST',{},202);await Promise.race([once(child,'exit'),new Promise((_,bad)=>setTimeout(()=>bad(new Error('packaged shutdown timeout')),12000))]);
 report.authenticated_shutdown=true;report.status='passed';
}catch(error){report.status='failed';report.error=String(error)}finally{if(child.exitCode===null&&child.pid)process.kill(-child.pid,'SIGKILL');report.finished_at=new Date().toISOString();await writeFile('docs/acceptance/macos-unified/packaged-media.json',JSON.stringify(report,null,2));console.log(JSON.stringify({status:report.status,error:report.error,root}));}
