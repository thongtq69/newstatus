const express = require('express');
const fs = require('fs');
const { spawn } = require('child_process');
const app = express();
const port = 3000;

app.use(express.json());
app.use(express.static('public'));

app.get('/api/config', (req, res) => {
    const config = JSON.parse(fs.readFileSync('config.json', 'utf8'));
    res.json(config);
});

app.post('/api/config', (req, res) => {
    fs.writeFileSync('config.json', JSON.stringify(req.body, null, 2));
    res.json({ message: 'Đã lưu cấu hình!' });
});

app.post('/api/run', (req, res) => {
    // Chạy trong process riêng để không làm treo server
    spawn('node', ['index.js'], { detached: true, stdio: 'inherit' });
    res.json({ message: 'Script đang chạy! Hãy kiểm tra Terminal để theo dõi.' });
});

app.listen(port, () => {
    console.log(`\n🚀 UI Config đang chạy tại: http://localhost:${port}\n`);
});
