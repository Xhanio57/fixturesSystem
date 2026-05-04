const Category = require('../models/Category');
const Athlete = require('../models/Athlete');
const Match = require('../models/Match');
const mongoose = require('mongoose');

function isValidObjectId(id) {
  return mongoose.Types.ObjectId.isValid(id);
}

// GET all categories
exports.getCategories = async (req, res) => {
  try {
    const categories = await Category.find().sort({ name: 1 });
    res.json({ success: true, data: categories });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET single category
exports.getCategory = async (req, res) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Geçersiz kategori ID' });
    }
    const category = await Category.findById(req.params.id);
    if (!category) {
      return res.status(404).json({ success: false, message: 'Kategori bulunamadı' });
    }
    res.json({ success: true, data: category });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// POST create category
exports.createCategory = async (req, res) => {
  try {
    const category = await Category.create(req.body);
    res.status(201).json({ success: true, data: category });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// PUT update category
exports.updateCategory = async (req, res) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Geçersiz kategori ID' });
    }
    const category = await Category.findById(req.params.id);
    if (!category) {
      return res.status(404).json({ success: false, message: 'Kategori bulunamadı' });
    }
    // Build update with only allowed fields, cast to expected types
    const updateData = {};
    if (req.body.name !== undefined) updateData.name = String(req.body.name);
    if (req.body.gender !== undefined) updateData.gender = String(req.body.gender);
    if (req.body.ageGroup !== undefined) updateData.ageGroup = String(req.body.ageGroup);

    const updated = await Category.findByIdAndUpdate(req.params.id, updateData, {
      new: true,
      runValidators: true,
    });
    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// DELETE category
exports.deleteCategory = async (req, res) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Geçersiz kategori ID' });
    }
    const category = await Category.findById(req.params.id);
    if (!category) {
      return res.status(404).json({ success: false, message: 'Kategori bulunamadı' });
    }
    if (category.isDrawCompleted) {
      return res
        .status(400)
        .json({ success: false, message: 'Kura tamamlanmış kategori silinemez. Önce kuradan çıkarın.' });
    }
    // Remove athletes and matches in this category
    await Athlete.deleteMany({ category: req.params.id });
    await Match.deleteMany({ categoryId: req.params.id });
    await Category.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Kategori silindi' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// POST reset draw for a category
exports.resetDraw = async (req, res) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Geçersiz kategori ID' });
    }
    const category = await Category.findById(req.params.id);
    if (!category) {
      return res.status(404).json({ success: false, message: 'Kategori bulunamadı' });
    }
    await Match.deleteMany({ categoryId: req.params.id });
    await Category.findByIdAndUpdate(req.params.id, { isDrawCompleted: false });
    res.json({ success: true, message: 'Kura sıfırlandı' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
