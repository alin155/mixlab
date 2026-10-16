import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, copyFile, rm, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SmartCore } from './core.ts';
import { TikHubClient } from './tikhub.ts';
import { SmartError, type Job, type HotVideo, type Account, type Work } from './types.ts';
import { createAcceptanceLibrary } from '../../../scripts/smart-cutter/fixture.ts';
import type { DashScopeTemporaryFileHttpClient } from '../../asr-core/src/index.ts';
import { readCurrentCutterRelease } from '../../library-fs/src/index.ts';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const ai = { python: process.env.MIXLAB_SMART_PYTHON || path.join(repo, 'apps/smart-cutter-desktop/src-tauri/runtime/python', process.platform === 'win32' ? 'python.exe' : 'bin/python'),
  script: path.join(repo, 'scripts/smart-cutter/ai-worker.py'), models: path.join(repo, 'apps/smart-cutter-desktop/src-tauri/runtime/models') };
async function settled(core: SmartCore, id: string): Promise<Job> {
  for (let i = 0; i < 600; i++) {
    const job = core.store.get<Job>('job', id)!; if (!['queued', 'running'].includes(job.status)) return job;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('render did not settle');
}
function hot(status: HotVideo['status'] = 'ready'): HotVideo {
  return { id: 'douyin:72300000001', platform: 'douyin', video_id: '72300000001', account_id: 'test-account', author: '受控接口验收账号', title: '标题不是口播文案',
    published_at: new Date().toISOString(), duration_ms: 4000, download_url: 'https://example.invalid/fixture.mp4', cover_url: '',
    observations: [{ at: new Date().toISOString(), stats: { likes: 2000, comments: null, shares: null, plays: null } }], growth_per_hour: null,
    status, error: '', local_video_path: '', local_audio_path: '', transcript: status === 'ready' ? '现金流是企业的血液。' : '', asr_task_id: '', asr_model: '', updated_at: new Date().toISOString() };
}
test('actual local embedding index and face detector; uncertain crop holds and manual override resumes', { timeout: 120_000 }, async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'smart-ai-'));
  const library = await createAcceptanceLibrary(path.join(root, 'library'));
  const core = new SmartCore({ state_root: path.join(root, 'state'), workspace_root: path.join(root, 'workspace'), auth_mode: 'local_trusted', ai });
  await core.initialize(); t.after(async () => { await core.close(); core.store.close(); await rm(root, { recursive: true, force: true }); });
  await core.updateSettings({ library_root: library });
  const snapshot = await core.library.snapshot(); await core.ai.buildIndex(snapshot);
  const matches = await core.ai.search(snapshot, '现金流是企业的血液。', '');
  assert.equal(matches.hits[0]?.source_video_id, 'V000001'); assert.ok(matches.hits[0]!.score > 0.85);
  const vectorPath = path.join(snapshot.root, 'semantic-vectors.sqlite');
  let vectors = new DatabaseSync(vectorPath);
  const checkpoint = vectors.prepare('SELECT segment_id,vector FROM vectors ORDER BY segment_id LIMIT 1').get() as { segment_id: string; vector: Uint8Array };
  vectors.prepare('DELETE FROM vectors WHERE segment_id<>?').run(checkpoint.segment_id);
  vectors.exec("DELETE FROM meta WHERE key='ready'"); vectors.close();
  core.ai.stopIndex(); await core.ai.buildIndex(snapshot);
  vectors = new DatabaseSync(vectorPath, { readOnly: true });
  assert.equal((vectors.prepare('SELECT COUNT(*) AS count FROM vectors').get() as { count: number }).count, 2);
  assert.deepEqual((vectors.prepare('SELECT vector FROM vectors WHERE segment_id=?').get(checkpoint.segment_id) as { vector: Uint8Array }).vector, checkpoint.vector);
  vectors.close();
  const faces = await core.ai.faces([0, 1000, 2000].map(at_ms => ({ file_path: path.join(repo, 'packages/smart-cutter/fixtures/synthetic-speaker.jpg'), at_ms })), 9 / 16);
  assert.equal(faces.usable, true, faces.reason); assert.ok(faces.points.every(point => point.x > 0.35 && point.x < 0.7));
  const work = core.createWork('现金流是企业的血液。', undefined, '验收讲师'); await core.generatePlan(work.id);
  const preview = await core.media.preview(core.work(work.id).segments[0]!.selected!, core.settings.workspace_root);
  assert.ok((await core.media.probe(preview)).duration_ms < 2000, 'preview only includes selected range');
  const job = core.enqueue(work.id); const held = await settled(core, job.id);
  assert.equal(held.status, 'needs_review'); assert.match(held.error, /主讲人|方向/);
  core.updateWork(work.id, { settings: { crop_mode: 'fit' } });
  core.controlJob(job.id, 'resume'); const resumed = await settled(core, job.id);
  assert.equal(resumed.status, 'done', resumed.error);
  assert.equal(core.work(work.id).status, 'done');
});
test('monitor rules preserve automatic origin, deduplicate, enforce growth evidence; hotspot import remains manual', { timeout: 60_000 }, async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'smart-rules-'));
  const library = await createAcceptanceLibrary(path.join(root, 'library'));
  let requests = 0;
  const provider = new TikHubClient({ getKey: () => 'fixture-not-a-real-key', reserveRequest: () => { requests++; }, fetch: async () => new Response(JSON.stringify({ code: 200, data: { aweme_list: [], has_more: 0, max_cursor: 0 } })) });
  const core = new SmartCore({ state_root: path.join(root, 'state'), workspace_root: path.join(root, 'workspace'), auth_mode: 'local_trusted', ai, provider });
  await core.initialize(); t.after(async () => { await core.close(); core.store.close(); await rm(root, { recursive: true, force: true }); });
  await core.updateSettings({ library_root: library });
  const account: Account = { id: 'test-account', teacher: '验收讲师', input: 'MS4TESTACCOUNT0001', platform: 'douyin', sec_user_id: 'MS4TESTACCOUNT0001', unique_id: '', name: '受控接口验收账号', followers: null, group: '验收', enabled: true, cursor: '0', last_checked_at: '', last_error: '' };
  core.store.set('account', account); core.store.set('hot', hot());
  const rule = core.saveRule({ enabled: true, execution: 'review', min_likes: 1000, daily_limit: 1 });
  await core.monitorRun(); await core.monitorRun();
  const automatic = core.store.list<Work>('work').filter(work => work.origin.trigger === 'automatic');
  assert.equal(automatic.length, 1); assert.equal(automatic[0]!.origin.rule_id, rule.id);
  assert.equal(automatic[0]!.script, '现金流是企业的血液。'); assert.equal(automatic[0]!.segments[0]!.status, 'exact');
  const imported = await core.importHot(hot().id); assert.equal(imported.origin.trigger, 'manual'); assert.equal(imported.origin.kind, 'hot_manual');
  const extra = hot(); extra.id = 'douyin:72300000002'; extra.video_id = '72300000002'; core.store.set('hot', extra);
  core.saveRule({ enabled: true, min_growth_per_hour: 1 }, undefined);
  await core.monitorRun(); assert.equal(core.store.list<Work>('work').filter(work => work.origin.trigger === 'automatic').length, 1, 'unknown growth cannot pass a positive threshold');
  assert.match(core.store.get<import('./types.ts').Rule>('rule', rule.id)!.last_error, /未继续下载或提交转写/);
  assert.equal(requests, 3); assert.equal(core.store.list<Job>('job').length, 0, 'review rule cannot silently render');
  const untagged = await createAcceptanceLibrary(path.join(root, 'untagged-library'), path.join(repo, 'packages/smart-cutter/fixtures/synthetic-speaker.jpg'));
  // Arrange an incomplete legacy catalog only inside this disposable fixture.
  const release = await readCurrentCutterRelease(untagged);
  const catalog = new DatabaseSync(path.join(untagged, '.mixlab-library/releases', release.release_version, 'catalog.sqlite'));
  try { catalog.exec("UPDATE source_videos SET lecturer=''"); } finally { catalog.close(); }
  await core.updateSettings({ library_root: untagged, teacher_folder_bindings: { '验收素材': '验收讲师' } }); core.store.remove('rule', rule.id);
  const qualified = core.saveRule({ enabled: true, execution: 'qualified', min_likes: 1000, subtitle_correction: false });
  await core.monitorRun();
  const automaticWork = core.store.list<Work>('work').find(work => work.origin.rule_id === qualified.id)!;
  assert.equal(automaticWork.segments[0]!.selected!.lecturer, '', 'raw tags are not forged from folder bindings');
  const job = core.store.list<Job>('job').find(job => job.work_id === automaticWork.id)!;
  assert.ok(job, 'confirmed catalog folder identity permits qualified export without raw tags');
  assert.equal((await settled(core, job.id)).status, 'done');
  assert.equal(core.work(automaticWork.id).origin.trigger, 'automatic');
});
test('saved ASR task resumes without paid resubmission; unknown submission outcome cannot auto-resubmit', { timeout: 60_000 }, async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'smart-asr-'));
  const library = await createAcceptanceLibrary(path.join(root, 'library'));
  let submitted = 0, queried = 0;
  const http: DashScopeTemporaryFileHttpClient = {
    requestJson: async request => { if (request.method === 'POST') { submitted++; throw new Error('lost response'); } queried++; return { output: { task_status: 'SUCCEEDED', results: [{ transcription_url: 'https://example.invalid/transcript.json' }] } }; },
    getJson: async () => ({ transcripts: [{ text: '真实声音文案。', sentences: [{ text: '真实声音文案。', begin_time: 0, end_time: 1000 }] }] }), uploadFile: async () => {}
  };
  const core = new SmartCore({ state_root: path.join(root, 'state'), workspace_root: path.join(root, 'workspace'), auth_mode: 'local_trusted', ai, asr_http: http });
  await core.initialize(); t.after(async () => { await core.close(); core.store.close(); await rm(root, { recursive: true, force: true }); });
  await core.updateSettings({ asr_api_key: 'fixture-asr-no-external-requests' });
  const item = hot('discovered'), folder = path.join(core.settings.workspace_root, 'cache/references', createHash('sha256').update(item.id).digest('hex').slice(0, 32));
  await mkdir(folder, { recursive: true });
  await copyFile(path.join(library, 'source-videos/验收素材/原声拼接验收.mp4'), path.join(folder, 'reference.mp4'));
  item.asr_task_id = 'saved-fixture-task'; item.asr_model = core.settings.asr_model; core.store.set('hot', item);
  const result = await core.references.process(item.id);
  assert.equal(result.transcript, '真实声音文案。'); assert.equal(submitted, 0); assert.equal(queried, 1);
  assert.ok((await stat(result.local_video_path)).isFile());
  result.asr_task_id = ''; result.asr_submitted_at = new Date().toISOString(); result.transcript = ''; result.status = 'failed'; core.store.set('hot', result);
  await assert.rejects(core.references.process(item.id), /结果未知/); assert.equal(submitted, 0);
});

