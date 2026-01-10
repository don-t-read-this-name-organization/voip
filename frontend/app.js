const API_BASE = 'http://192.168.100.61:5000/api';

let appState = {
    userId: null,
    username: null,
    currentCallId: null,
    currentCallPartner: null,
    isMuted: false,
    isOnHold: false,
    callStartTime: null,
    callDuration: 0,
    localStream: null,
    peerConnection: null,
};

document.addEventListener('DOMContentLoaded', async () => {
    await initializeUser();
    await loadUsers();
    setupEventListeners();
    setupAudioVisualization();
    
    setInterval(loadUsers, 5000);
    setInterval(updateCallTimer, 1000);
    setInterval(checkForIncomingCalls, 2000);
    setInterval(checkCallAcceptance, 500); // Poll every 500ms for faster detection
    setInterval(checkIfCallEnded, 1000); // Poll to detect if other party hung up
    setInterval(sendHeartbeat, 3000); // Send heartbeat every 3 seconds
});

window.addEventListener('beforeunload', async () => {
    if (appState.userId) {
        try {
            // End call if one is active
            if (appState.currentCallId) {
                await fetch(`${API_BASE}/signal/end`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        message_type: 'end',
                        user_id: appState.userId,
                        call_id: appState.currentCallId
                    })
                });
            }
            
            // Disconnect user
            await fetch(`${API_BASE}/users/disconnect`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user_id: appState.userId })
            });
        } catch (error) {
        }
    }
});

async function initializeUser() {
    const username = prompt('Enter your name:', 'User_' + Math.floor(Math.random() * 1000));
    
    if (!username) {
        alert('Username required!');
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE}/users/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username })
        });
        
        const data = await response.json();
        appState.userId = data.user_id;
        appState.username = data.username;
        
        document.getElementById('user-info').textContent = `Connected as: ${appState.username}`;
    } catch (error) {
        alert(`Failed to connect to server!\n\nAPI URL: ${API_BASE}\nError: ${error.message}`);
    }
}

async function loadUsers() {
    try {
        const response = await fetch(`${API_BASE}/users/list`);
        const data = await response.json();
        
        const users = data.users.filter(u => u.id !== appState.userId);
        renderUsersList(users);
        updateUserSelect(users);
    } catch (error) {
    }
}

function renderUsersList(users) {
    const usersList = document.getElementById('users-list');
    
    if (users.length === 0) {
        usersList.innerHTML = '<p class="placeholder">No other users available</p>';
        return;
    }
    
    usersList.innerHTML = users.map(user => {
        const isCurrentUser = appState.currentCallPartner === user.id;
        const isOffline = user.status === 'offline';
        const currentUserStatus = appState.callStartTime ? 'in-call' : appState.currentCallId ? 'calling' : 'idle';
        const userIsBusy = user.status === 'calling' || user.status === 'in-call' || user.status === 'on-hold';
        
        let buttonHtml = '';
        
        if (isOffline) {
            // Offline users have no buttons
            buttonHtml = '';
        } else if (isCurrentUser) {
            // The other party in current call - show hang up button
            buttonHtml = `<button class="btn btn-danger user-hangup-btn" data-user-id="${user.id}">Hang Up</button>`;
        } else if (currentUserStatus !== 'idle') {
            // Current user is in a call - show busy with block button for other users
            buttonHtml = `
                <span class="user-busy">Busy</span>
                <button class="btn btn-secondary user-reject-btn" data-user-id="${user.id}">Block</button>
            `;
        } else if (userIsBusy) {
            // Other user is busy (calling/in-call/on-hold) - show busy with block button
            buttonHtml = `
                <span class="user-busy">Busy</span>
                <button class="btn btn-secondary user-reject-btn" data-user-id="${user.id}">Block</button>
            `;
        } else if (user.status === 'idle') {
            // Only show call button if user is truly IDLE - not engaged in any call
            buttonHtml = `
                <button class="btn btn-success user-accept-btn" data-user-id="${user.id}">Call</button>
                <button class="btn btn-secondary user-reject-btn" data-user-id="${user.id}">Block</button>
            `;
        } else {
            // Fallback - no buttons
            buttonHtml = '';
        }
        
        return `
            <div class="user-item ${isOffline ? 'offline' : ''} ${isCurrentUser ? 'in-call' : ''}">
                <div class="user-info-section">
                    <span class="user-name">${user.username}</span>
                    <span class="user-status ${user.status}"></span>
                </div>
                <div class="user-status-right">
                    <span class="user-status-text">${user.status.toUpperCase()}</span>
                </div>
                <div class="user-item-actions">
                    ${buttonHtml}
                </div>
            </div>
        `;
    }).join('');
}

