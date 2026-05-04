const Athlete = require('../models/Athlete');
const Category = require('../models/Category');

// GET athletes (optionally by category)
exports.getAthletes = async (req, res) => {
  try {
    const filter = {};
    if (req.query.categoryId) {
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
    // Check if category draw is completed
    const category = await Category.findById(req.body.category);
    if (!category) {
      return res.status(404).json({ success: false, message: 'Kategori bulunamadı' });
    }
    if (category.isDrawCompleted) {
      return res.status(400).json({
        success: false,
        message: 'Bu kategoride kura tamamlanmış. Sporcu eklenemez.',
      });
    }
    const athlete = await Athlete.create(req.body);
    const populated = await Athlete.findById(athlete._id).populate('category', 'name');
    res.status(201).json({ success: true, data: populated });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// PUT update athlete (also handles category transfer)
exports.updateAthlete = async (req, res) => {
  try {
    const athlete = await Athlete.findById(req.params.id).populate('category');
    if (!athlete) {
      return res.status(404).json({ success: false, message: 'Sporcu bulunamadı' });
    }
    // If category is being changed, check target category draw status
    if (req.body.category && req.body.category !== String(athlete.category._id)) {
      const targetCategory = await Category.findById(req.body.category);
      if (!targetCategory) {
        return res.status(404).json({ success: false, message: 'Hedef kategori bulunamadı' });
      }
      if (targetCategory.isDrawCompleted) {
        return res.status(400).json({
          success: false,
          message: 'Hedef kategoride kura tamamlanmış. Sporcu taşınamaz.',
        });
      }
      // Also check source category
      if (athlete.category.isDrawCompleted) {
        return res.status(400).json({
          success: false,
          message: 'Mevcut kategoride kura tamamlanmış. Sporcu taşınamaz.',
        });
      }
    }
    const updated = await Athlete.findByIdAndUpdate(req.params.id, req.body, {
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
    const athlete = await Athlete.findById(req.params.id).populate('category');
    if (!athlete) {
      return res.status(404).json({ success: false, message: 'Sporcu bulunamadı' });
    }
    if (athlete.category && athlete.category.isDrawCompleted) {
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
