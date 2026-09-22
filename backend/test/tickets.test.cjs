const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {spawn} = require('node:child_process');
const {once} = require('node:events');
const {randomUUID} = require('node:crypto');

test('support tickets: permissions, replies, status audit, idempotency and real restart persistence', {timeout:45000}, async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'study-tickets-'));
  let child, base;
  async function start() {
    child = spawn(process.execPath, ['-e', `
      const database=require('./src/config/database');
      const {createApp}=require('./src/app');
      const {createGeminiService}=require('./src/services/geminiService');
      const gemini=createGeminiService({apiKey:'test-support-key',fetchImpl:async(url,options)=>{
        const request=JSON.parse(options.body);
        const question=request.contents.at(-1).parts[0].text;
        const answer='Gemini test response: '+question;
        if(question==='simulate unavailable')return new Response('',{status:403});
        return new Response(JSON.stringify({candidates:[{finishReason:'STOP',content:{parts:[{text:answer}]}}]}),{status:200});
      }});
      database.initializeDatabase().then(()=>{
        const server=createApp({database,gemini}).listen(0,'127.0.0.1',()=>process.send(server.address().port));
      }).catch(e=>{console.error(e);process.exit(1);});
    `], {cwd:path.join(__dirname,'..'),env:{...process.env,STUDY_DATABASE_PATH:path.join(directory,'test.db')},stdio:['ignore','ignore','pipe','ipc']});
    let errors=''; child.stderr.on('data',d=>{errors+=d;});
    const [port]=await Promise.race([once(child,'message'),once(child,'exit').then(()=>{throw Error(errors || 'Backend exited');})]);
    base=`http://127.0.0.1:${port}/api`;
  }
  async function stop() { if(child && child.exitCode===null) {const exited=once(child,'exit');child.kill();await exited;} }
  function request(url,cookie,method='GET',data) {
    return fetch(base+url,{method,headers:{...(cookie?{Cookie:cookie}:{}),...(data?{'Content-Type':'application/json'}:{})},body:data?JSON.stringify(data):undefined});
  }
  async function login(email='student@example.com',password='student123') {
    const r=await request('/auth/login',null,'POST',{email,password}); assert.equal(r.status,200);
    return r.headers.get('set-cookie').split(';')[0];
  }
  async function json(url,cookie,method,data,status=200) { const r=await request(url,cookie,method,data);const result=await r.json();assert.equal(r.status,status,JSON.stringify(result));return result; }
  try {
    await start();
    let student=await login(); const other=await login('mia@student.edu'); let admin=await login('admin@example.com','admin123');
    assert.equal((await request('/tickets')).status,401);
    assert.equal((await json('/tickets',admin)).tickets.length,2, 'One empty conversation for each student login; none for admin');
    const current=(await json('/tickets/current-session',student)).ticket;
    assert.equal(current.isLoginConversation,true);assert.equal(current.replies.length,0);
    const tabs=await Promise.all([json('/tickets/current-session',student),json('/tickets/current-session',student)]);
    assert.ok(tabs.every(r=>r.ticket.id===current.id));
    await json('/auth/me',student);
    assert.equal((await json('/tickets',admin)).tickets.length,2,'Refresh and parallel tabs do not add records');
    assert.equal((await request('/tickets/'+current.id,other)).status,404);
    assert.equal((await request('/tickets/current-session',admin)).status,403);
    const message={conversationId:current.id,clientId:randomUUID(),text:'Upload help',language:'en'};
    assert.equal((await request('/tickets/current-session/messages',student,'POST',{...message,text:'password: secret-value'})).status,400);
    const sent=(await json('/tickets/current-session/messages',student,'POST',message,201)).ticket;
    assert.equal(sent.replies.length,2);assert.equal(sent.replies[1].role,'AI');assert.match(sent.replies[1].text,/Gemini test response/);
    assert.equal((await json('/tickets/current-session/messages',student,'POST',message,200)).ticket.replies.length,2);
    assert.equal((await json('/tickets/'+current.id,admin)).ticket.replies[0].text,'Upload help');
    await json('/tickets/'+current.id+'/replies',admin,'POST',{clientId:randomUUID(),text:'How can we help further?'},201);
    assert.equal((await json('/tickets/current-session',student)).ticket.replies.at(-1).role,'Admin');
    const failing={...message,clientId:randomUUID(),text:'simulate unavailable'};
    const failure=await json('/tickets/current-session/messages',student,'POST',failing,201);
    assert.equal(failure.aiError.code,'AI_CONFIGURATION_ERROR');
    assert.equal(failure.ticket.replies.at(-1).role,'Student','Do not manufacture an AI reply');
    const retriedFailure=await json('/tickets/current-session/messages',student,'POST',failing,201);
    assert.equal(retriedFailure.ticket.replies.length,4,'Retry does not duplicate the saved student message');
    const data={clientId:randomUUID(),category:'upload',title:'Upload failed',description:'My PDF upload fails after selecting a course.'};
    assert.equal((await request('/tickets',student,'POST',{...data,owner_id:2})).status,400);
    assert.equal((await request('/tickets',student,'POST',{...data,description:'My password is private-test-secret'})).status,400);
    assert.equal((await request('/tickets',admin,'POST',data)).status,403);
    let {ticket}=await json('/tickets',student,'POST',data,201);
    const url='/tickets/'+ticket.id;
    assert.equal(ticket.status,'Open'); assert.equal(ticket.version,1); assert.equal(ticket.replies.length,0);
    const again=await json('/tickets',student,'POST',data,201); assert.equal(again.ticket.id,ticket.id);
    assert.equal((await request('/tickets',student,'POST',{...data,title:'Different problem'})).status,409);
    assert.equal((await json('/tickets',other)).tickets.length,1);
    assert.equal((await request(url,other)).status,404);
    assert.equal((await request(url+'/replies',other,'POST',{clientId:randomUUID(),text:'Other user'})).status,404);
    assert.equal((await request(url+'/status',student,'PATCH',{status:'Resolved',version:1})).status,403);
    assert.equal((await json('/tickets',admin)).tickets.length,3);
    assert.equal((await request(url+'/replies',admin,'POST',{clientId:randomUUID(),text:'API key: sk-test-secret-value'})).status,400);
    const reply={clientId:randomUUID(),text:'Please retry with a smaller PDF and let us know the error message.'};
    ticket=(await json(url+'/replies',admin,'POST',reply,201)).ticket;
    assert.equal(ticket.replies.length,1);assert.equal(ticket.version,2);assert.equal(ticket.replies[0].role,'Admin');
    const repeated=(await json(url+'/replies',admin,'POST',reply,201)).ticket;
    assert.equal(repeated.replies.length,1);assert.equal(repeated.version,2);
    assert.equal((await request(url+'/status',admin,'PATCH',{status:'Resolved',version:1})).status,409);
    ticket=(await json(url+'/status',admin,'PATCH',{status:'In progress',version:ticket.version})).ticket;
    assert.equal(ticket.status,'In progress');assert.equal(ticket.replies.at(-1).kind,'status');assert.equal(ticket.resolvedAt,null);
    ticket=(await json(url+'/replies',student,'POST',{clientId:randomUUID(),text:'The smaller file worked. Thank you.'},201)).ticket;
    ticket=(await json(url+'/status',admin,'PATCH',{status:'Resolved',version:ticket.version})).ticket;
    assert.equal(ticket.status,'Resolved');assert.ok(ticket.resolvedAt);
    assert.equal((await json(url,student)).ticket.replies.filter(e=>e.kind==='reply').length,2);
    const persisted=ticket;
    await stop();await start();
    assert.equal((await request(url,student)).status,401);
    student=await login();admin=await login('admin@example.com','admin123');
    const next=(await json('/tickets/current-session',student)).ticket;
    assert.notEqual(next.id,current.id);
    assert.equal((await json('/tickets/'+current.id,student)).ticket.replies.length,4,'Earlier login history persists');
    assert.equal((await request('/tickets/current-session/messages',student,'POST',message)).status,409,'Old tab cannot send to a different login');
    const oldCookie=student;
    student=await login();
    assert.notEqual((await json('/tickets/current-session',student)).ticket.id,next.id,'Each successful login creates a new record');
    assert.equal((await json('/tickets/current-session',oldCookie)).ticket.id,next.id,'Separate browser login retains its own conversation');
    assert.deepEqual((await json(url,student)).ticket,persisted);
    ticket=(await json(url+'/status',admin,'PATCH',{status:'Open',version:persisted.version})).ticket;
    assert.equal(ticket.status,'Open');assert.equal(ticket.resolvedAt,null);
    // Forgotten-password requests do not authenticate the claimed account or expose its history.
    const recovery={clientId:randomUUID(),accountName:'Alex Chen',email:'student@example.com',consent:true};
    assert.equal((await request('/auth/recovery-request',null,'POST',{...recovery,password:'never-accept-this'})).status,400);
    const accepted=await json('/auth/recovery-request',null,'POST',recovery,202);
    assert.deepEqual(await json('/auth/recovery-request',null,'POST',recovery,202),accepted);
    assert.deepEqual(await json('/auth/recovery-request',null,'POST',{...recovery,clientId:randomUUID(),email:'unknown@example.com'},202),accepted);
    assert.equal((await request('/auth/recovery-request',null,'POST',{...recovery,consent:false})).status,400);
    assert.equal((await request('/auth/recovery-request',null,'POST',recovery)).status,429);
    assert.equal(accepted.ok,true);assert.equal(accepted.ticket,undefined);
    assert.match(accepted.message,/No email has been sent/);
    const recoveryList=(await json('/tickets',admin)).tickets.filter(t=>t.isRecoveryRequest);
    assert.equal(recoveryList.length,2,'Retries create only one recovery record');
    const recoveryTicket=recoveryList.find(t=>t.contactEmail==='student@example.com');
    assert.ok(recoveryTicket);assert.equal(recoveryTicket.userId,undefined,'Unverified email does not claim ownership');
    const recoveryUrl='/tickets/'+recoveryTicket.id;
    assert.equal((await request(recoveryUrl)).status,401);
    assert.equal((await request(recoveryUrl,student)).status,404);
    assert.equal((await request(recoveryUrl+'/replies',student,'POST',{clientId:randomUUID(),text:'Attempt to read recovery'})).status,404);
    assert.equal((await json('/tickets',student)).tickets.some(t=>t.isRecoveryRequest),false);
    let reviewed=(await json(recoveryUrl,admin)).ticket;
    const note={clientId:randomUUID(),text:'Awaiting verification through an established contact channel.'};
    reviewed=(await json(recoveryUrl+'/replies',admin,'POST',note,201)).ticket;
    assert.equal(reviewed.replies.length,1);
    assert.equal((await json(recoveryUrl+'/replies',admin,'POST',note,201)).ticket.replies.length,1);
    assert.equal((await request(recoveryUrl+'/status',admin,'PATCH',{status:'Resolved',version:1})).status,409);
    reviewed=(await json(recoveryUrl+'/status',admin,'PATCH',{status:'Resolved',version:reviewed.version})).ticket;
    assert.equal(reviewed.replies.at(-1).kind,'status');
    await login(); // Existing password still works: resolving a request cannot modify it.
    await stop();await start();admin=await login('admin@example.com','admin123');student=await login();
    assert.deepEqual((await json(recoveryUrl,admin)).ticket,reviewed,'Recovery notes and status survive restart');
    assert.equal((await request(recoveryUrl,student)).status,404);
    await request('/auth/logout',student,'POST');assert.equal((await request(url,student)).status,401);
  } finally {
    await stop();
    assert.equal(path.dirname(path.resolve(directory)),path.resolve(os.tmpdir()));
    assert.ok(path.basename(directory).startsWith('study-tickets-'));
    await fs.rm(directory,{recursive:true,force:true});
  }
});
