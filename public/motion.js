'use strict';
/* Gentle photo movement, never part of navigation or purchasing. */
(() => {
  const toggle=document.querySelector('#motion-toggle'),hero=document.querySelector('.hero-image>img'),journal=document.querySelector('.journal-photo img');
  if(!toggle||!hero)return;
  const reduced=matchMedia('(prefers-reduced-motion: reduce)'),mobile=matchMedia('(max-width: 760px)');
  let paused=false,queued=false;
  try{paused=localStorage.getItem('engedi-select-motion')==='off';}catch{}
  function apply(){queued=false;const off=paused||reduced.matches||mobile.matches;document.documentElement.classList.toggle('reduce-motion',paused||reduced.matches);toggle.setAttribute('aria-pressed',String(paused));toggle.textContent=paused?'움직임 켜기 ▷':'움직임 멈추기 Ⅱ';toggle.setAttribute('aria-label',paused?'화면 움직임 켜기':'화면 움직임 멈추기');hero.style.transform=off?'none':`scale(1.035) translateY(${Math.min(14,window.scrollY*.025)}px)`;if(journal){const rect=journal.parentElement.getBoundingClientRect();const amount=Math.max(-12,Math.min(12,(window.innerHeight/2-rect.top-rect.height/2)*.025));journal.style.transform=off?'none':`scale(1.035) translateY(${amount}px)`;}}
  function schedule(){if(!queued){queued=true;requestAnimationFrame(apply);}}
  toggle.addEventListener('click',()=>{paused=!paused;try{localStorage.setItem('engedi-select-motion',paused?'off':'on');}catch{}apply();});window.addEventListener('scroll',schedule,{passive:true});window.addEventListener('resize',schedule,{passive:true});reduced.addEventListener('change',apply);apply();
})();
