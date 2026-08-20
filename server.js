/**
 * Embabi Games — Server
 * Free Agent Dilemma: paired auction with REAL football players only.
 * v2: Custom team names, bid-from-0, hidden gem rounds, expanded match stats.
 */

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  pingInterval: 15000,
  pingTimeout: 30000,
});

const PORT = process.env.PORT || 3000;
const MAX_PLAYERS = 2;
const REVEAL_MS = 3500;
const BID_TIMER_SECONDS = 15;
const GRACE_PERIOD_MS = 60000; // 60 seconds for reconnect

const MODE_CONFIG = {
  '5v5': {
    budget: 100,
    sequence: ['GK', 'CB', 'CM', 'CM', 'ST'],
  },
  '11v11': {
    budget: 200,
    sequence: ['GK', 'RB', 'CB', 'CB', 'LB', 'CM', 'CM', 'CM', 'RW', 'LW', 'ST', 'Manager'],
  },
};

// ---------------------------------------------------------------------------
// Real football players DB (Icons + current stars)
// ---------------------------------------------------------------------------
const { realPlayersDB } = require('./database.js');

// ---------------------------------------------------------------------------
// Room state
// ---------------------------------------------------------------------------
// Session Recovery: maps sessionId → player data. playerOrder stores sessionIds.
// ---------------------------------------------------------------------------
const rooms = {};
const sessionToRoom = {};

// Maps sessionId → disconnect grace period setTimeout ref
const disconnectTimers = {};

app.use(express.static(path.join(__dirname, 'public')));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function generateRoomId() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 5; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function createRoomState(roomId) {
  return {
    id: roomId,
    phase: 'lobby',
    mode: null,
    sequence: [],
    currentRoundIndex: 0,
    players: {},          // keyed by sessionId
    playerOrder: [],      // array of sessionIds
    usedPlayerNames: new Set(),
    round: null,
    pendingAssignments: null,
    revealTimer: null,
    nextRoundTimer: null,
    bidTimer: null,
    timeLeft: 0,
    paused: false,        // true when a player is disconnected during auction
  };
}

function clearTimers(room) {
  if (room.revealTimer) {
    clearTimeout(room.revealTimer);
    room.revealTimer = null;
  }
  if (room.nextRoundTimer) {
    clearTimeout(room.nextRoundTimer);
    room.nextRoundTimer = null;
  }
  if (room.bidTimer) {
    clearInterval(room.bidTimer);
    room.bidTimer = null;
  }
}

/**
 * Pause the bid timer (on disconnect). Saves remaining timeLeft in room.timeLeft.
 */
function pauseBidTimer(room) {
  if (room.bidTimer) {
    clearInterval(room.bidTimer);
    room.bidTimer = null;
    console.log(`[Room ${room.id}] Bid timer PAUSED at ${room.timeLeft}s remaining`);
  }
  room.paused = true;
}

/**
 * Start (or restart) the bid timer. Called on first valid bid and on every
 * subsequent bid. NOT called at round start — timer is delayed until opener bids.
 * @param {number} [seconds] - override starting seconds (used for resume)
 */
function startBidTimer(room, seconds) {
  if (room.bidTimer) clearInterval(room.bidTimer);
  room.timeLeft = seconds != null ? seconds : BID_TIMER_SECONDS;
  room.paused = false;
  io.to(room.id).emit('timerUpdate', { timeLeft: room.timeLeft });

  room.bidTimer = setInterval(() => {
    room.timeLeft -= 1;
    console.log(`[Room ${room.id}] Timer tick:`, room.timeLeft);
    io.to(room.id).emit('timerUpdate', { timeLeft: room.timeLeft });

    if (room.timeLeft <= 0) {
      clearInterval(room.bidTimer);
      room.bidTimer = null;
      io.to(room.id).emit('auctionEnded', { message: 'Time is up!' });

      if (!room.round || !room.round.active) return;

      // Auto-pass for the idle player
      let passingSessionId;
      if (room.round.highestBidderId) {
        // The person who DIDN'T bid last must pass
        passingSessionId = getOtherPlayerId(room, room.round.highestBidderId);
      } else {
        // No bids placed at all — opener failed to bid; opener passes
        passingSessionId = room.round.openerId;
      }

      if (passingSessionId) {
        const winnerId = getOtherPlayerId(room, passingSessionId);
        const finalBid = room.round.highestBid;

        const freePlayer = generateFreePlayer(room, room.round.auctionPlayer);
        room.round.freePlayer  = freePlayer;
        room.round.freeOutcome = freePlayer.outcome;

        resolveRound(room, winnerId, finalBid);
      }
    }
  }, 1000);
}

function resetAuctionProgress(room) {
  clearTimers(room);
  room.phase = 'lobby';
  room.mode = null;
  room.sequence = [];
  room.currentRoundIndex = 0;
  room.usedPlayerNames.clear();
  room.round = null;
  room.pendingAssignments = null;
  room.paused = false;
}

