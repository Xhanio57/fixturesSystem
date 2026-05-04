const Athlete = require('../models/Athlete');
const Category = require('../models/Category');
const mongoose = require('mongoose');

function isValidObjectId(id) {
  return mongoose.Types.ObjectId.isValid(id);
}

// GET athletes (optionally by category)
exports.getAthletes = async (req, res) => {
  try {
    const filter = {};
    if (req.query.categoryId) {
      if (!isValidObjectId(req.query.categoryId)) {
        return res.status(400).json({ success: false, message: 'Geçersiz kategori ID' });
      }
      filter.category = req.query.categoryId;
    }
    const athletes = await Athlete.find(filter)
      .populate('category', 'name gender ageGroup isDrawCompleted')
      .sort({ lastName: 1 });
    res.json({ success: true, data: athletes });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET single athlete
exports.getAthlete = async (req, res) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Geçersiz sporcu ID' });
    }
    const athlete = await Athlete.findById(req.params.id).populate('category');
    if (!athlete) {
      return res.status(404).json({ success: false, message: 'Sporcu bulunamadı' });
    }
    res.json({ success: true, data: athlete });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// POST create athlete
exports.createAthlete = async (req, res) => {
  try {
    // Validate and extract only allowed fields
    const { firstName, lastName, club, category, isSeeded, seedIndex } = req.body;
    if (!category || !isValidObjectId(category)) {
      return res.status(400).json({ success: false, message: 'Geçersiz veya eksik kategori ID' });
    }
    // Check if category draw is completed
    const categoryDoc = await Category.findById(category);
    if (!categoryDoc) {
      return res.status(404).json({ success: false, message: 'Kategori bulunamadı' });
    }
    if (categoryDoc.drawStatus === 'Completed') {
      return res.status(400).json({
        success: false,
        message: 'Bu kategoride kura tamamlanmış. Sporcu eklenemez.',
      });
    }
    // Parse seedIndex: must be 1-4 or null
    let parsedSeedIndex = null;
    if (seedIndex !== undefined && seedIndex !== null && seedIndex !== '') {
      const n = Number(seedIndex);
      if (!Number.isNaN(n) && n >= 1 && n <= 4) parsedSeedIndex = n;
    }
    const athlete = await Athlete.create({
      firstName: String(firstName),
      lastName: String(lastName),
      club: club ? String(club) : '',
      category,
      seedIndex: parsedSeedIndex,
      isSeeded: parsedSeedIndex !== null,
    });
    const populated = await Athlete.findById(athlete._id).populate('category', 'name');
    res.status(201).json({ success: true, data: populated });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// PUT update athlete (also handles category transfer)
exports.updateAthlete = async (req, res) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Geçersiz sporcu ID' });
    }
    if (req.body.category && !isValidObjectId(req.body.category)) {
      return res.status(400).json({ success: false, message: 'Geçersiz kategori ID' });
    }
    const athlete = await Athlete.findById(req.params.id).populate('category');
    if (!athlete) {
      return res.status(404).json({ success: false, message: 'Sporcu bulunamadı' });
    }
    // If category is being changed, check target category draw status
    // req.body.category already validated as valid ObjectId above
    const newCategoryId = req.body.category ? String(req.body.category) : null;
    if (newCategoryId && newCategoryId !== String(athlete.category._id)) {
      const targetCategory = await Category.findById(newCategoryId);
      if (!targetCategory) {
        return res.status(404).json({ success: false, message: 'Hedef kategori bulunamadı' });
      }
      if (targetCategory.drawStatus === 'Completed') {
        return res.status(400).json({
          success: false,
          message: 'Hedef kategoride kura tamamlanmış. Sporcu taşınamaz.',
        });
      }
      // Also check source category
      if (athlete.category.drawStatus === 'Completed') {
        return res.status(400).json({
          success: false,
          message: 'Mevcut kategoride kura tamamlanmış. Sporcu taşınamaz.',
        });
      }
    }
    // Build update with only allowed fields, cast to expected types
    const updateData = {};
    if (req.body.firstName !== undefined) updateData.firstName = String(req.body.firstName);
    if (req.body.lastName !== undefined) updateData.lastName = String(req.body.lastName);
    if (req.body.club !== undefined) updateData.club = String(req.body.club);
    if (req.body.category !== undefined) updateData.category = String(req.body.category);
    // Handle seedIndex
    if (req.body.seedIndex !== undefined) {
      const n = Number(req.body.seedIndex);
      updateData.seedIndex = (!Number.isNaN(n) && n >= 1 && n <= 4) ? n : null;
      updateData.isSeeded = updateData.seedIndex !== null;
    }

    const updated = await Athlete.findByIdAndUpdate(req.params.id, updateData, {
      new: true,
      runValidators: true,
    }).populate('category', 'name');
    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// DELETE athlete
exports.deleteAthlete = async (req, res) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Geçersiz sporcu ID' });
    }
    const athlete = await Athlete.findById(req.params.id).populate('category');
    if (!athlete) {
      return res.status(404).json({ success: false, message: 'Sporcu bulunamadı' });
    }
    if (athlete.category && athlete.category.drawStatus === 'Completed') {
      return res.status(400).json({
        success: false,
        message: 'Kura tamamlanmış kategoriden sporcu silinemez.',
      });
    }
    await Athlete.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Sporcu silindi' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