function updateUserSelect(users) {
    const select = document.getElementById('target-user');
    const currentValue = select.value;
    
    select.innerHTML = '<option value="">-- Select a user --</option>';
    users.forEach(user => {
        const option = document.createElement('option');
        option.value = user.id;
        option.textContent = `${user.username} (${user.status})`;
        select.appendChild(option);
    });
    
    select.value = currentValue;
}

async function initiateCall(targetId, isIpCall = false) {
    if (!appState.userId) {
        alert('Please register first!');
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE}/signal/initiate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                message_type: 'initiate',
                user_id: appState.userId,
                target_user_id: targetId,
                ip_address: isIpCall ? targetId : null
            })
        });
        
        const data = await response.json();
        
        if (data.status === 'success') {
            appState.currentCallId = data.call_id;
            appState.currentCallPartner = targetId;
            
            updateStatus('calling');
            showCallControls();
            requestAudioPermission();
        }
    } catch (error) {
        alert('Failed to initiate call');
    }
}

async function acceptCall() {
    if (!appState.currentCallId) return;
    
    try {
        const response = await fetch(`${API_BASE}/signal/accept`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                message_type: 'accept',
                user_id: appState.userId,
                call_id: appState.currentCallId
            })
        });
        
        const data = await response.json();
        
        if (data.status === 'success') {
            appState.callStartTime = Date.now();
            updateStatus('in-call');
            showCallControls();
            document.getElementById('call-modal').classList.add('hidden');
            document.getElementById('current-call-info').classList.remove('hidden');
            requestAudioPermission();
            console.log('✅ Call accepted locally, timer started');
        }
    } catch (error) {
        console.log('acceptCall error:', error);
    }
}

async function rejectCall() {
    if (!appState.currentCallId) return;
    
    try {
        const response = await fetch(`${API_BASE}/signal/reject`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                message_type: 'reject',
                user_id: appState.userId,
                call_id: appState.currentCallId
            })
        });
        
        if (response.ok) {
            endCallCleanup();
            await loadUsers();
        }
    } catch (error) {
    }
}

async function endCall() {
    if (!appState.currentCallId) return;
    
    try {
        const response = await fetch(`${API_BASE}/signal/end`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                message_type: 'end',
                user_id: appState.userId,
                call_id: appState.currentCallId
            })
        });
        
        if (response.ok) {
            const data = await response.json();
            if (data.status === 'success') {
                endCallCleanup();
                await loadUsers();
            }
        } else {
            console.error('Failed to end call');
        }
    } catch (error) {
        console.error('Error ending call:', error);
    }
}

async function holdCall() {
    if (!appState.currentCallId) return;
    
    appState.isOnHold = !appState.isOnHold;
    
    try {
        const endpoint = appState.isOnHold ? '/signal/hold' : '/signal/resume';
        const response = await fetch(`${API_BASE}${endpoint}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                message_type: appState.isOnHold ? 'hold' : 'resume',
                user_id: appState.userId,
                call_id: appState.currentCallId
            })
        });
        
        const data = await response.json();
        
        if (data.status === 'success') {
            updateStatus(appState.isOnHold ? 'on-hold' : 'in-call');
            const holdBtn = document.getElementById('hold-btn');
            holdBtn.classList.toggle('active', appState.isOnHold);
        }
    } catch (error) {
    }
}

function toggleMute() {
    appState.isMuted = !appState.isMuted;
    
    if (appState.localStream) {
        appState.localStream.getAudioTracks().forEach(track => {
            track.enabled = !appState.isMuted;
        });
    }
    
    const muteBtn = document.getElementById('mute-btn');
    muteBtn.classList.toggle('active', appState.isMuted);
    muteBtn.textContent = appState.isMuted ? 'Unmute' : 'Mute';
}

function endCallCleanup() {
    appState.currentCallId = null;
    appState.currentCallPartner = null;
    appState.isOnHold = false;
    appState.isMuted = false;
    appState.callStartTime = null;
    appState.callDuration = 0;
    
    // Reset the timer display
    document.getElementById('call-timer').textContent = '00:00';
    document.getElementById('call-duration').textContent = 'Duration: 00:00';
    
    if (appState.localStream) {
        appState.localStream.getTracks().forEach(track => track.stop());
        appState.localStream = null;
    }
    
    if (appState.peerConnection) {
        appState.peerConnection.close();
        appState.peerConnection = null;
    }
    
    updateStatus('idle');
    hideCallControls();
    document.getElementById('call-modal').classList.add('hidden');
    document.getElementById('current-call-info').classList.add('hidden');
}

function simulateIncomingCall(callerId) {
    document.getElementById('modal-caller-info').textContent = `Call from: ${callerId}`;
    document.getElementById('call-modal').classList.remove('hidden');
}

async function checkForIncomingCalls() {
    if (!appState.userId || appState.currentCallId) {
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE}/signal/incoming?user_id=${appState.userId}`);
        const data = await response.json();
        
        if (data.call) {
            const call = data.call;
            appState.currentCallId = call.call_id;
            appState.currentCallPartner = call.caller_id;
            
            const caller = await getUserName(call.caller_id);
            simulateIncomingCall(caller);
        }
    } catch (error) {
    }
}

