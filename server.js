const express = require('express');
const dns = require('dns');
dns.setServers(['8.8.8.8', '1.1.1.1']);
dns.setDefaultResultOrder('ipv4first');

const axios = require('axios');
const cors = require('cors');
const app = express();
app.use(cors());
app.use(express.json());

let balances = {};
const cleanPhone = (p) => {
  let s = (p || '').toString().replace(/\D/g,'');
  if(s.startsWith('0')) s = '254' + s.slice(1);
  if(s.startsWith('7')) s = '254' + s;
  return s;
};

app.get('/', (req,res)=> res.send('WINFX254 Live'));

app.post('/api/deposit', async (req,res)=>{
  let { phone, amount } = req.body;
  phone = cleanPhone(phone); amount = parseInt(amount);
  if(!phone ||!amount) return res.status(400).json({success:false, error:'Phone and amount required'});
  try{
    const resp = await axios.post('https://api.lipwa.app/v1/stk-push',{
      phone,
      amount,
      channel_id: process.env.LIPWA_CHANNEL_ID,
      external_id: 'DEP'+Date.now(),
      callback_url: (process.env.RENDER_EXTERNAL_URL || 'https://winfx-backend.onrender.com') + '/api/lipwa-callback'
    },{
      headers: { 'Authorization': 'Bearer ' + process.env.LIPWA_API_KEY, 'Content-Type':'application/json' },
      timeout: 15000
    });
    console.log('STK sent to', phone, resp.data);
    res.json({success:true, message:'STK sent', data: resp.data});
  }catch(e){
    console.log('Lipwa error', e.response?.data || e.message);
    res.status(400).json({success:false, error: e.response?.data?.message || e.response?.data || e.message});
  }
});

app.post('/api/lipwa-callback', (req,res)=>{
  const d = req.body;
  console.log('Callback', JSON.stringify(d));
  const phone = cleanPhone(d.phone||d.msisdn||'');
  const amount = parseInt(d.amount||0);
  const status = d.status||d.result||'';
  if(phone && amount && (status==='SUCCESS' || status==='success' || d.success)){
    balances[phone] = (balances[phone]||0)+amount;
    console.log(`Credited ${amount} to ${phone}`);
  }
  res.json({received:true});
});

app.get('/api/balance/:phone', (req,res)=>{
  const phone = cleanPhone(req.params.phone);
  res.json({balance: balances[phone]||0});
});

app.post('/api/trade', (req,res)=>{
  let { phone } = req.body;
  phone = cleanPhone(phone);
  if((balances[phone]||0) < 10) return res.status(400).json({success:false, error:'Low balance'});
  balances[phone] -= 10;
  const win = Math.random() < 0.45;
  if(win) balances[phone] += 19;
  res.json({success:true, win, balance: balances[phone]});
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, ()=> console.log('Running on '+PORT));
