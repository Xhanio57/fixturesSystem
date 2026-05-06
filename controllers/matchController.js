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

/* ─────────────────────────────────────────────────────────────
   NUMBER-TO-BOX MAP (IJF / Judo standard bracket draw order)
   Returns an array of length `bracketSize` where:
     map[visualIndex] = drawPosition (1-indexed)
   Example for 16 slots:
     [1, 9, 5, 13, 3, 11, 7, 15, 2, 10, 6, 14, 4, 12, 8, 16]
   Seeds 1-4 are always at visual indices [0, n/2, n/4, 3n/4]:
     Seed 1 → draw pos 1  → visual index 0      (Pool A top)
     Seed 2 → draw pos 2  → visual index n/2     (Pool C top)
     Seed 3 → draw pos 3  → visual index n/4     (Pool B top)
     Seed 4 → draw pos 4  → visual index 3n/4    (Pool D top)
   Generation algorithm (recursive):
     map(2)    = [1, 2]
     map(n)[2i]   = sub[i]
     map(n)[2i+1] = sub[i] + n/2
───────────────────────────────────────────────────────────── */
function generateNumberToBoxMap(bracketSize) {
  if (bracketSize <= 1) return [1];
  if (bracketSize === 2) return [1, 2];
  const half = bracketSize / 2;
  const sub = generateNumberToBoxMap(half);
  const map = new Array(bracketSize);
  for (let i = 0; i < half; i++) {
    map[i * 2] = sub[i];           // top of each R1 pair
    map[i * 2 + 1] = sub[i] + half; // bottom of each R1 pair (complement)
  }
  return map;
}

/** Given a map, returns the visual index for a given draw position (1-indexed) */
function visualIndexForDrawPos(map, drawPos) {
  return map.indexOf(drawPos);
}


function poolForSlot(slotIndex, bracketSize) {
  if (bracketSize < 8) return null;
  const q = Math.floor(bracketSize / 4);
  if (slotIndex < q) return 'A';
  if (slotIndex < q * 2) return 'B';
  if (slotIndex < q * 3) return 'C';
  return 'D';
}

