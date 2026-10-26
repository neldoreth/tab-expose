const W = innerWidth, H = innerHeight;
const sites = [["GitHub","https://github.com/mozilla"],["MDN Web Docs","https://developer.mozilla.org/es/"],["El País","https://elpais.com"],["YouTube — Música","https://youtube.com/watch"],["Wikipedia","https://es.wikipedia.org/wiki/Mission_Control"],["about:preferences","about:preferences"],["Hacker News","https://news.ycombinator.com"]];
const N = +(new URLSearchParams(location.search).get("n") || 7);
const tabs = Array.from({length:N},(_,i)=>({id:i+1,index:i,title:sites[i%7][0],url:sites[i%7][1],favIconUrl:"",pinned:i===0,audible:i===3,mutedInfo:{muted:false},discarded:i===4,hidden:false}));
tabs.push({id:99,index:N,title:"Pestañas",url:"x"});
function shot(id, w=W, h=H){const c=document.createElement("canvas");c.width=w;c.height=h;const g=c.getContext("2d");g.fillStyle=`hsl(${id*47%360} 60% 85%)`;g.fillRect(0,0,w,h);g.fillStyle=`hsl(${id*47%360} 50% 40%)`;g.fillRect(0,0,w,h*0.08);g.font=`bold ${h/8}px sans-serif`;g.fillText("Tab "+id,w*0.08,h*0.4);return c.toDataURL("image/jpeg",0.8);}
window.browser = {
  runtime:{getURL:p=>location.origin+"/"+p,sendMessage:async m=>m.type==="init"?{fromTabId:3,hero:shot(3),thumbs:{1:{dataUrl:shot(1,W/2,H/2)}}}:undefined,onMessage:{addListener(){}}},
  tabs:{getCurrent:async()=>({id:99,index:N}),query:async()=>tabs,captureTab:async id=>{if(id===6)throw 0;return shot(id,W/2,H/2)},update:async()=>{},remove:async()=>{},create:async()=>{},onRemoved:{addListener(){}},onUpdated:{addListener(){}}},
};
window.onerror=(m,s,l,c)=>{document.title="ERR "+m+" @"+l+":"+c};
addEventListener("unhandledrejection",e=>{document.title="REJ "+e.reason});
const q = new URLSearchParams(location.search).get("q");
if (q) setTimeout(()=>{const s=document.getElementById("search");s.value=q;s.dispatchEvent(new Event("input"));}, 1200);
const o = new URLSearchParams(location.search).get("open");
if (o) setTimeout(()=>document.querySelector(`[data-id="${o}"]`).click(), 1300);
