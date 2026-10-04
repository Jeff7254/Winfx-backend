let lipwaRes;
let lastError;
for (let i = 0; i < 3; i++) {
  try {
    lipwaRes = await fetch('https://api.lipwa.app/v1/stk-push', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.LIPWA_API_KEY}`
      },
      body: JSON.stringify({
        amount: amount,
        phone: phone,
        channel_id: process.env.LIPWA_CHANNEL_ID,
        callback_url: process.env.RENDER_EXTERNAL_URL + '/api/lipwa-callback',
        external_id: Date.now().toString()
      })
    });
    break;
  } catch (e) {
    lastError = e;
    await new Promise(r => setTimeout(r, 2000));
  }
}
if (!lipwaRes) throw lastError;
