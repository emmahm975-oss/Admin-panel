require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const fetch = require('node-fetch');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const BOTS_FILE = path.join(__dirname, 'bots.json');

// ─── Helpers ───
function readBots() {
    if (!fs.existsSync(BOTS_FILE)) {
        fs.writeFileSync(BOTS_FILE, '[]', 'utf8');
        return [];
    }
    try {
        return JSON.parse(fs.readFileSync(BOTS_FILE, 'utf8'));
    } catch (e) {
        return [];
    }
}
function writeBots(bots) {
    fs.writeFileSync(BOTS_FILE, JSON.stringify(bots, null, 2), 'utf8');
}

async function sendToBot(bot, message) {
    try {
        const r = await fetch('https://api.telegram.org/bot' + bot.token + '/sendMessage', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: bot.chat,
                text: message,
                parse_mode: 'HTML'
            })
        });
        const data = await r.json();
        return {
            name: bot.name,
            ok: data.ok,
            error: data.ok ? null : (data.description || 'Unknown error')
        };
    } catch (err) {
        return { name: bot.name, ok: false, error: err.message };
    }
}

// ─── List bots ───
app.get('/api/bots', function (req, res) {
    try {
        const bots = readBots();
        res.json({
            ok: true,
            bots: bots.map((b, i) => ({
                index: i,
                name: b.name,
                chat: b.chat
            }))
        });
    } catch (e) {
        res.json({ ok: false, bots: [], error: e.message });
    }
});

// ─── Add bot ───
app.post('/api/add-bot', function (req, res) {
    const { name, token, chat } = req.body;

    if (!name || !token || !chat) {
        return res.status(400).json({ ok: false, error: 'All fields required' });
    }
    if (!token.includes(':')) {
        return res.status(400).json({ ok: false, error: 'Token format looks wrong' });
    }

    try {
        const bots = readBots();
        // Check for duplicate token
        if (bots.some(b => b.token === token)) {
            return res.status(400).json({ ok: false, error: 'This token already exists' });
        }
        bots.push({ name: name.trim(), token: token.trim(), chat: chat.trim() });
        writeBots(bots);
        res.json({ ok: true });
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

// ─── Remove bot ───
app.post('/api/remove-bot', function (req, res) {
    const { index } = req.body;
    try {
        const bots = readBots();
        if (index < 0 || index >= bots.length) {
            return res.status(400).json({ ok: false, error: 'Invalid index' });
        }
        bots.splice(index, 1);
        writeBots(bots);
        res.json({ ok: true });
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

// ─── Send to ONE bot ───
app.post('/api/send-one', async function (req, res) {
    const { index, message } = req.body;
    if (!message || !message.trim()) {
        return res.status(400).json({ ok: false, error: 'Empty message' });
    }
    try {
        const bots = readBots();
        if (index < 0 || index >= bots.length) {
            return res.status(400).json({ ok: false, error: 'Invalid bot index' });
        }
        const result = await sendToBot(bots[index], message);
        res.json({ ok: true, result });
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

// ─── Broadcast to ALL ───
app.post('/api/broadcast', async function (req, res) {
    const { message } = req.body;
    if (!message || !message.trim()) {
        return res.status(400).json({ ok: false, error: 'Empty message' });
    }

    let bots;
    try {
        bots = readBots();
    } catch (e) {
        return res.status(500).json({ ok: false, error: 'bots.json unreadable: ' + e.message });
    }

    const results = [];
    for (const bot of bots) {
        const r = await sendToBot(bot, message);
        results.push(r);
    }
    res.json({ ok: true, results });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, '0.0.0.0', function () {
    console.log('📢 Admin Panel running at port ' + PORT);
});