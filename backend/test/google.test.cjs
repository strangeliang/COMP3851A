const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const { createGoogleRoutes } = require("../src/routes/googleRoutes");
const { createSessionService } = require("../src/services/sessionService");

test("Google login requires a verified nonce-bound token, isolates existing accounts and denies disabled users", async (t) => {
  let claims;
  let existing = false;
  let user;
  let created = 0;
  const sessions = createSessionService({ secure: false });
  const database = {
    createLoginConversation: async (id, owner) => { assert.match(id, /^SESSION-/); assert.equal(owner, 10); },
    getGoogleUser: async () => user,
    getUserByEmail: async () => existing ? { id: 99, role:'Admin', status:'Active' } : null,
    createGoogleUser: async (data) => { created++; assert.ok(data.passwordHash.startsWith("$2")); user = { id: 10, status: "Active", role: "Student" }; return user; },
    getUserById: async () => user,
  };
  const app = express();
  app.use(express.json());
  app.use(createGoogleRoutes({ database, sessions, publicUser: (u) => u, clientId: "test-client", client: { verifyIdToken: async ({ audience }) => { assert.equal(audience, "test-client"); if (!claims) throw new Error("Bad signature"); return { getPayload: () => claims }; } } }));
  app.use((error, req, res, next) => { void next; res.status(error.status || 500).json({ code: error.code }); });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  async function challenge() {
    const r = await fetch(base + "/auth/google/config");
    const body = await r.json();
    claims = { sub: "google-subject", nonce: body.nonce, email: "user@gmail.com", email_verified: true };
    return r.headers.get("set-cookie").split(";")[0];
  }
  const login = (cookie = "") => fetch(base + "/auth/google", { method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie }, body: JSON.stringify({ credential: "test-credential" }) });
  assert.equal((await login()).status, 401);
  let cookie = await challenge(); claims = null;
  assert.equal((await login(cookie)).status, 401);
  cookie = await challenge(); claims.nonce = "wrong";
  assert.equal((await login(cookie)).status, 401);
  cookie = await challenge(); claims.email_verified = false;
  assert.equal((await login(cookie)).status, 401);
  cookie = await challenge(); existing = true;
  assert.equal((await login(cookie)).status, 409);
  assert.equal(created, 0);
  existing = false; cookie = await challenge();
  const success = await login(cookie);
  assert.equal(success.status, 200);
  assert.equal(created, 1);
  assert.match(success.headers.get("set-cookie"), /study_session=/);
  assert.equal((await login(cookie)).status, 401);
  cookie = await challenge(); user.status = "Disabled";
  assert.equal((await login(cookie)).status, 403);
});