function getHostId(room) {
  return room.playerOrder[0] || null;
}

/** Look up a player's current socket.id from their sessionId */
function getSocketId(room, sessionId) {
  const p = room.players[sessionId];
  return p ? p.socketId : null;
}

/** Emit an event to a specific session's socket (if connected) */
function emitToSession(room, sessionId, event, data) {
  const sid = getSocketId(room, sessionId);
  if (sid) io.to(sid).emit(event, data);
}

/** Normalize DB row → runtime player object (never invent names). */
function toRuntimePlayer(dbPlayer, { free = false } = {}) {
  return {
    name: dbPlayer.name,
    position: dbPlayer.position,
    ovr: dbPlayer.baseOvr,
    basePrice: 0, // all auctions start at 0M
  };
}

function publicPlayer(p) {
  if (!p) return null;
  return {
    name: p.name,
    position: p.position,
    ovr: p.ovr,
    basePrice: p.basePrice,
  };
}

function getUpdateStatePayload(room) {
  const players = room.playerOrder.map((sessionId) => {
    const p = room.players[sessionId];
    return {
      id: sessionId,          // frontend uses sessionId as identity
      label: p.label,
      budget: p.budget,
      squad: p.squad.map((s) => ({ ...s })),
      isHost: p.isHost,
      isConnected: p.isConnected,
    };
  });

  const highestBidderId = room.round ? room.round.highestBidderId : null;
  const highestBidderPlayer =
    highestBidderId && room.players[highestBidderId]
      ? room.players[highestBidderId]
      : null;

  const auctionPlayer = room.round ? room.round.auctionPlayer : null;
  const revealing = Boolean(room.round && room.round.revealing);

  return {
    roomId: room.id,
    phase: room.phase,
    mode: room.mode,
    sequence: [...room.sequence],
    currentRoundIndex: room.currentRoundIndex,
    totalRounds: room.sequence.length,
    hostId: getHostId(room),
    seatsFilled: room.playerOrder.length,
    players,
    currentBid: room.round ? room.round.highestBid : null,
    highestBidder: highestBidderPlayer
      ? { id: highestBidderId, label: highestBidderPlayer.label }
      : null,
    currentPlayer: auctionPlayer ? publicPlayer(auctionPlayer) : null,
    auctionPlayer: auctionPlayer ? publicPlayer(auctionPlayer) : null,
    freePlayerHidden: Boolean(room.round && room.round.active),
    openerId: room.round ? room.round.openerId : null,
    revealing,
    roundActive: Boolean(room.round && room.round.active),
    paused: room.paused,
  };
}

function broadcastState(room) {
  io.to(room.id).emit('updateState', getUpdateStatePayload(room));
}

function sendStateTo(room, socket) {
  socket.emit('updateState', getUpdateStatePayload(room));
}

function randInt(min, max) {
  return min + Math.floor(Math.random() * (max - min + 1));
}

function playersAtPosition(position) {
  return realPlayersDB.filter((p) => p.position === position);
}

function availableAtPosition(position, excludeNames) {
  const pool = playersAtPosition(position);
  const free = pool.filter((p) => !excludeNames.has(p.name));
  return free.length > 0 ? free : pool;
}

/**
 * Pick auction target: random unused real player for the sequence slot.
 */
function pickAuctionPlayerForSlot(room) {
  if (!Array.isArray(room.sequence) || room.sequence.length === 0) return null;
  const index = room.currentRoundIndex;
  if (index < 0 || index >= room.sequence.length) return null;

  const neededPosition = room.sequence[index];
  const choices = availableAtPosition(neededPosition, room.usedPlayerNames);
  if (!choices.length) return null;

  const pick = choices[Math.floor(Math.random() * choices.length)];
  room.usedPlayerNames.add(pick.name);
  return toRuntimePlayer(pick);
}

/**
 * Dynamic Free Agent Generator — called at pass-time, NOT at round start.
 *
 * Exact probabilities (rolled 0–99):
 *   0–24   → 25%: Significantly Weaker (OVR 10–15 LOWER than target)
 *   25–74  → 50%: Slightly Weaker      (OVR  1–5  LOWER than target)
 *   75–99  → 25%: Hidden Gem           (OVR  2–5  HIGHER than target)
 *
 * Picks the real same-position player from the DB whose baseOvr is closest
 * to the calculated targetOvr, so every free agent is an authentic name.
 */
