const logoMark=new URL('../../assets/fund-management-symbol.svg',import.meta.url).href;
export function AppLoading(){
 return <section className="app-loading" role="status" aria-live="polite" aria-busy="true"><img src={logoMark} alt="" aria-hidden="true"/><p>正在加载…</p></section>;
}
