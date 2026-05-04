const Match = require('../models/Match');
const Athlete = require('../models/Athlete');
const Category = require('../models/Category');
const mongoose = require('mongoose');

function isValidObjectId(id) {
  return mongoose.Types.ObjectId.isValid(id);
}

/* ─────────────────────────────────────────────────────────────
   UTILITY
───────────────────────────────────────────────────────────── */

/** Next power of 2 >= n */
function nextPowerOf2(n) {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

/** Fisher-Yates shuffle in-place */
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** Pool label for a slot index given bracketSize.
 *  Pool A: first quarter, B: second, C: third, D: fourth.
 *  Returns null for small brackets where pools don't apply. */
function poolForSlot(slotIndex, bracketSize) {
  if (bracketSize < 8) return null;
  const q = Math.floor(bracketSize / 4);
  if (slotIndex < q) return 'A';
  if (slotIndex < q * 2) return 'B';
  if (slotIndex < q * 3) return 'C';
  return 'D';
}

/* ─────────────────────────────────────────────────────────────
   SMART SWAP BRACKET BUILDER
   Seeds placed at canonical IJF positions:
     Seed 1 → slot 0          (Pool A top   = "A1")
     Seed 2 → slot last       (Pool D bottom = "D16")
     Seed 3 → slot half       (Pool C top   = "C9")
     Seed 4 → slot half-1     (Pool B bottom = "B8")
   Club-clash prevention: after initial placement, scan each pool
   for two athletes from the same club and swap one of them with
   an athlete in a different pool (skipping seeded athletes).
───────────────────────────────────────────────────────────── */
function buildBracketWithSmartSwap(athletes, bracketSize) {
  const slots = new Array(bracketSize).fill(null);

  // Sort seeded athletes by seedIndex (1 first)
  const seeded = athletes
    .filter((a) => a.seedIndex && a.seedIndex >= 1)
    .sort((a, b) => a.seedIndex - b.seedIndex);
  const nonSeeded = athletes.filter((a) => !a.seedIndex);
  shuffle(nonSeeded);

  // Fixed canonical seed positions
  const seedPositions = [
    0,                              // Seed 1: A1
    bracketSize - 1,                // Seed 2: D last
    Math.floor(bracketSize / 2),    // Seed 3: C first
    Math.floor(bracketSize / 2) - 1 // Seed 4: B last
  ];

  seeded.forEach((ath, i) => {
    if (i < seedPositions.length) slots[seedPositions[i]] = ath;
  });

  // Fill remaining slots with extra seeds + non-seeded
  const remaining = [...seeded.slice(seedPositions.length), ...nonSeeded];
  let ri = 0;
  for (let i = 0; i < bracketSize; i++) {
    if (slots[i] === null && ri < remaining.length) {
      slots[i] = remaining[ri++];
    }
  }

  // ── Smart Swap: resolve club conflicts within each pool ──
  if (bracketSize >= 8) {
    const qSize = bracketSize / 4;
    for (let poolIdx = 0; poolIdx < 4; poolIdx++) {
      const start = poolIdx * qSize;
      const end = start + qSize;

      for (let i = start; i < end; i++) {
        if (!slots[i] || !slots[i].club) continue;
        for (let j = i + 1; j < end; j++) {
          if (!slots[j] || !slots[j].club) continue;
          if (slots[i].club !== slots[j].club) continue;

          // Conflict: try to swap slots[j] with an athlete in a different pool
          let swapped = false;
          for (let k = 0; k < bracketSize && !swapped; k++) {
            // Must be in a different pool
            if (k >= start && k < end) continue;
            if (!slots[k]) continue;
            // Don't move seeded athletes from canonical positions
            if (slots[k].seedIndex) continue;

            // Would swapping introduce a new conflict at position k?
            const kPoolStart = Math.floor(k / qSize) * qSize;
            const kPoolEnd = kPoolStart + qSize;
            let newConflict = false;
            for (let m = kPoolStart; m < kPoolEnd && !newConflict; m++) {
              if (m === k || !slots[m] || !slots[m].club) continue;
              if (slots[m].club === slots[j].club) newConflict = true;
            }
            if (!newConflict) {
              [slots[j], slots[k]] = [slots[k], slots[j]];
              swapped = true;
            }
          }
        }
      }
    }
  }

  return slots;
}

/* ─────────────────────────────────────────────────────────────
   FULL BRACKET GENERATION (Single Elimination + Double Repechage)
   Returns an array of match objects (not yet saved to DB).
   Double Repechage is generated when:
     - category.bracketType === 'DoubleRepechage'
     - bracketSize >= 8
   Structure for bracketSize=16 (totalRounds=4):
     Main bracket: R1(8) → R2/QF(4) → R3/SF(2) → R4/Final(1)
     Repechage:    QF losers → RepAB + RepCD matches
     Bronze:       SF1 loser vs RepAB winner; SF2 loser vs RepCD winner
───────────────────────────────────────────────────────────── */
function generateAllMatches(slots, bracketSize, category) {
  const categoryId = category._id;
  const isDoubleRep = category.bracketType === 'DoubleRepechage' && bracketSize >= 8;
  const totalRounds = Math.log2(bracketSize);
  let matchIdCounter = 1;
  const allMatches = [];

  // Helper: create a match skeleton
  function makeMatch(overrides) {
    return {
      categoryId,
      matchID: matchIdCounter++,
      roundNumber: 1,
      matchIndex: 0,
      pool: '',
      athleteA: null,
      athleteB: null,
      isByeA: false,
      isByeB: false,
      winner: null,
      loserTargetMatchID: null,
      loserTargetSlot: null,
      ...overrides,
    };
  }

  // ── Round 1: initial bracket matches ──
  const r1Matches = [];
  for (let i = 0; i < slots.length; i += 2) {
    const pool = poolForSlot(i, bracketSize) || '';
    const m = makeMatch({
      roundNumber: 1,
      matchIndex: i / 2,
      pool,
      athleteA: slots[i] ? slots[i]._id : null,
      athleteB: slots[i + 1] ? slots[i + 1]._id : null,
      isByeA: slots[i] === null,
      isByeB: slots[i + 1] === null,
    });
    // Auto-advance BYE
    if (m.isByeA && m.athleteB) m.winner = m.athleteB;
    else if (m.isByeB && m.athleteA) m.winner = m.athleteA;

    r1Matches.push(m);
    allMatches.push(m);
  }

  // ── Subsequent main-bracket rounds (round 2 … totalRounds) ──
  // Track per-round match arrays so we can wire up repechage later
  const roundMatchGroups = [r1Matches]; // index 0 = round 1

  for (let round = 2; round <= totalRounds; round++) {
    const prevGroup = roundMatchGroups[round - 2];
    const groupMatches = [];
    const count = prevGroup.length / 2;

    for (let i = 0; i < count; i++) {
      let pool = '';
      if (round === totalRounds) pool = 'Final';
      else if (round === totalRounds - 1) pool = `SF${i + 1}`;
      else {
        // Intermediate rounds: inherit pool from the match pair that feeds in
        const feedA = prevGroup[i * 2];
        pool = feedA ? feedA.pool : '';
      }

      const m = makeMatch({ roundNumber: round, matchIndex: i, pool });
      groupMatches.push(m);
      allMatches.push(m);
    }
    roundMatchGroups.push(groupMatches);
  }

  // ── Double Repechage: Repechage + Bronze matches ──
  if (isDoubleRep) {
    // The "QF round" = totalRounds - 2 (produces 4 matches feeding into SF)
    // For bracketSize=8 (totalRounds=3): QF round = 1 (the 4 R1 matches)
    // For bracketSize=16 (totalRounds=4): QF round = 2 (the 4 R2 matches)
    const qfRoundIndex = totalRounds - 2; // 0-based index into roundMatchGroups
    const sfRoundIndex = totalRounds - 1; // semi-finals

    const qfMatches = roundMatchGroups[qfRoundIndex]; // 4 matches
    const sfMatches = roundMatchGroups[sfRoundIndex]; // 2 matches

    // Repechage AB: QF Pool A loser vs QF Pool B loser
    const repAB = makeMatch({ roundNumber: totalRounds + 1, matchIndex: 0, pool: 'RepAB' });
    // Repechage CD: QF Pool C loser vs QF Pool D loser
    const repCD = makeMatch({ roundNumber: totalRounds + 1, matchIndex: 1, pool: 'RepCD' });
    // Bronze 1: SF1 loser vs RepAB winner
    const bronze1 = makeMatch({ roundNumber: totalRounds + 2, matchIndex: 0, pool: 'Bronze1' });
    // Bronze 2: SF2 loser vs RepCD winner
    const bronze2 = makeMatch({ roundNumber: totalRounds + 2, matchIndex: 1, pool: 'Bronze2' });

    allMatches.push(repAB, repCD, bronze1, bronze2);

    // Wire loserTargetMatchID on QF matches
    // qfMatches[0] (Pool A or first half top) → RepAB slot A
    // qfMatches[1] (Pool B or first half bottom) → RepAB slot B
    // qfMatches[2] (Pool C or second half top) → RepCD slot A
    // qfMatches[3] (Pool D or second half bottom) → RepCD slot B
    if (qfMatches[0]) { qfMatches[0].loserTargetMatchID = repAB.matchID; qfMatches[0].loserTargetSlot = 'A'; }
    if (qfMatches[1]) { qfMatches[1].loserTargetMatchID = repAB.matchID; qfMatches[1].loserTargetSlot = 'B'; }
    if (qfMatches[2]) { qfMatches[2].loserTargetMatchID = repCD.matchID; qfMatches[2].loserTargetSlot = 'A'; }
    if (qfMatches[3]) { qfMatches[3].loserTargetMatchID = repCD.matchID; qfMatches[3].loserTargetSlot = 'B'; }

    // Wire SF losers to Bronze matches
    if (sfMatches[0]) { sfMatches[0].loserTargetMatchID = bronze1.matchID; sfMatches[0].loserTargetSlot = 'A'; }
    if (sfMatches[1]) { sfMatches[1].loserTargetMatchID = bronze2.matchID; sfMatches[1].loserTargetSlot = 'A'; }

    // Wire RepAB/RepCD winners to Bronze slot B
    repAB.loserTargetMatchID = null; // Rep winner goes to Bronze, handled in setWinner
    repCD.loserTargetMatchID = null;
    // We'll wire bronze slots dynamically in setWinner using pool labels
  }

  return allMatches;
}

/* ─────────────────────────────────────────────────────────────
   CONTROLLERS
───────────────────────────────────────────────────────────── */

// POST /api/matches/draw/:categoryId
exports.runDraw = async (req, res) => {
  try {
    if (!isValidObjectId(req.params.categoryId)) {
      return res.status(400).json({ success: false, message: 'Geçersiz kategori ID' });
    }
    const category = await Category.findById(req.params.categoryId);
    if (!category) {
      return res.status(404).json({ success: false, message: 'Kategori bulunamadı' });
    }
    if (category.drawStatus === 'Completed') {
      return res.status(400).json({ success: false, message: 'Bu kategori için kura zaten tamamlanmış.' });
    }

    const athletes = await Athlete.find({ category: category._id });
    if (athletes.length < 2) {
      return res.status(400).json({ success: false, message: 'Kura için en az 2 sporcu gereklidir.' });
    }

    const bracketSize = nextPowerOf2(athletes.length);
    const slots = buildBracketWithSmartSwap(athletes, bracketSize);
    const matchDocs = generateAllMatches(slots, bracketSize, category);

    // Clear existing matches
    await Match.deleteMany({ categoryId: category._id });

    // Insert all matches (main + repechage stubs)
    await Match.insertMany(matchDocs);

    // Mark category as completed
    await Category.findByIdAndUpdate(
      category._id,
      { isDrawCompleted: true, drawStatus: 'Completed' },
      { runValidators: false }
    );

    const populated = await Match.find({ categoryId: category._id })
      .populate('athleteA', 'firstName lastName club seedIndex isSeeded')
      .populate('athleteB', 'firstName lastName club seedIndex isSeeded')
      .populate('winner', 'firstName lastName')
      .sort({ roundNumber: 1, matchIndex: 1 });

    res.json({ success: true, data: populated, bracketSize, bracketType: category.bracketType });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET /api/matches/:categoryId
exports.getMatches = async (req, res) => {
  try {
    if (!isValidObjectId(req.params.categoryId)) {
      return res.status(400).json({ success: false, message: 'Geçersiz kategori ID' });
    }
    const matches = await Match.find({ categoryId: req.params.categoryId })
      .populate('athleteA', 'firstName lastName club seedIndex isSeeded')
      .populate('athleteB', 'firstName lastName club seedIndex isSeeded')
      .populate('winner', 'firstName lastName')
      .sort({ roundNumber: 1, matchIndex: 1 });
    res.json({ success: true, data: matches });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// PUT /api/matches/:matchId/winner
exports.setWinner = async (req, res) => {
  try {
    if (!isValidObjectId(req.params.matchId)) {
      return res.status(400).json({ success: false, message: 'Geçersiz maç ID' });
    }
    if (req.body.winnerId && !isValidObjectId(req.body.winnerId)) {
      return res.status(400).json({ success: false, message: 'Geçersiz winner ID' });
    }

    const match = await Match.findById(req.params.matchId);
    if (!match) return res.status(404).json({ success: false, message: 'Maç bulunamadı' });

    const { winnerId } = req.body;
    if (!winnerId) return res.status(400).json({ success: false, message: 'Winner ID gereklidir' });

    // Determine loser
    const loserId = String(match.athleteA) === String(winnerId)
      ? match.athleteB
      : match.athleteA;

    match.winner = winnerId;
    await match.save();

    // Advance winner up the main bracket
    await advanceToNextRound(match);

    // Route loser to repechage if configured
    if (match.loserTargetMatchID && loserId) {
      await routeLoserToRepechage(match, loserId);
    }

    // If this is a Repechage match, advance winner to Bronze
    if (match.pool === 'RepAB' || match.pool === 'RepCD') {
      await advanceRepWinnerToBronze(match);
    }

    // If Final — mark winner athlete as isWinner
    const category = await Category.findById(match.categoryId);
    const totalRounds = category ? Math.log2(nextPowerOf2(
      await Athlete.countDocuments({ category: match.categoryId })
    )) : 0;
    if (match.roundNumber === totalRounds) {
      await Athlete.findByIdAndUpdate(winnerId, { isWinner: true });
    }

    const populated = await Match.findById(match._id)
      .populate('athleteA', 'firstName lastName club seedIndex isSeeded')
      .populate('athleteB', 'firstName lastName club seedIndex isSeeded')
      .populate('winner', 'firstName lastName');

    res.json({ success: true, data: populated });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/* ─────────────────────────────────────────────────────────────
   INTERNAL HELPERS
───────────────────────────────────────────────────────────── */

/** Advance winner of a main-bracket match to the next round match */
async function advanceToNextRound(match) {
  // Repechage / Bronze pools don't auto-advance
  if (['RepAB', 'RepCD', 'Bronze1', 'Bronze2', 'Final'].includes(match.pool)) return;

  const nextRound = match.roundNumber + 1;
  const nextMatchIndex = Math.floor(match.matchIndex / 2);
  const isSlotA = match.matchIndex % 2 === 0;

  let nextMatch = await Match.findOne({
    categoryId: match.categoryId,
    roundNumber: nextRound,
    matchIndex: nextMatchIndex,
    pool: { $nin: ['RepAB', 'RepCD', 'Bronze1', 'Bronze2'] },
  });

  if (!nextMatch) {
    const currentRoundCount = await Match.countDocuments({
      categoryId: match.categoryId,
      roundNumber: match.roundNumber,
      pool: { $nin: ['RepAB', 'RepCD', 'Bronze1', 'Bronze2'] },
    });
    if (currentRoundCount < 2) return; // Already at final
    nextMatch = new Match({
      categoryId: match.categoryId,
      roundNumber: nextRound,
      matchIndex: nextMatchIndex,
    });
  }

  if (isSlotA) {
    nextMatch.athleteA = match.winner;
    nextMatch.isByeA = false;
  } else {
    nextMatch.athleteB = match.winner;
    nextMatch.isByeB = false;
  }

  if (nextMatch.isByeA && nextMatch.athleteB) nextMatch.winner = nextMatch.athleteB;
  else if (nextMatch.isByeB && nextMatch.athleteA) nextMatch.winner = nextMatch.athleteA;

  await nextMatch.save();
}

/** Place the loser of a QF/SF match into the correct repechage/bronze match slot */
async function routeLoserToRepechage(match, loserId) {
  const repMatch = await Match.findOne({
    categoryId: match.categoryId,
    matchID: match.loserTargetMatchID,
  });
  if (!repMatch) return;

  if (match.loserTargetSlot === 'A') {
    repMatch.athleteA = loserId;
    repMatch.isByeA = false;
  } else {
    repMatch.athleteB = loserId;
    repMatch.isByeB = false;
  }

  if (repMatch.isByeA && repMatch.athleteB) repMatch.winner = repMatch.athleteB;
  else if (repMatch.isByeB && repMatch.athleteA) repMatch.winner = repMatch.athleteA;

  await repMatch.save();
}

/** Advance a Repechage winner to slot B of the corresponding Bronze match */
async function advanceRepWinnerToBronze(repMatch) {
  const bronzePool = repMatch.pool === 'RepAB' ? 'Bronze1' : 'Bronze2';
  const bronzeMatch = await Match.findOne({
    categoryId: repMatch.categoryId,
    pool: bronzePool,
  });
  if (!bronzeMatch) return;

  bronzeMatch.athleteB = repMatch.winner;
  bronzeMatch.isByeB = false;
  if (bronzeMatch.isByeA && bronzeMatch.athleteB) bronzeMatch.winner = bronzeMatch.athleteB;
  await bronzeMatch.save();
}