function generateFreePlayer(room, auctionPlayer) {
  const roll = Math.floor(Math.random() * 100); // 0-99
  let targetOvr;
  let outcome;

  if (roll < 25) {
    // 25%: Significantly Weaker
    targetOvr = auctionPlayer.ovr - randInt(10, 15);
    outcome = 'weak';
  } else if (roll < 75) {
    // 50%: Slightly Weaker
    targetOvr = auctionPlayer.ovr - randInt(1, 5);
    outcome = 'standard';
  } else {
    // 25%: Hidden Gem — better than the target!
    targetOvr = auctionPlayer.ovr + randInt(2, 5);
    outcome = 'gem';
  }

  targetOvr = Math.max(45, Math.min(99, targetOvr));

  const exclude = new Set(room.usedPlayerNames);
  exclude.add(auctionPlayer.name);

  let candidates = availableAtPosition(auctionPlayer.position, exclude);

  // Find the real player with the closest baseOvr to our target
  let bestDistance = Infinity;
  for (const p of candidates) {
    const d = Math.abs(p.baseOvr - targetOvr);
    if (d < bestDistance) bestDistance = d;
  }

  const closest = candidates.filter(
    (p) => Math.abs(p.baseOvr - targetOvr) === bestDistance
  );

  if (!closest.length) {
    // Absolute fallback: any unused same-position player
    candidates = playersAtPosition(auctionPlayer.position);
    const pick = candidates[Math.floor(Math.random() * candidates.length)];
    room.usedPlayerNames.add(pick.name);
    return { ...toRuntimePlayer(pick, { free: true }), outcome };
  }

  const pick = closest[Math.floor(Math.random() * closest.length)];
  room.usedPlayerNames.add(pick.name);

  console.log(
    `[Room ${room.id}] Free agent roll=${roll} (${outcome}): target OVR ${targetOvr} → ${pick.name} (${pick.baseOvr})`
  );

  return { ...toRuntimePlayer(pick, { free: true }), outcome };
}

function startNewRound(room) {
  if (room.phase !== 'auction') return;
  if (room.playerOrder.length < MAX_PLAYERS) return;
  if (!Array.isArray(room.sequence) || room.sequence.length === 0) return;

  if (room.currentRoundIndex >= room.sequence.length) {
    finishAuction(room);
    return;
  }

  const auctionPlayer = pickAuctionPlayerForSlot(room);
  if (!auctionPlayer) {
    console.error(`[Room ${room.id}] Failed to pick auction player; finishing.`);
    finishAuction(room);
    return;
  }

  // Free player is NOT generated here — it is generated dynamically
  // the moment someone clicks Pass, keeping the outcome completely secret.
  // تحديد مين اللي عليه الدور يفتح المزاد (بالتبادل)
  const openerId = room.playerOrder[room.currentRoundIndex % 2];

  room.round = {
    auctionPlayer,
    freePlayer: null,   
    freeOutcome: null,  
    highestBid: 0,
    highestBidderId: null,
    openerId: openerId, // <-- ضفنا اللاعب المجبر يزايد هنا
    active: true,
    revealing: false,
  };
  room.pendingAssignments = null;

  io.to(room.id).emit('newRound', {
    auctionPlayer: publicPlayer(auctionPlayer),
    hasFreeAgent: true,
    highestBid: 0,
    currentRoundIndex: room.currentRoundIndex,
    totalRounds: room.sequence.length,
    slotPosition: room.sequence[room.currentRoundIndex],
  });
  broadcastState(room);
}
// ---------------------------------------------------------------------------
// Match Simulation — Enhanced with stats
// ---------------------------------------------------------------------------

/**
 * Simulate goals for one team given their OVR share vs opponent.
 */
function simulateTeamGoals(teamOvr, opponentOvr) {
  const total = teamOvr + opponentOvr;
  if (total === 0) return randInt(0, 3);

  const ovrShare = teamOvr / total;
  const baseExpected = 0.5 + ovrShare * 3.0;
  const upset = 0.7 + Math.random() * 0.6;
  const expected = baseExpected * upset;

  let goals = 0;
  let prob = Math.exp(-expected);
  let cumulative = prob;
  const roll = Math.random();
  while (goals < 7 && cumulative < roll) {
    goals++;
    prob *= expected / goals;
    cumulative += prob;
  }
  return goals;
}

/**
 * FEATURE 5 — Generate match stats based on OVR difference.
 */
function generateMatchStats(p1Ovr, p2Ovr, p1Goals, p2Goals) {
  const total = p1Ovr + p2Ovr || 1;
  const p1Share = p1Ovr / total;
  const p2Share = p2Ovr / total;

  // Possession: OVR-weighted with small random noise
  const p1Poss = Math.round(Math.max(30, Math.min(70, p1Share * 100 + (Math.random() * 8 - 4))));
  const p2Poss = 100 - p1Poss;

  // Total shots: winner tends to have more
  const p1TotalShots = Math.max(2, Math.round(p1Goals * 3.5 + (Math.random() * 5 + 2)));
  const p2TotalShots = Math.max(2, Math.round(p2Goals * 3.5 + (Math.random() * 5 + 2)));

  // Shots on target: roughly goals + 1-3 more
  const p1ShotsOnTarget = Math.max(p1Goals, Math.min(p1TotalShots, p1Goals + randInt(1, 3)));
  const p2ShotsOnTarget = Math.max(p2Goals, Math.min(p2TotalShots, p2Goals + randInt(1, 3)));

  return { p1Poss, p2Poss, p1TotalShots, p2TotalShots, p1ShotsOnTarget, p2ShotsOnTarget };
}

