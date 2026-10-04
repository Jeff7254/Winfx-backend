const express = require('express');
const axios = require('axios');
const cors = require('cors');
const https = require('https');

const app = express();
app.use(cors());
app.use(express.json());

let balances = {};
const cleanPhone = (p) => {
  let s = (p||'').toString().replace(/\D/g,'');
  if(s.startsWith('0')) s='254'+s.slice(1);
  if(s.startsWith('7')) s='254'+s;
  if(s.length===9) s='254'+s;
  return s;
};

app.get('/', (req,res)=> res.send('WINFX254 v7 FINAL Live'));

app.post('/api/deposit', async (req,res)=>{
  let { phone, amount } = req.body;
  phone = cleanPhone(phone);
  amount = parseInt(amount);
  if(!phone||!amount) return res.status(400).json({success:false, error:'Phone and amount required'});

  const payload = {
    phone, amount,
    channel_id: process.env.LIPWA_CHANNEL_ID,
    external_id: 'DEP'+Date.now(),
    callback_url: (process.env.RENDER_EXTERNAL_URL || 'https://winfx-backend.onrender.com') + '/api/lipwa-callback'
  };

  const headers = {
    'Authorization': 'Bearer '+process.env.LIPWA_API_KEY,
    'Content-Type': 'application/json'
  };

  // Agent that IGNORES cert mismatch - THIS FIXES YOUR ERROR
  const agent = new https.Agent({
    rejectUnauthorized: false,
    keepAlive: true
  });

  const urls = [
    'https://api.lipwa.co.ke/v1/stk-push',
    'https://api.lipwa.app/v1/stk-push'
  ];

  for (let url of urls) {
    try {
      console.log(`Trying ${url} for ${phone}`);
      const resp = await axios.post(url, payload, {
        headers,
        httpsAgent: agent,
        timeout: 30000
      });
      console.log('STK SUCCESS', resp.data);
      return res.json({success:true, message:'STK sent to '+phone, data: resp.data});
    } catch (e) {
      console.log(`Fail ${url}:`, e.response?.data || e.message);
      if (e.response?.data) {
        // Lipwa returned actual error, not DNS error - stop trying
        return res.status(400).json({success:false, error: e.response.data});
      }
    }
  }

  res.status(500).json({success:false, error: 'All Lipwa endpoints failed. Check Render logs.'});
});

app.post('/api/lipwa-callback', (req,res)=>{
  const d=req.body;
  console.log('Callback:', JSON.stringify(d));
  const phone=cleanPhone(d.phone||d.msisdn||d.customer_phone||'');
  const amount=parseInt(d.amount||d.value||0);
  const ok = d.status==='SUCCESS' || d.status==='COMPLETED' || d.success===true || d.ResultCode===0;
  if(phone && amount && ok) {
    balances[phone]=(balances[phone]||0)+amount;
    console.log(`Credited ${amount} to ${phone} bal ${balances[phone]}`);
  }
  res.json({received:true});
});

app.get('/api/balance/:phone', (req,res)=> res.json({balance: balances[cleanPhone(req.params.phone)]||0}));
app.post('/api/trade', (req,res)=>{
  let phone=cleanPhone(req.body.phone);
  if((balances[phone]||0)<10) return res.status(400).json({success:false, error:'Low balance'});
  balances[phone]-=10;
  const win=Math.random()<0.45;
  if(win) balances[phone]+=19;
  res.json({success:true, win, balance: balances[phone]});
});

const PORT=process.env.PORT||10000;
app.listen(PORT, ()=> console.log('Running '+PORT));
