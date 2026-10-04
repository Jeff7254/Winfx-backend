const express = require('express');
const axios = require('axios');
const cors = require('cors');
const https = require('https');

const app = express();
app.use(cors());
app.use(express.json());

// ULTIMATE BYPASS - USE IP, NOT HOSTNAME
async function resolveLipwaIP() {
  try {
    // Use 1.1.1.1 IP directly, not hostname
    const res = await axios.get('https://1.1.1.1/dns-query?name=api.lipwa.co.ke&type=A', {
      headers: { 'Accept': 'application/dns-json' },
      timeout: 5000,
      httpsAgent: new https.Agent({ rejectUnauthorized: false })
    });
    const ip = res.data.Answer?.find(a=>a.type===1)?.data;
    console.log('Resolved Lipwa IP via 1.1.1.1:', ip);
    return ip || '34.36.24.124'; // fallback IP
  } catch(e) {
    console.log('DoH IP fail, using fallback', e.message);
    return '34.36.24.124'; // Known Lipwa IP
  }
}

let LIPWA_IP = null;
resolveLipwaIP().then(ip=> LIPWA_IP = ip);

let balances = {};
const cleanPhone = (p) => {
  let s = (p||'').toString().replace(/\D/g,'');
  if(s.startsWith('0')) s='254'+s.slice(1);
  if(s.startsWith('7')) s='254'+s;
  if(s.length===9) s='254'+s;
  return s;
};

app.get('/', (req,res)=> res.send('WINFX254 v5 IP Bypass Live'));

app.post('/api/deposit', async (req,res)=>{
  let { phone, amount } = req.body;
  phone = cleanPhone(phone); amount = parseInt(amount);
  if(!phone||!amount) return res.status(400).json({success:false, error:'Phone and amount required'});

  const ip = LIPWA_IP || '34.36.24.124';
  const host = 'api.lipwa.co.ke';

  try{
    console.log(`Attempt STK via IP ${ip} for host ${host}`);
    const resp = await axios.post(`https://${ip}/v1/stk-push`, {
      phone,
      amount,
      channel_id: process.env.LIPWA_CHANNEL_ID,
      external_id: 'DEP'+Date.now(),
      callback_url: (process.env.RENDER_EXTERNAL_URL || 'https://winfx-backend.onrender.com') + '/api/lipwa-callback'
    }, {
      headers: {
        'Authorization': 'Bearer '+process.env.LIPWA_API_KEY,
        'Content-Type': 'application/json',
        'Host': host
      },
      httpsAgent: new https.Agent({
        servername: host,
        rejectUnauthorized: true
      }),
      timeout: 20000
    });
    console.log('STK SUCCESS', resp.data);
    return res.json({success:true, message:'STK sent', data: resp.data});
  }catch(e){
    console.log('STK ERROR', e.response?.data || e.message);
    return res.status(400).json({success:false, error: e.response?.data || e.message});
  }
});

app.post('/api/lipwa-callback', (req,res)=>{
  const d=req.body; console.log('Callback', JSON.stringify(d));
  const phone=cleanPhone(d.phone||d.msisdn||'');
  const amount=parseInt(d.amount||0);
  if(phone && amount) { balances[phone]=(balances[phone]||0)+amount; }
  res.json({received:true});
});

app.get('/api/balance/:phone', (req,res)=>{
  res.json({balance: balances[cleanPhone(req.params.phone)]||0});
});

app.post('/api/trade', (req,res)=>{
  let phone=cleanPhone(req.body.phone);
  if((balances[phone]||0)<10) return res.status(400).json({success:false, error:'Low balance'});
  balances[phone]-=10; const win=Math.random()<0.45; if(win) balances[phone]+=19;
  res.json({success:true, win, balance: balances[phone]});
});

const PORT=process.env.PORT||10000;
app.listen(PORT, ()=> console.log('Running '+PORT));
