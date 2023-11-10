const express = require('express');
const { createServer } = require('node:http');
const crypto = require('crypto');
const multer  = require('multer');
const { createClient } = require('redis');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('node:path');

const app = express();
app.use(cors());
const server = createServer(app);
const upload = multer();
const port = 3000;
app.use(express.urlencoded({extended: true}));
app.use(express.json());
const io = new Server(server, {
    cors: {
        origin: "*"
    }
})



require('dotenv').config();

const client = createClient({
    url: process.env.REDIS_URL
});
client.on('error', (err) => {
    console.error('Redis Client Error', err);
});
client.connect();


const AT_DOMAIN_NAME = "@mailproject.fredy.dev";

app.use(express.static(path.join(__dirname, 'public')));

io.on('connection', (socket) => {
    // console.log('a user connected');
    socket.on('joinRoom', (room) => {
        socket.join(room);
    });
    socket.on('disconnect', ()=>{
        // console.log('user disconnected');
    });
});

app.post('/newaddress', async (req, res) => {
    const uniqueId = crypto.randomBytes(6).toString('hex');
    const emailAddress = `${uniqueId}${AT_DOMAIN_NAME}`;
    // EX: SECONDS * MINUTES
    await client.set(emailAddress, JSON.stringify([]), { EX: 60 * 10 });
    // await client.expire(emailAddress, 600);
    res.json({ emailAddress: emailAddress });
});

app.post('/email', upload.none(), async (req, res) => {
    const { from, to, subject, text } = req.body;
    try {
        const emailsJson = await client.get(to);
        if (emailsJson) {
            const emails = JSON.parse(emailsJson);
            const newEmail = { from, subject, text, receivedAt: new Date().toISOString() };
            emails.push(newEmail);

            const ttl = await client.ttl(to);
            // console.log('1', typeof ttl, ttl);
            // if ttl is -1 or -2, the key does not exist or has no associated expire
            if (ttl > 0) {
                // console.log('b-1');
                const res = await client.set(to, JSON.stringify(emails), { EX: ttl });
                // console.log('res1', res);
            } else {
                // console.log('b-2');
                const res2 = await client.set(to, JSON.stringify(emails), { EX: 60 * 10 });
                // console.log('res2', res2);
            }

            io.to(to).emit('newEmail', { email: newEmail });
        }
    } catch (error) {
        console.log(error);
    }
  
    return res.status(200).send();
});
app.get('/emails', async (req, res) => {
    const { email } = req.query;
    if (!email) {
        return res.status(400).json({ error: "Email address is required" });
    }

    try {
        const emailsJson = await client.get(email);
        if (emailsJson) {
            const emails = JSON.parse(emailsJson);
            res.json(emails);
        } else {
            // console.log(2, emailsJson);
            res.json({message: 'address is expired'});
        }
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Internal server error" });
    }
});

server.listen(port, () => {
    // console.log(`Example app listening at http://localhost:${port}`);
});
