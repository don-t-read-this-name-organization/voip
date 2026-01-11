const API_BASE = '/api';

let appState = {
    userId: null,
    username: null,
    currentCallId: null,
    currentCallPartner: null,
    isMuted: false,
    isOnHold: false,
    callStartTime: null,
    callDuration: 0,
    pausedDuration: 0,
    holdStartTime: null,
    localIP: null,
    peerConnection: null,
    localStream: null,
    remoteStream: null,
};

const ICE_SERVERS = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
    ]
};

async function getLocalIP() {
    try {
        const response = await fetch('https://api.ipify.org?format=json');
        const data = await response.json();
        appState.localIP = data.ip;
        console.log('Local IP detected:', appState.localIP);
    } catch (error) {
        console.log('Could not detect public IP, trying local IP...');
        // Fallback: try to get local IP
        try {
            const pc = new RTCPeerConnection({iceServers: []});
            pc.createDataChannel('');
            pc.createOffer().then(offer => pc.setLocalDescription(offer));
            
            return new Promise((resolve) => {
                pc.onicecandidate = (event) => {
                    if (event.candidate) {
                        const ip = event.candidate.candidate.split(' ')[4];
                        if (ip && ip !== '127.0.0.1') {
                            appState.localIP = ip;
                            console.log('Local IP detected:', appState.localIP);
                            pc.close();
                            resolve();
                        }
                    }
                };
                
                setTimeout(() => {
                    if (!appState.localIP) {
                        appState.localIP = '127.0.0.1'; // fallback
                        console.log('Using fallback IP:', appState.localIP);
                    }
                    pc.close();
                    resolve();
                }, 2000);
            });
        } catch (e) {
            appState.localIP = '127.0.0.1'; // ultimate fallback
            console.log('Using ultimate fallback IP:', appState.localIP);
        }
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    await getLocalIP();
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

async function checkIncomingCalls() {
    if (!appState.userId) return;
    
    try {
        const response = await fetch(`${API_BASE}/signal/incoming?user_id=${appState.userId}`);
        const data = await response.json();
        
        if (data.incoming_call && !appState.currentCallId) {
            appState.currentCallId = data.call_id;
            appState.currentCallPartner = data.caller_id;
            document.getElementById('modal-caller-info').textContent = `Call from ${data.caller_username}`;
            document.getElementById('call-modal').classList.remove('hidden');
        }
    } catch (error) {
        // Ignore errors
    }
}

async function initializeUser() {
    const username = prompt('Enter your name:', 'User_' + Math.floor(Math.random() * 1000));
    
    if (!username) {
        console.error('Username required!');
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
        
        // Start polling for incoming calls
        setInterval(checkIncomingCalls, 1000);
    } catch (error) {
        console.error(`Failed to connect to server! API URL: ${API_BASE}, Error: ${error.message}`);
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
            // Current user is in a call - show busy
            buttonHtml = `<span class="user-busy">Busy</span>`;
        } else if (userIsBusy) {
            // Other user is busy (calling/in-call/on-hold) - show busy
            buttonHtml = `<span class="user-busy">Busy</span>`;
        } else if (user.status === 'idle') {
            // Only show call button if user is truly IDLE - not engaged in any call
            buttonHtml = `<button class="btn btn-success user-accept-btn" data-user-id="${user.id}">Call</button>`;
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
        console.error('Please register first!');
        return;
    }
    
    try {
        // Get user media first
        appState.localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        
        // Create peer connection
        appState.peerConnection = new RTCPeerConnection(ICE_SERVERS);
        
        // Add local stream to peer connection
        appState.localStream.getTracks().forEach(track => {
            appState.peerConnection.addTrack(track, appState.localStream);
        });
        
        // Set up event handlers
        setupPeerConnectionHandlers();
        
        // Initiate call via backend
        const response = await fetch(`${API_BASE}/signal/initiate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                message_type: 'initiate',
                user_id: appState.userId,
                target_user_id: targetId,
            })
        });
        
        const data = await response.json();
        
        if (data.status === 'success') {
            appState.currentCallId = data.call_id;
            appState.currentCallPartner = targetId;
            
            // Create offer
            const offer = await appState.peerConnection.createOffer();
            await appState.peerConnection.setLocalDescription(offer);
            
            // Send offer to backend
            await fetch(`${API_BASE}/signal/offer`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message_type: 'offer',
                    user_id: appState.userId,
                    call_id: appState.currentCallId,
                    offer: offer.sdp,
                })
            });
            
            // Start polling for answer
            pollForAnswer();
            
            updateStatus('calling');
            showCallControls();
            setupAudioVisualization();
            
            console.log('📞 Call initiated, waiting for answer...');
        }
    } catch (error) {
        console.error('Failed to initiate call:', error);
    }
}

function setupPeerConnectionHandlers() {
    appState.peerConnection.onicecandidate = async (event) => {
        if (event.candidate) {
            // Send ICE candidate to backend
            await fetch(`${API_BASE}/signal/candidate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message_type: 'candidate',
                    user_id: appState.userId,
                    call_id: appState.currentCallId,
                    candidate: event.candidate.candidate,
                })
            });
        }
    };
    
    appState.peerConnection.ontrack = (event) => {
        // Set remote stream
        appState.remoteStream = event.streams[0];
        const remoteAudio = document.getElementById('remote-audio');
        remoteAudio.srcObject = appState.remoteStream;
    };
    
    appState.peerConnection.onconnectionstatechange = () => {
        console.log('Connection state:', appState.peerConnection.connectionState);
        if (appState.peerConnection.connectionState === 'connected') {
            // Start the call timer when connection is established
            if (!appState.callStartTime) {
                appState.callStartTime = Date.now();
                console.log('✅ Call connected, timer started');
            }
            updateStatus('in-call');
        }
    };
}