/**
 * FEATURE 5 — Pick a Man of the Match from the winning squad.
 * Excludes managers and picks a random outfield/GK player.
 */
function pickMotm(squad) {
  if (!squad || squad.length === 0) return null;
  const eligible = squad.filter((p) => p.position !== 'Manager');
  if (eligible.length === 0) return squad[0];
  return eligible[Math.floor(Math.random() * eligible.length)];
}

/**
 * Generate match commentary highlights.
 */
function generateCommentary(p1Label, p2Label, p1Goals, p2Goals, p1Squad, p2Squad) {
  const events = [];
  const minutePool = [];
  for (let i = 0; i < 90; i++) minutePool.push(i + 1);

  // Shuffle minutes
  for (let i = minutePool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [minutePool[i], minutePool[j]] = [minutePool[j], minutePool[i]];
  }

  const goalMinutes = minutePool.slice(0, p1Goals + p2Goals).sort((a, b) => a - b);
  let g1 = 0, g2 = 0;
  const p1Scorers = p1Squad.filter((p) => ['ST', 'LW', 'RW', 'CM'].includes(p.position));
  const p2Scorers = p2Squad.filter((p) => ['ST', 'LW', 'RW', 'CM'].includes(p.position));

  goalMinutes.forEach((min, i) => {
    // Alternately assign goals — weighted by goals remaining for each team
    const p1Remaining = p1Goals - g1;
    const p2Remaining = p2Goals - g2;
    let scoringTeamLabel, scorerName;

    if (p1Remaining > 0 && (p2Remaining === 0 || Math.random() < p1Remaining / (p1Remaining + p2Remaining))) {
      g1++;
      scoringTeamLabel = p1Label;
      const pool = p1Scorers.length ? p1Scorers : p1Squad;
      const scorer = pool[Math.floor(Math.random() * pool.length)];
      scorerName = scorer ? scorer.name : 'Unknown';
    } else if (p2Remaining > 0) {
      g2++;
      scoringTeamLabel = p2Label;
      const pool = p2Scorers.length ? p2Scorers : p2Squad;
      const scorer = pool[Math.floor(Math.random() * pool.length)];
      scorerName = scorer ? scorer.name : 'Unknown';
    } else {
      return;
    }

    events.push({ minute: min, team: scoringTeamLabel, scorer: scorerName, type: 'goal' });
  });

  return events;
}

function simulateMatch(room) {
  const ids = room.playerOrder;
  if (ids.length < 2) return;

  const p1 = room.players[ids[0]];
  const p2 = room.players[ids[1]];
  if (!p1 || !p2) return;

  const p1Ovr = p1.squad.reduce((s, pl) => s + (pl.ovr || 0), 0);
  const p2Ovr = p2.squad.reduce((s, pl) => s + (pl.ovr || 0), 0);

  const p1Goals = simulateTeamGoals(p1Ovr, p2Ovr);
  const p2Goals = simulateTeamGoals(p2Ovr, p1Ovr);

  let winnerId;
  if (p1Goals > p2Goals) winnerId = ids[0];
  else if (p2Goals > p1Goals) winnerId = ids[1];
  else winnerId = 'draw';

  // FEATURE 5: Generate stats, MOTM, commentary
  const stats = generateMatchStats(p1Ovr, p2Ovr, p1Goals, p2Goals);
  const commentary = generateCommentary(p1.label, p2.label, p1Goals, p2Goals, p1.squad, p2.squad);

  let motm = null;
  if (winnerId !== 'draw') {
    const winnerPlayer = room.players[winnerId];
    if (winnerPlayer) motm = pickMotm(winnerPlayer.squad);
  }

  room.phase = 'simulation';

  io.to(room.id).emit('matchResult', {
    p1Id: ids[0],
    p2Id: ids[1],
    p1Label: p1.label,
    p2Label: p2.label,
    p1Ovr,
    p2Ovr,
    p1Goals,
    p2Goals,
    winnerId,
    stats,
    commentary,
    motm,
  });

  broadcastState(room);
}

function finishAuction(room) {
  clearTimers(room);
  room.phase = 'finished';
  room.round = null;
  room.pendingAssignments = null;
  io.to(room.id).emit('auctionFinished', {
    message: 'Squads Completed! Preparing Match Simulation...',
  });
  broadcastState(room);

  setTimeout(() => {
    simulateMatch(room);
  }, 2200);
}

/** Returns the OTHER player's sessionId */
function getOtherPlayerId(room, sessionId) {
  return room.playerOrder.find((id) => id !== sessionId) || null;
}