async function checkCallAcceptance() {
    // Only check if we're currently calling (waiting for acceptance)
    // Must have currentCallId but NOT have started the call yet (callStartTime)
    const shouldCheck = appState.currentCallId && !appState.callStartTime;
    
    if (!shouldCheck) {
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE}/signal/status?call_id=${appState.currentCallId}`);
        
        if (!response.ok) {
            console.log('Call status check failed, status:', response.status);
            return;
        }
        
        const data = await response.json();
        
        console.log('checkCallAcceptance - callId:', appState.currentCallId, 'Response:', data);
        
        if (data.status === 'success' && data.call) {
            const callStatus = String(data.call.status).toLowerCase().trim();
            console.log('Call status from server:', callStatus, '(type:', typeof callStatus, ')');
            
            // The backend serializes CallStatus::InCall as "InCall", compare case-insensitively
            if (callStatus === 'incall') {
                console.log('🎯 Detected call accepted! Starting timer...');
                
                // Double-check that callStartTime hasn't already been set
                if (!appState.callStartTime) {
                    appState.callStartTime = Date.now();
                    updateStatus('in-call');
                    showCallControls();
                    document.getElementById('current-call-info').classList.remove('hidden');
                    document.getElementById('call-modal').classList.add('hidden');
                    
                    console.log('✅ Call acceptance detected - timer started, UI updated');
                }
            }
        } else {
            if (data.status !== 'success') {
                console.log('Waiting for acceptance... (status=' + data.status + ')');
            }
        }
    } catch (error) {
        console.log('checkCallAcceptance error:', error.message);
    }
}

async function checkIfCallEnded() {
    // Only check if we're currently in a call
    if (!appState.currentCallId) {
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE}/signal/status?call_id=${appState.currentCallId}`);
        
        if (!response.ok) {
            // If the call is not found (404), it means it was ended
            if (response.status === 404) {
                console.log('🔴 Detected call was ended by other party');
                endCallCleanup();
                await loadUsers();
            }
            return;
        }
        
        const data = await response.json();
        
        // If we get an error status, the call no longer exists
        if (data.status === 'error' || !data.call) {
            console.log('🔴 Call no longer exists on server');
            endCallCleanup();
            await loadUsers();
        }
    } catch (error) {
        console.log('checkIfCallEnded error:', error.message);
    }
}

