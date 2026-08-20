/**
 * Embabi Games — Client v2
 * Features: custom team names, bid from 0, hidden gems, expanded match stats.
 * Server is source of truth via updateState / revealRound.
 */

(() => {
  'use strict';

  // -------------------------------------------------------------------------
  // AUDIO SYSTEM
  // -------------------------------------------------------------------------
  const bidSound = new Audio('https://assets.mixkit.co/active_storage/sfx/2568/2568-preview.mp3');
  const tickSound = new Audio('https://assets.mixkit.co/active_storage/sfx/2578/2578-preview.mp3');
  const winSound = new Audio('https://assets.mixkit.co/active_storage/sfx/2013/2013-preview.mp3');

  bidSound.volume = 0.5;
  tickSound.volume = 0.5;
  winSound.volume = 0.5;

  let audioUnlocked = false;
  function unlockAudio() {
    if (audioUnlocked) return;
    bidSound.play().then(() => bidSound.pause()).catch(() => {});
    tickSound.play().then(() => tickSound.pause()).catch(() => {});
    winSound.play().then(() => winSound.pause()).catch(() => {});
    audioUnlocked = true;
  }

  // -------------------------------------------------------------------------
  // DOM — Lobby
  // -------------------------------------------------------------------------
  const lobbyEl = document.getElementById('lobby');
  const lobbyStatusEl = document.getElementById('lobby-status');
  const lobbyHintEl = document.getElementById('lobby-hint');
  const lobbyNameStep = document.getElementById('lobby-name-step');
  const lobbyModeStep = document.getElementById('lobby-mode-step');
  const inputTeamName = document.getElementById('input-team-name');
  const inputRoomCode = document.getElementById('input-room-code');
  const btnCreateMatch = document.getElementById('btn-create-match');
  const btnJoinMatch = document.getElementById('btn-join-match');
  const lobbyNameError = document.getElementById('lobby-name-error');
  const btnMode5v5 = document.getElementById('btn-mode-5v5');
  const btnMode11v11 = document.getElementById('btn-mode-11v11');

  // DOM — Overlays / board
  const finishedOverlay = document.getElementById('finished-overlay');
  const boardEl = document.getElementById('board');

  // DOM — Auction center
  const statusEl = document.getElementById('status');
  const roomCodeDisplay = document.getElementById('room-code-display');
  const roomCodeValue = document.getElementById('room-code-value');
  const auctionEyebrow = document.getElementById('auction-eyebrow');
  const currentBidEl = document.getElementById('current-bid');
  const highestBidderEl = document.getElementById('highest-bidder');
  const toastEl = document.getElementById('toast');
  const inputBidAmount = document.getElementById('input-bid-amount');
  const btnPlaceBid = document.getElementById('btn-place-bid');
  const btnPass = document.getElementById('btn-pass');
  const freeSlotLabel = document.getElementById('free-slot-label');
  const auctionTimerEl = document.getElementById('auction-timer');
  const timerValueEl = document.getElementById('timer-value');

  // DOM — Auction cards
  const auctionCardEl = document.getElementById('auction-card');
  const auctionOvrEl = document.getElementById('auction-ovr');
  const auctionPosEl = document.getElementById('auction-pos');
  const auctionNameEl = document.getElementById('auction-name');
  const auctionMetaEl = document.getElementById('auction-meta');

  const freeCardEl = document.getElementById('free-card');
  const freeCardInner = document.getElementById('free-card-inner');
  const freeOvrEl = document.getElementById('free-ovr');
  const freePosEl = document.getElementById('free-pos');
  const freeNameEl = document.getElementById('free-name');
  const freeMetaEl = document.getElementById('free-meta');
  const freeOutcomeEl = document.getElementById('free-outcome');

  // DOM — Pitches / HUD
  const p1BudgetEl = document.getElementById('p1-budget');
  const p2BudgetEl = document.getElementById('p2-budget');
  const slotsP1 = document.getElementById('slots-p1');
  const slotsP2 = document.getElementById('slots-p2');
  const pitchColP1 = document.getElementById('pitch-col-p1');
  const pitchColP2 = document.getElementById('pitch-col-p2');
  const p1You = document.getElementById('p1-you');
  const p2You = document.getElementById('p2-you');
  const p1Title = document.getElementById('p1-title');
  const p2Title = document.getElementById('p2-title');

  // DOM — Scoreboard
  const scoreboardPreparing = document.getElementById('scoreboard-preparing');
  const scoreboardResult = document.getElementById('scoreboard-result');
  const sbP1Label = document.getElementById('sb-p1-label');
  const sbP1Goals = document.getElementById('sb-p1-goals');
  const sbP1Ovr = document.getElementById('sb-p1-ovr');
  const sbP2Label = document.getElementById('sb-p2-label');
  const sbP2Goals = document.getElementById('sb-p2-goals');
  const sbP2Ovr = document.getElementById('sb-p2-ovr');
  const sbWinnerBanner = document.getElementById('sb-winner-banner');
  const sbWinnerText = document.getElementById('sb-winner-text');
  const btnPlayAgain = document.getElementById('btn-play-again');

  // DOM — Stats (Feature 5)
  const sbStats = document.getElementById('sb-stats');
  const statP1Poss = document.getElementById('stat-p1-poss');
  const statP2Poss = document.getElementById('stat-p2-poss');
  const statPossFillL = document.getElementById('stat-poss-fill-l');
  const statPossFillR = document.getElementById('stat-poss-fill-r');
  const statP1Shots = document.getElementById('stat-p1-shots');
  const statP2Shots = document.getElementById('stat-p2-shots');
  const statShotsFillL = document.getElementById('stat-shots-fill-l');
  const statShotsFillR = document.getElementById('stat-shots-fill-r');
  const statP1Sot = document.getElementById('stat-p1-sot');
  const statP2Sot = document.getElementById('stat-p2-sot');
  const statSotFillL = document.getElementById('stat-sot-fill-l');
  const statSotFillR = document.getElementById('stat-sot-fill-r');

  // DOM — MOTM / Commentary (Feature 5)
  const sbMotm = document.getElementById('sb-motm');
  const motmOvr = document.getElementById('motm-ovr');
  const motmName = document.getElementById('motm-name');
  const motmPos = document.getElementById('motm-pos');
  const motmTeam = document.getElementById('motm-team');
  const sbCommentary = document.getElementById('sb-commentary');
  const commentaryList = document.getElementById('commentary-list');

  // -------------------------------------------------------------------------
  // Session identity — persistent across refreshes via localStorage
  // -------------------------------------------------------------------------
  function getOrCreateSessionId() {
    let id = localStorage.getItem('embabi_session_id');
    if (!id) {
      id = 'sess_' + Math.random().toString(36).substring(2) + Date.now().toString(36);
      localStorage.setItem('embabi_session_id', id);
    }
    return id;
  }
  const sessionId = getOrCreateSessionId();
  console.log('Session ID:', sessionId);

  // -------------------------------------------------------------------------
  // Session state
  // -------------------------------------------------------------------------
  let myId = null;  // will be set to sessionId from server
  let myLabel = null;
  let isHost = false;
  let phase = 'lobby';
  let roundActive = false;
  let lastBidShown = null;
  let pitchFrozen = false;
  let frozenSquads = { p1: [], p2: [] };
  let lastPlayers = [null, null];
  let revealLocalTimer = null;
  let teamNameSubmitted = false;
  let currentBudget = 0;

  // -------------------------------------------------------------------------
  // Pitch zone mapping — zonal row-based layout
  // -------------------------------------------------------------------------
  // Maps each position tag to its pitch zone.
  // Zones render top → bottom: attack → midfield → defense → gk
  const ZONE_MAP = {
    // Attack
    ST: 'attack', CF: 'attack',
    LW: 'attack', RW: 'attack',
    // Midfield
    CAM: 'midfield', CM: 'midfield', CDM: 'midfield',
    LM: 'midfield', RM: 'midfield',
    // Defense
    CB: 'defense', LB: 'defense', RB: 'defense',
    LWB: 'defense', RWB: 'defense',
    // Goalkeeper
    GK: 'gk',
    // Manager (rendered separately in corner)
    Manager: 'manager',
  };

  // Order zones are rendered top → bottom on the pitch
  const ZONE_ORDER = ['attack', 'midfield', 'defense', 'gk'];

  // -------------------------------------------------------------------------
  // Phase UI transitions
  // -------------------------------------------------------------------------
  function showLobby() {
    phase = 'lobby';
    pitchFrozen = false;
    clearRevealTimer();
    resetMysteryCard();
    lobbyEl.classList.remove('is-hidden');
    boardEl.classList.add('is-hidden');
    finishedOverlay.classList.add('is-hidden');
    scoreboardResult.classList.add('is-hidden');
    scoreboardPreparing.classList.remove('is-hidden');
    setBiddingEnabled(false);
    clearPitch(slotsP1);
    clearPitch(slotsP2);
    renderAuctionCard(null);
    // Show correct lobby step
    if (teamNameSubmitted) {
      lobbyNameStep.classList.add('is-hidden');
      lobbyModeStep.classList.remove('is-hidden');
    } else {
      lobbyNameStep.classList.remove('is-hidden');
      lobbyModeStep.classList.add('is-hidden');
    }
    updateHostControls();
  }

  function showAuction() {
    phase = 'auction';
    lobbyEl.classList.add('is-hidden');
    boardEl.classList.remove('is-hidden');
    finishedOverlay.classList.add('is-hidden');
  }

  function showFinished(message) {
    phase = 'finished';
    roundActive = false;
    pitchFrozen = false;
    clearRevealTimer();
    setBiddingEnabled(false);
    lobbyEl.classList.add('is-hidden');
    boardEl.classList.remove('is-hidden');
    finishedOverlay.classList.remove('is-hidden');
    scoreboardPreparing.classList.remove('is-hidden');
    scoreboardResult.classList.add('is-hidden');
    const textEl = scoreboardPreparing.querySelector('.finished-overlay__text');
    if (textEl && message) textEl.textContent = message;
  }

  function showScoreboard(data) {
    phase = 'simulation';
    scoreboardPreparing.classList.add('is-hidden');
    scoreboardResult.classList.remove('is-hidden');

    // Populate team names and scores
    sbP1Label.textContent = data.p1Label || 'Player 1';
    sbP2Label.textContent = data.p2Label || 'Player 2';

    animateCount(sbP1Goals, data.p1Goals, 900);
    animateCount(sbP2Goals, data.p2Goals, 900);

    sbP1Ovr.textContent = `Team OVR: ${data.p1Ovr}`;
    sbP2Ovr.textContent = `Team OVR: ${data.p2Ovr}`;

    // Highlight winner side
    const leftTeam = scoreboardResult.querySelector('.scoreboard-team--left');
    const rightTeam = scoreboardResult.querySelector('.scoreboard-team--right');
    leftTeam.classList.remove('is-winner', 'is-loser');
    rightTeam.classList.remove('is-winner', 'is-loser');
    sbWinnerBanner.classList.remove('is-draw', 'is-win');

    if (data.winnerId === 'draw') {
      sbWinnerText.textContent = "IT'S A DRAW!";
      sbWinnerBanner.classList.add('is-draw');
    } else if (data.winnerId === data.p1Id) {
      sbWinnerText.textContent = `${data.p1Label} WINS!`;
      sbWinnerBanner.classList.add('is-win');
      leftTeam.classList.add('is-winner');
      rightTeam.classList.add('is-loser');
    } else {
      sbWinnerText.textContent = `${data.p2Label} WINS!`;
      sbWinnerBanner.classList.add('is-win');
      rightTeam.classList.add('is-winner');
      leftTeam.classList.add('is-loser');
    }

    // FEATURE 5: Match Stats
    if (data.stats) {
      const s = data.stats;
      statP1Poss.textContent = `${s.p1Poss}%`;
      statP2Poss.textContent = `${s.p2Poss}%`;
      // Defer width setting to allow CSS transition to fire
      requestAnimationFrame(() => {
        statPossFillL.style.width = `${s.p1Poss}%`;
        statPossFillR.style.width = `${s.p2Poss}%`;
      });

      statP1Shots.textContent = s.p1TotalShots;
      statP2Shots.textContent = s.p2TotalShots;
      const totalShots = (s.p1TotalShots + s.p2TotalShots) || 1;
      requestAnimationFrame(() => {
        statShotsFillL.style.width = `${(s.p1TotalShots / totalShots) * 100}%`;
        statShotsFillR.style.width = `${(s.p2TotalShots / totalShots) * 100}%`;
      });

      statP1Sot.textContent = s.p1ShotsOnTarget;
      statP2Sot.textContent = s.p2ShotsOnTarget;
      const totalSot = (s.p1ShotsOnTarget + s.p2ShotsOnTarget) || 1;
      requestAnimationFrame(() => {
        statSotFillL.style.width = `${(s.p1ShotsOnTarget / totalSot) * 100}%`;
        statSotFillR.style.width = `${(s.p2ShotsOnTarget / totalSot) * 100}%`;
      });

      sbStats.classList.remove('is-hidden');
    }

    // FEATURE 5: Man of the Match
    if (data.motm && data.winnerId !== 'draw') {
      motmOvr.textContent = data.motm.ovr || '—';
      motmName.textContent = data.motm.name || '—';
      motmPos.textContent = data.motm.position || '—';
      const winnerLabel = data.winnerId === data.p1Id ? data.p1Label : data.p2Label;
      motmTeam.textContent = winnerLabel;
      sbMotm.classList.remove('is-hidden');
    } else {
      sbMotm.classList.add('is-hidden');
    }

    // FEATURE 5: Commentary / Highlights
    if (Array.isArray(data.commentary) && data.commentary.length > 0) {
      commentaryList.innerHTML = '';
      data.commentary.forEach((event, i) => {
        const li = document.createElement('li');
        li.className = 'commentary-item';
        li.style.animationDelay = `${i * 0.08}s`;
        li.innerHTML = `
          <span class="commentary-item__minute">${event.minute}'</span>
          <span class="commentary-item__event">⚽ <strong>${escapeHtml(event.scorer)}</strong> scores for <strong>${escapeHtml(event.team)}</strong>!</span>
        `;
        commentaryList.appendChild(li);
      });
      sbCommentary.classList.remove('is-hidden');
    } else {
      sbCommentary.classList.add('is-hidden');
    }
  }

  // -------------------------------------------------------------------------
  // Utility
  // -------------------------------------------------------------------------
  function animateCount(el, target, durationMs) {
    const start = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      el.textContent = Math.round(eased * target);
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function clearPitch(slotsEl) {
    slotsEl.innerHTML = '';
  }

  function clearRevealTimer() {
    if (revealLocalTimer) {
      clearTimeout(revealLocalTimer);
      revealLocalTimer = null;
    }
  }

  function setStatus(text) {
    statusEl.textContent = text;
  }

  function setLobbyStatus(text) {
    lobbyStatusEl.textContent = text;
  }

  let toastTimeout;
  function showToast(message, ok = false) {
    toastEl.textContent = message || '';
    toastEl.classList.toggle('is-ok', Boolean(ok));
    if (message) {
      toastEl.style.display = 'block';
      if (toastTimeout) clearTimeout(toastTimeout);
      toastTimeout = setTimeout(() => {
        toastEl.style.display = 'none';
        toastEl.textContent = '';
      }, 3000);
    } else {
      toastEl.style.display = 'none';
    }
  }

  // Fully enable or fully disable the entire bidding panel
  function setBiddingEnabled(enabled) {
    inputBidAmount.disabled = !enabled;
    btnPlaceBid.disabled = !enabled;
    btnPass.disabled = !enabled;
    if (!enabled) {
      // reset any waiting state
      inputBidAmount.placeholder = 'Enter bid (M)';
      inputBidAmount.classList.remove('is-waiting');
    }
  }

  /**
   * Turn-based: called when the round is active and both seats are filled.
   * If iAmHighestBidder === true  → disable input+button but keep Pass live.
   * If iAmHighestBidder === false → everything enabled normally.
   */
  function setTurnBasedBidding(iAmHighestBidder) {
    if (iAmHighestBidder) {
      // My turn is "locked" — I already bid, waiting for opponent
      inputBidAmount.disabled = true;
      btnPlaceBid.disabled = true;
      btnPass.disabled = false; // can still pass
      inputBidAmount.placeholder = 'Waiting for opponent…';
      inputBidAmount.classList.add('is-waiting');
    } else {
      // Opponent’s last action (or no bid yet) — my turn to act
      inputBidAmount.disabled = false;
      btnPlaceBid.disabled = false;
      btnPass.disabled = false;
      inputBidAmount.placeholder = 'Enter bid (M)';
      inputBidAmount.classList.remove('is-waiting');
    }
  }

  function pulseBid() {
    currentBidEl.classList.remove('is-pulse');
    void currentBidEl.offsetWidth;
    currentBidEl.classList.add('is-pulse');
  }

  function updateHostControls() {
    const canStart = isHost && phase === 'lobby' && teamNameSubmitted;
    btnMode5v5.disabled = !canStart;
    btnMode11v11.disabled = !canStart;

    if (!myId || phase !== 'lobby') {
      lobbyHintEl.textContent = '';
      return;
    }
    if (!teamNameSubmitted) {
      lobbyHintEl.textContent = '';
      return;
    }
    lobbyHintEl.textContent = isHost
      ? 'You are the host — choose a mode to begin.'
      : 'Waiting for the host to choose a game mode…';
  }

  // -------------------------------------------------------------------------
  // Pitch rendering — 5-lane fixed-position grid layout
  // -------------------------------------------------------------------------

  /**
   * Maps a player's position + occurrence index to a CSS Grid column (1–5).
   *
   * Lane map:
   *   1 = far-left flank  (LB, LW, LM, LWB)
   *   2 = left-center     (1st CB when 2+ exist, left CM when 2–3 CMs)
   *   3 = dead center     (GK, ST, CF, CAM, CDM; single CB; single CM)
   *   4 = right-center    (2nd CB when 2+ exist, right CM when 2–3 CMs)
   *   5 = far-right flank (RB, RW, RM, RWB)
   *
   * @param {string} pos          - player.position
   * @param {number} occIdx       - 0-based index among players of this pos
   * @param {number} total        - total players of this pos in the squad
   * @returns {string}            - CSS grid-column value ('1'…'5')
   */
  function getLaneForPlayer(pos, occIdx, total) {
    // ── Hard-left flank ──────────────────────────────────────
    if (pos === 'LB' || pos === 'LW' || pos === 'LM' || pos === 'LWB') return '1';

    // ── Hard-right flank ─────────────────────────────────────
    if (pos === 'RB' || pos === 'RW' || pos === 'RM' || pos === 'RWB') return '5';

    // ── Always-center single positions ───────────────────────
    if (pos === 'GK' || pos === 'ST' || pos === 'CF' ||
      pos === 'CAM' || pos === 'CDM') return '3';

    // ── CB: spread symmetrically around center ────────────────
    if (pos === 'CB') {
      if (total === 1) return '3';        // lone CB → center
      if (total === 2) return occIdx === 0 ? '2' : '4';        // L-center / R-center
      // 3+ CBs: 2 / 3 / 4
      if (occIdx === 0) return '2';
      if (occIdx === 1) return '3';
      return '4';
    }

    // ── CM: spread symmetrically around center ────────────────
    if (pos === 'CM') {
      if (total === 1) return '3';        // lone CM → center
      if (total === 2) return occIdx === 0 ? '2' : '4';        // box-to-box pair
      // 3 CMs: 2 / 3 / 4
      if (occIdx === 0) return '2';
      if (occIdx === 1) return '3';
      return '4';
    }

    return '3'; // safe fallback for unknown positions
  }

  function createPitchCard(player) {
    const el = document.createElement('article');
    el.className = 'player-card player-card--formation';

    const price =
      player.boughtFor === 0
        ? 'FREE'
        : player.boughtFor != null
          ? `${player.boughtFor}M`
          : '';

    el.innerHTML = `
      <span class="player-card__ovr">${player.ovr != null ? escapeHtml(player.ovr) : '—'}</span>
      <span class="player-card__pos">${escapeHtml(player.position)}</span>
      <span class="player-card__name">${escapeHtml(player.name)}</span>
      <span class="player-card__meta">${escapeHtml(price)}</span>
    `;
    return el;
  }

  function renderSquadOnPitch(slotsEl, squad) {
    // STEP 1 — Always inject all 4 grid rows FIRST.
    // Each row occupies a permanent 1fr slot in the outer .pitch__slots grid,
    // so the GK row is always anchored at the bottom even when empty.
    slotsEl.innerHTML = `
      <div class="pitch-row pitch-row--attack"></div>
      <div class="pitch-row pitch-row--midfield"></div>
      <div class="pitch-row pitch-row--defense"></div>
      <div class="pitch-row pitch-row--gk"></div>
    `;

    // Toggle eleven-a-side class for compact card scaling (squads > 6 = 11v11).
    const pitchEl = slotsEl.parentElement;
    if (pitchEl) {
      const isLargeSquad = Array.isArray(squad) && squad.length > 6;
      pitchEl.classList.toggle('eleven-a-side', isLargeSquad);
    }

    if (!Array.isArray(squad) || squad.length === 0) return;

    // STEP 2 — Pre-count each position (excluding Manager) so getLaneForPlayer
    //          knows the total when it needs to spread CB/CM symmetrically.
    const positionCounts = {};
    squad.forEach((player) => {
      const pos = player.position || 'CM';
      if (pos !== 'Manager') {
        positionCounts[pos] = (positionCounts[pos] || 0) + 1;
      }
    });

    // STEP 3 — Cache row references (always in DOM after Step 1)
    const rowAttack = slotsEl.querySelector('.pitch-row--attack');
    const rowMidfield = slotsEl.querySelector('.pitch-row--midfield');
    const rowDefense = slotsEl.querySelector('.pitch-row--defense');
    const rowGk = slotsEl.querySelector('.pitch-row--gk');
    const managers = [];

    // Per-position occurrence counter for lane computation
    const occurrenceTracker = {};

    // STEP 4 — Route each player into their zone row with a fixed grid lane
    squad.forEach((player) => {
      const pos = player.position || 'CM';

      if (pos === 'Manager') {
        managers.push(player);
        return;
      }

      // Determine this player's occurrence index (0-based) and total for their pos
      const occIdx = occurrenceTracker[pos] || 0;
      occurrenceTracker[pos] = occIdx + 1;
      const total = positionCounts[pos] || 1;

      // Build card and snap it to its fixed lane
      const card = createPitchCard(player);
      card.style.gridColumn = getLaneForPlayer(pos, occIdx, total);
      card.style.gridRow = '1'; // Force single row to prevent grid auto-placement wrapping

      // Route into the correct zone row
      if (pos === 'GK') {
        rowGk.appendChild(card);
      } else if (pos === 'CB' || pos === 'LB' || pos === 'RB' ||
        pos === 'LWB' || pos === 'RWB') {
        rowDefense.appendChild(card);
      } else if (pos === 'CM' || pos === 'CAM' || pos === 'CDM' ||
        pos === 'RM' || pos === 'LM') {
        rowMidfield.appendChild(card);
      } else if (pos === 'ST' || pos === 'RW' || pos === 'LW' ||
        pos === 'CF') {
        rowAttack.appendChild(card);
      } else {
        // Unknown position: fallback to midfield, center lane
        rowMidfield.appendChild(card);
      }
    });

    // STEP 5 — Manager: absolute corner badge (does not disturb the grid)
    managers.forEach((mgr) => {
      const mgrEl = document.createElement('div');
      mgrEl.className = 'pitch-manager';
      const price = mgr.boughtFor === 0 ? 'FREE'
        : mgr.boughtFor != null ? `${mgr.boughtFor}M` : '';
      mgrEl.innerHTML = `
        <span class="pitch-manager__label">MGR</span>
        <span class="pitch-manager__name">${escapeHtml(mgr.name)}</span>
        <span class="pitch-manager__price">${escapeHtml(price)}</span>
      `;
      slotsEl.appendChild(mgrEl);
    });
  }

  function renderAuctionCard(player, currentBid) {
    if (!player || !player.name) {
      auctionCardEl.classList.add('player-card--empty');
      auctionOvrEl.textContent = '—';
      auctionPosEl.textContent = '—';
      auctionNameEl.textContent = 'Waiting for round';
      auctionMetaEl.textContent = 'Bid from 0M';
      return;
    }

    auctionCardEl.classList.remove('player-card--empty');
    auctionOvrEl.textContent = player.ovr != null ? String(player.ovr) : '—';
    auctionPosEl.textContent = player.position || '—';
    auctionNameEl.textContent = player.name;
    // FEATURE 3: all auctions start from 0M
    const bid = currentBid != null ? `· Bid ${currentBid}M` : '';
    auctionMetaEl.textContent = `Starts 0M ${bid}`.trim();
  }

  function resetMysteryCard() {
    freeCardEl.classList.remove('is-revealed', 'is-gem', 'is-standard');
    freeCardInner.classList.remove('is-flipped');
    freeOvrEl.textContent = '—';
    freePosEl.textContent = '—';
    freeNameEl.textContent = '—';
    freeMetaEl.textContent = '0M · FREE';
    freeOutcomeEl.textContent = '';
  }

  function outcomeLabel(outcome) {
    if (outcome === 'gem') return '⭐ HIDDEN GEM — BETTER THAN THE TARGET!';
    return 'STANDARD FREE AGENT';
  }

  /**
   * Dramatic flip reveal of the free agent card.
   */
  function playReveal(payload) {
    const { freePlayer, winnerLabel, loserLabel, auctionPlayer, finalBid, isHiddenGem } = payload;

    pitchFrozen = true;
    roundActive = false;
    setBiddingEnabled(false);

    // Fill front face before flip
    freeOvrEl.textContent = freePlayer.ovr != null ? String(freePlayer.ovr) : '—';
    freePosEl.textContent = freePlayer.position || '—';
    freeNameEl.textContent = freePlayer.name || '—';
    freeMetaEl.textContent = '0M · FREE';
    freeOutcomeEl.textContent = outcomeLabel(freePlayer.outcome);

    freeCardEl.classList.remove('is-gem', 'is-standard');
    if (freePlayer.outcome === 'gem') {
      freeCardEl.classList.add('is-gem');
    } else {
      freeCardEl.classList.add('is-standard');
    }

    // Trigger CSS 3D flip
    requestAnimationFrame(() => {
      freeCardInner.classList.add('is-flipped');
      freeCardEl.classList.add('is-revealed');
    });

    setStatus(
      `${winnerLabel} paid ${finalBid}M for ${auctionPlayer.name} · ${loserLabel} gets the free agent`
    );
    showToast(
      `${outcomeLabel(freePlayer.outcome)}`,
      freePlayer.outcome === 'gem'
    );

    clearRevealTimer();
    revealLocalTimer = setTimeout(() => {
      pitchFrozen = false;
      revealLocalTimer = null;
    }, 3500);
  }

  function renderSeat(player, budgetEl, slotsEl, colEl, youEl, titleEl, seatKey) {
    if (player) {
      budgetEl.textContent = player.budget;
      // FEATURE 2: Update team name in HUD
      if (titleEl) titleEl.textContent = player.label || (seatKey === 'p1' ? 'Player 1' : 'Player 2');
      const squad = pitchFrozen ? frozenSquads[seatKey] : player.squad;
      renderSquadOnPitch(slotsEl, squad);
      const isMe = player.id === myId;
      colEl.classList.toggle('is-you', isMe);
      youEl.classList.toggle('is-hidden', !isMe);
      // Update local budget cache for my seat
      if (isMe) currentBudget = player.budget;
    } else {
      budgetEl.textContent = '—';
      if (titleEl) titleEl.textContent = seatKey === 'p1' ? 'Player 1' : 'Player 2';
      clearPitch(slotsEl);
      colEl.classList.remove('is-you');
      youEl.classList.add('is-hidden');
    }
  }

  function snapshotSquadsFromPlayers(players) {
    const p1 = Array.isArray(players) ? players[0] : null;
    const p2 = Array.isArray(players) ? players[1] : null;
    frozenSquads = {
      p1: p1 && Array.isArray(p1.squad) ? p1.squad.map((s) => ({ ...s })) : [],
      p2: p2 && Array.isArray(p2.squad) ? p2.squad.map((s) => ({ ...s })) : [],
    };
  }

  function applyUpdateState(state) {
    if (!state) return;

    if (state.phase && state.phase !== phase) {
      if (state.phase === 'lobby') showLobby();
      else if (state.phase === 'auction') showAuction();
      else if (state.phase === 'finished') {
        showFinished('Squads Completed! Preparing Match Simulation...');
      }
    }

    if (state.id) {
      roomCodeDisplay.style.display = 'block';
      roomCodeValue.textContent = state.id;
    }

    if (typeof state.hostId === 'string') {
      isHost = state.hostId === myId;
      updateHostControls();
    }

    if (Array.isArray(state.players)) {
      lastPlayers = state.players;
    }

    if (state.revealing) {
      if (!pitchFrozen) snapshotSquadsFromPlayers(state.players);
      pitchFrozen = true;
    } else {
      pitchFrozen = false;
      clearRevealTimer();
    }

    const p1 = Array.isArray(state.players) ? state.players[0] : null;
    const p2 = Array.isArray(state.players) ? state.players[1] : null;

    renderSeat(p1, p1BudgetEl, slotsP1, pitchColP1, p1You, p1Title, 'p1');
    renderSeat(p2, p2BudgetEl, slotsP2, pitchColP2, p2You, p2Title, 'p2');

    const auction = state.auctionPlayer || state.currentPlayer;
    renderAuctionCard(auction, state.currentBid);

    // FEATURE 4: Hidden gem visual cues
    const isGem = Boolean(state.isHiddenGem);
    if (isGem) {
      auctionEyebrow.textContent = '⭐ Hidden Gem Round!';
      auctionEyebrow.classList.add('is-gem');
      freeSlotLabel.textContent = '⭐ Hidden Gem (Better!)';
      freeSlotLabel.classList.add('pair-slot__label--gem');
      freeSlotLabel.classList.remove('pair-slot__label--free');
      if (!freeCardInner.classList.contains('is-flipped')) {
        freeCardEl.classList.add('is-gem');
      }
    } else {
      auctionEyebrow.textContent = 'The Free Agent Dilemma';
      auctionEyebrow.classList.remove('is-gem');
      freeSlotLabel.textContent = 'Free for Loser';
      freeSlotLabel.classList.remove('pair-slot__label--gem');
      freeSlotLabel.classList.add('pair-slot__label--free');
      if (!freeCardInner.classList.contains('is-flipped')) {
        freeCardEl.classList.remove('is-gem');
      }
    }

    if (!state.revealing && state.freePlayerHidden) {
      resetMysteryCard();
      // Re-apply gem class if needed after reset
      if (isGem) freeCardEl.classList.add('is-gem');
    }

    if (state.currentBid != null) {
      if (lastBidShown !== state.currentBid) {
        currentBidEl.textContent = `${state.currentBid}M`;
        if (phase === 'auction' && state.roundActive) {
          pulseBid();
          bidSound.play().catch((e) => console.warn('Audio play failed:', e));
        }
        lastBidShown = state.currentBid;
      } else {
        currentBidEl.textContent = `${state.currentBid}M`;
      }
    } else if (!state.revealing) {
      currentBidEl.textContent = '—';
      lastBidShown = null;
    }

    if (state.highestBidder && state.highestBidder.label) {
      highestBidderEl.textContent = `Highest bidder: ${state.highestBidder.label}`;
    } else {
      highestBidderEl.textContent = 'No bids yet';
    }

    if (phase === 'auction' && state.roundActive && auction && state.seatsFilled >= 2) {
      roundActive = true;

      // لو لسه مفيش ولا مزايدة (المزاد لسه بيبدأ)
      if (state.currentBid === 0 || state.currentBid === null) {
        if (state.openerId === myId) {
          // دوري أنا أفتح المزاد
          setBiddingEnabled(true);
          btnPass.disabled = true; // ممنوع أعمل Pass، لازم أزايد
          inputBidAmount.placeholder = 'Your turn to OPEN bid!';
        } else {
          // دور الخصم يفتح المزاد
          setBiddingEnabled(false);
          inputBidAmount.placeholder = 'Waiting for opponent to open...';
        }
      } else {
        // المزاد شغال طبيعي (في حد زايد خلاص)
        const iAmHighestBidder = Boolean(
          state.highestBidder && state.highestBidder.id === myId
        );
        setTurnBasedBidding(iAmHighestBidder);
      }
    } else {
      roundActive = false;
      setBiddingEnabled(false);
    }

    if (state.phase === 'lobby') {
      const seats = state.seatsFilled || 0;
      setLobbyStatus(
        seats < 2
          ? `${myLabel || 'Player'} — ${seats}/2 players in lobby`
          : 'Both players ready — host can start'
      );
      updateHostControls();
    }

    if (state.phase === 'auction') {
      if (state.paused) {
        setBiddingEnabled(false);
        setStatus('⏸ PAUSED — Waiting for opponent to reconnect…');
      } else if (state.seatsFilled < 2) {
        setBiddingEnabled(false);
        setStatus(`${myLabel} — waiting for opponent…`);
      } else if (auction && state.roundActive) {
        const roundNum = (state.currentRoundIndex ?? 0) + 1;
        const total = state.totalRounds || '?';
        setStatus(
          `Round ${roundNum}/${total} · ${auction.position} OVR ${auction.ovr}: ${auction.name}`
        );
      }
    }
  }

  // -------------------------------------------------------------------------
  // Socket.io & Session Management
  // -------------------------------------------------------------------------
  let mySessionId = localStorage.getItem('embabi_session_id');
  if (!mySessionId) {
    mySessionId = 'session_' + Math.random().toString(36).substring(2, 15);
    localStorage.setItem('embabi_session_id', mySessionId);
  }

  const socket = io({ auth: { sessionId: mySessionId } });

  socket.on('connect', () => {
    setLobbyStatus('Connected — enter your team name to join');
  });

  socket.on('sessionRestored', (data) => {
    myId = mySessionId; // 👈 التعديل الأول: ربط الهوية بالـ Session
    myLabel = data.label;
    isHost = Boolean(data.isHost);
    teamNameSubmitted = true; // تخطي شاشة إدخال الاسم

    if (data.roomId) {
      document.getElementById('room-code-display').innerText = 'ROOM CODE: ' + data.roomId;
    }

    if (data.phase === 'auction') {
      showAuction();
    } else if (data.phase === 'finished') {
      showFinished('Squads Completed! Preparing Match Simulation...');
    } else {
      showLobby();
      lobbyNameStep.classList.add('is-hidden');
      lobbyModeStep.classList.remove('is-hidden');
      setLobbyStatus(`Welcome back, ${myLabel}!`);
    }

    updateHostControls();
    showToast(`Welcome back, ${myLabel}!`, true);
  });

  // شلنا الـ playerId من هنا خالص عشان ميعملش لخبطة
  socket.on('joined', (data) => {
    myId = mySessionId; // 👈 التعديل التاني: ربط الهوية بالـ Session
    myLabel = data.label;
    isHost = Boolean(data.isHost);
    teamNameSubmitted = true;

    if (data.roomId) {
      document.getElementById('room-code-display').innerText = 'ROOM CODE: ' + data.roomId;
    }

    if (data.phase === 'auction') {
      showAuction();
      setStatus(`${data.label} — syncing auction…`);
    } else if (data.phase === 'finished') {
      showFinished('Squads Completed! Preparing Match Simulation...');
    } else {
      showLobby();
      setLobbyStatus(`Connected — enter your team name`);
    }

    updateHostControls();
  });

  // -------------------------------------------------------------------------
  // Session Recovery: auto-rehydration on full page reload
  // -------------------------------------------------------------------------
  socket.on('sessionRestored', (data) => {
    const { playerId, label, isHost: hostFlag, phase: serverPhase } = data;
    myId = playerId;
    myLabel = label;
    isHost = Boolean(hostFlag);
    teamNameSubmitted = true;   // bypass the name-entry step entirely

    if (data.roomId) {
      document.getElementById('room-code-display').innerText = 'ROOM CODE: ' + data.roomId;
    }

    console.log(`Session restored: ${label} (${playerId}), phase=${serverPhase}`);

    if (serverPhase === 'auction') {
      showAuction();
      setStatus(`${label} — reconnected, syncing…`);
    } else if (serverPhase === 'finished' || serverPhase === 'simulation') {
      showFinished('Squads Completed! Preparing Match Simulation...');
    } else {
      // lobby — skip name step, show mode selection
      showLobby();   // showLobby() already respects teamNameSubmitted = true
      setLobbyStatus(`Welcome back, ${label}!`);
    }

    updateHostControls();
    showToast(`Welcome back, ${label}!`, true);
  });

  socket.on('joinError', (data) => {
    showToast(data.message, false);
    setLobbyStatus('Connected — enter your team name');
  });

  socket.on('gameStarted', ({ mode, budget }) => {
    showAuction();
    resetMysteryCard();
    const modeLabel = mode === '5v5' ? '5-a-Side' : '11-a-Side + Manager';
    setStatus(`${modeLabel} · ${budget}M budgets`);
    showToast(`${modeLabel} started`, true);
  });

  socket.on('matchReady', () => {
    setStatus(`${myLabel} — Match ready. Draft starting…`);
  });

  // -------------------------------------------------------------------------
  // Session Recovery: opponent disconnect / reconnect notifications
  // -------------------------------------------------------------------------
  socket.on('opponentDisconnected', ({ message }) => {
    showToast(message, false);
    setStatus('⏸ PAUSED — Waiting for opponent to reconnect…');
    // Hide the timer during pause
    if (auctionTimerEl) auctionTimerEl.style.display = 'none';
  });

  socket.on('opponentReconnected', ({ message }) => {
    showToast(message, true);
  });

  // -------------------------------------------------------------------------
  // TIMER EVENTS (Corrected by Senior Developer)
  // -------------------------------------------------------------------------
  socket.on('timerUpdate', (data) => {
    const timeLeft = data.timeLeft;
    console.log('Timer event received:', timeLeft);

    if (timeLeft <= 5 && timeLeft > 0) {
      tickSound.play().catch((e) => console.warn('Audio play failed:', e));
    }

    if (!auctionTimerEl || !timerValueEl) {
      console.error("Timer DOM elements not found!");
      return;
    }

    // إظهار التايمر وتحديث الرقم جوه الـ Span فقط
    auctionTimerEl.style.display = 'block';
    timerValueEl.innerText = timeLeft;

    // تأثير اللون الأحمر في آخر 5 ثواني
    if (timeLeft <= 5) {
      auctionTimerEl.style.color = '#ff4d4d'; // أحمر
      auctionTimerEl.classList.add('auction-timer--critical');
    } else {
      auctionTimerEl.style.color = '#fff'; // أبيض
      auctionTimerEl.classList.remove('auction-timer--critical');
    }
  });

  socket.on('auctionEnded', (data) => {
    if (auctionTimerEl && timerValueEl) {
      timerValueEl.innerText = "0";
      auctionTimerEl.style.color = '#ff4d4d';
      auctionTimerEl.classList.remove('auction-timer--critical');
    }
  });
  // -------------------------------------------------------------------------

  socket.on('newRound', ({ auctionPlayer, isHiddenGem }) => {
    if (auctionTimerEl) auctionTimerEl.style.display = 'none'; // السطر ده اللي ضفناه
    if (phase !== 'auction') showAuction();
    pitchFrozen = false;
    resetMysteryCard();
    if (isHiddenGem) {
      showToast('⭐ HIDDEN GEM ROUND! The free agent might be BETTER than the target!', true);
    } else if (auctionPlayer) {
      showToast(
        `Auction: ${auctionPlayer.name} (${auctionPlayer.ovr} OVR) — free agent hidden`,
        true
      );
    }
  });

  socket.on('revealRound', (payload) => {
    winSound.play().catch((e) => console.warn('Audio play failed:', e));
    if (auctionTimerEl) auctionTimerEl.style.display = 'none'; // إخفاء التايمر وقت الكشف
    if (phase !== 'auction') showAuction();
    snapshotSquadsFromPlayers(lastPlayers);
    playReveal(payload);
  });

  socket.on('squadsSnapped', () => {
    pitchFrozen = false;
    clearRevealTimer();
    showToast('Squads updated on the pitch', true);
  });

  socket.on('roundResolved', () => {
    roundActive = false;
    setBiddingEnabled(false);
  });

  socket.on('auctionFinished', ({ message }) => {
    showFinished(message || 'Squads Completed! Preparing Match Simulation...');
    setStatus('Auction finished');
  });

  socket.on('matchResult', (data) => {
    showScoreboard(data);
  });

  socket.on('returnToLobby', ({ message }) => {
    // On play again: keep the name step hidden (name persists)
    showLobby();
    setLobbyStatus(message || 'New game — choose a mode to begin');
    showToast(message || 'Returning to lobby…', true);
    updateHostControls();
  });

  socket.on('updateState', (state) => {
    applyUpdateState(state);
  });

  socket.on('opponentLeft', ({ message }) => {
    roundActive = false;
    pitchFrozen = false;
    clearRevealTimer();
    setBiddingEnabled(false);
    showLobby();
    setLobbyStatus(message);
    showToast(message);
    updateHostControls();
  });

  socket.on('error', ({ message }) => {
    showToast(message, false);
    if (phase === 'lobby') lobbyHintEl.textContent = message;
  });

  // -------------------------------------------------------------------------
  // Controls — Lobby
  // -------------------------------------------------------------------------

  // FEATURE 2: Join button — send team name to server
  function validateTeamName() {
    const raw = inputTeamName.value.trim();
    if (!raw) {
      lobbyNameError.textContent = 'Please enter a team name.';
      inputTeamName.focus();
      return null;
    }
    if (raw.length < 2) {
      lobbyNameError.textContent = 'Name must be at least 2 characters.';
      inputTeamName.focus();
      return null;
    }
    lobbyNameError.textContent = '';
    return raw;
  }

  function handleCreateMatch() {
    const raw = validateTeamName();
    if (!raw) return;

    myLabel = raw;
    socket.emit('createRoom', { name: raw });
    showToast('Creating room...', true);
    setLobbyStatus(`Creating room as "${raw}"...`);
  }

  function handleJoinMatch() {
    const raw = validateTeamName();
    if (!raw) return;

    const roomCode = inputRoomCode.value.trim().toUpperCase();
    if (!roomCode) {
      showToast('Please enter a room code to join.', false);
      inputRoomCode.focus();
      return;
    }

    myLabel = raw;
    socket.emit('joinRoom', { name: raw, roomId: roomCode });
    showToast(`Joining room ${roomCode}...`, true);
    setLobbyStatus(`Joining room ${roomCode}...`);
  }

  btnCreateMatch.addEventListener('click', (e) => {
    e.preventDefault();
    unlockAudio();
    handleCreateMatch();
  });
  btnJoinMatch.addEventListener('click', (e) => {
    e.preventDefault();
    unlockAudio();
    handleJoinMatch();
  });

  inputTeamName.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleCreateMatch();
    }
  });
  inputRoomCode.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleJoinMatch();
    }
  });

  btnMode5v5.addEventListener('click', () => {
    if (!isHost || phase !== 'lobby') return;
    socket.emit('startGame', { mode: '5v5' });
  });

  btnMode11v11.addEventListener('click', () => {
    if (!isHost || phase !== 'lobby') return;
    socket.emit('startGame', { mode: '11v11' });
  });

  // FEATURE 3: Custom bid input — validate and emit
  btnPlaceBid.addEventListener('click', () => {
    if (!roundActive || phase !== 'auction') return;

    const raw = parseFloat(inputBidAmount.value);
    if (!Number.isFinite(raw) || raw <= 0 || !Number.isInteger(raw)) {
      showToast('Please enter a valid whole number bid amount.');
      return;
    }

    // Client-side validation: must be > currentBid
    const currentBidValue = lastBidShown != null ? lastBidShown : 0;
    if (raw <= currentBidValue) {
      showToast(`Bid must be greater than current bid of ${currentBidValue}M.`);
      return;
    }

    // Client-side validation: must be <= budget
    if (raw > currentBudget) {
      showToast(`Not enough budget! You only have ${currentBudget}M.`);
      return;
    }

    socket.emit('placeBid', { amount: raw });
    inputBidAmount.value = '';
  });

  // Allow Enter key to submit bid
  inputBidAmount.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') btnPlaceBid.click();
  });

  btnPass.addEventListener('click', () => {
    if (!roundActive || phase !== 'auction') return;
    socket.emit('pass');
  });

  btnPlayAgain.addEventListener('click', () => {
    socket.emit('playAgain');
  });

  // -------------------------------------------------------------------------
  // Init
  // -------------------------------------------------------------------------
  showLobby();
})();