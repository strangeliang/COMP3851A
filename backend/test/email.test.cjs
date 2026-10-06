const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const bcrypt = require('bcryptjs');
const { createApp } = require('../src/app');
const { createMailService } = require('../src/services/mailService');
const { smtpOptions } = require('../src/config/smtp');
const { validateRuntime } = require('../src/config/runtime');

test('SMTP configuration requires credentials and encrypted ports; production validates selected provider', () => {
  const env = { SMTP_HOST:'smtp.163.com', SMTP_PORT:'465', SMTP_USER:'sender@example.test', SMTP_PASS:'test-secret' };
  const options = smtpOptions(env);
  assert.equal(options.secure, true);
  assert.equal(options.tls.rejectUnauthorized, true);
  assert.equal(options.debug, false);
  assert.equal(smtpOptions({...env, SMTP_PORT:'587'}).requireTLS, true);
  assert.equal(smtpOptions({...env, SMTP_PORT:'587'}).secure, false);
  for (const change of [{SMTP_PASS:''}, {SMTP_HOST:''}, {SMTP_USER:''}, {SMTP_PORT:'25'}, {SMTP_PORT:'invalid'}]) {
    assert.equal(smtpOptions({...env,...change}), null);
  }
  const production = { ...env, NODE_ENV:'production', MAIL_PROVIDER:'smtp',
    MAIL_FROM:'sender@example.test', FRONTEND_URL:'https://study.example.test', PUBLIC_APP_URL:'https://study.example.test',
    STUDY_DATABASE_PATH:path.resolve('persistent/test.db'), STUDY_UPLOAD_PATH:path.resolve('persistent/originals') };
  assert.doesNotThrow(() => validateRuntime(production));
  for (const change of [{SMTP_PASS:''}, {MAIL_FROM:''}, {PUBLIC_APP_URL:'https://wrong.example.test'}, {MAIL_PROVIDER:'invalid'}]) {
    assert.throws(() => validateRuntime({...production,...change}));
  }
});

