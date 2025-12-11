// public/script.js

const socket = io();

// --- ตัวแปร Global ---
let myUsername = ""; 
let myId = null;     

// --- เชื่อมต่อ Socket ---
socket.on('connect', () => {
    myId = socket.id;
    console.log('Connected to server:', myId);
});

// =========================================
// 1. ส่วน Login & Validation
// =========================================

function clearError(inputId, errorId) {
    const input = document.getElementById(inputId);
    const errorText = document.getElementById(errorId);
    if(input) input.classList.remove('input-error');
    if(errorText) errorText.style.display = 'none';
}

['username', 'roomname', 'roompass'].forEach(id => {
    const el = document.getElementById(id);
    if(el) {
        el.addEventListener('input', () => clearError(id, `error-${id}`));
        el.addEventListener('keypress', (e) => {
            if(e.key === 'Enter') joinRoom();
        });
    }
});

function joinRoom() {
    const usernameInput = document.getElementById('username');
    const roomnameInput = document.getElementById('roomname');
    const passwordInput = document.getElementById('roompass');

    let isValid = true;

    if (!usernameInput.value.trim()) {
        usernameInput.classList.add('input-error');
        document.getElementById('error-username').style.display = 'block';
        isValid = false;
    }
    if (!roomnameInput.value.trim()) {
        roomnameInput.classList.add('input-error');
        document.getElementById('error-roomname').style.display = 'block';
        isValid = false;
    }

    if (isValid) {
        socket.emit('joinRoom', { 
            username: usernameInput.value.trim(), 
            roomname: roomnameInput.value.trim(), 
            password: passwordInput.value 
        });
    }
}

socket.on('errorMsg', (msg) => {
    if (msg.includes('รหัสผ่าน')) {
        const passInput = document.getElementById('roompass');
        const errText = document.getElementById('error-password');
        passInput.classList.add('input-error');
        errText.innerText = msg;
        errText.style.display = 'block';
        passInput.value = ''; 
        passInput.focus();
    } else {
        alert(msg);
    }
});

// =========================================
// 2. ส่วน Chat Logic
// =========================================

socket.on('joinSuccess', (data) => {
    myUsername = data.myUsername; 
    document.getElementById('login-screen').classList.add('hidden');
    document.getElementById('chat-screen').classList.remove('hidden');
    document.getElementById('room-title').innerText = `Room: ${data.roomname}`;
    document.getElementById('modal-room-name').innerText = data.roomname;
    document.getElementById('modal-room-pass').innerText = data.password ? data.password : "ไม่มี (สาธารณะ)";

    const chatBox = document.getElementById('chat-box');
    chatBox.innerHTML = ''; 
    if(data.history) {
        data.history.forEach(msg => {
            renderMessage(msg);
        });
    }
});

function sendMessage() {
    const input = document.getElementById('msg-input');
    const text = input.value.trim();
    if(text) {
        socket.emit('chatMessage', { text: text, type: 'normal' });
        input.value = '';
        input.focus();
    }
}

document.getElementById('msg-input').addEventListener('keypress', (e) => {
    if(e.key === 'Enter') sendMessage();
});

// =========================================
// 3. ส่วน Multimedia
// =========================================

function sendImage() {
    const fileInput = document.getElementById('file-input');
    const file = fileInput.files[0];
    if(file) {
        if(file.size > 5 * 1024 * 1024) { 
            alert('ไฟล์รูปใหญ่เกินไป (Max 5MB)');
            return;
        }
        const reader = new FileReader();
        reader.onload = function(e) {
            socket.emit('chatMessage', { text: e.target.result, type: 'image' });
        };
        reader.readAsDataURL(file);
        fileInput.value = ''; 
    }
}

function openCodeModal() { document.getElementById('code-modal').classList.remove('hidden'); }
function closeCodeModal() { document.getElementById('code-modal').classList.add('hidden'); }

function sendCode() {
    const codeArea = document.getElementById('code-area');
    const code = codeArea.value;
    if(code.trim()) {
        socket.emit('chatMessage', { text: code, type: 'code' });
        codeArea.value = '';
        closeCodeModal();
    }
}

function copyCode(btn) {
    const codeBlock = btn.parentElement; 
    const codeText = codeBlock.firstChild.textContent; 
    
    navigator.clipboard.writeText(codeText).then(() => {
        const originalText = btn.innerText;
        btn.innerText = 'Copied!';
        setTimeout(() => btn.innerText = originalText, 1500);
    });
}

// =========================================
// 4. ส่วน Render Message
// =========================================

socket.on('message', (msg) => {
    renderMessage(msg);
});

function renderMessage(msg) {
    const chatBox = document.getElementById('chat-box');
    const div = document.createElement('div');
    
    const msgDate = msg.rawTime ? new Date(msg.rawTime) : new Date();
    const now = new Date();
    
    const isSameDay = msgDate.getDate() === now.getDate() &&
                      msgDate.getMonth() === now.getMonth() &&
                      msgDate.getFullYear() === now.getFullYear();

    const timeString = msgDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
    const dateString = msgDate.toLocaleDateString('en-GB'); 

    let displayTime = isSameDay ? timeString : `${dateString}\n${timeString}`;

    if(msg.type === 'system') {
        div.className = 'message system-message';
        div.innerHTML = `${msg.text} <div class="system-time">${displayTime.replace('\n', ' ')}</div>`;
    } else {
        const isMe = (msg.username === myUsername);
        div.className = `message ${isMe ? 'my-message' : 'other-message'}`;
        
        let contentHtml = '';
        if(!isMe) contentHtml += `<div class="sender-name">${msg.username}</div>`;

        if(msg.type === 'image') {
            contentHtml += `<img src="${msg.text}" class="chat-image" onclick="window.open(this.src)">`;
        } else if(msg.type === 'code') {
            contentHtml += `<div class="code-block">${escapeHtml(msg.text)} <button class="copy-btn" onclick="copyCode(this)">Copy</button></div>`;
        } else {
            contentHtml += escapeHtml(msg.text); 
        }
        contentHtml += `<span class="message-time">${displayTime}</span>`;
        div.innerHTML = contentHtml;
    }

    chatBox.appendChild(div);
    chatBox.scrollTop = chatBox.scrollHeight; 
}

