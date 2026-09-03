import { readFileSync, writeFileSync } from "node:fs";

const DIR = "/private/tmp/claude-501/-Users-tish-Projects-starligue-fantasy/47887ec3-5ee4-4513-ad7b-f4545bc385dc/scratchpad/reelj1/";
const REPO = "/Users/tish/Projects/starligue-fantasy/";

const d = JSON.parse(readFileSync(DIR + "data.json", "utf-8"));
const b64 = (p) => "data:image/png;base64," + readFileSync(p).toString("base64");
const clubLogo = (sn) => b64(REPO + "public/clubs/" + sn.toLowerCase() + ".png");
const playerImg = (sn) => b64(DIR + "players/" + sn + ".png");
const tvLogo = (name) => b64(REPO + "public/broadcasters/" + (name === "beIN Sport" ? "bein-sport" : "handball-tv") + ".png");
const dayShort = (day) => day.replace("Vendredi", "VEN").replace("Samedi", "SAM").replace("Dimanche", "DIM").replace(" sept.", " SEPT");

// ---- intro : 16 logos en spirale (consistency avec le reel 16-maillots) ----
const INTRO_CLUBS = ["MHB", "USAM", "LIMOGES", "CCMHB", "SAHB", "TREMBLAY", "CRMHB", "HBCN",
  "SARAN", "PAUC", "CSMBH", "SRVH", "CAEN", "FENIX", "USDK", "PSG"];
const introLogos = INTRO_CLUBS.map((sn) => `<div class="ic"><img src="${clubLogo(sn)}"/></div>`).join("");

