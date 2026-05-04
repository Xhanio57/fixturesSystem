const mongoose = require('mongoose');

const MatchSchema = new mongoose.Schema(
  {
    categoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Category',
      required: true,
    },
    roundNumber: {
      type: Number,
      required: true,
    },
    matchIndex: {
      type: Number,
      default: 0,
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
  },
  { timestamps: true }
);

module.exports = mongoose.model('Match', MatchSchema);