test('SMTP sends codes and reset links without contacting Resend or exposing credentials', async () => {
  const sent = [];
  let captured;
  const smtp = smtpOptions({SMTP_HOST:'smtp.163.com',SMTP_USER:'sender@example.test',SMTP_PASS:'test-secret'});
  const mailer = createMailService({provider:'smtp',smtp,apiKey:'unused-resend-key',
    from:'Study <sender@example.test>',baseUrl:'https://study.example.test',
    fetchImpl:async()=>{assert.fail('SMTP must not call Resend');},
    createTransport:options=>{captured=options;return {sendMail:async message=>{sent.push(message);return {accepted:['student@example.test'],rejected:[]};}};},
  });
  assert.equal(mailer.configured,true);
  assert.deepEqual(captured,smtp);
  await mailer.sendRegistrationCode('student@example.test','123456','request');
  await mailer.sendLink('student@example.test','reset','opaque-token','reset-request');
  assert.deepEqual(sent[0].to,[{address:'student@example.test'}]);
  assert.match(sent[0].text,/123456/);
  assert.match(sent[1].text,/reset-password#token=opaque-token/);
  assert.equal(JSON.stringify(sent).includes('test-secret'),false);
  assert.equal(createMailService({provider:'smtp',smtp:null,apiKey:'present',from:'sender@example.test',baseUrl:'https://study.example.test'}).configured,false);
});

test('SMTP rejection and authentication failures return only a generic error', async () => {
  for (const sendMail of [async()=>{throw new Error('private auth reply test-secret');},async()=>({accepted:[],rejected:['student@example.test']})]) {
    const mailer = createMailService({provider:'smtp',smtp:{},from:'sender@example.test',baseUrl:'https://study.example.test',createTransport:()=>({sendMail})});
    await assert.rejects(mailer.sendRegistrationCode('student@example.test','123456','request'), error=>{
      assert.equal(error.code,'MAIL_UNAVAILABLE');
      assert.equal(error.message.includes('test-secret'),false);
      return true;
    });
  }
});

test('email links are private, expiring, single-use and reset revokes existing sessions', async(t) => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(),'study-email-'));
  process.env.STUDY_DATABASE_PATH = path.join(folder,'test.db');
  process.env.STUDY_SEED_DEMO = '0';
  const database = require('../src/config/database');
  await database.initializeDatabase();
  const sql = (query,args=[]) => new Promise((resolve,reject)=>database.db.run(query,args,e=>e?reject(e):resolve()));
  const get = (query,args=[]) => new Promise((resolve,reject)=>database.db.get(query,args,(e,row)=>e?reject(e):resolve(row)));
  const oldPassword = 'initial-password-123';
  await database.registerStudent('Test','mail@test.invalid',await bcrypt.hash(oldPassword,4));
  const sent = [];
  const mailer = { configured:true, sendLink:async(...args)=>sent.push(args) };
  const server = createApp({database,mailer}).listen(0,'127.0.0.1');
  await new Promise(resolve=>server.once('listening',resolve));
  t.after(async()=>{ server.closeAllConnections(); await new Promise(resolve=>server.close(resolve)); await new Promise(resolve=>database.db.close(resolve)); fs.rmSync(folder,{recursive:true,force:true}); });
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const request = (url,data,cookie) => fetch(base+url,{method:data?'POST':'GET',headers:{'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},...(data?{body:JSON.stringify(data)}:{})});
  const login = await request('/auth/login',{email:'mail@test.invalid',password:oldPassword});
  assert.equal(login.status,200);
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const body = {email:'mail@test.invalid',purpose:'reset',clientId:randomUUID()};
  const response = await request('/auth/email/request',body);
  assert.equal(response.status,202);
  const generic = await response.json();
  assert.deepEqual(await (await request('/auth/email/request',{...body,email:'unknown@test.invalid',clientId:randomUUID()})).json(),generic);
  await request('/auth/email/request',body);
  assert.equal(sent.length,1);
  const token = sent[0][2];
  assert.equal((await get('SELECT token_hash FROM email_tokens')).token_hash.includes(token),false);
  assert.equal((await request('/auth/email/consume',{token,purpose:'verify'})).status,400);
  assert.equal((await request('/auth/email/consume',{token,purpose:'reset',password:'short'})).status,400);
  const reset = {token,purpose:'reset',password:'replacement-password-456'};
  const outcomes = await Promise.all([request('/auth/email/consume',reset),request('/auth/email/consume',reset)]);
  assert.deepEqual(outcomes.map(x=>x.status).sort(),[200,400]);
  assert.equal((await request('/auth/me',undefined,cookie)).status,401);
  assert.equal((await request('/auth/login',{email:body.email,password:oldPassword})).status,401);
  assert.equal((await request('/auth/login',{email:body.email,password:reset.password})).status,200);
  await request('/auth/email/request',{...body,purpose:'verify',clientId:randomUUID()});
  const verify = sent.at(-1)[2];
  assert.equal((await request('/auth/email/consume',{token:verify,purpose:'verify'})).status,200);
  assert.ok(await get('SELECT * FROM verified_emails'));
  await request('/auth/email/request',{...body,clientId:randomUUID()});
  const expired = sent.at(-1)[2];
  await sql('UPDATE email_tokens SET expires_at=0 WHERE used_at IS NULL');
  assert.equal((await request('/auth/email/consume',{...reset,token:expired})).status,400);
  const count = sent.length;
  await request('/auth/email/request',{...body,clientId:randomUUID()});
  assert.equal(sent.length,count,'persistent per-account throttle suppresses excess mail');
  await database.registerStudent('Failure','failure@test.invalid',await bcrypt.hash(oldPassword,4));
  mailer.sendLink = async()=>{throw new Error('provider unavailable');};
  assert.deepEqual(await (await request('/auth/email/request',{...body,email:'failure@test.invalid',clientId:randomUUID()})).json(),generic);
  const failedUser = await database.getUserByEmail('failure@test.invalid');
  assert.ok(await bcrypt.compare(oldPassword,failedUser.password_hash));
  assert.equal((await get('SELECT expires_at FROM email_tokens WHERE user_id=?',[failedUser.id])).expires_at,0);
  assert.equal(await get('SELECT * FROM verified_emails WHERE user_id=?',[failedUser.id]),undefined);
  mailer.configured = false;
  assert.equal((await request('/auth/email/request',{...body,clientId:randomUUID()})).status,503);
});

test('mail adapter uses one-time fragment links and provider idempotency without leaking provider errors', async()=>{
  let call;
  const mailer = createMailService({apiKey:'test-key',from:'Study <study@example.com>',baseUrl:'https://study.example.com',fetchImpl:async(...args)=>{call=args;return {ok:true};}});
  await mailer.sendLink('student@test.invalid','reset','opaque-token','request-id');
  const options = call[1];
  assert.equal(options.headers['Idempotency-Key'],'email-request-id');
  assert.match(JSON.parse(options.body).text,/reset-password#token=opaque-token/);
  assert.equal(createMailService({apiKey:'',from:'',baseUrl:''}).configured,false);
});
