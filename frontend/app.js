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

// ============================================
// Initialization
// ============================================

document.addEventListener('DOMContentLoaded', async () => {
    await initializeUser();
    await loadUsers();
    setupEventListeners();
    setupAudioVisualization();
    
    setInterval(loadUsers, 5000);
    setInterval(updateCallTimer, 1000);
});

// Disconnect user when leaving the page
window.addEventListener('beforeunload', async () => {
window.addEventListener('beforeunload', async () => {
            await fetch(`${API_BASE}/users/disconnect`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user_id: appState.userId })
            });
        } catch (error) {
            console.error('Failed to disconnect user:', error);
        }
    }
});

// ============================================
// User Management
// ============================================
async function initializeUser() {
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
        
        console.log('User registered:', data);
    } catch (error) {
        console.error('Failed to register user:', error);
        document.getElementById('user-info').textContent = `Connected as: ${appState.username}`;

async function loadUsers() {
    } catch (error) {
        alert(`Failed to connect to server!\n\nAPI URL: ${API_BASE}\nError: ${error.message}`);
        
        const users = data.users.filter(u => u.id !== appState.userId);
        renderUsersList(users);
        updateUserSelect(users);
    } catch (error) {
        console.error('Failed to load users:', error);
    }
}

function renderUsersList(users) {
        renderUsersList(users);
        updateUserSelect(users);
    } catch (error) {
    }   return;
    }
    
    usersList.innerHTML = users.map(user => `
        <div class="user-item ${user.status === 'offline' ? 'offline' : ''}">
            <div>
                <span class="user-name">${user.username}</span>
                <span class="user-status ${user.status}"></span>
            </div>
            <span class="user-status-text">${user.status.toUpperCase()}</span>
        </div>
    `).join('');
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

// ============================================
// Call Management
// ============================================

async function initiateCall(targetId, isIpCall = false) {
    if (!appState.userId) {
        alert('Please register first!');
        return;
async function initiateCall(targetId, isIpCall = false) {
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
            
            console.log('Call initiated:', data.call_id);
            
            // Simulate incoming call for demo - in real app, use WebSocket
            setTimeout(() => simulateIncomingCall(targetId), 1500);
        }
    } catch (error) {
        console.error('Failed to initiate call:', error);
        alert('Failed to initiate call');
            updateStatus('calling');
            showCallControls();
            requestAudioPermission();
            
            setTimeout(() => simulateIncomingCall(targetId), 1500);
    } catch (error) {
        alert('Failed to initiate call');
                message_type: 'accept',
                user_id: appState.userId,
                call_id: appState.currentCallId
            })
        });
        
        const data = await response.json();
        
        if (data.status === 'success') {
            updateStatus('in-call');
            document.getElementById('call-modal').classList.add('hidden');
            appState.callStartTime = Date.now();
            requestAudioPermission();
            
            console.log('Call accepted');
        }
    } catch (error) {
        console.error('Failed to accept call:', error);
    }
}
        if (data.status === 'success') {
            updateStatus('in-call');
            document.getElementById('call-modal').classList.add('hidden');
            appState.callStartTime = Date.now();
            requestAudioPermission();
            headers: { 'Content-Type': 'application/json' },
    } catch (error) {
    }           user_id: appState.userId,
                call_id: appState.currentCallId
            })
        });
        
        if (response.ok) {
            endCallCleanup();
            console.log('Call rejected');
        }
    } catch (error) {
        console.error('Failed to reject call:', error);
    }
}

async function endCall() {
    if (!appState.currentCallId) return;
    
    try {
        if (response.ok) {
            endCallCleanup();pplication/json' },
            body: JSON.stringify({
    } catch (error) {
    }           call_id: appState.currentCallId
            })
        });
        
        if (response.ok) {
            endCallCleanup();
            console.log('Call ended');
        }
    } catch (error) {
        console.error('Failed to end call:', error);
    }
}

