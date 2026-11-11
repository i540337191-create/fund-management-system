import {LanguageSwitcher, DemoNotice} from "../i18n/LanguageSwitcher";
import {useState} from 'react';
import logoMark from '../../assets/fund-management-symbol.svg';
import './LoginScreen.css';

export function LoginScreen({onSubmit,isSubmitting,error}:{
  onSubmit:(credentials:{email:string;password:string})=>Promise<void>;
  isSubmitting:boolean;
  error:string|null;
}){
  const [email,setEmail]=useState('admin');
  const [password,setPassword]=useState(import.meta.env.DEV?'admin888':'');
  return <main className="fundapp-login"><div className="login-language"><DemoNotice/><LanguageSwitcher/></div><div className="fundapp-login-workspace">
    <section className="fundapp-login-story" aria-label="基金管理系统">
      <div className="fundapp-login-brand"><div className="fundapp-login-lockup"><img src={logoMark} alt=""/><strong>基金管理系统</strong></div><p>AI 驱动的基金管理平台</p></div>
    </section>
    <section className="fundapp-login-panel" aria-labelledby="fundapp-login-title">
      <form className="fundapp-login-form" aria-busy={isSubmitting} onSubmit={event=>{event.preventDefault();if(!isSubmitting)void onSubmit({email,password});}}>
        <header><h1 id="fundapp-login-title">欢迎回来</h1><p>登录，开启今日工作</p></header>
        <label className="fundapp-login-field"><span>账号</span><input type="text" name="username" value={email} onChange={event=>setEmail(event.target.value)} autoComplete="username" placeholder="请输入账号" required aria-describedby={error?'fundapp-login-error':undefined}/></label>
        <label className="fundapp-login-field"><span>密码</span><input type="password" name="password" value={password} onChange={event=>setPassword(event.target.value)} autoComplete="current-password" placeholder="请输入密码" required aria-describedby={error?'fundapp-login-error':undefined}/></label>
        <div className="fundapp-login-feedback" aria-live="polite">{error?<p id="fundapp-login-error" role="alert">{error}</p>:null}</div>
        <button className="fundapp-login-submit" data-ui="primary" type="submit" disabled={isSubmitting}>{isSubmitting?'正在登录…':'登录'}</button>
      </form>
      <footer className="fundapp-login-footer">基金管理系统 · 智能管理平台</footer>
    </section>
  </div></main>;
}
