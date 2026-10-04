const express = require('express');
const dns = require('dns');
const axios = require('axios');
const cors = require('cors');
const https = require('https');

const app = express();
app.use(cors());
app.use(express.json());

// FIX FOR RENDER DNS - FORCE IPV4 + GOOGLE DNS
dns.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1']);
dns.setDefaultResultOrder('ipv4first');

// Custom lookup that resolves via Google DNS first
const customLookup = (hostname, opts, cb) => {
  if (typeof opts === 'function') {
    cb = opts;
    opts = {};
  }
  dns.resolve4(hostname, { ttl: false }, (err, addrs) => {
    if (err ||!addrs ||!addrs.length) {
      // fallback to normal lookup
      return dns.lookup(hostname, opts, cb);
    }
    // use first resolved IP
    return dns.lookup(addrs[0], opts, (e, address, family) => {
      if (e) return cb(e);
      // trick axios to keep hostname for TLS SNI
      return cb(null, address, family);
    });
  });
};

const httpsAgent = new https.Agent({
  lookup: customLookup,
  family: 4,
  keepAlive: true
});

let balances = {};

const cleanPhone = (p) => {
  let s = (p || '').toString().replace(/\D/g, '');
  if (s.startsWith('0')) s = '254' + s.slice(1);
  if (s.startsWith('7')) s = '254' + s;
  if (s.length === 9) s = '254' + s;
  return s;
};

app.get('/', (req, res) => res.send('WINFX254 Live - Fixed DNS'));

app.post('/api/deposit', async (req, res) => {
  let { phone, amount } = req.body;
  phone = cleanPhone(phone);
  amount = parseInt(amount);

  if (!phone ||!amount) return res.status(400).json({ success: false, error: 'Phone and amount required' });
  if (amount < 10) return res.status(400).json({ success: false, error: 'Min 10 KES' });

  // Try both domains with retry
  const domains = [
    'https://api.lipwa.co.ke/v1/stk-push',
    'https://api.lipwa.app/v1/stk-push'
  ];

  let lastErr = null;

  for (let url of domains) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        console.log(`Trying STK to ${phone} via ${url} attempt ${attempt+1}`);
        const resp = await axios.post(url, {
          phone,
          amount,
          channel_id: process.env.LIPWA_CHANNEL_ID,
          external_id: 'DEP' + Date.now(),
          callback_url: (process.env.RENDER_EXTERNAL_URL || 'https://winfx-backend.onrender.com') + '/api/lipwa-callback'
        }, {
          headers: {
            'Authorization': 'Bearer ' + process.env.LIPWA_API_KEY,
            'Content-Type': 'application/json'
          },
          httpsAgent,
          timeout: 25000,
          family: 4
        });

        console.log('STK SUCCESS', resp.data);
        return res.json({ success: true, message: 'STK sent', data: resp.data });

      } catch (e) {
        lastErr = e;
        console.log(`Failed ${url}:`, e.response?.data || e.message);
        await new Promise(r => setTimeout(r, 1500));
      }
    }
  }

  res.status(400).json({
    success: false,
    error: lastErr?.response?.data?.message || lastErr?.response?.data || lastErr?.message || 'Failed to reach Lipwa'
  });
});

app.post('/api/lipwa-callback', (req, res) => {
  const d = req.body;
  console.log('Callback received:', JSON.stringify(d));
  const phone = cleanPhone(d.phone || d.msisdn || d.customer_phone || '');
  const amount = parseInt(d.amount || d.value || 0);
  const status = (d.status || d.result || '').toString().toUpperCase();

  if (phone && amount && (status === 'SUCCESS' || status === 'COMPLETED' || d.success === true)) {
    balances[phone] = (balances[phone] || 0) + amount;
    console.log(`Credited ${amount} to ${phone} new bal ${balances[phone]}`);
  }
  res.json({ received: true });
});

app.get('/api/balance/:phone', (req, res) => {
  const phone = cleanPhone(req.params.phone);
  res.json({ balance: balances[phone] || 0 });
});

app.post('/api/trade', (req, res) => {
  let { phone } = req.body;
  phone = cleanPhone(phone);
  if ((balances[phone] || 0) < 10) return res.status(400).json({ success: false, error: 'Low balance' });
  balances[phone] -= 10;
  const win = Math.random() < 0.45;
  if (win) balances[phone] += 19;
  res.json({ success: true, win, balance: balances[phone] });
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log('Running on ' + PORT));
