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

app.get('/', (req,res)=> res.send('WINFX254 v6 Manual IP Live'));

app.post('/api/deposit', async (req,res)=>{
  let { phone, amount } = req.body;
  phone = cleanPhone(phone); amount = parseInt(amount);
  if(!phone||!amount) return res.status(400).json({success:false, error:'Phone and amount required'});

  const host = 'api.lipwa.co.ke';
  // IP will come from ENV var you set in Render, or we try to fetch via Google DoH via IP
  let ip = process.env.LIPWA_IP || null;

  if(!ip){
    try{
      // Try Google DNS via IP (no hostname needed)
      const r = await axios.get('https://8.8.8.8/resolve?name=api.lipwa.co.ke&type=1', { timeout: 5000 });
      ip = r.data.Answer?.[0]?.data;
      console.log('Resolved via 8.8.8.8:', ip);
    }catch(e){
      console.log('Google DoH fail', e.message);
    }
  }

  if(!ip) return res.status(500).json({success:false, error:'Could not resolve Lipwa IP. Set LIPWA_IP in Render env vars.'});

  try{
    console.log(`STK via ${ip} SNI ${host} to ${phone}`);
    const resp = await axios.post(`https://${ip}/v1/stk-push`, {
      phone, amount,
      channel_id: process.env.LIPWA_CHANNEL_ID,
      external_id: 'DEP'+Date.now(),
      callback_url: (process.env.RENDER_EXTERNAL_URL || 'https://winfx-backend.onrender.com') + '/api/lipwa-callback'
    }, {
      headers: { 'Authorization': 'Bearer '+process.env.LIPWA_API_KEY, 'Content-Type': 'application/json', 'Host': host },
      httpsAgent: new https.Agent({ servername: host, rejectUnauthorized: true }),
      timeout: 25000
    });
    console.log('STK SUCCESS', resp.data);
    return res.json({success:true, message:'STK sent', data: resp.data});
  }catch(e){
    console.log('STK FAIL', e.response?.data || e.message);
    return res.status(400).json({success:false, error: e.response?.data || e.message, triedIP: ip});
  }
});

app.post('/api/lipwa-callback', (req,res)=>{
  const d=req.body; console.log('Callback', JSON.stringify(d));
  const phone=cleanPhone(d.phone||d.msisdn||''); const amount=parseInt(d.amount||0);
  if(phone && amount) balances[phone]=(balances[phone]||0)+amount;
  res.json({received:true});
});
app.get('/api/balance/:phone', (req,res)=> res.json({balance: balances[cleanPhone(req.params.phone)]||0}));
app.post('/api/trade', (req,res)=>{
  let phone=cleanPhone(req.body.phone); if((balances[phone]||0)<10) return res.status(400).json({success:false, error:'Low balance'});
  balances[phone]-=10; const win=Math.random()<0.45; if(win) balances[phone]+=19;
  res.json({success:true, win, balance: balances[phone]});
});
const PORT=process.env.PORT||10000;
app.listen(PORT, ()=> console.log('Running '+PORT));
