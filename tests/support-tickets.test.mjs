import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {create,act} from 'react-test-renderer';
import {loadSource,deferred} from './helpers.mjs';
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const categories=['account','upload','quiz','review','other'];
const statuses=['Open','In progress','Resolved'];
const initial={id:'ASK-demo',name:'Test Student',title:'Upload issue',description:'The file did not upload.',category:'upload',status:'Open',version:1,createdAt:'2026-09-22T00:00:00Z',updatedAt:'2026-09-22T00:00:00Z',resolvedAt:null,replies:[]};
const text=node=>JSON.stringify(node.toJSON());

test('older support pages append without duplicates, survive refresh and retry after a failed page request', async () => {
  let renderer; let fail = true; const cursors = [];
  const first = { ...initial, hasMessages: true }; const older = { ...initial, id: 'ASK-old', title: 'Older unresolved issue', updatedAt: '2026-09-01T00:00:00Z', hasMessages: true };
  const { default: Inbox } = await loadSource("export {default} from './src/components/SupportTickets.jsx'", {
    '../state/AppDataContext': { useAppData: () => ({ currentUser: { id: 1, role: 'Student' } }) },
    '../state/LanguageContext': { useLanguage: () => ({ language: 'en' }) },
    '../services/ticketApiService': { ticketCategories: categories, ticketStatuses: statuses, listServerTickets: async (_signal, cursor) => {
      cursors.push(cursor || null);
      if (cursor && fail) throw new Error('Older page unavailable');
      return cursor ? { tickets: [first, older], hasMore: false, nextCursor: null } : { tickets: [first], hasMore: true, nextCursor: 'next-page' };
    } },
  });
  try {
    await act(async () => { renderer = create(React.createElement(Inbox)); });
    const rows = () => renderer.root.findAll(node => node.type === 'button' && String(node.props.className).startsWith('support-ticket-row'));
    await act(async () => renderer.root.findByProps({ className: 'support-load-older' }).props.onClick());
    assert.equal(rows().length, 1); assert.match(text(renderer), /Older page unavailable/);
    fail = false;
    await act(async () => renderer.root.findByProps({ className: 'support-load-older' }).props.onClick());
    assert.equal(rows().length, 2); assert.equal(renderer.root.findAllByProps({ className: 'support-load-older' }).length, 0);
    await act(async () => renderer.root.findAllByType('button').find(button => button.children.includes('Refresh')).props.onClick());
    assert.equal(rows().length, 2, 'Refreshing recent conversations preserves older loaded records');
    assert.deepEqual(cursors, [null, 'next-page', 'next-page', null]);
  } finally { if (renderer) await act(async () => renderer.unmount()); }
});

test('email reset retains its link in StrictMode, removes it from URL and waits for explicit matching-password submission',async()=>{
  const previousWindow=globalThis.window, previousForm=globalThis.FormData;
  let renderer; const calls=[]; const pending=deferred(); const token='a'.repeat(64);
  globalThis.window={location:{hash:`#token=${token}`,pathname:'/reset-password'},history:{replaceState(){globalThis.window.location.hash='';}}};
  globalThis.FormData=class {constructor(values){this.values=values;}get(key){return this.values[key];}};
  const {default:EmailPage}=await loadSource("export {default} from './src/pages/EmailAccessPage.jsx'",{
    '../state/LanguageContext':{useLanguage:()=>({language:'en'})},
    '../hooks/useBodyClass':()=>{},
    '../services/apiClient':{apiRequest:async(path,options)=>{calls.push({path,...options});return pending.promise;}},
    'react-router-dom':{Link:({to,children})=>React.createElement('a',{href:to},children)},
  });
  try {
    await act(async()=>{renderer=create(React.createElement(React.StrictMode,null,React.createElement(EmailPage)));});
    assert.equal(calls.length,0);assert.equal(globalThis.window.location.hash,'');
    const submit=values=>renderer.root.findByType('form').props.onSubmit({preventDefault(){},currentTarget:values});
    await act(async()=>{await submit({password:'long-password-123',confirm:'different'});});
    assert.equal(calls.length,0);assert.match(text(renderer),/Passwords do not match/);
    await act(async()=>{submit({password:'long-password-123',confirm:'long-password-123'});submit({password:'long-password-123',confirm:'long-password-123'});});
    assert.equal(calls.length,1);assert.equal(calls[0].body.token,token);
    await act(async()=>pending.resolve({message:'Password updated.'}));
    assert.match(text(renderer),/Password updated/);
  } finally {if(renderer)await act(async()=>renderer.unmount());globalThis.window=previousWindow;globalThis.FormData=previousForm;}
});

