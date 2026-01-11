const axios = require('axios');

// 测试 Gemini API 调用
async function testGemini() {
  console.log('测试 Gemini API 调用...');
  
  try {
    const response = await axios.post('http://localhost:3000/api/chat', {
      prompt: '你好，Gemini！',
      platform: 'gemini',
      model: 'gemini-2.5-flash'
    }, {
      responseType: 'stream'
    });
    
    console.log('Gemini API 调用成功，正在接收流数据...');
    
    // 处理流数据
    let fullResponse = '';
    response.data.on('data', (chunk) => {
      const content = chunk.toString();
      fullResponse += content;
      process.stdout.write(content);
    });
    
    response.data.on('end', () => {
      console.log('\n\n流数据接收完成！');
      console.log('完整响应:', fullResponse);
    });
    
  } catch (error) {
    console.error('Gemini API 调用失败:', error.message);
    if (error.response) {
      console.error('状态码:', error.response.status);
      console.error('响应数据:', error.response.data);
    }
  }
}

// 运行测试
testGemini();