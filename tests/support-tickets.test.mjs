import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {create,act} from 'react-test-renderer';
import {loadSource,deferred,memoryWindow} from './helpers.mjs';
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const categories=['account','upload','quiz','review','other'];
const statuses=['Open','In progress','Resolved'];
const initial={id:'ASK-demo',name:'Test Student',title:'Upload issue',description:'The file did not upload.',category:'upload',status:'Open',version:1,createdAt:'2026-09-22T00:00:00Z',updatedAt:'2026-09-22T00:00:00Z',resolvedAt:null,replies:[]};
const text=node=>JSON.stringify(node.toJSON());

test('Ask Me collapses secondary guidance while preserving privacy, draft and a separate composer', async () => {
  let renderer, reads = 0, sends = 0;
  const { default: Help } = await loadSource("export {default} from './src/components/HelpAssistant.jsx'", {
    '../state/AppDataContext': { useAppData: () => ({ currentUser: { id: 1, role: 'Student' } }) },
    '../state/LanguageContext': { useLanguage: () => ({ language: 'en' }) },
    './SupportTickets': () => null,
    '../services/ticketApiService': { getLoginConversation: async () => { reads++; return { ticket: initial }; }, sendLoginMessage: async () => { sends++; return { ticket: initial }; } },
  }, { window: memoryWindow() });
  try {
    await act(async () => { renderer = create(React.createElement(Help)); });
    await act(async () => renderer.root.findByProps({ className: 'help-assistant-launcher' }).props.onClick());
    const details = () => renderer.root.findAllByType('details');
    assert.equal(details().length, 2); assert.ok(details().every(node => node.props.open === false));
    assert.match(renderer.root.findByProps({ className: 'help-session-brief' }).children.join(''), /Gemini and support staff.*saved.*Never share/);
    assert.match(text(renderer), /Private study chats and files are not included/);
    const content = renderer.root.findByProps({ className: 'help-assistant-content' });
    const composer = renderer.root.findByProps({ className: 'help-assistant-composer' });
    assert.equal(content.findAllByType('form').length, 0, 'The composer must stay outside the scrolling and collapsible content');
    assert.equal(composer.findAllByType('form').length, 1);
    await act(async () => composer.findByType('input').props.onChange({ target: { value: 'Keep this question while reading help' } }));
    for (const name of ['help-privacy-details', 'help-quick-details']) {
      await act(async () => renderer.root.findByProps({ className: name }).props.onToggle({ currentTarget: { open: true } }));
      assert.equal(renderer.root.findByProps({ className: name }).props.open, true);
      await act(async () => renderer.root.findByProps({ className: name }).props.onToggle({ currentTarget: { open: false } }));
    }
    assert.equal(composer.findByType('input').props.value, 'Keep this question while reading help');
    assert.equal(reads, 1); assert.equal(sends, 0, 'Opening guidance must not create a message or another conversation');
  } finally { if (renderer) await act(async () => renderer.unmount()); }
});

test('Ask Me follows the visible keyboard viewport without remounting its composer and removes listeners on close', async () => {
  let renderer, focused = 0;
  const browser = memoryWindow(), listeners = new Map();
  browser.innerHeight = 800;
  browser.visualViewport = { height: 800, offsetTop: 0,
    addEventListener(name, handler) { listeners.set(name, handler); },
    removeEventListener(name, handler) { if (listeners.get(name) === handler) listeners.delete(name); },
  };
  const { default: Help } = await loadSource("export {default} from './src/components/HelpAssistant.jsx'", {
    '../state/AppDataContext': { useAppData: () => ({ currentUser: { id: 1, role: 'Student' } }) },
    '../state/LanguageContext': { useLanguage: () => ({ language: 'en' }) },
    './SupportTickets': () => null,
    '../services/ticketApiService': { getLoginConversation: async () => ({ ticket: initial }) },
  }, { window: browser });
  const field = () => renderer.root.findByProps({ 'aria-label': 'Describe your problem without credentials' });
  try {
    await act(async () => { renderer = create(React.createElement(Help), { createNodeMock: node => node.props['aria-label'] === 'Close help' ? { focus() { focused++; } } : null }); });
    await act(async () => renderer.root.findByProps({ className: 'help-assistant-launcher' }).props.onClick());
    await act(async () => field().props.onChange({ target: { value: 'A draft above the keyboard' } }));
    const originalField = field();
    browser.visualViewport.height = 320; browser.visualViewport.offsetTop = 20;
    await act(async () => listeners.get('resize')());
    const aside = renderer.root.findByType('aside');
    assert.equal(aside.props.style['--help-viewport-height'], '320px');
    assert.equal(aside.props.style['--help-keyboard-inset'], '460px');
    assert.equal(aside.props['data-short-viewport'], true);
    assert.equal(field(), originalField); assert.equal(field().props.value, 'A draft above the keyboard');
    assert.equal(focused, 1, 'A viewport resize must not steal keyboard focus');
    browser.visualViewport.offsetTop = 80;
    await act(async () => listeners.get('scroll')());
    assert.equal(renderer.root.findByType('aside').props.style['--help-keyboard-inset'], '400px');
    await act(async () => renderer.root.findByProps({ 'aria-label': 'Close help' }).props.onClick());
    assert.equal(listeners.size, 0); assert.equal(renderer.root.findByType('aside').props.style, undefined);
  } finally { if (renderer) await act(async () => renderer.unmount()); }
});