async function acceptCall() {
    if (!appState.currentCallId) return;
    
    try {
        // Accept call via backend
        const response = await fetch(`${API_BASE}/signal/accept`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                message_type: 'accept',
                user_id: appState.userId,
                call_id: appState.currentCallId,
            })
        });
        
        const data = await response.json();
        
        if (data.status === 'success') {
            // Get user media
            appState.localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            
            // Create peer connection
            appState.peerConnection = new RTCPeerConnection(ICE_SERVERS);
            
            // Add local stream
            appState.localStream.getTracks().forEach(track => {
                appState.peerConnection.addTrack(track, appState.localStream);
            });
            
            // Set up event handlers
            setupPeerConnectionHandlers();
            
            // Get offer from backend
            const offerResponse = await fetch(`${API_BASE}/signal/get_offer?call_id=${appState.currentCallId}`);
            const offerData = await offerResponse.json();
            
            if (offerData.status === 'success') {
                // Set remote description
                await appState.peerConnection.setRemoteDescription({
                    type: 'offer',
                    sdp: offerData.offer
                });
                
                // Create answer
                const answer = await appState.peerConnection.createAnswer();
                await appState.peerConnection.setLocalDescription(answer);
                
                // Send answer to backend
                await fetch(`${API_BASE}/signal/answer`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        message_type: 'answer',
                        user_id: appState.userId,
                        call_id: appState.currentCallId,
                        answer: answer.sdp,
                    })
                });
                
                // Start polling for ICE candidates
                pollForCandidates();
                
                // Don't start timer here - wait for WebRTC connection
                updateStatus('connecting');
                showCallControls();
                document.getElementById('call-modal').classList.add('hidden');
                document.getElementById('current-call-info').classList.remove('hidden');
                setupAudioVisualization();
                console.log('✅ Call accepted, establishing WebRTC connection...');
            }
        }
    } catch (error) {
        console.log('acceptCall error:', error);
    }
}

async function pollForCandidates() {
    const pollInterval = setInterval(async () => {
        if (!appState.currentCallId) {
            clearInterval(pollInterval);
            return;
        }
        
        try {
            const response = await fetch(`${API_BASE}/signal/get_candidates?call_id=${appState.currentCallId}&user_id=${appState.userId}`);
            const data = await response.json();
            
            if (data.status === 'success' && data.candidates) {
                for (const candidateStr of data.candidates) {
                    await appState.peerConnection.addIceCandidate({
                        candidate: candidateStr,
                        sdpMLineIndex: 0,
                        sdpMid: '0'
                    });
                }
            }
        } catch (error) {
            console.error('Error polling candidates:', error);
        }
    }, 1000);
    
    // Stop polling after 30 seconds
    setTimeout(() => clearInterval(pollInterval), 30000);
}

