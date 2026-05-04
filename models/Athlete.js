const mongoose = require('mongoose');

const AthleteSchema = new mongoose.Schema(
  {
    firstName: {
      type: String,
      required: [true, 'Ad zorunludur'],
      trim: true,
    },
    lastName: {
      type: String,
      required: [true, 'Soyad zorunludur'],
      trim: true,
    },
    club: {
      type: String,
      trim: true,
      default: '',
    },
    // Country code or name, e.g. TUR, LAT, LTU, EST (up to 10 chars for longer names)
    country: {
      type: String,
      trim: true,
      default: '',
      maxlength: 10,
    },
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Category',
      required: [true, 'Kategori zorunludur'],
    },
    // Seed rank 1-4; null means unseeded. Kept in sync with isSeeded.
    seedIndex: {
      type: Number,
      min: 1,
      max: 4,
      default: null,
    },
    // Convenience flag — true when seedIndex is set
    isSeeded: {
      type: Boolean,
      default: false,
    },
    // Set to true when the athlete wins their category final
    isWinner: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

// Keep isSeeded in sync with seedIndex
AthleteSchema.pre('save', function (next) {
  this.isSeeded = this.seedIndex !== null && this.seedIndex !== undefined;
  next();
});

module.exports = mongoose.model('Athlete', AthleteSchema);
