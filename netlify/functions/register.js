// ─────────────────────────────────────────────────────────────
// REPLACE the entire <script>...</script> block at the bottom
// of register.html with this content
// ─────────────────────────────────────────────────────────────

const API='';
const KD=4500;

let aCode=null, aDisc=0, selectedTicket='solo';

// Ticket selector
function selectTicket(type){
  selectedTicket=type;
  document.getElementById('tc-solo').classList.toggle('selected',type==='solo');
  document.getElementById('tc-kol').classList.toggle('selected',type==='kol');
  const base=type==='kol'?4500:18000;
  document.getElementById('ps-tot').textContent='NT$'+base.toLocaleString();
  document.getElementById('btnAmt').textContent=base.toLocaleString();
  if(type==='solo'){aCode=null;aDisc=0;document.getElementById('ps-disc').style.display='none';}
}
function scrollToForm(){
  setTimeout(()=>document.querySelector('.form-card').scrollIntoView({behavior:'smooth',block:'start'}),100);
}

// Countdown (early-bird deadline 2026/03/31)
function tick(){
  const dl=new Date('2026-03-31T23:59:59+08:00');
  const df=dl-new Date();
  if(df<=0){document.getElementById('cd').textContent='早鳥截止';return;}
  const d=Math.floor(df/86400000),h=Math.floor(df%86400000/3600000),m=Math.floor(df%3600000/60000),s=Math.floor(df%60000/1000);
  document.getElementById('cd').textContent=d+'天 '+String(h).padStart(2,'0')+':'+String(m).padStart(2,'0')+':'+String(s).padStart(2,'0');
}
setInterval(tick,1000);tick();

document.getElementById('f-sess').value='2026/05/03';

// Load KOL dropdown
async function loadKOLs(){
  try{
    const ks=await(await fetch(API+'/api/kols/list')).json();
    const sel=document.getElementById('f-kol-sel');
    ks.forEach(k=>{const o=document.createElement('option');o.value=k.referral_code;o.textContent=k.username+' ('+k.referral_code+')';sel.appendChild(o);});
  }catch(e){}
}

// Validate referral code
function valCode(){
  const sel=document.getElementById('f-kol-sel');
  const el=document.getElementById('cr-sel');
  const code=sel.value.trim();
  if(!code){el.className='cr';el.textContent='';applyDisc(null,0);return;}
  const kolName=sel.options[sel.selectedIndex].textContent.split(' (')[0];
  el.className='cr ok';
  el.textContent='✓ KOL 折扣 NT$'+KD.toLocaleString()+' 已套用｜'+kolName;
  applyDisc(code,KD);
}

function applyDisc(c,a){
  aCode=c;aDisc=a;
  const base=selectedTicket==='kol'?4500:18000;
  const f=Math.max(0,base-a);
  document.getElementById('ps-base').textContent='NT$'+base.toLocaleString();
  document.getElementById('ps-disc').style.display=a>0?'flex':'none';
  document.getElementById('ps-tot').textContent='NT$'+f.toLocaleString();
  document.getElementById('btnAmt').textContent=f.toLocaleString();
}

// ── Submit handler ───────────────────────────────────────────
document.getElementById('regForm').addEventListener('submit',async function(e){
  e.preventDefault();
  const btn=document.getElementById('subBtn'),err=document.getElementById('errMsg');
  const member=document.querySelector('input[name=member]:checked')?.value;
  const region=document.querySelector('input[name=region]:checked')?.value;
  const pay=document.querySelector('input[name=pay]:checked')?.value;
  const sess=document.getElementById('f-sess').value;
  if(!member||!region||!pay||!sess){err.textContent='請完整填寫所有必選欄位';err.classList.add('on');return;}
  btn.disabled=true;btn.textContent='⟳ 處理中...';err.classList.remove('on');

  const basePrice=selectedTicket==='kol'?4500:18000;
  const finalPrice=Math.max(0,basePrice-aDisc);

  const body={
    name:document.getElementById('f-name').value.trim(),
    email:document.getElementById('f-email').value.trim(),
    phone:document.getElementById('f-phone').value.trim(),
    session:sess,
    is_member:member,
    region,
    payment:pay==='刷卡'?'credit_card':pay==='匯款'?'transfer':pay,
    referral_code:aCode||null,
    ticket_type:selectedTicket,
    ticket_tier_id:selectedTicket==='kol'?1:2,
    quantity:selectedTicket==='solo'?4:1
  };

  try{
    // Step 1: Save registration to DB
    const res=await fetch(API+'/api/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    const d=await res.json();
    if(!res.ok)throw new Error(d.error||'報名失敗');

    if(pay==='刷卡'){
      // Step 2 (credit card only): Get signed payment form from backend
      const pr=await fetch(API+'/api/create-payment',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({
          order_no:   d.order_no,          // ← pass DB order number to NewebPay
          amount:     finalPrice,
          name:       body.name,
          email:      body.email,
          description:'杜金龍四季贏家選股策略班'
        })
      });
      const pd=await pr.json();
      if(!pr.ok)throw new Error('建立付款失敗，請稍後再試');

      // Step 3: Build a hidden form and auto-submit to NewebPay
      const form=document.createElement('form');
      form.method='POST';
      form.action=pd.action;
      [['MerchantID',pd.MerchantID],['TradeInfo',pd.TradeInfo],
       ['TradeSha',pd.TradeSha],['Version',pd.Version]].forEach(([k,v])=>{
        const i=document.createElement('input');
        i.type='hidden';i.name=k;i.value=v;
        form.appendChild(i);
      });
      document.body.appendChild(form);
      form.submit();   // browser leaves to NewebPay — webhook fires on payment success
      return;
    }

    // Transfer / cash → show success overlay
    document.getElementById('orderNo').textContent=d.order_no;
    document.getElementById('sov').classList.add('on');

  }catch(ex){
    err.textContent=ex.message;err.classList.add('on');
    btn.disabled=false;
    btn.innerHTML='立即完成報名 — NT$<span id="btnAmt">'+finalPrice.toLocaleString()+'</span>';
  }
});

loadKOLs();