/* ─────────────────────────────────────────────────────────────
   BRACKET BUILDER WITH PROACTIVE CONFLICT DISTRIBUTION
   Seeds placed at IJF canonical positions derived from numberToBoxMap:
     Seed 1 → draw pos 1 → visual index 0       (Pool A top)
     Seed 2 → draw pos 2 → visual index n/2      (Pool C top)
     Seed 3 → draw pos 3 → visual index n/4      (Pool B top)
     Seed 4 → draw pos 4 → visual index 3n/4     (Pool D top)
   BYE distribution: seeds get BYEs adjacent first; remainder
     spread evenly floor(total/4) per pool.
   Clash prevention (proactive, not reactive):
     1. Group non-seeded athletes by country (primary) then club (secondary).
     2. Sort groups largest-first.
     3. Within each country group, cluster same-club athletes together
        (largest club first, shuffled within each club).  This guarantees
        that the outer round-robin assigns each club's athletes to different
        pools (consecutive positions always map to different pools).
     4. Round-robin distribute each group across pools so athletes from the
        same country/club land in different pools as much as possible.
     5. Slot positions within each pool are shuffled for randomness.
     6. Secondary pass: swap any remaining same-club/country pair within a
        pool with a non-conflicting athlete from another pool.
─────────────────────────────────────────────────────────────── */
function buildBracketWithSmartSwap(athletes, bracketSize) {
  const n = athletes.length;
  const totalBYEs = bracketSize - n;
  const numPools = bracketSize >= 8 ? 4 : 1;
  const poolSize = Math.max(bracketSize / 4, 1);
  const boxMap = generateNumberToBoxMap(bracketSize);

  // Sort seeded athletes by seedIndex (1 first)
  const seeded = athletes
    .filter((a) => a.seedIndex && a.seedIndex >= 1)
    .sort((a, b) => a.seedIndex - b.seedIndex);
  const nonSeeded = shuffle(athletes.filter((a) => !a.seedIndex));

  const slots = new Array(bracketSize).fill(null); // null = BYE

  // ── Place seeds at IJF canonical positions ──
  const seedDrawPositions = [1, 2, 3, 4];
  const seedVisualIndices = seedDrawPositions.map((dp) => visualIndexForDrawPos(boxMap, dp));
  seeded.forEach((ath) => {
    // Use the athlete's actual seedIndex (1-4) to pick the correct canonical position,
    // so seed 2 always lands at Pool C regardless of whether seed 1 is present.
    const posIdx = ath.seedIndex - 1;
    if (posIdx >= 0 && posIdx < seedVisualIndices.length) {
      slots[seedVisualIndices[posIdx]] = ath;
    }
  });

  // ── Balanced BYE distribution ──
  // Phase 1: give BYEs to seed-adjacent slots (seeded athletes advance free in R1)
  // Use the seed's actual canonical position index (seedIndex-1), not iteration order.
  const adjacentOfSeed = seedVisualIndices.map((vi) =>
    vi % 2 === 0 ? vi + 1 : vi - 1
  );
  const byeSet = new Set();
  let byesUsed = 0;
  for (const ath of seeded) {
    if (byesUsed >= totalBYEs) break;
    const posIdx = ath.seedIndex - 1;
    if (posIdx < 0 || posIdx >= adjacentOfSeed.length) continue;
    const adj = adjacentOfSeed[posIdx];
    if (adj >= 0 && adj < bracketSize && !byeSet.has(adj) && slots[adj] === null) {
      byeSet.add(adj);
      byesUsed++;
    }
  }
  // Phase 2: distribute remaining BYEs evenly across pools
  if (bracketSize >= 8 && byesUsed < totalBYEs) {
    const rem = totalBYEs - byesUsed;
    const byesPerPool = new Array(4).fill(Math.floor(rem / 4));
    for (let i = 0; i < rem % 4; i++) byesPerPool[i]++;
    for (let poolIdx = 0; poolIdx < 4; poolIdx++) {
      const start = poolIdx * poolSize;
      const end = start + poolSize;
      const poolFree = [];
      for (let i = start; i < end; i++) {
        if (slots[i] === null && !byeSet.has(i)) poolFree.push(i);
      }
      const poolBYECount = Math.min(byesPerPool[poolIdx], poolFree.length);
      for (let i = poolFree.length - poolBYECount; i < poolFree.length; i++) {
        byeSet.add(poolFree[i]);
        byesUsed++;
      }
    }
  }

  // ── Collect free (non-BYE, non-seed) slot indices per pool, shuffled ──
  const poolFreeSlots = Array.from({ length: numPools }, (_, p) => {
    const start = p * poolSize;
    const end = start + poolSize;
    const free = [];
    for (let i = start; i < end; i++) {
      if (slots[i] === null && !byeSet.has(i)) free.push(i);
    }
    return shuffle(free); // randomize positions within each pool
  });

  if (numPools === 1) {
    // Small brackets: no pools, just fill available slots in order
    let ri = 0;
    for (let i = 0; i < bracketSize && ri < nonSeeded.length; i++) {
      if (slots[i] === null && !byeSet.has(i)) slots[i] = nonSeeded[ri++];
    }
    return { slots, boxMap };
  }

  // ── Group non-seeded athletes by conflict key ──
  // Primary key: country (keeps same-country athletes in separate pools)
  // Secondary key: club (for athletes with no country, or same-country sub-groups)
  // Athletes with neither country nor club share no conflict with anyone.
  const countryGroups = new Map(); // country → [athletes]
  const clubOnlyGroups = new Map(); // club → [athletes]  (country absent)
  const soloAthletes   = [];        // no country, no club → place freely

  for (const ath of nonSeeded) {
    const country = ath.country && ath.country.trim();
    const club    = ath.club    && ath.club.trim();
    if (country) {
      if (!countryGroups.has(country)) countryGroups.set(country, []);
      countryGroups.get(country).push(ath);
    } else if (club) {
      if (!clubOnlyGroups.has(club)) clubOnlyGroups.set(club, []);
      clubOnlyGroups.get(club).push(ath);
    } else {
      soloAthletes.push(ath);
    }
  }

  // ── Pool-occupied-clubs map (seed-aware) ──
  // Track which clubs are already present in each pool (seeded athletes are placed
  // first at canonical positions).  roundRobinAssign updates this map as non-seeded
  // athletes are assigned, so each subsequent club bucket also avoids pools that
  // already contain an athlete from that club.
  const poolOccupiedClubs = Array.from({ length: numPools }, () => new Set());
  for (let p = 0; p < numPools; p++) {
    const start = p * poolSize;
    const end   = start + poolSize;
    for (let i = start; i < end; i++) {
      if (slots[i] && slots[i].club) {
        poolOccupiedClubs[p].add(slots[i].club.trim());
      }
    }
  }

  // ── Assign athletes to pool queues using round-robin per conflict group ──
  // Largest groups first ensures the best possible distribution.
  const poolQueues = Array.from({ length: numPools }, () => []);

  function roundRobinAssign(groups) {
    groups.sort((a, b) => b.length - a.length);
    for (const group of groups) {
      // Build per-club buckets (largest first, athletes shuffled within each bucket).
      // Each bucket is distributed separately so we can choose a seed-aware pool
      // for every athlete — avoiding pools that already contain an athlete from the
      // same club (including seeded athletes placed before this step).
      const clubBuckets = new Map();
      for (const ath of group) {
        const key = (ath.club && ath.club.trim()) || '';
        if (!clubBuckets.has(key)) clubBuckets.set(key, []);
        clubBuckets.get(key).push(ath);
      }
      const sortedBuckets = [...clubBuckets.values()].sort((a, b) => b.length - a.length);

      for (const bucket of sortedBuckets) {
        shuffle(bucket);
        const clubKey = bucket[0] ? ((bucket[0].club && bucket[0].club.trim()) || '') : '';

        // Assign each athlete to the best available pool individually.
        // Score: pools with the same club are penalised by bracketSize so they
        // are only chosen as a last resort (when every pool already has that club).
        // Among equally-scored pools, pick the one with the fewest queued athletes.
        for (const ath of bucket) {
          let bestPool = 0;
          let bestScore = Infinity;
          for (let p = 0; p < numPools; p++) {
            const hasClub = clubKey && poolOccupiedClubs[p].has(clubKey);
            const score   = (hasClub ? bracketSize : 0) + poolQueues[p].length;
            if (score < bestScore) { bestScore = score; bestPool = p; }
          }
          poolQueues[bestPool].push(ath);
          // Track placed clubs so subsequent athletes (same or different bucket)
          // also avoid pools that now have athletes from this club.
          if (clubKey) poolOccupiedClubs[bestPool].add(clubKey);
        }
      }
    }
  }

  roundRobinAssign([...countryGroups.values()]);
  roundRobinAssign([...clubOnlyGroups.values()]);

  // Solo athletes fill the emptiest pool at each step
  for (const ath of soloAthletes) {
    let minPool = 0;
    for (let p = 1; p < numPools; p++) {
      if (poolQueues[p].length < poolQueues[minPool].length) minPool = p;
    }
    poolQueues[minPool].push(ath);
  }

  // ── Place athletes from pool queues into their pool's free slots ──
  const overflow = [];
  for (let p = 0; p < numPools; p++) {
    const freeSlots = poolFreeSlots[p];
    const queue     = poolQueues[p];
    const count     = Math.min(freeSlots.length, queue.length);
    for (let i = 0; i < count; i++) slots[freeSlots[i]] = queue[i];
    // Athletes that don't fit (pool was full) become overflow
    if (queue.length > freeSlots.length) {
      overflow.push(...queue.slice(freeSlots.length));
    }
  }

  // Overflow athletes fill any remaining empty slots (best-effort, any pool)
  if (overflow.length) {
    let oi = 0;
    for (let i = 0; i < bracketSize && oi < overflow.length; i++) {
      if (slots[i] === null && !byeSet.has(i)) slots[i] = overflow[oi++];
    }
  }

  // ── Secondary pass: resolve any residual same-club pairs ──
  // Handles both non-seed vs non-seed AND seed vs non-seed conflicts.
  // Seeds cannot be moved; when a conflict involves a seeded athlete the
  // non-seeded athlete (slot i) is swapped with a suitable non-seeded
  // athlete from another pool instead.
  const qSize = bracketSize / 4;
  for (let poolIdx = 0; poolIdx < 4; poolIdx++) {
    const start = poolIdx * qSize;
    const end   = start + qSize;
    for (let i = start; i < end; i++) {
      if (!slots[i] || slots[i].seedIndex) continue; // i = non-seeded (movable) athlete
      // Check i against ALL other athletes in the same pool, including seeded ones.
      for (let j = start; j < end; j++) {
        if (j === i || !slots[j]) continue;
        const sameClub    = slots[i].club    && slots[j].club    && slots[i].club    === slots[j].club;
        const sameCountry = slots[i].country && slots[j].country && slots[i].country === slots[j].country;
        if (!sameClub && !sameCountry) continue;
        // Try to swap slots[i] with a non-seeded athlete from another pool
        // that does not create a new conflict in either pool.
        let swapped = false;
        for (let k = 0; k < bracketSize && !swapped; k++) {
          if (k >= start && k < end) continue;
          if (!slots[k] || slots[k].seedIndex) continue; // k must be non-seeded (movable)
          const kStart = Math.floor(k / qSize) * qSize;
          const kEnd   = kStart + qSize;
          // Would slots[i] fit in k's pool without conflict?
          let conflictI = false;
          for (let m = kStart; m < kEnd && !conflictI; m++) {
            if (m === k || !slots[m]) continue;
            if (slots[m].club    && slots[i].club    && slots[m].club    === slots[i].club)    conflictI = true;
            if (slots[m].country && slots[i].country && slots[m].country === slots[i].country) conflictI = true;
          }
          // Would slots[k] fit in i's pool without conflict?
          let conflictK = false;
          for (let m = start; m < end && !conflictK; m++) {
            if (m === i || !slots[m]) continue;
            if (slots[m].club    && slots[k].club    && slots[m].club    === slots[k].club)    conflictK = true;
            if (slots[m].country && slots[k].country && slots[m].country === slots[k].country) conflictK = true;
          }
          if (!conflictI && !conflictK) {
            [slots[i], slots[k]] = [slots[k], slots[i]];
            swapped = true;
          }
        }
      }
    }
  }

  return { slots, boxMap };
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
function generateAllMatches(slots, bracketSize, category, boxMap) {
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
      // Draw position numbers for display (from the IJF numberToBoxMap)
      slotNumberA: boxMap ? (boxMap[i] || null) : null,
      slotNumberB: boxMap ? (boxMap[i + 1] || null) : null,
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
    const { slots, boxMap } = buildBracketWithSmartSwap(athletes, bracketSize);
    const matchDocs = generateAllMatches(slots, bracketSize, category, boxMap);

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
      .populate('athleteA', 'firstName lastName club country seedIndex isSeeded')
      .populate('athleteB', 'firstName lastName club country seedIndex isSeeded')
      .populate('winner', 'firstName lastName')
      .sort({ roundNumber: 1, matchIndex: 1 });

    // Emit real-time draw event to all spectator clients
    const io = req.app.get('io');
    if (io) {
      // Build a lightweight athlete list for the animation
      const athleteList = athletes.map((a) => ({
        _id: String(a._id),
        firstName: a.firstName,
        lastName: a.lastName,
        club: a.club || '',
        country: a.country || '',
        seedIndex: a.seedIndex || null,
      }));
      io.emit('draw:complete', {
        categoryId: String(category._id),
        categoryName: category.name,
        gender: category.gender,
        ageGroup: category.ageGroup,
        bracketType: category.bracketType,
        bracketSize,
        matches: populated,
        athletes: athleteList,
      });
    }

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
      .populate('athleteA', 'firstName lastName club country seedIndex isSeeded')
      .populate('athleteB', 'firstName lastName club country seedIndex isSeeded')
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
      // winnerId is already validated as a valid ObjectId above; cast explicitly to ObjectId
      await Athlete.findByIdAndUpdate(
        new mongoose.Types.ObjectId(String(winnerId)),
        { isWinner: true }
      );
    }

    const populated = await Match.findById(match._id)
      .populate('athleteA', 'firstName lastName club country seedIndex isSeeded')
      .populate('athleteB', 'firstName lastName club country seedIndex isSeeded')
      .populate('winner', 'firstName lastName');

    // Emit real-time score update
    const io = req.app.get('io');
    if (io) {
      io.emit('score:update', {
        categoryId: String(match.categoryId),
        matchDbId: String(match._id),
        matchID: match.matchID,
        winnerId: String(winnerId),
      });
    }

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

