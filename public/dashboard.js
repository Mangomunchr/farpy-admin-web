(function(){
  const TOKEN = localStorage.getItem('farpy_admin_token') || prompt('Admin token for dashboard:');
  if (TOKEN) localStorage.setItem('farpy_admin_token', TOKEN);

  const headers = { 'x-admin-token': TOKEN };

  function fmtBytes(n){
    if(!n) return '0 B';
    const k=1024, units=['B','KB','MB','GB','TB'];
    let i=Math.floor(Math.log(n)/Math.log(k));
    return (n/Math.pow(k,i)).toFixed(1)+' '+units[i];
  }
  function fmtTime(iso){
    try{ return new Date(iso).toLocaleString(); }catch(e){ return iso; }
  }

  async function getSummary(){
    const r = await fetch('/api/summary', { headers });
    if (r.status === 401) throw new Error('unauthorized');
    return await r.json();
  }
  async function getEvents(params){
    const qs = new URLSearchParams(params||{}).toString();
    const r = await fetch('/api/events?'+qs, { headers });
    if (r.status === 401) throw new Error('unauthorized');
    return await r.json();
  }

  function fillSummary(sum){
    const el = document.getElementById('summary');
    el.innerHTML = '';
    const entries = [
      ['Events (24h)', sum.last24h.events],
      ['Jobs Queued',  sum.totals.jobsQueued],
      ['Jobs Done',    sum.totals.jobsDone],
      ['Errors',       sum.totals.jobsError],
      ['NodeMunchers Online', sum.nodemunchersOnline],
      ['Active Farpies',      sum.farpiesActive],
      ['Bandwidth',    fmtBytes(sum.bandwidthBytes)],
      ['Est. Cost',    `$${(sum.estCost||0).toFixed(4)}`]
    ];
    entries.forEach(([label,val])=>{
      const d=document.createElement('div');
      d.className='kpi';
      d.innerHTML=`<div class="label">${label}</div><div class="value">${val}</div>`;
      el.appendChild(d);
    });
  }

  function fillTable(id, rows, kind){
    const tb = document.querySelector(`#${id} tbody`);
    tb.innerHTML = '';
    rows.forEach(r=>{
      const tr = document.createElement('tr');
      if (kind==='farpy') {
        tr.innerHTML = `<td>${fmtTime(r.iso)}</td><td>${r.userId||''}</td><td>${r.jobId||''}</td><td>${r.stage||''}</td><td>${r.status||''}</td><td>${fmtBytes(r.bytes||0)}</td><td>${r.note||''}</td>`;
      } else {
        tr.innerHTML = `<td>${fmtTime(r.iso)}</td><td>${r.nodeId||''}</td><td>${r.jobId||''}</td><td>${r.stage||''}</td><td>${r.status||''}</td><td>${fmtBytes(r.bytes||0)}</td><td>${r.note||''}</td>`;
      }
      tb.appendChild(tr);
    });
  }

  async function refresh(){
    try{
      const sum = await getSummary();
      fillSummary(sum);
      const farpy = await getEvents({ actor:'farpy_user', limit:100 });
      fillTable('farpyEvents', farpy.events, 'farpy');
      const nodes = await getEvents({ actor:'nodemuncher', limit:100 });
      fillTable('nodeEvents', nodes.events, 'node');
      document.getElementById('status-dot').classList.add('ok');
      document.getElementById('lastRefresh').textContent = 'Updated ' + new Date().toLocaleTimeString();
    }catch(e){
      document.getElementById('status-dot').classList.remove('ok');
      alert('Dashboard auth failed. Press OK to enter token again.');
      localStorage.removeItem('farpy_admin_token');
      location.reload();
    }
  }

  refresh();
  setInterval(refresh, 10_000);
})();