function resolveRound(room, winnerId, finalBid) {
  const winner = room.players[winnerId];
  const loserId = getOtherPlayerId(room, winnerId);
  const loser = loserId ? room.players[loserId] : null;

  if (!winner || !loser || !room.round) return;

  if (winner.budget < finalBid) {
    emitToSession(room, winnerId, 'error', {
      message: `Cannot award player — insufficient budget (${winner.budget}M).`,
    });
    return;
  }

  winner.budget -= finalBid;
  room.round.active = false;
  room.round.revealing = true;

  const auctionAward = {
    ...room.round.auctionPlayer,
    boughtFor: finalBid,
  };
  const freeAward = {
    name: room.round.freePlayer.name,
    position: room.round.freePlayer.position,
    ovr: room.round.freePlayer.ovr,
    basePrice: 0,
    boughtFor: 0,
    outcome: room.round.freeOutcome,
  };

  room.pendingAssignments = {
    winnerId,
    loserId,
    auctionAward,
    freeAward,
  };

  io.to(room.id).emit('revealRound', {
    auctionPlayer: publicPlayer(auctionAward),
    freePlayer: {
      name: freeAward.name,
      position: freeAward.position,
      ovr: freeAward.ovr,
      outcome: freeAward.outcome,
    },
    winnerId,
    winnerLabel: winner.label,
    loserId,
    loserLabel: loser.label,
    finalBid,
    currentRoundIndex: room.currentRoundIndex,
    isHiddenGem: Boolean(freeAward.outcome === 'gem'),
  });

  broadcastState(room);

  clearTimers(room);
  room.revealTimer = setTimeout(() => {
    applyPendingSnap(room);
  }, REVEAL_MS);
}

function applyPendingSnap(room) {
  room.revealTimer = null;
  const pending = room.pendingAssignments;
  if (!pending) return;

  const winner = room.players[pending.winnerId];
  const loser = room.players[pending.loserId];

  // WINNER gets the auctionAward (paid), LOSER gets freeAward (free)
  if (winner) winner.squad.push(pending.auctionAward);
  if (loser) loser.squad.push(pending.freeAward);

  room.pendingAssignments = null;
  room.currentRoundIndex += 1;

  if (room.round) {
    room.round.revealing = false;
    room.round = null;
  }

  io.to(room.id).emit('squadsSnapped', {
    message: 'Players assigned to pitches.',
  });
  broadcastState(room);

  room.nextRoundTimer = setTimeout(() => {
    room.nextRoundTimer = null;
    if (room.phase !== 'auction') return;
    if (room.playerOrder.length < MAX_PLAYERS) return;

    if (room.currentRoundIndex >= room.sequence.length) {
      finishAuction(room);
    } else {
      startNewRound(room);
    }
  }, 900);
}

function applyModeToPlayers(room, modeKey) {
  const config = MODE_CONFIG[modeKey];
  if (!config) return false;

  clearTimers(room);
  room.mode = modeKey;
  room.sequence = [...config.sequence];
  room.currentRoundIndex = 0;
  room.usedPlayerNames.clear();
  room.round = null;
  room.pendingAssignments = null;
  room.phase = 'auction';
  room.paused = false;

  room.playerOrder.forEach((sessionId) => {
    const p = room.players[sessionId];
    if (p) {
      p.budget = config.budget;
      p.squad = [];
    }
  });

  return true;
}

function getModeBudget(room) {
  if (!room.mode || !MODE_CONFIG[room.mode]) return 0;
  return MODE_CONFIG[room.mode].budget;
}

// ---------------------------------------------------------------------------
// Socket.io — Session Recovery architecture
// ---------------------------------------------------------------------------

/** Resolve sessionId for a socket (from handshake auth) */
function getSessionIdFromSocket(socket) {
  return (socket.handshake && socket.handshake.auth && socket.handshake.auth.sessionId) || null;
}