async function pollForAnswer() {
    const pollInterval = setInterval(async () => {
        if (!appState.currentCallId) {
            clearInterval(pollInterval);
            return;
        }
        
        try {
            const response = await fetch(`${API_BASE}/signal/get_answer?call_id=${appState.currentCallId}`);
            const data = await response.json();
            
            if (data.status === 'success') {
                // Set remote description
                await appState.peerConnection.setRemoteDescription({
                    type: 'answer',
                    sdp: data.answer
                });
                
                // Start polling for ICE candidates
                pollForCandidates();
                
                // Update status to connecting while WebRTC establishes
                updateStatus('connecting');
                console.log('✅ Received answer, establishing WebRTC connection...');
                
                clearInterval(pollInterval);
            }
        } catch (error) {
            console.error('Error polling answer:', error);
        }
    }, 1000);
    
    // Stop polling after 30 seconds
    setTimeout(() => clearInterval(pollInterval), 30000);
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
                call_id: appState.currentCallId,
                ip_address: appState.localIP
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
    
    if (appState.isOnHold) {
        // Pause the timer and save when hold started
        if (appState.callStartTime) {
            appState.pausedDuration = Math.floor((Date.now() - appState.callStartTime) / 1000);
            appState.holdStartTime = Date.now();
        }
        
        // Mute local audio tracks during hold
        if (appState.localStream) {
            appState.localStream.getAudioTracks().forEach(track => {
                track.enabled = false;
            });
        }
        
        // Disable remote audio playback
        const remoteAudio = document.getElementById('remote-audio');
        if (remoteAudio) {
            remoteAudio.muted = true;
        }
        
        console.log('📴 Call on hold - audio paused, timer paused');
    } else {
        // Resume: adjust call start time to account for hold duration
        if (appState.holdStartTime) {
            const holdDuration = Math.floor((Date.now() - appState.holdStartTime) / 1000);
            appState.callStartTime = Date.now() - (appState.pausedDuration * 1000);
            appState.holdStartTime = null;
        }
        
        // Unmute local audio tracks
        if (appState.localStream && !appState.isMuted) {
            appState.localStream.getAudioTracks().forEach(track => {
                track.enabled = true;
            });
        }
        
        // Enable remote audio playback
        const remoteAudio = document.getElementById('remote-audio');
        if (remoteAudio) {
            remoteAudio.muted = false;
        }
        
        console.log('📞 Call resumed - audio restored, timer resumed');
    }
    
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
            holdBtn.textContent = appState.isOnHold ? 'Resume' : 'Hold';
        }
    } catch (error) {
        console.error('Hold/Resume error:', error);
    }
}

function toggleMute() {
    appState.isMuted = !appState.isMuted;
    
    // Mute/unmute local audio tracks
    if (appState.localStream) {
        appState.localStream.getAudioTracks().forEach(track => {
            track.enabled = !appState.isMuted;
        });
    }
    
    const muteBtn = document.getElementById('mute-btn');
    muteBtn.classList.toggle('active', appState.isMuted);
    muteBtn.textContent = appState.isMuted ? 'Unmute' : 'Mute';
    
    console.log('Mute toggled:', appState.isMuted);
}

