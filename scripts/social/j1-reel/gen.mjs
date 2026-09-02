import { readFileSync, writeFileSync } from "node:fs";

const DIR = "/private/tmp/claude-501/-Users-tish-Projects-starligue-fantasy/47887ec3-5ee4-4513-ad7b-f4545bc385dc/scratchpad/reelj1/";
const REPO = "/Users/tish/Projects/starligue-fantasy/";

const d = JSON.parse(readFileSync(DIR + "data.json", "utf-8"));
const b64 = (p) => "data:image/png;base64," + readFileSync(p).toString("base64");

const clubLogo = (sn) => b64(REPO + "public/clubs/" + sn.toLowerCase() + ".png");
const playerImg = (sn) => b64(DIR + "players/" + sn + ".png");
const tvLogo = (name) => b64(REPO + "public/broadcasters/" + (name === "beIN Sport" ? "bein-sport" : "handball-tv") + ".png");

const dayShort = (day) => day.replace("Vendredi", "VEN").replace("Samedi", "SAM").replace("Dimanche", "DIM").replace(" sept.", " SEPT");

// ---- match cards markup ----
const cards = d.fixtures.map((f, i) => {
  const H = d.club[f.home], A = d.club[f.away];
  const ph = d.picks[f.home], pa = d.picks[f.away];
  return `<div class="mc" id="M${i}">
    <div class="mc-bg" style="background:linear-gradient(104deg, ${H.color} 0%, ${H.color} 42%, ${A.color} 58%, ${A.color} 100%)"></div>
    <div class="mc-seam"></div>
    <div class="mc-dark"></div>
    <img class="mc-pl ph" id="M${i}ph" src="${playerImg(f.home)}"/>
    <img class="mc-pl pa" id="M${i}pa" src="${playerImg(f.away)}"/>
    <div class="mc-top">
      <span class="mc-no">MATCH ${i + 1}<b> / 8</b></span>
      <span class="mc-day">${dayShort(f.day)} · ${f.time}</span>
    </div>
    <div class="mc-crests">
      <span class="mc-tile"><img src="${clubLogo(f.home)}"/></span>
      <span class="mc-vs">VS</span>
      <span class="mc-tile"><img src="${clubLogo(f.away)}"/></span>
    </div>
    <div class="mc-names"><span>${H.ville}</span><span>${A.ville}</span></div>
    <div class="mc-tag ph" id="M${i}th"><i>${ph.first}</i><b>${ph.last}</b></div>
    <div class="mc-tag pa" id="M${i}ta"><i>${pa.first}</i><b>${pa.last}</b></div>
    <div class="mc-band" id="M${i}b">
      <div class="mc-b-l"><i>Lieu</i><b>${H.salle}</b><span>${H.ville}</span></div>
      <div class="mc-b-r"><i>Diffusion</i><span class="mc-tv"><img src="${tvLogo(f.tv)}"/></span></div>
    </div>
  </div>`;
}).join("\n  ");

// ---- final plan rows ----
const rows = d.fixtures.map((f, i) => `<div class="fr" id="FR${i}">
      <span class="fr-c"><img src="${clubLogo(f.home)}"/></span>
      <div class="fr-m">
        <span class="fr-d">${dayShort(f.day)}</span>
        <span class="fr-t">${f.time}</span>
        <span class="fr-tv"><img src="${tvLogo(f.tv)}"/></span>
      </div>
      <span class="fr-c"><img src="${clubLogo(f.away)}"/></span>
    </div>`).join("\n      ");