test('ticket dates show explicit language prompts and validate calendar dates and ranges before filtering', async () => {
  let renderer, language = 'en'; const calls = []; let pickerOpens = 0;
  const { default: Inbox } = await loadSource("export {default} from './src/components/SupportTickets.jsx'", {
    '../state/AppDataContext': { useAppData: () => ({ currentUser: { id: 1, role: 'Student' } }) },
    '../state/LanguageContext': { useLanguage: () => ({ language }) },
    '../services/ticketApiService': { ticketCategories: categories, ticketStatuses: statuses, listServerTickets: async (_signal, _cursor, filters) => { calls.push(filters); return { tickets: [], hasMore: false }; } },
  });
  const field = label => renderer.root.findByProps({ 'aria-label': label });
  const type = async (label, value) => act(async () => field(label).props.onChange({ target: { value } }));
  try {
    await act(async () => { renderer = create(React.createElement(Inbox), { createNodeMock: node => node.props.type === 'date' ? { showPicker() { pickerOpens++; } } : null }); });
    assert.equal(field('Created from (UTC)').props.type, 'text');
    assert.equal(field('Created from (UTC)').props.placeholder, 'YYYY-MM-DD');
    await type('Created from (UTC)', '2028-02-29');
    assert.equal(calls.at(-1).from, '2028-02-29');
    const count = calls.length;
    for (const invalid of ['2026-02-29', '2028-02-30', '0000-01-01', '2028-0']) {
      await type('Created from (UTC)', invalid);
      assert.equal(field('Created from (UTC)').props['aria-invalid'], true);
      assert.equal(calls.length, count, 'Invalid and partial dates must not change server filters');
    }
    await type('Created from (UTC)', '2028-02-29');
    await type('Created through (UTC)', '2028-02-28');
    assert.equal(calls.length, count, 'Reversed ranges must not reach the API');
    assert.match(text(renderer), /Filters stay unchanged until both dates are valid/);
    await type('Created through (UTC)', '2028-03-01');
    assert.equal(calls.at(-1).to, '2028-03-01');
    const nativeDates = renderer.root.findAllByProps({ type: 'date' });
    assert.equal(nativeDates[0].props.max, '2028-03-01');
    assert.equal(nativeDates[1].props.min, '2028-02-29');
    await act(async () => field('Choose date: Created from (UTC)').props.onClick());
    assert.equal(pickerOpens, 1);
    await act(async () => nativeDates[0].props.onChange({ target: { value: '2028-02-27' } }));
    assert.equal(field('Created from (UTC)').props.value, '2028-02-27');
    assert.equal(calls.at(-1).from, '2028-02-27');
    await type('Created from (UTC)', '');
    assert.equal(calls.at(-1).from, '');
    assert.equal(renderer.root.findAllByProps({ type: 'date' })[1].props.min, undefined);
    language = 'zh'; await act(async () => renderer.update(React.createElement(Inbox)));
    assert.equal(field('创建日期从（UTC）').props.placeholder, '年-月-日');
    assert.equal(field('创建日期至（UTC）').props.value, '2028-03-01');
  } finally { if (renderer) await act(async () => renderer.unmount()); }
});