function endCallCleanup() {
    appState.currentCallId = null;
    appState.currentCallPartner = null;
    appState.isOnHold = false;
    appState.isMuted = false;
    appState.callStartTime = null;
    appState.callDuration = 0;
    appState.pausedDuration = 0;
    appState.holdStartTime = null;
    
    // Reset the timer display
    document.getElementById('call-timer').textContent = '00:00';
    document.getElementById('call-duration').textContent = 'Duration: 00:00';
    
    // Close WebRTC connection
    if (appState.peerConnection) {
        appState.peerConnection.close();
        appState.peerConnection = null;
    }
    
    // Stop local media stream
    if (appState.localStream) {
        appState.localStream.getTracks().forEach(track => track.stop());
        appState.localStream = null;
    }
    
    // Clear remote audio
    const remoteAudio = document.getElementById('remote-audio');
    remoteAudio.srcObject = null;
    appState.remoteStream = null;
    
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
        } else if (data.call) {
            // Check if the other user put the call on hold
            const serverStatus = String(data.call.status).toLowerCase().trim();
            if (serverStatus === 'onhold' && !appState.isOnHold) {
                console.log('📴 Other user put call on hold');
                // Mirror the hold state locally
                appState.isOnHold = true;
                if (appState.callStartTime) {
                    appState.pausedDuration = Math.floor((Date.now() - appState.callStartTime) / 1000);
                    appState.holdStartTime = Date.now();
                }
                const remoteAudio = document.getElementById('remote-audio');
                if (remoteAudio) remoteAudio.muted = true;
                updateStatus('on-hold');
                const holdBtn = document.getElementById('hold-btn');
                if (holdBtn) {
                    holdBtn.classList.add('active');
                    holdBtn.textContent = 'Resume';
                }
            } else if (serverStatus === 'incall' && appState.isOnHold) {
                console.log('📞 Other user resumed call');
                // Mirror the resume state locally
                appState.isOnHold = false;
                if (appState.holdStartTime && appState.callStartTime) {
                    appState.callStartTime = Date.now() - (appState.pausedDuration * 1000);
                    appState.holdStartTime = null;
                }
                const remoteAudio = document.getElementById('remote-audio');
                if (remoteAudio) remoteAudio.muted = false;
                updateStatus('in-call');
                const holdBtn = document.getElementById('hold-btn');
                if (holdBtn) {
                    holdBtn.classList.remove('active');
                    holdBtn.textContent = 'Hold';
                }
            }
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
    // WebRTC handles microphone access
    console.log('WebRTC mode: microphone access handled by getUserMedia');
}

let audioContext, analyser, dataArray, animationId;

function setupAudioVisualization() {
    if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    dataArray = new Uint8Array(analyser.frequencyBinCount);
    
    // Connect to local stream for visualization
    if (appState.localStream) {
        const source = audioContext.createMediaStreamSource(appState.localStream);
        source.connect(analyser);
        startVisualization();
    }
}

function startVisualization() {
    const canvas = document.getElementById('audio-canvas');
    const ctx = canvas.getContext('2d');
    const audioLevel = document.getElementById('audio-level');
    
    function draw() {
        if (!analyser) return;
        
        analyser.getByteFrequencyData(dataArray);
        
        // Calculate average volume
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
            sum += dataArray[i];
        }
        const average = sum / dataArray.length;
        const volume = average / 255;
        
        // Update audio level bar
        audioLevel.style.width = `${volume * 100}%`;
        
        // Draw waveform
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#4CAF50';
        
        const barWidth = canvas.width / dataArray.length;
        for (let i = 0; i < dataArray.length; i++) {
            const barHeight = (dataArray[i] / 255) * canvas.height;
            ctx.fillRect(i * barWidth, canvas.height - barHeight, barWidth - 1, barHeight);
        }
        
        animationId = requestAnimationFrame(draw);
    }
    
    draw();
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
    // Only update timer if call is active and not on hold
    if (appState.callStartTime && !appState.isOnHold) {
        appState.callDuration = Math.floor((Date.now() - appState.callStartTime) / 1000);
        const minutes = Math.floor(appState.callDuration / 60);
        const seconds = appState.callDuration % 60;
        
        const timeStr = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
        document.getElementById('call-timer').textContent = timeStr;
        document.getElementById('call-duration').textContent = `Duration: ${timeStr}`;
    } else if (appState.isOnHold && appState.pausedDuration >= 0) {
        // Show paused time when on hold
        const minutes = Math.floor(appState.pausedDuration / 60);
        const seconds = appState.pausedDuration % 60;
        const timeStr = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')} (PAUSED)`;
        document.getElementById('call-timer').textContent = timeStr;
    }
}

function setupEventListeners() {
    document.getElementById('refresh-users-btn').addEventListener('click', loadUsers);
    
    document.getElementById('call-btn').addEventListener('click', () => {
        const targetId = document.getElementById('target-user').value;
        if (targetId) {
            initiateCall(targetId);
        } else {
            console.error('Please select a user to call');
        }
    });
    
    document.getElementById('call-by-ip-btn').addEventListener('click', () => {
        const ip = document.getElementById('target-ip').value;
        if (ip) {
            initiateCall(ip, true);
        } else {
            console.error('Please enter an IP address');
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
