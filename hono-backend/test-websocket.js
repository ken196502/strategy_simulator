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
  
  // 2. 等待2秒后下单，触发行情推送
  setTimeout(() => {
    console.log('\n📤 发送下单请求 (买入AAPL)...');
    ws.send(JSON.stringify({
      type: 'place_order',
      symbol: 'AAPL',
      name: 'Apple Inc',
      market: 'US',
      side: 'BUY',
      order_type: 'MARKET',
      quantity: 10
    }));
  }, 2000);
  
  // 3. 6秒后请求快照（测试5秒限流）
  setTimeout(() => {
    console.log('\n📤 发送 get_snapshot 请求 (应该被限流跳过)...');
    ws.send(JSON.stringify({
      type: 'get_snapshot'
    }));
  }, 3000);
  
  // 4. 8秒后再次请求快照（超过5秒，应该推送）
  setTimeout(() => {
    console.log('\n📤 发送 get_snapshot 请求 (超过5秒，应该推送)...');
    ws.send(JSON.stringify({
      type: 'get_snapshot'
    }));
  }, 8000);
  
  // 10秒后关闭连接
  setTimeout(() => {
    console.log('\n👋 关闭连接');
    ws.close();
  }, 10000);
});

ws.on('message', (data) => {
  try {
    const message = JSON.parse(data.toString());
    console.log('\n📥 收到消息:');
    console.log('  类型:', message.type);
    
    if (message.type === 'market_data') {
      console.log('  行情数据:');
      message.quotes.forEach(quote => {
        console.log(`    - ${quote.symbol}: $${quote.price} (${quote.date})`);
      });
    } else if (message.type === 'bootstrap_ok') {
      console.log('  用户:', message.user.username);
    } else if (message.type === 'error') {
      console.log('  错误:', message.message);
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
