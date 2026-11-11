import {useId} from 'react';

export function DashboardObjectIcon({kind}:{kind:'fund'|'project'}){
 const id=useId().replace(/:/g,'');
 return <svg viewBox="0 0 64 68" className="dashboard-crafted-icon" aria-hidden="true" focusable="false">
  <defs>
   <linearGradient id={id+'paper'} x1="0" y1="0" x2="1" y2="1"><stop stopColor="#fffdf4"/><stop offset=".55" stopColor="#f3e8d2"/><stop offset="1" stopColor="#dcc7a5"/></linearGradient>
   <linearGradient id={id+'brass'} x1="0" y1="0" x2="1" y2=".7"><stop stopColor="#f0dca7"/><stop offset=".32" stopColor="#bf985c"/><stop offset=".65" stopColor="#e5c990"/><stop offset="1" stopColor="#8b6539"/></linearGradient>
   <linearGradient id={id+'spine'} x1="0" y1="0" x2="1" y2="0"><stop stopColor="#684933"/><stop offset=".4" stopColor="#98744d"/><stop offset="1" stopColor="#775536"/></linearGradient>
   <linearGradient id={id+'sage'} x1="0" y1="0" x2=".8" y2="1"><stop stopColor="#bcc8b6"/><stop offset=".45" stopColor="#869b81"/><stop offset="1" stopColor="#5b755e"/></linearGradient>
  </defs>
  {kind==='fund'?<>
   <ellipse cx="32" cy="61" rx="21" ry="3" fill="#805e30" opacity=".11"/>
   <path d="M16 12 48 8q5-.5 5 5v43q0 4-4 4l-32 2q-5 0-5-5V18q0-5 4-6Z" fill="#c8b292"/>
   <path d="m18 13 30-3v45l-30 3Z" fill="#fffaf0" stroke="#bca17c" strokeWidth=".7"/>
   <path d="m21 15 28-3M21 18l28-3M21 55l28-2" fill="none" stroke="#dfd0b8" strokeWidth=".65"/>
   <path d="M15 9 46 6q5-.5 5 4v43q0 3-4 3l-31 3q-5 .3-5-5V15q0-5 4-6Z" fill={'url(#'+id+'paper)'} stroke="#b79b72" strokeWidth=".9"/>
   <path d="m15 9 5-.5v49l-4 .5q-5 .3-5-5V15q0-5 4-6Z" fill={'url(#'+id+'spine)'}/>
   <path d="m14 17 3-.3m-3 27 3-.3" stroke={'url(#'+id+'brass)'} strokeWidth="2.2" strokeLinecap="round"/>
   <path d="m23 13 23-2v38l-23 2Z" fill="none" stroke="#c7ad81" strokeWidth=".6"/>
   <path d="M43 10v45l-3-2.5-3 3V11" fill={'url(#'+id+'brass)'} opacity=".72"/>
   <path d="m27 29 5-7 5 6-3-1.7-2-2.3-2.2 3.6Z" fill="#9e7a43"/>
   <path d="m26 36 10-1M26 40l8-.8" stroke="#aa8c5f" strokeWidth=".85" strokeLinecap="round"/>
   <path d="m21 10 24-2" stroke="#fffdf6" strokeWidth=".8" opacity=".9"/>
  </>:<>
   <ellipse cx="32" cy="61" rx="24" ry="3" fill="#4a6148" opacity=".12"/>
   <path d="M8 23q0-3 3-3h13l5 5 24-2q3 0 3 3v28q0 4-4 4H11q-3 0-3-3Z" fill={'url(#'+id+'sage)'} stroke="#647a5c" strokeWidth=".9"/>
   <path d="m20 12 29-3 4 38-30 4Z" fill="#d9c7a6" stroke="#bfa988" strokeWidth=".8"/>
   <path d="m16 11 30-2 3 38-30 2Z" fill={'url(#'+id+'paper)'} stroke="#cbb796" strokeWidth=".8"/>
   <path d="m21 17 18-1m-17 5 19-1m-18 5 15-.8" stroke="#c6b598" strokeWidth=".8" strokeLinecap="round"/>
   <path d="m42 10 3-.3.5 7-3 .3Z" fill={'url(#'+id+'brass)'}/>
   <path d="m7 29 45-3q5-.3 5 4l-3 25q-.5 4-4 4H12q-4 0-4-4L5 33q-.4-3 2-4Z" fill={'url(#'+id+'sage)'} stroke="#6d8267" strokeWidth=".85"/>
   <path d="m8 30 44-3q3-.3 3 2" fill="none" stroke="#e3e9d9" strokeWidth=".9" opacity=".85"/>
   <path d="m11 34 2 20h36l2-22" fill="none" stroke="#c1ceb5" strokeWidth=".6" opacity=".65"/>
   <rect x="24" y="38" width="16" height="12" rx="2" fill={'url(#'+id+'brass)'} stroke="#8e774d" strokeWidth=".6"/>
   <path d="m28 46 4-5 4 5-4-2Z" fill="#6e6e48" opacity=".85"/>
   <circle cx="27" cy="41" r=".7" fill="#fff1c4"/><circle cx="37" cy="47" r=".7" fill="#80643c"/>
  </>}
 </svg>;
}
