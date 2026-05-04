const mongoose = require('mongoose');

const MatchSchema = new mongoose.Schema(
  {
    categoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Category',
      required: true,
    },
    // Sequential numerical ID within the category (1, 2, 3, …)
    matchID: {
      type: Number,
      default: 0,
    },
    roundNumber: {
      type: Number,
      required: true,
    },
    // Index within the round (0-based)
    matchIndex: {
      type: Number,
      default: 0,
    },
    // Pool in the bracket: A | B | C | D | SF | Final | RepAB | RepCD | Bronze1 | Bronze2
    pool: {
      type: String,
      default: '',
    },
    athleteA: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Athlete',
      default: null,
    },
    athleteB: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Athlete',
      default: null,
    },
    isByeA: {
      type: Boolean,
      default: false,
    },
    isByeB: {
      type: Boolean,
      default: false,
    },
    winner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Athlete',
      default: null,
    },
    // Where the loser of this match should be placed (for Double Repechage routing)
    loserTargetMatchID: {
      type: Number,
      default: null,
    },
    // Which slot ('A' or 'B') of the loserTargetMatch the loser fills
    loserTargetSlot: {
      type: String,
      enum: ['A', 'B', null],
      default: null,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Match', MatchSchema);
