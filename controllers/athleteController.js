const Athlete = require('../models/Athlete');
const Category = require('../models/Category');
const mongoose = require('mongoose');
const ExcelJS = require('exceljs');

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
    const { firstName, lastName, club, country, category, isSeeded, seedIndex } = req.body;
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
      country: country ? String(country).toUpperCase().slice(0, 10) : '',
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
    if (req.body.country !== undefined) updateData.country = String(req.body.country).toUpperCase().slice(0, 10);
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

// POST /api/athletes/import — bulk import from uploaded .xlsx file
// Expected Excel columns (row 1 = header, ignored):
//   A: firstName, B: lastName, C: country, D: club, E: seedIndex
// Query param: categoryId (required)
exports.importAthletes = async (req, res) => {
  try {
    const { categoryId } = req.query;
    if (!categoryId || !isValidObjectId(categoryId)) {
      return res.status(400).json({ success: false, message: 'Geçersiz veya eksik kategori ID' });
    }
    const category = await Category.findById(categoryId);
    if (!category) {
      return res.status(404).json({ success: false, message: 'Kategori bulunamadı' });
    }
    if (category.drawStatus === 'Completed') {
      return res.status(400).json({ success: false, message: 'Bu kategoride kura tamamlanmış.' });
    }
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Excel dosyası yüklenmedi.' });
    }

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(req.file.buffer);

    const worksheet = workbook.worksheets[0];
    if (!worksheet) {
      return res.status(400).json({ success: false, message: 'Excel dosyasında sayfa bulunamadı.' });
    }

    const toInsert = [];
    const errors = [];

    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return; // skip header row

      const raw = (col) => {
        const cell = row.getCell(col);
        return cell.value !== null && cell.value !== undefined ? String(cell.value).trim() : '';
      };

      const firstName = raw(1);
      const lastName = raw(2);
      if (!firstName || !lastName) {
        errors.push(`Satır ${rowNumber}: Ad veya Soyad eksik, atlandı.`);
        return;
      }

      let parsedSeedIndex = null;
      const seedRaw = raw(5);
      if (seedRaw) {
        const n = Number(seedRaw);
        if (!Number.isNaN(n) && n >= 1 && n <= 4) parsedSeedIndex = n;
      }

      toInsert.push({
        firstName,
        lastName,
        country: raw(3) ? raw(3).toUpperCase().slice(0, 10) : '',
        club: raw(4) || '',
        category: category._id,
        seedIndex: parsedSeedIndex,
        isSeeded: parsedSeedIndex !== null,
      });
    });

    if (!toInsert.length) {
      return res.status(400).json({
        success: false,
        message: 'İçe aktarılacak geçerli sporcu bulunamadı.',
        errors,
      });
    }

    const inserted = await Athlete.insertMany(toInsert, { ordered: false });
    res.status(201).json({
      success: true,
      message: `${inserted.length} sporcu başarıyla içe aktarıldı.`,
      data: inserted,
      errors: errors.length ? errors : undefined,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