test('ticket calendar fallback focuses the editable ISO field and explains manual entry', async () => {
  let renderer, focusCount = 0;
  const { default: Inbox } = await loadSource("export {default} from './src/components/SupportTickets.jsx'", {
    '../state/AppDataContext': { useAppData: () => ({ currentUser: { id: 1, role: 'Student' } }) },
    '../state/LanguageContext': { useLanguage: () => ({ language: 'en' }) },
    '../services/ticketApiService': { ticketCategories: categories, ticketStatuses: statuses, listServerTickets: async () => ({ tickets: [], hasMore: false }) },
  });
  try {
    await act(async () => { renderer = create(React.createElement(Inbox), { createNodeMock: node => node.props.type === 'text' ? { focus() { focusCount++; } } : {} }); });
    const calendar = renderer.root.findByProps({ 'aria-label': 'Choose date: Created from (UTC)' });
    assert.equal(calendar.props.type, 'button');
    await act(async () => calendar.props.onClick());
    assert.equal(focusCount, 1);
    assert.match(text(renderer), /Calendar unavailable. Type a date above/);
  } finally { if (renderer) await act(async () => renderer.unmount()); }
});

test('Ask Me resizing preserves draft and focus, Escape closes, and another account starts clean', async () => {
  let renderer, user = { id: 1, role: 'Student' }, fetches = 0, closeFocus = 0, launcherFocus = 0;
  const browser = memoryWindow();
  const { default: Help } = await loadSource("export {default} from './src/components/HelpAssistant.jsx'", {
    '../state/AppDataContext': { useAppData: () => ({ currentUser: user }) },
    '../state/LanguageContext': { useLanguage: () => ({ language: 'en' }) },
    './SupportTickets': { default: () => null },
    '../services/ticketApiService': { getLoginConversation: async () => { fetches++; return { ticket: { ...initial, id: `ASK-${user.id}` } }; } },
  }, { window: browser });
  const launcher = () => renderer.root.findByProps({ className: 'help-assistant-launcher' });
  const draft = () => renderer.root.findByProps({ 'aria-label': 'Describe your problem without credentials' });
  try {
    await act(async () => { renderer = create(React.createElement(Help), { createNodeMock: node => node.props['aria-label'] === 'Close help' ? { focus() { closeFocus++; } } : node.props.className === 'help-assistant-launcher' ? { focus() { launcherFocus++; } } : null }); });
    await act(async () => launcher().props.onClick());
    await act(async () => draft().props.onChange({ target: { value: 'Keep my unsent question' } }));
    for (const size of ['compact', 'large', 'standard']) {
      await act(async () => renderer.root.findByProps({ id: 'help-chat-size' }).props.onChange({ target: { value: size } }));
      assert.equal(draft().props.value, 'Keep my unsent question');
    }
    assert.equal(fetches, 1, 'A size change must not recreate or refetch the conversation');
    assert.equal(closeFocus, 1, 'Changing size must not move focus to the close button');
    await act(async () => renderer.root.findByProps({ role: 'dialog' }).props.onKeyDown({ key: 'Escape', target: { tagName: 'SELECT' } }));
    assert.equal(launcher().props['aria-expanded'], true);
    await act(async () => renderer.root.findByProps({ role: 'dialog' }).props.onKeyDown({ key: 'Escape', target: { tagName: 'INPUT' } }));
    assert.equal(launcher().props['aria-expanded'], false); assert.equal(launcherFocus, 1);
    await act(async () => launcher().props.onClick());
    assert.equal(draft().props.value, 'Keep my unsent question');
    user = { id: 2, role: 'Student' }; await act(async () => renderer.update(React.createElement(Help)));
    assert.equal(launcher().props['aria-expanded'], false);
    await act(async () => launcher().props.onClick());
    assert.equal(draft().props.value, '');
  } finally { if (renderer) await act(async () => renderer.unmount()); }
});

