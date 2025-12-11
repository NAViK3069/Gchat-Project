const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    maxHttpBufferSize: 5e6 // 5MB
});

app.use(express.static(path.join(__dirname, 'public')));

// Data Structure
let rooms = {}; 
let users = {};

// Security: ตัวแปรเก็บเวลาส่งล่าสุดของแต่ละคน (กัน Spam)
let lastMsgTime = {}; 

io.on('connection', (socket) => {
    
    // 1. Join Room
    socket.on('joinRoom', ({ username, roomname, password }) => {
        // Create Room logic
        if (!rooms[roomname]) {
            rooms[roomname] = { 
                password: password || null, 
                hostId: socket.id, 
                users: [],
                messages: []
            };
        } else {
            // Check Password
            if (rooms[roomname].password && rooms[roomname].password !== password) {
                socket.emit('errorMsg', 'รหัสผ่านผิด!');
                return;
            }
        }

        const room = rooms[roomname];

        // --- Logic Mark-2 ---
        let finalName = username;
        let counter = 2;
        while (room.users.some(u => u.username === finalName)) {
            finalName = `${username}-${counter}`;
            counter++;
        }

        // Join
        users[socket.id] = { username: finalName, room: roomname };
        room.users.push({ id: socket.id, username: finalName });
        socket.join(roomname);

        // Send Success
        socket.emit('joinSuccess', { 
            myUsername: finalName,
            roomname, 
            isHost: room.hostId === socket.id,
            password: room.password,
            history: room.messages
        });

        io.to(roomname).emit('message', { type: 'system', text: `${finalName} เข้าห้องแล้ว` });
        updateRoomDetails(roomname);
    });

    // 2. Chat / Image / Code (เพิ่ม Security ตรงนี้)
    socket.on('chatMessage', (data) => {
        const user = users[socket.id];
        
        // --- Security Check: Rate Limit ---
        const now = Date.now();
        const lastTime = lastMsgTime[socket.id] || 0;
        
        // ถ้าส่งเร็วกว่า 500ms (ครึ่งวินาที) ให้หยุดทำงาน
        if (now - lastTime < 500) {
            return; 
        }
        
        // อัปเดตเวลาล่าสุด
        lastMsgTime[socket.id] = now;
        // ----------------------------------

        if (user && rooms[user.room]) {
            const timestamp = new Date();
            const msgPayload = {
                type: data.type || 'normal',
                username: user.username, // ใช้ชื่อจาก Server เท่านั้น (กันการปลอมตัว)
                text: data.text,
                rawTime: timestamp.toISOString()
            };

            const room = rooms[user.room];
            room.messages.push(msgPayload);
            if (room.messages.length > 20) room.messages.shift();

            io.to(user.room).emit('message', msgPayload);
        }
    });

    // 3. Kick User
    socket.on('kickUser', (id) => {
        const requester = users[socket.id];
        const room = rooms[requester?.room];
        if (room && room.hostId === socket.id) {
            io.to(id).emit('kicked');
            io.sockets.sockets.get(id)?.disconnect(true);
        }
    });
    
    // 4. Promote User
    socket.on('promoteUser', (id) => {
         const requester = users[socket.id];
         const room = rooms[requester?.room];
         if (room && room.hostId === socket.id) {
             room.hostId = id; 
             updateRoomDetails(requester.room);
         }
    });

    // 5. Delete Room
    socket.on('deleteRoom', () => {
        const requester = users[socket.id];
        const roomName = requester?.room;
        if (rooms[roomName] && rooms[roomName].hostId === socket.id) {
            io.to(roomName).emit('roomDeleted');
            io.in(roomName).disconnectSockets();
            delete rooms[roomName];
        }
    });

    // 6. Update Password
    socket.on('updatePassword', (newPassword) => {
        const requester = users[socket.id];
        const roomName = requester?.room;
        const room = rooms[roomName];

        if (room && room.hostId === socket.id) {
            room.password = newPassword ? newPassword : null;
            updateRoomDetails(roomName); 
            
            const statusText = room.password ? 'ล็อครหัสผ่านแล้ว' : 'ปลดล็อคเป็นสาธารณะแล้ว';
            io.to(roomName).emit('message', {
                type: 'system',
                text: `การตั้งค่าห้องเปลี่ยน: ${statusText}`,
                rawTime: new Date().toISOString()
            });
        }
    });

    // 7. Disconnect
    socket.on('disconnect', () => {
        // ล้างข้อมูล Security เมื่อคนออก
        delete lastMsgTime[socket.id];

        const user = users[socket.id];
        if (user) {
            const roomName = user.room;
            const room = rooms[roomName];
            if (room) {
                room.users = room.users.filter(u => u.id !== socket.id);
                io.to(roomName).emit('message', { type: 'system', text: `${user.username} ออกจากห้อง` });
                
                if (room.hostId === socket.id) {
                    if (room.users.length > 0) room.hostId = room.users[0].id;
                    else delete rooms[roomName];
                }
                
                if(rooms[roomName]) updateRoomDetails(roomName);
            }
            delete users[socket.id];
        }
    });

    function updateRoomDetails(roomName) {
        if(rooms[roomName]) {
            io.to(roomName).emit('updateRoomInfo', {
                roomname: roomName,
                users: rooms[roomName].users,
                hostId: rooms[roomName].hostId,
                password: rooms[roomName].password
            });
        }
    }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on ${PORT}`));