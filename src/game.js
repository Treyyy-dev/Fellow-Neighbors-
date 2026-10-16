(function(){
'use strict';
var $ = function(id){ return document.getElementById(id); };
var wrap = $('game');
if (!window.THREE) { $('start').querySelector('p:nth-of-type(2)').textContent = 'The 3D engine failed to load. Check your connection and reload.'; return; }

var FUSES = 0;
var NATIVE_RANDOM=Math.random; function seededRandom(s){ return function(){ s|=0; s=s+0x6D2B79F5|0; var t=Math.imul(s^s>>>15,1|s); t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; }; }
Math.random=seededRandom(20261031);
var rand = function(a,b){ return a + Math.random()*(b-a); };
var lin = function(hex){ return new THREE.Color(hex).convertSRGBToLinear(); };
var reduced = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
var isTouch = false;
try { isTouch = matchMedia('(pointer: coarse)').matches; } catch(e){}

/* ---------- renderer ---------- */
var LOWEND=false; try { LOWEND=isTouch || (navigator.hardwareConcurrency||8)<=4 || (navigator.deviceMemory||8)<=4; } catch(e){}
var renderer = new THREE.WebGLRenderer({antialias:!LOWEND, powerPreference:'high-performance'});
var pixelRatio = Math.min(window.devicePixelRatio||1, isTouch ? 1.5 : 2);
renderer.setPixelRatio(pixelRatio);
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.25;
// Puppet Combo / PS1 look: while you play, every vertex snaps to a coarse screen grid, so models wobble and jitter
var PS1SNAP={value:new THREE.Vector2(0,0)};
function ps1Patch(sh,m){ if (m && (m.isMeshDepthMaterial || m.isMeshDistanceMaterial || m.userData.noSnap)) return; if (sh.vertexShader.indexOf('#include <project_vertex>')<0) return; sh.uniforms.ps1Snap=PS1SNAP;
  sh.vertexShader='uniform vec2 ps1Snap;\n'+sh.vertexShader.replace('#include <project_vertex>','#include <project_vertex>\nif (ps1Snap.y>0.0 && gl_Position.w>0.0){ vec2 sp=gl_Position.xy/gl_Position.w; sp=floor(sp*ps1Snap+0.5)/ps1Snap; gl_Position.xy=sp*gl_Position.w; }'); }
THREE.Material.prototype.onBeforeCompile=function(sh){ ps1Patch(sh,this); };
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = LOWEND ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
wrap.insertBefore(renderer.domElement, wrap.firstChild);
var scene = new THREE.Scene();
var FOG = 0x0a0f1c;
scene.fog = new THREE.FogExp2(lin(FOG), 0.03);
var camera = new THREE.PerspectiveCamera(70, 1, 0.08, 900);
camera.rotation.order = 'YXZ';
scene.add(camera);
var world = new THREE.Group(); scene.add(world);

function resize(){
  var w = wrap.clientWidth||1, h = wrap.clientHeight||1;
  renderer.setSize(w, h, false);
  camera.aspect = w/h; camera.updateProjectionMatrix();
}
if (window.ResizeObserver) new ResizeObserver(resize).observe(wrap);
window.addEventListener('resize', resize); resize();

/* ---------- procedural textures ---------- */
function hash(x,y){ var n = Math.sin(x*127.1+y*311.7)*43758.5453; return n-Math.floor(n); }
function vnoise(x,y,p){
  var xi=Math.floor(x), yi=Math.floor(y), xf=x-xi, yf=y-yi;
  var u=xf*xf*(3-2*xf), v=yf*yf*(3-2*yf);
  var x0=((xi%p)+p)%p, x1=(x0+1)%p, y0=((yi%p)+p)%p, y1=(y0+1)%p;
  var a=hash(x0,y0), b=hash(x1,y0), c=hash(x0,y1), d=hash(x1,y1);
  return a+(b-a)*u+(c-a)*v+(a-b-c+d)*u*v;
}
function fbm(u,v,p,oct){ var s=0,a=.5,t=0; for (var i=0;i<oct;i++){ s+=vnoise(u*p,v*p,p)*a; t+=a; a*=.5; p*=2; } return s/t; }
function pixTex(size, fn, color){
  var c=document.createElement('canvas'); c.width=c.height=size; var g=c.getContext('2d'), im=g.createImageData(size,size), d=im.data;
  for (var y=0;y<size;y++) for (var x=0;x<size;x++){ var o=(y*size+x)*4, r=fn(x/size,y/size,x,y); d[o]=r[0]; d[o+1]=r[1]; d[o+2]=r[2]; d[o+3]=r.length>3?r[3]:255; }
  g.putImageData(im,0,0);
  var t=new THREE.CanvasTexture(c); t.wrapS=t.wrapT=THREE.RepeatWrapping; if (color) t.encoding=THREE.sRGBEncoding; t.anisotropy=4; return t;
}
function canvasTex(w,h,draw,color){
  var c=document.createElement('canvas'); c.width=w; c.height=h; draw(c.getContext('2d'),w,h);
  var t=new THREE.CanvasTexture(c); if (color!==false) t.encoding=THREE.sRGBEncoding; t.anisotropy=4; return t;
}
function rep(t,x,y){ var c=t.clone(); c.needsUpdate=true; c.repeat.set(x,y); return c; }

var grassTex = pixTex(256,function(u,v,x,y){
  var n=fbm(u,v,4,5), f=hash(x,y), dry=fbm(u+.3,v+.7,3,3);
  var g=40+n*40+f*20, r=28+n*26+f*16+(dry>.56?22:0), b=16+n*12;
  return [r,g,b];
},true); grassTex.repeat.set(60,26);
var asphaltTex = pixTex(256,function(u,v,x,y){ var n=fbm(u,v,8,4), f=hash(x,y); var c=30+n*26+f*22+(f>.965?45:0); return [c,c,c+3]; },true);
var asphaltBump = pixTex(256,function(u,v,x,y){ var c=(fbm(u,v,16,3)*.5+hash(x,y)*.5)*255; return [c,c,c]; });
var puddleTex = pixTex(256,function(u,v){ var n=fbm(u,v,3,4); var r = n>.56 ? 0.04 : (n>.5 ? 0.04+(0.56-n)/0.06*0.6 : 0.64+fbm(u,v,24,2)*.25); var c=r*255; return [c,c,c]; });
var concreteTex = pixTex(128,function(u,v,x,y){ var c=118+fbm(u,v,6,4)*50+hash(x,y)*22; if (x<2) c*=.45; return [c,c,c*.97]; },true);
var sidingTex = pixTex(128,function(u,v,x,y){ var b=y%16, c=225+hash(x>>2,y>>4)*18+fbm(u,v,10,2)*14; if (b>13) c*=.38; else c-= b*1.6; return [c,c,c]; },true);
var sidingBump = pixTex(128,function(u,v,x,y){ var b=y%16, c=b>13?0:255-b*8; return [c,c,c]; });
var shingleTex = pixTex(128,function(u,v,x,y){ var row=y>>3, xx=x+(row%2?8:0), c=44+hash(xx>>4,row)*30+hash(x,y)*12; if (y%8===0||xx%16===0) c*=.4; return [c,c*.96,c*.98]; },true);
var barkTex = pixTex(128,function(u,v,x,y){ var c=44+fbm(u*6,v,6,4)*58+hash(x,y)*14; return [c,c*.82,c*.66]; },true);
var plankTex = pixTex(128,function(u,v,x,y){ var c=96+fbm(u*8,v,5,4)*56+hash(x>>4,0)*30; if (x%16<1) c*=.3; return [c,c*.86,c*.7]; },true);
var brickTex = pixTex(128,function(u,v,x,y){ var row=y>>3, xx=x+(row%2?8:0); if (y%8===0||xx%16===0) return [150,146,138]; var c=150+hash(xx>>4,row)*60+hash(x,y)*14; return [c,c*.52,c*.42]; },true);
var garageTex = canvasTex(64,64,function(g){ g.fillStyle='#e4e0d6'; g.fillRect(0,0,64,64); g.fillStyle='rgba(0,0,0,.28)'; for (var y=0;y<64;y+=16) g.fillRect(0,y,64,2); g.fillStyle='rgba(0,0,0,.1)'; for (var x=0;x<64;x+=16) g.fillRect(x,0,1,64); });
var leafTex = pixTex(128,function(u,v,x,y){ var n=fbm(u,v,10,4), f=hash(x,y); var c=90+n*120+f*50; return [c,c,c]; },true);
var stoneTex = pixTex(128,function(u,v,x,y){ var c=90+fbm(u,v,6,4)*70+hash(x,y)*18; if (y%32<2||(x+((y>>5)%2?32:0))%64<2) c*=.4; return [c,c,c*1.02]; },true);
var mistTex = canvasTex(128,128,function(g){
  for (var i=0;i<14;i++){ var x=rand(34,94), y=rand(44,84), r=rand(18,34), gr=g.createRadialGradient(x,y,0,x,y,r);
    gr.addColorStop(0,'rgba(255,255,255,.16)'); gr.addColorStop(1,'rgba(255,255,255,0)'); g.fillStyle=gr; g.fillRect(0,0,128,128); }
});
var glowTex = canvasTex(128,128,function(g,w,h){
  var r=g.createRadialGradient(64,64,0,64,64,64);
  r.addColorStop(0,'rgba(255,255,255,1)'); r.addColorStop(.18,'rgba(255,255,255,.5)'); r.addColorStop(.5,'rgba(255,255,255,.12)'); r.addColorStop(1,'rgba(255,255,255,0)');
  g.fillStyle=r; g.fillRect(0,0,w,h);
});
var bladeTex = canvasTex(64,64,function(g){
  g.clearRect(0,0,64,64);
  for (var i=0;i<11;i++){ var x=5+i*5.4+rand(-2,2), top=rand(4,30), lean=rand(-9,9);
    g.fillStyle='rgb('+Math.floor(rand(120,200))+','+Math.floor(rand(170,255))+','+Math.floor(rand(90,140))+')';
    g.beginPath(); g.moveTo(x-2.4,64); g.quadraticCurveTo(x+lean*.3,top+20,x+lean,top); g.quadraticCurveTo(x+lean*.5,top+22,x+2.4,64); g.fill(); }
});
function windowTex(lit){ return canvasTex(64,64,function(g){
  if (lit){ var gr=g.createLinearGradient(0,0,0,64); gr.addColorStop(0,'#ffd591'); gr.addColorStop(1,'#e89a3c'); g.fillStyle=gr; g.fillRect(0,0,64,64);
    g.fillStyle='rgba(120,50,10,.55)'; g.beginPath(); g.moveTo(0,0); g.quadraticCurveTo(22,18,6,64); g.lineTo(0,64); g.fill();
    g.beginPath(); g.moveTo(64,0); g.quadraticCurveTo(42,18,58,64); g.lineTo(64,64); g.fill();
  } else { var g2=g.createLinearGradient(0,0,64,64); g2.addColorStop(0,'#1a2233'); g2.addColorStop(.5,'#080b12'); g2.addColorStop(1,'#111724'); g.fillStyle=g2; g.fillRect(0,0,64,64); }
  g.fillStyle=lit?'#2a1c10':'#d8d6cc'; g.fillRect(30,0,4,64); g.fillRect(0,30,64,4);
}); }
var winLitTex = windowTex(true), winDarkTex = windowTex(false);
var pumpkinSkin = pixTex(64,function(u,v,x,y){ var n=fbm(u,v,6,3); return [205+n*40, 88+n*36, 14]; },true);
var pumpkinFace = canvasTex(256,128,function(g,w,h){
  g.fillStyle='#000'; g.fillRect(0,0,w,h);
  var gr=g.createRadialGradient(64,70,4,64,70,60); gr.addColorStop(0,'#fff0a0'); gr.addColorStop(1,'#ff8a1a'); g.fillStyle=gr;
  function tri(cx,cy,s){ g.beginPath(); g.moveTo(cx,cy-s); g.lineTo(cx+s,cy+s); g.lineTo(cx-s,cy+s); g.fill(); }
  tri(46,48,11); tri(82,48,11); tri(64,66,6);
  g.beginPath(); g.moveTo(34,82); g.lineTo(44,92); g.lineTo(52,84); g.lineTo(60,94); g.lineTo(68,84); g.lineTo(76,94); g.lineTo(84,84); g.lineTo(94,82); g.lineTo(86,104); g.lineTo(42,104); g.fill();
});
var maskTex = canvasTex(128,128,function(g,w,h){
  var gr=g.createRadialGradient(64,56,8,64,64,74); gr.addColorStop(0,'#f1eee2'); gr.addColorStop(.7,'#d2cebf'); gr.addColorStop(1,'#8e8a7c'); g.fillStyle=gr; g.fillRect(0,0,w,h);
  g.fillStyle='rgba(60,50,40,.18)'; for (var i=0;i<60;i++) g.fillRect(rand(0,128),rand(0,128),rand(1,3),rand(1,3));
  g.fillStyle='#030303';
  g.beginPath(); g.moveTo(28,50); g.quadraticCurveTo(44,40,57,54); g.quadraticCurveTo(44,64,28,50); g.fill();
  g.beginPath(); g.moveTo(100,50); g.quadraticCurveTo(84,40,71,54); g.quadraticCurveTo(84,64,100,50); g.fill();
  g.fillStyle='rgba(40,30,22,.55)'; g.beginPath(); g.ellipse(60,75,1.6,1.1,0,0,7); g.ellipse(68,75,1.6,1.1,0,0,7); g.fill();
  g.strokeStyle='rgba(40,30,22,.35)'; g.lineWidth=1.2; g.beginPath(); g.moveTo(66,56); g.quadraticCurveTo(69,68,67,73); g.stroke();
  g.strokeStyle='rgba(50,28,22,.8)'; g.lineWidth=1.8; g.beginPath(); g.moveTo(53,87); g.quadraticCurveTo(64,85,75,87); g.stroke();
});

/* ---------- lights ---------- */
var hemi=new THREE.HemisphereLight(lin(0x7f93c8), lin(0x14141a), 0.42); scene.add(hemi);
var moonLight = new THREE.DirectionalLight(lin(0x9fb6ff), 0.55);
var moonDir = new THREE.Vector3(-0.45,0.72,0.3).normalize();
moonLight.position.copy(moonDir).multiplyScalar(150).add(new THREE.Vector3(5,0,0)); moonLight.target.position.set(5,0,0);
moonLight.castShadow = true;
var msz = LOWEND ? 1024 : (isTouch ? 2048 : 4096); moonLight.shadow.mapSize.set(msz,msz);
var sc = moonLight.shadow.camera; sc.left=-92; sc.right=92; sc.top=62; sc.bottom=-62; sc.near=20; sc.far=320;
moonLight.shadow.bias=-0.0006; moonLight.shadow.normalBias=0.06; moonLight.shadow.autoUpdate=false;
scene.add(moonLight); scene.add(moonLight.target);

var torch = new THREE.SpotLight(lin(0xfff0d2), 2.6, 44, 0.46, 0.65, 1.25);
torch.position.set(0.19,-0.15,-0.6);
camera.add(torch); camera.add(torch.target); torch.target.position.set(0.02,-0.06,-10);
torch.castShadow = true; torch.shadow.mapSize.set(1024,1024); torch.shadow.camera.near=0.4; torch.shadow.camera.far=44; torch.shadow.bias=-0.0015; torch.shadow.normalBias=0.02;

var lampLights = [0,1].map(function(){ var l=new THREE.PointLight(lin(0xffc27a), 2.2, 20, 1.6); scene.add(l); return l; });
var pumpkinLight = new THREE.PointLight(lin(0xff7a1c), 0, 7, 1.6); scene.add(pumpkinLight);

/* ---------- helpers ---------- */
var colliders = [];
function addBox(x, z, hx, hz){ var c = {minX:x-hx,maxX:x+hx,minZ:z-hz,maxZ:z+hz}; colliders.push(c); return c; }
function blocked(x, z, pad){
  for (var i=0;i<colliders.length;i++){ var c=colliders[i];
    if (x>c.minX-pad && x<c.maxX+pad && z>c.minZ-pad && z<c.maxZ+pad) return true; }
  return false;
}
function resolve(p, r, list){
  list=list||colliders;
  for (var i=0;i<list.length;i++){ var c=list[i];
    var cx = Math.max(c.minX, Math.min(p.x, c.maxX)), cz = Math.max(c.minZ, Math.min(p.z, c.maxZ));
    var dx = p.x-cx, dz = p.z-cz, d2 = dx*dx+dz*dz;
    if (d2 < r*r){
      if (d2 > 1e-8){ var d=Math.sqrt(d2); p.x = cx+dx/d*r; p.z = cz+dz/d*r; }
      else { var l=p.x-c.minX, rr=c.maxX-p.x, t=p.z-c.minZ, b=c.maxZ-p.z, m=Math.min(l,rr,t,b);
        if (m===l) p.x=c.minX-r; else if (m===rr) p.x=c.maxX+r; else if (m===t) p.z=c.minZ-r; else p.z=c.maxZ+r; }
    }
  }
}
function mat(color, o){ o=o||{}; o.color=lin(color); if (o.roughness===undefined) o.roughness=0.85; if (o.metalness===undefined) o.metalness=0; return new THREE.MeshStandardMaterial(o); }
function glow(color, o){ o=o||{}; o.color=lin(color); return new THREE.MeshBasicMaterial(o); }
function box(w,h,d,m,x,y,z,parent){ var b=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),m); b.position.set(x,y,z); (parent||world).add(b); return b; }
function cyl(rt,rb,h,seg,m,x,y,z,parent){ var b=new THREE.Mesh(new THREE.CylinderGeometry(rt,rb,h,seg),m); b.position.set(x,y,z); (parent||world).add(b); return b; }
function halo(color,size,x,y,z,parent,op){
  var s=new THREE.Sprite(new THREE.SpriteMaterial({map:glowTex,color:lin(color),transparent:true,opacity:op===undefined?1:op,depthWrite:false,blending:THREE.AdditiveBlending}));
  s.scale.set(size,size,1); s.position.set(x,y,z); (parent||scene).add(s); return s;
}

/* ---------- sky ---------- */
(function(){
  var skyTex = canvasTex(4,256,function(g){
    var gr=g.createLinearGradient(0,0,0,128); gr.addColorStop(0,'#04060f'); gr.addColorStop(.6,'#0a1226'); gr.addColorStop(1,'#0a0f1c');
    g.fillStyle=gr; g.fillRect(0,0,4,128); g.fillStyle='#0a0f1c'; g.fillRect(0,128,4,128);
  });
  var dome=new THREE.Mesh(new THREE.SphereGeometry(700,24,16), new THREE.MeshBasicMaterial({map:skyTex,side:THREE.BackSide,fog:false,depthWrite:false}));
  scene.add(dome);
  var pts=[];
  for (var i=0;i<700;i++){ var a=Math.random()*Math.PI*2, e=rand(0.1,1.5), r=600; pts.push(Math.cos(a)*Math.cos(e)*r, Math.sin(e)*r, Math.sin(a)*Math.cos(e)*r); }
  var g=new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pts,3));
  scene.add(new THREE.Points(g, new THREE.PointsMaterial({color:0xdde4ff,size:1.6,sizeAttenuation:false,fog:false,transparent:true,opacity:.8})));
  var moonTex = canvasTex(128,128,function(g){
    var gr=g.createRadialGradient(54,54,6,64,64,62); gr.addColorStop(0,'#fffbe8'); gr.addColorStop(.9,'#d9d4be'); gr.addColorStop(1,'rgba(217,212,190,0)'); g.fillStyle=gr; g.beginPath(); g.arc(64,64,62,0,7); g.fill();
    g.fillStyle='rgba(120,120,110,.25)'; [[44,50,13],[78,40,8],[70,82,16],[36,84,7],[92,66,6]].forEach(function(c){ g.beginPath(); g.arc(c[0],c[1],c[2],0,7); g.fill(); });
  });
  var mp = moonDir.clone().multiplyScalar(560);
  var moon=new THREE.Sprite(new THREE.SpriteMaterial({map:moonTex,fog:false,transparent:true,depthWrite:false})); moon.scale.set(52,52,1); moon.position.copy(mp); scene.add(moon);
  var mh=new THREE.Sprite(new THREE.SpriteMaterial({map:glowTex,color:lin(0x93a8e0),fog:false,transparent:true,opacity:.5,depthWrite:false,blending:THREE.AdditiveBlending})); mh.scale.set(380,380,1); mh.position.copy(mp); scene.add(mh);
})();

/* ---------- ground ---------- */
var ground = new THREE.Mesh(new THREE.PlaneGeometry(370,150), new THREE.MeshStandardMaterial({map:grassTex, roughness:1, dithering:true}));
ground.rotation.x=-Math.PI/2; ground.position.x=-15; world.add(ground);
var roadM = new THREE.MeshStandardMaterial({map:rep(asphaltTex,40,2), bumpMap:rep(asphaltBump,40,2), bumpScale:0.02, roughnessMap:rep(puddleTex,9,0.6), roughness:1, color:lin(0x8a8a90), dithering:true});
var road = new THREE.Mesh(new THREE.PlaneGeometry(232,8), roadM); road.rotation.x=-Math.PI/2; road.position.set(33,0.02,0); world.add(road);
var walkM = new THREE.MeshStandardMaterial({map:rep(concreteTex,90,1), roughness:.9});
[-5.1,5.1].forEach(function(z){ box(220,0.14,2,walkM,37,0.07,z); });
var curbM = mat(0x77777a,{roughness:.9});
var paint = mat(0xb9a94e,{roughness:.7});
for (var dx=-68; dx<146; dx+=6){ var d=new THREE.Mesh(new THREE.PlaneGeometry(2.2,0.14), paint); d.rotation.x=-Math.PI/2; d.position.set(dx,0.03,0); world.add(d); }

/* ---------- perimeter + gate ---------- */
var hedgeM = new THREE.MeshStandardMaterial({map:rep(leafTex,30,2), color:lin(0x1d3a22), roughness:1});
function hedge(x,z,hx,hz){ box(hx*2,3.4,hz*2,hedgeM,x,1.7,z); addBox(x,z,hx,hz); }
hedge(37,-41,111,1); hedge(37,41,111,1); hedge(-73,-31.5,1,10.5); hedge(-73,31.5,1,10.5); hedge(148,0,1,41);
var stoneM = new THREE.MeshStandardMaterial({map:rep(stoneTex,1,3), roughness:.9});
var ironM = mat(0x0c0c10,{roughness:.45,metalness:.6});
var leaves = [-1,1].map(function(s){
  var g=new THREE.Group(); g.position.set(73,0,4*s); world.add(g);
  for (var i=0;i<9;i++){ cyl(0.035,0.035,3.3,6,ironM,0,1.65,-s*(0.25+i*0.46),g); var tip=new THREE.Mesh(new THREE.ConeGeometry(0.07,0.25,6),ironM); tip.position.set(0,3.4,-s*(0.25+i*0.46)); g.add(tip); }
  box(0.07,0.07,4,ironM,0,0.4,-s*2,g); box(0.07,0.07,4,ironM,0,2.9,-s*2,g);
  return {g:g,s:s};
});
leaves.forEach(function(l){ l.g.visible=false; });
var gateCollider = addBox(9999,9999,0.1,0.1);
var gateLamp = new THREE.Mesh(new THREE.SphereGeometry(0.07,10,8), new THREE.MeshBasicMaterial({color:0xff2222})); gateLamp.position.set(71.33,1.55,5.3); scene.add(gateLamp);
var gateHalo = halo(0xff3030,2.2,71.3,1.55,5.3); gateLamp.visible=false; gateHalo.visible=false;

/* ---------- houses ---------- */
var winLitM = new THREE.MeshBasicMaterial({map:winLitTex}), winDarkM = new THREE.MeshStandardMaterial({map:winDarkTex,roughness:.15,metalness:.2});
var tvMats = [];
var trimM = mat(0xd9d6cc,{roughness:.7}), roofM = new THREE.MeshStandardMaterial({map:rep(shingleTex,5,3),roughness:.9}), roofM0=roofM;
var garM = new THREE.MeshStandardMaterial({map:garageTex,roughness:.6});
var brickM = mat(0x5a3329), porchM = new THREE.MeshStandardMaterial({map:rep(plankTex,2,1),roughness:.85}), foundM = new THREE.MeshStandardMaterial({map:rep(concreteTex,6,1),roughness:.95});
var shrubM = new THREE.MeshStandardMaterial({map:leafTex,color:lin(0x24402a),roughness:1});
var houseCols = [0xb9b3a3,0x8f9aa6,0xa98f7a,0x8c9a8a,0xb7ab94,0x9a93a3,0xc4bfb4,0x7d8794];
var doorCols = [0x5c1f1a,0x1f3a2c,0x2a2f4a,0x3a2a1c];
var pumpkinG = (function(){ var g=new THREE.SphereGeometry(0.34,20,14), p=g.attributes.position;
  for (var i=0;i<p.count;i++){ var x=p.getX(i), z=p.getZ(i), a=Math.atan2(z,x), k=1+0.06*Math.cos(a*9); p.setX(i,x*k); p.setZ(i,z*k); }
  g.computeVertexNormals(); return g; })();
var pumpkinM = new THREE.MeshStandardMaterial({map:pumpkinSkin, roughness:.55, emissive:new THREE.Color(1.6,1.0,0.5), emissiveMap:pumpkinFace});
var stemM = mat(0x3a4a22);
var pumpkins = [];
function pumpkin(parent,x,z,scale){ return;
  var g=new THREE.Group(); g.position.set(x,0,z); g.rotation.y=rand(-.4,.4); parent.add(g);
  var p=new THREE.Mesh(pumpkinG,pumpkinM); p.scale.set(scale,scale*.82,scale); p.position.y=.28*scale+.02; g.add(p);
  cyl(0.03,0.045,0.12,6,stemM,0,.58*scale,0,g);
  pumpkins.push(g);
}
var houseXs = [-55,-33,-11,11,33,55,77,99,121], hi=0, houses=[];
var gableShape = new THREE.Shape(); gableShape.moveTo(-4.1,0); gableShape.lineTo(4.1,0); gableShape.lineTo(0,2.3); gableShape.lineTo(-4.1,0);
var gableG = new THREE.ShapeGeometry(gableShape);
var gableShape2 = new THREE.Shape(); gableShape2.moveTo(-5.1,0); gableShape2.lineTo(5.1,0); gableShape2.lineTo(0,2.5); gableShape2.lineTo(-5.1,0);
var gableG2 = new THREE.ShapeGeometry(gableShape2);
houseXs.forEach(function(hx){ [-1,1].forEach(function(side){
  var litWin=[], litFx=[];
  var z=side*18, g=new THREE.Group(); g.position.set(hx,0,z); g.rotation.y = side>0 ? Math.PI : 0; world.add(g);   // local +Z is the front
  var wallM = new THREE.MeshStandardMaterial({map:rep(sidingTex,3,5), bumpMap:rep(sidingBump,3,5), bumpScale:.03, color:lin(houseCols[hi%houseCols.length]), roughness:.8});
  var ST={two:hi%4===1||hi===6||hi===11, roof:hi%3, brick:hi%4===2, garage:hi%4===0||hi===7, shut:hi%2===0};
  var top=ST.two?8.0:5.4, wh=top-0.4;
  var trimM=mat([0xd9d6cc,0xe8dcc0,0x3a3f4a,0xf0ece2][hi%4],{roughness:.7}), roofM=new THREE.MeshStandardMaterial({map:roofM0.map,color:lin([0xffffff,0xc08a78,0x8a9ab0,0xa8a888,0x8a7a9a,0xd0b890][hi%6]),roughness:.9});
  if (ST.brick){ wallM.map=rep(brickTex,5,ST.two?7:4.5); wallM.bumpMap=null; wallM.color=lin([0xc89a86,0xb0a090,0xd0a890][hi%3]); }
  box(10.2,0.5,8.2,foundM,0,0.25,0,g);
  box(10,wh,8,wallM,0,0.4+wh/2,0,g);
  if (ST.two){ box(10.15,0.18,8.15,trimM,0,5.45,0,g);
    [-3.2,0,3.2].forEach(function(wx){ var lit=Math.random()<.35, pm=lit?winLitM:winDarkM; box(1.8,1.6,0.12,trimM,wx,6.6,4.0,g); var pn=box(1.5,1.3,0.06,pm,wx,6.6,4.06,g);
      if (lit){ litWin.push(pn); litFx.push(halo(0xffb060,3.5,wx,6.6,4.4,g,.3)); } }); }
  if (ST.roof===0){
    [-1,1].forEach(function(s){
      var r=box(11,0.16,5.4,roofM,0,top+1.1,s*2.3,g); r.rotation.x = s*0.5;
      var gb=new THREE.Mesh(gableG,wallM); gb.material.side=THREE.DoubleSide; gb.rotation.y=Math.PI/2; gb.position.set(s*4.98,top,0); g.add(gb);
    });
    box(11.1,0.2,0.3,trimM,0,top+2.32,0,g);
    if (hi%4===3){ box(1.8,1.3,1.6,wallM,0,top+1.35,2.3,g); box(1.1,0.8,0.06,winDarkM,0,top+1.4,3.12,g); var dr=box(2.2,0.12,2.0,roofM,0,top+2.05,2.4,g); dr.rotation.x=0.12; }
  } else if (ST.roof===1){
    [-1,1].forEach(function(s){
      var r=box(6.1,0.16,9,roofM,s*2.72,top+1.3,0,g); r.rotation.z=-s*0.456;
      var gb=new THREE.Mesh(gableG2,wallM); gb.material.side=THREE.DoubleSide; gb.position.set(0,top,s*3.98); g.add(gb);
    });
    box(0.3,0.2,9.1,trimM,0,top+2.56,0,g); box(1.0,0.8,0.06,winDarkM,0,top+0.9,4.02,g);
  } else {
    var hip=new THREE.Mesh(new THREE.ConeGeometry(1,2.5,4),roofM); hip.rotation.y=Math.PI/4; hip.scale.set(11.3/Math.SQRT2,1,9.3/Math.SQRT2); hip.position.y=top+1.25; g.add(hip);
  }
  var chx=hi%2?3:-3; box(0.9,2.6,0.9,brickM,chx,top+1.5,-1.2,g); box(1.05,0.15,1.05,trimM,chx,top+2.85,-1.2,g);
  if (ST.garage){
    box(4.6,0.4,6.6,foundM,7.2,0.2,0.6,g); box(4.4,3.0,6.4,wallM,7.2,1.9,0.6,g); var grf=box(4.9,0.18,7.0,roofM,7.2,3.52,0.6,g); grf.rotation.z=-0.07;
    box(3.5,2.4,0.1,garM,7.2,1.6,3.83,g); box(3.7,0.12,0.14,trimM,7.2,2.86,3.84,g); box(3.6,0.05,7.4,walkM,7.2,0.03,7.6,g);
    addBox(hx-side*7.2,z-side*0.6,2.3,3.3);
  }
  if (ST.shut){ var shutM=mat(doorCols[(hi+1)%4],{roughness:.6}); [-3.2,3.2].forEach(function(wx){ [-1.2,1.2].forEach(function(o){ box(0.36,1.7,0.06,shutM,wx+o,3,4.04,g); }); }); }
  // door
  box(1.5,2.6,0.12,trimM,0,1.75,4.0,g);
  var pivot=new THREE.Group(); pivot.position.set(-0.575,1.68,4.05); g.add(pivot);
  box(1.15,2.3,0.1,mat(doorCols[hi%4],{roughness:.5}),0.575,0,0,pivot);
  var knob=new THREE.Mesh(new THREE.SphereGeometry(0.05,8,6),mat(0xb89a4a,{roughness:.3,metalness:.8})); knob.position.set(0.995,-0.08,0.08); pivot.add(knob);
  var hall=box(1.15,2.3,0.02,glow(0xc98a48),0,1.68,4.07,g); hall.visible=false;
  var broken=box(1.15,0.1,2.3,mat(doorCols[hi%4],{roughness:.5}),0.55,0.66,5.25,g); broken.rotation.y=0.3; broken.visible=false;
  var gen=new THREE.Group(); gen.position.set(2.6,0,-4.75); g.add(gen);
  box(1.2,0.08,0.7,ironM,0,0.08,0,gen); box(1.05,0.5,0.56,mat(0x8a2a1a,{roughness:.5,metalness:.3}),0,0.4,0,gen); box(0.5,0.22,0.5,mat(0x1a1b1f,{roughness:.4,metalness:.5}),-0.22,0.76,0,gen);
  cyl(0.05,0.05,0.4,8,ironM,0.38,0.85,0.1,gen); cyl(0.09,0.09,0.06,10,mat(0x2a2a2e),0.2,0.68,0,gen); box(0.06,0.06,0.9,ironM,0.5,0.05,0.5,gen);
  var glamp=new THREE.Mesh(new THREE.SphereGeometry(0.05,8,6),new THREE.MeshBasicMaterial({color:0x38ff6a})); glamp.position.set(0.36,0.5,-0.3); gen.add(glamp);
  var gwx=hx-side*2.6, gwz=z+side*4.75; addBox(gwx,gwz,0.62,0.36);
  houses.push({gen:{g:gen,lamp:glamp,x:gwx,z:gwz,broken:false},power:true,litWin:litWin,litFx:litFx,x:hx,z:z,side:side,g:g,pivot:pivot,hall:hall,broken:broken,cd:0,open:0,n:hi,breached:false,dead:false});
  // windows
  [-3.2,3.2].forEach(function(wx){
    var r=Math.random(), m = r<.3 ? winLitM : (r<.45 ? new THREE.MeshBasicMaterial({map:winDarkTex,color:lin(0x6f9fe0)}) : winDarkM);
    if (m!==winLitM && m!==winDarkM) tvMats.push(m);
    box(2.0,1.8,0.12,trimM,wx,3,4.0,g); var pane=box(1.7,1.5,0.06,m,wx,3,4.06,g); box(2.2,0.1,0.25,trimM,wx,2.06,4.08,g);
    if (m===winLitM){ litWin.push(pane); litFx.push(halo(0xffb060,4,wx,3,4.4,g,.35)); }
  });
  [[-5.03,-1.5],[5.03,1.5]].forEach(function(s){ box(0.08,1.5,1.5,winDarkM,s[0],3,s[1],g); });
  // porch
  box(4,0.3,2.2,porchM,0,0.45,5.1,g); box(2,0.15,0.5,porchM,0,0.2,6.4,g);
  [-1.8,1.8].forEach(function(px){ box(0.16,2.6,0.16,trimM,px,1.9,6,g); });
  var pr=box(4.4,0.12,2.6,roofM,0,3.3,5.2,g); pr.rotation.x=0.16;
  if (hi%3!==1){ var pb=new THREE.Mesh(new THREE.SphereGeometry(0.09,8,6),glow(0xffd9a0)); pb.position.set(1.1,2.7,4.15); g.add(pb); litFx.push(pb); litFx.push(halo(0xffb870,2.4,1.1,2.7,4.3,g,.6)); }
  box(1.3,0.06,5.4,walkM,0,0.05,9.3,g);
  // shrubs + mailbox
  [-3.4,-2.4,2.6,3.6].forEach(function(sx,i){ var s=new THREE.Mesh(new THREE.SphereGeometry(0.75,10,8),shrubM); s.scale.set(1,rand(.7,1),.9); s.position.set(sx,0.75,4.7+(i%2)*.2); g.add(s); });
  cyl(0.04,0.04,1.1,6,ironM,1.2,0.55,11.6,g); box(0.2,0.2,0.45,mat(0x2a2d33,{roughness:.4,metalness:.6}),1.2,1.15,11.6,g);
  addBox(hx,z,5.1,4.1);
  pumpkin(g, (hi%2?1:-1)*rand(1.1,1.5), 5.6, rand(0.9,1.25));
  if (Math.random()<.6) pumpkin(g, (hi%2?-1:1)*rand(1.0,1.5), 5.4, rand(0.6,0.85));
  if (Math.random()<.4) pumpkin(g, (hi%2?1:-1)*0.6, 6.5, 0.6);
  hi++;
}); });
// back yard fences with a gap
var fenceM = new THREE.MeshStandardMaterial({map:rep(plankTex,6,1), roughness:.9, color:lin(0xb9b0a0)});
[-44,-22,0,22,44,66,88,110,132].forEach(function(fx){ [-1,1].forEach(function(s){
  box(0.12,1.9,6.5,fenceM,fx,0.95,s*25.75); addBox(fx,s*25.75,0.1,3.25);
  box(0.12,1.9,7.5,fenceM,fx,0.95,s*36.25); addBox(fx,s*36.25,0.1,3.75);
}); });

/* ---------- street lamps ---------- */
var poleM = mat(0x1c1e22,{roughness:.5,metalness:.6}), bulbM = glow(0xffe2b0);
var lamps = [];
for (var li=0, lx=-60; lx<=144; lx+=21, li++){
  var sgn = (li%2?1:-1), lz = sgn*6.6;
  cyl(0.07,0.11,5.4,8,poleM,lx,2.7,lz); cyl(0.16,0.2,0.5,8,poleM,lx,0.25,lz);
  var arm=cyl(0.045,0.045,1.7,6,poleM,lx,5.35,lz-sgn*0.8); arm.rotation.x=Math.PI/2;
  box(0.34,0.14,0.7,poleM,lx,5.3,lz-sgn*1.7);
  var bx=lx, bz=lz-sgn*1.7;
  var bulb=new THREE.Mesh(new THREE.BoxGeometry(0.24,0.05,0.5),bulbM); bulb.position.set(bx,5.21,bz); scene.add(bulb);
  halo(0xffc070,4.5,bx,5.15,bz,scene,.9);
  var pool=new THREE.Mesh(new THREE.CircleGeometry(8,28), new THREE.MeshBasicMaterial({map:glowTex,color:lin(0xffb060),transparent:true,opacity:.22,depthWrite:false,blending:THREE.AdditiveBlending}));
  pool.rotation.x=-Math.PI/2; pool.position.set(bx,0.05,bz); scene.add(pool);
  addBox(lx,lz,0.15,0.15);
  lamps.push({x:bx,z:bz,sx:lx,sz:lz-sgn*2.6});
}

var carG=null, carCol=null;
/* ---------- car ---------- */
(function(){
  var g=new THREE.Group(); g.position.set(-64,0,2.6); world.add(g); carG=g;
  var paintM=mat(0x4a1418,{roughness:.3,metalness:.5}), glassM=mat(0x0a0d14,{roughness:.08,metalness:.6}), tireM=mat(0x0b0b0c,{roughness:.9});
  box(4.3,0.55,1.75,paintM,0,0.62,0,g); box(4.1,0.2,1.7,paintM,0,0.98,0,g);
  box(2.2,0.6,1.55,glassM,-0.2,1.35,0,g); box(2.0,0.08,1.5,paintM,-0.2,1.68,0,g);
  [[-1.4,.9],[1.4,.9],[-1.4,-.9],[1.4,-.9]].forEach(function(w){ var t=cyl(0.34,0.34,0.24,14,tireM,w[0],0.34,w[1],g); t.rotation.x=Math.PI/2; });
  [0.6,-0.6].forEach(function(z){ box(0.05,0.14,0.3,mat(0xd8d8d0,{roughness:.2}),2.16,0.72,z,g); box(0.05,0.12,0.3,mat(0x5a0a0a,{roughness:.3}),-2.16,0.75,z,g); });
  carCol=addBox(-64,2.6,2.2,0.95);
})();

function secMark(){ return {w:world.children.length,s:scene.children.length,c:colliders.length,l:lamps.length,o:typeof OUTHIDES!=='undefined'?OUTHIDES.length:0}; }
function secErase(m){ world.children.slice(m.w).forEach(function(o){ world.remove(o); }); scene.children.slice(m.s).forEach(function(o){ scene.remove(o); }); colliders.splice(m.c); lamps.splice(m.l); if (typeof OUTHIDES!=='undefined') OUTHIDES.splice(m.o); }
/* ---------- gas station at the west end ---------- */
var STN={x:-94,z:0,cx:-97.15,cz:-4,tx:-95.2,tz:-4};
(function(){
  var lotM=new THREE.MeshStandardMaterial({map:rep(asphaltTex,7,11),bumpMap:rep(asphaltBump,7,11),bumpScale:0.02,roughness:.75,color:lin(0x9a9aa0)});
  var lot=new THREE.Mesh(new THREE.PlaneGeometry(27,40),lotM); lot.rotation.x=-Math.PI/2; lot.position.set(-86.5,0.025,0); world.add(lot);
  hedge(-92,-21,7,1); hedge(-75.5,-21,1.5,1); hedge(-86,21,13,1); hedge(-100,5.5,1,16.5);
  var wallM=new THREE.MeshStandardMaterial({map:rep(concreteTex,4,1),color:lin(0xdcd6c8),roughness:.9}), redM=mat(0xa3211c,{roughness:.5}), whiteM=mat(0xe8e6e0,{roughness:.5});
  var glassM=new THREE.MeshStandardMaterial({color:lin(0x9fc0d0),transparent:true,opacity:.18,roughness:.05,metalness:.3,depthWrite:false});
  var panelM=glow(0xfff6e0), darkM=mat(0x17181c,{roughness:.5});
  function sbox(w,h,d,m,x,y,z,col){ var b=box(w,h,d,m,x,y,z); if (col) addBox(x,z,w/2,d/2); return b; }
  // store
  sbox(8,0.06,16,new THREE.MeshStandardMaterial({map:rep(concreteTex,6,12),roughness:.4}),-94,0.03,0);
  sbox(0.25,3.6,16,wallM,-97.9,1.8,0,true); sbox(8,3.6,0.25,wallM,-94,1.8,-7.9,true); sbox(8,3.6,0.25,wallM,-94,1.8,7.9,true);
  [-4.5,4.5].forEach(function(z){ sbox(0.25,0.9,7,wallM,-90,0.45,z,true); sbox(0.08,2.2,7,glassM,-90,2.0,z); sbox(0.12,2.2,0.12,darkM,-90,2.0,z-3.44*Math.sign(z)); });
  sbox(0.25,0.5,16,wallM,-90,3.35,0); sbox(8.8,0.25,16.8,darkM,-94,3.72,0); sbox(0.3,0.75,16.8,redM,-89.75,3.98,0);
  var signT=canvasTex(512,64,function(g){ g.fillStyle='#a3211c'; g.fillRect(0,0,512,64); g.fillStyle='#fff4e0'; g.font='bold 27px Georgia,serif'; g.textAlign='center'; g.textBaseline='middle'; g.fillText('LANE END GAS  ·  OPEN ALL NIGHT',256,34); });
  var sign=new THREE.Mesh(new THREE.PlaneGeometry(11,0.62),new THREE.MeshBasicMaterial({map:signT})); sign.rotation.y=Math.PI/2; sign.position.set(-89.58,3.98,0); world.add(sign);
  [-4,4].forEach(function(z){ sbox(1.2,0.05,3,panelM,-94,3.57,z); });
  sbox(1,1.0,4,mat(0x6a4a32,{roughness:.6}),-96.2,0.5,-4,true); sbox(1.1,0.06,4.1,darkM,-96.2,1.03,-4); sbox(0.4,0.3,0.45,darkM,-96.2,1.2,-3.2); sbox(0.02,0.2,0.3,glow(0x7fd8a0),-95.99,1.22,-3.2);
  var prod=[0xb59a52,0x3d4f7a,0x7a2f26,0x2f5d50,0xc9c4b4,0x9a4a1a];
  [-94.6,-92.4].forEach(function(x,k){ sbox(0.5,1.5,5,whiteM,x,0.75,3.6,true);
    for (var r=0;r<3;r++) for (var c=0;c<6;c++){ sbox(0.56,0.26,0.6,mat(prod[(r*2+c+k)%6],{roughness:.7}),x,0.42+r*0.45,1.5+c*0.82); } });
  sbox(0.6,2.2,5,darkM,-97.45,1.1,4.2,true); sbox(0.03,1.8,4.6,glow(0x9fd8ff),-97.13,1.15,4.2);
  halo(0xfff0d0,5,-94,3.3,-4,scene,.5); halo(0xfff0d0,5,-94,3.3,4,scene,.5);
  // canopy and pumps
  sbox(9,0.4,12,whiteM,-81,4.7,0); sbox(9.1,0.5,0.15,redM,-81,4.7,6.05); sbox(9.1,0.5,0.15,redM,-81,4.7,-6.05); sbox(0.15,0.5,12.2,redM,-76.45,4.7,0); sbox(0.15,0.5,12.2,redM,-85.55,4.7,0);
  [-4.2,4.2].forEach(function(z){ sbox(0.4,4.5,0.4,whiteM,-81,2.25,z,true); });
  [[-83,-2.5],[-79,-2.5],[-83,2.5],[-79,2.5]].forEach(function(p){ sbox(1.4,0.05,1.4,panelM,p[0],4.48,p[1]); });
  halo(0xfff0d0,9,-81,4.2,0,scene,.6);
  sbox(1.3,0.16,7,mat(0x8a8a8a),-81,0.08,0);
  [-2,2].forEach(function(z){ sbox(0.7,1.5,0.5,redM,-81,0.9,z,true); sbox(0.72,0.4,0.52,whiteM,-81,1.5,z); sbox(0.4,0.22,0.02,glow(0x9fe8b0),-81,1.5,z+0.27); sbox(0.4,0.22,0.02,glow(0x9fe8b0),-81,1.5,z-0.27);
    var hose=cyl(0.025,0.025,0.9,6,darkM,-80.6,0.9,z); });
  // roadside sign
  cyl(0.1,0.14,6.2,8,poleM,-76,3.1,-16); addBox(-76,-16,0.2,0.2);
  var st2=canvasTex(256,160,function(g){ g.fillStyle='#fff4e0'; g.fillRect(0,0,256,160); g.fillStyle='#a3211c'; g.fillRect(0,0,256,62); g.fillStyle='#fff4e0'; g.font='bold 50px Georgia,serif'; g.textAlign='center'; g.fillText('GAS',128,50); g.fillStyle='#17181c'; g.font='bold 54px Georgia,serif'; g.fillText('1.19',128,130); });
  [1,-1].forEach(function(s){ var p=new THREE.Mesh(new THREE.PlaneGeometry(2.6,1.6),new THREE.MeshBasicMaterial({map:st2})); p.position.set(-76+s*0.13,5.6,-16); p.rotation.y=s*Math.PI/2; world.add(p); });
  sbox(0.24,1.7,2.7,darkM,-76,5.6,-16);
  // automatic sliding doors
  var doorGlass=new THREE.MeshStandardMaterial({color:lin(0xa8cfe0),transparent:true,opacity:.3,roughness:.05,metalness:.3,depthWrite:false});
  STN.doors=[-1,1].map(function(sd){
    var g=new THREE.Group(); g.position.set(-90,0,sd*0.5); world.add(g);
    box(0.05,2.9,0.94,doorGlass,0,1.55,0,g); box(0.08,3.0,0.06,darkM,0,1.55,-0.47,g); box(0.08,3.0,0.06,darkM,0,1.55,0.47,g); box(0.08,0.08,1.0,darkM,0,3.06,0,g); box(0.08,0.1,1.0,darkM,0,0.1,0,g);
    return {g:g,sd:sd};
  });
  sbox(0.3,0.12,2.2,darkM,-90,3.16,0); sbox(0.12,0.05,0.2,glow(0x7fd8a0),-89.82,3.16,0);
  STN.col=addBox(-90,0,0.14,1.0); STN.open=0; STN.want=0;
  lamps.push({x:-94,z:0,sx:-94,sz:0}); lamps.push({x:-81,z:0,sx:-81,sz:0});
})();

/* ---------- west side: the park and the churchyard (removed) ---------- */
var swings=[], spinner=null, __parkM=secMark();
(function(){
  hedge(-130,-41,31,1); hedge(-130,41,31,1); hedge(-160,0,1,42); hedge(-100,-31.5,1,9.5); hedge(-100,31.5,1,9.5);
  var gravel=new THREE.MeshStandardMaterial({map:rep(concreteTex,20,2),color:lin(0x8a8272),roughness:1});
  function flat(w,d,x,z){ var p=new THREE.Mesh(new THREE.PlaneGeometry(w,d),gravel); p.rotation.x=-Math.PI/2; p.position.set(x,0.03,z); world.add(p); }
  flat(60,3,-130,-15); flat(3,34,-125,2);
  var red=mat(0xa3211c,{roughness:.5}), blue=mat(0x2f4f8a,{roughness:.5}), yel=mat(0xc9a227,{roughness:.5}), steel=mat(0x7a7e84,{roughness:.4,metalness:.5});
  var wood=new THREE.MeshStandardMaterial({map:rep(plankTex,2,1),color:lin(0x7a5a3a),roughness:.8}), stone=new THREE.MeshStandardMaterial({map:rep(stoneTex,2,2),color:lin(0xa8a8a0),roughness:.95});
  var grave=mat(0x8f918c,{roughness:.95}), bark=mat(0x2a211a,{roughness:1});
  var up=new THREE.Vector3(0,1,0), va=new THREE.Vector3(), vb=new THREE.Vector3();
  function rod(x1,y1,z1,x2,y2,z2,r,m,parent){
    va.set(x1,y1,z1); vb.set(x2,y2,z2); var len=va.distanceTo(vb);
    var c=new THREE.Mesh(new THREE.CylinderGeometry(r,r,len,6),m); c.position.copy(va).add(vb).multiplyScalar(0.5);
    c.quaternion.setFromUnitVectors(up,vb.clone().sub(va).normalize()); (parent||world).add(c); return c;
  }
  function lamp(x,z){
    cyl(0.06,0.09,3.6,8,poleM,x,1.8,z); var b=new THREE.Mesh(new THREE.SphereGeometry(0.2,10,8),glow(0xffe2b0)); b.position.set(x,3.75,z); scene.add(b);
    halo(0xffc070,4,x,3.75,z,scene,.9);
    var pool=new THREE.Mesh(new THREE.CircleGeometry(7,24),new THREE.MeshBasicMaterial({map:glowTex,color:lin(0xffb060),transparent:true,opacity:.2,depthWrite:false,blending:THREE.AdditiveBlending}));
    pool.rotation.x=-Math.PI/2; pool.position.set(x,0.05,z); scene.add(pool);
    addBox(x,z,0.12,0.12); lamps.push({x:x,z:z,sx:x,sz:z});
  }
  function bench(x,z){ box(1.7,0.08,0.45,wood,x,0.45,z); box(1.7,0.5,0.07,wood,x,0.8,z-0.22); [-0.7,0.7].forEach(function(o){ box(0.07,0.45,0.4,steel,x+o,0.22,z); }); addBox(x,z,0.85,0.25); }

  // playground
  var sx=-116, sz=-28;
  [-2.1,2.1].forEach(function(o){ rod(sx+o,0,sz-1,sx+o,2.7,sz,0.05,red); rod(sx+o,0,sz+1,sx+o,2.7,sz,0.05,red); });
  rod(sx-2.1,2.7,sz,sx+2.1,2.7,sz,0.05,red);
  [-0.9,0.9].forEach(function(o,i){ var g=new THREE.Group(); g.position.set(sx+o,2.7,sz); world.add(g);
    rod(-0.25,0,0,-0.25,-2.1,0,0.012,steel,g); rod(0.25,0,0,0.25,-2.1,0,0.012,steel,g); box(0.6,0.05,0.22,blue,0,-2.12,0,g); swings.push(g); });
  addBox(sx-2.1,sz,0.15,1); addBox(sx+2.1,sz,0.15,1);
  box(1.4,0.1,1.4,yel,-107,1.6,-31); [[-0.6,-0.6],[0.6,-0.6],[-0.6,0.6],[0.6,0.6]].forEach(function(p){ rod(-107+p[0],0,-31+p[1],-107+p[0],2.5,-31+p[1],0.04,blue); });
  for (var r=0;r<5;r++) rod(-107.6,0.3+r*0.3,-31.7,-106.4,0.3+r*0.3,-31.7,0.02,steel);
  var chute=box(0.8,0.06,3.6,steel,-107,0.86,-28.6); chute.rotation.x=0.44; box(0.05,0.2,3.6,red,-107.4,0.95,-28.6).rotation.x=0.44; box(0.05,0.2,3.6,red,-106.6,0.95,-28.6).rotation.x=0.44;
  addBox(-107,-30.2,0.75,2.4);
  box(0.3,0.5,0.3,steel,-112,0.25,-22); var saw=box(3.4,0.08,0.3,yel,-112,0.56,-22); saw.rotation.z=0.16; addBox(-112,-22,1.6,0.2);
  spinner=new THREE.Group(); spinner.position.set(-122,0,-33); world.add(spinner);
  cyl(1.4,1.4,0.12,16,red,0,0.3,0,spinner); cyl(0.08,0.08,0.3,8,steel,0,0.15,0,spinner);
  for (var a=0;a<4;a++){ var ca=Math.cos(a*Math.PI/2), sa=Math.sin(a*Math.PI/2); rod(ca*1.25,0.36,sa*1.25,ca*1.25,1.1,sa*1.25,0.025,yel,spinner); rod(ca*1.25,1.1,sa*1.25,0,1.1,0,0.025,yel,spinner); }
  addBox(-122,-33,1.2,1.2);
  [[2.6,0.25,0.2,0,-1.2],[2.6,0.25,0.2,0,1.2],[0.2,0.25,2.6,-1.2,0],[0.2,0.25,2.6,1.2,0]].forEach(function(b){ box(b[0],b[1],b[2],wood,-104.5+b[3],0.125,-35+b[4]); });
  box(2.3,0.1,2.3,mat(0xb9a678,{roughness:1}),-104.5,0.06,-35);
  bench(-110,-11.9); bench(-133,-11.9); bench(-150,-18.2);
  lamp(-112,-17.4); lamp(-140,-12.6);
  // gazebo
  var gx=-146, gz=-28; cyl(2.7,2.8,0.25,8,wood,gx,0.125,gz);
  for (var p=0;p<8;p++){ var pa=p*Math.PI/4+Math.PI/8; box(0.14,2.6,0.14,trimM,gx+Math.cos(pa)*2.45,1.55,gz+Math.sin(pa)*2.45); }
  var gr=new THREE.Mesh(new THREE.ConeGeometry(3.3,1.6,8),roofM); gr.position.set(gx,3.65,gz); gr.rotation.y=Math.PI/8; world.add(gr);
  var gl=new THREE.Mesh(new THREE.SphereGeometry(0.12,8,6),glow(0xffe2b0)); gl.position.set(gx,2.7,gz); scene.add(gl); halo(0xffc070,3,gx,2.7,gz,scene,.8); lamps.push({x:gx,z:gz,sx:gx,sz:gz});

  // churchyard
  function fenceRun(x1,x2,z){ var len=x2-x1, cx=(x1+x2)/2; box(len,0.05,0.05,ironM,cx,1.25,z); box(len,0.05,0.05,ironM,cx,0.3,z);
    for (var x=x1;x<=x2+0.01;x+=0.85) box(0.045,1.5,0.045,ironM,x,0.75,z); addBox(cx,z,len/2,0.08); }
  fenceRun(-158.6,-127.2,4.5); fenceRun(-122.8,-101.4,4.5);
  [-127.2,-122.8].forEach(function(x){ box(0.5,2.1,0.5,stone,x,1.05,4.5); box(0.65,0.15,0.65,stone,x,2.15,4.5); addBox(x,4.5,0.3,0.3); });
  var arch=box(4.9,0.12,0.12,ironM,-125,2.5,4.5);
  for (var row=0;row<4;row++) for (var gxp=-153;gxp<=-104;gxp+=5.5){
    var x=gxp+rand(-0.8,0.8), z=10.5+row*6+rand(-0.7,0.7), k=Math.floor(rand(0,3));
    if ((x<-139.5 && x>-152.5 && z>23) || Math.abs(x+125)<2.6 || (x>-111 && z>30)) continue;
    var g=new THREE.Group(); g.position.set(x,0,z); g.rotation.set(rand(-0.06,0.06),rand(-0.25,0.25),rand(-0.1,0.1)); world.add(g);
    if (k===0){ box(0.7,1.0,0.16,grave,0,0.5,0,g); }
    else if (k===1){ box(0.66,0.8,0.16,grave,0,0.4,0,g); var c=cyl(0.33,0.33,0.16,12,grave,0,0.8,0,g); c.rotation.x=Math.PI/2; }
    else { box(0.18,1.3,0.16,grave,0,0.65,0,g); box(0.7,0.18,0.16,grave,0,0.95,0,g); }
    box(0.9,0.1,0.35,grave,0,0.05,0,g); addBox(x,z,0.38,0.14);
  }
  // chapel
  var cx0=-146, cz0=31;
  box(7,5,10,stone,cx0,2.5,cz0); addBox(cx0,cz0,3.6,5.1);
  [-1,1].forEach(function(s){ var r=box(4.7,0.18,10.8,roofM,cx0+s*1.85,6.25,cz0); r.rotation.z=-s*0.72; });
  var gb=new THREE.Shape(); gb.moveTo(-3.5,0); gb.lineTo(3.5,0); gb.lineTo(0,3.05); gb.lineTo(-3.5,0);
  [-5.0,5.0].forEach(function(o){ var m=new THREE.Mesh(new THREE.ShapeGeometry(gb),stone); m.material.side=THREE.DoubleSide; m.position.set(cx0,5,cz0+o); world.add(m); });
  box(2.6,9,2.6,stone,cx0,4.5,cz0-6.2); addBox(cx0,cz0-6.2,1.4,1.4);
  var sp=new THREE.Mesh(new THREE.ConeGeometry(1.9,4,4),roofM); sp.position.set(cx0,11,cz0-6.2); sp.rotation.y=Math.PI/4; world.add(sp);
  box(0.12,1.3,0.12,ironM,cx0,13.5,cz0-6.2); box(0.7,0.12,0.12,ironM,cx0,13.75,cz0-6.2);
  box(1.3,2.4,0.1,mat(0x2a1a14,{roughness:.6}),cx0,1.2,cz0-7.53);
  var glassT=canvasTex(32,64,function(g){ var cols=['#7a1f2a','#1f3f7a','#b98a1f','#2a6a4a','#5a2a6a']; for (var y=0;y<8;y++) for (var x=0;x<4;x++){ g.fillStyle=cols[(x*3+y*2)%5]; g.fillRect(x*8,y*8,7,7); } });
  var glassM=new THREE.MeshBasicMaterial({map:glassT,color:lin(0xb0a090)});
  [-2.6,0.4,3.4].forEach(function(o){ box(0.06,2.2,1.0,glassM,cx0-3.53,2.9,cz0+o); box(0.06,2.2,1.0,glassM,cx0+3.53,2.9,cz0+o); });
  var lan=new THREE.Mesh(new THREE.SphereGeometry(0.11,8,6),glow(0xffd9a0)); lan.position.set(cx0+0.95,2.5,cz0-7.6); scene.add(lan); halo(0xffb870,2.6,cx0+0.95,2.5,cz0-7.7,scene,.7); lamps.push({x:cx0,z:cz0-9,sx:cx0,sz:cz0-9});
  // mausoleum
  box(3.4,2.6,4,stone,-107,1.3,34.5); box(3.9,0.3,4.5,stone,-107,2.75,34.5); box(1.1,1.9,0.1,ironM,-107,0.95,32.46); addBox(-107,34.5,1.8,2.1);
  [-1.2,1.2].forEach(function(o){ cyl(0.16,0.18,2.5,10,stone,-107+o,1.25,32.3); });
  // bare trees
  [[-132,13],[-118,27],[-154,14],[-128,36],[-104,12]].forEach(function(t,i){
    var x=t[0], z=t[1]; rod(x,0,z,x+rand(-0.3,0.3),3.6,z+rand(-0.3,0.3),0.2,bark);
    for (var b=0;b<5;b++){ var a=b*1.3+i, h=2+b*0.35, L=1.6+rand(0,1.2); var ex=x+Math.cos(a)*L, ez=z+Math.sin(a)*L, ey=h+rand(0.8,1.6);
      rod(x,h,z,ex,ey,ez,0.07,bark); rod(ex,ey,ez,ex+Math.cos(a+0.6)*0.9,ey+0.7,ez+Math.sin(a+0.6)*0.9,0.035,bark); }
    addBox(x,z,0.3,0.3);
  });
})();

secErase(__parkM); hedge(-100,-26,1,15); hedge(-100,31.5,1,9.5); hedge(-87,-41,13,1); hedge(-87,41,13,1);
/* ---------- trees ---------- */
var trunkM = new THREE.MeshStandardMaterial({map:rep(barkTex,2,3),roughness:1});
var leafMs = [0x7a3a12,0x8a5a14,0x4a2a10,0x2f4a22,0x6a2414].map(function(c){ return new THREE.MeshStandardMaterial({map:leafTex,color:lin(c),roughness:1}); });
var blobGs = [0,1,2].map(function(k){ var g=new THREE.IcosahedronGeometry(1,2), p=g.attributes.position;
  for (var i=0;i<p.count;i++){ var x=p.getX(i), y=p.getY(i), z=p.getZ(i), s=0.78+0.4*vnoise(x*2.2+k*7+9,y*2.2+z*2.2+9,64); p.setXYZ(i,x*s,y*s*.85,z*s); }
  g.computeVertexNormals(); return g; });
var leafSway=[], windU={value:0};
var trunkG = new THREE.CylinderGeometry(0.16,0.34,4,8), branchG = new THREE.CylinderGeometry(0.05,0.11,2.2,5);
for (var ti=0, placed=0; ti<900 && placed<58; ti++){
  var west=false, tx=rand(-69,143), tz=rand(-38,38);
  if ((!west && Math.abs(tz)<9) || (west && Math.abs(tz+15)<3.5) || blocked(tx,tz,2.6)) continue;
  var tg=new THREE.Group(); tg.position.set(tx,0,tz); tg.rotation.y=Math.random()*6; var ts=rand(.9,1.35); tg.scale.setScalar(ts); world.add(tg);
  var tr=new THREE.Mesh(trunkG,trunkM); tr.position.y=2; tr.rotation.z=rand(-.05,.05); tg.add(tr);
  for (var b=0;b<3;b++){ var br=new THREE.Mesh(branchG,trunkM), a=b*2.1+rand(-.3,.3); br.position.set(Math.cos(a)*.7,3.6+b*.25,Math.sin(a)*.7); br.rotation.set(Math.sin(a)*.8,0,-Math.cos(a)*.8); tg.add(br);
    var lf=new THREE.Mesh(blobGs[(placed+b)%3],leafMs[(placed+b)%5]); var s=rand(1.2,1.7); lf.scale.setScalar(s); lf.position.set(Math.cos(a)*1.5,4.7+b*.4,Math.sin(a)*1.5); tg.add(lf); lf.userData.b=lf.position.clone(); lf.userData.ph=tx*0.3+tz*0.2+b; leafSway.push(lf); }
  var top=new THREE.Mesh(blobGs[placed%3],leafMs[placed%5]); top.scale.setScalar(rand(1.5,2)); top.position.y=6; tg.add(top); top.userData.b=top.position.clone(); top.userData.ph=tx*0.3+tz*0.2+4; leafSway.push(top);
  addBox(tx,tz,0.34*ts,0.34*ts); placed++;
}
world.traverse(function(o){ if (o.isMesh && o.material.isMeshStandardMaterial && !o.material.transparent){ o.castShadow=true; o.receiveShadow=true; } });
ground.castShadow=false; road.castShadow=false;

var grassInst=null, grassMax=0;
/* ---------- grass, mist, leaves ---------- */
(function(){
  var n = isTouch ? 8000 : 20000;
  var g=new THREE.PlaneGeometry(0.6,0.36); g.translate(0,0.18,0);
  var m=new THREE.MeshStandardMaterial({map:bladeTex,alphaTest:.5,side:THREE.DoubleSide,roughness:1});
  m.onBeforeCompile=function(sh){ sh.uniforms.uTime=windU; sh.vertexShader='uniform float uTime;\n'+sh.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\n#ifdef USE_INSTANCING\n float wph=instanceMatrix[3].x*0.55+instanceMatrix[3].z*0.4; transformed.x+=(sin(uTime*1.6+wph)+sin(uTime*3.3+wph*1.7)*0.4)*0.085*uv.y;\n#endif'); };
  var inst=new THREE.InstancedMesh(g,m,n), o=new THREE.Object3D(), c=new THREE.Color(), k=0;
  for (var i=0;i<n*3 && k<n;i++){
    var x=rand(-73,147), z=rand(-39.5,39.5);
    if (Math.abs(z)<6.3 || (x<-58 && z>4 && z<13.5) || blocked(x,z,0.05)) continue;
    o.position.set(x,0,z); o.rotation.y=Math.random()*3.14; var s=rand(.7,1.5); o.scale.set(s,s*rand(.7,1.3),s); o.updateMatrix();
    inst.setMatrixAt(k,o.matrix); var dry=Math.random(); c.setRGB(.15+dry*.12,.22+dry*.06,.07); inst.setColorAt(k,c); k++;
  }
  inst.count=k; inst.receiveShadow=true; scene.add(inst); grassInst=inst; grassMax=k; Math.random=seededRandom(7741);
})();
var mist=[];
(function(){
  var m=new THREE.SpriteMaterial({map:mistTex,color:lin(0x8fa0c4),transparent:true,opacity:.5,depthWrite:false});
  for (var i=0;i<(isTouch?16:30);i++){ var s=new THREE.Sprite(m); var sc=rand(14,26); s.scale.set(sc,sc*.45,1); s.position.set(rand(-70,140),rand(.6,1.6),rand(-38,38)); s.userData.v=rand(.15,.5); scene.add(s); mist.push(s); }
})();
var leafPts=(function(){
  var n=260, pos=new Float32Array(n*3), ph=[];
  for (var i=0;i<n;i++){ pos[i*3]=rand(-22,22); pos[i*3+1]=rand(0,9); pos[i*3+2]=rand(-22,22); ph.push(rand(0,6)); }
  var g=new THREE.BufferGeometry(); g.setAttribute('position',new THREE.BufferAttribute(pos,3));
  var lt=canvasTex(16,16,function(c){ c.fillStyle='#fff'; c.beginPath(); c.ellipse(8,8,7,3.5,.6,0,7); c.fill(); });
  var p=new THREE.Points(g,new THREE.PointsMaterial({map:lt,color:lin(0x8a4a1a),size:.14,transparent:true,alphaTest:.3,sizeAttenuation:true}));
  p.frustumCulled=false; scene.add(p); return {p:p,pos:pos,ph:ph,n:n};
})();

/* ---------- flashlight in hand ---------- */
var vmGlove, vmSleeve;
var vm=new THREE.Group(); camera.add(vm);
var lensM=glow(0xfff4d8);
(function(){
  var metal=mat(0x26282d,{roughness:.32,metalness:.7,emissive:lin(0x050506)}), glove=mat(0x2a2623,{roughness:.9,emissive:lin(0x040404)}), sleeve=mat(0x2b3442,{roughness:.95,emissive:lin(0x030405)}); vmGlove=glove; vmSleeve=sleeve;
  var f=new THREE.Group(); f.rotation.x=Math.PI/2; vm.add(f);            // cylinder axis along the view direction, -Y is forward
  cyl(0.02,0.02,0.2,16,metal,0,0.02,0,f); cyl(0.034,0.021,0.055,16,metal,0,-0.105,0,f); cyl(0.036,0.036,0.03,16,metal,0,-0.145,0,f); cyl(0.021,0.021,0.012,16,metal,0,0.125,0,f);
  var lens=new THREE.Mesh(new THREE.CircleGeometry(0.031,18),lensM); lens.rotation.x=Math.PI/2; lens.position.y=-0.161; f.add(lens);
  var palm=new THREE.Mesh(new THREE.SphereGeometry(0.042,14,10),glove); palm.scale.set(1.05,0.95,1.35); palm.position.set(0.004,-0.012,0.03); vm.add(palm);
  [-.036,-.012,.012,.036].forEach(function(z){ var k=new THREE.Mesh(new THREE.SphereGeometry(0.015,8,6),glove); k.scale.set(1.5,1,1); k.position.set(-0.012,0.026,0.03+z); vm.add(k); });
  var th=new THREE.Mesh(new THREE.SphereGeometry(0.014,8,6),glove); th.scale.set(1,1,2.6); th.position.set(0.024,0.022,-0.012); vm.add(th);
  limb(vm,[0.012,-0.02,0.06],[0.1,-0.2,0.34],0.034,0.046,sleeve); limb(vm,[0.006,-0.014,0.045],[0.03,-0.06,0.12],0.03,0.033,glove);
})();
// a forearm from a to b, thinner at the hand end
function limb(g,a,b,r0,r1,m){ var A=new THREE.Vector3(a[0],a[1],a[2]), B=new THREE.Vector3(b[0],b[1],b[2]), d=B.clone().sub(A), L=d.length();
  var c=new THREE.Mesh(new THREE.CylinderGeometry(r0,r1,L,7),m); c.position.copy(A).add(B).multiplyScalar(0.5); c.quaternion.setFromUnitVectors(new THREE.Vector3(0,-1,0),d.normalize()); g.add(c); return c; }
var vmL=new THREE.Group(); camera.add(vmL); vmL.visible=false;
(function(){
  var fist=new THREE.Mesh(new THREE.SphereGeometry(0.045,14,10),vmGlove); fist.scale.set(1.1,1,1.2); vmL.add(fist);
  [-.03,-.01,.01,.03].forEach(function(x){ var k=new THREE.Mesh(new THREE.SphereGeometry(0.016,8,6),vmGlove); k.position.set(x,0.012,-0.05); vmL.add(k); });
  var th=new THREE.Mesh(new THREE.SphereGeometry(0.016,8,6),vmGlove); th.scale.set(1,1,2); th.position.set(0.046,0,-0.01); vmL.add(th);
  limb(vmL,[-0.004,-0.02,0.04],[-0.025,-0.06,0.12],0.032,0.035,vmGlove); limb(vmL,[-0.01,-0.03,0.07],[-0.09,-0.2,0.36],0.036,0.048,vmSleeve);
})();
var vmBase={x:0.2,y:-0.17,z:-0.4}, sway={x:0,y:0}, vmRole=null;
vm.position.set(vmBase.x,vmBase.y,vmBase.z);

/* ---------- fuses ---------- */
var fuseGroup=new THREE.Group(); scene.add(fuseGroup);
var fuseBodyM=glow(0xffb347), fuseCapM=mat(0x9a9da3,{roughness:.3,metalness:.8});
var beamM=new THREE.MeshBasicMaterial({color:lin(0xff9a3a),transparent:true,opacity:.1,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide});
var fuses=[];
function placeFuses(){
  while (fuseGroup.children.length) fuseGroup.remove(fuseGroup.children[0]);
  fuses=[]; var cands=[];
  houseXs.forEach(function(hx){ [-1,1].forEach(function(s){ cands.push([hx+rand(-4,4), s*rand(26,36)]); cands.push([hx+7.5+rand(-1,1), s*rand(13,23)]); }); });
  if (game.role!=='killer') [[-118,-25],[-146,-22],[-134,21],[-139,34],[-112,28],[-104,-31]].forEach(function(c){ cands.push(c); });
  var westN=0, westMax=Math.max(1,Math.floor(FUSES/3));
  cands.sort(function(){ return Math.random()-.5; });
  for (var i=0;i<cands.length && fuses.length<FUSES;i++){
    var x=cands[i][0], z=cands[i][1];
    if (x>-73 && x<-40 && Math.abs(z)<20) continue;
    if (x>68 || blocked(x,z,1)) continue;
    if (x<-100 && westN>=westMax) continue;
    var ok=true; for (var j=0;j<fuses.length;j++) if (Math.hypot(fuses[j].x-x,fuses[j].z-z)<(FUSES>5?15:24)) ok=false;
    if (!ok) continue;
    if (x<-100) westN++;
    var g=new THREE.Group(); g.position.set(x,0,z);
    var core=new THREE.Group(); core.position.y=.8; g.add(core);
    core.add(new THREE.Mesh(new THREE.CylinderGeometry(0.09,0.09,0.36,12),fuseBodyM));
    [-.2,.2].forEach(function(y){ var c=new THREE.Mesh(new THREE.CylinderGeometry(0.1,0.1,0.08,12),fuseCapM); c.position.y=y; core.add(c); });
    core.rotation.z=.5;
    halo(0xffa040,1.8,0,.8,0,g);
    var beam=new THREE.Mesh(new THREE.CylinderGeometry(0.1,0.1,14,8,1,true),beamM); beam.position.y=7; g.add(beam);
    fuseGroup.add(g); fuses.push({x:x,z:z,g:g,core:core,taken:false});
  }
}

/* ---------- the stalker ---------- */
var stalker=(function(){
  var g=new THREE.Group(), prim=new THREE.Group(); g.add(prim);
  var suit=mat(0x1a2432), boot=mat(0x08080a), skin=mat(0x8a8576);
  function limb(w,h,d,m,x,y){ var piv=new THREE.Group(); piv.position.set(x,y,0); var b=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),m); b.position.y=-h/2; b.castShadow=true; piv.add(b); prim.add(piv); return piv; }
  var legL=limb(0.24,0.95,0.26,suit,-0.15,0.95), legR=limb(0.24,0.95,0.26,suit,0.15,0.95);
  box(0.26,0.12,0.36,boot,0,-0.95,0.05,legL); box(0.26,0.12,0.36,boot,0,-0.95,0.05,legR);
  box(0.66,0.82,0.36,suit,0,1.36,0,prim).castShadow=true;
  var armL=limb(0.2,0.8,0.22,suit,-0.44,1.72), armR=limb(0.2,0.8,0.22,suit,0.44,1.72);
  var head=new THREE.Mesh(new THREE.SphereGeometry(0.2,16,12),skin); head.position.y=2.02; prim.add(head);
  g.visible=false; scene.add(g);
  return {g:g, prim:prim, legL:legL, legR:legR, armL:armL, armR:armR, model:null, mixer:null, actions:{}, cur:'',
          state:'away', timer:0, phase:0, stuck:0, unseen:0, lastX:0, lastZ:0, tx:0, tz:0, raise:0};
})();
var maskM=new THREE.MeshStandardMaterial({map:maskTex,roughness:.5,emissive:lin(0x2c2c28),side:THREE.DoubleSide});
function makeMask(){ var m=new THREE.Mesh(new THREE.SphereGeometry(0.125,22,16,0,Math.PI),maskM); m.scale.set(0.86,1.14,0.85); m.castShadow=true; return m; }
function makeKnife(){
  var k=new THREE.Group();
  var blade=new THREE.Mesh(new THREE.BoxGeometry(0.012,0.24,0.05), mat(0xcfd6de,{roughness:.22,metalness:.55,emissive:lin(0x15171a)})); blade.position.y=0.19; blade.castShadow=true; k.add(blade);
  var tip=new THREE.Mesh(new THREE.ConeGeometry(0.028,0.09,4), blade.material); tip.scale.set(0.3,1,1); tip.rotation.y=Math.PI/4; tip.position.y=0.355; k.add(tip);
  var h=new THREE.Mesh(new THREE.CylinderGeometry(0.018,0.02,0.14,8), mat(0x16110d,{roughness:.6})); k.add(h);
  k.userData.blade=blade; return k;
}
(function(){ // fallback mask + knife on the simple body until the rigged model arrives
  var m=makeMask(); m.position.set(0,2.02,0.1); m.scale.multiplyScalar(1.5); stalker.prim.add(m);
  var k=makeKnife(); k.position.set(0,-0.86,0.05); k.rotation.x=Math.PI/2; stalker.armR.add(k);
})();
function setAnim(name){ anim(stalker,name); }
function anim(S,name){
  if (!S.mixer || S.cur===name) return;
  var a=S.actions[name], b=S.actions[S.cur]; if (!a) return;
  if (b){ a.reset().fadeIn(0.3).play(); b.fadeOut(0.3); } else a.reset().play(); S.cur=name;
}
function b64buf(str){ var bin=atob(str), buf=new Uint8Array(bin.length); for (var i=0;i<bin.length;i++) buf[i]=bin.charCodeAt(i); return buf.buffer; }
// The walk, idle and run motions are stored once and re-aimed at each character's skeleton.
function makeClips(anims, prefix, C, posScale){
  var clips={}, q=new THREE.Quaternion(), v=new THREE.Vector3();
  Object.keys(anims).forEach(function(name){
    var tracks=anims[name].tr.map(function(t){
      var vals=t.v.slice(), i;
      if (t.b==='Hips'){
        if (t.p==='q') for (i=0;i<vals.length;i+=4){ q.set(vals[i],vals[i+1],vals[i+2],vals[i+3]).premultiply(C); vals[i]=q.x; vals[i+1]=q.y; vals[i+2]=q.z; vals[i+3]=q.w; }
        else for (i=0;i<vals.length;i+=3){ v.set(vals[i],vals[i+1],vals[i+2]).applyQuaternion(C).multiplyScalar(posScale); vals[i]=v.x; vals[i+1]=v.y; vals[i+2]=v.z; }
      }
      return t.p==='q' ? new THREE.QuaternionKeyframeTrack(prefix+t.b+'.quaternion',t.t,vals) : new THREE.VectorKeyframeTrack(prefix+t.b+'.position',t.t,vals);
    });
    clips[name]=new THREE.AnimationClip(name,anims[name].d,tracks);
  });
  return clips;
}
function qx(a){ return new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),a); }
function qy(a){ return new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),a); }
var NETTPL={};
function loadStalker(){
  var A=window.HL_ASSETS; if (!THREE.GLTFLoader || !A) return;
  window.HL_ASSETS=null;
  var manBuf=b64buf(A.man), womanBuf=b64buf(A.woman);
  var manClips=makeClips(A.anims,'', qy(Math.PI).multiply(qx(-Math.PI/2)), 0.01*1.019/1.061);
  var womanClips=makeClips(A.anims,'mixamorig', qx(-Math.PI/2).multiply(qy(Math.PI)).multiply(qx(-Math.PI/2)), 102.6/106.1);
  new THREE.GLTFLoader().parse(manBuf, '', function(gltf){
  var S=stalker, model=gltf.scene;
  model.scale.setScalar(1.1);
  model.traverse(function(o){ if (o.isMesh){ o.castShadow=true; o.receiveShadow=true; o.frustumCulled=false;
    var n=o.material.name||''; o.material=o.material.clone(); o.material.metalness=0;
    if (/Outfit/.test(n)){ o.material.map=null; o.material.normalMap=o.material.normalMap; o.material.color=lin(/Footwear/.test(n)?0x0c0c0e:0x1c2533); o.material.roughness=.9; o.material.needsUpdate=true; }
    else if (/Skin|Body/.test(n)){ o.material.color=lin(0xb9b4ac); }
    else if (/Hair|Headwear|Beard/.test(n)){ o.material.color=lin(0x30261e); } } });
  S.g.add(model); S.prim.visible=false; S.model=model;
  NETTPL.k=cloneSkinned(model); NETTPL.mc=manClips; NETTPL.wc=womanClips;
  S.mixer=new THREE.AnimationMixer(model);
  Object.keys(manClips).forEach(function(k){ S.actions[k]=S.mixer.clipAction(manClips[k]); });
  S.head=model.getObjectByName('Head'); S.hand=model.getObjectByName('RightHand'); S.arm=model.getObjectByName('RightArm'); S.fore=model.getObjectByName('RightForeArm'); S.L=findBones(model,''); S.fingers=[]; ['Index','Middle','Ring','Pinky'].forEach(function(f){ for (var fi=1;fi<=3;fi++){ var fb=model.getObjectByName('RightHand'+f+fi); if (fb) S.fingers.push(fb); } });
  model.updateMatrixWorld(true);
  var ws=new THREE.Vector3();
  if (S.head){ S.head.getWorldScale(ws); var hm=new THREE.Group(); hm.scale.setScalar(1/ws.x); hm.add(makeMask()); hm.position.set(MASK_POS[0]/ws.x,MASK_POS[1]/ws.x,MASK_POS[2]/ws.x); S.head.add(hm); S.maskHolder=hm; }
  if (S.hand){ S.hand.getWorldScale(ws); var kh=new THREE.Group(); kh.scale.setScalar(1/ws.x); var kn=makeKnife(); kh.add(kn); kh.position.set(KNIFE_POS[0]/ws.x,KNIFE_POS[1]/ws.x,KNIFE_POS[2]/ws.x); kh.rotation.set(KNIFE_ROT[0],KNIFE_ROT[1],KNIFE_ROT[2]); S.hand.add(kh); S.knifeHolder=kh; }
  S.cur=''; setAnim(S.state==='hunt'?'Walk':'Idle');
  }, function(){});
  new THREE.GLTFLoader().parse(manBuf.slice(0), '', function(gltf){
    var m=gltf.scene, mats=[], beards=[], hats=[];
    m.traverse(function(o){ if (o.isMesh){ o.castShadow=true; o.frustumCulled=false;
      var n=o.material.name||''; o.material=o.material.clone(); o.material.metalness=0;
      if (/Outfit_(Top|Bottom)/.test(n)){ o.material.map=null; o.material.roughness=.9; o.material.needsUpdate=true; }
      if (/Beard/.test(n)) beards.push(o); if (/Headwear/.test(n)) hats.push(o);
      mats.push({name:n,mat:o.material}); } });
    m.visible=false; NETTPL.m=cloneSkinned(m); resident.g.add(m);
    var rig={m:m,mixer:new THREE.AnimationMixer(m),actions:{},cur:'',mats:mats,beards:beards,hats:hats};
    Object.keys(manClips).forEach(function(k){ rig.actions[k]=rig.mixer.clipAction(manClips[k]); }); anim(rig,'Idle'); resident.man=rig;
    if (resident.g.visible && resident.who) showResident(NEIGHBOURS.indexOf(resident.who));
  }, function(){});
  new THREE.GLTFLoader().parse(womanBuf, '', function(gltf){
    var m=gltf.scene, mats=[];
    m.traverse(function(o){ if (o.isMesh){ o.castShadow=true; o.frustumCulled=false; o.material.emissiveMap=null; o.material.emissive.set(0x000000); o.material.needsUpdate=true; mats.push({name:'',mat:o.material}); } });
    m.visible=false; NETTPL.w=cloneSkinned(m); NETTPL.wmap=mats[0].mat.map; resident.g.add(m);
    var rig={m:m,mixer:new THREE.AnimationMixer(m),actions:{},cur:'',mats:mats};
    Object.keys(womanClips).forEach(function(k){ rig.actions[k]=rig.mixer.clipAction(womanClips[k]); }); anim(rig,'Idle'); resident.woman=rig;
    if (resident.g.visible && resident.who) showResident(NEIGHBOURS.indexOf(resident.who));
  }, function(){});
}
(function(){ var sc=document.createElement('script'); sc.src='stalker-model.js'; sc.async=true; sc.onload=function(){ try { loadStalker(); } catch(e){} }; document.head.appendChild(sc); })();
var RAISE=[1.5,0,0];
var MASK_POS=[0,0.085,0.105], KNIFE_POS=[0,0.09,0.03], KNIFE_ROT=[Math.PI/2,0,0];

/* ---------- neighbours and doors ---------- */
var LINES=['What’s wrong? … Get in here, quick.','What’s wrong, kid? … Inside. Now.','Hey, what’s wrong? … Come in, hurry.','What’s wrong? Are you hurt? … Come in.','What’s wrong? … Lord. Get in, get in.','What’s wrong? … Quick, before he sees you.'];
var NEIGHBOURS=[
  {n:'Dana',  rig:'w', tint:0xffffff, s:1.06, hand:0x7a5038, sleeve:0x7a5038},
  {n:'Walt',  rig:'m', top:0x7a2f26, bottom:0x3a3f4a, hair:0xb4b4b4, beard:true,  skin:0xffffff, s:1.0,  hand:0xc99a7c},
  {n:'Marcus',rig:'m', top:0x2f5d50, bottom:0x4a4034, hair:0x1a1512, beard:false, skin:0x9a7458, s:1.06, hand:0x7a5a44},
  {n:'Priya', rig:'w', tint:0xcbb39e, s:0.98, hand:0x6a4632, sleeve:0x6a4632},
  {n:'Ed',    rig:'m', top:0xb59a52, bottom:0x23272f, hair:0x5a3a22, beard:true,  skin:0xf2d6c4, s:0.94, hand:0xd0a288},
  {n:'Tom',   rig:'m', nohat:true, top:0x3d4f7a, bottom:0x6b6458, hair:0x8a6a3a, beard:false, skin:0xffffff, s:1.02, hand:0xc99a7c},
  {n:'Ruth',  rig:'w', tint:0xe8d8ff, s:1.0,  hand:0x7a5444, sleeve:0x7a5444},
  {n:'Hank',  rig:'m', top:0x5a3a22, bottom:0x2a2a2e, hair:0x2a1c12, beard:true,  skin:0xd8b8a0, s:1.08, hand:0xb08468},
  {n:'Leo',   rig:'m', top:0xc9c4b4, bottom:0x3a4a5a, hair:0x6a4a2a, beard:false, skin:0xffffff, s:0.97, hand:0xc99a7c},
  {n:'Gloria',rig:'w', tint:0xffd9b8, s:1.03, hand:0x8a5a3c, sleeve:0x8a5a3c},
  {n:'Otis',  rig:'m', nohat:true, top:0x5a2a4a, bottom:0x3a3a3a, hair:0x101010, beard:true, skin:0x8a6448, s:1.04, hand:0x6e4c38},
  {n:'Carl',  rig:'m', top:0x2a2a2e, bottom:0x5a5a52, hair:0x9a9a9a, beard:true,  skin:0xffffff, s:1.0,  hand:0xc99a7c},
  {n:'June',  rig:'w', tint:0xb8a898, s:0.95, hand:0x5e4030, sleeve:0x5e4030},
  {n:'Ray',   rig:'m', top:0x9a4a1a, bottom:0x2f3a2f, hair:0x3a2a1a, beard:false, skin:0xe8c8b0, s:1.03, hand:0xc8987a},
  {n:'Sam',   rig:'m', nohat:true, top:0x4a6a3a, bottom:0x4a3a2a, hair:0x1a1512, beard:true, skin:0xb08a68, s:0.99, hand:0x946c50},
  {n:'Nell',  rig:'w', tint:0xd0e0d0, s:1.01, hand:0x705040, sleeve:0x705040},
  {n:'Vera',  rig:'w', tint:0xf0c8d8, s:1.04, hand:0x7c5040, sleeve:0x7c5040},
  {n:'Gus',   rig:'m', top:0x6a7a2a, bottom:0x3a3028, hair:0xd0d0c8, beard:true,  skin:0xf0d0b8, s:0.96, hand:0xcfa084},
  {n:'Ivy',   rig:'w', tint:0xc0d8c0, s:0.96, hand:0x6a4a38, sleeve:0x6a4a38},
  {n:'Bert',  rig:'m', nohat:true, top:0x8a8a8a, bottom:0x2a3a4a, hair:0x7a7a7a, beard:false, skin:0xffffff, s:1.07, hand:0xc99a7c},
  {n:'Lena',  rig:'w', tint:0xe0c0a0, s:1.08, hand:0x80543a, sleeve:0x80543a},
  {n:'Cole',  rig:'m', top:0x1f3a5a, bottom:0x1a1a1e, hair:0x2a1a10, beard:true,  skin:0xa87a58, s:1.03, hand:0x86603f},
  {n:'Mae',   rig:'w', tint:0xd8d0b0, s:0.94, hand:0x74523c, sleeve:0x74523c},
  {n:'Dean',  rig:'m', top:0xa83a5a, bottom:0x4a4a3a, hair:0x4a3020, beard:false, skin:0xf0d8c8, s:1.0,  hand:0xd4a88c},
  {n:'Rosa',  rig:'w', tint:0xffffff, s:1.0, hand:0x7a4a32, sleeve:0x7a4a32},
  {n:'Felix', rig:'m', top:0x2a6a8a, bottom:0x2a2a30, hair:0x1a1410, beard:false, skin:0x7a5640, s:1.02, hand:0x6a4a36},
  {n:'Hazel', rig:'w', tint:0xffffff, s:0.97, hand:0xe0b090, sleeve:0xe0b090},
  {n:'Duke',  rig:'m', top:0x3a3a2a, bottom:0x5a4a3a, hair:0x8a8a84, beard:true, skin:0xe8c8b0, s:1.1, hand:0xc8987a},
  {n:'Nina',  rig:'w', tint:0xffffff, s:0.95, hand:0x4e3020, sleeve:0x4e3020},
  {n:'Abe',   rig:'m', top:0xd8c8a0, bottom:0x3a3a44, hair:0xe0e0d8, beard:true, skin:0xf2d8c4, s:0.95, hand:0xd4a88c},
  {n:'Opal',  rig:'w', tint:0xffffff, s:1.04, hand:0xb07a58, sleeve:0xb07a58},
  {n:'Rex',   rig:'m', top:0x1a1a1c, bottom:0x2a3a5a, hair:0x6a2a14, beard:false, skin:0xffffff, s:1.05, hand:0xc99a7c},
  {n:'Jax',   rig:'m', top:0x8a1a1a, bottom:0x1a1a22, hair:0x0e0a08, beard:false, skin:0x6a4a34, s:1.04, hand:0x5e4230},
  {n:'Tess',  rig:'w', tint:0xffffff, s:0.99, hand:0xd8a888, sleeve:0xd8a888},
  {n:'Moe',   rig:'m', nohat:true, top:0xe0d8c0, bottom:0x5a4a3a, hair:0x2a2a2a, beard:true, skin:0xc89a78, s:1.12, hand:0xb0846a},
  {n:'Kiko',  rig:'w', tint:0xffffff, s:0.93, hand:0xe8c0a0, sleeve:0xe8c0a0},
  {n:'Zeke',  rig:'m', top:0x4a5a2a, bottom:0x3a2a1a, hair:0xa06a2a, beard:true, skin:0xf0d0b8, s:1.06, hand:0xd0a084},
  {n:'Lou',   rig:'w', tint:0xffffff, s:1.02, hand:0x5a3a28, sleeve:0x5a3a28},
  {n:'Rudy',  rig:'m', nohat:true, top:0x2a3a6a, bottom:0x2a2a2a, hair:0xd8c088, beard:false, skin:0xffffff, s:0.98, hand:0xc99a7c},
  {n:'Bea',   rig:'w', tint:0xffffff, s:1.0, hand:0xc8946c, sleeve:0xc8946c},
  {n:'Ike',   rig:'m', top:0x5a5a62, bottom:0x1e2a3a, hair:0x1a1410, beard:true, skin:0x8a6244, s:1.09, hand:0x76523a},
  {n:'Zora',  rig:'w', tint:0xffffff, s:0.97, hand:0x3e2618, sleeve:0x3e2618}
];
NEIGHBOURS.forEach(function(sp,i){ sp.line=LINES[i%LINES.length]; if (sp.sleeve===undefined) sp.sleeve=sp.top; sp.pitch=0.8+((i*37)%9)/20; sp.rate=0.88+(i%4)*0.06; sp.vi=i; });
/* ---------- every neighbour gets their own look ---------- */
var LOOKS={
  Walt:{hd:'cowboy',hatc:0x6a4a2a,pat:1,w:1.08}, Marcus:{hd:'crew',gl:2,w:1.0}, Ed:{hd:'flat',hatc:0x8a7a52,pat:2,w:1.16},
  Tom:{hd:'side',gl:1,w:0.96}, Hank:{hd:'beanie',hatc:0x6a1f1a,pat:1,w:1.22}, Leo:{hd:'cap',hatc:0x2a4a8a,w:0.92},
  Otis:{hd:'beanie',hatc:0x2a3a2a,gl:1,w:1.1}, Carl:{hd:'back',w:1.02}, Ray:{hd:'cowboy',hatc:0x1c1a18,pat:1,w:1.0},
  Sam:{hd:'long',pat:2,w:0.98}, Gus:{hd:'side',gl:2,w:1.14}, Bert:{hd:'bald',gl:2,w:1.18},
  Cole:{hd:'cap',hatc:0x141416,w:1.04}, Dean:{hd:'crew',pat:2,w:0.93},
  Dana:{sk:0x7a5038,hair:0x16110e,top:0x9a9a9a,pants:0xd9b23a,acc:0xc0281e,pat:0,w:1.0},
  Priya:{sk:0x9a6a48,hair:0x0e0c10,top:0xe8e0d0,pants:0x7a2f6a,acc:0xd0a030,pat:1,w:0.97},
  Ruth:{sk:0xe2b698,hair:0xc8c8c8,top:0x6a5a8a,pants:0x3a3f4a,acc:0x8a8a9a,pat:0,w:1.1},
  Gloria:{sk:0x5e3c28,hair:0x8a3a1a,top:0xf0e6d0,pants:0xc45a1e,acc:0x2a8a7a,pat:2,w:1.13},
  June:{sk:0xd8a888,hair:0xe8e4dc,top:0x4a6a8a,pants:0x8a8474,acc:0x5a3a2a,pat:3,w:1.05},
  Nell:{sk:0xf0c8a8,hair:0xd8b060,top:0x2a2a2e,pants:0x4a7a4a,acc:0xe8e0d0,pat:0,w:0.94},
  Vera:{sk:0xb88460,hair:0x5a2a6a,top:0xf0b8c8,pants:0x2a2a34,acc:0xf06aa0,pat:1,w:1.02},
  Ivy:{sk:0xeac4a8,hair:0xb84a1e,top:0x3a5a3a,pants:0x4a6a9a,acc:0x2a2a2a,pat:0,w:0.92},
  Lena:{sk:0x6a452e,hair:0x1a1410,top:0xc0281e,pants:0xe8e4dc,acc:0xd0a030,pat:2,w:1.0},
  Mae:{sk:0xdcb090,hair:0x9a9088,top:0xd8c8a0,pants:0x7a4a3a,acc:0x4a7a8a,pat:3,w:1.08},
  Rosa:{sk:0x7a4a32,hair:0x0c0a0a,top:0xc8a020,pants:0x2a2a34,acc:0xe04a2a,pat:2,w:1.04},
  Felix:{hd:'cap',hatc:0xc0281e,w:1.0},
  Hazel:{sk:0xe0b090,hair:0x5a3218,top:0x6a8a5a,pants:0x3a2a20,acc:0xd8d0b8,pat:3,w:0.98},
  Duke:{hd:'flat',hatc:0x4a3a2a,pat:1,w:1.2},
  Nina:{sk:0x4e3020,hair:0x1a0e08,top:0x8a2a8a,pants:0xe8d8b0,acc:0x2ab0a0,pat:1,w:0.95},
  Abe:{hd:'bald',gl:1,w:1.06},
  Opal:{sk:0xb07a58,hair:0xd0c0a0,top:0x2a4a6a,pants:0xa83a5a,acc:0xf0e0c0,pat:0,w:1.06},
  Rex:{hd:'long',pat:2,w:1.04},
  Jax:{hd:'cap',hatc:0x111111,w:1.02}, Moe:{hd:'bald',gl:1,w:1.24}, Zeke:{hd:'cowboy',hatc:0x5a3a1a,pat:2,w:1.0}, Rudy:{hd:'long',gl:2,w:0.95}, Ike:{hd:'beanie',hatc:0x1a3a5a,pat:1,w:1.12},
  Tess:{sk:0xd8a888,hair:0xc8301a,top:0x1a1a1a,pants:0x3a4a8a,acc:0xe8e0d0,pat:2,w:0.98},
  Kiko:{sk:0xe8c0a0,hair:0x0a0a0e,top:0xf0b8c8,pants:0x2a2a30,acc:0x40c0c0,pat:1,w:0.93},
  Lou:{sk:0x5a3a28,hair:0x2a1a10,top:0xd88a2a,pants:0x2a3a2a,acc:0xf0f0e0,pat:0,w:1.04},
  Bea:{sk:0xc8946c,hair:0xe8d8a0,top:0x5a2a6a,pants:0x8a7a6a,acc:0xc03040,pat:3,w:1.0},
  Zora:{sk:0x3e2618,hair:0x0a0806,top:0x2a8a5a,pants:0xe8c040,acc:0xff6a2a,pat:2,w:0.97}
};
NEIGHBOURS.forEach(function(sp){ var L=LOOKS[sp.n]||{}; sp.look=L; if (L.beard!==undefined) sp.beard=L.beard; if (sp.rig==='w' && L.sk){ sp.hand=L.sk; sp.sleeve=L.sk; } });
var GEARC={y:0.094,z:0.017,r:0.1,eyeY:0.096,faceZ:0.104};
function makeGear(model){
  var head=model.getObjectByName('Head'); if (!head) return null; model.updateMatrixWorld(true);
  var ws=new THREE.Vector3(); head.getWorldScale(ws); var h=new THREE.Group(); h.scale.setScalar(1/ws.x); head.add(h);
  var C=GEARC, hairM=new THREE.MeshStandardMaterial({roughness:.8}), hatM=new THREE.MeshStandardMaterial({roughness:.85}), darkM=mat(0x101012,{roughness:.4});
  function cap(theta,sx,sy,sz,M,tilt){ var me=new THREE.Mesh(new THREE.SphereGeometry(C.r,20,12,0,Math.PI*2,0,Math.PI*theta),M); me.scale.set(sx*0.94,sy*1.22,sz*1.17); me.position.set(0,C.y,C.z); me.rotation.x=tilt||0; me.castShadow=true; return me; }
  function grp(){ var g=new THREE.Group(); for (var i=0;i<arguments.length;i++) g.add(arguments[i]); g.visible=false; h.add(g); return g; }
  function bx(w,hh,d,M,x,y,z){ var me=new THREE.Mesh(new THREE.BoxGeometry(w,hh,d),M); me.position.set(x,y,z); return me; }
  var S={};
  S.crew=grp(cap(.47,1.0,1.0,1.0,hairM,-0.24));
  var fr=bx(0.13,0.03,0.05,hairM,0.012,C.y+0.088,C.z+0.078); fr.rotation.set(0.75,0,-0.2);
  S.side=grp(cap(.5,1.03,1.05,1.03,hairM,-0.3));
  S.back=grp(cap(.5,1.04,1.0,1.05,hairM,-0.62));
  S.long=grp(cap(.48,1.03,1.03,1.03,hairM,-0.3),cap(.62,1.06,1.03,1.0,hairM,-0.85));
  var rim=new THREE.Mesh(new THREE.TorusGeometry(C.r*1.07,0.014,8,24),hatM); rim.rotation.x=Math.PI/2-0.12; rim.scale.set(0.88,1.1,1); rim.position.set(0,C.y+0.03,C.z);
  S.beanie=grp(cap(.45,1.0,1.02,1.0,hatM,-0.12),rim);
  var brim=new THREE.Mesh(new THREE.CylinderGeometry(0.085,0.085,0.008,18,1,false,0,Math.PI),hatM); brim.rotation.set(0.14,-Math.PI/2,0); brim.scale.set(1.2,1,0.95); brim.position.set(0,C.y+0.05,C.z+0.085);
  S.cap=grp(cap(.45,1.01,1.01,1.01,hatM,-0.1),brim);
  var fl=new THREE.Mesh(new THREE.SphereGeometry(C.r,18,10),hatM); fl.scale.set(0.95,0.3,1.18); fl.position.set(0,C.y+0.088,C.z+0.014); fl.rotation.x=0.12;
  var fb=new THREE.Mesh(new THREE.CylinderGeometry(0.07,0.07,0.008,16,1,false,0,Math.PI),hatM); fb.rotation.set(0.2,-Math.PI/2,0); fb.scale.set(1,1,0.9); fb.position.set(0,C.y+0.066,C.z+0.1);
  S.flat=grp(fl,fb);
  S.bald=grp(); S.cowboy=grp();
  var gl=[null];
  [0,1].forEach(function(sq){ var g=new THREE.Group();
    [-1,1].forEach(function(sd){ var lens=sq ? new THREE.Mesh(new THREE.TorusGeometry(0.026,0.0035,4,4),darkM) : new THREE.Mesh(new THREE.TorusGeometry(0.021,0.003,6,18),darkM);
      if (sq) lens.rotation.z=Math.PI/4; lens.position.set(sd*0.033,C.eyeY,C.faceZ+0.012); g.add(lens);
      var tp=bx(0.003,0.004,0.11,darkM,sd*0.068,C.eyeY+0.004,C.faceZ-0.045); g.add(bx(0.016,0.0035,0.0035,darkM,sd*0.06,C.eyeY+0.004,C.faceZ+0.011)); g.add(tp); });
    g.add(bx(0.02,0.0035,0.0035,darkM,0,C.eyeY+0.004,C.faceZ+0.014)); g.visible=false; h.add(g); gl.push(g); });
  var mus=bx(0.06,0.014,0.016,hairM,0,C.eyeY-0.066,C.faceZ+0.022); mus.visible=false; h.add(mus);
  return {S:S,gl:gl,mus:mus,hairM:hairM,hatM:hatM};
}
var patTex=[null,
  canvasTex(64,64,function(g){ g.fillStyle='#fff'; g.fillRect(0,0,64,64); g.fillStyle='rgba(0,0,0,.42)'; g.fillRect(0,0,64,14); g.fillRect(0,0,14,64); g.fillStyle='rgba(0,0,0,.3)'; g.fillRect(0,34,64,5); g.fillRect(34,0,5,64); g.fillStyle='rgba(255,255,255,.5)'; g.fillRect(0,48,64,2); g.fillRect(48,0,2,64); }),
  canvasTex(64,64,function(g){ g.fillStyle='#fff'; g.fillRect(0,0,64,64); g.fillStyle='rgba(0,0,0,.4)'; for (var i=0;i<4;i++) g.fillRect(i*16,0,6,64); })];
patTex.forEach(function(t,i){ if (t){ t.wrapS=t.wrapT=THREE.RepeatWrapping; t.repeat.set(i===1?7:9,i===1?7:9); } });
var wBase=null;
function womanTex(sp,baseMap){
  if (sp.tex!==undefined) return sp.tex;
  sp.tex=null;
  try {
    var N=512, L=sp.look;
    if (!wBase){ var c0=document.createElement('canvas'); c0.width=c0.height=N; var g0=c0.getContext('2d'); g0.drawImage(baseMap.image,0,0,N,N); wBase=g0.getImageData(0,0,N,N); }
    var c=document.createElement('canvas'); c.width=c.height=N; var g=c.getContext('2d'), im=g.createImageData(N,N), s=wBase.data, d=im.data;
    function rgb(h){ return [(h>>16)&255,(h>>8)&255,h&255]; }
    var SK=rgb(L.sk), HA=rgb(L.hair), TP=rgb(L.top), PA=rgb(L.pants), AC=rgb(L.acc), pat=L.pat||0;
    for (var i=0,p=0;i<s.length;i+=4,p++){
      var r=s[i], gg=s[i+1], b=s[i+2], mx=Math.max(r,gg,b), mn=Math.min(r,gg,b), v=mx/255, sat=mx?(mx-mn)/mx:0, hue=0, dl=mx-mn, T=null, k=1;
      if (dl>0){ if (mx===r) hue=((gg-b)/dl)%6; else if (mx===gg) hue=(b-r)/dl+2; else hue=(r-gg)/dl+4; hue*=60; if (hue<0) hue+=360; }
      if (v<0.3){ T=HA; k=0.45+v*3.2; }
      else if (hue>=40 && hue<72 && sat>0.4){ T=PA; k=v*1.05; var x=p%N, y=(p/N)|0;
        if (pat===1){ var ax=x%26-13, ay=y%26-13; if (ax*ax+ay*ay<30) T=AC; }
        else if (pat===2){ if (x%18<5) T=AC; }
        else if (pat===3){ if (x%30<4 || y%30<4) k*=0.55; else if (x%30>14 && x%30<17) k*=1.25; } }
      else if ((hue<6 || hue>338) && sat>0.55){ T=AC; k=v*1.15; }
      else if (hue>=165 && hue<205 && sat>0.3){ T=AC; k=v*0.85; }
      else if (hue>=6 && hue<40 && sat>=0.18){ T=SK; k=v/0.52; if (k>1.3) k=1.3; }
      else if (sat<0.18 && v<0.82){ T=TP; k=v/0.6; }
      if (T){ d[i]=Math.min(255,T[0]*k); d[i+1]=Math.min(255,T[1]*k); d[i+2]=Math.min(255,T[2]*k); } else { d[i]=r; d[i+1]=gg; d[i+2]=b; }
      d[i+3]=255;
    }
    g.putImageData(im,0,0);
    var t=new THREE.CanvasTexture(c); t.flipY=baseMap.flipY; t.encoding=baseMap.encoding; t.wrapS=baseMap.wrapS; t.wrapT=baseMap.wrapT; sp.tex=t;
  } catch(e){ sp.tex=null; }
  return sp.tex;
}
/* ---------- everyone gets their own build and kit, not just colours ---------- */
function bodyOf(sp){
  if (sp.body) return sp.body; var i=NEIGHBOURS.indexOf(sp); if (i<0){ i=0; for (var c=0;c<sp.n.length;c++) i+=sp.n.charCodeAt(c)*(c+3); }
  function r(k){ var x=Math.sin(i*12.9898+k*78.233)*43758.5453; return x-Math.floor(x); }
  var props=[], p=r(5); if (p<0.3) props.push('backpack'); else if (p<0.52) props.push('satchel');
  if (r(6)<0.38) props.push('scarf'); var hatless=sp.rig==='m' && !!sp.look && !/cowboy|cap|beanie|flat/.test(sp.look.hd||''); if (hatless && r(7)<0.3) props.push('hood');
  if (sp.rig==='w' && r(9)<0.35) props.push('glasses');
  return sp.body={hs:0.9+r(1)*0.2, b:1+Math.pow(r(2),1.5)*0.45, L:0.93+r(3)*0.14, sh:0.93+r(4)*0.16, props:props,
    pc:[0x2a3a5a,0x5a2a2a,0x3a4a2a,0x6a5a3a,0x1a1a1e,0x8a6a2a,0x4a2a5a][(r(8)*7)|0]};
}
function propMesh(kind,col,top,w){
  var g=new THREE.Group(), m=mat(col,{roughness:.85}), dk=mat(0x1a1612,{roughness:.6}), k=w?0.86:1;
  if (kind==='backpack'){ box(0.32*k,0.4*k,0.15*k,m,0,0,0,g); box(0.26*k,0.16*k,0.06*k,m,0,-0.08*k,-0.09*k,g); box(0.04,0.42*k,0.03,dk,0.1*k,0.02,0.09*k,g); box(0.04,0.42*k,0.03,dk,-0.1*k,0.02,0.09*k,g); }
  else if (kind==='satchel'){ box(0.24*k,0.2*k,0.08*k,m,0,0,0,g); var s=box(0.035,0.72*k,0.012,dk,-0.14*k,0.27*k,-0.02,g); s.rotation.z=-0.62; }
  else if (kind==='scarf'){ var t=new THREE.Mesh(new THREE.TorusGeometry(0.075*k,0.032*k,8,18),m); t.rotation.x=Math.PI/2+0.25; g.add(t); var tail=box(0.07*k,0.24*k,0.025,m,0.05*k,-0.12*k,0.07*k,g); tail.rotation.z=0.15; }
  else if (kind==='hood'){ var hm=mat(top,{roughness:.95,side:THREE.DoubleSide}), h=new THREE.Mesh(new THREE.SphereGeometry(0.112,18,12,0,Math.PI*2,0,Math.PI*0.6),hm); h.rotation.x=-0.75; h.scale.set(0.98,1.08,1.12); g.add(h); }
  else if (kind==='glasses'){ [-1,1].forEach(function(sd){ var l=new THREE.Mesh(new THREE.TorusGeometry(0.024,0.004,6,16),dk); l.position.set(sd*0.034,0,0); g.add(l); }); box(0.02,0.004,0.004,dk,0,0.004,0,g); }
  g.traverse(function(o){ if (o.isMesh) o.castShadow=true; }); return g;
}
var PROPAT={backpack:['Spine2',[0,-0.04,-0.17]],satchel:['Spine1',[0.19,-0.12,0.04]],scarf:['Neck',[0,0.0,0.01]],hood:['Head',[0,0.075,-0.03]],glasses:['Head',[0,0.075,0.11]]};
var _pv=new THREE.Vector3(), _pq=new THREE.Quaternion(), _pq2=new THREE.Quaternion(), _ps=new THREE.Vector3(), _ps2=new THREE.Vector3();
function applyBuild(sp,rig){
  var B=bodyOf(sp), pre=sp.rig==='m'?'':'mixamorig', m=rig.m, w=sp.rig==='w';
  if (!rig.bb){ var g=function(n){ return m.getObjectByName(pre+n); }; rig.bb={head:g('Head'),s1:g('Spine1'),s2:g('Spine2'),lu:g('LeftUpLeg'),ru:g('RightUpLeg'),ls:g('LeftShoulder'),rs:g('RightShoulder')}; }
  var bb=rig.bb; ['head','s1','s2','lu','ru','ls','rs'].forEach(function(k){ if (bb[k]) bb[k].scale.set(1,1,1); });
  (rig.props||[]).forEach(function(p){ if (p.parent) p.parent.remove(p); }); rig.props=[];
  if (!rig.cur) anim(rig,'Idle'); rig.mixer.update(0);
  var keepPos=m.position.y; m.position.y=0; m.updateMatrixWorld(true);
  B.props.forEach(function(kind){ var at=PROPAT[kind], bone=m.getObjectByName(pre+at[0]); if (!bone) return;
    var mesh=propMesh(kind,B.pc,sp.rig==='m'?(sp.top||0x444444):((sp.look&&sp.look.top)||0x444444),w), holder=new THREE.Group(); holder.add(mesh);
    bone.getWorldPosition(_pv); m.worldToLocal(_pv); _pv.x+=at[1][0]*(w?0.85:1); _pv.y+=at[1][1]*(w?0.85:1); _pv.z+=at[1][2]*(w?0.85:1); m.localToWorld(_pv); bone.worldToLocal(_pv); holder.position.copy(_pv);
    bone.getWorldQuaternion(_pq); m.getWorldQuaternion(_pq2); holder.quaternion.copy(_pq.invert().multiply(_pq2));
    bone.getWorldScale(_ps); m.getWorldScale(_ps2); holder.scale.setScalar(_ps2.x/_ps.x); bone.add(holder); rig.props.push(holder); });
  if (bb.head) bb.head.scale.setScalar(B.hs);
  if (bb.s1 && bb.s2){ bb.s1.scale.set(B.b,1,B.b); bb.s2.scale.set(1/B.b,1,1/B.b); }
  if (bb.lu) bb.lu.scale.setScalar(B.L); if (bb.ru) bb.ru.scale.setScalar(B.L);
  if (bb.ls) bb.ls.scale.setScalar(B.sh); if (bb.rs) bb.rs.scale.setScalar(B.sh);
  m.position.y=(B.L-1)*(w?0.78:0.82)*(sp.s||1);
}

function styleResident(sp,rig){
  var L=sp.look||{}, w=L.w||1; rig.m.scale.set(sp.s*w,sp.s,sp.s*w);
  if (sp.rig==='m'){
    rig.mats.forEach(function(e){ var n=e.name, m=e.mat;
      if (/Top/.test(n)){ m.color.copy(lin(sp.top)); var pt=patTex[L.pat||0]; if (m.map!==pt){ m.map=pt; m.needsUpdate=true; } }
      else if (/Bottom/.test(n)) m.color.copy(lin(sp.bottom));
      else if (/Skin|Body/.test(n)) m.color.copy(lin(sp.skin));
      else if (/Headwear/.test(n)) m.color.copy(lin(L.hatc||sp.hair));
      else if (/Hair|Beard/.test(n)) m.color.copy(lin(sp.hair)); });
    rig.beards.forEach(function(o){ o.visible=!!sp.beard; }); rig.hats.forEach(function(o){ o.visible=L.hd==='cowboy'; });
    if (!rig.gear) rig.gear=makeGear(rig.m);
    var G=rig.gear; if (G){ for (var k in G.S) G.S[k].visible=(k===L.hd); G.gl[1].visible=L.gl===1; G.gl[2].visible=L.gl===2; G.mus.visible=!!L.mus;
      G.hairM.color.copy(lin(sp.hair)); G.hatM.color.copy(lin(L.hatc||0x333333)); }
  } else {
    var m=rig.mats[0].mat; if (!rig.baseMap) rig.baseMap=m.map;
    var t=womanTex(sp,rig.baseMap)||rig.baseMap; if (m.map!==t){ m.map=t; m.needsUpdate=true; } m.color.set(0xffffff);
  }
  try { applyBuild(sp,rig); } catch(e){}
}
var NARR={n:'Narrator'}, ELIAS={n:'Elias'}, YOU={n:'You'};
function voice(sp,text){}   // no spoken voices: lines show as text only
function eliasSays(t){ voice(ELIAS,t); }
function youSay(t){ toast('You: “'+t+'”',2200); voice(YOU,t); }
function say(idx,text,ms){ var sp=NEIGHBOURS[idx]; if (resident.who===sp) resident.talk=Math.min(4.5,0.6+text.length*0.055); toast(sp.n+': \u201c'+text+'\u201d',ms||3500); voice(sp,text); }
var resident=(function(){
  var g=new THREE.Group(), prim=new THREE.Group(); g.add(prim);
  var b=cyl(0.2,0.24,1.25,10,mat(0x6a4a3a),0,0.85,0,prim); b.castShadow=true;
  var hd=new THREE.Mesh(new THREE.SphereGeometry(0.17,14,10),mat(0xb09a86)); hd.position.y=1.66; prim.add(hd);
  g.visible=false; scene.add(g);
  return {g:g, prim:prim, man:null, woman:null, who:null};
})();
function showResident(idx){
  var sp=NEIGHBOURS[idx], R=resident; R.who=sp; R.dead=false; R.g.rotation.set(0,0,0); blood.visible=false;
  var rig = sp.rig==='m' ? R.man : R.woman, other = sp.rig==='m' ? R.woman : R.man;
  if (other) other.m.visible=false;
  R.prim.visible=!rig;
  if (rig){
    rig.m.visible=true; styleResident(sp,rig);
    anim(rig,'Idle');
  }
  R.g.visible=true;
}
var doorLight=new THREE.PointLight(lin(0xffb878),0,9,1.5); scene.add(doorLight);
var shelter=null, nearH=null, tmpV=new THREE.Vector3(), curPrompt=null;
function setPrompt(text,label){
  if (text===curPrompt) return; curPrompt=text;
  $('prompt').hidden=!text; $('btnKnock').hidden=!text || !label;
  if (text){ $('prompt').innerHTML=(isTouch||!label?'':'<b>E</b>')+text; if (label) $('btnKnock').textContent=label; }
}
function nearDoor(){
  for (var i=0;i<houses.length;i++){ var h=houses[i]; if (!h.breached && Math.hypot(P.x-h.x, P.z-(h.z-h.side*4.9))<1.9) return h; }
  return null;
}
function showPrompt(h){ nearH=h; setPrompt(h?'Knock on the door':null,'Knock'); }
function act(){
  if (game.mode!=='play' || game.paused) return;
  if (game.net){ netAct(); return; }
  if (game.role==='killer'){ if (story.tearH) tearGen(story.tearH); return; }
  if (!shelter){ if (nearH) tryKnock(); else if (game.nearGen && !game.fix) startFix(); else if (game.nearClerk) talkClerk(); return; }
  if (shelter.view!=='walk') leaveView(); else if (shelter.spot) enterView(shelter.spot);
}
function tryKnock(){
  var h=nearH; if (!h || game.knock || shelter) return;
  [0.14,0.33,0.52].forEach(function(w){ tone(170,0.07,'square',0.16,80,w); });
  game.kA=0.85;
  stalker.tx=P.x; stalker.tz=P.z;                       // he hears it
  var KC=CH()[story.ch], st=game.role==='victim' && !!KC.knock && h===houses[KC.knock.house];
  if (!st && h.cd>game.time){ toast('No one is coming to this door.',2200); return; }
  game.knock={h:h,t:0,ans:st||Math.random()<0.5,stage:0,story:st};
}
function closeDoor(h){ h.open=0; h.hall.visible=false; resident.g.visible=false; doorLight.intensity=0; }
function updateKnock(dt){
  var k=game.knock, h=k.h; k.t+=dt;
  if (!k.ans){ if (k.t>1.9){ if (Math.random()<0.25){ thud(1.6); setTimeout(function(){ thud(1.3); },160); shake(); toast('Something hits the door from the inside.',2600); } else toast('No answer.',2200); h.cd=game.time+30; game.knock=null; } return; }
  var far=Math.hypot(P.x-h.x, P.z-(h.z-h.side*4.9))>3.6;
  if (k.stage===0 && k.t>1.3){
    k.stage=1; h.open=1; h.hall.visible=true;
    showResident(h.n);
    tmpV.set(0.12,0.6,4.3); h.g.localToWorld(tmpV); resident.g.position.copy(tmpV); resident.g.rotation.y=h.g.rotation.y;
    var fd=(h.z-P.z)*h.side; if (fd<5.6 && Math.abs(P.x-h.x)<1.2) P.z=h.z-h.side*5.6;
    tmpV.set(0,2.2,5.2); h.g.localToWorld(tmpV); doorLight.position.copy(tmpV); doorLight.intensity=1.8;
    tone(140,0.35,'sawtooth',0.03,210);
    if (k.story){ game.knock=null; showPrompt(null); storyKnock(h); return; }
    say(h.n,resident.who.line,3200);
  } else if (k.stage===1 && k.t>3.1){
    if (far){ closeDoor(h); h.cd=game.time+30; game.knock=null; toast('The door shuts.',2000); return; }
    k.stage=2; $('fade').style.opacity=1;
  } else if (k.stage===2 && k.t>3.6){
    var S0=stalker, saw=S0.g.visible && !S0.mode && S0.state!=='away' && Math.hypot(S0.g.position.x-P.x,S0.g.position.z-P.z)<26;
    game.knock=null; closeDoor(h); enterShelter(h,saw);
  }
}

/* ---------- the house interior (one shared set, far off the map) ---------- */
var IM=null, IWALL=[0xd6c8ae,0xb9c4c0,0xd8b8a0,0xc8ccb0,0xe0d8c8,0xb0a8b8,0xcfc0a0,0xa8b8a8,0xd9c0b8,0xc0c8d8,0xe0d0a8,0xb8b0a0], ISOFA=[0x4d5f52,0x6a3a34,0x34486a,0x6a5a34,0x4a4a52,0x5a3458,0x2f5d50,0x7a5a3a,0x3a3f4a,0x6a2a24,0x4a6a3a,0x5a5a5a], IRUG=[0x6a2a24,0x2a3a5a,0x5a4a2a,0x3a5a4a,0x5a2a4a,0x4a4a4a,0x7a4a1a,0x2a2a3a,0x6a5a3a,0x3a2a2a,0x2f4a5a,0x5a3a2a], ICAB=[0xe2dccd,0x8a9aa0,0xd8c8a0,0x6a7a6a,0xf0ece2,0x9a8a7a];
var IX=400, I={x:IX,z:3}, interior=new THREE.Group(); interior.position.set(IX,0,0); scene.add(interior);
var SPOTS=[{k:'window',x:-3.2,z:3.25,r:1.0,t:'Look out the window'},{k:'window',x:3.2,z:3.25,r:1.0,t:'Look out the window'},{k:'peep',x:0,z:3.3,r:0.75,t:'Look through the peephole'},{k:'table',x:3.1,z:1.0,r:1.5,t:'Hide under the table'}];
var iDoor=new THREE.Group(), iGap=new THREE.Group(), iLights=new THREE.Group(), blood; interior.add(iDoor); interior.add(iGap); interior.add(iLights); iGap.visible=false;
(function(){
  function ib(w,h,d,m,x,y,z,col){ var b=box(w,h,d,m,x,y,z,interior); if (col) addBox(IX+x,z,w/2,d/2); return b; }
  var tileTex=canvasTex(64,64,function(g){ g.fillStyle='#d9d4c6'; g.fillRect(0,0,64,64); g.fillStyle='#55585c'; g.fillRect(0,0,32,32); g.fillRect(32,32,32,32); g.fillStyle='rgba(0,0,0,.25)'; g.fillRect(0,0,64,1); g.fillRect(0,32,64,1); g.fillRect(0,0,1,64); g.fillRect(32,0,1,64); });
  tileTex.wrapS=tileTex.wrapT=THREE.RepeatWrapping; tileTex.repeat.set(4,4.5);
  var wallM=new THREE.MeshStandardMaterial({map:rep(concreteTex,3,1),color:lin(0xd6c8ae),roughness:.95});
  var floorM=new THREE.MeshStandardMaterial({map:rep(plankTex,5,3),color:lin(0xa98a66),roughness:.55});
  var tileM=new THREE.MeshStandardMaterial({map:tileTex,roughness:.3});
  var ceilM=mat(0xe6e1d6,{roughness:1}), woodM=new THREE.MeshStandardMaterial({map:rep(plankTex,1,1),color:lin(0x6a4a32),roughness:.6});
  var cabM=mat(0xe2dccd,{roughness:.5}), topM=mat(0x26262a,{roughness:.2}), steelM=mat(0xaeb3ba,{roughness:.3,metalness:.3});
  var sofaM=mat(0x4d5f52,{roughness:1}), rugM=mat(0x6a2a24,{roughness:1}), darkM=mat(0x101012,{roughness:.4}), brassM=mat(0xb89a4a,{roughness:.3,metalness:.8});
  IM={wall:wallM,sofa:sofaM,rug:rugM,cab:cabM};
  // shell
  ib(9.8,0.1,7.8,floorM,0,-0.05,0); ib(3.9,0.02,4.3,tileM,2.9,0.01,-1.7); ib(9.8,0.1,7.8,ceilM,0,2.75,0);
  ib(9.8,2.7,0.2,wallM,0,1.35,-3.9,true); ib(9.8,2.7,0.2,wallM,0,1.35,3.9,true); ib(0.2,2.7,7.8,wallM,-4.9,1.35,0,true); ib(0.2,2.7,7.8,wallM,4.9,1.35,0,true);
  ib(0.15,2.7,4.25,wallM,0.92,1.35,-1.7,true);
  [[9.6,0.12,0.04,0,0.06,-3.78],[9.6,0.12,0.04,0,0.06,3.78],[0.04,0.12,7.6,-4.78,0.06,0],[0.04,0.12,7.6,4.78,0.06,0]].forEach(function(a){ ib(a[0],a[1],a[2],trimM,a[3],a[4],a[5]); });
  // front door, peephole, windows
  var idM=mat(0x4a2f22,{roughness:.5});
  ib(1.4,2.35,0.06,trimM,0,1.17,3.78); box(1.12,2.2,0.08,idM,0,1.1,3.75,iDoor);
  var kn=new THREE.Mesh(new THREE.SphereGeometry(0.045,8,6),brassM); kn.position.set(-0.42,1.05,3.68); iDoor.add(kn);
  var pp=cyl(0.03,0.03,0.03,10,brassM,0,1.58,3.7,iDoor); pp.rotation.x=Math.PI/2; box(0.025,0.025,0.01,darkM,0,1.58,3.683,iDoor);
  box(1.12,2.2,0.02,new THREE.MeshBasicMaterial({color:lin(0x13233f)}),0,1.1,3.74,iGap); halo(0xffc070,0.9,0.3,1.75,3.72,iGap,.8);
  var slab=box(1.12,0.08,2.2,idM,0.45,0.04,2.2,iGap); slab.rotation.y=0.4; box(0.5,0.05,0.12,idM,-0.7,0.03,3.0,iGap).rotation.y=1.1;
  blood=new THREE.Mesh(new THREE.CircleGeometry(0.75,20),new THREE.MeshBasicMaterial({color:lin(0x3a0508),transparent:true,opacity:.85,depthWrite:false})); blood.rotation.x=-Math.PI/2; blood.position.set(-0.7,0.016,2.35); blood.visible=false; interior.add(blood);
  [-3.2,3.2].forEach(function(wx){
    ib(1.9,1.5,0.06,trimM,wx,1.6,3.78); ib(1.6,1.2,0.04,winDarkM,wx,1.6,3.75); ib(2.1,0.06,0.2,trimM,wx,0.84,3.72);
    var cur=mat(wx<0?0x7a3b34:0xd8cfae,{roughness:1}); ib(0.3,1.6,0.05,cur,wx-0.92,1.62,3.7); ib(0.3,1.6,0.05,cur,wx+0.92,1.62,3.7); cyl(0.015,0.015,2.3,6,brassM,wx,2.44,3.7,interior).rotation.z=Math.PI/2;
  });
  // the staircase: 14 even steps, cream risers with dark treads so each step reads clearly, a handrail on the open side
  var riserM=mat(0xe8e0cc,{roughness:.8}), treadM=new THREE.MeshStandardMaterial({map:rep(plankTex,1,0.3),color:lin(0x5a3a24),roughness:.55}), nosingM=mat(0xf2ead2,{roughness:.6});
  var ST_RUN=0.27, ST_RISE=0.2, ST_N=14, ST_Z0=0.5, ST_ANG=Math.atan2(ST_RISE,ST_RUN), ST_LEN=Math.hypot(ST_N*ST_RUN,ST_N*ST_RISE);
  for (var i=0;i<ST_N;i++){ var hgt=(i+1)*ST_RISE, zc=ST_Z0-(i+0.5)*ST_RUN;
    ib(1.1,hgt-0.04,ST_RUN,riserM,0.25,(hgt-0.04)/2,zc);
    ib(1.14,0.045,ST_RUN+0.03,treadM,0.25,hgt-0.022,zc-0.0); ib(1.15,0.05,0.05,nosingM,0.25,hgt-0.015,zc+ST_RUN/2-0.01); }
  var strg=ib(0.07,0.32,ST_LEN+0.2,trimM,-0.33,ST_N*ST_RISE/2+0.05,ST_Z0-ST_N*ST_RUN/2); strg.rotation.x=ST_ANG;
  var rail=ib(0.08,0.07,ST_LEN,woodM,-0.27,ST_N*ST_RISE/2+0.88,ST_Z0-ST_N*ST_RUN/2); rail.rotation.x=ST_ANG;
  for (var r=0;r<ST_N;r+=2){ var bz=ST_Z0-(r+0.5)*ST_RUN, by=(r+1)*ST_RISE, top=(ST_Z0-bz)/(ST_N*ST_RUN)*ST_N*ST_RISE+0.88; ib(0.04,top-by,0.04,trimM,-0.27,by+(top-by)/2,bz); }
  ib(0.12,1.1,0.12,woodM,-0.27,0.55,ST_Z0-0.08); cyl(0.07,0.07,0.06,8,woodM,-0.27,1.13,ST_Z0-0.08,interior);
  ib(1.1,0.02,1.7,new THREE.MeshBasicMaterial({color:0x000000}),0.25,2.69,-2.9);
  addBox(IX+0.25,-1.7,0.62,2.2);
  // living room
  ib(2.8,0.02,2.0,rugM,-2.7,0.01,-1.0);
  ib(2.3,0.42,0.9,sofaM,-2.7,0.21,0.55,true); ib(2.3,0.5,0.24,sofaM,-2.7,0.66,0.9); ib(0.24,0.62,0.9,sofaM,-3.75,0.31,0.55); ib(0.24,0.62,0.9,sofaM,-1.65,0.31,0.55);
  ib(0.9,0.14,0.6,mat(0x8a5a3a,{roughness:1}),-3.1,0.5,0.45); ib(0.9,0.14,0.6,mat(0xb9a26a,{roughness:1}),-2.2,0.5,0.45);
  ib(1.1,0.06,0.6,woodM,-2.7,0.42,-1.0,true); ib(0.9,0.36,0.4,woodM,-2.7,0.2,-1.0);
  ib(1.9,0.5,0.45,woodM,-2.7,0.25,-3.5,true); ib(1.5,0.86,0.06,darkM,-2.7,1.12,-3.6);
  var tvM=new THREE.MeshBasicMaterial({color:lin(0x6f9fe0)}); tvMats.push(tvM); box(1.4,0.76,0.02,tvM,-2.7,1.12,-3.565,iLights);
  halo(0x5f8fd0,3.2,-2.7,1.1,-3.3,iLights,.25);
  ib(0.35,1.9,1.5,woodM,-4.6,0.95,-1.3,true);
  [0x7a2f26,0x2f5d50,0x3d4f7a,0xb59a52].forEach(function(c,i){ ib(0.24,0.3,1.3,mat(c,{roughness:.9}),-4.52,0.4+i*0.45,-1.3); });
  cyl(0.02,0.02,1.5,6,darkM,-4.4,0.75,-3.4,interior); cyl(0.14,0.2,0.3,12,glow(0xffd9a0),-4.4,1.6,-3.4,iLights); halo(0xffc070,2.4,-4.4,1.6,-3.4,iLights,.7); cyl(0.14,0.2,0.3,12,mat(0x6a6050),-4.4,1.6,-3.4,interior);
  ib(0.04,0.6,0.8,woodM,-4.78,1.6,1.9); ib(0.02,0.48,0.68,mat(0x6a7a8a),-4.76,1.6,1.9);
  ib(0.9,0.6,0.04,woodM,-1.6,1.7,3.77); ib(0.78,0.48,0.02,mat(0x8a7a5a),-1.6,1.7,3.755);
  // kitchen
  ib(2.9,0.9,0.62,cabM,3.35,0.45,-3.48,true); ib(2.95,0.05,0.66,topM,3.35,0.925,-3.47);
  ib(0.62,0.9,2.5,cabM,4.48,0.45,-1.95,true); ib(0.66,0.05,2.5,topM,4.47,0.925,-1.95);
  ib(0.82,1.95,0.72,steelM,1.45,0.975,-3.43,true); ib(0.03,0.9,0.03,darkM,1.78,1.2,-3.05);
  ib(0.72,0.03,0.6,darkM,2.5,0.96,-3.47); [[2.33,-3.33],[2.67,-3.33],[2.33,-3.6],[2.67,-3.6]].forEach(function(b){ cyl(0.09,0.09,0.012,12,mat(0x3a3a3e),b[0],0.982,b[1],interior); });
  ib(0.6,0.02,0.4,steelM,3.7,0.955,-3.47); cyl(0.015,0.015,0.3,6,steelM,3.7,1.1,-3.7,interior);
  ib(2.9,0.7,0.36,cabM,3.35,1.95,-3.62); for (var c2=0;c2<4;c2++){ ib(0.02,0.6,0.01,topM,2.3+c2*0.72,1.95,-3.435); ib(0.02,0.75,0.01,topM,2.3+c2*0.72,0.45,-3.165); }
  cyl(0.6,0.6,0.05,20,woodM,3.1,0.76,1.0,interior); cyl(0.06,0.25,0.74,10,woodM,3.1,0.37,1.0,interior); addBox(IX+3.1,1.0,0.5,0.5);
  [[2.3,1.0],[3.9,1.0]].forEach(function(c){ ib(0.4,0.05,0.4,woodM,c[0],0.45,c[1]); ib(0.05,0.5,0.4,woodM,c[0]+(c[0]<3?-0.18:0.18),0.72,c[1]); [[-.16,-.16],[.16,-.16],[-.16,.16],[.16,.16]].forEach(function(l){ ib(0.04,0.45,0.04,woodM,c[0]+l[0],0.225,c[1]+l[1]); }); addBox(IX+c[0],c[1],0.2,0.2); });
  var pk=new THREE.Group(); pk.position.set(4.45,0.95,-1.2); pk.rotation.y=-Math.PI/2; interior.add(pk); pumpkin(pk,0,0,0.7);
  cyl(0.3,0.3,0.03,16,glow(0xfff1dc),2.9,2.685,-1.2,iLights); cyl(0.3,0.3,0.03,16,glow(0xffe2b0),-2.7,2.685,-0.8,iLights); cyl(0.3,0.3,0.03,16,mat(0x8a8880),2.9,2.69,-1.2,interior); cyl(0.3,0.3,0.03,16,mat(0x8a8880),-2.7,2.69,-0.8,interior);
  addBox(IX+0.25,1.0,0.28,0.28);                                        // the neighbour stands by the stair gate
  interior.traverse(function(o){ if (o.isMesh && o.material.isMeshStandardMaterial){ o.castShadow=true; o.receiveShadow=true; } });
})();
/* ---------- upstairs, extra hiding spots ---------- */
var FLOOR2=2.8, IB1=[], STAIRBLK=[];
var HIDES=[   // inside spots are in interior-local x; f = floor
  {id:'table',in:1,f:0,x:3.1,z:1.0,r:1.4,t:'Hide under the table',cam:[3.1,0.4,1.42],yaw:Math.PI},
  {id:'closet',in:1,f:0,x:-3.8,z:2.6,r:1.0,t:'Hide in the coat closet',cam:[-4.45,1.45,2.6],yaw:-Math.PI/2},
  {id:'pantry',in:1,f:0,x:3.8,z:2.5,r:1.0,t:'Hide in the pantry',cam:[4.45,1.45,2.5],yaw:Math.PI/2},
  {id:'bed',in:1,f:1,x:-2.2,z:1.6,r:1.1,t:'Hide under the bed',cam:[-3.3,FLOOR2+0.28,1.6],yaw:-Math.PI/2},
  {id:'wardrobe',in:1,f:1,x:-3.6,z:-2.6,r:1.0,t:'Hide in the wardrobe',cam:[-4.45,FLOOR2+1.45,-2.6],yaw:-Math.PI/2},
  {id:'tub',in:1,f:1,x:3.7,z:-2.2,r:1.1,t:'Hide in the bathtub',cam:[3.9,FLOOR2+0.45,-3.2],yaw:0}];
(function(){
  var wallM=IM.wall, floorM=new THREE.MeshStandardMaterial({map:rep(plankTex,5,3),color:lin(0x8a6a4a),roughness:.6}), ceilM=mat(0xe6e1d6,{roughness:1});
  var woodM=new THREE.MeshStandardMaterial({map:rep(plankTex,1,1),color:lin(0x5a3e2a),roughness:.6}), sheetM=mat(0xd8d2c4,{roughness:1}), blanketM=mat(0x5a2a3a,{roughness:1});
  var whiteM=mat(0xeeeeea,{roughness:.25}), steelM=mat(0xaeb3ba,{roughness:.3,metalness:.3}), curtainM=mat(0x8aa8b8,{roughness:1}), tileM=mat(0xc8d0d4,{roughness:.4});
  function ub(w,h,d,m,x,y,z,col){ var b=box(w,h,d,m,x,y,z,interior); if (col) IB1.push({minX:IX+x-w/2,maxX:IX+x+w/2,minZ:z-d/2,maxZ:z+d/2}); return b; }
  function ib(w,h,d,m,x,y,z,col){ var b=box(w,h,d,m,x,y,z,interior); if (col) addBox(IX+x,z,w/2,d/2); return b; }
  // open the ceiling over the stairs and make it the upstairs floor
  interior.children.slice().forEach(function(o){ if (o.isMesh && o.geometry.parameters && Math.abs(o.position.y-2.75)<0.01 && o.geometry.parameters.width>9) interior.remove(o);
    if (o.isMesh && o.material && o.material.isMeshBasicMaterial && Math.abs(o.position.y-2.69)<0.01) interior.remove(o); });
  [[4.57,7.8,-2.615,0],[3.98,7.8,2.91,0],[1.25,0.65,0.295,-3.575],[1.25,3.4,0.295,2.2]].forEach(function(a){ ib(a[0],0.1,a[1],ceilM,a[2],2.75,a[3]); ib(a[0],0.02,a[1],floorM,a[2],2.81,a[3]); });
  // upstairs shell
  ub(9.8,2.7,0.2,wallM,0,FLOOR2+1.35,-3.9,true); ub(9.8,2.7,0.2,wallM,0,FLOOR2+1.35,3.9,true); ub(0.2,2.7,7.8,wallM,-4.9,FLOOR2+1.35,0,true); ub(0.2,2.7,7.8,wallM,4.9,FLOOR2+1.35,0,true);
  ib(9.8,0.1,7.8,ceilM,0,FLOOR2+2.72,0);
  // railing round the stairwell
  var railM=woodM; ub(0.06,0.06,3.2,railM,-0.36,FLOOR2+0.95,-1.1,false); ub(0.06,0.06,3.2,railM,0.95,FLOOR2+0.95,-1.1,false); ub(1.37,0.06,0.06,railM,0.3,FLOOR2+0.95,0.5,false);
  for (var i=0;i<6;i++){ ub(0.04,0.95,0.04,railM,-0.36,FLOOR2+0.47,0.45-i*0.62); ub(0.04,0.95,0.04,railM,0.95,FLOOR2+0.47,0.45-i*0.62); }
  ub(0.12,1.0,0.12,railM,-0.36,FLOOR2+0.5,-2.72); ub(0.12,1.0,0.12,railM,0.95,FLOOR2+0.5,-2.72); ub(0.12,1.0,0.12,railM,-0.36,FLOOR2+0.5,0.5); ub(0.12,1.0,0.12,railM,0.95,FLOOR2+0.5,0.5);
  cyl(0.22,0.22,0.03,14,glow(0xfff1dc),0.3,FLOOR2+2.66,-1.6,iLights);
  IB1.push({minX:IX-0.4,maxX:IX-0.32,minZ:-2.7,maxZ:0.55},{minX:IX+0.91,maxX:IX+0.99,minZ:-2.7,maxZ:0.55},{minX:IX-0.4,maxX:IX+0.99,minZ:0.46,maxZ:0.55});
  // left: bedroom
  ub(0.15,2.7,4.6,wallM,-1.3,FLOOR2+1.35,1.6,true);
  ub(1.6,0.42,2.2,woodM,-3.3,FLOOR2+0.36,1.6,true); ub(1.5,0.14,2.1,sheetM,-3.3,FLOOR2+0.64,1.6); ub(1.52,0.06,1.4,blanketM,-3.3,FLOOR2+0.72,2.0); ub(1.6,0.9,0.1,woodM,-3.3,FLOOR2+0.6,0.45);
  ub(0.5,0.12,0.36,sheetM,-3.3,FLOOR2+0.75,0.75);
  ub(0.7,2.1,1.3,woodM,-4.45,FLOOR2+1.05,-2.6,true); ub(0.02,1.9,0.02,mat(0x1a1410),-4.09,FLOOR2+1.05,-2.6);
  ub(0.5,0.6,0.5,woodM,-2.2,FLOOR2+0.3,0.3,true); cyl(0.12,0.16,0.28,10,glow(0xffd9a0),-2.2,FLOOR2+0.75,0.3,iLights); halo(0xffc070,1.6,-2.2,FLOOR2+0.8,0.3,iLights,.6);
  ub(2.2,0.02,1.6,mat(0x3a4a6a,{roughness:1}),-3.0,FLOOR2+0.03,-1.0);
  // right: bathroom
  ub(0.15,2.7,2.8,wallM,2.2,FLOOR2+1.35,-2.5,true); ub(2.7,0.02,2.8,tileM,3.55,FLOOR2+0.03,-2.5);
  ub(1.8,0.55,0.8,whiteM,3.9,FLOOR2+0.28,-3.3,true); ub(1.6,0.1,0.6,mat(0x9ab0c0,{roughness:.1}),3.9,FLOOR2+0.5,-3.3);
  ub(0.03,1.6,1.8,curtainM,3.9,FLOOR2+1.6,-2.88); cyl(0.015,0.015,1.9,6,steelM,3.9,FLOOR2+2.42,-2.88,interior).rotation.z=Math.PI/2;
  ub(0.6,0.85,0.45,whiteM,2.7,FLOOR2+0.42,-3.6,true); ub(0.5,0.6,0.03,mat(0x9aaab8,{roughness:.05,metalness:.4}),2.7,FLOOR2+1.5,-3.78);
  // right front: kid's room
  ub(1.0,0.4,1.8,woodM,4.2,FLOOR2+0.2,2.6,true); ub(0.95,0.12,1.7,mat(0x6a8a5a),4.2,FLOOR2+0.46,2.6);
  ub(0.8,0.5,0.5,mat(0xb85a3a),2.9,FLOOR2+0.25,3.4,true);
  // windows upstairs
  [-3.2,3.2].forEach(function(wx){ ub(1.6,1.1,0.04,winDarkM,wx,FLOOR2+1.5,3.77); ub(1.9,0.06,0.2,trimM,wx,FLOOR2+0.92,3.72); });
  // ceiling lights upstairs
  cyl(0.3,0.3,0.03,16,glow(0xfff1dc),-3.0,FLOOR2+2.66,0.4,iLights); cyl(0.3,0.3,0.03,16,glow(0xffe2b0),3.4,FLOOR2+2.66,-1.0,iLights); cyl(0.3,0.3,0.03,16,glow(0xfff1dc),0.3,FLOOR2+2.66,2.4,iLights);
  // new downstairs hiding places: coat closet and pantry
  ib(0.75,2.1,1.1,woodM,-4.47,1.05,2.6,true); ib(0.02,1.9,0.02,mat(0x1a1410),-4.08,1.05,2.6);
  ib(0.75,2.1,1.1,mat(0xe2dccd,{roughness:.5}),4.47,1.05,2.5,true); ib(0.02,1.9,0.02,mat(0x26262a),4.08,1.05,2.5);
  // stairs: ground-floor side rail; the old blockers become switchable
  addBox(IX-0.36,-1.9,0.04,2.0);
  colliders.forEach(function(c){ if ((Math.abs(c.minX-(IX+0.25-0.62))<0.01 && Math.abs(c.minZ-(-1.7-2.2))<0.01) || (Math.abs(c.minX-(IX+0.25-0.28))<0.01 && Math.abs(c.minZ-(1.0-0.28))<0.01)) STAIRBLK.push(c); });
  interior.traverse(function(o){ if (o.isMesh && o.material.isMeshStandardMaterial){ o.castShadow=true; o.receiveShadow=true; } });
})();
SPOTS.push({k:'hide',x:-3.8,z:2.6,r:1.0,t:'Hide in the coat closet',cam:[-4.45,1.45,2.6],yaw:-Math.PI/2},{k:'hide',x:3.8,z:2.5,r:1.0,t:'Hide in the pantry',cam:[4.45,1.45,2.5],yaw:Math.PI/2});
// standing at the foot or the top of the stairs offers a quick way up or down
function stairNear(){ return null; }   // the stairs are just walked now
function stairsOpen(on){ STAIRBLK.forEach(function(c){ var k=colliders.indexOf(c); if (on && k>=0) colliders.splice(k,1); if (!on && k<0) colliders.push(c); }); }
function onStairs(x,z){ var lx=x-IX; return lx>-0.3 && lx<0.82 && z>-3.9 && z<0.55; }
function stairY(z){ return Math.max(0,Math.min(1,(0.5-z)/3.78))*FLOOR2; }
// keeps something that is inside a house on the right floor and out of the walls
function iFix(e,r){
  if (onStairs(e.x,e.z) && !(e.z<-3.05 && (e.fl|0)===1)){ e.y=stairY(e.z); if (e.z>-2.7) e.x=Math.max(IX-0.3+0.22,Math.min(IX+0.82-0.22,e.x)); e.fl=e.y>1.4?1:0; }
  else { resolve(e,r,e.fl?IB1:null); e.y=e.fl?FLOOR2:0; }
  e.x=Math.max(IX-4.6,Math.min(IX+4.6,e.x)); e.z=Math.max(-3.6,Math.min(3.55,e.z));
}

function setFov(f){ if (camera.fov!==f){ camera.fov=f; camera.updateProjectionMatrix(); } }
function indoorsView(){ return !!shelter && (shelter.view==='walk' || shelter.view==='hide'); }
function groundY(x,z){
  for (var i=0;i<houses.length;i++){ var h=houses[i], lx=Math.abs(x-h.x); if (lx>2.05) continue;
    var fd=(h.z-z)*h.side; if (fd>=3.9 && fd<=6.2) return 0.6; if (fd>6.2 && fd<=6.7 && lx<1) return 0.3; }
  return 0;
}
function iDoorSet(gone){ iDoor.visible=!gone; iGap.visible=gone; }
function thud(v){ noise(0.16,0.7*v,220); tone(72,0.22,'sine',0.5*v,38); }
function layResident(){
  var R=resident; R.dead=true; R.g.visible=true;
  R.g.rotation.set(-Math.PI/2,0,-Math.PI/2); R.g.position.set(IX-1.6,0.14,2.35); blood.visible=true;
}
function markBreached(h){
  h.breached=true; h.pivot.visible=false; h.broken.visible=true; h.hall.visible=true; h.hall.material.color.copy(lin(h.power?0xffc070:0x05070c)); h.cd=0;
  moonLight.shadow.needsUpdate=true;
}
function enterShelter(h,saw){
  var S=stalker, pound=!!saw && !h.breached, viaGen=pound && h.power && Math.random()<0.5;
  shelter={h:h,t:15,base:h.side>0?0:Math.PI,view:'walk',spot:null,hinted:false,out:false,free:h.breached,pound:pound&&!viaGen?0:-1,genT:viaGen?0:-1,hidOk:false,shake:0,lightWas:P.light};
  I.x=IX; I.z=2.7; P.yaw=0; P.pitch=0; P.stamina=1; P.spent=false; P.sprinting=false;
  showPrompt(null); iDoorSet(h.breached); iPowerSet(h.power); game.fix=null;
  game.kA=0; vmL.visible=false;
  var hix=houses.indexOf(h); IM.wall.color.copy(lin(IWALL[hix%12])); IM.sofa.color.copy(lin(ISOFA[hix%12])); IM.rug.color.copy(lin(IRUG[hix%12])); IM.cab.color.copy(lin(ICAB[hix%6]));
  if (h.dead){ showResident(h.n); layResident(); }
  else if (h.breached) resident.g.visible=false;
  else { showResident(h.n); resident.g.position.set(IX+0.25,0,1.0); }
  moonLight.intensity=0; setLeaves(false); vm.visible=true; torch.visible=P.light;
  $('safe').hidden=false; $('fade').style.opacity=0;
  noise(0.12,0.3,400);
  if (pound){
    S.mode='pound'; S.g.visible=true; S.g.rotation.y=h.side>0?0:Math.PI; setAnim('Idle');
    if (viaGen) S.g.position.set(h.gen.x,0,h.gen.z+h.side*0.9); else S.g.position.set(h.x,0.6,h.z-h.side*4.95);
    say(h.n,viaGen?'He saw you! He’s going round the back … hide under the kitchen table!':'He saw you come in! Hide — under the kitchen table!',4200);
  }
}
function enterView(sp){
  var sh=shelter;
  if (sp.k==='table' || sp.k==='hide'){ sh.hc=sp.cam||[3.1,0.4,1.42];
    var S=stalker, d=Math.hypot(I.x-S.g.position.x,I.z-S.g.position.z);
    youSay('Don\u2019t breathe.');
    sh.view='hide'; sh.hidOk=!(S.mode==='indoor' && S.inn.phase==='hunt' && d<3.4);
    if (!sh.hidOk) toast('He saw you go under.',2200);
    sh.lightWas=P.light; setLight(false); vm.visible=false; P.pitch=0.05; if (sp.yaw!==undefined) P.yaw=sp.yaw; setPrompt(sp.k==='hide'?'Come out':'Crawl out','Out');
    return;
  }
  sh.view=sp.k; sh.wx=sp.x; P.yaw=sh.base; P.pitch=0;
  moonLight.intensity=0.55; setLeaves(true); vm.visible=false; torch.visible=false;
  $('inside').hidden=sp.k!=='window'; $('peep').hidden=sp.k!=='peep'; setFov(sp.k==='peep'?96:70);
  sh.viewScare = (stalker.state==='away' && !stalker.mode && Math.random()<0.33) ? 0.8+Math.random()*1.2 : 0;
  setPrompt('Step back','Back');
}
function leaveView(){
  var sh=shelter;
  if (sh.view==='hide'){ sh.view='walk'; sh.hidOk=false; setLight(sh.lightWas); vm.visible=true; curPrompt=undefined; return; }
  sh.view='walk'; P.yaw=Math.PI; P.pitch=0; curPrompt=undefined;
  moonLight.intensity=0; setLeaves(false); vm.visible=true; torch.visible=P.light;
  $('inside').hidden=true; $('peep').hidden=true; setFov(70);
}
function leaveShelter(walkedOut){
  var sh=shelter, h=sh.h, S=stalker; shelter=null;
  moonLight.intensity=0.55; setLeaves(true); setFov(70); resident.g.visible=false; blood.visible=false; setPrompt(null);
  P.x=h.x; P.z=h.z-h.side*(walkedOut?5.9:7.3); P.yaw=sh.base; P.pitch=0; setLight(P.light); vm.visible=true;
  $('inside').hidden=true; $('peep').hidden=true; $('safe').hidden=true; $('fade').style.opacity=0;
  if (walkedOut){
    if (S.mode==='indoor'){                               // he comes out after you
      if (!h.dead && (S.inn.phase==='kill' || S.inn.phase==='strike')) h.dead=true;
      S.mode='emerge'; S.timer=S.inn.phase==='search'?5:2.2; S.raise=0; S.g.visible=false; S.ex=h.x; S.ez=h.z-h.side*4.95;
    }
    return;
  }
  h.cd=game.time+60;
  if (!S.mode && S.g.visible && Math.hypot(S.g.position.x-P.x,S.g.position.z-P.z)<18){ S.state='away'; S.timer=5; S.g.visible=false; }
  noise(0.12,0.3,400); say(h.n,'I can’t keep you here. Go.',3000);
}

/* ---------- the killer inside the house ---------- */
var WPS=[[-0.95,2.4],[-0.95,-0.6],[-2.9,-2.0],[-0.95,-0.6],[-0.95,2.4],[1.6,2.45],[1.6,-1.4],[2.7,-1.9],[1.6,-1.4],[2.0,2.3],[0,3.0]];
function goIndoor(){
  var S=stalker, h=shelter.h;
  S.mode='indoor'; S.g.visible=true; S.g.position.set(IX,0,3.05); S.g.rotation.y=Math.PI; S.raise=0;
  S.inn={phase:h.dead?'hunt':'kill',t:0,wp:0,acc:0,lx:IX,lz:3.05,ghost:0,moved:false};
  setTimeout(function(){ if (game.mode==='play' && stalker.mode==='indoor') eliasSays(shelter && shelter.h.dead ? 'I know you came back.' : 'I saw you come in.'); },600);
}
function stepTo(x,z,sp,dt){
  var S=stalker, g=S.g, n=S.inn, dx=x-g.position.x, dz=z-g.position.z, d=Math.hypot(dx,dz);
  if (d<0.25) return true;
  var p={x:g.position.x+dx/d*sp*dt, z:g.position.z+dz/d*sp*dt};
  if (n.ghost<=0) resolve(p,0.3);
  g.position.x=p.x; g.position.z=p.z; n.moved=true; turnTo(g,Math.atan2(dx,dz),dt);
  return false;
}
function updateIndoor(dt){
  var S=stalker, g=S.g, n=S.inn, sh=shelter, h=sh.h;
  var dist=Math.hypot(I.x-g.position.x,I.z-g.position.z);
  n.t+=dt; n.acc+=dt; n.ghost-=dt; n.moved=false;
  if (n.phase==='kill'){
    if (stepTo(IX+0.25,1.95,2.6,dt) || n.t>2.6){ n.phase='strike'; n.t=0; }
  } else if (n.phase==='strike'){
    turnTo(g,Math.PI,dt); S.raise=Math.min(1,n.t*3);
    if (n.t>0.75){
      h.dead=true; bloodBurst(IX+0.25,1.3,1.0,0,1,50); stabSound(); layResident(); S.raise=0; n.phase='hunt'; n.t=0;
      tone(880,0.45,'sawtooth',0.14,260); noise(0.25,0.5,900); sh.shake=0.4;
      $('flash').style.opacity=0.45; setTimeout(function(){ if (game.mode==='play') $('flash').style.opacity=0; },220);
      toast('He killed '+NEIGHBOURS[h.n].n+'.',2600);
    }
  } else if (n.phase==='hunt'){
    if ((sh.view==='hide' && sh.hidOk) || (!h.power && !P.light && dist>2.6)){ n.phase='search'; n.wp=0; eliasSays('I know you are in here.'); }
    else stepTo(I.x,I.z,2.7,dt);
  } else {                                                // search: walks the rooms, then leaves
    if (sh.view!=='hide' && (h.power || P.light || dist<2.2)){ n.phase='hunt'; }
    else if (stepTo(IX+WPS[n.wp][0],WPS[n.wp][1],1.9,dt)){
      n.wp++;
      if (n.wp>=WPS.length){ S.mode=null; S.inn=null; S.state='away'; S.timer=14; g.visible=false; eliasSays('Next October.'); toast('He’s gone. For now.',2600); return 99; }
    }
  }
  if (n.acc>1){ var pr=Math.hypot(g.position.x-n.lx,g.position.z-n.lz); if (n.wasMoving && pr<0.35) n.ghost=1.2; n.lx=g.position.x; n.lz=g.position.z; n.acc=0; }
  n.wasMoving=n.moved;
  if (S.mixer) setAnim(n.moved?'Walk':'Idle');
  if (S.actions.Walk) S.actions.Walk.timeScale=1.2;
  return dist;
}

function updateShelter(dt){
  var sh=shelter, h=sh.h, S=stalker;
  if (sh.pound>=0){                                       // he is breaking the door down
    var p0=sh.pound; sh.pound+=dt;
    [0.8,1.7,2.6,3.4].forEach(function(tt){ if (p0<tt && sh.pound>=tt){ thud(1); sh.shake=0.3; S.raise=1; } });
    S.raise=Math.max(0,S.raise-dt*2.2);
    if (sh.pound>=4.2){ sh.pound=-1; sh.free=true; markBreached(h); iDoorSet(true); noise(0.5,0.9,1800); thud(1.4); sh.shake=0.6; goIndoor(); }
  } else if (sh.genT>=0){                                 // he tears out the generator, then comes in
    var g0=sh.genT; sh.genT+=dt;
    if (g0<2.6 && sh.genT>=2.6){ setPower(h,false); iPowerSet(false); tone(120,0.9,'sawtooth',0.12,30); noise(0.3,0.5,1200); sh.shake=0.3;
      S.g.position.set(h.x,0.6,h.z-h.side*4.95); toast('The generator dies. Keep your flashlight off: he sees the light.',4000); }
    if (g0<5.2 && sh.genT>=5.2){ thud(1); sh.shake=0.3; }
    if (sh.genT>=6.2){ sh.genT=-1; sh.free=true; markBreached(h); iDoorSet(true); noise(0.5,0.9,1800); thud(1.4); sh.shake=0.6; goIndoor(); }
  } else if (!sh.free) sh.t-=dt;
  $('safe').textContent = sh.pound>=0 ? 'He saw you go in' : sh.genT>=0 ? (sh.genT<2.6?'He saw you go in':'He cut the power') : (S.mode==='indoor' ? 'He’s in the house' : (sh.free ? 'No door · no time limit' : 'Safe inside · 0:'+('0'+Math.max(0,Math.ceil(sh.t))).slice(-2)));
  $('stamina').firstElementChild.style.width='100%'; $('stamina').classList.remove('low');
  var mx=(keys.KeyD||keys.ArrowRight?1:0)-(keys.KeyA||keys.ArrowLeft?1:0)+touchMove.x;
  var mz=(keys.KeyS||keys.ArrowDown?1:0)-(keys.KeyW||keys.ArrowUp?1:0)+touchMove.y;
  var m=Math.hypot(mx,mz); if (m>1){ mx/=m; mz/=m; m=1; }
  sh.shake=Math.max(0,sh.shake-dt);
  var jx=(Math.random()-.5)*sh.shake*0.12, jy=(Math.random()-.5)*sh.shake*0.12;
  if (sh.view==='walk'){
    var f=fwd(), rx=Math.cos(P.yaw), rz=-Math.sin(P.yaw), sp=3.0;
    I.x+=(rx*mx-f.x*mz)*sp*dt; I.z+=(rz*mx-f.z*mz)*sp*dt; resolve(I,0.32);
    if (m>0.1){ P.bob+=dt*sp*1.9; P.step+=dt*sp; if (P.step>2.3){ P.step=0; stepSound(false,true); } }
    var bob=reduced?0:Math.sin(P.bob)*0.035;
    FX.breath+=dt*1.6; bob+=reduced?0:Math.sin(FX.breath)*0.006;
    FX.roll+=((reduced?0:-mx*0.018)-FX.roll)*Math.min(1,dt*7);
    sh.hk=Math.max(0,(sh.hk||0)-dt*3.2); var hb=sh.hk*sh.hk*(3-2*sh.hk), HC=sh.hc||[3.1,0.4,1.42];
    camera.position.set(I.x+(IX+HC[0]-I.x)*hb+jx,1.62+bob+(HC[1]-1.62)*hb+jy,I.z+(HC[2]-I.z)*hb); camera.rotation.set(P.pitch,P.yaw,FX.roll);
    sway.x*=Math.max(0,1-dt*7); sway.y*=Math.max(0,1-dt*7);
    vm.position.set(vmBase.x+sway.x,vmBase.y+sway.y-bob*.5,vmBase.z); vm.rotation.set(sway.y*2+.04,-sway.x*2+.1,0);
    if (!resident.dead && resident.g.visible) turnTo(resident.g, Math.atan2(I.x-resident.g.position.x, I.z-resident.g.position.z), dt);
    var lx=I.x-IX, spot=null;
    if (sh.free && (sh.pound<0 && sh.genT<0) && I.z>3.36 && Math.abs(lx)<0.5 && mz*Math.cos(P.yaw)-mx*Math.sin(P.yaw)>0.2){ leaveShelter(true); return; }
    for (var i=0;i<SPOTS.length;i++){ var s=SPOTS[i]; if (s.k==='peep' && h.breached) continue; if (Math.hypot(lx-s.x,I.z-s.z)<s.r){ spot=s; break; } }
    sh.spot=spot; setPrompt(spot?spot.t:(sh.free && (sh.pound<0 && sh.genT<0) && I.z>2.6 && Math.abs(lx)<0.9 ? 'Walk out through the doorway' : null), spot?((spot.k==='table'||spot.k==='hide')?'Hide':'Look'):null);
    if (!sh.hinted && !h.dead && (sh.pound<0 && sh.genT<0) && S.mode!=='indoor' && lx>-0.7 && lx<1.2 && I.z<1.75 && I.z>0.4){ sh.hinted=true; say(h.n,'Not upstairs. Stay down here.',2600); }
  } else if (sh.view==='hide'){
    P.pitch=Math.max(-0.25,Math.min(0.4,P.pitch));
    sh.hk=Math.min(1,(sh.hk||0)+dt*3.2); var hb2=sh.hk*sh.hk*(3-2*sh.hk), hbr=reduced?0:Math.sin(game.time*2.6)*0.004, HC2=sh.hc||[3.1,0.4,1.42];
    camera.position.set(I.x+(IX+HC2[0]-I.x)*hb2+jx,1.62+(HC2[1]-1.62)*hb2+hbr+jy,I.z+(HC2[2]-I.z)*hb2); camera.rotation.set(P.pitch,P.yaw,0);
    if (m>0.6) leaveView();
  } else {
    var lim=sh.view==='peep'?0.55:1.1;
    P.yaw=Math.max(sh.base-lim,Math.min(sh.base+lim,P.yaw)); P.pitch=Math.max(-0.5,Math.min(0.35,P.pitch));
    if (sh.view==='peep') tmpV.set(0,2.1,4.25); else tmpV.set(sh.wx,2.7,4.34);
    h.g.localToWorld(tmpV); camera.position.copy(tmpV); camera.rotation.set(P.pitch,P.yaw,0);
    if (sh.viewScare>0){ sh.viewScare-=dt; if (sh.viewScare<=0){
      if (sh.view==='peep' && stalker.state==='away' && !stalker.mode){ var sp2=loc(h,0,0.6,5.1); S.g.visible=true; S.g.position.set(sp2[0],sp2[1],sp2[2]); S.g.rotation.y=h.g.rotation.y+Math.PI; S.raise=0; setAnim('Idle'); S.scare=0.8; S.timer=Math.max(S.timer,8); scareSound(); shake(); }
      else jumpFace(); } }
    if (m>0.6) leaveView();
  }
  menace(dt, S.mode==='indoor' && !!S.inn && S.inn.phase==='hunt');
  if (!shelter || game.mode!=='play') return;
  if (!sh.free && (sh.pound<0 && sh.genT<0)){
    if (sh.t<=0.45 && !sh.out){ sh.out=true; $('fade').style.opacity=1; }
    if (sh.t<=0){ if (sh.view!=='walk') leaveView(); leaveShelter(false); }
  }
}

/* ---------- audio ---------- */
var AC=null, master=null, muted=false, droneGain=null;
function initAudio(){
  if (AC){ if (AC.state==='suspended') AC.resume(); return; }
  try {
    var C=window.AudioContext||window.webkitAudioContext; AC=new C();
    master=AC.createGain(); master.gain.value=muted?0:0.9; master.connect(AC.destination);
    droneGain=AC.createGain(); droneGain.gain.value=0.05;
    var lp=AC.createBiquadFilter(); lp.type='lowpass'; lp.frequency.value=140; lp.connect(droneGain); droneGain.connect(master);
    [55,55.6,82.1].forEach(function(f){ var o=AC.createOscillator(); o.type='sawtooth'; o.frequency.value=f; o.connect(lp); o.start(); });
    // wind
    var wb=AC.createBuffer(1,AC.sampleRate*2,AC.sampleRate), wd=wb.getChannelData(0); for (var i=0;i<wd.length;i++) wd[i]=Math.random()*2-1;
    var ws=AC.createBufferSource(); ws.buffer=wb; ws.loop=true; var wf=AC.createBiquadFilter(); wf.type='bandpass'; wf.frequency.value=420; wf.Q.value=.6;
    var wg=AC.createGain(); wg.gain.value=0.035; var lfo=AC.createOscillator(); lfo.frequency.value=0.13; var lg=AC.createGain(); lg.gain.value=180; lfo.connect(lg); lg.connect(wf.frequency); lfo.start();
    ws.connect(wf); wf.connect(wg); wg.connect(master); ws.start(); windBuf=wb;
    var rs=AC.createBufferSource(); rs.buffer=wb; rs.loop=true; rs.playbackRate.value=1.31; var rf=AC.createBiquadFilter(); rf.type='highpass'; rf.frequency.value=2600; rainGain=AC.createGain(); rainGain.gain.value=0.02; rs.connect(rf); rf.connect(rainGain); rainGain.connect(master); rs.start();
  } catch(e){ AC=null; }
}
function tone(freq,dur,type,vol,slideTo,when){
  if (!AC) return; var t=AC.currentTime+(when||0);
  var o=AC.createOscillator(), g=AC.createGain(); o.type=type||'sine';
  o.frequency.setValueAtTime(freq,t); if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo,t+dur);
  g.gain.setValueAtTime(0.0001,t); g.gain.exponentialRampToValueAtTime(vol,t+0.012); g.gain.exponentialRampToValueAtTime(0.0001,t+dur);
  o.connect(g); g.connect(master); o.start(t); o.stop(t+dur+0.05);
}
var noiseBuf=null;
function noise(dur,vol,freq,when){
  if (!AC) return;
  if (!noiseBuf){ noiseBuf=AC.createBuffer(1,AC.sampleRate*0.3,AC.sampleRate); var d=noiseBuf.getChannelData(0); for (var i=0;i<d.length;i++) d[i]=Math.random()*2-1; }
  var s=AC.createBufferSource(); s.buffer=noiseBuf; var f=AC.createBiquadFilter(); f.type='lowpass'; f.frequency.value=freq;
  var g=AC.createGain(), t=AC.currentTime+(when||0); s.loop=true; g.gain.setValueAtTime(vol,t); g.gain.exponentialRampToValueAtTime(0.0001,t+dur);
  s.connect(f); f.connect(g); g.connect(master); s.start(t); s.stop(t+dur);
}
var CHASE=null;
function chaseMusic(fr,dt){ if (!AC) return; fr=Math.max(0,Math.min(1,fr||0));
  if (!CHASE){ var g=AC.createGain(); g.gain.value=0; g.connect(master); var lp=AC.createBiquadFilter(); lp.type='lowpass'; lp.frequency.value=300; lp.Q.value=6; lp.connect(g);
    [55,58.27,41.2].forEach(function(f){ var o=AC.createOscillator(); o.type='sawtooth'; o.frequency.value=f; o.connect(lp); o.start(); });
    var hi=AC.createGain(); hi.gain.value=0; hi.connect(master); var trem=AC.createGain(); trem.gain.value=0.5; trem.connect(hi);
    [1244.5,1318.5,1396.9].forEach(function(f,i){ var o=AC.createOscillator(); o.type=i===1?'triangle':'sine'; o.frequency.value=f; var lfo=AC.createOscillator(); lfo.frequency.value=7+i*1.3; var lg=AC.createGain(); lg.gain.value=f*0.006; lfo.connect(lg); lg.connect(o.frequency); lfo.start(); o.connect(trem); o.start(); });
    var tl=AC.createOscillator(); tl.frequency.value=11; var tg=AC.createGain(); tg.gain.value=0.5; tl.connect(tg); tg.connect(trem.gain); tl.start();
    CHASE={g:g,lp:lp,hi:hi,beat:0,lvl:0,scr:0}; }
  var C=CHASE, now=AC.currentTime; C.lvl+=(fr-C.lvl)*Math.min(1,dt*(fr>C.lvl?3:0.8));
  C.g.gain.setTargetAtTime(C.lvl*0.16,now,0.15); C.lp.frequency.setTargetAtTime(220+C.lvl*1400,now,0.2); C.hi.gain.setTargetAtTime(C.lvl*C.lvl*0.05,now,0.2);
  if (C.lvl>0.05){ C.beat-=dt; if (C.beat<=0){ C.beat=0.95-C.lvl*0.6; tone(70,0.3,'sine',0.35*C.lvl,36); noise(0.12,0.12*C.lvl,500); if (C.lvl>0.5) tone(140,0.12,'square',0.05*C.lvl,70,0.16); }
    C.scr-=dt; if (C.lvl>0.75 && C.scr<=0){ C.scr=2.5+Math.random()*2.5; tone(1900+Math.random()*600,0.6,'sawtooth',0.05*C.lvl,1200); } } }
function heartbeat(v){ tone(62,0.16,'sine',v,38); tone(56,0.18,'sine',v*0.8,34,0.2); }
function sting(v,long){
  [311,330,466,494,698].forEach(function(f,i){ tone(f*(long?1:0.5), long?1.6:0.7, 'sawtooth', v/(i+2), f*(long?0.92:0.48)); });
  if (long) noise(0.3,0.5,2500);
}
var chaseNotes=[440,659,523,659,494,659,415,659], chaseStep=0, chaseClock=0;

/* ---------- state ---------- */
var P={gy:0,x:-62,z:0,yaw:-Math.PI/2,pitch:0,stamina:1,spent:false,rest:0,light:true,bob:0,step:0,sprinting:false};
var game={role:'victim',part:1,paused:false,fix:null,nearGen:null,mode:'menu',got:0,time:0,gateOpen:0,gateOpening:false,heart:0,stingCd:0,dying:0,hint:0,menuT:0};
var keys={}, touchMove={x:0,y:0}, runHeld=false;

var pips=[];
function buildPips(){ pips.forEach(function(p){ p.remove(); }); pips=[]; for (var pi=0;pi<FUSES;pi++){ var s=document.createElement('i'); s.className='pip'; $('fuses').appendChild(s); pips.push(s); } }
var toastT=null;
function toast(msg,ms){ var t=$('toast'); t.textContent=msg; t.style.opacity=1; clearTimeout(toastT); toastT=setTimeout(function(){ t.style.opacity=0; }, ms||3500); }
function setHud(on){ ['objective','pauseBtn','stamina'].forEach(function(id){ $(id).hidden=!on; }); $('pad').hidden=!(on&&isTouch); if (!on) $('stick').hidden=true; }
function setLight(on){ P.light=on; torch.visible=on; lensM.color.copy(lin(on?0xfff4d8:0x1a1a1a)); }

function reset(){
  if (typeof STAIRBLK!=='undefined' && STAIRBLK) stairsOpen(false);
  P.x=-62; P.z=0; P.yaw=-Math.PI/2; P.pitch=0; P.stamina=1; P.spent=false; P.crouch=false; P.eye=1.65; setLight(true); crouchUI();
  game.got=0; game.time=0; game.gateOpen=0; game.gateOpening=false; game.heart=0; game.stingCd=0; game.dying=0; game.hint=0;
  pips.forEach(function(p){ p.classList.remove('on'); });
  if (colliders.indexOf(gateCollider)<0) colliders.push(gateCollider);
  leaves.forEach(function(l){ l.g.rotation.y=0; });
  gateLamp.material.color.set(0xff2222); gateHalo.material.color.copy(lin(0xff3030));
  stalker.state='away'; stalker.timer=14; stalker.g.visible=false; stalker.raise=0;
  $('fear').style.opacity=0; $('flash').style.opacity=0; vm.visible=true;
  shelter=null; game.knock=null; P.gy=0; stalker.mode=null; stalker.inn=null;
  houses.forEach(function(h){ if (h.splint) h.splint.visible=false; h.pivot.rotation.z=0; h.pivot.position.z=4.05; h.cd=0; h.open=0; h.hall.visible=false; h.hall.material.color.copy(lin(0xc98a48)); h.pivot.rotation.y=0; h.pivot.visible=true; h.broken.visible=false; h.breached=false; h.dead=false; });
  iDoorSet(false); blood.visible=false; resident.dead=false; resident.g.rotation.set(0,0,0); iPowerSet(true); game.fix=null; game.nearGen=null; houses.forEach(function(h){ setPower(h,true); });
  STN.open=0; STN.want=0; STN.doors.forEach(function(d){ d.g.position.z=d.sd*0.5; }); if (colliders.indexOf(STN.col)<0) colliders.push(STN.col);
  game.scareT=45+Math.random()*50; stalker.scare=0; $('jump').hidden=true;
  game.clerk=18+Math.floor(Math.random()*(NEIGHBOURS.length-18)); game.clerkOn=false; game.nearClerk=false;
  game.kA=0; vmL.visible=false; bloodClear(); fin=null; $('cineSkip').hidden=false; moveCar(-64,2.6); gasCan.visible=battery.visible=keysG.visible=leverG.visible=truckG.visible=boxG.visible=false; game.clerkGone=false; setChain(game.role==='victim'); beacon.visible=false; story.hold=null; story.tearH=null; surv.active=false; $('cine').hidden=true; $('grain').hidden=false; cut=null;
  vmKnife.visible=false; $('fuseLabel').textContent=game.role==='killer'?'Their fuses':'Fuses';
  resident.g.visible=false; doorLight.intensity=0; showPrompt(null); $('inside').hidden=true; $('peep').hidden=true; $('safe').hidden=true; $('fade').style.opacity=0;
  moonLight.intensity=0.55; setLeaves(true); setFov(70);
  moonLight.shadow.needsUpdate=true;
  placeFuses();
  if (game.role==='killer') setupKiller();
}

/* ---------- input ---------- */
function touchUi(){
  isTouch=true;
  $('keysHelp').innerHTML='Left side: move &middot; Right side: look &middot; Buttons: run, light, use'; var _k='<dt>Move</dt><dd>Drag the left side</dd><dt>Look</dt><dd>Drag the right side</dd><dt>Run</dt><dd>Hold Run</dd><dt>Light</dt><dd>He tracks the light</dd><dt>Knock</dt><dd>At a front door &middot; a neighbour might let you in</dd>';
  if (game.mode==='play') $('pad').hidden=false;
}
if (isTouch) touchUi();
window.addEventListener('keydown',function(e){
  keys[e.code]=true;
  if (e.code==='KeyF' && game.mode==='play' && !game.paused && (!shelter || shelter.view==='walk')) toggleLight();
  if ((e.code==='Escape' || e.code==='KeyP') && game.mode==='play'){ if (game.paused) resume(); else pause(); }
  if (e.code==='KeyE') act();
  if (e.code==='KeyC' || e.code==='ControlLeft') toggleCrouch();
  if (game.mode==='play' && ['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].indexOf(e.code)>=0) e.preventDefault();
});
window.addEventListener('keyup',function(e){ keys[e.code]=false; });
window.addEventListener('blur',function(){ keys={}; });
function crouchUI(){ var b=$('btnCrouch'); if (!b) return; b.hidden=game.role==='killer'; b.classList.toggle('held',!!P.crouch); }
function toggleCrouch(){ if (game.mode!=='play' || game.paused || shelter || game.role==='killer' || (game.net && net.alive!==1)) return; P.crouch=!P.crouch; crouchUI(); noise(0.08,0.06,400); }
function toggleLight(){ setLight(!P.light); tone(900,0.04,'square',0.05); }
function lock(){ var el=renderer.domElement; try { var p=el.requestPointerLock&&el.requestPointerLock(); if (p&&p.catch) p.catch(function(){}); } catch(e){} }
function look(dx,dy,k){
  P.yaw-=dx*k; P.pitch-=dy*k; P.pitch=Math.max(-1.2,Math.min(1.2,P.pitch));
  sway.x=Math.max(-.05,Math.min(.05,sway.x+dx*k*.35)); sway.y=Math.max(-.04,Math.min(.04,sway.y-dy*k*.35));
}
var moveId=null, lookId=null, origin={x:0,y:0}, last={x:0,y:0}, mouseDown=false;
var cv=renderer.domElement;
cv.addEventListener('pointerdown',function(e){
  if (game.mode!=='play' || game.paused) return;
  if (e.pointerType==='touch'){
    if (!isTouch) touchUi();
    var r=wrap.getBoundingClientRect();
    if (e.clientX-r.left<r.width/2 && moveId===null){
      moveId=e.pointerId; origin.x=e.clientX; origin.y=e.clientY;
      var st=$('stick'); st.hidden=false; st.style.left=(e.clientX-r.left)+'px'; st.style.top=(e.clientY-r.top)+'px'; st.firstElementChild.style.transform='';
    } else if (lookId===null){ lookId=e.pointerId; last.x=e.clientX; last.y=e.clientY; }
    try { cv.setPointerCapture(e.pointerId); } catch(err){}
  } else { mouseDown=true; last.x=e.clientX; last.y=e.clientY; if (document.pointerLockElement!==cv) lock(); else if (e.button===0 && game.net && game.role==='killer') swing(); else if (e.button===0 && game.net) useHeld(); }
  e.preventDefault();
});
cv.addEventListener('pointermove',function(e){
  if (game.mode!=='play' || game.paused) return;
  if (e.pointerType==='touch'){
    if (e.pointerId===moveId){
      var dx=e.clientX-origin.x, dy=e.clientY-origin.y, m=Math.hypot(dx,dy), max=48;
      if (m>max){ dx*=max/m; dy*=max/m; }
      touchMove.x=dx/max; touchMove.y=dy/max; $('stick').firstElementChild.style.transform='translate('+dx+'px,'+dy+'px)';
    } else if (e.pointerId===lookId){ look(e.clientX-last.x,e.clientY-last.y,0.0055); last.x=e.clientX; last.y=e.clientY; }
  } else if (document.pointerLockElement===cv){ look(e.movementX||0,e.movementY||0,0.0023); }
  else if (mouseDown){ look(e.clientX-last.x,e.clientY-last.y,0.005); last.x=e.clientX; last.y=e.clientY; }
});
function endPointer(e){
  if (e.pointerId===moveId){ moveId=null; touchMove.x=touchMove.y=0; $('stick').hidden=true; }
  if (e.pointerId===lookId) lookId=null;
  if (e.pointerType!=='touch') mouseDown=false;
}
cv.addEventListener('pointerup',endPointer); cv.addEventListener('pointercancel',endPointer);
cv.addEventListener('contextmenu',function(e){ e.preventDefault(); });
var br=$('btnRun');
br.addEventListener('pointerdown',function(e){ runHeld=true; br.classList.add('held'); e.preventDefault(); });
['pointerup','pointercancel','pointerleave'].forEach(function(n){ br.addEventListener(n,function(){ runHeld=false; br.classList.remove('held'); }); });
$('btnLight').addEventListener('click',function(){ if (game.mode==='play' && !game.paused && (!shelter || shelter.view==='walk')) toggleLight(); });
$('btnKnock').addEventListener('click',act);
$('btnCrouch').addEventListener('click',function(){ toggleCrouch(); });

/* ---------- stalker logic ---------- */
function fwd(){ return {x:-Math.sin(P.yaw), z:-Math.cos(P.yaw)}; }
function inView(x,z){
  if (indoorsView()) return false;
  var dx=x-P.x, dz=z-P.z, d=Math.hypot(dx,dz); if (d>55) return false; if (d<0.5) return true;
  var f=fwd(); return (dx*f.x+dz*f.z)/d>0.4;
}
function teleport(first){
  var f=fwd(), a0=Math.atan2(f.x,f.z), S=stalker;
  for (var i=0;i<40;i++){
    var ahead=first||Math.random()<0.35, a, r;
    if (ahead){ a=a0+rand(-0.35,0.35); r=rand(27,33); } else { a=a0+Math.PI+rand(-1.3,1.3); r=rand(17,25); }
    var x=P.x+Math.sin(a)*r, z=P.z+Math.cos(a)*r;
    if (x>70 || x<-157 || Math.abs(z)>38 || blocked(x,z,0.8)) continue;
    if (!ahead && inView(x,z)) continue;
    S.g.position.set(x,0,z); S.g.visible=true; S.state='watch'; S.timer=ahead?rand(5,7):rand(1.5,3.5);
    S.stuck=0; S.unseen=0; S.lastX=x; S.lastZ=z; S.tx=P.x; S.tz=P.z; setAnim('Idle');
    return true;
  }
  return false;
}
function turnTo(g,target,dt){ var d=target-g.rotation.y; d=Math.atan2(Math.sin(d),Math.cos(d)); g.rotation.y+=d*Math.min(1,dt*6); }
function updateStalker(dt){
  var S=stalker, g=S.g;
  if (S.mode==='indoor') return shelter ? updateIndoor(dt) : 99;
  if (S.mode==='pound') return 4;
  if (S.mode==='emerge'){ S.timer-=dt; if (S.timer>0) return 30;
    S.mode=null; S.state='hunt'; S.timer=0; S.stuck=0; S.unseen=0; g.visible=true; g.position.set(S.ex,0.6,S.ez); S.lastX=S.ex; S.lastZ=S.ez; S.tx=P.x; S.tz=P.z; noise(0.2,0.4,600); }
  if (S.scare>0){ S.scare-=dt; if (S.scare<=0){ g.visible=false; S.raise=0; } return 99; }
  if (S.state==='away'){ S.timer-=dt; if (S.timer<=0 && !teleport(true)) S.timer=1; return 99; }
  var dx=P.x-g.position.x, dz=P.z-g.position.z, dist=Math.hypot(dx,dz);
  var seen=inView(g.position.x,g.position.z);
  S.unseen=seen?0:S.unseen+dt;
  if (shelter){ var hh=shelter.h;
    if (hh.breached){ S.tx=hh.x; S.tz=hh.z-hh.side*4.95; if (S.state==='hunt' && Math.hypot(g.position.x-S.tx,g.position.z-S.tz)<1.3){ goIndoor(); return 4; } }
    else { S.tx=hh.x+3; S.tz=hh.z-hh.side*10.5; } }
  else if (P.light || dist<(P.crouch?6:12) || (P.sprinting && dist<26)){ S.tx=P.x; S.tz=P.z; }
  var moving=false, sp=cfg.base+cfg.inc*game.got;
  if (S.state==='watch'){
    turnTo(g,Math.atan2(dx,dz),dt);
    S.timer-=dt; if (S.timer<=0 || dist<13){ S.state='hunt'; S.timer=0; }
  } else {
    var tx=S.tx-g.position.x, tz=S.tz-g.position.z, td=Math.hypot(tx,tz);
    if (td>0.6){
      var p={x:g.position.x+tx/td*sp*dt, z:g.position.z+tz/td*sp*dt};
      if (S.stuck<3) resolve(p,0.45);
      g.position.x=p.x; g.position.z=p.z; moving=true; turnTo(g,Math.atan2(tx,tz),dt);
    } else turnTo(g,Math.atan2(dx,dz),dt);
    S.timer+=dt;
    if (S.timer>1){
      var prog=Math.hypot(g.position.x-S.lastX,g.position.z-S.lastZ);
      S.stuck=(moving&&prog<0.9)?S.stuck+S.timer:0; S.lastX=g.position.x; S.lastZ=g.position.z; S.timer=0;
    }
    if (S.unseen>2.5 && (dist>36 || S.stuck>1.5 || (!moving&&dist>14&&!shelter))) teleport(false);
  }
  if (g.position.x>72.2) g.position.x=72.2;
  S.moving=moving; g.position.y=groundY(g.position.x,g.position.z);
  if (S.mixer){ setAnim(moving?'Walk':'Idle'); if (S.actions.Walk) S.actions.Walk.timeScale=Math.min(1.7,sp/2.1); }
  else {
    S.phase+=dt*(moving?6.5:0); var sw=moving?Math.sin(S.phase)*0.55:0;
    S.legL.rotation.x=sw; S.legR.rotation.x=-sw; S.armL.rotation.x=-sw*0.6; S.armR.rotation.x=moving?-0.5+sw*0.4:-0.1;
  }
  if (seen && dist<30 && game.stingCd<=0){ sting(0.12,false); game.stingCd=16; }
  return dist;
}
function animateStalker(dt){
  var S=stalker; if (!S.mixer) return;
  S.mixer.update(dt);
  if (S.head && (S.state==='watch' || game.mode==='menu' || S.raise)) S.head.rotateZ(0.26);   // the slow head tilt
  if (S.raise && S.arm){ S.arm.rotateX(RAISE[0]*S.raise); S.arm.rotateY(RAISE[1]*S.raise); S.arm.rotateZ(RAISE[2]*S.raise); }
  if (S.fingers) for (var i=0;i<S.fingers.length;i++){ var fb=S.fingers[i]; fb.rotateX(GRIP[0]); fb.rotateZ(GRIP[1]); }
  if (S.g.visible) bodyLang(S.L,S.g,dt,clock.elapsedTime,game.mode!=='finish' && S.mode!=='pound',0,[1.15,0.03]);
}
var GRIP=[1.0,0];

/* ---------- pooled real lights ---------- */
var pumpkinPos=[];
function nearestLights(t){
  var px=camera.position.x, pz=camera.position.z, a=null, b=null, da=1e9, db=1e9;
  for (var i=0;i<lamps.length;i++){ var l=lamps[i], d=(l.x-px)*(l.x-px)+(l.z-pz)*(l.z-pz);
    if (d<da){ b=a; db=da; a=l; da=d; } else if (d<db){ b=l; db=d; } }
  if (game.net && net && net.ih>=0 && !net.jailed && camera.position.x>IX-6){ var up=camera.position.y>2.6, pw=houses[net.ih].power?1.3:0;
    if (up){ lampLights[0].position.set(IX-3.0,FLOOR2+2.3,0.4); lampLights[1].position.set(IX+3.4,FLOOR2+2.3,-1.0); } else { lampLights[0].position.set(IX-2.7,2.3,-0.8); lampLights[1].position.set(IX+2.9,2.3,-1.2); }
    lampLights[0].intensity=lampLights[1].intensity=pw; }
  else if (indoorsView()){ lampLights[0].position.set(IX-2.7,2.3,-0.8); lampLights[1].position.set(IX+2.9,2.3,-1.2); lampLights[0].intensity=lampLights[1].intensity=shelter.h.power?1.25:0; }
  else if (fleetNearLamp(px,pz)){ var FC=fleetNearLamp(px,pz), fl=carLocal(FC,3.6,0); lampLights[0].position.set(FC.x,1.5,FC.z); lampLights[0].intensity=0.5; lampLights[1].position.set(fl.x,0.9,fl.z); lampLights[1].intensity=1.4; }
  else if (bldIn(px,pz)){ var BB=bldIn(px,pz), py=camera.position.y, la=null, lb=null, d1=1e9, d2=1e9; BB.lights.forEach(function(l){ var dd=(l.x-px)*(l.x-px)+(l.z-pz)*(l.z-pz)+(l.y-py)*(l.y-py)*9; if (dd<d1){ lb=la; d2=d1; la=l; d1=dd; } else if (dd<d2){ lb=l; d2=dd; } });
    if (la){ lampLights[0].position.set(la.x,la.y,la.z); lampLights[0].intensity=1.5*(BB.flick && Math.sin(t*23+la.x)>0.93?0.25:1); } if (lb){ lampLights[1].position.set(lb.x,lb.y,lb.z); lampLights[1].intensity=1.3; } }
  else { lampLights[0].position.set(a.x,5,a.z); lampLights[1].position.set(b.x,5,b.z); lampLights[0].intensity=lampLights[1].intensity=2.2; }
  var best=null, bd=1e9;
  for (var j=0;j<pumpkinPos.length;j++){ var p=pumpkinPos[j], d2=(p.x-px)*(p.x-px)+(p.z-pz)*(p.z-pz); if (d2<bd){ bd=d2; best=p; } }
  if (best){ pumpkinLight.position.set(best.x,0.5,best.z); pumpkinLight.intensity=1.1+Math.sin(t*11)*0.15+Math.sin(t*27)*0.1; }
}

/* ---------- save, settings, story parts ---------- */
var SAVE={kill:0,kowned2:[0],kskin:0,kowned:[0],tokens:0,owned:[],equipped:-1,fps:60,q:LOWEND?1:3,prog:{victim:0,killer:0}};
try { var sv=localStorage.getItem('hollow-lane-save'); if (sv){ sv=JSON.parse(sv); for (var sk in sv) SAVE[sk]=sv[sk]; } } catch(e){}
function save(){
  try { localStorage.setItem('hollow-lane-save',JSON.stringify(SAVE)); } catch(e){}
  var els=document.querySelectorAll('.tokN'); for (var i=0;i<els.length;i++) els[i].textContent=SAVE.tokens;
}
var PARTS={
  victim:[
    {name:'First Night',desc:'Find 3 fuses and reach the gate.',fuses:3,base:2.3,inc:0.3,reward:40},
    {name:'Hollow Lane',desc:'Find 5 fuses. He walks faster.',fuses:5,base:2.6,inc:0.35,reward:60},
    {name:'No Way Out',desc:'Find 7 fuses. He does not slow down.',fuses:7,base:2.9,inc:0.24,reward:100}],
  killer:[
    {name:'The Watcher',desc:'Catch the survivor before they find 5 fuses and escape.',fuses:5,run:4.9,walk:2.9,reward:40},
    {name:'Night Shift',desc:'This one runs faster.',fuses:5,run:5.5,walk:3.2,reward:60},
    {name:'Last One Standing',desc:'They only need 4 fuses, and they are quick.',fuses:4,run:5.8,walk:3.4,reward:100}]
};
var cfg=PARTS.victim[1], lastFrame=0, qLeaves=true, settingsBack='menu';
var SCREENS=['start','menu','news','story','parts','online','netFind','lobby','netEnd','settings','shop','pause','dead','win'];
var tjT=0; function show(id){ var was=null; SCREENS.forEach(function(s){ if (!$(s).hidden) was=s; $(s).hidden = s!==id; }); if (id && id!==was && !reduced){ wrap.classList.remove('tapejump'); void wrap.offsetWidth; wrap.classList.add('tapejump'); clearTimeout(tjT); tjT=setTimeout(function(){ wrap.classList.remove('tapejump'); },360); } }
function setLeaves(v){ leafPts.p.visible = v && qLeaves; }

/* ---------- weather, wind, reflections, body language ---------- */
var FX={rainOn:false,sw:0,idle:0,gT:0,gy:0,gp:0,gyS:0,gpS:0,breath:0,roll:0,fovK:0,work:0,lightT:30+Math.random()*30,light:0,stepN:0};
var envTex=null;
(function(){ try {
  var pm=new THREE.PMREMGenerator(renderer), es=new THREE.Scene();
  var st=canvasTex(16,128,function(g){ var gr=g.createLinearGradient(0,0,0,128); gr.addColorStop(0,'#0a1020'); gr.addColorStop(0.47,'#1a2438'); gr.addColorStop(0.52,'#0c0e12'); gr.addColorStop(1,'#030304'); g.fillStyle=gr; g.fillRect(0,0,16,128); });
  es.add(new THREE.Mesh(new THREE.SphereGeometry(50,24,16),new THREE.MeshBasicMaterial({map:st,side:THREE.BackSide})));
  var mo=new THREE.Mesh(new THREE.SphereGeometry(3.2,12,8),new THREE.MeshBasicMaterial({color:new THREE.Color(1.6,1.8,2.3)})); mo.position.copy(moonDir).multiplyScalar(40); es.add(mo);
  envTex=pm.fromScene(es,0.03).texture; pm.dispose();
} catch(e){ envTex=null; } })();
var ROOFS=[[-93.9,0,4.4,8.5]];
houses.forEach(function(h){ ROOFS.push([h.x,h.z,5.4,4.5]); });
var rain=(function(){
  var n=isTouch?500:1300, pos=new Float32Array(n*6), w=new Float32Array(n*3);
  for (var i=0;i<n;i++){ w[i*3]=rand(-14,14); w[i*3+1]=rand(0,13); w[i*3+2]=rand(-14,14); }
  var g=new THREE.BufferGeometry(); g.setAttribute('position',new THREE.BufferAttribute(pos,3));
  var l=new THREE.LineSegments(g,new THREE.LineBasicMaterial({color:lin(0xa9b8d0),transparent:true,opacity:.2,depthWrite:false}));
  l.frustumCulled=false; scene.add(l); return {l:l,pos:pos,w:w,n:n};
})();
function rainTick(dt){
  var on=FX.rainOn && !shelter && !(game.net && net && net.ih>=0 && !net.jailed); rain.l.visible=on; if (!on) return;
  var cx=camera.position.x, cz=camera.position.z, w=rain.w, p=rain.pos, R=ROOFS, nr=R.length;
  for (var i=0,ra=rain.act===undefined?rain.n:rain.act;i<ra;i++){ var o=i*3, q=i*6;
    w[o+1]-=dt*(17+(i%7)); w[o]+=dt*1.5;
    if (w[o+1]<0) w[o+1]+=13;
    if (w[o]-cx>14) w[o]-=28; else if (w[o]-cx<-14) w[o]+=28;
    if (w[o+2]-cz>14) w[o+2]-=28; else if (w[o+2]-cz<-14) w[o+2]+=28;
    var x=w[o], y=w[o+1], z=w[o+2], dry=false;
    if (y<3.7) for (var r=0;r<nr;r++){ var b=R[r]; if (Math.abs(x-b[0])<b[2] && Math.abs(z-b[1])<b[3]){ dry=true; break; } }
    if (dry){ p[q]=p[q+3]=x; p[q+1]=p[q+4]=-5; p[q+2]=p[q+5]=z; }
    else { p[q]=x; p[q+1]=y; p[q+2]=z; p[q+3]=x-0.04; p[q+4]=y+0.42; p[q+5]=z; }
  }
  rain.l.geometry.attributes.position.needsUpdate=true;
}
var windBuf=null, rainGain=null;
function thunder(v){
  if (!AC || !windBuf) return; var t=AC.currentTime, s=AC.createBufferSource(); s.buffer=windBuf; s.loop=true;
  var f=AC.createBiquadFilter(); f.type='lowpass'; f.frequency.setValueAtTime(420,t); f.frequency.exponentialRampToValueAtTime(70,t+3);
  var g=AC.createGain(); g.gain.setValueAtTime(0.0001,t); g.gain.exponentialRampToValueAtTime(v,t+0.07); g.gain.exponentialRampToValueAtTime(v*0.35,t+0.7); g.gain.exponentialRampToValueAtTime(0.0001,t+3.4);
  s.connect(f); f.connect(g); g.connect(master); s.start(t); s.stop(t+3.5);
}
function weatherTick(dt,t){
  windU.value=t;
  for (var i=0;i<leafSway.length;i++){ var lf=leafSway[i], b=lf.userData.b, ph=lf.userData.ph;
    lf.position.x=b.x+Math.sin(t*0.9+ph)*0.09+Math.sin(t*2.3+ph*1.7)*0.03; lf.position.z=b.z+Math.cos(t*0.7+ph)*0.06; lf.rotation.z=Math.sin(t*1.1+ph)*0.03; }
  if (game.mode==='play' && !game.paused && FX.rainOn){ FX.lightT-=dt;
    if (FX.lightT<=0){ FX.lightT=38+Math.random()*55; FX.light=1; var far=Math.random(); setTimeout(function(){ thunder(0.5-far*0.3); },500+far*1800); } }
  var L=FX.light, fl=0;
  if (L>0){ FX.light=Math.max(0,L-dt*2.4); fl=(L>0.5&&L<0.68)?0.12:L; if (reduced) fl=L*0.35; }
  hemi.intensity=FX.hemi+fl*(shelter?0.5:2.1);
  if (rainGain) rainGain.gain.value=!FX.rainOn?0:(shelter?0.007:0.02);
  rainTick(dt);
}
function stepSound(run,indoor){
  FX.stepN++; var alt=FX.stepN%2, v=run?1.5:1;
  if (indoor){ tone(95+alt*12,0.07,'sine',0.11,60); noise(0.05,0.04,700); return; }
  var x=P.x, z=P.z;
  if (P.gy>0.05){ tone(105+alt*14,0.08,'sine',0.16*v,58); noise(0.05,0.05*v,900); }                                 // porch boards
  else if ((x>-73 && Math.abs(z)<4.1) || (x<=-73 && x>-100)){ noise(0.06,0.11*v,1500+alt*250); noise(0.03,0.05*v,3800); }   // wet asphalt
  else { noise(0.11,0.085*v,380+alt*60); if (FX.stepN%3===0) noise(0.05,0.03,2600); }                                // grass
}
var _lv=new THREE.Vector3(), _lq=new THREE.Quaternion(), _lq2=new THREE.Quaternion(), _lp=new THREE.Quaternion(), _ax=new THREE.Vector3(), UPV=new THREE.Vector3(0,1,0);
function worldTwist(bone,q){ bone.parent.getWorldQuaternion(_lp); _lq2.copy(_lp).invert().multiply(q).multiply(_lp); bone.quaternion.premultiply(_lq2); }
function findBones(m,pre){ function b(n){ return m.getObjectByName(pre+n); } return {head:b('Head'),neck:b('Neck'),spine:b('Spine2')||b('Spine1'),yaw:0,pitch:0}; }
// Head and neck follow whoever they are looking at; the chest breathes. Runs after the clip so it layers on top of it.
function bodyLang(L,root,dt,t,on,nod,breath){
  if (!L || !L.head) return;
  var ty=0, tp=0;
  if (on){ L.head.getWorldPosition(_lv); var dx=camera.position.x-_lv.x, dz=camera.position.z-_lv.z, d=Math.hypot(dx,dz);
    var a=Math.atan2(dx,dz)-root.rotation.y; a=Math.atan2(Math.sin(a),Math.cos(a));
    if (Math.abs(a)<1.9 && d<24 && d>0.3){ ty=Math.max(-1.05,Math.min(1.05,a)); tp=Math.max(-0.45,Math.min(0.45,Math.atan2(camera.position.y-_lv.y,d))); } }
  var k=Math.min(1,dt*4.5); L.yaw+=(ty-L.yaw)*k; L.pitch+=(tp-L.pitch)*k;
  var fy=root.rotation.y;
  if (L.spine && breath){ _ax.set(-Math.cos(fy),0,Math.sin(fy)); _lq.setFromAxisAngle(_ax,Math.sin(t*breath[0])*breath[1]); worldTwist(L.spine,_lq); }
  var p=L.pitch+nod; if (Math.abs(L.yaw)<0.003 && Math.abs(p)<0.003) return;
  var parts=L.neck?[[L.neck,0.4],[L.head,0.6]]:[[L.head,1]];
  for (var i=0;i<parts.length;i++){ var w=parts[i][1], y=fy+L.yaw*(i?1:w);
    _ax.set(-Math.cos(y),0,Math.sin(y)); _lq.setFromAxisAngle(_ax,p*w); _lq2.setFromAxisAngle(UPV,L.yaw*w); _lq.multiply(_lq2);
    worldTwist(parts[i][0],_lq); }
}
function residentLang(dt,t){
  var sp=resident.who, rig=sp && (sp.rig==='m'?resident.man:resident.woman); if (!rig || !rig.m.visible) return;
  if (!rig.L) rig.L=findBones(rig.m,sp.rig==='m'?'':'mixamorig');
  resident.talk=Math.max(0,(resident.talk||0)-dt);
  var tk=Math.min(1,resident.talk*3), nod=tk*(Math.sin(t*8.5)*0.05+Math.sin(t*5.1)*0.035);
  bodyLang(rig.L,resident.g,dt,t,game.mode!=='finish',nod,[1.7,0.014]);
}

var QUAL=[{pr:0.5,moon:false,torch:0,grass:.1,mist:false,leaves:false,rain:0,ms:512},{pr:0.7,moon:false,torch:0,grass:.3,mist:false,leaves:false,rain:.3,ms:1024},
          {pr:1,moon:true,torch:512,grass:.6,mist:true,leaves:true,rain:.6,ms:2048},{pr:1.5,moon:true,torch:1024,grass:1,mist:true,leaves:true,rain:1,ms:4096},{pr:2,moon:true,torch:2048,grass:1,mist:true,leaves:true,rain:1,ms:4096}];
function applyQuality(){
  var q=QUAL[SAVE.q]||QUAL[2];
  pixelRatio = q.pr<=1 ? q.pr : Math.min(q.pr, window.devicePixelRatio||1); if (typeof DYN!=='undefined' && DYN){ DYN.base=pixelRatio; DYN.pr=pixelRatio; } renderer.setPixelRatio(pixelRatio);
  var ms=Math.min(q.ms,msz*2); if (moonLight.shadow.mapSize.x!==ms){ moonLight.shadow.mapSize.set(ms,ms); if (moonLight.shadow.map){ moonLight.shadow.map.dispose(); moonLight.shadow.map=null; } }
  rain.act=Math.floor(rain.n*q.rain); for (var ri=rain.act;ri<rain.n;ri++){ var rq=ri*6; rain.pos[rq+1]=rain.pos[rq+4]=-50; } rain.l.geometry.attributes.position.needsUpdate=true;
  moonLight.castShadow=q.moon; torch.castShadow=q.torch>0;
  if (q.torch && torch.shadow.mapSize.x!==q.torch){ torch.shadow.mapSize.set(q.torch,q.torch); if (torch.shadow.map){ torch.shadow.map.dispose(); torch.shadow.map=null; } }
  if (grassInst) grassInst.count=Math.floor(grassMax*q.grass);
  mist.forEach(function(s){ s.visible=q.mist; });
  qLeaves=q.leaves; setLeaves(!indoorsView());
  scene.environment=(SAVE.q>=2 && envTex)?envTex:null; FX.hemi=scene.environment?0.36:0.42; FX.rainOn=false;
  moonLight.shadow.needsUpdate=true; resize();
}
function syncSeg(){
  SAVE.voices=true;
  [['fpsSeg',SAVE.fps],['qSeg',SAVE.q]].forEach(function(p){ var bs=$(p[0]).children; for (var i=0;i<bs.length;i++) bs[i].setAttribute('aria-pressed', String(+bs[i].dataset.v===p[1])); });
}
function openSettings(from){ settingsBack=from; syncSeg(); show('settings'); }
$('fpsSeg').addEventListener('click',function(e){ var v=e.target.dataset && e.target.dataset.v; if (v===undefined) return; SAVE.fps=+v; save(); syncSeg(); });
$('qSeg').addEventListener('click',function(e){ var v=e.target.dataset && e.target.dataset.v; if (v===undefined) return; SAVE.q=+v; save(); syncSeg(); applyQuality(); });
$('setDone').addEventListener('click',function(){ show(settingsBack); });

/* ---------- shop: the neighbours as skins, restocked every two hours ---------- */
function rng(seed){ return function(){ seed=seed+0x6D2B79F5|0; var t=Math.imul(seed^seed>>>15,1|seed); t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; }; }
var SHOP_MS=2*60*60*1000, shopSlot=-1;
function shopStock(){
  var slot=Math.floor(Date.now()/SHOP_MS), r=rng(slot*7919+13), idx=NEIGHBOURS.map(function(_,i){ return i; });
  for (var i=idx.length-1;i>0;i--){ var j=Math.floor(r()*(i+1)), t=idx[i]; idx[i]=idx[j]; idx[j]=t; }
  shopSlot=slot; return idx.slice(0,10);
}
function price(i){ return 60+((i*37)%4)*30; }
function css(c){ return '#'+('00000'+c.toString(16)).slice(-6); }
var STARTER=NEIGHBOURS.map(function(s){ return s.n; }).indexOf('Jax');
function applySkin(){
  if (!(SAVE.equipped>=0 && SAVE.equipped<NEIGHBOURS.length)) SAVE.equipped=STARTER; if (SAVE.owned.indexOf(STARTER)<0) SAVE.owned.push(STARTER);
  var sp=NEIGHBOURS[SAVE.equipped];
  vmGlove.color.copy(lin(sp?sp.hand:0x2a2623)); vmSleeve.color.copy(lin(sp?sp.sleeve:0x2b3442));
}
function shopTimer(){
  var left=SHOP_MS-(Date.now()%SHOP_MS), m=Math.floor(left/60000), s=Math.floor(left/1000)%60;
  $('shopTimer').textContent='Your characters, plus 10 for sale · new stock in '+Math.floor(m/60)+'h '+('0'+(m%60)).slice(-2)+'m '+('0'+s).slice(-2)+'s';
}
var shopView=-2;
function shopPreview(i){
  shopView=i; $('shopName').textContent = NEIGHBOURS[Math.max(0,i)].n;
  var M=lamps[2];
  if (i<0){ resident.g.visible=false; return; }
  showResident(i); resident.g.position.set(M.x,0,M.z+0.4); resident.g.rotation.set(0,0.4,0);
  doorLight.position.set(M.x+0.9,1.8,M.z+2.4); doorLight.intensity=4.2;
}
var shopTab='surv', kPrev=null, kPrevI=-1;
function tokLog(d,why){ if (!Array.isArray(SAVE.tx)) SAVE.tx=[]; SAVE.tx.unshift({t:Date.now(),d:d,w:String(why).slice(0,60),b:SAVE.tokens}); if (SAVE.tx.length>60) SAVE.tx.length=60; }
function shopTabs(){ var t=$('shopTabs'); t.textContent=''; t.hidden=false; [['surv','Characters'],['tok','Tokens']].forEach(function(d){ var b=document.createElement('button'); b.type='button'; b.textContent=d[1]; b.setAttribute('aria-pressed',String(shopTab===d[0]));
  b.addEventListener('click',function(){ if (shopTab!==d[0]){ shopTab=d[0]; renderShop(); } }); t.appendChild(b); }); }
function renderTokShop(){ var grid=$('shopGrid'); grid.innerHTML=''; resident.g.visible=false; $('shopName').textContent='Tokens'; $('shopTimer').textContent='You have '+SAVE.tokens+' tokens · earn 20 for a win, 10 for playing';
  var box0=document.createElement('div'); box0.className='tokBox'; var bal=document.createElement('p'); bal.className='tokBal'; bal.textContent=SAVE.tokens+' tokens'; box0.appendChild(bal);
  var soon=document.createElement('p'); soon.className='lab'; soon.textContent='Token packs you can buy are coming soon.'; box0.appendChild(soon);
  var hd=document.createElement('p'); hd.className='lab'; hd.textContent='History'; box0.appendChild(hd);
  var ul=document.createElement('ul'); ul.className='tokList'; var tx=Array.isArray(SAVE.tx)?SAVE.tx:[];
  if (!tx.length){ var li0=document.createElement('li'); li0.textContent='Nothing yet. Play a match to earn your first tokens.'; ul.appendChild(li0); }
  tx.forEach(function(e){ var li=document.createElement('li'), d=new Date(e.t), a=document.createElement('b'), w=document.createElement('span'), when=document.createElement('i');
    a.textContent=(e.d>0?'+':'')+e.d; a.className=e.d>0?'up':'down'; w.textContent=e.w; when.textContent=(d.getMonth()+1)+'/'+d.getDate()+' '+('0'+d.getHours()).slice(-2)+':'+('0'+d.getMinutes()).slice(-2)+(typeof e.b==='number'?' · '+e.b+' left':'');
    li.appendChild(a); li.appendChild(w); li.appendChild(when); ul.appendChild(li); });
  box0.appendChild(ul); grid.appendChild(box0); }
function killerPreview(i){
  var M=lamps[2]; resident.g.visible=false; $('shopName').textContent=KSKINS[i].n;
  if (kPrev && kPrevI!==i){ scene.remove(kPrev.g); kPrev=null; }
  if (!kPrev && NETTPL.k){ var rig=makeNetRig('k',null,i); if (rig){ kPrev={g:new THREE.Group(),rig:rig}; kPrev.g.add(rig.m); scene.add(kPrev.g); kPrevI=i; } }
  if (kPrev){ kPrev.g.visible=true; kPrev.g.position.set(M.x,0,M.z+0.4); kPrev.g.rotation.set(0,0.4,0); }
  doorLight.position.set(M.x+0.9,1.8,M.z+2.4); doorLight.intensity=4.2;
}
function hideKillerPreview(){ if (kPrev) kPrev.g.visible=false; stopFinPreview(); }
var finPV=null;
function stopFinPreview(){ if (!finPV) return; finPV.fin.K.g.visible=false; resident.g.visible=false; resident.dead=false; doorLight.intensity=0; finPV=null; }
function startFinPreview(type){
  stopFinPreview(); var K=finRig(SAVE.kskin); if (!K) return; var M=lamps[2], x=M.x+0.6, z=M.z+0.6, ux=-1, uz=0, gy=0;
  finPV={fin:{t:0,type:type,q:{id:'pv'},x:x,z:z,ux:ux,uz:uz,gy:gy,K:K,hit:0,pool:false,side:1,yaw:Math.atan2(-ux,-uz)}};
  if (kPrev) kPrev.g.visible=false;
  showResident(3); resident.dead=false; resident.g.position.set(x,gy,z); resident.g.rotation.set(0,finPV.fin.yaw,0); residentAnim('Idle');
  var vr=resident.woman; finPV.fin.vm=vr?vr.mats.map(function(e){ return {m:e.mat,c:e.mat.color.clone()}; }):[]; if (K.blade){ K.bladeC=K.bladeC||K.blade.material.color.clone(); }
  K.g.visible=true; K.g.rotation.set(0,Math.atan2(ux,uz),0); doorLight.intensity=2.4; doorLight.position.set(x,2.4,z);
}
var killView=-1;
function renderKillsShop(){
  var grid=$('shopGrid'); grid.innerHTML=''; if (killView<0) killView=SAVE.kill|0; if (kPrev) kPrev.g.visible=false; resident.g.visible=false;
  $('shopName').textContent=KILLS[killView].n; $('shopTimer').textContent='Kill animations play when you finish a survivor in Kill Feast';
  if (!finPV || finPV.fin.type!==killView) startFinPreview(killView);
  KILLS.forEach(function(Kd,i){ var owned=SAVE.kowned2.indexOf(i)>=0||!Kd.p, on=(SAVE.kill|0)===i;
    var el=document.createElement('div'); el.className='skin'+(on?' on':'')+(killView===i?' view':'');
    el.addEventListener('click',function(){ if (killView!==i){ killView=i; renderShop(); } });
    var ic=document.createElement('div'); ic.className='kicon'; ic.textContent=['I','II','III','IV','V'][i];
    var nm=document.createElement('span'); nm.textContent=Kd.n; var bt=document.createElement('button'); bt.type='button';
    if (on){ bt.textContent='Equipped'; bt.disabled=true; }
    else if (owned){ bt.textContent='Equip'; bt.addEventListener('click',function(e){ e.stopPropagation(); SAVE.kill=i; save(); renderShop(); }); }
    else { bt.textContent='Buy · '+Kd.p; bt.disabled=SAVE.tokens<Kd.p; bt.addEventListener('click',function(e){ e.stopPropagation(); if (SAVE.tokens<Kd.p) return; SAVE.tokens-=Kd.p; SAVE.kowned2.push(i); SAVE.kill=i; killView=i; save(); renderShop(); }); }
    el.appendChild(ic); el.appendChild(nm); el.appendChild(bt); grid.appendChild(el); });
}
var kView=-1;
function renderKillShop(){
  var grid=$('shopGrid'); grid.innerHTML=''; if (kView<0) kView=SAVE.kskin|0; killerPreview(kView);
  $('shopTimer').textContent='Killer skins show online when you play as a killer';
  KSKINS.forEach(function(K,i){ var owned=SAVE.kowned.indexOf(i)>=0||!K.p, on=(SAVE.kskin|0)===i;
    var el=document.createElement('div'); el.className='skin'+(on?' on':'')+(kView===i?' view':'');
    el.addEventListener('click',function(){ if (kView!==i){ kView=i; renderShop(); } });
    var sw=document.createElement('div'); sw.className='sw'; var a=document.createElement('i'); a.style.background=css(K.top); var b=document.createElement('b');
    b.style.background={pale:'#e8e4dc',red:'#8a1612',sack:'#8a6a3e',skull:'#e6e0cc',doll:'#fbf6ee',shadow:'#0a0a0c'}[K.mask]; if (K.mask==='shadow') b.style.boxShadow='inset 0 0 0 4px #0a0a0c, inset 0 0 0 6px #ff2a1a';
    sw.appendChild(a); sw.appendChild(b);
    var nm=document.createElement('span'); nm.textContent=K.n; var bt=document.createElement('button'); bt.type='button';
    if (on){ bt.textContent='Equipped'; bt.disabled=true; }
    else if (owned){ bt.textContent='Equip'; bt.addEventListener('click',function(e){ e.stopPropagation(); SAVE.kskin=i; save(); renderShop(); }); }
    else { bt.textContent='Buy · '+K.p; bt.disabled=SAVE.tokens<K.p; bt.addEventListener('click',function(e){ e.stopPropagation(); if (SAVE.tokens<K.p) return; SAVE.tokens-=K.p; SAVE.kowned.push(i); SAVE.kskin=i; kView=i; save(); renderShop(); }); }
    el.appendChild(sw); el.appendChild(nm); el.appendChild(bt); grid.appendChild(el); });
}
function renderShop(){
  shopTabs(); stopFinPreview(); hideKillerPreview(); if (shopTab==='tok') return renderTokShop();
  var grid=$('shopGrid'); grid.innerHTML=''; var stock=shopStock();
  var list=SAVE.owned.slice(); stock.forEach(function(i){ if (list.indexOf(i)<0) list.push(i); });
  if (shopView<0 || list.indexOf(shopView)<0) shopView = SAVE.equipped>=0 ? SAVE.equipped : STARTER;
  shopPreview(shopView);
  list.forEach(function(i){
    var sp=NEIGHBOURS[i], owned=SAVE.owned.indexOf(i)>=0, on=SAVE.equipped===i;
    var el=document.createElement('div'); el.className='skin'+(on?' on':'')+(shopView===i?' view':'');
    el.addEventListener('click',function(){ if (shopView!==i){ shopPreview(i); renderShop(); } });
    var sw=document.createElement('div'); sw.className='sw'; var a=document.createElement('i'); a.style.background=css(sp.sleeve); var b=document.createElement('b'); b.style.background=css(sp.hand); sw.appendChild(a); sw.appendChild(b);
    var nm=document.createElement('span'); nm.textContent=sp.n;
    var bt=document.createElement('button'); bt.type='button';
    if (on){ bt.textContent='Equipped'; bt.disabled=true; }
    else if (owned){ bt.textContent='Equip'; bt.addEventListener('click',function(){ SAVE.equipped=i; save(); applySkin(); renderShop(); }); }
    else { bt.textContent='Buy · '+price(i); bt.disabled=SAVE.tokens<price(i);
      bt.addEventListener('click',function(){ if (SAVE.tokens<price(i)) return; SAVE.tokens-=price(i); tokLog(-price(i),'Bought '+NEIGHBOURS[i].n); SAVE.owned.push(i); SAVE.equipped=i; save(); applySkin(); renderShop(); }); }
    el.appendChild(sw); el.appendChild(nm); el.appendChild(bt); grid.appendChild(el);
  });
  shopTimer();
}
setInterval(function(){ if ($('shop').hidden || shopTab!=='surv') return; if (Math.floor(Date.now()/SHOP_MS)!==shopSlot) renderShop(); else shopTimer(); },1000);

/* ---------- menus ---------- */

function backdrop(){
  var S=stalker; S.mode=null; S.inn=null; S.state='away'; S.timer=1e9; S.raise=0;
  S.g.position.set(lamps[1].sx,0,lamps[1].sz); S.g.rotation.y=-Math.PI/2-0.5; S.g.visible=true; setAnim('Idle');
  vm.visible=false; vmKnife.visible=false; torch.visible=false; resident.g.visible=false; doorLight.intensity=0;
  $('fear').style.opacity=0; $('flash').style.opacity=0;
}
function leaveToMenu(){
  netLeave();
  game.paused=false; if (master) master.gain.value=muted?0:0.9; if (droneGain) droneGain.gain.value=0.05;
  game.role='victim'; reset(); game.mode='menu'; setHud(false); backdrop(); save(); show('menu');
}
function pause(){
  if (game.mode!=='play' || game.paused) return;
  game.paused=true; keys={}; touchMove.x=touchMove.y=0; moveId=lookId=null; $('stick').hidden=true;
  if (master) master.gain.value=0; show('pause'); try { window.speechSynthesis.cancel(); } catch(e){}
  if (document.exitPointerLock) try { document.exitPointerLock(); } catch(e){}
}
function resume(){ game.paused=false; if (master) master.gain.value=0.9; show(null); if (!isTouch) lock(); }
$('play').addEventListener('click',function(){ initAudio(); save(); if ((SAVE.seenVer||0)<GAME_VER) openNews(); else show('menu'); $('mNews').classList.remove('dot'); });
$('mOnline').addEventListener('click',function(){ show('online'); });
$('mSettings').addEventListener('click',function(){ openSettings('menu'); });
$('mShop').addEventListener('click',function(){ game.mode='shop'; stalker.g.visible=false; renderShop(); show('shop'); });
$('shop').querySelector('.back').addEventListener('click',function(){ game.mode='menu'; hideKillerPreview(); backdrop(); });
$('sVictim').addEventListener('click',function(){ openStory('victim'); });
$('sKiller').addEventListener('click',function(){ openStory('killer'); });
Array.prototype.forEach.call(document.querySelectorAll('.back'),function(b){ b.addEventListener('click',function(){ show(b.dataset.to); }); });
Array.prototype.forEach.call(document.querySelectorAll('.toMenu'),function(b){ b.addEventListener('click',leaveToMenu); });
$('pauseBtn').addEventListener('click',pause);
$('pResume').addEventListener('click',resume);
$('pSettings').addEventListener('click',function(){ openSettings('pause'); });
$('pLeave').addEventListener('click',leaveToMenu);
$('retry').addEventListener('click',function(){ startStory(game.role,story.ch); });
$('again').addEventListener('click',function(){ startStory(game.role,0); });
var wasLocked=false;
document.addEventListener('pointerlockchange',function(){
  var on=document.pointerLockElement===renderer.domElement;
  if (!on && wasLocked) pause();
  wasLocked=on;
});

/* ---------- the station's automatic doors ---------- */
function stationDoor(dt){
  var near=!shelter && Math.hypot(P.x+90,P.z)<3.4, S=stalker;
  if (!near && S.g.visible && !S.mode && Math.hypot(S.g.position.x+90,S.g.position.z)<3.2) near=true;
  if (!near && game.role==='killer' && Math.hypot(surv.x+90,surv.z)<3.2) near=true;
  var want=near?1:0;
  if (want!==STN.want){ STN.want=want; if (Math.hypot(P.x+90,P.z)<26){ noise(0.35,0.1,1400); if (want){ tone(880,0.18,'sine',0.07); tone(660,0.3,'sine',0.07,null,0.16); } } }
  if (STN.open===want) return;
  STN.open=Math.max(0,Math.min(1,STN.open+(want?1:-1)*dt*2.6));
  STN.doors.forEach(function(d){ d.g.position.z=d.sd*(0.5+STN.open*0.96); });
  var k=colliders.indexOf(STN.col);
  if (STN.open>0.55){ if (k>=0) colliders.splice(k,1); } else if (k<0) colliders.push(STN.col);
}

/* ---------- the clerk at the gas station ---------- */
function clerkUpdate(dt){
  if (game.knock){ game.clerkOn=false; return; }
  if (game.clerkGone){ if (game.clerkOn){ resident.g.visible=false; game.clerkOn=false; } return; }
  var R=resident, near=Math.hypot(P.x-STN.x,P.z-STN.z)<36;
  if (near){
    if (!game.clerkOn || !R.g.visible){ showResident(game.clerk); R.g.position.set(STN.cx,0.06,STN.cz); R.g.rotation.set(0,Math.PI/2,0); game.clerkOn=true; }
    else if (Math.hypot(P.x-STN.cx,P.z-STN.cz)<9) turnTo(R.g,Math.atan2(P.x-STN.cx,P.z-STN.cz),dt);
  } else if (game.clerkOn){ R.g.visible=false; game.clerkOn=false; }
}

/* ---------- generators ---------- */
function setPower(h,on){
  h.power=on; h.gen.broken=!on; h.gen.lamp.material.color.set(on?0x38ff6a:0xff2a2a); h.gen.g.rotation.z=on?0:0.2;
  h.litFx.forEach(function(o){ o.visible=on; }); h.litWin.forEach(function(o){ o.material=on?winLitM:winDarkM; });
  if (h.breached) h.hall.material.color.copy(lin(on?0xffc070:0x05070c));
}
function iPowerSet(on){ iLights.visible=on; }
function nearBrokenGen(){
  for (var i=0;i<houses.length;i++){ var h=houses[i]; if (h.gen.broken && Math.hypot(P.x-h.gen.x,P.z-h.gen.z)<2.4) return h; }
  return null;
}
function startFix(){ game.fix={h:game.nearGen,t:0,tick:0}; stalker.tx=P.x; stalker.tz=P.z; $('safe').hidden=false; }
function updateFix(dt){
  var fx=game.fix, h=fx.h;
  if (Math.hypot(P.x-h.gen.x,P.z-h.gen.z)>2.9){ game.fix=null; $('safe').hidden=true; toast('You stopped fixing the generator.',2200); return; }
  fx.t+=dt; fx.tick+=dt; if (fx.tick>0.8){ fx.tick=0; tone(300+Math.random()*80,0.05,'square',0.07); noise(0.05,0.12,1500); }
  $('safe').textContent='Fixing generator · 0:'+('0'+Math.max(0,Math.ceil(15-fx.t))).slice(-2);
  if (fx.t>=15){ game.fix=null; $('safe').hidden=true; setPower(h,true); moonLight.shadow.needsUpdate=true; story.gens++; setObjective(); youSay(['That\u2019s one.','Two. Keep going.','Three. Come on.','Another one running.'][Math.min(3,story.gens-1)]); if (Math.random()<0.3) setTimeout(function(){ if (game.mode==='play' && !game.paused) scareAhead(); },900); tone(60,0.8,'sawtooth',0.1,95); toast('The generator is running. The lights are back on.',3200); }
}

/* ---------- killer mode: you hunt, they run ---------- */
var vmKnife=new THREE.Group(); camera.add(vmKnife); vmKnife.visible=false;
(function(){ var k=makeKnife(); k.scale.setScalar(0.85); k.rotation.set(-0.95,0,-0.3); k.position.set(0.26,-0.25,-0.5); vmKnife.add(k);
  var fist=new THREE.Mesh(new THREE.SphereGeometry(0.05,12,8),vmGlove); fist.scale.set(1,1.2,1.1); fist.position.set(0.26,-0.26,-0.49); vmKnife.add(fist);
  limb(vmKnife,[0.265,-0.28,-0.46],[0.37,-0.5,-0.12],0.038,0.05,vmSleeve); })();
var surv={x:0,z:0,st:1,tired:0,lx:0,lz:0,acc:0,jink:0,jinkT:0};
function residentAnim(name){ var sp=resident.who, rig=sp && (sp.rig==='m'?resident.man:resident.woman); if (rig) anim(rig,name); }
function openGate(){
  game.gateOpening=true; gateLamp.material.color.set(0x38ff6a); gateHalo.material.color.copy(lin(0x38ff6a));
  tone(220,0.5,'square',0.08,440); noise(0.3,0.3,900);
}

/* ---------- story: chapters, cutscenes, checkpoints ---------- */
if (!SAVE.story) SAVE.story={victim:0,killer:0};
if (!SAVE.paid) SAVE.paid={victim:-1,killer:-1};
var story={ch:0,inv:{},gens:0,hold:null,target:null,stage:0,objT:0,objText:'',tearH:null};
var cut=null, cineFrom=new THREE.Vector3(), cineTo=new THREE.Vector3(), cineLook=new THREE.Vector3();

var ARROWS=['↑','↗','→','↘','↓','↙','←','↖'];
var GAS={x:-79.3,z:3.3}, CARSIDE={x:-64,z:4.6}, CHAPEL={x:-146,z:22.4}, LEVER={x:70.4,z:4.0}, GRAVE={x:-142.4,z:19.6};
function nearP(p,r){ return Math.hypot(P.x-p.x,P.z-p.z)<r; }
function batPos(){ tmpV.set(7.2,0,4.7); houses[8].g.localToWorld(tmpV); return {x:tmpV.x,z:tmpV.z}; }
function hank(){ return NEIGHBOURS[houses[8].n].n; }
function bell(){ tone(523,2.4,'sine',0.22); tone(1046,1.6,'sine',0.08); tone(784,2.0,'sine',0.06); }

// props
var beacon=new THREE.Group(); scene.add(beacon); beacon.visible=false;
(function(){ var b=new THREE.Mesh(new THREE.CylinderGeometry(0.12,0.12,16,8,1,true),new THREE.MeshBasicMaterial({color:lin(0xff9a3a),transparent:true,opacity:.1,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide})); b.position.y=8; beacon.add(b); halo(0xffa040,1.6,0,0.7,0,beacon,.8); })();
function prop(build){ var g=new THREE.Group(); build(g); g.visible=false; scene.add(g); return g; }
var gasCan=prop(function(g){ box(0.34,0.42,0.2,mat(0xb3261c,{roughness:.5}),0,0.21,0,g); box(0.12,0.06,0.12,mat(0x1a1b1f),0.06,0.45,0,g); var s=cyl(0.02,0.02,0.22,6,mat(0x1a1b1f),-0.12,0.5,0,g); s.rotation.z=0.8; });
var battery=prop(function(g){ box(0.42,0.26,0.24,mat(0x17181c,{roughness:.5}),0,0.13,0,g); box(0.42,0.04,0.24,mat(0x8a2a1a),0,0.28,0,g); cyl(0.025,0.025,0.06,8,mat(0xb8bcc2,{metalness:.6,roughness:.3}),-0.13,0.33,0,g); cyl(0.025,0.025,0.06,8,mat(0xb8bcc2,{metalness:.6,roughness:.3}),0.13,0.33,0,g); });
var keysG=prop(function(g){ var m=mat(0xd0b060,{metalness:.8,roughness:.3,emissive:lin(0x2a2008)}); var r=new THREE.Mesh(new THREE.TorusGeometry(0.05,0.008,6,14),m); r.position.y=1.5; g.add(r); box(0.02,0.12,0.006,m,0.01,1.4,0,g); box(0.02,0.1,0.006,m,-0.02,1.41,0.004,g); halo(0xffd070,0.5,0,1.45,0.05,g,.7); });
(function(){ var m=mat(0x9a9c96,{roughness:.95}); box(0.8,1.15,0.18,m,GRAVE.x,0.57,GRAVE.z); box(1.0,0.12,0.4,m,GRAVE.x,0.06,GRAVE.z);
  var t=canvasTex(128,160,function(g){ g.fillStyle='#8f918c'; g.fillRect(0,0,128,160); g.fillStyle='#2a2a28'; g.textAlign='center'; g.font='bold 20px Georgia,serif'; g.fillText('ELIAS',64,46); g.fillText('CRANE',64,70); g.font='14px Georgia,serif'; g.fillText('1961 – 1978',64,98); g.font='italic 11px Georgia,serif'; g.fillText('the lane kept him',64,124); });
  var p=new THREE.Mesh(new THREE.PlaneGeometry(0.72,0.9),new THREE.MeshStandardMaterial({map:t,roughness:.95})); p.position.set(GRAVE.x,0.62,GRAVE.z-0.095); p.rotation.y=Math.PI; world.add(p); addBox(GRAVE.x,GRAVE.z,0.4,0.12); })();
function showItem(g,p){ g.position.set(p.x,g===keysG?0:0.03,p.z); g.visible=true; }
function moveCar(x,z){ carG.position.set(x,0,z); carCol.minX=x-2.2; carCol.maxX=x+2.2; carCol.minZ=z-0.95; carCol.maxZ=z+0.95; moonLight.shadow.needsUpdate=true; }
function allPower(on){ houses.forEach(function(h){ setPower(h,on); }); moonLight.shadow.needsUpdate=true; }
function nearestGen(broken){ var best=null, bd=1e9; houses.forEach(function(h){ if (h.gen.broken!==broken) return; var d=Math.hypot(h.gen.x-P.x,h.gen.z-P.z); if (d<bd){ bd=d; best=h; } }); return best; }

/* cutscenes */
function playCut(shots,done){
  cut={shots:shots,i:-1,t:0,done:done}; game.mode='cut'; setHud(false); setPrompt(null); $('safe').hidden=true; $('cine').hidden=false; $('grain').hidden=true;
  vm.visible=false; vmKnife.visible=false; vmL.visible=false; torch.visible=false; $('fear').style.opacity=0; keys={}; touchMove.x=touchMove.y=0; moveId=lookId=null; $('stick').hidden=true;
  if (droneGain) droneGain.gain.value=0.07;
  nextShot();
}
function nextShot(){
  if (!cut) return; cut.i++; if (cut.i>=cut.shots.length) return endCut();
  var s=cut.shots[cut.i]; cut.t=0; if (s.fn) s.fn();
  if (!s.dur) s.dur=Math.max(3.6,(s.text||'').length*0.07+1.2);
  $('cineText').textContent = s.text ? (s.who!==undefined ? NEIGHBOURS[s.who].n+': “'+s.text+'”' : s.text) : '';
  if (s.text) voice(s.who!==undefined?NEIGHBOURS[s.who]:NARR,s.text);
}
function endCut(){ if (!cut) return; var d=cut.done; cut=null; $('cine').hidden=true; $('grain').hidden=false; try { window.speechSynthesis.cancel(); } catch(e){} d(); }
function cutFrame(dt){
  var s=cut.shots[cut.i]; cut.t+=dt; var k=Math.min(1,cut.t/s.dur); k=k*k*(3-2*k);
  cineFrom.fromArray(s.cam); cineTo.fromArray(s.to||s.cam); camera.position.lerpVectors(cineFrom,cineTo,k); cineLook.fromArray(s.look); camera.lookAt(cineLook);
  if (cut.t>=s.dur) nextShot();
}

function resumePlay(){
  game.mode='play'; game.paused=false; setHud(true); vm.visible=game.role!=='killer'; vmKnife.visible=game.role==='killer'; setLight(P.light); setObjective();
  if (!isTouch && !document.pointerLockElement) lock();
}
function cutThen(shots,fn){ playCut(shots,function(){ fn(); resumePlay(); }); }

/* objective HUD */
function CH(){ return STORY[game.role]; }
function setObjective(){
  var C=CH()[story.ch]; story.objText=C.obj(); story.target=C.target?C.target():null;
  beacon.visible=!!story.target && !C.noBeacon; if (story.target) beacon.position.set(story.target.x,0,story.target.z);
  drawObjective();
}
function drawObjective(){
  var t=story.target, extra='';
  if (t && !shelter){ var dx=t.x-P.x, dz=t.z-P.z, d=Math.hypot(dx,dz), f=fwd(), a=Math.atan2(dx*Math.cos(P.yaw)-dz*Math.sin(P.yaw), dx*f.x+dz*f.z), i=((Math.round(a/(Math.PI/4))%8)+8)%8;
    extra='  '+ARROWS[i]+' '+Math.round(d)+' m'; }
  var el=$('objective'); el.textContent=''; var b=document.createElement('b'); b.textContent='Chapter '+(story.ch+1)+' · '+CH()[story.ch].name; el.appendChild(b); el.appendChild(document.createTextNode(story.objText+extra));
}
function storyTick(dt){
  var C=CH()[story.ch];
  story.objT-=dt; if (story.objT<=0){ story.objT=0.35; if (C.dyn) setObjective(); else drawObjective(); }
  var h=story.hold;
  if (h && !game.fix){
    if (nearP(h.pt,h.r)){ h.t+=dt; $('safe').hidden=false; $('safe').textContent=h.label+' · 0:'+('0'+Math.max(0,Math.ceil(h.dur-h.t))).slice(-2);
      h.tick=(h.tick||0)+dt; if (h.tick>0.9){ h.tick=0; tone(260+Math.random()*60,0.05,'square',0.06); }
      if (h.t>=h.dur){ story.hold=null; $('safe').hidden=true; h.done(); return; } }
    else if (!$('safe').hidden) $('safe').hidden=true;
  }
  if (game.role==='killer'){
    story.tearH=null;
    if (C.tear && (C.tearStage===undefined || C.tearStage===story.stage)){ var g=nearestGen(false); if (g && Math.hypot(g.gen.x-P.x,g.gen.z-P.z)<2.5) story.tearH=g; }
    setPrompt(story.tearH?'Tear out the generator':null,'Tear');
  }
  if (C.tick && game.mode==='play') C.tick(dt);
}
function tearGen(h){ setPower(h,false); moonLight.shadow.needsUpdate=true; story.gens++; tone(120,0.9,'sawtooth',0.12,30); noise(0.3,0.5,1200); toast('The house goes dark.',2200); setObjective(); }

/* chapter flow */
function applyState(role,ch){
  story.inv={}; story.gens=0; story.hold=null; game.clerkGone=false; setChain(role==='victim');
  if (role==='victim' && ch>=20){ setChain(false); return; }
  if (role==='victim'){
    if (ch>=2) story.inv.gas=true; if (ch>=5) story.inv.battery=true; if (ch>=10) story.inv.keys=true; if (ch>=13) story.inv.lever=true;
    if (ch>=5) allPower(false);
    if (ch>=8) setChain(false);
    if (ch>=11) game.clerkGone=true;
    if (ch>=14) [0,1,2].forEach(function(i){ setPower(houses[i],true); });
    if (ch>=16) moveCar(62,0);
    if (ch>=17) gateOpenNow();
  } else {
    if (ch>=1) [0,1,2].forEach(function(i){ setPower(houses[i],false); });
    [[5,5],[9,2],[13,8],[18,11]].forEach(function(p){ if (ch>=p[0]) markBreached(houses[p[1]]); });
  }
}
function beginChapter(ch,fromLoad){
  story.ch=ch; story.stage=0; story.hold=null; var C=CH()[ch];
  cfg = game.role==='killer' ? {run:C.run||5,walk:C.walk||3} : {base:Math.min(3.45,2.35+0.055*ch),inc:0}; game.got=0;
  var sp=typeof C.spawn==='function'?C.spawn():C.spawn;
  if (fromLoad && sp){ P.x=sp[0]; P.z=sp[1]; P.yaw=sp[2]; P.pitch=0; }
  gasCan.visible=battery.visible=keysG.visible=leverG.visible=truckG.visible=boxG.visible=false;
  if (C.begin) C.begin(fromLoad);
  var go=function(){ if (C.after) C.after(); resumePlay(); toast((fromLoad?'':'Saved · ')+'Chapter '+(ch+1)+': '+C.name,3200); };
  var shots=C.intro?C.intro():null; if (shots) playCut(shots,go); else go();
}
function completeChapter(){
  var role=game.role;
  if (SAVE.paid[role]<story.ch) SAVE.paid[role]=story.ch;
  tone(660,0.18,'triangle',0.15); tone(990,0.3,'triangle',0.13,null,0.12);
  if (story.ch+1>=CH().length){ save(); return ending(); }
  SAVE.story[role]=story.ch+1; save(); beginChapter(story.ch+1,false);
}
function startStory(role,ch){
  game.role=role; initAudio(); reset(); applyState(role,ch); show(null); if (master) master.gain.value=0.9;
  beginChapter(ch,true);
}
function ending(){
  var role=game.role, first=!SAVE['done_'+role];
  if (first) SAVE['done_'+role]=true;
  SAVE.story[role]=0; save();
  playCut(role==='killer'?[
    {cam:[-20,12,0],to:[-40,9,0],look:[20,1,0],text:'By morning Hollow Lane is quiet again.'},
    {cam:[-140,2,12],to:[-142,1.4,16],look:[GRAVE.x,0.6,GRAVE.z],text:'The neighbours will say it was the wind, the way they say it every year.'},
    {cam:[-128,3,8],look:[-146,9,25],text:'Until next October.',fn:bell}
  ]:[
    {cam:[GRAVE.x+3,2.2,GRAVE.z-5],to:[GRAVE.x+2,1.6,GRAVE.z-3.6],look:[GRAVE.x,0.6,GRAVE.z],text:'In the morning there is one more stone in the churchyard than there are names for.',fn:function(){ stalker.g.visible=false; }},
    {cam:[55,3,4],to:[62,2.4,3],look:[73,1.6,0],text:'The gate stands open. Nobody on Hollow Lane will ever lock it again.',fn:gateOpenNow},
    {cam:[-128,3,8],look:[-146,9,25],text:'November 1. You drive out the way you came in.',fn:bell}
  ],function(){
    game.mode='over'; setHud(false); wasLocked=false; if (document.exitPointerLock) try { document.exitPointerLock(); } catch(e){}
    $('winTitle').textContent='The End';
    $('winText').textContent = role==='killer' ? 'The lane kept him one more year.' : 'You went back, and you ended it.';
    $('winReward').textContent='Story mode does not pay tokens. Play Kill Feast online to earn them.';
    show('win');
  });
}
function finish(won){
  game.mode='over'; setHud(false); showPrompt(null); keys={}; touchMove.x=touchMove.y=0; moveId=lookId=null;
  $('safe').hidden=true; $('inside').hidden=true; $('peep').hidden=true;
  wasLocked=false; if (document.exitPointerLock) try { document.exitPointerLock(); } catch(e){}
  if (droneGain) droneGain.gain.value=0.03;
  var killer=game.role==='killer', C=CH()[story.ch];
  $('deadTitle').textContent = killer ? 'They got away' : 'He found you';
  $('deadText').textContent = (killer ? 'The lane will hear about this. ' : 'He follows your flashlight and the sound of running. ')+'You will start again from Chapter '+(story.ch+1)+': '+C.name+'.';
  show('dead');
}
function openStory(role){
  $('partsTitle').textContent = role==='killer' ? 'Killer Mode' : 'Victim Mode';
  var list=$('partsList'); list.innerHTML='';
  function add(label,small,fn){ var b=document.createElement('button'); b.type='button'; b.className='mbtn'; b.textContent=label; var sm=document.createElement('small'); sm.textContent=small; b.appendChild(sm); b.addEventListener('click',fn); list.appendChild(b); }
  var at=SAVE.story[role]||0;
  if (at>0) add('Continue','Chapter '+(at+1)+' · '+STORY[role][at].name,function(){ startStory(role,at); });
  add('New story', role==='killer' ? 'You are Elias Crane' : 'You are the stranger on the lane', function(){ SAVE.story[role]=0; save(); startStory(role,0); });
  show('parts');
}

/* story data: 20 chapters each */
var WARN=3, FIXER=9, GAZEBO={x:-146,z:-28}, CYGATE={x:-125,z:2.4}, SLIDE={x:-107,z:-26.6}, STONE={x:-107,z:31.5}, ROADEND={x:104,z:0};
function doorPt(h){ return {x:h.x,z:h.z-h.side*4.9}; }
function loc(h,x,y,z){ tmpV.set(x,y,z); h.g.localToWorld(tmpV); return [tmpV.x,tmpV.y,tmpV.z]; }
function nb(i){ return NEIGHBOURS[houses[i].n].n; }
var chainGate=new THREE.Group(), chainCol=null; chainGate.position.set(-125,0,4.5); scene.add(chainGate);
(function(){ for (var i=0;i<6;i++) box(0.045,1.5,0.045,ironM,-1.9+i*0.76,0.75,0,chainGate); box(4.2,0.05,0.05,ironM,0,1.25,0,chainGate); box(4.2,0.05,0.05,ironM,0,0.3,0,chainGate);
  box(0.22,0.26,0.1,mat(0xb89a4a,{metalness:.8,roughness:.3}),0,0.8,0.06,chainGate); chainCol=addBox(-125,4.5,2.2,0.14); })();
function setChain(on){ chainGate.visible=on; var k=colliders.indexOf(chainCol); if (on && k<0) colliders.push(chainCol); if (!on && k>=0) colliders.splice(k,1); }
var leverG=prop(function(g){ var m=mat(0xb8bcc2,{metalness:.6,roughness:.3,emissive:lin(0x101214)}); box(0.5,0.05,0.06,m,0,1.1,0,g); box(0.1,0.1,0.1,mat(0xa3211c),0.25,1.1,0,g); halo(0xfff0d0,0.5,0,1.15,0,g,.5); });
var truckG=prop(function(g){ halo(0xfff4d8,3.2,0,0.9,-0.75,g,1); halo(0xfff4d8,3.2,0,0.9,0.75,g,1); box(2.2,1.6,2.0,mat(0x1a1c20),1.4,1.0,0,g); });
function stalkerOff(t){ var S=stalker; S.mode=null; S.raise=0; S.g.visible=false; S.state='away'; S.timer=t; }
function stalkerAt(x,z,hunt){ var S=stalker; S.mode=null; S.raise=0; S.g.visible=true; S.g.position.set(x,0,z); setAnim('Idle');
  if (hunt){ S.state='hunt'; S.timer=0; S.stuck=0; S.unseen=0; S.lastX=x; S.lastZ=z; S.tx=P.x; S.tz=P.z; } }
function gateOpenNow(){ game.gateOpening=true; game.gateOpen=1; leaves.forEach(function(l){ l.g.rotation.y=-l.s*Math.PI*0.55; }); var k=colliders.indexOf(gateCollider); if (k>=0) colliders.splice(k,1);
  gateLamp.material.color.set(0x38ff6a); gateHalo.material.color.copy(lin(0x38ff6a)); moonLight.shadow.needsUpdate=true; }
function amber(){ gateLamp.material.color.set(0xffb020); gateHalo.material.color.copy(lin(0xffb020)); }
function clerkAt(x,y,z,ry){ var c=game.clerk; showResident(c); resident.g.position.set(x,y,z); resident.g.rotation.set(0,ry,0); }
function storyKnock(h){
  var K=CH()[story.ch].knock, lines=K.lines(), cams=[[1.7,2.3,7.6],[-1.4,2.2,6.6]];
  playCut(lines.map(function(t,i){ return {cam:loc(h,cams[i%2][0],cams[i%2][1],cams[i%2][2]),look:loc(h,0.12,2.25,4.3),who:h.n,text:t}; }),
    function(){ closeDoor(h); h.cd=game.time+20; completeChapter(); });
}
// victim chapter builders
function VReach(name,spawn,objFn,pt,r,extra){ var C={name:name,spawn:spawn,obj:objFn,target:function(){ return pt; },tick:function(){ if (nearP(pt,r)) completeChapter(); }}; if (extra) for (var k in extra) C[k]=extra[k]; return C; }
// killer chapter builders
var TOSTATION=[[-70,0],[-86,0],[-93.5,0]], TOPARK=[[-76,-2],[-88,-13],[-101,-15.5]], TOCHAPEL=TOPARK.concat([[-125,-15],[-125,8],[-146,22.6]]);
function front(h,d){ return [h.x,h.z-h.side*(d||8)]; }
function KChase(name,run,walk,objTxt,whoFn,startFn,pathFn,intro,extra){
  var C={name:name,run:run,walk:walk,dyn:true,noBeacon:true,intro:intro,
    obj:function(){ return objTxt.replace('%',surv.active?NEIGHBOURS[surv.who].n:'them'); }, target:function(){ return surv.active?{x:surv.x,z:surv.z}:null; },
    begin:function(){ spawnSurvivor(whoFn(),startFn(),pathFn()); }};
  if (extra) for (var k in extra) C[k]=extra[k]; return C;
}
function KDoor(name,run,walk,hi,goalTxt,pathFn,introTxt,shout){
  return {name:name,run:run,walk:walk,dyn:true,noBeacon:true,
    obj:function(){ return story.stage===0 ? 'Break down the door at '+nb(hi)+'’s house' : 'Catch '+nb(hi)+' before they '+goalTxt; },
    target:function(){ return story.stage===0 ? doorPt(houses[hi]) : (surv.active?{x:surv.x,z:surv.z}:null); },
    intro:function(){ var h=houses[hi]; return [{cam:loc(h,3.5,2.0,12),to:loc(h,2.4,2.0,9.5),look:loc(h,0,2.0,4.1),text:introTxt}]; },
    begin:function(){ surv.active=false; resident.g.visible=false; doorLight.intensity=0; },
    tick:function(){ var h=houses[hi];
      if (story.stage===0 && !story.hold) story.hold={pt:doorPt(h),r:2.3,dur:5,t:0,label:'Breaking the door',done:function(){
        if (!h.breached) markBreached(h); noise(0.5,0.9,1800); thud(1.4);
        playCut([{cam:loc(h,2.2,2.2,7.4),look:loc(h,0,2.0,4.1),who:h.n,text:shout}],function(){
          story.stage=1; spawnSurvivor(h.n,[h.x,h.z+h.side*6.6],[[h.x-6.6,h.z+h.side*6.4],[h.x-6.6,h.z-h.side*10]].concat(pathFn(h))); resumePlay(); });
      }}; }};
}
function KTear(name,n,objTxt,intro,extra){
  var C={name:name,dyn:true,tear:true,intro:intro,obj:function(){ return objTxt+' ('+Math.min(n,story.gens)+' of '+n+')'; },
    target:function(){ var h=nearestGen(false); return h?{x:h.gen.x,z:h.gen.z}:null; },
    begin:function(){ story.gens=0; surv.active=false; resident.g.visible=false; doorLight.intensity=0; if (!nearestGen(false)) allPower(true); },
    tick:function(){ if (story.gens>=n) completeChapter(); }};
  if (extra) for (var k in extra) C[k]=extra[k]; return C;
}
function KHold(name,pt,dur,label,objTxt,intro,outro){
  return {name:name,intro:intro,obj:function(){ return objTxt; },target:function(){ return pt; },
    begin:function(){ surv.active=false; doorLight.intensity=0; },
    tick:function(){ if (!story.hold) story.hold={pt:pt,r:2.6,dur:dur,t:0,label:label,done:function(){ if (outro) playCut(outro(),completeChapter); else completeChapter(); }}; }};
}

var STORY={victim:[
  {name:'Stranded', spawn:[-62,0,-Math.PI/2], obj:function(){ return 'Talk to the clerk at the gas station behind you'; }, target:function(){ return {x:STN.tx,z:STN.tz}; },
   intro:function(){ return [
     {cam:[-40,14,3],to:[-52,10,2],look:[-10,2,0],text:'October 31. 11:47 pm.'},
     {cam:[-59.5,1.5,7.5],to:[-60.5,1.4,6.5],look:[-64,0.8,2.6],text:'Your car dies at the end of a street called Hollow Lane.'},
     {cam:[lamps[1].sx-6,1.5,lamps[1].sz+2],to:[lamps[1].sx-3.4,1.6,lamps[1].sz+1],look:[lamps[1].sx,1.7,lamps[1].sz],text:'Someone is standing under the streetlight. He has not moved.',fn:function(){ stalkerAt(lamps[1].sx,lamps[1].sz); stalker.g.rotation.y=-Math.PI/2; }},
     {cam:[-70,2,5],to:[-73,2,4],look:[-88,2.6,0],text:'Behind you, one light is still on. The gas station.'}]; },
   after:function(){ stalkerOff(26); }},
  {name:'Dead Line', spawn:[-94.6,-3.4,Math.PI/2+0.2], obj:function(){ return 'Take the gas can by the pumps'; }, target:function(){ return GAS; },
   intro:function(){ var c=game.clerk; return [
     {cam:[-93.4,1.6,-3.0],to:[-93.9,1.6,-3.3],look:[STN.cx,1.5,STN.cz],who:c,text:'Phone’s dead. Has been since nine. Somebody cut the line.',fn:function(){ clerkAt(STN.cx,0.06,STN.cz,Math.PI/2); game.clerkOn=true; }},
     {cam:[-94.2,1.5,-5.6],look:[STN.cx,1.5,STN.cz],who:c,text:'Your car won’t start? You need a battery. '+hank()+' keeps a spare outside the garage, far end of the lane.'},
     {cam:[-93.4,1.6,-3.0],look:[STN.cx,1.55,STN.cz],who:c,text:'Take the gas can by the pumps. And ask '+nb(WARN)+' about the radio. Across the lane, second house.'}]; },
   begin:function(){ showItem(gasCan,GAS); },
   tick:function(){ if (nearP(GAS,1.5)){ game.grab=0.5; gasCan.visible=false; story.inv.gas=true; completeChapter(); } }},
  {name:'The Warning', spawn:[-80,4,-Math.PI/2], obj:function(){ return 'Knock on '+nb(WARN)+'’s door and ask about the radio'; }, target:function(){ return doorPt(houses[WARN]); },
   knock:{house:WARN,lines:function(){ return ['A radio? It has been static since nine. It’s him. Elias Crane. Every October.',
     'Take the handset. You’ll get nothing down here. Climb something. The slide in the park, out past the station.',
     'And listen. If you hide in a house, don’t let him see you go in. He will come through the door.']; }}},
  {name:'Static', spawn:[-33,8,Math.PI/2], obj:function(){ return 'Climb the slide in the park and call for help on the radio'; }, target:function(){ return SLIDE; },
   tick:function(){ if (!story.hold) story.hold={pt:SLIDE,r:2.8,dur:8,t:0,label:'Calling for help',done:function(){ playCut([
     {cam:[-103,2.6,-22],to:[-104,2.4,-23.5],look:[-107,2.2,-30],text:'Static. Then a voice, very far away.'},
     {cam:[-112,3,-20],look:[-60,6,0],text:'“Hollow Lane? Nobody drives out to Hollow Lane tonight. Lock a door and wait for morning.”'},
     {cam:[-103,2.6,-22],look:[-107,2.2,-30],text:'The handset goes dead in your hand.'}],completeChapter); }}; }},
  {name:'The Far End', spawn:[-107,-24,-Math.PI/2], obj:function(){ return 'Nobody is coming. Get the battery outside '+hank()+'’s garage, at the far end of the lane'; }, target:batPos,
   begin:function(){ showItem(battery,batPos()); },
   tick:function(){ if (nearP(batPos(),1.5)){ game.grab=0.5; battery.visible=false; story.inv.battery=true; completeChapter(); } }},
  {name:'Lights Out', spawn:[40.2,-10,Math.PI/2], obj:function(){ return 'Carry the battery and the gas back to your car'; }, target:function(){ return CARSIDE; },
   intro:function(){ var g=houses[8].gen; return [
     {cam:[g.x+3.6,1.4,g.z-2.4],to:[g.x+2.6,1.5,g.z-1.9],look:[g.x,1.3,g.z-0.7],text:'He was behind the house the whole time.',fn:function(){ stalkerAt(g.x,g.z-0.9); stalker.g.rotation.y=0; stalker.raise=1; }},
     {cam:[30,13,2],to:[18,11,2],look:[-30,2,0],text:'One by one, the lights on Hollow Lane go out.',fn:function(){ stalker.raise=0; allPower(false); tone(120,0.9,'sawtooth',0.12,30); noise(0.3,0.5,1200); }}]; },
   begin:function(){ allPower(false); }, after:function(){ stalkerOff(6); },
   tick:function(){ if (!story.hold && nearP(CARSIDE,3.2)) story.hold={pt:CARSIDE,r:3.6,dur:7,t:0,label:'Fitting the battery',done:completeChapter}; }},
  VReach('The Bell',[-64,6,Math.PI],function(){ return 'Follow the bell to the churchyard, out past the gas station'; },CYGATE,2.4,{
   intro:function(){ return [
     {cam:[-61,1.5,5.2],to:[-61.8,1.4,4.8],look:[-64,1.0,2.6],text:'The battery takes. The tank fills. You reach for the ignition.'},
     {cam:[-62.6,1.3,2.6],look:[-66,1.1,2.6],text:'Your keys are gone.'},
     {cam:[-128,3,-6],to:[-130,3.4,-4],look:[-146,9,25],text:'Out past the station, the chapel bell rings once.',fn:bell}]; },
   after:function(){ stalkerOff(8); }}),
  {name:'The Bandstand', spawn:[-125,0,Math.PI], obj:function(){ return 'Find the churchyard key at the bandstand in the park'; }, target:function(){ return GAZEBO; },
   intro:function(){ return [
     {cam:[-123.6,1.5,0.6],to:[-124.4,1.3,2.2],look:[-125,0.8,4.5],text:'The churchyard gate is chained shut. A tag on the padlock reads: key at the bandstand.'},
     {cam:[-138,2.2,-18],to:[-140,2.2,-20],look:[GAZEBO.x,2.2,GAZEBO.z],text:'Across the park, a single bulb is burning under the bandstand roof.'}]; },
   begin:function(){ showItem(keysG,GAZEBO); },
   tick:function(){ if (nearP(GAZEBO,1.7)){ game.grab=0.5; keysG.visible=false; setChain(false); tone(880,0.12,'triangle',0.12); completeChapter(); } }},
  VReach('The Chapel',[GAZEBO.x+3,GAZEBO.z+3,Math.PI],function(){ return 'Unlock the churchyard and go to the chapel door'; },CHAPEL,2.8),
  {name:'He Is Here', spawn:[-146,20.6,Math.PI], dyn:true, obj:function(){ return 'He is between you and the way out. Stay alive (0:'+('0'+Math.max(0,Math.ceil(story.timer))).slice(-2)+')'; },
   intro:function(){ return [
     {cam:[-146,1.6,19.6],to:[-146,1.6,21.4],look:[-146,1.45,23.4],text:'Your car keys hang from the chapel door, where he left them for you.',fn:function(){ showItem(keysG,{x:-146,z:23.4}); stalker.g.visible=false; }},
     {cam:[GRAVE.x+0.5,0.9,GRAVE.z-2.4],to:[GRAVE.x+0.2,0.8,GRAVE.z-1.5],look:[GRAVE.x,0.62,GRAVE.z],text:'The nearest stone reads: Elias Crane. 1961 to 1978. The lane kept him.'},
     {cam:[-131,1.5,12],to:[-129.5,1.6,10],look:[-125,1.7,6],text:'He never left. And he is standing at the churchyard gate.',fn:function(){ stalkerAt(-125,6.2); stalker.g.rotation.y=Math.atan2(-21,14); }}]; },
   begin:function(){ story.timer=40; },
   after:function(){ keysG.visible=false; story.inv.keys=true; cfg.base+=0.3; stalkerAt(-125,6.2,true); },
   tick:function(dt){ story.timer-=dt; if (story.timer<=0) completeChapter(); }},
  {name:'A Light in the Window', spawn:[-112,-15,-Math.PI/2], obj:function(){ return 'Somebody is signalling from '+nb(6)+'’s house. Knock on the door'; }, target:function(){ return doorPt(houses[6]); },
   intro:function(){ var h=houses[6]; return [{cam:loc(h,5,2.2,16),to:loc(h,4,2.2,13),look:loc(h,-3.2,3,4),text:'Back on the lane, a flashlight in one dark window is switching on and off. On and off.'}]; },
   after:function(){ stalkerOff(9); toast('You lost him. For now.',2600); },
   knock:{house:6,lines:function(){ return ['I watched him take your keys. I watched him do the same thing to my brother’s truck, years back.',
     'The gate has a lever. The handle comes off. The clerk keeps it under the register.',
     'Go on. And do not come back to this door.']; }}},
  VReach('The Empty Store',[11,-8,Math.PI/2],function(){ return 'Go back to the gas station for the gate lever'; },{x:-92.5,z:0},2.6,{begin:function(){ game.clerkGone=true; }}),
  VReach('The Stone House',[-92.5,0,Math.PI/2],function(){ return 'Find the clerk at the stone house in the churchyard'; },STONE,2.8,{
   intro:function(){ return [
     {cam:[-93.2,1.6,-2.6],to:[-93.8,1.6,-3.2],look:[-96.2,1.15,-4],text:'The store is empty. The register is open. The phone hangs off its hook.',fn:function(){ resident.g.visible=false; game.clerkOn=false; showItem(leverG,{x:-96.1,z:-4.6}); }},
     {cam:[-95.2,1.5,-4.9],to:[-95.5,1.4,-4.8],look:[-96.1,1.1,-4.6],text:'On the counter is a steel lever handle. The tag on it says: gate.'},
     {cam:[-95.2,1.5,-4.9],look:[-96.1,1.1,-4.6],text:'Under it, a note. Gone to the stone house in the churchyard. Do not knock loud.'}]; },
   begin:function(){ game.clerkGone=true; }, after:function(){ leverG.visible=false; story.inv.lever=true; stalkerOff(7); }}),
  {name:'House Power', spawn:[-107,29.5,0], dyn:true, obj:function(){ return 'The gate runs on house power. Fix 3 generators ('+Math.min(3,story.gens)+' of 3)'; },
   target:function(){ var h=nearestGen(true); return h?{x:h.gen.x,z:h.gen.z}:null; },
   intro:function(){ var c=game.clerk; return [
     {cam:[-105.6,1.6,29.4],to:[-106.2,1.6,30],look:[-107,1.5,32.2],who:c,text:'He took my phone. He took my keys. I am not coming out of here until it is light.',fn:function(){ clerkAt(-107,0,32.1,Math.PI); }},
     {cam:[-108.4,1.5,29.8],look:[-107,1.5,32.2],who:c,text:'That lever only works on house power. Three houses, any three. Then the box at the gate wakes up.'}]; },
   begin:function(){ game.clerkGone=true; story.gens=0; }, after:function(){ resident.g.visible=false; stalkerOff(7); },
   tick:function(){ if (story.gens>=3) completeChapter(); }},
  {name:'The Decoy', spawn:[-30,0,-Math.PI/2], obj:function(){ return nb(WARN)+' is knocking on her own window. Go to her door and knock'; }, target:function(){ return doorPt(houses[WARN]); },
   intro:function(){ var h=houses[WARN]; return [
     {cam:[40,10,3],to:[48,8,2],look:[72,2,0],text:'Three houses hum back to life. At the far end of the lane, the gate box wakes up.',fn:amber},
     {cam:loc(h,5,2.2,15),to:loc(h,4,2.2,12),look:loc(h,-3.2,3,4),text:'And across the lane, '+nb(WARN)+' is rapping on her own window, pointing at her front door.'}]; },
   begin:function(fromLoad){ game.clerkGone=true; amber(); if (fromLoad) [0,1,2].forEach(function(i){ setPower(houses[i],true); }); },
   knock:{house:WARN,lines:function(){ return ['You got the lights on. Good. He will come straight for them.',
     'I am going to take my lantern and walk the other way. He follows the light. He always follows the light.',
     'When I open this door, you run for your car. Do not watch.']; }}},
  VReach('Run the Lane',[-33,10,-Math.PI/2],function(){ return 'Run for your car while he follows the lantern'; },CARSIDE,3,{
   intro:function(){ var h=houses[WARN]; return [
     {cam:loc(h,4,2.0,13),to:loc(h,6,2.0,15),look:loc(h,-8,1.6,9),text:'She goes down the steps with the lantern held high, and she does not look back.',fn:function(){ showResident(houses[WARN].n); var p=loc(h,-6,0,9); resident.g.position.set(p[0],0,p[2]); resident.g.rotation.set(0,Math.PI/2,0); doorLight.intensity=2; doorLight.position.set(p[0],1.4,p[2]); }},
     {cam:[-20,1.6,3],to:[-22,1.6,2],look:[-12,1.7,0],text:'Down the lane, he turns his head. Then the rest of him.',fn:function(){ stalkerAt(-12,0); stalker.g.rotation.y=Math.PI/2; }}]; },
   begin:function(){ game.clerkGone=true; amber(); }, after:function(){ resident.g.visible=false; doorLight.intensity=0; stalkerOff(22); }}),
  {name:'The Gate', spawn:[65.2,3.4,-Math.PI/2], obj:function(){ return 'Fit the lever at the gate box and hold it until the gate opens'; }, target:function(){ return LEVER; },
   intro:function(){ return [
     {cam:[-61,1.5,5.2],look:[-64,1.0,2.6],text:'The engine turns over. You don’t look back down the lane.'},
     {cam:[20,1.2,3],to:[50,1.3,3],look:[80,1.5,0],text:'The gate at the end is still shut. Somebody has to fit the lever and hold it.'}]; },
   begin:function(){ game.clerkGone=true; amber(); },
   after:function(){ moveCar(62,0); P.x=65.2; P.z=3.4; P.yaw=-Math.PI/2; cfg.base+=0.45; stalkerOff(4); },
   tick:function(){ if (!story.hold) story.hold={pt:LEVER,r:4.6,dur:22,t:0,label:'The gate is opening',done:function(){ openGate(); completeChapter(); }}; }},
  {name:'Stalled', spawn:[63.5,2.4,-Math.PI/2], obj:function(){ return 'The car is dead. Run through the gate on foot'; }, target:function(){ return {x:77.5,z:0}; },
   intro:function(){ return [
     {cam:[66,1.5,3.6],to:[65,1.4,3],look:[62,1.0,0],text:'The gate swings wide. You drop into the seat and turn the key.'},
     {cam:[63.5,1.3,0.3],look:[40,1.5,0],text:'The engine catches, coughs, and dies. In the mirror, something is walking up the middle of the lane.',fn:function(){ stalkerAt(48,0); stalker.g.rotation.y=Math.PI/2; }}]; },
   begin:function(){ game.clerkGone=true; moveCar(62,0); },
   after:function(){ gateOpenNow(); P.x=63.5; P.z=2.4; P.yaw=-Math.PI/2; cfg.base+=0.5; stalkerAt(48,0,true); },
   tick:function(){ if (P.x>76.8) completeChapter(); }},
  {name:'The Road', spawn:[78,0,-Math.PI/2], obj:function(){ return 'Keep running. Do not stop until the lane is behind you'; }, target:function(){ return ROADEND; },
   begin:function(){ game.clerkGone=true; moveCar(62,0); gateOpenNow(); }, after:function(){ toast('He stops at the gate.',2800); },
   tick:function(){ if (P.x>ROADEND.x-1.5) completeChapter(); }},
  {name:'Headlights', spawn:[103,0,-Math.PI/2], obj:function(){ return 'Stand in the road and wave them down'; }, target:function(){ return {x:106,z:0}; },
   intro:function(){ return [{cam:[103,1.6,0.5],to:[104,1.6,0.3],look:[130,1.0,0],text:'Headlights. Coming slowly up the county road.',fn:function(){ truckG.position.set(126,0,0); truckG.visible=true; }}]; },
   begin:function(){ game.clerkGone=true; moveCar(62,0); gateOpenNow(); truckG.position.set(126,0,0); truckG.visible=true; },
   tick:function(){ if (!story.hold) story.hold={pt:{x:106,z:0},r:3.5,dur:6,t:0,label:'Waving',done:completeChapter}; }}
],
killer:[
  KTear('The Lane Remembers',3,'Tear out 3 generators to put the lane in the dark',function(){ return [
     {cam:[GRAVE.x+0.5,0.9,GRAVE.z-2.4],to:[GRAVE.x+0.2,0.8,GRAVE.z-1.5],look:[GRAVE.x,0.62,GRAVE.z],text:'Elias Crane. 1961 to 1978.'},
     {cam:[-128,3,8],to:[-130,3.4,10],look:[-146,9,25],text:'Every October 31st, Hollow Lane remembers him.',fn:bell},
     {cam:[-60,12,3],to:[-45,9,2],look:[10,2,0],text:'Tonight, he remembers Hollow Lane.'}]; },{spawn:[-146,17,Math.PI]}),
  KHold('Dead Line',{x:-94,z:-9.4},6,'Cutting the phone line','Cut the phone line behind the gas station',function(){ return [
     {cam:[-84,2.4,-14],to:[-86,2.2,-13],look:[-94,2.5,-8],text:'One building on the lane still has a telephone that works.'}]; },function(){ return [
     {cam:[-93.4,1.6,-3.0],look:[STN.cx,1.5,STN.cz],who:game.clerk,text:'Hello? … Hello? Huh. Line’s gone.',fn:function(){ clerkAt(STN.cx,0.06,STN.cz,Math.PI/2); }}]; }),
  KChase('The Clerk',4.9,3.0,'Catch % before the chapel bell rings',function(){ return game.clerk; },function(){ return [-88.4,0]; },function(){ return [[-97,-15.5],[-125,-15],[-125,8],[-146,22.6]]; },function(){ var c=game.clerk; return [
     {cam:[-93.4,1.6,-3.0],to:[-93.9,1.6,-3.3],look:[STN.cx,1.5,STN.cz],who:c,text:'He’s out there. I saw him at the pumps. I have to ring the bell.',fn:function(){ clerkAt(STN.cx,0.06,STN.cz,Math.PI/2); }},
     {cam:[-84,2,6],to:[-86,2,5],look:[-92,1.5,0],text:'The clerk runs for the chapel.'}]; },{spawn:[-70,0,Math.PI/2],bellOnFail:true}),
  KChase('The Witness',5.0,3.1,'Catch % before they reach the station phone',function(){ return houses[6].n; },function(){ return [11,-10.4]; },function(){ return [[2,-2]].concat(TOSTATION); },function(){ var n=houses[6].n; return [
     {cam:[8,1.7,-6],to:[9,1.7,-7.5],look:[11,1.9,-12.6],who:n,text:'I saw him from my window. I’m calling this in from the station!',fn:function(){ showResident(n); resident.g.position.set(11.1,0.6,-13.1); resident.g.rotation.set(0,0,0); }}]; },{spawn:[46,5,Math.PI/2]}),
  KDoor('The Locked Door',5.1,3.1,5,'reach the station',function(){ return [[-40,0]].concat(TOSTATION); },'One porch light is still burning. Somebody locked their door and is hoping that is enough.','He’s in the house! Out the back, go, go!'),
  {name:'House Lights', run:5.2, walk:3.2, spawn:[20,0,Math.PI/2], dyn:true, noBeacon:true, obj:function(){ return 'Catch '+NEIGHBOURS[surv.who].n+' before they get three generators running again'; }, target:function(){ return {x:surv.x,z:surv.z}; },
   intro:function(){ var h=houses[FIXER]; return [
     {cam:loc(h,2.2,2.2,7.6),look:loc(h,0.12,2.25,4.3),who:h.n,text:'I can get the lights back on. Three generators. Stay inside and keep quiet.',fn:function(){ showResident(h.n); var p=loc(h,0.12,0.6,4.5); resident.g.position.set(p[0],p[1],p[2]); resident.g.rotation.set(0,h.g.rotation.y,0); }},
     {cam:[-20,11,3],to:[-30,9,2],look:[-60,2,0],text:'Somebody on the lane still thinks the dark can be fixed.'}]; },
   begin:function(){ allPower(true); [0,1,2].forEach(function(i){ setPower(houses[i],false); }); var h=houses[FIXER], g0=houses[0].gen, g1=houses[1].gen, g2=houses[2].gen;
     spawnSurvivor(h.n,front(h),[[-26,-6],[-26,-24.2],[g2.x,g2.z-1.3,7,'fix',2],[-26,-24.2],[-26,-6],[-62,-6],[-62,-24.2],[g0.x,g0.z-1.3,7,'fix',0],[-62,-24.2],[-62,6],[-62,24.2],[g1.x,g1.z+1.3,7,'fix',1],[-62,24.2]]); }},
  KChase('The Bandstand',5.2,3.2,'Catch % before they wake the lane',function(){ return 17; },function(){ return [GAZEBO.x+3,GAZEBO.z+2]; },function(){ var d=doorPt(houses[0]); return [[-125,-15],[-101,-15.5],[-88,-13],[-76,-2],[d.x,d.z-houses[0].side*3],[d.x,d.z,4]]; },function(){ return [
     {cam:[-140,2,-22],to:[-142,1.9,-24],look:[GAZEBO.x,1.6,GAZEBO.z],who:17,text:'Did you hear that? The whole lane just went dark. I’m going to bang on some doors.',fn:function(){ showResident(17); resident.g.position.set(GAZEBO.x,0.25,GAZEBO.z); resident.g.rotation.set(0,0.8,0); }}]; }),
  KChase('The Bell Rope',5.3,3.2,'Catch % before they reach the chapel bell',function(){ return houses[10].n; },function(){ return front(houses[10]); },function(){ return [[40,0],[-70,0]].concat(TOCHAPEL); },function(){ var h=houses[10]; return [
     {cam:loc(h,2.2,2.2,7.6),look:loc(h,0.12,2.25,4.3),who:h.n,text:'Nobody rang the bell. Somebody has to ring the bell.',fn:function(){ showResident(h.n); var p=loc(h,0.12,0.6,4.5); resident.g.position.set(p[0],p[1],p[2]); resident.g.rotation.set(0,h.g.rotation.y,0); }}]; },{bellOnFail:true}),
  KDoor('The Second Door',5.3,3.2,2,'hide in the churchyard',function(){ return [[-60,-3]].concat(TOPARK,[[-125,-15],[-125,8],[-110,30]]); },'Another door. Another lock that was never meant for him.','Not the cellar. The churchyard. Run!'),
  KTear('Dark Again',3,'They are getting lights back. Tear out 3 more generators',function(){ return [{cam:[10,12,3],to:[0,10,2],look:[-40,2,0],text:'Windows are coming back on, one house at a time. That will not do.'}]; }),
  KChase('The Radio',5.4,3.2,'Catch % before they call for help from the slide',function(){ return houses[WARN].n; },function(){ return front(houses[WARN]); },function(){ return [[-60,3]].concat(TOPARK,[[-107,-22],[SLIDE.x,SLIDE.z,8]]); },function(){ var h=houses[WARN]; return [
     {cam:loc(h,2.2,2.2,7.6),look:loc(h,0.12,2.25,4.3),who:h.n,text:'The radio still has a battery. I just need to get up high.',fn:function(){ showResident(h.n); var p=loc(h,0.12,0.6,4.5); resident.g.position.set(p[0],p[1],p[2]); resident.g.rotation.set(0,h.g.rotation.y,0); }}]; }),
  KChase('The Dead Car',5.4,3.3,'Catch % before they get the old car started',function(){ return houses[4].n; },function(){ return front(houses[4]); },function(){ return [[-70,0],[-80,3],[GAS.x,GAS.z,3],[-70,3],[CARSIDE.x,CARSIDE.z,9]]; },function(){ var h=houses[4]; return [
     {cam:loc(h,2.2,2.2,7.6),look:loc(h,0.12,2.25,4.3),who:h.n,text:'There’s a car at the end of the lane. A can of gas and it might run.',fn:function(){ showResident(h.n); var p=loc(h,0.12,0.6,4.5); resident.g.position.set(p[0],p[1],p[2]); resident.g.rotation.set(0,h.g.rotation.y,0); }}]; }),
  KDoor('The Third Door',5.5,3.3,8,'climb the gate',function(){ return [[50,0],[69.6,1.6,7],[70.5,0.5]]; },'The far end of the lane. The last house before the gate.','The gate! Over the gate!'),
  KChase('Two Lanterns',5.4,3.3,'Catch % before they get away',function(){ return houses[1].n; },function(){ return front(houses[1]); },function(){ return [[-70,2]].concat(TOPARK,[[-150,-15],[-156,-36]]); },function(){ return [
     {cam:[-30,10,3],to:[-40,8,2],look:[-55,2,10],text:'Two lanterns leave two houses at the same moment, going opposite ways.'}]; },
     {onCatch:function(){ if (story.stage===0){ story.stage=1; toast('One lantern out. The other is still moving.',3000); var h=houses[10]; spawnSurvivor(h.n,front(h),[[45,0],[69.6,1.6,7],[70.5,0.5]]); setObjective(); return true; } return false; }}),
  KChase('The Deputy',5.6,3.4,'Catch the deputy before he reports in from the station',function(){ return 21; },function(){ return [66,0]; },function(){ var a=doorPt(houses[10]), b=doorPt(houses[7]), c=doorPt(houses[4]); return [[a.x,a.z,3],[b.x,0],[b.x,b.z,3],[c.x,0],[c.x,c.z,3],[c.x,0]].concat(TOSTATION); },function(){ return [
     {cam:[60,1.6,4],to:[62,1.6,3],look:[70,1.5,0],text:'A deputy lets himself in through the gate with a flashlight and a ring of keys.',fn:function(){ showResident(21); resident.g.position.set(68,0,0); resident.g.rotation.set(0,-Math.PI/2,0); }},
     {cam:[60,1.6,4],look:[68,1.6,0],who:21,text:'County sheriff’s office. Anybody home on this street?'}]; }),
  {name:'Lights Out Again', run:5.5, walk:3.3, dyn:true, tear:true, tearStage:0,
   obj:function(){ return story.stage===0 ? 'Tear out 2 generators ('+Math.min(2,story.gens)+' of 2)' : 'Catch '+NEIGHBOURS[surv.who].n+' before they fix them'; },
   target:function(){ if (story.stage===0){ var h=nearestGen(false); return h?{x:h.gen.x,z:h.gen.z}:null; } return surv.active?{x:surv.x,z:surv.z}:null; },
   intro:function(){ return [{cam:[20,12,3],to:[10,10,2],look:[-20,2,0],text:'They keep fixing what he breaks. So he will break the one who fixes.'}]; },
   begin:function(){ story.gens=0; surv.active=false; resident.g.visible=false; doorLight.intensity=0; if (!nearestGen(false)) allPower(true); },
   tick:function(){ if (story.stage===0 && story.gens>=2){ story.stage=1; var h=houses[7], t=nearestGen(true); toast(nb(7)+' comes out with a toolbox.',3000);
     spawnSurvivor(h.n,front(h),[[t.x+4,t.z>0?8:-8],[t.x+4,t.gen.z],[t.gen.x,t.gen.z+(t.side>0?1.3:-1.3),9,'fix',houses.indexOf(t)],[t.x+4,t.gen.z],[t.x+4,0]].concat(TOSTATION)); setObjective(); } }},
  {name:'The Chapel Door', run:5.6, walk:3.4, dyn:true, noBeacon:true,
   obj:function(){ return story.stage===0 ? 'They have barred themselves in the chapel. Break the door' : 'Catch '+NEIGHBOURS[surv.who].n+' before they reach the gate'; },
   target:function(){ return story.stage===0 ? CHAPEL : (surv.active?{x:surv.x,z:surv.z}:null); },
   intro:function(){ return [{cam:[-140,2.2,10],to:[-139,2.2,8],look:[-146,6,28],text:'There is a light under the chapel door. There has not been a light in the chapel since 1978.'}]; },
   begin:function(){ surv.active=false; resident.g.visible=false; doorLight.intensity=0; },
   tick:function(){ if (story.stage===0 && !story.hold) story.hold={pt:CHAPEL,r:2.6,dur:8,t:0,label:'Breaking the chapel door',done:function(){ noise(0.5,0.9,1800); thud(1.4);
     playCut([{cam:[-150,1.6,20],look:[-146,1.5,23.4],who:18,text:'Out the vestry! Go! Don’t stop for me!'}],function(){ story.stage=1;
       spawnSurvivor(18,[-141,27],[[-136,20],[-125,8],[-125,-15],[-101,-15.5],[-88,-13],[-76,-2],[60,0],[69.6,1.6,7],[70.5,0.5]]); resumePlay(); }); }}; }},
  KDoor('The Last Neighbour',5.7,3.4,11,'reach the station phone',function(){ return [[40,0]].concat(TOSTATION); },'Eleven doors are open on Hollow Lane. One is not.','Run! Don’t look at him, just run!'),
  KHold('The Stranger',CARSIDE,6,'Taking the keys','A stranger has gone into the station. Take the keys from their car',function(){ return [
     {cam:[-59.5,1.5,7.5],to:[-60.5,1.4,6.5],look:[-64,0.8,2.6],text:'A car dies at the end of the lane. A stranger steps out and walks toward the only light.',fn:function(){ showResident(20); resident.g.position.set(-70,0,2); resident.g.rotation.set(0,-Math.PI/2,0); }},
     {cam:[-140,2.2,10],to:[-139,2.2,8],look:[-146,6,28],text:'He has waited all year for someone new.'}]; },function(){ return [
     {cam:[-62.6,1.3,2.6],look:[-66,1.1,2.6],text:'The keys are still in the ignition. Nobody takes their keys out on a street this quiet.'}]; }),
  KChase('The Visitor',5.8,3.4,'Catch the stranger before they get through the gate',function(){ return 20; },function(){ return [-86,0]; },function(){ return [[-70,0],[CARSIDE.x,CARSIDE.z,4],[-40,0],[60,0],[69.6,1.6,5,'gate'],[78,0]]; },function(){ return [
     {cam:[-61,1.5,5.2],to:[-61.8,1.4,4.8],look:[-64,1.0,2.6],text:'The stranger comes back with a gas can, reaches for the ignition, and understands.',fn:function(){ showResident(20); resident.g.position.set(-64,0,4.6); resident.g.rotation.set(0,Math.PI,0); }},
     {cam:[20,1.2,3],to:[40,1.3,3],look:[80,1.5,0],text:'There is only one other way off Hollow Lane.'}]; })
]};

/* ---------- part two: fifty more chapters each ---------- */
STORY.victim[0].clerk=true;
var boxG=prop(function(g){ box(0.4,0.26,0.3,mat(0x6a4a32,{roughness:.7,emissive:lin(0x0c0804)}),0,0.13,0,g); box(0.42,0.04,0.32,mat(0xb89a4a,{metalness:.7,roughness:.3}),0,0.27,0,g); halo(0xffd070,0.9,0,0.4,0,g,.6); });
var LOCS={station:{x:-92.5,z:0},counter:{x:STN.tx,z:STN.tz},pumps:GAS,slide:SLIDE,swings:{x:-116,z:-25.2},gazebo:GAZEBO,cygate:CYGATE,chapel:CHAPEL,grave:{x:GRAVE.x,z:GRAVE.z-1.7},
  stone:STONE,gate:{x:69.3,z:0},lever:LEVER,car:CARSIDE,sign:{x:-76,z:-14.2},lamp:{x:lamps[2].sx,z:lamps[2].sz},park:{x:-132,z:-21},lane:{x:0,z:0},yard:{x:-134,z:15},bench:{x:-110,z:-13.2},east:{x:52,z:0}};
function L(k){
  if (typeof k!=='string') return k;
  if (k==='garage') return batPos();
  if (LOCS[k]) return LOCS[k];
  var h=houses[+k.slice(1)]; return k[0]==='d' ? doorPt(h) : {x:h.x,z:h.z-h.side*8};
}
function unbreach(h){ h.breached=false; h.dead=false; h.pivot.visible=true; h.pivot.rotation.y=0; h.open=0; h.broken.visible=false; h.hall.visible=false; h.hall.material.color.copy(lin(0xc98a48)); h.cd=0; }
function yearTwo(){
  houses.forEach(unbreach); allPower(true); setChain(false); game.clerkGone=false; truckG.visible=false; moveCar(-64,2.6);
  game.gateOpen=0; game.gateOpening=false; leaves.forEach(function(l){ l.g.rotation.y=0; }); if (colliders.indexOf(gateCollider)<0) colliders.push(gateCollider);
  gateLamp.material.color.set(0xff2222); gateHalo.material.color.copy(lin(0xff3030)); bloodClear(); moonLight.shadow.needsUpdate=true;
  P.x=-62; P.z=0; P.yaw=-Math.PI/2; P.pitch=0;
}
function genShots(pt,texts,h){
  return texts.map(function(t,i){
    if (h) return {cam:loc(h,i%2?-2.5:3.5,2.1,11),to:loc(h,i%2?-1.8:2.4,2.1,9),look:loc(h,0,2.0,4.1),text:t};
    if (pt.x<-90 && pt.x>-98 && Math.abs(pt.z)<8) return {cam:[-93.4,1.6,i%2?-5.4:-3.0],look:[STN.cx,1.5,STN.cz],text:t,fn:function(){ if (!game.clerkGone) clerkAt(STN.cx,0.06,STN.cz,Math.PI/2); }};
    var s=i%2?-1:1; return {cam:[pt.x+5*s,3,pt.z+6],to:[pt.x+3.4*s,2.3,pt.z+4.4],look:[pt.x,1.2,pt.z],text:t};
  });
}
function pad2(v){ return ('0'+Math.max(0,Math.ceil(v))).slice(-2); }
function VGen(r){
  var C={name:r.n,spawn:[-62,0,-Math.PI/2],dyn:r.t==='survive'||r.t==='fix'};
  var at=function(){ return r.t==='knock'?doorPt(houses[r.h]):r.t==='clerk'?LOCS.counter:L(r.at||'lane'); };
  C.obj=function(){ var t=r.o.replace('%',r.h!==undefined?nb(r.h):hank()); if (r.t==='survive') t+=' (0:'+pad2(story.timer)+')'; if (r.t==='fix') t+=' ('+Math.min(r.k,story.gens)+' of '+r.k+')'; return t; };
  C.target = r.t==='fix' ? function(){ var h=nearestGen(true); return h?{x:h.gen.x,z:h.gen.z}:null; } : r.t==='survive' ? null : at;
  if (r.t==='clerk') C.clerk=true;
  if (r.t==='knock') C.knock={house:r.h,lines:function(){ return r.l; }};
  if (r.i) C.intro=function(){ var sh=genShots(at(),[].concat(r.i),r.t==='knock'?houses[r.h]:null); if (r.pre) sh=r.pre().concat(sh); return sh; };
  C.begin=function(){
    if (r.fresh) yearTwo();
    setChain(false); game.clerkGone=false;
    if (r.t==='knock') unbreach(houses[r.h]);
    if (r.t==='fix'){ allPower(true); for (var k=0;k<r.k;k++) setPower(houses[(story.ch*5+k*3)%12],false); story.gens=0; moonLight.shadow.needsUpdate=true; }
    if (r.t==='fetch') showItem(boxG,at());
    if (r.t==='survive') story.timer=r.k;
  };
  C.after=function(){
    boxG.visible=r.t==='fetch';
    if (r.t==='survive'){ cfg.base+=0.2; if (teleport(true)){ stalker.state='hunt'; stalker.timer=0; } else stalkerOff(1); }
    else stalkerOff(7+(story.ch%5)*2);
  };
  C.tick=function(dt){
    if (r.t==='reach'){ if (nearP(at(),r.r||2.8)) completeChapter(); }
    else if (r.t==='fetch'){ if (nearP(at(),1.6)){ game.grab=0.5; boxG.visible=false; tone(880,0.12,'triangle',0.12); completeChapter(); } }
    else if (r.t==='hold'){ if (!story.hold) story.hold={pt:at(),r:3.2,dur:r.k,t:0,label:r.lab,done:function(){ if (r.bell) bell(); completeChapter(); }}; }
    else if (r.t==='survive'){ story.timer-=dt; if (story.timer<=0) completeChapter(); }
    else if (r.t==='fix'){ if (story.gens>=r.k) completeChapter(); }
  };
  return C;
}
[
 {t:'reach',n:'One Year Later',at:'station',o:'Walk to the gas station',fresh:true,i:['One year later. October 31. You told yourself you would never drive this road again.','The station light is still on. Your old car is still where it died.'],
  pre:function(){ return [
   {cam:[108,1.5,1.2],to:[110,1.5,1.0],look:[124,1.1,0],text:'A county truck. The driver does not ask where you came from. He just opens the door.',fn:function(){ truckG.position.set(118,0,0); truckG.visible=true; stalkerAt(71.5,0); stalker.g.rotation.y=Math.PI/2; }},
   {cam:[75.5,1.6,1.2],to:[74.2,1.7,0.6],look:[71.5,1.75,0],text:'Behind you, he is standing in the open gate. He always stops at the gate.'},
   {cam:[-128,3,8],look:[-146,9,25],text:'November 1.',fn:function(){ bell(); truckG.visible=false; stalker.g.visible=false; }}]; }},
 {t:'clerk',n:'The New Clerk',o:'Talk to the new clerk',i:'There is a different face behind the counter. Nobody will say what happened to the last one.'},
 {t:'knock',n:'An Old Door',h:3,o:'Knock on %’s door',i:'One porch you remember. One person who told you the truth.',l:['You. I told you not to come back to this door.','He took four of us last October. Nobody outside the lane believes there was ever a street here.','If you came to end it, start where he started. The chapel keeps a ledger.']},
 {t:'reach',n:'The Open Chapel',at:'chapel',o:'Go to the chapel in the churchyard',i:'The churchyard gate hangs open this year. The chain is gone.'},
 {t:'hold',n:'The Ledger',at:'chapel',k:8,lab:'Reading the ledger',o:'Read the parish ledger inside the chapel door',i:'A ledger on a stand, open to 1978, as if someone wanted it found.'},
 {t:'reach',n:'Seventeen',at:'grave',o:'Find his grave again',i:'Elias Crane was seventeen. The ledger says the lane held a vote that October. It does not say on what.'},
 {t:'survive',n:'He Knows You',at:'grave',k:35,o:'He knows you came back. Stay alive',i:'The grass by the stone is pressed flat, as if someone had only just stood up.'},
 {t:'knock',n:'The Vote',h:6,o:'Ask % what the lane voted on',i:'One house on the lane is old enough to remember the meeting.',l:['My father was at that meeting. They voted to lock the gate that night. With the boy still outside it.','A storm came through. They found him by the chapel wall in the morning.','Every door on this lane was closed to him once. He has not forgotten which.']},
 {t:'fetch',n:'The Stone House',at:'stone',o:'Search the stone house for the old gate key',i:'The clerk hid in the stone house last year. Something was left on the floor.'},
 {t:'reach',n:'The Old Lock',at:'lever',o:'Carry the old key to the gate box',i:'The lane gate has two locks. One is new. One is from 1978.'},
 {t:'hold',n:'The 1978 Lock',at:'lever',k:10,lab:'Turning the old lock',o:'Turn the old lock at the gate box',i:'The old key fits. Behind you, every streetlight on the lane flickers at once.'},
 {t:'survive',n:'A Closed Gate',at:'gate',k:40,o:'He is coming up the lane. Stay alive',i:'The lock does not open. It was never meant to keep him in. It was meant to keep him out.'},
 {t:'clerk',n:'Four Things',o:'Ask the clerk about the things he carried',i:'Priya said he was carrying four things the night of the storm.'},
 {t:'fetch',n:'The Jacket',at:'slide',o:'Find his school jacket at the playground slide',i:'The clerk says children still find things in the park. Things from 1978.'},
 {t:'fetch',n:'The Photograph',at:'gazebo',o:'Find the photograph under the bandstand',i:'A boy, a bandstand, a whole street smiling. He is the only one looking at the camera.'},
 {t:'survive',n:'Bandstand',at:'gazebo',k:30,o:'He wants it back. Stay alive',i:'The bulb under the bandstand roof goes out.'},
 {t:'fetch',n:'The Lantern',at:'garage',o:'Find his lantern outside %’s garage',i:'At the far end of the lane, someone kept a storm lantern for forty years and never lit it.'},
 {t:'fix',n:'Somebody Is Afraid',k:2,o:'Two houses just went dark. Fix the generators',i:'He never needed the dark before. This year he is afraid of something.'},
 {t:'fetch',n:'The Trunk',at:'car',o:'Look in the trunk of your old car',i:'Your car has sat at the end of the lane for a year. Somebody has been putting things in it.'},
 {t:'knock',n:'His Jacket',h:1,o:'Show % what you found',i:'A porch light comes on before you reach the steps.',l:['That is his jacket. I gave him that jacket.','We said if his things were buried with him he would rest. Nobody had the nerve to open the ground.','Somebody will have to. Not tonight. Tonight he is watching you.']},
 {t:'knock',n:'Door One',h:0,o:'Ask % to stand with you',i:'You cannot dig a grave alone with him at your back.',l:['Stand with you. Outside. On that night.','My mother kept this door shut for him and I have kept it shut every year since.','… Ring the bell when you want us. If I hear it, I will come.']},
 {t:'knock',n:'Door Two',h:5,o:'Ask % to stand with you',i:'The second door has four locks on it.',l:['I know who you are. You are the one who got out.','Nobody gets out and comes back. That is either very brave or very stupid.','Ring the bell. I will bring a lantern.']},
 {t:'knock',n:'Door Three',h:8,o:'Ask % to stand with you',i:'The last house before the gate.',l:['He stood in my yard for an hour last year. Just stood.','If the whole lane comes out, he cannot look at all of us at once.','I will be there. Ring it loud.']},
 {t:'fix',n:'Lights For The Lane',k:3,o:'He is tearing them out again. Fix the generators',i:'Three more houses go dark while you are still on the porch.'},
 {t:'survive',n:'Under The Streetlight',at:'lamp',k:40,o:'Stay alive under the lights',i:'He is standing where he stood the first night. Under the streetlight. Not moving. Then moving.'},
 {t:'fetch',n:'Road Flares',at:'counter',o:'Take the road flares from the station counter',i:'He follows the light. So give him light where you want him.'},
 {t:'hold',n:'First Flare',at:'lamp',k:6,lab:'Lighting a flare',o:'Light a flare under the middle streetlight',i:'One flare for the lane.'},
 {t:'hold',n:'Second Flare',at:'cygate',k:6,lab:'Lighting a flare',o:'Light a flare at the churchyard gate',i:'One for the gate he stood at.'},
 {t:'hold',n:'Third Flare',at:'chapel',k:6,lab:'Lighting a flare',o:'Light a flare at the chapel door',i:'One for the wall where they found him.'},
 {t:'survive',n:'He Follows The Light',at:'chapel',k:45,o:'He is coming down the line of flares. Stay alive',i:'Three red lights. He walks to each one in turn, as if he is counting them.'},
 {t:'clerk',n:'Chain And Padlock',o:'Ask the clerk what happened to the churchyard chain',i:'There was a chain on the churchyard gate last year. You want it back.'},
 {t:'fetch',n:'The Chain',at:'sign',o:'Take the chain from the foot of the price sign',i:'The clerk used it to hold the sign up in the wind. It still has the padlock on it.'},
 {t:'hold',n:'A Gate For Him',at:'cygate',k:8,lab:'Hanging the chain',o:'Hang the chain ready on the churchyard gate',i:'When the time comes it has to close fast, with him on the inside.'},
 {t:'fetch',n:'The Shovel',at:'stone',o:'Take the shovel from behind the stone house',i:'Every churchyard keeps a shovel. Nobody on this lane has touched this one since 1978.'},
 {t:'knock',n:'The Last Holdout',h:9,o:'Knock on %’s door',i:'One house has not opened its door to anyone in years.',l:['Go away.','… You have his jacket. Hold it up to the glass.','My brother locked that gate. I have been waiting forty years for somebody to ask me to open it.']},
 {t:'fix',n:'He Tears, You Mend',k:3,o:'Keep the lane lit. Fix the generators',i:'He knows what the lights are for now.'},
 {t:'survive',n:'Across The Park',at:'park',k:45,o:'Cross the park without letting him catch you',i:'The swings are moving. There is no wind.'},
 {t:'hold',n:'Ring It',at:'chapel',k:10,lab:'Ringing the bell',bell:true,o:'Ring the chapel bell',i:'You told them you would ring it when it was time.'},
 {t:'survive',n:'They Come Out',at:'chapel',k:50,o:'Hold on until the lane arrives',i:'A door opens on Hollow Lane. One lantern. Then five. Then eleven.'},
 {t:'reach',n:'The Stone Again',at:'grave',o:'Go to his grave',i:'They stand along the churchyard fence with their lanterns up. He stands in the gate and does not come in.'},
 {t:'hold',n:'Six Feet',at:'grave',k:12,lab:'Digging',o:'Dig',i:'Nobody speaks. Somebody starts to hum the hymn from the ledger.'},
 {t:'survive',n:'He Watches',at:'grave',k:40,o:'He has come inside the fence. Stay alive',i:'He walks past every lantern on the lane to reach you.'},
 {t:'hold',n:'Deeper',at:'grave',k:12,lab:'Digging',o:'Keep digging',i:'The chain goes onto the churchyard gate behind him. He does not turn around.'},
 {t:'hold',n:'The Jacket Goes Back',at:'grave',k:6,lab:'Laying the jacket down',o:'Lay his jacket in the grave',i:'The first of four.'},
 {t:'hold',n:'The Photograph Goes Back',at:'grave',k:6,lab:'Laying the photograph down',o:'Lay the photograph in the grave',i:'The second. He has stopped walking.'},
 {t:'hold',n:'The Lantern Goes Back',at:'grave',k:6,lab:'Laying the lantern down',o:'Lay his lantern in the grave',i:'The third. He is close enough to touch you. He does not.'},
 {t:'survive',n:'One More Thing',at:'grave',k:55,o:'There were four things. Stay alive',i:'He holds out his hand. You have nothing left to put in it. He raises the knife.'},
 {t:'hold',n:'Earth',at:'grave',k:10,lab:'Filling the grave',o:'The fourth thing was the knife. Fill the grave',i:'He lets go of it himself. It falls where the other things fell.'},
 {t:'reach',n:'The Gate Is Open',at:'gate',o:'Walk to the gate',i:'Nobody on the lane locked the gate tonight. Nobody on the lane ever will again.'},
 {t:'hold',n:'November 1',at:'lever',k:6,lab:'Taking the old lock off',o:'Take the 1978 lock off the gate box',i:'One last thing to carry away from Hollow Lane.'}
].forEach(function(r,i,rows){ var C=VGen(r), pr=i>0?rows[i-1]:null;
  if (pr && !r.fresh) C.spawn=function(){ var p = pr.t==='knock' ? L('f'+pr.h) : pr.t==='clerk' ? LOCS.station : L(pr.at||'lane'); return [p.x+0.6,p.z-(p.z>0?1:-1)*0.4,-Math.PI/2]; };
  STORY.victim.push(C); });

/* killer: other Octobers */
var CONN=[[[-70,0],[-76,-2]],[[-88,-13],[-101,-15.5]],[[-125,-15],[-125,8]]];
function zoneOf(x,z){ return x>-73?0 : x>-100?1 : z<4.5?2 : 3; }
function pathTo(a,b){
  var p=[], za=zoneOf(a[0],a[1]), zb=zoneOf(b[0],b[1]), k;
  if (za===0 && Math.abs(a[1])>3) p.push([a[0],a[1]>0?2:-2]);
  if (za<zb) for (k=za;k<zb;k++){ p.push(CONN[k][0]); p.push(CONN[k][1]); }
  else for (k=za-1;k>=zb;k--){ p.push(CONN[k][1]); p.push(CONN[k][0]); }
  if (zb===1 && b[0]<-90 && Math.abs(b[1])<8) p.push([-88,0]);
  if (zb===0 && Math.abs(b[1])>3) p.push([b[0],b[1]>0?2:-2]);
  p.push(b); return p;
}
var KGOALS=[
  {to:function(){ return [-93.5,0,4]; },txt:'get through on the station phone'},
  {to:function(){ return [-146,22.6,4]; },txt:'ring the chapel bell',bell:true},
  {to:function(){ return [SLIDE.x,SLIDE.z,8]; },txt:'call for help from the slide'},
  {to:function(){ return [69.6,1.6,7]; },txt:'climb the gate'},
  {to:function(){ return [CARSIDE.x,CARSIDE.z,9]; },txt:'get the old car started'},
  {to:function(){ return [GAZEBO.x+2,GAZEBO.z+2,6]; },txt:'light the bandstand beacon'},
  {to:function(){ return [STONE.x,STONE.z,5]; },txt:'lock themselves in the stone house'}
];
var KNAMES=['The First October','A Light Left On','The Paper Boy','Porch Swing','No Trick, No Treat','The Storm Door','Two Blocks Of Dark','The Phone Tree','Bandstand Dance','The New Family',
  'Station Wagon','The Dog Walker','Candle In The Window','The Dare','Lantern Parade','The Substitute','Cut Lines','Graveyard Shift','The Locksmith','Leaf Fire',
  'The Babysitter','Dead Battery','The Night Clerk','Kitchen Light','The Photograph','Bell Rope','The Surveyor','Thirteen Doors','Cold Engine','The Reporter',
  'Hollow Bones','The Last Bus','Chain And Padlock','The Twins','Static','The Preacher','Garage Light','The Long Walk','Candle Smoke','The Night Watch',
  'Fog On The Lane','The Tow Truck','Somebody’s Daughter','The Third Shift','Storm Warning','The Petition','Empty Swings','One Door Open','The Anniversary','This October'];
KNAMES.forEach(function(name,i){
  var yr=1979+Math.floor(i*0.92), who=(i*7+3)%NEIGHBOURS.length, run=Math.min(5.9,5.0+i*0.02), walk=3.1+Math.min(0.4,i*0.01), kind=i%5, C;
  var date='October 31, '+yr+'.';
  if (i===49){
    C=KChase(name,5.9,3.5,'Catch % before they get through the gate',function(){ return 22; },function(){ return [-86,0]; },function(){ return [[-70,0],[60,0],[69.6,1.6,5,'gate'],[78,0]]; },function(){ return [
      {cam:[-60,12,3],to:[-45,9,2],look:[10,2,0],text:'This October. The lane has learned nothing.'},
      {cam:[-84,2,6],to:[-86,2,5],look:[-92,1.5,0],text:'There is always one who runs for the gate.'}]; });
  } else if (kind===0){
    var n=2+(i%3);
    C=KTear(name,n,'Put the lane back in the dark. Tear out '+n+' generators',function(){ return [{cam:[20,12,3],to:[8,10,2],look:[-30,2,0],text:date+' They have their lights on again.'}]; },{begin:function(){ story.gens=0; surv.active=false; resident.g.visible=false; doorLight.intensity=0; allPower(true); }});
  } else if (kind===2){
    var hi=(i*5+1)%12, g=KGOALS[(i*3)%KGOALS.length];
    C=KDoor(name,run,walk,hi,g.txt,function(h){ var s=[h.x-6.6,h.z-h.side*10]; return pathTo(s,g.to()); },date+' One door on the lane is locked tighter than the rest.','He’s inside! Run!');
    if (g.bell) C.bellOnFail=true;
  } else if (kind===4){
    var spots=[{p:{x:-94,z:-9.4},lab:'Cutting the phone line',o:'Cut the station phone line again'},{p:{x:lamps[2].sx,z:lamps[2].sz},lab:'Breaking the streetlight',o:'Put out the middle streetlight'},{p:CARSIDE,lab:'Slashing the tires',o:'Slash the tires on the car at the end of the lane'},{p:CYGATE,lab:'Chaining the gate',o:'Chain the churchyard gate'},{p:LEVER,lab:'Jamming the gate box',o:'Jam the lock box at the gate'}], sp=spots[Math.floor(i/5)%spots.length];
    C=KHold(name,sp.p,6,sp.lab,sp.o,function(){ return [{cam:[sp.p.x+5,3,sp.p.z+6],to:[sp.p.x+3.4,2.3,sp.p.z+4.4],look:[sp.p.x,1.2,sp.p.z],text:date+' Before anyone on the lane wakes up, there is work to do.'}]; });
  } else {
    var from=kind===1 ? (i*5+2)%12 : -1, g2=KGOALS[(i*2+kind)%KGOALS.length];
    var startFn=function(){ if (from>=0) return front(houses[from]); var s=[[-88.4,0],[GAZEBO.x+3,GAZEBO.z+2],[-141,27],[60,0]][i%4]; return s; };
    C=KChase(name,run,walk,'Catch % before they '+g2.txt,function(){ return who; },startFn,function(){ return pathTo(startFn(),g2.to()); },function(){ var s=startFn(); return [
      {cam:[s[0]+5,2.6,s[1]+6],to:[s[0]+3.2,2.1,s[1]+4.2],look:[s[0],1.4,s[1]],text:date+' Somebody on Hollow Lane has decided not to stay inside.',fn:function(){ showResident(who); resident.g.position.set(s[0],groundY(s[0],s[1]),s[1]); resident.g.rotation.set(0,0.5,0); }}]; });
    if (g2.bell) C.bellOnFail=true;
  }
  if (i===0){ var oi=C.intro; C.intro=function(){ return [{cam:[-128,3,8],to:[-130,3.4,10],look:[-146,9,25],text:'By morning the lane is quiet. But Hollow Lane has had other Octobers.',fn:bell}].concat(oi()); }; }
  STORY.killer.push(C);
});

/* the people he hunts */
function spawnSurvivor(who,at,path){
  surv.pled=false; surv.active=true; surv.who=who; surv.x=at[0]; surv.z=at[1]; surv.path=path; surv.pi=0; surv.wait=0; surv.st=1; surv.tired=0; surv.lx=at[0]; surv.lz=at[1]; surv.acc=0; surv.jinkT=0;
  showResident(who); resident.g.position.set(surv.x,groundY(surv.x,surv.z),surv.z); resident.g.rotation.set(0,0,0);
  doorLight.intensity=1.5; doorLight.position.set(surv.x,1.3,surv.z);
}
function updateSurvivor(dt){
  if (!surv.active) return;
  var R=resident.g, dx=surv.x-P.x, dz=surv.z-P.z, d=Math.hypot(dx,dz)||0.01;
  if (d<1.35){
    surv.active=false; var deadName=NEIGHBOURS[surv.who].n;
    startFinisher(function(){ toast('Nobody heard '+deadName+'.',2600); var CC=CH()[story.ch]; if (CC.onCatch && CC.onCatch()){ resumePlay(); return; } completeChapter(); });
    return;
  }
  var wp=surv.path[surv.pi], gx=wp[0], gz=wp[1], gdx=gx-surv.x, gdz=gz-surv.z, gd=Math.hypot(gdx,gdz)||1, scared=d<13;
  if (scared && !surv.pled){ surv.pled=true; say(surv.who,['No! Stay away from me!','Somebody help! He\u2019s here!','Please. Please, no.','Get back! Get away!'][surv.who%4],2600); }
  if (gd<1.3){
    if (wp[2] && surv.wait<wp[2]){
      if (!scared){ surv.wait+=dt; residentAnim('Idle'); doorLight.position.set(surv.x,1.3,surv.z); if (wp[3]==='gate' && !game.gateOpening && surv.wait>wp[2]-1.7) openGate(); return; }
    } else {
      if (wp[3]==='gate' && !game.gateOpening) openGate();
      if (wp[3]==='fix'){ setPower(houses[wp[4]],true); moonLight.shadow.needsUpdate=true; tone(60,0.8,'sawtooth',0.1,95); toast('The lights come back on at one house.',2800); }
      surv.wait=0; surv.pi++;
      if (surv.pi>=surv.path.length){ surv.active=false; if (CH()[story.ch].bellOnFail) bell(); return finish(false); }
      return;
    }
  }
  var vx=gdx/gd, vz=gdz/gd;
  if (scared){ var k=(13-d)/13*1.6+0.4; vx+=dx/d*k; vz+=dz/d*k; var n=Math.hypot(vx,vz)||1; vx/=n; vz/=n; }
  if (surv.jinkT>0){ surv.jinkT-=dt; var c=Math.cos(1.35*surv.jink), s=Math.sin(1.35*surv.jink), tx=vx*c-vz*s; vz=vx*s+vz*c; vx=tx; }
  var running=(scared || d<30) && surv.tired<=0;
  if (running){ surv.st-=dt/7; if (surv.st<=0) surv.tired=4; } else { surv.st=Math.min(1,surv.st+dt/8); surv.tired-=dt; }
  var sp=running?cfg.run:cfg.walk, p={x:surv.x+vx*sp*dt, z:surv.z+vz*sp*dt};
  resolve(p,0.4); p.x=Math.max(-158,Math.min(game.gateOpen>0.75?80:71.6,p.x)); p.z=Math.max(-39.4,Math.min(39.4,p.z));
  surv.x=p.x; surv.z=p.z;
  surv.acc+=dt; if (surv.acc>0.7){ if (Math.hypot(surv.x-surv.lx,surv.z-surv.lz)<sp*0.7*0.3){ surv.jink=Math.random()<0.5?1:-1; surv.jinkT=1.1; } surv.lx=surv.x; surv.lz=surv.z; surv.acc=0; }
  R.position.set(surv.x,groundY(surv.x,surv.z),surv.z); turnTo(R,Math.atan2(vx,vz),dt);
  residentAnim(running?'Run':'Walk'); doorLight.position.set(surv.x,1.3,surv.z);
  var fear=Math.max(0,Math.min(1,(20-d)/18)); game.heart-=dt;
  if (fear>0 && game.heart<=0){ heartbeat(0.15+fear*0.3); game.heart=1.15-fear*0.75; }
}
function setupKiller(){
  vm.visible=false; vmKnife.visible=true; setLight(true); surv.active=false;
  stalker.g.visible=false; stalker.state='away'; stalker.timer=1e9;
}
function talkClerk(){
  P.stamina=1; P.spent=false;
  if (game.role==='victim' && CH()[story.ch].clerk) return completeChapter();
  say(game.clerk,'You still here? '+story.objText+'. Go on. And keep away from the windows.',5200);
}

/* ---------- blood and finishers ---------- */
var BN=700, bPos=new Float32Array(BN*3), bVel=new Float32Array(BN*3), bLife=new Float32Array(BN), bNext=0, bPts, pools=[], poolNext=0;
(function(){
  for (var i=0;i<BN;i++) bPos[i*3+1]=-50;
  var g=new THREE.BufferGeometry(); g.setAttribute('position',new THREE.BufferAttribute(bPos,3));
  var t=canvasTex(16,16,function(c){ c.fillStyle='#fff'; c.beginPath(); c.arc(8,8,7,0,7); c.fill(); });
  bPts=new THREE.Points(g,new THREE.PointsMaterial({map:t,color:lin(0x8a0808),size:0.065,transparent:true,alphaTest:.4,sizeAttenuation:true})); bPts.frustumCulled=false; scene.add(bPts);
  for (var p=0;p<24;p++){ var m=new THREE.Mesh(new THREE.CircleGeometry(1,22),new THREE.MeshBasicMaterial({color:lin(0x4a0508),transparent:true,opacity:.9,depthWrite:false})); m.rotation.x=-Math.PI/2; m.visible=false; m.userData.s=0; m.userData.to=0; scene.add(m); pools.push(m); }
  var c=document.createElement('canvas'); c.width=512; c.height=320; var x=c.getContext('2d');
  for (var k=0;k<46;k++){ var edge=Math.random()<0.75, px=edge?(Math.random()<.5?rand(0,120):rand(392,512)):rand(0,512), py=rand(0,320), r=rand(10,56);
    var gr=x.createRadialGradient(px,py,0,px,py,r); gr.addColorStop(0,'rgba(150,6,10,.95)'); gr.addColorStop(.6,'rgba(110,4,8,.8)'); gr.addColorStop(1,'rgba(90,0,0,0)'); x.fillStyle=gr; x.beginPath(); x.arc(px,py,r,0,7); x.fill();
    if (Math.random()<.5){ x.fillStyle='rgba(120,5,8,.8)'; x.fillRect(px-2,py,rand(3,7),rand(30,120)); } }
  try { $('gore').style.backgroundImage='url('+c.toDataURL()+')'; } catch(e){}
})();
function bloodBurst(x,y,z,dx,dz,n){
  for (var i=0;i<n;i++){ var k=(bNext++)%BN, o=k*3, sp=rand(0.6,3.6);
    bPos[o]=x+rand(-.08,.08); bPos[o+1]=y+rand(-.1,.1); bPos[o+2]=z+rand(-.08,.08);
    bVel[o]=dx*sp+rand(-1.3,1.3); bVel[o+1]=rand(0.4,3.8); bVel[o+2]=dz*sp+rand(-1.3,1.3); bLife[k]=rand(1.2,2.2); }
}
function bloodPool(x,y,z,size){ var m=pools[(poolNext++)%pools.length]; m.position.set(x,y+0.035,z); m.userData.s=0.08; m.userData.to=size||1; m.scale.setScalar(0.08); m.visible=true; }
function bloodTick(dt){
  for (var k=0;k<BN;k++){ if (bLife[k]<=0) continue; var o=k*3;
    if (bVel[o+1]!==0 || bPos[o+1]>0.05){ bVel[o+1]-=9.5*dt; bPos[o]+=bVel[o]*dt; bPos[o+1]+=bVel[o+1]*dt; bPos[o+2]+=bVel[o+2]*dt;
      var gy=indoorsView()?0:groundY(bPos[o],bPos[o+2]); if (bPos[o+1]<gy+0.03){ bPos[o+1]=gy+0.03; bVel[o]=bVel[o+1]=bVel[o+2]=0; bLife[k]=9; } }
    bLife[k]-=dt; if (bLife[k]<=0) bPos[o+1]=-50; }
  bPts.geometry.attributes.position.needsUpdate=true;
  for (var p=0;p<pools.length;p++){ var m=pools[p]; if (m.visible && m.userData.s<m.userData.to){ m.userData.s=Math.min(m.userData.to,m.userData.s+dt*0.45); m.scale.setScalar(m.userData.s); } }
}
function bloodClear(){ for (var k=0;k<BN;k++){ bLife[k]=0; bPos[k*3+1]=-50; } pools.forEach(function(m){ m.visible=false; }); $('gore').style.opacity=0; }
function gore(){ var el=$('gore'); el.style.transition='none'; el.style.opacity=0.92; setTimeout(function(){ el.style.transition='opacity 2.6s'; el.style.opacity=0; },380); }
function stabSound(){ noise(0.09,0.5,2600); noise(0.22,0.4,420); tone(210,0.16,'sawtooth',0.12,70); }
function scream(pitch){ tone(820*pitch,0.5,'sawtooth',0.1,330*pitch); tone(1230*pitch,0.4,'triangle',0.05,480*pitch); }
var fin=null;
function clamp01(v){ return Math.max(0,Math.min(1,v)); }
function startFinisher(done){
  var R=resident.g, S=stalker, dx=surv.x-P.x, dz=surv.z-P.z, d=Math.hypot(dx,dz)||1, ux=dx/d, uz=dz/d;
  var kx=surv.x-ux*1.0, kz=surv.z-uz*1.0, gy=groundY(surv.x,surv.z);
  S.mode=null; S.g.visible=true; S.g.position.set(kx,groundY(kx,kz),kz); S.g.rotation.y=Math.atan2(ux,uz); S.raise=0; setAnim('Idle');
  R.visible=true; R.position.set(surv.x,gy,surv.z); R.rotation.set(0,Math.atan2(-ux,-uz),0); residentAnim('Idle');
  fin={t:0,type:(story.finN=(story.finN||0)+1)%3,done:done,ux:ux,uz:uz,mx:(kx+surv.x)/2,mz:(kz+surv.z)/2,gy:gy,hit:0,pool:false,side:Math.random()<.5?1:-1,yaw:R.rotation.y,who:NEIGHBOURS[surv.who]};
  game.mode='finish'; setHud(false); setPrompt(null); $('safe').hidden=true; vmKnife.visible=false; vm.visible=false; torch.visible=true;
  $('cine').hidden=false; $('cineText').textContent=''; $('cineSkip').hidden=true; $('grain').hidden=true; $('fear').style.opacity=0;
  doorLight.intensity=2.2; doorLight.position.set(fin.mx,gy+2.2,fin.mz);
  sting(0.3,true); scream(fin.who.rig==='w'?1.25:0.8);
  eliasSays(['The lane remembers.','You should have stayed inside.','Every door closes once.'][fin.type]);
}
function finFrame(dt){
  var f=fin, S=stalker, R=resident.g, t=(f.t+=dt);
  var px=-f.uz*f.side, pz=f.ux*f.side, r=3.5-Math.min(t,2.4)*0.4;
  camera.position.set(f.mx+px*r+f.ux*0.5, f.gy+1.4+Math.min(t,2.4)*0.08, f.mz+pz*r+f.uz*0.5); cineLook.set(f.mx,f.gy+1.2,f.mz); camera.lookAt(cineLook);
  torch.position.copy(camera.position); torch.target.position.copy(cineLook);
  function hit(n,h,amt){ if (f.hit<n){ f.hit=n; bloodBurst(surv.x,f.gy+h,surv.z,f.ux,f.uz,amt||44); bloodBurst(surv.x,f.gy+h,surv.z,-f.ux*0.4,-f.uz*0.4,14); stabSound(); gore(); } }
  var fall=0, lift=0;
  if (f.type===0){                                        // the overhand
    S.raise = t<0.8 ? clamp01(t/0.5) : clamp01(1-(t-0.8)/0.09);
    if (t>0.88) hit(1,1.4,56); fall=clamp01((t-1.0)/0.45);
  } else if (f.type===1){                                 // two cuts
    S.raise = t<0.45 ? t/0.45 : t<0.56 ? 1-(t-0.45)/0.11 : t<0.95 ? (t-0.56)/0.39 : clamp01(1-(t-0.95)/0.11);
    if (t>0.55) hit(1,1.55,40); if (t>1.05) hit(2,1.15,50);
    if (t>0.55 && t<1.15) f.yaw+=dt*6; fall=clamp01((t-1.2)/0.45);
  } else {                                                // lifted off the ground
    lift = t<1.5 ? clamp01((t-0.15)/0.4)*0.5 : Math.max(0,0.5-(t-1.5)*3.5);
    S.raise = t<0.95 ? clamp01((t-0.2)/0.4)*0.55 : t<1.08 ? 1 : 0.55*clamp01(1-(t-1.5)/0.2);
    if (t>1.0) hit(1,1.9,48); if (t>1.7) hit(2,0.5,40); fall=clamp01((t-1.62)/0.35);
  }
  if (fall>0){ resident.dead=true; if (!f.pool){ f.pool=true; bloodPool(surv.x,f.gy,surv.z-0.7,1.15); } }
  R.rotation.set(-Math.PI/2*fall,f.yaw,0); R.position.y=f.gy+lift*(1-fall)+0.14*fall;
  if (t>2.9){
    var done=f.done; fin=null; S.g.visible=false; S.raise=0; doorLight.intensity=0;
    $('cine').hidden=true; $('cineSkip').hidden=false; $('grain').hidden=false; done();
  }
}

/* ---------- jump scares: the killer's face lunges into the lens ---------- */
var VHSGLITCH=0;
function shake(){ if (reduced) return; wrap.classList.remove('shake'); void wrap.offsetWidth; wrap.classList.add('shake'); }
var SCARE3D=(function(){
  var sc=new THREE.Scene(), head=new THREE.Group(), jaw=new THREE.Group(), hands=[], on=false, t=0, seed=0;
  sc.add(new THREE.AmbientLight(0x6a5050,0.9)); var key=new THREE.DirectionalLight(0xbfd0ff,0.5); key.position.set(0.4,1,0.6); sc.add(key);
  var red=new THREE.PointLight(0xff2a14,4,2.6,1.6); sc.add(red);
  var flash=new THREE.PointLight(0xfff4e0,0,3,1.4); sc.add(flash);
  // a cracked, stained mask
  var mt=canvasTex(128,160,function(g){ var gr=g.createRadialGradient(64,70,8,64,80,90); gr.addColorStop(0,'#f2ece0'); gr.addColorStop(.7,'#c9c1ad'); gr.addColorStop(1,'#6a6252'); g.fillStyle=gr; g.fillRect(0,0,128,160);
    for (var i=0;i<26;i++){ g.strokeStyle='rgba(30,20,14,'+(0.3+Math.random()*0.4)+')'; g.lineWidth=0.6+Math.random()*1.4; g.beginPath(); var x=Math.random()*128, y=Math.random()*160; g.moveTo(x,y); for (var k=0;k<6;k++){ x+=(Math.random()-.5)*22; y+=Math.random()*16; g.lineTo(x,y); } g.stroke(); }
    for (i=0;i<9;i++){ g.fillStyle='rgba(110,0,0,'+(0.4+Math.random()*0.5)+')'; g.fillRect(20+Math.random()*90,60+Math.random()*60,2+Math.random()*3,20+Math.random()*60); }
    for (i=0;i<400;i++){ g.fillStyle='rgba(0,0,0,'+Math.random()*0.2+')'; g.fillRect(Math.random()*128,Math.random()*160,1,1); } });
  var skin=new THREE.MeshStandardMaterial({map:mt,roughness:.85}), black=new THREE.MeshBasicMaterial({color:0x000000}), gum=new THREE.MeshStandardMaterial({color:lin(0x3a0606),roughness:.6}),
      tooth=new THREE.MeshStandardMaterial({color:lin(0xd8cfa8),roughness:.4}), cloth=new THREE.MeshStandardMaterial({color:lin(0x0c0c10),roughness:1}), blood=new THREE.MeshStandardMaterial({color:lin(0x6a0000),roughness:.2}),
      eye=new THREE.MeshBasicMaterial({color:0xfff6e8}), hand=new THREE.MeshStandardMaterial({color:lin(0x9a948a),roughness:.8});
  var sk=new THREE.SphereGeometry(0.16,16,14), pos=sk.attributes.position, v=new THREE.Vector3();
  for (var i=0;i<pos.count;i++){ v.fromBufferAttribute(pos,i); var n=1+Math.sin(v.x*41)*0.03+Math.sin(v.y*33+1)*0.04+Math.cos(v.z*29)*0.02; if (v.z>0.05 && v.y<-0.02) n*=0.93; pos.setXYZ(i,v.x*n,v.y*n*1.22,v.z*n*1.05); } sk.computeVertexNormals();
  var skull=new THREE.Mesh(sk,skin); head.add(skull);
  cloth.side=THREE.DoubleSide; var hood=new THREE.Mesh(new THREE.SphereGeometry(0.215,14,12,Math.PI/2+1.15,Math.PI*2-2.3,0,Math.PI*0.8),cloth); hood.rotation.x=-0.25; hood.position.set(0,0.03,-0.05); hood.scale.set(1,1.15,1); head.add(hood);
  [-1,1].forEach(function(sd){ var so=new THREE.Mesh(new THREE.SphereGeometry(0.048,10,8),black); so.scale.set(1.1,0.8,0.6); so.position.set(sd*0.058,0.035,0.138); head.add(so);
    var pu=new THREE.Mesh(new THREE.SphereGeometry(0.0085,6,5),eye); pu.position.set(sd*0.055,0.03,0.168); head.add(pu);
    for (var d=0;d<3;d++){ var dr=new THREE.Mesh(new THREE.BoxGeometry(0.009,0.05+d*0.03,0.006),blood); dr.position.set(sd*0.058+(d-1)*0.014,-0.02-d*0.015,0.158); head.add(dr); } });
  // the mouth: a black hole that opens, ringed with teeth
  jaw.position.set(0,-0.085,0.12); head.add(jaw);
  var hole=new THREE.Mesh(new THREE.SphereGeometry(0.06,12,8),black); hole.scale.set(1,0.55,0.45); jaw.add(hole);
  var lip=new THREE.Mesh(new THREE.TorusGeometry(0.058,0.012,6,14),gum); lip.scale.set(1,0.55,1); lip.position.z=0.012; jaw.add(lip);
  var teeth=[]; for (var k=0;k<12;k++){ var a=(k/12)*Math.PI*2, tt=new THREE.Mesh(new THREE.ConeGeometry(0.007,0.028+(k%3)*0.01,4),tooth); tt.position.set(Math.cos(a)*0.05,Math.sin(a)*0.05*0.55,0.02); tt.rotation.z=a+Math.PI/2; jaw.add(tt); teeth.push({m:tt,a:a}); }
  // hands reaching in from the bottom corners
  [-1,1].forEach(function(sd){ var g=new THREE.Group(); var palm=new THREE.Mesh(new THREE.BoxGeometry(0.09,0.03,0.1),hand); g.add(palm);
    for (var f=0;f<4;f++){ var fg=new THREE.Group(); fg.position.set(-0.033+f*0.022,0,0.05); g.add(fg); var p1=new THREE.Mesh(new THREE.BoxGeometry(0.015,0.015,0.06),hand); p1.position.z=0.03; fg.add(p1); var p2=new THREE.Mesh(new THREE.BoxGeometry(0.013,0.013,0.05),hand); p2.position.set(0,-0.012,0.07); p2.rotation.x=0.8; fg.add(p2); var nl=new THREE.Mesh(new THREE.BoxGeometry(0.012,0.004,0.014),blood); nl.position.set(0,-0.03,0.09); fg.add(nl); fg.rotation.x=0.5; }
    var arm=new THREE.Mesh(new THREE.BoxGeometry(0.07,0.07,0.5),cloth); arm.position.z=-0.29; g.add(arm); sc.add(g); hands.push({g:g,sd:sd}); });
  sc.add(head);
  head.traverse(function(o){ if (o.isMesh) o.frustumCulled=false; }); hands.forEach(function(hh){ hh.g.traverse(function(o){ if (o.isMesh) o.frustumCulled=false; }); });
  head.visible=false; hands.forEach(function(hh){ hh.g.visible=false; });
  var q=new THREE.Quaternion(), fw=new THREE.Vector3(), up=new THREE.Vector3(), rt2=new THREE.Vector3(), tmp=new THREE.Vector3(), eul=new THREE.Euler();
  function place(obj,dist,ox,oy){ camera.getWorldDirection(fw); up.set(0,1,0).applyQuaternion(camera.quaternion); rt2.set(1,0,0).applyQuaternion(camera.quaternion);
    obj.position.copy(camera.position).addScaledVector(fw,dist).addScaledVector(rt2,ox).addScaledVector(up,oy); obj.quaternion.copy(camera.quaternion); }
  function start(){ on=true; t=0; seed=Math.random()*10; head.visible=true; hands.forEach(function(hh){ hh.g.visible=true; }); }
  function tick(dt){ if (!on) return; t+=dt; var D=1.45;
    if (t>D){ on=false; head.visible=false; hands.forEach(function(hh){ hh.g.visible=false; }); red.intensity=0; flash.intensity=0; return; }
    // lunge, a jerk back, then a second lunge right into the lens
    var dist = t<0.1 ? 1.7-1.32*(1-Math.pow(1-t/0.1,3)) : (t<0.42 ? 0.38+Math.sin((t-0.1)*30)*0.012 : (t<0.52 ? 0.38+(t-0.42)*1.5 : Math.max(0.27,0.53-(t-0.52)*3)));
    var sh=reduced?0:(t<0.08?0:0.022), j=Math.sin(t*90+seed)*sh, j2=Math.cos(t*77+seed*2)*sh;
    place(head,dist,j+Math.sin(t*9)*0.01,-0.03+j2);
    eul.set(Math.sin(t*31)*0.12*(sh?1:0), Math.sin(t*23+seed)*0.1*(sh?1:0), Math.sin(t*13)*0.35*(sh?1:0)+(t>0.42&&t<0.55?0.6:0)); q.setFromEuler(eul); head.quaternion.multiply(q);
    var op=Math.min(1,Math.max(0,(t-0.06)/0.25)); jaw.scale.set(1+op*0.3,0.6+op*1.6+Math.sin(t*60)*0.12*op,1); teeth.forEach(function(T){ T.m.position.set(Math.cos(T.a)*0.05*(1+op*0.3),Math.sin(T.a)*0.05*0.55*(0.6+op*1.6),0.02); });
    hands.forEach(function(hh,i){ var k=Math.min(1,Math.max(0,(t-0.18-i*0.05)/0.22)); k=1-Math.pow(1-k,3); place(hh.g,0.55-k*0.25,hh.sd*(0.42-k*0.2),-0.38+k*0.14); eul.set(-0.3,hh.sd*-0.5,hh.sd*0.4); q.setFromEuler(eul); hh.g.quaternion.multiply(q); });
    // light: a red glow from below, and a strobe like a dying flashlight
    tmp.set(0,-0.25,0.18).applyQuaternion(head.quaternion).add(head.position); red.position.copy(tmp); red.intensity=3.5+Math.random()*2;
    flash.position.copy(camera.position); flash.intensity=(Math.sin(t*70)>0.3 || t<0.1)?2.6:0.15;
    VHSGLITCH=Math.max(VHSGLITCH,t<0.1?0.5:(t>1.2?1.5:0.8)); }
  return {scene:sc,start:start,tick:tick,isOn:function(){ return on; }};
})();
function scareSound(){
  if (!AC) return;
  noise(0.5,1.0,2600); noise(0.9,0.6,700); tone(38,1.4,'sine',0.9,24); tone(60,0.6,'square',0.25,30);
  [880,1244,1318,1865,1975,2793,3320].forEach(function(f,i){ tone(f,0.9,'sawtooth',0.22/(i+1.2),f*1.35); tone(f*1.012,0.9,'square',0.08/(i+1.5),f*0.7,0.05); });
  [0.18,0.42,0.7].forEach(function(w){ tone(520,0.35,'sawtooth',0.22,1900,w); noise(0.2,0.6,4200,w); });
  tone(4100,2.6,'sine',0.05,3900,0.9);
}
function jumpFace(){
  if (SCARE3D.isOn()) return; SCARE3D.start(); scareSound(); shake(); VHSGLITCH=1.2;
  try { if (navigator.vibrate) navigator.vibrate([220,60,320,60,160]); } catch(e){}
  // a single white frame as it hits, and black as the tape cuts out
  var el=$('scareFx'); if (!el) return; var img=el.firstElementChild; if (img) img.style.opacity=0;
  [[95,'#fff',1],[140,'#fff',0],[1400,'#000',1],[1650,'#000',0]].forEach(function(s){ setTimeout(function(){ el.hidden=false; el.style.transition='none'; el.style.background=s[1]; el.style.opacity=s[2]; if (!s[2]) setTimeout(function(){ if (el.style.opacity==='0') el.hidden=true; },30); },s[0]); });
}
function scareAhead(){
  var S=stalker; if (S.mode || shelter || (S.g.visible && S.state!=='away')) return false;
  var f=fwd(), x=P.x+f.x*1.9, z=P.z+f.z*1.9; if (blocked(x,z,0.3)) return false;
  S.g.visible=true; S.g.position.set(x,groundY(x,z),z); S.g.rotation.y=Math.atan2(-f.x,-f.z); S.raise=1; setAnim('Idle');
  S.state='away'; S.timer=Math.max(S.timer,8); S.scare=0.42; scareSound(); shake(); return true;
}

/* ---------- killer skins ---------- */
var KSKINS=[
  {n:'Elias',p:0,top:0x1c2533,bot:0x1c2533,mask:'pale',hat:0x30261e},
  {n:'The Butcher',p:150,top:0x6a1410,bot:0x2a1a14,mask:'red',hat:null},
  {n:'Scarecrow',p:200,top:0x5a4a2a,bot:0x3a3020,mask:'sack',hat:0x3a2e1a},
  {n:'Bone Man',p:250,top:0x18181a,bot:0x18181a,mask:'skull',hat:null},
  {n:'Porcelain',p:300,top:0xd8d2c4,bot:0x8a8478,mask:'doll',hat:null},
  {n:'Night Shift',p:400,top:0x0c0c0e,bot:0x0c0c0e,mask:'shadow',hat:0x0c0c0e}];
var kMaskMats={};
function kMaskMat(type){
  if (type==='pale') return maskM; if (kMaskMats[type]) return kMaskMats[type];
  var t=canvasTex(128,128,function(g,w,h){ var i;
    if (type==='sack'){ g.fillStyle='#8a6a3e'; g.fillRect(0,0,w,h); g.strokeStyle='rgba(60,40,20,.5)'; g.lineWidth=1; for (i=0;i<128;i+=3){ g.beginPath(); g.moveTo(i,0); g.lineTo(i,h); g.stroke(); g.beginPath(); g.moveTo(0,i); g.lineTo(w,i); g.stroke(); }
      g.fillStyle='#050403'; g.beginPath(); g.ellipse(46,60,9,8,0,0,7); g.ellipse(82,60,9,8,0,0,7); g.fill(); g.strokeStyle='#2a1a0e'; g.lineWidth=3; g.beginPath(); g.moveTo(40,92); for (i=0;i<6;i++){ g.lineTo(46+i*8,i%2?88:96); } g.stroke(); }
    else if (type==='skull'){ g.fillStyle='#e6e0cc'; g.fillRect(0,0,w,h); g.fillStyle='#060505'; g.beginPath(); g.ellipse(45,58,14,13,0,0,7); g.ellipse(83,58,14,13,0,0,7); g.fill();
      g.beginPath(); g.moveTo(64,72); g.lineTo(57,86); g.lineTo(71,86); g.fill(); for (i=0;i<7;i++) g.fillRect(42+i*7,100,4,12); }
    else if (type==='doll'){ var gr=g.createRadialGradient(64,56,8,64,64,74); gr.addColorStop(0,'#fbf6ee'); gr.addColorStop(1,'#d8cfc2'); g.fillStyle=gr; g.fillRect(0,0,w,h);
      g.fillStyle='rgba(230,110,120,.45)'; g.beginPath(); g.ellipse(36,80,10,6,0,0,7); g.ellipse(92,80,10,6,0,0,7); g.fill();
      g.fillStyle='#0a0808'; g.beginPath(); g.ellipse(46,58,8,9,0,0,7); g.ellipse(82,58,8,9,0,0,7); g.fill(); g.fillStyle='#8a1a2a'; g.beginPath(); g.ellipse(64,96,7,4,0,0,7); g.fill();
      g.strokeStyle='#3a3430'; g.lineWidth=1.5; g.beginPath(); g.moveTo(80,10); g.lineTo(74,34); g.lineTo(84,44); g.lineTo(78,58); g.stroke(); }
    else if (type==='red'){ g.fillStyle='#8a1612'; g.fillRect(0,0,w,h); g.fillStyle='rgba(0,0,0,.25)'; for (i=0;i<40;i++) g.fillRect(Math.random()*128,Math.random()*128,2,6);
      g.fillStyle='#050303'; g.beginPath(); g.moveTo(30,56); g.quadraticCurveTo(46,44,58,60); g.quadraticCurveTo(44,66,30,56); g.fill(); g.beginPath(); g.moveTo(98,56); g.quadraticCurveTo(82,44,70,60); g.quadraticCurveTo(84,66,98,56); g.fill();
      g.fillRect(52,96,24,3); }
    else { g.fillStyle='#0a0a0c'; g.fillRect(0,0,w,h); g.fillStyle='#ff2a1a'; g.beginPath(); g.ellipse(46,60,7,4,0,0,7); g.ellipse(82,60,7,4,0,0,7); g.fill(); } });
  var m=new THREE.MeshStandardMaterial({map:t,roughness:type==='doll'?.3:.75,side:THREE.DoubleSide,emissive:type==='shadow'?new THREE.Color(1,1,1):lin(0x1c1c18),emissiveMap:type==='shadow'?t:null,emissiveIntensity:type==='shadow'?0.9:1});
  return kMaskMats[type]=m;
}
function kSkin(i){ i=num(i,0)|0; return KSKINS[i]||KSKINS[0]; }
function skinKiller(m,ks){
  var K=kSkin(ks);
  m.traverse(function(o){ if (!o.isMesh) return; var n=o.material.name||''; if (/Wolf3D_(Outfit|Headwear)/.test(n) || /Wolf3D_(Outfit|Headwear)/.test(o.userData.mn||'')){ o.userData.mn=o.userData.mn||n; o.material=o.material.clone(); o.material.name=o.userData.mn; var mn=o.userData.mn;
      if (/Top/.test(mn)) o.material.color.copy(lin(K.top)); else if (/Bottom/.test(mn)) o.material.color.copy(lin(K.bot)); else if (/Headwear/.test(mn)){ o.visible=K.hat!==null; if (K.hat!==null) o.material.color.copy(lin(K.hat)); } } });
  return K;
}

/* ---------- Kill Feast: the 8-second kill ---------- */
var KILLS=[{n:'Overhand',p:0},{n:'Two Cuts',p:250},{n:'The Lift',p:350},{n:'Frenzy',p:450},{n:'Execution',p:600}];
var finRigs={};
function finRig(ks){ ks=ks|0; var r=finRigs[ks]; if (r) return r; if (!NETTPL.k) return null; var rig=makeNetRig('k',null,ks); if (!rig) return null;
  r={g:new THREE.Group(),rig:rig,arm:rig.m.getObjectByName('RightArm'),head:rig.m.getObjectByName('Head')}; rig.m.traverse(function(o){ if (o.userData && o.userData.blade) r.blade=o.userData.blade; }); r.g.add(rig.m); r.g.visible=false; scene.add(r.g); return finRigs[ks]=r; }
function startNetFinisher(q){
  var N=net, K=finRig(SAVE.kskin); if (!K) return;
  var dx=q.x-P.x, dz=q.z-P.z, d=Math.hypot(dx,dz)||1, ux=dx/d, uz=dz/d, up=(q.y||0)>0.3, gy=up?q.y:groundY(q.x,q.z);
  var type=Math.max(0,Math.min(KILLS.length-1,SAVE.kill|0));
  N.fin={t:0,type:type,q:q,x:q.x,z:q.z,ux:ux,uz:uz,gy:gy,K:K,hit:0,pool:false,side:Math.random()<.5?1:-1,yaw:Math.atan2(-ux,-uz),raise:0,sx:P.x,sz:P.z};
  var sk=q.bot?(q.bot.sk|0):skinIdx(q); showResident(sk); resident.dead=false;
  var vr=NEIGHBOURS[sk].rig==='m'?resident.man:resident.woman; N.fin.vm=vr?vr.mats.map(function(e){ return {m:e.mat,c:e.mat.color.clone()}; }):[]; N.fin.blood=0; N.fin.flinch=0; if (K.blade){ K.bladeC=K.bladeC||K.blade.material.color.clone(); K.blade.material.color.copy(K.bladeC); }
  resident.g.position.set(q.x,gy,q.z); resident.g.rotation.set(0,N.fin.yaw,0); residentAnim('Idle');
  K.g.visible=true; K.g.position.set(q.x-ux*2.2,up?gy:groundY(q.x-ux*2.2,q.z-uz*2.2),q.z-uz*2.2); N.fin.up=up; K.g.rotation.set(0,Math.atan2(ux,uz),0); anim(K.rig,'Walk');
  setHud(false); setPrompt(null); $('safe').hidden=true; $('items').hidden=true; $('senseBtn').hidden=true; $('scareBtn').hidden=true; $('vanishBtn').hidden=true; $('btnSwing').hidden=true; $('team').hidden=true; vmKnife.visible=false;
  $('cine').hidden=false; $('cineText').textContent=KILLS[type].n; $('cineSkip').hidden=true; $('grain').hidden=true;
  doorLight.intensity=2.4; doorLight.position.set(q.x,gy+2.4,q.z); sting(0.3,true); scream(NEIGHBOURS[sk].rig==='w'?1.25:0.8);
}
var FINAL=[0.88,1.05,1.7,1.28,1.66];
function netFinFrame(dt,PV){
  var N=PV||net, f=N.fin, K=f.K, R=resident.g, ux=f.ux, uz=f.uz, i, tf=2.4+FINAL[f.type]; if (f.t>tf-0.12 && f.t<tf+0.45) dt*=0.35;
  var t=(f.t+=dt);
  if (!PV){ ['safe','items','senseBtn','scareBtn','vanishBtn','btnSwing','team','objective'].forEach(function(id){ $(id).hidden=true; }); vmKnife.visible=false; vmL.visible=false; }
  // camera: wide slow orbit, then in close for the kill, then low over the body
  var orbit=f.side*(0.6+t*0.16), rad=t<2.2?4.2-t*0.35:(t<5.2?2.9:2.9-(t-5.2)*0.35), hy=t<5.2?1.45:1.45-(t-5.2)*0.22;
  if (PV){ orbit=1.9+Math.sin(t*0.4)*0.35; rad=Math.max(rad,3.4); hy=Math.max(hy,1.2); }
  var cx=f.x-ux*0.5, cz=f.z-uz*0.5;
  camera.position.set(cx+Math.cos(orbit)*rad, f.gy+hy, cz+Math.sin(orbit)*rad); cineLook.set(cx,f.gy+(t<5.2?1.15:0.5),cz); camera.lookAt(cineLook); if (PV && camera.aspect>=0.9) camera.rotateY(-0.42);
  torch.position.copy(camera.position); torch.target.position.copy(cineLook);
  function hit(n,h,amt){ if (f.hit<n){ f.hit=n; var bx=R.position.x, bz=R.position.z;
      bloodBurst(bx,f.gy+h,bz,ux,uz,(amt||44)*2); bloodBurst(bx,f.gy+h,bz,-ux*0.5,-uz*0.5,30); bloodBurst(bx,f.gy+h+0.2,bz,-uz,ux,24); bloodBurst(bx,f.gy+h+0.2,bz,uz,-ux,24);
      bloodPool(bx+ux*(0.5+n*0.25)+(Math.random()-.5)*0.6,f.gy,bz+uz*(0.5+n*0.25)+(Math.random()-.5)*0.6,0.35+Math.random()*0.3);
      stabSound(); noise(0.12,0.35,500); if (!PV){ gore(); shake(); } scream((f.vm.length&&R.scale.y<0.98)?1.2:0.9);
      f.blood=Math.min(1,(f.blood||0)+0.3); f.flinch=1; if (K.blade) K.blade.material.color.lerp(lin(0x5a0606),0.45); } }
  // 0-2.2 s: he closes in while they back away
  var kd=t<2.2 ? 2.2-t*0.55 : (t<2.4?1.0:Math.max(0.62,1.0-(t-2.4)*1.2)), back=t<2.2 ? t*0.18 : 0.4+(f.flinch||0)*0.06;
  var vx=f.x+ux*back, vz=f.z+uz*back; R.position.x=vx; R.position.z=vz;
  K.g.position.set(vx-ux*kd,f.up?f.gy:groundY(vx-ux*kd,vz-uz*kd),vz-uz*kd); anim(K.rig,t<2.2?'Walk':'Idle'); if (K.rig.actions.Walk) K.rig.actions.Walk.timeScale=0.6;
  if (t<2.2 && Math.floor(t*1.6)!==Math.floor((t-dt)*1.6)) residentAnim('Walk');
  // 2.4-5.2 s: the kill itself
  var a=t-2.4, raise=0, fall=0, lift=0, kneel=0;
  if (a>0){
    if (f.type===0){ raise=a<0.8?clamp01(a/0.5):clamp01(1-(a-0.8)/0.09); if (a>0.88) hit(1,1.4,56); fall=clamp01((a-1.1)/0.6); }
    else if (f.type===1){ raise=a<0.45?a/0.45:a<0.56?1-(a-0.45)/0.11:a<0.95?(a-0.56)/0.39:clamp01(1-(a-0.95)/0.11); if (a>0.55) hit(1,1.55,40); if (a>1.05) hit(2,1.15,50); if (a>0.55 && a<1.15) f.yaw+=dt*6; fall=clamp01((a-1.3)/0.6); }
    else if (f.type===2){ lift=a<1.5?clamp01((a-0.15)/0.4)*0.5:Math.max(0,0.5-(a-1.5)*3.5); raise=a<0.95?clamp01((a-0.2)/0.4)*0.55:a<1.08?1:0.55*clamp01(1-(a-1.5)/0.2); if (a>1.0) hit(1,1.9,48); if (a>1.7) hit(2,0.5,40); fall=clamp01((a-1.7)/0.45); }
    else if (f.type===3){ var ph=Math.min(4,Math.floor(a/0.32)), pp=(a%0.32)/0.32; raise=a<1.4?(pp<0.5?pp*2:2-pp*2):0; for (i=1;i<=ph && i<=4;i++) hit(i,1.1+((i*37)%5)*0.12,34); fall=clamp01((a-1.5)/0.5); }
    else { kneel=clamp01(a/0.5); raise=a<0.6?0:a<1.6?clamp01((a-0.6)/0.7):clamp01(1-(a-1.6)/0.08); if (a>1.66) hit(1,1.0,70); fall=clamp01((a-1.9)/0.5); }
  }
  if (fall>0){ resident.dead=true; if (!f.pool){ f.pool=true; bloodPool(vx+ux*0.6,f.gy,vz+uz*0.6,1.6); } }
  f.flinch=Math.max(0,(f.flinch||0)-dt*4);
  (f.vm||[]).forEach(function(e){ e.m.color.copy(e.c).lerp(lin(0x6a0808),(f.blood||0)*0.55); });
  var tw=fall>=1 ? Math.exp(-(t-tf-0.6)*1.6)*Math.sin(t*34)*0.05 : 0;
  if (fall>=1){ f.bl=(f.bl||0)-dt; if (f.bl<=0 && t<7.4){ f.bl=0.35; bloodBurst(vx+ux*0.5,f.gy+0.25,vz+uz*0.5,(Math.random()-.5)*0.3,(Math.random()-.5)*0.3,10); } if (!f.pool2 && t>6){ f.pool2=true; bloodPool(vx+ux*0.7,f.gy,vz+uz*0.7,2.3); } }
  R.rotation.set(-Math.PI/2*fall+kneel*0.25*(1-fall)-(f.flinch||0)*0.18*(1-fall),f.yaw,tw+(f.flinch||0)*0.22*f.side*(1-fall)); R.position.y=f.gy+lift*(1-fall)+0.14*fall-kneel*0.42*(1-fall);
  K.rig.mixer.update(dt); if (K.arm && raise>0) K.arm.rotateX(RAISE[0]*raise);
  if (t>5.4 && K.head) K.head.rotateZ(0.3*clamp01((t-5.4)/0.8));        // he tilts his head over the body
  if (t>=8 && PV){ (f.vm||[]).forEach(function(e){ e.m.color.copy(e.c); }); f.blood=0; f.pool2=false; if (K.blade && K.bladeC) K.blade.material.color.copy(K.bladeC); f.t=0; f.hit=0; f.pool=false; f.yaw=Math.atan2(-ux,-uz); resident.dead=false; residentAnim('Idle'); return; }
  if (t>=8){ (f.vm||[]).forEach(function(e){ e.m.color.copy(e.c); }); N.fin=null; K.g.visible=false; resident.g.visible=false; resident.dead=false; doorLight.intensity=0;
    $('cine').hidden=true; $('cineSkip').hidden=false; $('grain').hidden=false; setHud(true); vmKnife.visible=true; P.x=f.sx; P.z=f.sz; }
}

/* ---------- Kill Feast: houses, chatting, hiding, police ---------- */
var JAIL={x:-92.6,z:-34,x0:-95.4,x1:-89.9,z0:-36.5,z1:-31.9}, RELEASE={x:-81,z:-23.5};
var COP={n:'Officer',rig:'m',top:0x1a2a4a,bottom:0x141c2c,hair:0x2a2420,beard:false,skin:0xd8b8a0,s:1.06,hand:0xc99a7c,look:{hd:'cap',hatc:0x0e1a33,w:1.06}};
var OUTHIDES=[];
// ---- map additions: police station, bus, dumpsters, phone booth, picnic tables
(function(){
  var wallM=new THREE.MeshStandardMaterial({map:rep(concreteTex,4,1),color:lin(0xc8ccd4),roughness:.9}), darkM=mat(0x16181c,{roughness:.5}), blueM=mat(0x1c3a7a,{roughness:.6});
  var barM=mat(0x55585e,{roughness:.35,metalness:.7}), floorM=new THREE.MeshStandardMaterial({map:rep(concreteTex,5,4),color:lin(0x8a8e94),roughness:.8});
  function sb(w,h,d,m,x,y,z,col){ var b=box(w,h,d,m,x,y,z); if (col) addBox(x,z,w/2,d/2); return b; }
  sb(19,0.06,11,floorM,-86.5,0.03,-31.5);
  sb(19,3.4,0.25,wallM,-86.5,1.7,-37,true); sb(0.25,3.4,11,wallM,-96,1.7,-31.5,true); sb(0.25,3.4,11,wallM,-77,1.7,-31.5,true);
  sb(13.5,3.4,0.25,wallM,-89.25,1.7,-26,true); sb(2.5,3.4,0.25,wallM,-78.25,1.7,-26,true); sb(3,0.8,0.25,wallM,-81,3.0,-26);
  sb(19.6,0.3,11.6,darkM,-86.5,3.55,-31.5); sb(19.8,0.4,0.4,blueM,-86.5,3.9,-25.8);
  var signT=canvasTex(512,96,function(g){ g.fillStyle='#1c3a7a'; g.fillRect(0,0,512,96); g.fillStyle='#f4f6fa'; g.font='bold 56px Georgia,serif'; g.textAlign='center'; g.textBaseline='middle'; g.fillText('POLICE',256,52); });
  var sign=new THREE.Mesh(new THREE.PlaneGeometry(5,0.95),new THREE.MeshBasicMaterial({map:signT})); sign.position.set(-81,4.4,-25.85); world.add(sign);
  halo(0x3a6aff,2.2,-83.2,3.0,-25.6,world,.9); halo(0x3a6aff,2.2,-78.8,3.0,-25.6,world,.9);
  sb(2.4,1.0,0.9,mat(0x5a4632,{roughness:.6}),-83,0.5,-30,true); sb(0.5,0.4,0.4,darkM,-83.4,1.2,-30); sb(0.04,0.3,0.4,glow(0x9ad0ff),-83.17,1.25,-30);
  sb(3,0.05,0.8,glow(0xf0f4ff),-84,3.36,-29); sb(3,0.05,0.8,glow(0xf0f4ff),-84,3.36,-34);
  // the cell
  for (var i=0;i<=22;i++){ var z=-36.9+i*0.24; cyl(0.03,0.03,3.3,6,barM,-89.6,1.65,z); }
  for (var j=0;j<=25;j++){ var x=-95.9+j*0.25; cyl(0.03,0.03,3.3,6,barM,x,1.65,-31.7); }
  addBox(-89.6,-34.3,0.06,2.7); addBox(-92.75,-31.7,3.15,0.06);
  sb(2.0,0.45,0.8,mat(0x5a5e66),-94.4,0.25,-36.2); sb(1.0,0.1,0.6,mat(0xd8d2c4),-94.4,0.5,-36.2);
  sb(0.6,3.1,0.08,mat(0xeeeeea),-95.8,1.55,-33.6);
  // school bus on the shoulder
  var busY=mat(0xe0a818,{roughness:.6}), glassM=mat(0x1a2430,{roughness:.1,metalness:.3});
  // phone booth by the station
  sb(0.9,2.3,0.9,mat(0x8a1a16,{roughness:.5}),-75.8,1.15,-27.5,true); sb(0.7,1.5,0.92,glassM,-75.8,1.35,-27.5);
  halo(0xfff0d0,1.0,-75.8,2.4,-27.5,world,.7);
  function free(x,z,r){ for (var k=0;k<14;k++){ var a=k*2.4, d=k*0.7, xx=x+Math.cos(a)*d, zz=z+Math.sin(a)*d; if (!blocked(xx,zz,r)) return [xx,zz]; } return null; }
  // dumpsters you can hide in
  [[-96.5,-15],[38,-30],[-30,30.5],[100,30.5]].forEach(function(p){ var f=free(p[0],p[1],1.6); if (!f) return;
    var g=new THREE.Group(); g.position.set(f[0],0,f[1]); world.add(g); box(2.0,1.25,1.2,mat(0x2a4a3a,{roughness:.6,metalness:.2}),0,0.65,0,g); box(2.05,0.08,1.25,mat(0x1a2a22),0,1.31,0,g).rotation.x=0.06;
    addBox(f[0],f[1],1.0,0.6); OUTHIDES.push({id:'dump'+OUTHIDES.length,in:0,f:0,x:f[0],z:f[1]+1.0,r:1.2,t:'Hide in the dumpster',cam:[f[0],0.95,f[1]],yaw:Math.PI}); });
  // picnic tables in the park
  [].forEach(function(p){ var f=free(p[0],p[1],1.4); if (!f) return; var wm=mat(0x6a4a30,{roughness:.8});
    box(1.8,0.08,0.8,wm,f[0],0.75,f[1]); box(1.8,0.06,0.3,wm,f[0],0.45,f[1]-0.6); box(1.8,0.06,0.3,wm,f[0],0.45,f[1]+0.6); addBox(f[0],f[1],0.9,0.75); });
  world.traverse(function(o){ if (o.isMesh && o.material.isMeshStandardMaterial && !o.material.transparent && !o.castShadow){ o.castShadow=true; o.receiveShadow=true; } });
  moonLight.shadow.needsUpdate=true;
})();
/* ---------- the east side, past the old gate: a hospital and a supermarket (removed) ---------- */
var BLD=[], NAVL=[], __eastM=secMark();
function mergeGeos(gs){ var n=0, ni=0; gs.forEach(function(g){ n+=g.attributes.position.count; ni+=g.index.count; });
  var pos=new Float32Array(n*3), nor=new Float32Array(n*3), uv=new Float32Array(n*2), idx=new (n>65535?Uint32Array:Uint16Array)(ni), o=0, oi=0;
  gs.forEach(function(g){ var c=g.attributes.position.count, ix=g.index.array; pos.set(g.attributes.position.array,o*3); nor.set(g.attributes.normal.array,o*3); uv.set(g.attributes.uv.array,o*2);
    for (var i=0;i<ix.length;i++) idx[oi+i]=ix[i]+o; o+=c; oi+=ix.length; });
  var G=new THREE.BufferGeometry(); G.setAttribute('position',new THREE.BufferAttribute(pos,3)); G.setAttribute('normal',new THREE.BufferAttribute(nor,3)); G.setAttribute('uv',new THREE.BufferAttribute(uv,2)); G.setIndex(new THREE.BufferAttribute(idx,1)); G.computeBoundingSphere(); return G; }
// collects boxes per material and turns them into one mesh each, so a whole building is a handful of draw calls
function MB(){ this.m=[]; this.g=[]; }
MB.prototype.box=function(w,h,d,m,x,y,z,ry){ var g=new THREE.BoxGeometry(w,h,d), ts=m.userData.ts;
  if (ts){ var uv=g.attributes.uv.array, dims=[[d,h],[d,h],[w,d],[w,d],[w,h],[w,h]]; for (var f=0;f<6;f++) for (var v=0;v<4;v++){ var k=(f*4+v)*2; uv[k]*=dims[f][0]/ts; uv[k+1]*=dims[f][1]/ts; } }
  if (ry) g.rotateY(ry); g.translate(x,y,z); var i=this.m.indexOf(m); if (i<0){ this.m.push(m); this.g.push([]); i=this.m.length-1; } this.g[i].push(g); };
MB.prototype.flush=function(parent){ for (var i=0;i<this.m.length;i++){ var mesh=new THREE.Mesh(mergeGeos(this.g[i]),this.m[i]); mesh.castShadow=!this.m[i].isMeshBasicMaterial && !this.m[i].transparent; mesh.receiveShadow=!this.m[i].isMeshBasicMaterial; parent.add(mesh); this.g[i].forEach(function(g){ g.dispose(); }); } this.m=[]; this.g=[]; };
function tiled(m,ts){ m.userData.ts=ts; return m; }
// floors and stairs in the big buildings
function bldIn(x,z){ for (var i=0;i<BLD.length;i++){ var B=BLD[i]; if (x>B.x0 && x<B.x1 && z>B.z0 && z<B.z1) return B; } return null; }
function bldAt(x,z){ for (var i=0;i<BLD.length;i++){ var B=BLD[i]; if (x>B.x0-0.3 && x<B.x1+0.3 && z>B.z0-0.3 && z<B.z1+0.3) return B; } return null; }
function stY(s,x){ var t=Math.max(0,Math.min(1,(x-s.xa)/(s.xb-s.xa))); return (s.lo+t)*s.H; }
function onStair(B,x,z,y){ for (var i=0;i<B.stairs.length;i++){ var s=B.stairs[i]; if (z>s.z0 && z<s.z1 && x>Math.min(s.xa,s.xb) && x<Math.max(s.xa,s.xb) && Math.abs(stY(s,x)-y)<0.8) return s; } return null; }
// keeps a body outdoors (or in one of the big buildings) out of the walls and on the right floor
function lvFix(e,r){
  var B=bldAt(e.x,e.z), y=e.y||0;
  if (!B || B.n<2){ resolve(e,r); e.y=0; e.lv=0; return; }
  var s=onStair(B,e.x,e.z,y);
  if (s){ resolve(e,r,s.walls); e.z=Math.max(s.z0+r,Math.min(s.z1-r,e.z)); e.y=stY(s,e.x); e.lv=Math.round(e.y/B.H); return; }
  var lv=Math.max(0,Math.min(B.n-1,Math.round(y/B.H))); resolve(e,r,lv?B.cols[lv]:null); e.y=lv*B.H; e.lv=lv;
}
// which room something is in, for finding the way through doors and up stairs
function navRoom(e){ var B=bldAt(e.x,e.z); if (!B || e.x<B.x0 || e.x>B.x1 || e.z<B.z0 || e.z>B.z1) return 'OUT'; var lv=Math.max(0,Math.min(B.n-1,Math.round((e.y||0)/B.H))), R=B.rooms[lv], best=null, bd=1e9;
  for (var i=0;i<R.length;i++){ var r=R[i], dx=Math.max(r[1]-e.x,0,e.x-r[2]), dz=Math.max(r[3]-e.z,0,e.z-r[4]), d=dx+dz; if (d<bd){ bd=d; best=r[0]; } if (d===0) break; }
  return bd<0.6?best:'OUT'; }
function bldNav(e,T){
  if (!BLD.length) return null;
  var B=bldAt(e.x,e.z), s=B&&B.n>1?onStair(B,e.x,e.z,e.y||0):null;
  if (s){ var tY=T.y||0, up=Math.abs(tY-(s.lo+1)*s.H)<Math.abs(tY-s.lo*s.H), hiX=s.xb+(s.xb>s.xa?0.75:-0.75), loX=s.xa+(s.xb>s.xa?-0.75:0.75); return {x:up?hiX:loX,z:(s.z0+s.z1)/2}; }
  var a=navRoom(e), b=navRoom(T); if (a===b) return null;
  var prev={}, q=[a], found=false; prev[a]=null;
  while (q.length){ var c=q.shift(); if (c===b){ found=true; break; }
    for (var i=0;i<NAVL.length;i++){ var L=NAVL[i], nx=L.a===c?L.b:(L.b===c?L.a:null); if (nx===null || prev.hasOwnProperty(nx)) continue; prev[nx]={r:c,L:L}; q.push(nx); } }
  if (!found) return null; var n=b; while (prev[n] && prev[n].r!==a) n=prev[n].r; if (!prev[n]) return null;
  var L2=prev[n].L, fw=L2.a===a;
  if (L2.stair){ var en=fw?L2.A:L2.E, ex=fw?L2.E:L2.A;
    var along=(e.x-en.m.x)*(ex.m.x>en.m.x?1:-1); if (Math.hypot(en.m.x-e.x,en.m.z-e.z)<0.5 || (Math.abs(e.z-en.m.z)<0.45 && along>-0.3)) return {x:ex.m.x,z:ex.m.z};
    if (Math.abs(e.x-en.m.x)<0.6 && e.z<en.g.z+0.3) return {x:en.m.x,z:en.m.z}; return {x:en.g.x,z:en.g.z}; }
  // just off a staircase: walk out of the narrow landing before heading anywhere else
  for (var mi=0;mi<NAVL.length;mi++){ var SL=NAVL[mi]; if (!SL.stair) continue; var ends=[[SL.A,SL.stair.lo*SL.stair.H],[SL.E,(SL.stair.lo+1)*SL.stair.H]];
    for (var ei=0;ei<2;ei++){ var mo=ends[ei][0]; if (Math.abs((e.y||0)-ends[ei][1])<0.5 && Math.abs(e.x-mo.m.x)<0.6 && e.z<mo.g.z-0.4 && Math.abs(e.z-mo.g.z)<5) return {x:mo.g.x,z:mo.g.z}; } }
  var sg=fw?1:-1, dd=Math.hypot(L2.x-e.x,L2.z-e.z); if (dd>1.1) return {x:L2.x-L2.nx*sg*0.9,z:L2.z-L2.nz*sg*0.9}; return {x:L2.x+L2.nx*sg*1.3,z:L2.z+L2.nz*sg*1.3};
}
(function(){
  var M=new MB(), i, k;
  function cv(w,h,fn){ var t=canvasTex(w,h,fn); return t; }
  var linoT=pixTex(128,function(u,v,x,y){ var c=206+hash(x,y)*18+fbm(u,v,6,3)*14; if (x%64<1||y%64<1) c*=.86; return [c*0.98,c,c*0.94]; },true);
  var tileT=pixTex(128,function(u,v,x,y){ var c=((x>>5)+(y>>5))%2?232:212; c+=hash(x,y)*10; if (x%32<1||y%32<1) c*=.8; return [c,c,c*0.98]; },true);
  var hosFloor=tiled(new THREE.MeshStandardMaterial({map:linoT,roughness:.35,color:lin(0xe8ece4)}),3), mktFloor=tiled(new THREE.MeshStandardMaterial({map:tileT,roughness:.3}),2.4);
  var extM=tiled(new THREE.MeshStandardMaterial({map:concreteTex,color:lin(0xd4d0c4),roughness:.9}),4), intM=mat(0xcbd6d0,{roughness:.8}), ceilM=mat(0xeceae4,{roughness:1}), trimM2=mat(0x6a8a86,{roughness:.6});
  var mktExt=tiled(new THREE.MeshStandardMaterial({map:brickTex,color:lin(0xb89a86),roughness:.9}),3), mktInt=mat(0xe6e2d6,{roughness:.9}), glassM=mat(0x1a2430,{roughness:.08,metalness:.4});
  var steelM=mat(0xb8bec6,{roughness:.3,metalness:.6}), darkM=mat(0x22252a,{roughness:.5}), sheetM=mat(0xe8e6e0,{roughness:1}), blueM=mat(0x5a7ea8,{roughness:.8}), greenM=mat(0x6a8a72,{roughness:.8});
  var woodM=mat(0x6a4a30,{roughness:.7}), redM=mat(0xa8201a,{roughness:.6}), bloodM=new THREE.MeshBasicMaterial({color:lin(0x3a0406),transparent:true,opacity:.85,depthWrite:false});
  var panelM=glow(0xe8f0ff), panelDim=glow(0x8a96a8), fridgeM=glow(0xcfe8ff), asphM=new THREE.MeshStandardMaterial({map:rep(asphaltTex,1,1),roughness:1,color:lin(0x7a7a80)}); tiled(asphM,8);
  var lineM=mat(0xe8e4d0,{roughness:.8}), shelfM=mat(0x8c939c,{roughness:.4,metalness:.5});
  var prod=[0xc0392b,0xe8b923,0x2e86c1,0x27ae60,0xe67e22,0xf2f2ee,0x8e44ad].map(function(c){ return mat(c,{roughness:.6}); });
  function addTo(B,lv,x0,z0,x1,z1){ var c={minX:Math.min(x0,x1),maxX:Math.max(x0,x1),minZ:Math.min(z0,z1),maxZ:Math.max(z0,z1)}; if (!lv) colliders.push(c); else B.cols[lv].push(c); return c; }
  // a solid block on one floor: drawn and collided
  function prop(B,lv,w,h,d,m,x,y,z,nocol){ M.box(w,h,d,m,x,lv*B.H+y,z); if (!nocol) addTo(B,lv,x-w/2,z-d/2,x+w/2,z+d/2); }
  function wallSeg(B,lv,x0,z0,x1,z1,m,t,yb,ht){ t=t||0.25; var lx=Math.abs(x1-x0), lz=Math.abs(z1-z0), cx=(x0+x1)/2, cz=(z0+z1)/2, w=lx>lz?lx:t, d=lx>lz?t:lz, hh=ht||B.H;
    M.box(w,hh,d,m,cx,lv*B.H+(yb||0)+hh/2,cz); return addTo(B,lv,cx-w/2,cz-d/2,cx+w/2,cz+d/2); }
  // a wall along x (at z) or along z (at x) with door gaps [[a,b],...]
  function wallX(B,lv,z,x0,x1,gaps,m){ var a=x0; (gaps||[]).concat([[x1,x1]]).forEach(function(g){ if (g[0]>a+0.01) wallSeg(B,lv,a,z,g[0],z,m); a=g[1]; }); }
  function wallZ(B,lv,x,z0,z1,gaps,m){ var a=z0; (gaps||[]).concat([[z1,z1]]).forEach(function(g){ if (g[0]>a+0.01) wallSeg(B,lv,x,a,x,g[0],m); a=g[1]; }); }
  function hide(B,lv,id,x,z,r,t,cx,cy,cz,yaw){ OUTHIDES.push({id:id,in:0,f:0,lv:lv,y:lv*B.H,x:x,z:z,r:r,t:t,cam:[cx,lv*B.H+cy,cz],yaw:yaw}); }
  function bed(B,lv,x,z,rot){ var w=rot?2.1:0.95, d=rot?0.95:2.1; prop(B,lv,w,0.55,d,steelM,x,0.3,z); M.box(w*0.96,0.14,d*0.96,sheetM,x,lv*B.H+0.64,z); M.box(rot?0.08:0.9,0.5,rot?0.9:0.08,steelM,rot?x-w/2:x,lv*B.H+0.85,rot?z:z-d/2); }
  function blood(B,lv,x,z,s,ry){ var g=new THREE.Mesh(new THREE.CircleGeometry(s,14),bloodM); g.rotation.set(-Math.PI/2,0,ry||0); g.scale.set(1,0.6+Math.random()*0.6,1); g.position.set(x,lv*B.H+0.03,z); world.add(g); }
  function link(a,b,x,z,nx,nz){ NAVL.push({a:a,b:b,x:x,z:z,nx:nx,nz:nz}); }

  /* ===== Hollow Lane General Hospital: three floors ===== */
  var H={id:'h',x0:84,x1:116,z0:-36,z1:-14,H:3.4,n:3,cols:[null,[],[]],stairs:[],rooms:[[],[],[]],lights:[],flick:true}; BLD.push(H);
  var HH=H.H, top=H.n*HH;
  // outer shell
  var cS=addTo(H,0,84,-36.13,116,-35.87); H.cols[1].push(cS); H.cols[2].push(cS); M.box(32,top+0.6,0.26,extM,100,(top+0.6)/2,-36);
  [84,116].forEach(function(x){ var c=addTo(H,0,x-0.13,-36,x+0.13,-14); H.cols[1].push(c); H.cols[2].push(c); M.box(0.26,top+0.6,22,extM,x,(top+0.6)/2,-25); });
  wallSeg(H,0,84,-14,98.5,-14,extM,0.26); wallSeg(H,0,101.5,-14,116,-14,extM,0.26); M.box(3,0.4,0.26,extM,100,HH-0.2,-14);
  for (k=1;k<3;k++) wallSeg(H,k,84,-14,116,-14,extM,0.26); M.box(32,0.6,0.26,extM,100,top+0.3,-14);
  // windows on the outside, some lit
  for (k=0;k<3;k++) for (i=0;i<10;i++){ var wx=85.8+i*3.2; if (k===0 && wx>96 && wx<104) continue; var lit=((i*7+k*3)%5)===0;
    M.box(1.7,1.3,0.06,lit?panelDim:glassM,wx,k*HH+1.75,-13.84); M.box(1.7,1.3,0.06,glassM,wx,k*HH+1.75,-36.16); }
  for (k=0;k<3;k++) for (i=0;i<6;i++){ var wz=-33.5+i*3.6; M.box(0.06,1.3,1.7,glassM,83.84,k*HH+1.75,wz); M.box(0.06,1.3,1.7,glassM,116.16,k*HH+1.75,wz); }
  // entrance canopy, glass doors frame and signs
  M.box(6,0.25,3.2,extM,100,3.05,-12.4); [97.3,102.7].forEach(function(x){ prop(H,0,0.25,3,0.25,extM,x,1.5,-11.0); });
  M.box(0.1,2.8,0.1,darkM,98.5,1.4,-14); M.box(0.1,2.8,0.1,darkM,101.5,1.4,-14);
  var hSign=new THREE.Mesh(new THREE.PlaneGeometry(12,1.38),new THREE.MeshBasicMaterial({map:cv(1024,118,function(g){ g.fillStyle='#f4f2ec'; g.fillRect(0,0,1024,118); g.fillStyle='#b81e1e'; g.fillRect(28,26,66,66); g.fillStyle='#f4f2ec'; g.fillRect(52,32,18,54); g.fillRect(34,50,54,18); g.fillStyle='#1d2b3a'; g.font='bold 62px Arial,Helvetica,sans-serif'; g.textBaseline='middle'; g.fillText('HOLLOW LANE GENERAL',120,62); })}));
  hSign.position.set(100,top-0.25,-13.68); world.add(hSign); halo(0xffffff,9,100,top-0.25,-12.8,world,.25);
  var er=new THREE.Mesh(new THREE.PlaneGeometry(4.2,0.8),new THREE.MeshBasicMaterial({map:cv(512,96,function(g){ g.fillStyle='#c41a1a'; g.fillRect(0,0,512,96); g.fillStyle='#fff'; g.font='bold 64px Arial,Helvetica,sans-serif'; g.textAlign='center'; g.textBaseline='middle'; g.fillText('EMERGENCY',256,52); })}));
  er.position.set(100,3.5,-10.75); world.add(er); halo(0xff3030,4,100,3.4,-10.4,world,.6);
  // floors, ceilings and the roof (holes over the stairs)
  M.box(32,0.06,22,hosFloor,100,0.03,-25);
  function slab(k,pieces){ pieces.forEach(function(p){ var w=p[1]-p[0], d=p[3]-p[2], cx=(p[0]+p[1])/2, cz=(p[2]+p[3])/2; M.box(w,0.04,d,hosFloor,cx,k*HH-0.02,cz); M.box(w,0.22,d,ceilM,cx,k*HH-0.15,cz); }); }
  slab(1,[[84,109,-36,-14],[114.6,116,-36,-14],[109,114.6,-34.3,-14]]);
  slab(2,[[84,109,-36,-14],[114.6,116,-36,-14],[109,114.6,-36,-34.3],[109,114.6,-32.8,-14]]);
  M.box(32.4,0.3,22.4,darkM,100,top+0.05,-25);
  // the same plan on every floor: rooms either side of a long corridor, stairs in the south-east corner
  for (k=0;k<3;k++){
    wallX(H,k,-23,84,116,[[86,87.6],[91,92.6],[94,106],[108,109.6],[113,114.6]],intM);
    wallX(H,k,-26,84,116,[[87,88.6],[94,95.6],[102,103.6],[109,111]],intM);
    [89,94,106,111].forEach(function(x){ wallSeg(H,k,x,-23,x,-14,intM,0.2); });
    [91,98,108].forEach(function(x){ wallSeg(H,k,x,-36,x,-26,intM,0.2); });
    // ceiling lights down the corridor and in the rooms
    [88,96,104,112].forEach(function(x){ M.box(1.2,0.04,0.5,k===2&&x===104?panelDim:panelM,x,k*HH+HH-0.28,-24.5); H.lights.push({x:x,y:k*HH+HH-0.5,z:-24.5}); });
    [[86.5,-18.5],[91.5,-18.5],[100,-18.5],[108.5,-18.5],[113.5,-18.5],[87.5,-31],[94.5,-31],[103,-31],[112,-29]].forEach(function(p){ M.box(1.0,0.04,1.0,panelM,p[0],k*HH+HH-0.28,p[1]); H.lights.push({x:p[0],y:k*HH+HH-0.5,z:p[1]}); });
    var nm=['C','L','A','B','R','D','E','F','G','S']; [[84,116,-26,-23],[94,106,-23,-14],[84,89,-23,-14],[89,94,-23,-14],[106,111,-23,-14],[111,116,-23,-14],[84,91,-36,-26],[91,98,-36,-26],[98,108,-36,-26],[108,116,-36,-26]].forEach(function(r,j){ H.rooms[k].push(['h'+k+nm[j],r[0],r[1],r[2],r[3]]); });
    var C='h'+k+'C'; link('h'+k+'A',C,86.8,-23,0,-1); link('h'+k+'B',C,91.8,-23,0,-1); link('h'+k+'L',C,100,-23,0,-1); link('h'+k+'R',C,108.8,-23,0,-1); link('h'+k+'D',C,113.8,-23,0,-1);
    link('h'+k+'E',C,87.8,-26,0,1); link('h'+k+'F',C,94.8,-26,0,1); link('h'+k+'G',C,102.8,-26,0,1); link('h'+k+'S',C,110,-26,0,1);
  }
  link('OUT','h0L',100,-14,0,-1);
  // the stairwell: up from the ground floor going east, then back west up to the top floor
  var cDiv=wallSeg(H,0,109,-34.3,114.6,-34.3,intM,0.12,0,top); H.cols[1].push(cDiv); H.cols[2].push(cDiv);
  var cRail=wallSeg(H,0,109,-32.8,114.6,-32.8,intM,0.12,0,top); H.cols[1].push(cRail); H.cols[2].push(cRail);
  var s01={xa:109,xb:114.6,z0:-35.8,z1:-34.3,lo:0,H:HH,walls:[cS,cDiv]}, s12={xa:114.6,xb:109,z0:-34.3,z1:-32.8,lo:1,H:HH,walls:[cDiv,cRail]}; H.stairs.push(s01,s12);
  for (i=0;i<16;i++){ var ty=(i+1)*HH/16; M.box(0.35,ty,1.5,hosFloor,109+i*0.35+0.175,ty/2,-35.05); var ty2=HH/16*(i+1); M.box(0.35,ty2,1.5,hosFloor,114.6-i*0.35-0.175,HH+ty2/2,-33.55); }
  wallSeg(H,0,109,-34.3,109,-32.8,intM,0.2); wallSeg(H,0,114.6,-34.3,114.6,-32.8,intM,0.2); wallSeg(H,0,114.75,-36,114.75,-34.3,intM,0.2);   // nothing to walk under on the ground floor
  wallSeg(H,1,108.95,-36,108.95,-34.3,steelM,0.08,0,1.0); wallSeg(H,1,109,-34.3,109,-32.8,intM,0.2);            // round the hole on the first floor
  var cA2=addTo(H,2,109,-36,116,-34.3); M.box(0.08,1.0,1.7,steelM,108.96,2*HH+0.5,-35.15); wallSeg(H,2,114.6,-34.3,114.6,-32.8,steelM,0.08,0,1.0);
  NAVL.push({a:'h0S',b:'h1S',stair:s01,A:{m:{x:108.5,z:-35.05},g:{x:108.5,z:-31.8}},E:{m:{x:115.3,z:-35.05},g:{x:115.3,z:-31.8}}});
  NAVL.push({a:'h1S',b:'h2S',stair:s12,A:{m:{x:115.3,z:-33.55},g:{x:115.3,z:-31.8}},E:{m:{x:108.5,z:-33.55},g:{x:108.5,z:-31.8}}});
  var floorSign=['GROUND · EMERGENCY','FLOOR 2 · WARDS','FLOOR 3 · SURGERY'];
  for (k=0;k<3;k++){ var fs=new THREE.Mesh(new THREE.PlaneGeometry(2.4,0.4),new THREE.MeshBasicMaterial({map:cv(384,64,(function(t){ return function(g){ g.fillStyle='#1d3a48'; g.fillRect(0,0,384,64); g.fillStyle='#e8f0f0'; g.font='bold 30px Arial,Helvetica,sans-serif'; g.textAlign='center'; g.textBaseline='middle'; g.fillText(t,192,34); }; })(floorSign[k]))})); fs.position.set(110,k*HH+2.5,-25.86); world.add(fs); }
  /* ground floor: reception, pharmacy, morgue, ER */
  prop(H,0,3.4,1.05,0.9,woodM,96.9,0.52,-19.5); M.box(3.6,0.06,1.1,sheetM,96.9,1.08,-19.5); prop(H,0,0.9,1.05,2.0,woodM,95.0,0.52,-20.5);
  hide(H,0,'hos-desk',97.2,-20.6,1.3,'Hide under the reception desk',97.2,0.6,-19.6,0);
  for (i=0;i<4;i++) prop(H,0,2.4,0.45,0.5,blueM,i%2?103.8:96.2,0.23,-15.6-(i>>1)*1.6);
  prop(H,0,0.5,1.4,0.5,greenM,95,0.7,-14.8,true);
  prop(H,0,1.4,0.75,0.7,woodM,86.5,0.38,-19,false); prop(H,0,0.6,1.3,0.5,steelM,84.6,0.65,-22.4); prop(H,0,0.6,1.3,0.5,steelM,85.3,0.65,-22.4);   // office
  bed(H,0,91.5,-17.5); prop(H,0,0.6,1.6,0.4,steelM,93.4,0.8,-22.6);
  // pharmacy
  [-22.6,-14.6].forEach(function(z){ prop(H,0,4.6,2.2,0.5,shelfM,108.5,1.1,z); for (var s=0;s<4;s++) M.box(4.4,0.08,0.4,prod[(s+(z<-20?2:0))%7],108.5,0.4+s*0.5,z); });
  prop(H,0,0.9,2.2,1.6,woodM,110.4,1.1,-17.5); hide(H,0,'hos-pharm',109.6,-17.5,1.1,'Hide in the pharmacy cabinet',110.3,1.35,-17.5,Math.PI/2);
  // morgue: drawers in the wall, a steel table
  prop(H,0,0.8,2.6,7.0,steelM,115.45,1.3,-18.5); for (i=0;i<3;i++) for (var j=0;j<5;j++) M.box(0.04,0.7,1.1,darkM,115.04,0.5+i*0.85,-21.3+j*1.4);
  prop(H,0,2.0,0.85,0.8,steelM,113,0.43,-18.5); M.box(1.7,0.25,0.5,sheetM,113,0.98,-18.5); blood(H,0,112.6,-19.6,0.6);
  hide(H,0,'hos-morgue',114.5,-17.7,1.0,'Hide in a morgue drawer',115.3,0.95,-17.7,Math.PI/2);
  // ER: beds behind curtains
  [99.5,103,106.5].forEach(function(x,j){ bed(H,0,x,-33.8); M.box(0.03,2.0,2.4,mat([0x9ab8c4,0xb8c49a,0xc4a89a][j]),x+1.6,1.25,-33.6); }); blood(H,0,103,-31.5,0.9,0.4);
  hide(H,0,'hos-er',103,-32.4,1.1,'Hide under an ER bed',103,0.35,-33.8,Math.PI);
  prop(H,0,2.2,1.9,1.4,steelM,94.5,0.95,-33.6); M.box(1.2,0.15,0.6,steelM,94.5,1.3,-31.9);    // x-ray
  bed(H,0,87.5,-33.5); prop(H,0,1.4,0.9,0.5,woodM,89.8,0.45,-35.4);
  /* first floor: wards */
  [[86.5,-18,0],[91.5,-18,0],[108.5,-18,0],[113.5,-18,0],[87.5,-33.2,0],[94.5,-33.2,0],[100,-33.2,0],[103.5,-33.2,0],[107,-33.2,0]].forEach(function(b){ bed(H,1,b[0],b[1],b[2]); });
  prop(H,1,3.6,1.05,0.8,woodM,100,0.52,-20); M.box(3.8,0.06,1.0,sheetM,100,HH+1.08,-20);    // nurses' station
  prop(H,1,1.0,2.2,1.0,woodM,93.3,1.1,-14.7); hide(H,1,'hos-linen',92.6,-15.2,1.0,'Hide in the linen closet',93.3,1.4,-14.9,0);
  hide(H,1,'hos-ward',87.5,-31.6,1.1,'Hide under a ward bed',87.5,0.35,-33.2,Math.PI);
  wallSeg(H,1,113.5,-16.6,114.2,-16.6,intM,0.12); wallSeg(H,1,115.3,-16.6,116,-16.6,intM,0.12); wallSeg(H,1,113.5,-16.6,113.5,-14,intM,0.12); hide(H,1,'hos-bath',114.75,-16.4,1.0,'Hide in the patient bathroom',114.75,1.4,-15.0,0);
  blood(H,1,100,-24.2,1.1,1); blood(H,1,95.2,-24.6,0.5); blood(H,1,91,-24.4,0.4);
  /* top floor: surgery, ICU, laundry */
  prop(H,2,2.2,0.9,0.8,steelM,103,0.45,-31); M.box(2.0,0.08,0.7,mat(0x5a8a7a),103,2*HH+0.92,-31); M.box(0.9,0.12,0.9,panelM,103,2*HH+2.6,-31); blood(H,2,103.4,-30.2,1.0);
  prop(H,2,0.8,2.0,1.6,steelM,107.4,1.0,-29.5); hide(H,2,'hos-or',106.7,-29.5,1.0,'Hide in the surgical supply cabinet',107.4,1.3,-29.5,Math.PI/2);
  [[112.2,-20],[114.6,-20]].forEach(function(b){ bed(H,2,b[0],b[1]); prop(H,2,0.4,1.4,0.4,darkM,b[0],0.7,-22.4); });
  hide(H,2,'hos-icu',112.2,-18.6,1.0,'Hide under the ICU bed',112.2,0.35,-19.6,0);
  for (i=0;i<3;i++) prop(H,2,0.8,0.9,1.1,mat(0x8a95a8),90.3+i*1.3,0.45,-16.2); hide(H,2,'hos-laundry',91.6,-17.9,1.0,'Hide in a laundry cart',91.6,0.75,-16.2,0);
  for (i=0;i<4;i++) prop(H,2,2.4,0.45,0.6,woodM,100,0.23,-16.5-i*1.6);    // the little chapel
  bed(H,2,87.5,-33.5); bed(H,2,94.5,-33.5); blood(H,2,88,-24.5,0.7);

  /* ===== Fresh Mart: one big floor ===== */
  var S={id:'m',x0:86,x1:130,z0:15,z1:37,H:5,n:1,cols:[null],stairs:[],rooms:[[]],lights:[]}; BLD.push(S);
  M.box(44,0.06,22,mktFloor,108,0.03,26); M.box(44.4,0.3,22.4,darkM,108,5.15,26); M.box(44,0.04,22,ceilM,108,4.98,26);
  wallSeg(S,0,86,37,130,37,mktExt,0.3,0,5.6); wallSeg(S,0,86,15,86,37,mktExt,0.3,0,5.6); wallSeg(S,0,130,15,130,37,mktExt,0.3,0,5.6);
  wallSeg(S,0,86,15,98,15,mktExt,0.3,0,1.0); wallSeg(S,0,102,15,130,15,mktExt,0.3,0,1.0); M.box(44,2.6,0.3,mktExt,108,4.3,15);
  M.box(12,2.0,0.08,glassM,92,2.0,15); M.box(28,2.0,0.08,glassM,116,2.0,15); M.box(4,0.3,0.3,darkM,100,3.0,15);
  var fm=new THREE.Mesh(new THREE.PlaneGeometry(9,1.5),new THREE.MeshBasicMaterial({map:cv(768,128,function(g){ g.fillStyle='#1e6a3a'; g.fillRect(0,0,768,128); g.fillStyle='#fff6d8'; g.font='bold 92px Georgia,serif'; g.textAlign='center'; g.textBaseline='middle'; g.fillText('FRESH MART',384,70); })}));
  fm.position.set(100,4.6,14.83); fm.rotation.y=Math.PI; world.add(fm); halo(0x6aff9a,8,100,4.6,14.3,world,.35);
  // back rooms: storeroom, restroom, office
  wallZ(S,0,118,28,37,[[31.2,32.8]],mktInt); wallX(S,0,28,118,130,[[123.2,124.8]],mktInt);
  wallX(S,0,33,86,98,[[88.2,89.8],[94.2,95.8]],mktInt); wallSeg(S,0,92,33,92,37,mktInt,0.2); wallSeg(S,0,98,33,98,37,mktInt,0.2);
  // aisles of shelves
  var shX=[91,95,99,103,107,111,115], names=['PRODUCE','BREAD','CEREAL','CANNED','SNACKS','DRINKS','HOUSEHOLD'];
  shX.forEach(function(x,j){ prop(S,0,0.9,2.1,9,shelfM,x,1.05,26.5);
    for (var t=0;t<4;t++) for (var s=0;s<9;s++){ var pm=prod[(j*3+t*2+s)%7]; M.box(0.18,0.32,0.92,pm,x-0.38,0.3+t*0.5,22.5+s,0); M.box(0.18,0.32,0.92,prod[(j+t+s*3)%7],x+0.38,0.3+t*0.5,22.5+s,0); }
    var sg=new THREE.Mesh(new THREE.PlaneGeometry(2.4,0.5),new THREE.MeshBasicMaterial({side:THREE.DoubleSide,map:cv(256,52,function(g){ g.fillStyle='#d8342a'; g.fillRect(0,0,256,52); g.fillStyle='#fff'; g.font='bold 30px Arial,Helvetica,sans-serif'; g.textAlign='center'; g.textBaseline='middle'; g.fillText(names[j],128,28); })}));
    sg.position.set(x+2,3.6,22.2); sg.rotation.y=Math.PI; world.add(sg); });
  // checkouts
  [106,110,114,118].forEach(function(x,j){ prop(S,0,0.9,1.0,2.6,darkM,x,0.5,18.6); M.box(0.95,0.06,2.7,steelM,x,1.03,18.6); M.box(0.3,0.3,0.25,darkM,x,1.3,17.8); });
  hide(S,0,'mkt-till',110.95,18.6,1.0,'Hide under a checkout counter',110.3,0.55,18.6,-Math.PI/2);
  // coolers along the east wall, produce stands, carts
  prop(S,0,0.9,2.3,12,darkM,129.35,1.15,21.5); for (i=0;i<10;i++) M.box(0.04,1.8,1.1,fridgeM,128.88,1.25,16.1+i*1.2); S.lights.push({x:127,y:3,z:21.5});
  [[90,18],[93.5,18]].forEach(function(p,j){ prop(S,0,2.4,0.85,1.4,woodM,p[0],0.43,p[1]); for (var a=0;a<6;a++) M.box(0.7,0.18,0.6,prod[(a+j*2)%7===5?3:(a+j*2)%7],p[0]-0.8+(a%3)*0.8,0.95,p[1]-0.35+(a>2?0.7:0)); });
  // deli and bakery at the back
  prop(S,0,16,1.15,0.9,mat(0xe8e8e0),108,0.58,35.2); M.box(16,0.5,0.06,glassM,108,1.4,34.78); for (i=0;i<8;i++) M.box(1.6,0.2,0.6,prod[i%7],101.2+i*1.95,1.0,35.2);
  hide(S,0,'mkt-deli',108,36.3,1.1,'Hide behind the deli counter',108,1.2,36.3,0);
  // restroom stalls, the office, the storeroom and the walk-in freezer
  wallSeg(S,0,86,35,87.4,35,mktInt,0.08,0,2.0); wallSeg(S,0,88.8,35,89.5,35,mktInt,0.08,0,2.0); wallSeg(S,0,89.5,35,89.5,37,mktInt,0.08,0,2.0); hide(S,0,'mkt-stall',88.1,35.6,1.0,'Hide in a restroom stall',88.1,1.3,36.4,0);
  prop(S,0,1.6,0.78,0.8,woodM,95,0.39,35.8); hide(S,0,'mkt-office',95,34.8,1.0,'Hide under the manager’s desk',95,0.5,35.6,0);
  for (i=0;i<4;i++) prop(S,0,1.2,1.0+((i*3)%4)*0.35,1.2,mat(0x9a7a52),120+i*1.6,0.6,35.8); hide(S,0,'mkt-boxes',121.8,33.4,1.1,'Hide behind the pallets of boxes',121.6,0.9,35.6,0);
  wallX(S,0,32.6,125,130,[[126.6,127.8]],steelM); wallSeg(S,0,125,32.6,125,37,steelM,0.15);
  M.box(5,0.04,4.4,glow(0x9ad8ff),127.5,4.0,34.8); hide(S,0,'mkt-freezer',127.2,33.6,1.0,'Hide in the walk-in freezer',128.4,1.4,35.6,Math.PI*0.25);
  blood(S,0,104,31.8,0.8); blood(S,0,124,24,0.5);
  // the lights: a grid of long ceiling panels
  for (i=0;i<6;i++) for (var j2=0;j2<3;j2++){ var lx2=90+i*7.2, lz2=19+j2*7; M.box(3.0,0.05,0.35,(i*3+j2)%7===4?panelDim:panelM,lx2,4.9,lz2); S.lights.push({x:lx2,y:4.4,z:lz2}); }
  // rooms for finding the way round the aisles
  var R=S.rooms[0]; R.push(['mF',86,130,15,22]); var ax=[86].concat(shX.map(function(x){ return x+0.45; })), bx=shX.map(function(x){ return x-0.45; }).concat([118]);
  for (i=0;i<ax.length;i++){ var cx=(ax[i]+bx[i])/2; R.push(['mA'+i,ax[i],bx[i],22,31]); link('mF','mA'+i,cx,22,0,1); link('mA'+i,'mK',cx,31,0,1); }
  R.push(['mK3',100,116,35.65,37],['mKw',98,100,34.75,37],['mKe',116,118,34.75,37],['mK',86,118,31,33],['mK2',98,118,33,34.75],['mW',86,92,33,37],['mO',92,98,33,37],['mX',118,130,22,28],['mR',118,130,28,37]);
  link('OUT','mF',100,15,0,1); link('mK','mW',89,33,0,1); link('mK','mO',95,33,0,1); link('mK','mK2',108,33,0,1); link('mK3','mKw',99.7,36.3,-1,0); link('mKw','mK2',99,34.75,0,-1); link('mK3','mKe',116.3,36.3,1,0); link('mKe','mK2',117,34.75,0,-1); link('mF','mX',124,22,0,1); link('mA7','mX',118,25,1,0); link('mK','mR',118,32,1,0); link('mX','mR',124,28,0,1);

  /* ===== outside: the road goes on, parking lots, lamps, an ambulance ===== */
  var g2=new THREE.Mesh(new THREE.PlaneGeometry(14,150),new THREE.MeshStandardMaterial({map:rep(grassTex,4,40),roughness:1})); g2.rotation.x=-Math.PI/2; g2.position.set(146,-0.005,0); world.add(g2);
  var rd=new THREE.Mesh(new THREE.PlaneGeometry(40,8),new THREE.MeshStandardMaterial({map:rep(asphaltTex,8,2),roughness:1,color:lin(0x8a8a90)})); rd.rotation.x=-Math.PI/2; rd.position.set(129,0.02,0); world.add(rd);
  for (var dx2=74; dx2<148; dx2+=6) M.box(2.2,0.01,0.14,mat(0xb9a94e),dx2,0.035,0);
  [-5.1,5.1].forEach(function(z){ M.box(75,0.14,2,new THREE.MeshStandardMaterial({map:rep(concreteTex,30,1),roughness:.9}),111.5,0.07,z); });
  M.box(64,0.02,7.6,asphM,108,0.025,-10.1); M.box(64,0.02,8.6,asphM,108,0.025,10.6);
  for (i=0;i<14;i++){ var px=80+i*4; if (px>96 && px<104) continue; M.box(0.12,0.01,3.2,lineM,px,0.04,-8.4); M.box(0.12,0.01,3.2,lineM,px,0.04,8.4); }
  hedge(111.5,-41,38,1); hedge(111.5,41,38,1); hedge(149.5,0,1,42);
  // ambulance
  var amb=new THREE.Group(); amb.position.set(109,0,-10.2); world.add(amb); box(5.6,2.3,2.2,mat(0xf2f2ee,{roughness:.4}),0,1.5,0,amb); box(1.6,1.4,2.15,mat(0xf2f2ee,{roughness:.4}),3.4,1.0,0,amb); box(5.65,0.3,2.25,redM,0,1.6,0,amb);
  box(0.9,0.7,2.18,glassM,3.7,1.35,0,amb); [-1.8,1.8,3.4].forEach(function(x){ [-1,1].forEach(function(s){ var w=cyl(0.42,0.42,0.3,12,darkM,x,0.42,s*1.05,amb); w.rotation.x=Math.PI/2; }); }); box(0.4,0.15,0.6,glow(0xff2020),1.8,2.72,0,amb); addBox(110,-10.2,3.3,1.2);
  // a few parked cars and carts
  [[86,-10,0x5a6a7a],[118,-10,0x7a2a22],[90,10.5,0x2a3a5a],[114,10.5,0xbab6aa],[126,10.5,0x3a4a3a]].forEach(function(c){ var g=new THREE.Group(); g.position.set(c[0],0,c[1]); world.add(g); var cm=mat(c[2],{roughness:.35,metalness:.3});
    box(1.9,0.8,4.2,cm,0,0.65,0,g); box(1.75,0.6,2.2,cm,0,1.35,-0.2,g); box(1.78,0.5,2.0,glassM,0,1.38,-0.2,g); [-1.3,1.3].forEach(function(z){ [-0.95,0.95].forEach(function(x){ var w=cyl(0.34,0.34,0.24,12,darkM,x,0.34,z,g); w.rotation.z=Math.PI/2; }); }); addBox(c[0],c[1],1.0,2.2); });
  [[104,13.2],[105,13.3],[96,12.8]].forEach(function(p){ var g=new THREE.Group(); g.position.set(p[0],0,p[1]); g.rotation.y=(p[0]*7)%3; world.add(g); box(0.6,0.5,0.9,steelM,0,0.7,0,g); box(0.05,0.45,0.05,darkM,0,0.25,0.35,g); box(0.05,0.45,0.05,darkM,0,0.25,-0.35,g); });
  // street lamps out here too
  [80,101,122,143].forEach(function(lx,li){ var sgn=li%2?1:-1, lz=sgn*6.6; cyl(0.07,0.11,5.4,8,poleM,lx,2.7,lz); var arm=cyl(0.045,0.045,1.7,6,poleM,lx,5.35,lz-sgn*0.8); arm.rotation.x=Math.PI/2; box(0.34,0.14,0.7,poleM,lx,5.3,lz-sgn*1.7);
    var bz=lz-sgn*1.7, bulb=new THREE.Mesh(new THREE.BoxGeometry(0.24,0.05,0.5),bulbM); bulb.position.set(lx,5.21,bz); scene.add(bulb); halo(0xffc070,4.5,lx,5.15,bz,scene,.9); addBox(lx,lz,0.15,0.15); lamps.push({x:lx,z:bz,sx:lx,sz:lz-sgn*2.6}); });
  M.flush(world);
})();

secErase(__eastM); BLD.length=0; NAVL.length=0;
var polCar=(function(){ var g=new THREE.Group(), w=mat(0xf0f0f0,{roughness:.4}), k=mat(0x111216,{roughness:.4}), gl=mat(0x1a2430,{roughness:.1});
  box(4.4,0.8,1.9,k,0,0.7,0,g); box(2.4,0.65,1.8,w,-0.2,1.4,0,g); box(2.3,0.5,1.85,gl,-0.2,1.45,0,g); box(1.2,0.82,1.92,w,0,0.71,0,g);
  [-1.4,1.4].forEach(function(x){ [-0.95,0.95].forEach(function(z){ var c=cyl(0.36,0.36,0.25,12,k,x,0.36,z,g); c.rotation.x=Math.PI/2; }); });
  var r=box(0.5,0.15,0.4,glow(0xff2a2a),-0.2,1.8,-0.35,g), b=box(0.5,0.15,0.4,glow(0x2a5aff),-0.2,1.8,0.35,g);
  var hr=halo(0xff2a2a,2.2,-0.2,1.9,-0.4,g,1), hb=halo(0x2a5aff,2.2,-0.2,1.9,0.4,g,1);
  g.visible=false; scene.add(g); g.userData={hr:hr,hb:hb}; return g; })();
var polCop=null;
function copRig(){ if (polCop) return polCop; if (!NETTPL.m) return null; var rig=makeNetRig('p',COP); if (!rig) return null; polCop={g:new THREE.Group(),rig:rig}; polCop.g.add(rig.m); polCop.g.visible=false; scene.add(polCop.g); return polCop; }
var POLROUTE=[[-81,-23.5],[-81,-13],[-70,-1.6]];
// ---- moving things in and out of houses
function navGoal(e,T){
  var ef=(e.y||0)>1.4?1:0;
  if (e.ih!==T.ih){
    if (e.ih>=0){ if (onStairs(e.x,e.z)) return {x:IX+0.27,z:0.9}; if (ef) return {x:IX+0.27,z:-3.55}; return {x:IX,z:3.45,exit:true}; }
    var dp=doorPt(houses[T.ih]); return {x:dp.x,z:dp.z,enter:T.ih};
  }
  if (e.ih>=0){ var tf=(T.y||0)>1.4?1:0; if (tf!==ef || onStairs(e.x,e.z)!==onStairs(T.x,T.z) && Math.abs((T.y||0)-(e.y||0))>0.6){
      if (onStairs(e.x,e.z)) return {x:IX+0.27,z:tf>ef||(T.y||0)>(e.y||0)?-3.6:0.9}; return {x:IX+0.27,z:ef===0?0.3:-3.55}; } }
  if (e.ih<0){ var w=bldNav(e,T); if (w) return w; }
  return {x:T.x,z:T.z};
}
function navStep(e,T,sp,dt,breaker){
  var g=navGoal(e,T), dx=g.x-e.x, dz=g.z-e.z, d=Math.hypot(dx,dz)||0.001;
  if (e.sideT>0 && e.ih<0){ e.sideT-=dt; var ca=Math.cos(1.2*e.sideD), sa=Math.sin(1.2*e.sideD), tx=dx*ca-dz*sa; dz=dx*sa+dz*ca; dx=tx; }
  if (g.exit && d<0.8){ var h=houses[e.ih], dp=doorPt(h); e.ih=-1; e.x=dp.x; e.z=dp.z-h.side*1.1; e.fl=0; e.y=groundY(e.x,e.z); h.open=1; setTimeout(function(){ h.open=0; },1500); return d; }
  if (g.enter!==undefined && d<1.4){ var h2=houses[g.enter];
    if (breaker && !h2.netBroke){ e.kicking=true; e.ry=Math.atan2(dx,dz); e.kick=(e.kick||0)+dt; var kn=Math.floor(e.kick/0.62);
      if (kn>(e.kickN||0)){ e.kickN=kn; h2.open=0.1; setTimeout(function(){ if (!h2.netBroke) h2.open=0; },150); var pd=Math.hypot(g.x-P.x,g.z-P.z); if (pd<35 && !(net && net.ih>=0)) thud(1.1*(1-pd/35)); }
      if (e.kick<1.9) return d; e.kick=0; e.kickN=0; breakDoorFx(h2); if (net.bd.indexOf(g.enter)<0) net.bd.push(g.enter); } e.ih=g.enter; e.x=IX; e.z=3.0; e.fl=0; e.y=0; h2.open=1; setTimeout(function(){ h2.open=0; },1500); return d; }
  var step=Math.min(d,sp*dt), p={x:e.x+dx/d*step,z:e.z+dz/d*step,fl:e.fl|0,y:e.y||0};
  if (e.ih>=0) iFix(p,0.3); else { var inB=bldAt(p.x,p.z); if (!((e.stuck||0)>=2.5) || inB) lvFix(p,0.45); p.x=Math.max(-157,Math.min(148,p.x)); p.z=Math.max(-39,Math.min(39,p.z)); if (!(p.y>0.05)) p.y=groundY(p.x,p.z); }
  var mv=Math.hypot(p.x-e.x,p.z-e.z), st=e.stuck||0; e.stuck=mv<step*0.35?st+dt:(st>=2.5?(st+dt>4.5?0:st+dt):0);
  if (e.ih<0 && e.stuck>0.8 && bldIn(e.x,e.z)){ e.sideT=0.9; e.sideD=e.sideD===1?-1:1; e.stuck=0; }
  e.x=p.x; e.z=p.z; e.fl=p.fl; e.y=p.y; e.ry=Math.atan2(dx,dz); return d;
}
// ---- going in and out of a house
function styleInterior(h){ var hix=houses.indexOf(h); IM.wall.color.copy(lin(IWALL[hix%12])); IM.sofa.color.copy(lin(ISOFA[hix%12])); IM.rug.color.copy(lin(IRUG[hix%12])); IM.cab.color.copy(lin(ICAB[hix%6])); }
/* ---------- walking through a front door: reach for the knob, the door swings, you step through ---------- */
var doorSeq=null;
function iDoorPose(a){ var hx=0.56, hz=3.75, c=Math.cos(a), sn=Math.sin(a); iDoor.rotation.y=a; iDoor.position.set(hx-(c*hx+sn*hz),0,hz-(-sn*hx+c*hz)); }
function creak(v){ if (!AC) return; tone(300,0.85,'sawtooth',0.025*v,170); tone(460,0.6,'triangle',0.02*v,300,0.15); noise(0.7,0.04*v,1400); }
function knobClick(){ if (!AC) return; tone(1300,0.03,'square',0.05); tone(700,0.05,'square',0.04,null,0.06); noise(0.05,0.12,2500,0.02); }
function ease(k){ k=Math.max(0,Math.min(1,k)); return k*k*(3-2*k); }
function netEnterHouse(h){ if (doorSeq || !net) return; var dp=doorPt(h), sd=h.side;
  doorSeq={dir:'in',h:h,t:0,x0:P.x,z0:P.z,y0:P.yaw,p0:P.pitch,sx:dp.x,sz:dp.z-sd*1.0,tx:dp.x,tz:dp.z+sd*0.9,yaw:sd>0?Math.PI:0,st:0}; setPrompt(null); }
function netLeaveHouse(){ if (doorSeq || !net) return; var h=houses[net.ih]; if (!h) return;
  doorSeq={dir:'out',h:h,t:0,x0:P.x,z0:P.z,y0:P.yaw,p0:P.pitch,st:0,broke:!!h.netBroke}; setPrompt(null); }
function doorSeqTick(dt){
  var D=doorSeq; if (!D) return; if (!net || game.mode!=='play'){ doorSeq=null; $('fade').style.opacity=0; return; }
  D.t+=dt; var t=D.t, h=D.h, k;
  function turn(y,k){ P.yaw=D.y0+angDiff(y,D.y0)*k; P.pitch=D.p0*(1-k); }
  if (D.dir==='in'){
    if (t<1.5){ k=ease(t/0.4); var x=D.x0+(D.sx-D.x0)*k, z=D.z0+(D.sz-D.z0)*k; turn(D.yaw,k);
      if (t>0.22 && D.st<1){ D.st=1; knobClick(); }
      if (t>0.32 && D.st<2){ D.st=2; h.open=1; h.hall.visible=true; if (!h.netBroke) creak(1); }
      var m=ease((t-0.75)/0.65); x+=(D.tx-D.sx)*m; z+=(D.tz-D.sz)*m; P.x=x; P.z=z; P.y=0; P.bob+=dt*m*3;
      if (t>1.08 && D.st<3){ D.st=3; $('fade').style.opacity=1; } }
    else { if (D.st<4){ D.st=4; enterHouseNow(h); if (!h.netBroke) iDoorPose(-1.3); $('fade').style.opacity=0; D.ix=IX; P.yaw=0; P.pitch=0; }
      var m2=ease((t-1.5)/0.75); P.x=IX; P.z=3.3-0.6*m2;
      if (!h.netBroke){ var c=ease((t-1.85)/0.45); iDoorPose(-1.3*(1-c)); if (t>2.3 && D.st<5){ D.st=5; thud(0.5); noise(0.08,0.15,900); h.open=0; } }
      if (t>2.35){ iDoorPose(0); doorSeq=null; } }
  } else {
    if (t<1.35){ k=ease(t/0.35); P.x=D.x0+(IX-D.x0)*k; P.z=D.z0+(2.75-D.z0)*k; turn(Math.PI,k); P.y=0;
      if (t>0.2 && D.st<1){ D.st=1; if (!D.broke){ knobClick(); } }
      if (t>0.3 && D.st<2){ D.st=2; if (!D.broke) creak(0.9); }
      if (!D.broke) iDoorPose(-1.3*ease((t-0.3)/0.45));
      var m3=ease((t-0.6)/0.6); P.z+=(3.65-2.75)*m3; P.bob+=dt*m3*3;
      if (t>0.95 && D.st<3){ D.st=3; $('fade').style.opacity=1; } }
    else { if (D.st<4){ D.st=4; leaveHouseNow(); iDoorPose(0); h.pivot.rotation.y=-1.35; h.open=1; h.hall.visible=true; $('fade').style.opacity=0; var dp=doorPt(h); D.ox=dp.x; D.oz=dp.z; P.yaw=h.side>0?0:Math.PI; P.pitch=0; }
      var m4=ease((t-1.35)/0.7); P.x=D.ox; P.z=D.oz-h.side*(0.2+1.4*m4); P.y=0;
      if (t>1.75 && D.st<5){ D.st=5; h.open=0; }
      if (t>2.15 && D.st<6){ D.st=6; if (!h.netBroke){ thud(0.6); noise(0.08,0.15,900); } h.hall.visible=false; }
      if (t>2.2) doorSeq=null; }
  }
}
function enterHouseNow(h){
  var N=net; N.ih=houses.indexOf(h); N.outX=P.x; N.outZ=P.z; styleInterior(h); iDoorSet(!!h.netBroke); iPowerSet(h.power);
  P.x=IX; P.z=3.3; P.fl=0; P.y=0; P.gy=0; P.yaw=0; P.pitch=0;
  moonLight.intensity=0; setLeaves(false); N.homeShown=false; setPrompt(null);
  if (game.role!=='killer' && N.mode==='s' && !h.netDead){ var cleaned0=N.cleaned||{}, todo=choresOf(N.ih).filter(function(t){ return !cleaned0[choreId(N.ih,t)]; }).map(function(t){ return CHORE_T[t].n.toLowerCase(); }); if (todo.length) setTimeout(function(){ toast('This house needs: '+todo.join(' and ')+'. Walk to a glowing spot and press '+(isTouch?'Clean':'E')+': every chore is a little puzzle.',4200); },2700); }
  if (game.role!=='killer') toast(h.netDead?NEIGHBOURS[h.n].n+' is dead. The killer got here first.':h.netHid?'The house is quiet. The neighbour is hiding upstairs.':NEIGHBOURS[h.n].n+' lives here. Go and talk to them.',2600);
}
function leaveHouseNow(){
  var N=net, h=houses[N.ih]; N.ih=-1; closeChat(); var dp=doorPt(h); P.x=dp.x; P.z=dp.z-h.side*1.1; P.fl=0; P.y=0; P.yaw=h.side>0?0:Math.PI; P.pitch=0;
  moonLight.intensity=0.55; setLeaves(true); resident.g.visible=false; setPrompt(null);
}
function netHome(dt){ // the neighbour inside the house you are in
  var N=net; if (N.ih<0 || N.fin){ return; } var h=houses[N.ih];
  if (h.netHid || h.netDead){ if (resident.g.visible && resident.who===NEIGHBOURS[h.n] && !N.fin) resident.g.visible=false; if (h.netDead && !h.netPool){ h.netPool=true; bloodPool(IX-1.0,0,1.9,1.4); } return; }
  if (resident.who!==NEIGHBOURS[h.n] || !resident.g.visible || resident.dead){ showResident(h.n); resident.dead=false; resident.g.position.set(IX-1.0,0,1.9); resident.g.rotation.set(0,0,0); }
  if (P.fl===0 && !N.hide) turnTo(resident.g,Math.atan2(P.x-resident.g.position.x,P.z-resident.g.position.z),dt);
}
// ---- the killer can murder the neighbour in their own house: one stab, straight into the kill
function nbKillable(h,front){ var N=net; if (!h || h.netHid || h.netDead || N.fin || !resident.g.visible || resident.dead || resident.who!==NEIGHBOURS[h.n] || (P.y||0)>0.3) return false;
  var dx=resident.g.position.x-P.x, dz=resident.g.position.z-P.z, d=Math.hypot(dx,dz); if (d>(front?2.1:1.8)) return false; if (!front) return true; var f=fwd(); return (dx*f.x+dz*f.z)/(d||1)>0.45; }
function neighbourDied(h){ h.netDead=true; h.netHid=false; var N=net; if (N && N.ih===houses.indexOf(h) && !N.fin){ if (resident.who===NEIGHBOURS[h.n]) resident.g.visible=false; if (!h.netPool){ h.netPool=true; bloodPool(IX-1.0,0,1.9,1.4); }
    if (game.role!=='killer'){ closeChat(); toast(NEIGHBOURS[h.n].n+' was just killed!',2600); sting(0.25,false); } } }
function killNeighbour(h){ var N=net, hi=houses.indexOf(h); if (h.netDead || N.fin) return; h.netDead=true; h.netPool=true; if (N.nd.indexOf(hi)<0) N.nd.push(hi); closeChat(); N.cd=2.4;
  var x=resident.g.position.x, z=resident.g.position.z; startNetFinisher({id:'nb'+hi,me:false,x:x,z:z,y:0,ih:N.ih,pr:{sk:h.n,n:NEIGHBOURS[h.n].n},alive:true}); toast('You killed '+NEIGHBOURS[h.n].n+'.',2400); }
// ---- chatting
function openChat(h){ var N=net; N.chat=h; $('chatName').textContent=NEIGHBOURS[h.n].n; $('chatBox').hidden=false; resident.talk=1.2;
  wasLocked=false; if (document.exitPointerLock) try { document.exitPointerLock(); } catch(e){} }
function closeChat(){ if (net) net.chat=null; $('chatBox').hidden=true; }
function polInfo(){ var N=net; return N && N.polView ? N.polView : [0]; }
function chatPick(n){
  var N=net; if (!N || !N.chat) return; var h=N.chat, nm=h.n;
  if (n===1){ say(nm,['All right. I’m going upstairs and I’m locking the door.','Thank you. I’ll hide. Be careful out there.','Upstairs. Got it. Don’t let him follow you in.'][(Math.random()*3)|0],3000); h.netHid=true; closeChat(); setTimeout(function(){ if (net && net.ih===houses.indexOf(h)) resident.g.visible=false; },1600); return; }
  if (n===2){ if (h.netAsked){ say(nm,'I already gave you everything I could find.',2600); return; } h.netAsked=true;
    if (false){ var it=Math.random()<0.5?'knife':'heal'; giveHeld(it); say(nm,it==='knife'?'Here, take my kitchen knife. Two good stabs in it.':'Here’s the first aid kit. Use it when you need it.',3200); tone(660,0.15,'triangle',0.15); itemsUI(); }
    else say(nm,['Nothing, I’m sorry. Not even a bat.','I wish I did. I have nothing.','No… I’m sorry.'][(Math.random()*3)|0],2600); return; }
  if (n===3){ var pv=polInfo(); if (pv[0]>0){ say(nm,'They’re already on their way. Hang on.',2600); return; }
    if (N.called && N.el-N.called<5) return; N.called=N.el; N.pc=[Math.round(N.el*10)/10,houses.indexOf(h)]; netSend({pc:N.pc});
    say(nm,'I’m calling them now… They said a minute and a half. Stay alive till then.',3600); tone(440,0.2,'sine',0.1); return; }
  closeChat();
}
// ---- hiding
function netHideAt(spot){ var N=net; N.hide=spot; P.x=(spot.in?IX:0)+spot.x; P.z=spot.z; if (!spot.in){ P.y=spot.y||0; P.lv=spot.lv||0; } P.yaw=spot.yaw; P.pitch=0; N.hideLight=P.light; setLight(false); vm.visible=false; setPrompt('Come out','Out'); noise(0.1,0.12,600); P.crouch=false; crouchUI(); }
function netUnhide(){ var N=net; if (!N.hide) return; var s=N.hide; N.hide=null; setLight(N.hideLight); vm.visible=true; setPrompt(null); P.pitch=0;
  var bx=(s.in?IX:0)+s.x, bz=s.z; P.x=bx; P.z=bz; if (N.ih>=0){ P.fl=s.f; iFix(P,0.3); } else { P.y=s.y||0; P.lv=s.lv||0; lvFix(P,0.45); } }
function netHideFrame(dt){
  var N=net, s=N.hide, c=s.cam, mx=(keys.KeyD||keys.ArrowRight?1:0)-(keys.KeyA||keys.ArrowLeft?1:0)+touchMove.x, mz=(keys.KeyS||keys.ArrowDown?1:0)-(keys.KeyW||keys.ArrowUp?1:0)+touchMove.y;
  if (Math.hypot(mx,mz)>0.7) return netUnhide();
  var dy=P.yaw-s.yaw; dy=Math.atan2(Math.sin(dy),Math.cos(dy)); P.yaw=s.yaw+Math.max(-1.0,Math.min(1.0,dy)); P.pitch=Math.max(-0.3,Math.min(0.35,P.pitch));
  FX.breath+=dt*2.2; camera.position.set((s.in?IX:0)+c[0],c[1]+(reduced?0:Math.sin(FX.breath)*0.006),c[2]); camera.rotation.set(P.pitch,P.yaw,0);
  vm.visible=false; vmL.visible=false; $('stamina').firstElementChild.style.width=(P.stamina*100)+'%'; P.stamina=Math.min(1,P.stamina+dt/7);
}
// ---- what you can do where you stand
function netInteract(dt,pl){
  var N=net, killer=game.role==='killer'; N.near=null; if (N.alive!==1 || N.fin || N.jailed || N.brk || vanPhase(N) || N.wiring || doorSeq) return;
  if (N.hide){ N.near={k:'unhide'}; return; }
  if (N.ih>=0){
    var h=houses[N.ih], lx=P.x-IX;
    if (P.z>3.12 && Math.abs(lx)<0.75 && (P.y||0)<0.3){ netLeaveHouse(); return; }
    if (!killer){
      var stN=stairNear();
      if (N.choreHere && !(N.cleaned||{})[N.choreHere.cid]) N.near={k:'chore',c:N.choreHere,t:'Clean up: '+CHORE_T[N.choreHere.t].n.toLowerCase()};
      else if (N.darkChore) N.near={k:'dark',t:'Too dark to clean · get the generator running'};
      else if (stN && Math.hypot(P.x-resident.g.position.x,P.z-resident.g.position.z)>1.0) N.near=stN;
      else if (!h.netHid && !h.netDead && (P.y||0)<0.3 && Math.hypot(P.x-resident.g.position.x,P.z-resident.g.position.z)<1.8){ N.near={k:'chat',h:h,t:'Chat with '+NEIGHBOURS[h.n].n}; }
      else if (stairNear()) N.near=stairNear();
      else HIDES.forEach(function(s){ if (N.near || s.f!==(P.y>1.4?1:0) || Math.abs((P.y||0)-s.f*FLOOR2)>0.4) return; if (Math.hypot(P.x-IX-s.x,P.z-s.z)<s.r) N.near={k:'hide',s:s,t:s.t}; });
    } else { if (nbKillable(h)) N.near={k:'killnb',h:h,t:'Kill '+NEIGHBOURS[h.n].n}; else if (stairNear()) N.near=stairNear();
      HIDES.forEach(function(s){ if (N.near || Math.abs((P.y||0)-s.f*FLOOR2)>0.4) return; if (Math.hypot(P.x-IX-s.x,P.z-s.z)<s.r) N.near={k:'search',s:s,t:'Search: '+s.t.replace(/^Hide (in|under) /,'')}; }); }
  } else {
    if (!killer && (P.y||0)<0.8){ var ci=-1; chests.forEach(function(c,i){ if (!c.open && Math.hypot(c.x-P.x,c.z-P.z)<1.6) ci=i; }); if (ci>=0) N.near={k:'chest',i:ci,t:'Open the chest'}; }
    if (!N.near && !killer) houses.forEach(function(hh,hi){ if (N.near || hh.power) return; if (Math.hypot(P.x-hh.gen.x,P.z-hh.gen.z)<2.2) N.near={k:'wire',hi:hi,t:'Connect the generator wires'}; });
    if (!N.near){ var dh=nearDoor(); if (dh) N.near={k:'door',h:dh,t:killer?(dh.netBroke?'Open the door':'Break the door down'):((dh.power||dh.netBroke)?'Open the door':'Locked · fix their generator out back')}; }
    if (!N.near) OUTHIDES.forEach(function(s){ if (N.near || Math.abs((s.y||0)-(P.y||0))>0.8) return; if (Math.hypot(P.x-s.x,P.z-s.z)<s.r) N.near=killer?{k:'search',s:s,t:'Search the dumpster'}:{k:'hide',s:s,t:s.t}; });
  }
  if (N.chat && (!N.near || N.near.k!=='chat')) closeChat();
  var lab={chore:'Clean',wire:'Fix',up:'Up',down:'Down',killnb:'Kill',chest:'Open',door:killer&&N.near&&N.near.h&&!N.near.h.netBroke?'Break':'Open',chat:'Chat',hide:'Hide',search:'Search',unhide:'Out'};
  if (N.near && !N.working) setPrompt(N.near.t,lab[N.near.k]); else if (curPrompt && !N.working && /^(Open the|Break the|Chat with|Hide|Search|Come out|Kill |Go up|Go down|Connect the|Locked|Clean up|Too dark)/.test(curPrompt)) setPrompt(null);
}
// ---- police (run by one player's game, shown to everyone)
function polTick(dt,pl,killers){
  var N=net, S=N.pol||(N.pol={s:0,arr:0,cx:-81,cz:-23.5,cry:0,ox:0,oz:0,ory:0,ih:-1,y:0,fl:0,tgt:null,hs:-1,t:0,wp:0,last:0}), i;
  if (S.s===0){ var call=null; pl.forEach(function(q){ var pc=q.me?N.pc:q.pr.pc; if (Array.isArray(pc) && pc.length===2 && num(pc[0],0)>S.last && (!call || pc[0]<call[0])) call=[num(pc[0],0),num(pc[1],-1)|0]; });
    if (call){ S.last=call[0]; S.s=1; S.arr=N.el+90; S.hs=Math.max(0,Math.min(houses.length-1,call[1])); } }
  else if (S.s===1){ if (N.el>=S.arr){ S.s=2; S.wp=0; S.cx=POLROUTE[0][0]; S.cz=POLROUTE[0][1]; var hx=houses[S.hs].x; S.dest=[Math.max(-62,Math.min(62,hx)),-1.6]; } }
  else if (S.s===2 || S.s===5){ var route=S.s===2?POLROUTE.concat([S.dest]):[S.dest].concat(POLROUTE.slice().reverse()), w=route[S.wp], dx=w[0]-S.cx, dz=w[1]-S.cz, d=Math.hypot(dx,dz);
    if (d<0.5){ S.wp++; if (S.wp>=route.length){ if (S.s===2){ S.s=3; S.t=0; S.ox=S.cx; S.oz=S.cz+2.2; S.ih=-1; S.y=0; S.fl=0; } else { S.s=0; } } }
    else { var st=Math.min(d,13*dt); S.cx+=dx/d*st; S.cz+=dz/d*st; S.cry=Math.atan2(dx,dz); } }
  else if (S.s===3){ S.t+=dt;
    var T=null, td=1e9, hd=doorPt(houses[S.hs]); killers.forEach(function(k){ if (k.jailUntil>N.el) return; var dd=Math.hypot(k.x-hd.x,k.z-hd.z)+(k.ih===S.hs?-20:0); if (dd<td){ td=dd; T=k; } });
    if (!T || S.t>50){ S.s=4; toast('The police gave up and are heading back.',2600); }
    else { var e={x:S.ox,z:S.oz,ih:S.ih,y:S.y,fl:S.fl,stuck:S.stuck}; navStep(e,{x:T.x,z:T.z,ih:T.ih,y:T.y},N.blood?7.6:7.2,dt); S.ox=e.x; S.oz=e.z; S.ih=e.ih; S.y=e.y; S.fl=e.fl; S.ory=e.ry; S.stuck=e.stuck; S.tgt=T.id;
      if (S.ih===T.ih && Math.abs((S.y||0)-(T.y||0))<1.2 && Math.hypot(S.ox-T.x,S.oz-T.z)<1.6){
        N.jl=(N.jl||[]).filter(function(j){ return j[1]>N.el; }); N.jl.push([T.id,Math.round((N.el+30)*10)/10]);
        if (T.bot){ T.bot.jail=N.el+30; T.bot.x=JAIL.x; T.bot.z=JAIL.z; T.bot.ih=-1; T.bot.y=0; }
        toast('The police arrested '+(T.bot?'a killer bot':nick(T.pr))+'! Locked up for 30 seconds.',3800); sting(0.2,false); S.s=4; } } }
  else if (S.s===4){ var e2={x:S.ox,z:S.oz,ih:S.ih,y:S.y,fl:S.fl,stuck:S.stuck}, dd=navStep(e2,{x:S.cx,z:S.cz+1.2,ih:-1,y:0},6,dt); S.ox=e2.x; S.oz=e2.z; S.ih=e2.ih; S.y=e2.y; S.fl=e2.fl; S.ory=e2.ry; S.stuck=e2.stuck;
    if (S.ih<0 && dd<1.0){ S.s=5; S.wp=0; } }
  N.polView=[S.s,Math.round(S.arr),Math.round(S.cx*10)/10,Math.round(S.cz*10)/10,Math.round(S.cry*100)/100,Math.round(S.ox*10)/10,Math.round(S.oz*10)/10,Math.round((S.ory||0)*100)/100,S.ih,Math.round((S.y||0)*100)/100];
}
function polDraw(dt){
  var N=net, v=N.polView||[0], s=v[0]|0, t=clock.elapsedTime;
  polCar.visible=s>=2; if (polCar.visible){ polCar.position.set(num(v[2],0),0,num(v[3],0)); polCar.rotation.y=num(v[4],0)-Math.PI/2; var fl=Math.sin(t*12)>0; polCar.userData.hr.visible=fl; polCar.userData.hb.visible=!fl;
    if (s===2 && N.ih<0){ var dd=Math.hypot(polCar.position.x-P.x,polCar.position.z-P.z); if (dd<60 && Math.floor(t*1.5)!==Math.floor((t-dt)*1.5)) tone(720,0.6,'sine',0.05*(1-dd/60),960); } }
  var C=copRig(); if (C){ var on=(s===3 || s===4) && (num(v[8],-1)|0)===N.ih; C.g.visible=on;
    if (on){ var ox=num(v[5],0), oz=num(v[6],0); var mv=Math.hypot(ox-C.g.position.x,oz-C.g.position.z)/Math.max(dt,0.001); C.g.position.set(ox,(N.ih>=0?num(v[9],0):groundY(ox,oz)),oz); C.g.rotation.y=num(v[7],0); anim(C.rig,mv>5?'Run':(mv>0.5?'Walk':'Idle')); C.rig.mixer.update(dt); } }
}
function jailTick(dt,pl){
  var N=net, until=0; (N.jlView||[]).forEach(function(j){ if (Array.isArray(j) && j[0]===netMe) until=Math.max(until,num(j[1],0)); });
  if (game.role==='killer' && until>N.el){
    if (!N.jailed){ N.jailed=true; if (N.ih>=0){ N.ih=-1; moonLight.intensity=0.55; setLeaves(true); } P.x=JAIL.x; P.z=JAIL.z; P.y=0; toast('Arrested! You are locked in a cell for 30 seconds.',3500); thud(1.0); }
    P.x=Math.max(JAIL.x0,Math.min(JAIL.x1,P.x)); P.z=Math.max(JAIL.z0,Math.min(JAIL.z1,P.z)); netSafe('In jail · '+mmss(until-N.el)); }
  else if (N.jailed){ N.jailed=false; P.x=RELEASE.x; P.z=RELEASE.z; P.yaw=Math.PI; toast('They let you out. Back to the hunt.',2600); netSafe(null); }
}

/* ---------- killers break doors down ---------- */
function breakDoorFx(h){ if (h.netBroke) return; h.netBroke=true; h.pivot.visible=false; h.broken.visible=false; h.hall.visible=true; h.hall.material.color.copy(lin(h.power?0xffc070:0x05070c)); doorSplinters(h); moonLight.shadow.needsUpdate=true;
  var d=doorPt(h), dd=Math.hypot(d.x-P.x,d.z-P.z); if (dd<40 && !(net && net.ih>=0)){ noise(0.5,0.9*(1-dd/40),1800); thud(1.2*(1-dd/40)); } }
// broken boards left on the porch of a kicked-in door
function doorSplinters(h){ if (!h.splint){ var g=new THREE.Group(), m=h.pivot.children[0].material; h.g.add(g); h.splint=g;
    [[0.35,4.45,0.7,0.4],[-0.3,4.7,0.55,-0.7],[0.1,5.15,0.9,1.3],[0.55,4.9,0.4,2.2],[-0.55,4.35,0.3,0.2]].forEach(function(a,i){ var b=box(0.12,0.035,a[2],i%2?woodChipM:m,a[0],0,a[1],g); b.rotation.y=a[3]; b.rotation.z=(i%3-1)*0.12; tmpV.set(a[0],0,a[1]); h.g.localToWorld(tmpV); b.position.y=groundY(tmpV.x,tmpV.z)+0.02; }); }
  h.splint.visible=true; }
var woodChipM=mat(0xc8a070,{roughness:.8});
// wood chips that fly off the door when it is kicked
var chips=[]; function chipBurst(h,n,pow){ var i, c;
  for (i=0;i<n;i++){ c=chips.find(function(o){ return !o.on; }); if (!c){ c={m:box(0.05,0.03,0.16,i%3?woodChipM:h.pivot.children[0].material,0,0,0,scene),v:new THREE.Vector3(),on:false}; chips.push(c); }
    if (c.m.parent!==scene) scene.add(c.m); c.m.material=i%3?woodChipM:h.pivot.children[0].material;
    tmpV.set(0.25+Math.random()*0.35,0.7+Math.random()*0.9,4.15); h.g.localToWorld(tmpV); c.m.position.copy(tmpV); c.m.visible=true; c.on=true; c.t=0;
    var vx=(Math.random()-0.5)*2.2*pow, vz=(1.0+Math.random()*1.6)*pow, s=Math.sin(h.g.rotation.y), co=Math.cos(h.g.rotation.y);
    c.v.set(vx*co+vz*s,(1.2+Math.random()*2.2)*pow,-vx*s+vz*co); c.spin=(Math.random()-0.5)*20; } }
function chipsTick(dt){ chips.forEach(function(c){ if (!c.on) return; c.t+=dt; c.v.y-=9.8*dt; c.m.position.addScaledVector(c.v,dt); c.m.rotation.x+=c.spin*dt; c.m.rotation.y+=c.spin*0.7*dt;
  var gy=groundY(c.m.position.x,c.m.position.z)+0.02; if (c.m.position.y<gy){ c.m.position.y=gy; c.v.set(c.v.x*0.3,Math.abs(c.v.y)*0.2,c.v.z*0.3); c.spin*=0.4; } if (c.t>2.4){ c.on=false; c.m.visible=false; } }); }
// turn a bone about an axis given in world space
var _bq=new THREE.Quaternion(), _bp=new THREE.Quaternion(), _bax=new THREE.Vector3();
function boneTurnW(bone,axis,ang){ if (!bone || !bone.parent || !ang) return; bone.parent.updateMatrixWorld(true); bone.parent.getWorldQuaternion(_bp); _bq.setFromAxisAngle(axis,ang);
  var inv=_bp.clone().invert(); bone.quaternion.premultiply(inv.multiply(_bq).multiply(_bp)); bone.updateMatrixWorld(true); }
// the killer walks up to the door and kicks it in: three kicks, the third one breaks it
var KICKS=[{s:0.75,w:0.32,p:0.85},{s:1.9,w:0.32,p:1.0},{s:3.05,w:0.42,p:1.35}];
function startDoorBreak(h){
  var N=net, K=finRig(SAVE.kskin), d=doorPt(h), side=h.side; if (!K){ breakDoorFx(h); N.bd.push(houses.indexOf(h)); return enterHouseNow(h); }
  if (!K.legs){ var m=K.rig.m; K.legs={ru:m.getObjectByName('RightUpLeg'),rl:m.getObjectByName('RightLeg'),rf:m.getObjectByName('RightFoot'),lu:m.getObjectByName('LeftUpLeg'),sp:m.getObjectByName('Spine'),hips:m.getObjectByName('Hips'),la:m.getObjectByName('LeftArm'),ra:m.getObjectByName('RightArm')}; }
  N.brk={h:h,t:0,K:K,d:d,side:side,hit:0,sh:0}; closeChat(); setPrompt(null);
  K.g.visible=true; K.g.rotation.set(0,h.g.rotation.y+Math.PI,0); anim(K.rig,'Walk');
  setHud(false); ['safe','items','senseBtn','scareBtn','vanishBtn','btnSwing','team'].forEach(function(id){ $(id).hidden=true; }); vmKnife.visible=false;
  $('cine').hidden=false; $('cineText').textContent=''; $('cineSkip').hidden=true;
}
function doorBreakFrame(dt){
  var N=net, B=N.brk, K=B.K, t=(B.t+=dt), h=B.h, L=K.legs, i;
  ['safe','items','senseBtn','scareBtn','vanishBtn','btnSwing','team','objective'].forEach(function(id){ $(id).hidden=true; }); vmKnife.visible=false; vmL.visible=false;
  // where he stands: right in front of the door, a leg's length away
  var lz=4.82, lx=0.12;
  if (t<0.6){ lz=5.9-(5.9-4.82)*Math.sin(clamp01(t/0.6)*Math.PI/2); anim(K.rig,'Walk'); }
  else if (t>3.95){ var f=clamp01((t-3.95)/1.05); lz=4.82-f*1.15; anim(K.rig,'Walk'); }
  else anim(K.rig,'Idle');
  // the kick: chamber the knee, drive the heel into the door by the lock, pull back
  var thigh=0, knee=0, lean=0, push=0;
  for (i=0;i<KICKS.length;i++){ var k=KICKS[i], a=t-k.s;
    if (a<0 || a>k.w+0.55) continue;
    if (a<k.w){ var w=a/k.w, e=w*w*(3-2*w); thigh=-1.05*e; knee=1.75*e; lean=-0.1*e; push=-0.06*e; }
    else if (a<k.w+0.1){ var s2=(a-k.w)/0.1; thigh=-1.05-0.25*s2; knee=1.75-1.6*s2; lean=-0.1-0.14*s2; push=-0.06+0.2*s2; }
    else { var r=clamp01((a-k.w-0.1)/0.45), e2=1-(1-r)*(1-r); thigh=-1.3*(1-e2); knee=0.15+(1.1*Math.sin(r*Math.PI))*(1-r*0.5); knee*=1-e2*0.85; lean=-0.24*(1-e2); push=0.14*(1-e2); } }
  tmpV.set(lx,0,lz-push); h.g.localToWorld(tmpV); K.g.position.set(tmpV.x,groundY(tmpV.x,tmpV.z),tmpV.z);
  // the door: knocked in a little on each kick, burst open on the last
  for (i=0;i<KICKS.length;i++){ var ti=KICKS[i].s+KICKS[i].w+0.08; if (B.hit<i+1 && t>=ti){ B.hit=i+1; B.hitT=t; var last=i===2;
      thud(last?1.6:1.0+i*0.25); noise(last?0.35:0.14,last?0.9:0.55,last?700:1100); tone(last?55:70+i*8,0.25,'sine',0.4,30); shake(); B.sh=last?0.16:0.07+i*0.03;
      chipBurst(h,last?16:4+i*3,last?1.5:0.8);
      if (last){ var hi=houses.indexOf(h); if (N.bd.indexOf(hi)<0) N.bd.push(hi); } } }
  var ang=0, wob=0;
  if (B.hit>=1 && B.hit<3){ var ht=t-B.hitT, rest=B.hit===1?0.035:0.075, peak=B.hit===1?0.11:0.17; ang=rest+(peak-rest)*Math.exp(-ht*10)*Math.cos(ht*28); wob=Math.exp(-ht*12)*Math.sin(ht*60)*0.012; }
  if (B.hit>=3){ var ht2=t-B.hitT; ang=0.08+1.6*(1-Math.exp(-ht2*16)); if (ang>0.35 && !h.netBroke) h.hall.visible=true; }
  h.pivot.rotation.y=ang; h.pivot.position.z=4.05+wob; h.pivot.rotation.z=B.hit>=2?-0.012*B.hit:0;
  K.rig.mixer.update(dt);
  if (L && (thigh || knee || lean)){ K.g.updateMatrixWorld(true); _bax.set(1,0,0).applyQuaternion(K.g.quaternion);
    boneTurnW(L.sp,_bax,lean); boneTurnW(L.ru,_bax,thigh); boneTurnW(L.rl,_bax,knee); boneTurnW(L.rf,_bax,-knee*0.25);
    boneTurnW(L.lu,_bax,-lean*0.6); var arms=Math.min(1,-thigh); _bax.set(0,0,1).applyQuaternion(K.g.quaternion); boneTurnW(L.la,_bax,-0.35*arms); boneTurnW(L.ra,_bax,0.35*arms); }
  chipsTick(dt);
  // the camera watches from the side of the porch, a little behind him
  B.sh=Math.max(0,B.sh-dt*0.5); var sh=B.sh*(reduced?0:1), cz=6.45-Math.max(0,t-3.6)*0.3; torch.visible=false;
  tmpV.set(1.35+Math.sin(t*0.4)*0.08,2.05,cz); h.g.localToWorld(tmpV); camera.position.set(tmpV.x+(Math.random()-0.5)*sh,tmpV.y+(Math.random()-0.5)*sh,tmpV.z+(Math.random()-0.5)*sh);
  cineLook.set(-0.05,1.42,4.3); h.g.localToWorld(cineLook); camera.lookAt(cineLook);
  if (t>=5){ K.g.visible=false; N.brk=null; h.pivot.position.z=4.05; h.pivot.rotation.z=0; breakDoorFx(h); torch.visible=P.light; $('cine').hidden=true; $('cineSkip').hidden=false; setHud(true); vmKnife.visible=true; netEnterHouse(h); }
}

/* ---------- online: co-op stories and survival ---------- */
var net=null, NR=null, NP={}, netMe='me', netCap=null, lobby=null, avatars={};
var NIGHT=480, CARNEED=42, GENNEED=15, SGENS=[1,4,9,6], PW_NEED=5;
var BOY={n:'Boy',rig:'m',top:0xb3261c,bottom:0x2a3550,hair:0x4a3020,beard:false,skin:0xffffff,s:0.9,look:{hd:'cap',hatc:0x2a4a8a,w:0.92}};
var GIRL={n:'Girl',rig:'w',s:0.9,look:{sk:0xd8a888,hair:0x6a3a1a,top:0xe8e0d0,pants:0x4a6a9a,acc:0xd0a030,pat:0,w:0.94}};
var WREN={n:'Wren',rig:'w',s:0.9,look:{sk:0xcfd4dc,hair:0xe8e8ee,top:0x8a8a9a,pants:0x2a2a34,acc:0x8a8a9a,pat:0,w:0.92}};
var NETMODES={b:{t:'Boy & Girl',roles:['boy','girl'],names:{boy:'The Boy',girl:'The Girl'}},
              k:{t:'Killer & Girl',roles:['killer','girl'],names:{killer:'The Killer',girl:'The Girl'}},
              s:{t:'Kill Feast',roles:['s','k'],names:{s:'Survivor',k:'Killer'}}};
// On claude.ai the page is handed a live room; on its own server it talks to /ws instead.
function wsCap(){ return {join:function(name){ return new Promise(function(res,rej){
  var ws, peers={}, me=null, mine={}, ok=false;
  try { ws=new WebSocket((location.protocol==='https:'?'wss://':'ws://')+location.host+'/ws?room='+encodeURIComponent(name)); } catch(e){ return rej(e); }
  var room={ presence:function(p){ for (var k in p){ if (p[k]===null) delete mine[k]; else mine[k]=p[k]; } if (ws.readyState===1){ try { ws.send(JSON.stringify({t:'p',d:p})); } catch(e){} } return null; },
    peers:function(){ var out=[]; if (me) out.push({peer:me,isMe:true,sameTab:true,kind:'viewer',presence:mine}); for (var id in peers) out.push({peer:id,isMe:false,sameTab:false,kind:'viewer',presence:peers[id]}); return out; },
    leave:function(){ ok=true; try { ws.close(); } catch(e){} return null; }, closed:false };
  function merge(o,p){ for (var k in p){ if (p[k]===null) delete o[k]; else o[k]=p[k]; } }
  ws.onmessage=function(ev){ var m; try { m=JSON.parse(ev.data); } catch(e){ return; } if (!m || typeof m!=='object') return;
    if (m.t==='hi'){ me=String(m.id); peers={}; var ps=m.peers||{}; for (var id in ps) if (ps[id] && typeof ps[id]==='object') peers[id]=ps[id]; if (!ok){ ok=true; res(room); } }
    else if (m.t==='p' && m.id && m.d && typeof m.d==='object'){ var o=peers[m.id]||(peers[m.id]={}); merge(o,m.d); }
    else if (m.t==='bye') delete peers[m.id]; };
  ws.onerror=function(){ if (!ok){ ok=true; rej(new Error('ws')); } };
  ws.onclose=function(){ if (!ok){ ok=true; rej(new Error('ws')); } else { peers={}; room.closed=true; if (NR===room && (net || lobby)) toast('Connection to the room was lost.',5000); } };
}); }}; }
try { if (window.claude && window.claude.use) window.claude.use('room').then(function(r){ netCap=r; },function(){});
  else if (/^https?:$/.test(location.protocol) && window.WebSocket) netCap=wsCap(); } catch(e){}
function soloRoom(){ var me={peer:'solo',isMe:true,sameTab:true,kind:'viewer',presence:NP};
  return {solo:true, presence:function(){ return null; }, peers:function(){ return [me]; }, leave:function(){ return null; }}; }
function netSend(patch){ for (var k in patch){ if (patch[k]===null) delete NP[k]; else NP[k]=patch[k]; }
  try { var p=NR.presence(patch); if (p && p.catch) p.catch(function(){}); } catch(e){} }
function netPeers(){
  var out=[], ps=[], self=null; try { ps=NR.peers()||[]; } catch(e){}
  for (var i=0;i<ps.length;i++){ var p=ps[i]; if (!p || p.kind==='agent') continue; if (p.isMe && p.sameTab){ self=p; continue; } out.push({id:String(p.peer),me:false,pr:p.presence||{}}); }
  if (self) netMe=String(self.peer);
  out.push({id:netMe,me:true,pr:NP,known:!!self}); out.sort(function(a,b){ return a.id<b.id?-1:(a.id>b.id?1:0); }); return out;
}
function num(v,d){ return (typeof v==='number' && isFinite(v)) ? v : d; }
function nick(pr){ var s=typeof pr.n==='string'?pr.n:''; s=s.replace(/[^\w \-'.!?]/g,'').slice(0,12).trim(); return s||'Player'; }
function cloneSkinned(src){
  var map=new Map(), c=src.clone();
  (function par(a,b){ map.set(a,b); for (var i=0;i<a.children.length;i++) par(a.children[i],b.children[i]); })(src,c);
  map.forEach(function(n,s){ if (!s.isSkinnedMesh) return; n.skeleton=s.skeleton.clone(); n.bindMatrix.copy(s.bindMatrix);
    n.skeleton.bones=s.skeleton.bones.map(function(b){ return map.get(b); }); n.bind(n.skeleton,n.bindMatrix); });
  return c;
}
function makeNetRig(kind,sp,ks){
  var man=kind==='k' || sp.rig==='m', tpl=kind==='k'?NETTPL.k:(man?NETTPL.m:NETTPL.w), clips=man?NETTPL.mc:NETTPL.wc; if (!tpl || !clips) return null;
  var m=cloneSkinned(tpl), mats=[], beards=[], hats=[]; m.visible=true;
  m.traverse(function(o){ if (o.isMesh){ o.frustumCulled=false; o.castShadow=true; if (kind!=='k'){ o.material=o.material.clone(); var n=man?(o.material.name||''):'';
    if (/Beard/.test(n)) beards.push(o); if (/Headwear/.test(n)) hats.push(o); mats.push({name:n,mat:o.material}); } } });
  var rig={m:m,mixer:new THREE.AnimationMixer(m),actions:{},cur:'',mats:mats,beards:beards,hats:hats};
  Object.keys(clips).forEach(function(k){ rig.actions[k]=rig.mixer.clipAction(clips[k]); });
  if (kind==='k'){ m.updateMatrixWorld(true); var ws=new THREE.Vector3(), hd=m.getObjectByName('Head'), ha=m.getObjectByName('RightHand');
    var K=skinKiller(m,ks); if (hd){ hd.getWorldScale(ws); var hm=new THREE.Group(); hm.scale.setScalar(1/ws.x); var mk=makeMask(); mk.material=kMaskMat(K.mask); hm.add(mk); hm.position.set(MASK_POS[0]/ws.x,MASK_POS[1]/ws.x,MASK_POS[2]/ws.x); hd.add(hm); }
    if (ha){ ha.getWorldScale(ws); var kh=new THREE.Group(); kh.scale.setScalar(1/ws.x); kh.add(makeKnife()); kh.position.set(KNIFE_POS[0]/ws.x,KNIFE_POS[1]/ws.x,KNIFE_POS[2]/ws.x); kh.rotation.set(KNIFE_ROT[0],KNIFE_ROT[1],KNIFE_ROT[2]); ha.add(kh); }
  } else { if (!man) rig.baseMap=NETTPL.wmap; styleResident(sp,rig); }
  anim(rig,'Idle'); return rig;
}
function nameSprite(text){
  var t=canvasTex(256,64,function(g){ g.clearRect(0,0,256,64); g.font='bold 30px Georgia,serif'; g.textAlign='center'; g.textBaseline='middle'; g.lineWidth=6; g.strokeStyle='rgba(0,0,0,.85)'; g.strokeText(text,128,34); g.fillStyle='#ffd9a8'; g.fillText(text,128,34); });
  var s=new THREE.Sprite(new THREE.SpriteMaterial({map:t,transparent:true,depthWrite:false,fog:true})); s.scale.set(1.5,0.375,1); s.position.y=2.15; return s;
}
function avatarFor(id,kind,sp,label,ks){
  var key=kind+':'+(sp?sp.n:'')+':'+(label||'')+':'+(ks|0), a=avatars[id];
  if (a && a.key===key && (a.rig || !NETTPL.m)) return a;
  if (a) dropAvatar(id);
  a={key:key,g:new THREE.Group(),rig:makeNetRig(kind,sp,ks),x:0,z:0,ry:0,first:true,dead:false}; avatars[id]=a; scene.add(a.g);
  if (a.rig) a.g.add(a.rig.m); else { var b=cyl(0.2,0.24,1.25,10,mat(kind==='k'?0x1c2533:0x6a4a3a),0,0.85,0,a.g); var hd=new THREE.Mesh(new THREE.SphereGeometry(0.17,14,10),mat(0xb09a86)); hd.position.y=1.66; a.g.add(hd); }
  if (label){ a.tag=nameSprite(label); a.g.add(a.tag); }
  return a;
}
function dropAvatar(id){ var a=avatars[id]; if (!a) return; scene.remove(a.g); if (a.tag){ a.tag.material.map.dispose(); a.tag.material.dispose(); } delete avatars[id]; }
function avatarStep(a,dt,x,z,ry,an,dead,y){
  if (a.first){ a.x=x; a.z=z; a.ry=ry; a.first=false; }
  var k=Math.min(1,dt*10); if (Math.hypot(x-a.x,z-a.z)>8) k=1;
  a.x+=(x-a.x)*k; a.z+=(z-a.z)*k; var d=ry-a.ry; d=Math.atan2(Math.sin(d),Math.cos(d)); a.ry+=d*k;
  a.g.position.set(a.x,(y===undefined?groundY(a.x,a.z):y)+(dead?0.14:0),a.z); a.g.rotation.set(dead?-1.45:0,a.ry,0,'YXZ');
  if (a.tag) a.tag.visible=!dead;
  if (a.rig && !dead && a.g.visible){ anim(a.rig,an===2?'Run':(an===1?'Walk':'Idle')); a.rig.mixer.update(dt); if (a.scared) scaredIdle(a,dt,an===0); }
}
// A frightened stance layered over the idle: hunched, arms clutched in, shivering, head darting about.
function scaredIdle(a,dt,still){
  var B=a.B; if (!B){ var m=a.rig.m, pre=m.getObjectByName('mixamorigHead')?'mixamorig':'', g=function(n){ return m.getObjectByName(pre+n); };
    B=a.B={head:g('Head'),neck:g('Neck'),spine:g('Spine2')||g('Spine1'),la:g('LeftArm'),ra:g('RightArm'),lf:g('LeftForeArm'),rf:g('RightForeArm'),k:0,gy:0,gp:0,seed:Math.random()*50}; }
  if (!B.head || !B.spine) return;
  B.k+=((still?1:0)-B.k)*Math.min(1,dt*5); var k=B.k; if (k<0.01) return;
  var t=clock.elapsedTime+B.seed, fy=a.g.rotation.y, seg=Math.floor(t/0.85), h=Math.sin(seg*127.1+B.seed*3.3)*43758.5453; h-=Math.floor(h);
  var h2=Math.sin(seg*311.7+B.seed)*24634.63; h2-=Math.floor(h2);
  var ty=h<0.2?0:(h>0.9?(h2<0.5?-1.25:1.25):(h2-0.5)*1.5), tp=-0.1+(h-0.5)*0.16;
  B.gy+=(ty-B.gy)*Math.min(1,dt*10); B.gp+=(tp-B.gp)*Math.min(1,dt*10);
  var sh=Math.sin(t*33)*0.012+Math.sin(t*51.7)*0.008, br=Math.sin(t*4.6)*0.022;
  function tw(bone,ax,ang){ if (!bone || !ang) return; _lq.setFromAxisAngle(ax,ang); worldTwist(bone,_lq); }
  var R=new THREE.Vector3(-Math.cos(fy),0,Math.sin(fy));
  tw(B.spine,R,(-0.2+br)*k); tw(B.spine,UPV,(B.gy*0.22+sh)*k);
  tw(B.la,R,0.5*k); tw(B.ra,R,0.5*k);
  tw(B.lf,R,(1.25+sh*2)*k); tw(B.rf,R,(1.25-sh*2)*k); tw(B.lf,UPV,-0.85*k); tw(B.rf,UPV,0.85*k);
  var parts=B.neck?[[B.neck,0.4],[B.head,0.6]]:[[B.head,1]];
  for (var i=0;i<parts.length;i++){ var w=parts[i][1], y=fy+B.gy*k*(i?1:w); _ax.set(-Math.cos(y),0,Math.sin(y)); tw(parts[i][0],UPV,B.gy*w*k); tw(parts[i][0],_ax,(B.gp+0.14+sh)*w*k); }
}
function netArrow(t){ var dx=t.x-P.x, dz=t.z-P.z, d=Math.hypot(dx,dz), f=fwd(), a=Math.atan2(dx*Math.cos(P.yaw)-dz*Math.sin(P.yaw), dx*f.x+dz*f.z), i=((Math.round(a/(Math.PI/4))%8)+8)%8; return '  '+ARROWS[i]+' '+Math.round(d)+' m'; }
function netObj(title,text,target){
  var N=net; N.objT-=1; if (N.objT>0 && N.lastObj===title+text) return; N.objT=20; N.lastObj=title+text;
  var el=$('objective'); el.textContent=''; var b=document.createElement('b'); b.textContent=title; el.appendChild(b); el.appendChild(document.createTextNode(text+(target?netArrow(target):'')));
  beacon.visible=!!target; if (target) beacon.position.set(target.x,0,target.z);
}
function netSafe(text){ var el=$('safe'); if (!text){ if (!el.hidden) el.hidden=true; return; } el.hidden=false; el.textContent=text; }
function mmss(s){ s=Math.max(0,Math.ceil(s)); return '0:'+('0'+s).slice(-2); }

/* lobby */
var netDir=null, dirBusy=false, findTimer=0, findKey='';
function netName(){ var nm=($('netName').value||'').replace(/[^\w \-'.!?]/g,'').slice(0,12).trim()||'Player'; if (SAVE.nick!==nm){ SAVE.nick=nm; save(); } return nm; }
// One shared room works as the notice board where open rooms are posted.
function dirOpen(){
  if (netDir && netDir.closed) netDir=null;
  if (netDir || dirBusy || !netCap || !netCap.join) return; dirBusy=true;
  try { netCap.join('fn-lobby').then(function(R){ netDir=R; dirBusy=false; },function(){ dirBusy=false; }); } catch(e){ dirBusy=false; }
}
function dirSend(p){ if (!netDir) return; try { var r=netDir.presence(p); if (r && r.catch) r.catch(function(){}); } catch(e){} }
function dirRooms(){
  var out={}, ps=[]; if (!netDir) return []; try { ps=netDir.peers()||[]; } catch(e){}
  ps.forEach(function(p){ var r=p && p.presence && p.presence.rm; if (!r || typeof r!=='object' || (p.isMe && p.sameTab)) return;
    var c=String(r.c||'').toLowerCase().replace(/[^a-z0-9]/g,'').slice(0,10); if (!c || r.m!=='s') return;
    var n=Math.max(1,Math.min(12,num(r.n,1)|0)); if (!out[c] || n>out[c].n) out[c]={c:c,m:r.m,n:n,h:nick({n:r.h}),g:r.g?1:0}; });
  return Object.keys(out).sort().map(function(k){ return out[k]; });
}
function newCode(){ var L='ABCDEFGHJKLMNPQRSTUVWXYZ', c=''; for (var i=0;i<4;i++) c+=L[(Math.random()*L.length)|0]; return c; }
function netJoin(code,mode){
  var nm=netName(); code=String(code||'').toLowerCase().replace(/[^a-z0-9]/g,'').slice(0,10); if (!code || lobby || net) return;
  if (findTimer){ clearInterval(findTimer); findTimer=0; }
  var go=function(R,note){ NR=R; NP={}; netMe=R.solo?'solo':'me';
    lobby={mode:'s',code:code,gid:0,want:null,note:note||'',timer:0,mt:mode?Date.now():0,adT:0,fill:true,bt:0,map:'lane',mpt:0}; lobby.want=NETMODES[lobby.mode].roles[0];
    var p={n:nm,sk:SAVE.equipped,w:lobby.want,v:2}; if (mode) p.md={m:'s',t:lobby.mt}; netSend(p);
    lobbyUI(); show('lobby'); lobby.timer=setInterval(lobbyTick,300); lobbyTick(); };
  toast('Connecting…',2500);
  if (netCap && netCap.join){ var done=false, to=setTimeout(function(){ if (!done){ done=true; go(soloRoom(),'Could not reach the room, so you are playing alone.'); } },9000);
    try { netCap.join('fn-r-'+code).then(function(R){ if (done){ try { R.leave(); } catch(e){} return; } done=true; clearTimeout(to); go(R); },
      function(){ if (done) return; done=true; clearTimeout(to); go(soloRoom(),'Could not connect to the room, so you are playing alone.'); }); }
    catch(e){ if (!done){ done=true; clearTimeout(to); go(soloRoom(),'Online rooms are not available here, so you are playing alone.'); } } }
  else go(soloRoom(),'Online is not available from here, so you are playing alone.');
}
function setLobbyMode(m,t){ lobby.mode=m; lobby.mt=t; if (NETMODES[m].roles.indexOf(lobby.want)<0) lobby.want=NETMODES[m].roles[0]; netSend({md:{m:m,t:t},w:lobby.want}); lobbyUI(); }
var FEAST_K=1, FEAST_S=4;
function setMap(m,t,quiet){ lobby.map=m; lobby.mpt=t; netSend({mp:{m:m,t:t}}); if (!quiet){ lobbyUI(); lobbyTick(); } }
function setFill(f,t,quiet){ lobby.fill=!!f; lobby.bt=t; netSend({bt:{f:f?1:0,t:t}}); if (!quiet){ lobbyUI(); lobbyTick(); } }
// Every real player is a survivor (at most 4); the killer is always the AI.
function feastRoles(ps,fill){
  // every player is a survivor; the killer is always the AI
  ps=ps.slice().sort(function(a,b){ return a.id<b.id?-1:(a.id>b.id?1:0); }).slice(0,FEAST_S);
  var roles={}; ps.forEach(function(p){ roles[p.id]='s'; });
  return {roles:roles, bots:{k:FEAST_K, s:fill?FEAST_S-ps.length:0}};
}
function lobbyUI(){
  var bs=$('lobBots'); bs.textContent=''; bs.hidden=false; $('lobBotLab').hidden=false;
  [['Fill empty seats with bots',true],['No survivor bots',false]].forEach(function(d){ var b=document.createElement('button'); b.type='button'; b.textContent=d[0]; b.setAttribute('aria-pressed',String(lobby.fill===d[1]));
    b.addEventListener('click',function(){ if (lobby && lobby.fill!==d[1]) setFill(d[1],Date.now()); }); bs.appendChild(b); });

  var M=NETMODES[lobby.mode], seg=$('lobSeg'), ms=$('lobMode'); seg.textContent=''; ms.textContent='';
  ['s'].forEach(function(m){ var b=document.createElement('button'); b.type='button'; b.textContent=NETMODES[m].t; b.setAttribute('aria-pressed',String(lobby.mode===m));
    b.addEventListener('click',function(){ if (lobby && lobby.mode!==m){ setLobbyMode(m,Date.now()); lobbyTick(); } }); ms.appendChild(b); });
  $('lobTitle').textContent='Room '+lobby.code.toUpperCase();
}
function lobbyTick(){
  if (!lobby) return; var ps=netPeers(), ul=$('lobList'), best=null, known=true, nm=null, nt=lobby.mt;
  ps.forEach(function(p){ var d=p.pr.md; if (!p.me && d && typeof d==='object' && d.m==='s' && num(d.t,0)>nt){ nt=d.t; nm=d.m; } });
  if (nm) setLobbyMode(nm,nt);
  var nb=null, nbt=lobby.bt; ps.forEach(function(p){ var d=p.pr.bt; if (!p.me && d && typeof d==='object' && num(d.t,0)>nbt){ nbt=d.t; nb=d; } });
  if (nb){ setFill(nb.f!==0,nbt,true); lobbyUI(); }
  var nmp=null, nmpt=lobby.mpt||0; ps.forEach(function(p){ var d=p.pr.mp; if (!p.me && d && typeof d==='object' && num(d.t,0)>nmpt && MAPS.some(function(x){ return x.id===d.m; })){ nmpt=d.t; nmp=d.m; } });
  if (nmp){ setMap(nmp,nmpt,true); lobbyUI(); }
  var M=NETMODES[lobby.mode]; ul.textContent='';
  ps.forEach(function(p){ var li=document.createElement('li'), w='Survivor';
    li.textContent=nick(p.pr)+(p.me?' (you)':'')+' · '+w+(p.pr.gi?' · in a game':''); ul.appendChild(li);
    if (p.me && p.known===false && !NR.solo) known=false;
    var g=p.pr.go; if (g && typeof g==='object' && num(g.id,0)>lobby.gid && g.roles && typeof g.roles==='object' && (!best || g.id>best.id)) best=g; });
  var pv=feastRoles(ps.filter(function(p){ return !p.pr.gi; }),lobby.fill); lobby.bots=pv.bots;
  if (ps.length>FEAST_K+FEAST_S){ var full=document.createElement('li'); full.textContent=(ps.length-FEAST_K-FEAST_S)+' waiting: the game holds 4 players'; ul.appendChild(full); }
  if (lobby.mode==='s'){ var bi; for (bi=0;bi<lobby.bots.s;bi++){ var ls=document.createElement('li'); ls.textContent='Bot · Survivor'; ul.appendChild(ls); } }
  $('lobInfo').textContent=(lobby.note?lobby.note+' ':'')+M.t+' · '+mapName(lobby.map||'lane')+' · '+ps.length+' in the lobby'+' · 4 survivors against an AI killer'+'. Friends can find this room under Find Room, or join with the code '+lobby.code.toUpperCase()+'.';
  $('lobStart').disabled=!known;
  lobby.adT-=0.3; if (lobby.adT<=0 && !NR.solo){ lobby.adT=1.5; dirOpen(); dirSend({rm:{c:lobby.code,m:lobby.mode,n:ps.length,h:nick(ps[0].pr),g:0}}); }
  if (best && (Date.now()-best.id<NIGHT*1000+600000)){ if (best.roles[netMe]) netBegin(best); else { lobby.gid=best.id; lobby.note='That game was full (4 survivors). You are in line for the next one.'; } }
}
function findOpen(){ netName(); dirOpen(); findKey=''; show('netFind'); if (findTimer) clearInterval(findTimer); findTimer=setInterval(findTick,500); findTick(); }
function findTick(){
  if ($('netFind').hidden){ clearInterval(findTimer); findTimer=0; return; }
  dirOpen(); var rs=dirRooms(), key=JSON.stringify(rs)+(netDir?1:0); if (key===findKey) return; findKey=key;
  var ul=$('findList'); ul.textContent='';
  $('findInfo').textContent=!netCap?'Online is not available from here.':(!netDir?'Looking for rooms…':(rs.length?'Tap a room to join it.':'No open rooms right now. Create one and it will show up here for everyone else.'));
  rs.forEach(function(r){ var li=document.createElement('li'), b=document.createElement('button'); b.type='button'; b.className='mbtn';
    b.textContent=r.c.toUpperCase()+' · '+NETMODES[r.m].t+' · '+r.n+(r.n===1?' player':' players')+' · host '+r.h+(r.g?' · in a game':'');
    b.addEventListener('click',function(){ netJoin(r.c,null); }); li.appendChild(b); ul.appendChild(li); });
}
function lobbyStart(){
  if (!lobby) return; var ps=netPeers().filter(function(p){ return !p.pr.gi; }), M=NETMODES[lobby.mode], roles={}, i, bots={k:0,s:0};
  if (lobby.mode==='s'){ var fr=feastRoles(ps,lobby.fill); roles=fr.roles; bots=fr.bots;
  } else { var a=M.roles[0], b=M.roles[1], used={};
    ps.forEach(function(p){ var w=p.pr.w===b?b:a; if (!used[w]){ used[w]=1; roles[p.id]=w; } });
    ps.forEach(function(p){ if (!roles[p.id]){ var r=!used[a]?a:b; used[r]=1; roles[p.id]=r; } });
    if (ps.length===1 && lobby.mode==='k') roles[ps[0].id]='killer'; }
  netSend({go:{id:Date.now(),mode:lobby.mode,roles:roles,bots:bots,map:lobby.map||'lane'}}); lobbyTick();
}
function netLeave(){
  if (CHASE && AC){ CHASE.g.gain.setTargetAtTime(0,AC.currentTime,0.2); CHASE.hi.gain.setTargetAtTime(0,AC.currentTime,0.2); CHASE.lvl=0; }
  micStop(); $('micBar').hidden=true;
  if (lobby && lobby.timer) clearInterval(lobby.timer); lobby=null; dirSend({rm:null});
  for (var id in avatars) dropAvatar(id);
  if (net){ FX.hemi=scene.environment?0.36:0.42; scene.fog.color.copy(lin(FOG)); resident.g.visible=false; resident.dead=false; beacon.visible=false; $('safe').hidden=true; }
  if (net && net.ih>=0){ moonLight.intensity=0.55; setLeaves(true); } stairsOpen(false); polCar.visible=false; if (polCop) polCop.g.visible=false; closeChat();
  net=null; game.net=null; hpBar(false); clearItems(); applyMap('lane'); vanReset(); $('team').hidden=true; $('senseBtn').hidden=true; $('scareBtn').hidden=true; $('vanishBtn').hidden=true;
  if (NR){ try { var p=NR.leave(); if (p && p.catch) p.catch(function(){}); } catch(e){} } NR=null; NP={};
}
function netToLobby(){
  if (!net || !NR) return leaveToMenu(); var mode=net.mode, gid=net.gid, code=net.code;
  for (var id in avatars) dropAvatar(id);
  FX.hemi=scene.environment?0.36:0.42; scene.fog.color.copy(lin(FOG)); resident.g.visible=false; resident.dead=false; beacon.visible=false; if (net.ih>=0){ moonLight.intensity=0.55; setLeaves(true); } stairsOpen(false); polCar.visible=false; if (polCop) polCop.g.visible=false; closeChat(); net=null; game.net=null; applyMap('lane'); vanReset();
  game.role='victim'; reset(); stalkerOff(14); game.mode='menu'; setHud(false); backdrop();
  netSend({gi:null,go:null,a:null,st:null,f:null,hp:null,o:null,k:null,ek:null,e:null,pv:null,p:null,el:null,r:null});
  lobby={mode:mode,code:code,gid:gid,want:NP.w||NETMODES[mode].roles[0],note:'',timer:0,mt:(NP.md&&NP.md.t)||0,adT:0,fill:!(NP.bt&&NP.bt.f===0),bt:(NP.bt&&NP.bt.t)||0,map:(NP.mp&&NP.mp.m)||'lane',mpt:(NP.mp&&NP.mp.t)||0}; lobbyUI(); show('lobby'); lobby.timer=setInterval(lobbyTick,300); lobbyTick();
}

/* stages for the two co-op stories */
function pwFix(N,hi){ N.pw=N.pw.filter(function(e){ return !(Array.isArray(e) && e[0]===hi); }); N.pw.push([hi,Math.round(N.el*10)/10]); }
function genPt(i){ return {x:houses[i].gen.x,z:houses[i].gen.z}; }
var COOP={
 b:{title:'Boy & Girl',gens:[2,7],spawn:{boy:[-61,-1.2],girl:[-61,1.4]},
  intro:function(){ return [
    {cam:[-80,9,10],to:[-70,6,8],look:[-64,1,2.6],text:'October 31. A brother and sister take the short cut home through Hollow Lane.'},
    {cam:[-60,1.6,6],to:[-61,1.5,5],look:[-64,1,2.6],text:'The car coughs once and dies under the last street lamp. The gate at the far end is already shut.'},
    {cam:[20,3,0],look:[60,2,0],text:'Somewhere down the lane, somebody starts walking. Stay together.'}]; },
  outro:function(){ return [
    {cam:[60,4,5],to:[66,3,4],look:[73,1.6,0],text:'The gate swings open and the two of them run until the lane is only a dark line behind them.',fn:gateOpenNow},
    {cam:[-128,3,8],look:[-146,9,25],text:'Neither of them ever takes the short cut again.',fn:bell}]; },
  st:[
   {n:'Stalled',t:'both',o:'Both of you: meet at the car',pt:function(){ return CARSIDE; },r:4.5},
   {n:'Fumes',t:'fetch',o:'Someone grab the gas can at the station',pt:function(){ return GAS; },item:'gas',say:'The can is by the pumps.'},
   {n:'Keep Watch',t:'split',o:'One pours the gas at the car while the other keeps watch under the street lamp',pt:function(){ return CARSIDE; },pt2:function(){ return {x:-50,z:0}; },T:8,lab:'Pouring the gas',say:'One at the car, one under the lamp.'},
   {n:'Dead Battery',t:'fetch',o:'The battery is dead. Find the spare behind the house with the truck',pt:batPos,item:'bat'},
   {n:'Jump Start',t:'hold',o:'Fit the battery at the car. It is quicker together',pt:function(){ return CARSIDE; },T:12,lab:'Fitting the battery'},
   {n:'The Gate',t:'both',o:'The engine turns over. Both of you: get to the gate',pt:function(){ return {x:68,z:0}; },r:5,say:'The gate box is dead. It needs power from two houses.'},
   {n:'First Light',t:'hold',o:'Fix the generator behind the first dark house',pt:function(){ return genPt(2); },T:12,lab:'Fixing the generator',gen:2},
   {n:'Second Light',t:'hold',o:'Fix the generator behind the second dark house',pt:function(){ return genPt(7); },T:12,lab:'Fixing the generator',gen:7},
   {n:'Hold It Open',t:'split',o:'One holds the lever while the other pushes the gate',pt:function(){ return LEVER; },pt2:function(){ return {x:70.5,z:-2.5}; },T:10,lab:'Opening the gate',gate:true},
   {n:'Run',t:'both',o:'Both of you: run out through the gate',pt:function(){ return {x:84,z:0}; },r:5}]},
 k:{title:'Killer & Girl',gens:[],spawn:{killer:[-140,16],girl:[-138,18]},
  intro:function(){ return [
    {cam:[GRAVE.x+3,2.2,GRAVE.z-5],to:[GRAVE.x+2,1.6,GRAVE.z-3.6],look:[GRAVE.x,0.6,GRAVE.z],text:'In 1978 Hollow Lane locked its gate on two children. Only one of them got a headstone.'},
    {cam:[-128,3,8],look:[-146,9,25],text:'His sister Wren never left. Nobody on the lane can see her until she knocks.'},
    {cam:[-20,10,0],to:[-10,7,0],look:[40,1,0],text:'Tonight she knocks, and her brother does the rest.'}]; },
  outro:function(){ return [
    {cam:[-20,12,0],to:[-40,9,0],look:[20,1,0],text:'By morning every porch light on Hollow Lane is out.'},
    {cam:[-128,3,8],look:[-146,9,25],text:'Two children walk back to the churchyard, hand in hand. Until next October.',fn:bell}]; },
  st:[
   {n:'Together',t:'both',o:'Meet at the grave in the churchyard',pt:function(){ return GRAVE; },r:5},
   {n:'First Knock',t:'lure',h:3,o:'Girl: knock at the door. Killer: be ready when they run'},
   {n:'In The Dark',t:'split',who:'killer',o:'Killer tears out the generator while the girl keeps watch on the road',pt:function(){ return genPt(5); },pt2:function(){ return {x:houses[5].x,z:0}; },T:8,lab:'Tearing out the generator',gen:5,gk:true},
   {n:'Second Knock',t:'lure',h:5,o:'Girl: knock at the dark house. Killer: wait by the porch'},
   {n:'The Bell',t:'hold',who:'girl',o:'Girl: ring the chapel bell so nobody hears the rest',pt:function(){ return CHAPEL; },T:7,lab:'Ringing the bell',bell:true},
   {n:'Night Shift',t:'lure',h:-1,o:'Girl: tap on the station window. Killer: wait at the pumps'},
   {n:'Third Knock',t:'lure',h:8,o:'Girl: knock one more door. Killer: do not let them reach the gate'},
   {n:'Nobody Leaves',t:'split',who:'killer',o:'Killer holds the gate shut while the girl jams the lever',pt:function(){ return {x:69,z:0}; },pt2:function(){ return LEVER; },T:8,lab:'Jamming the gate'},
   {n:'Home',t:'both',o:'Walk back to the gazebo in the park together',pt:function(){ return GAZEBO; },r:5}]}
};
function lurePt(S){ return S.h<0 ? {x:-88.2,z:0} : doorPt(houses[S.h]); }

/* start, end */
function netBegin(go){
  if (lobby && lobby.timer) clearInterval(lobby.timer);
  var mode='s', code=lobby.code, M=NETMODES[mode], role=go.roles[netMe]; if (M.roles.indexOf(role)<0) role=mode==='s'?'s':'girl';
  lobby=null;
  net={mode:mode,code:code,role:role,gid:go.id,roles:go.roles,t0:performance.now(),el:0,st:0,f:0,hits:0,hp:3,alive:1,acc:{},spd:1,
       E:{x:0,z:0,ry:0,vis:0,cool:mode==='s'?22:30,lost:0,stuck:0,mv:0},ek:{},k:{},o:{g:0,b:0,c:0,gn:{}},hold:[0,0],sendT:0,cd:0,slow:0,boost:0,inv:0,objT:0,lastObj:'',
       prey:null,esc:0,over:false,stT:0,lx:0,lz:0,an:0,done:false,spec:0,kills:0,world:{},bots:[],held:null,bd:[],nd:[],brk:null,kn:0,cs:[],cl:[],pw:[],cut:{},cutView:{},wiring:null,chKey:null,chT:0,traps:[],tt:[],kh:{},stun:0,nearChest:-1,khSeen:0,hc:0,knock:null,kd:null,nearDoor:null};
  houses.forEach(function(h){ h.netCd=0; });
  clearItems(); applyMap('lane'); buildChests(); applyMap(MAPS.some(function(x){ return x.id===go.map; })?go.map:'lane'); net.map=curMap;
  net.vanOut=false; net.vanBots=false; net.lastCy=null; vanReset();
  if (mode==='s' && go.bots && typeof go.bots==='object'){ var hk2=0, hs2=0; for (var rid in go.roles){ if (go.roles[rid]==='k') hk2++; else hs2++; }
    botsInit(net,Math.max(0,Math.min(FEAST_K-hk2,num(go.bots.k,0)|0)),Math.max(0,Math.min(FEAST_S-hs2,num(go.bots.s,0)|0))); }
  game.net=net; game.role=(role==='k'||role==='killer')?'killer':'victim'; initAudio(); reset(); stairsOpen(true); if (net.mode==='s') gateOpenNow(); net.ih=-1; P.fl=0; P.y=0; houses.forEach(function(h){ h.netHid=false; h.netAsked=false; h.netBroke=false; h.netDead=false; h.netPool=false; }); polCar.visible=false; if (polCop) polCop.g.visible=false; closeChat(); story.hold=null; story.tearH=null; surv.active=false; setChain(false); stalkerOff(1e9);
  gasCan.visible=battery.visible=keysG.visible=leverG.visible=truckG.visible=boxG.visible=false; moveCar(-64,2.6); allPower(true); resident.g.visible=false; resident.dead=false;
  var ids=Object.keys(go.roles).sort(), idx=Math.max(0,ids.indexOf(netMe)), sp;
  if (mode==='s'){ if (role==='k'){ sp=[60-idx*2,idx%2?3:-3]; P.yaw=Math.PI/2; } else { sp=[-60+(idx%3)*1.6,-1.5+((idx/3)|0)*2.6]; P.yaw=-Math.PI/2; } houses.forEach(function(h){ setPower(h,false); }); }
  else { var C=COOP[mode]; sp=C.spawn[role]; P.yaw=-Math.PI/2; C.gens.forEach(function(h){ setPower(houses[h],false); }); }
  if (mode==='s'){ vanSeats(net); net.bots.forEach(function(b){ if (b.role==='s') fleetBot(b); });
    if (role!=='k'){ var si=net.seats[netMe]||0, vp=vanSeatPos(si,false); sp=[vp.x,vp.z]; P.yaw=Math.PI/2; P.pitch=-0.05; P.crouch=true; P.y=0.27; P.gy=0.27; P.eye=1.0; crouchUI(); } }
  P.x=sp[0]; P.z=sp[1]; net.sx=sp[0]; net.sz=sp[1]; moonLight.shadow.needsUpdate=true;
  show(null); if (master) master.gain.value=0.9; if (game.role==='killer') setupKiller();
  netSend({ks:SAVE.kskin|0,gi:go.id,go:go,r:role,a:1,st:0,f:0,hp:null,o:null,k:null,ek:null,e:null,pv:null,el:0,p:[P.x,P.z,P.yaw,0]});
  var mn=mapName(curMap), shots = mode==='s' ? [
    {cam:[110,1.25,-7],to:[114,1.35,-6],look:[128,0.9,-0.5],dur:4.5,text:'You clean houses for a living. Tonight’s job is every house on '+mn+'.'},
    {cam:[24,1.6,5.2],to:[-4,1.6,5.2],look:[-18,1.7,15],dur:4.5,text:'The power is out on the whole street. Fix the generators, then wash the dishes, sweep, mop, take out the trash.'},
    {cam:[-54.5,1.6,1.6],to:[-57.5,1.6,2.8],look:[-67,0.6,9],dur:4,text:'Everyone drives their own car. Park in the lot at the end of the lane. You are not alone out here.'}] : COOP[mode].intro();
  playCut(shots,netResume);
  if (mode!=='s') netStageWorld();
}
/* ---------- your microphone: talk too loud and the killer hears where you are ---------- */
var MIC={on:false,muted:false,denied:false,busy:false,lvl:0,loud:0,an:null,buf:null,stream:null}, MIC_TH=0.45;
function micStart(){ if (MIC.on || MIC.busy) return; MIC.busy=true;
  try { if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw 0; initAudio();
    navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:false,autoGainControl:false}}).then(function(st){ MIC.busy=false; if (!AC){ st.getTracks().forEach(function(t){ t.stop(); }); return; }
      var src=AC.createMediaStreamSource(st), an=AC.createAnalyser(); an.fftSize=1024; src.connect(an); MIC.an=an; MIC.buf=new Float32Array(an.fftSize); MIC.stream=st; MIC.on=true; MIC.denied=false; MIC.muted=false; })
    .catch(function(){ MIC.busy=false; MIC.denied=true; });
  } catch(e){ MIC.busy=false; MIC.denied=true; } }
function micStop(){ if (MIC.stream) try { MIC.stream.getTracks().forEach(function(t){ t.stop(); }); } catch(e){} MIC.on=false; MIC.an=null; MIC.stream=null; MIC.lvl=0; MIC.loud=0; }
function micTick(dt){ var bar=$('micBar'), N=net, show=!!(N && N.mode==='s' && game.mode==='play' && game.role!=='killer' && N.alive===1);
  if (bar.hidden===show) bar.hidden=!show; if (!N) return; if (!show){ N.micLoud=false; return; }
  var lv=0; if (MIC.on && MIC.an && !MIC.muted){ MIC.an.getFloatTimeDomainData(MIC.buf); var sum=0; for (var i=0;i<MIC.buf.length;i++) sum+=MIC.buf[i]*MIC.buf[i]; lv=Math.min(1,Math.sqrt(sum/MIC.buf.length)*5.5); }
  MIC.lvl+=(lv-MIC.lvl)*(lv>MIC.lvl?0.6:0.12); if (MIC.lvl>MIC_TH) MIC.loud=1.5; MIC.loud=Math.max(0,MIC.loud-dt); N.micLoud=MIC.loud>0;
  $('micFill').style.width=Math.round(MIC.lvl*100)+'%'; bar.classList.toggle('loud',N.micLoud); bar.classList.toggle('off',!MIC.on || MIC.muted);
  var t=!MIC.on?(MIC.denied?'MIC BLOCKED · TAP':'MIC OFF · TAP'):(MIC.muted?'MIC MUTED':(N.micLoud?'LOUD · HE HEARS YOU':'MIC')); if ($('micLab').textContent!==t) $('micLab').textContent=t; }
(function(){ var bar=$('micBar'); function tap(e){ e.preventDefault(); e.stopPropagation(); if (!MIC.on) micStart(); else { MIC.muted=!MIC.muted; toast(MIC.muted?'Mic muted.':'Mic on. Keep your voice down.',1600); } }
  bar.addEventListener('click',tap); bar.addEventListener('touchend',tap,{passive:false}); bar.addEventListener('keydown',function(e){ if (e.key==='Enter'||e.key===' ') tap(e); }); })();
function netResume(){ if (!net) return; if (net.mode==='s' && !MIC.on && !MIC.denied) micStart(); game.mode='play'; game.paused=false; setHud(true); vm.visible=game.role!=='killer' && net.alive===1; vmKnife.visible=game.role==='killer'; setLight(P.light); net.objT=0; net.lastObj=''; if (!isTouch && !document.pointerLockElement) lock(); }
function netOver(title,text,win){ if (CHASE && AC) CHASE.g.gain.setTargetAtTime(0,AC.currentTime,0.3), CHASE.hi.gain.setTargetAtTime(0,AC.currentTime,0.3), CHASE.lvl=0;
  if (!net || net.over) return; net.over=true; var gain=win?20:10; SAVE.tokens+=gain; tokLog(gain,(win?'Won':'Played')+' a Kill Feast · '+title); save();
  var fin=function(){ closeChat(); game.mode='over'; setHud(false); hpBar(false); $('items').hidden=true; $('team').hidden=true; $('senseBtn').hidden=true; $('scareBtn').hidden=true; $('vanishBtn').hidden=true; setPrompt(null); setPrompt(null); $('safe').hidden=true; $('fear').style.opacity=0; beacon.visible=false; keys={}; touchMove.x=touchMove.y=0; moveId=lookId=null;
    wasLocked=false; if (document.exitPointerLock) try { document.exitPointerLock(); } catch(e){}
    $('neTitle').textContent=title; $('neText').textContent=text; $('neReward').textContent='+'+gain+' tokens for '+(win?'winning':'playing')+' · you have '+SAVE.tokens+' tokens'; show('netEnd'); };
  if (net.mode!=='s' && win) playCut(COOP[net.mode].outro(),fin); else fin();
}

/* world state that follows from the stage number */
function netStageWorld(){
  var N=net, C=COOP[N.mode], S=C.st[N.st]; if (!S) return;
  gasCan.visible=false; battery.visible=false;
  if (S.item==='gas') showItem(gasCan,S.pt()); if (S.item==='bat') showItem(battery,S.pt());
  C.st.forEach(function(q,i){ if (q.gen===undefined) return; var on=q.gk ? i>=N.st : i<N.st; if (houses[q.gen].power!==on) setPower(houses[q.gen],on); });
  moonLight.shadow.needsUpdate=true;
  var gi=-1; C.st.forEach(function(q,i){ if (q.gate) gi=i; }); if (gi>=0 && N.st>gi && !game.gateOpening) openGate();
  if (N.mode==='k' && S.t!=='lure' && !N.keepBody){ }
}
function netHurt(){ gore(); stabSound(); shake(); var hf=fwd(); bloodBurst(camera.position.x+hf.x*0.5,camera.position.y-0.2,camera.position.z+hf.z*0.5,-hf.x,-hf.z,60); bloodPool(P.x,(P.y||P.gy||0),P.z,0.7); $('flash').style.opacity=0.5; setTimeout(function(){ $('flash').style.opacity=0; },260); }

/* the frame */
function netTick(dt){
  var N=net; if (!N || N.over) return;
  var ps=netPeers(), i, maxSt=N.st, maxF=N.f, maxEl=0, hostId=null, pl=[], me=null, hitsK=0, hitsE=0, seen={};
  N.el=(performance.now()-N.t0)/1000;
  for (i=0;i<ps.length;i++){ var p=ps[i], pr=p.pr; if (pr.gi!==N.gid) continue;
    var role=p.me?N.role:(N.roles[p.id]||pr.r), q={id:p.id,me:p.me,role:role,pr:pr,alive:p.me?N.alive===1:pr.a===1,a:p.me?N.alive:num(pr.a,1)};
    if (p.me){ q.x=P.x; q.z=P.z; q.ih=N.ih; q.y=P.y||0; q.hid=!!N.hide; me=q; } else { var pp=pr.p; if (!pp || !pp.length) continue; q.ih=Math.max(-1,Math.min(houses.length-1,num(pr.ih,-1)|0)); q.y=Math.max(0,Math.min(8,num(pr.fy,0))); q.hid=!!pr.hid; q.x=Math.max(-160,Math.min(410,num(pp[0],0))); q.z=Math.max(-40,Math.min(40,num(pp[1],0))); q.yaw=num(pp[2],0); q.an=num(pp[3],0)|0; }
    if (hostId===null) hostId=p.id; pl.push(q); seen[p.id]=1;
    if (!p.me && pr.bl===1 && N.el>NIGHT*0.45) N.el=Math.max(N.el,NIGHT*0.5+0.01);
    if (!p.me){ maxSt=Math.max(maxSt,Math.min(99,num(pr.st,0)|0)); maxF=Math.max(maxF,num(pr.f,0)|0); maxEl=Math.max(maxEl,num(pr.el,0)); }
    var A=N.acc[p.id]||(N.acc[p.id]={g:0,b:0,c:0,gn:{},k:0,ek:0,hold:[0,0],kb:{},cs:[],tp:[],tt:[],kh:{},khb:{},cl:[],pw:[]});
    if (N.mode==='s'){ var cs=p.me?N.cs:pr.cs, tp=p.me?N.traps:pr.tp, tt=p.me?N.tt:pr.tt, kh=p.me?N.kh:pr.kh;
      var pw=p.me?N.pw:pr.pw; if (Array.isArray(pw)) A.pw=pw.filter(function(e){ return Array.isArray(e) && typeof e[0]==='number' && e[0]>=0 && e[0]<houses.length && typeof e[1]==='number'; }).slice(0,houses.length);
      var cl=p.me?N.cl:pr.cl; if (Array.isArray(cl)) A.cl=cl.filter(function(c){ return typeof c==='number' && c>=0 && c<200; }).slice(0,60);
      if (Array.isArray(cs)) A.cs=cs.filter(function(c){ return typeof c==='number' && c>=0 && c<CHEST_SPOTS.length; }).slice(0,20);
      if (Array.isArray(tp)) A.tp=tp.filter(function(t){ return Array.isArray(t) && t.length===3 && isFinite(t[1]) && isFinite(t[2]); }).slice(0,6);
      if (Array.isArray(tt)) A.tt=tt.filter(function(t){ return typeof t==='string'; }).slice(-40);
      if (kh && typeof kh==='object'){ A.kh[netMe]=Math.max(A.kh[netMe]||0,num(kh[netMe],0)); for (var bq2=0;bq2<N.bots.length;bq2++){ var bid2=N.bots[bq2].id; A.khb[bid2]=Math.max(A.khb[bid2]||0,num(kh[bid2],0)); } } }
    var o=p.me?N.o:pr.o; if (o && typeof o==='object'){ A.g=Math.max(A.g,num(o.g,0)); A.b=Math.max(A.b,num(o.b,0)); A.c=Math.max(A.c,Math.min(CARNEED,num(o.c,0)));
      if (o.gn && typeof o.gn==='object') SGENS.forEach(function(h){ A.gn[h]=Math.max(A.gn[h]||0,Math.min(GENNEED,num(o.gn[h],0))); }); }
    var kk=p.me?N.k:pr.k; if (kk && typeof kk==='object'){ A.k=Math.max(A.k,num(kk[netMe],0)); for (var bq=0;bq<N.bots.length;bq++){ var bid=N.bots[bq].id; A.kb[bid]=Math.max(A.kb[bid]||0,num(kk[bid],0)); } }
    var ee=p.me?N.ek:pr.ek; if (ee && typeof ee==='object'){ A.ek=Math.max(A.ek,num(ee[netMe],0)); if (!p.me) for (var ek in ee) N.ek[ek]=Math.max(N.ek[ek]||0,num(ee[ek],0)); }
    var hh=p.me?N.hold:pr.hp; A.hold=(hh && hh.length===2)?[num(hh[0],-1),Math.max(0,Math.min(600,num(hh[1],0)))]:[-1,0];
  }
  if (!me){ me={id:netMe,me:true,role:N.role,pr:NP,alive:N.alive===1,a:N.alive,x:P.x,z:P.z,ih:N.ih,y:P.y||0,hid:!!N.hide}; pl.push(me); }
  var host=hostId===null || hostId===netMe;
  if (N.bots.length){
    if (!host){ var bz=null; for (i=0;i<pl.length;i++) if (pl[i].id===hostId) bz=pl[i].pr.bz; if (bz && bz.length===N.bots.length) for (i=0;i<bz.length;i++){ var z=bz[i], bb=N.bots[i]; if (!z || z.length<6) continue; bb.x=num(z[0],bb.x); bb.z=num(z[1],bb.z); bb.ry=num(z[2],bb.ry); bb.an=num(z[3],0)|0; bb.a=num(z[4],1)|0; bb.hp=num(z[5],bb.hp); bb.sn=num(z[6],0); bb.hc=num(z[7],0); bb.nz=num(z[8],0); bb.ih=Math.max(-1,Math.min(houses.length-1,num(z[9],-1)|0)); bb.y=num(z[10],0); bb.hid=num(z[11],0); bb.cr=num(z[12],0); bb.iv=num(z[13],0); } }
    N.bots.forEach(function(bb){ seen[bb.id]=1; pl.push({id:bb.id,me:false,bot:bb,role:bb.role,pr:{n:bb.name,sk:bb.sk,sn:host?(bb.stun>0?1:0):bb.sn,hc:bb.hc,cr:bb.cr?1:0,nz:bb.nz||0},alive:bb.a===1,a:bb.a,x:bb.x,z:bb.z,yaw:bb.ry-Math.PI,an:bb.an,ih:bb.ih==null?-1:bb.ih,y:bb.y||0,hid:!!bb.hid}); });
  }
  N.isHost=host; vanRead(pl,hostId);
  if (N.mode==='s'){ N.scSeen=N.scSeen||{}; pl.forEach(function(q){ if (q.me || q.bot) return; var c=q.role==='k'?num(q.pr.sc,0):-1, b=q.id===hostId?num(q.pr.bsc,0):-1;
      if (c>=0){ if (N.scSeen[q.id]===undefined) N.scSeen[q.id]=c; else if (c>N.scSeen[q.id]){ N.scSeen[q.id]=c; scared(); if (host) scareBots(); } }
      if (b>=0 && !host){ if (N.scSeen.bots===undefined) N.scSeen.bots=b; else if (b>N.scSeen.bots){ N.scSeen.bots=b; scared(); } } }); }
  if (N.mode==='s') pl.forEach(function(q){ var nd=q.me?null:q.pr.nd; if (Array.isArray(nd)) nd.forEach(function(hi){ hi=hi|0; if (hi>=0 && hi<houses.length && !houses[hi].netDead) neighbourDied(houses[hi]); }); });
  if (N.mode==='s') pl.forEach(function(q){ var bd=q.me?null:q.pr.bd; if (Array.isArray(bd)) bd.forEach(function(hi){ hi=hi|0; if (hi>=0 && hi<houses.length && !houses[hi].netBroke){ breakDoorFx(houses[hi]); if (N.ih===hi) iDoorSet(true); } }); });
  if (N.mode==='s'){ if (host) N.cutView=N.cut; else pl.forEach(function(q){ if (q.id===hostId && Array.isArray(q.pr.gcut)){ var cv={}; q.pr.gcut.forEach(function(e){ if (Array.isArray(e) && typeof e[0]==='number') cv[e[0]]=num(e[1],0); }); N.cutView=cv; } }); }
  if (N.mode==='s'){ if (host){ N.jlView=N.jl||[]; } else { for (i=0;i<pl.length;i++) if (pl[i].id===hostId){ var hpv=pl[i].pr; if (Array.isArray(hpv.pol)) N.polView=hpv.pol; if (Array.isArray(hpv.jl)) N.jlView=hpv.jl; } }
    pl.forEach(function(q){ q.jailUntil=0; (N.jlView||[]).forEach(function(j){ if (Array.isArray(j) && j[0]===q.id) q.jailUntil=Math.max(q.jailUntil,num(j[1],0)); }); if (q.bot && q.bot.jail>N.el) q.jailUntil=q.bot.jail; }); }
  if (maxEl>N.el+1.5) N.t0-=(maxEl-N.el)*1000;
  for (var id in N.acc){ hitsK+=N.acc[id].k; hitsE=Math.max(hitsE,N.acc[id].ek); }
  // other players' bodies
  for (i=0;i<pl.length;i++){ var o2=pl[i]; if (o2.me) continue;
    var kind=(o2.role==='k'||o2.role==='killer')?'k':'p', sp=null;
    if (kind==='p'){ if (o2.role==='boy') sp=BOY; else if (o2.role==='girl') sp=N.mode==='k'?WREN:GIRL; else { var si=num(o2.pr.sk,-1)|0; if (si<0||si>=NEIGHBOURS.length){ si=0; for (var c=0;c<o2.id.length;c++) si=(si*31+o2.id.charCodeAt(c))%NEIGHBOURS.length; } sp=NEIGHBOURS[si]; } }
    var mate=(kind==='k')===(game.role==='killer') || N.mode!=='s';
    var av=avatarFor(o2.id,kind,sp,mate?nick(o2.pr):'',kind==='k'?Math.max(0,Math.min(KSKINS.length-1,num(o2.bot?o2.bot.ks:o2.pr.ks,0)|0)):0); av.g.visible=o2.a!==2 && o2.ih===N.ih && !o2.hid && !(kind==='k' && game.role!=='killer' && (o2.bot?o2.bot.iv>0:num(o2.pr.iv,0)>0));
    if (N.fin && N.fin.q.id===o2.id) av.g.visible=false;
    if (kind==='k' && game.role!=='killer' && (vanPhase(N) || !N.allParked)) av.g.visible=false;   // nobody sees the killer while the cars are still coming in
    if (o2.a===0 && !av.pooled && av.g.visible){ av.pooled=true; bloodPool(o2.x,((o2.ih>=0||o2.y>0.3)?o2.y:groundY(o2.x,o2.z)),o2.z,1.5); bloodBurst(o2.x,(o2.y||0)+0.3,o2.z,0,0,40); }
    av.scared=kind==='p' && !(N.mode==='k'); var dz=kind==='k' && num(o2.pr.sn,0)>0; avatarStep(av,dt,o2.x,o2.z,o2.yaw+Math.PI,dz?0:o2.an,o2.a===0,(o2.ih>=0||o2.y>0.3)?o2.y:undefined);
    if (kind==='p' && N.mode==='s'){ var loud=game.role==='killer' && o2.a===1 && (N.sense>0 || (o2.bot?o2.bot.nz:num(o2.pr.nz,0)));
      if (loud && !av.ping) av.ping=halo(0xff2020,1.4,0,2.75,0,av.g,0.9);
      if (av.ping){ av.ping.visible=!!loud; if (loud){ av.ping.material.opacity=0.45+Math.sin(clock.elapsedTime*7)*0.35; av.ping.material.depthTest=false; } } }
    var crc=kind==='p' && num(o2.pr.cr,0) && o2.a===1; av.cr=(av.cr||0)+((crc?1:0)-(av.cr||0))*Math.min(1,dt*8); av.g.scale.y=1-av.cr*0.32; if (av.cr>0.01) av.g.rotation.x=av.cr*0.18;
    if (dz){ av.g.rotation.x=0.28+Math.sin(clock.elapsedTime*2.2)*0.06; av.g.rotation.z=Math.sin(clock.elapsedTime*1.7)*0.12; } else av.g.rotation.z=0; o2.av=av; }
  for (var aid in avatars) if (!seen[aid]) dropAvatar(aid);
  // my own motion
  var mvd=Math.hypot(P.x-N.lx,P.z-N.lz)/Math.max(dt,0.001); N.lx=P.x; N.lz=P.z; N.an=N.alive!==1?0:(mvd>5.4?2:(mvd>0.6?1:0));
  swingTick(dt); N.scareCd=(N.scareCd||0)-dt; N.vanCd=(N.vanCd||0)-dt; N.iv=(N.iv||0)-dt; N.killRev=(N.killRev||0)-dt; N.fright=(N.fright||0)-dt; N.reveal=(N.reveal||0)-dt; wrap.classList.toggle('vanished',game.role==='killer' && N.iv>0); N.cd-=dt; N.slow-=dt; N.boost-=dt; N.inv-=dt; N.stun-=dt; N.sense=(N.sense||0)-dt; N.senseCd=(N.senseCd||0)-dt;
  var surv=pl.filter(function(q){ return !(q.role==='k'||q.role==='killer'); }), killers=pl.filter(function(q){ return q.role==='k'||q.role==='killer'; });
  if (N.mode==='s' && !N.blood && N.el>NIGHT*0.5){ N.blood=true; sting(0.4,true); thud(1.2); shake();
    toast(game.role==='killer'?'Blood Moon. You are faster now, and Elias is hunting with you.':'Blood Moon. The killers are faster, and Elias has come out to hunt.',5000); }
  var eliasOn = N.mode==='b' || (N.mode==='s' && (!killers.length || (N.blood && killers.length<2)));
  // Elias, run by one player and shown to everyone
  var E=N.E, S=stalker;
  if (eliasOn){
    if (host){ var tg=surv.filter(function(q){ return q.alive && q.ih<0 && !q.hid && (q.y||0)<1.5; }); netElias(dt,tg); }
    else { var hp2=null; for (i=0;i<pl.length;i++) if (pl[i].id===hostId) hp2=pl[i].pr.e; if (hp2 && hp2.length>=4){ var ex=num(hp2[0],E.x), ez=num(hp2[1],E.z); if (!E.vis || Math.hypot(ex-E.x,ez-E.z)>6){ E.x=ex; E.z=ez; } else { E.x+=(ex-E.x)*Math.min(1,dt*10); E.z+=(ez-E.z)*Math.min(1,dt*10); } E.ry=num(hp2[2],0); E.vis=hp2[3]?1:0; E.mv=hp2[4]?1:0; } }
    S.mode=null; S.scare=0; S.state='hunt'; S.g.visible=!!E.vis;
    if (E.vis){ S.g.position.set(E.x,groundY(E.x,E.z),E.z); turnTo(S.g,E.ry,dt); if (S.mixer){ setAnim(E.mv?'Walk':'Idle'); if (S.actions.Walk) S.actions.Walk.timeScale=1.35; } }
    var ed=E.vis?Math.hypot(E.x-P.x,E.z-P.z):99, fear=N.alive===1?Math.max(0,Math.min(1,(24-ed)/20)):0;
    $('fear').style.opacity=0; if (droneGain) droneGain.gain.value=0.05+fear*0.08; game.heart-=dt;
    if (fear>0 && game.heart<=0){ heartbeat(0.25+fear*0.4); game.heart=1.15-fear*0.75; }
  } else if (N.mode==='s' && game.role!=='killer' && N.alive===1){
    var kd=99; killers.forEach(function(q){ if (q.ih===N.ih || (q.ih==null && N.ih<0)) kd=Math.min(kd,Math.hypot(q.x-P.x,q.z-P.z)); }); var fr=vanPhase(N)?0:Math.max(0,Math.min(1,(22-kd)/18));
    $('fear').style.opacity=0; chaseMusic(fr,dt);
  }
  // being hit
  var H=hitsK+hitsE;
  if (H>N.hits){ N.hits=H; if (N.alive===1 && N.inv<=0 && game.role!=='killer'){ N.inv=2.5; netHurt(); if (N.mode==='s') jumpFace(); N.killRev=1.4; wireUI.close(false); choreUI.close(false); if (N.hide){ netUnhide(); toast('He found you!',2000); } closeChat();
      if (N.mode==='s'){ N.hp--; if (N.hp<=0){ N.alive=0; vm.visible=false; setLight(false); toast('You are dead. You can watch the others.',4000); } else { N.boost=4; toast(N.hp===1?'You are badly hurt. One more hit and you are dead.':'You are hurt. Two more hits and you are dead.',3500); } }
      else { N.f=maxF=Math.max(maxF,N.f)+1; N.failMine=true; } } }
  if (N.mode==='s') netSurvival(dt,pl,surv,killers,me); else netCoop(dt,pl,maxSt,maxF,me,host);
  if (!net || net.over) return;
  N.spd = (N.alive!==1 || N.stun>0 || N.fright>0 || vanPhase(N) || N.wiring || doorSeq) ? 0 : (game.role==='killer' && N.blood && N.slow<=0) ? 1.12 : (N.slow>0 ? 0.45 : (N.boost>0 ? 1.15 : (N.mode==='s' && N.hp<3 && game.role!=='killer' ? (N.hp<2?0.86:0.94) : 1)));
  // spectating
  if (N.alive!==1){ var cands=surv.filter(function(q){ return !q.me && q.alive && q.av; }); if (!cands.length) cands=pl.filter(function(q){ return !q.me && q.av; });
    if (cands.length){ var w=cands[N.spec%cands.length], a=w.av, bx=Math.sin(a.ry), bz=Math.cos(a.ry); camera.position.set(a.x-bx*3.2,2.4,a.z-bz*3.2); camera.lookAt(a.x,1.4,a.z); }
    else { camera.position.set(P.x,7,P.z+6); camera.lookAt(P.x,0,P.z); } vm.visible=false; vmL.visible=false; }
  // tell the others
  N.adT=(N.adT||0)-dt; if (N.adT<=0 && !NR.solo){ N.adT=2; dirSend({rm:{c:N.code,m:N.mode,n:pl.length,h:nick(pl[0].pr),g:1}}); }
  N.sendT-=dt; if (N.sendT<=0){ N.sendT=0.08;
    var patch={p:[Math.round(P.x*100)/100,Math.round(P.z*100)/100,Math.round(P.yaw*100)/100,N.an],a:N.alive,h:N.hp,cr:P.crouch?1:0,el:Math.round(N.el),st:N.st,f:N.f,hp:[N.hold[0],Math.round(N.hold[1]*10)/10]};
    if (N.mode==='s'){ if (game.role==='killer') patch.k=N.k; patch.o={g:N.o.g,b:N.o.b,c:Math.round(N.o.c*10)/10,gn:N.o.gn};
      patch.bd=N.bd; patch.nd=N.nd; patch.ih=N.ih; patch.fy=Math.round((P.y||0)*100)/100; patch.hid=N.hide?1:0; if (N.pc) patch.pc=N.pc; if (host){ patch.pol=N.polView||[0]; patch.jl=N.jl||[]; }
      patch.nz=game.role==='killer'?0:(N.nz||0); fleetPatch(patch,host); if (game.role==='killer'){ patch.sc=N.sc||0; patch.iv=N.iv>0?1:0; } if (host){ patch.bsc=N.bsc||0; patch.gcut=Object.keys(N.cut||{}).map(function(k){ return [+k,N.cut[k]]; }); } patch.bl=N.blood?1:0; patch.cs=N.cs; patch.cl=N.cl; patch.pw=N.pw; patch.tp=N.traps; patch.tt=N.tt; patch.kh=N.kh; if (N.kd) patch.kd=N.kd; if (game.role==='killer'){ patch.sn=N.stun>0?Math.ceil(N.stun):0; patch.hc=N.hc; }
      if (host && N.bots.length){ patch.bz=N.bots.map(function(b){ return [Math.round(b.x*100)/100,Math.round(b.z*100)/100,Math.round(b.ry*100)/100,b.an,b.a,b.hp,b.stun>0?Math.ceil(b.stun):0,b.hc||0,b.nz||0,b.ih==null?-1:b.ih,Math.round((b.y||0)*100)/100,b.hid?1:0,b.cr?1:0,b.iv>0?1:0]; }); patch.ek=N.ek; } }
    if (eliasOn && host){ patch.e=[Math.round(E.x*100)/100,Math.round(E.z*100)/100,Math.round(E.ry*100)/100,E.vis,E.mv]; patch.ek=N.ek; }
    if (N.prey) patch.pv=[Math.round(N.prey.x*100)/100,Math.round(N.prey.z*100)/100,Math.round(N.prey.ry*100)/100,N.prey.an,N.prey.who,N.prey.dead?1:0,N.st];
    netSend(patch); }
}
function netElias(dt,tg){
  var N=net, E=N.E; E.mv=0;
  if (!tg.length){ E.vis=0; E.cool=Math.max(E.cool,4); return; }
  if (!E.vis){ E.cool-=dt; if (E.cool<=0){ var T0=tg[(Math.random()*tg.length)|0];
      for (var i=0;i<30;i++){ var a=Math.random()*6.283, r=rand(22,30), x=T0.x+Math.sin(a)*r, z=T0.z+Math.cos(a)*r; if (x>70 || x<-157 || Math.abs(z)>38 || blocked(x,z,0.8)) continue; E.x=x; E.z=z; E.vis=1; E.lost=0; E.stuck=0; noise(0.2,0.3,600); break; }
      if (!E.vis) E.cool=1; } return; }
  var T=null, d=1e9; tg.forEach(function(q){ var dd=Math.hypot(q.x-E.x,q.z-E.z); if (dd<d){ d=dd; T=q; } });
  var sp=N.mode==='s'?Math.min(3.9,2.9+N.el/NIGHT*1.2):Math.min(3.5,2.5+N.st*0.1), dx=(T.x-E.x)/(d||1), dz=(T.z-E.z)/(d||1), p={x:E.x+dx*sp*dt,z:E.z+dz*sp*dt};
  if (E.stuck<2.5) resolve(p,0.45);
  var mv=Math.hypot(p.x-E.x,p.z-E.z); E.stuck=mv<sp*dt*0.35?E.stuck+dt:(E.stuck>=2.5?(E.stuck+dt>4.5?0:E.stuck+dt):0);
  E.x=Math.min(72.2,p.x); E.z=p.z; E.ry=Math.atan2(dx,dz); E.mv=1;
  if (d>46){ E.lost+=dt; if (E.lost>4){ E.vis=0; E.cool=3; } } else E.lost=0;
  if (d<1.2){ N.ek[T.id]=(N.ek[T.id]||0)+1; E.vis=0; E.cool=N.mode==='s'?16:10; if (!T.me) bloodBurst(T.x,1.2,T.z,dx,dz,40); }
}
function botsInit(N,nk,ns){
  var i; for (i=0;i<nk;i++) N.bots.push({ks:(N.gid+i*3)%KSKINS.length,id:'botk'+i,role:'k',name:'Killer bot',x:60-i*4,z:i%2?4:-4,ry:-Math.PI/2,an:0,a:1,hp:9,cd:4+i*2,slow:0,stuck:0});
  for (i=0;i<ns;i++){ var sk=(i*5+3)%NEIGHBOURS.length; N.bots.push({id:'bots'+i,role:'s',name:NEIGHBOURS[sk].n+' bot',sk:sk,x:-57+i*1.6,z:(i%2?-3.2:3.4),ry:Math.PI/2,an:0,a:1,hp:3,st:1,tired:0,jink:0,jinkT:0,acc:0,lx:0,lz:0,inv:0,hits:0,esc:0,ti:i}); }
}
// Bots are driven by one player's game and shown to everyone else. They play by the same rules people do.
function bwp(e){ var ih=e.ih==null?-1:e.ih; return ih>=0?{x:houses[ih].x,z:houses[ih].z,ih:ih}:{x:e.x,z:e.z,ih:-1}; }
function bdist(a,b){ var ia=a.ih==null?-1:a.ih, ib2=b.ih==null?-1:b.ih; if (ia===ib2) return Math.hypot(a.x-b.x,a.z-b.z)+Math.abs((a.y||0)-(b.y||0))*(ia>=0?2:3); var A=bwp(a), B=bwp(b); return Math.hypot(A.x-B.x,A.z-B.z)+6; }
function spotPos(s,ih){ return {x:(s.in?IX:0)+s.x,z:s.z,ih:s.in?ih:-1,y:s.in?s.f*FLOOR2:(s.y||0)}; }
function botsHost(dt,pl,W){
  if (!net.allParked){ net.bots.forEach(function(b){ b.an=0; if (b.role!=='s') return; fleetBot(b); }); return; }
  if (!net.vanBots){ net.vanBots=true; net.bots.forEach(function(b){ if (b.role==='s' && !b.outCar) fleetBot(b); }); }
  var N=net, o=N.o, killers=pl.filter(function(q){ return q.role==='k'; }), targets=pl.filter(function(q){ return q.role==='s' && q.alive; });
  var hunters=killers.filter(function(q){ return !(q.jailUntil>N.el) && !(q.bot?q.bot.stun>0:num(q.pr.sn,0)>0); });
  function hurt(b,dx,dz){ if (b.a!==1 || b.inv>0) return; b.inv=2.5; b.hp--; b.hid=0; b.hide=null; b.scare=6; bloodBurst(b.x,(b.y||0)+1.2,b.z,dx,dz,45); if (b.hp<=0){ b.a=0; b.an=0; bloodPool(b.x,b.ih>=0?(b.y||0):groundY(b.x,b.z),b.z,0.9); toast(b.name+' is dead.',2600); } }
  function hitPlayer(T,dx,dz){ if (T.bot) hurt(T.bot,dx,dz); else { N.ek[T.id]=(N.ek[T.id]||0)+1; if (!T.me) bloodBurst(T.x,(T.y||0)+1.2,T.z,dx,dz,40); } }
  function taken(s,ih,me){ var p=spotPos(s,ih); return pl.some(function(q){ return q.hid && q.alive && q.id!==me && (q.ih==null?-1:q.ih)===p.ih && Math.hypot(q.x-p.x,q.z-p.z)<1.4; }); }
  function patrolPts(){ var a=[CARSIDE,{x:-80,z:-12},{x:88,z:-9},{x:110,z:9},{x:20,z:9}]; houses.forEach(function(h,hi){ if (!W.powered[hi] && hi%3===0) a.push(genPt(hi)); }); if (W.G===0) a.push(GAS); if (W.B===0) a.push(batPos());
    chests.forEach(function(c){ if (!c.open) a.push({x:c.x+1.2,z:c.z}); }); return a; }
  N.bots.forEach(function(b){
    if (b.ih==null) b.ih=-1;
    /* ---------------- killer bots ---------------- */
    if (b.role==='k'){ b.cd-=dt; b.slow-=dt; b.an=0; b.kicking=false; b.stun=(b.stun||0)-dt; b.sense=(b.sense||0)-dt; b.senseCd=(b.senseCd==null?25:b.senseCd)-dt;
      if (b.stun>0){ b.sw=0; return; }
      if (b.jail>N.el){ b.x=JAIL.x; b.z=JAIL.z; b.ih=-1; b.y=0; b.fl=0; b.mem=null; b.search=null; return; } if (b.jail){ b.jail=0; b.x=RELEASE.x; b.z=RELEASE.z; }
      if (b.senseCd<=0){ b.senseCd=40+Math.random()*12; b.sense=5; }
      b.scCd=(b.scCd==null?18+Math.random()*20:b.scCd)-dt; b.ivCd=(b.ivCd==null?12+Math.random()*20:b.ivCd)-dt; b.iv=(b.iv||0)-dt;
      if (b.ih>=0){ var bh=houses[b.ih]; if (!bh.netDead && !bh.netHid && (b.y||0)<0.3 && Math.hypot(IX-1.0-b.x,1.9-b.z)<2.0){ neighbourDied(bh); if (N.nd.indexOf(b.ih)<0) N.nd.push(b.ih); b.cd=2.4; b.slow=1.2; b.ry=Math.atan2(IX-1.0-b.x,1.9-b.z); b.an=0; return; } }
      // what this killer can see or hear right now
      var T=null, d=1e9, best=1e9;
      targets.forEach(function(q){ if ((q.bot && q.bot.a!==1) || q.hid) return;
        var qih=q.ih==null?-1:q.ih, same=qih===b.ih, dd=bdist(b,q), loud=q.bot?q.bot.nz:num(q.pr.nz,0), cr=q.bot?q.bot.cr:num(q.pr.cr,0);
        var see=same && Math.abs((q.y||0)-(b.y||0))<2 && (b.ih>=0 ? dd<14 : dd<(cr?8:28)), hear=loud && dd<(cr?20:42);
        if (!(see || hear || b.sense>0 || (b.tgt===q.id && dd<14))) return;
        var sc=dd*(loud?0.75:1)*(b.tgt===q.id?0.7:1); if (sc<best){ best=sc; d=dd; T=q; } });
      var sp=b.slow>0?1.6:(N.blood?5.1:4.5);
      if (b.sw>0){ b.sw-=dt; b.an=0; if (T) b.ry=Math.atan2(T.x-b.x,T.z-b.z);
        if (b.sw<=0){ b.cd=2.6; b.slow=1.1; var V=null; pl.forEach(function(q){ if (q.id===b.swT && q.alive && !q.hid) V=q; }); if (V && (V.ih==null?-1:V.ih)===b.ih && !V.hid && Math.hypot(V.x-b.x,V.z-b.z)<1.9 && Math.abs((b.y||0)-(V.y||0))<1.2) hitPlayer(V,(V.x-b.x)/1.5,(V.z-b.z)/1.5); b.swT=null; }
        return; }
      if (T){ b.tgt=T.id; b.mem={x:T.x,z:T.z,ih:T.ih==null?-1:T.ih,y:T.y||0,t:N.el}; b.search=null;
        if (b.scCd<=0 && d>7 && d<32){ b.scCd=40; N.bsc=(N.bsc||0)+1; scared(); scareBots(); }
        if (b.ivCd<=0 && d>12 && d<40){ b.ivCd=40; b.iv=8; }
        navStep(b,{x:T.x,z:T.z,ih:T.ih==null?-1:T.ih,y:T.y||0},sp,dt,true); b.an=b.kicking?0:(sp>4?2:1); d=Math.hypot(T.x-b.x,T.z-b.z);
        if (!b.kicking && d<1.5 && b.cd<=0 && b.ih===(T.ih==null?-1:T.ih) && Math.abs((b.y||0)-(T.y||0))<1.2){ b.sw=0.38; b.swT=T.id; b.an=0; b.iv=0; }
        return; }
      // lost them: go to where they were last seen, then look in the hiding places there
      var M=b.mem;
      if (M && (b.search || N.el-M.t<40)){
        if (!b.search){ var dm=navStep(b,M,sp*0.85,dt,true); b.an=b.kicking?0:1; if (b.kicking) M.t+=dt;
          if (b.ih===M.ih && (dm<1.3 || Math.hypot(M.x-b.x,M.z-b.z)<1.3)){
            var list=(M.ih>=0?HIDES:OUTHIDES).map(function(s){ var p=spotPos(s,M.ih); return {s:s,p:p,d:Math.hypot(p.x-M.x,p.z-M.z)+Math.abs(p.y-(M.y||0))*3}; })
              .filter(function(e){ return M.ih>=0 || (e.d<14 && Math.abs(e.p.y-(M.y||0))<1.2); }).sort(function(a,c){ return a.d-c.d; }).slice(0,M.ih>=0?4:2);
            if (!list.length){ b.mem=null; return; } b.search=list; b.si=0; b.st=0; }
          return; }
        var S=b.search[b.si]; if (!S){ b.mem=null; b.search=null; return; }
        var ds=navStep(b,S.p,sp*0.8,dt,true); b.an=b.kicking?0:1;
        if (b.ih===S.p.ih && Math.hypot(S.p.x-b.x,S.p.z-b.z)<S.s.r*0.95 && Math.abs((b.y||0)-S.p.y)<0.6){ b.an=0; b.st+=dt; b.ry=Math.atan2(S.p.x-b.x,S.p.z-b.z);
          if (b.st>1.3){ var found=null; pl.forEach(function(q){ if (q.hid && q.alive && q.role==='s' && (q.ih==null?-1:q.ih)===S.p.ih && Math.hypot(q.x-S.p.x,q.z-S.p.z)<1.4) found=q; });
            if (found){ hitPlayer(found,0,1); b.tgt=found.id; b.cd=2.4; b.mem={x:found.x,z:found.z,ih:S.p.ih,y:found.y||0,t:N.el}; b.search=null; }
            else { b.si++; b.st=0; } } }
        return; }
      // nobody to chase: walk the places survivors have to go
      b.mem=null; b.search=null; b.tgt=null;
      b.cutCd=(b.cutCd==null?30+Math.random()*15:b.cutCd)-dt;
      if (b.cutCd<=0){
        if (b.cutH==null || !W.powered[b.cutH]){ var occ=[], any=[]; houses.forEach(function(h,hi){ if (!W.powered[hi]) return; any.push(hi); if (targets.some(function(q){ return (q.ih==null?-1:q.ih)===hi; })) occ.push(hi); });
          var pool=occ.length?occ:any; b.cutH=pool.length?pool[(Math.random()*pool.length)|0]:null; b.cutT=0; if (b.cutH==null) b.cutCd=12; }
        if (b.cutH!=null){ var gp=genPt(b.cutH); navStep(b,{x:gp.x,z:gp.z,ih:-1,y:0},3.9,dt,true); b.an=b.kicking?0:1;
          if (b.ih<0 && Math.hypot(gp.x-b.x,gp.z-b.z)<1.8){ b.an=0; b.ry=Math.atan2(gp.x-b.x,gp.z-b.z); b.cutT+=dt; if (b.cutT>=3){ N.cut[b.cutH]=Math.round(N.el*10)/10+0.05; b.cutH=null; b.cutCd=50+Math.random()*25; } }
          return; } }
      if (!b.pt || N.el>b.ptT || Math.hypot(b.pt.x-b.x,b.pt.z-b.z)<2.5 && b.ih<0 && Math.abs((b.pt.y||0)-(b.y||0))<1){ var pts=patrolPts(); b.pt=pts[(Math.random()*pts.length)|0]; b.ptT=N.el+22; }
      navStep(b,{x:b.pt.x,z:b.pt.z,ih:-1,y:b.pt.y||0},3.4,dt,true); b.an=b.kicking?0:1;
      return; }
    /* ---------------- survivor bots ---------------- */
    if (b.a!==1){ b.an=0; b.hid=0; b.cr=0; return; }
    b.inv-=dt; b.scare=(b.scare||0)-dt; b.stabCd=(b.stabCd||0)-dt; b.nzF=(b.nzF||0)-dt; if (b.frozen>0){ b.frozen-=dt; b.an=0; b.nz=1; return; } var tot=N.ek[b.id]||0; for (var id in N.acc) tot+=(N.acc[id].kb[b.id]||0);
    if (tot>b.hits){ b.hits=tot; hurt(b,0,0); if (b.a!==1) return; }
    var K=null, kd=1e9; hunters.forEach(function(q){ var dd=bdist(b,q); if (dd<kd){ kd=dd; K=q; } });
    var vx=0, vz=0, sp=0, run=false, work=null, goal=null; b.cr=0;
    function move(T,s){ goal=T; sp=s; }
    // hiding: stay put until the killer has been gone a while
    if (b.hid){ b.an=0; b.nz=0; b.calm=kd>18?(b.calm||0)+dt:0; b.hidT=(b.hidT||0)+dt;
      if (b.held==='heal' && b.hp<3){ b.held=null; b.hp++; }
      if (b.calm>6+b.ti || (b.hidT>50 && kd>12)){ b.hid=0; b.hide=null; b.calm=0; }
      return; }
    // fight back with a knife if the killer is right on top of you
    if (K && b.held==='knife' && b.stabCd<=0 && (K.ih==null?-1:K.ih)===b.ih && Math.hypot(K.x-b.x,K.z-b.z)<1.8){ b.stabCd=1.1; b.kn=(b.kn||2)-1; if (b.kn<=0) b.held=null;
      N.kh[K.id]=(N.kh[K.id]||0)+1; bloodBurst(K.x,(K.y||0)+1.3,K.z,K.x-b.x,K.z-b.z,30); b.ry=Math.atan2(K.x-b.x,K.z-b.z); }
    var threat=K && (kd<13 || b.scare>0 && kd<20 || b.ih>=0 && b.hide && kd<30);
    if (threat){ run=b.tired<=0; var fsp=run?6.7:4.2; b.esc=0; b.goal=null;
      // a bear trap behind you as you run
      if (b.held==='trap' && b.ih<0 && kd<10 && !blocked(b.x,b.z,0.25)){ b.held=null; N.tn=(N.tn||0)+1; N.traps.push([N.tn,Math.round(b.x*100)/100,Math.round(b.z*100)/100]); if (N.traps.length>4) N.traps.shift(); }
      if (b.ih>=0){ var kin=(K.ih==null?-1:K.ih)===b.ih, kclose=kin && Math.hypot(K.x-b.x,K.z-b.z)<4;
        if (!kclose){ if (!b.hide || taken(b.hide,b.ih,b.id)){ var opts2=HIDES.filter(function(s){ return !taken(s,b.ih,b.id); }).sort(function(a,c){ var pa=spotPos(a,b.ih), pc=spotPos(c,b.ih); return Math.hypot(pa.x-b.x,pa.z-b.z)+Math.abs(pa.y-(b.y||0))*3-Math.hypot(pc.x-b.x,pc.z-b.z)-Math.abs(pc.y-(b.y||0))*3; }); b.hide=opts2[0]||null; }
          if (b.hide){ var hp=spotPos(b.hide,b.ih); if (b.ih===hp.ih && Math.hypot(hp.x-b.x,hp.z-b.z)<b.hide.r*0.9 && Math.abs((b.y||0)-hp.y)<0.5){ b.hid=1; b.hidT=0; b.calm=0; b.x=hp.x; b.z=hp.z; b.y=hp.y; b.fl=b.hide.f; b.an=0; b.nz=0; return; } move(hp,4.0); } }
        if (!goal){ if (N.el<(b.doorCd||0)){ var up=(K.y||0)>1.4; move({x:IX+(up?3.4:-3.0),z:up?2.6:-1.0,ih:b.ih,y:up?0:FLOOR2},fsp); } else { var hh=houses[b.ih], dpo=doorPt(hh); move({x:dpo.x,z:dpo.z-hh.side*8,ih:-1,y:0},fsp); } } }
      else {
        // run for a house or a dumpster that is not back toward the killer
        if (b.flee!=null && b.flee.t>N.el){ move(b.flee.T,fsp); if (b.flee.T.out && Math.hypot(b.flee.T.x-b.x,b.flee.T.z-b.z)<0.9){ var od=b.flee.s; if (!taken(od,-1,b.id)){ b.hid=1; b.hidT=0; b.calm=0; b.hide=od; b.x=od.x; b.z=od.z; b.y=od.y||0; b.an=0; b.nz=0; b.flee=null; return; } b.flee=null; } }
        else { b.flee=null; var Kp=bwp(K), ax=b.x-Kp.x, az=b.z-Kp.z, al=Math.hypot(ax,az)||1, pick=null, pd=1e9;
          houses.forEach(function(h,hi){ var dp=doorPt(h), ddx=dp.x-b.x, ddz=dp.z-b.z, dd=Math.hypot(ddx,ddz); if (dd>18 || !(h.power || h.netBroke) || N.el<(b.doorCd||0) || hunters.some(function(q){ return (q.ih==null?-1:q.ih)===hi; })) return; var kdd=Math.hypot(dp.x-Kp.x,dp.z-Kp.z); if (kdd<dd+1.5) return; if ((ddx*ax+ddz*az)/(dd*al||1)<-0.3 && dd>3) return; if (dd<pd){ pd=dd; pick={x:dp.x,z:dp.z,ih:hi,y:0}; } });
          OUTHIDES.forEach(function(s){ var dd=Math.hypot(s.x-b.x,s.z-b.z); if (dd>9 || Math.abs((s.y||0)-(b.y||0))>1 || taken(s,-1,b.id)) return; if (Math.hypot(s.x-Kp.x,s.z-Kp.z)<dd+3) return; if (dd*1.3<pd){ pd=dd*1.3; pick={x:s.x,z:s.z,ih:-1,y:0,out:true,s:s}; } });
          if (pick && (kd>5 || pd<4)){ b.flee={T:pick,t:N.el+8,s:pick.s}; move(pick,fsp); }
          else { vx=ax/al; vz=az/al; killers.forEach(function(q){ if (q===K) return; var qp=bwp(q), ex=b.x-qp.x, ez=b.z-qp.z, e=Math.hypot(ex,ez)||1; if (e<12){ vx+=ex/e*0.8; vz+=ez/e*0.8; } });
            if (b.x>64) vx-=1.5; if (b.x<-150) vx+=1.5; if (b.z>34) vz-=1.5; if (b.z<-34) vz+=1.5; sp=fsp; } } } }
    else {
      b.flee=null; b.hide=null; var wary=K && kd<24;
      if (b.held==='heal' && b.hp<3){ b.held=null; b.hp++; }
      if (!b.goal || N.el>b.goalT){ b.goal=null;
        // hurt and empty-handed: ask a neighbour for help, like a person would
        if (b.hp<3 && !b.held){ var hb=-1, hd=36; houses.forEach(function(h,hi){ if (h.netHid || h.netDead || h.netAsked || !h.power) return; var dp=doorPt(h), dd=Math.hypot(dp.x-b.x,dp.z-b.z); if (dd<hd){ hd=dd; hb=hi; } }); if (hb>=0) b.goal={k:'ask',h:hb}; }
        // empty hands: open a chest on the way
        if (!b.goal && !b.held){ var cb=-1, cdist=24; chests.forEach(function(c,ci){ if (c.open) return; var dd=Math.hypot(c.x-b.x,c.z-b.z); if (dd<cdist){ cdist=dd; cb=ci; } }); if (cb>=0) b.goal={k:'chest',i:cb}; }
        if (b.goal) b.goalT=N.el+30; }
      if (b.goal && b.goal.k==='chest'){ var ch=chests[b.goal.i]; if (!ch || ch.open || b.held){ b.goal=null; } else { var cdd=Math.hypot(ch.x-b.x,ch.z-b.z);
          if (cdd<1.3 && b.ih<0){ N.cs.push(b.goal.i); ch.open=true; ch.glow.visible=false; b.held=chestItem(N.gid,b.goal.i); if (b.held==='knife') b.kn=2; b.goal=null; b.an=0; return; }
          move({x:ch.x,z:ch.z,ih:-1,y:0},wary?2.2:4.3); } }
      else if (b.goal && b.goal.k==='ask'){ var H=houses[b.goal.h];
        if (H.netHid || H.netDead || H.netAsked){ b.goal=null; }
        else if (b.ih===b.goal.h && Math.hypot(IX-1.0-b.x,1.9-b.z)<1.4 && (b.y||0)<0.3){ H.netAsked=true; b.goal=null;
          var pv=N.polView||[0]; if (pv[0]===0 && !N.pc && Math.random()<0.35){ N.pc=[Math.round(N.el*10)/10,houses.indexOf(H)]; netSend({pc:N.pc}); }
          b.an=0; return; }
        else move({x:IX-1.0+0.9,z:1.9,ih:b.goal.h,y:0},wary?2.2:4.3); }
      if (!goal){ var opts=[];
        if (W.done) opts.push({k:'esc',pt:carDoorPt(b.id),r:2.2,f:function(){ b.esc+=dt; if (b.esc>=3){ b.a=2; b.an=0; fleetLeave(b.id); toast(b.name+' drove away.',2600); } }});
        else { if (W.G===0) opts.push({k:'gas',pt:GAS,r:1.6,f:function(){ o.g=Math.max(o.g,1); }}); if (W.G===1) opts.push({k:'gas2',pt:CARSIDE,r:3.2,f:function(){ o.g=2; }});
          if (W.B===0) opts.push({k:'bat',pt:batPos(),r:1.6,f:function(){ o.b=Math.max(o.b,1); }}); if (W.B===1) opts.push({k:'bat2',pt:CARSIDE,r:3.2,f:function(){ o.b=2; }});
          if (W.G===2 && W.B===2 && !W.carOK) opts.push({k:'car',pt:CARSIDE,r:3.2,f:function(){ o.c=Math.min(CARNEED,o.c+dt); }});
          var openCh=W.ncl<CLEAN_NEED && houses.some(function(hh,hi){ return (W.powered[hi]||hh.netBroke) && !hh.netDead && choresOf(hi).some(function(t){ return !W.cleaned[choreId(hi,t)]; }); });
          if (W.npw<PW_NEED || !openCh) houses.forEach(function(hh,hi){ if (W.powered[hi]) return; opts.push({k:'wire'+hi,pt:genPt(hi),r:2.0,f:function(){ if (b.wK!==hi){ b.wK=hi; b.wT=0; } b.wT+=dt; if (b.wT>=8){ pwFix(N,hi); b.wK=null; } }}); });
          if (W.ncl<CLEAN_NEED) houses.forEach(function(hh,hi){ if (hh.netDead || !(W.powered[hi] || hh.netBroke)) return; choresOf(hi).forEach(function(t){ var cid=choreId(hi,t); if (W.cleaned[cid]) return; var CT=CHORE_T[t];
            opts.push({k:'ch'+cid,pt:{x:IX+CT.x,z:CT.z,ih:hi,y:CT.f*FLOOR2},wp:doorPt(hh),r:1.25,f:function(){ if (b.chK!==cid){ b.chK=cid; b.chT=0; } b.chT+=dt; if (b.chT>=30){ if (N.cl.indexOf(cid)<0) N.cl.push(cid); b.chK=null; } }}); }); });
 }
        if (opts.length){
          // nearest job, spread out so they don't all crowd one generator
          var O=null, os=1e9, here=bwp(b); opts.forEach(function(op){ var crowd=0; N.bots.forEach(function(o2){ if (o2!==b && o2.role==='s' && o2.a===1 && o2.job===op.k) crowd++; });
            var tp=op.wp||op.pt, sc=Math.hypot(tp.x-here.x,tp.z-here.z)+crowd*(op.k==='car'||op.k==='esc'?0:22)+(b.job===op.k?-8:0); if (sc<os){ os=sc; O=op; } });
          b.job=O.k; var gx=O.pt.x-b.x, gz=O.pt.z-b.z, gd=Math.hypot(gx,gz)||1;
          var oih=O.pt.ih==null?-1:O.pt.ih, sameP=b.ih===oih && Math.abs((b.y||0)-(O.pt.y||0))<0.6;
          if (sameP && gd<O.r*0.85){ if (!(wary && kd<18) || oih>=0){ work=O; b.ry=Math.atan2(gx,gz); } else b.cr=1; }
          else move({x:O.pt.x,z:O.pt.z,ih:oih,y:O.pt.y||0},wary?2.2:4.3); } }
      if (wary && sp && sp<3) b.cr=1;
    }
    if (run){ b.st-=dt/7; if (b.st<=0) b.tired=3; } else { b.st=Math.min(1,b.st+dt/8); b.tired-=dt; }
    b.nz=(work||run||(b.hp===1 && !b.cr)||b.nzF>0)?1:0;
    if (!(work && /^ch/.test(work.k))) b.chK=null; if (!(work && /^wire/.test(work.k))) b.wK=null;
    if (work){ work.f(); b.an=0; return; }
    if (!sp){ b.an=0; return; }
    if (goal && (b.ih>=0 || goal.ih>=0 || bldIn(goal.x,goal.z) || bldIn(b.x,b.z))){ var ih0=b.ih; navStep(b,goal,sp,dt,false); if (b.ih!==ih0) b.doorCd=N.el+5; b.an=b.cr?1:(sp>5?2:1); return; }
    if (goal){ vx=goal.x-b.x; vz=goal.z-b.z; }
    var n=Math.hypot(vx,vz)||1; vx/=n; vz/=n;
    if (b.jinkT>0){ b.jinkT-=dt; var c=Math.cos(1.35*b.jink), sn=Math.sin(1.35*b.jink), tx=vx*c-vz*sn; vz=vx*sn+vz*c; vx=tx; }
    var p2={x:b.x+vx*sp*dt,z:b.z+vz*sp*dt,y:b.y||0}; lvFix(p2,0.4); p2.x=Math.max(-157,Math.min(147,p2.x)); p2.z=Math.max(-39,Math.min(39,p2.z));
    b.acc+=dt; if (b.acc>0.7){ if (Math.hypot(p2.x-b.lx,p2.z-b.lz)<sp*0.7*0.3){ b.jink=Math.random()<0.5?1:-1; b.jinkT=1.3; } b.lx=p2.x; b.lz=p2.z; b.acc=0; }
    b.x=p2.x; b.z=p2.z; b.y=p2.y>0.05?p2.y:groundY(b.x,b.z); b.ry=Math.atan2(vx,vz); b.an=b.cr?1:(sp>5?2:1);
  });
}
function hpBar(show,hp){ var el=$('hpBar'); if (el.hidden!==!show) el.hidden=!show; if (!show || el.dataset.v===String(hp)) return; el.dataset.v=String(hp);
  Array.prototype.forEach.call(el.children,function(c,i){ c.classList.toggle('on',i<hp); }); el.classList.toggle('low',hp<=1); }
function netSurvival(dt,pl,surv,killers,me){
  hpBar(game.role!=='killer' && net.alive===1 && game.mode==='play',net.hp);
  var N=net, G=0, B=0, C=0, gens={}, done, i;
  for (var id in N.acc){ var A=N.acc[id]; G=Math.max(G,A.g); B=Math.max(B,A.b); C+=A.c; SGENS.forEach(function(h){ gens[h]=(gens[h]||0)+(A.gn[h]||0); }); }
  var cleaned={}, ncl=0; for (var id3 in N.acc) (N.acc[id3].cl||[]).forEach(function(c){ if (!cleaned[c]){ cleaned[c]=1; ncl++; } }); N.cleaned=cleaned; N.ncl=ncl; choreFxUpdate(cleaned);
  var powered={}, npw=0, fixT={}, cutT=N.cutView||{}; for (var id4 in N.acc) (N.acc[id4].pw||[]).forEach(function(e){ if (!(fixT[e[0]]>=e[1])) fixT[e[0]]=e[1]; });
  for (var fk in fixT) if (fixT[fk]>(cutT[fk]===undefined?-1:cutT[fk])){ powered[fk]=1; npw++; } N.powered=powered;
  gens={}; houses.forEach(function(hh,hi){ gens[hi]=powered[hi]?GENNEED:0; });
  G=2; B=2; C=CARNEED;
  var fixed=houses.filter(function(hh,hi){ return powered[hi]; }), carOK=true; done=ncl>=CLEAN_NEED && npw>=PW_NEED;
  if (N.isHost && N.bots.length) botsHost(dt,pl,{G:G,B:B,C:C,gens:gens,carOK:carOK,done:done,cleaned:cleaned,ncl:ncl,powered:powered,npw:npw});
  itemsTick(dt,pl,killers); teamTick(pl);
  if (N.isHost) polTick(dt,pl,killers); polDraw(dt); jailTick(dt,pl); netHome(dt); netInteract(dt,pl);
  if (N.mode==='s' && !N.vanOut && !vanPhase(N)){ N.vanOut=true; if (game.role!=='killer' && N.alive===1) toast('Out of the car. Get the generators running and clean those houses.',3200); }
  var pv=N.polView||[0]; if (pv[0]===1){ var pl2='Police on the way · '+mmss(num(pv[1],0)-N.el); if (game.role==='killer') netSafe(pl2); else if (!N.working) netSafe(pl2); } else if (pv[0]===3 && game.role==='killer' && !N.jailed) netSafe('The police are after you');
  var W=N.world;
  if (W.G!==G){ if (W.G!==undefined && G===1) toast('Someone has the gas can. Get it to the car.',3000); if (W.G!==undefined && G===2) toast('The gas is in the tank.',3000); W.G=G; gasCan.visible=G===0; }
  if (W.B!==B){ if (W.B!==undefined && B===1) toast('Someone has the battery. Get it to the car.',3000); if (W.B!==undefined && B===2) toast('The battery is at the car.',3000); W.B=B; battery.visible=B===0; }
  var pwSig=Object.keys(powered).sort().join(',');
  if (W.pwSig!==pwSig){ houses.forEach(function(hh,hi){ var on=!!powered[hi]; if (hh.power!==on){ setPower(hh,on); var nb=NEIGHBOURS[hh.n].n, near=Math.hypot(P.x-hh.gen.x,P.z-hh.gen.z)<30;
        if (N.ih===hi) iPowerSet(on);
        if (W.pwSig!==undefined && on){ if (near && N.ih!==hi) toast(nb+': “The lights are back! Thank you, come on in.”',3200); else if (N.ih===hi) toast('The lights come back on.',2200); tone(60,0.8,'sawtooth',0.1,95); }
        if (W.pwSig!==undefined && !on){ if (N.ih===hi){ toast('The lights just died. Somebody cut the generator. You can’t clean in the dark.',3800); choreUI.close(false); thud(0.9); }
          else if (near) toast('Sparks out back of '+nb+'’s house. The killer cut their generator.',3200);
          if (near || N.ih===hi){ noise(0.5,0.5,2600); tone(90,0.6,'sawtooth',0.12,30); } } } }); moonLight.shadow.needsUpdate=true; W.pwSig=pwSig; W.fx=fixed.length; }
  
  if (done && !game.gateOpening){ openGate(); toast(game.role==='killer'?'The job is done. Stop them before they drive off.':'Every job is done. Get back to your car and go.',4500); }
  var left=NIGHT-N.el, hr=22+N.el/NIGHT*8, h12=((Math.floor(hr)+11)%12)+1, mn=Math.floor((hr%1)*60), clockT=h12+':'+('0'+mn).slice(-2)+(hr>=24||hr<12?' AM':' PM');
  var dawn=Math.max(0,Math.min(1,1-left/80)); FX.hemi=(scene.environment?0.36:0.42)+dawn*0.9; scene.fog.color.copy(lin(N.blood?0x2a0709:FOG)).lerp(lin(0x5a6680),dawn*0.8);
  var alive=surv.filter(function(q){ return q.alive; }).length, out=surv.filter(function(q){ return q.a===2; }).length, lab=null, tgt=null;
  if (game.role==='killer'){
    if (N.swingHit){ N.swingHit=false; var f=fwd(), tgt=null, td=2.1;
      for (i=0;i<surv.length;i++){ var s=surv[i]; if (!s.alive || s.me || s.ih!==N.ih || Math.abs((s.y||0)-(P.y||0))>1.3) continue; var dx=s.x-P.x, dz=s.z-P.z, d=Math.hypot(dx,dz);
        if (d<td && (dx*f.x+dz*f.z)/(d||1)>0.45){ td=d; tgt=s; } }
      if (tgt){ var s2=tgt, last=N.lastHitT&&N.lastHitT[s2.id], lethal=(s2.bot?s2.bot.hp:num(s2.pr.h,3))<=1 && !(last && N.el-last<2.6); N.lastHitT=N.lastHitT||{}; N.lastHitT[s2.id]=N.el; if (lethal) startNetFinisher(s2); N.k[s2.id]=(N.k[s2.id]||0)+1; N.kills++; N.cd=2.4; N.slow=1.1; stabSound(); bloodBurst(s2.x,(s2.y||0)+1.2,s2.z,f.x,f.z,110); bloodBurst(s2.x,(s2.y||0)+1.3,s2.z,-f.z,f.x,30); bloodPool(s2.x,((s2.ih>=0||s2.y>0.3)?s2.y:groundY(s2.x,s2.z)),s2.z,1.0); bloodyKnife(); shake(); toast('You cut '+nick(s2.pr)+'.',2200); N.lastHit=s2; }
      else if (N.ih>=0 && nbKillable(houses[N.ih],true)) killNeighbour(houses[N.ih]);
      else noise(0.12,0.25,900); }
    var near=null, nd=1e9; surv.forEach(function(q){ if (!q.alive) return; var dd=Math.hypot(q.x-P.x,q.z-P.z); if (dd<nd){ nd=dd; near=q; } });
    netObj('Kill Feast · '+clockT,(isTouch?'Tap Swing':'Click or press V')+' to swing your knife. Hunt them down before morning. '+alive+' alive'+(out?', '+out+' escaped':'')+'. Chores '+Math.min(ncl,CLEAN_NEED)+'/'+CLEAN_NEED+', generators '+Math.min(npw,PW_NEED)+'/'+PW_NEED+'.', done?CARSIDE:null);
    netSafe(vanPhase(N)?'They are driving in…':N.stun>0?(N.stunWhy==='hits'?'Stunned':'Stuck in a trap')+' · '+mmss(N.stun):(N.iv>0?'Unseen · '+Math.ceil(N.iv)+'s':(N.slow>0?'Got one':null)));
  } else if (N.alive===1){
    var o=N.o, myDoor=carDoorPt(netMe), car=nearP(myDoor,2.4);
    if (G===0 && nearP(GAS,1.7)){ o.g=1; game.grab=0.5; tone(660,0.15,'triangle',0.15); }
    if (G===1 && car) o.g=2;
    if (B===0 && nearP(batPos(),1.7)){ o.b=1; game.grab=0.5; tone(660,0.15,'triangle',0.15); }
    if (B===1 && car) o.b=2;
    var work=false;
    if (done && car){ N.esc+=dt; work=true; lab='Getting in your car · '+mmss(3-N.esc); if (N.esc>=3){ N.alive=2; vm.visible=false; fleetLeave(netMe); toast('You start the engine and pull out of the lot. Watching the others.',3500); } } else N.esc=0;
    if (!done && G===2 && B===2 && !carOK && car){ o.c=Math.min(CARNEED,o.c+dt); work=true; lab='Fixing the car · '+Math.round(Math.min(1,C/CARNEED)*100)+'%'; }
    N.choreHere=null;
    N.darkChore=false;
    if (N.ih>=0 && !N.hide){ var chs=choresOf(N.ih); for (var ci2=0;ci2<chs.length;ci2++){ var ct=chs[ci2], CT=CHORE_T[ct], cid=choreId(N.ih,ct); if (cleaned[cid]) continue;
        if (Math.abs((P.y||0)-CT.f*FLOOR2)<0.5 && Math.hypot(P.x-IX-CT.x,P.z-CT.z)<1.25){ if (houses[N.ih].power) N.choreHere={hi:N.ih,t:ct,cid:cid}; else N.darkChore=true; break; } } }
    if (N.wiring){ work=true; lab=N.wiring==='chore'?'Cleaning':'Fixing the generator'; }
    N.nz=(work || P.sprinting || (N.hp===1 && !P.crouch) || N.reveal>0 || N.micLoud)?1:0;
    if (N.hp===1){ N.drip=(N.drip||0)-dt; if (N.drip<=0){ N.drip=2.2; bloodPool(P.x,P.gy,P.z,0.35); } }
    N.working=work; if (work){ N.tk=(N.tk||0)+dt; if (N.tk>0.8){ N.tk=0; tone(300+Math.random()*80,0.05,'square',0.07); } }
    var txt;
    var chorePt=null; if (ncl<CLEAN_NEED){ var cb=1e9; houses.forEach(function(hh,hi){ if (!(powered[hi] || hh.netBroke) || hh.netDead) return; if (choresOf(hi).every(function(t){ return cleaned[choreId(hi,t)]; })) return; var dp=doorPt(hh), dd=Math.hypot(P.x-dp.x,P.z-dp.z); if (dd<cb){ cb=dd; chorePt=dp; } }); }
    var genP=null, gb=1e9; houses.forEach(function(h2,hi2){ if (powered[hi2]) return; var dd=Math.hypot(P.x-h2.gen.x,P.z-h2.gen.z); if (dd<gb){ gb=dd; genP=genPt(hi2); } });
    if (done){ txt='Every job is done. Get back in your car in the lot and go.'; tgt=myDoor; }
    else if (N.ih>=0 && ncl<CLEAN_NEED && choresOf(N.ih).some(function(t){ return !cleaned[choreId(N.ih,t)]; })){ txt='Clean this house: go to a glowing spot and solve its chore puzzle.'; tgt=null; }
    else if (chorePt && (npw>=PW_NEED || !genP || cb<gb)){ txt='Go clean a house that has its lights on.'; tgt=chorePt; }
    else if (npw<PW_NEED || (ncl<CLEAN_NEED && !chorePt)){ txt='Fix a generator behind a dark house: match the coloured wires. Then the neighbour lets you in.'; tgt=genP; }
    else { txt='Finish the chores.'; tgt=chorePt; }
    if (N.ih>=0 && !houses[N.ih].power && !done){ txt='The power is out in here. Fix the generator out back before you can clean.'; tgt=genPt(N.ih); }
    if (vanPhase(N) && myCar()){ txt='Drive to the parking lot at the far end of the lane. Pull into your glowing spot.'; tgt={x:myCar().stall.x,z:STALL_Z}; }
    var pvw=N.polView||[0]; if (pvw[0]===1) txt+=' Police in '+mmss(num(pvw[1],0)-N.el)+'.'; if (N.ih>=0) txt='You are inside. '+txt;
    netObj('Kill Feast · '+clockT,txt+' Chores '+Math.min(ncl,CLEAN_NEED)+'/'+CLEAN_NEED+' · generators '+Math.min(npw,PW_NEED)+'/'+PW_NEED+' · '+alive+' alive.',tgt);
    var mc=myCar(); netSafe(vanPhase(N)&&mc?(mc.st===0?'Get ready':mc.st===1?(mc.auto?'Autopilot':'Driving · '+(isTouch?'push the stick':'W go · S brake · A/D steer')):mc.st===2?'Parking':'Getting out'):lab);
  } else { netObj('Kill Feast · '+clockT,(N.alive===2?'You escaped. ':'You are dead. ')+alive+' still alive.',null); netSafe(null); }
  if (N.el>6){
    if (left<=0 || (surv.length && alive===0)){
      var lived=surv.filter(function(q){ return q.alive || q.a===2; }).length;
      if (game.role==='killer') netOver(lived?'Morning':'Nobody left',lived?lived+' of them saw the sun come up.':'Hollow Lane is quiet again.',!lived);
      else if (N.alive===2) netOver('You got out','You drove off before the sun came up.',true);
      else if (N.alive===1) netOver('Morning','You lived to see 6:00 AM on Hollow Lane.',true);
      else netOver('He found you',lived?'But '+lived+' of the others made it.':'Nobody made it to morning.',false);
    }
  }
}
function netCoop(dt,pl,maxSt,maxF,me,host){
  var N=net, C=COOP[N.mode], i;
  if (maxF>N.f || N.failMine){ N.f=Math.max(N.f,maxF); N.failMine=false; N.inv=4; N.hold=[N.st,0]; P.x=N.sx; P.z=N.sz; N.E.vis=0; N.E.cool=10; netHurt(); toast('He caught one of you. Back to the car, and try again.',4000); }
  if (maxSt>N.st){ var pS=C.st[N.st]; if (pS && pS.t==='lure' && game.role!=='killer' && resident.g.visible && !resident.dead){ resident.dead=true; resident.g.rotation.set(-1.45,resident.g.rotation.y,0,'YXZ'); resident.g.position.y+=0.14; bloodPool(resident.g.position.x,resident.g.position.y-0.14,resident.g.position.z,1); }
    N.st=maxSt; N.hold=[N.st,0]; N.objT=0; N.prey=null; N.lureUp=false;
    if (N.st>=C.st.length){ netSafe(null); return netOver('The End',N.mode==='b'?'You both made it out of Hollow Lane.':'The lane kept them one more year.',true); }
    netStageWorld(); var S0=C.st[N.st]; toast('Chapter '+(N.st+1)+': '+S0.n+(S0.say?' · '+S0.say:''),4000); tone(523,0.3,'triangle',0.1); }
  var S=C.st[N.st]; if (!S) return;
  if (N.hold[0]!==N.st) N.hold=[N.st,0];
  var total=0; for (var id in N.acc){ var hd=N.acc[id].hold; if (hd[0]===N.st) total+=hd[1]; }
  var has=function(r){ return pl.some(function(q){ return q.role===r; }); }, at=function(q,pt,r){ return Math.hypot(q.x-pt.x,q.z-pt.z)<r; };
  var lab=null, tgt=null, adv=false, pt=S.pt?S.pt():null, mineOK=!S.who || !has(S.who) || N.role===S.who;
  if (S.t==='both'){ tgt=pt; adv=pl.every(function(q){ return at(q,pt,S.r||4.5); }); if (!adv && at(me,pt,S.r||4.5)) lab='Waiting for the other one'; }
  else if (S.t==='fetch'){ tgt=pt; if (at(me,pt,1.8)){ adv=true; game.grab=0.5; } }
  else if (S.t==='hold'){ tgt=pt; if (mineOK && at(me,pt,3)){ N.hold[1]+=dt; lab=S.lab+' · '+mmss(S.T-total); if (S.bell && Math.floor(N.hold[1]/2.3)!==Math.floor((N.hold[1]-dt)/2.3)) bell(); } adv=total>=S.T; }
  else if (S.t==='split'){ var p2=S.pt2(), solo=pl.length<2, aOK=pl.some(function(q){ return (!S.who || !has(S.who) || q.role===S.who) && at(q,pt,3.2); }), bOK=solo || pl.some(function(q){ return (!S.who || !has(S.who) || q.role!==S.who) && at(q,p2,3.6); });
    var iA=mineOK && at(me,pt,3.2), iB=at(me,p2,3.6) && !iA; tgt=(S.who && has(S.who)) ? (N.role===S.who?pt:p2) : (iA?pt:(iB?p2:(aOK?p2:pt)));
    if (iA && bOK){ N.hold[1]+=dt; lab=S.lab+' · '+mmss(S.T-total); } else if (iA) lab='Waiting for the lookout'; else if (iB) lab=aOK?'Keeping watch · '+mmss(S.T-total):'Keeping watch'; adv=total>=S.T; }
  else if (S.t==='lure'){ var lp=lurePt(S), luring=!has('girl') || N.role==='girl'; tgt=lp;
    if (total<4){ if (luring && at(me,lp,2.6)){ N.hold[1]+=dt; lab='Knocking · '+mmss(4-total); if (Math.floor(N.hold[1]*2)!==Math.floor((N.hold[1]-dt)*2)) thud(0.5); } }
    else if (game.role==='killer'){ if (!N.prey){ var who=S.h<0?game.clerk:houses[S.h].n; N.prey={x:lp.x,z:lp.z+(S.h<0?0:-houses[S.h].side*1.2),ry:0,an:0,who:who,t:0,st:1,tired:0,jink:0,jinkT:0,acc:0,lx:lp.x,lz:lp.z,dead:false};
          showResident(who); say(who,'Who is it? … Oh God. No!',2600); }
        adv=preyTick(dt,pl.filter(function(q){ return !q.me; })); if (N.prey) tgt={x:N.prey.x,z:N.prey.z}; }
    else { var kp=null; pl.forEach(function(q){ if (q.role==='killer' && q.pr.pv && q.pr.pv.length>=7 && (q.pr.pv[6]|0)===N.st) kp=q.pr.pv; });
      if (kp){ var who2=Math.max(0,Math.min(NEIGHBOURS.length-1,num(kp[4],0)|0)); if (!N.lureUp){ N.lureUp=true; showResident(who2); }
        var R=resident.g, rx=num(kp[0],0), rz=num(kp[1],0); R.visible=true; R.position.x+=(rx-R.position.x)*Math.min(1,dt*10); R.position.z+=(rz-R.position.z)*Math.min(1,dt*10); R.position.y=groundY(rx,rz); turnTo(R,num(kp[2],0),dt); residentAnim(kp[3]===2?'Run':(kp[3]===1?'Walk':'Idle')); tgt={x:rx,z:rz}; lab='Help him corner them'; } } }
  if (adv){ N.st++; N.hold=[N.st,0]; N.objT=0; if (N.st>=C.st.length){ netSend({st:N.st}); netSafe(null); return netOver('The End',N.mode==='b'?'You both made it out of Hollow Lane.':'The lane kept them one more year.',true); }
    N.prey=N.prey && N.prey.dead ? N.prey : null; N.lureUp=false; netStageWorld(); var S1=C.st[N.st]; toast('Chapter '+(N.st+1)+': '+S1.n+(S1.say?' · '+S1.say:''),4000); tone(523,0.3,'triangle',0.1); netSend({st:N.st}); if (N.prey) N.prey=null; return; }
  N.working=!!lab && /·/.test(lab);
  netObj('Chapter '+(N.st+1)+' · '+S.n,S.o,tgt); netSafe(lab);
}
function preyTick(dt,others){
  var N=net, q=N.prey, dx=q.x-P.x, dz=q.z-P.z, d=Math.hypot(dx,dz)||0.01; q.t+=dt;
  if (d<1.35){ q.dead=true; stabSound(); scream(1.1); var f=fwd(); bloodBurst(q.x,1.2,q.z,f.x,f.z,70); bloodPool(q.x,groundY(q.x,q.z),q.z,1); gore();
    resident.dead=true; resident.g.rotation.set(-1.45,resident.g.rotation.y,0,'YXZ'); resident.g.position.y=groundY(q.x,q.z)+0.14; toast('Nobody heard '+NEIGHBOURS[q.who].n+'.',2600); return true; }
  if (q.t>80){ toast('They got back inside. Knock again.',3000); N.prey=null; N.hold=[N.st,0]; for (var id in N.acc) if (N.acc[id].hold[0]===N.st) N.acc[id].hold=[-1,0]; resident.g.visible=false; return false; }
  var vx=dx/d, vz=dz/d, scared=d<17;
  others.forEach(function(o){ var ex=q.x-o.x, ez=q.z-o.z, e=Math.hypot(ex,ez)||0.01; if (e<11){ var k=(11-e)/11*1.2; vx+=ex/e*k; vz+=ez/e*k; } });
  if (q.x>64) vx-=1.5; if (q.x<-150) vx+=1.5; if (q.z>34) vz-=1.5; if (q.z<-34) vz+=1.5;
  var n=Math.hypot(vx,vz)||1; vx/=n; vz/=n;
  if (q.jinkT>0){ q.jinkT-=dt; var c=Math.cos(1.35*q.jink), s=Math.sin(1.35*q.jink), tx=vx*c-vz*s; vz=vx*s+vz*c; vx=tx; }
  var running=scared && q.tired<=0; if (running){ q.st-=dt/6.5; if (q.st<=0) q.tired=3.5; } else { q.st=Math.min(1,q.st+dt/8); q.tired-=dt; }
  var sp=running?5.6:(scared?2.8:0), p={x:q.x+vx*sp*dt,z:q.z+vz*sp*dt}; resolve(p,0.4); p.x=Math.max(-157,Math.min(71,p.x)); p.z=Math.max(-39,Math.min(39,p.z));
  q.acc+=dt; if (q.acc>0.7){ if (sp>0 && Math.hypot(p.x-q.lx,p.z-q.lz)<sp*0.7*0.3){ q.jink=Math.random()<0.5?1:-1; q.jinkT=1.1; } q.lx=p.x; q.lz=p.z; q.acc=0; }
  q.x=p.x; q.z=p.z; if (sp>0) q.ry=Math.atan2(vx,vz); q.an=running?2:(sp>0?1:0);
  var R=resident.g; R.visible=true; R.position.set(q.x,groundY(q.x,q.z),q.z); turnTo(R,q.ry,dt); residentAnim(q.an===2?'Run':(q.an===1?'Walk':'Idle'));
  return false;
}
(function(){
  var nn=$('netName'); if (nn) nn.value=SAVE.nick||'';
  Array.prototype.forEach.call(document.querySelectorAll('[data-net]'),function(b){ b.addEventListener('click',function(){ netJoin(newCode(),b.dataset.net); }); });
  $('netCreateBtn').addEventListener('click',function(){ netName(); dirOpen(); netJoin(newCode(),'s'); });
  $('netFindBtn').addEventListener('click',findOpen);
  $('findJoin').addEventListener('click',function(){ netJoin($('netCode').value,null); });
  $('netCode').addEventListener('keydown',function(e){ if (e.key==='Enter') netJoin($('netCode').value,null); });
  $('lobStart').addEventListener('click',lobbyStart);
  $('lobLeave').addEventListener('click',function(){ netLeave(); show('online'); });
  $('neLobby').addEventListener('click',netToLobby);
  $('neLeave').addEventListener('click',leaveToMenu);
  window.addEventListener('keydown',function(e){ if (!net || game.mode!=='play') return; if (net.alive!==1 && e.code==='Space') net.spec++;
    if (e.code==='KeyQ') useSense();
    if (e.code==='KeyZ') useScare();
    if (e.code==='KeyX') useVanish();
    if (e.code==='KeyV') swing();
    if (net.chat){ if (e.code==='Digit1') chatPick(1); else if (e.code==='Digit3') chatPick(3); return; }
    if (e.code==='KeyR') useHeld(); });
  Array.prototype.forEach.call(document.querySelectorAll('#chatBox [data-c]'),function(b){ b.addEventListener('click',function(){ chatPick(+b.dataset.c); }); });
  $('senseBtn').addEventListener('click',useSense); $('scareBtn').addEventListener('click',useScare); $('vanishBtn').addEventListener('click',useVanish);
  $('btnSwing').addEventListener('pointerdown',function(e){ e.preventDefault(); swing(); });
  $('btnUse').addEventListener('pointerdown',function(e){ e.preventDefault(); useHeld(); });
})();

/* ---------- Kill Feast: chests, heals, bear traps, knives ---------- */
var CHEST_SPOTS=[[-44,9.6],[-22,-9.6],[0,9.6],[22,-9.6],[44,9.6],[-33,-9.6],[33,9.6],[-84,-14],[66,9.6],[88,-9.6],[110,9.6],[132,-9.6],[62,-11]];
CHEST_SPOTS.push([97,-18.2],[111.5,-30.5],[89.5,20.5],[123,31],[133,-10],[80,10.5]);
var chests=[], trapMeshes={}, ITEMN={heal:'Heal kit',trap:'Bear trap',knife:'Knife'};
var chestWoodM=mat(0x5a3a22,{roughness:.75}), chestBandM=mat(0x2a2c30,{roughness:.4,metalness:.6}), trapM=mat(0x3a3c40,{roughness:.45,metalness:.7}), trapBloodM=mat(0x5a0a08,{roughness:.5,metalness:.3});
function buildChests(){
  return;   // no chests or pick-ups any more
  if (chests.length) return;
  CHEST_SPOTS.forEach(function(c,i){
    var x=c[0], z=c[1]; for (var k=0;k<24 && blocked(x,z,0.7);k++){ x=c[0]+Math.cos(k*1.7)*(0.6+k*0.25); z=c[1]+Math.sin(k*1.7)*(0.6+k*0.25); }
    var g=new THREE.Group(); g.position.set(x,0,z); g.rotation.y=(i*1.3)%6.28; scene.add(g);
    box(0.9,0.48,0.56,chestWoodM,0,0.24,0,g); box(0.94,0.06,0.6,chestBandM,0,0.1,0,g); box(0.94,0.06,0.6,chestBandM,0,0.4,0,g);
    var lid=new THREE.Group(); lid.position.set(0,0.48,-0.28); g.add(lid); box(0.92,0.14,0.58,chestWoodM,0,0.07,0.29,lid); box(0.12,0.12,0.04,chestBandM,0,0.02,0.6,lid);
    var glow=halo(0xffc070,1.1,0,0.7,0,g,0.55);
    g.traverse(function(o){ if (o.isMesh){ o.castShadow=true; o.receiveShadow=true; } });
    chests.push({g:g,lid:lid,glow:glow,x:x,z:z,open:false}); });
}
function chestItem(gid,i){ var h=Math.abs(Math.sin((gid%100000)*0.013+i*12.9898)*43758.5453); h-=Math.floor(h); return h<0.4?'heal':(h<0.7?'trap':'knife'); }
function trapMesh(id){
  var m=trapMeshes[id]; if (m) return m;
  var g=new THREE.Group(), ring=new THREE.Mesh(new THREE.TorusGeometry(0.3,0.025,6,24),trapM); ring.rotation.x=Math.PI/2; g.add(ring);
  var plate=new THREE.Mesh(new THREE.CylinderGeometry(0.1,0.1,0.02,12),trapM); plate.position.y=0.02; g.add(plate);
  for (var i=0;i<14;i++){ var a=i/14*Math.PI*2, t=new THREE.Mesh(new THREE.ConeGeometry(0.025,0.09,4),trapM); t.position.set(Math.cos(a)*0.3,0.05,Math.sin(a)*0.3); g.add(t); }
  scene.add(g); trapMeshes[id]=m={g:g,sprung:false}; return m;
}
function clearItems(){ chests.forEach(function(c){ c.open=false; c.lid.rotation.x=0; c.glow.visible=true; c.g.visible=false; });
  for (var id in trapMeshes){ scene.remove(trapMeshes[id].g); } trapMeshes={}; $('items').hidden=true; }
function itemsUI(){
  var N=net, el=$('items'), show=N && N.mode==='s' && game.role!=='killer' && N.alive===1 && game.mode==='play', sb=$('senseBtn'), ks=N && N.mode==='s' && game.role==='killer' && game.mode==='play';
  if (sb.hidden!==!ks) sb.hidden=!ks; var sw=$('btnSwing'); if (sw.hidden!==!ks) sw.hidden=!ks; if (ks){ var lab=(isTouch?'':'Q · ')+(N.senseCd>0?'Sense '+Math.ceil(N.senseCd)+'s':'Sense'); if (sb.textContent!==lab) sb.textContent=lab; sb.disabled=N.senseCd>0; }
  [['scareBtn','Z · ','Scare',N&&N.scareCd],['vanishBtn','X · ','Vanish',N&&N.vanCd]].forEach(function(a){ var bt=$(a[0]); if (bt.hidden!==!ks) bt.hidden=!ks; if (!ks) return; var l2=(isTouch?'':a[1])+(a[3]>0?a[2]+' '+Math.ceil(a[3])+'s':(N.iv>0 && a[0]==='vanishBtn'?'Unseen '+Math.ceil(N.iv)+'s':a[2])); if (bt.textContent!==l2) bt.textContent=l2; bt.disabled=a[3]>0; });
  show=show && !!N.held; if (el.hidden!==!show) el.hidden=!show; var ub=$('btnUse'); if (ub.hidden!==!show) ub.hidden=!show; if (!show) return;
  var lab='Holding: '+HELDN[N.held]+(N.held==='knife'?' ('+N.kn+(N.kn===1?' stab':' stabs')+')':'')+(isTouch?' · tap Use':' · click or R to use'); if (el.textContent!==lab) el.textContent=lab;
}
function bloodyKnife(){ var k=vmKnife.children[0], b=k&&k.userData.blade; if (!b) return; vmKnife.userData.c=vmKnife.userData.c||b.material.color.clone(); b.material.color.lerp(lin(0x5a0606),0.35); }
function swing(){ var N=net; if (!N || N.mode!=='s' || game.role!=='killer' || game.mode!=='play' || N.stun>0 || N.jailed || N.swingT>0 || N.cd>0) return; N.iv=0;
  N.swingT=0.5; N.swingDone=false; noise(0.18,0.22,1800); tone(240,0.12,'sawtooth',0.04,120); }
function swingTick(dt){ var N=net; if (!N || !(N.swingT>0)) { FX.sw=0; return; } N.swingT-=dt; var p=1-N.swingT/0.5; FX.sw=Math.sin(Math.PI*Math.min(1,p));
  if (!N.swingDone && p>0.32){ N.swingDone=true; N.swingHit=true; } }
function useScare(){ var N=net; if (!N || N.mode!=='s' || game.role!=='killer' || game.mode!=='play' || N.stun>0 || N.jailed) return; if (vanPhase(N)){ toast('Wait until they are out of the car.',1600); return; }
  if (N.scareCd>0){ toast('Scare is ready in '+Math.ceil(N.scareCd)+' s.',1400); return; } N.scareCd=40; N.sc=(N.sc||0)+1; netSend({sc:N.sc}); N.iv=0;
  N.sense=Math.max(N.sense||0,5); scream(0.55); thud(1.1); shake(); toast('You let out a scream. They all heard it, and for a few seconds you can hear exactly where they are.',3000); if (N.isHost) scareBots(); }
function useVanish(){ var N=net; if (!N || N.mode!=='s' || game.role!=='killer' || game.mode!=='play' || N.stun>0 || N.jailed) return; if (vanPhase(N)){ toast('Wait until they are out of the car.',1600); return; }
  if (N.vanCd>0){ toast('Vanish is ready in '+Math.ceil(N.vanCd)+' s.',1400); return; } N.vanCd=40; N.iv=8; tone(70,1.0,'sine',0.14,40); noise(0.4,0.15,300); toast('You fade into the dark. Nobody can see you for 8 seconds, until you swing.',2600); }
// every survivor gets the jump scare, freezes for a moment, and gives away where they are
function scared(){ var N=net; if (!N || game.role==='killer' || N.alive!==1 || game.mode!=='play') return; jumpFace(); scream(1.15); N.fright=1.2; N.reveal=6; toast('Something screamed right next to you. You froze, and he can hear you now.',3000); }
function scareBots(){ var N=net; if (!N || !N.isHost) return; N.bots.forEach(function(b){ if (b.role==='s' && b.a===1){ b.frozen=1.2; b.scare=8; b.nzF=6; if (b.hid && Math.random()<0.4){ b.hid=0; b.hide=null; } } }); }
function useSense(){ var N=net; if (!N || N.mode!=='s' || game.role!=='killer' || game.mode!=='play' || N.stun>0) return; if (vanPhase(N)){ toast('Wait until they are out of the car.',1600); return; }
  if (N.senseCd>0){ toast('Sense is ready in '+Math.ceil(N.senseCd)+' s.',1400); return; } N.sense=5; N.senseCd=40; tone(90,1.2,'sawtooth',0.12,45); heartbeat(0.4); toast('You can sense every one of them.',2200); }
/* ---------- one thing in your left hand ---------- */
var HELDN={heal:'First aid kit',trap:'Bear trap',knife:'Knife'};
var vmHeld=(function(){ var g={heal:new THREE.Group(),trap:new THREE.Group(),knife:new THREE.Group()};
  box(0.11,0.08,0.05,mat(0xc0201a,{roughness:.5}),0,0.05,-0.06,g.heal); box(0.05,0.015,0.052,mat(0xf4f0e8),0,0.06,-0.06,g.heal); box(0.015,0.05,0.052,mat(0xf4f0e8),0,0.06,-0.06,g.heal);
  var r=new THREE.Mesh(new THREE.TorusGeometry(0.06,0.008,6,18),mat(0x3a3c40,{roughness:.45,metalness:.7})); r.rotation.x=Math.PI/2; r.position.set(0,0.04,-0.07); g.trap.add(r);
  for (var i=0;i<8;i++){ var a=i/8*Math.PI*2, t=new THREE.Mesh(new THREE.ConeGeometry(0.008,0.025,4),r.material); t.position.set(Math.cos(a)*0.06,0.055,-0.07+Math.sin(a)*0.06); g.trap.add(t); }
  var k=makeKnife(); k.scale.setScalar(0.7); k.rotation.set(-1.2,0,0.2); k.position.set(0,0.01,-0.05); g.knife.add(k);
  Object.keys(g).forEach(function(n){ g[n].visible=false; vmL.add(g[n]); }); return g; })();
function heldShow(){ var h=net && net.mode==='s' && net.alive===1 ? net.held : null; Object.keys(vmHeld).forEach(function(n){ vmHeld[n].visible=h===n; }); return h; }
function giveHeld(it){ return false; var N=net; if (N.held) return false; N.held=it; if (it==='knife') N.kn=2; game.grab=0.5; itemsUI(); return true; }
function useHeld(){
  var N=net; if (!N || N.mode!=='s' || game.role==='killer' || N.alive!==1 || game.mode!=='play' || N.hide || !N.held) return;
  var k=N.held;
  if (k==='heal'){ if (N.hp>=3){ toast('You are not hurt.',1600); return; } N.held=null; N.hp=Math.min(3,N.hp+1); tone(520,0.2,'sine',0.15,780); toast('Patched up. +1 health.',2000); game.grab=0.5; }
  else if (k==='trap'){ var f=fwd(), x=P.x+f.x*0.9, z=P.z+f.z*0.9; if (N.ih>=0 || blocked(x,z,0.2)){ toast('No room for a trap there.',1600); return; }
    N.held=null; N.tn=(N.tn||0)+1; N.traps.push([N.tn,Math.round(x*100)/100,Math.round(z*100)/100]); if (N.traps.length>4) N.traps.shift(); noise(0.12,0.3,2400); tone(180,0.1,'square',0.08); toast('Bear trap set.',1800); game.grab=0.5; }
  else if (k==='knife'){ if (!N.kn){ N.held=null; } else N.stabReq=true; }
  itemsUI();
}

function useItem(){ useHeld(); }
// Called every frame from the Kill Feast tick.
function itemsTick(dt,pl,killers){
  net.pl=pl; var pl0=pl;
  var N=net, opened={}, sprung={}, traps=[], id, i;
  buildChests(); chests.forEach(function(c){ c.g.visible=true; });
  for (id in N.acc){ var A=N.acc[id]; (A.cs||[]).forEach(function(c){ opened[c]=1; }); (A.tt||[]).forEach(function(t){ sprung[t]=1; }); }
  N.cs.forEach(function(c){ opened[c]=1; }); N.tt.forEach(function(t){ sprung[t]=1; });
  chests.forEach(function(c,ci){ if (opened[ci] && !c.open){ c.open=true; c.glow.visible=false; } c.lid.rotation.x+=((c.open?-1.9:0)-c.lid.rotation.x)*Math.min(1,dt*6); });
  for (id in N.acc){ var tl=N.acc[id].tp||[]; for (i=0;i<tl.length;i++){ var tr=tl[i], tid=id+':'+tr[0]; traps.push({id:tid,x:tr[1],z:tr[2],sp:!!sprung[tid]}); } }
  var live={}; traps.forEach(function(t){ live[t.id]=1; var m=trapMesh(t.id); m.g.position.set(t.x,groundY(t.x,t.z)+0.01,t.z); if (t.sp && !m.sprung){ m.sprung=true; m.g.children.forEach(function(o){ o.material=trapBloodM; }); m.g.scale.set(0.8,1.6,0.8); } });
  for (id in trapMeshes) if (!live[id]){ scene.remove(trapMeshes[id].g); delete trapMeshes[id]; }
  // my own traps that went off are spent
  N.traps=N.traps.filter(function(t){ return !sprung[netMe+':'+t[0]]; });
  N.doorSeen=N.doorSeen||{}; pl.forEach(function(q){ var kd=q.me?null:q.pr.kd; if (!Array.isArray(kd) || kd.length!==2) return; var hi=kd[0]|0, st=num(kd[1],0); if (hi<0 || hi>=houses.length) return;
    if (N.doorSeen[q.id]!==st){ var first=N.doorSeen[q.id]===undefined; N.doorSeen[q.id]=st; if (!first){ var hh=houses[hi]; if (!(N.knock && N.knock.h===hh)){ hh.open=1; setTimeout(function(){ if (net && !(net.knock && net.knock.h===hh)) hh.open=0; },3200); } } } });
  if (game.role==='killer'){
    if (N.stun<=0) traps.forEach(function(t){ if (t.sp || sprung[t.id]) return; if (Math.hypot(t.x-P.x,t.z-P.z)<0.75){ N.tt.push(t.id); sprung[t.id]=1; N.stun=Math.max(N.stun,3.5); N.stunWhy='trap'; noise(0.3,0.9,2800); thud(0.9); shake(); toast('A bear trap! You are stuck.',2500); } });
  }
  if (N.isHost) N.bots.forEach(function(b){ if (b.role!=='k' || b.stun>0) return; traps.forEach(function(t){ if (t.sp || sprung[t.id]) return; if (Math.hypot(t.x-b.x,t.z-b.z)<0.75){ N.tt.push(t.id); sprung[t.id]=1; b.stun=3.5; b.stunWhy='trap'; noise(0.3,0.6,2800); } }); });
  if (N.tt.length>40) N.tt=N.tt.slice(-40);
  // knife stab: needs a killer close and in front of you
  if (N.stabReq){ N.stabReq=false; var f=fwd(), hit=null, hd=2.2;
    killers.forEach(function(k){ if (k.ih!==N.ih || Math.abs((k.y||0)-(P.y||0))>1.3) return; var dx=k.x-P.x, dz=k.z-P.z, d=Math.hypot(dx,dz); if (d<hd && (dx*f.x+dz*f.z)/(d||1)>0.35){ hd=d; hit=k; } });
    N.kn--; if (N.kn<=0){ N.kn=0; N.held=null; } vmL.visible=true; game.grab=0.35;
    if (hit){ N.kh[hit.id]=(N.kh[hit.id]||0)+1; stabSound(); bloodBurst(hit.x,1.3,hit.z,f.x,f.z,30); var hc=Math.min(4,num(hit.pr.hc,0)+1); toast(num(hit.pr.sn,0)>0?'The killer is already stunned.':(hc>=4?'Four hits! The killer is stunned for 10 seconds.':'You stabbed '+(hit.bot?'the killer bot':nick(hit.pr))+'. '+hc+' of 4.'),2200); }
    else { noise(0.08,0.2,3000); toast('Missed.',1200); }
  }
  // a killer stabbed 4 times is stunned for 10 seconds, then the count starts again
  if (game.role==='killer'){ var st=0; for (id in N.acc) st+=(N.acc[id].kh[netMe]||0);
    if (st>N.khSeen){ var add=st-N.khSeen; N.khSeen=st; if (N.stun<=0 || N.stunWhy!=='hits'){ N.hc=(N.hc||0)+add; netHurt();
        if (N.hc>=4){ N.hc=0; N.stun=10; N.stunWhy='hits'; toast('They got you four times. You are stunned for 10 seconds.',3500); sting(0.3,false); }
        else toast('Stabbed. '+N.hc+' of 4.',1800); } } }
  if (N.isHost) N.bots.forEach(function(b){ if (b.role!=='k') return; var st2=0; for (var id2 in N.acc) st2+=(N.acc[id2].khb[b.id]||0);
    if (st2>(b.khSeen||0)){ var add2=st2-(b.khSeen||0); b.khSeen=st2; if (!(b.stun>0 && b.stunWhy==='hits')){ b.hc=(b.hc||0)+add2; if (b.hc>=4){ b.hc=0; b.stun=10; b.stunWhy='hits'; toast('The killer bot is stunned for 10 seconds.',2600); } } } });
  itemsUI();
}
// Knocking in Kill Feast: half the time someone answers and helps, unless the killer is right behind you.
var NETLINES={heal:['You are bleeding. Hold still… there. Now go.','Lord, look at you. Take this and press it on.','Here, here. That will hold. Go!'],
  give:['I can’t let you in, but take this.','Take it. I don’t want it back.','Here. Use it on him.'],
  no:['I am not opening this door!','Go away! He’ll come here next!','Not tonight. I’m sorry.'],
  close:['He’s right behind you! I’m sorry!','No, no, no, he’s RIGHT THERE!']};
function netKnockStart(h,killerNear){
  var N=net; [0.14,0.33,0.52].forEach(function(w){ tone(170,0.07,'square',0.16,80,w); }); game.kA=0.85;
  if (h.netCd>game.time){ toast('Nobody comes to this door again.',2000); return; }
  h.netCd=game.time+60; N.knock={h:h,t:0,ans:!killerNear && Math.random()<0.55,close:killerNear,st:0};
}
function netKnockTick(dt){
  var N=net, k=N.knock; if (!k) return; var h=k.h; k.t+=dt;
  if (k.st===0 && k.t>1.3){ k.st=1;
    if (!k.ans){ if (k.close && Math.random()<0.7){ h.open=0.25; say(h.n,NETLINES.close[(Math.random()*2)|0],2400); setTimeout(function(){ thud(1.3); },400); }
      else if (Math.random()<0.5) say(h.n,NETLINES.no[(Math.random()*3)|0],2600); else toast('No answer.',2000); k.t=99; return; }
    h.open=1; h.hall.visible=true; showResident(h.n); tmpV.set(0.12,0.6,4.3); h.g.localToWorld(tmpV); resident.g.position.copy(tmpV); resident.g.rotation.y=h.g.rotation.y;
    tmpV.set(0,2.2,5.2); h.g.localToWorld(tmpV); doorLight.position.copy(tmpV); doorLight.intensity=1.8; tone(140,0.35,'sawtooth',0.03,210);
    N.kd=[houses.indexOf(h),Date.now()%1e7];
    if (N.hp<3){ N.hp++; say(h.n,NETLINES.heal[(Math.random()*3)|0],3200); tone(520,0.2,'sine',0.15,780); }
    else say(h.n,['Stay safe out there.','I can’t help you. Go!','Lock yourself in somewhere.'][(Math.random()*3)|0],3000);
    itemsUI(); }
  if (k.t>4.6){ if (h.open){ h.open=0; h.hall.visible=false; resident.g.visible=false; doorLight.intensity=0; } N.knock=null; }
}
function netAct(){
  var N=net; if (!N) return; var pl=N.pl||[]; if (N.alive!==1){ N.spec++; return; }
  if (N.mode!=='s' || N.fin) return; var n=N.near; if (!n) return;
  if (n.k==='unhide') return netUnhide();
  if (n.k==='wire'){ if (!wireUI.isOpen()) wireUI.open(n.hi); return; }
  if (n.k==='chore'){ if (!choreUI.isOpen()) choreUI.open(n.c.hi,n.c.t); return; }
  if (n.k==='door'){ if (game.role==='killer' && !n.h.netBroke) return startDoorBreak(n.h); if (game.role!=='killer' && !n.h.power && !n.h.netBroke){ thud(0.4); say(n.h.n,['The power’s out and I can’t see a thing! Fix the generator out back and I’ll let you in.','Who’s there? Get my generator running first, it’s round the back.','I’m not opening up in the dark. Fix the wires on the generator.'][(Math.random()*3)|0],3200); return; } return netEnterHouse(n.h); }
  if (n.k==='chat'){ if (N.chat) closeChat(); else openChat(n.h); return; }
  if (n.k==='killnb') return killNeighbour(n.h);
  if (n.k==='up'){ P.x=IX+1.55; P.z=-3.35; P.fl=1; P.y=FLOOR2; P.yaw=Math.PI/2*-1+Math.PI; iFix(P,0.3); stepSound(false,false); noise(0.1,0.1,500); return; }
  if (n.k==='down'){ P.x=IX+0.27; P.z=1.1; P.fl=0; P.y=0; P.yaw=Math.PI; iFix(P,0.3); stepSound(false,false); noise(0.1,0.1,500); return; }
  if (n.k==='hide') return netHideAt(n.s);
  if (n.k==='search'){ var sx=(n.s.in?IX:0)+n.s.x, sz=n.s.z, found=null; var sy=n.s.in?n.s.f*FLOOR2:(n.s.y||0); pl.forEach(function(q){ if (q.hid && q.alive && q.ih===N.ih && Math.hypot(q.x-sx,q.z-sz)<1.3 && Math.abs((q.y||0)-sy)<1.2) found=q; });
    noise(0.25,0.4,700); thud(0.6); if (found){ N.k[found.id]=(N.k[found.id]||0)+1; stabSound(); bloodBurst(sx,1.0,sz,0,1,40); toast('Found '+nick(found.pr)+' hiding!',2400); } else toast('Nobody in there.',1600); return; }
  if (n.k==='chest'){ var ci=n.i, it=chestItem(N.gid,ci); if (N.cs.indexOf(ci)>=0) return; if (N.held){ toast('Your hands are full. Use what you’re holding first.',2200); return; } N.cs.push(ci); setPrompt(null);
    giveHeld(it); noise(0.2,0.25,700); tone(660,0.15,'triangle',0.15); tone(990,0.25,'triangle',0.12,null,0.1);
    toast('Found a '+HELDN[it].toLowerCase()+(it==='knife'?' (2 stabs).':'.')+' It’s in your left hand.',3000); itemsUI(); }
}
/* ---------- teammate cards (bottom left) ---------- */
var portraits={}; if (isTouch) document.body.classList.add('touch');
function hexc(h){ return '#'+('00000'+(h>>>0).toString(16)).slice(-6); }
function skinIdx(q){ var si=num(q.pr.sk,-1)|0; if (si<0 || si>=NEIGHBOURS.length){ si=0; for (var c=0;c<q.id.length;c++) si=(si*31+q.id.charCodeAt(c))%NEIGHBOURS.length; } return si; }
function portrait(key,sp){
  if (portraits[key]) return portraits[key];
  var c=document.createElement('canvas'); c.width=c.height=64; var g=c.getContext('2d');
  var bg=g.createRadialGradient(32,30,4,32,32,40); bg.addColorStop(0,'#2a2018'); bg.addColorStop(1,'#07090f'); g.fillStyle=bg; g.fillRect(0,0,64,64);
  function el(x,y,rx,ry,col){ g.fillStyle=col; g.beginPath(); g.ellipse(x,y,rx,ry,0,0,7); g.fill(); }
  if (!sp){ // the killer: hat and white mask
    el(32,64,24,12,'#1c2533'); el(32,24,22,6,'#151314'); g.fillStyle='#1d1a19'; g.fillRect(19,8,26,15);
    el(32,36,13,17,'#e8e4dc'); el(26,34,3.6,2.4,'#0b0a0b'); el(38,34,3.6,2.4,'#0b0a0b'); g.fillStyle='#4a2a22'; g.fillRect(28,45,8,1.5);
  } else if (sp.rig==='w'){ var L=sp.look||{};
    el(32,64,22,12,hexc(L.top||0x999999)); el(32,24,19,16,hexc(L.hair||0x221a14)); el(18,13,7,6,hexc(L.hair||0x221a14)); el(46,13,7,6,hexc(L.hair||0x221a14));
    g.fillStyle=hexc(L.sk||0xc89a7c); g.fillRect(28,44,8,8); el(32,33,11,14,hexc(L.sk||0xc89a7c));
    g.strokeStyle=hexc(L.acc||0xc0281e); g.lineWidth=3; g.beginPath(); g.arc(32,30,15,Math.PI*1.05,Math.PI*1.95); g.stroke(); el(17,32,3.5,5,hexc(L.acc||0xc0281e)); el(47,32,3.5,5,hexc(L.acc||0xc0281e));
    el(27,32,2,1.6,'#1a1210'); el(37,32,2,1.6,'#1a1210'); g.fillStyle='#6a3a30'; g.fillRect(29,40,6,1.4);
  } else { var L2=sp.look||{}, sk=sp.skin===0xffffff?0xd8b8a0:(sp.skin===undefined?0xd8b8a0:sp.skin), hd=L2.hd;
    el(32,64,23,12,hexc(sp.top||0x555555)); g.fillStyle=hexc(sk); g.fillRect(27,44,10,8); el(32,33,11.5,14,hexc(sk));
    if (hd!=='bald' && hd!=='cap' && hd!=='beanie' && hd!=='flat'){ el(32,23,12,6,hexc(sp.hair)); }
    if (hd==='long'){ g.fillStyle=hexc(sp.hair); g.fillRect(20,24,4,16); g.fillRect(40,24,4,16); }
    if (hd==='cowboy'){ el(32,22,20,4.5,hexc(L2.hatc||0x3a2a1a)); g.fillStyle=hexc(L2.hatc||0x3a2a1a); g.fillRect(22,11,20,11); }
    if (hd==='cap'){ el(32,22,12,7,hexc(L2.hatc||0x2a4a8a)); g.fillStyle=hexc(L2.hatc||0x2a4a8a); g.fillRect(30,22,16,3); }
    if (hd==='beanie'){ el(32,21,12.5,9,hexc(L2.hatc||0x6a1f1a)); g.fillStyle='rgba(0,0,0,.25)'; g.fillRect(20,25,24,3); }
    if (hd==='flat'){ el(32,21,13,5,hexc(L2.hatc||0x8a7a52)); }
    el(27,32,2,1.6,'#1a1210'); el(37,32,2,1.6,'#1a1210');
    if (L2.gl){ g.strokeStyle='#111'; g.lineWidth=1.3; g.strokeRect(23,29.5,7,5); g.strokeRect(34,29.5,7,5); g.beginPath(); g.moveTo(30,31.5); g.lineTo(34,31.5); g.stroke(); }
    if (sp.beard){ g.fillStyle=hexc(sp.hair); g.fillRect(26,38,12,3); }
    g.fillStyle='#5a3028'; g.fillRect(29,42,6,1.4);
  }
  return portraits[key]=c.toDataURL();
}
function teamTick(pl){ var tm=$('team'); if (!tm.hidden) tm.hidden=true; return;
  var N=net, el=$('team'), mineK=game.role==='killer', mates=pl.filter(function(q){ return !q.me && ((q.role==='k')===mineK); });
  var show=game.mode==='play' && mates.length>0; if (el.hidden!==!show) el.hidden=!show; if (!show) return;
  var rows=mates.map(function(q){ var sp=mineK?null:NEIGHBOURS[skinIdx(q)], hp, st;
    if (mineK){ var sn=num(q.pr.sn,0)>0, hc=Math.max(0,Math.min(4,num(q.pr.hc,0)|0)); hp=4-hc; st=sn?'Stunned':''; }
    else { hp=q.a===0?0:Math.max(0,Math.min(3,num(q.bot?q.bot.hp:q.pr.h,3)|0)); st=q.a===2?'Escaped':(q.a===0?'Dead':''); }
    return {id:q.id,name:nick(q.pr),img:portrait(mineK?'k':'s'+skinIdx(q),sp),hp:hp,max:mineK?4:3,st:st}; });
  var key=JSON.stringify(rows.map(function(r){ return [r.id,r.name,r.hp,r.st]; })); if (el.dataset.k===key) return; el.dataset.k=key; el.textContent='';
  rows.forEach(function(r){ var card=document.createElement('div'); card.className='mate'+(r.st==='Dead'?' dead':'');
    var im=document.createElement('img'); im.src=r.img; im.alt=''; card.appendChild(im);
    var info=document.createElement('div'), nm=document.createElement('b'); nm.textContent=r.name; info.appendChild(nm);
    var bar=document.createElement('span'); bar.className='mbar'; for (var i=0;i<r.max;i++){ var seg=document.createElement('i'); if (i<r.hp) seg.className=r.hp<=1?'on low':'on'; bar.appendChild(seg); } info.appendChild(bar);
    if (r.st){ var s=document.createElement('em'); s.textContent=r.st; info.appendChild(s); }
    card.appendChild(info); el.appendChild(card); });
}

/* ---------- update notes and new-update alerts ---------- */
var GAME_VER=59;
var UPDATES=[
  {v:59,t:'Music instead of red, a Tokens tab',n:['No more red at the edges of the screen when the killer is near. Instead a low, dissonant score creeps in and gets louder and faster the closer it gets, with a shriek when it is right on you.','Chests are gone, and so are the knives, first aid kits and bear traps. Neighbours don’t hand out items any more either.','The shop has a Tokens tab: your balance and a history of every token you earned and spent. Token packs you can buy are coming soon.']},
  {v:58,t:'Mics, cut generators, a bigger street',n:['Your microphone is in the game. The bar in the bottom-left shows how loud you are; past the white line the killer hears you and comes for you. Tap the bar to turn the mic on or mute it.','The killer sneaks round the back and cuts generators, often at a house with someone inside. The lights die, and you can’t clean until someone wires it back up.','The map is just the neighbourhood now, with the gas station and the police station. The park, churchyard, hospital and supermarket are gone, and the street goes on with 6 more houses: 18 in all.','10 new characters: Jax, Tess, Moe, Kiko, Zeke, Lou, Rudy, Bea, Ike and Zora. There is no default skin any more: everyone starts as Jax, and the shop always shows the characters you own.','The teammate cards on the left of the screen are gone, and the lobby no longer lists the AI killer.','The intro no longer clips through a house when it shows the parking lot, and bots start in their own cars instead of standing in the lot first.']},
  {v:57,t:'Killer unseen on the drive',n:['The killer is only invisible while everyone is driving in. Once you are out of your car you can see it again, like before.']},
  {v:56,t:'Own cars, an invisible killer, chore puzzles',n:['Everyone drives their own car now. Drive down the lane to the new parking lot at the end and pull into your glowing spot: the car parks itself, the door swings open and you climb out. Bots drive their own cars too.','The cars are rebuilt: steering front wheels, a turning steering wheel, a headlight beam, body roll and a working driver door. No more floating up before you are in your seat.','At the end of the night, walk back to your car to leave and you drive off.','The killer is always the AI now. Up to 4 survivors.','Chores are puzzles: scrub the plates, the floor or the tub clean, sweep the dust into the pan, put the books back tallest to shortest, sort the trash from the recycling, and match the pillowcases.','Front doors animate: you reach for the knob, the door creaks open, you step through and it shuts behind you.','The jump scare is now a 3D face that lunges right into the lens.','Removed: the Go upstairs and Go downstairs buttons (just walk the stairs), the spoken voices, and the killer skins and kill animations in the shop.']},
  {v:55,t:'New stairs, simpler job',n:['The stairs in every house are rebuilt: 14 even steps with clear edges, a proper handrail and a light over the stairwell, so they look right from the top and the bottom.','The car runs fine now. No more gas can, battery or repairs.','The job is just two things: get 5 generators running and finish 6 chores. Then get back in the car and go.','Only Hollow Lane is left. Camp Pinewood, Blackwater Farm and Frostbite Ridge are gone, and so is the map picker.','On phones the action button (Open, Up, Down, Fix…) now sits beside the others instead of over the tape timer.']},
  {v:54,t:'Power to the people',n:['Every house starts with the power out, and the neighbours won’t open the door in the dark.','Go round the back to their generator and press E: match each coloured wire to the socket of the same colour. Drag it, or tap the wire then the socket.','Get it wrong and it sparks. Get them all and the lights come on, and the neighbour lets you in to do the chores.','You can’t move while your hands are in the wires, and getting hit knocks you out of it. Survivor bots fix generators too.']},
  {v:53,t:'Cleaning crew',n:['The story: you clean houses for a living, and tonight’s job is every house in town.','You ride in by car: 5 seats, and the first survivor drives. W to go, A and D to steer. When you reach the houses the engine dies and the car rolls to a stop.','New job: clean the neighbours’ houses. Each house has two chores: washing the dishes, sweeping, mopping, dusting, taking out the trash, making the bed or scrubbing the tub. Stand at the glowing spot for 30 seconds. If you step away, it starts over. You need 6 chores done to leave.','Jump scares are much nastier now: a strobe of horrible faces, a scream that rings in your ears, and the tape tearing apart. You also get one when a killer hits you.','Stairs are easier: stand at the bottom or the top and press Go upstairs or Go downstairs.']},
  {v:52,t:'The van',n:['Cutscenes can’t be skipped any more.','After the intro, every survivor rides into town in the back of a van. The driver brings it in for 20 seconds and stops, the side door slides open, and at 30 seconds you get out. Killers have to wait for the van too.','Every map looks its own now. Camp Pinewood has log cabins, dirt roads, lanterns, fireflies and a green moon. Blackwater Farm has white and red board houses, fences, a windmill and a huge orange harvest moon. Frostbite Ridge has snow everywhere, icicles, falling snow and a cold blue moon.']},
  {v:51,t:'New maps and killer moves',n:['Story Mode is gone and Online is now just Play.','There are 3 new maps to pick in the lobby: Camp Pinewood (pine woods, tents, outhouses and campfires), Blackwater Farm (cornfields, a red barn, hay bales and scarecrows) and Frostbite Ridge (deep snow, snowmen, snow forts and Christmas lights). Each one has its own hiding spots.','Killers have 2 new moves, each with a 40 second cooldown. Z · Scare jump-scares every survivor, freezes them for a moment and gives away where they are. X · Vanish makes you invisible for 8 seconds, or until you swing.']},
  {v:50,t:'Map glitch fixed',n:['The ground no longer pokes through the road, sidewalks and floors, and distant things no longer flicker.','Big surfaces like the ground, roads, floors and buildings stay still now. Characters and props still have the PS1 wobble.','Far-away textures shimmer less.']},
  {v:49,t:'Pixel people, two hands',n:['Characters and houses are pixelated now: skins, faces, siding, bricks, roofs, floors and the ground all use chunky low-res textures, like an old PS1 horror game.','You can see both your arms in first person. Survivors hold the flashlight in one hand and keep the other one ready. The killer has the knife in one gloved hand and the other one free.','The Puppet Combo look and the VHS tape look are always on, so those settings are gone.']},
  {v:48,t:'Puppet Combo mode',n:['Gameplay now looks like an old PS1 horror tape: a chunky low-res picture, dithered colour, wobbly jittering polygons and crunchy textures.','Characters are faceted and low-poly looking, and the fog is thicker and darker.','The menus keep the smooth VHS look. Settings → Retro 3D lets you switch the PS1 style off.']},
  {v:47,t:'The whole tape',n:['Every screen is VHS now: VCR-style lettering, blue-screen menus with a ▶ cursor, scanlines and a tracking band over everything.','The game opens on a blue screen like a tape waiting to play. Press PLAY ▶ to start.','Switching screens makes the picture jump like a tape. The corner shows STOP ■ on the blue screen and when a run ends.']},
  {v:46,t:'Found footage',n:['The whole game now looks like an old VHS tape: soft picture, colour bleeding off the edges, scanlines, a wobbling image and a tracking band that rolls through now and then.','PLAY, a tape counter and the date sit in the corner like a camcorder.','It also draws the 3D picture at tape resolution, so it can run smoother on weaker phones. Don’t like it? Settings → VHS tape look → Off.']},
  {v:45,t:'Past the gate: a hospital and a supermarket',n:['In Kill Feast the gate at the end of the lane is open, and there is a whole new side of town behind it.','Hollow Lane General is a three-storey hospital with stairs, an ER, a morgue, wards and an operating room. There are 9 hiding spots across the 3 floors.','Fresh Mart is a big supermarket with aisles, checkouts, a deli, restrooms, an office, a storeroom and a walk-in freezer. There are 6 more hiding spots.','There are new chests out there too. Bots and killers know how to find their way in, up the stairs and through every room.']},
  {v:44,t:'Kicked-in doors and smarter bots',n:['Killers now walk right up to the door and kick it in: three kicks, splinters fly, and the third one bursts it open.','Killers can murder the neighbour inside a house. One stab goes straight into the kill animation, and that house has no one left to help.','Bots play like people now: they open chests, heal, set traps, stab back, run into houses and hide. Killer bots hunt by sight and sound, kick doors in and search hiding spots.','The little gate at the bottom of the stairs is gone.']},
  {v:43,t:'Install button',n:['If your phone can install Fellow Neighbors as a real app, an Install app button now shows in the menu.','Installed, it opens full screen with its own icon instead of inside Chrome.']},
  {v:42,t:'Update notifications',n:['The game now tells you when there is a new update, and this screen shows what changed.','Turn on “Notify me” to get a phone or desktop alert when an update lands while the game is open in the background.']},
  {v:41,t:'Bloodier, and no more rain',n:['Rain and thunder are gone.','Every survivor has their own build and gear: backpacks, satchels, scarves, hoods and glasses.','Kills are gorier: the knife connects, victims flinch, the last blow is in slow motion and they bleed out.']},
  {v:40,t:'Doors, hands and speed',n:['Killers smash doors down in a 5-second cinematic.','Survivors carry one item in their left hand. Click or press R to use it.','Runs smoother on phones and older computers.']},
  {v:39,t:'Houses and police',n:['Walk into houses, go upstairs, hide in closets, wardrobes, bathtubs and dumpsters.','Chat with neighbours: ask them to hide, ask for supplies, or call the police.','Police arrest killers and lock them up for 30 seconds.']}];
function renderNews(){ var box=$('newsList'); box.textContent='';
  UPDATES.slice(0,3).forEach(function(u,i){ var d=document.createElement('div'); d.className='upd'+(i===0?' new':''); var h=document.createElement('b'); h.textContent=(i===0?'New · ':'')+u.t; d.appendChild(h);
    var ul=document.createElement('ul'); u.n.forEach(function(x){ var li=document.createElement('li'); li.textContent=x; ul.appendChild(li); }); d.appendChild(ul); box.appendChild(d); });
  var nb=$('newsNotify'), can='Notification' in window && /^https?:$/.test(location.protocol) && !(window.claude && window.claude.use);
  nb.hidden=!can; if (can) nb.textContent=Notification.permission==='granted'?'Notifications are on':(Notification.permission==='denied'?'Notifications are blocked in your browser':'Notify me about updates'); nb.disabled=!can || Notification.permission!=='default';
}
function openNews(){ renderNews(); show('news'); SAVE.seenVer=GAME_VER; save(); }
function updAlert(v){
  if (updAlert.done===v) return; updAlert.done=v; $('updBar').hidden=false;
  if (document.hidden && 'Notification' in window && Notification.permission==='granted'){
    var opt={body:'A new update is out. Open the game to get it.',icon:'/icon-192.png',tag:'fn-update'};
    try { if (navigator.serviceWorker && navigator.serviceWorker.ready) navigator.serviceWorker.ready.then(function(r){ r.showNotification('Fellow Neighbors updated',opt); }).catch(function(){ new Notification('Fellow Neighbors updated',opt); }); else new Notification('Fellow Neighbors updated',opt); } catch(e){}
  }
}
function checkVersion(){ if (!/^https?:$/.test(location.protocol) || (window.claude && window.claude.use)) return;
  try { fetch('/version.json',{cache:'no-store'}).then(function(r){ return r.ok?r.json():null; }).then(function(j){ if (j && num(j.v,0)>GAME_VER) updAlert(j.v); }).catch(function(){}); } catch(e){} }
// Chrome offers a proper install (its own app, not a Chrome shortcut); keep that offer for our own button.
var installEvt=null;
window.addEventListener('beforeinstallprompt',function(e){ e.preventDefault(); installEvt=e; $('mInstall').hidden=false; });
window.addEventListener('appinstalled',function(){ installEvt=null; $('mInstall').hidden=true; toast('Installed. Open Fellow Neighbors from your home screen.',4000); });
(function(){
  $('mInstall').addEventListener('click',function(){ if (!installEvt) return; var e=installEvt; installEvt=null; try { e.prompt(); e.userChoice.then(function(c){ if (c && c.outcome==='accepted') $('mInstall').hidden=true; }); } catch(err){} });
  $('mNews').addEventListener('click',openNews);
  $('newsClose').addEventListener('click',function(){ show('menu'); });
  $('newsNotify').addEventListener('click',function(){ try { var p=Notification.requestPermission(); if (p && p.then) p.then(renderNews); } catch(e){} });
  $('updReload').addEventListener('click',function(){ location.reload(); });
  $('updLater').addEventListener('click',function(){ $('updBar').hidden=true; });
  $('mNews').classList.toggle('dot',(SAVE.seenVer||0)<GAME_VER);
  setTimeout(checkVersion,8000); setInterval(checkVersion,60000);
  document.addEventListener('visibilitychange',function(){ if (!document.hidden) checkVersion(); });
})();

/* ---------- the map: Hollow Lane ---------- */
var MAPS=[{id:'lane',n:'Hollow Lane',d:'The suburb'}];
var applyMap, grassOff=false, curMap='lane', mapFogD=0.042, MAPT={}, OUTHIDES0=null;
function mapName(id){ for (var i=0;i<MAPS.length;i++) if (MAPS[i].id===id) return MAPS[i].n; return MAPS[0].n; }
(function(){
  world.updateMatrixWorld(true);
  // remember how everything looked on Hollow Lane, so other maps can recolour it and go back
  var HW=[], HR=[];
  houses.forEach(function(h){ h.g.traverse(function(o){ if (!o.isMesh || !o.material || !o.material.map) return; var im=o.material.map.image;
    if (im===sidingTex.image || im===brickTex.image){ if (HW.indexOf(o.material)<0) HW.push(o.material); } else if (im===shingleTex.image){ if (HR.indexOf(o.material)<0) HR.push(o.material); } }); });
  leafPts.p.material.userData.c0=leafPts.p.material.color.clone();
  var tinted=[ground.material,roadM,walkM,paint,hedgeM,trunkM,leafPts.p.material].concat(leafMs,HW,HR); if (grassInst) tinted.push(grassInst.material);
  tinted.forEach(function(m){ m.userData.c0=m.color.clone(); m.userData.map0=m.map; });
  // ground textures for the other maps, made small and crunchy like the rest
  function tx32(fn){ var t=pixTex(32,fn,true); t.magFilter=THREE.NearestFilter; t.minFilter=THREE.NearestMipmapNearestFilter; t.__px=1; return t; }
  var TX={};
  var moonS=null, haloS=null; scene.children.forEach(function(o){ if (o.isSprite && o.scale.x===52) moonS=o; if (o.isSprite && o.scale.x===380) haloS=o; });
  var mistM=mist.length?mist[0].material:null; if (mistM) mistM.userData.c0=mistM.color.clone();
  var LOOK={lane:{moon:0x9fb6ff,mi:0.55,hs:0x7f93c8,hg:0x14141a,bulb:0xffe2b0,ms:0xfffbe8,mz:52,mist:null,pc:null,add:false,psz:0.14},
            camp:{moon:0x9ac8a4,mi:0.45,hs:0x5a7a5e,hg:0x0a120a,bulb:0xff9a3a,ms:0xe8fff0,mz:44,mist:0x6a8a6a,pc:0xd4ff5a,add:true,psz:0.09},
            farm:{moon:0xffb070,mi:0.6,hs:0x9a7a50,hg:0x1a120a,bulb:0xffc050,ms:0xffa040,mz:96,mist:0xa89060,pc:0xc8a050,add:false,psz:0.12},
            frost:{moon:0xcfe0ff,mi:0.85,hs:0xa8bce0,hg:0x4a5468,bulb:0xd8ecff,ms:0xeaf2ff,mz:60,mist:0xe6eef8,pc:0xffffff,add:false,psz:0.1}};
  function texFor(m,key){ if (!key) return m.userData.map0; var o=m.userData.map0, k='tx_'+key; if (!m.userData[k]){ var t=TX[key].clone(); t.__px=1; t.needsUpdate=true; if (o) t.repeat.copy(o.repeat); m.userData[k]=t; } return m.userData[k]; }
  // where props can go without blocking roads, doors, jobs, chests or buildings
  var avoid=[]; houses.forEach(function(h){ var d=doorPt(h); avoid.push([d.x,d.z,4.5],[h.gen.x,h.gen.z,3.5]); });
  [CARSIDE,GAS,batPos(),{x:-64,z:2.6},{x:JAIL.x,z:JAIL.z},{x:RELEASE.x,z:RELEASE.z}].forEach(function(p){ avoid.push([p.x,p.z,6]); });
  CHEST_SPOTS.forEach(function(c){ avoid.push([c[0],c[1],3.2]); }); OUTHIDES.forEach(function(s){ avoid.push([s.x,s.z,3]); });
  function okAt(x,z,pad,own){ if (Math.abs(z)<8.5 && x>-160 && x<150) return false; if (blocked(x,z,pad)) return false;
    for (var i=0;i<avoid.length;i++){ var a=avoid[i]; if (Math.hypot(a[0]-x,a[1]-z)<a[2]+pad) return false; }
    for (var b=0;b<BLD.length;b++){ var B=BLD[b]; if (x>B.x0-pad-2 && x<B.x1+pad+2 && z>B.z0-pad-2 && z<B.z1+pad+2) return false; }
    for (var j=0;j<own.length;j++){ var c=own[j]; if (x>c.minX-pad && x<c.maxX+pad && z>c.minZ-pad && z<c.maxZ+pad) return false; }
    return x>-156 && x<147 && Math.abs(z)<38.5; }
  var REG=[[-70,70,25,38.5],[-70,70,-38.5,-25],[-156,-100,-38,38],[118,147,-38,-12],[134,147,12,38],[75,82,-38,38],[-99,-76,12,38]];
  function spot(rng,pad,own,regs){ regs=regs||REG; for (var t=0;t<160;t++){ var R=regs[(rng()*regs.length)|0], x=R[0]+rng()*(R[1]-R[0]), z=R[2]+rng()*(R[3]-R[2]); if (okAt(x,z,pad,own)) return [x,z]; } return null; }
  function seeded(s){ return function(){ s|=0; s=s+0x6D2B79F5|0; var t=Math.imul(s^s>>>15,1|s); t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; }; }
  function col(own,x,z,hx,hz){ var c={minX:x-hx,maxX:x+hx,minZ:z-hz,maxZ:z+hz}; own.push(c); return c; }
  function theme(id,build){ var T={id:id,g:new THREE.Group(),cols:[],hides:[]}; T.g.visible=false; world.add(T.g); var M=new MB(); build(T,M,seeded(id.length*7919+id.charCodeAt(0)*131)); M.flush(T.g);
    T.g.traverse(function(o){ if (o.isMesh && !o.material.isMeshBasicMaterial){ o.castShadow=true; o.receiveShadow=true; } }); MAPT[id]=T; }
  function hide(T,id,x,z,r,t,cx,cy,cz,yaw){ T.hides.push({id:id,in:0,f:0,lv:0,y:0,x:x,z:z,r:r,t:t,cam:[cx,cy,cz],yaw:yaw}); }
  function sign(text,bg,fg,w,h){ return new THREE.MeshBasicMaterial({map:canvasTex(512,96,function(g){ g.fillStyle=bg; g.fillRect(0,0,512,96); g.fillStyle=fg; g.font='bold 54px Georgia,serif'; g.textAlign='center'; g.textBaseline='middle'; g.fillText(text,256,52); })}); }
  var wood=mat(0x5a3e28,{roughness:.9}), dark=mat(0x2a1e16,{roughness:.9}), canvasM=mat(0x4a5a3a,{roughness:1}), canvasM2=mat(0x7a5a2a,{roughness:1}), stoneM2=mat(0x55575a,{roughness:1});
  function pine(M,x,z,s,leaf,snow){ M.box(0.3*s,1.6*s,0.3*s,trunkM,x,0.8*s,z); var cone=function(r,h,y,m){ var g=new THREE.ConeGeometry(r,h,7); g.translate(x,y,z); M.g[M.m.indexOf(m)<0?(M.m.push(m),M.g.push([]),M.m.length-1):M.m.indexOf(m)].push(g); };
    cone(1.9*s,2.6*s,2.5*s,leaf); cone(1.5*s,2.3*s,3.9*s,leaf); cone(1.0*s,2.0*s,5.2*s,leaf); if (snow){ cone(1.0*s*0.75,0.9*s,5.6*s,snow); cone(1.5*s*0.7,0.8*s,4.4*s,snow); } }

  // switch the world over to a map
  applyMap=function(id){ if (!MAPT[id] && id!=='lane') id='lane'; curMap=id; if (!OUTHIDES0) OUTHIDES0=OUTHIDES.slice();
    for (var k in MAPT){ var T=MAPT[k], on=k===id; T.g.visible=on; T.cols.forEach(function(c){ var i=colliders.indexOf(c); if (on && i<0) colliders.push(c); if (!on && i>=0) colliders.splice(i,1); }); }
    OUTHIDES.length=0; OUTHIDES0.forEach(function(s){ OUTHIDES.push(s); }); if (MAPT[id]) MAPT[id].hides.forEach(function(s){ OUTHIDES.push(s); });
    function tint(m,c){ if (c===null || c===undefined) m.color.copy(m.userData.c0); else m.color.copy(lin(c)); }
    var P0={lane:{fog:0x0a0f1c,d:0.042,g:null,r:null,w:null,h:null,leaf:null,roof:null,wall:null,tr:null,pt:true,gr:null,lp:null},
            camp:{fog:0x060c08,d:0.052,g:0x48563a,r:0x6a4a30,w:0x5a4430,h:0x1a2a18,leaf:0x1e3a22,roof:0x2a3a24,wall:0x7a5236,tr:null,pt:false,gr:0x2a4a1e,lp:null},
            farm:{fog:0x13110b,d:0.045,g:0x9a8a4a,r:0x8a8070,w:0x6e583a,h:0x3a4a22,leaf:0x7a5a1a,roof:0x6a5a4c,wall:null,tr:null,pt:false,gr:0x8a7a32,lp:null},
            frost:{fog:0x2a3444,d:0.058,g:0xf2f6fc,r:0xa8b2bc,w:0xe8eef4,h:0xb8c8c8,leaf:0xdce6ee,roof:0xf4f8fc,wall:null,tr:0x4a3a30,pt:true,gr:0xdfe8f0,lp:0xffffff}}[id];
    FOG=P0.fog; mapFogD=P0.d; scene.fog.color.copy(lin(FOG));
    var TXS={lane:{},camp:{g:'forest',r:'dirt',w:'dirt'},farm:{g:'dry',r:'gravel',w:'dirt'},frost:{g:'snow',r:'slush',w:'snow',roof:'snow'}}[id];
    [[ground.material,TXS.g],[roadM,TXS.r],[walkM,TXS.w]].forEach(function(a){ var nm=texFor(a[0],a[1]); if (a[0].map!==nm){ a[0].map=nm; a[0].needsUpdate=true; } });
    HR.forEach(function(m){ var nm=texFor(m,TXS.roof); if (m.map!==nm){ m.map=nm; m.needsUpdate=true; } });
    if (id!=='lane'){ P0.g=0xffffff; P0.r=0xffffff; P0.w=0xffffff; if (id==='frost') P0.roof=0xffffff; }
    grassOff=id==='frost'; if (grassInst) grassInst.visible=!grassOff && world.visible;
    tint(ground.material,P0.g); tint(roadM,P0.r); tint(walkM,P0.w); tint(hedgeM,P0.h); tint(trunkM,P0.tr); tint(leafPts.p.material,P0.lp); if (grassInst) tint(grassInst.material,P0.gr);
    leafMs.forEach(function(m){ tint(m,P0.leaf); }); HR.forEach(function(m){ tint(m,P0.roof); });
    HW.forEach(function(m,i){ if (id==='farm') m.color.copy(lin(i%2?0x9a3020:0xf0ece0)); else if (id==='camp') m.color.copy(lin([0xc89a6a,0xa8784a,0xd8aa78][i%3])); else if (id==='frost') m.color.copy(m.userData.c0).lerp(lin(0x8a9ab0),0.35); else tint(m,P0.wall); });
    var L=LOOK[id]; moonLight.color.copy(lin(L.moon)); moonLight.intensity=L.mi; hemi.color.copy(lin(L.hs)); hemi.groundColor.copy(lin(L.hg)); bulbM.color.copy(lin(L.bulb)); lampLights.forEach(function(l){ l.color.copy(lin(L.bulb)); });
    if (moonS){ moonS.material.color.copy(lin(L.ms)); moonS.scale.set(L.mz,L.mz,1); } if (haloS) haloS.material.color.copy(lin(id==='farm'?0xc07030:(id==='camp'?0x6a9a7a:0x93a8e0)));
    if (mistM){ if (L.mist) mistM.color.copy(lin(L.mist)); else mistM.color.copy(mistM.userData.c0); }
    var pm=leafPts.p.material; if (L.pc) pm.color.copy(lin(L.pc)); else pm.color.copy(pm.userData.c0); pm.blending=L.add?THREE.AdditiveBlending:THREE.NormalBlending; pm.needsUpdate=true;
    walkM.visible=id==='lane'||id==='frost';
    var wk={camp:'logs',farm:'boards'}[id]; HW.forEach(function(m){ var nm=texFor(m,wk); if (m.map!==nm){ m.map=nm; m.needsUpdate=true; } }); if (wk) P0.wall=null;
    paint.visible=P0.pt; leafPts.p.material.size=L.psz; moonLight.shadow.needsUpdate=true;
  };
})();

/* ---------- everyone drives their own car in and parks in the lot at the end of the lane ---------- */
// Players' cars line up in the right-hand lane, bots' cars in the left. You drive; when you reach your
// glowing spot the car parks itself, the door opens and you climb out. At the end you come back to it to leave.
var VAN_T0=13, STALLS=[-72.2,-68.6,-65.0,-61.4], STALL_Z=9.0, STALL_YAW=-Math.PI/2, CAR_COLS=[0x7a1c1c,0x1e3460,0x2a4a2a,0x8a6a1e];
var CAR_SEAT=[0.02,-0.4], CAR_EXIT=[0.1,-1.6], CAR_DOOR=[0.0,-1.5];
var FLEET={cars:{},ids:[],lamp:null,mark:null,beacon:null,cols:[]};
(function(){
  // the lot: dark asphalt, painted bays, curb stops, a lamp and a sign
  var g=new THREE.Group(); world.add(g); var M=new MB(), asph=mat(0x1c1d20,{roughness:.95}), paintW=mat(0xd8d4c4,{roughness:.8}), conc=mat(0x8a8780,{roughness:.9}), pole=mat(0x2a2c30,{roughness:.6,metalness:.5});
  var a=new THREE.Mesh(new THREE.PlaneGeometry(15.4,8.4),asph); a.rotation.x=-Math.PI/2; a.position.set(-67,0.016,8.8); a.receiveShadow=true; a.userData.noSnap=1; g.add(a);
  [-74.0,-70.4,-66.8,-63.2,-59.6].forEach(function(x){ M.box(0.1,0.01,4.8,paintW,x,0.025,9.0); });
  M.box(14.4,0.01,0.1,paintW,-66.8,0.025,6.6);
  STALLS.forEach(function(x){ M.box(1.5,0.12,0.22,conc,x,0.06,11.75); });
  M.box(0.16,4.6,0.16,pole,-74.4,2.3,12.6); M.box(1.1,0.1,0.22,pole,-73.9,4.55,12.6); M.box(0.5,0.06,0.3,glow(0xffe2b0),-73.5,4.48,12.6);
  M.flush(g); halo(0xffc070,3.2,-73.5,4.4,12.6,g,.75); lamps.push({x:-73.5,z:12.6,sx:-73.5,sz:12.6}); addBox(-74.4,12.6,0.12,0.12);
  var sm=new THREE.MeshBasicMaterial({map:canvasTex(256,96,function(c){ c.fillStyle='#1d3a7a'; c.fillRect(0,0,256,96); c.strokeStyle='#e8e4d8'; c.lineWidth=6; c.strokeRect(5,5,246,86); c.fillStyle='#e8e4d8'; c.font='bold 40px monospace'; c.fillText('P',22,64); c.font='bold 22px monospace'; c.fillText('RESIDENTS',70,44); c.fillText('& GUESTS',74,74); })});
  box(0.08,2.2,0.08,pole,-59.4,1.1,12.6,g); var sg=new THREE.Mesh(new THREE.PlaneGeometry(1.4,0.52),sm); sg.position.set(-59.4,2.3,12.55); sg.rotation.y=Math.PI; g.add(sg); addBox(-59.4,12.6,0.08,0.08);
  // your spot glows until you are parked in it
  FLEET.mark=new THREE.Mesh(new THREE.PlaneGeometry(2.6,4.6),new THREE.MeshBasicMaterial({color:lin(0xffd040),transparent:true,opacity:.35,depthWrite:false,blending:THREE.AdditiveBlending})); FLEET.mark.rotation.x=-Math.PI/2; FLEET.mark.position.y=0.035; FLEET.mark.visible=false; scene.add(FLEET.mark);
  FLEET.beacon=halo(0xffd040,1.6,0,3,0,scene,.9); FLEET.beacon.visible=false;
  // one headlight beam, for whichever car is yours
  var L=new THREE.SpotLight(0xfff0d0,0,34,0.48,0.55,1.2); L.castShadow=false; scene.add(L); scene.add(L.target); FLEET.lamp=L;
})();
function makeCar(col){
  var g=new THREE.Group(), b=new THREE.Group(); g.add(b); var M=new MB();
  var paint=mat(col,{roughness:.32,metalness:.45}), chrome=mat(0xc8ccd0,{roughness:.2,metalness:.9}), dk=mat(0x0e0f12,{roughness:.7}), seatM=mat(0x3a2a22,{roughness:.95}), plate=mat(0xe8e4d0,{roughness:.6}),
      glass=new THREE.MeshStandardMaterial({color:lin(0x8aa0b0),transparent:true,opacity:.22,roughness:.05,metalness:.2,depthWrite:false,side:THREE.DoubleSide}), dash=mat(0x16161a,{roughness:.8}), head=glow(0xfff2c8), tail=glow(0xff1a10);
  M.box(4.2,0.18,1.62,dk,0,0.34,0);                         // underbody
  M.box(4.36,0.42,1.76,paint,0,0.62,0);                     // body
  M.box(1.25,0.1,1.72,paint,1.52,0.86,0); M.box(0.9,0.12,1.72,paint,-1.72,0.88,0);   // hood, trunk
  M.box(4.38,0.035,1.78,chrome,0,0.7,0);                    // trim line
  M.box(1.9,0.07,1.52,paint,-0.3,1.5,0);                    // roof
  [-1,1].forEach(function(s){ M.box(0.08,0.62,0.06,paint,-0.22,1.17,s*0.75); M.box(0.12,0.1,0.18,paint,0.66,1.0,s*0.95); });   // B pillars, mirrors
  M.box(0.06,0.26,1.0,dk,2.19,0.66,0); for (var i=0;i<4;i++) M.box(0.065,0.025,0.96,chrome,2.2,0.57+i*0.06,0);   // grille
  M.box(0.14,0.16,1.82,chrome,2.24,0.46,0); M.box(0.14,0.16,1.82,chrome,-2.24,0.46,0);                              // bumpers
  M.box(0.05,0.14,0.36,tail,-2.2,0.76,0.6); M.box(0.05,0.14,0.36,tail,-2.2,0.76,-0.6); M.box(0.03,0.14,0.42,plate,-2.25,0.6,0);
  M.box(0.42,0.16,1.5,dash,0.66,0.9,0); M.box(0.02,0.03,0.16,glow(0x5adf7a),0.44,0.95,CAR_SEAT[1]);                // dash and its glow
  [-1,1].forEach(function(s){ M.box(0.5,0.12,0.52,seatM,0.0,0.92,s*0.4); M.box(0.12,0.6,0.5,seatM,-0.28,1.18,s*0.4); M.box(0.08,0.16,0.3,seatM,-0.3,1.42,s*0.4); });
  M.box(0.5,0.12,1.42,seatM,-0.95,0.92,0); M.box(0.12,0.55,1.42,seatM,-1.2,1.16,0);
  M.flush(b);
  function slab(w,h,d,m,x,y,z,rz){ var o=box(w,h,d,m,x,y,z,b); o.rotation.z=rz; return o; }
  slab(0.04,0.76,1.48,glass,0.81,1.18,0,0.535); slab(0.04,0.7,1.48,glass,-1.11,1.2,0,-0.49);                       // windscreen, back glass
  [-1,1].forEach(function(s){ slab(0.07,0.76,0.06,paint,0.81,1.18,s*0.74,0.535); slab(0.07,0.7,0.06,paint,-1.11,1.2,s*0.74,-0.49);
    box(1.0,0.48,0.02,glass,-0.75,1.18,s*0.78,b); if (s>0) box(0.85,0.48,0.02,glass,0.15,1.18,0.78,b); });
  // round headlights with a warm halo, and a soft beam on the road
  [-0.62,0.62].forEach(function(z){ var c=new THREE.Mesh(new THREE.CylinderGeometry(0.11,0.11,0.05,10),head); c.rotation.z=Math.PI/2; c.position.set(2.2,0.7,z); b.add(c);
    var r=new THREE.Mesh(new THREE.TorusGeometry(0.12,0.02,5,10),chrome); r.rotation.y=Math.PI/2; r.position.set(2.22,0.7,z); b.add(r); halo(0xfff0c0,0.9,2.32,0.7,z,b,.7); });
  var beam=halo(0xfff0c0,5.5,5.2,0.35,0,b,.18); halo(0xff2a10,0.5,-2.3,0.76,0.6,b,.6); halo(0xff2a10,0.5,-2.3,0.76,-0.6,b,.6);
  // wheels: front ones steer, all of them roll
  var wheels=[], fronts=[]; [[1.38,1],[1.38,-1],[-1.38,1],[-1.38,-1]].forEach(function(w){ var piv=new THREE.Group(); piv.position.set(w[0],0.34,w[1]*0.84); g.add(piv); var spin=new THREE.Group(); piv.add(spin);
    var t=new THREE.Mesh(new THREE.CylinderGeometry(0.34,0.34,0.24,12),dk); t.rotation.x=Math.PI/2; spin.add(t); var hc=new THREE.Mesh(new THREE.CylinderGeometry(0.19,0.19,0.25,8),chrome); hc.rotation.x=Math.PI/2; spin.add(hc);
    var sp=new THREE.Mesh(new THREE.BoxGeometry(0.3,0.05,0.26),dk); spin.add(sp); wheels.push(spin); if (w[0]>0) fronts.push(piv); });
  // the driver's door swings on its front edge
  var door=new THREE.Group(); door.position.set(0.55,0,-0.885); b.add(door); box(1.12,0.4,0.06,paint,-0.56,0.63,0,door); box(1.12,0.035,0.065,chrome,-0.56,0.7,0,door); box(1.0,0.46,0.02,glass,-0.56,1.1,0,door); box(0.06,0.5,0.04,paint,-1.08,1.1,0,door); box(0.14,0.03,0.04,chrome,-0.9,0.78,-0.04,door);
  // steering wheel
  var swp=new THREE.Group(); swp.position.set(0.5,0.93,CAR_SEAT[1]); swp.rotation.z=0.6; b.add(swp); var sw=new THREE.Group(); swp.add(sw); var rim=new THREE.Mesh(new THREE.TorusGeometry(0.15,0.018,5,14),dk); rim.rotation.y=Math.PI/2; sw.add(rim); box(0.02,0.26,0.025,dk,0,0,0,sw); box(0.02,0.025,0.26,dk,0,0,0,sw);
  g.traverse(function(o){ if (o.isMesh && !o.material.transparent && !o.material.isMeshBasicMaterial){ o.castShadow=true; o.receiveShadow=true; } });
  g.visible=false; scene.add(g);
  return {g:g,b:b,wheels:wheels,fronts:fronts,door:door,sw:sw,beam:beam,doorA:0};
}
function angDiff(a,b){ var d=a-b; return Math.atan2(Math.sin(d),Math.cos(d)); }
function carLocal(C,lx,lz){ var c=Math.cos(C.yaw), s=Math.sin(C.yaw); return {x:C.x+lx*c+lz*s, z:C.z-lx*s+lz*c}; }
function myCar(){ return net && FLEET.cars[netMe]; }
function vanPhase(N){ return !!(N && N.mode==='s' && game.role!=='killer' && !N.outCar && N.alive===1); }
function fleetSeats(N){
  var ids=Object.keys(N.roles||{}).filter(function(id){ return N.roles[id]!=='k' && N.roles[id]!=='killer'; }).sort(), bots=[];
  N.bots.forEach(function(b){ if (b.role==='s') bots.push(b.id); }); N.seats={}; ids.concat(bots).slice(0,4).forEach(function(id,i){ N.seats[id]=i; });
  fleetReset(); FLEET.ids=ids.concat(bots).slice(0,4);
  FLEET.ids.forEach(function(id,i){ var bot=bots.indexOf(id)>=0, lz=bot?2.1:-2.1, C={id:id,seat:i,bot:bot,x:120+i*8,z:lz,yaw:Math.PI,v:0,steer:0,st:0,t:0,lz:lz,stall:{x:STALLS[i],z:STALL_Z},m:makeCar(CAR_COLS[i%4]),col:null,wp:null,wi:0};
    C.m.g.visible=true; FLEET.cars[id]=C; poseCar(C,0); });
  N.outCar=false; N.allParked=false; carG.visible=false; carCol.minX=carCol.maxX=9999; carCol.minZ=carCol.maxZ=9999;
}
function vanSeats(N){ fleetSeats(N); }
function fleetReset(){ for (var id in FLEET.cars){ var C=FLEET.cars[id]; scene.remove(C.m.g); if (C.col){ var k=colliders.indexOf(C.col); if (k>=0) colliders.splice(k,1); } } FLEET.cars={}; FLEET.ids=[]; if (FLEET.mark){ FLEET.mark.visible=false; FLEET.beacon.visible=false; FLEET.lamp.intensity=0; } }
function vanReset(){ fleetReset(); if (carG){ carG.visible=true; carG.rotation.y=0; moveCar(-64,2.6); } }
function vanSeatPos(i,out){ var id=FLEET.ids[i], C=id&&FLEET.cars[id]; if (!C) return {x:-64,z:4.6}; return out?carLocal(C,CAR_EXIT[0],CAR_EXIT[1]):carLocal(C,CAR_SEAT[0],CAR_SEAT[1]); }
function carDoorPt(id){ var C=FLEET.cars[id]; if (!C) return CARSIDE; return carLocal(C,CAR_DOOR[0],CAR_DOOR[1]); }
// the route a car follows by itself: down the lane, then a left turn into its bay
function arriveRoute(C){ var sx=C.stall.x, w=[{x:-40,z:C.lz},{x:sx+13,z:C.lz},{x:sx+5.5,z:C.lz*0.5+0.6},{x:sx+1.4,z:2.8},{x:sx,z:5.6}];
  return w.filter(function(p,i){ return i>=3 || p.x<C.x-2; }); }
function leaveRoute(C){ return [{x:C.stall.x+9,z:-1.6},{x:20,z:-2.1},{x:100,z:-2.1},{x:147,z:-2.1}]; }
function drive(C,dt,thr,st){ var v0=C.v; C.steer+=(st-C.steer)*Math.min(1,dt*6);
  C.v+=thr*(thr*C.v<0?16:(thr>0?7.5:5))*dt; if (!thr) C.v*=1-Math.min(1,0.8*dt); C.v=Math.max(-5,Math.min(16,C.v));
  C.yaw+=C.steer*C.v*0.2*dt; return v0; }
function aiDrive(C,dt){ var w=C.wp[C.wi]; if (!w) return true; var dx=w.x-C.x, dz=w.z-C.z, d=Math.hypot(dx,dz), want=Math.atan2(-dz,dx);
  var st=Math.max(-1,Math.min(1,angDiff(want,C.yaw)*2.2)), last=C.wi===C.wp.length-1, tv=last?Math.min(12,2.5+d*0.6):(Math.abs(angDiff(want,C.yaw))>0.5?5:12);
  var thr=C.v<tv-0.5?1:(C.v>tv+0.5?-0.6:0); drive(C,dt,thr,st); C.x+=Math.cos(C.yaw)*C.v*dt; C.z-=Math.sin(C.yaw)*C.v*dt;
  if (d<(last?1.8:2.6)) C.wi++; return C.wi>=C.wp.length; }
function startPark(C,el){ C.st=2; C.t=el; C.p0={x:C.x,z:C.z,yaw:C.yaw,v:C.v}; }
function parkedCol(C,on){ if (on && !C.col){ C.col={minX:C.stall.x-0.92,maxX:C.stall.x+0.92,minZ:C.stall.z-2.25,maxZ:C.stall.z+2.25}; colliders.push(C.col); }
  if (!on && C.col){ var k=colliders.indexOf(C.col); if (k>=0) colliders.splice(k,1); C.col=null; } }
function fleetLeave(id){ var C=FLEET.cars[id]; if (!C || C.st>=5) return; C.st=5; C.t=net?net.el:0; }
// one car, driven here (yours, or a bot's on the host)
function simCar(C,dt,el,mine){
  if (C.st===0){ C.v=0; if (el>=VAN_T0 && (!mine || game.mode==='play')){ C.st=1; C.wp=null; } return; }
  if (C.st===1){
    if (mine && !C.auto && el>VAN_T0+52){ C.auto=true; toast('Autopilot: the car takes you to your spot.',2400); }
    if (mine && !C.auto){
      var thr=0, st=0; if (game.mode==='play' && !game.paused){ thr=((keys.KeyW||keys.ArrowUp)?1:0)-((keys.KeyS||keys.ArrowDown)?1:0)-touchMove.y; st=((keys.KeyA||keys.ArrowLeft)?1:0)-((keys.KeyD||keys.ArrowRight)?1:0)-touchMove.x; }
      thr=Math.max(-1,Math.min(1,thr)); st=Math.max(-1,Math.min(1,st)); var v0=drive(C,dt,thr,st);
      var p={x:C.x+Math.cos(C.yaw)*C.v*dt, z:C.z-Math.sin(C.yaw)*C.v*dt}; resolve(p,1.05); var want=Math.abs(C.v*dt), got=Math.hypot(p.x-C.x,p.z-C.z);
      if (want>0.01 && got<want*0.6){ C.v*=0.4; if (Math.abs(v0)>5){ thud(0.8); shake(); } }
      C.x=Math.max(-150,Math.min(147,p.x)); C.z=Math.max(-38,Math.min(38,p.z));
      if (Math.hypot(C.x-C.stall.x,C.z-5.6)<4.6 || Math.hypot(C.x-C.stall.x,C.z-C.stall.z)<4) startPark(C,el); }
    else { if (!C.wp){ C.wp=arriveRoute(C); C.wi=0; } if (aiDrive(C,dt) || (C.wi>=2 && Math.hypot(C.x-C.stall.x,C.z-5.6)<3.2)) startPark(C,el); }
    return; }
  if (C.st===2){ var k=ease((el-C.t)/2.2), P0=C.p0; C.x=P0.x+(C.stall.x-P0.x)*k; C.z=P0.z+(C.stall.z-P0.z)*k; C.yaw=P0.yaw+angDiff(STALL_YAW,P0.yaw)*k; C.v=Math.max(0,P0.v*(1-k)*0.6+(k<1?1.2:0)); C.steer*=0.9;
    if (k>=1){ C.st=3; C.t=el; C.v=0; parkedCol(C,true); if (mine || Math.hypot(P.x-C.x,P.z-C.z)<25){ tone(70,0.5,'sawtooth',0.06,35); noise(0.3,0.12,300); } } return; }
  if (C.st===3){ if (el-C.t>2.2){ C.st=4; C.t=el; } return; }
  if (C.st===5){ if (el-C.t>1.8){ C.st=6; C.t=el; parkedCol(C,false); C.rv=true; } return; }
  if (C.st===6){
    if (C.rv){ var k2=ease((el-C.t)/2.4); if (!C.r0) C.r0={x:C.x,z:C.z,yaw:C.yaw}; C.x=C.r0.x+0.8*k2; C.z=C.r0.z+(3.2-C.r0.z)*k2; C.yaw=C.r0.yaw+angDiff(0,C.r0.yaw)*k2; C.v=-2*(1-k2); if (k2>=1){ C.rv=false; C.wp=leaveRoute(C); C.wi=0; } return; }
    if (aiDrive(C,dt) || C.x>145){ C.st=7; } return; }
}
function poseCar(C,dt){ var m=C.m, g=m.g; g.visible=C.st!==7; if (!g.visible) return;
  g.position.set(C.x,0,C.z); g.rotation.y=C.yaw;
  var acc=dt>0?(C.v-(C.pv||0))/dt:0; C.pv=C.v; C.pitch=(C.pitch||0)+((Math.max(-1,Math.min(1,acc/8))*0.03)-(C.pitch||0))*Math.min(1,dt*5);
  var roll=Math.max(-0.05,Math.min(0.05,-C.steer*C.v*0.006)), idle=(C.st>=1 && C.st<=2)||C.st===6?Math.sin(performance.now()*0.05+C.seat)*0.004:0;
  m.b.rotation.z=C.pitch; m.b.rotation.x=roll; m.b.position.y=idle+(Math.abs(C.v)>1?Math.sin(performance.now()*0.017+C.seat)*0.008:0);
  m.wheels.forEach(function(w){ w.rotation.z-=C.v*dt/0.34; }); m.fronts.forEach(function(f){ f.rotation.y=C.steer*0.5; }); m.sw.rotation.x=-C.steer*1.6;
  var open=(C.st===3 && (net.el-C.t)>0.35 && (net.el-C.t)<1.9) || C.st===5; m.doorA+=((open?-1.1:0)-m.doorA)*Math.min(1,dt*(open?5:7)); m.door.rotation.y=m.doorA;
  if (!open && Math.abs(m.doorA)<0.05 && C.dOpen){ C.dOpen=false; if (Math.hypot(P.x-C.x,P.z-C.z)<20) { thud(0.5); noise(0.07,0.15,1100); } } if (open && !C.dOpen){ C.dOpen=true; if (Math.hypot(P.x-C.x,P.z-C.z)<20){ tone(900,0.04,'square',0.04); noise(0.12,0.06,1800); } }
  var lit=C.st>=1 && C.st<=3 || C.st>=5; m.beam.visible=lit; }
function fleetTick(dt){
  var N=net; if (!N || N.mode!=='s'){ return; } var el=N.el, all=true;
  FLEET.ids.forEach(function(id){ var C=FLEET.cars[id]; if (!C) return; var mine=id===netMe && game.role!=='killer', sim=mine || (C.bot && N.isHost);
    if (mine && N.alive!==1 && C.st<5 && C.st>=4) {}
    if (sim) simCar(C,dt,el,mine);
    else if (C.net){ var T=C.net, k=Math.min(1,dt*8); if (C.st!==T.st && T.st===3) C.t=el; if (T.st===5 && C.st!==5) C.t=el; C.st=T.st; C.x+=(T.x-C.x)*k; C.z+=(T.z-C.z)*k; C.yaw+=angDiff(T.yaw,C.yaw)*k; C.v=T.v; C.steer+=(T.steer-C.steer)*k; parkedCol(C,C.st>=3 && C.st<=5); }
    poseCar(C,dt); if (C.st<4 && C.st!==7) all=false; });
  N.allParked=all || el>VAN_T0+80;
  // you, in the driver's seat, then climbing out
  var C=myCar(); if (C && game.role!=='killer' && N.alive===1 && !N.outCar){
    var s=carLocal(C,CAR_SEAT[0],CAR_SEAT[1]), cy=C.yaw;
    if (C.st<3 || (C.st===3 && el-C.t<0.6)){ P.x=s.x; P.z=s.z; P.y=0.27; P.gy=0.27; if (N.lastCy!=null) P.yaw+=angDiff(cy,N.lastCy); N.lastCy=cy; if (!P.crouch){ P.crouch=true; crouchUI(); } vm.visible=false; }
    else { var e=carLocal(C,CAR_EXIT[0],CAR_EXIT[1]), k=ease((el-C.t-0.6)/1.1); P.x=s.x+(e.x-s.x)*k; P.z=s.z+(e.z-s.z)*k; P.y=0.27*(1-k); P.gy=P.y; if (k>0.5 && P.crouch){ P.crouch=false; crouchUI(); }
      if (C.st>=4 || k>=1){ N.outCar=true; P.y=0; vm.visible=true; N.lastCy=null; } } }
  // your bay glows and a light hangs over it until you are parked
  var show=C && C.st<3 && game.role!=='killer' && N.alive===1; FLEET.mark.visible=FLEET.beacon.visible=!!show;
  if (show){ var pu=0.25+Math.sin(performance.now()*0.006)*0.12; FLEET.mark.position.set(C.stall.x,0.035,C.stall.z); FLEET.mark.material.opacity=pu; FLEET.beacon.position.set(C.stall.x,2.6+Math.sin(performance.now()*0.004)*0.25,C.stall.z); }
  // headlight beam and engine for your car
  if (C && C.st!==7 && C.st!==4 && !(C.st===3 && el-C.t>1) && game.role!=='killer'){ var hp=carLocal(C,2.3,0), ht=carLocal(C,16,0); FLEET.lamp.position.set(hp.x,0.9,hp.z); FLEET.lamp.target.position.set(ht.x,0,ht.z); FLEET.lamp.intensity=2.4; }
  else FLEET.lamp.intensity=0;
  if (C && Math.abs(C.v)>0.3 && C.st>=1 && C.st<=2){ N.vanEng=(N.vanEng||0)-dt; if (N.vanEng<=0){ N.vanEng=0.13; tone(52+Math.abs(C.v)*4.2,0.15,'sawtooth',0.035,44+Math.abs(C.v)*3.6); } }
}
function vanTick(dt){ fleetTick(dt); }
// bots ride in their own cars on the host's game
function fleetBot(b){ var C=FLEET.cars[b.id]; if (!C){ return false; }
  if (C.st<3 || (C.st===3 && net.el-C.t<1.0)){ var s=carLocal(C,CAR_SEAT[0],CAR_SEAT[1]); b.x=s.x; b.z=s.z; b.y=0.32; b.cr=1; b.ih=-1; b.ry=C.yaw+Math.PI/2; b.an=0; return true; }
  if (!b.outCar){ b.outCar=true; var e=carLocal(C,CAR_EXIT[0],CAR_EXIT[1]); b.x=e.x; b.z=e.z; b.y=0; b.cr=0; } return false; }
// what everyone sends about cars
function fleetPatch(patch,host){ var C=myCar(); if (C && game.role!=='killer' && C.st!==7) patch.cv=[Math.round(C.x*100)/100,Math.round(C.z*100)/100,Math.round(C.yaw*1000)/1000,Math.round(C.v*10)/10,Math.round(C.steer*100)/100,C.st];
  else if (C && C.st===7) patch.cv=[0,0,0,0,0,7];
  if (host) patch.bcv=FLEET.ids.map(function(id){ var B=FLEET.cars[id]; return B && B.bot ? [Math.round(B.x*100)/100,Math.round(B.z*100)/100,Math.round(B.yaw*1000)/1000,Math.round(B.v*10)/10,Math.round(B.steer*100)/100,B.st] : 0; }); }
function fleetRead(pl,hostId){ var N=net; if (!N || N.mode!=='s') return;
  function put(C,a){ if (!C || !Array.isArray(a) || a.length<6) return; C.net={x:num(a[0],C.x),z:num(a[1],C.z),yaw:num(a[2],C.yaw),v:num(a[3],0),steer:num(a[4],0),st:Math.max(0,Math.min(7,num(a[5],0)|0))}; }
  pl.forEach(function(q){ if (q.me) return; put(FLEET.cars[q.id],q.pr.cv);
    if (q.id===hostId && !N.isHost && Array.isArray(q.pr.bcv)) q.pr.bcv.forEach(function(a,i){ var id=FLEET.ids[i], C=id&&FLEET.cars[id]; if (C && C.bot) put(C,a); }); }); }
function vanRead(pl,hostId){ fleetRead(pl,hostId); }
function fleetNearLamp(px,pz){ var C=myCar(); if (!C || C.st===7) return null; return Math.hypot(px-C.x,pz-C.z)<2.6?C:null; }

/* ---------- the job: cleaning the neighbours' houses ---------- */
// Each house has two chores. Stand at one for 30 seconds to finish it; step away and it starts over.
var CLEAN_NEED=6;
var CHORE_T=[
  {n:'Wash the dishes',v:'Washing the dishes',x:3.7,z:-2.75,f:0},
  {n:'Sweep the living room',v:'Sweeping',x:-2.0,z:-1.85,f:0},
  {n:'Mop the kitchen floor',v:'Mopping',x:2.9,z:-0.55,f:0},
  {n:'Dust the bookshelf',v:'Dusting',x:-3.95,z:-1.3,f:0},
  {n:'Take out the trash',v:'Bagging the trash',x:-1.15,z:2.95,f:0},
  {n:'Make the bed',v:'Making the bed',x:-3.3,z:3.15,f:1},
  {n:'Scrub the bathtub',v:'Scrubbing the tub',x:3.9,z:-2.35,f:1}];
function choresOf(hi){ return [(hi*3)%7,(hi*3+2)%7]; }
function choreId(hi,t){ return hi*10+t; }
// the mess you see inside, one set per kind of chore, shown only in houses that still need it
var CHOREFX=(function(){ var gs=[], F=FLOOR2, brown=mat(0x4a3a24,{roughness:1}), white=mat(0xe8e4d8,{roughness:.4}), grime=new THREE.MeshBasicMaterial({color:lin(0x3a2a14),transparent:true,opacity:.75,depthWrite:false}),
  bag=mat(0x111214,{roughness:.35}), dust=mat(0x9a9890,{roughness:1}), sheet=mat(0xd8d2c4,{roughness:1}), ring=new THREE.MeshBasicMaterial({color:lin(0xfff0a0),transparent:true,opacity:.35,depthWrite:false});
  function g0(){ var g=new THREE.Group(); g.visible=false; interior.add(g); gs.push(g); return g; }
  function flat(g,r,m,x,y,z){ var c=new THREE.Mesh(new THREE.CircleGeometry(r,10),m); c.rotation.x=-Math.PI/2; c.position.set(x,y,z); g.add(c); return c; }
  var g;
  g=g0(); for (var i=0;i<6;i++) cyl(0.13,0.13,0.025,10,white,3.35+(i%2)*0.08,0.97+i*0.028,-3.42,g); cyl(0.05,0.05,0.12,8,white,3.0,1.0,-3.35,g); cyl(0.05,0.05,0.12,8,white,3.9,1.0,-3.3,g); flat(g,0.18,grime,3.7,0.958,-3.47);
  g=g0(); for (i=0;i<9;i++) flat(g,0.12+Math.random()*0.18,grime,-2.4+Math.random()*1.4,0.022,-2.4+Math.random()*1.2); box(0.3,0.08,0.3,brown,-1.9,0.04,-1.7,g);
  g=g0(); flat(g,0.7,grime,2.9,0.03,-0.6); for (i=0;i<6;i++) flat(g,0.07,grime,1.6+i*0.35,0.031,-0.2+(i%2)*0.2);
  g=g0(); for (i=0;i<4;i++) box(0.3,0.06,1.2,dust,-4.5,0.58+i*0.45,-1.3,g);
  g=g0(); [[-1.2,3.25],[-0.85,3.3],[-1.05,2.95]].forEach(function(p){ var b=new THREE.Mesh(new THREE.SphereGeometry(0.26,7,5),bag); b.scale.set(1,1.2,1); b.position.set(p[0],0.28,p[1]); g.add(b); });
  g=g0(); for (i=0;i<5;i++){ var s=box(0.6,0.12,0.5,sheet,-3.6+(i%3)*0.35,F+0.78+(i%2)*0.08,1.0+i*0.35,g); s.rotation.set(0.3*i,0.5*i,0.2); } box(0.4,0.04,0.3,mat(0x3a4a7a),-2.6,F+0.03,2.8,g);
  g=g0(); flat(g,0.55,grime,3.9,F+0.56,-3.3).scale.set(1.5,0.6,1); flat(g,0.25,grime,3.4,F+0.035,-2.7);
  CHORE_T.forEach(function(c,t){ flat(gs[t],0.45,ring,c.x,c.f*F+0.025,c.z); });
  return gs; })();
function choreFxUpdate(cleaned){ var N=net, hi=N && N.mode==='s' ? N.ih : -1, list=hi>=0?choresOf(hi):[];
  CHOREFX.forEach(function(g,t){ var v=list.indexOf(t)>=0 && !cleaned[choreId(hi,t)]; if (g.visible!==v) g.visible=v; }); }

/* ---------- generators: match the wires to get the power back on ---------- */
var WIRE_COLS=['#e0322a','#2f6fe8','#f2cc22','#3cc25a'], WIRE_N=['red','blue','yellow','green'];
var wireUI=(function(){
  var cv=$('wireCv'), g=cv.getContext('2d'), W=cv.width, H=cv.height, st=null;
  function lx(){ return 44; } function rx(){ return W-44; } function wy(i){ return 46+i*((H-80)/3); }
  function draw(){ if (!st) return; g.clearRect(0,0,W,H); g.fillStyle='#14161c'; g.fillRect(0,0,W,H);
    g.fillStyle='#262a33'; g.fillRect(18,18,40,H-36); g.fillRect(W-58,18,40,H-36);
    for (var i=0;i<4;i++){ var y=wy(i); g.fillStyle=WIRE_COLS[i]; g.fillRect(4,y-7,lx()-4,14); g.beginPath(); g.arc(lx(),y,10,0,7); g.fill();
      if (st.sel===i){ g.strokeStyle='#fff'; g.lineWidth=3; g.beginPath(); g.arc(lx(),y,15,0,7); g.stroke(); }
      var c=st.right[i], ry=wy(i); g.fillStyle='#0a0b0e'; g.beginPath(); g.arc(rx(),ry,13,0,7); g.fill(); g.strokeStyle=WIRE_COLS[c]; g.lineWidth=5; g.beginPath(); g.arc(rx(),ry,13,0,7); g.stroke(); g.fillStyle=WIRE_COLS[c]; g.fillRect(rx()+14,ry-6,W-rx()-14,12); }
    st.done.forEach(function(d,i){ if (d<0) return; g.strokeStyle=WIRE_COLS[i]; g.lineWidth=9; g.lineCap='round'; g.beginPath(); g.moveTo(lx(),wy(i)); g.bezierCurveTo(W/2-30,wy(i)+30,W/2+30,wy(d)-30,rx(),wy(d)); g.stroke(); });
    if (st.sel>=0 && st.drag){ g.strokeStyle=WIRE_COLS[st.sel]; g.lineWidth=9; g.lineCap='round'; g.beginPath(); g.moveTo(lx(),wy(st.sel)); g.lineTo(st.drag[0],st.drag[1]); g.stroke(); }
    if (st.spark>0){ g.fillStyle='rgba(255,240,160,'+st.spark+')'; for (var k=0;k<14;k++){ g.fillRect(st.sx+(Math.random()-0.5)*50,st.sy+(Math.random()-0.5)*50,3,3); } }
    $('wireInfo').textContent=st.fin?'Power is back on!':(st.sel>=0?'Now tap the '+WIRE_N[st.sel]+' socket on the right':'Tap a wire on the left, then the socket of the same colour'); }
  function at(e){ var r=cv.getBoundingClientRect(), t=e.touches?e.touches[0]||e.changedTouches[0]:e; return [(t.clientX-r.left)*W/r.width,(t.clientY-r.top)*H/r.height]; }
  function pickL(p){ for (var i=0;i<4;i++) if (st.done[i]<0 && Math.hypot(p[0]-lx(),p[1]-wy(i))<26) return i; return -1; }
  function pickR(p){ for (var i=0;i<4;i++) if (Math.hypot(p[0]-rx(),p[1]-wy(i))<28) return i; return -1; }
  function tryR(r){ if (st.sel<0 || r<0) return; if (st.done.indexOf(r)>=0) return; var ok=st.right[r]===st.sel;
    if (ok){ st.done[st.sel]=r; tone(520+st.sel*90,0.12,'square',0.08); st.sel=-1; if (st.done.every(function(d){ return d>=0; })){ st.fin=true; tone(90,0.9,'sawtooth',0.12,140); setTimeout(function(){ finish(); },650); } }
    else { st.spark=1; st.sx=rx(); st.sy=wy(r); noise(0.18,0.5,3000); tone(120,0.2,'square',0.1,60); shake(); st.sel=-1; } draw(); }
  function down(e){ if (!st || st.fin) return; e.preventDefault(); var p=at(e), l=pickL(p); if (l>=0){ st.sel=l; st.drag=p; tone(300,0.05,'square',0.05); draw(); return; } tryR(pickR(p)); }
  function move(e){ if (!st || st.sel<0 || !st.drag) return; e.preventDefault(); st.drag=at(e); draw(); }
  function up(e){ if (!st || !st.drag) return; var p=at(e), r=pickR(p); st.drag=null; if (r>=0) tryR(r); else draw(); }
  cv.addEventListener('mousedown',down); window.addEventListener('mousemove',move); window.addEventListener('mouseup',up);
  cv.addEventListener('touchstart',down,{passive:false}); cv.addEventListener('touchmove',move,{passive:false}); cv.addEventListener('touchend',up);
  $('wireClose').addEventListener('click',function(){ close(false); });
  window.addEventListener('keydown',function(e){ if (!st || st.fin) return; var n=['Digit1','Digit2','Digit3','Digit4'].indexOf(e.code); if (n<0) return; e.stopPropagation(); if (st.sel<0) { if (st.done[n]<0){ st.sel=n; draw(); } } else tryR(n); },true);
  function tick(dt){ if (!st) return; if (st.spark>0){ st.spark=Math.max(0,st.spark-dt*3); draw(); } var N=net, h=houses[st.hi];
    if (!N || game.mode!=='play' || N.alive!==1 || Math.hypot(P.x-h.gen.x,P.z-h.gen.z)>3 || h.power) close(false); }
  function finish(){ var N=net, hi=st?st.hi:-1; close(true); if (!N || hi<0) return; pwFix(N,hi); netSend({pw:N.pw}); }
  function close(ok){ if (!st) return; st=null; $('wirePanel').hidden=true; if (net) net.wiring=null; if (!isTouch && game.mode==='play' && !document.pointerLockElement) lock(); }
  function open(hi){ var perm=[0,1,2,3]; for (var i=3;i>0;i--){ var j=(Math.random()*(i+1))|0, t=perm[i]; perm[i]=perm[j]; perm[j]=t; }
    st={hi:hi,right:perm,done:[-1,-1,-1,-1],sel:-1,drag:null,spark:0,fin:false}; if (net) net.wiring=st; $('wirePanel').hidden=false; $('wireTitle').textContent=NEIGHBOURS[houses[hi].n].n+'’s generator';
    wasLocked=false; if (document.exitPointerLock) try { document.exitPointerLock(); } catch(e){} noise(0.2,0.2,800); draw(); }
  return {open:open,close:close,tick:tick,isOpen:function(){ return !!st; },_st:function(){ return st; }};
})();

/* ---------- chores are little puzzles: scrub, sweep, sort, shelve, match ---------- */
var choreUI=(function(){
  var cv=$('choreCv'), g=cv.getContext('2d'), W=cv.width, H=cv.height, st=null, R=Math.random;
  function rr(a,b){ return a+R()*(b-a); }
  function shuffle(a){ for (var i=a.length-1;i>0;i--){ var j=(R()*(i+1))|0, t=a[i]; a[i]=a[j]; a[j]=t; } return a; }
  // ---- scrub: rub the grime away (dishes, mop, tub)
  function scrubInit(kind){ var S={kind:kind,stage:0,stages:kind==='dish'?3:1}; scrubStage(S); return S; }
  function scrubStage(S){ var cells=[], cs=12, cx=W/2, cy=H/2+6;
    for (var y=0;y<H;y+=cs) for (var x=0;x<W;x+=cs){ var px=x+cs/2, py=y+cs/2, inside;
      if (S.kind==='dish') inside=Math.hypot(px-cx,py-cy)<92; else if (S.kind==='tub') inside=Math.abs(px-cx)<160 && Math.abs(py-cy)<70; else inside=py>40;
      if (!inside) continue; cells.push({x:x,y:y,d:0}); }
    // blotches of dirt, not an even coat
    var bl=[]; for (var i=0;i<(S.kind==='mop'?7:6);i++){ if (S.kind==='dish'){ var a=R()*7, r=R()*62; bl.push([cx+Math.cos(a)*r,cy+Math.sin(a)*r,rr(20,36)]); } else if (S.kind==='tub') bl.push([rr(cx-140,cx+140),rr(cy-55,cy+55),rr(22,40)]); else bl.push([rr(40,W-40),rr(70,H-30),rr(22,44)]); }
    S.cells=cells.filter(function(c){ return bl.some(function(b){ return Math.hypot(c.x+6-b[0],c.y+6-b[1])<b[2]; }); }); S.cells.forEach(function(c){ c.d=rr(0.7,1); c.a=R(); }); S.total=S.cells.length; }
  function scrubDraw(S){ var cx=W/2, cy=H/2+6;
    if (S.kind==='dish'){ g.fillStyle='#2a4a5a'; g.fillRect(0,0,W,H); g.fillStyle='rgba(255,255,255,.08)'; for (var i=0;i<14;i++){ g.beginPath(); g.arc((i*53)%W,(i*37)%H,6+i%4*3,0,7); g.fill(); }
      g.fillStyle='#e8e4d8'; g.beginPath(); g.arc(cx,cy,96,0,7); g.fill(); g.strokeStyle='#9aa0a8'; g.lineWidth=3; g.beginPath(); g.arc(cx,cy,70,0,7); g.stroke(); g.strokeStyle='#4a6ab0'; g.lineWidth=4; g.beginPath(); g.arc(cx,cy,90,0,7); g.stroke(); }
    else if (S.kind==='tub'){ g.fillStyle='#c8d0d4'; g.fillRect(0,0,W,H); g.fillStyle='#f4f4f0'; g.fillRect(cx-170,cy-80,340,160); g.fillStyle='#dfe6ea'; g.fillRect(cx-150,cy-62,300,124); g.fillStyle='#9aa0a8'; g.beginPath(); g.arc(cx+120,cy,7,0,7); g.fill(); }
    else { for (var y=40;y<H;y+=32) for (var x=0;x<W;x+=32){ g.fillStyle=((x+y)/32)%2?'#d9d4c6':'#55585c'; g.fillRect(x,y,32,32); } g.fillStyle='#262a33'; g.fillRect(0,0,W,40); }
    S.cells.forEach(function(c){ if (c.d<=0) return; g.fillStyle=S.kind==='tub'?'rgba(120,96,40,'+(c.d*0.85)+')':(S.kind==='mop'?'rgba(70,44,20,'+(c.d*0.9)+')':'rgba(110,82,30,'+(c.d*0.9)+')'); g.fillRect(c.x,c.y,12,12);
      if (c.a>0.7){ g.fillStyle='rgba(40,30,10,'+c.d*0.6+')'; g.fillRect(c.x+3,c.y+4,4,3); } });
    if (S.foam) S.foam.forEach(function(f){ g.fillStyle='rgba(255,255,255,'+f[2]+')'; g.beginPath(); g.arc(f[0],f[1],4+f[2]*4,0,7); g.fill(); });
    var left=S.cells.filter(function(c){ return c.d>0.15; }).length;
    return (S.kind==='dish'?'Plate '+(S.stage+1)+' of '+S.stages+' · ':'')+'Scrub: rub the dirt away · '+Math.min(100,Math.round((1-left/Math.max(1,S.total))/0.92*100))+'%'; }
  function scrubRub(S,p){ var hit=false; S.cells.forEach(function(c){ if (c.d>0 && Math.hypot(c.x+6-p[0],c.y+6-p[1])<24){ c.d-=0.22; hit=true; } }); S.foam=S.foam||[];
    if (hit){ S.foam.push([p[0]+rr(-10,10),p[1]+rr(-10,10),1]); if (S.foam.length>40) S.foam.shift(); if (R()<0.25) noise(0.06,0.05,S.kind==='dish'?3000:1600); }
    var left=S.cells.filter(function(c){ return c.d>0.15; }).length; if (left<=S.total*0.08){ if (S.stage+1<S.stages){ S.stage++; tone(700,0.1,'triangle',0.1); scrubStage(S); S.foam=[]; } else return true; } return false; }
  // ---- sweep: drag each dust pile into the dustpan
  function sweepInit(){ var piles=[]; for (var i=0;i<8;i++) piles.push({x:rr(40,W-160),y:rr(40,H-40),in:false}); return {piles:piles,pan:{x:W-110,y:H-90,w:96,h:70},drag:-1}; }
  function sweepDraw(S){ g.fillStyle='#6a4a32'; g.fillRect(0,0,W,H); g.fillStyle='rgba(0,0,0,.15)'; for (var y=0;y<H;y+=20) g.fillRect(0,y,W,2);
    var P2=S.pan; g.fillStyle='#b0302a'; g.fillRect(P2.x,P2.y,P2.w,P2.h); g.fillStyle='#7a1a16'; g.fillRect(P2.x+8,P2.y+8,P2.w-16,P2.h-16); g.fillStyle='#ddd'; g.font='14px monospace'; g.fillText('PAN',P2.x+32,P2.y+42);
    S.piles.forEach(function(p,i){ if (p.in) return; g.fillStyle='#8a8070'; g.beginPath(); g.ellipse(p.x,p.y,18,11,0,0,7); g.fill(); g.fillStyle='#5a5246'; for (var k=0;k<5;k++) g.fillRect(p.x-12+k*5,p.y-3+(k%2)*4,3,3); if (S.drag===i){ g.strokeStyle='#fff'; g.lineWidth=2; g.beginPath(); g.ellipse(p.x,p.y,22,14,0,0,7); g.stroke(); } });
    return 'Sweep: drag every pile of dust into the pan · '+S.piles.filter(function(p){ return p.in; }).length+'/'+S.piles.length; }
  // ---- shelve: swap books until they go tallest to shortest
  function shelfInit(){ var hs=[150,138,126,114,102,90,78], cols=['#7a2f26','#2f5d50','#3d4f7a','#b59a52','#6a3a6a','#3a6a8a','#8a6a2a']; var b=hs.map(function(h,i){ return {h:h,c:cols[i]}; }); do { shuffle(b); } while (b.every(function(x,i){ return x.h===hs[i]; })); return {b:b,sel:-1}; }
  function shelfDraw(S){ g.fillStyle='#3a2616'; g.fillRect(0,0,W,H); g.fillStyle='#5a3e28'; g.fillRect(20,200,W-40,16); g.fillRect(20,20,W-40,10);
    S.b.forEach(function(b,i){ var x=40+i*44, y=200-b.h; g.fillStyle=b.c; g.fillRect(x,y,36,b.h); g.fillStyle='rgba(255,255,255,.25)'; g.fillRect(x+4,y+10,28,4); g.fillRect(x+4,y+b.h-18,28,4); if (S.sel===i){ g.strokeStyle='#fff'; g.lineWidth=3; g.strokeRect(x-2,y-2,40,b.h+4); } });
    return 'Shelve the books: tap two to swap them, tallest on the left'; }
  function shelfTap(S,p){ var i=Math.floor((p[0]-40)/44); if (i<0 || i>=S.b.length || p[0]-40-i*44>36) return false; if (S.sel<0){ S.sel=i; tone(400,0.04,'square',0.05); return false; }
    if (S.sel!==i){ var t=S.b[S.sel]; S.b[S.sel]=S.b[i]; S.b[i]=t; noise(0.08,0.1,900); } S.sel=-1; return S.b.every(function(b,k){ return k===0 || S.b[k-1].h>b.h; }); }
  // ---- trash: drag each thing into the right bin
  var JUNK=[['Bottle','r','#4a9a6a'],['Can','r','#c0c4c8'],['Newspaper','r','#d8d4c4'],['Box','r','#b08850'],['Banana peel','t','#e0c030'],['Apple core','t','#c03020'],['Old pizza','t','#c87a3a'],['Tissues','t','#e8e8f0']];
  function trashInit(){ return {items:shuffle(JUNK.slice()),i:0,x:W/2,y:70,drag:false,bad:0}; }
  function trashDraw(S){ g.fillStyle='#2a2e36'; g.fillRect(0,0,W,H);
    [['TRASH',30,'#3a3a3a'],['RECYCLE',W-150,'#2a5aa0']].forEach(function(b){ g.fillStyle=b[2]; g.fillRect(b[1],H-110,120,100); g.fillStyle='#111'; g.fillRect(b[1]-6,H-116,132,12); g.fillStyle='#eee'; g.font='15px monospace'; g.fillText(b[0],b[1]+(b[0]==='TRASH'?34:22),H-50); });
    var it=S.items[S.i]; if (it){ g.fillStyle=it[2]; g.fillRect(S.x-22,S.y-16,44,32); g.fillStyle='#fff'; g.font='14px monospace'; g.fillText(it[0],S.x-it[0].length*4,S.y-24); }
    if (S.bad>0){ g.fillStyle='rgba(200,0,0,'+S.bad+')'; g.fillRect(0,0,W,H); }
    return 'Take out the trash: drag it to TRASH or RECYCLE · '+S.i+'/'+S.items.length; }
  function trashDrop(S){ var it=S.items[S.i]; if (!it || S.y<H-130) { S.x=W/2; S.y=70; return false; } var bin=S.x<W/2?'t':'r';
    if (bin===it[1]){ S.i++; thud(0.3); } else { S.bad=0.5; noise(0.15,0.3,300); tone(120,0.2,'square',0.08,60); } S.x=W/2; S.y=70; return S.i>=S.items.length; }
  // ---- bed: match the pillowcase pairs
  function bedInit(){ var c=[0,0,1,1,2,2,3,3,4,4,5,5]; shuffle(c); return {c:c,up:[],done:{},wait:0}; }
  var PAT=['#c04040','#40a060','#4060c0','#d0a030','#a050b0','#40b0b0'];
  function bedDraw(S){ g.fillStyle='#3a4a6a'; g.fillRect(0,0,W,H);
    S.c.forEach(function(p,i){ var x=22+(i%6)*58, y=40+Math.floor(i/6)*96, show=S.done[i] || S.up.indexOf(i)>=0;
      g.fillStyle=show?'#eeeae0':'#d8d2c4'; g.fillRect(x,y,50,80); if (show){ g.fillStyle=PAT[p]; for (var k=0;k<4;k++) g.fillRect(x+8+(k%2)*20,y+10+Math.floor(k/2)*32,14,22); } else { g.fillStyle='#b8b2a4'; g.fillRect(x+20,y+34,10,10); }
      if (S.done[i]){ g.fillStyle='rgba(0,0,0,.35)'; g.fillRect(x,y,50,80); } });
    return 'Make the bed: find the matching pillowcases · '+(Object.keys(S.done).length/2)+'/6'; }
  function bedTap(S,p){ if (S.wait>0) return false; var col=Math.floor((p[0]-22)/58), row=Math.floor((p[1]-40)/96); if (col<0||col>5||row<0||row>1) return false; var i=row*6+col; if (S.done[i] || S.up.indexOf(i)>=0) return false;
    S.up.push(i); tone(500,0.04,'triangle',0.06); if (S.up.length===2){ var a=S.up[0], b=S.up[1]; if (S.c[a]===S.c[b]){ S.done[a]=S.done[b]=1; S.up=[]; tone(800,0.1,'triangle',0.1); } else S.wait=0.8; }
    return Object.keys(S.done).length===12; }
  var KIND=['dish','sweep','mop','shelf','trash','bed','tub'];
  function draw(){ if (!st) return; var S=st.s, info; g.clearRect(0,0,W,H);
    if (st.k==='dish'||st.k==='mop'||st.k==='tub') info=scrubDraw(S); else if (st.k==='sweep') info=sweepDraw(S); else if (st.k==='shelf') info=shelfDraw(S); else if (st.k==='trash') info=trashDraw(S); else info=bedDraw(S);
    if (st.fin){ g.fillStyle='rgba(0,0,0,.55)'; g.fillRect(0,0,W,H); g.fillStyle='#9fff9f'; g.font='26px monospace'; g.fillText('DONE',W/2-30,H/2+8); info='All clean.'; }
    $('choreInfo').textContent=info; }
  function at(e){ var r=cv.getBoundingClientRect(), t=e.touches?e.touches[0]||e.changedTouches[0]:e; return [(t.clientX-r.left)*W/r.width,(t.clientY-r.top)*H/r.height]; }
  var down=false;
  function win(){ if (st.fin) return; st.fin=true; tone(660,0.15,'triangle',0.15); tone(990,0.25,'triangle',0.12,null,0.1); draw(); setTimeout(finish,700); }
  function onDown(e){ if (!st || st.fin) return; e.preventDefault(); down=true; var p=at(e), S=st.s;
    if (st.k==='sweep'){ S.drag=-1; S.piles.forEach(function(q,i){ if (!q.in && Math.hypot(q.x-p[0],q.y-p[1])<26) S.drag=i; }); }
    else if (st.k==='trash'){ S.drag=Math.hypot(S.x-p[0],S.y-p[1])<40; }
    else if (st.k==='shelf'){ if (shelfTap(S,p)) win(); }
    else if (st.k==='bed'){ if (bedTap(S,p)) win(); }
    else if (scrubRub(S,p)) win();
    draw(); }
  function onMove(e){ if (!st || st.fin || !down) return; var p=at(e), S=st.s; e.preventDefault();
    if (st.k==='sweep' && S.drag>=0){ var q=S.piles[S.drag]; q.x=p[0]; q.y=p[1]; if (R()<0.1) noise(0.05,0.03,1200); }
    else if (st.k==='trash' && S.drag){ S.x=p[0]; S.y=p[1]; }
    else if (st.k==='dish'||st.k==='mop'||st.k==='tub'){ if (scrubRub(S,p)) win(); }
    draw(); }
  function onUp(e){ if (!st || !down) return; down=false; var S=st.s;
    if (st.k==='sweep' && S.drag>=0){ var q=S.piles[S.drag], P2=S.pan; if (q.x>P2.x-10 && q.x<P2.x+P2.w+10 && q.y>P2.y-10 && q.y<P2.y+P2.h+10){ q.in=true; noise(0.1,0.12,700); } S.drag=-1; if (S.piles.every(function(q){ return q.in; })) win(); }
    else if (st.k==='trash' && S.drag){ S.drag=false; if (trashDrop(S)) win(); }
    draw(); }
  cv.addEventListener('mousedown',onDown); window.addEventListener('mousemove',onMove); window.addEventListener('mouseup',onUp);
  cv.addEventListener('touchstart',onDown,{passive:false}); cv.addEventListener('touchmove',onMove,{passive:false}); cv.addEventListener('touchend',onUp);
  $('choreClose').addEventListener('click',function(){ close(false); });
  function tick(dt){ if (!st) return; var S=st.s; if (st.k==='bed' && S.wait>0){ S.wait-=dt; if (S.wait<=0){ S.up=[]; draw(); } } if (st.k==='trash' && S.bad>0){ S.bad=Math.max(0,S.bad-dt*2); draw(); }
    var N=net; if (!N || game.mode!=='play' || N.alive!==1 || N.ih!==st.hi || Math.hypot(P.x-IX-CHORE_T[st.t].x,P.z-CHORE_T[st.t].z)>1.8 || (N.cleaned||{})[st.cid] || !houses[st.hi].power) close(false); }
  function finish(){ var N=net, s0=st; close(true); if (!N || !s0) return; if (N.cl.indexOf(s0.cid)<0) N.cl.push(s0.cid); netSend({cl:N.cl});
    toast('Done: '+CHORE_T[s0.t].n.toLowerCase()+'. '+Math.min(CLEAN_NEED,(N.ncl||0)+1)+' of '+CLEAN_NEED+' chores finished.',2800); }
  function close(ok){ if (!st) return; if (!ok && !st.fin) toast('You stopped. That chore starts over.',1800); st=null; down=false; $('chorePanel').hidden=true; if (net && net.wiring==='chore') net.wiring=null; if (!isTouch && game.mode==='play' && !document.pointerLockElement) lock(); }
  function open(hi,t){ var k=KIND[t], S=(k==='dish'||k==='mop'||k==='tub')?scrubInit(k):(k==='sweep'?sweepInit():(k==='shelf'?shelfInit():(k==='trash'?trashInit():bedInit())));
    st={hi:hi,t:t,cid:choreId(hi,t),k:k,s:S,fin:false}; if (net) net.wiring='chore'; $('chorePanel').hidden=false; $('choreTitle').textContent=CHORE_T[t].n;
    wasLocked=false; if (document.exitPointerLock) try { document.exitPointerLock(); } catch(e){} draw(); }
  return {open:open,close:close,tick:tick,isOpen:function(){ return !!st; }};
})();

Math.random=NATIVE_RANDOM;

/* ---------- VHS tape look: the picture is drawn small, then played back like an old tape ---------- */
var pxCache=new Map();
function pxTex(t,max){ if (!t || t.__px) return true; var im=t.image; if (!im || !im.width) return false; t.__px=1;
  if (max){ var c=pxCache.get(im); if (!c){ var k=Math.min(1,max/Math.max(im.width,im.height)); if (k<1){ c=document.createElement('canvas'); c.width=Math.max(2,Math.round(im.width*k)); c.height=Math.max(2,Math.round(im.height*k)); try { c.getContext('2d').drawImage(im,0,0,c.width,c.height); } catch(e){ c=null; } } pxCache.set(im,c||im); if (c) pxCache.set(c,c); } if (c && c!==im) t.image=c; }
  t.magFilter=THREE.NearestFilter; if (max){ t.minFilter=THREE.NearestMipmapNearestFilter; t.generateMipmaps=true; } t.needsUpdate=true; return true; }
function noSnapKey(){ return 'nosnap'; }
function ps1Look(){ scene.traverse(function(o){ if (!o.isMesh && !o.isPoints) return; var ms=Array.isArray(o.material)?o.material:[o.material];
  // big flat pieces (ground, roads, floors, whole buildings) must not jitter: a snapped giant polygon tilts and pokes through the road
  if (o.isMesh && !o.isSkinnedMesh && o.geometry){ var gb=o.geometry.boundingSphere; if (!gb){ o.geometry.computeBoundingSphere(); gb=o.geometry.boundingSphere; }
    var sc=Math.max(o.scale.x,o.scale.y,o.scale.z); if (gb && gb.radius*sc>4.5) ms.forEach(function(m){ if (m && !m.userData.noSnap){ m.userData.noSnap=1; m.customProgramCacheKey=noSnapKey; m.needsUpdate=true; } }); }
  for (var i=0;i<ms.length;i++){ var m=ms[i]; if (!m || m.userData.ps1) continue; var tx=m.map, ok=true;
    if (tx){ if (o.isSkinnedMesh) ok=pxTex(tx,72); else if (tx.wrapS===THREE.RepeatWrapping && !m.transparent) ok=pxTex(tx,32); else ok=pxTex(tx,0); }
    if (!ok) continue; m.userData.ps1=1;
    if (o.isSkinnedMesh && (m.isMeshStandardMaterial || m.isMeshPhongMaterial || m.isMeshLambertMaterial)){ m.flatShading=true; m.normalMap=null; m.vertexTangents=false; m.needsUpdate=true; } } }); }
setInterval(ps1Look,1500);
var VHS=(function(){
  function mk(f){ var r=new THREE.WebGLRenderTarget(4,4,{minFilter:f,magFilter:f,format:THREE.RGBAFormat,depthBuffer:true,stencilBuffer:false}); r.texture.encoding=THREE.sRGBEncoding; r.texture.generateMipmaps=false;
    if (renderer.capabilities.isWebGL2 || renderer.extensions.has('WEBGL_depth_texture')){ r.depthTexture=new THREE.DepthTexture(4,4); r.depthTexture.type=THREE.UnsignedIntType; } return r; }   // 24-bit depth: the default 16-bit one made the road and ground flicker
  var rtSoft=mk(THREE.LinearFilter), rtPix=mk(THREE.NearestFilter), rt=rtSoft;
  var mat=new THREE.ShaderMaterial({depthTest:false,depthWrite:false,toneMapped:false,
    uniforms:{tD:{value:rt.texture},px:{value:new THREE.Vector2(1,1)},t:{value:0},sl:{value:200},tr:{value:1},ps:{value:0},gl:{value:0}},
    vertexShader:'varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.,1.); }',
    fragmentShader:[
      'uniform sampler2D tD; uniform vec2 px; uniform float t; uniform float sl; uniform float tr; uniform float ps; uniform float gl; varying vec2 vUv;',
      'float b2(vec2 p){ p=mod(p,2.); return p.x*2.+p.y*3.-p.x*p.y*4.; }',
      'float b4(vec2 p){ return (4.*b2(p)+b2(floor(p/2.))+.5)/16.; }',
      'float h1(float n){ return fract(sin(n)*43758.5453); }',
      'float Yf(vec3 c){ return dot(c,vec3(.299,.587,.114)); }',
      'vec2 IQf(vec3 c){ return vec2(dot(c,vec3(.596,-.274,-.322)),dot(c,vec3(.211,-.523,.312))); }',
      'void main(){',
      '  vec2 uv=vUv; float line=floor(uv.y*240.);',
      '  float wob=sin(uv.y*11.+t*1.6)*0.0008+sin(uv.y*83.+t*6.1)*0.00035;',            // the tape never sits quite still
      '  float bandY=1.25-fract(t/19.)*6.; float band=smoothstep(0.07,0.,abs(uv.y-bandY))*tr;',   // a tracking band rolls through now and then
      '  wob+=band*(h1(line+floor(t*24.))-.5)*0.014;',
      '  float hs=smoothstep(0.03,0.,uv.y); wob+=hs*(0.01+sin(uv.y*380.+t*17.)*0.004);',   // head-switching wobble along the bottom edge
      '  wob+=gl*(h1(line*3.1+floor(t*40.))-.5)*0.09*step(.55,h1(floor(uv.y*60.)+floor(t*25.)));',
      '  uv.x+=wob;',
      '  vec3 c0=texture2D(tD,uv).rgb;',
      '  float Y=mix(Yf(c0)*.5+(Yf(texture2D(tD,uv+vec2(px.x,0.)).rgb)+Yf(texture2D(tD,uv-vec2(px.x,0.)).rgb))*.25,Yf(c0),ps);',
      '  vec2 IQ=vec2(0.); for (int i=0;i<5;i++){ float o=(float(i)-1.5)*px.x*2.2+0.0028+gl*0.02; IQ+=IQf(texture2D(tD,uv+vec2(o,0.)).rgb); } IQ*=0.2*0.9;',   // colour smears sideways and sits off to the right
      '  vec3 col=vec3(Y+.956*IQ.x+.621*IQ.y, Y-.272*IQ.x-.647*IQ.y, Y-1.106*IQ.x+1.703*IQ.y);',
      '  col=col*.9+.03; col=mix(vec3(Yf(col)),col,.82); col*=vec3(1.04,1.,.93); col+=band*.07;',
      '  if (ps>.5){ col=floor(col*22.+b4(floor(uv/px)))/22.; }',
      '  col*=.87+.13*(.5+.5*sin(vUv.y*sl*6.28318));',                                    // scanlines
      '  vec2 d=vUv-.5; col*=1.-dot(d,d)*.6;',
      '  gl_FragColor=vec4(clamp(col,0.,1.),1.);',
      '}'].join('\n')});
  var q=new THREE.Mesh(new THREE.PlaneGeometry(2,2),mat); q.frustumCulled=false; var sc=new THREE.Scene(); sc.add(q);
  var cam=new THREE.OrthographicCamera(-1,1,1,-1,0,1), sz=new THREE.Vector2(), osd=$('vhsOsd'), cnt=$('vhsCount'), play=$('vhsPlay'), lastS=-1, lastMode='';
  return function(t){
    var on=true; if (osd.hidden===on) osd.hidden=!on; var ui=$('vhsUi'); if (ui.hidden===on) ui.hidden=!on;
    if (!on){ PS1SNAP.value.set(0,0); scene.fog.density=0.03; renderer.render(scene,camera); return; }
    var ps=game.mode!=='menu' && game.mode!=='shop' && $('start').hidden;
    renderer.getDrawingBufferSize(sz); var hh=ps?(LOWEND?200:240):Math.round(Math.min(sz.y*0.75,LOWEND?400:480)), ww=Math.round(hh*sz.x/Math.max(1,sz.y));
    rt=ps?rtPix:rtSoft; mat.uniforms.tD.value=rt.texture; mat.uniforms.ps.value=ps?1:0; if (rt.width!==ww || rt.height!==hh) rt.setSize(ww,hh); mat.uniforms.px.value.set(1/ww,1/hh);
    PS1SNAP.value.set(ps?ww/2:0,ps?hh/2:0); scene.fog.density=ps?mapFogD:0.03;
    mat.uniforms.t.value=t; VHSGLITCH=Math.max(0,VHSGLITCH-0.016); mat.uniforms.gl.value=reduced?0:Math.min(1,VHSGLITCH); mat.uniforms.sl.value=sz.y/3.2; mat.uniforms.tr.value=reduced?0:1;
    renderer.setRenderTarget(rt); renderer.render(scene,camera); if (SCARE3D.isOn()){ var ac0=renderer.autoClear; renderer.autoClear=false; renderer.clearDepth(); renderer.render(SCARE3D.scene,camera); renderer.autoClear=ac0; } renderer.setRenderTarget(null); renderer.render(sc,cam);
    var paused=game.paused && game.mode==='play', stop=!$('start').hidden || !$('dead').hidden || !$('win').hidden || !$('netEnd').hidden, mode=stop?'s':(paused?'p':'r');
    if (mode!==lastMode){ lastMode=mode; play.innerHTML=stop?'STOP &#9632;':(paused?'PAUSE &#10074;&#10074;':'PLAY &#9654;'); }
    osd.classList.toggle('blink',paused && Math.floor(t*2)%2===0);
    var secs=Math.floor(game.mode==='play'?game.time:t); if (secs!==lastS){ lastS=secs; cnt.textContent='SP '+Math.floor(secs/3600)+':'+('0'+(Math.floor(secs/60)%60)).slice(-2)+':'+('0'+secs%60).slice(-2); }
  };
})();

/* ---------- main loop ---------- */
var clock=new THREE.Clock(), DYN={acc:0,n:0,pr:1,base:1,good:0};
function update(dt){
  game.time+=dt; game.stingCd-=dt;
  stationDoor(dt);
  for (var hi2=0;hi2<houses.length;hi2++){ var hh=houses[hi2], tr=-1.35*hh.open; hh.pivot.rotation.y+=(tr-hh.pivot.rotation.y)*Math.min(1,dt*5); }
  if (game.net && net.fin){ netTick(dt); if (net && net.fin) netFinFrame(dt); return; }
  if (game.net && net.hide){ netHideFrame(dt); netTick(dt); return; }
  if (game.net && net.brk){ netTick(dt); if (net && net.brk) doorBreakFrame(dt); return; }
  var vic=game.role!=='killer';
  if (vic && !game.net){
    if (shelter) return updateShelter(dt);
    if (game.knock) updateKnock(dt);
    if (shelter) return;
    var nd=game.knock?null:nearDoor(); game.nearGen=(nd||game.knock)?null:nearBrokenGen();
    clerkUpdate(dt);
    game.nearClerk=!nd && !game.knock && !game.nearGen && game.clerkOn && Math.hypot(P.x-STN.tx,P.z-STN.tz)<2.3;
    if (game.nearGen && !game.fix){ nearH=null; setPrompt('Fix the generator','Fix'); }
    else if (game.nearClerk){ nearH=null; setPrompt('Talk to '+NEIGHBOURS[game.clerk].n,'Talk'); }
    else showPrompt(nd);
    if (game.fix) updateFix(dt);
    game.scareT-=dt; if (game.scareT<=0) game.scareT = scareAhead() ? 75+Math.random()*70 : 12;
    for (var bi=0;bi<houses.length;bi++){ var bh=houses[bi]; if (bh.breached && Math.hypot(P.x-bh.x,P.z-(bh.z-bh.side*4.55))<0.9){ enterShelter(bh,false); return; } }
  }
  var mx=(keys.KeyD||keys.ArrowRight?1:0)-(keys.KeyA||keys.ArrowLeft?1:0)+touchMove.x;
  var mz=(keys.KeyS||keys.ArrowDown?1:0)-(keys.KeyW||keys.ArrowUp?1:0)+touchMove.y;
  var m=Math.hypot(mx,mz); if (m>1){ mx/=m; mz/=m; m=1; }
  if (!vic) P.crouch=false;
  var wantRun=(keys.ShiftLeft||keys.ShiftRight||runHeld) && m>0.2 && !P.spent && !P.crouch;
  P.sprinting=wantRun;
  if (wantRun){ P.stamina-=dt/5; P.rest=0; if (P.stamina<=0){ P.stamina=0; P.spent=true; } }
  else { P.rest+=dt; if (P.rest>0.8) P.stamina=Math.min(1,P.stamina+dt/7); if (P.stamina>0.3) P.spent=false; }
  var speed=(vic?(wantRun?7.2:(P.crouch?2.1:4.2)):(wantRun?6.5:4.5))*(game.net?net.spd:1), f=fwd(), rx=Math.cos(P.yaw), rz=-Math.sin(P.yaw);
  P.x+=(rx*mx-f.x*mz)*speed*dt; P.z+=(rz*mx-f.z*mz)*speed*dt;
  if (game.net && net.ih>=0) iFix(P,0.3);
  else { P.x=Math.max(-158.4,Math.min(148,P.x)); P.z=Math.max(-39.4,Math.min(39.4,P.z)); lvFix(P,0.45); P.fl=0; }
  if (game.net) vanTick(dt); wireUI.tick(dt); choreUI.tick(dt); micTick(dt); doorSeqTick(dt); SCARE3D.tick(dt);
  if (m>0.1){ P.bob+=dt*speed*1.9; P.step+=dt*speed; if (P.step>2.3){ P.step=0; if (!P.crouch) stepSound(wantRun,false); else noise(0.05,0.025,300); } }
  var bob=reduced?0:Math.sin(P.bob)*(wantRun?0.06:0.045);
  // standing still, the character can't settle: quick glances, shallow breathing, shaking hands
  FX.idle=(m<0.1 && Math.abs(sway.x)+Math.abs(sway.y)<0.004)?FX.idle+dt:0;
  var ik=(!vic || reduced)?0:Math.max(0,Math.min(1,(FX.idle-1.1)/0.8));
  FX.gT-=dt; if (FX.gT<=0){ FX.gT=0.45+Math.random()*1.5; FX.gy=Math.random()<0.25?0:(Math.random()-0.5)*0.17; FX.gp=(Math.random()-0.5)*0.05; }
  FX.gyS+=(FX.gy*ik-FX.gyS)*Math.min(1,dt*8); FX.gpS+=(FX.gp*ik-FX.gpS)*Math.min(1,dt*8);
  var shk=ik*(Math.sin(game.time*31)+Math.sin(game.time*47.3))*0.0011;
  FX.breath+=dt*(1.5+(1-P.stamina)*3.4+ik*1.6);
  var brt=reduced?0:Math.sin(FX.breath)*(0.006+(1-P.stamina)*0.014+ik*0.004), sdx=reduced?0:Math.cos(P.bob*.5)*0.024*m;
  FX.roll+=((reduced?0:-mx*(wantRun?0.032:0.022)+Math.cos(P.bob*.5)*0.004*m)-FX.roll)*Math.min(1,dt*7);
  FX.fovK+=((wantRun?1:0)-FX.fovK)*Math.min(1,dt*4.5); if (!reduced) setFov(Math.round((70+FX.fovK*6)*10)/10);
  P.gy+=((((game.net&&net.ih>=0)||P.y>0.02)?(P.y||0):groundY(P.x,P.z))-P.gy)*Math.min(1,dt*(P.y>0.02?16:10));
  P.eye=(P.eye||1.65)+(((P.crouch?1.0:1.65))-(P.eye||1.65))*Math.min(1,dt*9);
  camera.position.set(P.x+rx*sdx,P.eye+bob*(P.crouch?0.5:1)+brt+P.gy,P.z+rz*sdx); camera.rotation.set(P.pitch+FX.gpS+shk,P.yaw+FX.gyS+shk*0.7,FX.roll);
  if (vmKnife.visible){ var swg=FX.sw||0; vmKnife.position.set(sdx*0.5-swg*0.12,-bob*0.7+brt-(wantRun?0.02:0)+swg*0.1,-swg*0.18); vmKnife.rotation.set((wantRun?0.1+Math.sin(P.bob)*0.05:0)-swg*1.3,swg*0.5,-FX.roll*2+swg*0.6); }
  sway.x*=Math.max(0,1-dt*7); sway.y*=Math.max(0,1-dt*7);
  vm.position.set(vmBase.x+sway.x+(reduced?0:Math.cos(P.bob*.5)*.012*m)+ik*Math.sin(game.time*37)*0.0022, vmBase.y+sway.y-bob*(wantRun?.9:.5)+brt*0.8-(wantRun?.03:0)+ik*Math.sin(game.time*43)*0.0018, vmBase.z);
  vm.rotation.set(sway.y*2+(wantRun?.25+Math.sin(P.bob)*0.04:0)+.04, -sway.x*2+.1, -FX.roll*1.5);
  var st=$('stamina'); st.firstElementChild.style.width=(P.stamina*100)+'%'; st.classList.toggle('low',P.spent);
  if (game.kA>0){ game.kA-=dt; var kt=0.85-game.kA, kup=Math.min(1,kt/0.12)*Math.min(1,Math.max(0,game.kA)/0.15), rap=0;
    [0.14,0.33,0.52].forEach(function(c){ rap=Math.max(rap,Math.exp(-Math.pow((kt-c)/0.05,2))); });
    vmL.visible=true; vmL.position.set(-0.15,-0.44+kup*0.36,-0.4-rap*0.1); vmL.rotation.set(0.2+rap*0.3,0.18,0);
  } else {
    var working=!!game.fix || (story.hold && nearP(story.hold.pt,story.hold.r)) || (game.net && net.working && net.alive===1);
    FX.work+=((working?1:0)-FX.work)*Math.min(1,dt*6); game.grab=Math.max(0,(game.grab||0)-dt);
    if (game.grab>0){ var gk=Math.sin(Math.PI*(1-game.grab/0.5));
      vmL.visible=true; vmL.position.set(-0.12,-0.4+gk*0.14,-0.38-gk*0.2); vmL.rotation.set(-0.5*gk,0.2,0.5*gk); }
    else if (FX.work>0.02){ var wt=game.time;
      vmL.visible=true; vmL.position.set(-0.13+Math.sin(wt*6.5)*0.03,-0.48+FX.work*0.26+Math.sin(wt*13)*0.012,-0.42+Math.cos(wt*6.5)*0.03); vmL.rotation.set(0.3+Math.sin(wt*13)*0.14,0.25,0.35+Math.sin(wt*6.5)*0.2); }
    else if (heldShow()){ vmL.visible=true; vmL.position.set(-0.2,-0.3+(reduced?0:Math.sin(P.bob)*0.01),-0.45); vmL.rotation.set(0.15,0.35,0.1); }
    else if ((vm.visible || vmKnife.visible) && game.mode==='play'){ var kl=game.role==='killer'; vmL.visible=true; vmL.position.set(kl?-0.26:-0.24,(kl?-0.3:-0.29)+(reduced?0:Math.sin(P.bob+1.2)*0.012)-bob*0.4,kl?-0.44:-0.43); vmL.rotation.set(0.12,0.32,kl?0.3:0.18); }
    else if (vmL.visible) vmL.visible=false;
  }
  if (vmRole!==game.role){ vmRole=game.role; var kk=game.role==='killer'; vmGlove.color.copy(lin(kk?0x141518:0xb88c6c)); vmSleeve.color.copy(lin(kk?0x1c2533:0x2b3442)); }
  heldShow();

  for (var i=0;i<fuses.length;i++){ var fu=fuses[i]; if (fu.taken) continue;
    fu.core.rotation.y+=dt*2; fu.core.position.y=0.8+Math.sin(game.time*2+i)*0.08;
    if (vic && Math.hypot(fu.x-P.x,fu.z-P.z)<1.5){
      fu.taken=true; fu.g.visible=false; pips[game.got].classList.add('on'); game.got++;
      tone(660,0.18,'triangle',0.2); tone(990,0.3,'triangle',0.18,null,0.12);
      toast(game.got<FUSES ? (FUSES-game.got)+' more. He is walking faster.' : 'That is all of them. Get to the gate.',3500);
    }
  }
  var gd=Math.hypot(71.5-P.x,P.z);
  if (vic && !game.gateOpening && gd<4.5 && game.hint<=0 && !story.hold && !game.net){ toast('The gate is shut. The lock box is dead.',3000); game.hint=9; }
  game.hint-=dt;
  if (game.gateOpening && game.gateOpen<1){
    game.gateOpen=Math.min(1,game.gateOpen+dt/1.6);
    leaves.forEach(function(l){ l.g.rotation.y=-l.s*game.gateOpen*Math.PI*0.55; });
    moonLight.shadow.needsUpdate=true;
    if (game.gateOpen>0.75){ var k=colliders.indexOf(gateCollider); if (k>=0) colliders.splice(k,1); }
  }
  if (!(game.net && net.ih>=0) && P.x>74.5 && !(vic && game.gateOpen>0.9)) P.x=74.5;
  if (game.net){ netTick(dt); return; }
  storyTick(dt); if (game.mode!=='play') return;
  if (vic) menace(dt,true); else updateSurvivor(dt);
}
function menace(dt,canCatch){
  var dist=updateStalker(dt);
  var fear=Math.max(0,Math.min(1,(24-dist)/20));
  $('fear').style.opacity=fear*0.5;
  if (droneGain) droneGain.gain.value=0.05+fear*0.08;
  game.heart-=dt;
  if (fear>0 && game.heart<=0){ heartbeat(0.25+fear*0.4); game.heart=1.15-fear*0.75; }
  chaseClock-=dt;
  if (fear>0.3 && stalker.state==='hunt' && chaseClock<=0){
    tone(chaseNotes[chaseStep%8]*(Math.floor(chaseStep/16)%2?0.944:1),0.22,'triangle',0.03+fear*0.07); chaseStep++; chaseClock=0.17;
  }
  if (canCatch && dist<1.25 && stalker.g.visible) caught();
}
function caught(){
  game.mode='dying'; game.dying=1.5; game.gored=false; sting(0.5,true); eliasSays('Found you.');
  var S=stalker, g=S.g, inH=!!shelter, ex=inH?I.x:P.x, ez=inH?I.z:P.z, base=inH?0:P.gy, ey=base+(inH?1.62:1.65);
  var dx=g.position.x-ex, dz=g.position.z-ez, d=Math.hypot(dx,dz)||1;
  g.position.set(ex+dx/d*1.05,base,ez+dz/d*1.05); g.rotation.y=Math.atan2(-dx,-dz); g.visible=true;
  S.raise=1; setAnim('Idle'); if (!S.mixer) S.armR.rotation.x=-2.6;
  P.yaw=Math.atan2(-dx,-dz); P.pitch=0.3; game.eye={x:ex,y:ey};
  camera.position.set(ex,ey,ez); camera.rotation.set(P.pitch,P.yaw,0); setFov(70);
  $('inside').hidden=true; $('peep').hidden=true; $('safe').hidden=true; setPrompt(null);
  if (inH) shelter.view='walk';
  setLight(true); vm.visible=false;
  if (document.exitPointerLock) try { document.exitPointerLock(); } catch(e){}
}
function frame(){
  requestAnimationFrame(frame);
  var now=performance.now(); if (SAVE.fps<120 && now-lastFrame<1000/SAVE.fps-1.5) return; lastFrame=now;
  var raw=clock.getDelta(), dt=Math.min(raw,0.05), t=clock.elapsedTime;
  if (game.paused && !game.net) dt=0;
  if (game.mode==='play'){
    if (!game.paused || game.net) update(dt);
  } else if (game.mode==='dying'){
    if (game.dying<1.05 && !game.gored){ game.gored=true; var gf=fwd(); gore(); stabSound(); bloodBurst(camera.position.x+gf.x*0.6,camera.position.y-0.25,camera.position.z+gf.z*0.6,-gf.x,-gf.z,60); }
    game.dying-=dt; $('flash').style.opacity=Math.max(0,0.7-Math.abs(game.dying-1.1)*1.8);
    var dk=Math.max(0,Math.min(1,(1.0-game.dying)/0.85)); dk*=dk;
    camera.position.x=game.eye.x+(Math.random()-.5)*0.04; camera.position.y=Math.max(0.3,game.eye.y-dk*1.05)+(Math.random()-.5)*0.04; if (!reduced) camera.rotation.z=dk*0.7;
    if (game.dying<=0){ $('flash').style.opacity=0.35; finish(false); }
  } else if (game.mode==='cut'){
    cutFrame(dt);
  } else if (game.mode==='finish'){
    finFrame(dt);
  } else if (game.mode==='shop'){
    var SM=lamps[2], tall=camera.aspect<0.9;
    if (tall){ camera.position.set(SM.x,1.7,SM.z+5.6); camera.rotation.set(-0.36,0,0); }
    else { camera.position.set(SM.x,1.15,SM.z+3.4); camera.rotation.set(-0.03,-0.34,0); }
    resident.g.rotation.y+=dt*0.6; if (kPrev && kPrev.g.visible){ kPrev.g.rotation.y+=dt*0.6; kPrev.rig.mixer.update(dt); }
    if (finPV){ resident.g.rotation.y-=dt*0.6; netFinFrame(dt,finPV); }
  } else if (game.mode==='menu'){
    game.menuT+=dt;
    camera.position.set(-50+(reduced?0:Math.sin(game.menuT*0.07)*3),1.7,1.6);
    camera.rotation.set(0.02,-Math.PI/2-0.33+(reduced?0:Math.sin(game.menuT*0.11)*0.06),0);
  }
  if (FX.fovK>0 && (game.mode!=='play' || shelter)){ FX.fovK=0; if (camera.fov<80) setFov(70); }
  animateStalker(dt); bloodTick(dt);
  if (resident.g.visible && !resident.dead){ if (resident.man && resident.man.m.visible) resident.man.mixer.update(dt); if (resident.woman && resident.woman.m.visible) resident.woman.mixer.update(dt); residentLang(dt,t); }
  weatherTick(dt,t);
  nearestLights(t);
  for (var j=0;j<tvMats.length;j++){ var v=0.7+Math.sin(t*(7+j)+j)*0.25+Math.sin(t*31+j)*0.15; tvMats[j].color.setRGB(0.16*v,0.34*v,0.75*v); }
  for (var sw=0;sw<swings.length;sw++) swings[sw].rotation.x=Math.sin(t*1.2+sw*1.7)*0.22;
  if (spinner) spinner.rotation.y+=dt*0.25;
  for (var k=0;k<mist.length;k++){ var s=mist[k]; s.position.x+=s.userData.v*dt; if (s.position.x>74) s.position.x=-74; }
  var lp=leafPts, pos=lp.pos, cx=camera.position.x, cz=camera.position.z;
  if (lp.p.visible) for (var i=0;i<lp.n;i++){ var o=i*3;
    pos[o+1]-=dt*(0.5+(i%5)*0.12); pos[o]+=dt*(0.5+Math.sin(t*1.3+lp.ph[i])*0.6); pos[o+2]+=dt*Math.cos(t+lp.ph[i])*0.5;
    if (pos[o+1]<0){ pos[o+1]=9; }
    if (pos[o]-cx>22) pos[o]-=44; else if (pos[o]-cx<-22) pos[o]+=44;
    if (pos[o+2]-cz>22) pos[o+2]-=44; else if (pos[o+2]-cz<-22) pos[o+2]+=44;
  }
  if (lp.p.visible) lp.p.geometry.attributes.position.needsUpdate=true;
  var inside=camera.position.x>300; if (interior.visible!==inside) interior.visible=inside; if (world.visible===inside){ world.visible=!inside; if (grassInst) grassInst.visible=!inside && !grassOff; }
  DYN.acc+=raw; DYN.n++; if (DYN.acc>=1.5){ var fps=DYN.n/DYN.acc, want=Math.min(SAVE.fps,60); DYN.acc=0; DYN.n=0;
    if (fps<want*0.72 && DYN.pr>0.5){ DYN.pr=Math.max(0.5,DYN.pr-0.1); renderer.setPixelRatio(DYN.pr); resize(); }
    else if (fps>want*0.95 && DYN.pr<DYN.base){ DYN.good=(DYN.good||0)+1; if (DYN.good>=3){ DYN.good=0; DYN.pr=Math.min(DYN.base,DYN.pr+0.1); renderer.setPixelRatio(DYN.pr); resize(); } } else DYN.good=0; }
  VHS(t);
}



// menu backdrop: he is already out there, under the streetlight
world.updateMatrixWorld(true);
pumpkins.forEach(function(p){ var v=new THREE.Vector3(); p.getWorldPosition(v); pumpkinPos.push(v); });
placeFuses();
moonLight.shadow.needsUpdate=true;
buildPips(); backdrop(); applyQuality(); applySkin(); syncSeg(); save(); show('start');
frame();
})();
