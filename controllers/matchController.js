const Match = require('../models/Match');
const Athlete = require('../models/Athlete');
const Category = require('../models/Category');

/**
 * Next power of 2 >= n
 */
function nextPowerOf2(n) {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

/**
 * Shuffle array in-place (Fisher-Yates)
 */
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Build bracket slots: seeded athletes go to opposite ends (first & last),
 * rest are randomly distributed in between.
 */
function buildBracketSlots(athletes, bracketSize) {
  const seeded = athletes.filter((a) => a.isSeeded);
  const nonSeeded = athletes.filter((a) => !a.isSeeded);

  // Shuffle non-seeded
  shuffle(nonSeeded);

  // Create slot array filled with null (BYE placeholders)
  const slots = new Array(bracketSize).fill(null);

  // Place first seeded athlete at position 0, second at last position
  if (seeded[0]) slots[0] = seeded[0];
  if (seeded[1]) slots[bracketSize - 1] = seeded[1];
  if (seeded[2]) slots[Math.floor(bracketSize / 2)] = seeded[2];
  if (seeded[3]) slots[Math.floor(bracketSize / 2) - 1] = seeded[3];

  // Place remaining seeded and all non-seeded in empty slots
  const remaining = [...seeded.slice(4), ...nonSeeded];
  let ri = 0;
  for (let i = 0; i < slots.length; i++) {
    if (slots[i] === null && ri < remaining.length) {
      slots[i] = remaining[ri++];
    }
  }

  return slots;
}

/**
 * Generate round-1 matches from slots (pair consecutive slots)
 */
function generateFirstRoundMatches(slots, categoryId) {
  const matches = [];
  for (let i = 0; i < slots.length; i += 2) {
    const matchData = {
      categoryId,
      roundNumber: 1,
      matchIndex: i / 2,
      athleteA: slots[i] ? slots[i]._id : null,
      athleteB: slots[i + 1] ? slots[i + 1]._id : null,
      isByeA: slots[i] === null,
      isByeB: slots[i + 1] === null,
    };
    // Auto-advance if one slot is BYE
    if (matchData.isByeA && matchData.athleteB) {
      matchData.winner = matchData.athleteB;
    } else if (matchData.isByeB && matchData.athleteA) {
      matchData.winner = matchData.athleteA;
    }
    matches.push(matchData);
  }
  return matches;
}

// POST /api/matches/draw/:categoryId — run draw for a category
exports.runDraw = async (req, res) => {
  try {
    const category = await Category.findById(req.params.categoryId);
    if (!category) {
      return res.status(404).json({ success: false, message: 'Kategori bulunamadı' });
    }
    if (category.isDrawCompleted) {
      return res
        .status(400)
        .json({ success: false, message: 'Bu kategori için kura zaten tamamlanmış.' });
    }

    const athletes = await Athlete.find({ category: category._id });
    if (athletes.length < 2) {
      return res
        .status(400)
        .json({ success: false, message: 'Kura için en az 2 sporcu gereklidir.' });
    }

    const bracketSize = nextPowerOf2(athletes.length);
    const slots = buildBracketSlots(athletes, bracketSize);
    const matchDocs = generateFirstRoundMatches(slots, category._id);

    // Remove any existing matches for this category
    await Match.deleteMany({ categoryId: category._id });

    // Insert new matches
    const createdMatches = await Match.insertMany(matchDocs);

    // Mark draw as completed
    await Category.findByIdAndUpdate(category._id, { isDrawCompleted: true });

    // Return populated matches
    const populated = await Match.find({ categoryId: category._id, roundNumber: 1 })
      .populate('athleteA', 'firstName lastName club isSeeded')
      .populate('athleteB', 'firstName lastName club isSeeded')
      .populate('winner', 'firstName lastName')
      .sort({ matchIndex: 1 });

    res.json({ success: true, data: populated, bracketSize });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET /api/matches/:categoryId — get all matches for a category
exports.getMatches = async (req, res) => {
  try {
    const matches = await Match.find({ categoryId: req.params.categoryId })
      .populate('athleteA', 'firstName lastName club isSeeded')
      .populate('athleteB', 'firstName lastName club isSeeded')
      .populate('winner', 'firstName lastName')
      .sort({ roundNumber: 1, matchIndex: 1 });
    res.json({ success: true, data: matches });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// PUT /api/matches/:matchId/winner — set winner for a match
exports.setWinner = async (req, res) => {
  try {
    const match = await Match.findById(req.params.matchId);
    if (!match) {
      return res.status(404).json({ success: false, message: 'Maç bulunamadı' });
    }
    const { winnerId } = req.body;
    if (!winnerId) {
      return res.status(400).json({ success: false, message: 'Winner ID gereklidir' });
    }
    match.winner = winnerId;
    await match.save();

    // Try to advance winner to next round
    await advanceToNextRound(match);

    const populated = await Match.findById(match._id)
      .populate('athleteA', 'firstName lastName club isSeeded')
      .populate('athleteB', 'firstName lastName club isSeeded')
      .populate('winner', 'firstName lastName');

    res.json({ success: true, data: populated });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * Advance winner of a match to the next round.
 * Matches are paired: matchIndex 0&1 -> next round matchIndex 0, etc.
 */
async function advanceToNextRound(match) {
  const nextRound = match.roundNumber + 1;
  const nextMatchIndex = Math.floor(match.matchIndex / 2);
  const isSlotA = match.matchIndex % 2 === 0; // even matchIndex -> athleteA of next match

  // Check if next round match already exists
  let nextMatch = await Match.findOne({
    categoryId: match.categoryId,
    roundNumber: nextRound,
    matchIndex: nextMatchIndex,
  });

  if (!nextMatch) {
    // Check how many matches are in current round to decide if next round is needed
    const currentRoundCount = await Match.countDocuments({
      categoryId: match.categoryId,
      roundNumber: match.roundNumber,
    });
    if (currentRoundCount < 2) return; // Final already done
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

  // Auto-win if other slot is BYE
  if (nextMatch.isByeA && nextMatch.athleteB) {
    nextMatch.winner = nextMatch.athleteB;
  } else if (nextMatch.isByeB && nextMatch.athleteA) {
    nextMatch.winner = nextMatch.athleteA;
  }

  await nextMatch.save();
}