test('admin inbox hides empty sessions and can focus on students awaiting staff',async()=>{
  let renderer;
  const tickets=[{...initial,hasMessages:true,needsReply:true},{...initial,id:'SESSION-empty',title:'Empty session',hasMessages:false,needsReply:false}];
  const {default:Inbox}=await loadSource("export {default} from './src/components/SupportTickets.jsx'",{
    '../state/AppDataContext':{useAppData:()=>({currentUser:{id:2,role:'Admin'}})},
    '../state/LanguageContext':{useLanguage:()=>({language:'en'})},
    '../services/ticketApiService':{ticketCategories:categories,ticketStatuses:statuses,listServerTickets:async()=>({tickets,hasMore:false})},
  });
  try {
    await act(async()=>{renderer=create(React.createElement(Inbox));});
    const rows=()=>renderer.root.findAll(n=>n.type==='button' && String(n.props.className).startsWith('support-ticket-row'));
    assert.equal(rows().length,1);
    await act(async()=>renderer.root.findAllByProps({type:'checkbox'})[0].props.onChange({target:{checked:false}}));
    assert.equal(rows().length,2);
    await act(async()=>renderer.root.findAllByProps({type:'checkbox'})[1].props.onChange({target:{checked:true}}));
    assert.equal(rows().length,1);assert.match(text(renderer),/Awaiting reply/);
  } finally {if(renderer)await act(async()=>renderer.unmount());}
});

test('recovery form requires consent, locks submissions, retries idempotently and never claims a password reset',async()=>{
  let renderer;let pending=deferred();const calls=[];
  const {default:Recovery}=await loadSource("export {default} from './src/pages/ForgotPasswordPage.jsx'",{
    '../hooks/useBodyClass':()=>{},
    '../state/LanguageContext':{useLanguage:()=>({language:'en'})},
    '../services/apiClient':{apiRequest:async(path,options)=>{calls.push({path,...options});return pending.promise;}},
    'react-router-dom':{Link:({to,children,...props})=>React.createElement('a',{href:to,...props},children)},
  });
  try {
    await act(async()=>{renderer=create(React.createElement(Recovery));});
    assert.equal(renderer.root.findByProps({className:'recovery-submit'}).props.disabled,true);
    await act(async()=>{
      renderer.root.findByProps({id:'recovery-name'}).props.onChange({target:{value:'Alex Chen'}});
      renderer.root.findByProps({id:'recovery-email'}).props.onChange({target:{value:'student@example.com'}});
      renderer.root.findByProps({type:'checkbox'}).props.onChange({target:{checked:true}});
    });
    const submit=()=>renderer.root.findByType('form').props.onSubmit({preventDefault(){}});
    await act(async()=>{submit();submit();});
    assert.equal(calls.length,1);assert.equal(calls[0].path,'/auth/recovery-request');
    assert.equal(calls[0].body.accountName,'Alex Chen');assert.equal(calls[0].body.email,'student@example.com');
    await act(async()=>{pending.reject(Error('network'));});
    assert.match(text(renderer),/Could not confirm submission/);
    pending=deferred();await act(async()=>{submit();});
    assert.equal(calls[0].body.clientId,calls[1].body.clientId);
    await act(async()=>{pending.resolve({ok:true});});
    assert.match(text(renderer),/Recovery request received/);assert.match(text(renderer),/No password has been changed/);
    assert.equal(renderer.root.findAllByType('form').length,0);
  } finally {if(renderer)await act(async()=>renderer.unmount());}
});

