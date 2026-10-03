const express = require('express');
const cors = require('cors');
const axios = require('axios');
const app = express();
app.use(cors());
app.use(express.json());

const balances = {};
const cleanPhone = (p) => {
  if(!p) return '';
  p = p.toString().replace(/\s+/g,'');
  if(p.startsWith('0')) p = '254'+p.slice(1);
  if(p.startsWith('+')) p = p.slice(1);
  return p;
};

app.get('/api/balance/:phone', (req,res)=>{
  const phone = cleanPhone(req.params.phone);
  res.json({success:true, phone, balance: balances[phone]||0});
});

app.post('/api/deposit', async (req,res)=>{
  let { phone, amount } = req.body;
  phone = cleanPhone(phone); amount = parseInt(amount);
  try{
    const resp = await axios.post('https://api.lipwa.app/v1/stk-push',{
      phone, amount,
      channel_id: process.env.LIPWA_CHANNEL_ID,
      external_id: 'DEP'+Date.now(),
      callback_url: (process.env.RENDER_EXTERNAL_URL || 'https://winfx-backend.onrender.com') + '/api/lipwa-callback'
    },{ headers:{ 'Authorization': 'Bearer ' + process.env.LIPWA_API_KEY } });
    res.json({success:true, message:'STK sent', data: resp.data});
  }catch(e){ res.status(400).json({success:false, error: e.response?.data || e.message}); }
});

app.post('/api/lipwa-callback', (req,res)=>{
  const d = req.body; const phone = cleanPhone(d.phone||d.msisdn||'');
  const amount = parseInt(d.amount||0);
  const status = d.status||d.result;
  if(phone && amount && (status==='SUCCESS'||status==='success'||d.success)){
    balances[phone] = (balances[phone]||0)+amount;
    console.log(`Credited ${amount} to ${phone}`);
  }
  res.json({ok:true});
});

// WITHDRAW 1000 KES MINIMUM - REAL
app.post('/api/withdraw', async (req,res)=>{
  let { phone, amount } = req.body;
  phone = cleanPhone(phone); amount = parseInt(amount);
  if(amount < 1000) return res.status(400).json({success:false, error:'Minimum withdrawal is 1000 KES'});
  const bal = balances[phone]||0;
  if(bal < amount) return res.status(400).json({success:false, error:`Insufficient balance. You have ${bal} KES`, balance: bal});
  balances[phone] -= amount;
  try{
    const resp = await axios.post('https://api.lipwa.app/v1/b2c',{
      phone, amount, channel_id: process.env.LIPWA_CHANNEL_ID, external_id: 'WD'+Date.now(),
    },{ headers:{ 'Authorization': 'Bearer ' + process.env.LIPWA_API_KEY } });
    res.json({success:true, message:`${amount} KES sent to M-Pesa`, balance: balances[phone], data: resp.data});
  }catch(e){
    balances[phone]+=amount;
    res.status(400).json({success:false, error: e.response?.data || e.message, balance: bal});
  }
});

app.get('/', (req,res)=>res.send('WINFX live - Min 1000 KES'));
const PORT = process.env.PORT||3000;
app.listen(PORT, ()=>console.log('Live '+PORT));