// ---- match cards ----
const cards = d.fixtures.map((f, i) => {
  const H = d.club[f.home], A = d.club[f.away];
  const ph = d.picks[f.home], pa = d.picks[f.away];
  return `<div class="mc" id="M${i}">
    <div class="mc-ground"></div>
    <div class="mc-glow gh" style="background:radial-gradient(circle, ${H.color}66, transparent 60%)"></div>
    <div class="mc-glow ga" style="background:radial-gradient(circle, ${A.color}66, transparent 60%)"></div>
    <img class="mc-wm wh" src="${clubLogo(f.home)}"/>
    <img class="mc-wm wa" src="${clubLogo(f.away)}"/>
    <div class="mc-seam"></div>
    <div class="mc-sweep"></div>
    <div class="mc-edge eh" style="background:${H.color}"></div>
    <div class="mc-edge ea" style="background:${A.color}"></div>
    <img class="mc-pl ph" src="${playerImg(f.home)}"/>
    <img class="mc-pl pa" src="${playerImg(f.away)}"/>
    <div class="mc-vign"></div>
    <div class="mc-no">Match <b>${i + 1}</b> / 8</div>
    <div class="mc-head">
      <img class="mc-crest ch" src="${clubLogo(f.home)}"/>
      <span class="mc-vs">VS</span>
      <img class="mc-crest ca" src="${clubLogo(f.away)}"/>
    </div>
    <div class="mc-nm ph"><i>${ph.first}</i><b>${ph.last}</b></div>
    <div class="mc-nm pa"><i>${pa.first}</i><b>${pa.last}</b></div>
    <div class="mc-info">
      <span class="mc-i-dt">${dayShort(f.day)} · ${f.time}</span>
      <span class="mc-i-sep"></span>
      <span class="mc-i-pl">${H.salle} · ${H.ville}</span>
      <span class="mc-i-sep"></span>
      <img class="mc-i-tv" src="${tvLogo(f.tv)}"/>
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
html,body{width:1080px;height:1920px;overflow:hidden;background:#05070C}
#stage{position:absolute;inset:0;font-family:"Inter",system-ui,sans-serif;color:#F4F7FB;background:#05070C}
.BC{font-family:"Barlow Condensed","Inter",sans-serif}

/* ---------- intro ---------- */
#intro{position:absolute;inset:0;z-index:80;display:flex;flex-direction:column;
  align-items:center;justify-content:center;text-align:center;overflow:hidden;
  background:radial-gradient(circle at 50% 32%, rgba(45,212,191,.18), transparent 54%),
    radial-gradient(circle at 84% 92%, rgba(245,158,11,.13), transparent 46%), #070B12}
#intro .ic{position:absolute;left:50%;top:42%;width:150px;height:150px;margin:-75px 0 0 -75px;will-change:transform,opacity}
#intro .ic img{width:100%;height:100%;object-fit:contain;
  filter:drop-shadow(0 0 3px rgba(255,255,255,.9)) drop-shadow(0 0 2px rgba(255,255,255,.85)) drop-shadow(0 10px 20px rgba(0,0,0,.6))}
#intro .ttl{position:absolute;left:0;right:0;top:42%;text-align:center;transform:translateY(-50%);will-change:transform,opacity}
#intro .ttl .k{font-family:"Barlow Condensed";font-weight:700;font-size:29px;letter-spacing:.42em;
  text-transform:uppercase;color:#2DD4BF}
#intro .ttl .m{font-family:"Barlow Condensed";font-weight:800;font-size:184px;line-height:.86;
  text-transform:uppercase;margin-top:18px;letter-spacing:-.01em}
#intro .ttl .m b{color:#F59E0B}
#intro .ttl .s{margin-top:18px;font-family:"Barlow Condensed";font-weight:700;font-size:34px;
  letter-spacing:.16em;text-transform:uppercase;color:#94A3B8}

/* ---------- match card (face-à-face premium) ---------- */
.mc{position:absolute;inset:0;overflow:hidden;background:#05070C}
.mc-ground{position:absolute;inset:0;background:radial-gradient(120% 82% at 50% 24%, #131922 0%, #080B11 58%, #04060A 100%)}
.mc-glow{position:absolute;top:-16%;width:1180px;height:1180px;border-radius:50%;filter:blur(6px);opacity:.5;will-change:opacity,transform}
.mc-glow.gh{left:-320px}
.mc-glow.ga{right:-320px}
.mc-wm{position:absolute;top:60px;width:900px;height:900px;object-fit:contain;opacity:.09;will-change:opacity}
.mc-wm.wh{left:-300px}
.mc-wm.wa{right:-300px}
.mc-seam{position:absolute;inset:0;background:linear-gradient(103deg,
  transparent 45%, rgba(3,5,9,.62) 48.6%, rgba(255,255,255,.16) 50%, rgba(3,5,9,.62) 51.4%, transparent 55%);will-change:opacity}
.mc-sweep{position:absolute;inset:-10% -40%;background:linear-gradient(103deg, transparent 46%, rgba(255,255,255,.5) 50%, transparent 54%);
  transform:translateX(-120%);will-change:transform,opacity;opacity:0;mix-blend-mode:screen}
.mc-edge{position:absolute;top:230px;bottom:290px;width:6px;border-radius:4px;will-change:opacity,transform}
.mc-edge.eh{left:46px}
.mc-edge.ea{right:46px}
.mc-pl{position:absolute;bottom:214px;height:1300px;width:660px;object-fit:contain;
  filter:drop-shadow(0 34px 46px rgba(0,0,0,.62));will-change:transform,opacity}
.mc-pl.ph{left:-70px;object-position:bottom left}
.mc-pl.pa{right:-70px;object-position:bottom right}
.mc-vign{position:absolute;inset:0;pointer-events:none;background:
  linear-gradient(180deg, rgba(5,7,12,.34) 0%, transparent 22%, transparent 58%, rgba(4,6,11,.72) 82%, #04060A 100%),
  radial-gradient(135% 60% at 50% 32%, transparent 40%, rgba(4,6,11,.4) 100%)}
.mc-no{position:absolute;top:76px;left:60px;z-index:6;font-family:"Barlow Condensed";font-weight:700;
  font-size:27px;letter-spacing:.2em;text-transform:uppercase;color:rgba(255,255,255,.62);will-change:opacity}
.mc-no b{color:#F59E0B}
.mc-head{position:absolute;top:150px;left:0;right:0;z-index:6;display:flex;align-items:center;justify-content:center;gap:70px}
.mc-crest{width:230px;height:230px;object-fit:contain;will-change:opacity,transform;
  filter:drop-shadow(0 0 3px rgba(255,255,255,.95)) drop-shadow(0 0 2px rgba(255,255,255,.9)) drop-shadow(0 16px 30px rgba(0,0,0,.6))}
.mc-vs{font-family:"Barlow Condensed";font-weight:800;font-size:82px;line-height:1;color:#F4F7FB;flex:none;
  width:132px;height:132px;border-radius:50%;display:flex;align-items:center;justify-content:center;
  border:2px solid rgba(255,255,255,.28);background:rgba(6,9,14,.5);backdrop-filter:blur(2px);
  box-shadow:0 14px 34px rgba(0,0,0,.5);will-change:opacity,transform}
.mc-nm{position:absolute;bottom:300px;z-index:7;display:flex;flex-direction:column;padding:8px 4px;will-change:opacity,transform}
.mc-nm i{font-family:"Barlow Condensed";font-weight:700;font-size:24px;letter-spacing:.16em;font-style:normal;
  text-transform:uppercase;color:rgba(255,255,255,.78);text-shadow:0 2px 8px #000}
.mc-nm b{font-family:"Barlow Condensed";font-weight:800;font-size:66px;line-height:.9;letter-spacing:.005em;
  text-transform:uppercase;color:#fff;text-shadow:0 4px 14px #000, 0 0 30px rgba(0,0,0,.9)}
.mc-nm.ph{left:60px;align-items:flex-start}
.mc-nm.pa{right:60px;align-items:flex-end;text-align:right}
.mc-info{position:absolute;left:0;right:0;bottom:96px;z-index:8;display:flex;align-items:center;justify-content:center;gap:20px;
  padding:0 56px;font-family:"Barlow Condensed";font-weight:700;text-transform:uppercase;
  color:#CBD5E1;font-size:26px;letter-spacing:.12em;will-change:opacity,transform}
.mc-info .mc-i-dt{color:#fff}
.mc-info .mc-i-sep{width:5px;height:5px;border-radius:50%;background:rgba(255,255,255,.35);flex:none}
.mc-info .mc-i-tv{height:34px;object-fit:contain;filter:drop-shadow(0 0 2px rgba(255,255,255,.6))}

/* ---------- final plan ---------- */
#finale{position:absolute;inset:0;z-index:90;overflow:hidden;background:
  radial-gradient(circle at 50% 14%, rgba(45,212,191,.18), transparent 50%),
  radial-gradient(circle at 84% 94%, rgba(245,158,11,.13), transparent 44%), #070B12}
#finale .fk{position:absolute;top:112px;left:0;right:0;text-align:center;font-family:"Barlow Condensed";
  font-weight:700;font-size:27px;letter-spacing:.4em;text-transform:uppercase;color:#2DD4BF;will-change:opacity,transform}
#finale .ft{position:absolute;top:142px;left:0;right:0;text-align:center;font-family:"Barlow Condensed";
  font-weight:800;font-size:154px;line-height:.9;text-transform:uppercase;will-change:opacity,transform}
#finale .ft b{color:#F59E0B}
#finale .fsub{position:absolute;top:318px;left:0;right:0;text-align:center;font-family:"Barlow Condensed";
  font-weight:700;font-size:30px;letter-spacing:.22em;text-transform:uppercase;color:#94A3B8;will-change:opacity,transform}
#finale .list{position:absolute;left:54px;right:54px;top:398px;display:flex;flex-direction:column;gap:11px}
#finale .fr{display:grid;grid-template-columns:150px 1fr 150px;align-items:center;
  background:linear-gradient(120deg,#151B24,#0B0F16);border-radius:18px;
  box-shadow:inset 0 0 0 1px rgba(255,255,255,.07);padding:13px 34px;will-change:transform,opacity}
#finale .fr-c{width:118px;height:118px;border-radius:16px;background:rgba(255,255,255,.97);
  display:flex;align-items:center;justify-content:center;justify-self:center;box-shadow:0 8px 18px rgba(0,0,0,.4)}
#finale .fr-c img{width:78%;height:78%;object-fit:contain}
#finale .fr-m{display:flex;flex-direction:column;align-items:center;gap:1px}
#finale .fr-m .fr-d{font-family:"Barlow Condensed";font-weight:700;font-size:23px;letter-spacing:.16em;color:#8A97A8}
#finale .fr-m .fr-t{font-family:"Barlow Condensed";font-weight:800;font-size:52px;line-height:.92;letter-spacing:.01em;color:#fff}
#finale .fr-m .fr-tv{background:rgba(255,255,255,.97);border-radius:9px;padding:5px 10px;margin-top:6px;display:flex}
#finale .fr-m .fr-tv img{height:24px;object-fit:contain;display:block}
#finale .fcta{position:absolute;left:0;right:0;bottom:72px;text-align:center;will-change:opacity,transform}
#finale .fcta .w{font-family:"Barlow Condensed";font-weight:800;text-transform:uppercase;font-size:58px;letter-spacing:.02em}
#finale .fcta .w b{color:#2DD4BF}
#finale .fcta .u{margin-top:8px;font-size:23px;color:#94A3B8;letter-spacing:.06em}
</style></head><body>
<div id="stage">
  <div id="intro">
    ${introLogos}
    <div class="ttl">
      <div class="k">Daikin StarLigue 2026 · 27</div>
      <div class="m">Journée <b>1</b></div>
      <div class="s">le programme · 8 matchs</div>
    </div>
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
const N=8, INTRO_END=3000, MCLIP=3100, CARDS_END=INTRO_END+N*MCLIP, OUTRO=5200, TOTAL=CARDS_END+OUTRO;
window.TOTAL=TOTAL;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const lerp=(a,b,t)=>a+(b-a)*t;
const ph=(t,s,e)=>clamp((t-s)/(e-s),0,1);
const eOut=t=>1-Math.pow(1-t,3);
const eOut4=t=>1-Math.pow(1-t,4);
const eInOut=t=>t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2;
const back=t=>{const c=2.0,c3=c+1;return 1+c3*Math.pow(t-1,3)+c*Math.pow(t-1,2);};
const $=id=>document.getElementById(id);
const set=(el,o,disp)=>{el.style.opacity=o;el.style.display=o<=.001?'none':(disp||'block');};

window.seek=function(t){
  t=clamp(t,0,TOTAL-1);

  // ---------- intro : 16 logos en spirale → titre J1 ----------
  const iv=t<INTRO_END+20;
  set($('intro'),iv?1:0,'block');
  if(iv){
    const box=$('intro');
    const ics=box.querySelectorAll('.ic');
    const ttl=box.querySelector('.ttl');
    const M=ics.length, cy=1920*0.42;
    const gather=eInOut(ph(t,720,1360));
    const spin=ph(t,220,1260)*Math.PI*0.5;
    const gridOut=ph(t,1680,2080);
    const tIn=ph(t,2060,2520), tOut=ph(t,INTRO_END-300,INTRO_END+10);
    ics.forEach((el,i)=>{
      const col=i%4, row=(i/4|0);
      const gx=(col-1.5)*198, gy=(row-1.5)*198;
      const a=(i/M)*Math.PI*2 - Math.PI/2 + spin;
      const inT=eOut(ph(t,20+i*22,20+i*22+360));
      const rr=lerp(620,160,inT);
      const sx=lerp(Math.cos(a)*rr, gx, gather);
      const sy=lerp(Math.sin(a)*rr, gy, gather);
      el.style.left='50%'; el.style.top=cy+'px';
      el.style.transform='translate('+sx.toFixed(1)+'px,'+(sy+gridOut*-280).toFixed(1)+'px) scale('+(lerp(.14,1,inT)*lerp(1,.48,gridOut)).toFixed(3)+')';
      el.style.opacity=(inT*(1-gridOut)).toFixed(3);
    });
    ttl.style.top=cy+'px';
    ttl.style.opacity=(eOut(tIn)*(1-tOut)).toFixed(3);
    ttl.style.transform='translateY(-50%) scale('+(lerp(.82,1,back(clamp(tIn,0,1)))*lerp(1,1.06,tOut)).toFixed(3)+')';
  }

  // ---------- match cards ----------
  for(let i=0;i<N;i++){
    const M=$('M'+i), st=INTRO_END+i*MCLIP, lt=t-st;
    const active = t>=st-24 && t<st+MCLIP+(i===N-1?24:-24);
    if(!active){ M.style.display='none'; continue; }
    M.style.display='block';
    const outp=ph(lt,MCLIP-300,MCLIP);
    const wipe=eOut4(ph(lt,0,300));
    M.querySelector('.mc-ground').style.clipPath='inset(0 '+((1-wipe)*100).toFixed(2)+'% 0 0)';

    // diagonal light sweep on entry
    const sw=ph(lt,40,520);
    const sweep=M.querySelector('.mc-sweep');
    sweep.style.transform='translateX('+lerp(-120,120,eOut(sw))+'%)';
    sweep.style.opacity=(Math.sin(sw*Math.PI)*0.9).toFixed(3);

    const glowIn=eOut(ph(lt,80,460))*(1-outp);
    M.querySelector('.mc-glow.gh').style.opacity=(glowIn*0.5).toFixed(3);
    M.querySelector('.mc-glow.ga').style.opacity=(glowIn*0.5).toFixed(3);
    M.querySelector('.mc-wm.wh').style.opacity=(eOut(ph(lt,120,560))*0.09*(1-outp)).toFixed(3);
    M.querySelector('.mc-wm.wa').style.opacity=(eOut(ph(lt,120,560))*0.09*(1-outp)).toFixed(3);
    M.querySelector('.mc-seam').style.opacity=(eOut(ph(lt,120,420))*(1-outp)).toFixed(3);
    M.querySelector('.mc-vign').style.opacity=(eOut(ph(lt,0,300))).toFixed(3);

    const eg=ph(lt,180,520);
    for(const e of M.querySelectorAll('.mc-edge')){ e.style.opacity=(eOut(eg)*(1-outp)).toFixed(3);
      e.style.transform='scaleY('+lerp(.3,1,eOut(eg))+')'; e.style.transformOrigin='top'; }

    // players slide in fast from the sides, overshoot
    const pin=ph(lt,140,560);
    const pl=M.querySelectorAll('.mc-pl');
    const px=lerp(460,0,back(clamp(pin,0,1)));
    pl[0].style.transform='translateX('+(-px)+'px)'; pl[0].style.opacity=(clamp(lt/150,0,1)*(1-outp)).toFixed(3);
    pl[1].style.transform='translateX('+px+'px)'; pl[1].style.opacity=(clamp(lt/150,0,1)*(1-outp)).toFixed(3);

    M.querySelector('.mc-no').style.opacity=(eOut(ph(lt,220,560))*(1-outp)).toFixed(3);

    const cr=ph(lt,180,520);
    const cs=M.querySelectorAll('.mc-crest');
    cs[0].style.opacity=(eOut(cr)*(1-outp)).toFixed(3);
    cs[0].style.transform='translateX('+lerp(70,0,back(clamp(cr,0,1)))+'px) scale('+lerp(.6,1,back(clamp(cr,0,1)))+')';
    cs[1].style.opacity=(eOut(cr)*(1-outp)).toFixed(3);
    cs[1].style.transform='translateX('+lerp(-70,0,back(clamp(cr,0,1)))+'px) scale('+lerp(.6,1,back(clamp(cr,0,1)))+')';
    const vs=ph(lt,260,520);
    const vsEl=M.querySelector('.mc-vs');
    vsEl.style.opacity=(eOut(vs)*(1-outp)).toFixed(3);
    vsEl.style.transform='scale('+lerp(2.3,1,back(clamp(vs,0,1)))+') rotate('+lerp(-24,0,eOut(vs))+'deg)';

    const nmin=ph(lt,460,760);
    const nm=M.querySelectorAll('.mc-nm');
    nm[0].style.opacity=(eOut(nmin)*(1-outp)).toFixed(3); nm[0].style.transform='translateX('+lerp(-40,0,eOut(nmin))+'px)';
    nm[1].style.opacity=(eOut(nmin)*(1-outp)).toFixed(3); nm[1].style.transform='translateX('+lerp(40,0,eOut(nmin))+'px)';

    const inin=ph(lt,560,860);
    const inf=M.querySelector('.mc-info');
    inf.style.opacity=(eOut(inin)*(1-outp)).toFixed(3); inf.style.transform='translateY('+lerp(38,0,eOut(inin))+'px)';
  }

  // ---------- finale ----------
  const fv=t>=CARDS_END-16;
  set($('finale'),fv?1:0);
  if(fv){
    const ft=t-CARDS_END;
    $('finale').style.clipPath='inset(0 '+((1-eOut4(ph(ft,-16,320)))*100).toFixed(2)+'% 0 0)';
    const hin=eOut(ph(ft,120,480));
    for(const c of ['.fk','.ft','.fsub']){ const e=$('finale').querySelector(c);
      e.style.opacity=hin.toFixed(3); e.style.transform='translateY('+lerp(-18,0,hin)+'px)'; }
    for(let i=0;i<N;i++){ const r=$('FR'+i);
      const a=eOut(ph(ft,300+i*72,300+i*72+380));
      r.style.opacity=a.toFixed(3);
      r.style.transform='translateX('+lerp(i%2?54:-54,0,back(clamp(a,0,1)))+'px)'; }
    const cin=eOut(ph(ft,1350,1800));
    const cta=$('finale').querySelector('.fcta');
    cta.style.opacity=cin.toFixed(3); cta.style.transform='translateY('+lerp(22,0,cin)+'px)';
  }
};
window.seek(0);
</script>
</body></html>`;

writeFileSync(DIR + "reel.html", html);
console.log("reel.html écrit :", (html.length / 1024 / 1024).toFixed(2), "Mo");