test('recovery review labels email unverified and notes internal rather than sent to the applicant',async()=>{
  let renderer;
  const {default:Conversation}=await loadSource("export {default} from './src/components/SupportConversation.jsx'",{});
  try {
    await act(async()=>{renderer=create(React.createElement(Conversation,{ticket:{...initial,isRecoveryRequest:true,contactEmail:'student@example.com'},admin:true,zh:true,reply:'',setReply(){},onSend(){}}));});
    assert.match(text(renderer),/身份未验证/);assert.match(text(renderer),/student@example.com/);
    assert.match(text(renderer),/不会发送给申请人/);assert.match(text(renderer),/保存内部备注/);
    assert.doesNotMatch(text(renderer),/发送消息/);
  } finally {if(renderer)await act(async()=>renderer.unmount());}
});
test('administrator navigation is ticket-only',async()=>{
  let renderer;
  const {default:Sidebar}=await loadSource("export {default} from './src/components/AdminSidebar.jsx'",{
    '../state/AppDataContext':{useAppData:()=>({logout(){}})},
    '../state/LanguageContext':{useLanguage:()=>({language:'en'})},
    'react-router-dom':{useNavigate:()=>()=>{},NavLink:({to,children})=>React.createElement('a',{href:to},children)},
  });
  try {
    await act(async()=>{renderer=create(React.createElement(Sidebar));});
    assert.deepEqual(renderer.root.findAllByType('a').map(a=>a.props.href),['/admin/support']);
    assert.doesNotMatch(text(renderer),/Dashboard|Materials|Login Access/);
    assert.match(text(renderer),/Logout/);
  } finally {if(renderer)await act(async()=>renderer.unmount());}
});
test('admin inbox uses server state, reports failed updates and renders Chinese status labels',async()=>{
  let ticket=structuredClone(initial),fail=false,renderer;
  const updates=[];
  const {default:Inbox}=await loadSource("export {default} from './src/components/SupportTickets.jsx'",{
    '../state/AppDataContext':{useAppData:()=>({currentUser:{id:2,role:'Admin'}})},
    '../state/LanguageContext':{useLanguage:()=>({language:'zh'})},
    '../services/ticketApiService':{ticketCategories:categories,ticketStatuses:statuses,listServerTickets:async()=>({tickets:[ticket],hasMore:false}),getServerTicket:async()=>({ticket}),updateServerTicket:async(id,status,version)=>{updates.push({id,status,version});if(fail)throw Error('Offline');ticket={...ticket,status,version:version+1};return {ticket};},replyServerTicket:async()=>({ticket})},
  });
  try {
    await act(async()=>{renderer=create(React.createElement(Inbox));});
    assert.match(text(renderer),/问题工单/);assert.match(text(renderer),/待处理/);
    await act(async()=>renderer.root.findByProps({className:'support-ticket-row '}).props.onClick());
    const editor=()=>renderer.root.findByProps({className:'support-status-editor'});
    await act(async()=>editor().findByType('select').props.onChange({target:{value:'Resolved'}}));
    await act(async()=>editor().props.onSubmit({preventDefault(){}}));
    assert.deepEqual(updates[0],{id:initial.id,status:'Resolved',version:1});assert.match(text(renderer),/已解决/);
    fail=true;
    await act(async()=>editor().findByType('select').props.onChange({target:{value:'Open'}}));
    await act(async()=>editor().props.onSubmit({preventDefault(){}}));
    assert.match(text(renderer),/Offline/);assert.equal(ticket.status,'Resolved');
  } finally {if(renderer)await act(async()=>renderer.unmount());}
});
test('Ask Me saves on send without submission, locks pending requests and reuses retry ID',async()=>{
  let renderer;const calls=[];let attempt=deferred();
  const {default:Help}=await loadSource("export {default} from './src/components/HelpAssistant.jsx'",{
    '../state/AppDataContext':{useAppData:()=>({currentUser:{id:1,role:'Student'}})},
    '../state/LanguageContext':{useLanguage:()=>({language:'en',toggleLanguage(){}})},
    './SupportTickets':{default:()=>null},
    '../services/ticketApiService':{getLoginConversation:async()=>({ticket:initial}),sendLoginMessage:async(id,text,language,clientId)=>{calls.push({id,text,language,clientId});return attempt.promise;}},
  });
  const button=label=>renderer.root.findAllByType('button').find(b=>b.children.includes(label));
  try {
    await act(async()=>{renderer=create(React.createElement(Help));});
    await act(async()=>renderer.root.findByProps({className:'help-assistant-launcher'}).props.onClick());
    assert.equal(calls.length,0);assert.match(text(renderer),/visible to support administrators/);assert.match(text(renderer),/Google Gemini/);
    assert.doesNotMatch(text(renderer),/Confirm submission|Not solved/);
    await act(async()=>{button('Upload help').props.onClick();});
    assert.equal(calls.length,1);assert.equal(button('Sending…').props.disabled,true);
    await act(async()=>{button('Upload help').props.onClick();});
    assert.equal(calls.length,1);
    await act(async()=>{attempt.reject(Error('Network unavailable'));});
    assert.match(text(renderer),/Network unavailable/);assert.doesNotMatch(text(renderer),/Submitted to support/);
    attempt=deferred();
    await act(async()=>{button('Upload help').props.onClick();});
    assert.equal(calls[0].clientId,calls[1].clientId);
    await act(async()=>{attempt.resolve({ticket:{...initial,replies:[{id:'msg',kind:'reply',role:'Student',text:'Upload help',createdAt:initial.createdAt},{id:'ai',kind:'reply',role:'AI',text:'Select a course first.',createdAt:initial.createdAt}]}});});
    assert.match(text(renderer),/Select a course first/);
    assert.match(text(renderer),/Gemini · AI reply/);
    assert.match(text(renderer),/Saved automatically when sent/);
  } finally {if(renderer)await act(async()=>renderer.unmount());}
});
test('Gemini failure leaves a saved message and offers an idempotent AI retry',async()=>{
  let renderer;const calls=[];
  const {default:Help}=await loadSource("export {default} from './src/components/HelpAssistant.jsx'",{
    '../state/AppDataContext':{useAppData:()=>({currentUser:{id:1,role:'Student'}})},
    '../state/LanguageContext':{useLanguage:()=>({language:'en',toggleLanguage(){}})},
    './SupportTickets':{default:()=>null},
    '../services/ticketApiService':{getLoginConversation:async()=>({ticket:initial}),sendLoginMessage:async(id,message,language,clientId)=>{
      calls.push(clientId);
      const ticket={...initial,replies:[{id:'msg',kind:'reply',role:'Student',text:message,createdAt:initial.createdAt}]};
      return calls.length===1 ? {ticket,aiError:{message:'AI is not configured yet.'}} : {ticket:{...ticket,replies:[...ticket.replies,{id:'ai',kind:'reply',role:'AI',text:'Open Upload.',createdAt:initial.createdAt}]}};
    }},
  });
  const button=label=>renderer.root.findAllByType('button').find(b=>b.children.includes(label));
  try {
    await act(async()=>{renderer=create(React.createElement(Help));});
    await act(async()=>renderer.root.findByProps({className:'help-assistant-launcher'}).props.onClick());
    await act(async()=>button('Upload help').props.onClick());
    assert.match(text(renderer),/Your message is saved, but Gemini could not reply/);
    assert.doesNotMatch(text(renderer),/Gemini · AI reply/);
    await act(async()=>button('Retry AI reply').props.onClick());
    assert.equal(calls[0],calls[1]);assert.match(text(renderer),/Gemini · AI reply/);
    assert.doesNotMatch(text(renderer),/Retry AI reply/);
  } finally {if(renderer)await act(async()=>renderer.unmount());}
});

