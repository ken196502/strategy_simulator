const WebSocket = require('ws');

console.log('🔌 连接 WebSocket...')
const ws = new WebSocket('ws://localhost:2314/ws');

ws.on('open', () => {
  console.log('✅ WebSocket 连接成功\n');
  
  // 1. Bootstrap
  console.log('📤 发送 bootstrap 消息...');
  ws.send(JSON.stringify({
    type: 'bootstrap',
    username: 'test_user'
  }));
  
  // 2. 订阅股票行情
  setTimeout(() => {
    console.log('\n📤 发送 subscribe_quotes (订阅 AAPL 和 00700)...');
    ws.send(JSON.stringify({
      type: 'subscribe_quotes',
      symbols: ['AAPL', '00700']
    }));
  }, 1000);
  
  // 5秒后关闭连接
  setTimeout(() => {
    console.log('\n👋 关闭连接');
    ws.close();
  }, 5000);
});

ws.on('message', (data) => {
  try {
    const message = JSON.parse(data.toString());
    console.log('\n📥 收到消息:');
    console.log('  类型:', message.type);
    
    if (message.type === 'market_data') {
      console.log('  行情数据:');
      if (message.quotes && message.quotes.length > 0) {
        message.quotes.forEach(quote => {
          console.log(`    - ${quote.symbol}: $${quote.price} (${quote.date})`);
        });
      } else {
        console.log('    (空)');
      }
    } else if (message.type === 'bootstrap_ok') {
      console.log('  用户:', message.user.username);
    } else if (message.type === 'error') {
      console.log('  ❌ 错误:', message.message);
    } else {
      console.log('  内容:', JSON.stringify(message, null, 2));
    }
  } catch (error) {
    console.error('解析消息失败:', error);
  }
});

ws.on('error', (error) => {
  console.error('❌ WebSocket 错误:', error.message);
});

ws.on('close', () => {
  console.log('\n🔌 WebSocket 连接已关闭');
  process.exit(0);
});
