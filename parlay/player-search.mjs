// Same name/team/position substring matching and twelve-result limit as the Lab search.
const normalize=value=>String(value??'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
export function searchPlayers(roster,query){const needle=normalize(query).trim();if(!needle)return [];return roster.filter(p=>normalize([p.name,p.team,p.position].join(' ')).includes(needle)).sort((a,b)=>Number(normalize(b.name).startsWith(needle))-Number(normalize(a.name).startsWith(needle))||a.name.localeCompare(b.name)||a.team.localeCompare(b.team)).slice(0,12);}
export function mountPlayerSearch(root,roster,{id,value='',onChange}){
 const label=document.createElement('label');label.htmlFor=id;label.textContent='Player';
 const wrap=document.createElement('div');wrap.className='player-search-wrap';
 const input=document.createElement('input');input.id=id;input.type='search';input.placeholder='Search NFL players…';input.autocomplete='off';input.setAttribute('role','combobox');input.setAttribute('aria-autocomplete','list');input.setAttribute('aria-expanded','false');input.setAttribute('aria-controls',id+'-results');
 const results=document.createElement('div');results.id=id+'-results';results.className='search-suggestions';results.setAttribute('role','listbox');results.setAttribute('aria-label','Matching players');results.hidden=true;
 let selected=roster.find(p=>p.id===value),matches=[],active=-1;input.value=selected?`${selected.name} · ${selected.team}`:'';
 wrap.append(input,results);root.replaceChildren(label,wrap);
 function close(){results.hidden=true;input.setAttribute('aria-expanded','false');input.removeAttribute('aria-activedescendant');active=-1;}
 function choose(p){selected=p;input.value=`${p.name} · ${p.team}`;close();onChange(p.id);input.focus();}
 function highlight(){[...results.querySelectorAll('[role=option]')].forEach((el,i)=>{el.setAttribute('aria-selected',String(i===active));if(i===active){input.setAttribute('aria-activedescendant',el.id);el.scrollIntoView({block:'nearest'});}});}
 function render(){matches=searchPlayers(roster,input.value);active=-1;results.replaceChildren();if(!input.value.trim()){close();return;}
  for(const [i,p] of matches.entries()){const row=document.createElement('button');row.type='button';row.className='search-suggestion';row.id=id+'-option-'+i;row.tabIndex=-1;row.setAttribute('role','option');row.setAttribute('aria-selected','false');const name=document.createElement('strong');name.textContent=p.name;const detail=document.createElement('small');detail.textContent=`NFL · ${p.team}${p.position?' · '+p.position:''}`;row.append(name,detail);row.onpointerdown=e=>e.preventDefault();row.onclick=()=>choose(p);results.append(row);}
  if(!matches.length){const empty=document.createElement('div');empty.className='search-no-results';empty.textContent='No matching NFL players';empty.setAttribute('role','status');results.append(empty);}
  results.hidden=false;input.setAttribute('aria-expanded','true');input.removeAttribute('aria-activedescendant');
 }
 input.oninput=()=>{selected=null;onChange(null);render();};
 input.onfocus=()=>{if(!selected)render();};
 input.onkeydown=e=>{if(e.key==='Escape'){close();return;}if(['ArrowDown','ArrowUp'].includes(e.key)){e.preventDefault();if(results.hidden)render();if(matches.length){active=active<0?(e.key==='ArrowDown'?0:matches.length-1):(active+(e.key==='ArrowDown'?1:-1)+matches.length)%matches.length;highlight();}}else if(e.key==='Enter'&&!results.hidden){e.preventDefault();if(matches.length)choose(matches[active<0?0:active]);}else if(e.key==='Tab')close();};
 // Focus stays in the textbox for pointer/keyboard selection; leaving closes suggestions.
 wrap.onfocusout=e=>{if(!wrap.contains(e.relatedTarget))close();};
 return {clear(){selected=null;input.value='';close();onChange(null);}};
}
