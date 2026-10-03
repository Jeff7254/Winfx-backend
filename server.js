const express = require('express');
const axios = require('axios');
const cors = require('cors');
const app = express();
app.use(cors());
app.use(express.json());

app.post('/api/deposit', async (req, res) => {
  let { phone, amount } = req.body;
  phone = phone.replace(/\s+/g,'');
  if(phone.startsWith('0')) phone = '254' + phone.slice(1);
  if(phone.startsWith('+')) phone = phone.slice(1);
  try {
    const resp = await axios.post('https://api.lipwa.app/v1/stk-push',{
      phone: phone,
      amount: parseInt(amount),
      channel_id: process.env.LIPWA_CHANNEL_ID,
      external_id: 'WINFX'+Date.now(),
      callback_url: process.env.RENDER_EXTERNAL_URL + '/api/lipwa-callback'
    },{
      headers:{ 'Authorization': 'Bearer ' + process.env.LIPWA_API_KEY }
    });
    res.json({success:true, data: resp.data});
  } catch(e){
    res.status(400).json({success:false, error: e.response?.data || e.message});
  }
});

app.post('/api/lipwa-callback', (req,res)=>{
  console.log('Lipwa:', JSON.stringify(req.body));
  res.json({ok:true});
});

app.get('/', (req,res)=>res.send('WINFX live'));
const PORT = process.env.PORT || 3000;
app.listen(PORT, ()=>console.log('Live '+PORT));