test('admin starts in FIFO human queue and status selection exits the queue',async()=>{
  let renderer;const calls=[];
  const late={...initial,id:'ASK-late',humanSupport:'Waiting',humanRequestedAt:'2026-10-28T10:00:00Z'};
  const early={...initial,id:'ASK-early',humanSupport:'Waiting',humanRequestedAt:'2026-10-28T09:00:00Z'};
  const {default:Inbox}=await loadSource("export {default} from './src/components/SupportTickets.jsx'",{
    '../state/AppDataContext':{useAppData:()=>({currentUser:{id:2,role:'Admin'}})},
    '../state/LanguageContext':{useLanguage:()=>({language:'en'})},
    '../services/ticketApiService':{ticketCategories:categories,ticketStatuses:statuses,listServerTickets:async(signal,cursor,filters)=>{calls.push(filters);return{tickets:[late,early],hasMore:false};}},
  });
  try{
    await act(async()=>{renderer=create(React.createElement(Inbox));});
    assert.equal(calls[0].humanOnly,true);assert.equal(calls[0].sort,'requested');
    const rows=renderer.root.findAll(n=>n.type==='button'&&String(n.props.className).startsWith('support-ticket-row'));
    assert.match(rows[0].findByProps({className:'support-id'}).children.join(''),/ASK-early/);
    assert.equal(renderer.root.findByProps({value:'requested'}).props.disabled,true);
    assert.match(text(renderer),/Ticket ID: /);
    await act(async()=>renderer.root.findAllByType('select').find(n=>n.props.value==='All').props.onChange({target:{value:'Resolved'}}));
    assert.equal(calls.at(-1).humanOnly,false);assert.equal(calls.at(-1).status,'Resolved');
    assert.equal(calls.at(-1).sort,'newest');
  }finally{if(renderer)await act(async()=>renderer.unmount());}
});

test('problem form validates, locks duplicate submissions and preserves a retry ID',async()=>{
  let renderer;let pending=deferred();const calls=[],created=[];
  const {default:Form}=await loadSource("export {default} from './src/components/SupportRequestForm.jsx'",{
    '../services/ticketApiService':{ticketCategories:categories,createServerTicket:async body=>{calls.push(body);return pending.promise;}},
  });
  try{
    await act(async()=>{renderer=create(React.createElement(Form,{onCreated:t=>created.push(t),onCancel(){}}));});
    const submit=()=>renderer.root.findByType('form').props.onSubmit({preventDefault(){}});
    await act(async()=>submit());assert.equal(calls.length,0);assert.match(text(renderer),/at least 10/);
    await act(async()=>{
      for(const [name,value] of Object.entries({title:'Upload fails',problem:'My PDF upload fails after choosing a course.',steps:'Choose course then upload',environment:'Chrome desktop'}))
        renderer.root.findByProps({name}).props.onChange({target:{value}});
    });
    await act(async()=>{submit();submit();});assert.equal(calls.length,1);
    assert.equal(renderer.root.findByType('fieldset').props.disabled,true);
    assert.match(calls[0].description,/Choose course then upload/);
    await act(async()=>pending.reject(Error('Offline')));assert.match(text(renderer),/Offline/);
    pending=deferred();await act(async()=>{submit();});
    assert.equal(calls[0].clientId,calls[1].clientId);
    await act(async()=>pending.resolve({ticket:initial}));assert.deepEqual(created,[initial]);
  }finally{if(renderer)await act(async()=>renderer.unmount());}
});

test('email notification failures do not hide the saved reply or imply successful delivery',async()=>{
  let renderer;
  const {default:Conversation}=await loadSource("export {default} from './src/components/SupportConversation.jsx'");
  try{
    await act(async()=>{renderer=create(React.createElement(Conversation,{ticket:{...initial,replies:[{id:'mail-failed',kind:'reply',role:'Admin',name:'Support',text:'Please try uploading again.',createdAt:initial.createdAt,emailState:'failed'}]},admin:false,zh:false,reply:'',setReply(){},onSend(){}}));});
    assert.match(text(renderer),/Please try uploading again/);assert.match(text(renderer),/Email failed; the reply is saved here/);
    assert.doesNotMatch(text(renderer),/Email accepted/);
  }finally{if(renderer)await act(async()=>renderer.unmount());}
});

test('older matching pages append without duplicates, retry safely and refresh resets pagination', async () => {
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
    assert.equal(rows().length, 1, 'Refresh resets to the first matching page so stale filter results are removed');
    assert.deepEqual(cursors, [null, 'next-page', 'next-page', null]);
  } finally { if (renderer) await act(async () => renderer.unmount()); }
});

