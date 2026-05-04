const mongoose = require('mongoose');

const CategorySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Siklet adı zorunludur'],
      trim: true,
    },
    gender: {
      type: String,
      enum: ['Erkek', 'Kadın', 'Karma'],
      default: 'Erkek',
    },
    ageGroup: {
      type: String,
      trim: true,
      default: '',
    },
    // Derived convenience flag kept for backward compat — always mirrors drawStatus
    isDrawCompleted: {
      type: Boolean,
      default: false,
    },
    // 'Pending' | 'Completed'
    drawStatus: {
      type: String,
      enum: ['Pending', 'Completed'],
      default: 'Pending',
    },
    // 'SingleElimination' | 'DoubleRepechage'
    bracketType: {
      type: String,
      enum: ['SingleElimination', 'DoubleRepechage'],
      default: 'DoubleRepechage',
    },
  },
  { timestamps: true }
);

// Keep isDrawCompleted in sync with drawStatus
CategorySchema.pre('save', function (next) {
  this.isDrawCompleted = this.drawStatus === 'Completed';
  next();
});

module.exports = mongoose.model('Category', CategorySchema);
