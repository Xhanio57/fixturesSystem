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
    isDrawCompleted: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Category', CategorySchema);
