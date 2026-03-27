// Main State
let peer = null;
let conn = null;
let isHost = false;
let currentScreen = 'screen-connect';

// DOM Elements - Screens
const screens = {
    connect: document.getElementById('screen-connect'),
    menu: document.getElementById('screen-menu'),
    game: document.getElementById('screen-game')
};

// DOM Elements - Connection
const tabHost = document.getElementById('tab-host');
const tabJoin = document.getElementById('tab-join');
const viewHost = document.getElementById('host-view');
const viewJoin = document.getElementById('join-view');
const btnCreateRoom = document.getElementById('btn-create-room');
const btnJoinRoom = document.getElementById('btn-join-room');
const codeDisplay = document.getElementById('room-code-display');
const myCodeEl = document.getElementById('my-code');
const btnCopy = document.getElementById('btn-copy');
const inputJoinCode = document.getElementById('input-join-code');
const activeGameTitle = document.getElementById('active-game-title');
const gameViews = document.querySelectorAll('.game-view');

// -----------------------------------------
// UI Utility Functions
// -----------------------------------------
function switchScreen(screenId) {
    Object.values(screens).forEach(screen => screen.classList.add('hidden'));
    screens[screenId.replace('screen-', '')] = document.getElementById(screenId); // update ref
    document.getElementById(screenId).classList.remove('hidden');
    currentScreen = screenId;
}

function switchGameView(gameId, title) {
    gameViews.forEach(view => view.classList.add('hidden'));
    document.getElementById(`view-${gameId}`).classList.remove('hidden');
    activeGameTitle.textContent = title;
    switchScreen('screen-game');
}