async function holdCall() {
    if (!appState.currentCallId) return;
    
    appState.isOnHold = !appState.isOnHold;
    
        if (response.ok) {
            endCallCleanup();${API_BASE}${endpoint}`, {
            method: 'POST',
    } catch (error) {
    }           message_type: appState.isOnHold ? 'hold' : 'resume',
                user_id: appState.userId,
                call_id: appState.currentCallId
            })
        });
        
        const data = await response.json();
        
        if (data.status === 'success') {
            updateStatus(appState.isOnHold ? 'on-hold' : 'in-call');
            const holdBtn = document.getElementById('hold-btn');
            holdBtn.classList.toggle('active', appState.isOnHold);
            holdBtn.textContent = appState.isOnHold ? '⏯ Resume' : '⏸ Hold';
        }
    } catch (error) {
        console.error('Failed to hold/resume call:', error);
    }
}

function toggleMute() {
    appState.isMuted = !appState.isMuted;
    
    if (appState.localStream) {
        if (data.status === 'success') {
            updateStatus(appState.isOnHold ? 'on-hold' : 'in-call');
    } catch (error) {
    }onst muteBtn = document.getElementById('mute-btn');
    muteBtn.classList.toggle('active', appState.isMuted);
    muteBtn.innerHTML = appState.isMuted 
        ? '<span class="icon">🔇</span> Unmute' 
        : '<span class="icon">🔊</span> Mute';
}

function endCallCleanup() {
    appState.currentCallId = null;
    appState.currentCallPartner = null;
    appState.isOnHold = false;
    appState.isMuted = false;
    appState.callStartTime = null;
    const muteBtn = document.getElementById('mute-btn');
    muteBtn.classList.toggle('active', appState.isMuted);
    muteBtn.textContent = appState.isMuted ? 'Unmute' : 'Mute';
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

// ============================================
// Simulation & Demo
// ============================================

function simulateIncomingCall(callerId) {
    // In a real app, this would come from WebSocket
    document.getElementById('modal-caller-info').textContent = `Call from: ${callerId}`;
    document.getElementById('call-modal').classList.remove('hidden');
}

// ============================================
// Audio Management
// ============================================

async function requestAudioPermission() {
function simulateIncomingCall(callerId) {
    document.getElementById('modal-caller-info').textContent = `Call from: ${callerId}`;
    document.getElementById('call-modal').classList.remove('hidden');
        localAudio.srcObject = stream;
        
        console.log('Audio permission granted');
        
async function requestAudioPermission() {red for calls');
    }
}

let audioContext, analyser, dataArray, animationId;

function setupAudioAnalyzer(stream) {
    if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    
    const source = audioContext.createMediaStreamSource(stream);
        const localAudio = document.getElementById('local-audio');
        localAudio.srcObject = stream;
        
        setupAudioAnalyzer(stream);
}

    } catch (error) {
        alert('Microphone access is required for calls');
        
        // Update audio level meter
        const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
        const level = Math.round((average / 255) * 100);
        document.getElementById('audio-level').style.width = level + '%';
        document.getElementById('audio-status').textContent = level > 10 ? 'Active' : 'Quiet';
        
        // Draw canvas visualization
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
function visualizeAudio() {
    if (appState.currentCallId && analyser) {
        analyser.getByteFrequencyData(dataArray);
        
        const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
        const level = Math.round((average / 255) * 100);
        document.getElementById('audio-level').style.width = level + '%';
        document.getElementById('audio-status').textContent = level > 10 ? 'Active' : 'Quiet';
        
        drawAudioVisualization();
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

// ============================================
// UI Updates
// ============================================

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
function updateStatus(status) {('call-duration').textContent = `Duration: ${timeStr}`;
    }
}

// ============================================
// Event Listeners
// ============================================

function setupEventListeners() {
    // Call buttons
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
    
    // Call control buttons
    document.getElementById('mute-btn').addEventListener('click', toggleMute);
    document.getElementById('hold-btn').addEventListener('click', holdCall);
    document.getElementById('end-call-btn').addEventListener('click', endCall);
function setupEventListeners() {
    document.getElementById('call-btn').addEventListener('click', () => {
        if (e.target.closest('.user-item:not(.offline)')) {
            const userItem = e.target.closest('.user-item');
            const userName = userItem.querySelector('.user-name').textContent;
            document.getElementById('target-user').value = userName;
        }
    });
}

console.log('VoIP Application loaded successfully');
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
    
    document.addEventListener('click', (e) => {        }
    });
}