test('historical monitor follows the configured rule window, while repeat checks stop at known posts',async t=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'smart-history-')),library=await createAcceptanceLibrary(path.join(root,'library'));let requests=0;
 const at=(hours:number)=>new Date(Date.now()-hours*3600000).toISOString();
 const video=(id:string,hours:number,likes:number)=>({video_id:id,title:'真实接口契约的受控历史条目',author:'验收账号',published_at:at(hours),duration_ms:4000,download_url:'https://example.invalid/reference.mp4',cover_url:'',stats:{likes,comments:null,shares:null,plays:null}});
 const provider=new TikHubClient({getKey:()=> 'fixture',reserveRequest:()=>{}});
 t.mock.method(provider,'posts',async(_platform:unknown,_account:unknown,cursor='0')=>{requests++;if(requests===2)throw new SmartError('provider_failed','temporary upstream failure',502);return cursor==='0'?{videos:[video('72300000002',100,5)],cursor:'page2',has_more:true}:{videos:[video('72300000001',5000,2000)],cursor:'end',has_more:false};});
 const core=new SmartCore({state_root:path.join(root,'state'),workspace_root:path.join(root,'workspace'),auth_mode:'local_trusted',ai,provider});await core.initialize();t.after(async()=>{await core.close();core.store.close();await rm(root,{recursive:true,force:true});});await core.updateSettings({library_root:library});
 core.store.set('account',{id:'test-account',teacher:'验收讲师',platform:'douyin',input:'MS4fixture',sec_user_id:'MS4fixture',unique_id:'',name:'验收账号',group:'历史',enabled:true,last_checked_at:'',last_error:'',cursor:'0'});
 core.store.set('hot',{...hot(),published_at:at(5000)});
 const rule=core.saveRule({enabled:true,execution:'review',max_age_hours:18000,min_likes:1000,subtitle_correction:false});
 await core.monitorRun();assert.equal(requests,3,'the historical window is honored and a transient page failure is retried once');assert.equal(core.store.list<Work>('work').filter(w=>w.origin.rule_id===rule.id).length,1);
 await core.monitorRun();assert.equal(requests,4,'known posts stop the next completed scan');assert.equal(core.store.list<Work>('work').filter(w=>w.origin.rule_id===rule.id).length,1);
 core.saveRule({max_age_hours:20000},rule.id);await core.monitorRun();assert.equal(requests,6,'a wider historical window scans beyond already-known posts');
 assert.throws(()=>core.saveRule({max_age_hours:87601}),/发布时间范围/);
});