io.on('connection', (socket) => {
  const sessionId = getSessionIdFromSocket(socket);
  console.log(`Connected: socket=${socket.id} session=${sessionId}`);

  if (!sessionId) {
    socket.emit('error', { message: 'No session ID provided. Please refresh.' });
    socket.disconnect(true);
    return;
  }

  // ─── RECONNECT PATH ──────────────────────────────────────────────────
  const roomId = sessionToRoom[sessionId];
  let room = roomId ? rooms[roomId] : null;

  if (room && room.players[sessionId]) {
    const existingPlayer = room.players[sessionId];
    console.log(`RECONNECT: ${sessionId} (${existingPlayer.label}) returning to room ${room.id}`);

    // Rejoin Socket.io room
    socket.join(room.id);

    // Clear any pending grace period forfeit timer
    if (disconnectTimers[sessionId]) {
      clearTimeout(disconnectTimers[sessionId]);
      delete disconnectTimers[sessionId];
      console.log(`Grace period timer cleared for ${sessionId}`);
    }

    // Update the socket mapping
    const oldSocketId = existingPlayer.socketId;
    if (oldSocketId && oldSocketId !== socket.id) {
      const oldSocket = io.sockets.sockets.get(oldSocketId);
      if (oldSocket) {
        console.log(`Duplicate session detected. Kicked old socket for session ${sessionId}`);
        oldSocket.disconnect(true);
      }
    }
    existingPlayer.socketId = socket.id;
    existingPlayer.isConnected = true;

    // Tell the reconnected client who they are — use sessionRestored so the
    // client can bypass the lobby name-step and jump straight into the game.
    socket.emit('sessionRestored', {
      playerId: sessionId,
      label: existingPlayer.label,
      isHost: existingPlayer.isHost,
      phase: room.phase,
      mode: room.mode,
      roomId: room.id,
    });

    // If game was paused, resume it
    if (room.paused && room.phase === 'auction') {
      room.paused = false;
      // Notify opponent
      const opponentId = getOtherPlayerId(room, sessionId);
      if (opponentId) {
        emitToSession(room, opponentId, 'opponentReconnected', {
          message: `${existingPlayer.label} reconnected! Resuming match.`,
        });
      }

      // Resume the bid timer if there was time remaining and a bid was active
      if (room.round && room.round.active && room.timeLeft > 0 && room.round.highestBid > 0) {
        console.log(`[Room ${room.id}] Resuming bid timer at ${room.timeLeft}s`);
        startBidTimer(room, room.timeLeft);
      }
    }

    // Send current state so the client's UI catches up
    sendStateTo(room, socket);
    broadcastState(room);

    // If mid-reveal, re-send the reveal payload
    if (room.round && room.round.revealing && room.pendingAssignments) {
      const { auctionAward, freeAward, winnerId, loserId } = room.pendingAssignments;
      const winner = room.players[winnerId];
      const loser = room.players[loserId];
      socket.emit('revealRound', {
        auctionPlayer: publicPlayer(auctionAward),
        freePlayer: {
          name: freeAward.name,
          position: freeAward.position,
          ovr: freeAward.ovr,
          outcome: freeAward.outcome,
        },
        winnerId,
        winnerLabel: winner ? winner.label : 'Winner',
        loserId,
        loserLabel: loser ? loser.label : 'Loser',
        finalBid: auctionAward.boughtFor,
        currentRoundIndex: room.currentRoundIndex,
      });
    }

    // Re-register all event handlers for the new socket
    registerSocketHandlers(socket, sessionId);
    return;
  }

  // ─── NEW CONNECTION (NO ACTIVE ROOM) ─────────────────────────────────
  // Player is connected but not in a room yet. Wait for createRoom / joinRoom.
  socket.emit('connectedWaitingForRoom');

  socket.on('createRoom', ({ name }) => {
    if (typeof name !== 'string' || name.trim().length === 0) return;
    const sanitized = name.trim().substring(0, 24);

    const newRoom = createRoomState(generateRoomId());
    rooms[newRoom.id] = newRoom;

    newRoom.players[sessionId] = {
      sessionId,
      socketId: socket.id,
      label: sanitized,
      budget: 0,
      squad: [],
      isHost: true,
      isConnected: true,
    };
    newRoom.playerOrder.push(sessionId);
    sessionToRoom[sessionId] = newRoom.id;

    socket.join(newRoom.id);

    socket.emit('joined', {
      label: sanitized,
      isHost: true,
      phase: newRoom.phase,
      mode: newRoom.mode,
      roomId: newRoom.id,
    });

    sendStateTo(newRoom, socket);
    console.log(`[Room ${newRoom.id}] Created by ${sanitized} (session=${sessionId})`);
    registerSocketHandlers(socket, sessionId);
  });

  socket.on('joinRoom', ({ name, roomId: reqRoomId }) => {
    if (typeof name !== 'string' || name.trim().length === 0) return;
    const sanitized = name.trim().substring(0, 24);
    const targetRoomId = reqRoomId ? reqRoomId.toUpperCase() : null;

    const targetRoom = rooms[targetRoomId];
    if (!targetRoom) {
      socket.emit('error', { message: 'Room not found. Check the code and try again.' });
      return;
    }

    if (targetRoom.playerOrder.length >= MAX_PLAYERS) {
      socket.emit('joinError', { message: 'Match is already in progress. Room is full!' });
      return;
    }

    if (targetRoom.phase === 'finished' || targetRoom.phase === 'simulation') {
      socket.emit('error', { message: 'Match finished. Cannot join.' });
      return;
    }

    const startingBudget = targetRoom.phase === 'auction' ? getModeBudget(targetRoom) : 0;

    targetRoom.players[sessionId] = {
      sessionId,
      socketId: socket.id,
      label: sanitized,
      budget: startingBudget,
      squad: [],
      isHost: false,
      isConnected: true,
    };
    targetRoom.playerOrder.push(sessionId);
    sessionToRoom[sessionId] = targetRoom.id;

    socket.join(targetRoom.id);

    socket.emit('joined', {
      label: sanitized,
      isHost: false,
      phase: targetRoom.phase,
      mode: targetRoom.mode,
      roomId: targetRoom.id,
    });

    sendStateTo(targetRoom, socket);
    broadcastState(targetRoom);
    console.log(`[Room ${targetRoom.id}] ${sanitized} joined (${targetRoom.playerOrder.length}/${MAX_PLAYERS}) session=${sessionId}`);

    if (targetRoom.phase === 'auction' && targetRoom.playerOrder.length === MAX_PLAYERS) {
      if (targetRoom.round && (targetRoom.round.active || targetRoom.round.revealing)) {
        io.to(targetRoom.id).emit('matchReady');
        broadcastState(targetRoom);
      } else {
        io.to(targetRoom.id).emit('matchReady');
        startNewRound(targetRoom);
      }
    }

    registerSocketHandlers(socket, sessionId);
  });
});

