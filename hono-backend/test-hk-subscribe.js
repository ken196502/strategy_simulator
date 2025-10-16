const WebSocket = require('ws');

console.log('🔌 测试港股订阅...')
const ws = new WebSocket('ws://localhost:2314/ws');

ws.on('open', () => {
  console.log('✅ WebSocket 连接成功\n');
  
  ws.send(JSON.stringify({
    type: 'bootstrap',
    username: 'hk_test_user'
  }));
  
  setTimeout(() => {
    console.log('📤 订阅港股: 00127.HK, 00700.HK');
    ws.send(JSON.stringify({
      type: 'subscribe_quotes',
      symbols: ['00127.HK', '00700.HK']
    }));
  }, 1000);
  
  setTimeout(() => ws.close(), 4000);
});

ws.on('message', (data) => {
  const msg = JSON.parse(data.toString());
  console.log(`\n📥 ${msg.type}:`, msg.type === 'market_data' ? 
    (msg.quotes || []).map(q => `${q.symbol}=$${q.price}`).join(', ') || '(空)' : 
    msg.message || JSON.stringify(msg).slice(0, 50));
});

ws.on('close', () => {
  console.log('\n🔌 连接关闭');
  process.exit(0);
});