function escapeHtml(text) {
    if (!text) return text;
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

// =========================================
// 5. ส่วน Settings & Host Action
// =========================================

function toggleSettings() {
    const modal = document.getElementById('settings-modal');
    modal.classList.toggle('hidden');
}

function leaveRoom() {
    if(confirm('ต้องการออกจากห้องใช่ไหม?')) location.reload(); 
}

socket.on('updateRoomInfo', (info) => {
    document.getElementById('member-count').innerText = info.users.length;
    document.getElementById('modal-room-name').innerText = info.roomname;
    document.getElementById('modal-room-pass').innerText = info.password ? info.password : "ไม่มี (สาธารณะ)";

    const list = document.getElementById('user-list');
    list.innerHTML = '';
    
    const amIHost = (info.hostId === myId);
    const hostControls = document.getElementById('host-controls');
    const editPassBtn = document.getElementById('btn-edit-pass');
    
    if(amIHost) {
        hostControls.classList.remove('hidden');
        editPassBtn.classList.remove('hidden');
    } else {
        hostControls.classList.add('hidden');
        editPassBtn.classList.add('hidden');
    }

    info.users.forEach(u => {
        const isThisUserHost = (u.id === info.hostId);
        const isMe = (u.id === myId);

        let itemHtml = `<div class="user-list-item">
            <span>${u.username} ${isThisUserHost ? '👑' : ''} ${isMe ? '(You)' : ''}</span>
            <div>`;
        
        if(amIHost && !isMe) {
            itemHtml += `<button class="action-btn btn-promote" onclick="promoteUser('${u.id}')">Give Owner</button>`;
            itemHtml += `<button class="action-btn btn-kick" onclick="kickUser('${u.id}')">Kick</button>`;
        }
        itemHtml += `</div></div>`;
        list.innerHTML += itemHtml;
    });
});

function kickUser(id) { if(confirm('ต้องการสมาชิกคนนี้?')) socket.emit('kickUser', id); }
function promoteUser(id) { if(confirm('ยกตำแหน่งหัวหน้าห้องให้คนนี้?')) socket.emit('promoteUser', id); }
function deleteRoom() { if(confirm('คำเตือน: ลบห้องจะทำให้ทุกคนหลุดออกจากห้องทันที! ยืนยันไหม?')) socket.emit('deleteRoom'); }

socket.on('kicked', () => { alert('คุณถูกเตะออกจากห้อง!'); location.reload(); });
socket.on('roomDeleted', () => { alert('ห้องแชทถูกลบโดยหัวหน้าห้อง'); location.reload(); });

// --- Password & Copy ---
function copyToClipboard(elementId) {
    const el = document.getElementById(elementId);
    let text = el.innerText;
    if(text === "ไม่มี (สาธารณะ)") text = "";

    navigator.clipboard.writeText(text).then(() => {
        const icon = el.nextElementSibling; 
        const originalClass = icon.className;
        icon.className = "fas fa-check copy-icon"; 
        icon.style.color = "#28a745";
        setTimeout(() => {
            icon.className = originalClass; 
            icon.style.color = "";
        }, 1500);
    }).catch(err => {
        console.error('Copy failed', err);
        alert('คัดลอกไม่สำเร็จ');
    });
}

function togglePassEdit() {
    const editArea = document.getElementById('edit-pass-area');
    const input = document.getElementById('new-pass-input');
    if (editArea.classList.contains('hidden')) {
        editArea.classList.remove('hidden');
        input.focus(); 
    } else {
        editArea.classList.add('hidden');
        input.value = ''; 
    }
}

function savePassword() {
    const newPass = document.getElementById('new-pass-input').value.trim();
    if(confirm(newPass ? `ยืนยันตั้งรหัสผ่านใหม่เป็น "${newPass}" ?` : 'ยืนยันปลดล็อคห้องเป็นสาธารณะ?')) {
        socket.emit('updatePassword', newPass);
        togglePassEdit(); 
    }
}

// =========================================
// 6. Security: Block F12 & Right Click
// =========================================

// ห้ามคลิกขวา
document.addEventListener('contextmenu', event => event.preventDefault());

// ห้ามกดปุ่มลัด (F12, Ctrl+Shift+I, Ctrl+U)
document.onkeydown = function(e) {
    if (e.keyCode == 123) { // F12
        return false;
    }
    if (e.ctrlKey && e.shiftKey && e.keyCode == 'I'.charCodeAt(0)) { // Ctrl+Shift+I
        return false;
    }
    if (e.ctrlKey && e.shiftKey && e.keyCode == 'C'.charCodeAt(0)) { // Ctrl+Shift+C
        return false;
    }
    if (e.ctrlKey && e.shiftKey && e.keyCode == 'J'.charCodeAt(0)) { // Ctrl+Shift+J
        return false;
    }
    if (e.ctrlKey && e.keyCode == 'U'.charCodeAt(0)) { // Ctrl+U (View Source)
        return false;
    }
}