// ---------------------------------------------------------------------------
// All per-socket event handlers — extracted so reconnect can re-register them
// ---------------------------------------------------------------------------
function registerSocketHandlers(socket, sessionId) {
  // Helpers to get the user's room
  function getMyRoom() {
    const rid = sessionToRoom[sessionId];
    return rid ? rooms[rid] : null;
  }

  // ── Team Name (Lobby only) ─────────────────────────────────────────────
  socket.on('setTeamName', ({ name }) => {
    const room = getMyRoom();
    if (!room) return;
    const player = room.players[sessionId];
    if (!player) return;
    if (typeof name === 'string' && name.trim().length > 0) {
      const sanitized = name.trim().substring(0, 24);
      player.label = sanitized;
      console.log(`[Room ${room.id}] ${sessionId} set team name: ${sanitized}`);
      broadcastState(room);
    }
  });

  // ── Start Game ─────────────────────────────────────────────────────────
  socket.on('startGame', ({ mode }) => {
    const room = getMyRoom();
    if (!room) return;
    if (!room.players[sessionId]) return;

    if (getHostId(room) !== sessionId) {
      socket.emit('error', { message: 'Only the host (first player) can start the game.' });
      return;
    }
    if (room.phase !== 'lobby') {
      socket.emit('error', { message: 'Game already started.' });
      return;
    }
    if (!MODE_CONFIG[mode]) {
      socket.emit('error', { message: 'Invalid mode. Choose 5v5 or 11v11.' });
      return;
    }
    if (!applyModeToPlayers(room, mode)) {
      socket.emit('error', { message: 'Could not apply game mode.' });
      return;
    }

    io.to(room.id).emit('gameStarted', {
      mode: room.mode,
      budget: MODE_CONFIG[mode].budget,
      sequence: room.sequence,
    });
    broadcastState(room);

    if (room.playerOrder.length === MAX_PLAYERS) {
      io.to(room.id).emit('matchReady');
      startNewRound(room);
    }
  });

  // ── Place Bid (with openerId enforcement & delayed timer start) ────────
  socket.on('placeBid', ({ amount }) => {
    const room = getMyRoom();
    if (!room) return;
    const player = room.players[sessionId];
    if (!player) return;

    if (room.phase !== 'auction' || !room.round || !room.round.active) {
      socket.emit('error', { message: 'No active auction round.' });
      return;
    }
    if (room.paused) {
      socket.emit('error', { message: 'Game is paused — waiting for opponent to reconnect.' });
      return;
    }

    const bidAmount = Number(amount);
    if (!Number.isFinite(bidAmount) || bidAmount <= 0) {
      socket.emit('error', { message: 'Invalid bid amount.' });
      return;
    }

    // Forced opening bid: only the opener can place the FIRST bid
    if (room.round.highestBid === 0) {
      if (sessionId !== room.round.openerId) {
        socket.emit('error', {
          message: "It is your opponent's turn to open the bidding this round!",
        });
        return;
      }
    }

    // Bid must be strictly greater than current highest bid
    if (bidAmount <= room.round.highestBid) {
      socket.emit('error', {
        message: `Bid must be greater than current bid of ${room.round.highestBid}M.`,
      });
      return;
    }

    // TURN-BASED: Prevent self-bidding
    if (room.round.highestBidderId === sessionId) {
      socket.emit('error', {
        message: 'You are already the highest bidder! Wait for your opponent to respond.',
      });
      return;
    }

    if (player.budget < bidAmount) {
      socket.emit('error', {
        message: `Not enough budget. You have ${player.budget}M, bid needs ${bidAmount}M.`,
      });
      return;
    }

    room.round.highestBid = bidAmount;
    room.round.highestBidderId = sessionId;
    broadcastState(room);

    // DELAYED TIMER: start (or reset) the countdown on every valid bid
    startBidTimer(room);
  });

  // ── Pass ────────────────────────────────────────────────────────────────
  socket.on('pass', () => {
    const room = getMyRoom();
    if (!room) return;
    const player = room.players[sessionId];
    if (!player) return;

    if (room.phase !== 'auction' || !room.round || !room.round.active) {
      socket.emit('error', { message: 'No active auction round.' });
      return;
    }
    if (room.paused) {
      socket.emit('error', { message: 'Game is paused — waiting for opponent to reconnect.' });
      return;
    }

    // The opener MUST bid before anyone can pass (no pass on 0 bids)
    if (room.round.highestBid === 0) {
      if (sessionId === room.round.openerId) {
        socket.emit('error', { message: 'You must open the bidding first!' });
      } else {
        socket.emit('error', { message: 'Wait for your opponent to open the bid.' });
      }
      return;
    }

    // ANTI-SELF-PASS: Highest bidder cannot pass
    if (room.round.highestBidderId === sessionId) {
      socket.emit('error', {
        message: 'You placed the highest bid! You cannot pass — wait for your opponent.',
      });
      return;
    }

    const otherId = getOtherPlayerId(room, sessionId);
    if (!otherId) {
      socket.emit('error', { message: 'Waiting for opponent.' });
      return;
    }

    const finalBid = room.round.highestBid;
    const winnerId = otherId;

    const winner = room.players[winnerId];
    if (!winner) {
      socket.emit('error', { message: 'Opponent not found.' });
      return;
    }

    if (winner.budget < finalBid) {
      socket.emit('error', {
        message: `Opponent cannot afford ${finalBid}M. Round stays open.`,
      });
      return;
    }

    // Dynamic free agent generation at pass-time
    const freePlayer = generateFreePlayer(room, room.round.auctionPlayer);
    room.round.freePlayer  = freePlayer;
    room.round.freeOutcome = freePlayer.outcome;

    resolveRound(room, winnerId, finalBid);
  });

  // ── Play Again ─────────────────────────────────────────────────────────
  socket.on('playAgain', () => {
    const room = getMyRoom();
    if (!room) return;
    console.log(`[Room ${room.id}] playAgain requested by ${sessionId}`);
    clearTimers(room);

    room.phase = 'lobby';
    room.mode = null;
    room.sequence = [];
    room.currentRoundIndex = 0;
    room.usedPlayerNames.clear();
    room.round = null;
    room.pendingAssignments = null;
    room.paused = false;

    room.playerOrder.forEach((id, idx) => {
      const p = room.players[id];
      if (p) {
        p.isHost = idx === 0;
        p.budget = 0;
        p.squad = [];
      }
    });

    broadcastState(room);
    io.to(room.id).emit('returnToLobby', { message: 'New game starting — back to lobby!' });
  });

  // ── Disconnect (Grace Period) ──────────────────────────────────────────
  socket.on('disconnect', () => {
    console.log(`Disconnected: socket=${socket.id} session=${sessionId}`);
    const room = getMyRoom();
    if (!room) return;

    const player = room.players[sessionId];
    if (!player) return;

    // Only process if this socket is still the current one for this session
    // (prevents stale sockets from triggering disconnect on reconnect)
    if (player.socketId !== socket.id) return;

    player.isConnected = false;

    // If we're in lobby, just remove them completely (no grace needed)
    if (room.phase === 'lobby') {
      delete room.players[sessionId];
      room.playerOrder = room.playerOrder.filter((id) => id !== sessionId);
      delete sessionToRoom[sessionId];

      // Re-assign host if the first player left
      room.playerOrder.forEach((id, idx) => {
        const p = room.players[id];
        if (p) p.isHost = idx === 0;
      });
      
      broadcastState(room);
      io.to(room.id).emit('opponentLeft', { message: 'Opponent left. Returning to lobby…' });

      // Clean up empty room
      if (room.playerOrder.length === 0) {
        delete rooms[room.id];
      }
      return;
    }

    // ── GRACE PERIOD: game is in progress ────────────────────────────────
    // Pause the bid timer if it's running
    if (room.bidTimer && room.round && room.round.active) {
      pauseBidTimer(room);
    }

    // Notify the opponent
    const opponentId = getOtherPlayerId(room, sessionId);
    if (opponentId) {
      emitToSession(room, opponentId, 'opponentDisconnected', {
        message: `${player.label} disconnected. Pausing game. Waiting 60s for reconnection...`,
      });
    }

    broadcastState(room);

    // Start the 60-second countdown to forfeit
    disconnectTimers[sessionId] = setTimeout(() => {
      console.log(`[Room ${room.id}] Grace period expired for ${sessionId} (${player.label}). Forfeiting.`);
      delete disconnectTimers[sessionId];

      // Fully remove the player and reset
      delete room.players[sessionId];
      room.playerOrder = room.playerOrder.filter((id) => id !== sessionId);
      delete sessionToRoom[sessionId];

      room.playerOrder.forEach((id, idx) => {
        const p = room.players[id];
        if (p) {
          p.isHost = idx === 0;
          p.budget = 0;
          p.squad = [];
        }
      });

      resetAuctionProgress(room);
      broadcastState(room);
      io.to(room.id).emit('opponentLeft', {
        message: `${player.label} failed to reconnect. Match forfeited. Returning to lobby…`,
      });

      if (room.playerOrder.length === 0) {
        delete rooms[room.id];
      }
    }, GRACE_PERIOD_MS);
  });
}

server.listen(PORT, () => {
  const count = realPlayersDB.length;
  console.log(`Embabi Games running at http://localhost:${PORT} (${count} real players loaded)`);
});