function showToast(message) {
    const toastContainer = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `<i class="fa-solid fa-bell"></i> <span>${message}</span>`;
    toastContainer.appendChild(toast);
    
    setTimeout(() => {
        toast.style.animation = 'slideDown 0.3s forwards reverse';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// -----------------------------------------
// PeerJS Connection Setup
// -----------------------------------------
function initPeerJS(hostGame = false) {
    if (peer) peer.destroy();
    
    // Generate a simple readable ID
    const randomId = Math.random().toString(36).substring(2, 6).toUpperCase();
    
    // Configure robust STUN servers for better NAT traversal over mobile/different networks
    const peerConfig = {
        config: {
            'iceServers': [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' },
                { urls: 'stun:stun2.l.google.com:19302' },
                { urls: 'stun:stun.services.mozilla.com' }
            ]
        }
    };
    
    peer = new Peer(hostGame ? randomId : undefined, peerConfig);
    
    peer.on('open', (id) => {
        if (hostGame) {
            myCodeEl.textContent = id;
            btnCreateRoom.classList.add('hidden');
            codeDisplay.classList.remove('hidden');
            isHost = true;
        }
    });

    peer.on('connection', (connection) => {
        // Host receiving connection
        if (conn) return; // already connected
        conn = connection;
        setupConnection();
    });

    peer.on('error', (err) => {
        let errorMessage = 'Connection error: ' + err.type;
        if (err.type === 'peer-unavailable') {
            errorMessage = 'Code not found. Is the host waiting on the connection screen?';
        } else if (err.type === 'webrtc') {
            errorMessage = 'WebRTC error: Strict firewall or NAT blocking connection.';
        }
        
        showToast(errorMessage);
        console.error(err);
        
        // Reset join button if we were trying to connect
        if (btnJoinRoom.innerHTML.includes('Connecting')) {
            btnJoinRoom.innerHTML = '<i class="fa-solid fa-arrow-right-to-bracket"></i> Connect';
        }
    });
}

function setupConnection() {
    conn.on('open', () => {
        showToast('Connected successfully!');
        switchScreen('screen-menu');
    });

    conn.on('data', (data) => {
        handleIncomingData(data);
    });

    conn.on('close', () => {
        showToast('Partner disconnected.');
        switchScreen('screen-connect');
        conn = null;
    });
}

// -----------------------------------------
// Event Listeners - Connection
// -----------------------------------------
tabHost.addEventListener('click', () => {
    tabHost.classList.add('active'); tabJoin.classList.remove('active');
    viewHost.classList.remove('hidden'); viewJoin.classList.add('hidden');
});

tabJoin.addEventListener('click', () => {
    tabJoin.classList.add('active'); tabHost.classList.remove('active');
    viewJoin.classList.remove('hidden'); viewHost.classList.add('hidden');
});

btnCreateRoom.addEventListener('click', () => initPeerJS(true));

btnCopy.addEventListener('click', () => {
    navigator.clipboard.writeText(myCodeEl.textContent);
    showToast('Code copied to clipboard!');
});

btnJoinRoom.addEventListener('click', () => {
    const code = inputJoinCode.value.trim().toUpperCase();
    if (!code) { showToast('Please enter a code'); return; }
    
    btnJoinRoom.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Connecting...';
    
    initPeerJS(false);
    peer.on('open', () => {
        conn = peer.connect(code);
        isHost = false;
        setupConnection();
        
        setTimeout(() => {
            if (conn && !conn.open) {
                btnJoinRoom.innerHTML = '<i class="fa-solid fa-arrow-right-to-bracket"></i> Connect';
                showToast('Failed to connect. This might be a strict network/firewall issue.');
            }
        }, 10000); // 10 seconds timeout for slower networks
    });
});

document.querySelectorAll('.game-card').forEach(card => {
    card.addEventListener('click', () => {
        const game = card.dataset.game;
        const title = card.querySelector('h3').textContent;
        // Notify partner we are starting a game
        conn.send({ type: 'START_GAME', game, title });
        startGame(game, title);
    });
});

document.querySelector('.btn-back').addEventListener('click', () => {
    conn.send({ type: 'BACK_TO_MENU' });
    switchScreen('screen-menu');
    resetAllGames();
});

// -----------------------------------------
// Game Routing & P2P Data Handling
// -----------------------------------------
function handleIncomingData(data) {
    switch (data.type) {
        case 'START_GAME':
            startGame(data.game, data.title);
            break;
        case 'BACK_TO_MENU':
            switchScreen('screen-menu');
            resetAllGames();
            break;
        case 'SYNC_PRESS':
            handleSyncPress(data.time, false);
            break;
        case 'SYNC_RESULT':
            showSyncResult(data.score);
            break;
        case 'TELEPATHY_SUBMIT':
            handleTelepathyPartnerSubmission(data.answer);
            break;
        case 'TELEPATHY_RESTART':
            resetTelepathy();
            break;
        case 'CARD_DRAWN':
            showDeepTalkCard(data.index);
            break;
        case 'TTT_MOVE':
            handleTTTMove(data.index, data.player);
            break;
        case 'TTT_RESTART':
            resetTTT();
            break;
    }
}

function startGame(game, title) {
    resetAllGames();
    switchGameView(game, title);
    if (game === 'telepathy') resetTelepathy();
    else if (game === 'tictactoe') resetTTT();
}

function resetAllGames() {
    // Reset any game specific states here
}

document.querySelectorAll('.btn-reset-game').forEach(btn => {
    btn.addEventListener('click', () => {
        const activeView = btn.closest('.game-view').id;
        if (activeView === 'view-sync') {
            document.getElementById('sync-result').classList.add('hidden');
            document.querySelectorAll('.status-dot').forEach(d => d.classList.remove('active'));
            syncState = { me: null, partner: null };
            document.getElementById('btn-sync-press').disabled = false;
        } else if (activeView === 'view-telepathy') {
            conn.send({ type: 'TELEPATHY_RESTART' });
            resetTelepathy();
        } else if (activeView === 'view-tictactoe') {
            conn.send({ type: 'TTT_RESTART' });
            resetTTT();
        }
    });
});

// -----------------------------------------
// Mini Game 1: Sync Test
// -----------------------------------------
let syncState = { me: null, partner: null };

document.getElementById('btn-sync-press').addEventListener('click', () => {
    const now = Date.now();
    syncState.me = now;
    document.querySelector('.player-status.me .status-dot').classList.add('active');
    document.getElementById('btn-sync-press').disabled = true;
    
    conn.send({ type: 'SYNC_PRESS', time: now });
    handleSyncPress(now, true);
});

function handleSyncPress(time, isMe) {
    if (!isMe) {
        syncState.partner = time;
        document.querySelector('.player-status.partner .status-dot').classList.add('active');
    }

    if (syncState.me && syncState.partner) {
        if (isHost) {
            // Host calculates the difference
            const diff = Math.abs(syncState.me - syncState.partner);
            showSyncResult(diff);
            conn.send({ type: 'SYNC_RESULT', score: diff });
        }
    }
}

function showSyncResult(diffMs) {
    const resultBox = document.getElementById('sync-result');
    const scoreEl = document.getElementById('sync-score');
    const messageEl = document.getElementById('sync-message');
    
    resultBox.classList.remove('hidden');
    scoreEl.textContent = `${diffMs}ms diff`;
    
    if (diffMs < 50) messageEl.textContent = "Unbelievable! Pure Mind Reading 🤯";
    else if (diffMs < 200) messageEl.textContent = "Amazing sync! 🌟";
    else if (diffMs < 500) messageEl.textContent = "Pretty good, but you can do better.";
    else messageEl.textContent = "Completely out of sync 😬";
}

// -----------------------------------------
// Mini Game 2: Telepathy
// -----------------------------------------
const telepathyWords = ["Music", "Movie", "Animal", "Food", "Color", "Dream", "Fear", "Vacation", "Hobby", "Season"];
let currentPromptWord = "";
let telepathyState = { me: null, partner: null };

function resetTelepathy() {
    telepathyState = { me: null, partner: null };
    currentPromptWord = telepathyWords[Math.floor(Math.random() * telepathyWords.length)];
    document.getElementById('telepathy-prompt').textContent = `Category: ${currentPromptWord}`;
    
    document.getElementById('telepathy-answer').value = '';
    document.getElementById('telepathy-answer').disabled = false;
    document.getElementById('btn-telepathy-submit').disabled = false;
    
    const myAnsSpan = document.getElementById('telepathy-my-answer');
    const partnerAnsSpan = document.getElementById('telepathy-partner-answer');
    
    myAnsSpan.innerHTML = '<i class="fa-solid fa-ellipsis"></i>';
    partnerAnsSpan.innerHTML = '<i class="fa-solid fa-ellipsis"></i>';
    myAnsSpan.classList.add('hidden-answer');
    partnerAnsSpan.classList.add('hidden-answer');
    document.getElementById('telepathy-results').classList.remove('revealed-answer');
    
    document.getElementById('telepathy-partner-typing').textContent = 'Waiting...';
    document.getElementById('telepathy-final').classList.add('hidden');
}

document.getElementById('btn-telepathy-submit').addEventListener('click', () => {
    const ans = document.getElementById('telepathy-answer').value.trim();
    if (!ans) return;
    
    telepathyState.me = ans.toUpperCase();
    document.getElementById('telepathy-my-answer').textContent = telepathyState.me;
    
    document.getElementById('telepathy-answer').disabled = true;
    document.getElementById('btn-telepathy-submit').disabled = true;
    
    conn.send({ type: 'TELEPATHY_SUBMIT', answer: telepathyState.me });
    checkTelepathyResult();
});

function handleTelepathyPartnerSubmission(ans) {
    telepathyState.partner = ans;
    document.getElementById('telepathy-partner-typing').textContent = 'Locked in!';
    document.getElementById('telepathy-partner-answer').textContent = telepathyState.partner;
    checkTelepathyResult();
}

function checkTelepathyResult() {
    if (telepathyState.me && telepathyState.partner) {
        document.getElementById('telepathy-results').classList.add('revealed-answer');
        document.getElementById('telepathy-final').classList.remove('hidden');
        
        const resText = document.getElementById('telepathy-match-result');
        if (telepathyState.me === telepathyState.partner) {
            resText.textContent = "IT'S A MATCH! 🎉";
            resText.style.color = "#10b981";
        } else {
            resText.textContent = "Not quite! 😅";
            resText.style.color = "#ef4444";
        }
    }
}

// -----------------------------------------
// Mini Game 3: Deep Talk Cards
// -----------------------------------------
const deepQuestions = [
    "What is a memory you will never forget?",
    "If you could relive one day of your life, which would it be?",
    "What's your biggest irrational fear?",
    "When do you feel most loved?",
    "What is something you've never told anyone?",
    "What's the best compliment you've ever received?",
    "If you had one wish, what would it be?",
    "What's a trait you admire in others but lack in yourself?"
];

// Initialize Card
document.getElementById('btn-draw-card').addEventListener('click', () => {
    const randomIndex = Math.floor(Math.random() * deepQuestions.length);
    showDeepTalkCard(randomIndex);
    conn.send({ type: 'CARD_DRAWN', index: randomIndex });
});

function showDeepTalkCard(index) {
    const cardContent = document.getElementById('card-question');
    const cardEl = document.getElementById('active-card');
    
    cardEl.classList.remove('flipped');
    setTimeout(() => {
        cardContent.textContent = deepQuestions[index];
        cardEl.classList.add('flipped');
        document.getElementById('card-draw-status').textContent = "Card drawn!";
    }, 400); // Wait for unflip animation
}

// -----------------------------------------
// Mini Game 4: Tic Tac Toe
// -----------------------------------------
let tttBoard = Array(9).fill(null);
let tttMyTurn = false;
let myTTTSymbol = '';

function resetTTT() {
    tttBoard = Array(9).fill(null);
    document.querySelectorAll('.ttt-cell').forEach(cell => {
        cell.className = 'ttt-cell';
        cell.textContent = '';
    });
    document.getElementById('ttt-result').classList.add('hidden');
    
    // Host goes first as X
    myTTTSymbol = isHost ? 'X' : 'O';
    tttMyTurn = isHost;
    
    updateTTTTurnDisplay();
}

function updateTTTTurnDisplay() {
    const disp = document.getElementById('ttt-turn-display');
    disp.textContent = tttMyTurn ? "It's your turn!" : "Waiting for partner...";
    disp.style.color = tttMyTurn ? "var(--text-color)" : "#888";
}

document.querySelectorAll('.ttt-cell').forEach(cell => {
    cell.addEventListener('click', (e) => {
        const idx = e.target.dataset.index;
        if (!tttMyTurn || tttBoard[idx]) return;
        
        makeTTTMove(idx, myTTTSymbol);
        conn.send({ type: 'TTT_MOVE', index: idx, player: myTTTSymbol });
        
        tttMyTurn = false;
        updateTTTTurnDisplay();
        checkTTTWin();
    });
});

function handleTTTMove(index, playerSymbol) {
    makeTTTMove(index, playerSymbol);
    tttMyTurn = true;
    updateTTTTurnDisplay();
    checkTTTWin();
}

function makeTTTMove(index, symbol) {
    tttBoard[index] = symbol;
    const cell = document.querySelector(`.ttt-cell[data-index="${index}"]`);
    cell.textContent = symbol;
    cell.classList.add(symbol.toLowerCase());
}

function checkTTTWin() {
    const lines = [
        [0, 1, 2], [3, 4, 5], [6, 7, 8], // rows
        [0, 3, 6], [1, 4, 7], [2, 5, 8], // cols
        [0, 4, 8], [2, 4, 6]             // diagonals
    ];
    
    let winner = null;
    for (const [a, b, c] of lines) {
        if (tttBoard[a] && tttBoard[a] === tttBoard[b] && tttBoard[a] === tttBoard[c]) {
            winner = tttBoard[a];
            break;
        }
    }
    
    if (!winner && !tttBoard.includes(null)) {
        winner = 'Draw';
    }
    
    if (winner) {
        document.getElementById('ttt-result').classList.remove('hidden');
        document.getElementById('ttt-turn-display').textContent = "Game Over!";
        const resText = document.getElementById('ttt-winner-text');
        
        if (winner === 'Draw') {
            resText.textContent = "It's a draw!";
        } else if (winner === myTTTSymbol) {
            resText.textContent = "You Win! 🏆";
        } else {
            resText.textContent = "Partner Wins! 😭";
        }
        tttMyTurn = false; // Freeze board
    }
}