test('server search includes reply-only hits and sends date and human queue filters',async()=>{
  let renderer;const calls=[];
  const hit={...initial,title:'No matching title',description:'No matching description',humanSupport:'Waiting',hasMessages:true};
  const {default:Inbox}=await loadSource("export {default} from './src/components/SupportTickets.jsx'",{
    '../state/AppDataContext':{useAppData:()=>({currentUser:{id:2,role:'Admin'}})},
    '../state/LanguageContext':{useLanguage:()=>({language:'en'})},
    '../services/ticketApiService':{ticketCategories:categories,ticketStatuses:statuses,listServerTickets:async(signal,cursor,filters)=>{calls.push({cursor,filters});return{tickets:[hit],hasMore:false};}},
  });
  try{
    await act(async()=>{renderer=create(React.createElement(Inbox));});
    await act(async()=>renderer.root.findByProps({type:'search'}).props.onChange({target:{value:'reply-only-word'}}));
    assert.match(text(renderer),/No matching title/,'Client must not remove a server body-text match');
    await act(async()=>{
      renderer.root.findByProps({'aria-label':'Created from (UTC)'}).props.onChange({target:{value:'2026-10-07'}});
      renderer.root.findByProps({'aria-label':'Created through (UTC)'}).props.onChange({target:{value:'2026-10-20'}});
      renderer.root.findByProps({className:'support-human-filter'}).findByType('input').props.onChange({target:{checked:true}});
    });
    assert.equal(calls.at(-1).filters.q,'reply-only-word');assert.equal(calls.at(-1).filters.humanOnly,true);
    assert.equal(calls.at(-1).filters.from,'2026-10-07');assert.equal(calls.at(-1).filters.to,'2026-10-20');
    assert.equal(calls.at(-1).cursor,null);
  }finally{if(renderer)await act(async()=>renderer.unmount());}
});

test('student human request collects a separate issue, retries with same ID and opens its saved history',async()=>{
  let renderer;const calls=[];let fail=true;
  const {default:Help}=await loadSource("export {default} from './src/components/HelpAssistant.jsx'",{
    '../state/AppDataContext':{useAppData:()=>({currentUser:{id:1,role:'Student'}})},
    '../state/LanguageContext':{useLanguage:()=>({language:'en'})},
    './SupportTickets':({initialTicketId})=>React.createElement('p',null,`Opened ${initialTicketId}`),
    '../services/ticketApiService':{
      ticketCategories:categories,
      getLoginConversation:async()=>({ticket:initial}),
      createServerTicket:async(payload)=>{calls.push(payload);if(fail)throw Error('Offline');return{ticket:{...initial,id:'ASK-new-issue',humanSupport:'Waiting'}};},
    },
  });
  try{
    await act(async()=>{renderer=create(React.createElement(Help));});
    await act(async()=>renderer.root.findByProps({className:'help-assistant-launcher'}).props.onClick());
    const requestButton=()=>renderer.root.findAllByType('button').find(b=>b.children.includes('Request human support'));
    await act(async()=>requestButton().props.onClick());
    assert.equal(calls.length,0,'Opening the request form does not create an empty ticket');
    await act(async()=>{
      renderer.root.findByProps({name:'title'}).props.onChange({target:{value:'PDF upload problem'}});
      renderer.root.findByProps({name:'problem'}).props.onChange({target:{value:'My PDF upload stops at the final step.'}});
    });
    const submit=()=>renderer.root.findByType('form').props.onSubmit({preventDefault(){}});
    await act(async()=>submit());
    assert.match(text(renderer),/Offline/);assert.doesNotMatch(text(renderer),/Waiting for human support/);
    fail=false;
    await act(async()=>submit());
    assert.equal(calls[0].clientId,calls[1].clientId);
    assert.match(text(renderer),/Opened ASK-new-issue/);
    assert.equal(calls[0].title,'PDF upload problem');
  }finally{if(renderer)await act(async()=>renderer.unmount());}
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
  const tickets=[{...initial,humanSupport:'Waiting',hasMessages:true,needsReply:true},{...initial,id:'SESSION-empty',title:'Empty session',hasMessages:false,needsReply:false}];
  const {default:Inbox}=await loadSource("export {default} from './src/components/SupportTickets.jsx'",{
    '../state/AppDataContext':{useAppData:()=>({currentUser:{id:2,role:'Admin'}})},
    '../state/LanguageContext':{useLanguage:()=>({language:'en'})},
    '../services/ticketApiService':{ticketCategories:categories,ticketStatuses:statuses,listServerTickets:async()=>({tickets,hasMore:false})},
  });
  try {
    await act(async()=>{renderer=create(React.createElement(Inbox));});
    const rows=()=>renderer.root.findAll(n=>n.type==='button' && String(n.props.className).startsWith('support-ticket-row'));
    assert.equal(rows().length,1);
    await act(async()=>renderer.root.findByProps({className:'support-human-filter'}).findByType('input').props.onChange({target:{checked:false}}));
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
  let ticket={...structuredClone(initial),humanSupport:'Waiting'},fail=false,renderer;
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