const html = `<!doctype html><html><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700;800&family=Inter:wght@500;600;700&display=swap">
<style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:1080px;height:1920px;overflow:hidden;background:#06090F}
#stage{position:absolute;inset:0;font-family:"Inter",system-ui,sans-serif;color:#F4F7FB;background:#06090F}
.B{font-family:"Barlow Condensed","Inter",sans-serif;font-weight:700}
.layer{position:absolute;inset:0;overflow:hidden}

/* ---------- intro ---------- */
#intro{position:absolute;inset:0;z-index:80;display:flex;flex-direction:column;
  align-items:center;justify-content:center;text-align:center;
  background:radial-gradient(circle at 50% 34%, rgba(45,212,191,.16), transparent 55%),
    radial-gradient(circle at 82% 92%, rgba(245,158,11,.12), transparent 46%), #080C13}
#intro .k{font-family:"Barlow Condensed";font-weight:700;font-size:30px;letter-spacing:.4em;
  text-transform:uppercase;color:#2DD4BF}
#intro .j{font-family:"Barlow Condensed";font-weight:800;font-size:340px;line-height:.82;
  letter-spacing:-.02em;margin:18px 0 0;text-transform:uppercase}
#intro .j b{color:#F59E0B}
#intro .s{font-family:"Barlow Condensed";font-weight:700;font-size:44px;letter-spacing:.14em;
  text-transform:uppercase;color:#EAF0F6;margin-top:6px}
#intro .dt{margin-top:26px;font-size:26px;letter-spacing:.08em;color:#94A3B8;text-transform:uppercase}

/* ---------- match card ---------- */
.mc{position:absolute;inset:0;overflow:hidden}
.mc-bg{position:absolute;inset:0}
.mc-seam{position:absolute;inset:0;background:linear-gradient(104deg,
  transparent 44%, rgba(4,6,10,.5) 48.4%, rgba(255,255,255,.14) 50%, rgba(4,6,10,.5) 51.6%, transparent 56%)}
.mc-dark{position:absolute;inset:0;background:
  linear-gradient(180deg, rgba(5,8,13,.30) 0%, rgba(5,8,13,.12) 24%, rgba(5,8,13,.45) 64%, rgba(5,8,13,.94) 100%),
  radial-gradient(130% 54% at 50% 34%, transparent 34%, rgba(5,8,13,.46) 100%)}
.mc-pl{position:absolute;bottom:150px;height:1250px;width:588px;object-fit:cover;object-position:50% 4%;
  filter:drop-shadow(0 26px 40px rgba(0,0,0,.6));
  -webkit-mask-image:linear-gradient(90deg,transparent 0,#000 15%,#000 85%,transparent 100%)}
.mc-pl.ph{left:-34px}
.mc-pl.pa{right:-34px}
.mc-top{position:absolute;top:74px;left:60px;right:60px;display:flex;justify-content:space-between;align-items:center;z-index:5}
.mc-top .mc-no{font-family:"Barlow Condensed";font-weight:700;font-size:29px;letter-spacing:.16em;color:rgba(255,255,255,.8)}
.mc-top .mc-no b{color:rgba(255,255,255,.45)}
.mc-top .mc-day{font-family:"Barlow Condensed";font-weight:700;font-size:30px;letter-spacing:.1em;color:#fff;
  background:rgba(6,9,14,.55);padding:8px 18px;border-radius:999px}
.mc-crests{position:absolute;top:150px;left:0;right:0;display:flex;align-items:center;justify-content:center;gap:52px;z-index:5}
.mc-tile{width:256px;height:256px;border-radius:30px;background:rgba(255,255,255,.97);
  display:flex;align-items:center;justify-content:center;box-shadow:0 20px 44px rgba(0,0,0,.45)}
.mc-tile img{width:80%;height:80%;object-fit:contain}
.mc-vs{font-family:"Barlow Condensed";font-weight:800;font-size:100px;line-height:1;color:#fff;
  width:148px;height:148px;border-radius:50%;background:#0A0D13;display:flex;align-items:center;justify-content:center;
  box-shadow:0 12px 34px rgba(0,0,0,.55), inset 0 0 0 2px rgba(255,255,255,.1);flex:none}
.mc-names{position:absolute;top:452px;left:0;right:0;display:flex;justify-content:center;gap:96px;z-index:5;
  font-family:"Barlow Condensed";font-weight:800;font-size:44px;letter-spacing:.04em;text-transform:uppercase}
.mc-names span{width:400px;text-align:center;text-shadow:0 4px 22px rgba(0,0,0,.9)}
.mc-tag{position:absolute;bottom:296px;z-index:6;display:flex;flex-direction:column;padding:10px 26px 12px;
  font-family:"Barlow Condensed";text-transform:uppercase;color:#fff}
.mc-tag i{font-weight:700;font-size:23px;letter-spacing:.14em;font-style:normal;color:rgba(255,255,255,.9);
  text-shadow:0 2px 6px #000,0 0 14px rgba(0,0,0,.95)}
.mc-tag b{font-weight:800;font-size:56px;line-height:.92;letter-spacing:.005em;
  text-shadow:0 3px 10px #000,0 0 26px rgba(0,0,0,.98);-webkit-text-stroke:1px rgba(0,0,0,.35)}
.mc-tag.ph{left:50px;align-items:flex-start;background:linear-gradient(90deg,rgba(4,6,10,.62) 30%,transparent);border-radius:8px}
.mc-tag.pa{right:50px;align-items:flex-end;text-align:right;background:linear-gradient(270deg,rgba(4,6,10,.62) 30%,transparent);border-radius:8px}
.mc-band{position:absolute;left:0;right:0;bottom:0;height:250px;background:linear-gradient(0deg,#05080D 54%,rgba(5,8,13,.55) 80%,rgba(5,8,13,0));
  display:flex;align-items:flex-end;justify-content:space-between;padding:0 64px 30px;z-index:7}
.mc-band .mc-b-l{display:flex;flex-direction:column;gap:3px;max-width:640px}
.mc-band .mc-b-l i{font-family:"Barlow Condensed";font-weight:700;font-size:20px;letter-spacing:.22em;
  text-transform:uppercase;color:#8A97A8;font-style:normal}
.mc-band .mc-b-l b{font-family:"Barlow Condensed";font-weight:700;font-size:42px;text-transform:uppercase;letter-spacing:.01em;line-height:1}
.mc-band .mc-b-l span{font-size:22px;color:#94A3B8;letter-spacing:.04em;margin-top:2px}
.mc-band .mc-b-r{display:flex;flex-direction:column;align-items:flex-end;gap:7px}
.mc-band .mc-b-r i{font-family:"Barlow Condensed";font-weight:700;font-size:20px;letter-spacing:.22em;
  text-transform:uppercase;color:#8A97A8;font-style:normal}
.mc-band .mc-tv{background:rgba(255,255,255,.96);border-radius:12px;padding:8px 14px;display:flex}
.mc-band .mc-tv img{height:40px;object-fit:contain;display:block}

/* ---------- final plan ---------- */
#finale{position:absolute;inset:0;z-index:90;overflow:hidden;background:
  radial-gradient(circle at 50% 16%, rgba(45,212,191,.18), transparent 52%),
  radial-gradient(circle at 84% 94%, rgba(245,158,11,.13), transparent 44%), #080C13}
#finale .fk{position:absolute;top:120px;left:0;right:0;text-align:center;font-family:"Barlow Condensed";
  font-weight:700;font-size:28px;letter-spacing:.38em;text-transform:uppercase;color:#2DD4BF}
#finale .ft{position:absolute;top:150px;left:0;right:0;text-align:center;font-family:"Barlow Condensed";
  font-weight:800;font-size:150px;line-height:.9;text-transform:uppercase}
#finale .ft b{color:#F59E0B}
#finale .fsub{position:absolute;top:322px;left:0;right:0;text-align:center;font-family:"Barlow Condensed";
  font-weight:700;font-size:32px;letter-spacing:.2em;text-transform:uppercase;color:#94A3B8}
#finale .list{position:absolute;left:56px;right:56px;top:404px;display:flex;flex-direction:column;gap:11px}
#finale .fr{display:grid;grid-template-columns:150px 1fr 150px;align-items:center;
  background:linear-gradient(120deg,#141A23,#0B0F16);border-radius:18px;
  box-shadow:inset 0 0 0 1px rgba(255,255,255,.07);padding:13px 34px;will-change:transform,opacity}
#finale .fr-c{width:118px;height:118px;border-radius:16px;background:rgba(255,255,255,.96);
  display:flex;align-items:center;justify-content:center;justify-self:center;box-shadow:0 8px 18px rgba(0,0,0,.4)}
#finale .fr-c img{width:78%;height:78%;object-fit:contain}
#finale .fr-m{display:flex;flex-direction:column;align-items:center;gap:1px}
#finale .fr-m .fr-d{font-family:"Barlow Condensed";font-weight:700;font-size:23px;letter-spacing:.16em;color:#8A97A8}
#finale .fr-m .fr-t{font-family:"Barlow Condensed";font-weight:800;font-size:52px;line-height:.92;letter-spacing:.01em;color:#fff}
#finale .fr-m .fr-tv{background:rgba(255,255,255,.96);border-radius:9px;padding:5px 10px;margin-top:6px;display:flex}
#finale .fr-m .fr-tv img{height:24px;object-fit:contain;display:block}
#finale .fcta{position:absolute;left:0;right:0;bottom:74px;text-align:center}
#finale .fcta .w{font-family:"Barlow Condensed";font-weight:800;text-transform:uppercase;font-size:58px;letter-spacing:.02em}
#finale .fcta .w b{color:#2DD4BF}
#finale .fcta .u{margin-top:8px;font-size:23px;color:#94A3B8;letter-spacing:.06em}
</style></head><body>
<div id="stage">
  <div id="intro">
    <div class="k">Daikin StarLigue 2026 · 27</div>
    <div class="j">J<b>1</b></div>
    <div class="s">le programme</div>
    <div class="dt">8 matchs · 4 – 6 septembre</div>
  </div>

  ${cards}

  <div id="finale">
    <div class="fk">Daikin StarLigue 2026 · 27</div>
    <div class="ft">Journée <b>1</b></div>
    <div class="fsub">le programme complet</div>
    <div class="list">
      ${rows}
    </div>
    <div class="fcta">
      <div class="w">Starligue <b>Fantasy</b></div>
      <div class="u">compose ton équipe sur starliguefantasy.fr</div>
    </div>
  </div>

</div>
<script>
const N=8, INTRO_END=2600, MCLIP=3400, CARDS_END=INTRO_END+N*MCLIP, OUTRO=5000, TOTAL=CARDS_END+OUTRO;
window.TOTAL=TOTAL;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const lerp=(a,b,t)=>a+(b-a)*t;
const ph=(t,s,e)=>clamp((t-s)/(e-s),0,1);
const eOut=t=>1-Math.pow(1-t,3);
const eInOut=t=>t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2;
const back=t=>{const c=1.7,c3=c+1;return 1+c3*Math.pow(t-1,3)+c*Math.pow(t-1,2);};
const $=id=>document.getElementById(id);
const set=(el,o,disp)=>{el.style.opacity=o;el.style.display=o<=.001?'none':(disp||'block');};

window.seek=function(t){
  t=clamp(t,0,TOTAL-1);

  // intro
  const iv=t<INTRO_END+20;
  set($('intro'),iv?1:0,'flex');
  if(iv){
    const box=$('intro');
    const jIn=eOut(ph(t,120,760)), kIn=eOut(ph(t,40,520)), sIn=eOut(ph(t,420,900)), dIn=eOut(ph(t,700,1150));
    const out=ph(t,INTRO_END-360,INTRO_END+10);
    box.querySelector('.k').style.opacity=(kIn*(1-out)).toFixed(3);
    const j=box.querySelector('.j');
    j.style.opacity=(jIn*(1-out)).toFixed(3);
    j.style.transform='scale('+lerp(.78,1,back(clamp(jIn,0,1)))*lerp(1,1.08,out)+')';
    box.querySelector('.s').style.opacity=(sIn*(1-out)).toFixed(3);
    box.querySelector('.dt').style.opacity=(dIn*(1-out)).toFixed(3);
    box.style.transform='translateY('+(out*-40)+'px)';
  }

  // match cards
  for(let i=0;i<N;i++){
    const M=$('M'+i), st=INTRO_END+i*MCLIP, lt=t-st;
    const active = t>=st-30 && t<st+MCLIP+ (i===N-1?30:-30);
    if(!active){ M.style.display='none'; continue; }
    M.style.display='block';
    const wipe=eOut(ph(t,st,st+320));
    const clip='inset(0 '+((1-wipe)*100).toFixed(2)+'% 0 0)';
    M.querySelector('.mc-bg').style.clipPath=clip;
    M.querySelector('.mc-seam').style.clipPath=clip;
    M.querySelector('.mc-dark').style.opacity=wipe.toFixed(3);
    const top=eOut(ph(lt,180,540));
    M.querySelector('.mc-top').style.opacity=top.toFixed(3);
    M.querySelector('.mc-top').style.transform='translateY('+lerp(-18,0,top)+'px)';
    const cr=ph(lt,220,660);
    const crest=M.querySelectorAll('.mc-tile');
    crest[0].style.opacity=eOut(cr).toFixed(3);
    crest[0].style.transform='translateX('+lerp(-56,0,eOut(cr))+'px) scale('+lerp(.72,1,back(clamp(cr,0,1)))+')';
    crest[1].style.opacity=eOut(cr).toFixed(3);
    crest[1].style.transform='translateX('+lerp(56,0,eOut(cr))+'px) scale('+lerp(.72,1,back(clamp(cr,0,1)))+')';
    const vs=ph(lt,420,760);
    const vsEl=M.querySelector('.mc-vs');
    vsEl.style.opacity=eOut(vs).toFixed(3);
    vsEl.style.transform='scale('+lerp(1.9,1,back(clamp(vs,0,1)))+') rotate('+lerp(-14,0,eOut(vs))+'deg)';
    M.querySelector('.mc-names').style.opacity=eOut(ph(lt,560,900)).toFixed(3);
    const pin=ph(lt,300,780), pout=ph(lt,MCLIP-320,MCLIP);
    const pl=M.querySelectorAll('.mc-pl'), tg=M.querySelectorAll('.mc-tag');
    pl[0].style.transform='translateX('+lerp(-180,0,eOut(pin))+'px)'; pl[0].style.opacity=(eOut(pin)*(1-pout)).toFixed(3);
    pl[1].style.transform='translateX('+lerp(180,0,eOut(pin))+'px)'; pl[1].style.opacity=(eOut(pin)*(1-pout)).toFixed(3);
    const tgin=eOut(ph(lt,620,980));
    tg[0].style.opacity=(tgin*(1-pout)).toFixed(3); tg[0].style.transform='translateY('+lerp(16,0,tgin)+'px)';
    tg[1].style.opacity=(tgin*(1-pout)).toFixed(3); tg[1].style.transform='translateY('+lerp(16,0,tgin)+'px)';
    const bin=eOut(ph(lt,700,1050));
    const bd=M.querySelector('.mc-band');
    bd.style.opacity=bin.toFixed(3); bd.style.transform='translateY('+lerp(70,0,bin)+'px)';
  }

  // finale
  const fv=t>=CARDS_END-20;
  set($('finale'),fv?1:0);
  if(fv){
    const ft=t-CARDS_END;
    $('finale').style.clipPath='inset(0 '+((1-eOut(ph(t,CARDS_END-20,CARDS_END+340)))*100).toFixed(2)+'% 0 0)';
    const hin=eOut(ph(ft,160,540));
    for(const c of ['.fk','.ft','.fsub']){ const e=$('finale').querySelector(c);
      e.style.opacity=hin.toFixed(3); e.style.transform='translateY('+lerp(-16,0,hin)+'px)'; }
    for(let i=0;i<N;i++){ const r=$('FR'+i);
      const a=eOut(ph(ft,360+i*90,360+i*90+420));
      r.style.opacity=a.toFixed(3);
      r.style.transform='translateX('+lerp(i%2?60:-60,0,a)+'px) scale('+lerp(.92,1,back(clamp(a,0,1)))+')'; }
    const cin=eOut(ph(ft,1500,1950));
    const cta=$('finale').querySelector('.fcta');
    cta.style.opacity=cin.toFixed(3); cta.style.transform='translateY('+lerp(20,0,cin)+'px)';
  }

};
window.seek(0);
</script>
</body></html>`;

writeFileSync(DIR + "reel.html", html);
console.log("reel.html écrit :", (html.length / 1024 / 1024).toFixed(2), "Mo");
