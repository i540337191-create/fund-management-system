// Native title popups cannot be themed; preserve their content in one shared tooltip.
export function initializeTitleTooltips() {
  const tip=document.createElement('div');
  tip.id='system-title-tooltip';tip.className='system-title-tooltip';tip.setAttribute('role','tooltip');tip.hidden=true;
  tip.setAttribute('popover','manual');document.body.append(tip);
  let owner:HTMLElement|SVGElement|null=null,showTimer=0,hideTimer=0,keyboardFocus=true;
  const hide=()=>{
    clearTimeout(showTimer);clearTimeout(hideTimer);
    if(owner){const ids=(owner.getAttribute('aria-describedby')??'').split(/\s+/).filter(id=>id&&id!==tip.id);if(ids.length)owner.setAttribute('aria-describedby',ids.join(' '));else owner.removeAttribute('aria-describedby');}
    if(tip.matches(':popover-open'))tip.hidePopover();tip.hidden=true;owner=null;
  };
  const convertedRemovals=new WeakSet<Element>(),generatedNames=new WeakMap<Element,string>();
  const convert=(element:Element)=>{
    if(!(element instanceof HTMLElement||element instanceof SVGElement)||!element.hasAttribute('title'))return;
    const text=element.getAttribute('title')??'';
    if(text.trim()){
      element.dataset.tooltip=text;
      const hasLabel=element.hasAttribute('aria-labelledby')||((element instanceof HTMLInputElement||element instanceof HTMLSelectElement||element instanceof HTMLTextAreaElement)&&element.labels?.length);
      if(element.matches('button,a,input,select,textarea')&&!hasLabel&&!element.textContent?.trim()&&(!element.hasAttribute('aria-label')||element.getAttribute('aria-label')===generatedNames.get(element))){element.setAttribute('aria-label',text);generatedNames.set(element,text);} 
    }else delete element.dataset.tooltip;
    convertedRemovals.add(element);element.removeAttribute('title');
    if(owner===element)hide();
  };
  const svgLabels=new WeakMap<Element,string>();
  const svgTitle=(element:Element)=>{
    if(element.localName!=='title'||!(element.parentElement instanceof SVGElement)||!element.textContent)return;
    const parent=element.parentElement,text=element.textContent;
    parent.dataset.tooltip=text;
    if(!parent.hasAttribute('aria-label')||parent.getAttribute('aria-label')===svgLabels.get(element))parent.setAttribute('aria-label',text);
    svgLabels.set(element,text);
    if(owner===parent)hide();
    for(const child of element.childNodes)if(child.nodeType===Node.TEXT_NODE)child.nodeValue='';
  };
  const scan=(node:Node)=>{if(node instanceof Element){svgTitle(node);convert(node);node.querySelectorAll('[title]').forEach(convert);node.querySelectorAll('svg title').forEach(svgTitle);}};
  scan(document.documentElement);
  new MutationObserver(records=>{for(const record of records){if(record.type==='attributes'){const element=record.target as HTMLElement;if(element.hasAttribute('title'))convert(element);else if(!convertedRemovals.delete(element)){delete element.dataset.tooltip;if(owner===element)hide();}}else {if(record.target instanceof Element)svgTitle(record.target);else if(record.target.parentElement)svgTitle(record.target.parentElement);for(const node of record.addedNodes)scan(node);}}if(owner&&!owner.isConnected)hide();}).observe(document.body,{subtree:true,childList:true,attributes:true,characterData:true,attributeFilter:['title']});
  const show=(element:HTMLElement|SVGElement,delay:number)=>{
    clearTimeout(hideTimer);if(owner===element)return;hide();owner=element;
    showTimer=window.setTimeout(()=>{
      if(!element.isConnected||!element.dataset.tooltip){hide();return;}
      tip.textContent=element.dataset.tooltip;tip.hidden=false;
      if(typeof tip.showPopover==='function')tip.showPopover();
      const rect=element.getBoundingClientRect(),box=tip.getBoundingClientRect();
      const left=Math.max(8,Math.min(innerWidth-box.width-8,rect.left+(rect.width-box.width)/2));
      const below=rect.bottom+8;
      const top=below+box.height<=innerHeight-8?below:Math.max(8,rect.top-box.height-8);
      tip.style.left=`${left}px`;tip.style.top=`${top}px`;
      element.setAttribute('aria-describedby',[(element.getAttribute('aria-describedby')??''),tip.id].filter(Boolean).join(' '));
    },delay);
  };
  document.addEventListener('pointerover',event=>{
    if(event.pointerType==='touch')return;
    const target=event.target instanceof Element?event.target:null;
    if(target&&tip.contains(target)){clearTimeout(hideTimer);return;}
    const element=target?.closest<HTMLElement>('[data-tooltip]');
    if(element)show(element,450);else if(owner)hideTimer=window.setTimeout(hide,120);
  });
  document.addEventListener('pointerout',event=>{
    const next=event.relatedTarget instanceof Node?event.relatedTarget:null;
    if(owner&&next&&(owner.contains(next)||tip.contains(next)))return;
    clearTimeout(hideTimer);hideTimer=window.setTimeout(hide,120);
  });
  document.addEventListener('focusin',event=>{const element=event.target instanceof Element?event.target.closest<HTMLElement>('[data-tooltip]'):null;if(element&&keyboardFocus)show(element,0);else hide();});
  document.addEventListener('focusout',hide);
  document.addEventListener('pointerdown',()=>{keyboardFocus=false;hide();},true);
  document.addEventListener('keydown',event=>{if(event.key==='Escape')hide();else keyboardFocus=true;});
  window.addEventListener('scroll',hide,true);window.addEventListener('resize',hide);window.addEventListener('blur',hide);
}
