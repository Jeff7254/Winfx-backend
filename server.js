const express = require('express');
const axios = require('axios');
const cors = require('cors');
const https = require('https');

const app = express();
app.use(cors());
app.use(express.json());

// BYPASS RENDER DNS BLOCK - USE CLOUDFLARE DoH
async function resolveViaDoH(hostname) {
  try {
    const res = await axios.get(`https://cloudflare-dns.com/dns-query?name=${hostname}&type=A`, {
      headers: { 'Accept': 'application/dns-json' },
      timeout: 5000
    });
    const answers = res.data.Answer || [];
    const a = answers.find(x => x.type === 1);
    return a? a.data : null;
  } catch (e) {
    console.log('DoH fail', e.message);
    return null;
  }
}

async function postToLipwa(payload, headers) {
  const hosts = ['api.lipwa.co.ke', 'api.lipwa.app'];
  let lastError = null;

  for (let host of hosts) {
    // Get IP via DoH
    let ip = await resolveViaDoH(host);
    if (!ip) {
      console.log(`DoH could not resolve ${host}, trying direct`);
      ip = host; // fallback let axios try
    }
    const url = `https://${ip}/v1/stk-push`;

    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        console.log(`Trying ${host} (${ip}) attempt ${attempt+1}`);
        const resp = await axios.post(url, payload, {
          headers: {
           ...headers,
            'Host': host // important for TLS SNI
          },
          httpsAgent: new https.Agent({
            rejectUnauthorized: true,
            servername: host // keep cert valid
          }),
          timeout: 20000
        });
        return resp;
      } catch (e) {
        lastError = e;
        console.log(`Fail ${host}:`, e.response?.data || e.message);
        // If IP failed, try with hostname directly on second try
        if (ip!== host) ip = host;
        await new Promise(r => setTimeout(r, 1000));
      }
    }
  }
  throw lastError;
}

let balances = {};
const cleanPhone = (p) => {
  let s = (p||'').toString().replace(/\D/g,'');
  if(s.startsWith('0')) s='254'+s.slice(1);
  if(s.startsWith('7')) s='254'+s;
  if(s.length===9) s='254'+s;
  return s;
};

app.get('/', (req,res)=> res.send('WINFX254 v4 DoH Live'));

app.post('/api/deposit', async (req,res)=>{
  let { phone, amount } = req.body;
  phone = cleanPhone(phone); amount = parseInt(amount);
  if(!phone||!amount) return res.status(400).json({success:false, error:'Phone and amount required'});

  try{
    const payload = {
      phone,
      amount,
      channel_id: process.env.LIPWA_CHANNEL_ID,
      external_id: 'DEP'+Date.now(),
      callback_url: (process.env.RENDER_EXTERNAL_URL || 'https://winfx-backend.onrender.com') + '/api/lipwa-callback'
    };
    const headers = {
      'Authorization': 'Bearer '+process.env.LIPWA_API_KEY,
      'Content-Type': 'application/json'
    };

    const resp = await postToLipwa(payload, headers);
    console.log('STK SUCCESS', resp.data);
    res.json({success:true, message:'STK sent', data: resp.data});

  }catch(e){
    console.log('Final Lipwa error', e.response?.data || e.message);
    res.status(400).json({success:false, error: e.response?.data?.message || e.response?.data || e.message || 'Failed to reach Lipwa'});
  }
});

app.post('/api/lipwa-callback', (req,res)=>{
  const d = req.body;
  console.log('Callback', JSON.stringify(d));
  const phone = cleanPhone(d.phone||d.msisdn||'');
  const amount = parseInt(d.amount||0);
  const status = (d.status||'').toString().toUpperCase();
  if(phone && amount && (status==='SUCCESS'|| d.success)){
    balances[phone]=(balances[phone]||0)+amount;
    console.log(`Credited ${amount} to ${phone}`);
  }
  res.json({received:true});
});

app.get('/api/balance/:phone', (req,res)=>{
  res.json({balance: balances[cleanPhone(req.params.phone)]||0});
});

app.post('/api/trade', (req,res)=>{
  let phone = cleanPhone(req.body.phone);
  if((balances[phone]||0)<10) return res.status(400).json({success:false, error:'Low balance'});
  balances[phone]-=10;
  const win=Math.random()<0.45;
  if(win) balances[phone]+=19;
  res.json({success:true, win, balance: balances[phone]});
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, ()=> console.log('Running '+PORT));