test('rule duration limits exclude unknown and overlong references before download or ASR',async t=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'smart-duration-')),library=await createAcceptanceLibrary(path.join(root,'library'));
 const provider=new TikHubClient({getKey:()=> 'fixture',reserveRequest:()=>{}});t.mock.method(provider,'posts',async()=>({videos:[],cursor:'0',has_more:false}));
 const core=new SmartCore({state_root:path.join(root,'state'),workspace_root:path.join(root,'workspace'),auth_mode:'local_trusted',ai,provider});await core.initialize();t.after(async()=>{await core.close();core.store.close();await rm(root,{recursive:true,force:true});});await core.updateSettings({library_root:library});
 core.store.set('account',{id:'test-account',teacher:'验收讲师',platform:'douyin',input:'MS4fixture',sec_user_id:'MS4fixture',unique_id:'',name:'验收账号',group:'验收',enabled:true,last_checked_at:'',last_error:'',cursor:'0'});const h=hot();h.duration_ms=0;core.store.set('hot',h);
 const rule=core.saveRule({enabled:true,execution:'review',max_duration_seconds:3,subtitle_correction:false});await core.monitorRun();assert.equal(core.store.count('work'),0);
 core.store.set('hot',{...h,duration_ms:4000});await core.monitorRun();assert.equal(core.store.count('work'),0);
 core.saveRule({max_duration_seconds:4},rule.id);await core.monitorRun();assert.equal(core.store.count('work'),1);assert.throws(()=>core.saveRule({max_duration_seconds:-1}),/视频时长/);
});