test('Google Student linking preserves existing data and credentials, rejects unsafe links and handles parallel requests',async t=>{
  process.env.NODE_ENV='test';process.env.STUDY_DATABASE_PATH=':memory:';process.env.STUDY_SEED_DEMO='0';
  const bcrypt=require('bcryptjs');
  const database=require('../src/config/database');
  await database.initializeDatabase();
  const run=(sql,args=[])=>new Promise((resolve,reject)=>database.db.run(sql,args,e=>e?reject(e):resolve()));
  const get=(sql,args=[])=>new Promise((resolve,reject)=>database.db.get(sql,args,(e,row)=>e?reject(e):resolve(row)));
  const passwordHash=bcrypt.hashSync('existing-Student-password',4);
  const student=await database.registerStudent('Original Student','Student@gmail.com',passwordHash);
  await database.saveProfile(student.id,{name:'Original display name',bio:'Original bio',learningGoal:'Original goal',avatar:''});
  await database.createCourse({id:'google-link-course',ownerId:student.id,code:'LINK',name:'Keep this course'});
  await database.saveHistory(`${student.id}:summary`,student.id,'summary','google-link-course',{summary:{paragraph:'Saved summary',concepts:[]}});
  const sessions=createSessionService({secure:false});
  const credentials=new Map();let clientNumber=0;
  const app=express();app.set('trust proxy',1);app.use(express.json()); // Isolated test clients, not production proxy configuration.
  app.use(createGoogleRoutes({database,sessions,publicUser:u=>({id:u.id,name:u.name,email:u.email,role:u.role,status:u.status}),clientId:'test-client',client:{verifyIdToken:async({idToken,audience})=>{
    assert.equal(audience,'test-client');if(!credentials.has(idToken))throw Error('Invalid signature');return{getPayload:()=>credentials.get(idToken)};
  }}}));
  app.use((error,req,res,next)=>{void next;res.status(error.status||500).json({code:error.code,message:error.message});});
  const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  t.after(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await new Promise(resolve=>database.db.close(resolve));});
  const base=`http://127.0.0.1:${server.address().port}`;
  async function login(identity,bodyExtras={}){
    const currentNumber=++clientNumber;
    const ip=`198.51.100.${currentNumber}`;
    const challenge=await fetch(base+'/auth/google/config',{headers:{'X-Forwarded-For':ip}});
    assert.equal(challenge.status,200);const config=await challenge.json();const key=`verified-${currentNumber}`;
    credentials.set(key,{email_verified:true,...identity,nonce:config.nonce});
    return fetch(base+'/auth/google',{method:'POST',headers:{'Content-Type':'application/json',Cookie:challenge.headers.get('set-cookie').split(';')[0],'X-Forwarded-For':ip},body:JSON.stringify({...bodyExtras,credential:key})});
  }
  const success=await login({sub:'existing-gmail',email:'student@GMAIL.COM',name:'Google must not replace the profile'});
  assert.equal(success.status,200);
  const publicStudent=(await success.json()).user;
  assert.equal(publicStudent.id,student.id);assert.equal(publicStudent.name,'Original display name');
  assert.equal(publicStudent.role,'Student');assert.equal(Object.hasOwn(publicStudent,'password_hash'),false);
  const sessionCookie=success.headers.getSetCookie().find(cookie=>cookie.startsWith('study_session=')).split(';')[0];
  assert.equal(sessions.get(sessionCookie).userId,student.id);
  assert.equal((await database.getUserById(student.id)).password_hash,passwordHash);
  assert.equal((await database.getUserById(student.id)).bio,'Original bio');
  assert.equal((await database.listCoursesByOwner(student.id))[0].id,'google-link-course');
  assert.equal((await database.listHistory(student.id))[0].id,`${student.id}:summary`);
  assert.equal((await get('SELECT count(*) AS n FROM users')).n,1,'Linking must reuse the account, not create a duplicate');
  assert.equal((await login({sub:'existing-gmail',email:'student@gmail.com'})).status,200);
  const conflict=await login({sub:'different-subject',email:'student@gmail.com'});
  assert.equal(conflict.status,409);assert.equal((await conflict.json()).code,'GOOGLE_LINK_CONFLICT');
  assert.equal(await database.getGoogleUser('different-subject'),undefined);

  const workspace=await database.registerStudent('Workspace','student@school.example',passwordHash);
  const workspaceLogin=await login({sub:'workspace-subject',email:workspace.email,hd:'school.example'});
  assert.equal(workspaceLogin.status,200);assert.equal((await workspaceLogin.json()).user.id,workspace.id);
  const external=await database.registerStudent('External','student@outlook.com',passwordHash);
  const denied=await login({sub:'third-party-email',email:external.email},{hd:'outlook.com',email_verified:true,role:'Admin',userId:student.id});
  assert.equal(denied.status,409);assert.equal((await denied.json()).code,'GOOGLE_LINK_REQUIRES_CONFIRMATION');
  assert.equal(await database.getGoogleUser('third-party-email'),undefined,'Browser-supplied hosted-domain claims must not authorize linking');
  const deceptive=await database.registerStudent('Not Gmail','student@gmail.com.attacker.example',passwordHash);
  assert.equal((await login({sub:'gmail-lookalike',email:deceptive.email})).status,409);
  const admin=await database.registerStudent('Administrator','admin@gmail.com',passwordHash);
  await run("UPDATE users SET role='Admin' WHERE id=?",[admin.id]);
  assert.equal((await login({sub:'admin-auto-link',email:admin.email})).status,409);
  assert.equal(await database.getGoogleUser('admin-auto-link'),undefined);
  const disabled=await database.registerStudent('Disabled','disabled@gmail.com',passwordHash);
  await run("UPDATE users SET status='Disabled' WHERE id=?",[disabled.id]);
  assert.equal((await login({sub:'disabled-auto-link',email:disabled.email})).status,403);
  assert.equal(await database.getGoogleUser('disabled-auto-link'),undefined);
  assert.equal((await login({sub:'unverified',email:'student@gmail.com',email_verified:false})).status,401);

  const racing=await database.registerStudent('Parallel','parallel@gmail.com',passwordHash);
  const competing=await Promise.all([login({sub:'racer-1',email:racing.email}),login({sub:'racer-2',email:racing.email})]);
  assert.deepEqual(competing.map(r=>r.status).sort(),[200,409]);
  assert.equal((await get('SELECT count(*) AS n FROM google_accounts WHERE user_id=?',[racing.id])).n,1);
  const simultaneous=await Promise.all([login({sub:'new-same-subject',email:'new@gmail.com'}),login({sub:'new-same-subject',email:'new@gmail.com'})]);
  assert.deepEqual(simultaneous.map(r=>r.status),[200,200]);
  assert.equal((await get("SELECT count(*) AS n FROM users WHERE email='new@gmail.com'")).n,1);
  assert.equal((await database.getGoogleUser('new-same-subject')).role,'Student');
  await database.initializeDatabase();
  assert.equal((await database.getGoogleUser('existing-gmail')).id,student.id,'Binding survives schema initialization');
  await run("UPDATE users SET status='Disabled' WHERE id=?",[student.id]);
  assert.equal((await login({sub:'existing-gmail',email:'student@gmail.com'})).status,403,'Existing Google bindings do not bypass account disabling');
});