async function sendHeartbeat() {
    if (!appState.userId) {
        return;
    }
    
    try {
        await fetch(`${API_BASE}/users/heartbeat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: appState.userId })
        });
    } catch (error) {
        console.log('Heartbeat failed:', error.message);
    }
}

async function getUserName(userId) {
    try {
        const response = await fetch(`${API_BASE}/users/get?user_id=${userId}`);
        const data = await response.json();
        return data.username || userId;
    } catch (error) {
        return userId;
    }
}

async function requestAudioPermission() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
            audio: true, 
            video: false 
        });
        appState.localStream = stream;
        
        const localAudio = document.getElementById('local-audio');
        localAudio.srcObject = stream;
        
        setupAudioAnalyzer(stream);
    } catch (error) {
        alert('Microphone access is required for calls');
    }
}

let audioContext, analyser, dataArray, animationId;

function setupAudioAnalyzer(stream) {
    if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    
    const source = audioContext.createMediaStreamSource(stream);
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    
    source.connect(analyser);
    dataArray = new Uint8Array(analyser.frequencyBinCount);
    
    visualizeAudio();
}

function visualizeAudio() {
    if (appState.currentCallId && analyser) {
        analyser.getByteFrequencyData(dataArray);
        
        const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
        const level = Math.round((average / 255) * 100);
        document.getElementById('audio-level').style.width = level + '%';
        document.getElementById('audio-status').textContent = level > 10 ? 'Active' : 'Quiet';
        
        drawAudioVisualization();
    }
    
    animationId = requestAnimationFrame(visualizeAudio);
}

function setupAudioVisualization() {
    const canvas = document.getElementById('audio-canvas');
    const ctx = canvas.getContext('2d');
    
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;
}

function drawAudioVisualization() {
    const canvas = document.getElementById('audio-canvas');
    const ctx = canvas.getContext('2d');
    
    ctx.fillStyle = '#f8f9fa';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    if (!analyser || !dataArray) return;
    
    analyser.getByteFrequencyData(dataArray);
    
    const barWidth = (canvas.width / dataArray.length) * 2.5;
    let barHeight, x = 0;
    
    for (let i = 0; i < dataArray.length; i++) {
        barHeight = (dataArray[i] / 255) * canvas.height;
        
        const hue = (i / dataArray.length) * 360;
        ctx.fillStyle = `hsl(${hue}, 100%, 50%)`;
        ctx.fillRect(x, canvas.height - barHeight, barWidth, barHeight);
        
        x += barWidth + 1;
    }
}

function updateStatus(status) {
    const badge = document.getElementById('status-badge');
    badge.className = 'status-badge ' + status;
    badge.textContent = status.toUpperCase().replace('-', ' ');
}

function showCallControls() {
    document.getElementById('call-controls').classList.remove('hidden');
    document.getElementById('current-call-info').classList.remove('hidden');
}

function hideCallControls() {
    document.getElementById('call-controls').classList.add('hidden');
    document.getElementById('current-call-info').classList.add('hidden');
}

function updateCallTimer() {
    if (appState.callStartTime) {
        appState.callDuration = Math.floor((Date.now() - appState.callStartTime) / 1000);
        const minutes = Math.floor(appState.callDuration / 60);
        const seconds = appState.callDuration % 60;
        
        const timeStr = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
        document.getElementById('call-timer').textContent = timeStr;
        document.getElementById('call-duration').textContent = `Duration: ${timeStr}`;
    }
}

function setupEventListeners() {
    document.getElementById('refresh-users-btn').addEventListener('click', loadUsers);
    
    document.getElementById('call-btn').addEventListener('click', () => {
        const targetId = document.getElementById('target-user').value;
        if (targetId) {
            initiateCall(targetId);
        } else {
            alert('Please select a user to call');
        }
    });
    
    document.getElementById('call-by-ip-btn').addEventListener('click', () => {
        const ip = document.getElementById('target-ip').value;
        if (ip) {
            initiateCall(ip, true);
        } else {
            alert('Please enter an IP address');
        }
    });
    
    document.getElementById('mute-btn').addEventListener('click', toggleMute);
    document.getElementById('hold-btn').addEventListener('click', holdCall);
    document.getElementById('end-call-btn').addEventListener('click', endCall);
    
    document.getElementById('accept-call-btn').addEventListener('click', acceptCall);
    document.getElementById('reject-call-btn').addEventListener('click', rejectCall);
    
    document.addEventListener('click', (e) => {
        if (e.target.closest('.user-accept-btn')) {
            const userId = e.target.dataset.userId;
            initiateCall(userId);
        } else if (e.target.closest('.user-reject-btn')) {
            const userItem = e.target.closest('.user-item');
            const userName = userItem.querySelector('.user-name').textContent;
            alert(`${userName} has been blocked (feature coming soon)`);
        } else if (e.target.closest('.user-hangup-btn')) {
            endCall();
        } else if (e.target.closest('.user-item:not(.offline)') && !e.target.closest('.user-item-actions')) {
            const userItem = e.target.closest('.user-item');
            const userName = userItem.querySelector('.user-name').textContent;
            document.getElementById('target-user').value = userName;
        }
    });
}
