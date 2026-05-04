const express = require('express');
const router = express.Router();
const Category = require('../models/Category');
const Athlete = require('../models/Athlete');

// Admin panel
router.get('/', async (req, res) => {
  try {
    const categories = await Category.find().sort({ name: 1 });
    const athletes = await Athlete.find()
      .populate('category', 'name isDrawCompleted')
      .sort({ lastName: 1 });
    res.render('admin', { categories, athletes });
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// Live draw screen
router.get('/kura', async (req, res) => {
  try {
    const categories = await Category.find().sort({ name: 1 });
    res.render('draw', { categories });
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// Live draw screen with category slug
router.get('/kura/:slug', async (req, res) => {
  try {
    const categories = await Category.find().sort({ name: 1 });
    res.render('draw', { categories });
  } catch (err) {
    res.status(500).send(err.message);
  }
});

module.exports = router;