test('conversation separates shared FAQ history, support messages and status events',async()=>{
  let renderer;
  const {default:Conversation}=await loadSource("export {default} from './src/components/SupportConversation.jsx'");
  const ticket={...initial,description:'You: Upload failed\nHelp: Please select a course.',replies:[
    {id:'a',kind:'reply',name:'Student',role:'Student',text:'I tried again.',createdAt:initial.createdAt},
    {id:'b',kind:'reply',name:'Admin',role:'Admin',text:'Please try a smaller file.',createdAt:initial.createdAt},
    {id:'c',kind:'status',name:'Admin',role:'Admin',text:'In progress',createdAt:initial.createdAt},
  ]};
  try {
    await act(async()=>{renderer=create(React.createElement(Conversation,{ticket,admin:true,zh:false,reply:'',setReply(){},onSend(){},busy:false}));});
    assert.equal(renderer.root.findAllByProps({className:'support-bubble incoming'}).length,1);
    assert.equal(renderer.root.findAllByProps({className:'support-bubble outgoing'}).length,1);
    assert.match(text(renderer),/I tried again/);assert.doesNotMatch(text(renderer),/Help: Please select/);
    await act(async()=>renderer.root.findByProps({id:'support-tab-ASK-demo-history'}).props.onClick());
    assert.match(text(renderer),/Help: Please select/);assert.match(text(renderer),/Other private chats are not included/);
    await act(async()=>renderer.root.findByProps({id:'support-tab-ASK-demo-activity'}).props.onClick());
    assert.match(text(renderer),/In progress/);assert.doesNotMatch(text(renderer),/Please try a smaller/);
  } finally {if(renderer)await act(async()=>renderer.unmount());}
});
test('open conversation polls without clearing a draft and stops polling after unmount',async()=>{
  let renderer,tick,stopped=false;
  let ticket=structuredClone(initial);
  const {default:Inbox}=await loadSource("export {default} from './src/components/SupportTickets.jsx'",{
    '../state/AppDataContext':{useAppData:()=>({currentUser:{id:1,role:'Student'}})},
    '../state/LanguageContext':{useLanguage:()=>({language:'en'})},
    '../services/ticketApiService':{ticketCategories:categories,ticketStatuses:statuses,listServerTickets:async()=>({tickets:[ticket],hasMore:false}),getServerTicket:async()=>({ticket})},
  },{setInterval:(fn,delay)=>{assert.equal(delay,8000);tick=fn;return 123;},clearInterval:id=>{assert.equal(id,123);stopped=true;},document:{hidden:false}});
  try {
    await act(async()=>{renderer=create(React.createElement(Inbox));});
    await act(async()=>renderer.root.findByProps({className:'support-ticket-row '}).props.onClick());
    await act(async()=>renderer.root.findByType('textarea').props.onChange({target:{value:'My unsent reply'}}));
    ticket={...ticket,version:2,replies:[{id:'new',kind:'reply',role:'Admin',name:'Support',text:'Could you tell us which file type?',createdAt:initial.createdAt}]};
    await act(async()=>tick());
    assert.match(text(renderer),/Could you tell us/);assert.equal(renderer.root.findByType('textarea').props.value,'My unsent reply');
  } finally {if(renderer)await act(async()=>renderer.unmount());}
  assert.equal(stopped,true);
});
